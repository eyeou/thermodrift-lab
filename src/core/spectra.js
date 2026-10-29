/**
 * Spectral estimators. Two different quantities live here and must never be confused:
 *  - welchPsd(): power spectral density, one-sided, density scaling, units² / Hz.
 *  - magnitudeSpectrum(): FFT magnitude (2/N scaling), a display quantity, NOT a PSD.
 * Arithmetic order matches Berger Lab v3 (see tests/replay for the bit-level check).
 */
import { fftInPlace } from './fft.js';

/** Symmetric Hann window value, w[i] = 0.5 − 0.5·cos(2πi/(N−1)). */
export function hann(i, n) {
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
}

/**
 * One Hann-windowed, mean-removed periodogram segment, density scaled:
 * P[k] = |X[k]|² / (fs · Σw²), doubled except at DC and Nyquist.
 * @param {ArrayLike<number>} x exactly `n` samples
 */
export function periodogram(x, fs, n) {
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += x[i];
  const mean = sum / n;
  let w2 = 0;
  for (let i = 0; i < n; i++) {
    const w = hann(i, n);
    re[i] = (x[i] - mean) * w;
    w2 += w * w;
  }
  fftInPlace(re, im);
  const out = new Array(n / 2 + 1);
  for (let k = 0; k <= n / 2; k++) {
    out[k] = ((re[k] ** 2 + im[k] ** 2) / (fs * w2)) * (k === 0 || k === n / 2 ? 1 : 2);
  }
  return out;
}

/**
 * Welch PSD: `segment`-point Hann segments with 50% overlap, per-segment mean removal,
 * averaged in segment order. v3 uses 2048 samples → three 1024-point segments (0, 512, 1024).
 */
export function welchPsd(x, { fs = 500, segment = 1024, step = segment / 2 } = {}) {
  if (x.length < 2 * segment) throw new Error(`Need ${2 * segment} contiguous samples`);
  const starts = [];
  for (let start = 0; start + segment <= x.length; start += step) starts.push(start);
  const out = new Array(segment / 2 + 1).fill(0);
  for (const start of starts) {
    const p = periodogram(x.slice(start, start + segment), fs, segment);
    for (let k = 0; k < out.length; k++) out[k] += p[k] / starts.length;
  }
  return out;
}

/**
 * Integrate a PSD over the half-open band [lo, hi) Hz: Σ P[k]·Δf for lo ≤ f_k < hi.
 * Half-open edges avoid double counting a bin shared by adjacent bands.
 */
export function bandPower(psd, lo, hi, { fs = 500, n = 1024 } = {}) {
  let sum = 0;
  for (let k = 0; k < psd.length; k++) {
    const f = (k * fs) / n;
    if (f >= lo && f < hi) sum += (psd[k] * fs) / n;
  }
  return sum;
}

/** Frequency of bin k. */
export function binFrequency(k, { fs = 500, n = 1024 } = {}) {
  return (k * fs) / n;
}

/**
 * FFT magnitude spectrum used by the Chords-reference display: mean removal, rectangular
 * window, input rounded to float32 (the reference app feeds a Float32Array), 2/N scaling.
 * Not a PSD; its square is not a density.
 */
export function magnitudeSpectrum(input) {
  const n = input.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += input[i];
  const mean = sum / n;
  const re = Float64Array.from(input, (x) => Math.fround(x - mean));
  const im = new Float64Array(n);
  fftInPlace(re, im);
  const out = new Array(n / 2);
  for (let k = 0; k < n / 2; k++) out[k] = Math.hypot(re[k], im[k]) / (n / 2);
  return out;
}
