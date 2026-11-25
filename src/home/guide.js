import { LABS } from '../labs.js';

const KEYS = [
  ['divider',/divider|voltage division|مقسم/i],
  ['parallel',/parallel|توازي/i],
  ['series',/series|توالي/i],
  ['diode',/silicon|rectif|سيليكون|\bdiode\b/i],
  ['ohm', /\bohm|resistor|resistance|current|voltage|أوم|اوم|مقاوم|تيار|جهد|فولت/i],
  ['led', /\bled\b|light.?emitting|ليد|دايود|ثنائي|لمبة/i],
  ['rc', /\brc\b|capacitor|charging|time constant|مكثف|كاباسيتور|شحن/i]
];
const SOON = /pendulum|lens|spring|hooke|projectile|بندول|عدسة|زنبرك|مقذوف/i;
const OTHER = /chemi|titration|flame test|reaction|biology|كيمي|معايرة|تفاعل|احياء|أحياء/i;

const CONFUSED = /don'?t understand|not understand|confus|what do you mean|explain|help me|lost|مش فاهم|مش فاهمة|مفهمتش|مش واضح|اشرح|وضح|ساعدني|يعني ايه|يعني إيه/i;
const QUESTION = /\?|؟|^\s*(what|why|how|when|is|does|can|ايه|إيه|ليه|ازاي|إزاي|هل|ما هو|ما هي|لماذا|كيف)\b|\b(what is|what's|how does|why does|يعني ايه|يعني إيه)/i;
const CONCEPTS = [
  ['ohm', /\bohm|v\s*=\s*i\s*r|resistance|current|voltage|أوم|اوم|مقاوم|تيار|جهد|فولت/i, "Ohm's law links the three: V = I × R. Voltage is the push, current is the flow, resistance is how hard the path resists it. With 9 V across 900 Ω, I = 9 / 900 = 10 mA. Want to try it on the bench?"],
  ['led', /\bled\b|diode|ليد|دايود|ثنائي/i, "An LED only conducts one way, from the long leg to the short leg, and it drops about 2 V. It needs a series resistor: R = (Vs − Vf) / I. For 9 V and 20 mA that is (9 − 2) / 0.02 = 350 Ω. Want to try it?"],
  ['rc', /capacitor|time constant|\brc\b|مكثف|كاباسيتور/i, "A capacitor fills up like a tank through a resistor. The time constant τ = R × C tells you how fast: after one τ it reaches 63% of the supply voltage. 1 kΩ with 1 mF gives τ = 1 s. Want to watch it charge?"],
  ['parallel', /parallel|توازي/i, "In parallel every branch gets the full voltage, and the currents add up. The total resistance drops: 1/R = 1/R1 + 1/R2, so two 100 Ω resistors in parallel make 50 Ω. Want to check it with the meters?"],
  ['series', /series|توالي/i, "In series the same current flows through every part, and the voltages add up to the supply. Resistances simply add: R = R1 + R2. Want to measure each voltage drop?"]
];
const NUDGES = [
  "Tell me what you're studying, for example circuits or Physics II, and I'll suggest the best lab to start with.",
  "New to circuits? Start with Ohm's law: you set a voltage and a resistor and see the current on the meter. Or ask me any physics question.",
  "Pick a lab below, or ask me something like \"what does a resistor do?\" and I'll explain it first."
];
let nudge = 0;
export function fallbackReply(text) {
  if (OTHER.test(text)) return { text: "Sim2Skill is physics only for now: circuits today, with mechanics and optics coming next. Want to start with one of the seven circuit labs?", labs: true };
  if (SOON.test(text)) return { text: "That experiment is on our roadmap but not open yet. Try one of the seven available electronics labs.", labs: true };
  const asks = QUESTION.test(text) && !/\b(open|start|go to|take me|try)\b|افتح|ابدأ|ابدا|وديني|عايز اجرب|عاوز اجرب/i.test(text);
  if (asks) { const c = CONCEPTS.find(([, re]) => re.test(text)); if (c) return { text: c[2], labs: true }; }
  if (CONFUSED.test(text) && !KEYS.some(([, re]) => re.test(text))) return { text: "No problem, let me say it simply. Sim2Skill is a lab on your screen: you pick an experiment, build the circuit on a 3D bench, close the switch and read the meters. If something goes wrong, I tell you why. What topic are you studying right now?", labs: true };
  const hit = [KEYS[5],...KEYS.slice(0,4),KEYS[6],KEYS[4]].find(([, re]) => re.test(text));
  if (hit) { const lab = LABS.find(l => l.id === hit[0]); return { text: `Good choice. Taking you to the ${lab.title} lab now.`, open: hit[0] }; }
  return { text: NUDGES[nudge++ % NUDGES.length], labs: true };
}

