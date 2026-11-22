// Demo build only (VITE_DEMO=1): there is no backend, so picture reading is simulated with three ready-made circuits.
// The schematic, the solver and the 3D bench are the real ones.
export const DEMO = !!(import.meta.env && import.meta.env.VITE_DEMO);

export const SAMPLES = {
  twoLoop: {
    label: '20 V two-loop network',
    reply: 'Demo read: this is a 20 V source feeding R1 into node V1, with R2 and R3/R4 splitting the current and a 4 A source into V2. KCL gives V1 ≈ 20.78 V and V2 ≈ 30.65 V. Open it on the bench to check.',
    netlist: { title: 'Two-loop resistor network', summary: 'A 20 V source feeds R1 into node V1; R2 and R3/R4 split the current, and a 4 A source injects current into V2.', ground_net: '0',
      components: [
        { id: 'V1', type: 'battery', value: '20 V', nodes: ['vs', '0'] }, { id: 'R1', type: 'resistor', value: '2 Ω', nodes: ['vs', 'v1'] },
        { id: 'R2', type: 'resistor', value: '10 Ω', nodes: ['v1', '0'] }, { id: 'R3', type: 'resistor', value: '4 Ω', nodes: ['v1', 'v2'] },
        { id: 'R4', type: 'resistor', value: '20 Ω', nodes: ['v2', '0'] }, { id: 'I1', type: 'current_source', value: '4 A', nodes: ['0', 'v2'] }],
      steps: ['KCL at V1: (V1−20)/2 + V1/10 + (V1−V2)/4 = 0.', 'KCL at V2: (V2−V1)/4 + V2/20 = 4.', 'Solve: V1 ≈ 20.78 V, V2 ≈ 30.65 V.'], answer: 'V1 ≈ 20.78 V, V2 ≈ 30.65 V', uncertain: ['Direction of the 4 A arrow was assumed to point up into V2.'] }
  },
  ledSwitch: {
    label: 'LED + switch',
    reply: 'Demo read: a 9 V battery, a switch, a 470 Ω resistor and a red LED in series. With the switch closed, I = (9 − 2) / 470 ≈ 14.9 mA. Click the switch on the bench to cut the current.',
    netlist: { title: 'LED with switch', summary: '9 V battery, switch, 470 ohm resistor and a red LED in series.', ground_net: '0',
      components: [
        { id: 'V1', type: 'battery', value: '9 V', nodes: ['n1', '0'] }, { id: 'S1', type: 'switch', state: 'closed', nodes: ['n1', 'n2'] },
        { id: 'R1', type: 'resistor', value: '470 Ω', nodes: ['n2', 'n3'] }, { id: 'D1', type: 'led', value: '2 V', nodes: ['n3', '0'] }],
      steps: ['The LED drops about 2 V, so the resistor drops 7 V.', 'I = 7 V / 470 Ω ≈ 14.9 mA.'], answer: '14.9 mA', uncertain: [] }
  },
  divider: {
    label: 'Voltage divider',
    reply: 'Demo read: a 12 V source across R1 = 10 kΩ and R2 = 20 kΩ in series. The middle node sits at 12 × 20/30 = 8 V, and the current is 0.4 mA.',
    netlist: { title: 'Voltage divider', summary: '12 V across 10 kΩ and 20 kΩ in series.', ground_net: '0',
      components: [
        { id: 'V1', type: 'battery', value: '12 V', nodes: ['vin', '0'] }, { id: 'R1', type: 'resistor', value: '10 kΩ', nodes: ['vin', 'mid'] }, { id: 'R2', type: 'resistor', value: '20 kΩ', nodes: ['mid', '0'] }],
      steps: ['I = 12 V / 30 kΩ = 0.4 mA.', 'Vmid = I × R2 = 8 V.'], answer: 'Vmid = 8 V', uncertain: [] }
  }
};

// Whatever picture is sent, the demo answers with one of the samples (picked from the words in the message).
export function demoAsk(history, hasImage) {
  if (!hasImage) { const e = new Error('demo'); throw e; } // plain questions use the keyword path
  const t = ((history[history.length - 1] || {}).text || '').toLowerCase();
  const s = /led|switch/.test(t) ? SAMPLES.ledSwitch : /divid/.test(t) ? SAMPLES.divider : SAMPLES.twoLoop;
  return { reply: s.reply, open_lab: null, netlist: s.netlist };
}
