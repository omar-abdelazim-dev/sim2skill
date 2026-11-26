import CORE from './core.js';
import { S, rt, shown, scopeP } from './store.js';
const {PARTS, EXPERIMENTS, partLabel, fmtI, fmtV, fmtT} = CORE;

const BAND = ['#1A1A1A','#7A4A21','#D0312D','#E8731A','#F2C200','#2E9E4F','#2B63C9','#7F4FBF','#8C8C8C','#FFFFFF'];
// Two significant digits and a multiplier. Below 10 Ω the multiplier band is gold (×0.1).
export function bands(ohms){ let e = Math.floor(Math.log10(ohms)) - 1, two = Math.round(ohms / Math.pow(10, e)); if (two >= 100) { two = Math.round(two / 10); e += 1; } return [BAND[Math.floor(two / 10)], BAND[two % 10], e < 0 ? '#C9A227' : BAND[e]]; }

// Draws the scope grid and trace into any 2D context, inside the rectangle x0,y0,w,h.
export function plotScope(g, x0, y0, w, h, c, fs, sc){
  const pl = fs * 2.8, pr = fs * 3.8, pt = fs * 0.9, pb = fs * 2, pw = w - pl - pr, ph = h - pt - pb, X = t => x0 + pl + t / (sc?Math.max(.1,sc.tau*5):5) * pw, Y = v => y0 + pt + ph - v / (sc?.V||5) * ph;
  g.font = `${fs}px "IBM Plex Mono", monospace`; g.lineWidth = Math.max(1, fs / 11); g.strokeStyle = c.line; g.fillStyle = c.dim; g.textBaseline = 'alphabetic';
  const tEnd=sc?Math.max(.1,sc.tau*5):5,vEnd=sc?.V||5;
  for (let i = 0; i <= 5; i++) { g.beginPath(); g.moveTo(X(i*tEnd/5), Y(vEnd)); g.lineTo(X(i*tEnd/5), Y(0)); g.stroke(); g.beginPath(); g.moveTo(X(0), Y(i*vEnd/5)); g.lineTo(X(tEnd), Y(i*vEnd/5)); g.stroke();
    g.textAlign = 'center'; g.fillText((i*tEnd/5).toFixed(2) + ' s', X(i*tEnd/5), Y(0) + fs * 1.4); g.textAlign = 'right'; g.fillText((i*vEnd/5).toFixed(1) + ' V', X(0) - fs * 0.45, Y(i*vEnd/5) + fs * 0.35); }
  const v63 = vEnd * (1 - Math.exp(-1));
  g.setLineDash([fs * 0.45, fs * 0.36]); g.strokeStyle = c.dim; g.beginPath(); g.moveTo(X(0), Y(v63)); g.lineTo(X(tEnd), Y(v63)); g.stroke(); g.setLineDash([]);
  g.textAlign = 'left'; g.fillText('63%', X(tEnd) + fs * 0.45, Y(v63) + fs * 0.35);
  if (!sc) return;
  const tmax = tEnd * scopeP();
  g.strokeStyle = c.trace; g.lineWidth = Math.max(2.5, fs / 4.4); g.lineJoin = 'round'; g.beginPath();
  for (let i = 0; i <= 200; i++) { const t = tmax * i / 200, v = sc.V * (1 - Math.exp(-t / sc.tau)); if (i) g.lineTo(X(t), Y(v)); else g.moveTo(X(t), Y(v)); }
  g.stroke();
  if (sc.tau <= tmax) { g.fillStyle = c.ink; g.beginPath(); g.arc(X(sc.tau), Y(v63), fs * 0.41, 0, 7); g.fill();
    g.textAlign = sc.tau > 4 ? 'right' : 'left'; g.fillText(fmtT(sc.tau), X(sc.tau) + (sc.tau > 4 ? -fs * 0.7 : fs * 0.7), Y(v63) + fs * 1.4); }
}

export function resistorG(x, y, w, h, ohms){ const c = bands(ohms), bw = w * 0.085;
  return `<rect class="body" x="${x}" y="${y}" width="${w}" height="${h}" rx="${h * 0.42}"/>` +
    c.map((col, i) => `<rect x="${x + w * 0.14 + i * w * 0.15}" y="${y + 1}" width="${bw}" height="${h - 2}" fill="${col}"/>`).join('') +
    `<rect x="${x + w * 0.78}" y="${y + 1}" width="${bw}" height="${h - 2}" fill="#C9A227"/>`; }

