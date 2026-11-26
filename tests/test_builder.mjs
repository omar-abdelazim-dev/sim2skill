import {test} from 'node:test';
import assert from 'node:assert/strict';
import CORE from '../src/lab/core.js';
import {BASE,defaultConfig,validateConfig,buildDefinition,findSolution,runConfigured,startingBench} from '../shared/labConfig.js';
import {ACT,S,rt} from '../src/lab/store.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} ≠ ${b}`);
test('seven published experiment types have achievable default targets',()=>{assert.equal(Object.keys(BASE).length,7);for(const id of Object.keys(BASE)){const c=defaultConfig(id),solution=findSolution(id,c);assert.ok(solution,id);assert.equal(runConfigured(id,c,solution).success,true,id);assert.equal(runConfigured(id,c,startingBench(id,c)).diagnosis,'open_circuit')}});
test('series and parallel follow network formulas and Kirchhoff current law',()=>{const b={V:9,R:'r1k',D:'r2k',reversed:false,burnt:false};const series=CORE.simulate('series',b),parallel=CORE.simulate('parallel',b);close(series.I,.003);close(series.req,3000);close(series.vR+series.vD,9);close(parallel.I,.0135);close(parallel.I1+parallel.I2,parallel.I);close(parallel.vD,9);});
test('divider target comes from authored configuration, not a shared default',()=>{const c=defaultConfig('divider');c.target=6;const b={V:9,R:'r1k',D:'r2k',reversed:false,burnt:false};assert.equal(runConfigured('divider',c,b).success,true);assert.equal(runConfigured('divider',defaultConfig('divider'),b).success,false);close(CORE.simulate('divider',b).vD,6)});
test('silicon diode blocks reverse current and uses a 0.7 V drop',()=>{const b={V:5,R:'r1k',D:'diode',reversed:false,burnt:false};close(CORE.simulate('diode',b).I,.0043);assert.equal(runConfigured('diode',defaultConfig('diode'),{...b,reversed:true}).diagnosis,'diode_reversed')});
test('LED colors have distinct forward drops and ratings',()=>{for(const [D,vf]of [['led',2],['ledGreen',2.2],['ledBlue',3.2]]){const r=CORE.simulate('led',{V:9,R:'r470',D,reversed:false,burnt:false});close(r.I,(9-vf)/470);close(r.vD,vf);assert.equal(r.lit,true)}});
test('new capacitor values and variable resistance affect actual physics',()=>{close(CORE.simulate('rc',{V:5,R:'r10k',D:'c47'}).tau,.47);close(CORE.simulate('ohm',{V:5,R:'pot',pot:2500}).I,.002);const c=defaultConfig('ohm');c.adjustable=false;c.supply=5;c.target=2;c.components.R=['pot'];assert.equal(findSolution('ohm',c).values.R,2500)});
test('publication check rejects unreachable goals and unsafe power',()=>{const c=defaultConfig('ohm');c.adjustable=false;c.supply=9;c.target=10;c.components.R=['r100k'];assert.equal(findSolution('ohm',c),null);c.components.R=['r47'];c.supply=12;assert.equal(runConfigured('ohm',c,{V:12,R:'r47',D:null,reversed:false,burnt:false}).diagnosis,'component_overload')});
test('palette and starter validation prevents injected or unavailable parts',()=>{const c=defaultConfig('led');c.components.D=['transistor'];assert.throws(()=>validateConfig('led',c));const d=defaultConfig('ohm');d.components.R=['r1k'];d.starter.R='r100';assert.throws(()=>validateConfig('ohm',d));const f=defaultConfig('divider');f.supply=NaN;assert.throws(()=>validateConfig('divider',f))});
test('interchangeable resistors can be picked up and placed in either compatible slot',()=>{const c=defaultConfig('series');ACT.loadLab({id:'resistor-lab',template:'series',title:'Two resistors',config:c,description:'Build a series circuit'});ACT.take('r1k');ACT.use('R');ACT.take('r2k');ACT.use('D');assert.equal(S.bench.series.R,'r1k');assert.equal(S.bench.series.D,'r2k');assert.equal(rt.held,null);});
test('each authored lab loads its own starter, palette and goal without other benches',()=>{const c=defaultConfig('divider');c.target=6;c.components={R:['r1k'],D:['r2k']};c.starter={R:'r1k',D:'r2k',reversed:false,pot:1000};ACT.loadLab({id:'first',template:'divider',title:'Six volt sensor',config:c,description:'Design a sensor supply'});assert.equal(S.exp,'divider');assert.equal(S.bench.divider.D,'r2k');assert.equal(CORE.EXPERIMENTS.divider.title,'Six volt sensor');ACT.exp('led');assert.equal(S.exp,'divider');ACT.setBench('series');assert.equal(S.exp,'divider');ACT.loadLab({id:'second',template:'divider',title:'Three volt sensor',config:defaultConfig('divider'),description:'A separate lab'});assert.equal(S.bench.divider.R,null);assert.equal(CORE.EXPERIMENTS.divider.target,3);assert.equal(BASE.divider.target,3);ACT.reset();assert.equal(S.bench.divider.D,null);for(const id of Object.keys(BASE))CORE.EXPERIMENTS[id]=structuredClone(BASE[id]);});

