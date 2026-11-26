// Plans, prices and limits as data. Change numbers here; no code changes needed.
// Prices are in US cents. Infinity means "no limit".
export const PLANS = {
  free: {
    name: 'Free',
    limits: {
      publicLabs: 2,
      privateLabs: 0,
      chemistryEngines: ['titration'],
      quizzesPerLab: 1,
      classrooms: 1,
      studentsPerClassroom: 30,
      nourPerDay: 10,
      csvExport: false
    }
  },
  pro: {
    name: 'Pro',
    prices: { month: 1000, semester: 3000, year: 8000 },
    periodDays: { month: 30, semester: 120, year: 365 },
    limits: {
      publicLabs: Infinity,
      privateLabs: Infinity,
      chemistryEngines: 'all',
      quizzesPerLab: Infinity,
      classrooms: 5,
      studentsPerClassroom: 100,
      nourPerDay: 100,
      csvExport: true
    }
  },
  org: {
    name: 'Organization',
    minSeats: 25,
    // Per seat per year, by seat count. Above the last tier: custom quote.
    seatTiers: [
      { from: 25, to: 199, centsPerSeatYear: 3000 },
      { from: 200, to: 999, centsPerSeatYear: 2000 }
    ],
    customAbove: 1000,
    pilot: { days: 30, seats: 25 },
    limits: {
      publicLabs: Infinity,
      privateLabs: Infinity,
      chemistryEngines: 'all',
      quizzesPerLab: Infinity,
      classrooms: Infinity,
      studentsPerClassroom: Infinity,
      nourPerDay: 100,
      csvExport: true
    }
  }
};

export const TRIAL_DAYS = 14;

// Regional student pricing, as a share of list price.
export const REGIONS = {
  global: { label: 'Worldwide', factor: 1 },
  mena: { label: 'Egypt and MENA (students)', factor: 0.4 }
};

export const CHEMISTRY_ENGINES = ['titration', 'kinetics', 'equilibrium', 'electrochemistry', 'spectroscopy'];

export function priceFor(plan, period, region = 'global') {
  const base = PLANS[plan]?.prices?.[period];
  if (!base) return null;
  return Math.round(base * (REGIONS[region]?.factor ?? 1));
}

export function orgSeatPrice(seats) {
  if (seats >= PLANS.org.customAbove) return null;
  const tier = PLANS.org.seatTiers.find(t => seats >= t.from && seats <= t.to) || PLANS.org.seatTiers[0];
  return tier.centsPerSeatYear;
}

export function engineAllowed(limits, engine) {
  if (!CHEMISTRY_ENGINES.includes(engine)) return true;
  return limits.chemistryEngines === 'all' || limits.chemistryEngines.includes(engine);
}

// JSON cannot carry Infinity; the API sends null for "no limit".
export const limitsForJson = limits =>
  Object.fromEntries(Object.entries(limits).map(([k, v]) => [k, v === Infinity ? null : v]));
