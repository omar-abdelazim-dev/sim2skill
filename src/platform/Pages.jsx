import {useEffect,useRef,useState} from 'react';
import {api} from './api.js';
import CORE from '../lab/core.js';
import {BASE,buildDefinition} from '../../shared/labConfig.js';
import CardFace from '../home/CardFace.jsx';
import {EnterCode,ReportLab,FollowControls,AccessTools} from './Account.jsx';
import {QuizPlayer} from './Quiz.jsx';
import {prepareImage,initials} from './image.js';
const href=(page)=>'#'+page;
export function LoadError({error}){return <div className="platform-error" role="alert">{error}</div>}
function useData(path,revision=0){const [data,setData]=useState(null),[error,setError]=useState(''),[failure,setFailure]=useState(null);useEffect(()=>{let live=true;setData(null);setError('');setFailure(null);api(path).then(v=>live&&setData(v)).catch(e=>{if(live){setError(e.message);setFailure(e)}});return()=>{live=false};},[path,revision]);return {data,error,failure,setData};}

// Subjects shown in the browser. Circuits are physics; titration and kinetics are chemistry.
export const SUBJECTS=[{id:'all',label:'All labs'},{id:'physics',label:'Physics'},{id:'chemistry',label:'Chemistry'}];
const ENGINE_NAMES={circuits:'Circuits',titration:'Titration',kinetics:'Kinetics'};
export const subjectLine=l=>`${l.subject==='chemistry'?'Chemistry':'Physics'} · ${ENGINE_NAMES[l.engine]||BASE[l.template]?.title||l.template}`;

export function Avatar({user,size='md'}){return user?.avatar?<img className={'user-avatar ua-'+size} src={user.avatar} alt=""/>:<span className={'user-avatar ua-'+size} aria-hidden="true">{initials(user?.name)}</span>}
export function LabArt({lab}){return lab.thumbnail?<img className="lab-thumb" src={lab.thumbnail} alt="" loading="lazy"/>:<CardFace lab={{art:BASE[lab.template]?lab.template:lab.engine==='kinetics'?'beakers':'flask'}}/>}

// Upload or remove a picture. `kind` picks the crop: a square avatar or a 16:9 thumbnail.
export function ImagePicker({label,kind,has,onUpload,onRemove}){
 const input=useRef(null);const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function pick(e){const file=e.target.files?.[0];e.target.value='';if(!file)return;setBusy(true);setError('');try{const image=await prepareImage(file,...(kind==='avatar'?[320,320]:[960,540]));await onUpload(image)}catch(err){setError(err.message)}finally{setBusy(false)}}
 async function remove(){setBusy(true);setError('');try{await onRemove()}catch(err){setError(err.message)}finally{setBusy(false)}}
 return <div className="image-picker"><input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={pick}/><button type="button" className="home-outline" disabled={busy} onClick={()=>input.current.click()}>{busy?'Uploading…':has?'Change '+label:'Upload '+label}</button>{has&&<button type="button" className="platform-text" disabled={busy} onClick={remove}>Remove</button>}{error&&<span className="platform-error" role="alert">{error}</span>}</div>;
}
const ThumbnailPicker=({lab,onChange})=><ImagePicker label="thumbnail" kind="thumbnail" has={!!lab.thumbnail} onUpload={async image=>onChange(await api(`labs/${lab.id}/thumbnail`,'PUT',{image}))} onRemove={async()=>onChange(await api(`labs/${lab.id}/thumbnail`,'DELETE',{}))}/>;

