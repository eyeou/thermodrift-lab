import test from 'node:test';
import assert from 'node:assert/strict';
import { EEG_BANDPASS_0_5_45, BUTTER2_HIGHPASS_0_1, BUTTER2_LOWPASS_90, BUTTER2_BANDSTOP_48_52, describeChain } from '../src/core/filters.js';
import { butterworth, sosToTf, maxDiff } from './helpers/butterworth.js';

// Every stored coefficient set matches a standard Butterworth design at 500 Hz, re-derived from its parameters.
const cases = [
  ['analysis band-pass 0.5–45 Hz (order 2)', EEG_BANDPASS_0_5_45, butterworth(2, [0.5, 45], 'bandpass', 500), 1e-12],
  ['high-pass 0.1 Hz (order 2)', [BUTTER2_HIGHPASS_0_1], butterworth(2, 0.1, 'high', 500), 1e-8],
  ['low-pass 90 Hz (order 2)', [BUTTER2_LOWPASS_90], butterworth(2, 90, 'low', 500), 1e-8],
  ['50 Hz notch = band-stop 48–52 Hz (order 2)', BUTTER2_BANDSTOP_48_52, butterworth(2, [48, 52], 'bandstop', 500), 1e-8],
];

for (const [name, sections, design, tolerance] of cases) {
  test(`coefficients: ${name}`, () => {
    const tf = sosToTf(sections);
    assert.ok(maxDiff(tf.b, design.b) < tolerance, `b differs by ${maxDiff(tf.b, design.b)}`);
    assert.ok(maxDiff(tf.a, design.a) < tolerance, `a differs by ${maxDiff(tf.a, design.a)}`);
  });
}

// These numbers are part of the frozen plan: a rounding change would pass the tolerance above.
test('coefficients: stored values and preset names stay frozen', () => {
  assert.equal(JSON.stringify(BUTTER2_HIGHPASS_0_1), '[0.99911182,-1.99822364,0.99911182,1,-1.99822285,0.99822443]');
  assert.equal(JSON.stringify(BUTTER2_LOWPASS_90), '[0.17508764,0.35017529,0.17508764,1,-0.51930341,0.21965398]');
  assert.equal(JSON.stringify(BUTTER2_BANDSTOP_48_52), '[[0.96508099,-1.56202714,0.96508099,1,-1.56858163,0.96424138],[1,-1.61854514,1,1,-1.61100358,0.96592171]]');
  assert.equal(describeChain('eeg').preset, 'eeg');
  assert.equal(describeChain('chords').preset, 'chords');
});
