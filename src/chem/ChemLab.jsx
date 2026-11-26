// Chemistry bench: a walkable 3D lab room (chemScene3d.js) for titration and kinetics, with a 2D diagram as
// fallback. The server runs the simulation because the unknown (concentration, Ea) must never reach the
// browser; this view only draws and records.
import { useEffect, useRef, useState } from 'react';
import { api } from '../platform/api.js';
import { askNour, nourMode, onNourMode } from '../nour.js';
import { REAGENTS, INDICATORS, indicatorColor, hint as tHint, labContext as tContext } from '../../shared/engines/titration.js';
import { REACTIONS, fitLine, transform, hint as kHint, labContext as kContext } from '../../shared/engines/kinetics.js';
import { createChemLab3D, hasWebGL } from './chemScene3d.js';
import { QuizDialog } from '../platform/Quiz.jsx';
import './chem.css';

const WEBGL = typeof document !== 'undefined' && hasWebGL();

// ---------- The 3D room ----------
// Mounts the scene once per lab; later renders only push new state. Clicks in the room call onAction.
function ChemStage({ kind, config, state, onAction, mode, hud, hint, onFailure }) {
  const host = useRef(null), room = useRef(null), act = useRef(onAction);
  act.current = onAction;
  useEffect(() => {
    try { room.current = createChemLab3D(host.current, { kind, config, indicators: INDICATORS, onAction: a => act.current(a) }); }
    catch (e) { console.error('3D chemistry room failed:', e); onFailure(); return; }
    return () => { try { room.current?.destroy(); } catch (e) { console.error('3D room cleanup failed:', e); } room.current = null; };
  }, []);
  useEffect(() => { room.current?.setMode(mode); }, [mode]);
  useEffect(() => { room.current?.update(state); });
  return <section className="chem-stage" aria-label="3D lab room">
    <div className="chem-stage-host" ref={host} />
    <div className="chem-hud">{hud}</div>
    <p className="chem-stage-hint">{mode === 'walk' ? 'W A S D to walk · drag to look · click equipment to use it' : hint}</p>
  </section>;
}
const Chip = ({ k, v, tone }) => <div className={'chem-chip' + (tone ? ' ' + tone : '')}><span>{k}</span><b>{v}</b></div>;

const fmt = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '—');

