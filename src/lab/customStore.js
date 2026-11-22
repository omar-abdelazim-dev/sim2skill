// State of the free bench: the netlist Nour read from a photo, its DC solution and the selected part.
import { useSyncExternalStore } from 'react';
import { normalize, solveDC } from './netlist.js';

export const C = { nl: null, sol: null, selected: null, rev: 0, built: 0 };
const subs = new Set();
const bump = () => { C.rev++; subs.forEach(f => f()); };
export const subscribeCustom = f => { subs.add(f); return () => subs.delete(f); };
export function useCustom() { useSyncExternalStore(subscribeCustom, () => C.rev); return C; }

// Returns true when the netlist can be built. `built` only changes when the circuit's structure changes,
// so the 3D scene knows when to rebuild instead of just refreshing readings.
export function loadNetlist(raw) {
  const nl = normalize(raw); if (!nl) return false;
  C.nl = nl; C.sol = solveDC(nl); C.selected = null; C.built++; bump(); return true;
}
export function toggleSwitch(id) {
  const c = C.nl && C.nl.components.find(x => x.id === id && x.type === 'switch'); if (!c) return;
  c.state = /clos|on/i.test(c.state || '') ? 'open' : 'closed'; C.sol = solveDC(C.nl); bump();
}
export function selectPart(id) { C.selected = C.selected === id ? null : id; bump(); }
export const rowOf = id => (C.sol && C.sol.rows ? C.sol.rows.find(r => r.c.id === id) : null);

// Checks a student would want flagged on any circuit. (Resistor power is not flagged: textbook circuits use ideal values.)
export function warnings() {
  if (!C.sol || !C.sol.rows) return [];
  const out = [];
  C.sol.rows.forEach(r => {
    if (r.c.type === 'led' && r.I > 0.03) out.push(`${r.c.id}: ${(r.I * 1000).toFixed(0)} mA is above a typical LED limit of 30 mA. It would burn out.`);
  });
  return out;
}
