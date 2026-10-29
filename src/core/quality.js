/**
 * Window metrics and raw-quality flags (Berger Lab v3 definitions, unchanged).
 * Flags are heuristics: they are not an impedance measurement and do not separate EEG from
 * eye, muscle or line activity.
 */
import { welchPsd, bandPower } from './spectra.js';

export const BANDS = Object.freeze({ delta: [0.5, 4], theta: [4, 8], alpha: [8, 13], beta: [13, 30], gamma: [30, 45] });
export const RAIL_LOW = 5;
export const RAIL_HIGH = 4090;

export const isNearRail = (v) => v <= RAIL_LOW || v >= RAIL_HIGH;

/** Reason strings are part of the v3 export format; keep them stable. */
export const REASONS = Object.freeze({
  clipping: 'ADC clipping',
  sourceClipping: 'Source ADC clipping',
  flat: 'Flat signal',
  filterStart: 'Filter startup or gap recovery',
  recentRail: 'Recent raw ADC rail; filtered signal may ring',
});
export const WARNINGS = Object.freeze({
  line50: 'Strong 50 Hz component',
  highFrequency: 'High-frequency activity: possible EMG/noise',
  line150: 'Strong ~150 Hz component (3 × 50 Hz; source unverified)',
  derived: 'Derived contrast; verify equal gains and common reference',
});

/**
 * Welch PSD, absolute band powers, relative shares (0.5–45 Hz denominator), RMS, range,
 * near-rail fraction, 48–52 Hz share of 0.5–100 Hz, 30–100 Hz share of 1–100 Hz.
 * @param {number[]} x exactly 2048 samples
 */
export function windowMetrics(x) {
  const psd = welchPsd(x);
  const bp = {};
  for (const [name, [lo, hi]] of Object.entries(BANDS)) bp[name] = bandPower(psd, lo, hi);
  let total = 0;
  for (const value of Object.values(bp)) total += value;
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += x[i];
  const mean = sum / x.length;
  let squares = 0;
  for (let i = 0; i < x.length; i++) squares += (x[i] - mean) ** 2;
  let max = -Infinity, min = Infinity, rail = 0;
  for (let i = 0; i < x.length; i++) {
    if (x[i] > max) max = x[i];
    if (x[i] < min) min = x[i];
    if (isNearRail(x[i])) rail++;
  }
  const relative = {};
  for (const [name, value] of Object.entries(bp)) relative[name] = total ? value / total : 0;
  return {
    psd,
    bp,
    relative,
    rms: Math.sqrt(squares / x.length),
    range: max - min,
    rail: rail / x.length,
    line: bandPower(psd, 48, 52) / (bandPower(psd, 0.5, 100) || 1),
    hf: bandPower(psd, 30, 100) / (bandPower(psd, 1, 100) || 1),
  };
}

/**
 * Raw quality assessment of one window. For a software-derived difference, pass the two source
 * windows' metrics: the difference has no ADC rails of its own.
 */
export function assessRawWindow(x, sourceMetrics = null) {
  const m = windowMetrics(x);
  const reasons = [];
  const warnings = [];
  const rail = sourceMetrics ? Math.max(...sourceMetrics.map((s) => s.rail)) : m.rail;
  if (rail > 0.001) reasons.push(sourceMetrics ? REASONS.sourceClipping : REASONS.clipping);
  if (m.range === 0) reasons.push(REASONS.flat);
  if (m.line > 0.2) warnings.push(WARNINGS.line50);
  if (m.hf > 0.45) warnings.push(WARNINGS.highFrequency);
  const totalFull = bandPower(m.psd, 0.5, 250) || 1;
  const line150 = bandPower(m.psd, 148, 152) / totalFull;
  if (line150 > 0.2) warnings.push(WARNINGS.line150);
  if (sourceMetrics) warnings.push(WARNINGS.derived);
  return { ...m, rail, line150, reasons, warnings };
}
