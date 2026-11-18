/**
 * Live channel status: green, orange or red per channel over the last 10 s, recomputed every 2 s,
 * on raw ADC counts. Ported from the offline replay of 2 November 2026
 * (breathwork-analysis/scratch/2026-11-02/status_features.py and status_replay.py); the numbers
 * below are the ones that were replayed on the 31 October and 1 November recordings.
 *
 * Two families of checks:
 *  - connection (every kind): the 33.3/66.7 Hz signature of a lost or floating lead, rails, flat
 *    line. Replayed on three known faults. These drive the sounds.
 *  - kind-specific: ECG beats and ECG mains (replayed); EEG muscle share (added 5 Nov from the
 *    same recordings, colour only, no sound). EOG and EMG carry the signal the check would flag
 *    (eye movements, muscle), so they only get the connection checks plus an information line.
 *
 * Green means connected, not clean. This is a setup and watch aid, not the offline gate.
 */
import { welchPsd, bandPower } from './spectra.js';
import { createSection } from './biquad.js';
import { isNearRail } from './quality.js';

export const STATUS_FS = 500;
export const STATUS_WINDOW = 5000; // 10 s
export const STATUS_STEP = 1000; // every 2 s
const PSD_SEGMENT = 2048;

export const LIMITS = Object.freeze({
  combRed: 0.2,
  combOrange: 0.1,
  railRed: 0.5,
  railOrange: 0.2,
  flatRange: 3,
  beatSnr: 30,
  beatsMin: 4,
  beatsMax: 30,
  ecgLine: 0.2,
  eegMuscle: 0.4,
});

export const GREEN = 0, ORANGE = 1, RED = 2;
export const LEVEL_NAME = Object.freeze(['green', 'orange', 'red']);

/** scipy.signal.butter(3, [8, 25], btype='band', fs=500, output='sos'). */
export const BEAT_BANDPASS_8_25 = Object.freeze([
  Object.freeze([0.0009951735615644866, 0.001990347123128973, 0.0009951735615644866, 1, -1.7777641691712147, 0.8063221045221779]),
  Object.freeze([1, 0, -1, 1, -1.773312968978885, 0.8551237088102586]),
  Object.freeze([1, -2, 1, 1, -1.9343336544726435, 0.945257912179653]),
]);

const band = (psd, lo, hi) => bandPower(psd, lo, hi, { fs: STATUS_FS, n: PSD_SEGMENT });

/** Zero-phase band-pass (forward, then backward) with 1 s of odd-extension padding at each end. */
function filtfilt(x, sections, pad = 500) {
  const n = x.length;
  const p = Math.min(pad, n - 1);
  const ext = new Float64Array(n + 2 * p);
  for (let i = 0; i < p; i++) ext[i] = 2 * x[0] - x[p - i];
  for (let i = 0; i < n; i++) ext[p + i] = x[i];
  for (let i = 0; i < p; i++) ext[p + n + i] = 2 * x[n - 1] - x[n - 2 - i];
  let fwd = sections.map(createSection);
  for (let i = 0; i < ext.length; i++) { let y = ext[i]; for (const s of fwd) y = s(y); ext[i] = y; }
  fwd = sections.map(createSection);
  for (let i = ext.length - 1; i >= 0; i--) { let y = ext[i]; for (const s of fwd) y = s(y); ext[i] = y; }
  return ext.subarray(p, p + n);
}

