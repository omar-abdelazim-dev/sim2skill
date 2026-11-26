// Acid–base titration engine (university level).
// pH comes from the full charge balance, solved for log[H+] with a safeguarded Newton–Raphson:
//   [H+] + Σ cations + Σ c·(z0 − n̄) − Kw/[H+] − Σ anions = 0
// where n̄ is the mean number of protons lost by each weak acid system (from its pKa values).
// This handles strong and weak acids and bases, buffers, and polyprotic species with one code path.
import DATA from '../data/reagents.json' with { type: 'json' };

export const REAGENTS = DATA.acids_bases;
export const INDICATORS = DATA.indicators;
const KW = DATA.Kw;
const LN10 = Math.LN10;

// ---------- Equilibrium math ----------
// Fractions α_i of a system with n acidic protons, i = protons lost. Computed in log space for stability.
export function fractions(pKa, pH) {
  const n = pKa.length, logs = [];
  let logBeta = 0;
  for (let i = 0; i <= n; i++) {
    if (i > 0) logBeta -= pKa[i - 1];
    logs.push(logBeta + i * pH); // log10(β_i / [H+]^i), common factor dropped
  }
  const max = Math.max(...logs);
  const w = logs.map(l => 10 ** (l - max));
  const sum = w.reduce((a, b) => a + b, 0);
  return w.map(x => x / sum);
}
const meanLost = (pKa, pH) => fractions(pKa, pH).reduce((s, a, i) => s + i * a, 0);

// Charge balance residual at a given pH for a list of { reagent, c } (mol/L in the mixture).
export function chargeResidual(mix, pH) {
  const h = 10 ** -pH;
  let f = h - KW / h;
  for (const { reagent, c } of mix) {
    const r = REAGENTS[reagent];
    f += c * ((r.cation || 0) - (r.anion || 0));
    if (r.system) f += c * (r.system.z0 - meanLost(r.system.pKa, pH));
  }
  return f;
}

// Monotone decreasing in pH, so a bracket [-2, 16] always holds the root.
export function solvePH(mix) {
  let lo = -2, hi = 16, x = 7;
  const g = p => chargeResidual(mix, p);
  let gLo = g(lo), gHi = g(hi);
  if (gLo < 0) return lo;
  if (gHi > 0) return hi;
  for (let i = 0; i < 100; i++) {
    const gx = g(x);
    if (gx > 0) lo = x; else hi = x;
    const d = (g(x + 1e-6) - gx) / 1e-6;
    let next = d < 0 ? x - gx / d : NaN;
    if (!(next > lo && next < hi)) next = (lo + hi) / 2; // Newton step left the bracket: bisect
    if (Math.abs(next - x) < 1e-10) return next;
    x = next;
  }
  return x;
}

// ---------- Lab model ----------
const UNRINSED_FACTOR = 0.96; // water left in an unrinsed burette dilutes the titrant by about 4 %

export function defaultConfig() {
  return {
    analyte: 'acetic_acid', analyteConc: 0.085, analyteVolume: 25, dilution: 1,
    titrant: 'naoh', titrantConc: 0.1, endpoint: 1,
    indicators: ['methyl_orange', 'methyl_red', 'bromothymol_blue', 'phenolphthalein'],
    tolerance: 2, burette: 50
  };
}

function check(cond, msg) { if (!cond) throw Error(msg); }
const num = (v, min, max) => Number.isFinite(v) && v >= min && v <= max;

