import { useEffect, useRef, useState } from 'react';
import { C, useCustom, loadNetlist, selectPart, toggleSwitch, subscribeCustom, warnings } from './customStore.js';
import { schematicSVG, si } from './netlist.js';
import { createCustomScene } from './sceneCustom.js';

function hasWebGL() { try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); } catch (e) { return false; } }
const WEBGL = typeof document !== 'undefined' && hasWebGL();

function World({ sceneRef }) {
  const host = useRef(null);
  useEffect(() => {
    let sc = null;
    try { sc = createCustomScene(host.current); sceneRef.current = sc; } catch (e) { sceneRef.current = null; return; }
    const off = subscribeCustom(() => sc.sync());
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (sceneRef.current === sc) sc.sync(); });
    return () => { off(); sc.destroy(); if (sceneRef.current === sc) sceneRef.current = null; };
  }, []);
  return <div className="world" ref={host} />;
}

export default function CustomLab({ onBack, onHome }) {
  const c = useCustom();
  const sceneRef = useRef(null);
  const [edit, setEdit] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { document.body.classList.add('lock'); }, []);
  useEffect(() => { if (C.nl) setEdit(JSON.stringify(C.nl, null, 2)); }, [c.built]);

  if (!c.nl) {
    return (
      <main className="immersive custom-empty">
        <div className="hud-card" style={{ padding: 24, maxWidth: 420, margin: '20vh auto 0', pointerEvents: 'auto' }}>
          <h1 style={{ font: '400 26px/1.1 var(--serif)', margin: '0 0 8px' }}>Nothing on the bench yet</h1>
          <p style={{ color: 'var(--ink-soft)' }}>Send Nour a picture of a circuit in the chat and she will build it here.</p>
          <button type="button" className="hbtn" onClick={onHome}>← Back to Nour</button>
        </div>
      </main>
    );
  }
  const nl = c.nl, sol = c.sol, warns = warnings();
  const rebuild = () => { try { if (!loadNetlist(JSON.parse(edit))) setErr('The netlist needs a "components" list with two nodes per part.'); else setErr(''); } catch (e) { setErr('Invalid JSON: ' + e.message); } };
  const sw = nl.components.filter(x => x.type === 'switch');
  return (
    <main className="immersive custom">
      {WEBGL ? <World sceneRef={sceneRef} /> : <div className="world schematic"><div className="paper" dangerouslySetInnerHTML={{ __html: schematicSVG(nl) }} /></div>}
      <div className="hud">
        <header className="hud-top">
          <div className="ht-left">
            <button type="button" className="hud-back" onClick={onBack} aria-label="Leave the bench, back to Nour">← Nour</button>
            <div className="hud-card title-card">
              <span className="eyebrow">Free bench · built from your picture</span>
              <h1>{nl.title}</h1>
              {nl.summary && <p>{nl.summary}</p>}
            </div>
          </div>
          <span />
          <div className="ht-right">
            {sw.map(s => <button type="button" key={s.id} className={'hbtn'} aria-pressed={/clos|on/i.test(s.state || '')} onClick={() => toggleSwitch(s.id)}>{s.id}: {/clos|on/i.test(s.state || '') ? 'closed' : 'open'}</button>)}
            {WEBGL && <button type="button" className="hud-icon" aria-label="Reset camera" title="Reset camera" onClick={() => sceneRef.current && sceneRef.current.resetView()}>⟲</button>}
          </div>
        </header>

        <aside className="hud-card custom-side" aria-label="Explanation and readings">
          {nl.answer && <div className="cs-answer"><b>Answer</b><span>{nl.answer}</span></div>}
          {nl.steps.length > 0 && <><h2>How Nour solves it</h2><ol>{nl.steps.map((s, i) => <li key={i}>{s}</li>)}</ol></>}
          <h2>Readings <small>(click a part to see it on the wall screen)</small></h2>
          {sol && sol.error ? <p className="cs-warn">{sol.error}</p> : (
            <table className="cs-table"><thead><tr><th>Part</th><th>Value</th><th>Across</th><th>Current</th></tr></thead><tbody>
              {sol && sol.rows && sol.rows.map(r => (
                <tr key={r.c.id} className={c.selected === r.c.id ? 'on' : ''} onClick={() => selectPart(r.c.id)}>
                  <td>{r.c.id}</td><td>{r.c.value || (r.c.type === 'switch' ? r.c.state || 'open' : '')}</td><td>{si(r.vd, 'V')}</td><td>{r.I == null ? '–' : si(r.I, 'A')}</td>
                </tr>))}
            </tbody></table>)}
          {sol && sol.notes && sol.notes.map((n, i) => <p key={i} className="cs-warn">{n}</p>)}
          {warns.map((w, i) => <p key={i} className="cs-warn crit">⚠ {w}</p>)}
          <p className="cs-hint">Current is measured from each part's first node to its second. Capacitors count as open and inductors as short (steady state). Click a switch on the bench to open or close it.</p>
          {nl.uncertain.length > 0 && <><h2>Nour was not sure about</h2><ul>{nl.uncertain.map((u, i) => <li key={i} className="cs-warn">{u}</li>)}</ul></>}
          <details>
            <summary>Edit the netlist if Nour misread something</summary>
            <textarea value={edit} onChange={e => setEdit(e.target.value)} spellCheck={false} aria-label="Netlist JSON" />
            {err && <p className="cs-warn crit">{err}</p>}
            <button type="button" className="hbtn" onClick={rebuild}>Rebuild the bench</button>
          </details>
        </aside>
        {WEBGL && <div className="vp-hint">Drag to look around · scroll to zoom · click a part to read it · click a switch to flip it</div>}
      </div>
    </main>
  );
}
