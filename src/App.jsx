import { useEffect, useRef, useState } from 'react';
import Home from './home/Home.jsx';
import CardFace from './home/CardFace.jsx';
import LabView from './lab/LabView.jsx';
import Dashboard from './lab/Dashboard.jsx';
import CustomLab from './lab/CustomLab.jsx';
import { loadNetlist } from './lab/customStore.js';
import { ACT, reduced } from './lab/store.js';
import { labById } from './labs.js';

const VIEWS = ['home', 'lab', 'dashboard', 'custom'];
const fromHash = () => { const h = location.hash.replace('#', ''); return VIEWS.includes(h) ? h : 'home'; };

export default function App() {
  const [view, setView] = useState(fromHash);
  const [introDone, setIntroDone] = useState(() => reduced || fromHash() !== 'home');
  const playIntro = useRef(!(reduced || fromHash() !== 'home')).current;
  const [transit, setTransit] = useState(null); // { lab, rect }
  const navName = useRef(null), ringRef = useRef(null), zoomRef = useRef(null);

  useEffect(() => {
    const on = () => setView(fromHash());
    window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    document.body.classList.toggle('lock', view === 'home' || view === 'lab' || view === 'custom');
    document.title = view === 'custom' ? 'Sim2Skill Free Bench' : view === 'lab' ? 'Sim2Skill Lab' : view === 'dashboard' ? 'Sim2Skill Dashboard' : 'Sim2Skill';
  }, [view]);

  const go = v => { if (v === view) return; history.pushState(null, '', '#' + v); setView(v); window.scrollTo(0, 0); };

  // chat or card → spin the ring to the card → zoom the card to full screen → the lab
  async function openLab(id) {
    if (transit) return;
    if (view !== 'home' || !ringRef.current || reduced) { ACT.enter(id); go('lab'); return; }
    setTransit({ lab: labById(id), rect: null });
    const res = await ringRef.current.focus(id);
    const r = res && res.el ? res.el.getBoundingClientRect() : { left: innerWidth / 2 - 140, top: innerHeight / 2 - 80, width: 280, height: 160 };
    setTransit({ lab: labById(id), rect: { left: r.left, top: r.top, width: r.width, height: r.height } });
  }
  useEffect(() => {
    if (!transit || !transit.rect || !zoomRef.current) return;
    const el = zoomRef.current, r = transit.rect;
    const a = el.animate([
      { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: '16px' },
      { left: '0px', top: '0px', width: `${innerWidth}px`, height: `${innerHeight}px`, borderRadius: '0px' }
    ], { duration: 820, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' });
    a.onfinish = () => {
      ACT.enter(transit.lab.id); go('lab');
      requestAnimationFrame(() => {
        const b = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 520, easing: 'ease-out', fill: 'forwards' });
        b.onfinish = () => { setTransit(null); ringRef.current && ringRef.current.release(); };
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transit && transit.rect]);

  // Nour read a circuit picture: build it on the free bench
  const openCustom = nl => { if (loadNetlist(nl)) go('custom'); };

  const navLink = (v, label) => <a href={'#' + v} aria-current={view === v ? 'page' : undefined} onClick={e => { e.preventDefault(); go(v); }}>{label}</a>;

  return (
    <>
      <nav className={'nav' + (introDone ? ' ready' : '') + (view === 'lab' || view === 'custom' ? ' gone' : '')} aria-label="Main">
        <a href="#home" className="wordmark" onClick={e => { e.preventDefault(); go('home'); }}>
          <span className="wmFirst" ref={navName}>Sim2Skill</span><span className="wmRest">&nbsp;Lab.</span>
        </a>
        <div className="links">{navLink('home', 'Home')}<span className="sl">/</span>{navLink('lab', 'Lab')}<span className="sl">/</span>{navLink('dashboard', 'Dashboard')}</div>
      </nav>
      <div className={'view' + (view === 'home' ? '' : ' hidden')} hidden={view !== 'home'}>
        <Home active={view === 'home'} playIntro={playIntro} onIntroDone={() => setIntroDone(true)} navNameRef={navName} onOpenLab={openLab} onOpenCustom={openCustom} transit={transit} ringRef={ringRef} />
      </div>
      {view === 'lab' && <div className="view fade"><LabView onBack={() => go('home')} onDashboard={() => go('dashboard')} /></div>}
      {view === 'custom' && <div className="view fade"><CustomLab onBack={() => go('home')} onHome={() => go('home')} /></div>}
      {view === 'dashboard' && <div className="view fade"><Dashboard /></div>}
      {transit && transit.rect && (
        <div className="zoom" ref={zoomRef} style={{ left: transit.rect.left, top: transit.rect.top, width: transit.rect.width, height: transit.rect.height }} aria-hidden="true">
          <CardFace lab={transit.lab} />
          <div className="zoom-title"><span>Entering</span><b>{transit.lab.title}</b></div>
        </div>
      )}
    </>
  );
}
