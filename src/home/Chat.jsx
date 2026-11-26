import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { onCaps } from '../claude.js';
import { askNour, nourMode, onNourMode } from '../nour.js';
import { LABS, LIVE } from '../labs.js';
import { fallbackReply } from './guide.js';
import { S, ACT, speak, useLab, voiceAvailable, rt } from '../lab/store.js';

const GREETING = "Hi, I’m Nour. Think of me as your lab partner. Tell me what you’d like to explore, or pick an experiment to get started.";

// Only jump into a lab when the student asked to go (or said yes to Nour's offer); otherwise offer a button.
const OPEN_INTENT = /\b(open|start|launch|take me|go to|let'?s (go|try|do)|i want to (try|do|start|open)|try (the|it)|enter)\b|افتح|افتحي|ابدأ|ابدا|وديني|دخلني|عايز (اجرب|ابدأ|ادخل)|عاوز (اجرب|ابدأ|ادخل)|\b(afta7|eftah|wadini|wdini|da5alni|d5alni)\b/i;
const YES = /^\s*(yes|yeah|yep|sure|ok(ay)?|go|please|aiwa|aywa|ah|tamam|ايوه|أيوه|ايوة|اه|آه|تمام|ماشي|يلا|يلا بينا)[\s!.]*$/i;

const Chat = forwardRef(function Chat({ onOpenLab, disabled }, ref) {
  useLab();
  const [msgs, setMsgs] = useState([{ role: 'nour', text: GREETING, labs: false }]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [, setCapsTick] = useState(0);
  const logRef = useRef(null), inputRef = useRef(null), abortRef = useRef(null);

  useEffect(() => onCaps(() => setCapsTick(t => t + 1)), []);
  useEffect(() => onNourMode(() => setCapsTick(t => t + 1)), []);
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs]);

  const nourSays = (text, extra = {}) => { setMsgs(m => [...m, { role: 'nour', text, ...extra }]); if (S.voice) speak(text); };

  useImperativeHandle(ref, () => ({
    focus() { inputRef.current && inputRef.current.focus(); },
    soon(lab) { nourSays(`${lab.title} is on our roadmap, not open yet. Try one of the open labs for now.`, { labs: true }); },
    note(text) { nourSays(text); }
  }), []);

  async function send(text) {
    text = text.trim(); if (!text || busy || disabled) return;
    const history = [...msgs, { role: 'user', text }];
    setMsgs([...history, { role: 'nour', text: '', streaming: true }]); setDraft(''); setBusy(true);
    const ctrl = new AbortController(); abortRef.current = ctrl;
    const setLast = (t, done, extra = {}) => setMsgs(m => { const c = m.slice(); c[c.length - 1] = { role: 'nour', text: t, streaming: !done, ...extra }; return c; });
    let r = null;
    try { r = await askNour({ kind: 'home', history, onText: t => setLast(t, false), signal: ctrl.signal }); } catch (err) { r = null; }
    if (ctrl.signal.aborted) return;
    if (r && (r.text || r.open)) {
      const finalText = r.text || `Taking you to the ${LABS.find(l => l.id === r.open).title} lab now.`;
      const asked = OPEN_INTENT.test(text) || (YES.test(text) && msgs.some((m, i) => i === msgs.length - 1 && m.role === 'nour'));
      if (r.open && asked) { setLast(finalText, true); setTimeout(() => onOpenLab(r.open), 500); }
      else setLast(finalText, true, r.open ? { suggest: r.open } : {});
      if (S.voice) speak(finalText);
    } else {
      const f = fallbackReply(text);
      setLast(f.text, true, f.labs ? { labs: true } : {}); if (S.voice) speak(f.text);
      if (f.open) setTimeout(() => onOpenLab(f.open), 500);
    }
    setBusy(false); abortRef.current = null;
  }

  const pick = lab => { if (busy || disabled) return; setBusy(true); setMsgs(m => [...m, { role: 'user', text: `Take me to the ${lab.title} lab.` }]); setTimeout(() => { nourSays(`Opening the ${lab.title} lab. ${lab.blurb}`); setTimeout(() => {setBusy(false);onOpenLab(lab.id);}, 450); }, 250); };

  return (
    <section className="chat" aria-label="Chat with Nour">
      <header className="chat-head">
        <svg className={'avatar' + (rt.speaking ? ' speaking' : '')} viewBox="0 0 64 64" aria-hidden="true">
          <line x1="32" y1="4" x2="32" y2="13" stroke="#8FA6B0" strokeWidth="2.5" /><circle className="lamp" cx="32" cy="5" r="4" />
          <rect className="head" x="7" y="13" width="50" height="44" rx="13" /><rect x="13" y="22" width="38" height="16" rx="8" fill="#2B424C" />
          <circle className="eye" cx="24" cy="30" r="4.5" /><circle className="eye" cx="40" cy="30" r="4.5" /><rect className="mouth" x="24" y="45" width="16" height="3.4" rx="1.7" />
        </svg>
        <div className="who"><b>Nour</b><span>{{ claude: 'Lab instructor · answers with Claude', server: 'Lab instructor · Gemini answers' }[nourMode()] || 'Lab instructor · offline answers'}</span></div>
        {voiceAvailable() && <button type="button" className="ghost small" aria-pressed={S.voice} onClick={() => ACT.voice()}>{S.voice ? 'Voice on' : 'Voice off'}</button>}
      </header>
      <div className="chat-log" ref={logRef} aria-live="polite">
        {msgs.map((m, i) => (
          <div key={i} className={'msg ' + m.role}>
            <p>{m.text || (m.streaming ? <span className="dots" aria-label="Nour is typing"><i /><i /><i /></span> : '')}</p>
            {m.suggest && i === msgs.length - 1 && (() => { const l = LIVE.find(x => x.id === m.suggest); return l && (
              <div className="lab-picks"><button type="button" className="pick" onClick={() => pick(l)} disabled={busy || disabled}><span className="t">Open the {l.title} lab →</span><span className="d">{l.blurb}</span></button></div>
            ); })()}
            {m.labs && i === msgs.length - 1 && (
              <div className="lab-picks">
                {LIVE.map(l => (
                  <button type="button" key={l.id} className="pick" onClick={() => pick(l)} disabled={busy || disabled}>
                    <span className="t">{l.title}</span><span className="d">{l.blurb}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {msgs.length === 1 && <div className="chat-suggestions" aria-label="Conversation starters"><button type="button" disabled={disabled || busy} onClick={() => send('Where should I start?')}>Where should I start?</button><button type="button" disabled={disabled || busy} onClick={() => send('Help me choose a lab')}>Help me choose a lab</button></div>}
      <form className="chat-input" onSubmit={e => { e.preventDefault(); send(draft); }}>
        <label htmlFor="chat-text" className="sr-only">Message Nour</label>
        <input id="chat-text" ref={inputRef} value={draft} onChange={e => setDraft(e.target.value)} placeholder="What would you like to explore?" autoComplete="off" disabled={disabled} />
        <button type="submit" className="nsend" aria-label="Send" title="Send" disabled={!draft.trim() || busy || disabled}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 16V4.5M4.8 9.6 10 4.4l5.2 5.2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg></button>
      </form>
    </section>
  );
});
export default Chat;
