# Knowledge register

Every entry says how we know it. Update entries instead of adding duplicates; strike through what turns out wrong and say why.

## Vendor facts (Upside Down Labs documentation)

| # | Fact | Source |
|---|---|---|
| V1 | NPG Lite: ESP32-C6, 12-bit ADC, up to 6 channels | NPG Lite hardware page |
| V2 | The CN switch ties all negative inputs to the common line | NPG Lite Beast kit page |
| V3 | EEG placement: positive on the target, REF and negative behind the ears | NPG Lite Beast kit page |
| V4 | The BLE firmware sends 10 samples per notification | Firmware repository |

## Code findings (reading or testing code)

| # | Finding | Evidence |
|---|---|---|
| C1 | Samples are dropped before numbering when BLE buffers are full | `NPG-LITE-BLE.ino` @ `57adf4d` |
| C2 | Chords-Web 2.7.1a display filters are order-2 Butterworth 0.1 Hz HP and 90 Hz LP (comments say 1/45 Hz); its 50 Hz notch is a 48–52 Hz band-stop | `tests/coefficients.test.js` |
| C3 | The bubble app used for the first sessions misplaced test tones (10/20/40 Hz shown at 25.4/50.8/56.6 Hz) | Synthetic-tone audit, 9 Oct 2026 |
| C4 | The display spectrum of Chords is an FFT magnitude (2/N), not a PSD | Code reading; `src/core/display-reference.js` |
| C5 | Berger Lab 3.2 reproduces every saved window and block summary of 3.0.1 on the reference recording | `tools/replay-berger-v3.mjs` (run locally) |

## Operator reports

| # | Report |
|---|---|
| O1 | First sessions (9 Oct): one frontal channel, concentrate vs rest in front of the bubble app; the bubbles reacted, and blinks and jaw movement were named as sources of variation |
| O2 | Two-channel Oz/Fpz sessions (28 Oct) were dominated by a ~33 Hz comb; moving the black lead from CN to A0N removed it |
| O3 | The completed Berger session (29 Oct) used Oz − left ear with REF behind the right ear, on battery, fresh pads |

## Hypotheses (not tested)

| # | Hypothesis | Test that would settle it |
|---|---|---|
| H1 | On a forehead channel, staring, frowning or clenching can look like “focus” (13–30 Hz overlaps muscle activity) | Frontal session with blink, jaw and frown controls, EMG share per block |
| H2 | The ~33 Hz comb comes from the shared-negative wiring | Controlled CN vs A0N sessions, same day, same pads |
| H3 | The eyes-closed alpha increase is larger at Oz than at Fpz | Oz vs Fpz protocol (planned) |

## Decisions

See `docs/decisions/`. Summary: browser persistence with chunk hashes (0001); analysis plan v3 frozen (0002); no build step (0003).

## Open questions

- What is REF electrically on this board (driven, bias, or reference)?
- What is the gain, so counts can be converted to microvolts?
- How often do silent firmware drops happen at 500 Hz with 1 and 6 channels?
- Where do the 100/150/200 Hz lines come from?