/** numpy.percentile with linear interpolation. */
function percentile(values, q) {
  const a = Float64Array.from(values).sort();
  const pos = (q / 100) * (a.length - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return a[lo] + (a[hi] - a[lo]) * (pos - lo);
}

function median(values) {
  return percentile(values, 50);
}

/** scipy.signal.find_peaks(e, height, distance): local maxima, height filter, then distance by height. */
function findPeaks(e, height, distance) {
  const cand = [];
  for (let i = 1; i < e.length - 1; i++) {
    if (e[i] > e[i - 1]) {
      let j = i + 1;
      while (j < e.length - 1 && e[j] === e[i]) j++;
      if (e[j] < e[i]) { const mid = (i + j - 1) >> 1; if (e[mid] >= height) cand.push(mid); i = j - 1; }
    }
  }
  const keep = new Array(cand.length).fill(true);
  const order = cand.map((_, k) => k).sort((a, b) => e[cand[a]] - e[cand[b]] || a - b).reverse();
  for (const k of order) {
    if (!keep[k]) continue;
    for (let j = k - 1; j >= 0 && cand[k] - cand[j] < distance; j--) keep[j] = false;
    for (let j = k + 1; j < cand.length && cand[j] - cand[k] < distance; j++) keep[j] = false;
  }
  return cand.filter((_, k) => keep[k]);
}

/** Beat finder of the replay: 8–25 Hz band, squared, peaks ≥ ¼ of the 99.5th percentile, 300 ms apart. */
export function beatFeatures(x) {
  let mean = 0;
  for (const v of x) mean += v;
  mean /= x.length;
  const y = filtfilt(Array.from(x, (v) => v - mean), BEAT_BANDPASS_8_25);
  const e = Float64Array.from(y, (v) => v * v);
  const th = 0.25 * percentile(e, 99.5);
  const peaks = findPeaks(e, th, Math.round(0.3 * STATUS_FS));
  if (peaks.length < 3) return { beats: peaks.length, rrCv: NaN, snr: NaN, bpm: NaN };
  const rr = [];
  for (let i = 1; i < peaks.length; i++) rr.push((peaks[i] - peaks[i - 1]) / STATUS_FS);
  const rrMean = rr.reduce((a, b) => a + b, 0) / rr.length;
  const rrSd = Math.sqrt(rr.reduce((a, b) => a + (b - rrMean) ** 2, 0) / rr.length);
  const floor = median(e) + 1e-9;
  return { beats: peaks.length, rrCv: rrSd / rrMean, snr: median(peaks.map((k) => e[k])) / floor, bpm: 60 / median(rr) };
}

/** Features of one 10-s raw window (5000 samples of ADC counts). */
export function statusFeatures(x, kind) {
  let sum = 0, min = Infinity, max = -Infinity, rail = 0;
  for (const v of x) { sum += v; if (v < min) min = v; if (v > max) max = v; if (isNearRail(v)) rail++; }
  const mean = sum / x.length;
  let sq = 0;
  for (const v of x) sq += (v - mean) ** 2;
  const psd = welchPsd(x, { fs: STATUS_FS, segment: PSD_SEGMENT });
  const total = band(psd, 0.5, 120) + 1e-9;
  const comb = (band(psd, 32.333, 34.333) + band(psd, 65.667, 67.667)) / total;
  const line = band(psd, 48, 52) / (band(psd, 0.5, 100) + 1e-9);
  const muscle = (band(psd, 30, 48) + band(psd, 52, 98)) / (band(psd, 1, 48) + band(psd, 52, 98) + 1e-9);
  const f = { range: max - min, rms: Math.sqrt(sq / x.length), rail: rail / x.length, comb, line, muscle };
  if (kind === 'ecg') Object.assign(f, beatFeatures(x));
  return f;
}

/**
 * Level and reasons for one window. `reasons` are short words for the lights; `sound` says whether
 * the level comes from a replayed check that may sound (kind-specific EEG muscle never sounds).
 */
export function channelLevel(f, kind) {
  const red = [], orange = [], quiet = [];
  if (f.comb >= LIMITS.combRed) red.push('lead off or floating');
  else if (f.comb >= LIMITS.combOrange) orange.push('lead loose?');
  if (f.rail >= LIMITS.railRed) red.push('saturated');
  else if (f.rail >= LIMITS.railOrange) orange.push('clipping');
  if (f.range <= LIMITS.flatRange) red.push('flat');
  if (kind === 'ecg') {
    const weak = !(f.snr >= LIMITS.beatSnr) || f.beats < LIMITS.beatsMin || f.beats > LIMITS.beatsMax;
    if (weak) orange.push(f.beats < LIMITS.beatsMin ? 'beats missing' : f.beats > LIMITS.beatsMax ? 'too many peaks' : 'weak beats');
    if (f.line >= LIMITS.ecgLine) orange.push('mains 50 Hz');
  }
  if (kind === 'eeg' && f.muscle >= LIMITS.eegMuscle) quiet.push('muscle');
  if (red.length) return { level: RED, reasons: red, sound: true };
  if (orange.length) return { level: ORANGE, reasons: [...orange, ...quiet], sound: true };
  if (quiet.length) return { level: ORANGE, reasons: quiet, sound: false };
  return { level: GREEN, reasons: [], sound: false };
}

/** One information line per kind, for a healthy channel. */
export function infoLine(f, kind, baseline) {
  if (kind === 'ecg') return Number.isFinite(f.bpm) ? `${Math.round(f.bpm)} bpm` : `${f.beats} beats`;
  if (kind === 'emg') return baseline > 0 ? `tension ×${(f.rms / baseline).toFixed(1)}` : `RMS ${f.rms.toFixed(0)}`;
  if (kind === 'eeg') return `muscle ${(100 * f.muscle).toFixed(0)}%`;
  return `RMS ${f.rms.toFixed(0)}`;
}

/**
 * Per-channel sound policy of the replay: red held 20 s or orange held 60 s, once, rearmed after
 * 60 s of green, orange at most every 5 min. In setup mode every change of level is announced.
 */
export function createAlertTracker({ holdRed = 20, holdOrange = 60, rearm = 60, quiet = 300 } = {}) {
  let sinceAny = null, sinceRed = null, greenSince = null, armedRed = true, armedOrange = true, last = -1e9, prev = null;
  return {
    /** @returns {{changed: boolean, alert: null | 'red' | 'orange'}} */
    step(t, level, soundable = true) {
      const changed = prev !== null && level !== prev;
      prev = level;
      const effective = soundable ? level : GREEN;
      if (effective === GREEN) {
        sinceAny = sinceRed = null;
        greenSince ??= t;
        if (t - greenSince >= rearm) armedRed = armedOrange = true;
        return { changed, alert: null };
      }
      greenSince = null;
      sinceAny ??= t;
      sinceRed = effective === RED ? (sinceRed ?? t) : null;
      if (armedRed && sinceRed !== null && t - sinceRed >= holdRed) {
        armedRed = armedOrange = false; last = t;
        return { changed, alert: 'red' };
      }
      if (armedOrange && t - sinceAny >= holdOrange && t - last >= quiet) {
        armedOrange = false; last = t;
        return { changed, alert: 'orange' };
      }
      return { changed, alert: null };
    },
    reset() { sinceAny = sinceRed = greenSince = prev = null; armedRed = armedOrange = true; last = -1e9; },
  };
}
