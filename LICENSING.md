# Licensing

**Licence: MIT** ([`LICENSE`](LICENSE)) for everything written for this project. The Thermodrift name, logo and Lab mark are excluded ([`brand/NOTICE.md`](brand/NOTICE.md)).

## Inventory (what this tree contains)

| Item | Origin | Status |
|---|---|---|
| `src/`, `apps/`, `tools/`, `tests/`, except as listed below | Written for this project | MIT |
| `docs/img/placement-*.svg`, body and head drawings in `src/ui/components/placement.js` | Drawn for this project, generated from the montage definitions | MIT |
| Filter coefficients `EEG_BANDPASS_0_5_45`, harmonic notches | Standard Butterworth and second-order notch designs | Re-derived from their parameters in `tests/coefficients.test.js` |
| Coefficients `BUTTER2_HIGHPASS_0_1`, `BUTTER2_LOWPASS_90`, `BUTTER2_BANDSTOP_48_52` (the band-stop is the 50 Hz notch of the analysis plan; the others serve the Chords-reference view) | Order-2 Butterworth designs at 500 Hz: high-pass 0.1 Hz, low-pass 90 Hz, band-stop 48–52 Hz | Rounded to 8 decimals and re-derived in `tests/coefficients.test.js` |
| Chords-reference view (`chords` preset in `src/core/filters.js`, `src/core/display-reference.js`, `src/core/spectra.js`) | Reproduces the display settings of Chords-Web `a0a77f7` for comparison | Chords-Web has no licence file. No file was copied; the settings were reproduced from reading its source and have not been independently compared |
| `tests/helpers/butterworth.js` | The standard bilinear-transform Butterworth design, same method as SciPy's `butter` (SciPy is BSD-3) | Test helper; SciPy is not a dependency |
| Packet format, BLE UUIDs, `START`/`STOP` commands | Interoperability facts from vendor docs, firmware reading and Chords-Web's BLE parsing | No code copied from the GPL-3.0 firmware |
| `brand/thermodrift-logo.png` | Thermodrift | Thermodrift brand asset; not covered by the MIT licence |
| LAB letters in `src/ui/components/lab-mark.js` | Drawn for this project | Thermodrift brand asset; not covered by the MIT licence |
| Fonts | None bundled (system fonts and Georgia) | — |
| Runtime and dev dependencies | None (Node built-ins only) | — |
| Data | No recordings. Tests generate labelled synthetic signals | — |

## Upstream projects consulted (not included)

| Project | Revision | Licence | Used for |
|---|---|---|---|
| upsidedownlabs/Chords-Web | `a0a77f7` (2.7.1a) | No licence file | Reading its display chain and BLE parsing |
| upsidedownlabs/Chords-Arduino-Firmware | `57adf4d` | GPL-3.0 | Reading packet layout, sampling and drop behaviour |
| SciPy | 1.x docs | BSD-3 | Method reference for `butter`, `iirnotch` and `welch` |
