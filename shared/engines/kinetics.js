// Reaction kinetics engine: integrated rate laws (orders 0, 1, 2) and the Arrhenius equation.
// The student runs the reaction at several temperatures, finds the order from which plot is linear
// ([A], ln[A] or 1/[A] against t), takes k from each slope, then Ea from ln k against 1/T.
import DATA from '../data/reagents.json' with { type: 'json' };

export const REACTIONS = DATA.reactions;
const R = 8.314; // J mol⁻¹ K⁻¹
const T25 = 298.15;

export function defaultConfig() {
  const r = REACTIONS.crystal_violet;
  return { reaction: 'crystal_violet', k25: r.k25.default, EaKJ: r.EaKJ, c0: r.c0.default, temperatures: [15, 25, 35, 45], tolerance: 10 };
}
const num = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;
function check(cond, msg) { if (!cond) throw Error(msg); }

export function validateConfig(_t, config) {
  const c = structuredClone(config || defaultConfig()), r = REACTIONS[c.reaction];
  check(r, 'Choose a reaction from the list.');
  check(num(c.k25, r.k25.min, r.k25.max), `For this reaction, k at 25 °C must be between ${r.k25.min} and ${r.k25.max} ${r.unit}.`);
  check(num(c.EaKJ, r.EaKJ * 0.9, r.EaKJ * 1.1), `Keep Ea within 10% of the literature value (${r.EaKJ} kJ/mol).`);
  check(num(c.c0, r.c0.min, r.c0.max), `Starting concentration must be between ${r.c0.min} and ${r.c0.max} mol/L.`);
  check(Array.isArray(c.temperatures) && c.temperatures.length >= 2 && c.temperatures.length <= 6 && new Set(c.temperatures).size === c.temperatures.length
    && c.temperatures.every(t => Number.isInteger(t) && t >= 5 && t <= 60), 'Offer 2–6 different whole-number temperatures between 5 and 60 °C.');
  check([5, 10, 15].includes(c.tolerance), 'Choose a tolerance of 5%, 10% or 15%.');
  c.temperatures.sort((a, b) => a - b);
  return c;
}

export const kAt = (c, tempC) => c.k25 * Math.exp(-(c.EaKJ * 1000 / R) * (1 / (tempC + 273.15) - 1 / T25));

export function concentration(order, c0, k, t) {
  if (order === 0) return Math.max(0, c0 - k * t);
  if (order === 1) return c0 * Math.exp(-k * t);
  return 1 / (1 / c0 + k * t);
}

// Time for [A] to fall to 25% of c0 at the coldest temperature, so every run shows a clear curve.
function duration(c) {
  const order = REACTIONS[c.reaction].order, k = kAt(c, c.temperatures[0]);
  const t = order === 0 ? 0.75 * c.c0 / k : order === 1 ? Math.log(4) / k : 3 / (c.c0 * k);
  return Math.round(t);
}

// Deterministic small measurement noise (±0.4 %) so repeated runs agree but data look real.
function noise(seed) {
  let x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 0.008;
}

export function run(c, tempC) {
  const r = REACTIONS[c.reaction], k = kAt(c, tempC), total = duration(c);
  const times = Array.from({ length: 11 }, (_, i) => Math.round(i * total / 10));
  const conc = times.map((t, i) => {
    const v = concentration(r.order, c.c0, k, t);
    return i === 0 ? v : Math.max(0, v * (1 + noise(tempC * 31 + i)));
  });
  return { temperature: tempC, times, conc };
}

// Least-squares line, used by the reference solution and offered to students as a plotting tool.
export function fitLine(xs, ys) {
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, r2: syy ? (sxy * sxy) / (sxx * syy) : 1 };
}
export const transform = (order, y) => (order === 0 ? y : order === 1 ? Math.log(y) : 1 / y);
export function kFromRun(order, data) {
  const pts = data.times.map((t, i) => [t, data.conc[i]]).filter(([, y]) => y > 0);
  const f = fitLine(pts.map(p => p[0]), pts.map(p => transform(order, p[1])));
  return order === 2 ? f.slope : -f.slope;
}
export function eaFromKs(points, celsius = false) {
  const f = fitLine(points.map(p => 1 / (p.T + (celsius ? 0 : 273.15))), points.map(p => Math.log(p.k)));
  return -f.slope * R / 1000;
}

export function goal(_t, config) {
  const c = config || defaultConfig(), r = REACTIONS[c.reaction];
  return `Find the reaction order and the activation energy (within ${c.tolerance}%) for: ${r.name}.`;
}
export function publicConfig(c) {
  if (!c) return c;
  const { k25, EaKJ, ...rest } = c;
  return rest;
}

export function referenceBench(c) {
  const order = REACTIONS[c.reaction].order;
  const ks = c.temperatures.map(T => ({ T, k: kFromRun(order, run(c, T)) }));
  return { runs: [...c.temperatures], order, eaKJ: +eaFromKs(ks).toFixed(1) };
}

export function checkPublishable(t, config) {
  const c = validateConfig(t, config);
  const r = evaluate(t, c, referenceBench(c));
  if (!r.success) throw Error('The reference solution does not pass. Offer temperatures further apart or a wider tolerance.');
  const bad = invariants(t, c);
  if (bad.length) throw Error('The simulation failed a consistency check: ' + bad[0]);
}

