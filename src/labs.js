// Cards on the lab ring. The first three are live; the rest are on the roadmap.
export const WORLDS = {
  electronics: { label: 'ELECTRONICS', color: '#3AA8D0', on: '#04121A', blurb: 'Circuits you can wire wrong, safely, with Nour watching every reading.' },
  physics: { label: 'PHYSICS', color: '#9ED8E4', on: '#0E2A3B', blurb: 'Mechanics and optics benches, next on the roadmap.' },
  chemistry: { label: 'CHEMISTRY', color: '#EEF4F6', on: '#0A0E11', blurb: 'Wet-lab techniques without the fumes, next on the roadmap.' }
};

export const LABS = [
  { id: 'ohm', title: "Ohm's law", world: 'electronics', live: true, art: 'ohm', blurb: 'Set the supply and pick a resistor to hit exactly 10 mA.' },
  { id: 'led', title: 'LED with a resistor', world: 'electronics', live: true, art: 'led', blurb: 'Light an LED at a safe current without burning it out.' },
  { id: 'rc', title: 'RC charging', world: 'electronics', live: true, art: 'rc', blurb: 'Choose R and C so the capacitor reaches 63% in 1 second.' },
  { id: 'pendulum', title: 'Simple pendulum', world: 'physics', art: 'pendulum' },
  { id: 'series', title: 'Series and parallel', world: 'electronics', art: 'series' },
  { id: 'titration', title: 'Acid-base titration', world: 'chemistry', art: 'flask' },
  { id: 'lens', title: 'Lens focal length', world: 'physics', art: 'lens' },
  { id: 'divider', title: 'Voltage divider', world: 'electronics', art: 'divider' },
  { id: 'flame', title: 'Flame test', world: 'chemistry', art: 'flame' },
  { id: 'spring', title: "Hooke's law spring", world: 'physics', art: 'spring' },
  { id: 'rates', title: 'Reaction rates', world: 'chemistry', art: 'beakers' },
  { id: 'projectile', title: 'Projectile launch', world: 'physics', art: 'projectile' }
];
export const LIVE = LABS.filter(l => l.live);
export const labById = id => LABS.find(l => l.id === id);
