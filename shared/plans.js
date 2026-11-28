// Plans, prices and limits as data. Change numbers here; no code changes needed.
// Prices are in piastres (1/100 of an Egyptian pound, EGP). Infinity means "no limit".
// Plan keys stay 'pro' and 'org' so existing subscriptions and organizations keep working;
// the names shown to people are Individual and Institution licence.
export const CURRENCY = 'EGP';

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
      nourPerMonth: 20,
      csvExport: false
    }
  },
  pro: {
    name: 'Individual',
    audience: 'Any user on their own: students, high-schoolers, self-learners',
    prices: { month: 19900, year: 169000 },
    periodDays: { month: 30, year: 365 },
    limits: {
      publicLabs: Infinity,
      privateLabs: Infinity,
      chemistryEngines: 'all',
      quizzesPerLab: Infinity,
      classrooms: 5,
      studentsPerClassroom: 100,
      nourPerMonth: 100,
      csvExport: true
    }
  },
  org: {
    name: 'Institution licence',
    audience: 'Private high schools, private universities and private organisations',
    minSeats: 100,
    // Per seat, billed per semester by invoice.
    pricePerSeatSemester: 75000,
    semesterDays: 120,
    pilot: { days: 30, seats: 25 },
    limits: {
      publicLabs: Infinity,
      privateLabs: Infinity,
      chemistryEngines: 'all',
      quizzesPerLab: Infinity,
      classrooms: Infinity,
      studentsPerClassroom: Infinity,
      nourPerMonth: 80,
      csvExport: true
    }
  }
};

// Extra Nour messages for Individual subscribers, valid for the calendar month they are bought in.
export const TOPUP = { name: 'Top-up pack', price: 14900, messages: 100, forPlan: 'pro' };

export const TRIAL_DAYS = 14;

export const CHEMISTRY_ENGINES = ['titration', 'kinetics', 'equilibrium', 'electrochemistry', 'spectroscopy'];

export function priceFor(plan, period) {
  if (plan === 'topup') return period === 'pack' ? TOPUP.price : null;
  return PLANS[plan]?.prices?.[period] || null;
}

export const orgSemesterTotal = seats => PLANS.org.pricePerSeatSemester * seats;

// Quota bucket for monthly limits: "YYYY-MM" (UTC).
export const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);

export function engineAllowed(limits, engine) {
  if (!CHEMISTRY_ENGINES.includes(engine)) return true;
  return limits.chemistryEngines === 'all' || limits.chemistryEngines.includes(engine);
}

// JSON cannot carry Infinity; the API sends null for "no limit".
export const limitsForJson = limits =>
  Object.fromEntries(Object.entries(limits).map(([k, v]) => [k, v === Infinity ? null : v]));
