// Value entry for variable parts: an Adjustable resistor (slider + box) or a Custom resistor (type any value).
// Accepts "470", "4.7k", "4k7", "1M" or "1.5 kΩ". When the lab rounds custom values, shows the real part used.
import { useEffect, useState } from 'react';
import CORE from './core.js';
import { settleValue } from '../../shared/labConfig.js';

export function parseOhms(text) {
  const m = String(text).trim().replace(/\s|Ω|ohms?/gi, '').replace(',', '.').match(/^(\d*\.?\d+)([kKmM]?)(\d*)$/);
  if (!m) return NaN;
  const mult = { '': 1, k: 1e3, K: 1e3, m: 1e6, M: 1e6 }[m[2]];
  // "4k7" style: the multiplier letter stands for the decimal point.
  if (m[3] && !m[2]) return NaN;
  return m[3] ? parseFloat(m[1] + '.' + m[3]) * mult : parseFloat(m[1]) * mult;
}
const LOG = v => Math.log10(v), EXP = t => +Math.pow(10, t).toPrecision(3);
const ROUND_NAME = { e12: 'E12', e24: 'E24' };

export default function ResistanceControl({ part, slotName, value, rounding = 'off', onChange }) {
  const p = CORE.PARTS[part];
  const [draft, setDraft] = useState(CORE.fmtR(value)), [note, setNote] = useState('');
  useEffect(() => { setDraft(CORE.fmtR(value)); }, [value]);
  if (!p?.variable) return null;
  function commit() {
    const typed = parseOhms(draft);
    if (!Number.isFinite(typed) || typed <= 0) { setNote(`Type a value like 470, 4.7k or 1M (${CORE.fmtR(p.min)} to ${CORE.fmtR(p.max)}).`); return; }
    const used = settleValue(part, typed, rounding);
    setNote(used === +typed.toPrecision(3) ? '' : typed < p.min || typed > p.max ? `Kept within ${CORE.fmtR(p.min)}–${CORE.fmtR(p.max)}: using ${CORE.fmtR(used)}.`
      : `You asked for ${CORE.fmtR(+typed.toPrecision(3))}. Real resistors don't come in that value, so this lab uses the nearest ${ROUND_NAME[rounding]} part: ${CORE.fmtR(used)}.`);
    onChange(used); setDraft(CORE.fmtR(used));
  }
  const id = 'rv-' + slotName.replace(/\W+/g, '-');
  return <div className="resistance-control">
    <label htmlFor={id}>{slotName}: {p.label}</label>
    <div className="rc-row">
      <input id={id} value={draft} inputMode="decimal" autoComplete="off" spellCheck="false" onChange={e => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} aria-describedby={id + '-help'} />
      <button type="button" onClick={commit}>Set</button>
    </div>
    {!p.custom && <input type="range" aria-label={`${slotName} resistance`} min={LOG(p.min)} max={LOG(p.max)} step="0.01" value={LOG(value)} onChange={e => { onChange(EXP(+e.target.value)); setNote(''); }} />}
    <small id={id + '-help'}>{note || (p.custom ? `Any value from ${CORE.fmtR(p.min)} to ${CORE.fmtR(p.max)}${rounding !== 'off' ? `, rounded to the nearest ${ROUND_NAME[rounding]} part` : ''}. Try 470, 4.7k or 1M.` : `${CORE.fmtR(p.min)} to ${CORE.fmtR(p.max)}. Drag, or type a value.`)}</small>
  </div>;
}

// One control per slot holding a variable part.
export function ResistanceControls({ slots, bench, rounding, onChange }) {
  return slots.filter(s => CORE.PARTS[bench[s.id]]?.variable).map(s => <ResistanceControl key={s.id + bench[s.id]} part={bench[s.id]} slotName={s.name}
    value={CORE.effective(bench[s.id], bench, s.id).ohms} rounding={rounding} onChange={v => onChange(s.id, v)} />);
}
