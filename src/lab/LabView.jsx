import { useEffect, useRef, useState } from 'react';
import CORE from './core.js';
import { S, rt, ACT, useLab, shown, subscribe, voiceAvailable, chatOf, labContext, labFallback } from './store.js';
import { benchSVG, partIcon, plotScope } from './draw.js';
import { createLab3D } from './scene3d.js';
import { askNour, nourMode, onNourMode } from '../nour.js';
import CircuitBoard from './CircuitBoard.jsx';

const { EXPERIMENTS, partLabel, fmtI, fmtV, fmtT } = CORE;

function hasWebGL() { try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); } catch (e) { return false; } }
const WEBGL = typeof document !== 'undefined' && hasWebGL();
const TOUCH = typeof window !== 'undefined' && window.matchMedia && matchMedia('(pointer: coarse)').matches;
if (!WEBGL) S.mode = '2d';

/* The world: the 3D lab fills the whole screen. */
function World({onFailure}) {
  const host = useRef(null);
  useEffect(() => {
    let lab = null;
    try { lab = createLab3D(host.current); rt.lab = lab; } catch (e) { rt.lab = null;host.current?.replaceChildren();ACT.mode('2d');onFailure();return; }
    if (rt.entering) { lab.flyIn(S.exp); rt.entering = false; }
    const off = subscribe(() => lab.sync());
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (rt.lab === lab) lab.redraw(); });
    return () => { off(); lab.destroy(); if (rt.lab === lab) rt.lab = null; };
  }, []);
  return <div className="world" ref={host} />;
}

function Schematic() {
 return <div className="world schematic"><div className="paper"><CircuitBoard template={S.exp} bench={S.bench[S.exp]} closed={S.closed} result={shown()} slots={EXPERIMENTS[S.exp].slots} onSlot={id=>ACT.slot(id)} onSwitch={()=>ACT.sw()}/></div></div>;
}

function Scope() {
  const ref = useRef(null);
  useEffect(() => {
    let raf;
    const draw = () => {
      const c = ref.current; if (!c || !c.clientWidth) return;
      const w = c.clientWidth, h = c.clientHeight, d = window.devicePixelRatio || 1; c.width = w * d; c.height = h * d;
      const g = c.getContext('2d'); g.scale(d, d);
      plotScope(g, 0, 0, w, h, { line: '#2B424C', dim: '#8FA6B0', ink: '#E8F0F2', trace: '#F2B705' }, 10, rt.scope);
    };
    const loop = () => { draw(); if (rt.scope && !rt.scope.done) raf = requestAnimationFrame(loop); };
    const off = subscribe(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); });
    loop(); window.addEventListener('resize', draw);
    return () => { off(); cancelAnimationFrame(raf); window.removeEventListener('resize', draw); };
  }, []);
  return <div className="scope"><canvas ref={ref} aria-label="Oscilloscope: capacitor voltage over 5 seconds" /></div>;
}

const RO = ({ k, v, note, big }) => (<div className="ro"><div className="k">{k}</div><div className={'v' + (big ? ' big' : '')}>{v}</div>{note && <div className="note">{note}</div>}</div>);
function Meters() {
  const exp = S.exp, E=EXPERIMENTS[exp], b = S.bench[exp], sim = shown(), dash = '—';
  if(['series','parallel','divider','diode'].includes(exp))return <><RO k={exp==='parallel'?'Total current':'Current'} v={sim?fmtI(sim.I):dash} big/><RO k={exp==='diode'?'Diode drop':'Across R2 / output'} v={sim?.vD!==undefined?fmtV(sim.vD):dash}/>{sim?.req!==undefined&&<RO k='Equivalent resistance' v={CORE.fmtR(sim.req)}/>}<RO k='Supply' v={fmtV(b.V)}/>{exp==='parallel'&&<><RO k='Branch R1' v={sim?.I1!==undefined?fmtI(sim.I1):dash}/><RO k='Branch R2' v={sim?.I2!==undefined?fmtI(sim.I2):dash}/></>}</>;
  if (exp === 'ohm') return <><RO k="Current" v={sim ? fmtI(sim.I) : dash} note={sim && sim.status === 'short' ? 'fuse tripped' : E.goal} big /><RO k="Across R" v={sim ? fmtV(sim.vR) : dash} /></>;
  if (exp === 'led') { const dead = sim && (sim.burn || b.burnt);
    return <><RO k="Current" v={sim ? (dead ? '0.0 mA' : fmtI(sim.I)) : dash} note={sim && sim.burn ? 'peaked at ' + (sim.I >= 1 ? 'over 1 A' : fmtI(sim.I)) : 'safe 2 to 20 mA'} big /><RO k="Across LED" v={sim ? (dead ? fmtV(b.V) : fmtV(sim.vD)) : dash} /></>; }
  const ok = sim && sim.status === 'ok';
  return <><RO k="Time to 63%" v={ok ? fmtT(sim.tau) : dash} note={E.goal} big /><RO k="After 5 s" v={ok ? fmtV(sim.v5) : dash} /></>;
}

