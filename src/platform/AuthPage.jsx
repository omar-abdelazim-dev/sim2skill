// Sign-in / sign-up: a clean two-column page. Left, what Sim2Skill offers; right, the form.
import { useRef, useState } from 'react';
import { api } from './api.js';
import { LIVE } from '../labs.js';
import CardFace from '../home/CardFace.jsx';
import CorridorBackdrop from '../home/CorridorBackdrop.jsx';

const POINTS = [
  ['Practise', 'Walk into 3D physics and chemistry labs and learn from every mistake.'],
  ['Create', 'Build your own lab with a quiz, share it publicly or with a private code.'],
  ['Get help', 'Nour, your lab instructor, gives hints grounded in what is on your bench.']
];

export default function AuthPage({ onAuth }) {
  const [signup, setSignup] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const emailRef = useRef(null);
  const next = new URLSearchParams(location.hash.split('?')[1] || '').get('next');
  const nextLab = next?.startsWith('details/') ? LIVE.find(l => l.id === next.slice(8)) : null;
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    try { onAuth((await api(signup ? 'signup' : 'login', 'POST', Object.fromEntries(new FormData(e.currentTarget)))).user); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <><CorridorBackdrop /><main className="auth-page">
    <section className="auth-intro">
      <div className="section-kicker">A PLACE FOR EVERY CURIOUS MIND</div>
      <h1>{signup ? <>Step inside <span className="marker">the lab.</span></> : <>Welcome <span className="marker">back.</span></>}</h1>
      <ul className="auth-points">{POINTS.map(([t, d], i) => <li key={t}><span className="auth-num">{String(i + 1).padStart(2, '0')}</span><div><b>{t}</b><p>{d}</p></div></li>)}</ul>
      <div className="auth-cards" aria-hidden="true">{LIVE.filter(l => ['ohm', 'titration', 'rc'].includes(l.id)).map((l, i) => <div key={l.id} className={'auth-card c' + i}><CardFace lab={l} /><span>{l.title}</span></div>)}</div>
    </section>
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
