import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import CORE from './core.js';
import { S, rt, ACT, shown, scopeP, reduced } from './store.js';
import { bands, plotScope } from './draw.js';
const {PARTS, EXPERIMENTS, partLabel, fmtI, fmtV, fmtT} = CORE;

export function createLab3D(host){
  const T = THREE;
  const renderer = new T.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.outputEncoding = T.sRGBEncoding;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  const el = renderer.domElement; el.setAttribute('role', 'img'); el.setAttribute('aria-label', 'Dedicated 3D room for this experiment. Use the slot buttons and the Close switch button below to operate the bench.');
  host.insertBefore(el, host.firstChild);
  const scene = new T.Scene(); scene.background = new T.Color(0xC7D3D9); scene.fog = new T.Fog(0xC7D3D9, 16, 36);
  const camera = new T.PerspectiveCamera(45, 1, 0.1, 80);
  const controls = new OrbitControls(camera, el);
  Object.assign(controls, {enablePan:false, enableDamping:true, dampingFactor:0.1, minDistance:2.6, maxDistance:13, minPolarAngle:0.3, maxPolarAngle:1.42, minAzimuthAngle:-1.15, maxAzimuthAngle:1.15});

  scene.add(new T.HemisphereLight(0xffffff, 0x7f919b, 0.78));
  const sun = new T.DirectionalLight(0xffffff, 0.72); sun.position.set(5, 11, 8); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, {left:-13, right:13, top:8, bottom:-8, near:1, far:30}); sun.shadow.bias = -0.0006; scene.add(sun);

  const M = (color, o) => new T.MeshStandardMaterial(Object.assign({color, roughness:0.72, metalness:0.04}, o));
  const mat = { top:M(0x22343D, {roughness:0.5}), steel:M(0xAAB6BC, {metalness:0.5, roughness:0.4}), metal:M(0xD9DEE1, {metalness:0.7, roughness:0.3}), board:M(0xF0F3F4),
    yellow:M(0xF2B705, {roughness:0.5}), dark:M(0x13232B, {roughness:0.6}), red:M(0xD9342B, {roughness:0.5}), black:M(0x1B2B33, {roughness:0.5}), body:M(0xDDBF92),
    wall:M(0xE1E8EB, {roughness:0.95}), trim:M(0x4A606B), cab:M(0xF7F9FA), cap:M(0x24479A, {roughness:0.4}), stripe:M(0xC9D3D8),
    lamp:new T.MeshBasicMaterial({color:0xffffff}), ghost:new T.MeshStandardMaterial({color:0xffffff, transparent:true, opacity:0.45, roughness:1}),
    face:M(0x2B424C), eye:new T.MeshBasicMaterial({color:0xFFD34D}), white:new T.MeshBasicMaterial({color:0xE8F0F2}) };
  const add = (geo, m, x, y, z, parent, shadow) => { const o = new T.Mesh(geo, m); o.position.set(x, y, z); if (shadow !== false) { o.castShadow = true; o.receiveShadow = true; } (parent || scene).add(o); return o; };
  const box = (w, h, d, m, x, y, z, p, s) => add(new T.BoxGeometry(w, h, d), m, x, y, z, p, s);
  const cyl = (rt, rb, h, m, x, y, z, p, s) => add(new T.CylinderGeometry(rt, rb, h, 22), m, x, y, z, p, s);
  const ball = (r, m, x, y, z, p, s) => add(new T.SphereGeometry(r, 20, 14), m, x, y, z, p, s);
  const UP = new T.Vector3(0, 1, 0), V3 = (x, y, z) => new T.Vector3(x, y, z);
  const seg = (a, b, r, m, p) => { const d = b.clone().sub(a), len = d.length(); const o = add(new T.CylinderGeometry(r, r, len, 10), m, 0, 0, 0, p); o.position.copy(a).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(UP, d.normalize()); return o; };
  const sharedMaterials=new Set(Object.values(mat));
  const clear = grp => { while (grp.children.length) { const o = grp.children[0]; grp.remove(o); o.traverse(n => { if (n.geometry) n.geometry.dispose(); for(const m of Array.isArray(n.material)?n.material:[n.material])if(m&&!sharedMaterials.has(m))m.dispose(); }); } };
  function radial(rgb){ const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 2, 64, 64, 62);
    gr.addColorStop(0, `rgba(${rgb},0.95)`); gr.addColorStop(0.35, `rgba(${rgb},0.45)`); gr.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return new T.CanvasTexture(c); }
  const texRed = radial('255,60,40'), texYel = radial('255,205,70'), texSmoke = radial('70,78,84');

  // text labels that always face the camera
  const labels = [];
  function label(parent, x, y, z, s, dark){
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding;
    const sp = new T.Sprite(new T.SpriteMaterial({map:tex, transparent:true, depthWrite:false})); sp.position.set(x, y, z); sp.scale.set(1.2 * s, 0.3 * s, 1); sp.renderOrder = 5; parent.add(sp);
    let cur = null;
    const o = { sprite:sp, s, reset(){ cur = null; }, set(t, color){ o.text = t; o.color = color; const k = t + '|' + color; if (k === cur) return; cur = k; const g = c.getContext('2d'); g.clearRect(0, 0, 512, 128); if (!t) { tex.needsUpdate = true; return; }
      g.font = '600 62px "IBM Plex Sans", system-ui, sans-serif'; const w = Math.min(504, g.measureText(t).width + 60), x0 = (512 - w) / 2, r = 26;
      g.beginPath(); g.moveTo(x0 + r, 12); g.arcTo(x0 + w, 12, x0 + w, 116, r); g.arcTo(x0 + w, 116, x0, 116, r); g.arcTo(x0, 116, x0, 12, r); g.arcTo(x0, 12, x0 + w, 12, r); g.closePath();
      g.fillStyle = dark ? 'rgba(15,38,48,0.94)' : 'rgba(255,255,255,0.95)'; g.fill(); g.lineWidth = 3; g.strokeStyle = dark ? 'rgba(255,255,255,0.25)' : 'rgba(15,38,48,0.25)'; g.stroke();
      g.fillStyle = color || (dark ? '#FFFFFF' : '#0F2630'); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, 256, 68, 480); tex.needsUpdate = true; } };
    labels.push(o); return o;
  }

  // room
  (function room(){
    const fc = document.createElement('canvas'); fc.width = fc.height = 128; const g = fc.getContext('2d'); g.fillStyle = '#B4C0C6'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#A3B0B7'; g.lineWidth = 3; g.strokeRect(0, 0, 128, 128);
    const ft = new T.CanvasTexture(fc); ft.wrapS = ft.wrapT = T.RepeatWrapping; ft.repeat.set(14, 14); ft.encoding = T.sRGBEncoding;
    const floor = add(new T.PlaneGeometry(14, 14), new T.MeshStandardMaterial({map:ft, roughness:0.9}), 0, 0, 4.8); floor.rotation.x = -Math.PI / 2; floor.castShadow = false;
    add(new T.PlaneGeometry(14, 6.4), mat.wall, 0, 3.2, -2.2).castShadow = false;
    const wl = add(new T.PlaneGeometry(14, 6.4), mat.wall, -7, 3.2, 4.8); wl.rotation.y = Math.PI / 2; wl.castShadow = false;
    const wr = add(new T.PlaneGeometry(14, 6.4), mat.wall, 7, 3.2, 4.8); wr.rotation.y = -Math.PI / 2; wr.castShadow = false;
    box(14, 0.16, 0.05, mat.trim, 0, 0.08, -2.17); box(14, 0.1, 0.04, mat.yellow, 0, 1.2, -2.18);
    [-3.75, 3.75].forEach((x, k) => { // storage between the benches
      box(2.3, 0.95, 0.62, mat.cab, x, 0.475, -1.85); box(2.34, 0.05, 0.66, mat.top, x, 0.975, -1.85);
      [-0.58, 0.58].forEach(dx => box(0.04, 0.3, 0.02, mat.steel, x + dx * 0.9, 0.55, -1.53));
      [2.0, 2.75].forEach((y, r) => { box(2.3, 0.06, 0.42, mat.steel, x, y, -1.97);
        [0x3E7BFA, 0xF2B705, 0xD9342B, 0x1B7F53, 0x8FA6B0].forEach((col, i) => { if ((i + r + k) % 5 === 4) return; box(0.34, 0.24 + ((i * 7 + r * 3) % 3) * 0.06, 0.3, M(col), x - 0.86 + i * 0.43, y + 0.16 + ((i * 7 + r * 3) % 3) * 0.03, -1.97); }); });
    });
    box(1.5, 3.1, 0.08, M(0x7B8C95), 5.8, 1.55, -2.15); ball(0.07, mat.metal, 5.25, 1.5, -2.08); // door
  })();

  const xL = -1.45, xR = 1.45, zB = -0.72, zF = 0.72, WY = 1.085;
  const clickables = [], stations = {};
  const hit = (parent, size, pos, data) => { const o = new T.Mesh(new T.BoxGeometry(size[0], size[1], size[2]), new T.MeshBasicMaterial({transparent:true, opacity:0, depthWrite:false})); o.position.set(pos[0], pos[1], pos[2]); o.userData = data; parent.add(o); clickables.push(o); return o; };

  // a loose part, origin at its base, for the parts tables and the student's hand
  function makePart(id, ohms){
    const p = PARTS[id], g = new T.Group();
    if (p.kind === 'res') {
      const rz = o => { o.rotation.z = Math.PI / 2; return o; };
      rz(cyl(0.1, 0.1, 0.44, mat.body, 0, 0.11, 0, g)); ball(0.1, mat.body, -0.22, 0.11, 0, g).scale.x = 0.6; ball(0.1, mat.body, 0.22, 0.11, 0, g).scale.x = 0.6;
      if(p.variable&&!p.custom){cyl(.07,.07,.1,mat.black,0,.27,0,g);} // adjustment knob
      bands(ohms ?? p.ohms).concat(['#C9A227']).forEach((c, i) => rz(cyl(0.104, 0.104, 0.046, M(new T.Color(c).getHex(), {roughness:0.5}), i < 3 ? -0.15 + i * 0.085 : 0.15, 0.11, 0, g)));
      seg(V3(-0.42, 0.11, 0), V3(-0.26, 0.11, 0), 0.016, mat.metal, g); seg(V3(0.42, 0.11, 0), V3(0.26, 0.11, 0), 0.016, mat.metal, g);
    } else if (p.kind === 'wire') {
      seg(V3(-0.36, 0.04, 0), V3(0.36, 0.04, 0), 0.03, mat.red, g); ball(0.035, mat.metal, -0.36, 0.04, 0, g); ball(0.035, mat.metal, 0.36, 0.04, 0, g);
    } else if (p.kind === 'diode') {
      box(.35,.13,.15,mat.black,0,.12,0,g);box(.04,.14,.16,mat.stripe,.1,.12,0,g);seg(V3(-.4,.12,0),V3(.4,.12,0),.012,mat.metal,g);
    } else if (p.kind === 'led') {
      const m = M(p.color||0xE5322B, {roughness:0.25}); cyl(0.13, 0.13, 0.18, m, 0, 0.23, 0, g); ball(0.13, m, 0, 0.32, 0, g); cyl(0.155, 0.155, 0.03, m, 0, 0.14, 0, g);
      seg(V3(-0.05, 0, 0), V3(-0.05, 0.13, 0), 0.016, mat.metal, g); seg(V3(0.05, 0.03, 0), V3(0.05, 0.13, 0), 0.016, mat.metal, g);
    } else {
      cyl(0.17, 0.17, 0.42, mat.cap, 0, 0.21, 0, g); cyl(0.15, 0.15, 0.02, mat.metal, 0, 0.43, 0, g); box(0.16, 0.36, 0.02, mat.stripe, 0, 0.21, 0.166, g);
    }
    return g;
  }

  function station(exp, sx){
    const E = EXPERIMENTS[exp], hasD = E.slots.length > 1 && exp!=='parallel', g = new T.Group(); g.position.x = sx; scene.add(g);
    const st = {exp, x:sx, g, hasD:E.slots.length>1, key:null, lever:0.62, bright:0, flow:false, flashUntil:0, burnRef:null, smokeT:0};
    // bench, board, wall screen, lamp, stool
    box(5.2, 0.12, 2.4, mat.top, 0, 0.94, 0, g); box(5.2, 0.05, 0.06, mat.yellow, 0, 0.975, 1.2, g);
    [[-2.4, -1], [2.4, -1], [-2.4, 1], [2.4, 1]].forEach(p => box(0.12, 0.88, 0.12, mat.steel, p[0], 0.44, p[1], g)); box(4.8, 0.06, 0.06, mat.steel, 0, 0.3, -1, g);
    box(3.7, 0.05, 2.0, mat.board, 0, 1.025, 0, g);
    box(3.56, 1.86, 0.08, mat.dark, 0, 2.72, -2.14, g);
    const sc = document.createElement('canvas'); sc.width = 1024; sc.height = 512; st.sg = sc.getContext('2d'); st.stex = new T.CanvasTexture(sc); st.stex.encoding = T.sRGBEncoding;
    add(new T.PlaneGeometry(3.4, 1.7), new T.MeshBasicMaterial({map:st.stex}), 0, 2.72, -2.095, g, false);
    box(2.6, 0.06, 0.9, mat.lamp, 0, 4.9, 0, g, false);
    cyl(0.3, 0.3, 0.08, mat.dark, -0.9, 0.72, 2.15, g); cyl(0.04, 0.04, 0.7, mat.steel, -0.9, 0.36, 2.15, g); cyl(0.24, 0.28, 0.04, mat.steel, -0.9, 0.02, 2.15, g);
    // wires
    const P = (x, z) => V3(x, WY, z);
    [[P(xL, -0.31), P(xL, zB)], [P(xL, zB), P(-1.05, zB)], [P(-0.5, zB), P(-0.1, zB)], [P(0.8, zB), P(xR, zB)], hasD ? [P(xR, zB), P(xR, -0.38)] : [P(xR, zB), P(xR, 0)]].forEach(s => seg(s[0], s[1], 0.03, mat.red, g));
    [hasD ? [P(xR, 0.38), P(xR, zF)] : [P(xR, 0), P(xR, zF)], [P(xR, zF), P(0.32, zF)], [P(-0.32, zF), P(xL, zF)], [P(xL, zF), P(xL, 0.31)]].forEach(s => seg(s[0], s[1], 0.03, mat.black, g));
    ball(0.035, mat.red, xL, WY, zB, g); ball(0.035, mat.red, xR, WY, zB, g); ball(0.035, mat.black, xR, WY, zF, g); ball(0.035, mat.black, xL, WY, zF, g);
    // battery
    box(0.4, 0.42, 0.62, mat.dark, xL, 1.26, 0, g); box(0.41, 0.1, 0.63, mat.yellow, xL, 1.3, 0, g);
    cyl(0.05, 0.05, 0.07, mat.metal, xL, 1.5, -0.18, g); cyl(0.07, 0.07, 0.05, mat.metal, xL, 1.49, 0.18, g);
    label(g, xL - 0.36, 1.36, -0.34, 0.42).set('+'); label(g, xL - 0.36, 1.36, 0.34, 0.42).set('−'); st.volt = label(g, xL, 1.84, 0, 0.72, true);
    // switch
    box(0.72, 0.04, 0.26, mat.dark, -0.775, 1.07, zB, g); cyl(0.045, 0.045, 0.12, mat.metal, -1.05, 1.11, zB, g); cyl(0.045, 0.045, 0.12, mat.metal, -0.5, 1.11, zB, g);
    st.arm = new T.Group(); st.arm.position.set(-1.05, 1.175, zB); st.arm.rotation.z = 0.62; g.add(st.arm);
    box(0.58, 0.035, 0.07, mat.metal, 0.29, 0, 0, st.arm); ball(0.06, mat.yellow, 0.58, 0.02, 0, st.arm);
    st.swLabel = label(g, -0.775, 1.72, zB, 0.6);
    hit(g, [0.95, 0.75, 0.6], [-0.775, 1.36, zB], {act:'sw', exp});
    // slots
    cyl(0.045, 0.045, 0.12, mat.metal, -0.1, 1.11, zB, g); cyl(0.045, 0.045, 0.12, mat.metal, 0.8, 1.11, zB, g);
    const padM = () => new T.MeshBasicMaterial({color:0xF2B705, transparent:true, opacity:0.6});
    st.padR = box(1.14, 0.012, 0.46, padM(), 0.35, 1.057, zB, g, false);
    st.rG = new T.Group(); st.rG.position.set(0.35, 0, zB); g.add(st.rG); st.rLabel = label(g, 0.35, 1.62, zB, 0.72);
    hit(g, [1.15, 0.7, 0.6], [0.35, 1.36, zB], {act:'slot', id:'R', exp});
    if (E.slots.length>1) {
      if(exp!=='parallel'){cyl(0.045, 0.045, 0.12, mat.metal, xR, 1.11, -0.38, g); cyl(0.045, 0.045, 0.12, mat.metal, xR, 1.11, 0.38, g);}
      st.padD = box(0.46, 0.012, 1.0, padM(), xR, 1.057, 0, g, false);
      st.dG = new T.Group(); st.dG.position.set(xR, 0, 0); g.add(st.dG); st.dLabel = label(g, xR, 2.06, 0, 0.72); st.plus = label(g, xR + 0.3, 1.3, -0.38, 0.4);
      hit(g, [0.75, 1.0, 1.05], [xR, 1.5, 0], {act:'slot', id:'D', exp});
    }
    if(exp==='parallel'){
      st.dG.position.set(.35,0,0);st.padD.position.set(.35,1.057,0);st.padD.scale.set(2.2,1,.46);st.dLabel.sprite.position.set(.35,1.9,0);
      const h=clickables.find(o=>o.userData.exp===exp&&o.userData.act==='slot'&&o.userData.id==='D');h.position.set(.35,1.5,0);h.scale.set(1.7,1,.6);
      for(const x of [-.1,.8])seg(P(x,zB),P(x,0),.03,mat.red,g);
      seg(P(-.1,0),P(.05,0),.03,mat.red,g);seg(P(.65,0),P(.8,0),.03,mat.red,g);
    }
    // ammeter
    box(0.64, 0.2, 0.4, mat.yellow, 0, 1.15, zF, g); box(0.46, 0.02, 0.24, mat.dark, 0, 1.255, zF, g); st.amm = label(g, 0, 1.6, zF, 0.78, true);
    // moving dots that show current
    st.dots = []; for (let i = 0; i < 14; i++) { const d = ball(0.05, new T.MeshBasicMaterial({color:0xFFC21A}), 0, 0, 0, g, false); d.visible = false; st.dots.push(d); }
    st.path = [V3(xL, 1.13, -0.31), V3(xL, 1.13, zB), V3(xR, 1.13, zB), V3(xR, 1.13, zF), V3(xL, 1.13, zF), V3(xL, 1.13, 0.31)];
    st.plen = [0]; for (let i = 1; i < st.path.length; i++) st.plen.push(st.plen[i - 1] + st.path[i].distanceTo(st.path[i - 1]));
    // smoke puffs for a burnt LED
    st.smoke = []; for (let i = 0; i < 6; i++) { const sp = new T.Sprite(new T.SpriteMaterial({map:texSmoke, transparent:true, depthWrite:false, opacity:0})); sp.visible = false; sp.renderOrder = 6; g.add(sp); st.smoke.push(sp); }
    hit(g, [5.2, 2.4, 2.6], [0, 1.6, 0], {act:'station', exp});
    // parts table beside the bench: every part this bench takes, ready to pick up
    const tx = 3.4, opts = [...new Set(E.slots.flatMap(sl=>sl.options))];
    const trayDepth=Math.max(1.8,Math.ceil(opts.length/2)*.43);box(1.1, 0.06, trayDepth, mat.top, tx, 0.9, 0, g); [[-0.48, -0.82], [0.48, -0.82], [-0.48, 0.82], [0.48, 0.82]].forEach(q => box(0.06, 0.87, 0.06, mat.steel, tx + q[0], 0.435, q[1], g));
    box(1.1, 0.03, 0.04, mat.yellow, tx, 0.94, 0.9, g);
    label(g, tx, 1.95, 0, 0.6, true).set('Parts');
    const rows = Math.ceil(opts.length / 2); st.trayDepth=trayDepth;st.tray = {};
    opts.forEach((id, i) => {
      const px = tx - 0.26 + (i % 2) * 0.52, pz = rows > 1 ? -trayDepth/2+.22+Math.floor(i/2)*.43 : 0;
      box(0.46, 0.012, 0.32, M(0x2B424C), px, 0.937, pz, g, false);
      const m = makePart(id); m.position.set(px, 0.945, pz); m.scale.setScalar(0.72); g.add(m);
      const lb = label(g, px, 1.3, pz, 0.36); lb.set(partLabel(id));
      hit(g, [0.5, 0.5, 0.34], [px, 1.08, pz], {act:'take', id, exp});
      st.tray[id] = {m, lb, px, pz};
    });
    stations[exp] = st; return st;
  }

  function fillR(st, b){
    clear(st.rG); const p = b.R ? CORE.effective(b.R,b) : null;
    if (!p) { box(0.5, 0.18, 0.2, mat.ghost, 0, 1.2, 0, st.rG, false); st.rLabel.set('Resistor slot'); return; }
    if (p.kind === 'wire') { seg(V3(-0.45, WY, 0), V3(0.45, WY, 0), 0.03, mat.red, st.rG); st.rLabel.set('wire'); return; }
    const rz = o => { o.rotation.z = Math.PI / 2; return o; };
    rz(cyl(0.1, 0.1, 0.44, mat.body, 0, 1.21, 0, st.rG)); ball(0.1, mat.body, -0.22, 1.21, 0, st.rG).scale.x = 0.6; ball(0.1, mat.body, 0.22, 1.21, 0, st.rG).scale.x = 0.6;
    bands(p.ohms).concat(['#C9A227']).forEach((c, i) => { const m = M(new T.Color(c).getHex(), {roughness:0.5}); const o = rz(cyl(0.104, 0.104, 0.046, m, i < 3 ? -0.15 + i * 0.085 : 0.15, 1.21, 0, st.rG)); o.userData.own = true; });
    seg(V3(-0.45, 1.13, 0), V3(-0.26, 1.21, 0), 0.016, mat.metal, st.rG); seg(V3(0.45, 1.13, 0), V3(0.26, 1.21, 0), 0.016, mat.metal, st.rG);
    st.rLabel.set(CORE.partText(b.R, b, 'R'));
  }
  function dText(st, b){ const p = b.D ? PARTS[b.D] : null; if (!p) return EXPERIMENTS[st.exp].slots[1].name + ' slot'; return p.kind === 'led' ? (b.burnt ? 'LED burnt out' : p.label) : CORE.partText(b.D, b, 'D'); }
  function fillD(st, b){
    clear(st.dG); st.led = null; const p = b.D ? PARTS[b.D] : null;
    st.dLabel.set(dText(st, b), b.burnt ? '#BF3A31' : undefined);
    if (!p) { box(0.3, 0.34, 0.5, mat.ghost, 0, 1.25, 0, st.dG, false); st.plus.set(''); return; }
    if(p.kind==='res'||p.kind==='diode'){
      st.plus.set('');const m=makePart(b.D, p.variable ? CORE.effective(b.D, b, 'D').ohms : undefined);m.position.y=1.09;m.rotation.y=st.exp==='parallel'?0:Math.PI/2;if(p.kind==='diode'&&b.reversed)m.rotation.y+=Math.PI;st.dG.add(m);return;
    }
    st.plus.set('+'); st.plus.sprite.position.z = b.reversed ? 0.38 : -0.38;
    if (p.kind === 'led') {
      const m = new T.MeshStandardMaterial({color:b.burnt ? 0x3A3F42 : p.color||0xE5322B, roughness:0.25, transparent:true, opacity:b.burnt ? 1 : 0.92, emissive:p.color||0xff2a1a, emissiveIntensity:0});
      const own = o => { o.userData.own = true; return o; };
      own(cyl(0.13, 0.13, 0.18, m, 0, 1.38, 0, st.dG)); own(ball(0.13, m, 0, 1.47, 0, st.dG)); own(cyl(0.155, 0.155, 0.03, m, 0, 1.285, 0, st.dG));
      seg(V3(0, 1.13, -0.38), V3(0, 1.28, -0.06), 0.016, mat.metal, st.dG); seg(V3(0, 1.13, 0.38), V3(0, 1.28, 0.06), 0.016, mat.metal, st.dG);
      const glow = new T.Sprite(new T.SpriteMaterial({map:texRed,color:p.color||0xffffff, transparent:true, depthWrite:false, opacity:0})); glow.position.set(0, 1.44, 0); glow.scale.set(0.01, 0.01, 1); st.dG.add(glow);
      const light = new T.PointLight(p.color||0xff3a22, 0, 3.2, 2); light.position.set(0, 1.62, 0); st.dG.add(light);
      st.led = {m, glow, light, burnt:b.burnt, cur:0};
    } else {
      cyl(0.17, 0.17, 0.42, mat.cap, 0, 1.36, 0, st.dG); cyl(0.15, 0.15, 0.02, mat.metal, 0, 1.58, 0, st.dG);
      box(0.16, 0.36, 0.02, mat.stripe, 0, 1.36, b.reversed ? -0.166 : 0.166, st.dG);
      seg(V3(0, 1.13, -0.38), V3(0, 1.17, -0.14), 0.016, mat.metal, st.dG); seg(V3(0, 1.13, 0.38), V3(0, 1.17, 0.14), 0.016, mat.metal, st.dG);
    }
  }

  const wrap = (g, text, x, y, maxW, lh) => { let line = ''; text.split(' ').forEach(w => { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { g.fillText(line, x, y); y += lh; line = w; } else line = t; }); g.fillText(line, x, y); return y; };
  function drawScreen(st){
    const g = st.sg, E = EXPERIMENTS[st.exp], b = S.bench[st.exp], active = st.exp === S.exp, sim = active ? shown() : null;
    g.fillStyle = '#0B161B'; g.fillRect(0, 0, 1024, 512); g.fillStyle = '#F2B705'; g.fillRect(0, 0, 1024, 12); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.font = '600 30px "IBM Plex Mono", monospace'; g.fillText('EXPERIMENT ' + E.n, 44, 66);
    if (S.completed[st.exp]) { g.fillStyle = '#4CC38A'; g.textAlign = 'right'; g.fillText('✓ DONE', 980, 66); g.textAlign = 'left'; }
    g.fillStyle = '#FFFFFF'; g.font = '700 64px "Geist", system-ui, sans-serif'; g.fillText(E.title, 44, 140);
    g.fillStyle = '#B9C9D0'; g.font = '400 32px "IBM Plex Sans", system-ui, sans-serif'; wrap(g, E.goal, 44, 190, 940, 40);
    if (st.exp === 'rc') { plotScope(g, 30, 232, 964, 268, {line:'#2B424C', dim:'#8FA6B0', ink:'#FFFFFF', trace:'#F2B705'}, 22, active ? rt.scope : null); return; }
    if(['series','parallel','divider','diode'].includes(st.exp)){
      g.fillStyle='#A1C6D6';g.font='400 32px monospace';g.fillText(st.exp==='parallel'?'Two branches · shared voltage':st.exp==='divider'?'Unloaded output across R2':'Single isolated circuit',44,290);
      g.fillStyle='#F2B705';g.font='500 60px monospace';g.fillText(sim?fmtI(sim.I):'Switch open',44,375);if(sim?.vD!==undefined)g.fillText('Vout '+fmtV(sim.vD),44,460);return;
    }
    // reading plus a range bar
    const max = st.exp === 'ohm' ? 20 : 40, x0 = 44, w = 936, y = 420, X = mA => x0 + Math.min(mA, max) / max * w;
    const zone = (a, c, col) => { g.fillStyle = col; g.fillRect(X(a), y, X(c) - X(a), 26); };
    zone(0, max, '#22363F');
    if (st.exp === 'ohm') zone(9.5, 10.5, '#4CC38A'); else { zone(2, 20, '#4CC38A'); zone(20, 30, '#F0A840'); zone(30, 40, '#F0766C'); }
    g.fillStyle = '#8FA6B0'; g.font = '400 24px "IBM Plex Mono", monospace'; g.textAlign = 'left'; g.fillText('0', x0, y + 58); g.textAlign = 'right'; g.fillText(max + ' mA', x0 + w, y + 58);
    g.textAlign = 'center'; g.fillText(st.exp === 'ohm' ? 'target 10 mA' : 'safe: 2 to 20 mA', st.exp === 'ohm' ? X(10) : X(11), y + 58);
    g.textAlign = 'left'; g.font = '500 84px "IBM Plex Mono", monospace';
    if (!sim) { g.fillStyle = '#5D7480'; g.fillText('switch open', x0, 372); return; }
    const I = sim.I * 1000, dead = sim.burn || b.burnt, col = sim.status === 'short' || dead ? '#F0766C' : '#F2B705';
    g.fillStyle = col; g.fillText(sim.status === 'short' ? 'FUSE TRIPPED' : sim.burn ? 'LED BURNT' : fmtI(sim.I), x0, 372);
    if (sim.burn && sim.I < 1) { g.font = '400 32px "IBM Plex Mono", monospace'; g.fillStyle = '#B9C9D0'; g.fillText('peak ' + fmtI(sim.I), x0 + 520, 366); }
    g.fillStyle = '#FFFFFF'; g.beginPath(); g.moveTo(X(I), y - 6); g.lineTo(X(I) - 13, y - 28); g.lineTo(X(I) + 13, y - 28); g.closePath(); g.fill(); g.fillRect(X(I) - 2, y - 6, 4, 38);
  }

  // instructor robot
  const bot = new T.Group(); scene.add(bot); bot.rotation.y = -0.5;
  cyl(0.2, 0.12, 0.38, mat.yellow, 0, -0.44, 0, bot); cyl(0.06, 0.06, 0.1, mat.steel, 0, -0.21, 0, bot);
  box(0.62, 0.46, 0.44, mat.dark, 0, 0.06, 0, bot); box(0.5, 0.2, 0.02, mat.face, 0, 0.11, 0.225, bot, false);
  ball(0.055, mat.eye, -0.13, 0.11, 0.24, bot, false); ball(0.055, mat.eye, 0.13, 0.11, 0.24, bot, false);
  const mouth = box(0.18, 0.03, 0.02, mat.white, 0, -0.08, 0.225, bot, false);
  [-0.33, 0.33].forEach(x => { cyl(0.07, 0.07, 0.05, mat.yellow, x, 0.06, 0, bot).rotation.z = Math.PI / 2; ball(0.07, mat.yellow, x * 0.85, -0.4, 0, bot); });
  cyl(0.012, 0.012, 0.16, mat.steel, 0, 0.37, 0, bot);
  const lampM = new T.MeshBasicMaterial({color:0x8FA6B0}), lamp = ball(0.05, lampM, 0, 0.47, 0, bot, false);
  const jet = new T.Sprite(new T.SpriteMaterial({map:texYel, transparent:true, depthWrite:false, opacity:0.8})); jet.position.set(0, -0.72, 0); jet.scale.set(0.55, 0.3, 1); bot.add(jet);
  const botName = label(bot, 0, 0.72, 0, 0.5, true); botName.set('Nour');

  station(S.exp, 0);

  // the student: first-person camera, a lab-coat sleeve and whatever part is in hand
  scene.add(camera); camera.rotation.order = 'YXZ';
  const hand = new T.Group(); hand.position.set(0.34, -0.33, -0.66); camera.add(hand);
  const sleeve = cyl(0.075, 0.09, 0.55, M(0xF4F6F7, {roughness:0.9}), 0, -0.06, 0.3, hand, false); sleeve.rotation.x = 1.25;
  box(0.13, 0.085, 0.17, M(0xC68E6A, {roughness:0.7}), 0, 0.01, 0.02, hand, false);
  const held = new T.Group(); held.position.set(-0.02, 0.06, -0.12); hand.add(held); let heldKey = '';
  const player = {pos:V3(0, 1.62, 2.9), yaw:0, pitch:-0.3, bob:0}, keys = {};
  const blocks = [];
  Object.keys(stations).forEach(k => { const x = stations[k].x; blocks.push([x - 2.75, x + 2.75, -1.4, 1.4], [x + 2.8, x + 4.0, -stations[k].trayDepth/2, stations[k].trayDepth/2], [x - 1.2, x - 0.6, 1.85, 2.45]); });
  [-3.75, 3.75].forEach(x => blocks.push([x - 1.2, x + 1.2, -2.3, -1.45]));
  function collide(p){
    const r = 0.3; p.x = Math.max(-6.6, Math.min(6.6, p.x)); p.z = Math.max(-1.8, Math.min(11.4, p.z));
    blocks.forEach(([x0, x1, z0, z1]) => {
      if (p.x < x0 - r || p.x > x1 + r || p.z < z0 - r || p.z > z1 + r) return;
      const push = [[x0 - r - p.x, 0], [x1 + r - p.x, 0], [0, z0 - r - p.z], [0, z1 + r - p.z]].sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]))[0];
      p.x += push[0]; p.z += push[1];
    });
  }
  const kd = e => { if(document.querySelector('dialog[open]'))return;if (e.target && e.target.closest && e.target.closest('input, textarea, select')) return; keys[e.code] = true; if (S.mode === 'walk' && /^Arrow/.test(e.code)) e.preventDefault(); };
  const ku = e => { keys[e.code] = false; };
  const kclear = () => { for (const k in keys) keys[k] = false; };
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); window.addEventListener('blur', kclear);
  let wt = null; // walking-mode camera tween
  const standPose = exp => { const portrait = host.clientWidth < host.clientHeight; return {pos:V3(stations[exp].x, 1.62, portrait ? 3.9 : 2.9), yaw:0, pitch:portrait ? -0.36 : -0.3}; };
  function walkTo(exp, dur, from){
    const ps = standPose(exp);
    if (from) { camera.position.copy(from); camera.lookAt(stations[exp].x, 1.4, -0.4); }
    const q1 = new T.Quaternion().setFromEuler(new T.Euler(ps.pitch, ps.yaw, 0, 'YXZ'));
    if (reduced || !dur) { player.pos.copy(ps.pos); player.yaw = ps.yaw; player.pitch = ps.pitch; wt = null; return; }
    wt = {t0:performance.now(), dur, p0:camera.position.clone(), q0:camera.quaternion.clone(), p1:ps.pos, q1, ps};
  }
  bot.position.set(stations[S.exp].x + 2.4, 2.5, -1.1);

  // camera
  const EL = 0.42; let tween = null, userMoved = false; const ins = {top:0, bottom:0};
  // camera distance so the bench fills the part of the screen the HUD leaves free
  const freeH = () => Math.max(160, (host.clientHeight || 400) - ins.top - ins.bottom);
  const camDist = () => { const w = host.clientWidth || 600, h = host.clientHeight || 400, fh = freeH(); const fa = w / fh; return 5.7 * Math.max(1, 1.2 / fa) * (h + ins.bottom - ins.top) / fh * (fa > 2 ? 0.85 : 1); };
  function goTo(exp, animate, dur, from){
    if (S.mode === 'walk') { walkTo(exp, animate ? (dur || 1100) : 0, from); return; }
    const st = stations[exp], tgt = V3(st.x, 1.72, -0.4), d = camDist(), pos = V3(st.x, 1.72 + Math.sin(EL) * d, -0.4 + Math.cos(EL) * d); userMoved = false;
    if (!animate || reduced) { tween = null; controls.enabled = true; controls.target.copy(tgt); camera.position.copy(pos); camera.lookAt(tgt); controls.update(); return; }
    if (from) { camera.position.copy(from); controls.target.copy(tgt); camera.lookAt(tgt); }
    tween = {t0:performance.now(), dur:dur || 950, p0:camera.position.clone(), p1:pos, q0:controls.target.clone(), q1:tgt}; controls.enabled = false;
  }
  function scaleLabels(){ const lk = S.mode === 'walk' ? 0.42 : Math.min(1.45, camDist() / 5.7); labels.forEach(l => l.sprite.scale.set(1.2 * l.s * lk, 0.3 * l.s * lk, 1)); }
  function applyOffset(){ const w = host.clientWidth, h = host.clientHeight, dy = S.mode === 'walk' ? 0 : ins.bottom - ins.top; if (!w || !h) return; camera.fov = S.mode === 'walk' ? (w < h ? 74 : 62) : 45; scaleLabels(); if (dy > 0) { camera.aspect = w / (h + dy); camera.setViewOffset(w, h + dy, 0, dy, w, h); } else { camera.aspect = w / h; camera.clearViewOffset(); } camera.updateProjectionMatrix(); }
  function setInsets(top, bottom){ if (Math.abs(top - ins.top) < 2 && Math.abs(bottom - ins.bottom) < 2) return; ins.top = top; ins.bottom = bottom; applyOffset(); if (S.mode === 'walk') return; if (tween) { const st = stations[S.exp], d = camDist(); tween.p1 = V3(st.x, 1.72 + Math.sin(EL) * d, -0.4 + Math.cos(EL) * d); } else if (!userMoved) goTo(S.exp, false); }
  function flyIn(exp){ const st = stations[exp]; goTo(exp, true, 2100, V3(st.x + 4.5, 6.2, 13.5)); }
  controls.addEventListener('start', () => { userMoved = true; });
  function resize(){ const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; applyOffset(); scaleLabels(); if (!userMoved && !tween) goTo(S.exp, false); }
  const ro = window.ResizeObserver ? new ResizeObserver(resize) : null; if (ro) ro.observe(host); else window.addEventListener('resize', resize);

  // picking
  const ray = new T.Raycaster(), ndc = new T.Vector2();
  const REACH = 4.2;
  function pickAt(nx, ny){ ndc.set(nx, ny); ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(clickables); if (!hits.length) return null;
    const own = hits.find(h => h.object.userData.exp === S.exp && h.object.userData.act !== 'station') || hits.find(h => h.object.userData.act !== 'station') || hits[0];
    return {u:own.object.userData, d:own.distance}; }
  function pick(e){ const r = el.getBoundingClientRect(); return pickAt((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); }
  const slotOf = (exp, id) => (EXPERIMENTS[exp].slots.find(sl=>sl.id===S.active&&sl.options.includes(id))||EXPERIMENTS[exp].slots.find(sl=>!S.bench[exp][sl.id]&&sl.options.includes(id))||EXPERIMENTS[exp].slots.find(sl=>sl.options.includes(id))).id;
  function interact(hit){
    if (!hit) return; const u = hit.u;
    if (S.mode === 'walk') {
      if (hit.d > REACH || u.act === 'station') return;
      if (u.exp !== S.exp) ACT.setBench(u.exp);
      if (u.act === 'take') ACT.take(u.id); else if (u.act === 'slot') ACT.use(u.id); else if (u.act === 'sw') ACT.sw();
      return;
    }
    if (u.exp !== S.exp) { ACT.exp(u.exp); return; }
    if (u.act === 'slot') ACT.slot(u.id); else if (u.act === 'sw') ACT.sw(); else if (u.act === 'take') { ACT.slot(slotOf(u.exp, u.id)); ACT.part(u.id); }
  }
  function aimText(hit){
    if (!hit || hit.d > REACH || hit.u.act === 'station') return null;
    const u = hit.u, exp = u.exp, b = S.bench[exp], E = EXPERIMENTS[exp];
    if (u.act === 'take') return (rt.held ? 'Swap for ' : 'Pick up ') + partLabel(u.id);
    if (u.act === 'sw') return (exp === S.exp && S.closed) ? 'Open the switch' : 'Close the switch';
    if (u.act === 'slot') { const name = E.slots.find(sl => sl.id === u.id).name;
      if (rt.held) return rt.held.exp === exp && rt.held.slot === u.id ? `Place ${partLabel(rt.held.id)} in the ${name.toLowerCase()} slot` : `${partLabel(rt.held.id)} does not go here`;
      if (b[u.id]) return u.id === 'D' && b.burnt ? 'Throw away the burnt LED' : `Take out ${partLabel(b[u.id])}`;
      return `${name} slot: empty`; }
    return null;
  }
  let down = null;
  el.addEventListener('pointerdown', e => { down = {x:e.clientX, y:e.clientY, lx:e.clientX, ly:e.clientY, id:e.pointerId, moved:false}; const h = document.querySelector('.vp-hint'); if (h) h.hidden = true; if (S.mode === 'walk') { try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } } });
  el.addEventListener('pointermove', e => {
    if (S.mode === 'walk') {
      if (down && down.id === e.pointerId) {
        const dx = e.clientX - down.lx, dy = e.clientY - down.ly; down.lx = e.clientX; down.ly = e.clientY;
        if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down.moved = true;
        const k = e.pointerType === 'touch' ? 0.0062 : 0.0042;
        player.yaw -= dx * k; player.pitch = Math.max(-1.25, Math.min(1.0, player.pitch - dy * k * 0.85));
        el.style.cursor = 'grabbing';
      } else if (e.pointerType === 'mouse') { const h = pick(e); el.style.cursor = aimText(h) ? 'pointer' : 'grab'; }
      return;
    }
    if (e.pointerType !== 'mouse' || e.buttons) return; const h = pick(e); const u = h && h.u; el.style.cursor = u && (u.exp !== S.exp || u.act !== 'station') ? 'pointer' : 'grab';
  });
  const up = e => { if (!down || down.id !== e.pointerId) return; const moved = down.moved || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8; down = null; el.style.cursor = '';
    if (moved || tween || wt) return; interact(pick(e)); };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', () => { down = null; });
  let aimKey = null, frameNo = 0;
  function useAim(){ if (S.mode === 'walk') interact(pickAt(0, 0)); }

  let lastMode = S.mode;
  function sync(){
    const now = performance.now();
    if (S.mode !== lastMode) { const was = lastMode; lastMode = S.mode; applyOffset();
      if (S.mode === 'walk') walkTo(S.exp, 900); else if (S.mode === '3d' && was === 'walk') goTo(S.exp, true, 900); }
    hand.visible = S.mode === 'walk';
    const hk = rt.held ? rt.held.id + (rt.heldRev ? 'r' : '') : '';
    if (hk !== heldKey) { heldKey = hk; clear(held); if (rt.held) { const m = makePart(rt.held.id); m.scale.setScalar(0.34); if (rt.heldRev) m.rotation.z = Math.PI; m.traverse(o => { o.castShadow = false; }); held.add(m); } }
    Object.keys(stations).forEach(k => { const st = stations[k], b = S.bench[k], active = k === S.exp, sim = active ? shown() : null;
      const key = [b.R, b.D, b.reversed, b.burnt, b.pot, b.values?.R, b.values?.D].join('|'); if (key !== st.key) { st.key = key; fillR(st, b); if (st.hasD) fillD(st, b); }
      st.closed = active && S.closed; st.volt.set(fmtV(b.V), '#F2B705');
      const fuse = active && S.status === 'fuse'; st.swLabel.set(fuse ? 'fuse tripped' : st.closed ? 'closed' : 'open', fuse ? '#BF3A31' : undefined);
      const run = k === 'rc' && active && rt.scope;
      if (!run) { st.amm.set(sim && k !== 'rc' ? (sim.burn || b.burnt ? '0.0 mA' : fmtI(sim.I)) : '0.0 mA', '#F2B705'); if (st.hasD) st.dLabel.set(dText(st, b), b.burnt ? '#BF3A31' : undefined); }
      st.flow = !!(st.closed && sim && sim.status === 'ok' && sim.I > 0 && !sim.burn && !b.burnt && (k !== 'rc' || (rt.scope && !rt.scope.done)));
      st.bright = st.closed && sim && sim.lit && !b.burnt ? sim.bright : 0;
      if (active && S.last && S.last.sim.burn && st.burnRef !== S.last) { st.burnRef = S.last; st.flashUntil = now + 420; st.smokeT = now; }
      st.padR.visible = active && S.active === 'R'; if (st.padD) st.padD.visible = active && S.active === 'D';
      drawScreen(st); st.stex.needsUpdate = true;
    });
  }

  let last = performance.now();
  function frame(now){
    if (dead) return; raf = requestAnimationFrame(frame);
    if ((S.mode !== '3d' && S.mode !== 'walk') || document.hidden || !host.clientWidth) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    frameNo++;
    if (S.mode === 'walk') {
      controls.enabled = false; tween = null;
      if (wt) { const k = Math.min(1, (now - wt.t0) / wt.dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        camera.position.lerpVectors(wt.p0, wt.p1, e); camera.quaternion.copy(wt.q0).slerp(wt.q1, e);
        if (k >= 1) { player.pos.copy(wt.ps.pos); player.yaw = wt.ps.yaw; player.pitch = wt.ps.pitch; wt = null; } }
      else {
        const j = rt.joy || {x:0, y:0};
        const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - j.y;
        const sd = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + j.x;
        const len = Math.hypot(f, sd);
        if (len > 0.05) {
          const n = Math.min(1, len) / len, sp = (keys.ShiftLeft || keys.ShiftRight ? 4.2 : 2.5) * dt, sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
          player.pos.x += (-sy * f + cy * sd) * n * sp; player.pos.z += (-cy * f - sy * sd) * n * sp; collide(player.pos);
          player.bob += dt * 9 * Math.min(1, len);
        }
        camera.position.set(player.pos.x, player.pos.y + (reduced ? 0 : Math.sin(player.bob) * 0.022), player.pos.z);
        camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
        // This room has exactly one experiment; there is no cross-lab auto-selection.
        if (frameNo % 10 === 0 && player.pos.z < 6) { let best = null, bd = 99; Object.keys(stations).forEach(k => { const d = Math.abs(player.pos.x - (stations[k].x + 0.6)); if (d < bd) { bd = d; best = k; } }); if (best && bd < 4 && best !== S.exp) ACT.setBench(best); }
      }
      hand.position.y = -0.33 + (reduced ? 0 : Math.sin(player.bob * 0.5) * 0.008);
      if (frameNo % 4 === 0) { const h = wt ? null : pickAt(0, 0), t = aimText(h); const key = t || ''; if (key !== aimKey) { aimKey = key; rt.aim = t; ACT.aimChanged(); } }
    } else {
      if (tween) { let k = Math.min(1, (now - tween.t0) / tween.dur); const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        camera.position.lerpVectors(tween.p0, tween.p1, e); controls.target.lerpVectors(tween.q0, tween.q1, e); camera.lookAt(controls.target); if (k >= 1) { tween = null; controls.enabled = true; } }
      else { controls.enabled = true; controls.update(); }
      if (aimKey) { aimKey = null; rt.aim = null; ACT.aimChanged(); }
    }
    Object.keys(stations).forEach(k => { const st = stations[k], active = k === S.exp;
      const target = st.closed ? 0 : 0.62; st.arm.rotation.z += (target - st.arm.rotation.z) * Math.min(1, dt * 14);
      const pulse = 0.5 + 0.22 * Math.sin(now / 240); st.padR.material.opacity = pulse; if (st.padD) st.padD.material.opacity = pulse;
      const L = st.plen[st.plen.length - 1], off = (now / 1000 * 1.5) % L;
      st.dots.forEach((d, i) => { d.visible = st.flow; if (!st.flow) return; let s = (off + i / st.dots.length * L) % L, j = 1; while (st.plen[j] < s) j++; d.position.lerpVectors(st.path[j - 1], st.path[j], (s - st.plen[j - 1]) / (st.plen[j] - st.plen[j - 1])); });
      if (st.led) { const flash = now < st.flashUntil, want = flash ? 1.7 : st.bright; st.led.cur += (want - st.led.cur) * Math.min(1, dt * (flash ? 30 : 9)); const v = st.led.cur;
        st.led.m.emissiveIntensity = v * 0.75; st.led.glow.material.opacity = Math.min(1, v * 0.95); const gs = 0.25 + v * 0.75; st.led.glow.scale.set(gs, gs, 1); st.led.light.intensity = v * 2.2; }
      const age = (now - st.smokeT) / 1000;
      st.smoke.forEach((sp, i) => { const a = age - i * 0.12; if (!st.smokeT || a < 0 || a > 1.9) { sp.visible = false; return; } sp.visible = true; sp.position.set(xR + Math.sin(i * 2.1 + a * 2) * 0.09, 1.55 + a * 0.55, Math.cos(i * 1.7) * 0.06); const s = 0.22 + a * 0.3; sp.scale.set(s, s, 1); sp.material.opacity = 0.75 * (1 - a / 1.9); });
      if (k === 'rc' && active && rt.scope) { const t = Math.max(.1,rt.scope.tau*5) * scopeP(), b = S.bench.rc; st.dLabel.set(partLabel(b.D) + ' · ' + fmtV(rt.scope.V * (1 - Math.exp(-t / rt.scope.tau)))); st.amm.set(fmtI(rt.scope.V / rt.scope.R * Math.exp(-t / rt.scope.tau)), '#F2B705');
        if (!rt.scope.done || st.drawnDone !== rt.scope) { drawScreen(st); st.stex.needsUpdate = true; if (rt.scope.done) st.drawnDone = rt.scope; } }
    });
    bot.position.x += (stations[S.exp].x + 2.4 - bot.position.x) * Math.min(1, dt * 3.2); bot.position.y = 2.5 + (reduced ? 0 : Math.sin(now / 620) * 0.05);
    const mt = rt.speaking ? 1 + 2.2 * Math.abs(Math.sin(now / 85)) : 0.6; mouth.scale.y += (mt - mouth.scale.y) * Math.min(1, dt * 22);
    lampM.color.setHex(rt.speaking ? 0xFFD34D : 0x8FA6B0); lamp.scale.setScalar(rt.speaking ? 1.25 : 1); jet.material.opacity = 0.6 + 0.2 * Math.sin(now / 130);
    renderer.render(scene, camera);
  }
  let dead = false, raf = 0;
  resize(); goTo(S.exp, false); if (S.mode === 'walk') walkTo(S.exp, 0); sync(); raf = requestAnimationFrame(frame);
  return {sync, goTo, setInsets, flyIn, useAim, destroy(){ dead = true; window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('blur', kclear); cancelAnimationFrame(raf); if (ro) ro.disconnect(); else window.removeEventListener('resize', resize); controls.dispose();const geos=new Set(),mats=new Set(),textures=new Set();scene.traverse(o=>{if(o.geometry)geos.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])if(m){mats.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());renderer.dispose(); renderer.forceContextLoss(); el.remove(); }, redraw(){ labels.forEach(l => { l.reset(); if (l.text !== undefined) l.set(l.text, l.color); }); Object.keys(stations).forEach(k => { stations[k].key = null; }); sync(); }};
}