function Avatar() {
  return (
    <svg className={'avatar' + (rt.speaking ? ' speaking' : '')} viewBox="0 0 64 64" aria-hidden="true">
      <line x1="32" y1="4" x2="32" y2="13" stroke="#8FA6B0" strokeWidth="2.5" /><circle className="lamp" cx="32" cy="5" r="4" />
      <rect className="head" x="7" y="13" width="50" height="44" rx="13" /><rect x="13" y="22" width="38" height="16" rx="8" fill="#2B424C" />
      <circle className="eye" cx="24" cy="30" r="4.5" /><circle className="eye" cx="40" cy="30" r="4.5" /><rect className="mouth" x="24" y="45" width="16" height="3.4" rx="1.7" />
    </svg>
  );
}

function LabChat({ folded }) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [stream, setStream] = useState('');
  const [, setTick] = useState(0);
  const logRef = useRef(null), ctrl = useRef(null);
  const chat = chatOf(S.exp);
  useEffect(() => onNourMode(() => setTick(t => t + 1)), []);
  useEffect(() => { const el = logRef.current; if (el) el.scrollTop = el.scrollHeight; }, [chat.length, stream, busy, folded]);
  useEffect(() => () => ctrl.current && ctrl.current.abort(), []);
  async function send(e) {
    e.preventDefault(); const text = draft.trim(); if (!text || busy) return;
    setDraft(''); ACT.userSays(text); setBusy(true); setStream('');
    const c = new AbortController(); ctrl.current = c;
    let reply = null;
    try { reply = await askNour({ kind: 'lab', history: chatOf(S.exp), ctx: labContext(), onText: t => setStream(t), signal: c.signal }); } catch (err) { reply = null; }
    if (c.signal.aborted) return;
    setBusy(false); setStream('');
    ACT.nourSays(reply && reply.text ? reply.text : labFallback(text));
  }
  const mode = nourMode();
  const shownMsgs = folded ? chat.filter(m => m.role === 'nour').slice(-1) : chat;
  return (
    <>
      <div className={'nchat-log' + (folded ? ' folded' : '')} ref={logRef} aria-live="polite">
        {shownMsgs.map((m, i) => <p key={i} className={'nmsg ' + m.role}>{m.text}</p>)}
        {busy && <p className="nmsg nour">{stream || <span className="dots" aria-label="Nour is thinking"><i /><i /><i /></span>}</p>}
      </div>
      <form className="nchat-input" onSubmit={send}>
        <label htmlFor="nour-text" className="sr-only">Ask Nour</label>
        <input id="nour-text" value={draft} onChange={e => setDraft(e.target.value)} placeholder="Ask Nour about your circuit…" autoComplete="off" maxLength={500} />
        <button type="submit" className="hbtn small send-n" disabled={!draft.trim() || busy}>Send</button>
      </form>
      {!folded && <p className="nchat-mode">{mode === 'claude' ? 'Answers with Claude, from your bench state' : mode === 'server' ? 'Gemini answers from your bench state' : 'Offline answers from your bench state'}</p>}
    </>
  );
}

