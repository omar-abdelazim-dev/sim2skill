// Entry point for creating or editing a lab: picks the circuit builder or the chemistry builder.
import { useEffect, useState } from 'react';
import { api } from './api.js';
import Builder from './Builder.jsx';
import CardFace from '../home/CardFace.jsx';
import { QuizEditor } from './Quiz.jsx';
import '../chem/chem.css';
import { REAGENTS, INDICATORS, phAt, equivalenceVolume, indicatorSuitable, indicatorVolume, titration } from '../../shared/engines/titration.js';
import { REACTIONS, kinetics, run } from '../../shared/engines/kinetics.js';

const ENGINES = { titration, kinetics };
const KINDS = [
  { id: 'circuits', art: 'ohm', title: 'Physics: circuits', text: 'Seven circuit layouts with your own supply, parts, target and starting circuit.' },
  { id: 'titration', art: 'flask', title: 'Chemistry: titration', text: 'Any acid or base from the catalogue, your concentrations, dilution, endpoint and indicators.' },
  { id: 'kinetics', art: 'beakers', title: 'Chemistry: kinetics', text: 'A catalogued reaction, your rate constant, temperatures and tolerance.' }
];

export default function LabEditor({ id, user, onSaved }) {
  const [kind, setKind] = useState(id ? null : ''), [lab, setLab] = useState(null), [error, setError] = useState('');
  useEffect(() => {
    if (!id) return;
    api('labs/' + id).then(l => { if (l.authorId !== user.id || l.status !== 'draft') throw Error('Only your own unpublished drafts can be edited.'); setLab(l); setKind(l.engine); }).catch(e => setError(e.message));
  }, [id, user.id]);
  if (error) return <main className="platform-page"><div className="platform-error" role="alert">{error}</div></main>;
  if (kind === null) return <main className="platform-page" role="status">Loading your lab…</main>;
  if (kind === 'circuits') return <Builder id={id} user={user} onSaved={onSaved} />;
  if (kind) return <ChemBuilder engine={kind} lab={lab} onSaved={onSaved} onBack={id ? null : () => setKind('')} />;
  return <main className="platform-page"><a className="platform-text" href="#studio">Back to studio</a>
    <div className="section-kicker">LAB STUDIO / NEW LAB</div><h1>What will your students explore?</h1>
    <div className="public-lab-grid kind-grid">{KINDS.map(k => <button key={k.id} type="button" className="public-lab-card kind-card" onClick={() => setKind(k.id)}>
      <div className="public-lab-art"><CardFace lab={{ art: k.art }} /></div><div className="public-lab-body"><h3>{k.title}</h3><p>{k.text}</p></div></button>)}</div>
  </main>;
}

function Num({ label, value, onChange, step = 'any', min, max, help }) {
  return <label>{label}<input type="number" step={step} min={min} max={max} value={value} onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))} required />{help && <small className="platform-help">{help}</small>}</label>;
}