export function validateConfig(_template, config) {
  const c = structuredClone(config || defaultConfig());
  const a = REAGENTS[c.analyte], t = REAGENTS[c.titrant];
  check(a, 'Choose an analyte from the reagent list.');
  check(DATA.titrants.includes(c.titrant) && t, 'Choose a titrant from the reagent list.');
  check(a.kind !== t.kind, a.kind === 'acid' ? 'An acid must be titrated with a base (NaOH).' : 'A base must be titrated with an acid (HCl).');
  check(num(c.analyteConc, 0.001, 2), 'Analyte concentration must be between 0.001 and 2 mol/L.');
  check(num(c.analyteVolume, 5, 50), 'The aliquot must be between 5 and 50 mL.');
  check(num(c.dilution, 1, 100), 'The dilution factor must be between 1 and 100.');
  check(num(c.titrantConc, 0.01, 1), 'Titrant concentration must be between 0.01 and 1 mol/L.');
  check(a.endpoints.includes(c.endpoint), `${a.name} has endpoints at ${a.endpoints.join(' and ')} equivalent(s) only.`);
  check(Array.isArray(c.indicators) && c.indicators.length >= 1 && c.indicators.length <= 6 && new Set(c.indicators).size === c.indicators.length
    && c.indicators.every(i => INDICATORS[i]), 'Offer between one and six indicators from the list.');
  check([1, 2, 5].includes(c.tolerance), 'Choose a tolerance of 1%, 2% or 5%.');
  check([25, 50].includes(c.burette), 'Choose a 25 mL or 50 mL burette.');
  const veq = equivalenceVolume(c);
  check(veq >= 5 && veq <= c.burette * 0.95, `The endpoint would be at ${veq.toFixed(1)} mL. Change concentrations or volume so it falls between 5 mL and ${(c.burette * 0.95).toFixed(1)} mL of the burette.`);
  return c;
}

// Titrant volume (mL) at the chosen equivalence point.
export function equivalenceVolume(c, k = c.endpoint) {
  const moles = (c.analyteConc / c.dilution) * c.analyteVolume / 1000;
  return k * moles / c.titrantConc * 1000;
}

export function mixAt(c, vb, rinsed = true) {
  const vt = (c.analyteVolume + vb) / 1000;
  const na = (c.analyteConc / c.dilution) * c.analyteVolume / 1000;
  const nt = c.titrantConc * (rinsed ? 1 : UNRINSED_FACTOR) * vb / 1000;
  return [{ reagent: c.analyte, c: na / vt }, { reagent: c.titrant, c: nt / vt }];
}
export const phAt = (c, vb, rinsed = true) => solvePH(mixAt(c, vb, rinsed));

export function indicatorColor(id, pH) {
  const ind = INDICATORS[id];
  if (!ind) return 'rgba(255,255,255,0)';
  const t = Math.min(1, Math.max(0, (pH - ind.low) / (ind.high - ind.low)));
  return t < 0.5 ? ind.acidColor : ind.baseColor;
}

// Volume where the indicator changes colour (pH crosses the middle of its range), by bisection on volume.
export function indicatorVolume(c, indicatorId, rinsed = true) {
  const ind = INDICATORS[indicatorId], mid = (ind.low + ind.high) / 2;
  const rising = REAGENTS[c.titrant].kind === 'base';
  const passed = v => (rising ? phAt(c, v, rinsed) >= mid : phAt(c, v, rinsed) <= mid);
  let lo = 0, hi = c.burette;
  if (passed(lo)) return 0;
  if (!passed(hi)) return null;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (passed(m)) hi = m; else lo = m; }
  return hi;
}

// An indicator is suitable if its colour change lands within 0.5 % of the equivalence volume.
export function indicatorSuitable(c, id) {
  const v = indicatorVolume(c, id), veq = equivalenceVolume(c);
  return v !== null && Math.abs(v - veq) / veq <= 0.005;
}

export function goal(_t, config) {
  const c = config || defaultConfig(), a = REAGENTS[c.analyte], t = REAGENTS[c.titrant];
  const dil = c.dilution > 1 ? ` The sample was diluted ${c.dilution}× before you took the aliquot.` : '';
  return `Find the concentration of the original ${a.name} solution (within ${c.tolerance}%) by titrating a ${c.analyteVolume} mL aliquot with ${c.titrantConc} mol/L ${t.name}.${dil}`;
}

// Never send the answer to students.
export function publicConfig(c) {
  if (!c) return c;
  const { analyteConc, ...rest } = c;
  return rest;
}

