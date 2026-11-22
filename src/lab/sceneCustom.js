// A 3D bench built from any netlist: each part is placed where the schematic layout puts it.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { C, selectPart, toggleSwitch, rowOf } from './customStore.js';
import { layout, parseVal, bands, si } from './netlist.js';

const U = 0.0115;      // schematic units to 3D units
const WY = 1.085;      // wire height above the floor

export function createCustomScene(host) {
  const T = THREE;
  const renderer = new T.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.outputEncoding = T.sRGBEncoding;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  const el = renderer.domElement; el.setAttribute('role', 'img'); el.setAttribute('aria-label', '3D bench with the circuit from your picture. Click a part to read its voltage and current. Click a switch to open or close it.');
  host.insertBefore(el, host.firstChild);
  const scene = new T.Scene(); scene.background = new T.Color(0xC7D3D9); scene.fog = new T.Fog(0xC7D3D9, 18, 40);
  const camera = new T.PerspectiveCamera(45, 1, 0.1, 80);
  const controls = new OrbitControls(camera, el);
  Object.assign(controls, { enablePan: false, enableDamping: true, dampingFactor: 0.1, minDistance: 2.6, maxDistance: 16, minPolarAngle: 0.3, maxPolarAngle: 1.42 });
  scene.add(new T.HemisphereLight(0xffffff, 0x7f919b, 0.78));
  const sun = new T.DirectionalLight(0xffffff, 0.72); sun.position.set(5, 11, 8); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 7, bottom: -7, near: 1, far: 30 }); sun.shadow.bias = -0.0006; scene.add(sun);

  const M = (color, o) => new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.72, metalness: 0.04 }, o));
  const mat = { top: M(0x22343D, { roughness: 0.5 }), steel: M(0xAAB6BC, { metalness: 0.5, roughness: 0.4 }), metal: M(0xD9DEE1, { metalness: 0.7, roughness: 0.3 }), board: M(0xF0F3F4),
    yellow: M(0xF2B705, { roughness: 0.5 }), dark: M(0x13232B, { roughness: 0.6 }), red: M(0xD9342B, { roughness: 0.5 }), black: M(0x1B2B33, { roughness: 0.5 }), body: M(0xDDBF92),
    wall: M(0xE1E8EB, { roughness: 0.95 }), cap: M(0x24479A, { roughness: 0.4 }), stripe: M(0xC9D3D8), face: M(0x2B424C), grey: M(0x8FA6B0),
    eye: new T.MeshBasicMaterial({ color: 0xFFD34D }), white: new T.MeshBasicMaterial({ color: 0xE8F0F2 }), lamp: new T.MeshBasicMaterial({ color: 0xffffff }), tan: M(0xD9A441, { roughness: 0.5 }) };
  const add = (geo, m, x, y, z, parent, shadow) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); if (shadow !== false) { o.castShadow = true; o.receiveShadow = true; } (parent || scene).add(o); return o; };
  const box = (w, h, d, m, x, y, z, p, s) => add(new T.BoxGeometry(w, h, d), m, x, y, z, p, s);
  const cyl = (rt, rb, h, m, x, y, z, p, s) => add(new T.CylinderGeometry(rt, rb, h, 22), m, x, y, z, p, s);
  const ball = (r, m, x, y, z, p, s) => add(new T.SphereGeometry(r, 20, 14), m, x, y, z, p, s);
  const UP = new T.Vector3(0, 1, 0), V3 = (x, y, z) => new T.Vector3(x, y, z);
  const seg = (a, b, r, m, p) => { const d = b.clone().sub(a), len = d.length(); const o = add(new T.CylinderGeometry(r, r, len, 10), m, 0, 0, 0, p); o.position.copy(a).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(UP, d.normalize()); return o; };
  const clear = grp => { while (grp.children.length) { const o = grp.children[0]; grp.remove(o); o.traverse(n => { if (n.geometry) n.geometry.dispose(); if (n.material && n.userData.own) n.material.dispose(); }); } };
  function radial(rgb) { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 2, 64, 64, 62);
    gr.addColorStop(0, `rgba(${rgb},0.95)`); gr.addColorStop(0.35, `rgba(${rgb},0.45)`); gr.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new T.CanvasTexture(c); }
  const texRed = radial('255,60,40'), texYel = radial('255,205,70');

  const labels = [];
  function label(parent, x, y, z, s, dark) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding;
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); sp.position.set(x, y, z); sp.scale.set(1.2 * s, 0.3 * s, 1); sp.renderOrder = 5; parent.add(sp);
    let cur = null;
    const o = { sprite: sp, s, set(t, color) { const k = t + '|' + color; if (k === cur) return; cur = k; const g = c.getContext('2d'); g.clearRect(0, 0, 512, 128); if (!t) { tex.needsUpdate = true; return; }
      g.font = '600 62px "IBM Plex Sans", system-ui, sans-serif'; const w = Math.min(504, g.measureText(t).width + 60), x0 = (512 - w) / 2, r = 26;
      g.beginPath(); g.moveTo(x0 + r, 12); g.arcTo(x0 + w, 12, x0 + w, 116, r); g.arcTo(x0 + w, 116, x0, 116, r); g.arcTo(x0, 116, x0, 12, r); g.arcTo(x0, 12, x0 + w, 12, r); g.closePath();
      g.fillStyle = dark ? 'rgba(15,38,48,0.94)' : 'rgba(255,255,255,0.95)'; g.fill(); g.lineWidth = 3; g.strokeStyle = dark ? 'rgba(255,255,255,0.25)' : 'rgba(15,38,48,0.25)'; g.stroke();
      g.fillStyle = color || (dark ? '#FFFFFF' : '#0F2630'); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, 256, 68, 480); tex.needsUpdate = true; } };
    labels.push(o); return o;
  }

  // room: floor and walls sized for one bench
  (function room() {
    const fc = document.createElement('canvas'); fc.width = fc.height = 128; const g = fc.getContext('2d'); g.fillStyle = '#B4C0C6'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#A3B0B7'; g.lineWidth = 3; g.strokeRect(0, 0, 128, 128);
    const ft = new T.CanvasTexture(fc); ft.wrapS = ft.wrapT = T.RepeatWrapping; ft.repeat.set(36, 24); ft.encoding = T.sRGBEncoding;
    const floor = add(new T.PlaneGeometry(36, 24), new T.MeshStandardMaterial({ map: ft, roughness: 0.9 }), 0, 0, 4); floor.rotation.x = -Math.PI / 2; floor.castShadow = false;
    add(new T.PlaneGeometry(36, 7), mat.wall, 0, 3.5, -3.6).castShadow = false;
    box(36, 0.16, 0.05, M(0x4A606B), 0, 0.08, -3.57); box(36, 0.1, 0.04, mat.yellow, 0, 1.2, -3.58);
  })();

  // robot instructor
  const bot = new T.Group(); scene.add(bot); bot.rotation.y = -0.5;
  cyl(0.2, 0.12, 0.38, mat.yellow, 0, -0.44, 0, bot); cyl(0.06, 0.06, 0.1, mat.steel, 0, -0.21, 0, bot);
  box(0.62, 0.46, 0.44, mat.dark, 0, 0.06, 0, bot); box(0.5, 0.2, 0.02, mat.face, 0, 0.11, 0.225, bot, false);
  ball(0.055, mat.eye, -0.13, 0.11, 0.24, bot, false); ball(0.055, mat.eye, 0.13, 0.11, 0.24, bot, false);
  box(0.18, 0.03, 0.02, mat.white, 0, -0.08, 0.225, bot, false);
  [-0.33, 0.33].forEach(x => { cyl(0.07, 0.07, 0.05, mat.yellow, x, 0.06, 0, bot).rotation.z = Math.PI / 2; ball(0.07, mat.yellow, x * 0.85, -0.4, 0, bot); });
  const jet = new T.Sprite(new T.SpriteMaterial({ map: texYel, transparent: true, depthWrite: false, opacity: 0.8 })); jet.position.set(0, -0.72, 0); jet.scale.set(0.55, 0.3, 1); bot.add(jet);
  label(bot, 0, 0.72, 0, 0.5, true).set('Nour');

  /* ---------- the circuit ---------- */
  const world = new T.Group(); scene.add(world);
  let built = -1, items = [], clickables = [], screen = null, dims = { w: 5.2, d: 2.6 }, wallMesh = null;

  function partModel(c, g) {
    // local frame: x runs from the first node (-x) to the second node (+x); y = 0 is the board surface; leads end at x = +-0.345
    const lead = (x, tx, ty) => seg(V3(x, 0.035, 0), V3(tx, ty, 0), 0.016, mat.metal, g);
    const out = {};
    switch (c.type) {
      case 'resistor': {
        const o = parseVal(c.value), rz = m => { m.rotation.z = Math.PI / 2; return m; };
        rz(cyl(0.085, 0.085, 0.36, mat.body, 0, 0.13, 0, g)); ball(0.085, mat.body, -0.18, 0.13, 0, g).scale.x = 0.6; ball(0.085, mat.body, 0.18, 0.13, 0, g).scale.x = 0.6;
        const b = bands(o); if (b) b.concat(['#C9A227']).forEach((col, i) => { const m = M(new T.Color(col).getHex(), { roughness: 0.5 }); const r = rz(cyl(0.089, 0.089, 0.04, m, i < 3 ? -0.12 + i * 0.07 : 0.12, 0.13, 0, g)); r.userData.own = true; });
        lead(-0.345, -0.21, 0.13); lead(0.345, 0.21, 0.13); break; }
      case 'battery': {
        box(0.46, 0.34, 0.52, mat.dark, 0, 0.19, 0, g); box(0.47, 0.08, 0.53, mat.yellow, 0, 0.24, 0, g);
        cyl(0.05, 0.05, 0.07, mat.metal, -0.16, 0.39, 0, g); cyl(0.07, 0.07, 0.05, mat.metal, 0.16, 0.38, 0, g);
        lead(-0.345, -0.16, 0.38); lead(0.345, 0.16, 0.37); label(g, -0.24, 0.62, 0, 0.3).set('+'); label(g, 0.24, 0.62, 0, 0.3).set('−'); break; }
      case 'led': case 'diode': {
        if (c.type === 'led') {
          const m = new T.MeshStandardMaterial({ color: 0xE5322B, roughness: 0.25, transparent: true, opacity: 0.92, emissive: 0xff2a1a, emissiveIntensity: 0 });
          const own = q => { q.userData.own = true; return q; };
          own(cyl(0.11, 0.11, 0.16, m, 0, 0.24, 0, g)); own(ball(0.11, m, 0, 0.32, 0, g)); own(cyl(0.135, 0.135, 0.03, m, 0, 0.16, 0, g));
          box(0.03, 0.16, 0.2, mat.dark, 0.115, 0.24, 0, g);
          lead(-0.345, -0.05, 0.15); lead(0.345, 0.05, 0.15);
          const glow = new T.Sprite(new T.SpriteMaterial({ map: texRed, transparent: true, depthWrite: false, opacity: 0 })); glow.position.set(0, 0.36, 0); glow.scale.set(0.01, 0.01, 1); g.add(glow);
          const light = new T.PointLight(0xff3a22, 0, 3.2, 2); light.position.set(0, 0.6, 0); g.add(light);
          out.led = { m, glow, light, cur: 0 };
        } else { cyl(0.07, 0.07, 0.3, mat.black, 0, 0.12, 0, g).rotation.z = Math.PI / 2; cyl(0.074, 0.074, 0.04, mat.metal, 0.1, 0.12, 0, g).rotation.z = Math.PI / 2; lead(-0.345, -0.15, 0.12); lead(0.345, 0.15, 0.12); }
        break; }
      case 'capacitor': {
        if (c.polarized) { cyl(0.13, 0.13, 0.34, mat.cap, 0, 0.21, 0, g); cyl(0.115, 0.115, 0.02, mat.metal, 0, 0.39, 0, g); box(0.03, 0.3, 0.1, mat.stripe, 0.13, 0.21, 0, g); label(g, -0.2, 0.56, 0, 0.3).set('+'); }
        else cyl(0.16, 0.16, 0.05, mat.tan, 0, 0.19, 0, g).rotation.z = Math.PI / 2;
        lead(-0.345, -0.05, 0.1); lead(0.345, 0.05, 0.1); break; }
      case 'inductor': { [-0.12, 0, 0.12].forEach(x => { const t = add(new T.TorusGeometry(0.1, 0.03, 8, 18), mat.tan, x, 0.14, 0, g); t.rotation.y = Math.PI / 2; }); lead(-0.345, -0.18, 0.14); lead(0.345, 0.18, 0.14); break; }
      case 'switch': {
        box(0.52, 0.04, 0.26, mat.dark, 0, 0.02, 0, g); cyl(0.04, 0.04, 0.12, mat.metal, -0.22, 0.08, 0, g); cyl(0.04, 0.04, 0.12, mat.metal, 0.22, 0.08, 0, g);
        const arm = new T.Group(); arm.position.set(-0.22, 0.15, 0); g.add(arm); box(0.46, 0.035, 0.07, mat.metal, 0.23, 0, 0, arm); ball(0.055, mat.yellow, 0.46, 0.02, 0, arm);
        lead(-0.345, -0.22, 0.08); lead(0.345, 0.22, 0.08); out.arm = arm; break; }
      case 'ammeter': case 'voltmeter': {
        box(0.46, 0.2, 0.4, mat.yellow, 0, 0.12, 0, g); box(0.34, 0.02, 0.26, mat.dark, 0, 0.225, 0, g); lead(-0.345, -0.23, 0.12); lead(0.345, 0.23, 0.12);
        out.read = label(g, 0, 0.52, 0, 0.62, true); break; }
      case 'lamp': {
        cyl(0.12, 0.14, 0.1, mat.steel, 0, 0.09, 0, g);
        const m = new T.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, roughness: 0.2, emissive: 0xFFD34D, emissiveIntensity: 0 }); const q = ball(0.17, m, 0, 0.3, 0, g); q.userData.own = true;
        lead(-0.345, -0.1, 0.1); lead(0.345, 0.1, 0.1); out.lamp = { m }; break; }
      case 'current_source': {
        box(0.42, 0.22, 0.4, mat.dark, 0, 0.13, 0, g); const cone = add(new T.ConeGeometry(0.1, 0.22, 16), mat.yellow, 0.02, 0.3, 0, g); cone.rotation.z = -Math.PI / 2; seg(V3(-0.16, 0.3, 0), V3(-0.06, 0.3, 0), 0.025, mat.yellow, g);
        lead(-0.345, -0.21, 0.12); lead(0.345, 0.21, 0.12); break; }
      case 'wire': break;
      default: box(0.42, 0.2, 0.3, mat.grey, 0, 0.12, 0, g); lead(-0.345, -0.21, 0.12); lead(0.345, 0.21, 0.12);
    }
    return out;
  }

  function build() {
    clear(world); items = []; clickables = []; screen = null;
    const nl = C.nl; if (!nl) return;
    const L = layout(nl), cx = L.W / 2, cy = L.H / 2, P = (x, y) => V3((x - cx) * U, WY, (y - cy) * U);
    const bw = Math.max(5.2, L.W * U + 1.4), bd = Math.max(2.6, L.H * U + 1.2); dims = { w: bw, d: bd };
    // bench
    box(bw, 0.12, bd, mat.top, 0, 0.94, 0, world); box(bw, 0.05, 0.06, mat.yellow, 0, 0.975, bd / 2, world);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(s => box(0.12, 0.88, 0.12, mat.steel, s[0] * (bw / 2 - 0.1), 0.44, s[1] * (bd / 2 - 0.1), world));
    box(bw - 0.3, 0.05, bd - 0.3, mat.board, 0, 1.025, 0, world);
    // wall screen
    const wz = -bd / 2 - 0.9, sw = Math.min(5.2, Math.max(3.6, bw * 0.6)), sh = sw * 0.5;
    box(sw + 0.16, sh + 0.16, 0.08, mat.dark, 0, 3.3, wz, world);
    const sc = document.createElement('canvas'); sc.width = 1024; sc.height = 512; const tex = new T.CanvasTexture(sc); tex.encoding = T.sRGBEncoding;
    add(new T.PlaneGeometry(sw, sh), new T.MeshBasicMaterial({ map: tex }), 0, 3.3, wz + 0.045, world, false);
    screen = { g: sc.getContext('2d'), tex, key: null };
    // rail wire (ground) in black, everything else red
    if (L.rail) { const y = L.rail.y; seg(P(L.rail.x0, y), P(L.rail.x1, y), 0.03, mat.black, world); }
    L.items.forEach(it => {
      it.wires.forEach(w => { for (let i = 0; i < w.length - 1; i++) { const a = P(w[i][0], w[i][1]), b = P(w[i + 1][0], w[i + 1][1]); if (a.distanceTo(b) > 0.01) seg(a, b, 0.03, mat.red, world); } });
      const c = it.c, g = new T.Group(); g.position.set((it.mx - cx) * U, 1.05, (it.my - cy) * U); g.rotation.y = -it.ang * Math.PI / 180; world.add(g);
      const out = partModel(c, g);
      const hit = new T.Mesh(new T.BoxGeometry(0.8, 0.7, 0.55), new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })); hit.position.set(0, 0.3, 0); hit.userData = { id: c.id }; g.add(hit); clickables.push(hit);
      const top = label(world, g.position.x, 1.78, g.position.z, 0.55); top.set(c.id + (c.value ? '  ' + c.value : (c.type === 'switch' ? '' : '')));
      const low = label(world, g.position.x, 1.5, g.position.z, 0.42, true);
      const pad = box(0.9, 0.012, 0.6, new T.MeshBasicMaterial({ color: 0xF2B705, transparent: true, opacity: 0.6 }), 0, 0.004, 0, g, false); pad.visible = false;
      const pts = it.pts.map(p => P(p[0], p[1])), plen = [0]; for (let i = 1; i < pts.length; i++) plen.push(plen[i - 1] + pts[i].distanceTo(pts[i - 1]));
      const dots = []; for (let i = 0; i < 7; i++) { const d = ball(0.045, new T.MeshBasicMaterial({ color: 0xFFC21A }), 0, 0, 0, world, false); d.visible = false; dots.push(d); }
      items.push({ it, c, g, out, top, low, pad, pts, plen, dots, flow: 0 });
    });
    // nets: little posts at each junction dot
    L.dots.forEach(d => ball(0.04, mat.metal, P(d[0], d[1]).x, WY, P(d[0], d[1]).z, world));
    bot.position.set(bw / 2 + 0.2, 2.6, -bd / 2 - 0.2);
    built = C.built; frameCamera(true);
  }

  function frameCamera(reset) {
    const dist = Math.max(6.5, dims.w * 1.05 + dims.d * 0.5);
    if (reset) { controls.target.set(0, 1.5, -0.3); camera.position.set(0, 1.5 + dist * 0.62, dist * 0.8); camera.lookAt(controls.target); controls.update(); }
  }

  const wrap = (g, text, x, y, maxW, lh, maxLines) => { let line = '', n = 0; const words = String(text).split(' ');
    for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); y += lh; line = w; if (++n >= maxLines) { return y; } } else line = t; }
    g.fillText(line, x, y); return y; };

  function drawScreen() {
    if (!screen) return; const g = screen.g, nl = C.nl, sel = C.selected ? rowOf(C.selected) : null;
    const key = [nl.title, nl.answer, C.selected, C.rev].join('|'); if (key === screen.key) return; screen.key = key;
    g.fillStyle = '#0B161B'; g.fillRect(0, 0, 1024, 512); g.fillStyle = '#F2B705'; g.fillRect(0, 0, 1024, 12); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.font = '600 28px "IBM Plex Mono", monospace'; g.fillText('FREE BENCH · FROM YOUR PICTURE', 44, 64);
    g.fillStyle = '#FFFFFF'; g.font = '700 66px "Barlow Condensed", "Arial Narrow", sans-serif'; g.fillText(nl.title.slice(0, 34), 44, 136);
    g.fillStyle = '#B9C9D0'; g.font = '400 30px "IBM Plex Sans", system-ui, sans-serif'; wrap(g, nl.summary || '', 44, 186, 940, 38, 3);
    if (sel) { g.fillStyle = '#F2B705'; g.font = '500 46px "IBM Plex Mono", monospace'; g.fillText(sel.c.id + (sel.c.value ? '  ' + sel.c.value : ''), 44, 346);
      g.fillStyle = '#FFFFFF'; g.font = '500 54px "IBM Plex Mono", monospace'; g.fillText(si(sel.vd, 'V') + '   ' + si(sel.I, 'A'), 44, 418); g.fillStyle = '#8FA6B0'; g.font = '400 30px "IBM Plex Mono", monospace'; g.fillText((sel.role === 'supplies' ? 'supplies ' : 'dissipates ') + si(sel.P, 'W'), 44, 462); }
    else if (nl.answer) { g.fillStyle = '#4CC38A'; g.font = '500 34px "IBM Plex Mono", monospace'; g.fillText('ANSWER', 44, 350); g.fillStyle = '#FFFFFF'; g.font = '500 40px "IBM Plex Sans", system-ui, sans-serif'; wrap(g, nl.answer, 44, 404, 940, 48, 2); }
    else { g.fillStyle = '#5D7480'; g.font = '400 32px "IBM Plex Sans", system-ui, sans-serif'; g.fillText('Click a part to read its voltage and current.', 44, 400); }
    screen.tex.needsUpdate = true;
  }

  function sync() {
    if (built !== C.built) build(); if (!C.nl) return;
    items.forEach(s => {
      const r = rowOf(s.c.id), live = r && r.I != null && Math.abs(r.I) > 1e-7;
      s.pad.visible = C.selected === s.c.id;
      if (s.out.arm) s.out.arm.userData.target = /clos|on/i.test(s.c.state || '') ? 0 : 0.62;
      if (s.c.type === 'switch') s.top.set(s.c.id + '  ' + (/clos|on/i.test(s.c.state || '') ? 'closed' : 'open'));
      s.low.set(r && r.I != null && s.c.type !== 'wire' ? si(r.vd, 'V') + ' · ' + si(r.I, 'A') : '', undefined);
      if (s.out.read) s.out.read.set(s.c.type === 'ammeter' ? (r ? si(r.I, 'A') : '–') : (r ? si(r.vd, 'V') : '–'), '#F2B705');
      if (s.out.led) s.out.led.want = r && !r.off && r.I > 0.0005 ? Math.min(1, r.I / 0.02) : 0;
      if (s.out.lamp) s.out.lamp.want = r && r.P > 0 ? Math.min(1, r.P / 0.5 + 0.2) : 0;
      // conventional current direction along the polyline (first node to second node)
      s.flow = !live ? 0 : r.Iab > 0 ? 1 : -1;
    });
    drawScreen();
  }

  /* ---------- picking ---------- */
  const ray = new T.Raycaster(), ndc = new T.Vector2();
  let down = null;
  el.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
  el.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) { down = null; return; } down = null;
    const r = el.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(clickables)[0]; if (!h) return;
    const id = h.object.userData.id, c = C.nl.components.find(x => x.id === id);
    if (c && c.type === 'switch') toggleSwitch(id); selectPart(id);
  });
  el.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse' || e.buttons) return; const r = el.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); el.style.cursor = ray.intersectObjects(clickables).length ? 'pointer' : 'grab'; });

  function resize() {
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false);
    const dx = w > 820 ? Math.min(420, w * 0.3) : 0;   // room taken by the side panel: shift the view to the right
    if (dx) { camera.aspect = (w + dx) / h; camera.setViewOffset(w + dx, h, 0, 0, w, h); } else { camera.aspect = w / h; camera.clearViewOffset(); }
    camera.updateProjectionMatrix();
  }
  const ro = window.ResizeObserver ? new ResizeObserver(resize) : null; if (ro) ro.observe(host); else window.addEventListener('resize', resize);

  let last = performance.now(), dead = false, raf = 0;
  function frame(now) {
    if (dead) return; raf = requestAnimationFrame(frame);
    if (document.hidden || !host.clientWidth) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    controls.update();
    items.forEach(s => {
      if (s.out.arm) { const t = s.out.arm.userData.target || 0; s.out.arm.rotation.z += (t - s.out.arm.rotation.z) * Math.min(1, dt * 14); }
      s.pad.material.opacity = 0.5 + 0.2 * Math.sin(now / 240);
      const L = s.plen[s.plen.length - 1], off = (now / 1000 * 0.9) % L;
      s.dots.forEach((d, i) => { d.visible = s.flow !== 0 && L > 0.1; if (!d.visible) return; let p = (off + i / s.dots.length * L) % L; if (s.flow < 0) p = L - p; let j = 1; while (s.plen[j] < p && j < s.plen.length - 1) j++;
        d.position.lerpVectors(s.pts[j - 1], s.pts[j], (p - s.plen[j - 1]) / (s.plen[j] - s.plen[j - 1] || 1)); });
      const q = s.out.led; if (q) { q.cur += ((q.want || 0) - q.cur) * Math.min(1, dt * 9); q.m.emissiveIntensity = q.cur * 0.75; q.glow.material.opacity = Math.min(1, q.cur * 0.95); const gs = 0.25 + q.cur * 0.75; q.glow.scale.set(gs, gs, 1); q.light.intensity = q.cur * 2.2; }
      const lp = s.out.lamp; if (lp) { lp.cur = (lp.cur || 0) + ((lp.want || 0) - (lp.cur || 0)) * Math.min(1, dt * 9); lp.m.emissiveIntensity = lp.cur * 1.2; }
    });
    bot.position.y = 2.6 + Math.sin(now / 620) * 0.05; jet.material.opacity = 0.6 + 0.2 * Math.sin(now / 130);
    renderer.render(scene, camera);
  }
  resize(); sync(); raf = requestAnimationFrame(frame);
  return { sync, resetView() { frameCamera(true); }, destroy() { dead = true; cancelAnimationFrame(raf); if (ro) ro.disconnect(); else window.removeEventListener('resize', resize); controls.dispose(); renderer.dispose(); renderer.forceContextLoss(); el.remove(); } };
}
