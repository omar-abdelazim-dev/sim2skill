import { useEffect, useRef, useState } from 'react';
import Ring from './Ring.jsx';
import Chat from './Chat.jsx';
import CardFace from './CardFace.jsx';
import CorridorBackdrop from './CorridorBackdrop.jsx';
import { LIVE } from '../labs.js';

const DETAILS = {
  ohm: { topic: 'Voltage & current', title: "Ohm’s law", time: '10 min', lesson: 'Find the relationship between voltage, resistance, and current.', task: 'Your target: exactly 10 mA', level: 'Start here' },
  led: { topic: 'Component safety', title: 'Save the LED', time: '12 min', lesson: 'Choose a resistor that keeps a tiny light glowing safely.', task: 'Your target: a safe, glowing LED', level: 'Build on the basics' },
  rc: { topic: 'Energy & time', title: 'RC charging', time: '15 min', lesson: 'Watch a capacitor charge and discover what sets its pace.', task: 'Your target: 63% charge in 1 second', level: 'Try something new' }
};

export default function Home({ active, onIntroDone, onOpenLab, transit, ringRef }) {
  const chatRef = useRef(null);
  const [gallery, setGallery] = useState(false);
  useEffect(() => { onIntroDone(); }, []);
  const ask = () => { document.getElementById('nour-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); chatRef.current?.focus(); };
  return (<>
    <CorridorBackdrop />
    <main className={'home-v2' + (transit ? ' is-opening' : '')}>
      <section className="home-intro" aria-labelledby="home-title">
        <div className="intro-copy">
          <div className="home-kicker"><span className="kicker-mark">✳</span> A LITTLE CURIOSITY GOES A LONG WAY</div>
          <h1 id="home-title">Less memorizing.<br/>More <em>lightbulb moments.</em></h1>
          <p>Your own electronics lab. Build, experiment, and learn from every mistake—with Nour by your side.</p>
          <div className="intro-actions"><a className="home-primary" href="#experiments" onClick={e => {e.preventDefault();document.getElementById('experiments')?.scrollIntoView({behavior:'smooth',block:'start'});}}>Find an experiment</a><button className="home-text-button" onClick={ask}>Meet your lab instructor</button></div>
        </div>
        <div className="learning-note">
          <div className="learning-note-top"><span className="note-icon">⌁</span><span>SMALL EXPERIMENTS.<br/>REAL UNDERSTANDING.</span></div>
          <p>“What happens if I change this?”</p>
          <div className="learning-steps"><span>Build</span><i/><span>Observe</span><i/><span>Understand</span></div>
          <div className="note-bottom">A safe space to get it wrong. And figure it out.</div>
        </div>
      </section>

      <section className="home-workspace" aria-label="Experiments and instructor">
        <div className="experiment-section" id="experiments">
          <div className="home-section-head"><div><span className="section-kicker">THE WORKBENCH</span><h2>What will you discover today?</h2></div><a className="availability" href="#browse">Explore all {LIVE.length} labs</a></div>
          <div className="experiment-grid">
            {LIVE.filter(lab=>DETAILS[lab.id]).map(lab => { const d = DETAILS[lab.id]; return <article className={'experiment-card experiment-' + lab.id} key={lab.id}>
              <div className="experiment-art" aria-hidden="true"><CardFace lab={lab}/><span className="experiment-level">{d.level}</span></div>
              <div className="experiment-copy"><div className="experiment-meta"><span>{d.topic}</span><span>{d.time}</span></div><h3>{d.title}</h3><p>{d.lesson}</p><div className="experiment-task">{d.task}</div><button className={'experiment-open' + (lab.id === 'ohm' ? ' recommended' : '')} onClick={() => onOpenLab(lab.id)} disabled={!!transit}>Open {d.title} lab</button></div>
            </article>; })}
          </div>
          <div className="bench-reassurance"><span className="reassurance-icon">✓</span><p>No equipment. No setup. Just you, a circuit, and a good question.</p></div>
        </div>
        <aside className="instructor-section" id="nour-panel"><div className="home-section-head"><div><span className="section-kicker">A LITTLE GUIDANCE</span><h2>Never stuck for long.</h2></div></div><Chat ref={chatRef} onOpenLab={onOpenLab} disabled={!!transit}/></aside>
      </section>

      <section className="explore-section" aria-label="Lab roadmap"><div className="explore-copy"><span className="explore-symbol" aria-hidden="true">⊞</span><div><h2>A whole world of “what if?”</h2><p>More electronics, physics, and chemistry experiments are on the way.</p></div></div><button className="home-outline" aria-expanded={gallery} aria-controls="lab-gallery" onClick={() => setGallery(v => !v)}>{gallery ? 'Close lab gallery' : 'Explore the lab gallery'}</button></section>
      {gallery && <div id="lab-gallery" className="home-gallery"><p>Drag to explore the gallery. Labs marked “Soon” are previews.</p><div className="gallery-scene"><Ring ref={ringRef} stage="done" active={active && !transit} focusLab={null} onOpen={onOpenLab} onSoon={lab => {chatRef.current?.soon(lab);ask();}} onExpanded={() => {}}/></div></div>}
      <footer className="home-footer"><span>Sim2Skill <span className="footer-caption">· Learning through doing.</span></span><span>Built for curious minds. <span className="footer-spark">✳</span></span></footer>
    </main>
  </>);
}
