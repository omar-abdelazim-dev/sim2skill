// Planned chemistry engines. They are registered so the roadmap is visible, but they cannot be used in labs yet.
const planned = (id, name) => ({
  id, subject: 'chemistry', templates: [], planned: true, name,
  defaultConfig() { throw Error(name + ' labs are coming soon.'); },
  validateConfig() { throw Error(name + ' labs are coming soon.'); },
  goal: () => '', checkPublishable() { throw Error(name + ' labs are coming soon.'); },
  validateBench() { throw Error(name + ' labs are coming soon.'); },
  evaluate: () => ({ success: false, diagnosis: 'unavailable' }), invariants: () => []
});
export const equilibrium = planned('equilibrium', 'Equilibrium (ICE tables, Ksp, Le Chatelier)');
export const electrochemistry = planned('electrochemistry', 'Electrochemistry');
export const spectroscopy = planned('spectroscopy', 'Spectroscopy');
