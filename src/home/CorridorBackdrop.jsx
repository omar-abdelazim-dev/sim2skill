import { useEffect, useRef, useState } from 'react';
import { reduced } from '../lab/store.js';
import { createCorridor } from '../platform/corridorScene.js';

// The sign-in page's lab corridor, used as a fixed, slowly drifting backdrop behind the home page.
// It is decorative only: no pointer input, so page scrolling and clicks are never captured.
export default function CorridorBackdrop() {
  const stageRef = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    document.body.classList.add('corridor-on', 'home-corridor');
    let scene = null;
    try { scene = createCorridor(stageRef.current, { reduced, onReady: () => { setShown(true); scene && scene.start(); } }); } catch { scene = null; }
    scene?.setOffset(0);
    const failsafe = setTimeout(() => { setShown(true); scene && scene.start(); }, 4000);
    return () => { clearTimeout(failsafe); document.body.classList.remove('corridor-on', 'home-corridor'); scene && scene.dispose(); };
  }, []);
  return (
    <div className={'home-backdrop' + (shown ? ' in' : '')} aria-hidden="true">
      <div className="home-backdrop-stage" ref={stageRef} />
      <div className="home-backdrop-veil" />
    </div>
  );
}
