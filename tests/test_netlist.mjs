// Checks the netlist solver and layout against hand calculations. Run: node tests/test_netlist.mjs
import { solveDC, parseVal, normalize, layout, schematicSVG } from '../src/lab/netlist.js';
let n = 0, bad = 0;
const near = (a, b, tol, msg) => { n++; if (!(Math.abs(a - b) <= tol)) { bad++; console.log('FAIL', msg, 'got', a, 'want', b); } };
const ok = (c, msg) => { n++; if (!c) { bad++; console.log('FAIL', msg); } };
const get = (r, id) => r.rows.find(x => x.c.id === id);

// units
near(parseVal('4.7 kΩ'), 4700, 1e-9, 'kilo'); near(parseVal('100 uF'), 1e-4, 1e-12, 'micro'); near(parseVal('10 mA'), 0.01, 1e-12, 'milli'); near(parseVal('1M'), 1e6, 1e-3, 'mega'); ok(isNaN(parseVal('red')), 'text is NaN');

// LED + 470 ohm from 9 V
let r = solveDC(normalize({ components: [{ id: 'V1', type: 'battery', value: '9 V', nodes: ['n1', '0'] }, { id: 'R1', type: 'resistor', value: '470', nodes: ['n1', 'n2'] }, { id: 'D1', type: 'led', nodes: ['n2', '0'] }] }));
near(get(r, 'R1').I, 7 / 470, 1e-9, 'LED current'); near(get(r, 'D1').vd, 2, 1e-9, 'LED drop'); near(get(r, 'V1').I, 7 / 470, 1e-9, 'battery supplies'); ok(get(r, 'V1').role === 'supplies', 'role');

// LED reversed stays off
r = solveDC(normalize({ components: [{ id: 'V1', type: 'battery', value: '9 V', nodes: ['n1', '0'] }, { id: 'R1', type: 'resistor', value: '470', nodes: ['n1', 'n2'] }, { id: 'D1', type: 'led', nodes: ['0', 'n2'] }] }));
near(get(r, 'R1').I, 0, 1e-9, 'reversed LED blocks'); ok(r.notes.some(t => /stays off/.test(t)), 'reverse note');

// divider 12 V, 1k, 2k -> 8 V
r = solveDC(normalize({ components: [{ id: 'V1', type: 'battery', value: '12', nodes: ['a', '0'] }, { id: 'R1', type: 'resistor', value: '1k', nodes: ['a', 'b'] }, { id: 'R2', type: 'resistor', value: '2k', nodes: ['b', '0'] }] }));
near(r.volts.b, 8, 1e-6, 'divider'); near(get(r, 'R2').I, 0.004, 1e-9, 'divider current');

// the textbook circuit from the user's photo: 20 V, 2, 10, 4, 20 ohm and a 4 A source into V2
const base = [{ id: 'V1', type: 'battery', value: '20 V', nodes: ['vs', '0'] }, { id: 'R1', type: 'resistor', value: '2 Ω', nodes: ['vs', 'v1'] }, { id: 'R2', type: 'resistor', value: '10 Ω', nodes: ['v1', '0'] },
  { id: 'R3', type: 'resistor', value: '4 Ω', nodes: ['v1', 'v2'] }, { id: 'R4', type: 'resistor', value: '20 Ω', nodes: ['v2', '0'] }];
r = solveDC(normalize({ components: [...base, { id: 'I1', type: 'current_source', value: '4 A', nodes: ['0', 'v2'] }] }));
near(r.volts.v1, 20.77922, 1e-3, 'V1 source up'); near(r.volts.v2, 30.6494, 1e-3, 'V2 source up');
near(get(r, 'I1').I, 4, 1e-9, 'current source delivers 4 A'); near(get(r, 'I1').vd, 30.6494, 1e-3, 'current source voltage'); near(get(r, 'I1').P, 4 * 30.6494, 1e-2, 'current source power supplied');
// the 4 A source overpowers the 20 V battery here, so the battery is being charged: 0.39 A flows + to - inside it, so it delivers -0.39 A
near(get(r, 'V1').Iab, 0.38961, 1e-4, 'battery current + to - inside'); near(get(r, 'V1').I, -0.38961, 1e-4, 'battery delivers negative current (absorbs)');
r = solveDC(normalize({ components: [...base, { id: 'I1', type: 'current_source', value: '4 A', nodes: ['v2', '0'] }] }));
near(r.volts.v1, 10.38961, 1e-3, 'V1 source down'); near(r.volts.v2, -4.6753, 1e-3, 'V2 source down');

// parallel branches: 330 + (470 || 1k) from 9 V
r = solveDC(normalize({ components: [{ id: 'V1', type: 'battery', value: '9', nodes: ['n1', '0'] }, { id: 'S1', type: 'switch', state: 'closed', nodes: ['n1', 'n2'] }, { id: 'R1', type: 'resistor', value: '330', nodes: ['n2', 'n3'] }, { id: 'R2', type: 'resistor', value: '470', nodes: ['n3', '0'] }, { id: 'R3', type: 'resistor', value: '1k', nodes: ['n3', '0'] }] }));
near(get(r, 'V1').I, 9 / (330 + 470 * 1000 / 1470), 1e-9, 'series-parallel total');
// open switch: no current
r = solveDC(normalize({ components: [{ id: 'V1', type: 'battery', value: '9', nodes: ['n1', '0'] }, { id: 'S1', type: 'switch', state: 'open', nodes: ['n1', 'n2'] }, { id: 'R1', type: 'resistor', value: '330', nodes: ['n2', '0'] }] }));
near(get(r, 'R1').I, 0, 1e-9, 'open switch');
// ideal source shorted by a wire has no unique solution
r = solveDC(normalize({ components: [{ id: 'V1', type: 'battery', value: '9', nodes: ['n1', '0'] }, { id: 'W1', type: 'wire', nodes: ['n1', '0'] }] }));
ok(!!r.error, 'shorted source reports an error');

// layout: every component gets a place, drawing never throws, bad input is rejected
const nl = normalize({ components: [...base, { id: 'I1', type: 'current_source', value: '4 A', nodes: ['0', 'v2'] }] });
ok(layout(nl).items.length === 6, 'all parts placed'); ok(/<svg/.test(schematicSVG(nl)), 'svg produced');
ok(normalize({ components: [] }) === null && normalize(null) === null, 'empty rejected');
console.log(`${n - bad} of ${n} checks passed`); process.exit(bad ? 1 : 0);