// ---------- Small SVG line chart ----------
function Chart({ series, xLabel, yLabel, height = 220, fits = [] }) {
  const all = series.flatMap(s => s.points);
  if (!all.length) return <div className="chem-chart empty" style={{ height }}>No data yet</div>;
  const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
  let [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  if (x1 === x0) x1 = x0 + 1;
  if (y1 === y0) { y1 += Math.abs(y1) * 0.1 || 1; y0 -= Math.abs(y0) * 0.1 || 1; }
  const W = 460, H = height, L = 52, B = 34, T = 12, Rr = 12;
  const sx = x => L + (x - x0) / (x1 - x0) * (W - L - Rr), sy = y => H - B - (y - y0) / (y1 - y0) * (H - B - T);
  const ticks = (a, b) => Array.from({ length: 5 }, (_, i) => a + (b - a) * i / 4);
  const short = v => (Math.abs(v) >= 1000 || (Math.abs(v) < 0.01 && v !== 0) ? v.toExponential(1) : +v.toPrecision(3));
  return <svg className="chem-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${yLabel} against ${xLabel}`}>
    {ticks(y0, y1).map((v, i) => <g key={'y' + i}><line x1={L} x2={W - Rr} y1={sy(v)} y2={sy(v)} className="grid" /><text x={L - 6} y={sy(v) + 4} textAnchor="end">{short(v)}</text></g>)}
    {ticks(x0, x1).map((v, i) => <text key={'x' + i} x={sx(v)} y={H - B + 16} textAnchor="middle">{short(v)}</text>)}
    <text x={(L + W) / 2} y={H - 4} textAnchor="middle" className="axis">{xLabel}</text>
    <text x={12} y={(H - B) / 2} textAnchor="middle" className="axis" transform={`rotate(-90 12 ${(H - B) / 2})`}>{yLabel}</text>
    {fits.map((f, i) => <line key={'f' + i} x1={sx(x0)} x2={sx(x1)} y1={sy(f.intercept + f.slope * x0)} y2={sy(f.intercept + f.slope * x1)} stroke={f.color} strokeDasharray="5 4" strokeWidth="1.5" />)}
    {series.map(s => <g key={s.name}>
      {s.line && <polyline fill="none" stroke={s.color} strokeWidth="2" points={s.points.map(p => `${sx(p[0])},${sy(p[1])}`).join(' ')} />}
      {s.points.map((p, i) => <circle key={i} cx={sx(p[0])} cy={sy(p[1])} r={s.line ? 2.2 : 3.5} fill={s.color} />)}
    </g>)}
  </svg>;
}

// ---------- Nour, grounded in the bench ----------
// Nour's panel, laid out like the physics lab's Nour: avatar header, chat, quick questions, minimise.
const NourFace = () => <svg viewBox="0 0 40 40" className="chem-nour-face" aria-hidden="true"><rect x="6" y="9" width="28" height="22" rx="7" className="face" /><circle cx="15" cy="20" r="3.2" className="eye" /><circle cx="25" cy="20" r="3.2" className="eye" /><path d="M20 9V4" className="stem" strokeWidth="2" /><circle cx="20" cy="3.5" r="2" className="eye" /></svg>;
const QUICK = {
  titration: ['What should I do next?', 'Which indicator should I choose?', 'How do I calculate the concentration?'],
  kinetics: ['What should I do next?', 'How do I find the order?', 'How do I get Ea from my data?']
};
function ChemNour({ lab, context, offline, nudge }) {
  const [log, setLog] = useState([{ role: 'nour', text: `Hi, I'm Nour, your lab instructor. Ask me anything about this ${lab.engine === 'titration' ? 'titration' : 'kinetics experiment'}, or tap a question below.` }]);
  const [draft, setDraft] = useState(''), [busy, setBusy] = useState(false), [open, setOpen] = useState(true), [, tick] = useState(0);
  const box = useRef(null);
  useEffect(() => onNourMode(() => tick(x => x + 1)), []);
  useEffect(() => { box.current?.scrollTo(0, box.current.scrollHeight); }, [log, open]);
  // When the bench reports a result or a mistake, Nour says it in the chat, like a TA looking over your shoulder.
  useEffect(() => { if (nudge) { setLog(l => (l[l.length - 1]?.text === nudge ? l : [...l, { role: 'nour', text: nudge }])); setOpen(true); } }, [nudge]);
  async function ask(text) {
    text = text.trim(); if (!text || busy) return;
    const history = [...log, { role: 'user', text }];
    setLog([...history, { role: 'nour', text: '' }]); setDraft(''); setBusy(true); setOpen(true);
    const setLast = t => setLog(l => { const c = l.slice(); c[c.length - 1] = { role: 'nour', text: t }; return c; });
    let r = null;
    try { r = await askNour({ kind: 'lab', history, ctx: context(), labId: lab.id, state: context().state, onText: setLast }); } catch { r = null; }
    setLast(r?.text || offline());
    setBusy(false);
  }
  const mode = { claude: 'Answers with Claude', server: 'Gemini answers from your bench' }[nourMode()] || 'Offline answers from your bench';
  return <section className={'chem-panel chem-nour' + (open ? '' : ' folded')} aria-label="Chat with Nour">
    <header className="chem-nour-head"><NourFace /><div><b>Nour</b><span>LAB INSTRUCTOR</span></div>
      <button type="button" className="chem-nour-min" aria-expanded={open} aria-label={open ? 'Minimise Nour' : 'Open Nour'} onClick={() => setOpen(!open)}>{open ? '–' : '+'}</button></header>
    {open ? <>
      <div className="chem-nour-log" ref={box} aria-live="polite">{log.map((m, i) => <p key={i} className={'nmsg ' + m.role}>{m.text || '…'}</p>)}</div>
      <form onSubmit={e => { e.preventDefault(); ask(draft); }} className="chem-nour-form"><label className="sr-only" htmlFor="chem-nour-text">Ask Nour</label>
        <input id="chem-nour-text" value={draft} onChange={e => setDraft(e.target.value)} maxLength={500} placeholder="Ask Nour about your experiment…" />
        <button className="home-primary" disabled={busy || !draft.trim()}>Send</button></form>
      <p className="chem-mode">{mode}</p>
      <div className="chem-nour-quick">{(QUICK[lab.engine] || []).map(q => <button key={q} type="button" disabled={busy} onClick={() => ask(q)}>{q}</button>)}</div>
    </> : <p className="chem-nour-peek">{log[log.length - 1]?.text}</p>}
  </section>;
}

// ---------- Titration ----------
function Titration({ lab, onSaved, mode, onNo3D }) {
  const c = lab.config, a = REAGENTS[c.analyte], t = REAGENTS[c.titrant];
  const [rinsed, setRinsed] = useState(null), [indicator, setIndicator] = useState(''), [points, setPoints] = useState([]);
  const [endpoint, setEndpoint] = useState(null), [answer, setAnswer] = useState(''), [result, setResult] = useState(null), [level, setLevel] = useState(0), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const volume = points.length ? points[points.length - 1].v : 0;
  const pH = points.length ? points[points.length - 1].pH : null;
  const ready = rinsed !== null && indicator;
  async function add(dv) {
    if (!ready || busy) return;
    const v = Math.min(c.burette, +(volume + dv).toFixed(2));
    setBusy(true); setError('');
    try {
      const need = points.length ? [v] : [0, v];
      const r = await api(`labs/${lab.id}/sim`, 'POST', { volumes: need, rinsed });
      setPoints(p => [...p, ...r.points]);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  function reset() { setPoints([]); setEndpoint(null); setResult(null); }
  async function submit(e) {
    e.preventDefault(); setError('');
    const bench = { indicator, rinsed: !!rinsed, endpointMl: endpoint, reportedConc: answer === '' ? null : Number(answer) };
    try {
      const p = await api('practice', 'POST', { labId: lab.id, bench });
      const d = p.last.diagnosis; const lv = result?.diagnosis === d ? Math.min(3, level + 1) : 1;
      setLevel(lv); setResult({ diagnosis: d, hint: tHint(d, lv), success: d === 'success' }); onSaved?.();
    } catch (err) { setError(err.message); }
  }
  const color = pH === null || !indicator ? 'rgba(220,235,245,.25)' : indicatorColor(indicator, pH);
  const [notice, setNotice] = useState('');
  function onAction(a) {
    setNotice('');
    const started = points.length > 0;
    if ((a.type === 'rinse' || a.type === 'fill' || a.type === 'indicator') && started) return setNotice('The burette and indicator are fixed once you start. Empty the flask to start again.');
    if (a.type === 'rinse') setRinsed(true);
    else if (a.type === 'fill') setRinsed(false);
    else if (a.type === 'indicator') setIndicator(a.id);
    else if (a.type === 'add') { if (!ready) setNotice(rinsed === null ? 'Prepare the burette first: rinse and fill it, or fill it straight away.' : 'Choose an indicator from the bottles first.'); else add(a.dv); }
    else if (a.type === 'record') { if (started) setEndpoint(volume); else setNotice('Add titrant before recording an endpoint.'); }
  }
  const stage = { volume, pH, rinsed, indicator, endpoint, ready: !!ready, points, liquid: pH !== null && indicator ? indicatorColor(indicator, pH) : null,
    titrantName: t.name, titrantFormula: t.formula, titrantConc: c.titrantConc, indicatorNames: Object.fromEntries(c.indicators.map(i => [i, INDICATORS[i].name])) };
  const level01 = Math.max(0, 1 - volume / c.burette);
  const context = () => ({ title: lab.title, goal: lab.goal, concept: 'Acid–base titration', instructions: lab.instructions,
    state: tContext(c, { burette_rinsed_with_titrant: rinsed, indicator: indicator ? INDICATORS[indicator].name : null, volume_added_mL: volume, current_pH: pH, endpoint_recorded_mL: endpoint,
      readings: points.slice(-8).map(p => `${p.v} mL → pH ${p.pH}`) }, result?.diagnosis), hint_level: level });
  const offline = () => result && !result.success ? tHint(result.diagnosis, Math.min(3, level + 1))
    : !rinsed ? 'Start by rinsing the burette with a little titrant so water does not dilute it.'
      : !indicator ? 'Choose an indicator whose colour change falls in the steep jump of the curve at the equivalence point.'
        : endpoint === null ? 'Add titrant in big steps first, then drop by drop near the colour change. Record the first permanent change.'
          : 'Now calculate: moles of titrant = c × V(L), apply the reaction ratio, divide by the aliquot volume, then undo the dilution.';
  return <>{mode !== '2d' && <ChemStage kind="titration" config={c} state={stage} onAction={onAction} mode={mode} onFailure={onNo3D}
      hint="Drag to look around · click the wash bottle, an indicator, then the stopcock (hold to stream)"
      hud={<><Chip k="Added" v={`${fmt(volume)} mL`} tone="meter" /><Chip k="pH" v={pH === null ? '—' : fmt(pH)} /><Chip k="Indicator" v={indicator ? INDICATORS[indicator].name : 'none'} /><Chip k="Endpoint" v={endpoint === null ? '—' : `${fmt(endpoint)} mL`} tone={endpoint === null ? '' : 'good'} />
        {notice && <div className="chem-stage-notice" role="status">{notice}</div>}</>} />}
    <div className={'chem-layout' + (mode !== '2d' ? ' with-stage' : '')}>
    {mode === '2d' && <section className="chem-panel chem-bench" aria-label="Titration bench">
      <svg viewBox="0 0 260 420" className="chem-apparatus" role="img" aria-label={`Burette with ${fmt(volume)} mL added; flask colour from ${indicator ? INDICATORS[indicator].name : 'no indicator'}`}>
        <rect x="118" y="10" width="24" height="250" rx="4" className="glass" />
        <rect x="120" y={12 + (1 - level01) * 246} width="20" height={level01 * 246} className="titrant" />
        {Array.from({ length: 11 }, (_, i) => <g key={i}><line x1="142" x2={i % 5 ? 150 : 156} y1={12 + i * 24.6} y2={12 + i * 24.6} className="tick" />{i % 5 === 0 && <text x="160" y={16 + i * 24.6}>{(c.burette * i / 10).toFixed(0)}</text>}</g>)}
        <rect x="124" y="260" width="12" height="22" className="glass" /><rect x="112" y="268" width="36" height="7" rx="3" className="stopcock" />
        <path d="M128 282 L128 300 L132 300 L132 282" className="glass" />
        {busy && <circle cx="130" cy="312" r="3" className="drop" />}
        <path d="M100 330 L100 300 L160 300 L160 330 L205 400 Q210 412 196 412 L64 412 Q50 412 55 400 Z" className="glass flask" />
        <path d="M70 372 L190 372 L203 398 Q207 408 196 408 L64 408 Q53 408 57 398 Z" className="flask-water" /><path d="M70 372 L190 372 L203 398 Q207 408 196 408 L64 408 Q53 408 57 398 Z" fill={color} className="flask-liquid" />
      </svg>
      <div className="chem-readout"><span>Added <b>{fmt(volume)}</b> mL</span><span>pH <b>{pH === null ? '—' : fmt(pH)}</b></span></div>
    </section>}
    <section className="chem-panel chem-steps">
      <h2>1. Prepare the burette</h2>
      <div className="chem-row">
        <button type="button" className={rinsed === true ? 'home-primary' : 'home-outline'} disabled={points.length > 0} onClick={() => setRinsed(true)}>Rinse with {t.name}, then fill</button>
        <button type="button" className={rinsed === false ? 'home-primary' : 'home-outline'} disabled={points.length > 0} onClick={() => setRinsed(false)}>Fill straight away</button>
      </div>
      <h2>2. Choose an indicator</h2>
      <label className="sr-only" htmlFor="chem-indicator">Indicator</label>
      <select id="chem-indicator" value={indicator} disabled={points.length > 0} onChange={e => setIndicator(e.target.value)}>
        <option value="">Choose…</option>{c.indicators.map(i => <option key={i} value={i}>{INDICATORS[i].name} (pH {INDICATORS[i].low}–{INDICATORS[i].high})</option>)}
      </select>
      <h2>3. Titrate</h2>
      <p className="platform-help">Flask: {c.analyteVolume} mL aliquot of {a.name}{c.dilution > 1 ? ` (sample diluted ${c.dilution}×)` : ''}. Burette: {c.titrantConc} mol/L {t.name}.</p>
      <div className="chem-row">{[[5, '+5 mL'], [1, '+1 mL'], [0.1, '+0.1 mL'], [0.05, '+1 drop']].map(([dv, label]) =>
        <button key={label} type="button" className="home-outline" disabled={!ready || busy || volume >= c.burette} onClick={() => add(dv)}>{label}</button>)}</div>
      <div className="chem-row">
        <button type="button" className="home-primary" disabled={!points.length} onClick={() => setEndpoint(volume)}>Record endpoint at {fmt(volume)} mL</button>
        <button type="button" className="platform-text" onClick={reset}>Empty flask and start again</button>
      </div>
      {endpoint !== null && <p role="status">Endpoint recorded: <b>{fmt(endpoint)} mL</b></p>}
      <form onSubmit={submit}><h2>4. Calculate</h2>
        <label>Concentration of the original {a.name} solution (mol/L)<input type="number" step="any" min="0" value={answer} onChange={e => setAnswer(e.target.value)} /></label>
        <button className="home-primary" disabled={endpoint === null}>Check my result</button></form>
      {result && <div className={result.success ? 'platform-notice' : 'chem-hint'} role="status">{result.success ? 'Correct. ' : ''}{result.hint}</div>}
      {error && <div className="platform-error" role="alert">{error}</div>}
    </section>
    <section className="chem-panel chem-curve"><h2>Titration curve</h2>
      <Chart series={[{ name: 'pH', color: '#8fd3ff', line: true, points: points.map(p => [p.v, p.pH]) }]} xLabel={`${t.name} added (mL)`} yLabel="pH" />
      {indicator && <p className="platform-help">{INDICATORS[indicator].name} changes colour between pH {INDICATORS[indicator].low} and {INDICATORS[indicator].high}.</p>}
    </section>
    <ChemNour lab={lab} context={context} offline={offline} nudge={result ? (result.success ? 'Correct. ' : '') + result.hint : notice} />
  </div></>;
}

// ---------- Kinetics ----------
const RUN_COLORS = ['#8fd3ff', '#f2c94c', '#f08a6c', '#9be38f', '#c7a6ff', '#ff9ed0'];
function Kinetics({ lab, onSaved, mode, onNo3D }) {
  const c = lab.config, rx = REACTIONS[c.reaction];
  const [runs, setRuns] = useState({}), [plot, setPlot] = useState(1), [order, setOrder] = useState(''), [ea, setEa] = useState('');
  const [kelvin, setKelvin] = useState(true), [natural, setNatural] = useState(true), [result, setResult] = useState(null), [level, setLevel] = useState(0), [error, setError] = useState(''), [busy, setBusy] = useState(0);
  async function runAt(T) {
    setBusy(T); setError('');
    try { const r = await api(`labs/${lab.id}/sim`, 'POST', { temperature: T }); setRuns(x => ({ ...x, [T]: r.run })); } catch (e) { setError(e.message); } finally { setBusy(0); }
  }
  const temps = Object.keys(runs).map(Number).sort((a, b) => a - b);
  const series = temps.map((T, i) => ({ name: T + ' °C', color: RUN_COLORS[i % 6], points: runs[T].times.map((t, j) => [t, runs[T].conc[j]]).filter(p => p[1] > 0).map(p => [p[0], transform(plot, p[1])]) }));
  const fits = series.map(s => ({ ...fitLine(s.points.map(p => p[0]), s.points.map(p => p[1])), color: s.color, name: s.name }));
  const ks = temps.map((T, i) => ({ T, k: plot === 2 ? fits[i].slope : -fits[i].slope }));
  const arr = ks.filter(p => p.k > 0).map(p => [1 / (p.T + (kelvin ? 273.15 : 0)), natural ? Math.log(p.k) : Math.log10(p.k)]);
  const arrFit = arr.length >= 2 ? fitLine(arr.map(p => p[0]), arr.map(p => p[1])) : null;
  const yName = ['[A] (mol/L)', 'ln [A]', '1/[A] (L/mol)'][plot];
  const onAction = a => { if (a.type === 'run' && !busy) runAt(a.T); };
  const stage = { runs, busy, yName, series: series.map(s => ({ name: s.name, color: s.color, points: s.points })), reactionShort: rx.species + ' stock' };
  async function submit(e) {
    e.preventDefault(); setError('');
    const bench = { runs: temps, order: order === '' ? null : Number(order), eaKJ: ea === '' ? null : Number(ea) };
    try {
      const p = await api('practice', 'POST', { labId: lab.id, bench });
      const d = p.last.diagnosis, lv = result?.diagnosis === d ? Math.min(3, level + 1) : 1;
      setLevel(lv); setResult({ diagnosis: d, hint: kHint(d, lv), success: d.startsWith('success') }); onSaved?.();
    } catch (err) { setError(err.message); }
  }
  const context = () => ({ title: lab.title, goal: lab.goal, concept: 'Integrated rate laws and the Arrhenius equation', instructions: lab.instructions,
    state: kContext(c, { temperatures_run_C: temps, plot_shown: yName + ' vs t', fits: fits.map(f => `${f.name}: slope ${f.slope.toExponential(3)}, R² ${f.r2.toFixed(4)}`), arrhenius_axes: `${natural ? 'ln' : 'log10'} k vs 1/T in ${kelvin ? 'K' : '°C'}`, arrhenius_slope: arrFit?.slope, chosen_order: order, reported_Ea_kJ: ea }, result?.diagnosis), hint_level: level });
  const offline = () => result && !result.success ? kHint(result.diagnosis, Math.min(3, level + 1))
    : temps.length < 2 ? 'Run the reaction at two or more temperatures first: Ea comes from how k changes with temperature.'
      : 'Switch between the three plots and look at R². The straight one tells you the order; its slope gives k.';
  return <>{mode !== '2d' && <ChemStage kind="kinetics" config={c} state={stage} onAction={onAction} mode={mode} onFailure={onNo3D}
      hint="Drag to look around · click a water bath to run the reaction at that temperature"
      hud={<><Chip k="Runs" v={`${temps.length} / ${c.temperatures.length}`} tone="meter" /><Chip k="Plot" v={yName} />{fits.length > 0 && <Chip k="Best R²" v={Math.max(...fits.map(f => f.r2)).toFixed(4)} />}</>} />}
    <div className={'chem-layout' + (mode !== '2d' ? ' with-stage' : '')}>
    <section className="chem-panel chem-steps">
      <h2>1. Run the reaction</h2><p className="platform-help">{rx.equation} · tracking {rx.species} · starting at {c.c0} mol/L</p>
      <div className="chem-row">{c.temperatures.map(T => <button key={T} type="button" className={runs[T] ? 'home-primary' : 'home-outline'} disabled={!!busy} onClick={() => runAt(T)}>{busy === T ? 'Running…' : `Run at ${T} °C`}</button>)}</div>
      <h2>2. Find the order</h2>
      <div className="chem-row" role="radiogroup" aria-label="Plot">{['[A] vs t', 'ln[A] vs t', '1/[A] vs t'].map((n, i) => <button key={n} type="button" role="radio" aria-checked={plot === i} className={plot === i ? 'home-primary' : 'home-outline'} onClick={() => setPlot(i)}>{n}</button>)}</div>
      {fits.length > 0 && <table className="plan-table chem-fits"><thead><tr><th scope="col">Run</th><th scope="col">Slope</th><th scope="col">R²</th></tr></thead><tbody>{fits.map(f => <tr key={f.name}><td style={{ color: f.color }}>{f.name}</td><td>{f.slope.toExponential(3)}</td><td>{f.r2.toFixed(4)}</td></tr>)}</tbody></table>}
      <h2>3. Arrhenius plot</h2>
      <div className="chem-row"><label><input type="checkbox" checked={kelvin} onChange={e => setKelvin(e.target.checked)} /> 1/T in kelvin</label><label><input type="checkbox" checked={natural} onChange={e => setNatural(e.target.checked)} /> natural log (ln k)</label></div>
      <p className="platform-help">k is taken from the slope of the plot selected above{plot === 2 ? '' : ' (with the sign changed)'}.{arrFit && <> Arrhenius slope: <b>{arrFit.slope.toExponential(4)}</b></>}</p>
      <form onSubmit={submit}><h2>4. Report</h2>
        <label>Reaction order<select value={order} onChange={e => setOrder(e.target.value)}><option value="">Choose…</option><option value="0">Zero order</option><option value="1">First order</option><option value="2">Second order</option></select></label>
        <label>Activation energy Ea (kJ/mol)<input type="number" step="any" value={ea} onChange={e => setEa(e.target.value)} /></label>
        <button className="home-primary" disabled={!temps.length}>Check my result</button></form>
      {result && <div className={result.success ? 'platform-notice' : 'chem-hint'} role="status">{result.success ? 'Correct. ' : ''}{result.hint}</div>}
      {error && <div className="platform-error" role="alert">{error}</div>}
    </section>
    <section className="chem-panel chem-curve"><h2>{yName} against time</h2>
      <Chart series={series} fits={fits} xLabel="time (s)" yLabel={yName} />
      <h2>{natural ? 'ln k' : 'log₁₀ k'} against 1/T</h2>
      <Chart series={[{ name: 'k', color: '#f2c94c', points: arr }]} fits={arrFit ? [{ ...arrFit, color: '#f2c94c' }] : []} xLabel={`1/T (${kelvin ? 'K⁻¹' : '°C⁻¹'})`} yLabel={natural ? 'ln k' : 'log k'} height={200} />
    </section>
    <ChemNour lab={lab} context={context} offline={offline} nudge={result ? (result.success ? 'Correct. ' : '') + result.hint : ''} />
  </div></>;
}

export default function ChemLab({ lab, onBack, onSaved }) {
  const Bench = lab.engine === 'titration' ? Titration : Kinetics;
  const [showInfo, setShowInfo] = useState(false), [showQuiz, setShowQuiz] = useState(false), [mode, setMode] = useState(WEBGL ? 'orbit' : '2d'), [no3D, setNo3D] = useState(!WEBGL);
  const views = [['orbit', '3D room'], ['walk', 'Walk'], ['2d', 'Diagram']].filter(([m]) => m === '2d' || !no3D);
  const immersive = mode !== '2d';
  const [hidden, setHidden] = useState(false);
  // Full-screen room like the physics labs: hide the site navigation and stop page scrolling.
  useEffect(() => {
    document.body.classList.toggle('chem-immersive-on', immersive);
    return () => document.body.classList.remove('chem-immersive-on');
  }, [immersive]);
  useEffect(() => {
    const key = e => { if (e.key === 'Escape' && showInfo) setShowInfo(false); };
    addEventListener('keydown', key); return () => removeEventListener('keydown', key);
  }, [showInfo]);
  return <main className={'platform-page chem-page' + (immersive ? ' chem-immersive' : '') + (immersive && hidden ? ' panels-hidden' : '')}>
    <div className="chem-top"><button type="button" className={immersive ? 'chem-back' : 'platform-text'} onClick={onBack}>{immersive ? '← Labs' : '← Back to lab details'}</button>
      <div><div className="section-kicker">CHEMISTRY · {lab.engine === 'titration' ? 'TITRATION' : 'KINETICS'}</div><h1>{lab.title}</h1><p>{lab.goal}</p></div>
      <div className="chem-actions">
        <div className="chem-views" role="radiogroup" aria-label="View">{views.map(([m, label]) => <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}>{label}</button>)}</div>
        <button type="button" className="home-outline" aria-expanded={showInfo} onClick={() => setShowInfo(!showInfo)}>Lab instructions</button>
        {lab.quiz?.length > 0 && <button type="button" className="home-primary" onClick={() => setShowQuiz(true)}>Take the quiz</button>}
        {immersive && <button type="button" className="home-outline" aria-pressed={hidden} onClick={() => setHidden(!hidden)}>{hidden ? 'Show panels' : 'Hide panels'}</button>}
      </div></div>
    {no3D && WEBGL && <p className="platform-help">The 3D room could not start on this device, so the lab is shown as a diagram.</p>}
    {showInfo && <section className="chem-panel chem-info" role="dialog" aria-label="Lab instructions">{immersive && <button type="button" className="chem-info-close" aria-label="Close instructions" onClick={() => setShowInfo(false)}>×</button>}<h2>Learning outcomes</h2><p className="preserve-lines">{lab.outcomes}</p><h2>Instructions</h2><p className="preserve-lines">{lab.instructions}</p></section>}
    <Bench lab={lab} onSaved={onSaved} mode={mode} onNo3D={() => { setNo3D(true); setMode('2d'); }} />
    {showQuiz && <QuizDialog lab={lab} onClose={() => setShowQuiz(false)} />}
  </main>;
}
