// First-person curved lab corridor: the backdrop of the home and sign-in pages (three.js 0.128), in a dark and a light version.
// The camera walks around a ring; framed lab pictures hang on both walls.
import * as THREE from 'three';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CardFace from '../home/CardFace.jsx';
import { LABS, WORLDS } from '../labs.js';

const R = 18, RIN = 12.2, H = 6.2;
const PW = 1.6, PH = PW * 160 / 284, PY = 2.0;
const N_OUT = 28, N_IN = 21, STEP = 2 * Math.PI / N_OUT;
const TAU = Math.PI * 2;
export const SMALL_QUERY = '(max-width: 820px), (orientation: landscape) and (max-height: 500px)';

const PALETTES = {
  dark: {
    bg: 0x0A0E11, outer: [[0, '#0B1116'], [.25, '#141C22'], [.62, '#141C22'], [.9, '#10171C'], [1, '#0A0F13']], inner: [[0, '#0C1217'], [.3, '#162027'], [.8, '#121A20'], [1, '#0B1014']],
    floor: ['#0E151A', '#121B21', '#0D1418'], ceil: 0x070B0E, led: 0x3AA8D0, ledGlow: 'rgba(58,168,208,', mat: 0x0A0E11, lamp: 0x1E2930,
    washA: [.30, .10], shadow: .55, ink: '#EEF4F6', live: '#F2B705', soon: '#647C8A'
  },
  light: {
    bg: 0xF3F0E7, outer: [[0, '#E3DECF'], [.25, '#F2EFE5'], [.62, '#F7F4EB'], [.9, '#EEEADD'], [1, '#E0DBCB']], inner: [[0, '#E6E1D2'], [.3, '#F4F1E7'], [.8, '#EFEBDF'], [1, '#E2DDCE']],
    floor: ['#E2DCCB', '#ECE8DB', '#D9D3C1'], ceil: 0xF6F3EA, led: 0xE8A90C, ledGlow: 'rgba(232,169,12,', mat: 0xFFFFFF, lamp: 0xB7B09D,
    washA: [.34, .12], shadow: .2, ink: '#1B252B', live: '#8F6200', soon: '#7A8890'
  }
};
const easeQuart = t => 1 - Math.pow(1 - t, 4);
const easeQuad = t => 1 - (1 - t) * (1 - t);
const easeCubic = t => 1 - Math.pow(1 - t, 3);
const easeExpo = t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const easeInOut = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ---------- canvas helpers ---------- */
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function vGradient(stops) {
  const c = canvas(4, 256), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  return c;
}
function radial(size, cx, cy, r, stops) {
  const c = canvas(size, size), g = c.getContext('2d'), gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
  stops.forEach(([o, col]) => gr.addColorStop(o, col)); g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return c;
}
function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

// One 1136×640 picture per lab: a photo from public/labs/<id>.jpg, else the CardFace drawing.
async function labPicture(lab) {
  const W = 1136, Hh = 640, c = canvas(W, Hh), g = c.getContext('2d');
  let ok = false;
  try {
    const img = await loadImg(import.meta.env.BASE_URL + 'labs/' + lab.id + '.jpg');
    const s = Math.max(W / img.width, Hh / img.height), w = img.width * s, h = img.height * s;
    g.drawImage(img, (W - w) / 2, (Hh - h) / 2, w, h); ok = true;
  } catch { /* no photo yet */ }
  if (!ok) {
    let url;
    try {
      let svg = renderToStaticMarkup(createElement(CardFace, { lab }));
      svg = svg.replace(/<animate(Transform)?\b[^>]*?(\/>|>\s*<\/animate(Transform)?>)/g, '')
        .replace(/stroke-dashoffset="100"/g, 'stroke-dashoffset="0"')
        .replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hh}" `);
      url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      g.drawImage(await loadImg(url), 0, 0, W, Hh); ok = true;
    } catch { /* fall through */ } finally { if (url) URL.revokeObjectURL(url); }
  }
  if (!ok) {
    g.fillStyle = '#081822'; g.fillRect(0, 0, W, Hh);
    g.globalAlpha = .25; g.fillStyle = WORLDS[lab.world].color; g.fillRect(0, 0, W, Hh); g.globalAlpha = 1;
    g.fillStyle = '#EEF4F6'; g.font = '500 64px Newsreader, Georgia, serif'; g.textAlign = 'center';
    g.fillText(lab.title, W / 2, Hh / 2 + 20);
  }
  if (!lab.live) {
    g.fillStyle = 'rgba(10,14,17,.8)'; g.fillRect(W - 330, Hh - 94, 300, 64);
    g.fillStyle = '#F2B705'; g.font = '500 28px "Geist Mono", ui-monospace, monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if ('letterSpacing' in g) g.letterSpacing = '3px';
    g.fillText('COMING SOON', W - 180, Hh - 62);
  }
  return c;
}