// The reference solution: the best allowed indicator, a rinsed burette, and the endpoint read at the colour change.
export function referenceBench(c) {
  const best = c.indicators.filter(i => indicatorSuitable(c, i))
    .sort((x, y) => Math.abs(indicatorVolume(c, x) - equivalenceVolume(c)) - Math.abs(indicatorVolume(c, y) - equivalenceVolume(c)))[0];
  if (!best) return null;
  const v = indicatorVolume(c, best);
  const e = c.endpoint;
  return { indicator: best, rinsed: true, endpointMl: +v.toFixed(2), reportedConc: c.titrantConc * v / 1000 / e * c.dilution / (c.analyteVolume / 1000) };
}

export function checkPublishable(t, config) {
  const c = validateConfig(t, config);
  const ref = referenceBench(c);
  if (!ref) throw Error('None of the offered indicators changes colour at this equivalence point. Add a suitable indicator.');
  const r = evaluate(t, c, ref);
  if (!r.success) throw Error('The reference solution does not pass. Check the concentrations and tolerance.');
  const bad = invariants(t, c);
  if (bad.length) throw Error('The simulation failed a consistency check: ' + bad[0]);
}

export function validateBench(_t, c, b) {
  const ok = b && typeof b === 'object' && c.indicators.includes(b.indicator) && typeof b.rinsed === 'boolean'
    && (b.endpointMl === null || num(b.endpointMl, 0, c.burette))
    && (b.reportedConc === null || num(b.reportedConc, 0, 1e6));
  if (!ok) throw Error('Invalid titration record.');
}

// Diagnosis order follows how a teaching assistant would check a notebook.
export function evaluate(_t, c, b) {
  const truth = c.analyteConc, e = c.endpoint, d = c.dilution;
  const vInd = indicatorVolume(c, b.indicator, b.rinsed);
  const result = { indicatorVolume: vInd, endpointMl: b.endpointMl };
  const out = diagnosis => ({ result, diagnosis, success: diagnosis === 'success' });
  if (b.endpointMl === null || b.endpointMl === undefined) return out('no_endpoint');
  if (!indicatorSuitable(c, b.indicator)) return out('indicator_range');
  if (vInd !== null && b.endpointMl > vInd + 0.3) return out('overshoot');
  if (vInd !== null && b.endpointMl < vInd - 0.3) return out('stopped_early');
  if (b.reportedConc === null || b.reportedConc === undefined) return out('no_calculation');
  const within = x => Math.abs(x - truth) / truth <= c.tolerance / 100;
  if (within(b.reportedConc)) return out(b.rinsed ? 'success' : 'burette_not_rinsed_lucky');
  if (!b.rinsed) return out('burette_not_rinsed');
  const expected = c.titrantConc * b.endpointMl / 1000 / e * d / (c.analyteVolume / 1000);
  const r = b.reportedConc / expected, near = (x, y) => Math.abs(x / y - 1) < 0.03;
  if (near(r, 1000) || near(r, 0.001)) return out('ml_l_mixup');
  if (d > 1 && (near(r, 1 / d) || near(r, d))) return out('dilution_forgotten');
  if (e > 1 && (near(r, e) || near(r, 1 / e))) return out('wrong_ratio');
  return out('calculation_error');
}

