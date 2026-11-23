import {useEffect,useRef,useState} from 'react';
import Home from './home/Home.jsx';
import LabView from './lab/LabView.jsx';
import {ACT,S,subscribe,stopVoice,rt,bump} from './lab/store.js';
import {api} from './platform/api.js';
import {Auth,Browse,Details,Editor,Studio,Profile,PracticeHistory,RoleGate,LoadError} from './platform/Pages.jsx';
const route=()=>location.hash.slice(1)||'home';
const initialState=structuredClone(S);
export default function App(){
 const [view,setView]=useState(route),[user,setUser]=useState(null),[ready,setReady]=useState(false),[error,setError]=useState(''),[activeLab,setActiveLab]=useState(null),[showInstructions,setShowInstructions]=useState(false);
 const ringRef=useRef(null),navName=useRef(null),instructionsRef=useRef(null);const [page,id]=view.split('?')[0].split('/');
 const go=v=>{if(route()!==v)location.hash=v;setView(v);window.scrollTo(0,0);};
 useEffect(()=>{const on=()=>{setView(route());window.scrollTo(0,0)};window.addEventListener('hashchange',on);api('session').then(v=>setUser(v.user)).catch(e=>setError(e.message)).finally(()=>setReady(true));return()=>window.removeEventListener('hashchange',on)},[]);
 useEffect(()=>{document.body.classList.toggle('lock',page==='lab'&&!!user&&!!activeLab);document.title=page==='lab'?'Sim2Skill Lab':'Sim2Skill';return()=>document.body.classList.remove('lock')},[page,user,activeLab]);
 useEffect(()=>{stopVoice();Object.assign(S,structuredClone(initialState));rt.scope=null;rt.held=null;rt.aim=null;setActiveLab(null);bump()},[user?.id]);
 useEffect(()=>{if(!user||!activeLab||page!=='lab')return;let count=S.stats.attempts;let chain=Promise.resolve();return subscribe(()=>{if(S.stats.attempts<=count)return;count=S.stats.attempts;if(S.exp!==activeLab.template)return;const bench={...(S.ctx[S.exp]?.b||S.bench[S.exp])};chain=chain.then(()=>api('practice','POST',{labId:activeLab.id,bench})).catch(e=>setError('Practice could not be saved: '+e.message));})},[user?.id,activeLab,page]);
 useEffect(()=>{if(showInstructions)instructionsRef.current?.showModal()},[showInstructions]);
 async function practise(l){setError('');try{await api('practice','POST',{labId:l.id});setActiveLab(l);setShowInstructions(false);ACT.loadLab(l);go('lab')}catch(e){setError(e.message)}}
 function authenticated(u){setUser(u);const next=new URLSearchParams(view.split('?')[1]||'').get('next');go(next&&/^details\/[a-zA-Z0-9-]+$/.test(next)?next:u.role==='tutor'?'studio':'browse')}
 const navLink=(v,label)=><a href={'#'+v} aria-current={page===v?'page':undefined}>{label}</a>;
 return <><nav className={'nav ready platform-nav'+(page==='lab'&&user&&activeLab?' gone':'')} aria-label="Main"><a className="wordmark" href="#home"><span className="wmFirst" ref={navName}>Sim2Skill</span><span className="wmRest">&nbsp;Lab.</span></a><div className="links">{navLink('home','Home')}{navLink('browse','Browse labs')}{user?.role==='tutor'?<>{navLink('studio','Tutor studio')}{navLink('profile/'+user.id,'My profile')}</>:user&&navLink('practice','My practice')}{!ready?<span className="account-label">Loading account…</span>:user?<div className="account-menu"><span className="account-role">{user.role}</span><span className="account-name">{user.name}</span><button onClick={async()=>{try{await api('logout','POST',{});setUser(null);go('home')}catch(e){setError(e.message)}}}>Sign out</button></div>:navLink('signin','Join / Sign in')}</div></nav>{error&&<div className="global-platform-error" role="alert">{error}<button onClick={()=>setError('')}>Dismiss</button></div>}
 {!ready?<main className="platform-page" role="status">Loading your workspace…</main>:<>
 {page==='home'&&<Home active playIntro={false} onIntroDone={()=>{}} navNameRef={navName} onOpenLab={id=>go('details/'+id)} transit={null} ringRef={ringRef}/>}
 {page==='browse'&&<Browse/>}
 {page==='signin'&&<Auth onAuth={authenticated}/>}
 {page==='studio'&&(user?.role==='tutor'?<Studio user={user}/>:<RoleGate/>)}
 {(page==='create'||page==='edit')&&(user?.role==='tutor'?<Editor key={id||'new'} id={page==='edit'?id:null} user={user} onSaved={()=>go('studio')}/>:<RoleGate/>)}
 {page==='details'&&<Details key={id} id={id} user={user} onPractise={practise}/>}
 {page==='profile'&&<Profile key={id} id={id} currentUser={user} onUpdate={setUser}/>}
 {page==='practice'&&(user?<PracticeHistory/>:<Auth onAuth={authenticated}/>)}
 {page==='dashboard'&&(user?.role==='tutor'?<Studio user={user}/>:<RoleGate/>)}
 {page==='lab'&&(user&&activeLab?<><LabView key={activeLab.id} onBack={()=>go('details/'+activeLab.id)} onDashboard={()=>go(user.role==='tutor'?'studio':'practice')}/><div className="community-lab-context"><span>{activeLab.title} <small>by {activeLab.author.name}</small></span><button onClick={()=>setShowInstructions(true)}>Lab instructions</button></div>{showInstructions&&<dialog ref={instructionsRef} className="platform-modal" onClose={()=>setShowInstructions(false)} onCancel={()=>setShowInstructions(false)}><section className="platform-panel" role="dialog" aria-modal="true" aria-label="Lab instructions"><button className="home-outline" autoFocus onClick={()=>setShowInstructions(false)}>Back to experiment</button><h2>{activeLab.title}</h2><h3>Learning outcomes</h3><p className="preserve-lines">{activeLab.outcomes}</p><h3>Instructions</h3><p className="preserve-lines">{activeLab.instructions}</p></section></dialog>}</>:<main className="platform-page platform-empty"><h1>Choose an experiment first.</h1><p>Open a lab from the public browser to begin practising.</p><a className="home-primary" href="#browse">Browse labs</a></main>)}
 {!['home','browse','signin','studio','create','edit','details','profile','practice','lab','dashboard'].includes(page)&&<main className="platform-page"><h1>Page not found</h1><a href="#browse">Browse labs</a></main>}
 </>}
 </>;
}
