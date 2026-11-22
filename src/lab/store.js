// The lab's state lives outside React so the 3D scene and the panels read the same object.
// Actions mutate it and call bump(); React components subscribe with useLab().
import { useSyncExternalStore } from 'react';
import CORE from './core.js';
import { caps } from '../claude.js';

const { PARTS, EXPERIMENTS, MISTAKES, simulate, detect, hintText, partLabel, fmtV } = CORE;

export const reduced = typeof window !== 'undefined' && window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const EXAMPLE = { students: 28, completed: { ohm: 26, led: 23, rc: 19 },
  counts: { 'led:led_reversed': 17, 'ohm:current_too_high': 14, 'led:no_resistor': 12, 'rc:tau_too_short': 11, 'led:resistor_too_small': 9, 'rc:cap_reversed': 8, 'ohm:short_circuit': 6, 'rc:tau_too_long': 5, 'ohm:open_circuit': 4, 'led:over_rated': 3 } };
const blank = V => ({ V, R: null, D: null, reversed: false, burnt: false });

export const S = { exp: 'ohm', bench: { ohm: blank(9), led: blank(9), rc: blank(5) }, closed: false, status: 'idle', active: 'R', last: null,
  lastMistake: {}, level: {}, ctx: {}, completed: {}, stats: { attempts: 0, mistakes: 0, hints: 0, counts: {} }, log: [], say: EXPERIMENTS.ohm.intro,
  question: null, voice: false, src: 'example', csv: false, mode: 'walk',
  panels: { meters: true, nour: true, kit: true } };
// runtime values that are not part of the lab record
export const rt = { scope: null, speaking: false, lab: null, entering: false, held: null, heldRev: false, aim: null, joy: null };

let version = 0;
const subs = new Set();
export function bump() { version++; subs.forEach(f => f()); }
export const subscribe = f => { subs.add(f); return () => subs.delete(f); };
export function useLab() { useSyncExternalStore(subscribe, () => version); return S; }

export function shown() { return S.last && S.last.exp === S.exp && S.status !== 'idle' ? S.last.sim : null; }
export function scopeP() { const sc = rt.scope; return !sc ? 0 : sc.done ? 1 : Math.min(1, (performance.now() - sc.t0) / sc.dur); }

/* ---------- voice ---------- */
let speakTimer = null;
const canBrowserSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
export const voiceAvailable = () => !!caps.tts || canBrowserSpeak;
function setSpeaking(on) { if (rt.speaking !== on) { rt.speaking = on; bump(); } }
export function speak(text) {
  clearTimeout(speakTimer);
  const est = Math.max(1600, text.split(/\s+/).length * 330);
  setSpeaking(true);
  const done = () => { clearTimeout(speakTimer); setSpeaking(false); };
  speakTimer = setTimeout(done, est + 4000);
  if (!S.voice) { clearTimeout(speakTimer); speakTimer = setTimeout(done, est); return; }
  if (caps.tts) { caps.tts.speak(text, { voice: 'airy' }).then(done, done); return; }
  if (canBrowserSpeak) {
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.onend = u.onerror = done; speechSynthesis.speak(u); }
    catch (e) { clearTimeout(speakTimer); speakTimer = setTimeout(done, est); }
  }
}
export function stopVoice() { try { if (caps.tts) caps.tts.stop(); if (canBrowserSpeak) speechSynthesis.cancel(); } catch (e) { /* ignore */ } setSpeaking(false); }
function say(text, aloud) { S.say = text; if (aloud) speak(text); else { clearTimeout(speakTimer); setSpeaking(false); } }

/* ---------- lab logic ---------- */
function logLine(text) { const d = new Date(); S.log.unshift({ t: d.toTimeString().slice(0, 8), text }); S.log.length = Math.min(S.log.length, 7); }
function touchBench() { if (S.closed) logLine('Switch opened to change the circuit'); S.closed = false; S.status = 'idle'; S.last = null; rt.scope = null; S.question = null; }
function firstEmpty() { const b = S.bench[S.exp]; const sl = EXPERIMENTS[S.exp].slots.find(x => !b[x.id]); return sl ? sl.id : S.active; }
function slotName(id) { return EXPERIMENTS[S.exp].slots.find(s => s.id === id).name.toLowerCase(); }

