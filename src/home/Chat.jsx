import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { caps, onCaps } from '../claude.js';
import { LABS, LIVE } from '../labs.js';
import { S, ACT, speak, useLab, voiceAvailable, rt } from '../lab/store.js';
import { schematicSVG } from '../lab/netlist.js';
import { DEMO, SAMPLES, demoAsk } from './demo.js';

// Nour's backend (server/nour_server.py). Same origin by default; set VITE_NOUR_API when it lives elsewhere.
const NOUR_API = (import.meta.env && import.meta.env.VITE_NOUR_API) || '/api/nour';

// Shrinks a photo before upload so requests stay small.
function prepare(file) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1400 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob(b => (b ? res(b) : rej(new Error('Could not read the image'))), 'image/jpeg', 0.9); URL.revokeObjectURL(url);
    };
    img.onerror = () => rej(new Error('Could not read the image')); img.src = url;
  });
}
async function askServer(history, file) {
  if (DEMO) return demoAsk(history, !!file);
  const fd = new FormData();
  fd.append('messages', JSON.stringify(history.slice(-12).map(m => ({ role: m.role === 'user' ? 'user' : 'nour', text: m.text || '' }))));
  if (file) fd.append('image', await prepare(file), 'circuit.jpg');
  let code = ''; try { code = localStorage.getItem('nour_code') || ''; } catch (e) { /* ignore */ }
  const r = await fetch(NOUR_API, { method: 'POST', body: fd, headers: code ? { 'x-access-code': code } : {} });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.detail || 'Server error ' + r.status); e.status = r.status; throw e; }
  return data;
}

const GREETING = "Hi, I'm Nour, your lab instructor. Three labs are open right now. Which one do you want to try?";

const SYSTEM = `You are Nour, the AI lab instructor inside Sim2Skill, a virtual electronics lab for university students in Egypt.
The student is on the home screen, choosing a lab. Three labs are open:
- ohm: "Ohm's law". Set a supply voltage and pick a resistor so exactly 10 mA flows.
- led: "LED with a resistor". Light a red LED from a 9 V battery at a safe current (2 to 20 mA) without burning it.
- rc: "RC charging". Choose a resistor and a capacitor so the capacitor reaches 63% of 5 V in 1 second.
Coming soon, not open yet: series and parallel circuits, voltage divider, simple pendulum, lens focal length, Hooke's law spring, projectile launch, acid-base titration, flame test, reaction rates.
Rules:
- Reply in the student's language. Egyptian Arabic, standard Arabic, French and English are all fine.
- Under 60 words, warm and direct. Plain sentences, no headings, no markdown.
- Help the student choose. If it is unclear, ask what they are studying or what they want to practise.
- When the student asks to start, open, try or go to a lab, or names an experiment one of the three labs covers, call the open_lab tool with that lab's id and say in one short sentence that you are taking them there.
- Never say a coming-soon lab is open. Say it is on the roadmap and suggest the closest open lab.
- You may explain a concept briefly, but steer the student into a lab to practise it.`;

const KEYS = [
  ['ohm', /\bohm|resistor|resistance|current|voltage|أوم|اوم|مقاوم|تيار|جهد|فولت/i],
  ['led', /\bled\b|diode|ليد|دايود|ثنائي|لمبة/i],
  ['rc', /\brc\b|capacitor|charging|time constant|مكثف|كاباسيتور|شحن/i]
];
const SOON = /pendulum|lens|spring|hooke|projectile|titration|flame|reaction|series|parallel|divider|بندول|عدسة|زنبرك|معايرة|لهب|تفاعل|توالي|توازي/i;

function fallbackReply(text) {
  const hit = KEYS.find(([, re]) => re.test(text));
  if (hit) { const lab = LABS.find(l => l.id === hit[0]); return { text: `Good choice. Taking you to the ${lab.title} lab now.`, open: hit[0] }; }
  if (SOON.test(text)) return { text: "That experiment is on our roadmap but not open yet. For now you can practise with one of these three labs.", labs: true };
  return { text: "I can open one of three labs for you. Pick one below, or tell me what you're studying and I'll suggest one.", labs: true };
}