function labLabel(lab, P) {
  const c = canvas(640, 260), g = c.getContext('2d'), mono = '"Geist Mono", ui-monospace, monospace';
  g.textBaseline = 'alphabetic';
  if ('letterSpacing' in g) g.letterSpacing = '3px';
  g.font = `500 28px ${mono}`; g.fillStyle = WORLDS[lab.world].color; g.fillText(WORLDS[lab.world].label, 30, 58);
  if ('letterSpacing' in g) g.letterSpacing = '0px';
  let size = 58; g.font = `500 ${size}px Newsreader, Georgia, serif`;
  while (g.measureText(lab.title).width > 580 && size > 30) { size -= 2; g.font = `500 ${size}px Newsreader, Georgia, serif`; }
  g.fillStyle = P.ink; g.fillText(lab.title, 30, 132);
  if ('letterSpacing' in g) g.letterSpacing = '3px';
  g.font = `400 28px ${mono}`; g.fillStyle = lab.live ? P.live : P.soon; g.fillText(lab.live ? 'LIVE LAB' : 'COMING SOON', 30, 205);
  return c;
}

/* ---------- scene ---------- */
export function createCorridor(container, { reduced = false, theme = 'dark', onReady, onMode, onFocus, onHover } = {}) {
  const P = PALETTES[theme] || PALETTES.dark;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  } catch (e) { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.NoToneMapping;
  container.appendChild(renderer.domElement);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(P.bg);
  scene.fog = new THREE.Fog(P.bg, 8, 38);
  const camera = new THREE.PerspectiveCamera(56, 1, 0.05, 100);

  const tex = (c, srgb = true) => { const t = new THREE.CanvasTexture(c); if (srgb) t.encoding = THREE.sRGBEncoding; return t; };
  const basic = o => new THREE.MeshBasicMaterial(o);

  // Walls, floor, ceiling
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 160, 1, true),
    basic({ map: tex(vGradient(P.outer)), side: THREE.BackSide }));
  outer.position.y = H / 2; scene.add(outer);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(RIN, RIN, H, 120, 1, true),
    basic({ map: tex(vGradient(P.inner)), side: THREE.FrontSide }));
  inner.position.y = H / 2; scene.add(inner);
  const floorTex = (() => {
    const c = canvas(1024, 1024), g = c.getContext('2d'), gr = g.createRadialGradient(512, 512, 512 * RIN / R, 512, 512, 512);
    gr.addColorStop(0, P.floor[0]); gr.addColorStop(.5, P.floor[1]); gr.addColorStop(1, P.floor[2]);
    g.fillStyle = P.floor[0]; g.fillRect(0, 0, 1024, 1024); g.fillStyle = gr; g.fillRect(0, 0, 1024, 1024); return tex(c);
  })();
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R, 160), basic({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const ceil = new THREE.Mesh(new THREE.CircleGeometry(R, 160), basic({ color: P.ceil, side: THREE.BackSide }));
  ceil.rotation.x = -Math.PI / 2; ceil.position.y = H; scene.add(ceil);

  // Cyan LED strips along the base of both walls, with a soft glow band
  const glowTex = tex(vGradient([[0, P.ledGlow + '0)'], [1, P.ledGlow + (theme === 'light' ? '.3)' : '.22)')]]));
  for (const [rad, side] of [[R - 0.04, THREE.BackSide], [RIN + 0.04, THREE.FrontSide]]) {
    const strip = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, 0.025, 160, 1, true),
      basic({ color: P.led, transparent: true, opacity: .9, side, fog: true }));
    strip.position.y = 0.06; scene.add(strip);
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(rad - (side === THREE.BackSide ? 0.01 : -0.01), rad - (side === THREE.BackSide ? 0.01 : -0.01), 0.5, 160, 1, true),
      basic({ map: glowTex, transparent: true, depthWrite: false, side }));
    glow.position.y = 0.25; scene.add(glow);
  }

  // Shared frame pieces
  // Light wash: an elliptical cone that fades to zero well inside the plane's edges
  const washTex = tex((() => {
    const c = canvas(256, 256), g = c.getContext('2d');
    g.translate(128, 34); g.scale(1, 1.85);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 118);
    gr.addColorStop(0, `rgba(255,228,170,${P.washA[0]})`); gr.addColorStop(.45, `rgba(255,228,170,${P.washA[1]})`); gr.addColorStop(1, 'rgba(255,228,170,0)');
    g.fillStyle = gr; g.fillRect(-128, -40, 256, 256); return c;
  })());
  const shadowTex = tex(radial(256, 128, 128, 128, [[0, `rgba(0,0,0,${P.shadow})`], [.25, `rgba(0,0,0,${P.shadow})`], [1, 'rgba(0,0,0,0)']]));
  const gWash = new THREE.PlaneGeometry(1.9 * PW, 2.2 * PH), gShadow = new THREE.PlaneGeometry(1.2 * PW, 1.25 * PH);
  const gFrame = new THREE.BoxGeometry(PW + 0.08, PH + 0.08, 0.06), gMat = new THREE.BoxGeometry(PW + 0.02, PH + 0.02, 0.062);
  const gPic = new THREE.PlaneGeometry(PW, PH), gLamp = new THREE.BoxGeometry(0.55, 0.035, 0.08), gBulb = new THREE.PlaneGeometry(0.5, 0.012);
  const gLabel = new THREE.PlaneGeometry(1.0, 1.0 * 260 / 640);
  const mShadow = basic({ map: shadowTex, transparent: true, depthWrite: false });
  const mFrame = basic({ color: 0xC9A979 }), mMat = basic({ color: P.mat }), mLamp = basic({ color: P.lamp }), mBulb = basic({ color: 0xFFE4AA });
  const picMats = LABS.map(() => basic({ color: 0x0B151C }));
  const labelMats = LABS.map(() => basic({ transparent: true, depthWrite: false, opacity: 0 }));

  const frames = [], pics = [];
  function addFrame(angle, radius, labIndex, onOuter) {
    const grp = new THREE.Group();
    grp.position.set(radius * Math.cos(angle), 0, radius * Math.sin(angle));
    if (onOuter) grp.lookAt(0, 0, 0); else grp.lookAt(grp.position.x * 2, 0, grp.position.z * 2);
    const wash = new THREE.Mesh(gWash, basic({ map: washTex, transparent: true, depthWrite: false, opacity: .8 }));
    wash.position.set(0, PY + 0.35, 0.005);
    const sh = new THREE.Mesh(gShadow, mShadow); sh.position.set(0.04, PY - 0.07, 0.01);
    const fr = new THREE.Mesh(gFrame, mFrame); fr.position.set(0, PY, 0.045);
    const mt = new THREE.Mesh(gMat, mMat); mt.position.set(0, PY, 0.045);
    const pic = new THREE.Mesh(gPic, picMats[labIndex]); pic.position.set(0, PY, 0.078);
    const lamp = new THREE.Mesh(gLamp, mLamp); lamp.position.set(0, PY + PH / 2 + 0.16, 0.1);
    const bulb = new THREE.Mesh(gBulb, mBulb); bulb.position.set(0, PY + PH / 2 + 0.14, 0.141);
    const label = new THREE.Mesh(gLabel, labelMats[labIndex]); label.position.set(-PW / 2 + 0.5, PY - PH / 2 - 0.4, 0.02);
    wash.renderOrder = 1; sh.renderOrder = 1;
    grp.add(wash, sh, fr, mt, pic, lamp, bulb, label);
    scene.add(grp);
    const f = { angle, onOuter, lab: LABS[labIndex], pic, wash, hover: 0 };
    pic.userData.frame = f; frames.push(f); pics.push(pic);
  }
  for (let s = 0; s < N_OUT; s++) addFrame(s * STEP, R - 0.02, s % LABS.length, true);
  for (let k = 0; k < N_IN; k++) addFrame((k + 0.5) * TAU / N_IN, RIN + 0.02, (k + 7) % LABS.length, false);

  // Load lab pictures + labels
  const ownedTextures = [];
  const picturesReady = Promise.all(LABS.map(async (lab, i) => {
    const c = await labPicture(lab);
    const t = tex(c); t.anisotropy = maxAniso; t.minFilter = THREE.LinearMipmapLinearFilter;
    ownedTextures.push(t); picMats[i].map = t; picMats[i].color.set(0xffffff); picMats[i].needsUpdate = true;
  }));
  const labelsReady = (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    LABS.forEach((lab, i) => {
      const t = tex(labLabel(lab, P)); t.anisotropy = maxAniso; ownedTextures.push(t);
      labelMats[i].map = t; labelMats[i].opacity = 1; labelMats[i].needsUpdate = true;
    });
  });

  /* ---------- camera poses ---------- */
  const mq = matchMedia(SMALL_QUERY);
  let W = 1, Hh = 1, offsetS = 0;
  const portraitSmall = () => mq.matches && Hh > W;
  const D = () => 0.14 + (portraitSmall() ? 0.9 * STEP : 0);
  const walkPose = th => portraitSmall()
    ? { th, r: 15.3, yaw: -0.42, y: 1.85, pitch: -0.08 }
    : { th, r: 15.6, yaw: -0.30, y: 1.85, pitch: -0.10 };
  const focusPose = f => {
    const ps = portraitSmall(), dist = ps ? 5.0 : 4.4, dy = ps ? 0.7 : 0.3;
    return f.onOuter ? { th: f.angle, r: R - dist, yaw: Math.PI / 2, y: PY - dy, pitch: 0 }
      : { th: f.angle, r: RIN + dist, yaw: -Math.PI / 2, y: PY - dy, pitch: 0 };
  };
  const tangent = new THREE.Vector3(), normal = new THREE.Vector3(), look = new THREE.Vector3();
  function applyPose(p) {
    tangent.set(Math.sin(p.th), 0, -Math.cos(p.th)); normal.set(Math.cos(p.th), 0, Math.sin(p.th));
    camera.position.set(p.r * Math.cos(p.th), p.y, p.r * Math.sin(p.th));
    look.copy(tangent).multiplyScalar(Math.cos(p.yaw)).addScaledVector(normal, Math.sin(p.yaw)).add(camera.position);
    look.y += p.pitch; camera.lookAt(look);
  }

  /* ---------- state ---------- */
  let mode = 'walk';            // walk | glide | focus
  let th = D(), target = th;    // walk angle and its target
  let pose = walkPose(th);
  let glide = null, focused = null, lastInput = performance.now();
  let disposed = false, raf = 0, last = performance.now();

  function setMode(m) { if (mode !== m) { mode = m; onMode && onMode(m); } }
  function startGlide(to, dur, eases, done) {
    if (reduced || dur <= 0) { pose = to; glide = null; done && done(); return; }
    glide = { from: { ...pose }, to, t0: performance.now(), dur, eases, done };
  }
  const focusEases = { th: easeQuart, yaw: easeQuad, r: easeCubic, y: easeCubic, pitch: easeCubic };

  function focusFrame(f) {
    const p = focusPose(f);
    p.th = f.angle + TAU * Math.round((pose.th - f.angle) / TAU);
    focused = f; onFocus && onFocus(null); setMode('glide');
    startGlide(p, 950, focusEases, () => { setMode('focus'); emitFocus(); });
  }
  function stepBack() {
    if (mode === 'walk' || (!focused && mode !== 'focus')) return;
    const t = pose.th + D();
    focused = null; onFocus && onFocus(null); setMode('glide');
    startGlide(walkPose(t), 950, focusEases, () => { th = target = t; setMode('walk'); });
  }
  function walk(d) {
    lastInput = performance.now();
    if (mode === 'focus') { stepBack(); return; }
    if (mode !== 'walk') return;
    target = (Math.round((target - D()) / STEP) - d) * STEP + D();
  }
  function emitFocus() {
    if (!focused || !onFocus) return;
    const box = new THREE.Box2(), v = new THREE.Vector3();
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      v.set(x * PW / 2, y * PH / 2, 0); focused.pic.localToWorld(v); v.project(camera);
      box.expandByPoint(new THREE.Vector2((v.x + 1) / 2 * W, (1 - v.y) / 2 * Hh));
    }
    onFocus({ lab: focused.lab, rect: { left: box.min.x, top: box.min.y, right: box.max.x, bottom: box.max.y } });
  }

  /* ---------- sizing ---------- */
  function resize() {
    const r = container.getBoundingClientRect();
    W = Math.max(1, r.width); Hh = Math.max(1, r.height);
    renderer.setSize(W, Hh, false);
    camera.fov = W >= Hh ? 56 : 70;
    if (offsetS > 0 && !mq.matches) { camera.aspect = (W + 2 * offsetS) / Hh; camera.setViewOffset(W + 2 * offsetS, Hh, 2 * offsetS, 0, W, Hh); }
    else { camera.aspect = W / Hh; camera.clearViewOffset(); }
    camera.updateProjectionMatrix();
    if (mode === 'walk') pose = walkPose(th);
    if (mode === 'focus' && focused) { pose = focusPose(focused); pose.th = focused.angle + TAU * Math.round((th - focused.angle) / TAU); applyPose(pose); emitFocus(); }
  }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  /* ---------- input ---------- */
  const el = renderer.domElement;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(cx, cy) {
    const r = el.getBoundingClientRect();
    ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pics, false)[0];
    return hit ? hit.object.userData.frame : null;
  }
  let down = null, hovered = null;
  function onDown(e) {
    if (e.button !== 0) return;
    down = { x: e.clientX, y: e.clientY, th0: target, drag: false, ignore: false, id: e.pointerId };
  }
  function onMove(e) {
    if (down && e.pointerId === down.id) {
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      if (!down.drag && Math.hypot(dx, dy) > 6) {
        if (mq.matches && Math.abs(dy) > Math.abs(dx)) { down = null; return; } // let the page scroll
        down.drag = true; lastInput = performance.now();
        try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        container.classList.add('dragging');
        if (mode !== 'walk') { down.ignore = true; stepBack(); }
      }
      if (down.drag && !down.ignore && mode === 'walk') {
        const k = mq.matches ? 0.0042 : 0.0022;
        target = down.th0 + (mq.matches || Math.abs(dx) > Math.abs(dy) ? dx : dy) * k;
        lastInput = performance.now();
      }
      return;
    }
    if (e.pointerType === 'mouse') {
      const f = pick(e.clientX, e.clientY);
      if (f !== hovered) { hovered = f; container.classList.toggle('over-frame', !!f); onHover && onHover(!!f); }
    }
  }
  function onUp(e) {
    if (!down || e.pointerId !== down.id) return;
    const wasDrag = down.drag; down = null; container.classList.remove('dragging');
    if (wasDrag) return;
    lastInput = performance.now();
    const f = pick(e.clientX, e.clientY);
    if (f && f !== focused) focusFrame(f);
    else if (mode === 'focus') stepBack();
  }
  function onCancel() { down = null; container.classList.remove('dragging'); }
  function onWheel(e) {
    if (mq.matches) return;
    e.preventDefault(); lastInput = performance.now();
    if (mode === 'focus') { stepBack(); return; }
    if (mode !== 'walk') return;
    target += -e.deltaY * (e.deltaMode === 1 ? 33 : 1) * 0.0016;
  }
  function onLeave() { if (hovered) { hovered = null; container.classList.remove('over-frame'); onHover && onHover(false); } }
  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);
  el.addEventListener('pointerleave', onLeave);
  el.addEventListener('wheel', onWheel, { passive: false });
  const onMq = () => resize(); mq.addEventListener('change', onMq);

  /* ---------- loop ---------- */
  function frame(now) {
    raf = 0;
    if (disposed) return;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (glide) {
      const t = Math.min(1, (now - glide.t0) / glide.dur), p = {};
      for (const k of ['th', 'r', 'yaw', 'y', 'pitch']) p[k] = glide.from[k] + (glide.to[k] - glide.from[k]) * glide.eases[k](t);
      pose = p;
      if (t >= 1) { const done = glide.done; glide = null; done && done(); }
    } else if (mode === 'walk') {
      if (!reduced && now - lastInput > 4000) target -= 0.012 * dt;
      th = reduced ? target : th + (target - th) * (1 - Math.exp(-dt / 0.36));
      pose = walkPose(th);
    }
    for (const f of frames) {
      const goal = f === hovered || f === focused ? 1 : 0;
      f.hover += (goal - f.hover) * (reduced ? 1 : 1 - Math.exp(-dt / 0.08));
      f.wash.material.opacity = 0.8 + 0.2 * f.hover;
    }
    applyPose(pose);
    renderer.render(scene, camera);
    if (!document.hidden) raf = requestAnimationFrame(frame);
  }
  const onVis = () => { if (!document.hidden && !raf && !disposed) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  document.addEventListener('visibilitychange', onVis);

  // Intro: a gentle step into the corridor
  let started = false;
  function start() {
    if (started || disposed) return; started = true;
    const to = walkPose(th), from = { ...to, th: to.th + 0.16, r: to.r - 0.35 };
    pose = from; setMode('glide');
    const ex = { th: easeExpo, r: easeExpo, yaw: easeExpo, y: easeExpo, pitch: easeExpo };
    startGlide(to, 1400, ex, () => { lastInput = performance.now(); setMode('walk'); });
  }
  applyPose(pose); renderer.render(scene, camera);
  raf = requestAnimationFrame(frame);
  Promise.all([picturesReady, labelsReady]).catch(() => {}).then(() => { if (!disposed) onReady && onReady(); });

  return {
    start, walk, stepBack,
    get mode() { return mode; },
    setOffset(s) { offsetS = Math.max(0, s); resize(); },
    exit() {
      return new Promise(res => {
        focused = null; onFocus && onFocus(null); setMode('glide');
        const to = { th: pose.th - 0.25, r: 15.1, yaw: 0, y: pose.y, pitch: 0 };
        startGlide(to, 500, { th: easeInOut, r: easeInOut, yaw: easeInOut, y: easeInOut, pitch: easeInOut }, res);
      });
    },
    dispose() {
      disposed = true; if (raf) cancelAnimationFrame(raf);
      ro.disconnect(); mq.removeEventListener('change', onMq); document.removeEventListener('visibilitychange', onVis);
      el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp); el.removeEventListener('pointercancel', onCancel);
      el.removeEventListener('pointerleave', onLeave); el.removeEventListener('wheel', onWheel);
      const seen = new Set();
      scene.traverse(o => {
        if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
        if (o.material && !seen.has(o.material)) { seen.add(o.material); if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
      });
      ownedTextures.forEach(t => t.dispose());
      renderer.dispose(); renderer.forceContextLoss(); el.remove();
    }
  };
}
