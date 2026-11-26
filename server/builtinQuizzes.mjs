// Starter quizzes for the built-in labs. Seeded once (only where a lab has no quiz yet).
export const BUILTIN_QUIZZES = {
  ohm: [
    { q: 'A 5 V supply pushes 10 mA through a resistor. What is its resistance?', choices: ['50 Ω', '500 Ω', '5 kΩ', '0.5 Ω'], answer: 1, explain: 'R = V / I = 5 V / 0.010 A = 500 Ω.' },
    { q: 'You double the resistance and keep the voltage the same. What happens to the current?', choices: ['It doubles', 'It stays the same', 'It halves', 'It drops to zero'], answer: 2, explain: 'I = V / R, so doubling R halves I.' },
    { q: 'How is an ammeter connected to measure the current through a resistor?', choices: ['In series with the resistor', 'In parallel with the resistor', 'Across the battery only', 'It does not need to be connected'], answer: 0, explain: 'The current has to flow through the meter, so it goes in series.' }
  ],
  led: [
    { q: 'Why does an LED need a resistor in series?', choices: ['To make it brighter', 'To limit the current so it does not burn out', 'To reverse its polarity', 'To store charge'], answer: 1, explain: 'An LED has almost no resistance once it conducts, so the resistor sets a safe current.' },
    { q: 'A 9 V supply, an LED that drops 2 V, and a target of 10 mA. Which resistor?', choices: ['200 Ω', '700 Ω', '900 Ω', '7 kΩ'], answer: 1, explain: 'The resistor takes 9 − 2 = 7 V. R = 7 V / 0.010 A = 700 Ω.' },
    { q: 'What happens if the LED is placed the wrong way round?', choices: ['It glows dimly', 'It blocks the current and stays dark', 'It glows a different colour', 'It burns out at once'], answer: 1, explain: 'An LED is a diode: reverse-biased, it blocks current.' }
  ],
  rc: [
    { q: 'R = 10 kΩ and C = 100 µF. What is the time constant τ = RC?', choices: ['0.1 s', '1 s', '10 s', '100 s'], answer: 1, explain: '10 000 Ω × 0.0001 F = 1 s.' },
    { q: 'After one time constant, how charged is the capacitor?', choices: ['About 37%', 'About 50%', 'About 63%', '100%'], answer: 2, explain: 'V = V₀(1 − e⁻¹) ≈ 0.63 V₀.' },
    { q: 'You double the capacitance. How does charging change?', choices: ['Twice as fast', 'No change', 'Twice as slow', 'Four times as slow'], answer: 2, explain: 'τ = RC, so doubling C doubles the charging time.' }
  ],
  series: [
    { q: 'What is the total resistance of 100 Ω and 220 Ω in series?', choices: ['68.75 Ω', '120 Ω', '320 Ω', '22 kΩ'], answer: 2, explain: 'In series, resistances add: 100 + 220 = 320 Ω.' },
    { q: 'In a series circuit, the current through each resistor is…', choices: ['The same', 'Larger in the bigger resistor', 'Larger in the smaller resistor', 'Zero in one of them'], answer: 0, explain: 'There is only one path, so the same current flows everywhere.' }
  ],
  parallel: [
    { q: 'Two 1 kΩ resistors in parallel have a combined resistance of…', choices: ['2 kΩ', '1 kΩ', '500 Ω', '250 Ω'], answer: 2, explain: '1/R = 1/1000 + 1/1000, so R = 500 Ω.' },
    { q: 'In parallel branches, which quantity is the same for every branch?', choices: ['Current', 'Voltage', 'Resistance', 'Power'], answer: 1, explain: 'Every branch is connected across the same two points, so each sees the same voltage.' }
  ],
  diode: [
    { q: 'Roughly what forward voltage does a silicon diode drop when it conducts?', choices: ['0.07 V', '0.7 V', '7 V', '70 V'], answer: 1, explain: 'A silicon junction drops about 0.6–0.7 V.' },
    { q: 'A reverse-biased diode…', choices: ['Conducts freely', 'Blocks current (apart from a tiny leak)', 'Doubles the voltage', 'Acts like a capacitor only'], answer: 1, explain: 'Reverse bias widens the depletion region, so almost no current flows.' }
  ],
  divider: [
    { q: 'A 12 V supply feeds two equal resistors in series. What is the voltage across the bottom one?', choices: ['3 V', '6 V', '12 V', '24 V'], answer: 1, explain: 'Vout = Vin × R2 / (R1 + R2) = 12 × ½ = 6 V.' },
    { q: 'To raise the output of a divider, you should…', choices: ['Increase R2 (the bottom resistor)', 'Increase R1 (the top resistor)', 'Lower the supply voltage', 'Swap the resistors for wires'], answer: 0, explain: 'A larger share of the total resistance across R2 gives it a larger share of the voltage.' }
  ],
  titration: [
    { q: 'Acetic acid is titrated with NaOH. Which indicator suits the equivalence point best?', choices: ['Methyl orange (3.1–4.4)', 'Methyl red (4.4–6.2)', 'Phenolphthalein (8.2–10)', 'Any indicator works the same'], answer: 2, explain: 'A weak acid with a strong base gives an equivalence pH above 7, inside phenolphthalein’s range.' },
    { q: 'Why rinse the burette with titrant before filling it?', choices: ['To warm it up', 'So leftover water does not dilute the titrant', 'To remove the indicator', 'It makes no difference'], answer: 1, explain: 'Water left inside dilutes the titrant, so you would need more of it and overestimate the concentration.' },
    { q: 'Halfway to the equivalence point of a weak acid titration, the pH equals…', choices: ['7', 'The pKa of the acid', '14 − pKa', 'The starting pH'], answer: 1, explain: 'At half-equivalence [HA] = [A⁻], so the Henderson–Hasselbalch equation gives pH = pKa.' }
  ],
  kinetics: [
    { q: 'For a first-order reaction, which plot against time is a straight line?', choices: ['[A]', 'ln [A]', '1/[A]', '[A]²'], answer: 1, explain: 'ln[A] = ln[A]₀ − kt, a straight line with slope −k.' },
    { q: 'The slope of an Arrhenius plot of ln k against 1/T equals…', choices: ['−Ea / R', 'Ea / R', '−R / Ea', 'ln A'], answer: 0, explain: 'ln k = ln A − (Ea/R)(1/T).' },
    { q: 'Which temperature unit must you use in the Arrhenius equation?', choices: ['Degrees Celsius', 'Kelvin', 'Fahrenheit', 'Any unit'], answer: 1, explain: 'The equation needs absolute temperature, so convert to kelvin.' }
  ]
};