export function LabCard({lab,studio=false,onAction,onChange}){
 return <article className="public-lab-card">
  <div className="public-lab-art"><LabArt lab={lab}/>{lab.quiz?.length>0&&<span className="lab-badge">Quiz · {lab.quiz.length}</span>}</div>
  <div className="public-lab-body">
   <div className="platform-meta"><span className={'subject-tag '+lab.subject}>{subjectLine(lab)}</span>{lab.visibility==='private'&&<span className="lab-status private">private</span>}{studio&&<span className={'lab-status '+lab.status}>{lab.takenDown?'taken down':lab.status}</span>}</div>
   <h3><a href={href('details/'+lab.id)}>{lab.title}</a></h3>
   <p>{lab.description||'Your lab description will appear here.'}</p>
   <a className="author-link" href={href('profile/'+lab.authorId)}><Avatar user={lab.author} size="xs"/>By {lab.author.name}</a>
   <div className="public-lab-actions"><a className="home-outline" href={href('details/'+lab.id)}>{studio?'View lab':'Explore lab'}</a>{studio&&lab.status==='draft'&&<a className="platform-text" href={href('edit/'+lab.id)}>Edit draft</a>}{studio&&!lab.takenDown&&<button className="platform-text" onClick={()=>onAction(lab)}>{lab.status==='draft'?'Submit lab':'Unpublish'}</button>}</div>
   {studio&&<ThumbnailPicker lab={lab} onChange={onChange}/>}
   {studio&&<AccessTools lab={lab}/>}
   {studio&&lab.takenDown&&<p className="platform-error">Taken down by a moderator: {lab.takedownReason}</p>}
  </div>
 </article>;
}

export function Browse(){
 const {data,error}=useData('labs');
 const initial=new URLSearchParams(location.hash.split('?')[1]||'').get('subject');
 const [search,setSearch]=useState(''),[subject,setSubject]=useState(SUBJECTS.some(s=>s.id===initial)?initial:'all'),[sort,setSort]=useState('featured');
 const count=id=>data?.filter(l=>id==='all'||l.subject===id).length||0;
 const q=search.trim().toLowerCase();
 let labs=data?.filter(l=>(subject==='all'||l.subject===subject)&&`${l.title} ${l.description} ${l.author.name} ${subjectLine(l)}`.toLowerCase().includes(q))||[];
 if(sort==='newest')labs=[...labs].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
 if(sort==='title')labs=[...labs].sort((a,b)=>a.title.localeCompare(b.title));
 const choose=id=>{setSubject(id);history.replaceState(null,'','#browse'+(id==='all'?'':'?subject='+id))};
 return <main className="platform-page">
  <div className="platform-heading"><div><div className="section-kicker">LAB LIBRARY</div><h1>Find your next discovery.</h1><p>Guided physics and chemistry experiments from Sim2Skill and the community.</p></div><span className="platform-count">{data?.length||0} published labs</span></div>
  <div className="browser-filters">
   <div className="subject-filter" role="tablist" aria-label="Subject">{SUBJECTS.map(s=><button key={s.id} type="button" role="tab" aria-selected={subject===s.id} className={'subject-chip '+s.id} onClick={()=>choose(s.id)}>{s.label}<span>{count(s.id)}</span></button>)}</div>
   <label className="browser-search">Search<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Try LED, titration, or a creator’s name" type="search"/></label>
   <label className="browser-sort">Sort by<select value={sort} onChange={e=>setSort(e.target.value)}><option value="featured">Featured</option><option value="newest">Newest</option><option value="title">Title A–Z</option></select></label>
  </div>
  {error?<LoadError error={error}/>:!data?<p role="status">Loading labs…</p>:<>
   <p className="browser-result" role="status">{labs.length} {labs.length===1?'lab':'labs'}{subject!=='all'?' in '+SUBJECTS.find(s=>s.id===subject).label.toLowerCase():''}{q?` matching “${search.trim()}”`:''}</p>
   <div className="public-lab-grid">{labs.map(l=><LabCard key={l.id} lab={l}/>)}</div>
   {!labs.length&&<div className="platform-empty"><h2>No matching labs</h2><p>Try a different search or subject.</p><button className="home-outline" onClick={()=>{setSearch('');choose('all')}}>Clear filters</button></div>}
  </>}
 </main>;
}
export { default as Auth } from './AuthPage.jsx';

