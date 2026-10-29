import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodePacket, encodePacket, UnsupportedPacketError, channelsValid } from '../src/core/packets.js';
import { CounterTracker, counterDelta } from '../src/core/continuity.js';
import { SosCascade, cascadeGain, iirNotch } from '../src/core/biquad.js';
import { EEG_BANDPASS_0_5_45, CHORDS_SNAPSHOT_NOTCH_50, HARMONIC_NOTCHES, chainSpec } from '../src/core/filters.js';
import { welchPsd, bandPower, magnitudeSpectrum, periodogram } from '../src/core/spectra.js';
import { windowMetrics, assessRawWindow, REASONS, WARNINGS } from '../src/core/quality.js';
import { createAnalysisFilter } from '../src/analysis/berger-v3.js';
import { tones } from './synthetic.js';

test('decoder: 7/13/70/130-byte layouts, big-endian, DataView byteOffset', () => {
  for (const size of [7, 13, 70, 130]) {
    const stride = size === 7 || size === 70 ? 7 : 13;
    const buffer = new Uint8Array(size + 9);
    const view = new DataView(buffer.buffer, 9, size);
    for (let o = 0; o < size; o += stride) {
      view.setUint8(o, o / stride);
      for (let c = 1; c < stride; c += 2) view.setUint16(o + c, 0x0a00 + c, false);
    }
    const rows = decodePacket(view);
    assert.equal(rows.length, size / stride);
    assert.equal(rows[0].channels.length, (stride - 1) / 2);
    assert.equal(rows[0].channels[0], 0x0a01, 'big-endian: high byte first');
    assert.equal(rows.at(-1).counter, size / stride - 1);
  }
  // A little-endian reading of the same bytes would be 0x010a: make the difference explicit.
  const v = new DataView(new ArrayBuffer(7));
  v.setUint8(1, 0x01); v.setUint8(2, 0x0a);
  assert.equal(decodePacket(v)[0].channels[0], 0x010a);
  assert.throws(() => decodePacket(new DataView(new ArrayBuffer(8))), UnsupportedPacketError);
});

test('decoder: encode/decode round trip and 12-bit validity', () => {
  const records = Array.from({ length: 10 }, (_, i) => ({ counter: 250 + i, channels: [i, 4095, 0, 2048, 1, 2] }));
  const decoded = decodePacket(encodePacket(records));
  assert.deepEqual(decoded.map((r) => r.counter), records.map((r) => r.counter & 0xff));
  assert.deepEqual(decoded[3].channels, [3, 4095, 0, 2048, 1, 2]);
  assert.ok(channelsValid([0, 4095], 2));
  assert.ok(!channelsValid([4096], 1));
  assert.ok(!channelsValid([1], 2));
});

test('counters: wrap, gaps, duplicates, restart', () => {
  assert.equal(counterDelta(255, 0), 1);
  assert.equal(counterDelta(10, 13), 3);
  assert.equal(counterDelta(7, 7), 0);
  const t = new CounterTracker();
  assert.equal(t.accept(254).index, 0);
  assert.equal(t.accept(255).kind, 'contiguous');
  assert.equal(t.accept(0).kind, 'contiguous');
  const gap = t.accept(4);
  assert.deepEqual([gap.kind, gap.missing, gap.index], ['gap', 3, 6]);
  assert.equal(t.accept(4).kind, 'duplicate');
  assert.equal(t.duplicates, 1);
  t.restartSegment();
  assert.equal(t.accept(0).index, 7, 'index continues after a restart; the restart is an event, not inferred loss');
  assert.equal(t.gaps, 3);
});

test('filters: 0.5–45 Hz band-pass + notches — passband, notch depth, coefficients', () => {
  const sections = [...EEG_BANDPASS_0_5_45, ...CHORDS_SNAPSHOT_NOTCH_50, ...HARMONIC_NOTCHES];
  assert.ok(Math.abs(cascadeGain(sections, 10, 500) - 1) < 0.05, '10 Hz in passband');
  for (const f of [50, 100, 150, 200]) assert.ok(cascadeGain(sections, f, 500) < 0.005, `${f} Hz rejected`);
  assert.ok(cascadeGain(EEG_BANDPASS_0_5_45, 0.05, 500) < 0.02, 'DC/slow drift attenuated');
  assert.ok(Math.abs(cascadeGain(EEG_BANDPASS_0_5_45, 45, 500) - Math.SQRT1_2) < 0.01, '−3 dB at 45 Hz');
  assert.ok(Math.abs(cascadeGain(EEG_BANDPASS_0_5_45, 0.5, 500) - Math.SQRT1_2) < 0.01, '−3 dB at 0.5 Hz');
  const n150 = iirNotch(150, 500, 30);
  assert.deepEqual(n150, [...HARMONIC_NOTCHES[1]]);
  assert.ok(cascadeGain([n150], 150, 500) < 1e-12);
});