const Chat = forwardRef(function Chat({ onOpenLab, onOpenCustom, disabled }, ref) {
  useLab();
  const [msgs, setMsgs] = useState([{ role: 'nour', text: GREETING, labs: true }]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [, setCapsTick] = useState(0);
  const [file, setFile] = useState(null), [thumb, setThumb] = useState(null), [serverOk, setServerOk] = useState(false);
  const logRef = useRef(null), inputRef = useRef(null), abortRef = useRef(null), sampleOff = useRef(false), serverOff = useRef(false), fileRef = useRef(null);

  useEffect(() => onCaps(() => setCapsTick(t => t + 1)), []);
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs]);

  const nourSays = (text, extra = {}) => { setMsgs(m => [...m, { role: 'nour', text, ...extra }]); if (S.voice) speak(text); };

  useImperativeHandle(ref, () => ({
    focus() { inputRef.current && inputRef.current.focus(); },
    soon(lab) { nourSays(`${lab.title} is on our roadmap, not open yet. Try one of the open labs for now.`, { labs: true }); },
    note(text) { nourSays(text); }
  }), []);

  const attach = f => { if (!f || !/^image\/(jpeg|png|webp)$/.test(f.type)) { if (f) nourSays('I can read JPG, PNG or WebP pictures of circuits.'); return; } setFile(f); setThumb(URL.createObjectURL(f)); inputRef.current && inputRef.current.focus(); };
  const clearFile = () => { setFile(null); setThumb(null); if (fileRef.current) fileRef.current.value = ''; };
  useEffect(() => {
    const onPaste = e => { const f = [...((e.clipboardData && e.clipboardData.files) || [])][0]; if (f && f.type.startsWith('image/')) attach(f); };
    window.addEventListener('paste', onPaste); return () => window.removeEventListener('paste', onPaste);
  }, []);

  // one round trip to Nour's backend: answers a question, or reads a circuit picture and returns a netlist
  async function viaServer(history, img, fallbackText) {
    setBusy(true); setMsgs(m => [...m, { role: 'nour', text: '', streaming: true }]);
    const setLast = o => setMsgs(m => { const c = m.slice(); c[c.length - 1] = { role: 'nour', ...o }; return c; });
    try {
      const out = await askServer(history, img); setServerOk(true);
      setLast({ text: out.reply, netlist: out.netlist || null }); if (S.voice) speak(out.reply);
      if (out.open_lab && !out.netlist) setTimeout(() => onOpenLab(out.open_lab), 700);
    } catch (err) {
      if (img) { setLast({ text: err.status ? 'I could not read that picture: ' + err.message : 'I cannot reach my server right now, so I cannot read pictures. Start the Nour server and try again.' }); }
      else {
        if (!err.status) serverOff.current = true;
        const r = fallbackReply(fallbackText); setLast({ text: err.status === 429 ? err.message : r.text, labs: !!r.labs || err.status === 429 });
        if (r.open && err.status !== 429) setTimeout(() => onOpenLab(r.open), 500);
      }
    } finally { setBusy(false); }
  }

  async function send(text) {
    text = text.trim(); const img = file;
    if ((!text && !img) || busy || disabled) return;
    if (!text) text = 'Explain this circuit and build it in the lab.';
    const history = [...msgs, { role: 'user', text, thumb: img ? thumb : null }];
    setMsgs(history); setDraft(''); setFile(null); setThumb(null); if (fileRef.current) fileRef.current.value = '';
    if (img) { viaServer(history, img, text); return; }
    const useClaude = caps.sample && !sampleOff.current;
    if (!useClaude && !serverOff.current) { viaServer(history, null, text); return; }
    if (!useClaude) {
      const r = fallbackReply(text); setBusy(true);
      setTimeout(() => { setBusy(false); nourSays(r.text, r.labs ? { labs: true } : {}); if (r.open) setTimeout(() => onOpenLab(r.open), 500); }, 450);
      return;
    }
    setBusy(true);
    setMsgs(m => [...m, { role: 'nour', text: '', streaming: true }]);
    let pending = null;
    const transcript = history.slice(-12).map(m => (m.role === 'user' ? 'Student: ' : 'Nour: ') + m.text).join('\n');
    const input = `${SYSTEM}\n\nConversation so far:\n${transcript}\n\nWrite Nour's next reply.`;
    const ctrl = new AbortController(); abortRef.current = ctrl;
    const setLast = (t, done) => setMsgs(m => { const c = m.slice(); c[c.length - 1] = { role: 'nour', text: t, streaming: !done }; return c; });
    try {
      const out = await caps.sample(input, {
        cache: false, modelTier: 'quick', signal: ctrl.signal,
        onText: ({ text: t }) => setLast(t === 'Thinking...' ? '' : t, false),
        tools: [{ name: 'open_lab', description: 'Open one of the three live labs and walk the student into it.',
          inputSchema: { type: 'object', properties: { lab: { type: 'string', enum: LIVE.map(l => l.id) } }, required: ['lab'] },
          execute: inp => { if (LIVE.some(l => l.id === inp.lab)) pending = inp.lab; return { opened: inp.lab }; } }]
      });
      const finalText = (out && out.text) || (pending ? `Taking you to the ${LABS.find(l => l.id === pending).title} lab now.` : '');
      setLast(finalText, true); if (S.voice && finalText) speak(finalText);
      if (pending) setTimeout(() => onOpenLab(pending), 500);
    } catch (err) {
      const code = err && err.code;
      if (code === 'not_granted') sampleOff.current = true;
      const r = fallbackReply(text);
      setMsgs(m => { const c = m.slice(); c[c.length - 1] = { role: 'nour', text: code === 'rate_limited' ? 'I am getting a lot of questions right now. Pick a lab below and we can start.' : r.text, labs: code === 'rate_limited' || !!r.labs }; return c; });
      if (r.open && code !== 'rate_limited') setTimeout(() => onOpenLab(r.open), 500);
    } finally { setBusy(false); abortRef.current = null; }
  }

  const pick = lab => { if (busy || disabled) return; setMsgs(m => [...m, { role: 'user', text: `Take me to the ${lab.title} lab.` }]); setTimeout(() => { nourSays(`Opening the ${lab.title} lab. ${lab.blurb}`); setTimeout(() => onOpenLab(lab.id), 450); }, 250); };

  return (
    <section className="chat" aria-label="Chat with Nour">
      <header className="chat-head">
        <svg className={'avatar' + (rt.speaking ? ' speaking' : '')} viewBox="0 0 64 64" aria-hidden="true">
          <line x1="32" y1="4" x2="32" y2="13" stroke="#8FA6B0" strokeWidth="2.5" /><circle className="lamp" cx="32" cy="5" r="4" />
          <rect className="head" x="7" y="13" width="50" height="44" rx="13" /><rect x="13" y="22" width="38" height="16" rx="8" fill="#2B424C" />
          <circle className="eye" cx="24" cy="30" r="4.5" /><circle className="eye" cx="40" cy="30" r="4.5" /><rect className="mouth" x="24" y="45" width="16" height="3.4" rx="1.7" />
        </svg>
        <div className="who"><b>Nour</b><span>{(caps.sample && !sampleOff.current) || serverOk ? 'Lab instructor · AI answers' : 'Lab instructor · ask or send a circuit'}</span></div>
        {voiceAvailable() && <button type="button" className="ghost small" aria-pressed={S.voice} onClick={() => ACT.voice()}>{S.voice ? 'Voice on' : 'Voice off'}</button>}
      </header>
      <div className="chat-log" ref={logRef} aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={'msg ' + m.role}>
            {m.thumb && <img className="msg-img" src={m.thumb} alt="Your circuit picture" />}
            <p>{m.text || (m.streaming ? <span className="dots" aria-label="Nour is typing"><i /><i /><i /></span> : '')}</p>
            {m.netlist && (
              <div className="circ-card">
                <div className="circ-svg" dangerouslySetInnerHTML={{ __html: schematicSVG(m.netlist) }} />
                <button type="button" className="pick" onClick={() => onOpenCustom && onOpenCustom(m.netlist)} disabled={disabled}>
                  <span className="n">3D</span><span className="t">Open on the bench</span><span className="d">{m.netlist.components.length} parts · click them, flip switches, read V and I</span><span className="go">↗</span>
                </button>
              </div>
            )}
            {m.labs && i === msgs.length - 1 && (
              <div className="lab-picks">
                {LIVE.map((l, k) => (
                  <button type="button" key={l.id} className="pick" onClick={() => pick(l)} disabled={busy || disabled}>
                    <span className="n">0{k + 1}</span><span className="t">{l.title}</span><span className="d">{l.blurb}</span><span className="go">↗</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {DEMO && (
        <div className="demo-chips" role="group" aria-label="Demo circuits">
          <span>Demo: no AI backend here. Try a sample circuit:</span>
          {Object.values(SAMPLES).map(s => (
            <button type="button" key={s.label} className="ghost small" disabled={busy || disabled}
              onClick={() => setMsgs(m => [...m, { role: 'user', text: 'Explain this circuit and build it in the lab. (' + s.label + ')' }, { role: 'nour', text: s.reply, netlist: s.netlist }])}>{s.label}</button>
          ))}
        </div>
      )}
      <form className="chat-input" onSubmit={e => { e.preventDefault(); send(draft); }}>
        <label htmlFor="chat-text" className="sr-only">Message Nour</label>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => attach(e.target.files[0])} />
        <button type="button" className="attach" aria-label="Attach a picture of a circuit" title="Attach a circuit picture" onClick={() => fileRef.current && fileRef.current.click()} disabled={busy || disabled}>＋</button>
        {thumb && <span className="attached"><img src={thumb} alt="Attached circuit" /><button type="button" aria-label="Remove picture" onClick={clearFile}>×</button></span>}
        <input id="chat-text" ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)} placeholder={thumb ? 'Add a question, or just send the picture' : 'Ask Nour, or attach a circuit picture'} autoComplete="off" disabled={disabled} />
        <button type="submit" className="send" disabled={(!draft.trim() && !file) || busy || disabled}>Send ↗</button>
      </form>
    </section>
  );
});
export default Chat;
