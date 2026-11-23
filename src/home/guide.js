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
const SOON = /pendulum|lens|spring|hooke|projectile|titration|flame|reaction|بندول|عدسة|زنبرك|معايرة|لهب|تفاعل/i;

export function fallbackReply(text) {
  if (SOON.test(text)) return { text: "That experiment is on our roadmap but not open yet. Try one of the seven available electronics labs.", labs: true };
  const hit = [KEYS[5],...KEYS.slice(0,4),KEYS[6],KEYS[4]].find(([, re]) => re.test(text));
  if (hit) { const lab = LABS.find(l => l.id === hit[0]); return { text: `Good choice. Taking you to the ${lab.title} lab now.`, open: hit[0] }; }
  return { text: "I can open one of seven labs for you. Pick one below, or tell me what you're studying and I'll suggest one.", labs: true };
}

