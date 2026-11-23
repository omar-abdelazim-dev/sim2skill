import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';
import { LABS, WORLDS } from '../labs.js';
import { reduced } from '../lab/store.js';
import CardFace from './CardFace.jsx';

const SLOTS = 16, N = LABS.length, OFF = Math.min(3, N - 1);
const rad = d => d * Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mod = (a, n) => ((a % n) + n) % n;

// cubic-bezier easing (x1,y1,x2,y2) → t ↦ y
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = t => ((ax * t + bx) * t + cx) * t, Yf = t => ((ay * t + by) * t + cy) * t, dX = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => { if (x <= 0) return 0; if (x >= 1) return 1; let t = x; for (let i = 0; i < 8; i++) { const e = X(t) - x, d = dX(t); if (Math.abs(e) < 1e-5 || !d) break; t -= e / d; } return Yf(clamp(t, 0, 1)); };
}
const easeExpand = bezier(.5, 0, .15, 1);

const slotAngle = (e, rot) => mod(360 * e / SLOTS + rot + 180, 360) - 180;
const slotSite = (e, rot) => { const a = Math.floor((360 * e / SLOTS + rot + 180) / 360); return mod(mod(e - a * SLOTS + OFF, N), N); };
const wallScale = () => (window.innerWidth <= 820 ? 0.8 : window.innerHeight <= 760 ? 0.9 : 1.1);

function spring(k, c, m = 1) { return { x: 0, v: 0, t: 0, step(dt) { let s = dt; while (s > 0) { const h = Math.min(s, 1 / 120); const a = (-k * (this.x - this.t) - c * this.v) / m; this.v += a * h; this.x += this.v * h; s -= h; } } }; }