function evaluate() {
  const exp = S.exp, b = S.bench[exp], sim = simulate(exp, b), m = detect(exp, b, sim);
  S.stats.attempts++;
  let level = 1;
  if (m !== 'success') {
    S.stats.mistakes++; S.stats.hints++;
    const key = exp + ':' + m; S.stats.counts[key] = (S.stats.counts[key] || 0) + 1;
    level = S.lastMistake[exp] === m ? Math.min((S.level[exp] || 1) + 1, 3) : 1;
  }
  S.lastMistake[exp] = m; S.level[exp] = level; S.ctx[exp] = { b: { ...b }, sim };
  S.last = { exp, mistake: m, sim, level }; S.question = null; S.closed = true; S.status = 'live';
  if (m === 'short_circuit') { S.closed = false; S.status = 'fuse'; }
  else if (sim.burn) { b.burnt = true; S.status = 'burnt'; }
  else if (m === 'burnt_led') S.status = 'burnt';
  else if (m === 'cap_reversed') { S.closed = false; S.status = 'stopped'; }
  else if (m === 'success') { S.status = 'success'; S.completed[exp] = true; S.question = { picked: null }; }
  rt.scope = (exp === 'rc' && sim.status === 'ok') ? { tau: sim.tau, V: b.V, R: PARTS[b.R].ohms, t0: performance.now(), dur: 1700, done: reduced } : null;
  logLine(`Switch closed → detector: <b>${m}</b>`);
  say(hintText(exp, m, level, b, sim), true);
  bump();
  if (rt.scope && !rt.scope.done) { const sc = rt.scope; const t = () => { if (rt.scope !== sc) return; if (scopeP() >= 1) { sc.done = true; bump(); } else requestAnimationFrame(t); }; requestAnimationFrame(t); }
  const el = document.getElementById('scene'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
}

export const ACT = {
  enter(id) { S.exp = id; S.closed = false; S.status = 'idle'; S.last = null; rt.scope = null; S.question = null; S.active = 'R'; S.active = firstEmpty();
    logLine(`Entered from the lab ring: ${EXPERIMENTS[id].title}`); say(EXPERIMENTS[id].intro, true); rt.entering = true; bump(); if (rt.lab) { rt.lab.flyIn(id); rt.entering = false; } },
  exp(id) { if (id === S.exp) return; S.exp = id; S.closed = false; S.status = 'idle'; S.last = null; rt.scope = null; S.question = null; S.active = 'R'; S.active = firstEmpty();
    logLine(`Walked to bench: ${EXPERIMENTS[id].title}`); say(EXPERIMENTS[id].intro, true); bump(); if (rt.lab) rt.lab.goTo(id, true); },
  slot(id) { S.active = id; bump(); },
  // walking mode: the student moves to a bench, picks parts off the table and places them by hand
  setBench(id) { if (id === S.exp) return; S.exp = id; S.closed = false; S.status = 'idle'; S.last = null; rt.scope = null; S.question = null; S.active = 'R'; S.active = firstEmpty();
    logLine(`Walked to bench: ${EXPERIMENTS[id].title}`); say(EXPERIMENTS[id].intro, true); bump(); },
  take(id) { const sl = EXPERIMENTS[S.exp].slots.find(x => x.options.includes(id)); if (!sl) return;
    rt.held = { id, slot: sl.id, exp: S.exp }; rt.heldRev = false; S.active = sl.id;
    logLine(`Picked up ${partLabel(id)}`); say(`You picked up the ${partLabel(id)}. Put it in the ${sl.name.toLowerCase()} slot on the bench.`, false); bump(); },
  use(slotId) {
    const b = S.bench[S.exp], sl = EXPERIMENTS[S.exp].slots.find(x => x.id === slotId), name = sl.name.toLowerCase();
    if (rt.held) {
      if (rt.held.exp !== S.exp) { say('That part belongs to another bench. Take one from the parts table next to this bench.', false); bump(); return; }
      if (rt.held.slot !== slotId) { say(`The ${partLabel(rt.held.id)} goes in the ${EXPERIMENTS[S.exp].slots.find(x => x.id === rt.held.slot).name.toLowerCase()} slot.`, false); bump(); return; }
      touchBench(); b[slotId] = rt.held.id; if (slotId === 'D') { b.reversed = rt.heldRev; b.burnt = false; }
      logLine(`Placed ${partLabel(rt.held.id)} in the ${name} slot${slotId === 'D' && rt.heldRev ? ' (flipped)' : ''}`);
      rt.held = null; rt.heldRev = false; S.active = firstEmpty();
      const left = EXPERIMENTS[S.exp].slots.filter(x => !b[x.id]).map(x => x.name.toLowerCase());
      say(left.length ? `Good. Now the ${left.join(' and ')}.` : 'The circuit is built. Close the switch when you are ready.', false); bump(); return;
    }
    if (b[slotId]) {
      touchBench();
      if (slotId === 'D' && b.burnt) { b.D = null; b.burnt = false; b.reversed = false; logLine('Threw away the burnt LED'); say('Burnt LED thrown away. Take a new one from the parts table.', false); bump(); return; }
      rt.held = { id: b[slotId], slot: slotId, exp: S.exp }; rt.heldRev = slotId === 'D' ? b.reversed : false; b[slotId] = null; if (slotId === 'D') b.reversed = false;
      S.active = slotId; logLine(`Took out ${partLabel(rt.held.id)}`); bump(); return;
    }
    say(`The ${name} slot is empty. Take a part from the parts table on the right of the bench.`, false); bump();
  },
  rotate() { if (rt.held && rt.held.slot === 'D') { rt.heldRev = !rt.heldRev; bump(); } else if (S.bench[S.exp].D) ACT.flip(); },
  drop() { if (!rt.held) return; logLine(`Put back ${partLabel(rt.held.id)}`); rt.held = null; rt.heldRev = false; bump(); },
  aimChanged() { bump(); },
  // show or hide the HUD panels so the student can see the whole lab
  panel(name) { S.panels[name] = !S.panels[name]; bump(); },
  hud() { const anyOn = Object.values(S.panels).some(Boolean); Object.keys(S.panels).forEach(k => { S.panels[k] = !anyOn; }); bump(); },
  part(id) { const b = S.bench[S.exp], sl = S.active; touchBench(); b[sl] = id; if (sl === 'D') { b.reversed = false; b.burnt = false; }
    logLine(`Placed ${partLabel(id)} in the ${slotName(sl)} slot`); S.active = firstEmpty(); bump(); },
  flip() { const b = S.bench[S.exp]; touchBench(); b.reversed = !b.reversed; logLine(`Flipped the ${slotName('D')}`); bump(); },
  remove() { const b = S.bench[S.exp], sl = S.active; touchBench(); logLine(`Removed ${partLabel(b[sl])}`); b[sl] = null; if (sl === 'D') { b.reversed = false; b.burnt = false; } bump(); },
  replace() { const b = S.bench[S.exp]; touchBench(); b.burnt = false; logLine('Replaced the burnt LED'); bump(); },
  sw() { if (S.closed) { S.closed = false; S.status = 'idle'; S.last = null; rt.scope = null; logLine('Switch opened'); bump(); } else evaluate(); },
  reset() { const E = EXPERIMENTS[S.exp]; S.bench[S.exp] = blank(E.volt.fixed || E.volt.def); S.closed = false; S.status = 'idle'; S.last = null; rt.scope = null; S.question = null; S.active = 'R';
    logLine('Bench reset'); say(E.intro, false); bump(); },
  more() { const exp = S.exp, m = S.lastMistake[exp], c = S.ctx[exp]; if (!m || m === 'success' || !c) return;
    S.level[exp] = Math.min((S.level[exp] || 1) + 1, 3); S.stats.hints++; if (S.last) S.last.level = S.level[exp];
    logLine(`Student asked for more help → level ${S.level[exp]}`); say(hintText(exp, m, S.level[exp], c.b, c.sim), true); bump(); },
  voice() { S.voice = !S.voice; if (!S.voice) stopVoice(); bump(); },
  ask(i) { const a = EXPERIMENTS[S.exp].asks[+i]; logLine(`Student asked: ${a[0]}`); say(a[1], true); bump(); },
  answer(i) { if (!S.question || S.question.picked !== null) return; S.question.picked = +i; const c = EXPERIMENTS[S.exp].check;
    logLine(`Check question answered ${+i === c.correct ? 'correctly' : 'incorrectly'}`); say(+i === c.correct ? c.right : c.wrong, true); bump(); },
  src(id) { S.src = id; S.csv = false; bump(); },
  vstep(d) { const E = EXPERIMENTS[S.exp].volt, b = S.bench[S.exp]; b.V = Math.round(Math.max(E.min, Math.min(E.max, b.V + (+d))) * 10) / 10; if (S.closed) evaluate(); else bump(); },
  volt(v, commit) { const b = S.bench[S.exp]; b.V = Math.round(parseFloat(v) * 10) / 10; if (commit && S.closed) { evaluate(); return; } if (S.closed && S.last) S.last.sim = simulate(S.exp, b); bump(); },
  mode(id) { S.mode = id; bump(); },
  view() { if (rt.lab) rt.lab.goTo(S.exp, true); }
};

export function dashRows() { const counts = S.src === 'example' ? EXAMPLE.counts : S.stats.counts;
  return Object.keys(counts).map(k => ({ key: k, exp: k.split(':')[0], count: counts[k], ...MISTAKES[k] })).sort((a, b) => b.count - a.count); }
export function csvText() { return 'experiment,mistake,count,concept_to_revisit\n' + dashRows().map(r => [EXPERIMENTS[r.exp].title, r.label, r.count, r.concept].map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n'); }
export { fmtV };
