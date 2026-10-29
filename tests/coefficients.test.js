import test from 'node:test';
import assert from 'node:assert/strict';
import { EEG_BANDPASS_0_5_45, CHORDS_SNAPSHOT_HIGHPASS, CHORDS_SNAPSHOT_LOWPASS, CHORDS_SNAPSHOT_NOTCH_50 } from '../src/core/filters.js';
import { butterworth, sosToTf, maxDiff } from './helpers/butterworth.js';

// Provenance: every stored coefficient set is a textbook Butterworth design at 500 Hz.
const cases = [
  ['analysis band-pass 0.5–45 Hz (order 2)', EEG_BANDPASS_0_5_45, butterworth(2, [0.5, 45], 'bandpass', 500), 1e-12],
  ['Chords snapshot high-pass = 0.1 Hz (order 2)', [CHORDS_SNAPSHOT_HIGHPASS], butterworth(2, 0.1, 'high', 500), 1e-8],
  ['Chords snapshot low-pass = 90 Hz (order 2)', [CHORDS_SNAPSHOT_LOWPASS], butterworth(2, 90, 'low', 500), 1e-8],
  ['Chords snapshot 50 Hz notch = band-stop 48–52 Hz (order 2)', CHORDS_SNAPSHOT_NOTCH_50, butterworth(2, [48, 52], 'bandstop', 500), 1e-8],
];

for (const [name, sections, design, tolerance] of cases) {
  test(`coefficients: ${name}`, () => {
    const tf = sosToTf(sections);
    assert.ok(maxDiff(tf.b, design.b) < tolerance, `b differs by ${maxDiff(tf.b, design.b)}`);
    assert.ok(maxDiff(tf.a, design.a) < tolerance, `a differs by ${maxDiff(tf.a, design.a)}`);
  });
}
