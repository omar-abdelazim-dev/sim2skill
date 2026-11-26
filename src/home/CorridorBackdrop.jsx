import { useEffect, useRef, useState } from 'react';
import { reduced } from '../lab/store.js';
import { createCorridor } from '../platform/corridorScene.js';
import './corridorBackdrop.css';

// The lab corridor as a fixed, slowly drifting backdrop behind the home and sign-in pages, in the current theme.
// It is decorative only: no pointer input, so page scrolling and clicks are never captured.
const currentTheme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
export default function CorridorBackdrop() {
  const stageRef = useRef(null);
  const [theme, setTheme] = useState(currentTheme), [shown, setShown] = useState(false);
  useEffect(() => {
    const mo = new MutationObserver(() => setTheme(currentTheme()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  useEffect(() => {
    document.body.classList.add('home-corridor');
    let scene = null;
    try { scene = createCorridor(stageRef.current, { reduced, theme, onReady: () => { setShown(true); scene && scene.start(); } }); } catch { scene = null; }
    scene?.setOffset(0);
    const el = scene && stageRef.current.querySelector('canvas');
    const lost = e => { e.preventDefault(); setShown(false); };
    el?.addEventListener('webglcontextlost', lost);
    const failsafe = setTimeout(() => { setShown(true); scene && scene.start(); }, 4000);
    return () => { clearTimeout(failsafe); el?.removeEventListener('webglcontextlost', lost); document.body.classList.remove('home-corridor'); scene && scene.dispose(); };
  }, [theme]);
  return (
    <div className={'home-backdrop' + (shown ? ' in' : '')} aria-hidden="true">
      <div className="home-backdrop-stage" ref={stageRef} />
      <div className="home-backdrop-veil" />
    </div>
  );
}