function NourHud({ open, setOpen }) {
  const exp = S.exp, E = EXPERIMENTS[exp], m = S.last ? S.last.mistake : null, lv = S.level[exp] || 0;
  const lm = S.lastMistake[exp], canMore = lm && lm !== 'success' && lm !== 'burnt_led' && lv < 3;
  return (
    <section className={'hud-card nour-hud' + (open ? '' : ' folded')} aria-label="Nour, lab instructor">
      <div className="nh-top">
        <Avatar />
        <div className="nh-who"><b>Nour</b><span>Lab instructor</span></div>
        <ol className="ladder" aria-label="Hint level">
          {m === 'success' ? <li className="good">Goal reached</li>
            : ['Nudge', 'Hint', 'Explain'].map((n, i) => <li key={n} className={m && i + 1 === lv ? 'on' : ''} aria-current={m && i + 1 === lv ? 'step' : undefined}>{n}</li>)}
        </ol>
        <button type="button" className="hud-icon fold" aria-expanded={open} aria-label={open ? 'Fold Nour' : 'Open Nour'} onClick={() => setOpen(!open)}>{open ? '–' : '+'}</button>
        <button type="button" className="hud-icon fold" aria-label="Hide Nour" title="Hide" onClick={() => ACT.panel('nour')}>×</button>
      </div>
      <LabChat folded={!open} />
      {open && <>
        {S.question && (
          <div className="check">
            <p>{E.check.q}</p>
            <div className="row">{E.check.options.map((o, i) => <button className="hbtn small" type="button" key={o} disabled={S.question.picked !== null} aria-pressed={S.question.picked === i} onClick={() => ACT.answer(i)}>{o}</button>)}</div>
            {S.question.picked !== null && <p className={'fb ' + (S.question.picked === E.check.correct ? 'ok' : 'no')}>{S.question.picked === E.check.correct ? 'Correct.' : 'Incorrect.'} The answer is {E.check.options[E.check.correct]}.</p>}
          </div>
        )}
        <div className="row">
          <button className="hbtn small" type="button" disabled={!canMore} onClick={() => ACT.more()}>I need more help</button>
          {E.asks.map((a, i) => <button className="hbtn small ghosty" type="button" key={a[0]} onClick={() => ACT.ask(i)}>{a[0]}</button>)}
          {voiceAvailable() && <button className="hbtn small ghosty" type="button" aria-pressed={S.voice} onClick={() => ACT.voice()}>Voice {S.voice ? 'on' : 'off'}</button>}
        </div>
      </>}
    </section>
  );
}