// ----- Custom resistor and per-slot values -----
import {settleValue,valueAllowed} from '../shared/labConfig.js';
import {engineFor} from '../shared/engines/index.js';
test('standard resistor series round on a log scale',()=>{
 assert.equal(CORE.nearestStandard(500,'e12'),470);assert.equal(CORE.nearestStandard(500,'e24'),510);
 assert.equal(CORE.nearestStandard(96,'e24'),100);assert.equal(CORE.nearestStandard(1500,'e12'),1500);
 assert.ok(CORE.isStandard(4700,'e12'));assert.ok(!CORE.isStandard(5000,'e12'));
 assert.equal(settleValue('custom',523.7,'off'),524);assert.equal(settleValue('custom',523.7,'e12'),560);assert.equal(settleValue('custom',5e7,'off'),1e6);
 assert.equal(settleValue('pot',523.7,'e12'),524,'only the Custom resistor rounds');
});
test('custom resistors are creator-only, per slot, and solvable with or without rounding',()=>{
 assert.ok(!BASE.ohm.slots[0].options.includes('custom'),'built-in labs keep real parts');
 const c=defaultConfig('series');c.components={R:['custom'],D:['pot']};
 const sol=findSolution('series',c);assert.ok(sol&&sol.values.R&&sol.values.D,'both variable slots get their own value');
 assert.ok(runConfigured('series',c,sol).success);
 close(CORE.simulate('series',{V:9,R:'custom',D:'pot',values:{R:2000,D:1000}}).I,.003);
 const led=defaultConfig('led');led.components.R=['custom'];led.rounding='e12';
 const s2=findSolution('led',led);assert.ok(s2&&CORE.isStandard(s2.values.R,'e12'),'a rounding lab is solved with a real part value');
 assert.throws(()=>validateConfig('led',{...led,rounding:'e96'}),/rounded/);
});
test('the server rejects custom values outside the range or off the standard series',()=>{
 const c=defaultConfig('ohm');c.components.R=['custom'];c.rounding='e12';const E=engineFor('circuits');
 const bench=v=>({V:9,R:'custom',D:null,reversed:false,burnt:false,values:{R:v}});
 assert.doesNotThrow(()=>E.validateBench('ohm',c,bench(470)));
 assert.throws(()=>E.validateBench('ohm',c,bench(500)),/Invalid/);
 assert.throws(()=>E.validateBench('ohm',c,bench(5e7)),/Invalid/);
 assert.throws(()=>E.validateBench('ohm',null,bench(470)),/Invalid/,'built-in labs do not offer custom parts');
 assert.ok(valueAllowed('custom',523,'off'));
});
