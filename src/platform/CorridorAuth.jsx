import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { LIVE, WORLDS } from '../labs.js';
import { reduced } from '../lab/store.js';
import CardFace from '../home/CardFace.jsx';
import { createCorridor, SMALL_QUERY } from './corridorScene.js';
import './corridor.css';

const Arrow = ({ flip }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
    <path d="M19 12H5M11 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Line = ({ i, children, k }) => <span className="rise" style={{ '--i': i }}><span key={k}>{children}</span></span>;
const typing = el => el && (el.matches('input,textarea,select,[contenteditable="true"]'));

// Sign-in / sign-up page: the existing form floats over a walkable corridor of framed labs.
export default function CorridorAuth({ onAuth, explore = false }) {
  const [signup, setSignup] = useState(true);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [entered, setEntered] = useState(false), [exiting, setExiting] = useState(false);
  const [mode, setMode] = useState('walk'), [focus, setFocus] = useState(null), [fallback, setFallback] = useState(false);
  const [nextLab, setNextLab] = useState(null), [swapped, setSwapped] = useState(false);
  const rootRef = useRef(null), stageRef = useRef(null), panelRef = useRef(null), cardRef = useRef(null), emailRef = useRef(null), sceneRef = useRef(null);

  // Build the scene once
  useEffect(() => {
    document.body.classList.add('corridor-on');
    const scene = createCorridor(stageRef.current, {
      reduced,
      onReady: () => { setEntered(true); scene && scene.start(); },
      onMode: setMode,
      onFocus: setFocus
    });
    if (!scene) { setFallback(true); setEntered(true); }
    sceneRef.current = scene;
    const failsafe = setTimeout(() => { setEntered(true); scene && scene.start(); }, 4000);
    const lost = e => { e.preventDefault(); setFallback(true); };
    scene && stageRef.current.querySelector('canvas').addEventListener('webglcontextlost', lost);
    return () => { clearTimeout(failsafe); document.body.classList.remove('corridor-on'); scene && scene.dispose(); sceneRef.current = null; };
  }, []);

  // Keep the corridor's vanishing point in the free area left of the form; track nav height
  useLayoutEffect(() => {
    const measure = () => {
      const nav = document.querySelector('.platform-nav');
      rootRef.current?.style.setProperty('--nav-h', (nav ? nav.offsetHeight : 88) + 'px');
      const small = matchMedia(SMALL_QUERY).matches, p = panelRef.current?.getBoundingClientRect();
      sceneRef.current?.setOffset(!small && p ? (window.innerWidth - p.left) / 2 : 0);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Keyboard walking, never while typing
  useEffect(() => {
    const onKey = e => {
      const s = sceneRef.current; if (!s || typing(document.activeElement) || e.metaKey || e.ctrlKey || e.altKey) return;
      const inUi = document.activeElement === document.body || document.activeElement?.closest?.('.corridor-ui');
      if (e.key === 'Escape') { s.stepBack(); return; }
      if (!inUi) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); s.walk(1); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); s.walk(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Place the focus card under the focused picture, clamped to the free area
  useLayoutEffect(() => {
    const card = cardRef.current; if (!card || !focus) return;
    if (matchMedia(SMALL_QUERY).matches) { card.style.left = ''; card.style.top = ''; return; }
    const p = panelRef.current?.getBoundingClientRect(), w = card.offsetWidth, h = card.offsetHeight;
    const cx = (focus.rect.left + focus.rect.right) / 2;
    const maxX = Math.max(16, (p ? p.left - 24 : window.innerWidth - 16) - w);
    card.style.left = Math.min(maxX, Math.max(16, cx - w / 2)) + 'px';
    card.style.top = Math.min(window.innerHeight - h - 16, focus.rect.bottom + 18) + 'px';
  }, [focus]);

  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const v = await api(signup ? 'signup' : 'login', 'POST', values);
      if (!reduced && sceneRef.current) { setExiting(true); await Promise.race([sceneRef.current.exit(), new Promise(r => setTimeout(r, 700))]); }
      onAuth(v.user);
    } catch (err) { setError(err.message); setExiting(false); } finally { setBusy(false); }
  }
  function practise(lab) {
    if (explore) { location.hash = 'details/' + lab.id; return; }
    setNextLab(lab);
    location.hash = 'signin?next=' + encodeURIComponent('details/' + lab.id);
    sceneRef.current?.stepBack();
    setTimeout(() => emailRef.current?.focus({ preventScroll: true }), 0);
    if (matchMedia(SMALL_QUERY).matches) panelRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  }
  function toggle() { setSignup(!signup); setError(''); setSwapped(true); }

  const headline = explore ? 'Walk the lab.' : signup ? 'Step inside.' : 'Welcome back.';
  const focusing = mode === 'focus';
  return (
    <main ref={rootRef} className={'corridor-auth' + (explore ? ' corridor-explore' : '') + (entered ? ' in' : '') + (exiting ? ' exiting' : '') + (fallback ? ' no-webgl' : '')}>
      <div className="corridor-first">
        <div ref={stageRef} className="corridor-stage" aria-hidden="true">
          {fallback && <div className="corridor-fallback">{LIVE.slice(0, 3).map(l => <div key={l.id} className="corridor-fallback-frame"><CardFace lab={l} /></div>)}</div>}
          <div className="corridor-veil" />
        </div>
        <div className="corridor-ui">
          {!fallback && <div className="corridor-arrows">
            <button type="button" aria-label="Walk back" onClick={() => sceneRef.current?.walk(-1)}><Arrow /></button>
            <button type="button" aria-label="Walk forward" onClick={() => sceneRef.current?.walk(1)}><Arrow flip /></button>
          </div>}
          {!fallback && <p className="corridor-hint">
            <Line i={0} k={focusing ? 'f0' : 'w0'}>{focusing ? 'Looking closer' :'Scroll or drag to walk the corridor'}</Line>
            <Line i={1} k={focusing ? 'f1' : 'w1'}>{focusing ? 'Esc or click away to step back' : 'Click a lab to look closer'}</Line>
          </p>}
          <div className="corridor-caption">
            <div className="corridor-kicker"><Line i={2}>{explore ? 'THE LAB GALLERY · 7 OPEN, MORE ON THE WAY' : 'A PLACE FOR EVERY CURIOUS MIND'}</Line></div>
            <h1 className={swapped ? 'swapped' : undefined}><Line i={3} k={headline}>{headline}</Line></h1>
            <p className="corridor-sub"><Line i={4}>{explore ? 'Click any lab to look closer. Open labs start in one click.' : 'Practise any lab. Create your own and share it with the world.'}</Line></p>
          </div>
          {explore ? <a className="corridor-jump corridor-home" href="#home">← Back home</a> : <button type="button" className="corridor-jump" onClick={() => panelRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })}>
            {signup ? 'Create account' : 'Sign in'} ↓
          </button>}
        </div>
        <div ref={cardRef} className={'lab-focus-card' + (focus ? ' shown' : '')} role="status" aria-live="polite">
          {focus && <>
            <div className="lab-focus-world" style={{ color: WORLDS[focus.lab.world].color }}>{WORLDS[focus.lab.world].label}</div>
            <h2>{focus.lab.title}</h2>
            {focus.lab.blurb && <p>{focus.lab.blurb}</p>}
            {focus.lab.live
              ? <button type="button" className="lab-focus-go" onClick={() => practise(focus.lab)}>{explore ? 'Open this lab →' : 'Sign in to practise this lab →'}</button>
              : <p className="lab-focus-soon">Coming soon. Next on the roadmap.</p>}
          </>}
        </div>
      </div>

      {!explore && <form ref={panelRef} className="platform-page corridor-auth-panel" onSubmit={submit}>
        <h2>{signup ? 'Create your account' : 'Sign in'}</h2>
        {nextLab && <p className="corridor-next">After signing in you’ll go straight to <b>{nextLab.title}</b>.</p>}
        {signup && <>
          <div className="corridor-roles">
            <div><h3>Practise.</h3><p>Browse public labs, build circuits and titrations, and practise at your own pace.</p></div>
            <div><h3>Create.</h3><p>Anyone can build a lab, share it publicly or with a private code, and gain followers.</p></div>
          </div>
          <label>Your name<input name="name" required minLength={2} maxLength={80} autoComplete="name" /></label>
        </>}
        <label>Email<input ref={emailRef} name="email" type="email" required maxLength={200} autoComplete="email" /></label>
        <label>Password<input name="password" type="password" required minLength={8} maxLength={200} autoComplete={signup ? 'new-password' : 'current-password'} /></label>
        <p className="platform-help">At least 8 characters. New accounts get 14 days of Pro free.</p>
        {error && <div className="platform-error" role="alert">{error}</div>}
        <button className="home-primary" disabled={busy}>{busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}</button>
        <button type="button" className="platform-text" onClick={toggle}>{signup ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>
      </form>}
    </main>
  );
}
