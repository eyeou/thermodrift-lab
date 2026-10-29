/**
 * Coefficient sets. Each set is data, recorded in every export, never re-derived silently.
 *
 * EEG_BANDPASS_0_5_45: SciPy butter(N=2, [0.5, 45], 'bandpass', fs=500, output='sos'),
 *   as saved by Berger Lab v3 (two sections).
 * CHORDS_SNAPSHOT_*: values as found in Chords-Web a0a77f7 (2.7.1a) filters.tsx for 500 Hz. They are
 *   8-decimal roundings of order-2 Butterworth designs: high-pass 0.1 Hz, low-pass 90 Hz and
 *   band-stop 48–52 Hz (tests/coefficients.test.js re-derives all three). Source comments say
 *   1 Hz / 45 Hz; labels here describe the actual designs, not the comments.
 * HARMONIC_NOTCHES: standard second-order notches at 100/150/200 Hz, Q = 30 (not Chords defaults).
 */
import { iirNotch } from './biquad.js';

export const FS_NOMINAL = 500;

export const EEG_BANDPASS_0_5_45 = Object.freeze([
  Object.freeze([0.05538468336069408, 0.11076936672138817, 0.05538468336069408, 1, -1.2358575641757619, 0.4584638194057952]),
  Object.freeze([1, -2, 1, 1, -1.9911176740567096, 0.9911578271039596]),
]);

export const CHORDS_SNAPSHOT_HIGHPASS = Object.freeze([0.99911182, -1.99822364, 0.99911182, 1, -1.99822285, 0.99822443]);
export const CHORDS_SNAPSHOT_LOWPASS = Object.freeze([0.17508764, 0.35017529, 0.17508764, 1, -0.51930341, 0.21965398]);
export const CHORDS_SNAPSHOT_NOTCH_50 = Object.freeze([
  Object.freeze([0.96508099, -1.56202714, 0.96508099, 1, -1.56858163, 0.96424138]),
  Object.freeze([1, -1.61854514, 1, 1, -1.61100358, 0.96592171]),
]);

export const HARMONIC_NOTCHES = Object.freeze([100, 150, 200].map((f) => Object.freeze(iirNotch(f, FS_NOMINAL, 30))));

/** v3 display/analysis normalisation: × 2/4096 after the band-pass, × 2048 restores counts. */
export const CHORDS_NORMALISATION = 2 / 4096;
export const COUNT_RESTORE = 2048;

/**
 * Display/analysis chain description used in exports. `preset`: 'eeg' (0.5–45 Hz) or 'chords'.
 */
export function chainSpec(preset = 'eeg', { notch50 = true, harmonics = true } = {}) {
  return {
    pre: preset === 'chords' ? [CHORDS_SNAPSHOT_HIGHPASS, CHORDS_SNAPSHOT_LOWPASS] : [...EEG_BANDPASS_0_5_45],
    gain: CHORDS_NORMALISATION,
    post: [...(notch50 ? CHORDS_SNAPSHOT_NOTCH_50 : []), ...(harmonics ? HARMONIC_NOTCHES : [])],
  };
}

/** Machine-readable description (same fields as v3 metadata, plus explicit units). */
export function describeChain(preset = 'eeg', { notch50 = true, harmonics = true } = {}) {
  const chords = preset === 'chords';
  return {
    implementation: 'independent standard-math filter/FFT, not the upstream application',
    preset: chords ? 'chords' : 'verified',
    fs_nominal: FS_NOMINAL,
    normalisation: '2 / 4096 after causal digital stages',
    sos: chords ? [CHORDS_SNAPSHOT_HIGHPASS, CHORDS_SNAPSHOT_LOWPASS] : EEG_BANDPASS_0_5_45,
    notch_sos: notch50 ? CHORDS_SNAPSHOT_NOTCH_50 : [],
    harmonic_notch_sos: harmonics ? HARMONIC_NOTCHES : [],
    harmonic_notches_hz: harmonics ? [100, 150, 200] : [],
    actual_cutoffs_hz: chords ? [0.1, 90] : [0.5, 45],
    note: chords
      ? 'Chords-Web a0a77f7 500 Hz coefficients: response ≈ 0.1 Hz high-pass and ≈ 90 Hz low-pass (source comments say 1/45 Hz). Harmonic notches, if selected, are not Chords defaults.'
      : 'SciPy Butterworth N=2 band-pass, 0.5–45 Hz at 500 Hz, causal (sosfilt-equivalent, Direct Form II).',
  };
}