function Dock() {
  const E = EXPERIMENTS[S.exp], b = S.bench[S.exp], sl = E.slots.find(x => x.id === S.active) || E.slots[0], cur = b[sl.id];
  return (
    <section className="hud-card dock" aria-label="Parts and controls">
      <button type="button" className="hud-icon fold panel-x" aria-label="Hide controls" title="Hide" onClick={() => ACT.panel('kit')}>×</button>
      <div className="dock-row">
        <div className="seg dark" role="group" aria-label="Slot">{E.slots.map(x => <button type="button" key={x.id} aria-pressed={x.id === sl.id} onClick={() => ACT.slot(x.id)}>{x.name}</button>)}</div>
        {sl.id === 'D' && cur && b.burnt && <button className="hbtn small" type="button" onClick={() => ACT.replace()}>Replace LED</button>}
        {sl.id === 'D' && cur && ['led','diode','cap'].includes(CORE.PARTS[cur]?.kind) && <button className="hbtn small" type="button" onClick={() => ACT.flip()}>Flip</button>}
        {cur && <button className="hbtn small ghosty" type="button" onClick={() => ACT.remove()}>Remove</button>}
      </div>
      <div className="hotbar">
        {sl.options.map((id, i) => (
          <button className="slot-tile" type="button" key={id} aria-pressed={cur === id} onClick={() => ACT.part(id)}>
            <span className="key">{i + 1}</span><span className="ico" dangerouslySetInnerHTML={{ __html: partIcon(id) }} /><span className="nm">{partLabel(id)}</span>
          </button>
        ))}
      </div>
      {(b.R==='pot'||b.D==='pot')&&<label className="pot-control">Adjustable resistance: {b.pot||1000} Ω<input aria-label="Adjustable resistance" type="range" min="100" max="10000" step="10" value={b.pot||1000} onChange={e=>ACT.pot(e.target.value)}/></label>}
      <div className="dock-row act">
        <button className={'power' + (S.closed ? ' on' : '')} type="button" onClick={() => ACT.sw()}><i />{S.closed ? 'Open switch' : 'Close switch'}</button>
        {!E.volt.fixed && (
          <div className="volt"><label htmlFor="volt">Supply</label>
            <button className="hbtn small sq" type="button" aria-label="Lower voltage by 0.1 V" onClick={() => ACT.vstep(-0.1)}>−</button>
            <input type="range" id="volt" min={E.volt.min} max={E.volt.max} step={E.volt.step} value={b.V} onChange={e => ACT.volt(e.target.value, false)} onPointerUp={e => ACT.volt(e.target.value, true)} onKeyUp={e => ACT.volt(e.target.value, true)} />
            <button className="hbtn small sq" type="button" aria-label="Raise voltage by 0.1 V" onClick={() => ACT.vstep(0.1)}>+</button>
            <output htmlFor="volt">{fmtV(b.V)}</output>
          </div>
        )}
        <button className="hbtn small ghosty" type="button" onClick={() => ACT.reset()}>Reset bench</button>
      </div>
    </section>
  );
}

function Joystick() {
  const [k, setK] = useState({ x: 0, y: 0 });
  const st = useRef(null);
  const set = e => { const r = st.current.r, R = 44; let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const m = Math.hypot(dx, dy); if (m > R) { dx *= R / m; dy *= R / m; } rt.joy = { x: dx / R, y: dy / R }; setK({ x: dx, y: dy }); };
  return (
    <div className="joy" aria-label="Move" role="img"
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); st.current = { r: e.currentTarget.getBoundingClientRect() }; set(e); }}
      onPointerMove={e => { if (st.current) set(e); }}
      onPointerUp={() => { st.current = null; rt.joy = null; setK({ x: 0, y: 0 }); }} onPointerCancel={() => { st.current = null; rt.joy = null; setK({ x: 0, y: 0 }); }}>
      <i style={{ transform: `translate(${k.x}px, ${k.y}px)` }} />
    </div>
  );
}