export function validateBench(_t, c, b) {
  const ok = b && Array.isArray(b.runs) && b.runs.length <= 6 && b.runs.every(T => c.temperatures.includes(T))
    && (b.order === null || [0, 1, 2].includes(b.order)) && (b.eaKJ === null || num(b.eaKJ, -1e7, 1e7));
  if (!ok) throw Error('Invalid kinetics record.');
}

export function evaluate(_t, c, b) {
  const truth = REACTIONS[c.reaction].order;
  const runs = [...new Set(b.runs)];
  const out = diagnosis => ({ result: { runs: runs.length }, diagnosis, success: diagnosis === 'success' });
  if (runs.length < 2) return out('need_more_temperatures');
  if (b.order === null || b.order === undefined) return out('no_order');
  if (b.order !== truth) return out('wrong_order');
  if (b.eaKJ === null || b.eaKJ === undefined) return out('no_activation_energy');
  const rel = x => Math.abs(x - c.EaKJ) / c.EaKJ;
  if (rel(b.eaKJ) <= c.tolerance / 100) return out(runs.length < 3 ? 'success_two_points' : 'success');
  const ratio = b.eaKJ / c.EaKJ, near = (x, y, tol = 0.1) => Math.abs(x / y - 1) < tol;
  if (near(ratio, 1 / Math.LN10)) return out('log10_instead_of_ln');
  if (near(ratio, 1000) || near(ratio, 0.001)) return out('kj_j_units');
  const ks = runs.map(T => ({ T, k: kAt(c, T) }));
  if (near(b.eaKJ, eaFromKs(ks, true), 0.15)) return out('celsius_used');
  return out('calculation_error');
}

const HINTS = {
  need_more_temperatures: ['Run the reaction at more than one temperature.', 'Ea comes from how k changes with T, so you need at least two temperatures; three or more give a reliable line.', 'Run every offered temperature, find k for each, then plot ln k against 1/T.'],
  no_order: ['Decide the order first: which plot of your data is a straight line?', 'Compare [A] vs t, ln[A] vs t and 1/[A] vs t.', 'Zero order: [A] vs t is linear. First order: ln[A] vs t. Second order: 1/[A] vs t.'],
  wrong_order: ['Look again at your three plots. Which one is really straight (R² closest to 1)?', 'Curvature in a plot means that order is wrong. Check the residuals, not just the start.', 'Choose the order whose plot gives R² nearest 1 for every temperature.'],
  no_activation_energy: ['Now find k at each temperature from the slope of the straight-line plot.', 'Plot ln k against 1/T (T in kelvin). The slope equals −Ea/R.', 'Ea = −slope × 8.314 J/(mol·K); divide by 1000 for kJ/mol.'],
  log10_instead_of_ln: ['Your Ea is too small by about 2.3. Which logarithm did you use?', 'The Arrhenius equation uses the natural log: ln k = ln A − Ea/(RT).', 'Use ln, or multiply a log10 slope by 2.303.'],
  kj_j_units: ['Your answer is off by a factor of 1000. Check J versus kJ.', 'R = 8.314 J/(mol·K) gives Ea in J/mol.', 'Divide by 1000 to report kJ/mol.'],
  celsius_used: ['Your Ea looks like it came from 1/T in degrees Celsius.', 'Temperatures in the Arrhenius equation must be absolute.', 'Convert: T(K) = T(°C) + 273.15, then redo the ln k vs 1/T plot.'],
  calculation_error: ['Recheck your k values and the Arrhenius plot step by step.', 'Is k taken from the slope with the right sign for your order? Is T in kelvin?', 'Ea = −(slope of ln k vs 1/T) × R. Check units at each step.'],
  success_two_points: ['Correct, from two temperatures. A third run would make the line more reliable.', 'Use all temperatures to see whether the Arrhenius plot is really straight.', 'With three points you can also judge the uncertainty of Ea.'],
  success: ['Well done. Why does a higher temperature increase k so strongly?', 'What fraction of collisions has enough energy at 35 °C compared with 25 °C?', 'Predict k at 50 °C from your Arrhenius line.']
};
export function hint(diagnosis, level = 1) {
  const list = HINTS[diagnosis] || HINTS.calculation_error;
  return list[Math.min(list.length, Math.max(1, level)) - 1];
}

export function labContext(c, bench, diagnosis) {
  const r = REACTIONS[c.reaction];
  return { subject: 'chemistry', reaction: r.name, equation: r.equation, measured_species: r.species, rate_constant_unit: r.unit,
    temperatures_offered_C: c.temperatures, bench, detected_mistake: diagnosis && !String(diagnosis).startsWith('success') ? diagnosis : null };
}

export function invariants(_t, c) {
  const bad = [];
  let lastK = 0;
  for (const T of c.temperatures) {
    const d = run(c, T), k = kAt(c, T);
    if (!(k > lastK)) bad.push('k must increase with temperature');
    lastK = k;
    if (d.conc.some(x => !Number.isFinite(x) || x < 0)) bad.push('concentration must be finite and not negative');
    if (d.conc.some((x, i) => i && x > d.conc[i - 1] * 1.01)) bad.push('reactant concentration must not rise');
  }
  return bad;
}

export const kinetics = {
  id: 'kinetics', subject: 'chemistry', templates: ['kinetics'],
  defaultConfig, validateConfig, goal, checkPublishable, validateBench, evaluate, invariants, hint, labContext, publicConfig,
  simulate(_t, c, { temperature }) {
    if (!c.temperatures.includes(temperature)) throw Error('Choose one of the offered temperatures.');
    return run(c, temperature);
  }
};