export function benchSVG(){
  const exp = S.exp, E = EXPERIMENTS[exp], b = S.bench[exp], sim = shown();
  const hasD = E.slots.length > 1, L = 44, R = 356, T = 56, B = 226;
  const flowing = S.closed && sim && sim.status === 'ok' && sim.I > 0 && !sim.burn && !b.burnt && (exp !== 'rc' || (rt.scope && !rt.scope.done));
  let s = `<svg viewBox="0 0 400 290" role="group" aria-label="Circuit: battery, switch${E.slots.map(x => ', ' + x.name.toLowerCase() + ' slot').join('')} and ammeter">`;
  s += `<path class="wire" d="M${L} 128 V${T} H78"/><path class="wire" d="M128 ${T} H160"/><path class="wire" d="M280 ${T} H${R} V${hasD ? 96 : B}"/>`;
  if (hasD) s += `<path class="wire" d="M${R} 196 V${B}"/>`;
  s += `<path class="wire" d="M${R} ${B} H222"/><path class="wire" d="M178 ${B} H${L} V150"/>`;
  if (flowing) s += `<path class="flow" d="M${L} 128 V${T} H${R} ${exp === 'rc' ? `V140 M${R} 152 ` : ''}V${B} H${L} V150"/>`;
  s += `<line class="plate" x1="26" y1="128" x2="62" y2="128" style="stroke-width:3"/><line class="plate" x1="35" y1="150" x2="53" y2="150" style="stroke-width:6"/>`;
  s += `<text class="st" x="10" y="132">+</text><text class="st" x="11" y="155">−</text><text class="stm" x="72" y="144">${fmtV(b.V)}</text>`;
  s += `<line class="wire" x1="78" y1="${T}" x2="${S.closed ? 128 : 122}" y2="${S.closed ? T : 34}"/><circle cx="78" cy="${T}" r="4" fill="var(--ink)"/><circle cx="128" cy="${T}" r="4" fill="var(--ink)"/>`;
  s += `<text class="st2" x="103" y="78" text-anchor="middle">${S.closed ? 'closed' : 'open'}</text>`;
  s += `<rect class="hit" id="hit-sw" x="66" y="22" width="74" height="60" rx="8" tabindex="0" role="button" data-act="sw" aria-label="${S.closed ? 'Open' : 'Close'} the switch"/>`;
  const rp = b.R ? CORE.effective(b.R, b, 'R') : null;
  if (!rp) s += `<rect class="slot-empty" x="164" y="34" width="112" height="44" rx="8"/><text class="st" x="220" y="54" text-anchor="middle">Resistor</text><text class="st2" x="220" y="69" text-anchor="middle">empty slot</text>`;
  else if (rp.kind === 'wire') s += `<path class="wire" d="M160 ${T} H280"/><text class="stm" x="220" y="44" text-anchor="middle">wire</text>`;
  else s += `<path class="wire" d="M160 ${T} H190 M250 ${T} H280"/>${resistorG(190, 45, 60, 22, rp.ohms)}<text class="stm" x="220" y="32" text-anchor="middle">${CORE.partText(b.R, b, 'R')}</text>`;
  if (S.active === 'R') s += `<rect class="slot-active" x="154" y="14" width="132" height="72" rx="10"/>`;
  s += `<rect class="hit" id="hit-R" x="156" y="16" width="128" height="68" rx="8" tabindex="0" role="button" data-act="slot" data-id="R" aria-label="Resistor slot: ${rp ? CORE.partText(b.R, b, 'R') : 'empty'}"/>`;
  if (hasD) {
    const dp = b.D ? CORE.effective(b.D, b, 'D') : null, name = E.slots[1].name;
    if (!dp) s += `<rect class="slot-empty" x="326" y="102" width="60" height="88" rx="8"/><text class="st2" x="356" y="143" text-anchor="middle" style="font-size:12px;fill:var(--ink)">${name}</text><text class="st2" x="356" y="158" text-anchor="middle">empty</text>`;
    else if (dp.kind === 'led') {
      const lit = S.closed && sim && sim.lit && !b.burnt;
      s += `<path class="wire" d="M${R} 96 V132 M${R} 160 V196"/>`;
      if (lit) s += `<circle class="glow" cx="356" cy="146" r="${14 + 14 * sim.bright}" opacity="${0.25 + 0.55 * sim.bright}"/>`;
      s += `<g${b.reversed ? ' transform="rotate(180 356 146)"' : ''}><polygon class="sym${b.burnt ? ' dead' : lit ? ' lit' : ''}" points="341,132 371,132 356,158"/><line class="sym" x1="341" y1="160" x2="371" y2="160"/></g>`;
      if (lit) s += `<path class="wire" style="stroke:#FF4B3A;stroke-width:2" d="M378 138 l11 -9 M378 151 l11 -9"/>`;
      s += `<text class="st" x="308" y="143" text-anchor="end">Red LED</text><text class="st2${b.burnt ? ' crit-t' : ''}" x="308" y="158" text-anchor="end">${b.burnt ? 'burnt out' : b.reversed ? 'flipped' : 'anode on top'}</text>`;
    } else {
      s += `<path class="wire" d="M${R} 96 V140 M${R} 152 V196"/><line class="plate" x1="336" y1="140" x2="376" y2="140"/><line class="plate" x1="336" y1="152" x2="376" y2="152"/>`;
      s += `<text class="st" x="388" y="${b.reversed ? 166 : 136}" text-anchor="middle" style="font-size:15px">+</text>`;
      s += `<text class="stm" x="308" y="143" text-anchor="end">${partLabel(b.D)}</text><text class="st2" x="308" y="158" text-anchor="end">${b.reversed ? '+ side down' : '+ side up'}</text>`;
    }
    if (S.active === 'D') s += `<rect class="slot-active" x="316" y="90" width="80" height="112" rx="10"/>`;
    s += `<rect class="hit" id="hit-D" x="318" y="92" width="76" height="108" rx="8" tabindex="0" role="button" data-act="slot" data-id="D" aria-label="${name} slot: ${dp ? partLabel(b.D) : 'empty'}"/>`;
  }
  const reading = sim ? fmtI(sim.burn || b.burnt ? 0 : (exp === 'rc' ? 0 : sim.I)) : '';
  s += `<circle class="meterc" cx="200" cy="${B}" r="22"/><text class="st" x="200" y="${B + 6}" text-anchor="middle" style="font-size:17px;font-weight:600">A</text>`;
  if (exp !== 'rc') s += `<text class="stm" x="200" y="270" text-anchor="middle">${sim ? reading : 'ammeter'}</text>`;
  else s += `<text class="st2" x="200" y="270" text-anchor="middle">ammeter</text>`;
  return s + '</svg>';
}