function Kit({ parts, setParts }) {
  const E = EXPERIMENTS[S.exp], b = S.bench[S.exp], h = rt.held;
  const opts = [...new Set(E.slots.flatMap(sl=>sl.options))];
  return (
    <section className="hud-card kit" aria-label="Your hands and controls">
      <button type="button" className="hud-icon fold panel-x" aria-label="Hide controls" title="Hide" onClick={() => ACT.panel('kit')}>×</button>
      <div className="kit-held">
        {h ? (<>
          <span className="ico" dangerouslySetInnerHTML={{ __html: partIcon(h.id) }} />
          <span className="kh-t"><b>Holding {partLabel(h.id)}</b><span>{h.slot === 'D' ? (rt.heldRev ? 'flipped, ' : '') + 'look at the ' + E.slots[1].name.toLowerCase() + ' slot to place it' : 'look at the resistor slot to place it'}</span></span>
          {h.slot === 'D' && <button className="hbtn small" type="button" onClick={() => ACT.rotate()}>Flip <kbd>R</kbd></button>}
          <button className="hbtn small ghosty" type="button" onClick={() => ACT.drop()}>Put back <kbd>Q</kbd></button>
        </>) : (<span className="kh-t"><b>Hands empty</b><span>Walk to the parts table beside the bench and pick a part up.</span></span>)}
      </div>
      {(b.R==='pot'||b.D==='pot')&&<label className="pot-control">Adjustable resistance: {b.pot||1000} Ω<input aria-label="Adjustable resistance" type="range" min="100" max="10000" step="10" value={b.pot||1000} onChange={e=>ACT.pot(e.target.value)}/></label>}
      <div className="dock-row act">
        <button className={'power' + (S.closed ? ' on' : '')} type="button" onClick={() => ACT.sw()}><i />{S.closed ? 'Open switch' : 'Close switch'}</button>
        {!E.volt.fixed && (
          <div className="volt"><label htmlFor="volt">Supply</label>
            <button className="hbtn small sq" type="button" aria-label="Lower voltage by 0.1 V" onClick={() => ACT.vstep(-0.1)}>−</button>
            <input type="range" id="volt" min={E.volt.min} max={E.volt.max} step={E.volt.step} value={b.V} onChange={e => ACT.volt(e.target.value, false)} onPointerUp={e => ACT.volt(e.target.value, true)} onKeyUp={e => ACT.volt(e.target.value, true)} />
            <button className="hbtn small sq" type="button" aria-label="Raise voltage by 0.1 V" onClick={() => ACT.vstep(0.1)}>+</button>
            <output htmlFor="volt">{fmtV(b.V)}</output>
          </div>
        )}
        <button className="hbtn small ghosty" type="button" aria-expanded={parts} onClick={() => setParts(!parts)}>{parts ? 'Hide parts list' : 'Parts list'}</button>
        <button className="hbtn small ghosty" type="button" onClick={() => ACT.reset()}>Reset bench</button>
      </div>
      {parts && <div className="hotbar">{opts.map((id, i) => (
        <button className="slot-tile" type="button" key={id} aria-pressed={!!h && h.id === id} onClick={() => ACT.take(id)}>
          <span className="key">{i + 1}</span><span className="ico" dangerouslySetInnerHTML={{ __html: partIcon(id) }} /><span className="nm">{partLabel(id)}</span>
        </button>))}</div>}
      {!TOUCH && <div className="keys"><kbd>W A S D</kbd> walk <kbd>Shift</kbd> run · drag to look · <kbd>E</kbd> or click to use · <kbd>Space</kbd> switch · <kbd>H</kbd> hide panels · <kbd>Esc</kbd> leave</div>}
    </section>
  );
}

function Drawer({ onClose }) {
  const exp = S.exp, b = S.bench[exp], sim = shown(), E = EXPERIMENTS[exp];
  const parts = {}; E.slots.forEach(sl => { parts[sl.name.toLowerCase()] = b[sl.id] ? partLabel(b[sl.id]) + (sl.id === 'D' && b.reversed ? ' (reversed)' : '') + (sl.id === 'D' && b.burnt ? ' (burnt)' : '') : null; });
  const r3 = x => Math.round(x * 1000) / 1000;
  let readings = null;
  if (sim) readings = exp === 'rc' ? (sim.status === 'ok' ? { time_constant_s: r3(sim.tau), volts_after_5s: r3(sim.v5) } : { status: sim.status }) : { current_mA: r3(sim.I * 1000), status: sim.burn ? 'led_burnt' : sim.status };
  const o = { experiment: exp, supply_V: b.V, parts, switch: S.closed ? 'closed' : 'open', readings, detected: S.last && S.last.exp === exp && sim ? S.last.mistake : null, hint_level: sim && S.last && S.last.mistake !== 'success' ? S.level[exp] : null };
  return (
    <aside className="hud-card drawer" aria-label="What the instructor receives">
      <div className="dr-head"><b>What Nour receives</b><button type="button" className="hud-icon" aria-label="Close" onClick={onClose}>×</button></div>
      <p className="sub">The detector reads this state and names the mistake. Nour only words the hint.</p>
      <pre className="state">{JSON.stringify(o, null, 2)}</pre>
      <ul className="log">{S.log.length ? S.log.map((l, i) => <li key={i} dangerouslySetInnerHTML={{ __html: `${l.t} · ${l.text}` }} />) : <li>Your actions on the bench are logged here.</li>}</ul>
    </aside>
  );
}

