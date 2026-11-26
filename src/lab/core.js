const CORE = (() => {
  const PARTS = {
    wire:{kind:'wire',ohms:0,label:'Wire'},
    r47:{kind:'res',ohms:47},r150:{kind:'res',ohms:150},r680:{kind:'res',ohms:680},r2k:{kind:'res',ohms:2000},r4k7:{kind:'res',ohms:4700},r22k:{kind:'res',ohms:22000},r47k:{kind:'res',ohms:47000},
    // Variable parts take their value from the bench (bench.values[slot]); min/max bound what a student can set.
    pot:{kind:'res',ohms:1000,variable:true,min:10,max:100000,label:'Adjustable resistor'},
    custom:{kind:'res',ohms:1000,variable:true,custom:true,min:1,max:1000000,label:'Custom resistor'},
    ledGreen:{kind:'led',vf:2.2,rated:.020,max:.030,min:.002,label:'Green LED',color:'#32c97b'},
    ledBlue:{kind:'led',vf:3.2,rated:.020,max:.030,min:.002,label:'Blue LED',color:'#428dff'},
    diode:{kind:'diode',vf:.7,rated:.1,max:.2,min:0,label:'Silicon diode'},
    c1:{kind:'cap',farads:1e-6},c47:{kind:'cap',farads:47e-6},c220:{kind:'cap',farads:220e-6},c470:{kind:'cap',farads:470e-6},
    r100:{kind:'res',ohms:100}, r220:{kind:'res',ohms:220}, r330:{kind:'res',ohms:330}, r470:{kind:'res',ohms:470},
    r1k:{kind:'res',ohms:1000}, r10k:{kind:'res',ohms:10000}, r100k:{kind:'res',ohms:100000},
    led:{kind:'led',vf:2.0,rated:0.020,max:0.030,min:0.002,label:'Red LED'},
    c10:{kind:'cap',farads:10e-6}, c100:{kind:'cap',farads:100e-6}, c1000:{kind:'cap',farads:1000e-6}
  };
  const R_SHORT = 1.5; // wire plus battery internal resistance, used only for short circuits
  const fmtR = o => o >= 1e6 ? +(o / 1e6).toPrecision(3) + ' MΩ' : o >= 1000 ? +(o / 1000).toPrecision(3) + ' kΩ' : +o.toPrecision(3) + ' Ω';
  const fmtI = a => a >= 1 ? a.toFixed(1) + ' A' : ((a * 1000 >= 100) ? (a * 1000).toFixed(0) : (a * 1000).toFixed(1)) + ' mA';
  const fmtV = v => v.toFixed(2).replace(/0$/, '') + ' V';
  const fmtT = s => s < 1 ? Math.round(s * 1000) + ' ms' : (Math.round(s * 100) / 100) + ' s';
  const fmtC = f => Math.round(f * 1e6) + ' µF';
  const partLabel = id => { const p = PARTS[id]; return !p ? '' : p.kind === 'res' ? (p.label || fmtR(p.ohms)) : p.kind === 'cap' ? fmtC(p.farads) : p.label; };

  // Standard resistor values (IEC 60063). Real resistors are only sold in these, in every decade.
  const SERIES = {
    e12:[1.0,1.2,1.5,1.8,2.2,2.7,3.3,3.9,4.7,5.6,6.8,8.2],
    e24:[1.0,1.1,1.2,1.3,1.5,1.6,1.8,2.0,2.2,2.4,2.7,3.0,3.3,3.6,3.9,4.3,4.7,5.1,5.6,6.2,6.8,7.5,8.2,9.1]
  };
  // Nearest standard value on a log scale (how manufacturers space them).
  function nearestStandard(ohms, series) {
    const list = SERIES[series]; if (!list || !(ohms > 0)) return ohms;
    const decade = Math.pow(10, Math.floor(Math.log10(ohms)));
    let best = null;
    for (const d of [decade / 10, decade, decade * 10]) for (const m of list) {
      const v = +(m * d).toPrecision(3);
      if (best === null || Math.abs(Math.log(v / ohms)) < Math.abs(Math.log(best / ohms))) best = v;
    }
    return best;
  }
  const isStandard = (ohms, series) => nearestStandard(ohms, series) === ohms;
  // The value a variable part in `slot` is set to. Older benches stored one shared value in `pot`.
  const valueOf = (b, slot, p) => { const v = b?.values?.[slot] ?? b?.pot; return Number.isFinite(v) ? Math.max(p.min, Math.min(p.max, v)) : p.ohms; };

  const EXPERIMENTS = {
    ohm:{ n:1, title:"Ohm's law", goal:'Make exactly 10 mA flow through the resistor (within 5%).',
      spec:'Supply: adjustable 1 to 12 V · Fuse trips on a short circuit',
      volt:{min:1,max:12,step:0.1,def:9}, target:0.010, tol:0.05,
      slots:[{id:'R',name:'Resistor',options:['wire','r100','r220','r470','r1k']}],
      intro:'Welcome to the bench. Your goal is 10 mA through the resistor. Place a resistor, set the supply voltage, then close the switch.',
      asks:[['What is a milliamp?','A milliamp, written mA, is one thousandth of an amp. So 10 mA is 0.010 A.'],
            ['What does a resistor do?','A resistor opposes current. For the same voltage, more resistance means less current.']],
      check:{q:'You keep the same resistor and double the voltage. What happens to the current?',options:['It halves','It stays the same','It doubles'],correct:2,
             right:'Correct. I = V ÷ R, so with R fixed the current follows the voltage.',wrong:'Not quite. I = V ÷ R. With R fixed, doubling V doubles I.'} },
    led:{ n:2, title:'LED with a resistor', goal:'Light the LED at a safe current: between 2 mA and 20 mA.',
      spec:'Supply: 9 V battery · Red LED: 2 V forward, rated 20 mA, fails above 30 mA',
      volt:{fixed:9},
      slots:[{id:'R',name:'Resistor',options:['wire','r100','r330','r470','r1k','r10k']},{id:'D',name:'LED',options:['led']}],
      intro:'Light the LED without burning it. It needs about 2 V and is rated for 20 mA. Place both parts, then close the switch.',
      asks:[['Why does an LED need a resistor?','Once an LED conducts it has almost no resistance of its own. The series resistor takes the leftover voltage and sets the current.'],
            ['Which leg is the anode?','On a real LED the longer leg is the anode. In the symbol it is the flat side of the triangle. Current enters there.']],
      check:{q:'With a 9 V battery and a 2 V LED, which resistor gives about 15 mA?',options:['220 Ω','470 Ω','1 kΩ'],correct:1,
             right:'Correct. R = (9 − 2) V ÷ 0.015 A ≈ 467 Ω, so 470 Ω is the nearest part.',wrong:'Not quite. R = (9 − 2) V ÷ 0.015 A ≈ 467 Ω, so 470 Ω is the nearest part.'} },
    rc:{ n:3, title:'RC charging', goal:'Charge the capacitor to 63% of 5 V in 1 second (within 10%).',
      spec:'Supply: 5 V · Electrolytic capacitors are polarised · Scope window: 5 s',
      volt:{fixed:5}, target:1, tol:0.10,
      slots:[{id:'R',name:'Resistor',options:['r1k','r10k','r100k']},{id:'D',name:'Capacitor',options:['c10','c100','c1000']}],
      intro:'Charge the capacitor so it reaches 63% of 5 V in 1 second. Choose a resistor and a capacitor, then close the switch.',
      asks:[['What is a time constant?','The time constant τ equals R × C. It is how long the capacitor takes to reach about 63% of the supply voltage.'],
            ['Why 63%?','After one time constant the voltage is 1 − e⁻¹ of the supply. That is 1 − 0.368 = 0.632, about 63%.']],
      check:{q:'After one time constant, how full is the capacitor?',options:['About 50%','About 63%','100%'],correct:1,
             right:'Correct. After τ it is at about 63%, and after about 5τ it is practically full.',wrong:'Not quite. After one time constant it is at about 63%.'} }
  };

  const resistors = ['r47','r100','r150','r220','r330','r470','r680','r1k','r2k','r4k7','r10k','r22k','r47k','r100k','pot'];
  for (const e of Object.values(EXPERIMENTS)) e.slots[0].options = e.title === 'RC charging' ? resistors.filter(id=>id!=='r47') : ['wire',...resistors];
  EXPERIMENTS.led.slots[1].options = ['led','ledGreen','ledBlue'];
  EXPERIMENTS.rc.slots[1].options = ['c1','c10','c47','c100','c220','c470','c1000'];
  const extra = {
    series:{title:'Series resistance',goal:'Build a series circuit carrying 3 mA from a 9 V supply (within 5%).',target:.003,voltage:9,parts:resistors,concept:'Series resistances add: Req = R1 + R2.',question:'What happens to total resistance when you add a series resistor?',answers:['It increases','It decreases','It stays the same'],correct:0},
    parallel:{title:'Parallel paths',goal:'Build two parallel branches drawing 12 mA total from 6 V (within 5%).',target:.012,voltage:6,parts:resistors,concept:'Each branch sees the supply. Total current is the sum of branch currents.',question:'What is the voltage across each parallel branch?',answers:['Half the supply','The full supply','Zero'],correct:1},
    divider:{title:'Voltage divider',goal:'Produce 3 V across the lower resistor from 9 V (within 5%).',target:3,voltage:9,parts:resistors,concept:'Vout = Vin × R2 / (R1 + R2). The divider is unloaded.',question:'With two equal divider resistors, Vout is…',answers:['The full supply','Half the supply','Twice the supply'],correct:1},
    diode:{title:'Diode direction',goal:'Forward-bias a silicon diode and produce 4.3 mA from 5 V (within 5%).',target:.0043,voltage:5,parts:['diode'],concept:'The simplified silicon diode drops 0.7 V forward and blocks reverse current.',question:'A reverse-biased idealized diode…',answers:['Conducts more current','Blocks current','Becomes a battery'],correct:1}
  };
  Object.entries(extra).forEach(([id,e],i)=>{EXPERIMENTS[id]={n:i+4,title:e.title,goal:e.goal,target:e.target,tol:.05,volt:{fixed:e.voltage},spec:e.concept,intro:e.goal,slots:[{id:'R',name:id==='diode'?'Series resistor':'Resistor R1',options:resistors},{id:'D',name:id==='diode'?'Diode':'Resistor R2',options:e.parts}],asks:[['How does this circuit work?',e.concept]],check:{q:e.question,options:e.answers,correct:e.correct,right:e.concept,wrong:e.concept}};});
  // Creators may also offer a Custom resistor (any value) in any resistor slot; built-in labs keep real parts.
  for (const e of Object.values(EXPERIMENTS)) for (const sl of e.slots) sl.creatorOptions = sl.options.some(id => PARTS[id].kind === 'res' && id !== 'wire') ? [...sl.options, 'custom'] : [...sl.options];
  const effective = (id,b,slot='R') => {const p=PARTS[id];return p?.variable?{...p,ohms:valueOf(b,slot,p)}:p;};
  // Shown on parts, the board and the 3D bench: variable parts show their current value.
  const partText = (id,b,slot) => {const p=PARTS[id];return p?.variable?fmtR(valueOf(b,slot,p))+(p.custom?'':' adjustable'):partLabel(id);};

  const MISTAKES = {
    'ohm:open_circuit':{label:'Open circuit',concept:'A circuit needs a complete loop'},
    'ohm:short_circuit':{label:'Short circuit: wire in place of the resistor',concept:'Resistance limits current'},
    'ohm:current_too_high':{label:'Current above the target',concept:"Ohm's law: I = V ÷ R"},
    'ohm:current_too_low':{label:'Current below the target',concept:"Ohm's law: I = V ÷ R"},
    'led:open_circuit':{label:'Open circuit',concept:'A circuit needs a complete loop'},
    'led:burnt_led':{label:'Tested again with a burnt LED',concept:'Component damage is permanent'},
    'led:led_reversed':{label:'LED connected backwards',concept:'Diode polarity'},
    'led:no_resistor':{label:'No current-limiting resistor',concept:'Series resistor for an LED'},
    'led:resistor_too_small':{label:'Resistor too small, LED burnt',concept:'Sizing the series resistor'},
    'led:over_rated':{label:'Current above the LED rating',concept:'Component ratings'},
    'led:resistor_too_large':{label:'Resistor too large, LED barely lit',concept:'Sizing the series resistor'},
    'rc:open_circuit':{label:'Open circuit',concept:'A circuit needs a complete loop'},
    'rc:cap_reversed':{label:'Electrolytic capacitor reversed',concept:'Capacitor polarity'},
    'rc:tau_too_short':{label:'Capacitor charges too fast',concept:'Time constant τ = R × C'},
    'rc:tau_too_long':{label:'Capacitor charges too slowly',concept:'Time constant τ = R × C'}
  };

  for(const [exp,issues] of Object.entries({series:['open_circuit','current_off_target','component_overload'],parallel:['open_circuit','current_off_target','component_overload'],divider:['open_circuit','voltage_off_target','component_overload'],diode:['open_circuit','diode_reversed','current_off_target','component_overload']}))for(const issue of issues)MISTAKES[exp+':'+issue]={label:issue.replaceAll('_',' '),concept:EXPERIMENTS[exp].spec};

  function simulate(exp, b) {
    const R = b.R ? effective(b.R,b,'R') : null, D = b.D ? effective(b.D,b,'D') : null, V = b.V;
    if (exp === 'ohm') {
      if (!R) return {status:'open', I:0, vR:0};
      if (R.kind === 'wire') return {status:'short', I:V / R_SHORT, vR:0};
      return {status:'ok', I:V / R.ohms, vR:V};
    }
    if (['series','parallel','divider'].includes(exp)) {
      if(!R||!D)return {status:'open',I:0};
      const req=exp==='parallel'?R.ohms*D.ohms/(R.ohms+D.ohms):R.ohms+D.ohms;
      if(req<=0)return {status:'short',I:V/R_SHORT};
      const I=V/req,I1=exp==='parallel'?V/R.ohms:I,I2=exp==='parallel'?V/D.ohms:I;
      return {status:'ok',I,I1,I2,req,vR:exp==='parallel'?V:I*R.ohms,vD:exp==='parallel'?V:I*D.ohms,output:exp==='parallel'?V:I*D.ohms,power:Math.max(I1*I1*R.ohms,I2*I2*D.ohms)};
    }
    if (exp === 'led' || exp==='diode') {
      if (!R || !D) return {status:'open', I:0, vR:0, vD:0};
      if (b.burnt) return {status:'burnt', I:0, vR:0, vD:V};
      if (b.reversed) return {status:'blocked', I:0, vR:0, vD:V};
      const ohms = R.kind === 'wire' ? R_SHORT : R.ohms;
      const I = V > D.vf ? (V - D.vf) / ohms : 0;
      const burn = exp==='led' && I > D.max;
      return {status:'ok', I, power:I*I*R.ohms, vR:I * (R.kind === 'wire' ? 0 : R.ohms), vD:I > 0 ? D.vf : V, burn, lit:!burn && I >= D.min, bright:Math.max(0, Math.min(1, I / D.rated))};
    }
    if (!R || !D) return {status:'open', I:0};
    if (b.reversed) return {status:'reversed', I:0};
    const tau = R.ohms * D.farads;
    return {status:'ok', tau, I:V / R.ohms, v5:V * (1 - Math.exp(-5 / tau)), v63:V * (1 - Math.exp(-1))};
  }

  function detect(exp, b, s, E = EXPERIMENTS[exp]) {
    if (s.status === 'open') return 'open_circuit';
    if(['series','parallel','divider','diode'].includes(exp)){
      if(s.status==='blocked')return 'diode_reversed';
      if(s.status==='short')return 'short_circuit';
      if(s.power>.25 || (exp==='diode'&&s.I>.1))return 'component_overload';
      const value=exp==='divider'?s.vD:s.I;
      return Math.abs(value-E.target)<=E.target*E.tol?'success':exp==='divider'?'voltage_off_target':'current_off_target';
    }
    if (exp === 'ohm') {
      if (s.status === 'short') return 'short_circuit';
      if (s.I > E.target * (1 + E.tol)) return 'current_too_high';
      if (s.I < E.target * (1 - E.tol)) return 'current_too_low';
      return 'success';
    }
    if (exp === 'led') {
      const D = PARTS[b.D];
      if (s.status === 'burnt') return 'burnt_led';
      if (s.status === 'blocked') return 'led_reversed';
      if (PARTS[b.R].kind === 'wire') return 'no_resistor';
      if (s.I > D.max) return 'resistor_too_small';
      if (s.I > D.rated) return 'over_rated';
      if (s.I < D.min) return 'resistor_too_large';
      if(E.custom && Math.abs(s.I-E.target)>E.target*E.tol)return 'current_off_target';
      return 'success';
    }
    if (s.status === 'reversed') return 'cap_reversed';
    if (s.tau < E.target * (1 - E.tol)) return 'tau_too_short';
    if (s.tau > E.target * (1 + E.tol)) return 'tau_too_long';
    return 'success';
  }

  function missing(exp, b) { return EXPERIMENTS[exp].slots.filter(sl => !b[sl.id]).map(sl => sl.name.toLowerCase()); }

  // Each mistake has three levels: nudge, hint, explanation. Every value quoted comes from simulator state.
  function hintText(exp, m, level, b, s) {
    const E=EXPERIMENTS[exp];
    if(E.custom||(exp==='led'&&b.D&&b.D!=='led')||['series','parallel','divider','diode'].includes(exp)){
      const n=Math.max(0,Math.min(2,level-1));
      if(m==='success')return `Goal achieved. ${E.goal} Explain how the measured result follows from your component values.`;
      if(m==='open_circuit')return 'The circuit is open. Fill each component slot, then close the switch.';
      if(m==='diode_reversed'||m==='led_reversed'||m==='cap_reversed')return 'Check polarity: the diode anode or capacitor positive terminal must face the higher voltage.';
      if(m==='component_overload'||m==='short_circuit'||s.burn)return 'The component rating is exceeded. Open the switch and increase resistance; replace a damaged LED before testing again.';
      const formula=exp==='divider'?'Vout = Vin × R2 / (R1 + R2)':exp==='parallel'?'I = V/R1 + V/R2':exp==='series'?'I = V / (R1 + R2)':exp==='rc'?'τ = R × C':exp==='led'||exp==='diode'?'I = (Vs − Vf) / R':'I = V / R';
      return [`Compare the measurements with your goal. Which component could move the result toward the target?`,`${formula}. Think about which value to increase or decrease.`,`${formula}. Your supply is ${fmtV(b.V)}. ${E.goal} Change one component and test again.`][n];
    }
    const R = b.R ? effective(b.R,b,'R') : null, D = b.D ? effective(b.D,b,'D') : null, V = b.V;
    const rl = R ? partText(b.R, b, 'R') : '', L = Math.max(1, Math.min(3, level)) - 1;
    const pick = arr => arr[L];
    if (m === 'open_circuit') {
      const miss = missing(exp, b).join(' and ');
      return pick([
        'No current is flowing. Trace the loop from the battery plus terminal back to minus. Is there a gap anywhere?',
        `The ${miss} slot is empty, so the loop is broken. Current needs a complete path.`,
        `An open circuit carries zero current, whatever the voltage. Place the ${miss}, then close the switch again.`]);
    }
    if (exp === 'ohm') {
      if (m === 'short_circuit') return pick([
        'The fuse tripped the moment you closed the switch. What is limiting the current in this loop right now?',
        'A plain wire has almost no resistance. With I = V ÷ R, what happens to I when R is close to zero?',
        'A wire alone short-circuits the supply, so the current shoots up until the fuse trips. Swap the wire for a resistor.']);
      const need = fmtV(R.ohms * EXPERIMENTS[exp].target);
      if (m === 'current_too_high') return pick([
        `The ammeter reads ${fmtI(s.I)} and the target is 10 mA. Does adding resistance raise or lower the current?`,
        `You have ${fmtV(V)} across ${rl}. More voltage pushes more current, and more resistance holds it back. Which will you change, and which way?`,
        `Ohm's law says I = V ÷ R. For 10 mA through your ${rl} resistor you need V = 0.010 A × ${R.ohms} Ω = ${need}. Set the supply to ${need}.`]);
      if (m === 'current_too_low') return pick([
        `The ammeter reads ${fmtI(s.I)} and the target is 10 mA. What could you change to push more current through?`,
        `You have ${fmtV(V)} across ${rl}. More voltage pushes more current, and less resistance lets more through. Which will you change?`,
        `Ohm's law says I = V ÷ R. For 10 mA through your ${rl} resistor you need V = 0.010 A × ${R.ohms} Ω = ${need}. Set the supply to ${need}.`]);
      return `${fmtI(s.I)}: on target. ${fmtV(V)} ÷ ${rl} = ${fmtI(s.I)}. That relationship, I = V ÷ R, is Ohm's law.`;
    }
    if (exp === 'led') {
      if (m === 'burnt_led') return 'This LED is burnt and will not conduct again. Tap Replace LED before you test.';
      if (m === 'led_reversed') return pick([
        'The switch is closed, but the LED is dark and the ammeter reads 0 mA. Look at the LED symbol. Which way does its triangle point compared with the current?',
        'An LED is a diode, so it conducts in one direction only. Current leaves the battery plus terminal and must enter the LED at its anode, the flat side of the triangle.',
        'Your LED is in backwards, so it blocks the current. Select the LED and tap Flip. A reverse voltage this high can also damage a real LED.']);
      if (m === 'no_resistor') return pick([
        'The LED flashed and died. What was limiting the current through it?',
        'The LED only needs about 2 V and the battery gives 9 V. With no resistor, nothing takes up the other 7 V.',
        'Without a resistor the current goes far above the 30 mA limit. Replace the LED, then add a series resistor: R = (9 − 2) V ÷ 0.015 A ≈ 470 Ω.']);
      if (m === 'resistor_too_small') return pick([
        `The LED burnt out. The current peaked at ${fmtI(s.I)}. What is the most this LED can take?`,
        `With ${rl} the current is (9 − 2) V ÷ ${R.ohms} Ω = ${fmtI(s.I)}. The LED is rated for 20 mA and fails above 30 mA.`,
        'Choose a larger resistor. For about 15 mA you need R = 7 V ÷ 0.015 A ≈ 470 Ω. Replace the LED first.']);
      if (m === 'over_rated') return pick([
        `The LED is on, but look at the ammeter: ${fmtI(s.I)}. The LED is rated for 20 mA. Is this safe for long?`,
        'It works for now. Above its rating an LED runs hot and its life gets shorter. Which resistor would bring the current under 20 mA?',
        'Use 470 Ω. That gives 7 V ÷ 470 Ω ≈ 15 mA, which is bright and inside the rating.']);
      if (m === 'resistor_too_large') return pick([
        `The loop is complete, yet the LED barely glows. The ammeter reads ${fmtI(s.I)}. What is holding the current back?`,
        `${rl} limits the current to ${fmtI(s.I)}. This LED needs at least 2 mA to light clearly.`,
        'Use a smaller resistor. 470 Ω gives about 15 mA and 1 kΩ gives about 7 mA.']);
      return `The LED is lit at ${fmtI(s.I)}, inside its 20 mA rating. The resistor drops ${fmtV(s.vR)} and the LED keeps about 2 V, so I = (9 − 2) V ÷ ${rl}.`;
    }
    if (m === 'cap_reversed') return pick([
      'I stopped the test before any damage. Look at the + mark on the capacitor. Which battery terminal does it face?',
      'Electrolytic capacitors are polarised. The + plate must face the higher voltage.',
      'A reversed electrolytic capacitor can overheat and burst in a real lab. Select the capacitor and tap Flip so its + side faces the battery plus terminal.']);
    const cl = D ? partText(b.D, b, 'D') : '';
    if (m === 'tau_too_short') return pick([
      `The capacitor reached 63% in ${fmtT(s.tau)}. The target is 1 s. What sets how fast it charges?`,
      `The time constant is τ = R × C. Yours is ${rl} × ${cl} = ${fmtT(s.tau)}. To slow the charge, make R or C larger.`,
      'Any pair with R × C = 1 s works: 10 kΩ with 100 µF, 1 kΩ with 1000 µF, or 100 kΩ with 10 µF.']);
    if (m === 'tau_too_long') return pick([
      `After 5 s the capacitor is only at ${fmtV(s.v5)}. The target is 63% in 1 s. What sets how fast it charges?`,
      `The time constant is τ = R × C. Yours is ${rl} × ${cl} = ${fmtT(s.tau)}. To speed the charge up, make R or C smaller.`,
      'Any pair with R × C = 1 s works: 10 kΩ with 100 µF, 1 kΩ with 1000 µF, or 100 kΩ with 10 µF.']);
    return `τ = ${rl} × ${cl} = ${fmtT(s.tau)}. The scope shows ${fmtV(s.v63)} at 1 s, which is 63% of 5 V. After about 5τ the capacitor is practically full.`;
  }

  return {PARTS, EXPERIMENTS, MISTAKES, SERIES, nearestStandard, isStandard, partText, effective, simulate, detect, hintText, partLabel, fmtR, fmtI, fmtV, fmtT, fmtC};
})();
export default CORE;
