import { useEffect, useRef, useState } from 'react';
import { reduced } from '../lab/store.js';
import { createCorridor, SMALL_QUERY } from '../platform/corridorScene.js';
import './corridorBackdrop.css';

// The lab corridor as a fixed, slowly drifting backdrop behind the home and sign-in pages, in the current theme.
// Home: decorative, the page scroll walks it. Sign-in (interactive): drag or scroll to walk, click a lab frame to look closer.
const currentTheme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
export default function CorridorBackdrop({ interactive = false, avoid, sceneRef, onFocus, onMode }) {
  const stageRef = useRef(null), cb = useRef({});
  cb.current = { onFocus, onMode };
  const [theme, setTheme] = useState(currentTheme), [shown, setShown] = useState(false);
  useEffect(() => {
    const mo = new MutationObserver(() => setTheme(currentTheme()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  useEffect(() => {
    document.body.classList.add('home-corridor');
    let scene = null;
    try {
      scene = createCorridor(stageRef.current, {
        reduced, theme, onReady: () => { setShown(true); scene && scene.start(); },
        ...(interactive ? { onFocus: f => cb.current.onFocus?.(f), onMode: m => cb.current.onMode?.(m) } : {})
      });
    } catch { scene = null; }
    if (sceneRef) sceneRef.current = scene;
    // keep the corridor's vanishing point in the free area beside the form
    const place = () => {
      const p = avoid && document.querySelector(avoid)?.getBoundingClientRect();
      scene?.setOffset(p && p.width && !matchMedia(SMALL_QUERY).matches ? Math.max(0, (window.innerWidth - p.left) / 2) : 0);
    };
    // measure after the page layout has settled (the parent adds its layout class in a later effect), then on resize
    place(); const placeSoon = requestAnimationFrame(() => requestAnimationFrame(place));
    const ro = typeof ResizeObserver === 'function' && avoid && document.querySelector(avoid) ? new ResizeObserver(place) : null;
    ro?.observe(document.querySelector(avoid));
    window.addEventListener('resize', place);
    // scrolling the page walks the corridor: wheel input directly, scroll position for touch, keys and the scrollbar
    let lastY = window.scrollY, lastWheel = 0;
    const onWheel = e => { if (interactive && e.target?.tagName === 'CANVAS') return; lastWheel = performance.now(); scene?.nudge(e.deltaY * (e.deltaMode === 1 ? 33 : 1)); };
    const onScroll = () => { if (interactive) return; const y = window.scrollY, d = y - lastY; lastY = y; if (performance.now() - lastWheel > 150) scene?.nudge(d); };
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    const el = scene && stageRef.current.querySelector('canvas');
    const lost = e => { e.preventDefault(); setShown(false); };
    el?.addEventListener('webglcontextlost', lost);
    const failsafe = setTimeout(() => { setShown(true); scene && scene.start(); }, 4000);
    return () => { cancelAnimationFrame(placeSoon); ro?.disconnect(); window.removeEventListener('resize', place); if (sceneRef) sceneRef.current = null; window.removeEventListener('wheel', onWheel); window.removeEventListener('scroll', onScroll); clearTimeout(failsafe); el?.removeEventListener('webglcontextlost', lost); document.body.classList.remove('home-corridor'); scene && scene.dispose(); };
  }, [theme, interactive, avoid]);
  return (
    <div className={'home-backdrop' + (shown ? ' in' : '') + (interactive ? ' interactive' : '')} aria-hidden={interactive ? undefined : 'true'}>
      <div className="home-backdrop-stage" ref={stageRef} />
      <div className="home-backdrop-veil" />
    </div>
  );
}
