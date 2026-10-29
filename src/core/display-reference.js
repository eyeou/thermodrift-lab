/**
 * Live display processor (display only; never feeds the primary analysis).
 * Causal chain → 1024-sample buffer → FFT magnitude every 50 samples → moving mean of the last
 * 20 magnitude updates (the mean divides by 20 from the first update, so the first second
 * under-reads: a documented display transient). Band shares use squared magnitudes.
 */
import { SosCascade } from './biquad.js';
import { chainSpec, describeChain } from './filters.js';
import { magnitudeSpectrum } from './spectra.js';
import { BANDS } from './quality.js';

export const DISPLAY_FFT = Object.freeze({ samples: 1024, window: 'rectangular after mean removal', magnitude_scale: '2/N', update_every_samples: 50, smoothing_updates: 20 });

export function magnitudeBandPercent(m, { fs = 500, n = 1024 } = {}) {
  const p = {};
  for (const [name, [lo, hi]] of Object.entries(BANDS)) {
    p[name] = 0;
    for (let k = 1; k < m.length; k++) {
      const f = (k * fs) / n;
      if (f >= lo && f < hi) p[name] += m[k] * m[k];
    }
  }
  let total = 0;
  for (const v of Object.values(p)) total += v;
  return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, total ? (100 * v) / total : 0]));
}

/**
 * @param {'eeg'|'chords'} preset
 */
export function createDisplayProcessor(preset = 'eeg', { notch50 = true, harmonics = true } = {}) {
  const n = DISPLAY_FFT.samples;
  const cascade = new SosCascade(chainSpec(preset, { notch50, harmonics }));
  const samples = [];
  const history = Array.from({ length: DISPLAY_FFT.smoothing_updates }, () => new Array(n / 2).fill(0));
  const sums = new Array(n / 2).fill(0);
  let cursor = 0;
  let count = 0;
  const api = {
    preset,
    samples,
    latest: null,
    /** Output in normalised units (× 2/4096), like the Chords reference display. */
    push(input) {
      const y = cascade.process(input);
      samples.push(y);
      if (samples.length > n) samples.shift();
      count++;
      if (samples.length === n && count % DISPLAY_FFT.update_every_samples === 0) {
        const m = magnitudeSpectrum(samples);
        const old = history[cursor];
        const avg = m.map((v, k) => {
          sums[k] += v - old[k];
          return sums[k] / DISPLAY_FFT.smoothing_updates;
        });
        history[cursor] = m;
        cursor = (cursor + 1) % DISPLAY_FFT.smoothing_updates;
        api.latest = { magnitudes: avg, bandPercent: magnitudeBandPercent(avg) };
      }
      return y;
    },
    describe() {
      return { ...describeChain(preset, { notch50, harmonics }), fft: DISPLAY_FFT, warning: 'Display only. Filtering cannot reconstruct clipped samples.' };
    },
  };
  return api;
}
