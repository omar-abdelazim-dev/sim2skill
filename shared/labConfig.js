import CORE from '../src/lab/core.js';
export const BASE=structuredClone(CORE.EXPERIMENTS);
export const targetUnit=id=>id==='rc'?'s':id==='divider'?'V':'mA';
// How a Custom resistor's typed value is treated: used as typed, or rounded to the nearest real part.
export const ROUNDING={off:'Use the exact value typed',e12:'Round to the nearest E12 part (10% series)',e24:'Round to the nearest E24 part (5% series)'};

export function defaultConfig(id){const e=BASE[id];return {supply:e.volt.fixed||e.volt.def,adjustable:!e.volt.fixed,target:id==='rc'?e.target:id==='divider'?e.target:id==='led'?15:e.target*1000,tolerance:id==='led'?10:e.tol*100,components:Object.fromEntries(e.slots.map(s=>[s.id,[...s.options]])),rounding:'off',starter:{R:null,D:null,reversed:false,pot:1000,values:{}}};}

export function buildDefinition(id,config){
 if(!BASE[id])throw Error('Choose a supported circuit topology.');
 const e=structuredClone(BASE[id]);e.rounding='off';if(!config)return e;
 e.custom=true;e.rounding=config.rounding||'off';
 e.target=['rc','divider'].includes(id)?config.target:config.target/1000;e.tol=config.tolerance/100;
 e.volt=config.adjustable?{min:1,max:12,step:.1,def:config.supply}:{fixed:config.supply};
 e.slots=e.slots.map(s=>({...s,options:config.components[s.id]}));
 e.goal=id==='rc'?`Reach 63% of ${config.supply} V in ${config.target} s (within ${config.tolerance}%).`:id==='divider'?`Produce ${config.target} V at the divider output (within ${config.tolerance}%).`:`Produce ${config.target} mA ${id==='parallel'?'total across the branches':'through the circuit'} (within ${config.tolerance}%).${id==='led'?' Keep the LED within its 2–20 mA operating range.':''}`;
 e.intro=e.goal;e.spec=`${config.adjustable?'Adjustable 1–12 V':'Fixed '+config.supply+' V'} · ${BASE[id].spec}`;
 return e;
}

// A value a student may set on a variable part in a lab: inside the part's range and, for a Custom
// resistor in a lab that rounds, exactly a standard value.
export function valueAllowed(part,value,rounding='off'){const p=CORE.PARTS[part];return !!p?.variable&&Number.isFinite(value)&&value>=p.min&&value<=p.max&&(!p.custom||rounding==='off'||CORE.isStandard(value,rounding));}
// What a typed value becomes in this lab: clamped to the part's range, 3 significant figures, then rounded if the lab asks.
export function settleValue(part,value,rounding='off'){const p=CORE.PARTS[part];if(!p?.variable||!Number.isFinite(value))return null;let v=+Math.max(p.min,Math.min(p.max,value)).toPrecision(3);if(p.custom&&rounding!=='off')v=CORE.nearestStandard(v,rounding);return Math.max(p.min,Math.min(p.max,v));}

export function validateConfig(id,config){
 const c=config||defaultConfig(id),e=BASE[id];if(!e)throw Error('Unknown simulation.');
 if(typeof c.adjustable!=='boolean'||!Number.isFinite(c.supply)||c.supply<1||c.supply>12)throw Error('Supply must be between 1 and 12 V.');
 if(!Number.isFinite(c.target)||c.target<=0||c.target>(id==='rc'?100:id==='divider'?12:100))throw Error('Set a positive target within the supported range.');
 if(id==='led'&&(c.target<2||c.target>20))throw Error('LED targets must be between 2 and 20 mA.');
 if(![5,10,20].includes(c.tolerance))throw Error('Choose a tolerance of 5%, 10%, or 20%.');
 const rounding=c.rounding??'off';if(!Object.hasOwn(ROUNDING,rounding))throw Error('Choose how custom resistor values are rounded.');
 if(!c.components||!c.starter)throw Error('Choose available components and a starting circuit.');
 for(const slot of e.slots){const ids=c.components[slot.id],allowed=slot.creatorOptions||slot.options;if(!Array.isArray(ids)||!ids.length||ids.length>allowed.length||new Set(ids).size!==ids.length||ids.some(p=>!allowed.includes(p)))throw Error(`Choose valid parts for ${slot.name}.`);if(c.starter[slot.id]!==null&&!ids.includes(c.starter[slot.id]))throw Error(`Starting ${slot.name} must be in its palette, or empty.`);}
 if(typeof c.starter.reversed!=='boolean'||!Number.isFinite(c.starter.pot)||c.starter.pot<CORE.PARTS.pot.min||c.starter.pot>CORE.PARTS.pot.max)throw Error('Invalid starting orientation or adjustable resistor value.');
 const values=c.starter.values??{};if(typeof values!=='object'||Array.isArray(values))throw Error('Invalid starting resistor values.');
 for(const [slot,v] of Object.entries(values)){const part=c.starter[slot];if(!e.slots.some(s=>s.id===slot)||!part||!valueAllowed(part,v,rounding))throw Error('A starting resistor value is outside its range or is not a standard value.');}
 return structuredClone({...c,rounding,starter:{...c.starter,values}});
}

