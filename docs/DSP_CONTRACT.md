# DSP contract

Two paths that never mix:

| | Analysis path (results) | Display path (live view) |
|---|---|---|
| Purpose | Eye-state comparison, export | Looking at the signal |
| Code | `src/analysis/berger-v3.js` | `src/core/display-reference.js` |
| Changes during a session | Never | Operator may switch view or notch (logged) |
| Spectrum | Welch PSD, density-scaled | Smoothed FFT **magnitude** (not PSD) |

## Analysis plan `berger-v3-filtered-primary`

Frozen: identical arithmetic to Berger Lab 3.0.1. Any change requires a new plan id.

**Filter**, per channel, causal, Direct Form II sections, fixed order:

1. Band-pass: order-2 Butterworth 0.5–45 Hz at 500 Hz (two sections).
2. × 2/4096.
3. 50 Hz notch: order-2 Butterworth band-stop 48–52 Hz (two sections).
4. Notches at 100, 150 and 200 Hz: second-order, Q = 30.
5. × 2048, giving **count-equivalent** units.

Coefficients are stored in every export and re-derived from these parameters in `tests/coefficients.test.js`.

**Windows**: 2048 contiguous samples (4.096 s at 500 Hz nominal). Every ≥500 ms of arrival time the engine refreshes its metrics; a window is emitted when at least 2048 samples arrived since the previous one (non-overlapping). Window positions depend on Bluetooth arrival cadence and are stored with each window.

**Spectrum**: Welch, three 1024-point symmetric Hann segments, 50 % overlap, per-segment mean removal, density scaling. Bands are half-open `[lo, hi)`: delta 0.5–4, theta 4–8, alpha 8–13, beta 13–30, gamma 30–45 Hz.

**A window counts for a block when**
- it lies entirely inside the block (first sample has the block's prompted label);
- the block's spoken cue has finished (a block whose cue never reports completion gets no counted window);
- it starts at least 3 s after the later of the block start and the cue end.

**A counted window is rejected (stays in the export, flagged) for**
- `ADC clipping`: more than 0.1 % of raw samples ≤ 5 or ≥ 4090;
- `Flat signal`: zero range;
- `Filter startup or gap recovery`: starts within 5000 samples (10 s) of the filter start;
- `Recent raw ADC rail; filtered signal may ring`: a near-rail raw sample within the preceding 5000 samples or inside the window.

Warnings (never reject): strong 50 Hz (48–52 Hz > 20 % of 0.5–100 Hz power), high-frequency share (30–100 Hz > 45 % of 1–100 Hz), strong ~150 Hz.

**Per block**: median absolute 8–13 Hz power of clean windows (count-equivalent²). Raw-signal Welch alpha is kept as a secondary check.

**Per pair** (eyes open + eyes closed of the same prompted pair): eligible when both blocks are complete, both annotated *followed*, each has ≥ 2 clean windows and open alpha > 0. Ratio = closed / open. Session summary: number of eligible pairs, how many have ratio > 1, median ratio. No p-values: adjacent blocks are not independent samples.

## Display path

Selectable: EEG view (same 0.5–45 Hz chain), Chords-reference view (order-2 Butterworth 0.1 Hz high-pass and 90 Hz low-pass, as in Chords-Web `a0a77f7`, whose comments say 1/45 Hz), or raw ADC with Welch PSD. FFT: 1024 samples, rectangular window after mean removal, magnitude scaled 2/N, refreshed every 50 samples, mean of the last 20 updates (≈2 s lag). Band shares in the display are secondary and never called a focus or relaxation score.

## Units

| Quantity | Unit |
|---|---|
| Raw samples | ADC counts (0–4095, 12-bit) |
| Filtered analysis signal | count-equivalent |
| Band power | count-equivalent² (Welch density integrated over the band) |
| Display spectrum | FFT magnitude in normalised or count-equivalent units |

Microvolts appear nowhere: the gain is not calibrated.

## Validation

- Unit tests (`npm test`): tone frequency, Parseval normalisation, band edges, filter response, state and reset, packet layouts, counters, quality flags, recorder, bundle round trip, full simulated protocol.
- `tools/replay-berger-v3.mjs`: replays a Berger Lab v3 export through this code and compares coefficients, continuity, every saved window, a live re-derivation of window positions, and block summaries. Run locally on private recordings; they are never committed.