const Ring = forwardRef(function Ring({ stage, focusLab, onOpen, onSoon, onExpanded, active }, ref) {
  const wallRef = useRef(null), lensRef = useRef(null), centerRef = useRef(null);
  const cardRefs = useRef([]), faceRefs = useRef([]), tiltRefs = useRef([]);
  const [slots, setSlots] = useState(() => Array.from({ length: SLOTS }, (_, e) => slotSite(e, 0)));
  const st = useRef({ f: 0, e: 0, m: 0, rot: spring(150, 27), E: 1, hover: -1, drag: null, lastDrag: 0, hold: false, introDone: false, t0: 0, eT0: 0, slots: null, tilts: [], frame: 0 });
  const props = useRef({}); props.current = { stage, onExpanded, active, onOpen, onSoon };

  useEffect(() => { st.current.slots = slots; }, [slots]);
  useEffect(() => {
    const s = st.current;
    if (stage === 'forming' && !s.t0) s.t0 = performance.now();
    if (stage === 'expanding' && !s.eT0) s.eT0 = performance.now();
    if (stage === 'done' && !s.introDone) { s.f = 1; s.e = 1; s.introDone = true; }
  }, [stage]);

  useImperativeHandle(ref, () => ({
    // spin the ring so the card for this lab faces the viewer, then hand back its face element
    focus(labId) {
      const s = st.current, idx = LABS.findIndex(l => l.id === labId); s.hold = true;
      let best = -1, bestA = 999;
      for (let e = 0; e < SLOTS; e++) { if (slotSite(e, s.rot.x) !== idx) continue; const a = slotAngle(e, s.rot.x); if (Math.abs(a) < Math.abs(bestA)) { bestA = a; best = e; } }
      if (best < 0) return Promise.resolve(null);
      s.m = s.rot.x - bestA; s.rot.t = s.m;
      return new Promise(res => { const t0 = performance.now(); const chk = () => { if (Math.abs(s.rot.x - s.m) < 0.4 || performance.now() - t0 > 1400 || reduced) { if (reduced) s.rot.x = s.m; res({ el: faceRefs.current[best] }); } else requestAnimationFrame(chk); }; requestAnimationFrame(chk); });
    },
    release() { st.current.hold = false; }
  }), []);

  // per-frame layout
  useEffect(() => {
    let raf, last = performance.now(), dead = false;
    const frame = now => {
      if (dead) return; raf = requestAnimationFrame(frame);
      const s = st.current, P = props.current, wall = wallRef.current; if (!wall) return;
      const dt = Math.min(0.05, (now - last) / 1000), k = Math.min(3, (now - last) / 16.67); last = now;
      if (!P.active && s.introDone) return;
      // intro timeline
      if (!s.introDone) {
        if (s.t0) s.f = reduced ? 1 : Math.min(1, (now - s.t0) / 2600);
        if (s.eT0) { const p = reduced ? 1 : Math.min(1, (now - s.eT0) / 1900); s.e = easeExpand(p); if (p >= 1) { s.introDone = true; P.onExpanded && P.onExpanded(); } }
      }
      const f = s.f, e = s.e;
      // spin
      s.frame++;
      s.E += ((s.hover >= 0 ? 0.2 : 1) - s.E) * Math.min(1, 0.08 * k);
      const focusedInside = wall.contains(document.activeElement);
      if (!s.drag && !focusedInside && !reduced && !s.hold) {
        if (s.introDone) s.m += 0.3 * s.E * k;
        else s.m += 0.3 * (0.5 + 0.5 * e) * clamp((78 - s.m) / 20, 0, 1) * s.E * k;
      }
      s.rot.t = s.m; if (reduced) s.rot.x = s.m; else s.rot.step(dt);
      const rot = s.introDone ? s.rot.x : 0;
      // geometry
      const tilt = -22 * (1 - e), radius = 460 + 1340 * e, anchor = -radius * Math.sin(rad(tilt)) + 460 * Math.sin(rad(-22)) * (1 - e);
      const persp = 1000 - 240 * e, roll = -20 * (1 - e), cs = 0.52 + 1.78 * e * e;
      const ws = wallScale(), fit = Math.min(1.05, (window.innerWidth - 32) / 1240, 0.66 * window.innerHeight / 800) / ws;
      const sc = fit + (1 - fit) * e, A = ws * sc;
      const fr = wall.getBoundingClientRect(), introOff = 0.44 * window.innerHeight - (fr.top + fr.height / 2);
      const lens = lensRef.current, c = centerRef.current;
      lens.style.perspective = `${persp * A}px`;
      lens.style.perspectiveOrigin = `50% calc(50% + ${introOff * (1 - e)}px)`;
      c.style.transform = `translate(${160 * Math.sin(rad(roll)) * A}px, ${introOff * (1 - e) + anchor * A}px) rotateZ(${roll}deg) rotateX(${tilt}deg) scale3d(${A}, ${A}, ${A})`;
      // cards
      const want = [];
      for (let i = 0; i < SLOTS; i++) {
        const r = slotAngle(i, rot); want.push(slotSite(i, rot));
        const n = r + 180, a = n / 360, ii = clamp((f - 0.7 * a) / 0.3, 0, 1), sm = 1 - Math.pow(1 - ii, 3);
        const l = -180 + n * sm, cr = radius - (1 - sm) * a * 24, x = -Math.sin(rad(l)) * cr, z = -Math.cos(rad(l)) * cr;
        const el = cardRefs.current[i]; if (!el) continue;
        const hidden = z * Math.cos(rad(tilt)) >= persp - 70 || (s.introDone && Math.abs(r) > 96);
        el.style.visibility = hidden ? 'hidden' : 'visible';
        el.style.opacity = Math.min(1, 2.5 * ii);
        el.style.transform = `translate3d(${x}px, 0, ${z}px) rotateY(${l}deg) scale(${cs})`;
        const face = faceRefs.current[i]; if (face) face.style.transform = z > radius * radius / persp ? 'rotateY(180deg)' : '';
        // hover tilt
        const tl = s.tilts[i]; const tw = tiltRefs.current[i];
        if (tl && tw) { tl.rx.step(dt); tl.ry.step(dt); tl.tz.step(dt); tw.style.transform = `translateZ(${tl.tz.x}px) rotateX(${tl.rx.x}deg) rotateY(${tl.ry.x}deg)`; }
      }
      const cur = s.slots; if (cur && want.some((v, i) => v !== cur[i])) { s.slots = want; setSlots(want); }
    };
    raf = requestAnimationFrame(frame);
    return () => { dead = true; cancelAnimationFrame(raf); };
  }, []);

  // wheel, drag, touch
  useEffect(() => {
    const s = st.current, wall = wallRef.current;
    const onWheel = ev => {
      if (!props.current.active || ev.ctrlKey || ev.metaKey || !wall.contains(ev.target)) return;
      const t = ev.target; if (t.closest && t.closest('input, textarea, .chat-log, .preview')) return;
      ev.preventDefault(); if (!s.introDone) return;
      let d = Math.abs(ev.deltaY) > Math.abs(ev.deltaX) ? ev.deltaY : ev.deltaX;
      if (ev.deltaMode === 1) d *= 16; else if (ev.deltaMode === 2) d *= window.innerHeight;
      s.m += 0.5 * clamp(d, -480, 480);
    };
    const down = ev => {
      if (!s.introDone || s.hold) return;
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      if (ev.target.closest('input, textarea, button.chip, .chat')) return;
      s.drag = { x: ev.clientX, y: ev.clientY, m: s.m, moved: false, id: ev.pointerId };
    };
    const move = ev => {
      if (!s.drag || ev.pointerId !== s.drag.id) return;
      const dx = ev.clientX - s.drag.x, dy = ev.clientY - s.drag.y, d = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      if (Math.hypot(dx, dy) > 4 && !s.drag.moved) { s.drag.moved = true; wall.classList.add('grabbing'); }
      if (s.drag.moved) s.m = s.drag.m + 0.2 * d;
    };
    const up = ev => { if (!s.drag || ev.pointerId !== s.drag.id) return; if (s.drag.moved) s.lastDrag = performance.now(); s.drag = null; wall.classList.remove('grabbing'); };
    wall.addEventListener('wheel', onWheel, { passive: false });
    wall.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    return () => { wall.removeEventListener('wheel', onWheel); wall.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
  }, []);

  const cardMove = (i, ev) => {
    const s = st.current; if (!s.introDone || ev.pointerType !== 'mouse') return;
    s.hover = i; const r = ev.currentTarget.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width - 0.5, y = (ev.clientY - r.top) / r.height - 0.5;
    const t = s.tilts[i] || (s.tilts[i] = { rx: spring(180, 24), ry: spring(180, 24), tz: spring(180, 24) });
    t.rx.t = -20 * y; t.ry.t = 24 * x; t.tz.t = 45;
  };
  const cardLeave = i => { const s = st.current; if (s.hover === i) s.hover = -1; const t = s.tilts[i]; if (t) { t.rx.t = 0; t.ry.t = 0; t.tz.t = 0; } };
  const cardClick = (lab, ev) => {
    const s = st.current; ev.preventDefault();
    if (!s.introDone || s.hold || performance.now() - s.lastDrag < 50) return;
    if (lab.live) props.current.onOpen(lab.id); else props.current.onSoon(lab);
  };

  return (
    <div className="wall" ref={wallRef} aria-label="Lab ring. Drag or scroll to spin it.">
      <div className="lens" ref={lensRef}>
        <div className="ringc" ref={centerRef}>
          {slots.map((si, i) => {
            const lab = LABS[si], w = WORLDS[lab.world];
            const dim = focusLab && focusLab !== lab.id;
            return (
              <button type="button" key={i} tabIndex={0} className={'rcard' + (lab.live ? ' live' : ' soon') + (dim ? ' dim' : '')} ref={el => (cardRefs.current[i] = el)}
                style={{ '--world': w.color, '--on': w.on }} aria-label={lab.live ? `Open the ${lab.title} lab` : `${lab.title}, coming soon`}
                onPointerMove={ev => cardMove(i, ev)} onPointerLeave={() => cardLeave(i)} onClick={ev => cardClick(lab, ev)}>
                <div className="tilt" ref={el => (tiltRefs.current[i] = el)}>
                  <div className="cframe" />
                  <div className="face" ref={el => (faceRefs.current[i] = el)}>
                    <CardFace lab={lab} />
                    <span className="chip-no"><i />{lab.live ? `Lab ${String(si + 1).padStart(2, '0')}` : 'Soon'}</span>
                    <span className="lbar"><b>{lab.live ? w.label : 'COMING SOON'}</b><em>{lab.title}</em></span>
                    <span className="veil" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});
export default Ring;
