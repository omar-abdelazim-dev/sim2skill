// Sign-in / sign-up: the form on the right, a walkable lab corridor behind it (drag or scroll to walk, click a frame to look closer).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { LIVE, WORLDS } from '../labs.js';
import { SMALL_QUERY } from './corridorScene.js';
import CorridorBackdrop from '../home/CorridorBackdrop.jsx';
import './authFixed.css';

export default function AuthPage({ onAuth }) {
  const [signup, setSignup] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const emailRef = useRef(null);
  // the sign-in page is a fixed one-screen layout: no page scrollbar, nothing moves
  useEffect(() => { document.body.classList.add('auth-static'); return () => document.body.classList.remove('auth-static'); }, []);
  const next = new URLSearchParams(location.hash.split('?')[1] || '').get('next');
  const [nextLab, setNextLab] = useState(() => next?.startsWith('details/') ? LIVE.find(l => l.id === next.slice(8)) || null : null);
  const sceneRef = useRef(null), cardRef = useRef(null), panelRef = useRef(null);
  const [focus, setFocus] = useState(null), [mode, setMode] = useState('walk');

  // arrow keys walk, Esc steps back; never while typing
  useEffect(() => {
    const onKey = e => {
      const sc = sceneRef.current, a = document.activeElement;
      if (!sc || e.metaKey || e.ctrlKey || e.altKey || a?.matches?.('input,textarea,select,[contenteditable="true"]')) return;
      if (e.key === 'Escape') sc.stepBack();
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); sc.walk(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); sc.walk(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // put the lab card under the focused frame, clear of the form
  useLayoutEffect(() => {
    const card = cardRef.current; if (!card || !focus) return;
    if (matchMedia(SMALL_QUERY).matches) { card.style.left = ''; card.style.top = ''; return; }
    const p = panelRef.current?.getBoundingClientRect(), w = card.offsetWidth, h = card.offsetHeight, cx = (focus.rect.left + focus.rect.right) / 2;
    card.style.left = Math.min(Math.max(16, (p ? p.left - 24 : innerWidth - 16) - w), Math.max(16, cx - w / 2)) + 'px';
    card.style.top = Math.max(96, Math.min(innerHeight - h - 16, focus.rect.bottom + 18)) + 'px';
  }, [focus]);
  function practise(lab) {
    setNextLab(lab);
    location.hash = 'signin?next=' + encodeURIComponent('details/' + lab.id);
    sceneRef.current?.stepBack();
    setTimeout(() => emailRef.current?.focus({ preventScroll: true }), 0);
  }
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    try { onAuth((await api(signup ? 'signup' : 'login', 'POST', Object.fromEntries(new FormData(e.currentTarget)))).user); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <><CorridorBackdrop interactive avoid=".auth-panel" sceneRef={sceneRef} onFocus={setFocus} onMode={setMode} /><main className="auth-page">
    <div className="auth-ui">
      <div className="auth-arrows">
        <button type="button" aria-label="Walk back" onClick={() => sceneRef.current?.walk(-1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
        <button type="button" aria-label="Walk forward" onClick={() => sceneRef.current?.walk(1)}><svg viewBox="0 0 24 24" aria-hidden="true" style={{ transform: 'scaleX(-1)' }}><path d="M19 12H5M11 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
      </div>
      <p className="auth-hint">{mode === 'focus' ? 'Esc or click away to step back' : 'Scroll or drag to walk · click a lab to look closer'}</p>
    </div>
    <div ref={cardRef} className={'lab-focus-card' + (focus ? ' shown' : '')} role="status" aria-live="polite">
      {focus && <>
        <div className="lab-focus-world" style={{ color: WORLDS[focus.lab.world].color }}>{WORLDS[focus.lab.world].label}</div>
        <h2>{focus.lab.title}</h2>
        {focus.lab.blurb && <p>{focus.lab.blurb}</p>}
        {focus.lab.live ? <button type="button" className="lab-focus-go" onClick={() => practise(focus.lab)}>Sign in to practise this lab →</button> : <p className="lab-focus-soon">Coming soon. Next on the roadmap.</p>}
      </>}
    </div>
    <form ref={panelRef} className="platform-page auth-panel" onSubmit={submit}>
      <h2>{signup ? 'Create your account' : 'Sign in'}</h2>
      <p className="platform-help">{signup ? 'Free to start. New accounts get 14 days of the Individual plan.' : 'Good to see you again.'}</p>
      {nextLab && <p className="auth-next">After signing in you’ll go straight to <b>{nextLab.title}</b>.</p>}
      {signup && <label>Your name<input name="name" required minLength={2} maxLength={80} autoComplete="name" /></label>}
      <label>Email<input ref={emailRef} name="email" type="email" required maxLength={200} autoComplete="email" /></label>
      <label>Password<input name="password" type="password" required minLength={8} maxLength={200} autoComplete={signup ? 'new-password' : 'current-password'} />{signup && <small className="platform-help">At least 8 characters.</small>}</label>
      {error && <div className="platform-error" role="alert">{error}</div>}
      <button className="home-primary" disabled={busy}>{busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}</button>
      <button type="button" className="platform-text" onClick={() => { setSignup(!signup); setError(''); emailRef.current?.focus(); }}>{signup ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>
    </form>
  </main></>;
}
