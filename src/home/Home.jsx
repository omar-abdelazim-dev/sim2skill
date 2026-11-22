import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Ring from './Ring.jsx';
import Chat from './Chat.jsx';
import CardFace from './CardFace.jsx';
import { WORLDS, labById } from '../labs.js';
import { reduced } from '../lab/store.js';

const SENTENCE = [
  ['Test', { id: 'ohm', words: ["Ohm's", 'law,'], n: '01' }, 'light', 'an'],
  [{ id: 'led', words: ['LED'], n: '02' }, 'safely', 'and', 'charge', 'a'],
  [{ id: 'rc', words: ['capacitor.'], n: '03' }, 'Or', 'just', { id: 'nour', words: ['ask', 'Nour.'], n: '04' }]
];
const STATS = [['3', 'Labs open'], ['15', 'Mistake rules'], ['1,548', 'Checks passed']];
const MOTES = [[8, 62, 10, 14, -2], [18, 40, 6, 18, -9], [27, 70, 14, 16, -5], [36, 52, 8, 20, -13], [44, 30, 5, 17, -3], [53, 66, 12, 15, -11], [61, 44, 7, 19, -7], [69, 74, 16, 14, -1], [77, 36, 6, 21, -15], [85, 58, 11, 16, -8], [92, 46, 7, 18, -4], [13, 82, 9, 22, -17], [48, 84, 13, 17, -6], [72, 22, 5, 23, -19]];
const NAME = 'Sim2Skill';

function Sentence({ entered, active, setActive, onChoose }) {
  let idx = 0;
  const word = (w, key) => { const i = idx++; return <span className="wm" key={key}><span className="wi" style={{ transitionDelay: `${0.05 + 0.035 * i}s` }}>{w}</span></span>; };
  return (
    <p className={'sentence' + (entered ? ' entered' : '') + (active ? ' hovering' : '')} onPointerLeave={() => setActive(null)}>
      {SENTENCE.map((line, li) => (
        <Fragment key={li}>
          {line.map((t, ti) => {
            if (typeof t === 'string') return <Fragment key={ti}>{word(t, ti)}{' '}</Fragment>;
            const at = idx, isWorld = t.id !== 'nour', w = isWorld ? WORLDS[labById(t.id).world] : null;
            return (
              <Fragment key={ti}>
                <a href={isWorld ? '#lab' : '#home'} className={'choice' + (active === t.id ? ' on' : '')} data-c={t.id}
                  style={{ '--world': isWorld ? w.color : '#9ED8E4', '--on': isWorld ? w.on : '#0A0E11' }}
                  onPointerEnter={() => setActive(t.id)} onFocus={() => setActive(t.id)} onBlur={() => setActive(null)}
                  onClick={e => { e.preventDefault(); onChoose(t.id); }}>
                  <span className="marker" />
                  {t.words.map((w2, k) => <Fragment key={k}>{k > 0 && ' '}{word(w2, 'c' + k)}</Fragment>)}
                  <span className="uline" style={{ transitionDelay: `${0.4 + 0.035 * at}s` }} />
                  <sup style={{ transitionDelay: `${0.4 + 0.035 * at}s` }}>{t.n}</sup>
                </a>{' '}
              </Fragment>
            );
          })}
          {li < SENTENCE.length - 1 && <br className="lb" />}
        </Fragment>
      ))}
    </p>
  );
}

