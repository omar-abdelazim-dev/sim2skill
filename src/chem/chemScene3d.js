// 3D chemistry room (three.js r128), the chemistry counterpart of src/lab/scene3d.js.
// The scene only draws and reports clicks: the React bench owns all state and the server owns the chemistry.
//
//   const room = createChemLab3D(host, { kind: 'titration' | 'kinetics', config, onAction });
//   room.update(state);      // see drawTitration / drawKinetics for the fields
//   room.setMode('orbit' | 'walk');
//   room.destroy();
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const T = THREE;
const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const REACTION_COLORS = { crystal_violet: '#7B2FBF', iodide_peroxide: '#C99A1E', ethyl_acetate_saponification: '#E0559A', sucrose_inversion_zero: '#6FB7D8' };

export function hasWebGL() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); } catch { return false; }
}

export function createChemLab3D(host, { kind, config, onAction, indicators = {} }) {
  const renderer = new T.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  const el = renderer.domElement;
  el.className = 'chem-canvas';
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', kind === 'titration'
    ? '3D titration bench: burette on a stand over a conical flask, indicator bottles, a wash bottle and a pH meter. The buttons beside the room do the same things.'
    : '3D kinetics bench: thermostatted water baths, a spectrophotometer and the reagent flask. The buttons beside the room do the same things.');
  host.appendChild(el);
  const tip = document.createElement('div'); tip.className = 'chem-tip'; tip.hidden = true; host.appendChild(tip);

  const scene = new T.Scene();
  scene.background = new T.Color(0xF3F1EC); scene.fog = new T.Fog(0xF3F1EC, 9, 20);
  const camera = new T.PerspectiveCamera(42, 1, 0.05, 60);
  const controls = new OrbitControls(camera, el);
  Object.assign(controls, { enablePan: false, enableDamping: true, dampingFactor: 0.1, minDistance: 0.9, maxDistance: 5.2, minPolarAngle: 0.3, maxPolarAngle: 1.45, minAzimuthAngle: -1.25, maxAzimuthAngle: 1.25 });
  const HOME = { pos: new T.Vector3(0.35, 2.05, 2.15), target: new T.Vector3(-0.05, 1.32, -0.25) };
  camera.position.copy(HOME.pos); controls.target.copy(HOME.target); controls.update();

  scene.add(new T.HemisphereLight(0xffffff, 0xC9C3B6, 0.85));
  const sun = new T.DirectionalLight(0xFFF6E5, 0.75); sun.position.set(-4, 7, 5); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -2, near: 1, far: 20 }); sun.shadow.bias = -0.0005; scene.add(sun);
  const fill = new T.PointLight(0xFFFFFF, 0.35, 8); fill.position.set(1.5, 2.6, 1.5); scene.add(fill);

  // ---------- helpers ----------
  const M = (color, o) => new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.6, metalness: 0.03 }, o));
  const mat = {
    floor: null, wall: M(0xF6F3ED, { roughness: 0.95 }), trim: M(0xE0B43A, { roughness: 0.5 }), cab: M(0xFFFFFF, { roughness: 0.7 }), cabDark: M(0xDCD7CC),
    top: M(0x2E3A40, { roughness: 0.35 }), steel: M(0xB9C2C7, { metalness: 0.6, roughness: 0.35 }), chrome: M(0xE3E7EA, { metalness: 0.85, roughness: 0.2 }),
    black: M(0x22282C, { roughness: 0.5 }), white: M(0xFAFAFA, { roughness: 0.4 }), tile: M(0xFFFFFF, { roughness: 0.25 }),
    glass: new T.MeshStandardMaterial({ color: 0xE6F4FB, transparent: true, opacity: 0.26, roughness: 0.05, metalness: 0.1, depthWrite: false, side: T.DoubleSide }),
    titrant: new T.MeshStandardMaterial({ color: 0xBFE0F5, transparent: true, opacity: 0.6, roughness: 0.1 }),
    amber: M(0x8A4B12, { roughness: 0.25, transparent: true, opacity: 0.92 }), red: M(0xD9342B), yellow: M(0xF2B705), blue: M(0x2E6FD1),
    paper: M(0xFFFDF6, { roughness: 0.9 }), water: new T.MeshStandardMaterial({ color: 0x7CC4E8, transparent: true, opacity: 0.55, roughness: 0.1 }),
    window: new T.MeshBasicMaterial({ color: 0xFFFBEA }), lamp: new T.MeshBasicMaterial({ color: 0xFFFFFF })
  };
  const shared = new Set(Object.values(mat));
  const add = (geo, m, x, y, z, parent = scene, shadow = true) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); if (shadow) { o.castShadow = true; o.receiveShadow = true; } parent.add(o); return o; };
  const box = (w, h, d, m, x, y, z, p, s) => add(new T.BoxGeometry(w, h, d), m, x, y, z, p, s);
  const cyl = (rt, rb, h, m, x, y, z, p, s, seg = 24) => add(new T.CylinderGeometry(rt, rb, h, seg), m, x, y, z, p, s);
  const UP = new T.Vector3(0, 1, 0);
  const rod = (a, b, r, m, p = scene) => { const d = b.clone().sub(a), len = d.length(); const o = add(new T.CylinderGeometry(r, r, len, 10), m, 0, 0, 0, p); o.position.copy(a).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(UP, d.normalize()); return o; };
  const lathe = (pts, m, x, y, z, p, s) => add(new T.LatheGeometry(pts.map(([r, h]) => new T.Vector2(r, h)), 40), m, x, y, z, p, s);

  // Camera-facing text labels drawn on a canvas.
  const labels = [];
  function label(parent, x, y, z, s = 1, dark = false) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding;
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
    sp.position.set(x, y, z); sp.scale.set(0.56 * s, 0.14 * s, 1); sp.renderOrder = 10; parent.add(sp);
    let cur = null;
    const o = {
      sprite: sp, set(text, color) {
        const key = text + '|' + color; if (key === cur) return; cur = key;
        const g = c.getContext('2d'); g.clearRect(0, 0, 512, 128);
        if (text) {
          g.font = '600 56px "Geist", "IBM Plex Sans", system-ui, sans-serif';
          const w = Math.min(500, g.measureText(text).width + 56), x0 = (512 - w) / 2, r = 30;
          g.beginPath(); g.moveTo(x0 + r, 14); g.arcTo(x0 + w, 14, x0 + w, 114, r); g.arcTo(x0 + w, 114, x0, 114, r); g.arcTo(x0, 114, x0, 14, r); g.arcTo(x0, 14, x0 + w, 14, r); g.closePath();
          g.fillStyle = dark ? 'rgba(20,28,32,.92)' : 'rgba(255,255,255,.96)'; g.fill();
          g.lineWidth = 3; g.strokeStyle = dark ? 'rgba(255,255,255,.2)' : 'rgba(30,40,45,.18)'; g.stroke();
          g.fillStyle = color || (dark ? '#FFFFFF' : '#1E2A30'); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 66, 470);
        }
        tex.needsUpdate = true;
      }
    };
    labels.push(o); return o;
  }

  // Invisible hit boxes carry the action; `tip` is the hover text.
  const clickables = [];
  function hit(parent, size, pos, data) {
    const o = new T.Mesh(new T.BoxGeometry(...size), new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    o.position.set(...pos); o.userData = data; parent.add(o); clickables.push(o); return o;
  }

  // ---------- the room ----------
  (function room() {
    const fc = document.createElement('canvas'); fc.width = fc.height = 128; const g = fc.getContext('2d');
    g.fillStyle = '#E4E1DA'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#D2CEC5'; g.lineWidth = 2; g.strokeRect(0, 0, 128, 128);
    const ft = new T.CanvasTexture(fc); ft.wrapS = ft.wrapT = T.RepeatWrapping; ft.repeat.set(16, 16); ft.encoding = T.sRGBEncoding;
    mat.floor = new T.MeshStandardMaterial({ map: ft, roughness: 0.85 }); shared.add(mat.floor);
    const floor = add(new T.PlaneGeometry(12, 12), mat.floor, 0, 0, 3, scene, false); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    add(new T.PlaneGeometry(12, 5), mat.wall, 0, 2.5, -1.6, scene, false).receiveShadow = true;
    const wl = add(new T.PlaneGeometry(12, 5), mat.wall, -5, 2.5, 3, scene, false); wl.rotation.y = Math.PI / 2;
    const wr = add(new T.PlaneGeometry(12, 5), mat.wall, 5, 2.5, 3, scene, false); wr.rotation.y = -Math.PI / 2;
    box(10, 0.12, 0.04, mat.cabDark, 0, 0.06, -1.58, scene, false); box(10, 0.05, 0.03, mat.trim, 0, 1.35, -1.585, scene, false);
    // windows on the left wall
    [0.6, 2.6].forEach(z => { const w = add(new T.PlaneGeometry(1.5, 1.3), mat.window, -4.98, 2.1, z, scene, false); w.rotation.y = Math.PI / 2; box(0.04, 1.4, 0.06, mat.cab, -4.97, 2.1, z, scene, false); box(0.04, 0.06, 1.6, mat.cab, -4.97, 2.1, z, scene, false); });
    // ceiling lights
    [-1.5, 1.5].forEach(x => box(1.6, 0.04, 0.3, mat.lamp, x, 3.6, 0.4, scene, false));
    // wall shelves with reagent bottles
    const bottleColors = [0x8A4B12, 0xFFFFFF, 0x2E6FD1, 0x8A4B12, 0x1B7F53, 0xFFFFFF, 0xD9342B];
    [-3.3, 1.45].forEach((x, k) => [1.75, 2.3].forEach((y, r) => {
      box(1.6, 0.04, 0.3, mat.cab, x, y, -1.44); box(0.03, 0.18, 0.28, mat.steel, x - 0.78, y - 0.1, -1.44); box(0.03, 0.18, 0.28, mat.steel, x + 0.78, y - 0.1, -1.44);
      for (let i = 0; i < 6; i++) { const h = 0.16 + ((i * 5 + r + k) % 3) * 0.04, c = bottleColors[(i + r * 2 + k) % 7]; cyl(0.05, 0.055, h, M(c, { roughness: 0.3 }), x - 0.6 + i * 0.24, y + 0.02 + h / 2, -1.44); cyl(0.025, 0.025, 0.04, mat.black, x - 0.6 + i * 0.24, y + 0.04 + h, -1.44); }
    }));
    // fume hood at the back right
    const hx = 3.4; box(1.8, 2.3, 0.9, mat.cab, hx, 1.15, -1.1); box(1.6, 0.9, 0.05, mat.glass, hx, 1.55, -0.64, scene, false); box(1.7, 0.08, 0.06, mat.trim, hx, 1.05, -0.63); box(1.5, 0.12, 0.7, mat.top, hx, 0.95, -1.05);
    // sink unit at the back left
    const sx = -3.3; box(1.6, 0.9, 0.7, mat.cab, sx, 0.45, -1.22); box(1.64, 0.05, 0.74, mat.top, sx, 0.925, -1.22); box(0.6, 0.02, 0.4, mat.steel, sx, 0.955, -1.2);
    rod(new T.Vector3(sx, 0.95, -1.5), new T.Vector3(sx, 1.35, -1.5), 0.02, mat.chrome); rod(new T.Vector3(sx, 1.35, -1.5), new T.Vector3(sx, 1.35, -1.28), 0.02, mat.chrome);
    // the student's bench
    box(4.6, 0.08, 1.7, mat.top, 0, 0.92, -0.05); box(4.6, 0.02, 0.04, mat.trim, 0, 0.95, 0.81);
    box(4.4, 0.84, 1.5, mat.cab, 0, 0.44, -0.05); [-1.47, 0, 1.47].forEach(x => { box(1.4, 0.005, 0.01, mat.cabDark, x, 0.62, 0.705); box(0.3, 0.025, 0.02, mat.steel, x, 0.75, 0.715); });
    // stool
    cyl(0.2, 0.2, 0.06, mat.black, -0.9, 0.68, 1.35); cyl(0.03, 0.03, 0.62, mat.steel, -0.9, 0.34, 1.35); cyl(0.2, 0.24, 0.03, mat.steel, -0.9, 0.015, 1.35);
  })();

  // ---------- wall screen ----------
  const screenCanvas = document.createElement('canvas'); screenCanvas.width = 1024; screenCanvas.height = 512;
  const screenTex = new T.CanvasTexture(screenCanvas); screenTex.encoding = T.sRGBEncoding;
  // Hangs left of the rig so the burette never hides it.
  box(2.1, 1.1, 0.06, mat.black, -1.3, 2.2, -1.56, scene, false);
  add(new T.PlaneGeometry(2.0, 1.0), new T.MeshBasicMaterial({ map: screenTex }), -1.3, 2.2, -1.525, scene, false);

  function plot(g, x, y, w, h, series, opt) {
    g.save();
    g.fillStyle = '#122028'; g.fillRect(x, y, w, h);
    const all = series.flatMap(s => s.points);
    let [x0, x1, y0, y1] = opt.range || (all.length ? [Math.min(...all.map(p => p[0])), Math.max(...all.map(p => p[0])), Math.min(...all.map(p => p[1])), Math.max(...all.map(p => p[1]))] : [0, 1, 0, 1]);
    if (x1 === x0) x1 = x0 + 1; if (y1 === y0) { y1 += Math.abs(y1) * 0.1 || 1; y0 -= Math.abs(y0) * 0.1 || 1; }
    const L = 70, B = 44, sx = v => x + L + (v - x0) / (x1 - x0) * (w - L - 18), sy = v => y + h - B - (v - y0) / (y1 - y0) * (h - B - 16);
    g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 1; g.fillStyle = '#9FB4BF'; g.font = '20px "Geist Mono", ui-monospace, monospace'; g.textAlign = 'right';
    const short = v => (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(1) : String(+v.toPrecision(3)));
    for (let i = 0; i <= 4; i++) { const v = y0 + (y1 - y0) * i / 4; g.beginPath(); g.moveTo(sx(x0), sy(v)); g.lineTo(sx(x1), sy(v)); g.stroke(); g.fillText(short(v), x + L - 8, sy(v) + 7); }
    g.textAlign = 'center'; for (let i = 0; i <= 4; i++) { const v = x0 + (x1 - x0) * i / 4; g.fillText(short(v), sx(v), y + h - B + 26); }
    g.fillStyle = '#D8E4E9'; g.font = '22px "Geist", system-ui, sans-serif'; g.fillText(opt.xLabel, x + w / 2 + L / 2, y + h - 4);
    if (opt.marker != null) { g.strokeStyle = '#F2B705'; g.setLineDash([8, 8]); g.lineWidth = 2; g.beginPath(); g.moveTo(sx(opt.marker), y + 10); g.lineTo(sx(opt.marker), y + h - B); g.stroke(); g.setLineDash([]); }
    for (const s of series) {
      g.strokeStyle = s.color; g.fillStyle = s.color; g.lineWidth = 4;
      if (s.points.length > 1) { g.beginPath(); s.points.forEach((p, i) => (i ? g.lineTo(sx(p[0]), sy(p[1])) : g.moveTo(sx(p[0]), sy(p[1])))); g.stroke(); }
      for (const p of s.points.length < 40 ? s.points : []) { g.beginPath(); g.arc(sx(p[0]), sy(p[1]), 5, 0, Math.PI * 2); g.fill(); }
    }
    if (!all.length) { g.fillStyle = '#7F98A3'; g.font = '26px "Geist", system-ui, sans-serif'; g.fillText(opt.empty || 'No data yet', x + w / 2, y + h / 2); }
    g.restore();
  }
  function screenFrame(title) {
    const g = screenCanvas.getContext('2d');
    g.fillStyle = '#0B161C'; g.fillRect(0, 0, 1024, 512);
    g.fillStyle = '#F2B705'; g.fillRect(0, 0, 1024, 6);
    g.fillStyle = '#9FB4BF'; g.font = '600 22px "Geist Mono", ui-monospace, monospace'; g.textAlign = 'left'; g.fillText(title, 32, 46);
    return g;
  }

  // ---------- hover, click, walk ----------
  const ray = new T.Raycaster(), ndc = new T.Vector2();
  let hovered = null, down = null, mode = 'orbit', holdTimer = null;
  const keys = {};
  let yaw = 0, pitch = -0.18;
  function pick(e) {
    const r = el.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(clickables, false)[0];
    return h && h.distance < (mode === 'walk' ? 4 : 12) ? h.object : null;
  }
  const tipText = o => (typeof o.userData.tip === 'function' ? o.userData.tip() : o.userData.tip);
  function setHover(o, e) {
    hovered = o; el.style.cursor = o ? 'pointer' : mode === 'walk' ? 'grab' : '';
    if (!o) { tip.hidden = true; return; }
    const r = host.getBoundingClientRect(); tip.textContent = tipText(o); tip.hidden = !tip.textContent;
    tip.style.left = Math.min(r.width - 220, e.clientX - r.left + 14) + 'px'; tip.style.top = (e.clientY - r.top + 16) + 'px';
  }
  const stopHold = () => { clearInterval(holdTimer); holdTimer = null; };
  function onDown(e) {
    down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, target: pick(e) };
    if (mode === 'walk') try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    // Holding the stopcock streams titrant; a short click is one drop.
    if (down.target?.userData.hold) { onAction(down.target.userData.action); holdTimer = setInterval(() => onAction(down?.target?.userData.hold), 300); }
  }
  function onMove(e) {
    if (down) {
      const dx = e.clientX - down.lx, dy = e.clientY - down.ly; down.lx = e.clientX; down.ly = e.clientY;
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { down.moved = true; stopHold(); }
      if (mode === 'walk' && down.moved) { yaw -= dx * 0.005; pitch = Math.max(-1.1, Math.min(0.8, pitch - dy * 0.004)); }
      return;
    }
    setHover(pick(e), e);
  }
  function onUp(e) {
    const d = down; down = null; stopHold();
    if (!d || d.moved) return;
    const o = pick(e);
    if (o && o === d.target && !o.userData.hold) onAction(o.userData.action); // hold targets already fired on pointerdown
    if (o) setHover(o, e);
  }
  const onLeave = () => { stopHold(); down = null; setHover(null); };
  const onKey = v => e => { if (e.target?.closest?.('input, textarea, select, [contenteditable]')) return; keys[e.code] = v; if (v && mode === 'walk' && /^(Arrow|Space)/.test(e.code)) e.preventDefault(); };
  const kd = onKey(true), ku = onKey(false);
  el.addEventListener('pointerdown', onDown); el.addEventListener('pointermove', onMove); el.addEventListener('pointerup', onUp); el.addEventListener('pointerleave', onLeave);
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);

  function setMode(m) {
    mode = m === 'walk' ? 'walk' : 'orbit';
    controls.enabled = mode === 'orbit';
    if (mode === 'walk') { camera.position.set(0, 1.62, 1.75); yaw = 0; pitch = -0.32; camera.fov = 62; }
    else { camera.position.copy(HOME.pos); controls.target.copy(HOME.target); camera.fov = 42; controls.update(); }
    camera.updateProjectionMatrix(); el.style.cursor = mode === 'walk' ? 'grab' : '';
  }

  // ---------- experiment rigs ----------
  const anims = [];
  const animate = (dur, step, done) => { if (REDUCED) { step(1); done?.(); return; } anims.push({ t0: performance.now(), dur, step, done }); };
  const rig = kind === 'titration' ? buildTitration() : buildKinetics();

  function buildTitration() {
    const c = config, Z = -0.15, Y = 0.96; // bench surface
    const st = { volume: 0, color: null, liquid: null, flask: null, level: 1 };
    // stand and clamp
    box(0.46, 0.025, 0.32, mat.black, -0.12, Y + 0.012, Z - 0.05); rod(new T.Vector3(-0.3, Y, Z - 0.12), new T.Vector3(-0.3, Y + 1.55, Z - 0.12), 0.013, mat.steel);
    rod(new T.Vector3(-0.3, Y + 1.12, Z - 0.12), new T.Vector3(-0.02, Y + 1.12, Z - 0.01), 0.01, mat.steel); box(0.07, 0.05, 0.07, mat.black, 0, Y + 1.12, Z);
    rod(new T.Vector3(-0.3, Y + 0.6, Z - 0.12), new T.Vector3(-0.02, Y + 0.6, Z - 0.01), 0.01, mat.steel); box(0.07, 0.04, 0.07, mat.black, 0, Y + 0.6, Z);
    // burette: glass tube, titrant column, scale, stopcock, tip
    const bBottom = Y + 0.36, bTop = Y + 1.42, bLen = bTop - bBottom;
    cyl(0.03, 0.03, bLen, mat.glass, 0, bBottom + bLen / 2, Z, scene, false);
    const colGeo = new T.CylinderGeometry(0.024, 0.024, bLen - 0.04, 20); colGeo.translate(0, (bLen - 0.04) / 2, 0);
    st.column = add(colGeo, mat.titrant, 0, bBottom + 0.02, Z, scene, false);
    for (let i = 0; i <= 10; i++) box(i % 5 ? 0.012 : 0.022, 0.0025, 0.002, mat.black, 0.03, bTop - 0.03 - i * (bLen - 0.06) / 10, Z + 0.012, scene, false);
    st.scaleLabel = label(scene, 0.2, bTop - 0.03, Z, 0.55); st.scaleLabel.set('0 mL');
    cyl(0.014, 0.014, 0.06, mat.glass, 0, bBottom - 0.03, Z, scene, false);
    st.cock = new T.Group(); st.cock.position.set(0, bBottom - 0.045, Z); scene.add(st.cock);
    const barrel = cyl(0.018, 0.018, 0.07, mat.white, 0, 0, 0, st.cock); barrel.rotation.z = Math.PI / 2;
    st.handle = box(0.012, 0.075, 0.016, mat.blue, 0.042, 0, 0, st.cock);
    cyl(0.004, 0.009, 0.08, mat.glass, 0, bBottom - 0.12, Z, scene, false);
    hit(scene, [0.2, 0.12, 0.14], [0, bBottom - 0.05, Z], { action: { type: 'add', dv: 0.05 }, hold: { type: 'add', dv: 0.1 }, tip: () => st.tipCock });
    hit(scene, [0.12, bLen, 0.12], [0, bBottom + bLen / 2, Z], { action: { type: 'focus' }, tip: () => `Burette: ${(c.burette - st.volume).toFixed(2)} mL of titrant left` });
    // white tile, conical flask and its liquid
    box(0.36, 0.012, 0.36, mat.tile, 0, Y + 0.006, Z);
    const fy = Y + 0.012;
    const profile = [[0, 0], [0.12, 0], [0.128, 0.008], [0.124, 0.03], [0.05, 0.17], [0.032, 0.195], [0.032, 0.27], [0.038, 0.28]];
    lathe(profile, mat.glass, 0, fy, Z, scene, false);
    st.liquidMat = new T.MeshStandardMaterial({ color: 0xEAF4FA, transparent: true, opacity: 0.45, roughness: 0.12 });
    st.flask = new T.Group(); st.flask.position.set(0, fy, Z); scene.add(st.flask);
    const rAt = h => (h <= 0.03 ? 0.118 : 0.118 - (0.118 - 0.046) * (h - 0.03) / 0.14);
    st.setLiquid = h => {
      if (st.liquid) { st.flask.remove(st.liquid); st.liquid.geometry.dispose(); }
      const pts = [[0, 0.004], [0.112, 0.004], [0.117, 0.012]]; for (let k = 1; k <= 6; k++) { const y = 0.012 + (h - 0.012) * k / 6; pts.push([rAt(y) - 0.006, y]); } pts.push([0, h]);
      st.liquid = add(new T.LatheGeometry(pts.map(([r, y]) => new T.Vector2(r, y)), 40), st.liquidMat, 0, 0, 0, st.flask, false); st.liquid.renderOrder = -1;
    };
    st.setLiquid(0.055);
    hit(scene, [0.3, 0.3, 0.3], [0, fy + 0.14, Z], { action: { type: 'swirl' }, tip: () => st.tipFlask });
    // falling drop
    st.drop = add(new T.SphereGeometry(0.008, 12, 10), mat.titrant, 0, 0, Z, scene, false); st.drop.visible = false;
    // pH meter with a probe in the flask
    const mx = 0.62; box(0.26, 0.09, 0.2, mat.white, mx, Y + 0.045, Z + 0.05); box(0.18, 0.004, 0.08, mat.black, mx, Y + 0.092, Z + 0.03);
    st.meter = label(scene, mx, Y + 0.25, Z + 0.05, 0.75, true);
    rod(new T.Vector3(mx - 0.13, Y + 0.06, Z + 0.05), new T.Vector3(0.18, Y + 0.32, Z + 0.02), 0.004, mat.black); rod(new T.Vector3(0.18, Y + 0.32, Z + 0.02), new T.Vector3(0.022, Y + 0.32, Z + 0.02), 0.004, mat.black);
    rod(new T.Vector3(0.022, Y + 0.32, Z + 0.02), new T.Vector3(0.022, Y + 0.05, Z + 0.02), 0.006, mat.glass);
    hit(scene, [0.3, 0.2, 0.25], [mx, Y + 0.08, Z + 0.05], { action: { type: 'focus' }, tip: () => 'pH meter' });
    // wash bottle (rinse) and titrant bottle (fill without rinsing)
    const wx = -0.85; cyl(0.055, 0.06, 0.2, M(0xFFFFFF, { roughness: 0.3, transparent: true, opacity: 0.92 }), wx, Y + 0.1, Z + 0.15); cyl(0.03, 0.03, 0.03, mat.red, wx, Y + 0.215, Z + 0.15);
    rod(new T.Vector3(wx, Y + 0.23, Z + 0.15), new T.Vector3(wx + 0.09, Y + 0.3, Z + 0.15), 0.004, mat.white);
    st.washLabel = label(scene, wx, Y + 0.42, Z + 0.15, 0.7);
    hit(scene, [0.18, 0.34, 0.18], [wx, Y + 0.16, Z + 0.15], { action: { type: 'rinse' }, tip: () => st.tipRinse });
    const tx = -1.2; cyl(0.07, 0.075, 0.22, M(0x2E6FD1, { roughness: 0.25, transparent: true, opacity: 0.85 }), tx, Y + 0.11, Z + 0.05); cyl(0.035, 0.035, 0.04, mat.black, tx, Y + 0.24, Z + 0.05);
    box(0.1, 0.07, 0.002, mat.paper, tx, Y + 0.12, Z + 0.126, scene, false);
    st.fillLabel = label(scene, tx, Y + 0.44, Z + 0.05, 0.7);
    hit(scene, [0.2, 0.34, 0.2], [tx, Y + 0.16, Z + 0.05], { action: { type: 'fill' }, tip: () => st.tipFill });
    // indicator dropper bottles
    st.bottles = {};
    c.indicators.forEach((id, i) => {
      const bx = 0.9 + (i % 3) * 0.27, bz = Z - 0.2 + Math.floor(i / 3) * 0.28, g = new T.Group(); g.position.set(bx, Y, bz); scene.add(g);
      cyl(0.04, 0.042, 0.11, mat.amber, 0, 0.055, 0, g); cyl(0.02, 0.03, 0.025, mat.black, 0, 0.122, 0, g); cyl(0.012, 0.012, 0.05, mat.black, 0, 0.158, 0, g);
      const sticker = cyl(0.0425, 0.0425, 0.035, M(new T.Color(indicators[id]?.acidColor || '#ffffff').getHex()), 0, 0.06, 0, g); sticker.castShadow = false;
      const ring = add(new T.TorusGeometry(0.06, 0.006, 8, 32), mat.yellow, 0, 0.004, 0, g, false); ring.rotation.x = Math.PI / 2; ring.visible = false;
      const lb = label(scene, bx, Y + 0.27 + (i % 2) * 0.07, bz, 0.5); // staggered so neighbours never overlap
      hit(scene, [0.12, 0.22, 0.12], [bx, Y + 0.1, bz], { action: { type: 'indicator', id }, tip: () => st.tipIndicator(id) });
      st.bottles[id] = { g, ring, lb };
    });
    // lab notebook: record the endpoint
    const nb = box(0.3, 0.015, 0.22, mat.paper, 0.45, Y + 0.008, Z + 0.45); nb.rotation.y = -0.2; box(0.3, 0.004, 0.012, mat.blue, 0.45, Y + 0.017, Z + 0.36).rotation.y = -0.2;
    st.noteLabel = label(scene, 0.45, Y + 0.2, Z + 0.45, 0.7);
    hit(scene, [0.34, 0.12, 0.28], [0.45, Y + 0.05, Z + 0.45], { action: { type: 'record' }, tip: () => st.tipNote });

    function update(s) {
      const level = Math.max(0, 1 - s.volume / c.burette);
      st.column.scale.y = Math.max(0.0001, level); st.column.visible = s.rinsed !== null && level > 0.001;
      st.scaleLabel.set(`${s.volume.toFixed(2)} mL`);
      if (s.volume > st.volume) {
        const from = new T.Vector3(0, bBottom - 0.16, Z), to = fy + 0.06;
        st.drop.material = mat.titrant; st.drop.visible = true;
        animate(260, t => { st.drop.position.set(0, from.y + (to - from.y) * t * t, Z); }, () => { st.drop.visible = false; });
        animate(500, t => { st.handle.rotation.z = Math.sin(t * Math.PI) * 1.2; st.flask.rotation.y = Math.sin(t * Math.PI * 2) * 0.18; });
      }
      if (s.volume !== st.volume || st.liquidH === undefined) { st.liquidH = 0.05 + 0.06 * Math.min(1, s.volume / c.burette); st.setLiquid(st.liquidH); }
      st.volume = s.volume;
      if (s.liquid) { st.liquidMat.color.set(s.liquid); st.liquidMat.opacity = 0.8; } else { st.liquidMat.color.set(0xEAF4FA); st.liquidMat.opacity = 0.45; }
      st.meter.set(s.pH === null ? 'pH  --.--' : `pH  ${s.pH.toFixed(2)}`, '#7CF0B0');
      const started = s.volume > 0;
      st.washLabel.set(s.rinsed === true ? '✓ Rinsed and filled' : `Rinse with ${s.titrantName}`, s.rinsed === true ? '#1B7F53' : null);
      st.fillLabel.set(s.rinsed === false ? '✓ Filled (no rinse)' : `Fill: ${s.titrantConc} M ${s.titrantFormula}`, s.rinsed === false ? '#B5651D' : null);
      st.noteLabel.set(s.endpoint === null ? 'Record endpoint' : `Endpoint ${s.endpoint.toFixed(2)} mL`, s.endpoint === null ? null : '#1B7F53');
      for (const [id, b] of Object.entries(st.bottles)) { const on = s.indicator === id; b.ring.visible = on; b.g.position.y = Y + (on ? 0.02 : 0); b.lb.set(s.indicatorNames[id], on ? '#B07A00' : null); }
      st.tipCock = !s.ready ? 'Stopcock: prepare the burette and choose an indicator first' : 'Stopcock: click for one drop, hold to stream';
      st.tipFlask = started ? 'Swirl the flask' : `Flask: ${c.analyteVolume} mL aliquot`;
      st.tipRinse = started ? 'Locked once titration starts' : 'Rinse the burette with titrant, then fill it';
      st.tipFill = started ? 'Locked once titration starts' : 'Fill the burette without rinsing';
      st.tipNote = started ? `Record the endpoint at ${s.volume.toFixed(2)} mL` : 'Lab notebook: add titrant first';
      st.tipIndicator = id => (started ? 'Locked once titration starts' : `Add ${s.indicatorNames[id]} to the flask`);
      const g = screenFrame('TITRATION  ·  LIVE pH CURVE');
      g.fillStyle = '#FFFFFF'; g.font = '600 64px "Geist Mono", ui-monospace, monospace'; g.fillText(s.pH === null ? '--' : s.pH.toFixed(2), 32, 150);
      g.fillStyle = '#9FB4BF'; g.font = '22px "Geist", system-ui, sans-serif'; g.fillText('pH', 32, 184);
      g.fillStyle = '#FFD34D'; g.font = '600 48px "Geist Mono", ui-monospace, monospace'; g.fillText(s.volume.toFixed(2), 32, 270);
      g.fillStyle = '#9FB4BF'; g.font = '22px "Geist", system-ui, sans-serif'; g.fillText('mL added', 32, 302);
      g.fillText(s.indicator ? s.indicatorNames[s.indicator] : 'No indicator yet', 32, 370);
      g.fillText(s.endpoint === null ? 'Endpoint not recorded' : `Endpoint ${s.endpoint.toFixed(2)} mL`, 32, 404);
      if (s.liquid) { g.fillStyle = s.liquid; g.beginPath(); g.arc(48, 450, 16, 0, Math.PI * 2); g.fill(); g.fillStyle = '#9FB4BF'; g.fillText('flask colour', 76, 458); }
      plot(g, 300, 70, 700, 420, [{ color: '#8FD3FF', points: s.points.map(p => [p.v, p.pH]) }], { range: [0, Math.max(5, Math.ceil(Math.max(0, ...s.points.map(p => p.v)) / 5) * 5), 0, 14], xLabel: `${s.titrantName} added (mL)`, marker: s.endpoint, empty: 'Add titrant to draw the curve' });
      screenTex.needsUpdate = true;
    }
    return { update };
  }

  function buildKinetics() {
    const c = config, Y = 0.96, Z = -0.15, color = new T.Color(REACTION_COLORS[c.reaction] || '#7B2FBF'), clear = new T.Color(0xEEF6FA);
    const st = { baths: {}, seen: new Map() };
    // Baths in a row left of centre, 0.5 m apart.
    const n = c.temperatures.length, left = -0.55 - (n - 1) * 0.25;
    c.temperatures.forEach((T0, i) => {
      const g = new T.Group(); g.position.set(left + i * 0.5, Y, Z); scene.add(g);
      box(0.4, 0.2, 0.3, mat.white, 0, 0.1, 0, g); box(0.34, 0.004, 0.24, mat.water, 0, 0.19, 0, g, false); box(0.4, 0.05, 0.006, mat.black, 0, 0.06, 0.152, g, false);
      const disp = label(g, 0, 0.065, 0.16, 0.62, true); disp.set(`${T0} °C`, '#7CF0B0');
      // a test tube of reagent standing in the bath
      cyl(0.022, 0.022, 0.22, mat.glass, 0, 0.25, 0, g, false);
      const liqMat = new T.MeshStandardMaterial({ color: color.clone(), transparent: true, opacity: 0.85, roughness: 0.15 });
      const liq = cyl(0.018, 0.018, 0.14, liqMat, 0, 0.22, 0, g, false);
      const ring = add(new T.TorusGeometry(0.2, 0.008, 8, 40), mat.yellow, 0, 0.003, 0, g, false); ring.rotation.x = Math.PI / 2; ring.scale.set(1, 0.78, 1); ring.visible = false;
      const lb = label(g, 0, 0.5, 0, 0.62);
      hit(g, [0.42, 0.45, 0.34], [0, 0.2, 0], { action: { type: 'run', T: T0 }, tip: () => st.tipBath(T0) });
      st.baths[T0] = { g, liq, liqMat, ring, lb };
    });
    // spectrophotometer
    const sx = 1.15; box(0.5, 0.2, 0.38, mat.cabDark, sx, Y + 0.1, Z); box(0.2, 0.06, 0.004, mat.black, sx - 0.08, Y + 0.14, Z + 0.192, scene, false); box(0.06, 0.03, 0.06, mat.black, sx + 0.14, Y + 0.215, Z - 0.05);
    st.spec = label(scene, sx, Y + 0.38, Z, 0.8, true); st.spec.set('Spectrophotometer', '#9FB4BF');
    hit(scene, [0.52, 0.3, 0.4], [sx, Y + 0.12, Z], { action: { type: 'focus' }, tip: () => 'Spectrophotometer: reads concentration while a run plays' });
    // stock flask of reagent
    const fx = 1.75; lathe([[0, 0], [0.09, 0], [0.095, 0.01], [0.04, 0.14], [0.025, 0.16], [0.025, 0.22], [0.03, 0.23]], mat.glass, fx, Y, Z + 0.05, scene, false);
    lathe([[0, 0.004], [0.085, 0.004], [0.06, 0.07], [0, 0.07]], new T.MeshStandardMaterial({ color, transparent: true, opacity: 0.85 }), fx, Y, Z + 0.05, scene, false);
    st.stock = label(scene, fx, Y + 0.36, Z + 0.05, 0.62);

    function update(s) {
      st.stock.set(s.reactionShort);
      for (const T0 of c.temperatures) {
        const b = st.baths[T0], run = s.runs[T0], on = s.busy === T0;
        b.ring.visible = !!run || on;
        b.lb.set(on ? 'Running…' : run ? '✓ Run recorded' : 'Click to run', run ? '#1B7F53' : on ? '#B07A00' : null);
        if (run && st.seen.get(T0) !== run) {
          st.seen.set(T0, run);
          const c0 = run.conc[0] || 1, frames = run.conc.length;
          animate(2600, t => {
            const k = Math.min(frames - 1, Math.floor(t * (frames - 1))), f = Math.max(0, run.conc[k] / c0);
            b.liqMat.color.copy(clear).lerp(color, f); b.liqMat.opacity = 0.35 + 0.5 * f;
            st.spec.set(`${T0} °C · t ${Math.round(run.times[k])} s · ${(f * 100).toFixed(0)}% left`, '#7CF0B0');
          }, () => st.spec.set(`${T0} °C run complete`, '#7CF0B0'));
        } else if (!run) { b.liqMat.color.copy(color); b.liqMat.opacity = 0.85; }
      }
      st.tipBath = T0 => (s.runs[T0] ? `Run again at ${T0} °C` : `Run the reaction at ${T0} °C`);
      const g = screenFrame(`KINETICS  ·  ${s.yName.toUpperCase()} AGAINST TIME`);
      plot(g, 24, 64, 976, 430, s.series.map(x => ({ color: x.color, points: x.points })), { xLabel: 'time (s)', empty: 'Click a water bath to run the reaction' });
      g.font = '600 22px "Geist Mono", ui-monospace, monospace'; g.textAlign = 'right';
      s.series.forEach((x, i) => { g.fillStyle = x.color; g.fillText(x.name, 990, 100 + i * 30); });
      screenTex.needsUpdate = true;
    }
    return { update };
  }

  // ---------- loop ----------
  let raf = 0, last = performance.now();
  const fwd = new T.Vector3(), right = new T.Vector3();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!host.clientWidth || document.hidden) return;
    for (let i = anims.length - 1; i >= 0; i--) { const a = anims[i], t = Math.min(1, (now - a.t0) / a.dur); a.step(t); if (t >= 1) { anims.splice(i, 1); a.done?.(); } }
    if (mode === 'walk') {
      const sp = (keys.ShiftLeft || keys.ShiftRight ? 2.6 : 1.5) * dt;
      fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw)); right.set(-fwd.z, 0, fwd.x);
      if (keys.KeyW || keys.ArrowUp) camera.position.addScaledVector(fwd, sp);
      if (keys.KeyS || keys.ArrowDown) camera.position.addScaledVector(fwd, -sp);
      if (keys.KeyD || keys.ArrowRight) camera.position.addScaledVector(right, sp);
      if (keys.KeyA || keys.ArrowLeft) camera.position.addScaledVector(right, -sp);
      camera.position.x = Math.max(-4.6, Math.min(4.6, camera.position.x)); camera.position.z = Math.max(0.95, Math.min(5, camera.position.z));
      if (Math.abs(camera.position.x) > 2.4) camera.position.z = Math.max(-0.4, camera.position.z);
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
    } else controls.update();
    renderer.render(scene, camera);
  }
  function resize() { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  const ro = new ResizeObserver(resize); ro.observe(host); resize();
  raf = requestAnimationFrame(frame);

  return {
    update: s => rig.update(s),
    setMode,
    reset() { setMode(mode); },
    destroy() {
      cancelAnimationFrame(raf); ro.disconnect(); stopHold();
      el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp); el.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku);
      controls.dispose();
      scene.traverse(o => { o.geometry?.dispose(); for (const m of Array.isArray(o.material) ? o.material : [o.material]) { if (!m) continue; m.map?.dispose(); if (!shared.has(m)) m.dispose(); } });
      shared.forEach(m => { if (!m) return; m.map?.dispose(); m.dispose(); }); screenTex.dispose();
      renderer.dispose(); el.remove(); tip.remove();
    }
  };
}
