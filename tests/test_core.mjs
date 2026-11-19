// Checks the simulator and the mistake detector against the circuit formulas.
import CORE from '../src/lab/core.js';
const { PARTS, EXPERIMENTS, MISTAKES, simulate, detect, hintText } = CORE;
let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('FAIL', msg); } };
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= Math.abs(b) * tol + 1e-12;

// Ohm's law: I = V / R for every resistor and voltage step
for (const r of ['r100', 'r220', 'r470', 'r1k']) for (let v = 1; v <= 12.001; v += 0.1) {
  const V = Math.round(v * 10) / 10, s = simulate('ohm', { V, R: r });
  ok(near(s.I, V / PARTS[r].ohms), `ohm ${r} ${V}`);
}
// every resistor can reach the 10 mA target
for (const [r, V] of [['r100', 1], ['r220', 2.2], ['r470', 4.7], ['r1k', 10]]) ok(detect('ohm', { V, R: r }, simulate('ohm', { V, R: r })) === 'success', `ohm target ${r}`);
ok(detect('ohm', { V: 9, R: null }, simulate('ohm', { V: 9, R: null })) === 'open_circuit', 'ohm open');
ok(detect('ohm', { V: 9, R: 'wire' }, simulate('ohm', { V: 9, R: 'wire' })) === 'short_circuit', 'ohm short');
ok(detect('ohm', { V: 9, R: 'r100' }, simulate('ohm', { V: 9, R: 'r100' })) === 'current_too_high', 'ohm high');
ok(detect('ohm', { V: 2, R: 'r1k' }, simulate('ohm', { V: 2, R: 'r1k' })) === 'current_too_low', 'ohm low');

// LED: I = (9 - 2) / R and the expected verdict per part
const ledExpect = { wire: 'no_resistor', r100: 'resistor_too_small', r330: 'over_rated', r470: 'success', r1k: 'success', r10k: 'resistor_too_large' };
for (const r in ledExpect) {
  const b = { V: 9, R: r, D: 'led', reversed: false, burnt: false }, s = simulate('led', b);
  if (r !== 'wire') ok(near(s.I, 7 / PARTS[r].ohms), `led I ${r}`);
  ok(detect('led', b, s) === ledExpect[r], `led verdict ${r} got ${detect('led', b, s)}`);
  ok(!!s.burn === (r === 'wire' || r === 'r100'), `led burn ${r}`);
}
const rev = { V: 9, R: 'r470', D: 'led', reversed: true, burnt: false };
ok(detect('led', rev, simulate('led', rev)) === 'led_reversed' && simulate('led', rev).I === 0, 'led reversed');
const burnt = { V: 9, R: 'r470', D: 'led', reversed: false, burnt: true };
ok(detect('led', burnt, simulate('led', burnt)) === 'burnt_led', 'led burnt');
ok(detect('led', { V: 9, R: 'r470', D: null }, simulate('led', { V: 9, R: 'r470', D: null })) === 'open_circuit', 'led open');

// RC: tau = R C, v(t) = V (1 - e^(-t/tau))
for (const r of ['r1k', 'r10k', 'r100k']) for (const c of ['c10', 'c100', 'c1000']) {
  const b = { V: 5, R: r, D: c, reversed: false }, s = simulate('rc', b), tau = PARTS[r].ohms * PARTS[c].farads;
  ok(near(s.tau, tau), `rc tau ${r} ${c}`);
  ok(near(s.v5, 5 * (1 - Math.exp(-5 / tau))), `rc v5 ${r} ${c}`);
  const want = near(tau, 1, 0.1) ? 'success' : tau < 1 ? 'tau_too_short' : 'tau_too_long';
  ok(detect('rc', b, s) === want, `rc verdict ${r} ${c}`);
}
ok(near(simulate('rc', { V: 5, R: 'r10k', D: 'c100' }).v63, 3.1606, 0.001), 'rc 63% value');
const crev = { V: 5, R: 'r10k', D: 'c100', reversed: true };
ok(detect('rc', crev, simulate('rc', crev)) === 'cap_reversed', 'rc reversed');

// every reachable state gives clean hint text at all three levels, and every verdict has dashboard metadata
const seen = new Set();
for (const exp in EXPERIMENTS) {
  const E = EXPERIMENTS[exp], [sr, sd] = E.slots;
  const volts = E.volt.fixed ? [E.volt.fixed] : [1, 2.2, 4.7, 9, 10, 12];
  for (const V of volts) for (const R of [null, ...sr.options]) for (const D of sd ? [null, ...sd.options] : [null]) for (const reversed of [false, true]) for (const burntF of [false, true]) {
    const b = { V, R, D, reversed, burnt: burntF }, s = simulate(exp, b), m = detect(exp, b, s);
    seen.add(exp + ':' + m);
    if (m !== 'success') ok(!!MISTAKES[exp + ':' + m], `metadata for ${exp}:${m}`);
    for (const lv of [1, 2, 3]) { const t = hintText(exp, m, lv, b, s); ok(typeof t === 'string' && t.length > 20 && !/undefined|NaN|null|\[object/.test(t), `hint ${exp}:${m} L${lv}: ${t}`); }
  }
}
for (const k in MISTAKES) ok(seen.has(k), `mistake ${k} is reachable`);
console.log(`${checks - fails}/${checks} checks passed`);
console.log('sample:', hintText('led', 'resistor_too_small', 2, { V: 9, R: 'r100', D: 'led' }, simulate('led', { V: 9, R: 'r100', D: 'led' })));
process.exit(fails ? 1 : 0);