function Preview({ active }) {
  const ref = useRef(null), st = useRef({ x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, init: false, flipY: false, flipX: false });
  useEffect(() => {
    const s = st.current;
    const move = e => { s.tx = e.clientX; s.ty = e.clientY; if (!s.init) { s.x = s.tx; s.y = s.ty; s.init = true; } };
    window.addEventListener('pointermove', move);
    let raf, last = performance.now();
    const frame = now => {
      raf = requestAnimationFrame(frame); const el = ref.current; if (!el) return;
      let dt = Math.min(0.05, (now - last) / 1000); last = now;
      while (dt > 0) { const h = Math.min(dt, 1 / 120); for (const [p, v, t] of [['x', 'vx', 'tx'], ['y', 'vy', 'ty']]) { const a = (-260 * (s[p] - s[t]) - 28 * s[v]) / 0.6; s[v] += a * h; s[p] += s[v] * h; } dt -= h; }
      const w = el.offsetWidth, hgt = el.offsetHeight, W = window.innerWidth, H = window.innerHeight;
      if (!s.flipY && s.y - 22 - hgt < 12) s.flipY = true; else if (s.flipY && s.y - 22 - hgt > 36) s.flipY = false;
      if (!s.flipX && s.x + 18 + w > W - 12) s.flipX = true; else if (s.flipX && s.x + 18 + w < W - 36) s.flipX = false;
      let x = s.flipX ? s.x - 18 - w : s.x + 18, y = s.flipY ? s.y + 22 : s.y - 22 - hgt;
      x = Math.max(12, Math.min(W - 12 - w, x)); y = Math.max(12, Math.min(H - 12 - hgt, y));
      el.style.transform = `translate(${x}px, ${y}px)`;
      el.style.transformOrigin = `${s.flipX ? 'right' : 'left'} ${s.flipY ? 'top' : 'bottom'}`;
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('pointermove', move); };
  }, []);
  const lab = active && active !== 'nour' ? labById(active) : null, w = lab && WORLDS[lab.world];
  return (
    <div className="preview-anchor" ref={ref} aria-hidden="true">
      <div className={'preview' + (active ? ' show' : '') + (active === 'nour' ? ' ai' : '')}>
        {lab ? (<>
          <div className="pmedia"><CardFace lab={lab} /></div>
          <div className="pmeta"><b><i style={{ background: w.color }} />{w.label} · {lab.title.toUpperCase()}</b><span>{lab.blurb}</span></div>
        </>) : (<>
          <div className="pask">Ask me anything<i className="caret" /></div>
          <div className="pmeta"><b><i style={{ background: '#9ED8E4' }} />NOUR · LAB INSTRUCTOR</b><span>Which lab fits your course, what a reading means, or where to start.</span></div>
        </>)}
      </div>
    </div>
  );
}

