import assert from 'node:assert/strict';
import { fallbackReply } from '../src/home/guide.js';
assert.equal(fallbackReply('Open the LED with a resistor').open, 'led', 'Specific LED intent takes precedence over resistor keywords');
assert.equal(fallbackReply('Explore capacitor charging current').open, 'rc');
assert.equal(fallbackReply('Open the voltage divider').open, 'divider', 'Voltage divider has its own lab');
assert.equal(fallbackReply('Try series resistors').open, 'series');
assert.equal(fallbackReply('أريد تجربة الليد').open, 'led');
assert.equal(fallbackReply('Where should I start?').labs, true);
console.log('6/6 homepage guide checks passed');
