// Nour as an LCEL chain:
//   load lab context from the DB → retrieve (access-filtered) → format sources → prompt → Gemini → parse
// Returns { text, open, sources }. The chain has no tools and no side effects.
import { RunnableSequence, RunnableLambda, RunnablePassthrough } from '@langchain/core/runnables';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import CORE from '../../src/lab/core.js';
import { LIVE } from '../../src/labs.js';
import { homePrompt, labPrompt, OPEN_TAG } from '../../shared/nourPrompt.js';
import { engineFor } from '../../shared/engines/index.js';
import { labAccess, fail } from '../lib.mjs';
import { nourPrompt, formatDocs } from './prompts.mjs';
import { LabRetriever } from './retriever.mjs';
import { chatModel } from './models.mjs';

// Gemini can return thought parts; keep only the visible text. Then pull out [[open:LAB_ID]] like splitOpen does.
export function parseAnswer(message) {
  const content = message?.content ?? message;
  const raw = typeof content === 'string' ? content
    : (Array.isArray(content) ? content.filter(p => p && !p.thought && (p.type === 'text' || typeof p.text === 'string')).map(p => p.text).join('') : '');
  const m = OPEN_TAG.exec(raw);
  const open = m && LIVE.some(l => l.id === m[1]) ? m[1] : null;
  return { text: raw.replace(OPEN_TAG, '').trim(), open };
}

// Bench state from the browser is data only: a small JSON object, never instructions or lab text.
function cleanState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return {};
  const json = JSON.stringify(state);
  return json.length > 4000 ? { note: 'bench state too large; omitted' } : JSON.parse(json);
}

export function loadContext(db) {
  return RunnableLambda.from(async (input, config) => {
    const viewer = config?.configurable?.viewer || null;
    const messages = input.messages;
    const history = messages.slice(0, -1).slice(-12).map(m => (m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content)));
    const question = messages[messages.length - 1].content;
    if (input.kind !== 'lab') return { system: homePrompt(LIVE), history, question };
    const lab = typeof input.labId === 'string' ? db.get('SELECT * FROM labs WHERE id = ?', input.labId) : null;
    const access = labAccess(db, lab, viewer);
    if (access === 'none' || access === 'locked') fail(404, 'Lab not available.');
    const engine = engineFor(lab.engine), config_ = lab.config ? JSON.parse(lab.config) : undefined;
    let goal = '';
    try { goal = engine.goal(lab.template, config_); } catch { goal = ''; }
    // Structured constants go straight into the prompt (not retrieved). Hidden answers are never included.
    const constants = lab.engine === 'circuits'
      ? { spec: CORE.EXPERIMENTS[lab.template]?.spec }
      : engine.labContext(engine.publicConfig(config_), undefined, undefined);
    const system = labPrompt({ title: lab.title, goal, concept: lab.description, instructions: lab.instructions,
      state: { lab_constants: constants, ...cleanState(input.state) } });
    return { system, history, question, labId: lab.id };
  });
}

export function createNourChain(db) {
  const retriever = new LabRetriever({ db });
  const answer = RunnableSequence.from([nourPrompt, RunnableLambda.from((m, config) => chatModel().invoke(m, config)), RunnableLambda.from(parseAnswer)]);
  return RunnableSequence.from([
    loadContext(db),
    RunnablePassthrough.assign({
      docs: RunnableLambda.from((i, config) => retriever.invoke(i.question, { ...config, configurable: { ...config?.configurable, labId: i.labId } }))
    }),
    RunnablePassthrough.assign({ context: RunnableLambda.from(i => formatDocs(i.docs)) }),
    RunnablePassthrough.assign({ answer }),
    RunnableLambda.from(i => ({
      ...i.answer,
      sources: [...new Map(i.docs.map(d => [d.metadata.lab_id, { labId: d.metadata.lab_id, title: d.metadata.title }])).values()]
    }))
  ]);
}