export function Studio({user}){
 const [revision,setRevision]=useState(0),[notice,setNotice]=useState('');const {data,error,setData}=useData('me/labs',revision);
 async function action(l){setNotice('');try{await api(`labs/${l.id}/${l.status==='draft'?'submit':'unpublish'}`,'POST',{});setNotice(l.status==='draft'?(l.visibility==='private'?'Lab published privately. Share its access code with your students.':'Lab published. It is in the public browser and on your profile, and your followers were notified.'):'Lab moved to drafts and removed from public listings.');setRevision(x=>x+1);}catch(e){setNotice(e.message)}}
 const replace=lab=>setData(list=>list.map(l=>l.id===lab.id?{...l,...lab}:l));
 return <main className="platform-page">
  <div className="platform-heading"><div><div className="section-kicker">LAB STUDIO</div><h1>Your idea. Someone’s next discovery.</h1><p>Create a draft, shape the learning experience, add a quiz, then publish it publicly or share it privately with a code.</p></div><a className="home-primary" href="#create">Create a lab</a></div>
  <div className="studio-summary"><span><b>{data?.filter(l=>l.status==='published').length||0}</b> published labs</span><span><b>{data?.filter(l=>l.status==='draft').length||0}</b> drafts</span><a href={href('profile/'+user.id)}>View your public profile</a></div>
  {notice&&<div className="platform-notice" role="status">{notice}</div>}
  {error?<LoadError error={error}/>:!data?<p>Loading your labs…</p>:data.length?<div className="public-lab-grid">{data.map(l=><LabCard key={l.id} lab={l} studio onAction={action} onChange={replace}/>)}</div>:<div className="platform-empty"><h2>Your first lab starts here.</h2><p>Pick a physics circuit or a chemistry experiment, set the goal, add a quiz, and test it before you publish.</p><a className="home-primary" href="#create">Create your first lab</a></div>}
 </main>;
}
export function RoleGate(){return <main className="platform-page platform-empty"><h1>Sign in to create labs.</h1><p>Anyone can build and share a lab.</p><a href="#signin" className="home-primary">Go to accounts</a><a href="#browse" className="platform-text">Browse public labs</a></main>}
export { default as Editor } from './LabEditor.jsx';

export function Details({id,user,onPractise}){
 const {data:l,error,failure,setData}=useData('labs/'+id);
 if(failure?.data?.locked)return <EnterCode id={id} lab={failure.data.lab} user={user} onUnlocked={v=>{setData(v);location.reload()}}/>;
 if(error)return <main className="platform-page"><LoadError error={error}/><a href="#browse">Back to lab browser</a></main>;
 if(!l)return <main className="platform-page">Loading lab…</main>;
 return <main className="platform-page"><a className="platform-text" href={'#browse?subject='+l.subject}>All {l.subject} labs</a>
  <div className="detail-layout">
   <section>
    <div className="section-kicker">{l.status==='draft'?'PRIVATE DRAFT · CREATOR PREVIEW':subjectLine(l).toUpperCase()+(l.visibility==='private'?' · PRIVATE LAB':' · GUIDED EXPERIMENT')}</div>
    <h1>{l.title}</h1>
    <a className="author-link" href={href('profile/'+l.authorId)}><Avatar user={l.author} size="sm"/>Created by {l.author.name}</a>
    <p className="detail-description">{l.description||'Add a description in the lab builder.'}</p>
    <div className="platform-panel"><h2>What you’ll learn</h2><p className="preserve-lines">{l.outcomes||'No outcomes added yet.'}</p><h2>Your instructions</h2><p className="preserve-lines">{l.instructions||'No instructions added yet.'}</p>{l.engine==='circuits'&&<><h2>Components in this room</h2><div className="lab-components-list">{[...new Set(buildDefinition(l.template,l.config).slots.flatMap(s=>s.options))].map(id=><span key={id}>{CORE.partLabel(id)}</span>)}</div></>}</div>
    {l.quiz?.length>0&&<div className="platform-panel quiz-panel" id="quiz"><div className="section-kicker">AFTER THE EXPERIMENT</div><h2>Check your understanding</h2><p>{l.quiz.length} {l.quiz.length===1?'question':'questions'} from the creator. Try the experiment first, then see what stuck.</p>{user?(l.isOwner?<p className="platform-help">You are the creator: students see this quiz here and inside the lab. Your answer key stays private.</p>:<QuizPlayer lab={l}/>):<a className="home-outline" href={'#signin?next='+encodeURIComponent('details/'+l.id)}>Sign in to take the quiz</a>}</div>}
   </section>
   <aside className="platform-panel detail-start">
    <div className="detail-art"><LabArt lab={l}/></div>
    {l.isOwner&&<ThumbnailPicker lab={l} onChange={setData}/>}
    <h2>Your experiment</h2><p>{l.goal}</p>
    <div className="platform-help">A 3D {l.subject==='chemistry'?'chemistry':'physics'} room built for this lab. You can return to these instructions from inside it.</div>
    {user?<button className="home-primary" onClick={()=>onPractise(l)}>{l.status==='draft'?'Preview simulation':'Start practising'}</button>:<><p>Sign in to save your practice history.</p><a className="home-primary" href={'#signin?next='+encodeURIComponent('details/'+l.id)}>Sign in to practise</a></>}
    {user&&!l.isOwner&&!l.builtin&&<ReportLab labId={l.id}/>}
   </aside>
  </div>
 </main>;
}

