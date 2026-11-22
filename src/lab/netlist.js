// Netlist tools shared by the chat (schematic card), the custom lab panels and the custom 3D bench.
// A netlist is { title, summary, ground_net, components:[{id,type,value,nodes:[a,b],state,polarized}], steps, answer, uncertain }.
// Node order: battery [+,-]; led/diode [anode,cathode]; polarized capacitor [+,-]; current_source [from,to] (arrow direction).

const BAND = ['#1A1A1A', '#7A4A21', '#D0312D', '#E8731A', '#F2C200', '#2E9E4F', '#2B63C9', '#7F4FBF', '#8C8C8C', '#FFFFFF'];
export function bands(o) {
  if (!(o >= 10)) return null;
  let e = Math.floor(Math.log10(o)) - 1, two = Math.round(o / Math.pow(10, e));
  if (two >= 100) { two = 10; e++; }
  if (e > 9) return null;
  return [BAND[Math.floor(two / 10)], BAND[two % 10], BAND[e]];
}

const MULT = { p: 1e-12, n: 1e-9, u: 1e-6, 'µ': 1e-6, 'μ': 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9 };
export function parseVal(s) {
  if (s == null) return NaN;
  const str = String(s).replace(/,/g, '').replace(/ohms?|Ω|ω/ig, '');
  const m = str.match(/^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*([pnuµμmkKMG])?/);
  if (!m) return NaN;
  return parseFloat(m[1]) * (m[2] ? MULT[m[2]] : 1);
}
export function si(x, unit) {
  if (x == null || !isFinite(x)) return '–';
  const a = Math.abs(x); if (a === 0) return '0 ' + unit;
  for (const [f, p] of [[1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n']]) if (a >= f * 0.9995) return +(x / f).toPrecision(3) + ' ' + p + unit;
  return x.toExponential(1) + ' ' + unit;
}
export const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const TYPES = ['battery', 'resistor', 'led', 'diode', 'capacitor', 'inductor', 'switch', 'ammeter', 'voltmeter', 'lamp', 'current_source', 'wire', 'other'];

// Accepts whatever the server sends and returns a clean netlist, or null when there is nothing to build.
export function normalize(nl) {
  if (!nl || !Array.isArray(nl.components)) return null;
  const comps = nl.components.map((c, i) => ({
    id: String(c.id || 'X' + (i + 1)), type: TYPES.includes(c.type) ? c.type : 'other', value: c.value == null ? null : String(c.value),
    nodes: (c.nodes || []).slice(0, 2).map(String), state: c.state || null, polarized: !!c.polarized
  })).filter(c => c.nodes.length === 2);
  if (!comps.length) return null;
  return { title: nl.title || 'Circuit', summary: nl.summary || '', ground_net: String(nl.ground_net == null ? '0' : nl.ground_net), components: comps,
    steps: Array.isArray(nl.steps) ? nl.steps.map(String) : [], answer: nl.answer == null ? null : String(nl.answer), uncertain: Array.isArray(nl.uncertain) ? nl.uncertain.map(String) : [] };
}

/* ---------- DC solver (modified nodal analysis) ---------- */
export function solveDC(nl) {
  const gnd = String(nl.ground_net == null ? '0' : nl.ground_net), comps = nl.components, notes = [];
  const nets = [...new Set(comps.flatMap(c => c.nodes.map(String)))].filter(n => n !== gnd), idx = {}; nets.forEach((n, i) => { idx[n] = i; });
  const leds = comps.filter(c => c.type === 'led' || c.type === 'diode').map(c => ({ c, on: true }));
  for (let pass = 0; pass < 8; pass++) {
    const R = [], VS = [], IS = [];
    comps.forEach(c => {
      const a = String(c.nodes[0]), b = String(c.nodes[1]), v = parseVal(c.value);
      switch (c.type) {
        case 'resistor': case 'lamp': if (v > 0) R.push({ c, a, b, g: 1 / v }); else if (pass === 0) notes.push(c.id + ': no usable resistance value, left out of the solution.'); break;
        case 'battery': if (isFinite(v)) VS.push({ c, a, b, v }); else if (pass === 0) notes.push(c.id + ': no voltage value, left out of the solution.'); break;
        case 'current_source': if (isFinite(v)) IS.push({ c, a, b, i: v }); else if (pass === 0) notes.push(c.id + ': no current value, left out of the solution.'); break;
        case 'switch': if (/clos|on/i.test(c.state || '')) VS.push({ c, a, b, v: 0 }); break;
        case 'ammeter': case 'wire': case 'inductor': VS.push({ c, a, b, v: 0 }); break;
        case 'led': case 'diode': { const L = leds.find(l => l.c === c); if (L.on) VS.push({ c, a, b, v: c.type === 'led' ? (v > 0 && v < 10 ? v : 2.0) : 0.7, diode: L }); break; }
        default: break;
      }
    });
    const n = nets.length, m = VS.length, N = n + m, A = Array.from({ length: N }, () => new Float64Array(N + 1));
    const ix = k => (k === gnd ? -1 : idx[k]);
    R.forEach(r => { const i = ix(r.a), j = ix(r.b); if (i >= 0) A[i][i] += r.g; if (j >= 0) A[j][j] += r.g; if (i >= 0 && j >= 0) { A[i][j] -= r.g; A[j][i] -= r.g; } });
    IS.forEach(s => { const i = ix(s.a), j = ix(s.b); if (i >= 0) A[i][N] -= s.i; if (j >= 0) A[j][N] += s.i; });
    VS.forEach((s, k) => { const r = n + k, i = ix(s.a), j = ix(s.b); if (i >= 0) { A[i][r] += 1; A[r][i] += 1; } if (j >= 0) { A[j][r] -= 1; A[r][j] -= 1; } A[r][N] = s.v; });
    for (let i = 0; i < n; i++) A[i][i] += 1e-12;
    for (let c = 0; c < N; c++) {
      let p = c; for (let r = c + 1; r < N; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-14) return { error: 'The circuit has no unique DC solution (check for loops of ideal sources, a shorted source or missing connections).', notes };
      const t = A[c]; A[c] = A[p]; A[p] = t;
      for (let r = 0; r < N; r++) if (r !== c) { const f = A[r][c] / A[c][c]; if (f) for (let k = c; k <= N; k++) A[r][k] -= f * A[c][k]; }
    }
    const sol = A.map((row, i) => row[N] / row[i]), V = k => (k === gnd ? 0 : sol[idx[k]]);
    let flipped = false;
    VS.forEach((s, k) => { if (s.diode && sol[n + k] < -1e-9) { s.diode.on = false; flipped = true; } });
    if (flipped) continue;
    const z = (x, t) => (x != null && Math.abs(x) < t ? 0 : x);
    const rows = comps.map(c => {
      const a = String(c.nodes[0]), b = String(c.nodes[1]); let vd = V(a) - V(b), I = null, role = 'dissipates', P = null;
      const r = R.find(q => q.c === c), s = VS.find(q => q.c === c), q = IS.find(w => w.c === c);
      if (r) I = vd * r.g; else if (s) I = sol[n + VS.indexOf(s)]; else if (q) I = q.i;
      else if (c.type === 'capacitor' || c.type === 'voltmeter' || c.type === 'led' || c.type === 'diode' || c.type === 'switch') I = 0;
      vd = z(vd, 1e-6); I = z(I, 1e-10);
      const Iab = I; // conventional current from the first node to the second through the part
      if (I != null) {
        P = vd * I;
        if (c.type === 'battery') { role = 'supplies'; P = -P; I = -I; }                 // show the current it delivers
        else if (c.type === 'current_source') { role = 'supplies'; vd = -vd; P = vd * I; } // show the voltage it develops
        P = z(P, 1e-12);
      }
      const off = (c.type === 'led' || c.type === 'diode') && !s;
      return { c, vd, I, Iab, P, role, off };
    });
    leds.filter(l => !l.on).forEach(l => notes.push(l.c.id + ' is reverse-biased or has too little voltage, so it stays off.'));
    const volts = {}; nets.forEach(k => { volts[k] = z(V(k), 1e-9); }); volts[gnd] = 0;
    return { rows, notes, volts };
  }
  return { error: 'The solver did not settle.', notes };
}

/* ---------- layout: the same ladder layout for the schematic and the 3D bench ---------- */
// Returns polylines in schematic units. Non-ground nets sit on a top row, ground is a rail underneath.
export function layout(nl) {
  const comps = nl.components, gnd = String(nl.ground_net == null ? '0' : nl.ground_net), isG = n => n === gnd;
  const all = [...new Set(comps.flatMap(c => c.nodes.map(String)))].filter(n => !isG(n));
  const adj = {}; all.forEach(n => { adj[n] = []; });
  comps.forEach(c => { const [a, b] = c.nodes.map(String); if (!isG(a) && !isG(b) && a !== b) { adj[a].push(b); adj[b].push(a); } });
  const src = comps.find(c => c.type === 'battery' || c.type === 'current_source');
  const startNet = (src && !isG(String(src.nodes[0])) ? String(src.nodes[0]) : null) || all[0];
  const order = [], seen = new Set();
  const bfs = s => { if (s == null || seen.has(s)) return; seen.add(s); const q = [s]; while (q.length) { const n = q.shift(); order.push(n); adj[n].forEach(m => { if (!seen.has(m)) { seen.add(m); q.push(m); } }); } };
  bfs(startNet); all.forEach(bfs);
  const gEdges = {}; order.forEach(n => { gEdges[n] = []; });
  const nEdges = [], skipped = [];
  comps.forEach(c => {
    const [a, b] = c.nodes.map(String);
    if (a === b || (isG(a) && isG(b))) { skipped.push(c); return; }
    if (isG(a)) gEdges[b].push({ c, from: 'g' }); else if (isG(b)) gEdges[a].push({ c, from: 'n' }); else nEdges.push(c);
  });
  const X0 = 90, PX = 100, GAP = 130, x = {}; let cx = X0;
  order.forEach(n => { x[n] = cx; cx += Math.max(GAP, Math.max(1, gEdges[n].length) * PX + 30); });
  const maxX = Math.max(X0, ...order.map(n => x[n] + Math.max(0, gEdges[n].length - 1) * PX));
  const col = n => order.indexOf(n), usedTop = {}, arcs = [];
  const level = new Map();
  nEdges.forEach(c => {
    const [a, b] = c.nodes.map(String), i = col(a), j = col(b), lo = Math.min(i, j), hi = Math.max(i, j), key = lo + ':' + hi;
    let lv = 0;
    if (hi - lo === 1 && !usedTop[key]) usedTop[key] = 1;
    else { lv = 1; while (arcs.some(r => r.level === lv && !(hi <= r.lo || lo >= r.hi))) lv++; arcs.push({ lo, hi, level: lv }); }
    level.set(c, lv);
  });
  const maxLevel = Math.max(0, ...nEdges.map(c => level.get(c))), LV = 52, T = 60 + maxLevel * LV, B = T + 170;
  const items = [], degree = {}, dots = [];
  const place = (c, pts) => {
    let bi = 0, bl = -1;
    for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); if (l > bl) { bl = l; bi = i; } }
    const p = pts[bi], q = pts[bi + 1], dx = (q[0] - p[0]) / bl, dy = (q[1] - p[1]) / bl, mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    const p1 = [...pts.slice(0, bi + 1), [mx - dx * 30, my - dy * 30]], p2 = [[mx + dx * 30, my + dy * 30], ...pts.slice(bi + 1)];
    items.push({ c, pts, mx, my, dx, dy, ang: Math.atan2(dy, dx) * 180 / Math.PI, vertical: Math.abs(dy) > 0.5, wires: [p1, p2] });
  };
  order.forEach(n => gEdges[n].forEach((e, k) => {
    const px = x[n] + k * PX, pts = [[x[n], T], [px, T], [px, B]];
    place(e.c, e.from === 'n' ? pts : pts.slice().reverse());
    degree[n] = (degree[n] || 0) + 1; if (k > 0) dots.push([x[n], T]); dots.push([px, B]);
  }));
  nEdges.forEach(c => {
    const [a, b] = c.nodes.map(String), xa = x[a], xb = x[b], lv = level.get(c);
    place(c, lv === 0 ? [[xa, T], [xb, T]] : [[xa, T], [xa, T - lv * LV], [xb, T - lv * LV], [xb, T]]);
    degree[a] = (degree[a] || 0) + 1; degree[b] = (degree[b] || 0) + 1;
  });
  const hasG = order.some(n => gEdges[n].length);
  const netLabels = [];
  order.forEach(n => { if (degree[n] >= 3 || (gEdges[n].length >= 1 && degree[n] >= 2)) dots.push([x[n], T]); netLabels.push({ n, x: x[n] - 8, y: T - 10 }); });
  const W = Math.max(maxX, ...order.map(n => x[n])) + 90, H = hasG ? B + 44 : T + 60;
  return { items, dots, netLabels, skipped, hasG, rail: hasG ? { x0: X0, x1: maxX, y: B } : null, W, H, T, B, x, order };
}

/* ---------- 2D schematic (SVG string) in Sim2Skill's drawing style ---------- */
function symbol(c) {
  const lead = (x1, x2) => `<path class="wire" d="M${x1} 0 H${x2}"/>`, v = parseVal(c.value);
  switch (c.type) {
    case 'resistor': {
      const b = bands(v), w = 44, h = 16;
      let s = lead(-30, -22) + lead(22, 30) + `<rect class="body" x="-22" y="-8" width="${w}" height="${h}" rx="6.7"/>`;
      if (b) s += b.map((col, i) => `<rect x="${-22 + w * 0.14 + i * w * 0.15}" y="-7" width="${w * 0.085}" height="${h - 2}" fill="${col}"/>`).join('') + `<rect x="${-22 + w * 0.78}" y="-7" width="${w * 0.085}" height="${h - 2}" fill="#C9A227"/>`;
      return s;
    }
    case 'battery': return lead(-30, -5) + lead(5, 30) + `<line class="plate" x1="-5" y1="-15" x2="-5" y2="15" style="stroke-width:3"/><line class="plate" x1="5" y1="-8" x2="5" y2="8" style="stroke-width:6"/>`;
    case 'led': case 'diode': {
      let s = lead(-30, -9) + lead(11, 30) + `<polygon class="sym${c.type === 'led' ? ' led' : ''}" points="-9,-12 -9,12 11,0"/><line class="sym" x1="11" y1="-12" x2="11" y2="12"/>`;
      if (c.type === 'led') s += `<path class="wire" style="stroke:#FF4B3A;stroke-width:2" d="M2 -17 l9 -9 M10 -13 l9 -9"/>`;
      return s;
    }
    case 'capacitor': return lead(-30, -4) + lead(4, 30) + `<line class="plate" x1="-4" y1="-14" x2="-4" y2="14"/><line class="plate" x1="4" y1="-14" x2="4" y2="14"/>`;
    case 'inductor': return lead(-30, -22) + lead(22, 30) + `<path class="wire" d="M-22 0 a5.5 7 0 0 1 11 0 a5.5 7 0 0 1 11 0 a5.5 7 0 0 1 11 0 a5.5 7 0 0 1 11 0"/>`;
    case 'switch': { const open = !/clos|on/i.test(c.state || ''); return lead(-30, -20) + lead(20, 30) + `<circle cx="-20" cy="0" r="3.5" class="dot"/><circle cx="20" cy="0" r="3.5" class="dot"/>` + (open ? `<path class="wire" d="M-20 0 L16 -16"/>` : `<path class="wire" d="M-20 0 H20"/>`); }
    case 'ammeter': case 'voltmeter': case 'lamp': case 'current_source': {
      const txt = c.type === 'ammeter' ? 'A' : c.type === 'voltmeter' ? 'V' : '';
      let s = lead(-30, -18) + lead(18, 30) + `<circle class="meterc" r="18"/>`;
      if (txt) s += `<text class="st" y="6" text-anchor="middle" style="font-size:17px;font-weight:600">${txt}</text>`;
      if (c.type === 'lamp') s += `<path class="wire" d="M-12 -12 L12 12 M12 -12 L-12 12"/>`;
      if (c.type === 'current_source') s += `<path class="wire" d="M-9 0 H9 M3 -6 L9 0 L3 6"/>`;
      return s;
    }
    case 'wire': return lead(-30, 30);
    default: return lead(-30, -22) + lead(22, 30) + `<rect class="meterc" x="-22" y="-11" width="44" height="22" rx="4"/><text class="st2" y="4" text-anchor="middle">${esc(c.id).slice(0, 6)}</text>`;
  }
}

export function schematicSVG(nl, opts) {
  const L = layout(nl), o = opts || {}; let wires = '', parts = '', labels = '', dots = '', netLabels = '';
  L.items.forEach(it => {
    const d = P => 'M' + P.map(z => z[0] + ' ' + z[1]).join(' L');
    wires += `<path class="wire" d="${d(it.wires[0])}"/><path class="wire" d="${d(it.wires[1])}"/>`;
    parts += `<g transform="translate(${it.mx} ${it.my}) rotate(${it.ang})">${symbol(it.c)}</g>`;
    const c = it.c, val = esc(c.value || (c.type === 'switch' ? (c.state || 'open') : ''));
    if (it.vertical) labels += `<text class="st" x="${it.mx + 38}" y="${it.my - 3}">${esc(c.id)}</text><text class="stm" x="${it.mx + 38}" y="${it.my + 13}">${val}</text>`;
    else labels += `<text class="st" x="${it.mx}" y="${it.my - 24}" text-anchor="middle">${esc(c.id)}</text><text class="stm" x="${it.mx}" y="${it.my + 34}" text-anchor="middle">${val}</text>`;
    if (c.type === 'battery' || (c.type === 'capacitor' && c.polarized)) labels += `<text class="st" x="${it.mx - it.dx * 24 + it.dy * 14 - 4}" y="${it.my - it.dy * 24 - it.dx * 14 + 5}">+</text>`;
  });
  if (L.rail) { const g = L.rail.x1, B = L.rail.y;
    wires += `<path class="wire" d="M${L.rail.x0} ${B} H${g} M${g} ${B} V${B + 14}"/><path class="wire" d="M${g - 14} ${B + 14} H${g + 14} M${g - 9} ${B + 20} H${g + 9} M${g - 4} ${B + 26} H${g + 4}"/>`; }
  L.dots.forEach(p => { dots += `<circle class="dot" cx="${p[0]}" cy="${p[1]}" r="4"/>`; });
  L.netLabels.forEach(n => { netLabels += `<text class="st2" x="${n.x}" y="${n.y}" text-anchor="end">${esc(n.n)}</text>`; });
  const warn = L.skipped.length ? `<text class="st2" x="12" y="${L.H - 8}" style="fill:var(--warn)">Not drawn (shorted or invalid): ${L.skipped.map(c => esc(c.id)).join(', ')}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L.W} ${L.H}" role="img" aria-label="${esc(o.label || 'Circuit schematic')}">${wires}${parts}${dots}${labels}${netLabels}${warn}</svg>`;
}
