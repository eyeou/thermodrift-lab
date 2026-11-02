/**
 * Coefficient sets. Each set is data, recorded in every export, never re-derived silently.
 *
 * EEG_BANDPASS_0_5_45: SciPy butter(N=2, [0.5, 45], 'bandpass', fs=500, output='sos'), two sections.
 *   Frozen with the analysis plan.
 * BUTTER2_HIGHPASS_0_1, BUTTER2_LOWPASS_90, BUTTER2_BANDSTOP_48_52: order-2 Butterworth designs at
 *   500 Hz, rounded to 8 decimals (tests/coefficients.test.js re-derives all three). The band-stop
 *   is the 50 Hz notch of the frozen analysis plan; the others serve the Chords-reference view.
 * HARMONIC_NOTCHES: standard second-order notches at 100/150/200 Hz, Q = 30 (not Chords defaults).
 */
import { iirNotch } from './biquad.js';

export const FS_NOMINAL = 500;

export const EEG_BANDPASS_0_5_45 = Object.freeze([
  Object.freeze([0.05538468336069408, 0.11076936672138817, 0.05538468336069408, 1, -1.2358575641757619, 0.4584638194057952]),
  Object.freeze([1, -2, 1, 1, -1.9911176740567096, 0.9911578271039596]),
]);

export const BUTTER2_HIGHPASS_0_1 = Object.freeze([0.99911182, -1.99822364, 0.99911182, 1, -1.99822285, 0.99822443]);
export const BUTTER2_LOWPASS_90 = Object.freeze([0.17508764, 0.35017529, 0.17508764, 1, -0.51930341, 0.21965398]);
export const BUTTER2_BANDSTOP_48_52 = Object.freeze([
  Object.freeze([0.96508099, -1.56202714, 0.96508099, 1, -1.56858163, 0.96424138]),
  Object.freeze([1, -1.61854514, 1, 1, -1.61100358, 0.96592171]),
]);

export const HARMONIC_NOTCHES = Object.freeze([100, 150, 200].map((f) => Object.freeze(iirNotch(f, FS_NOMINAL, 30))));

/** Normalisation of the display and analysis chains: × 2/4096 after the band-pass, × 2048 restores counts. */
export const CHORDS_NORMALISATION = 2 / 4096;
export const COUNT_RESTORE = 2048;

/**
 * Display/analysis chain description used in exports. `preset`: 'eeg' (0.5–45 Hz) or 'chords'.
 */
export function chainSpec(preset = 'eeg', { notch50 = true, harmonics = true } = {}) {
  return {
    pre: preset === 'chords' ? [BUTTER2_HIGHPASS_0_1, BUTTER2_LOWPASS_90] : [...EEG_BANDPASS_0_5_45],
    gain: CHORDS_NORMALISATION,
    post: [...(notch50 ? BUTTER2_BANDSTOP_48_52 : []), ...(harmonics ? HARMONIC_NOTCHES : [])],
  };
}

/** Machine-readable description, stored in exports. */
export function describeChain(preset = 'eeg', { notch50 = true, harmonics = true } = {}) {
  const chords = preset === 'chords';
  return {
    implementation: 'standard-math filter/FFT, not the upstream application',
    preset: chords ? 'chords' : 'eeg',
    fs_nominal: FS_NOMINAL,
    normalisation: '2 / 4096 after causal digital stages',
    sos: chords ? [BUTTER2_HIGHPASS_0_1, BUTTER2_LOWPASS_90] : EEG_BANDPASS_0_5_45,
    notch_sos: notch50 ? BUTTER2_BANDSTOP_48_52 : [],
    harmonic_notch_sos: harmonics ? HARMONIC_NOTCHES : [],
    harmonic_notches_hz: harmonics ? [100, 150, 200] : [],
    actual_cutoffs_hz: chords ? [0.1, 90] : [0.5, 45],
    note: chords
      ? 'Order-2 Butterworth 0.1 Hz high-pass and 90 Hz low-pass at 500 Hz, the display settings of Chords-Web a0a77f7. Harmonic notches, if selected, are not Chords defaults.'
      : 'SciPy Butterworth N=2 band-pass, 0.5–45 Hz at 500 Hz, causal (sosfilt-equivalent, Direct Form II).',
  };
}