export default function Home({ active, playIntro, onIntroDone, navNameRef, onOpenLab, onOpenCustom, transit, ringRef }) {
  const [phase, setPhase] = useState(playIntro ? 'loading' : 'done'); // loading → reveal → done
  const [stage, setStage] = useState(playIntro ? 'forming' : 'done');
  const [entered, setEntered] = useState(!playIntro);
  const [pct, setPct] = useState(0);
  const [caption, setCaption] = useState('');
  const [choice, setChoice] = useState(null);
  const frameRef = useRef(null), loaderRef = useRef(null), loaderNameRef = useRef(null), chatRef = useRef(null), layers = useRef({});
  const timers = useRef([]);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  // intro timeline
  useEffect(() => {
    if (!playIntro) return;
    const t0 = performance.now(); let raf;
    const cap = 'LOADING LABS'; for (let i = 1; i <= cap.length; i++) later(() => setCaption(cap.slice(0, i)), 350 + i * 45);
    const tick = now => { const p = Math.min(1, (now - t0) / 2600); setPct(Math.round(p * 100)); if (p < 1) raf = requestAnimationFrame(tick); else later(reveal, 250); };
    raf = requestAnimationFrame(tick);
    const key = e => { if (e.key === 'Escape' || e.key === 'Tab') skip(); };
    window.addEventListener('keydown', key);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', key); timers.current.forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the frame stays fully open while the ring forms, then closes to its rounded edge
  useLayoutEffect(() => {
    const fr = frameRef.current; if (!fr || phase !== 'loading') return;
    const r = fr.getBoundingClientRect();
    fr.style.setProperty('--ft', `${r.top}px`); fr.style.setProperty('--fl', `${r.left}px`); fr.style.setProperty('--fr', `${window.innerWidth - r.right}px`); fr.style.setProperty('--fb', `${window.innerHeight - r.bottom}px`);
  }, [phase]);

  function flyName() {
    const from = loaderNameRef.current, to = navNameRef.current; if (!from || !to) { onIntroDone(); return; }
    const a = from.querySelector('.ln-word').getBoundingClientRect(), b = to.getBoundingClientRect();
    const scale = b.height / a.height;
    from.animate([{ transform: 'translate(0,0) scale(1)' }, { transform: `translate(${b.left - a.left}px, ${b.top - a.top}px) scale(${scale})` }],
      { duration: 1300, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' });
    const dot = from.querySelector('.ln-dot'); if (dot) dot.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 500, fill: 'forwards' });
    later(() => { onIntroDone(); }, 1300);
  }
  function reveal() {
    if (phaseRef.current !== 'loading') return; phaseRef.current = 'reveal';
    setPhase('reveal'); setStage('expanding'); flyName();
    later(() => setEntered(true), 1050);
    later(() => setPhase('done'), 1100);
  }
  function skip() {
    if (phaseRef.current === 'done') return; phaseRef.current = 'done';
    timers.current.forEach(clearTimeout); setPct(100); setPhase('done'); setStage('done'); setEntered(true); onIntroDone();
  }
  const phaseRef = useRef(phase);
  useEffect(() => { if (phase === 'done') phaseRef.current = 'done'; }, [phase]);

  // pointer parallax on the scene layers
  useEffect(() => {
    if (reduced || !matchMedia('(pointer: fine)').matches) return;
    const s = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 }; let raf, last = performance.now();
    const move = e => { s.tx = e.clientX / window.innerWidth * 2 - 1; s.ty = e.clientY / window.innerHeight * 2 - 1; };
    const frame = now => {
      raf = requestAnimationFrame(frame); let dt = Math.min(0.05, (now - last) / 1000); last = now;
      while (dt > 0) { const h = Math.min(dt, 1 / 120); for (const [p, v, t] of [['x', 'vx', 'tx'], ['y', 'vy', 'ty']]) { const a = -40 * (s[p] - s[t]) - 18 * s[v]; s[v] += a * h; s[p] += s[v] * h; } dt -= h; }
      for (const [k, d] of Object.entries({ scene: 10, mist: 34, motes: 40 })) { const el = layers.current[k]; if (el) el.style.translate = `${-s.x * d}px ${-s.y * d * 0.5}px`; }
    };
    window.addEventListener('pointermove', move); raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('pointermove', move); };
  }, []);

  const choose = id => { if (id === 'nour') { chatRef.current && chatRef.current.focus(); return; } setChoice(null); onOpenLab(id); };
  const digits = String(pct).padStart(3, ' ').split('');
  const focusLab = choice && choice !== 'nour' ? choice : null;

  return (
    <div className={'home' + (phase !== 'done' ? ' intro-' + phase : '') + (entered ? ' entered' : '') + (transit ? ' leaving' : '')}>
      <div className="toprow">
        <Sentence entered={entered} active={choice} setActive={setChoice} onChoose={choose} />
        <dl className="stats">
          {STATS.map(([n, l], i) => <div key={l} style={{ transitionDelay: `${0.35 + i * 0.1}s` }}><dt>{l}</dt><dd>{n}</dd></div>)}
        </dl>
      </div>
      <div className={'frame' + (phase === 'loading' ? ' open' : '') + (focusLab ? ' focusing' : '')} ref={frameRef}>
        <div className="scene" ref={el => (layers.current.scene = el)}><div className="sky" /><div className="floor" /><div className="grain" /></div>
        <Ring ref={ringRef} stage={stage} active={active && !transit} focusLab={focusLab}
          onOpen={onOpenLab} onSoon={lab => chatRef.current && chatRef.current.soon(lab)} onExpanded={() => {}} />
        <div className="mist" ref={el => (layers.current.mist = el)} />
        <div className="motes" ref={el => (layers.current.motes = el)}>
          {MOTES.map(([l, t, s, d, dl], i) => <i key={i} style={{ left: `${l}%`, top: `${t}%`, width: s, height: s, animationDuration: `${d}s`, animationDelay: `${dl}s` }} />)}
        </div>
        <div className="chat-wrap"><Chat ref={chatRef} onOpenLab={onOpenLab} onOpenCustom={onOpenCustom} disabled={!!transit} /></div>
      </div>
      <Preview active={entered && phase === 'done' ? choice : null} />
      {playIntro && phase !== 'done' && (
        <div className={'loader' + (phase === 'reveal' ? ' out' : '')} ref={loaderRef} role="status" aria-label={`Loading labs, ${pct}%`}>
          <div className="lname" ref={loaderNameRef} aria-hidden="true">
            <span className="ln-word">{NAME.split('').map((ch, i) => <span className="lm" key={i}><span style={{ animationDelay: `${0.1 + i * 0.06}s` }}>{ch}</span></span>)}</span>
            <span className="lm ln-dot"><span style={{ animationDelay: `${0.1 + NAME.length * 0.06}s` }}>.</span></span>
          </div>
          <div className="lcount" aria-hidden="true">
            <div className="lcap">{caption}</div>
            <div className="odo">
              {digits.map((d, i) => <span className={'od' + (d === ' ' ? ' blank' : '')} key={i}><span style={{ transform: `translateY(${-(d === ' ' ? 0 : +d) * 10}%)` }}>{[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => <i key={n}>{n}</i>)}</span></span>)}
              <span className="pc">%</span>
            </div>
          </div>
          <button type="button" className="lskip" onClick={skip} aria-label="Skip intro">↗</button>
        </div>
      )}
    </div>
  );
}