function ChemBuilder({ engine, lab, onSaved, onBack }) {
  const E = ENGINES[engine];
  const [form, setForm] = useState(() => lab ? { ...lab, accessCode: '' } : { template: engine, title: '', description: '', outcomes: '', instructions: '', visibility: 'public', accessCode: '', quiz: [], config: E.defaultConfig() });
  const [error, setError] = useState(''), [check, setCheck] = useState(''), [busy, setBusy] = useState(false), [issued, setIssued] = useState('');
  const c = form.config;
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setCheck(''); };
  const conf = (k, v) => set('config', { ...c, [k]: v });
  let valid = null, problem = '';
  try { valid = E.validateConfig(engine, c); } catch (e) { problem = e.message; }

  async function save(e) {
    e.preventDefault(); setError(''); setBusy(true);
    try { const saved = await api(lab ? 'labs/' + lab.id : 'labs', lab ? 'PUT' : 'POST', form); if (saved.accessCode) setIssued(saved.accessCode); else onSaved(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  function runCheck() { try { E.checkPublishable(engine, c); setCheck('Ready: the reference solution passes and every invariant holds.'); } catch (e) { setCheck(e.message); } }

  if (issued) return <main className="platform-page"><section className="platform-panel access-issued" role="status"><div className="section-kicker">PRIVATE LAB SAVED</div><h1>Share this access code</h1>
    <p>Only people with this code can open the lab. It is shown once.</p><p className="access-code">{issued}</p>
    <div className="public-lab-actions"><button type="button" className="home-outline" onClick={() => navigator.clipboard?.writeText(issued)}>Copy code</button><button type="button" className="home-primary" onClick={onSaved}>Continue to studio</button></div></section></main>;

  const analyte = REAGENTS[c.analyte];
  return <main className="platform-page builder-page"><form onSubmit={save}>
    <div className="builder-top"><div>{onBack ? <button type="button" className="platform-text" onClick={onBack}>Choose another kind</button> : <a className="platform-text" href="#studio">Back to studio</a>}
      <div className="section-kicker">LAB STUDIO / CHEMISTRY BUILDER</div><h1>{form.title || (engine === 'titration' ? 'Design a titration.' : 'Design a kinetics study.')}</h1>
      <p>Reagents come from a curated catalogue with textbook constants, so every lab you build is chemically correct.</p></div>
      <div className="builder-save"><button className="home-primary" disabled={busy}>{busy ? 'Saving…' : 'Save lab draft'}</button></div></div>
    {error && <div className="platform-error" role="alert">{error}</div>}
    <div className="chem-builder">
      <section className="platform-panel"><h2>Experiment</h2>
        {engine === 'titration' ? <>
          <label>Analyte (in the flask)<select value={c.analyte} onChange={e => { const a = REAGENTS[e.target.value]; set('config', { ...c, analyte: e.target.value, titrant: a.kind === 'acid' ? 'naoh' : 'hcl', endpoint: a.endpoints[0] }); }}>
            {Object.entries(REAGENTS).map(([k, r]) => <option key={k} value={k}>{r.name} ({r.formula}), {r.kind}</option>)}</select><small className="platform-help">{analyte.hazards}</small></label>
          <label>Titrant<select value={c.titrant} onChange={e => conf('titrant', e.target.value)}>{['naoh', 'hcl'].map(k => <option key={k} value={k} disabled={REAGENTS[k].kind === analyte.kind}>{REAGENTS[k].name}</option>)}</select></label>
          <Num label="Original analyte concentration (mol/L), hidden from students" value={c.analyteConc} onChange={v => conf('analyteConc', v)} min={0.001} max={2} />
          <Num label="Dilution factor before titrating" value={c.dilution} onChange={v => conf('dilution', v)} min={1} max={100} help="1 means no dilution." />
          <Num label="Aliquot in the flask (mL)" value={c.analyteVolume} onChange={v => conf('analyteVolume', v)} min={5} max={50} />
          <Num label="Titrant concentration (mol/L)" value={c.titrantConc} onChange={v => conf('titrantConc', v)} min={0.01} max={1} />
          <label>Endpoint (equivalents of titrant per analyte)<select value={c.endpoint} onChange={e => conf('endpoint', Number(e.target.value))}>{analyte.endpoints.map(n => <option key={n} value={n}>{n}</option>)}</select></label>
          <label>Burette<select value={c.burette} onChange={e => conf('burette', Number(e.target.value))}><option value={25}>25 mL</option><option value={50}>50 mL</option></select></label>
          <fieldset className="visibility-choice"><legend>Indicators students can choose</legend>{Object.entries(INDICATORS).map(([k, ind]) => <label key={k}>
            <input type="checkbox" checked={c.indicators.includes(k)} onChange={e => conf('indicators', e.target.checked ? [...c.indicators, k] : c.indicators.filter(x => x !== k))} /> {ind.name} (pH {ind.low}–{ind.high})
            {valid && <small className="platform-help">{indicatorSuitable(valid, k) ? ' · suitable' : ' · changes too early or late'}</small>}</label>)}</fieldset>
        </> : <>
          <label>Reaction<select value={c.reaction} onChange={e => { const r = REACTIONS[e.target.value]; set('config', { ...c, reaction: e.target.value, k25: r.k25.default, EaKJ: r.EaKJ, c0: r.c0.default }); }}>
            {Object.entries(REACTIONS).map(([k, r]) => <option key={k} value={k}>{r.name}</option>)}</select><small className="platform-help">{REACTIONS[c.reaction].equation} · order {REACTIONS[c.reaction].order} · {REACTIONS[c.reaction].hazards}</small></label>
          <Num label={`k at 25 °C (${REACTIONS[c.reaction].unit}), hidden from students`} value={c.k25} onChange={v => conf('k25', v)} help={`Allowed ${REACTIONS[c.reaction].k25.min}–${REACTIONS[c.reaction].k25.max}`} />
          <Num label="Activation energy (kJ/mol), hidden from students" value={c.EaKJ} onChange={v => conf('EaKJ', v)} help={`Within 10% of the literature value, ${REACTIONS[c.reaction].EaKJ} kJ/mol`} />
          <Num label="Starting concentration (mol/L)" value={c.c0} onChange={v => conf('c0', v)} />
          <fieldset className="visibility-choice"><legend>Temperatures students can run (°C)</legend><div className="chem-row">{[5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60].map(T => <label key={T}>
            <input type="checkbox" checked={c.temperatures.includes(T)} onChange={e => conf('temperatures', e.target.checked ? [...c.temperatures, T].sort((a, b) => a - b) : c.temperatures.filter(x => x !== T))} /> {T}</label>)}</div></fieldset>
        </>}
        <label>Tolerance<select value={c.tolerance} onChange={e => conf('tolerance', Number(e.target.value))}>{(engine === 'titration' ? [1, 2, 5] : [5, 10, 15]).map(t => <option key={t} value={t}>{t}%</option>)}</select></label>
        {problem ? <div className="platform-error" role="alert">{problem}</div> : <p className="platform-help">Goal shown to students: {E.goal(engine, valid)}</p>}
        <button type="button" className="home-outline" onClick={runCheck} disabled={!valid}>Check the lab</button>
        {check && <div className="platform-notice" role="status">{check}</div>}
      </section>
      <section className="platform-panel"><h2>Preview</h2>{valid ? <Preview engine={engine} c={valid} /> : <p>Fix the settings to see a preview.</p>}</section>
      <section className="platform-panel"><h2>Teaching content</h2>
        <label>Lab title<input value={form.title} onChange={e => set('title', e.target.value)} minLength={3} maxLength={100} required /></label>
        <fieldset className="visibility-choice"><legend>Who can open this lab?</legend>
          <label><input type="radio" name="visibility" checked={form.visibility !== 'private'} onChange={() => set('visibility', 'public')} /> Public: listed and your followers are notified</label>
          <label><input type="radio" name="visibility" checked={form.visibility === 'private'} onChange={() => set('visibility', 'private')} /> Private: only people with an access code</label>
          {form.visibility === 'private' && <label>Custom access code (optional)<input value={form.accessCode} onChange={e => set('accessCode', e.target.value)} minLength={6} maxLength={64} autoComplete="off" placeholder="Leave empty to generate a code" /></label>}</fieldset>
        <label>Public description<textarea value={form.description} onChange={e => set('description', e.target.value)} maxLength={700} /></label>
        <label>Learning outcomes<textarea value={form.outcomes} onChange={e => set('outcomes', e.target.value)} maxLength={1500} /></label>
        <label>Instructions<textarea value={form.instructions} onChange={e => set('instructions', e.target.value)} maxLength={6000} /></label>
      </section>
      <section className="platform-panel chem-builder-quiz"><QuizEditor quiz={form.quiz || []} onChange={q => set('quiz', q)} /></section>
    </div>
  </form></main>;
}

function Preview({ engine, c }) {
  if (engine === 'titration') {
    const veq = equivalenceVolume(c), n = 80;
    const pts = Array.from({ length: n + 1 }, (_, i) => { const v = Math.min(c.burette, veq * 1.6) * i / n; return [v, phAt(c, v)]; });
    const W = 420, H = 220, sx = v => 40 + v / pts[n][0] * (W - 50), sy = p => H - 25 - p / 14 * (H - 35);
    return <><svg viewBox={`0 0 ${W} ${H}`} className="chem-chart" role="img" aria-label="Expected titration curve">
      {[0, 7, 14].map(p => <g key={p}><line x1="40" x2={W - 10} y1={sy(p)} y2={sy(p)} className="grid" /><text x="34" y={sy(p) + 4} textAnchor="end">{p}</text></g>)}
      <line x1={sx(veq)} x2={sx(veq)} y1="10" y2={H - 25} stroke="#f2c94c" strokeDasharray="4 4" />
      <polyline fill="none" stroke="#8fd3ff" strokeWidth="2" points={pts.map(([v, p]) => `${sx(v)},${sy(p)}`).join(' ')} /></svg>
      <p className="platform-help">Equivalence at {veq.toFixed(2)} mL, pH {phAt(c, veq).toFixed(2)}. {c.indicators.map(i => `${INDICATORS[i].name}: ${indicatorVolume(c, i)?.toFixed(2) ?? '—'} mL`).join(' · ')}</p></>;
  }
  const colors = ['#8fd3ff', '#f2c94c', '#f08a6c', '#9be38f', '#c7a6ff', '#ff9ed0'];
  const runs = c.temperatures.map(T => run(c, T)), tMax = Math.max(...runs.map(r => r.times[10])), W = 420, H = 220;
  const sx = t => 40 + t / tMax * (W - 50), sy = y => H - 25 - y / c.c0 * (H - 35);
  return <><svg viewBox={`0 0 ${W} ${H}`} className="chem-chart" role="img" aria-label="Expected concentration against time">
    {runs.map((r, i) => <polyline key={r.temperature} fill="none" stroke={colors[i % 6]} strokeWidth="2" points={r.times.map((t, j) => `${sx(t)},${sy(r.conc[j])}`).join(' ')} />)}</svg>
    <p className="platform-help">{runs.map((r, i) => <span key={r.temperature} style={{ color: colors[i % 6] }}>{r.temperature} °C </span>)}· runs last {Math.round(tMax)} s</p></>;
}
