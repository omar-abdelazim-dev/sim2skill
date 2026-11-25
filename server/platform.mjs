import {randomBytes,randomUUID,scryptSync,timingSafeEqual} from 'node:crypto';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import CORE from '../src/lab/core.js';
import {BASE,buildDefinition,validateConfig,findSolution,runConfigured} from '../shared/labConfig.js';
import {homePrompt,labPrompt} from '../shared/nourPrompt.js';
import {LIVE} from '../src/labs.js';
// Reads GEMINI_* settings from a git-ignored .env file in the project folder. Values already set in the shell win.
export async function loadEnvFile(file=resolve('.env')){let text;try{text=await readFile(file,'utf8');}catch{return;}for(const line of text.split(/\r?\n/)){const m=line.match(/^\s*(GEMINI_API_KEY|GEMINI_MODEL)\s*=\s*(.*?)\s*$/);if(m&&!process.env[m[1]]){const v=m[2].replace(/^(['"])(.*)\1$/,'$2');if(v)process.env[m[1]]=v;}}}
export async function createPlatformHandler(directory=process.env.DATA_DIR||'.data'){await loadEnvFile();
 const dir=resolve(directory);await mkdir(dir,{recursive:true});const file=join(dir,'platform.json');let db;
 try{db=JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;db={users:[{id:'sim2skill',name:'Sim2Skill team',role:'tutor',bio:'Hands-on electronics experiments, built for curious minds.'}],labs:Object.entries(CORE.EXPERIMENTS).map(([template,e])=>({id:template,authorId:'sim2skill',template,title:e.title,description:e.intro,outcomes:e.goal,instructions:'Explore the components, build your circuit, and close the switch. Use Nour’s hints to diagnose mistakes and complete the understanding check.',status:'published',createdAt:new Date().toISOString()})),progress:[]};}
 // Add new built-in labs without overwriting accounts, authored labs, or practice history.
 for(const [template,e] of Object.entries(BASE))if(!db.labs.some(l=>l.id===template))db.labs.push({id:template,authorId:'sim2skill',template,title:e.title,description:e.intro,outcomes:e.goal,instructions:'Choose your components, predict the result, and run this dedicated circuit. Use the measurements and hints to meet the goal.',status:'published',createdAt:new Date().toISOString()});

 let queue=Promise.resolve();const save=()=>{queue=queue.catch(()=>{}).then(async()=>{await writeFile(join(dir,'platform.tmp'),JSON.stringify(db,null,2),{mode:0o600});await rename(join(dir,'platform.tmp'),file);});return queue;};await save();const sessions=new Map(),limits=new Map(),nourLimits=new Map();
 const publicUser=u=>u&&({id:u.id,name:u.name,role:u.role,bio:u.bio||''});const enrich=l=>({...l,author:publicUser(db.users.find(u=>u.id===l.authorId)),goal:buildDefinition(l.template,l.config).goal});
 function fail(status,message){throw Object.assign(Error(message),{status});}
 function clean(data){const o={};for(const [k,max]of Object.entries({title:100,description:700,outcomes:1500,instructions:6000})){if(typeof data[k]!=='string'||data[k].trim().length>max)fail(400,`Please provide ${k} (up to ${max} characters).`);o[k]=data[k].trim();}if(!CORE.EXPERIMENTS[data.template])fail(400,'Choose a supported simulation.');if(o.title.length<3)fail(400,'Give your lab a title of at least 3 characters.');let config;try{config=validateConfig(data.template,data.config);}catch(e){fail(400,e.message);}return {...o,template:data.template,config};}
 return async function handler(req,res,next){const url=new URL(req.url,'http://local');if(!url.pathname.startsWith('/api/'))return next?.();const reply=(status,value)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(value));};
 try{
 if(!['GET','HEAD'].includes(req.method)&&req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)fail(403,'Request origin does not match.');
 const token=/s2s_session=([a-f0-9]+)/.exec(req.headers.cookie||'')?.[1];const session=sessions.get(token);if(session&&session.expires<Date.now())sessions.delete(token);const user=session&&session.expires>Date.now()?db.users.find(u=>u.id===session.id):null;
 let data={};if(['POST','PUT','PATCH'].includes(req.method)){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>24000)fail(413,'Request is too large.');}try{data=JSON.parse(raw||'{}');}catch{fail(400,'Invalid JSON.');}}
 const requireUser=()=>{if(!user)fail(401,'Please sign in to continue.');return user;};const tutor=()=>{requireUser();if(user.role!=='tutor')fail(403,'Only tutors can create and submit labs.');};const owned=id=>{tutor();const l=db.labs.find(l=>l.id===id);if(!l)fail(404,'Lab not found.');if(l.authorId!==user.id)fail(403,'This lab belongs to another tutor.');return l;};
 const p=url.pathname.split('/').filter(Boolean).slice(1);
 // Nour's AI answers with Google Gemini. Only active when GEMINI_API_KEY is set; the key never leaves the server.
 if(p[0]==='nour'&&req.method==='GET')return reply(200,{ai:!!process.env.GEMINI_API_KEY});
 if(p[0]==='nour'&&req.method==='POST'){
  const key=process.env.GEMINI_API_KEY;if(!key)fail(503,'Nour AI is not configured on this server.');
  const ip=req.socket.remoteAddress;let rate=nourLimits.get(ip);if(!rate||rate.until<Date.now()){rate={count:0,until:Date.now()+600000};nourLimits.set(ip,rate);}if(++rate.count>60)fail(429,'Too many questions. Please wait a few minutes.');
  if(!['home','lab'].includes(data.kind)||!Array.isArray(data.messages)||!data.messages.length||data.messages.length>20)fail(400,'Invalid conversation.');
  const merged=[];for(const m of data.messages){if(!['user','assistant'].includes(m?.role)||typeof m.content!=='string'||!m.content.trim()||m.content.length>2000)fail(400,'Invalid message.');const last=merged[merged.length-1];if(last&&last.role===m.role)last.content+='\n'+m.content;else merged.push({role:m.role,content:m.content});}
  while(merged.length&&merged[0].role!=='user')merged.shift();if(!merged.length||merged[merged.length-1].role!=='user')fail(400,'The conversation must end with a question.');
  const system=data.kind==='lab'?labPrompt(data.ctx&&typeof data.ctx==='object'?data.ctx:{}):homePrompt(LIVE);
  const model=String(process.env.GEMINI_MODEL||'gemini-3.5-flash-lite').replace(/[^a-z0-9.\-]/gi,'');
  const body={systemInstruction:{parts:[{text:system}]},contents:merged.map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]})),generationConfig:{maxOutputTokens:1024,temperature:0.6}};
  let r;try{r=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{method:'POST',headers:{'x-goog-api-key':key,'content-type':'application/json'},body:JSON.stringify(body)});}catch{fail(502,'Nour could not reach the AI service.');}
  if(r.status===429)fail(429,'The AI is busy right now. Please wait a moment and ask again.');
  if(!r.ok){console.error('Nour AI error',r.status,(await r.text()).slice(0,300));fail(502,'Nour could not reach the AI service.');}
  const j=await r.json();const text=(j.candidates?.[0]?.content?.parts||[]).filter(x=>typeof x.text==='string'&&!x.thought).map(x=>x.text).join('').trim();
  if(!text)fail(502,'Nour could not answer that one. Try asking another way.');
  return reply(200,{text});
 }
 if(p[0]==='session'&&req.method==='GET')return reply(200,{user:publicUser(user)||null});
 if(['signup','login'].includes(p[0])&&req.method==='POST'){
 const ip=req.socket.remoteAddress;let rate=limits.get(ip);if(!rate||rate.until<Date.now()){rate={count:0,until:Date.now()+900000};limits.set(ip,rate);}if(++rate.count>30)fail(429,'Too many sign-in attempts. Please try again later.');
 const email=typeof data.email==='string'?data.email.trim().toLowerCase():'';const password=typeof data.password==='string'?data.password:'';if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>200||password.length<8||password.length>200)fail(400,'Enter a valid email and a password of 8–200 characters.');let account=db.users.find(u=>u.email===email);
 if(p[0]==='signup'){if(account)fail(409,'An account with this email already exists.');if(!['student','tutor'].includes(data.role)||typeof data.name!=='string'||data.name.trim().length<2||data.name.length>80)fail(400,'Choose a role and enter your name (2–80 characters).');const salt=randomBytes(16).toString('hex');account={id:randomUUID(),email,name:data.name.trim(),role:data.role,bio:'',salt,hash:scryptSync(password,salt,64).toString('hex')};db.users.push(account);await save();}
 else{const calculated=scryptSync(password,account?.salt||'invalid-user',64);if(!account?.hash||!timingSafeEqual(calculated,Buffer.from(account.hash,'hex')))fail(401,'Email or password is incorrect.');}
 const key=randomBytes(32).toString('hex');sessions.set(key,{id:account.id,expires:Date.now()+604800000});res.setHeader('Set-Cookie',`s2s_session=${key}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${req.socket.encrypted?'; Secure':''}`);return reply(200,{user:publicUser(account)});
 }
 if(p[0]==='logout'&&req.method==='POST'){sessions.delete(token);res.setHeader('Set-Cookie','s2s_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');return reply(200,{ok:true});}
 if(p[0]==='me'&&p[1]==='labs'&&req.method==='GET'){tutor();return reply(200,db.labs.filter(l=>l.authorId===user.id).map(enrich));}
 if(p[0]==='me'&&req.method==='PATCH'){requireUser();if(typeof data.name!=='string'||data.name.trim().length<2||data.name.length>80||typeof data.bio!=='string'||data.bio.length>1000)fail(400,'Enter a name (2–80 characters) and a bio up to 1000 characters.');user.name=data.name.trim();user.bio=data.bio.trim();await save();return reply(200,{user:publicUser(user)});}
 if(p[0]==='profiles'&&req.method==='GET'){const u=db.users.find(u=>u.id===p[1]&&u.role==='tutor');if(!u)fail(404,'Tutor not found.');return reply(200,{user:publicUser(u),labs:db.labs.filter(l=>l.authorId===u.id&&l.status==='published').map(enrich)});}
 if(p[0]==='labs'&&p.length===1&&req.method==='GET')return reply(200,db.labs.filter(l=>l.status==='published').map(enrich));
 if(p[0]==='labs'&&p.length===1&&req.method==='POST'){tutor();const l={...clean(data),id:randomUUID(),authorId:user.id,status:'draft',createdAt:new Date().toISOString()};db.labs.push(l);await save();return reply(201,enrich(l));}
 if(p[0]==='labs'&&p.length===2&&req.method==='GET'){const l=db.labs.find(l=>l.id===p[1]);if(!l||(l.status!=='published'&&l.authorId!==user?.id))fail(404,'Lab not found.');return reply(200,enrich(l));}
 if(p[0]==='labs'&&p.length===2&&req.method==='PUT'){const l=owned(p[1]);if(l.status!=='draft')fail(409,'Unpublish your lab before editing.');Object.assign(l,clean(data));await save();return reply(200,enrich(l));}
 if(p[0]==='labs'&&p.length===3&&req.method==='POST'){const l=owned(p[1]);if(!['submit','unpublish'].includes(p[2]))fail(404,'Action not found.');if(p[2]==='submit'&&[l.description,l.outcomes,l.instructions].some(x=>x.length<10))fail(400,'Add a description, learning outcomes, and instructions (at least 10 characters each) before submitting.');if(p[2]==='submit'){try{if(!findSolution(l.template,l.config||undefined))fail(400,'No safe solution exists with these components, supply and target. Adjust the lab in the builder.');}catch(e){fail(400,e.message);}}l.status=p[2]==='submit'?'published':'draft';l.updatedAt=new Date().toISOString();await save();return reply(200,enrich(l));}
 if(p[0]==='practice'&&req.method==='GET'){requireUser();return reply(200,db.progress.filter(x=>x.userId===user.id));}
 if(p[0]==='practice'&&req.method==='POST'){
 requireUser();const l=db.labs.find(l=>l.id===data.labId);if(!l||(l.status!=='published'&&l.authorId!==user.id))fail(404,'Lab not available.');
 let evaluation=null;
 if(data.bench){const e=buildDefinition(l.template,l.config),b=data.bench;if(!Number.isFinite(b.V)||b.V<(e.volt.min||e.volt.fixed)||b.V>(e.volt.max||e.volt.fixed)||e.slots.some(s=>b[s.id]!==null&&!s.options.includes(b[s.id]))||typeof b.reversed!=='boolean'||typeof b.burnt!=='boolean'||(b.pot!==undefined&&(!Number.isFinite(b.pot)||b.pot<100||b.pot>10000)))fail(400,'Invalid circuit configuration.');evaluation=runConfigured(l.template,l.config,b);}
 let progress=db.progress.find(x=>x.labId===l.id&&x.userId===user.id);if(!progress){progress={userId:user.id,labId:l.id,startedAt:new Date().toISOString(),attempts:0};db.progress.push(progress);}
 if(evaluation){progress.attempts++;progress.last={bench:data.bench,diagnosis:evaluation.diagnosis,date:new Date().toISOString()};if(evaluation.success)progress.solvedAt=new Date().toISOString();}progress.title=l.title;await save();return reply(200,progress);
 }
 fail(404,'Endpoint not found.');
 }catch(e){if(!res.headersSent)reply(e.status||500,{error:e.status?e.message:'Unable to save changes. Please try again.'});}
 };
}