export default function LabView({ onBack, onDashboard }) {
  useLab();
  const [nourOpen, setNourOpen] = useState(() => window.innerWidth > 820);
  const [drawer, setDrawer] = useState(false);
  const [parts, setParts] = useState(false);
  const [graphicsError,setGraphicsError]=useState(false);
  const topRef = useRef(null), botRef = useRef(null);
  const E = EXPERIMENTS[S.exp];
  const pill = { idle: ['', 'Switch open'], live: ['live', 'Circuit live'], fuse: ['crit', 'Fuse tripped'], burnt: ['crit', 'LED burnt out'], stopped: ['warn', 'Test stopped'], success: ['good', 'Goal reached'] }[S.status];
  const use3d = WEBGL && S.mode !== '2d', walk = use3d && S.mode === 'walk';
  const anyOn = Object.values(S.panels).some(Boolean), allOn = Object.values(S.panels).every(Boolean);
  // with Nour's panel hidden, what she says shows as a short subtitle instead
  const [caption, setCaption] = useState(null);
  const lastSay = useRef(S.say);
  useEffect(() => {
    if (S.say === lastSay.current) return; lastSay.current = S.say;
    if (S.panels.nour) { setCaption(null); return; }
    setCaption(S.say); const t = setTimeout(() => setCaption(null), Math.max(5000, S.say.split(/\s+/).length * 380)); return () => clearTimeout(t);
  });

  // tell the camera how much of the screen the HUD covers, so the bench sits in the free space
  useEffect(() => {
    const upd = () => { const t = topRef.current, b = botRef.current; if (!rt.lab || !t || !b) return; const tr = t.getBoundingClientRect(), br = b.getBoundingClientRect(); rt.lab.setInsets(Math.max(0, tr.bottom), Math.max(0, window.innerHeight - br.top)); };
    const ro = new ResizeObserver(upd); [topRef.current, botRef.current].forEach(el => el && ro.observe(el));
    window.addEventListener('resize', upd); const id = setInterval(upd, 500); upd();
    return () => { ro.disconnect(); window.removeEventListener('resize', upd); clearInterval(id); };
  }, [use3d]);

  // game keys: E use, R flip, Q put back, number keys pick parts, Space flips the switch, Esc leaves
  useEffect(() => {
    const key = e => {
      if(e.defaultPrevented||document.querySelector('dialog[open]'))return;
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      const Ex = EXPERIMENTS[S.exp], sl = Ex.slots.find(x => x.id === S.active) || Ex.slots[0];
      const all = []; Ex.slots.forEach(x => x.options.forEach(id => all.push(id)));
      if (/^[1-9]$/.test(e.key)) { if (S.mode === 'walk') { const id = all[+e.key - 1]; if (id) ACT.take(id); } else { const id = sl.options[+e.key - 1]; if (id) ACT.part(id); } }
      else if (S.mode === 'walk' && (e.key === 'e' || e.key === 'E')) { if (rt.lab) rt.lab.useAim(); }
      else if (S.mode === 'walk' && (e.key === 'r' || e.key === 'R')) ACT.rotate();
      else if (S.mode === 'walk' && (e.key === 'q' || e.key === 'Q')) ACT.drop();
      else if (e.key === 'h' || e.key === 'H') ACT.hud();
      else if (e.key === ' ' && !(e.target.closest && e.target.closest('button'))) { e.preventDefault(); ACT.sw(); }
      else if (e.key === 'Escape') { if (drawer) setDrawer(false); else onBack(); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [drawer, onBack]);

  return (
    <main className={'immersive' + (walk ? ' walking' : '') + (TOUCH ? ' touch' : '')}>
      {use3d ? <World onFailure={()=>setGraphicsError(true)}/> : <Schematic />}{graphicsError&&<div className='graphics-fallback' role='status'>3D is unavailable. Your lab is ready in schematic view.</div>}
      <div className="hud">
        <header className="hud-top" ref={topRef}>
          <div className="ht-left">
            <button type="button" className="hud-back" onClick={onBack} aria-label="Leave the lab, back to all labs">← Labs</button>
            <div className="hud-card title-card">
              <span className="eyebrow">Dedicated experiment room</span>
              <h1>{E.title}</h1>
              <p>{E.goal}</p>
            </div>
          </div>
          <div className="ht-right">
            <span className={'pill ' + pill[0]}>{pill[1]}</span>
            {WEBGL && <div className="seg dark" role="group" aria-label="View">{[['walk', 'Walk'], ['3d', 'Orbit'], ['2d', 'Schematic']].map(([m, l]) => <button type="button" key={m} aria-pressed={S.mode === m} onClick={() => ACT.mode(m)}>{l}</button>)}</div>}
            {use3d && <button type="button" className="hud-icon" aria-label={walk ? 'Back to the bench' : 'Reset camera'} title={walk ? 'Back to the bench' : 'Reset camera'} onClick={() => ACT.view()}>⟲</button>}
            <button type="button" className="hud-icon" aria-pressed={!allOn} aria-label={anyOn ? 'Hide all panels (H)' : 'Show all panels (H)'} title={anyOn ? 'Hide all panels (H)' : 'Show all panels (H)'} onClick={() => ACT.hud()}>{anyOn ? '◱' : '▣'}</button>
            <button type="button" className="hud-icon" aria-pressed={drawer} aria-label="What Nour receives" title="What Nour receives" onClick={() => setDrawer(!drawer)}>{'{ }'}</button>
            <button type="button" className="hud-icon" aria-label="Instructor dashboard" title="Instructor dashboard" onClick={onDashboard}>▦</button>
          </div>
        </header>

        {S.panels.meters && <section className="hud-card meters" aria-label="Instruments">
          <button type="button" className="hud-icon fold panel-x" aria-label="Hide readings" title="Hide" onClick={() => ACT.panel('meters')}>×</button>
          <div className="readouts"><Meters /></div>
          {S.exp === 'rc' && <Scope />}
        </section>}

        {drawer && <Drawer onClose={() => setDrawer(false)} />}

        <div className="hud-bottom" ref={botRef}>
          {S.panels.nour ? <NourHud open={nourOpen} setOpen={setNourOpen} /> : <span />}
          {S.panels.kit ? (walk ? <Kit parts={parts} setParts={setParts} /> : <Dock />) : <span />}
          {walk && TOUCH && <div className="touch-pad"><Joystick /><div className="touch-acts">
            <button type="button" className="use-btn" onClick={() => rt.lab && rt.lab.useAim()} disabled={!rt.aim}>Use</button>
            {rt.held && rt.held.slot === 'D' && <button type="button" className="hbtn small" onClick={() => ACT.rotate()}>Flip</button>}
            {rt.held && <button type="button" className="hbtn small ghosty" onClick={() => ACT.drop()}>Put back</button>}
          </div></div>}
        </div>
        {!allOn && <div className="restore" role="group" aria-label="Hidden panels">
          {[['nour', 'Nour'], ['meters', 'Readings'], ['kit', 'Controls']].filter(([k]) => !S.panels[k]).map(([k, l]) => <button type="button" key={k} className="hbtn small" onClick={() => ACT.panel(k)}>{l}</button>)}
          {!TOUCH && <span className="restore-k"><kbd>H</kbd> shows all</span>}
        </div>}
        {caption && <div className="caption" role="status"><b>Nour</b>{caption}</div>}
        {walk && <><div className={'crosshair' + (rt.aim ? ' on' : '')} aria-hidden="true" />{rt.aim && <div className="aim" role="status">{TOUCH ? '' : <kbd>E</kbd>}{rt.aim}</div>}</>}
        {use3d && <div className="vp-hint">{walk ? (TOUCH ? 'Left stick to walk · drag to look · tap a part or slot to use it' : 'WASD to walk · drag to look · E to pick up and place parts') : 'Drag to look around · keys 1–' + (E.slots.find(x => x.id === S.active) || E.slots[0]).options.length + ' pick parts · Space = switch'}</div>}
      </div>
    </main>
  );
}