export function Profile({id,currentUser,onUpdate}){
 const [revision,setRevision]=useState(0);const {data,error}=useData('profiles/'+id,revision);const [editing,setEditing]=useState(false),[notice,setNotice]=useState('');
 if(error)return <main className="platform-page"><LoadError error={error}/></main>;
 if(!data)return <main className="platform-page">Loading profile…</main>;
 const {user,labs}=data,mine=currentUser?.id===id;
 const updated=v=>{onUpdate(v.user);setRevision(x=>x+1)};
 return <main className="platform-page">
  <div className="tutor-profile"><Avatar user={user} size="lg"/><div><div className="section-kicker">CREATOR PROFILE</div><h1>{user.name}</h1><p>{user.bio||'Creating opportunities to learn through experimentation.'}</p><span>{labs.length} published {labs.length===1?'lab':'labs'} · {data.followers} {data.followers===1?'follower':'followers'} · following {data.following}</span><FollowControls profile={data} currentUser={currentUser} onChange={()=>setRevision(x=>x+1)}/></div>{mine&&<button className="home-outline" onClick={()=>setEditing(!editing)}>{editing?'Close editor':'Edit profile'}</button>}</div>
  {editing&&<form className="platform-panel profile-form" onSubmit={async e=>{e.preventDefault();try{const v=await api('me','PATCH',Object.fromEntries(new FormData(e.currentTarget)));updated(v);setEditing(false);}catch(e){setNotice(e.message)}}}>
   <div className="profile-photo"><Avatar user={user} size="lg"/><div><b>Profile picture</b><p className="platform-help">A square crop of your photo. PNG, JPEG or WebP.</p><ImagePicker label="photo" kind="avatar" has={!!user.avatar} onUpload={async image=>updated(await api('me/avatar','PUT',{image}))} onRemove={async()=>updated(await api('me/avatar','DELETE',{}))}/></div></div>
   <label>Name<input name="name" defaultValue={user.name} required minLength={2} maxLength={80}/></label><label>About you<textarea name="bio" defaultValue={user.bio} maxLength={1000}/></label>{notice&&<LoadError error={notice}/>}<button className="home-primary">Save profile</button>
  </form>}
  <h2 className="profile-labs-heading">Explore {user.name.split(' ')[0]}’s labs</h2>
  {labs.length?<div className="public-lab-grid">{labs.map(l=><LabCard key={l.id} lab={l}/>)}</div>:<div className="platform-empty"><h2>No published labs yet.</h2><p>Submitted labs will appear here and in the public browser.</p></div>}
 </main>;
}

export function PracticeHistory(){const {data,error}=useData('practice');return <main className="platform-page"><div className="section-kicker">STUDENT WORKSPACE</div><h1>Keep your curiosity going.</h1><p>Your saved practice activity. Solved means you met the simulation’s goal.</p>{error?<LoadError error={error}/>:!data?<p>Loading practice history…</p>:data.length?<div className="practice-list">{data.map(p=><article className="platform-panel" key={p.labId}><div><h2>{p.title}</h2><p>{p.attempts} simulation attempts · {p.solvedAt?'Goal achieved':'In progress'}{p.quiz?` · Quiz best ${p.quiz.best}/${p.quiz.total}`:''}</p></div><a className="home-outline" href={href('details/'+p.labId)}>Practise again</a></article>)}</div>:<div className="platform-empty"><h2>Your first experiment is waiting.</h2><a className="home-primary" href="#browse">Find a lab</a></div>}</main>}