export function runConfigured(id,config,bench){const e=buildDefinition(id,config);const result=CORE.simulate(id,bench);let diagnosis=CORE.detect(id,bench,result,e);const p=CORE.effective(bench.R,bench,'R');if(config&&p&&result.I**2*(p.ohms||0)>.25)diagnosis='component_overload';return {result,diagnosis,success:diagnosis==='success'};}

// Resistance the variable slot needs to hit `target` when the other slot holds `other` (a part with its ohms).
function neededOhms(id,slot,other,V,target){
 const current=target/1000;
 if(id==='ohm')return V/current;
 if(id==='led'||id==='diode')return (V-other.vf)/current;
 if(id==='rc')return target/other.farads;
 if(id==='series')return V/current-other.ohms;
 if(id==='parallel')return 1/(current/V-1/other.ohms);
 if(id==='divider')return slot==='R'?other.ohms*(V/target-1):other.ohms*target/(V-target);
 return NaN;
}

// Proves a lab can be solved with the allowed parts: tries every fixed combination, then solves for
// variable parts (adjustable or custom), respecting the lab's rounding rule.
export function findSolution(id,config){
 const c=validateConfig(id,config),parts=c.components,variable=p=>!!CORE.PARTS[p]?.variable;
 const volts=c.adjustable?Array.from({length:111},(_,i)=>+(1+i/10).toFixed(1)):[c.supply];
 const ok=bench=>runConfigured(id,c,bench).success;
 for(const R of parts.R)for(const D of parts.D||[null])for(const V of volts){if(variable(R)||variable(D))continue;const bench={V,R,D,reversed:false,burnt:false,values:{}};if(ok(bench))return bench;}
 for(const R of parts.R)for(const D of parts.D||[null])for(const V of volts){
  if(!variable(R)&&!variable(D))continue;
  // With two variable slots, fix R at a few sensible values and solve for D.
  const fixedR=variable(R)&&variable(D)?[1000,100,10000]:[null];
  for(const rFix of fixedR)for(const factor of [1,1-c.tolerance/200,1+c.tolerance/200]){
   const target=c.target*factor,values={};
   if(rFix!==null)values.R=rFix;
   const slot=variable(D)&&(rFix!==null||!variable(R))?'D':'R',part=slot==='R'?R:D,otherId=slot==='R'?D:R;
   const other=otherId?{...CORE.PARTS[otherId],ohms:otherId&&variable(otherId)?values[slot==='R'?'D':'R']:CORE.PARTS[otherId].ohms}:null;
   const v=settleValue(part,neededOhms(id,slot,other,V,target),c.rounding);
   if(!Number.isFinite(v)||!valueAllowed(part,v,c.rounding))continue;
   values[slot]=v;const bench={V,R,D,reversed:false,burnt:false,values};if(ok(bench))return bench;
  }
 }
 return null;
}
export function startingBench(id,config){return {V:config?.supply||BASE[id].volt.fixed||BASE[id].volt.def,R:null,D:null,reversed:false,burnt:false,pot:1000,...config?.starter,values:{...config?.starter?.values}};}
