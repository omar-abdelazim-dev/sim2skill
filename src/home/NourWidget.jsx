// Nour as a pop-up chat pinned to the bottom-right corner of every page (labs have their own Nour).
// Anything can open it with window.dispatchEvent(new Event('nour:open')).
import { useEffect, useRef, useState } from 'react';
import Chat from './Chat.jsx';

export const openNour = () => window.dispatchEvent(new Event('nour:open'));

function NourFace() {
  return <svg viewBox="0 0 40 40" aria-hidden="true" className="nour-face">
    <rect x="6" y="10" width="28" height="22" rx="8" fill="#1B252B" />
    <circle cx="15" cy="21" r="3.2" fill="#FFD34D" /><circle cx="25" cy="21" r="3.2" fill="#FFD34D" />
    <rect x="15" y="27" width="10" height="2" rx="1" fill="#E8F0F2" />
    <line x1="20" y1="10" x2="20" y2="5" stroke="#1B252B" strokeWidth="2" /><circle cx="20" cy="4" r="2.2" fill="#F2B705" />
  </svg>;
}

export default function NourWidget({ onOpenLab }) {
  const [open, setOpen] = useState(false), [seen, setSeen] = useState(false);
  const chatRef = useRef(null), launcherRef = useRef(null);
  useEffect(() => {
    const show = () => { setOpen(true); setSeen(true); };
    window.addEventListener('nour:open', show);
    return () => window.removeEventListener('nour:open', show);
  }, []);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => chatRef.current?.focus(), 180);
    const esc = e => { if (e.key === 'Escape') { setOpen(false); launcherRef.current?.focus(); } };
    document.addEventListener('keydown', esc);
    return () => { clearTimeout(t); document.removeEventListener('keydown', esc); };
  }, [open]);
  return <div className={'nour-widget' + (open ? ' open' : '')}>
    <section className="nour-pop" id="nour-pop" role="dialog" aria-label="Chat with Nour, your lab instructor" hidden={!open}>
      <button type="button" className="nour-pop-close" aria-label="Close chat" onClick={() => { setOpen(false); launcherRef.current?.focus(); }}>×</button>
      <Chat ref={chatRef} onOpenLab={id => { setOpen(false); onOpenLab(id); }} />
    </section>
    <button ref={launcherRef} type="button" className="nour-launcher" aria-expanded={open} aria-controls="nour-pop" onClick={() => { setOpen(o => !o); setSeen(true); }}>
      {open ? <span className="nour-launcher-x" aria-hidden="true">×</span> : <NourFace />}
      <span className="nour-launcher-label">{open ? 'Close' : 'Ask Nour'}</span>
      {!seen && !open && <span className="nour-ping" aria-hidden="true" />}
    </button>
  </div>;
}
