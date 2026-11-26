import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import * as T from '../shared/engines/titration.js';
import * as K from '../shared/engines/kinetics.js';
import { platform } from './helpers.mjs';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: got ${a}, expected ${b} ± ${tol}`);

test('titration engine matches hand-calculated pH values', () => {
  const ph = (reagent, c) => T.solvePH([{ reagent, c }]);
  close(ph('hcl', 0.1), 1.0, 0.001, '0.1 M HCl');
  close(ph('naoh', 0.01), 12.0, 0.001, '0.01 M NaOH');
  close(ph('acetic_acid', 0.1), 2.88, 0.01, '0.1 M acetic acid: pH = ½(pKa − log c)');
  close(ph('ammonia', 0.1), 11.12, 0.01, '0.1 M ammonia');
  close(ph('sodium_carbonate', 0.1), 11.66, 0.01, '0.1 M sodium carbonate (first hydrolysis)');
  const c = { ...T.defaultConfig(), analyteConc: 0.1 };
  close(T.phAt(c, 12.5), 4.76, 0.01, 'half-equivalence pH equals pKa');
  close(T.phAt(c, 25), 8.73, 0.01, 'weak acid equivalence point: 0.05 M acetate');
  close(T.equivalenceVolume(c), 25, 1e-9, 'equivalence volume');
  const strong = { ...c, analyte: 'hcl' };
  close(T.phAt(strong, 25), 7.0, 0.01, 'strong acid + strong base equivalence is neutral');
  const phosphoric = { ...c, analyte: 'phosphoric_acid', endpoint: 2, analyteConc: 0.05 };
  close(T.phAt(phosphoric, T.equivalenceVolume(phosphoric, 1)), 4.7, 0.1, 'H3PO4 first equivalence ≈ ½(pKa1 + pKa2)');
  close(T.phAt(phosphoric, T.equivalenceVolume(phosphoric, 2)), 9.7, 0.15, 'H3PO4 second equivalence ≈ ½(pKa2 + pKa3)');
  const base = { ...c, analyte: 'ammonia', titrant: 'hcl' };
  close(T.phAt(base, 12.5), 9.25, 0.01, 'ammonia half-equivalence pH equals pKa of NH4+');
  assert.ok(T.phAt(base, 25) < 6, 'weak base + strong acid equivalence is acidic');
});

test('titration invariants, indicator choice and the mistake detector', () => {
  const c = T.validateConfig('titration', { ...T.defaultConfig(), analyteConc: 0.85, dilution: 10 });
  assert.deepEqual(T.invariants('titration', c), []);
  assert.equal(T.indicatorSuitable(c, 'phenolphthalein'), true);
  assert.equal(T.indicatorSuitable(c, 'methyl_orange'), false);
  const ref = T.referenceBench(c);
  assert.equal(T.evaluate('titration', c, ref).diagnosis, 'success');
  const d = b => T.evaluate('titration', c, { ...ref, ...b }).diagnosis;
  assert.equal(d({ endpointMl: null }), 'no_endpoint');
  assert.equal(d({ indicator: 'methyl_orange' }), 'indicator_range');
  assert.equal(d({ endpointMl: ref.endpointMl + 1.5 }), 'overshoot');
  assert.equal(d({ reportedConc: null }), 'no_calculation');
  assert.equal(d({ reportedConc: ref.reportedConc * 1000 }), 'ml_l_mixup');
  assert.equal(d({ reportedConc: ref.reportedConc / 10 }), 'dilution_forgotten');
  const unrinsedV = T.indicatorVolume(c, 'phenolphthalein', false);
  assert.ok(unrinsedV > ref.endpointMl, 'water in the burette dilutes the titrant, so the endpoint comes later');
  assert.equal(d({ rinsed: false, endpointMl: +unrinsedV.toFixed(2), reportedConc: 0.1 * unrinsedV / 1000 * 10 / 0.025 }), 'burette_not_rinsed');
  const diprotic = T.validateConfig('titration', { ...T.defaultConfig(), analyte: 'oxalic_acid', endpoint: 2, analyteConc: 0.04, indicators: ['phenolphthalein'] });
  const r2 = T.referenceBench(diprotic);
  assert.equal(T.evaluate('titration', diprotic, { ...r2, reportedConc: r2.reportedConc * 2 }).diagnosis, 'wrong_ratio');
  assert.throws(() => T.validateConfig('titration', { ...T.defaultConfig(), titrant: 'hcl' }), /acid must be titrated with a base/);
  assert.throws(() => T.validateConfig('titration', { ...T.defaultConfig(), analyteConc: 1.5 }), /endpoint would be at/);
  assert.throws(() => T.validateConfig('titration', { ...T.defaultConfig(), analyte: 'nitroglycerin' }), /reagent list/);
  assert.throws(() => T.checkPublishable('titration', { ...T.defaultConfig(), indicators: ['methyl_orange'] }), /suitable indicator/);
  assert.equal('analyteConc' in T.publicConfig(c), false);
});

test('kinetics: integrated rate laws, Arrhenius, and detector', () => {
  close(K.concentration(1, 1, Math.log(2) / 10, 10), 0.5, 1e-12, 'first-order half-life');
  close(K.concentration(2, 1, 1, 1), 0.5, 1e-12, 'second order: 1/[A] = 1/[A]0 + kt');
  close(K.concentration(0, 1, 0.1, 5), 0.5, 1e-12, 'zero order');
  const c = K.validateConfig('kinetics', K.defaultConfig());
  close(K.kAt(c, 25), c.k25, 1e-12, 'k at 25 °C');
  close(K.eaFromKs([15, 25, 35].map(t => ({ T: t, k: K.kAt(c, t) }))), c.EaKJ, 1e-6, 'Ea recovered from exact rate constants');
  assert.deepEqual(K.invariants('kinetics', c), []);
  const ref = K.referenceBench(c);
  assert.equal(K.evaluate('kinetics', c, ref).diagnosis, 'success');
  const d = b => K.evaluate('kinetics', c, { ...ref, ...b }).diagnosis;
  assert.equal(d({ runs: [25] }), 'need_more_temperatures');
  assert.equal(d({ order: 2 }), 'wrong_order');
  assert.equal(d({ eaKJ: ref.eaKJ / Math.LN10 }), 'log10_instead_of_ln');
  assert.equal(d({ eaKJ: ref.eaKJ * 1000 }), 'kj_j_units');
  assert.equal(d({ eaKJ: K.eaFromKs(ref.runs.map(t => ({ T: t, k: K.kAt(c, t) })), true) }), 'celsius_used');
  for (const id of Object.keys(K.REACTIONS)) {
    const r = K.REACTIONS[id];
    const cc = K.validateConfig('kinetics', { ...K.defaultConfig(), reaction: id, k25: r.k25.default, EaKJ: r.EaKJ, c0: r.c0.default });
    assert.equal(K.evaluate('kinetics', cc, K.referenceBench(cc)).diagnosis, 'success', id);
  }
  assert.throws(() => K.validateConfig('kinetics', { ...K.defaultConfig(), EaKJ: 120 }), /within 10%/);
  assert.equal('EaKJ' in K.publicConfig(c), false);
});

test('chemistry labs on the server: hidden answers, server simulation and grading, plan gates', async () => {
  const p = await platform();
  try {
    const u = await p.signup('Chem Student');
    const lab = (await p.request('labs/titration')).data;
    assert.equal(lab.subject, 'chemistry');
    assert.equal(lab.config.analyteConc, undefined, 'the unknown concentration is never sent');
    assert.match(lab.goal, /original Acetic acid solution/);
    assert.equal((await p.request('labs/titration/sim', 'POST', { volumes: [0], rinsed: true })).status, 401);
    const sim = await p.request('labs/titration/sim', 'POST', { volumes: [0, 10.625, 21.25], rinsed: true }, u.cookie);
    assert.equal(sim.status, 200);
    close(sim.data.points[1].pH, 4.76, 0.01, 'half-equivalence through the API');
    assert.equal((await p.request('labs/titration/sim', 'POST', { volumes: [99], rinsed: true }, u.cookie)).status, 400);
    const good = { indicator: 'phenolphthalein', rinsed: true, endpointMl: 21.26, reportedConc: 0.1 * 21.26 / 1000 * 10 / 0.025 };
    const graded = await p.request('practice', 'POST', { labId: 'titration', bench: good }, u.cookie);
    assert.equal(graded.data.last.diagnosis, 'success');
    assert.equal((await p.request('practice', 'POST', { labId: 'titration', bench: { ...good, indicator: 'not-real' } }, u.cookie)).status, 400);

    const run = await p.request('labs/kinetics/sim', 'POST', { temperature: 25 }, u.cookie);
    assert.equal(run.data.run.conc.length, 11);
    assert.equal((await p.request('labs/kinetics/sim', 'POST', { temperature: 30 }, u.cookie)).status, 400);

    // Free plan: titration yes, other chemistry engines no.
    const { DatabaseSync } = await import('node:sqlite');
    const d = new DatabaseSync(join(p.dir, 'platform.db'));
    d.prepare('UPDATE users SET created_at = ? WHERE id = ?').run('2020-01-01T00:00:00.000Z', u.id);
    d.close();
    assert.equal((await p.request('labs/titration/sim', 'POST', { volumes: [1], rinsed: true }, u.cookie)).status, 200);
    const gated = await p.request('labs/kinetics/sim', 'POST', { temperature: 25 }, u.cookie);
    assert.equal(gated.status, 402);
    assert.equal(gated.data.upgrade, true);

    // Creating a chemistry lab: the owner sees the answer, others do not.
    const maker = await p.signup('Chem Maker');
    const made = await p.request('labs', 'POST', { template: 'titration', title: 'Ammonia in cleaner', description: 'Titrate household ammonia.', outcomes: 'Weak base titration curves.', instructions: 'Choose an indicator that changes in the acidic range.',
      config: { ...T.defaultConfig(), analyte: 'ammonia', titrant: 'hcl', analyteConc: 0.08, indicators: ['methyl_red', 'phenolphthalein'] } }, maker.cookie);
    assert.equal(made.status, 201);
    assert.equal(made.data.config.analyteConc, 0.08);
    assert.equal((await p.request('labs/' + made.data.id + '/submit', 'POST', {}, maker.cookie)).status, 200);
    assert.equal((await p.request('labs/' + made.data.id)).data.config.analyteConc, undefined);
    const bad = await p.request('labs', 'POST', { template: 'titration', title: 'No indicator works', description: 'x'.repeat(12), outcomes: 'x'.repeat(12), instructions: 'x'.repeat(12),
      config: { ...T.defaultConfig(), indicators: ['methyl_orange'] } }, maker.cookie);
    assert.equal((await p.request('labs/' + bad.data.id + '/submit', 'POST', {}, maker.cookie)).status, 400);
  } finally { await p.close(); }
});