const HINTS = {
  no_endpoint: ['Add titrant and watch the flask. Slow down to drops when the colour starts to flash.',
    'Record the burette reading at the first permanent colour change.',
    'Press "Record endpoint" as soon as the colour stays after swirling.'],
  indicator_range: ['Check where your indicator changes colour compared with the pH at the equivalence point.',
    'Look at the steep part of your pH curve. Is the indicator’s range inside that jump?',
    'A weak acid with a strong base has an equivalence pH above 7: choose an indicator that changes between about pH 8 and 10, such as phenolphthalein.'],
  overshoot: ['Your recorded volume is past the colour change. What happened between the change and your reading?',
    'Near the endpoint one drop is about 0.05 mL. Add titrant drop by drop and swirl.',
    'Repeat the titration and record the reading at the first permanent colour change.'],
  stopped_early: ['The colour had not changed permanently yet when you recorded the endpoint.',
    'Swirl after each drop: a colour that fades has not reached the endpoint.',
    'Keep adding drops until the colour lasts for about 30 seconds, then record.'],
  no_calculation: ['Use your endpoint volume to work out the moles of titrant.',
    'Moles of titrant = concentration × volume in litres. Then use the reaction ratio.',
    'c(analyte) = c(titrant) × V(titrant) ÷ ratio ÷ V(aliquot), then multiply by any dilution factor.'],
  burette_not_rinsed: ['Your endpoint is later than it should be. What could have diluted the titrant?',
    'Water left in the burette dilutes the titrant, so you need more of it.',
    'Rinse the burette with a little titrant before filling it, then repeat the titration.'],
  burette_not_rinsed_lucky: ['Your answer is close, but the burette was not rinsed with titrant.',
    'Rinse with titrant so water does not dilute it.',
    'Rinse the burette with a small portion of titrant, then repeat to confirm.'],
  ml_l_mixup: ['Your answer is off by a factor of 1000. Check your units.',
    'Volumes in mL must be converted to L before multiplying by mol/L.',
    'Divide mL by 1000: 25.00 mL = 0.02500 L.'],
  dilution_forgotten: ['You found the concentration of the diluted solution. The question asks about the original one.',
    'The sample was diluted before titrating. How does that change the concentration?',
    'Multiply your result by the dilution factor.'],
  wrong_ratio: ['Check the mole ratio in the balanced equation.',
    'At this endpoint, how many H+ (or OH−) react with each analyte particle?',
    'Divide the moles of titrant by the number of equivalents at this endpoint.'],
  calculation_error: ['Your answer does not match your own endpoint reading. Recheck the calculation step by step.',
    'Moles of titrant = c × V(L). Then apply the ratio, then divide by the aliquot volume in L.',
    'Write each step with units, and check the dilution factor and the reaction ratio.'],
  success: ['Well done. Can you explain why your indicator was a good choice?', 'What would happen with methyl orange instead?', 'Try predicting the pH at half-equivalence: it equals the pKa.']
};
export function hint(diagnosis, level = 1) {
  const list = HINTS[diagnosis] || HINTS.calculation_error;
  return list[Math.min(list.length, Math.max(1, level)) - 1];
}

// What Nour may see: never the hidden concentration.
export function labContext(c, bench, diagnosis) {
  const a = REAGENTS[c.analyte], t = REAGENTS[c.titrant];
  return {
    subject: 'chemistry', analyte: `${a.name} (${a.formula})`, titrant: `${c.titrantConc} mol/L ${t.name}`,
    aliquot_mL: c.analyteVolume, dilution_factor: c.dilution, endpoint_equivalents: c.endpoint,
    pKa: a.system?.pKa, indicators_offered: c.indicators.map(i => `${INDICATORS[i].name} (${INDICATORS[i].low}–${INDICATORS[i].high})`),
    bench, detected_mistake: diagnosis && diagnosis !== 'success' ? diagnosis : null
  };
}

// Physical laws every simulated state must satisfy.
export function invariants(_t, c) {
  const bad = [];
  const veq = equivalenceVolume(c);
  for (const v of [0, veq / 2, veq, veq * 1.1, Math.min(c.burette, veq * 1.5)]) {
    const mix = mixAt(c, v), pH = solvePH(mix);
    if (!Number.isFinite(pH)) { bad.push('pH is not a number at ' + v.toFixed(2) + ' mL'); continue; }
    const scale = mix.reduce((s, m) => s + m.c, 0) + 1e-7;
    if (Math.abs(chargeResidual(mix, pH)) > 1e-6 * scale) bad.push('charge balance not satisfied at ' + v.toFixed(2) + ' mL');
    for (const m of mix) {
      const sys = REAGENTS[m.reagent].system;
      if (sys && Math.abs(fractions(sys.pKa, pH).reduce((s, x) => s + x, 0) - 1) > 1e-9) bad.push('mass balance not satisfied');
    }
  }
  return bad;
}

export const titration = {
  id: 'titration', subject: 'chemistry', templates: ['titration'],
  defaultConfig, validateConfig, goal, checkPublishable, validateBench, evaluate, invariants, hint, labContext, publicConfig,
  simulate(_t, c, { volumes, rinsed }) {
    return volumes.map(v => ({ v, pH: +phAt(c, v, rinsed).toFixed(3) }));
  }
};
