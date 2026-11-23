import CORE from '../src/lab/core.js';
export const BASE=structuredClone(CORE.EXPERIMENTS);
export const targetUnit=id=>id==='rc'?'s':id==='divider'?'V':'mA';
export function defaultConfig(id){const e=BASE[id];return {supply:e.volt.fixed||e.volt.def,adjustable:!e.volt.fixed,target:id==='rc'?e.target:id==='divider'?e.target:id==='led'?15:e.target*1000,tolerance:id==='led'?10:e.tol*100,components:Object.fromEntries(e.slots.map(s=>[s.id,[...s.options]])),starter:{R:null,D:null,reversed:false,pot:1000}};}
export function buildDefinition(id,config){if(!BASE[id])throw Error('Choose a supported circuit topology.');const e=structuredClone(BASE[id]);if(!config)return e;e.custom=true;e.target=['rc','divider'].includes(id)?config.target:config.target/1000;e.tol=config.tolerance/100;e.volt=config.adjustable?{min:1,max:12,step:.1,def:config.supply}:{fixed:config.supply};e.slots=e.slots.map(s=>({...s,options:config.components[s.id]}));e.goal=id==='rc'?`Reach 63% of ${config.supply} V in ${config.target} s (within ${config.tolerance}%).`:id==='divider'?`Produce ${config.target} V at the divider output (within ${config.tolerance}%).`:`Produce ${config.target} mA ${id==='parallel'?'total across the branches':'through the circuit'} (within ${config.tolerance}%).${id==='led'?' Keep the LED within its 2–20 mA operating range.':''}`;e.intro=e.goal;e.spec=`${config.adjustable?'Adjustable 1–12 V':'Fixed '+config.supply+' V'} · ${BASE[id].spec}`;return e;}
export function validateConfig(id,config){const c=config||defaultConfig(id),e=BASE[id];if(!e)throw Error('Unknown simulation.');if(typeof c.adjustable!=='boolean'||!Number.isFinite(c.supply)||c.supply<1||c.supply>12)throw Error('Supply must be between 1 and 12 V.');if(!Number.isFinite(c.target)||c.target<=0||c.target>(id==='rc'?100:id==='divider'?12:100))throw Error('Set a positive target within the supported range.');if(id==='led'&&(c.target<2||c.target>20))throw Error('LED targets must be between 2 and 20 mA.');if(![5,10,20].includes(c.tolerance))throw Error('Choose a tolerance of 5%, 10%, or 20%.');if(!c.components||!c.starter)throw Error('Choose available components and a starting circuit.');for(const slot of e.slots){const ids=c.components[slot.id];if(!Array.isArray(ids)||!ids.length||ids.length>slot.options.length||new Set(ids).size!==ids.length||ids.some(p=>!slot.options.includes(p)))throw Error(`Choose valid parts for ${slot.name}.`);if(c.starter[slot.id]!==null&&!ids.includes(c.starter[slot.id]))throw Error(`Starting ${slot.name} must be in its palette, or empty.`);}if(typeof c.starter.reversed!=='boolean'||!Number.isFinite(c.starter.pot)||c.starter.pot<100||c.starter.pot>10000)throw Error('Invalid starting orientation or adjustable resistor value.');return structuredClone(c);}
export function runConfigured(id,config,bench){const e=buildDefinition(id,config);const result=CORE.simulate(id,bench);let diagnosis=CORE.detect(id,bench,result,e);const p=CORE.effective(bench.R,bench);if(config&&p&&result.I**2*(p.ohms||0)>.25)diagnosis='component_overload';return {result,diagnosis,success:diagnosis==='success'};}
export function findSolution(id,config){const c=validateConfig(id,config),parts=c.components;const volts=c.adjustable?Array.from({length:111},(_,i)=>+(1+i/10).toFixed(1)):[c.supply];for(const R of parts.R)for(const D of parts.D||[null])for(const V of volts){const bench={V,R,D,reversed:false,burnt:false,pot:1000};if(runConfigured(id,c,bench).success)return bench;}if(parts.R.includes('pot')||parts.D?.includes('pot')){
 for(const R of parts.R)for(const D of parts.D||[null])for(const V of volts){
  if(R!=='pot'&&D!=='pot')continue;const fixed=CORE.PARTS[R==='pot'?D:R];
  for(const factor of [1,1-c.tolerance/100,1+c.tolerance/100]){
   const target=c.target*factor,current=target/1000;let needed;
   if(id==='ohm')needed=V/current;
   else if(id==='led'||id==='diode')needed=(V-CORE.PARTS[D].vf)/current;
   else if(id==='rc')needed=target/CORE.PARTS[D].farads;
   else if(R==='pot'&&D==='pot')needed=id==='series'?V/(2*current):id==='parallel'?2*V/current:1000;
   else if(id==='series')needed=V/current-fixed.ohms;
   else if(id==='parallel')needed=1/(current/V-1/fixed.ohms);
   else if(id==='divider')needed=R==='pot'?fixed.ohms*(V/target-1):fixed.ohms*target/(V-target);
   const pot=Math.round(needed/10)*10;if(!Number.isFinite(pot)||pot<100||pot>10000)continue;
   const bench={V,R,D,pot,reversed:false,burnt:false};if(runConfigured(id,c,bench).success)return bench;
  }
 }
}return null;}
export function startingBench(id,config){return {V:config?.supply||BASE[id].volt.fixed||BASE[id].volt.def,R:null,D:null,reversed:false,burnt:false,pot:1000,...config?.starter};}
