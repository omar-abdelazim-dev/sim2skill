// Sign-in / sign-up: the lab corridor behind the form on the right.
import { useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { LIVE } from '../labs.js';
import CorridorBackdrop from '../home/CorridorBackdrop.jsx';
import './authFixed.css';

export default function AuthPage({ onAuth }) {
  const [signup, setSignup] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const emailRef = useRef(null);
  // the sign-in page is a fixed one-screen layout: no page scrollbar, nothing moves
  useEffect(() => { document.body.classList.add('auth-static'); return () => document.body.classList.remove('auth-static'); }, []);
  const next = new URLSearchParams(location.hash.split('?')[1] || '').get('next');
  const nextLab = next?.startsWith('details/') ? LIVE.find(l => l.id === next.slice(8)) : null;
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    try { onAuth((await api(signup ? 'signup' : 'login', 'POST', Object.fromEntries(new FormData(e.currentTarget)))).user); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <><CorridorBackdrop /><main className="auth-page">
    <form className="platform-page auth-panel" onSubmit={submit}>
      <h2>{signup ? 'Create your account' : 'Sign in'}</h2>
      <p className="platform-help">{signup ? 'Free to start. New accounts get 14 days of Pro.' : 'Good to see you again.'}</p>
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
