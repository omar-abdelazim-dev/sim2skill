// Engine interface. Every simulation family implements the same contract so the server, the builder,
// Nour and grading treat physics and chemistry labs alike:
//   id, subject, templates            which lab types the engine offers
//   defaultConfig(template)           a valid starting config
//   validateConfig(template, config)  returns a clean copy or throws Error with a student-friendly message
//   goal(template, config)            one-line goal shown to students
//   checkPublishable(template, config, solution)  throws if the lab cannot be solved safely
//   evaluate(template, config, bench) server-side grading: { result, diagnosis, success }
//   invariants(template, config, bench)  physical laws that must hold; returns a list of violations
import { BASE, defaultConfig, validateConfig, buildDefinition, runConfigured, findSolution } from '../labConfig.js';
import { titration } from './titration.js';
import { kinetics } from './kinetics.js';
import { equilibrium, electrochemistry, spectroscopy } from './stubs.js';

const circuits = {
  id: 'circuits',
  subject: 'physics',
  templates: Object.keys(BASE),
  defaultConfig: template => defaultConfig(template),
  validateConfig: (template, config) => validateConfig(template, config),
  goal: (template, config) => buildDefinition(template, config).goal,
  checkPublishable(template, config) {
    if (!findSolution(template, config || undefined)) throw Error('No safe solution exists with these components, supply and target. Adjust the lab in the builder.');
  },
  validateBench(template, config, b) {
    const e = buildDefinition(template, config);
    const ok = b && Number.isFinite(b.V) && b.V >= (e.volt.min || e.volt.fixed) && b.V <= (e.volt.max || e.volt.fixed)
      && e.slots.every(s => b[s.id] === null || b[s.id] === undefined || s.options.includes(b[s.id]))
      && typeof b.reversed === 'boolean' && typeof b.burnt === 'boolean'
      && (b.pot === undefined || (Number.isFinite(b.pot) && b.pot >= 100 && b.pot <= 10000));
    if (!ok) throw Error('Invalid circuit configuration.');
  },
  evaluate: (template, config, bench) => runConfigured(template, config, bench),
  invariants: () => [],
  publicConfig: c => c,
  hint: () => '',
  labContext: () => ({})
};

export const ENGINES = { circuits, titration, kinetics, equilibrium, electrochemistry, spectroscopy };

export function engineFor(id) {
  const e = ENGINES[id || 'circuits'];
  if (!e) throw Error('Unknown simulation engine.');
  return e;
}

// Which engine owns a template id (templates are unique across engines).
export function engineOfTemplate(template) {
  return Object.values(ENGINES).find(e => e.templates.includes(template)) || null;
}