export function partIcon(id){ const p = PARTS[id];
  if (p.kind === 'res') return `<svg viewBox="0 0 40 16" aria-hidden="true"><line class="wire" x1="0" y1="8" x2="40" y2="8" style="stroke-width:1.5"/>${resistorG(6, 2, 28, 12, p.ohms)}</svg>`;
  if (p.kind === 'wire') return `<svg viewBox="0 0 40 16" aria-hidden="true"><line class="wire" x1="2" y1="8" x2="38" y2="8"/></svg>`;
  if (p.kind === 'diode') return `<svg viewBox="0 0 40 16" aria-hidden="true"><path d="M2 8 H14 M26 8 H38 M14 2 L25 8 14 14 Z M26 1 V15" stroke="#d9e9ef" fill="#668798" stroke-width="2"/></svg>`;
  if (p.kind === 'led') return `<svg viewBox="0 0 40 16" aria-hidden="true"><line class="wire" x1="2" y1="8" x2="38" y2="8" style="stroke-width:1.5"/><polygon points="14,2 14,14 25,8" fill="#FF4B3A" stroke="var(--ink)" stroke-width="1.5"/><line class="wire" x1="26" y1="2" x2="26" y2="14" style="stroke-width:2"/></svg>`;
  return `<svg viewBox="0 0 40 16" aria-hidden="true"><path class="wire" style="stroke-width:1.5" d="M2 8 H17 M23 8 H38"/><path class="wire" style="stroke-width:3" d="M17 2 V14 M23 2 V14"/></svg>`; }

