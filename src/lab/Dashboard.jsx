import { useState } from 'react';
import CORE from './core.js';
import { S, ACT, EXAMPLE, useLab, dashRows, csvText } from './store.js';
const { EXPERIMENTS } = CORE;

export default function Dashboard() {
  useLab();
  const [copy, setCopy] = useState(null);
  const ex = S.src === 'example', rows = dashRows(), max = Math.max(1, ...rows.map(r => r.count)), total = rows.reduce((a, r) => a + r.count, 0);
  const tile = (v, k) => <div className="card tile" key={k}><div className="v">{v}</div><div className="k">{k}</div></div>;
  const doCopy = () => { try { navigator.clipboard.writeText(csvText()).then(() => setCopy('copied'), () => setCopy('shown')); } catch (e) { setCopy('shown'); } };
  return (
    <main className="dashview">
      <div className="dash-head">
        <div><span className="eyebrow">Instructor view</span><h2>Where the class goes wrong</h2></div>
        <div className="seg" role="group" aria-label="Data source">
          <button type="button" aria-pressed={ex} onClick={() => { ACT.src('example'); setCopy(null); }}>Example class</button>
          <button type="button" aria-pressed={!ex} onClick={() => { ACT.src('session'); setCopy(null); }}>This session</button>
        </div>
      </div>
      {ex && <div className="notice">Example data for a class of {EXAMPLE.students} students, invented to show the layout. Switch to This session to see your own attempts.</div>}
      <div className="tiles">{ex
        ? [tile(EXAMPLE.students, 'students'), tile(EXAMPLE.completed.rc, 'finished all three'), tile(total, 'mistake cases caught'), tile(rows.length, 'different mistakes')]
        : [tile(S.stats.attempts, 'attempts'), tile(S.stats.mistakes, 'mistakes caught'), tile(S.stats.hints, 'hints given'), tile(Object.keys(S.completed).length + ' / 3', 'experiments done')]}</div>
      <div className="dash-grid">
        <section className="card">
          <div className="tray-head"><span className="eyebrow">Most frequent mistakes{ex ? ' · students who made each' : ' · times detected'}</span>
            <button className="btn small" type="button" disabled={!rows.length} onClick={doCopy}>{copy === 'copied' ? 'CSV copied' : 'Copy as CSV'}</button></div>
          {rows.length ? rows.map(r => (
            <div className="mrow" key={r.key}>
              <div className="name">{r.label}<span className="e">{EXPERIMENTS[r.exp].title}</span></div><div className="cnt">{r.count}</div>
              <div className="bar"><i style={{ width: `${Math.round(r.count / max * 100)}%` }} /></div><div className="concept">Revisit: {r.concept}</div>
            </div>)) : <p className="sub pad">No mistakes recorded yet. Run an experiment in the lab and they will appear here.</p>}
          {copy === 'shown' && <><p className="sub">Copying is blocked in this viewer. Select the text below and copy it.</p><textarea className="csv" readOnly aria-label="CSV export" value={csvText()} /></>}
        </section>
        <section className="card"><span className="eyebrow">Completion by experiment</span>
          <div className="comp">{Object.keys(EXPERIMENTS).map(id => { const n = ex ? EXAMPLE.completed[id] : (S.completed[id] ? 1 : 0), of = ex ? EXAMPLE.students : 1;
            return <div className="line" key={id}><span>{EXPERIMENTS[id].title}</span><div className="bar"><i style={{ width: `${Math.round(n / of * 100)}%` }} /></div><span className="num">{ex ? `${n} / ${of}` : (n ? 'done' : 'not yet')}</span></div>; })}</div>
          <p className="sub">{rows.length ? `Start the next lecture with: ${rows[0].concept}.` : 'The most common mistake will set the suggested topic for the next lecture.'}</p>
        </section>
      </div>
    </main>
  );
}