test('filters: state is preserved across calls and discarded by reset()', () => {
  const x = tones(3000, [{ f: 10, a: 50 }]);
  const a = createAnalysisFilter();
  const continuous = x.map((v) => a.process(v));
  const b = createAnalysisFilter();
  const chunked = [...x.slice(0, 1234).map((v) => b.process(v)), ...x.slice(1234).map((v) => b.process(v))];
  assert.deepEqual(chunked, continuous, 'chunk boundaries do not change the output');
  const c = createAnalysisFilter();
  x.slice(0, 1000).forEach((v) => c.process(v));
  c.reset();
  assert.deepEqual(x.slice(0, 50).map((v) => c.process(v)), continuous.slice(0, 50), 'reset restores the startup state');
  // analysis output is in count-equivalent units: a 10 Hz tone keeps its amplitude after settling
  const tail = continuous.slice(2500);
  const rms = Math.sqrt(tail.reduce((s, v) => s + v * v, 0) / tail.length);
  assert.ok(Math.abs(rms - 50 / Math.SQRT2) < 1.5, `count-equivalent scale (rms ${rms})`);
  // the normalisation 2/4096 then ×2048 is exact (powers of two)
  const spec = chainSpec('eeg');
  assert.equal(spec.gain * 2048, 1);
});

test('Welch PSD: tone frequency, density normalisation (Parseval), DC removal', () => {
  for (const f of [3, 6, 10, 20, 40, 50, 80, 150, 200]) {
    const x = Array.from({ length: 2048 }, (_, i) => 2048 + 100 * Math.sin((2 * Math.PI * f * i) / 500));
    const p = welchPsd(x);
    const peak = p.indexOf(Math.max(...p));
    assert.ok(Math.abs((peak * 500) / 1024 - f) < 0.5, `peak for ${f} Hz`);
    // ∫PSD df ≈ variance = A²/2 = 5000 counts²
    assert.ok(Math.abs(bandPower(p, 0, 250.0001) - 5000) < 15, `Parseval for ${f} Hz`);
  }
  const flat = welchPsd(new Array(2048).fill(3000));
  assert.ok(flat.every((v) => v === 0), 'constant input → zero PSD after mean removal');
});

test('band integration is half-open [lo, hi)', () => {
  const psd = new Array(501).fill(0);
  psd[8] = 1; psd[13] = 1;
  assert.equal(bandPower(psd, 8, 13, { fs: 1000, n: 1000 }), 1, 'bin at 8 Hz included, bin at 13 Hz excluded');
  assert.equal(bandPower(psd, 13, 30, { fs: 1000, n: 1000 }), 1, '13 Hz belongs to the next band');
});

test('FFT magnitude spectrum is not a PSD (different scale)', () => {
  const x = Array.from({ length: 1024 }, (_, i) => 0.05 * Math.sin((2 * Math.PI * 10 * i) / 500));
  const m = magnitudeSpectrum(x);
  const k = m.indexOf(Math.max(...m));
  assert.ok(Math.abs((k * 500) / 1024 - 10) < 0.5);
  const p = periodogram(x, 500, 1024);
  assert.notEqual(Math.max(...p), Math.max(...m) ** 2, 'squared magnitude is not a density');
});

test('raw quality flags: clipping, flatness, line warnings', () => {
  const clipped = Array.from({ length: 2048 }, (_, i) => (i % 50 < 20 ? 0 : 2048));
  assert.ok(assessRawWindow(clipped).reasons.includes(REASONS.clipping));
  assert.ok(assessRawWindow(new Array(2048).fill(2048)).reasons.includes(REASONS.flat));
  const hum = tones(2048, [{ f: 50, a: 200 }, { f: 10, a: 10 }]);
  assert.ok(assessRawWindow(hum).warnings.includes(WARNINGS.line50));
  const derived = assessRawWindow(new Array(2048).fill(-2047), [windowMetrics(new Array(2048).fill(4095)), windowMetrics(new Array(2048).fill(2048))]);
  assert.ok(derived.reasons.includes(REASONS.sourceClipping), 'a derived difference inherits source clipping');
});
