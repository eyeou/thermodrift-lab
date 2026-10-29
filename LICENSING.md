# Licensing

**Licence: MIT** ([`LICENSE`](LICENSE)) for everything written for this project. The Thermodrift name and logo are excluded ([`brand/NOTICE.md`](brand/NOTICE.md)).

## Inventory (what this tree contains)

| Item | Origin | Status |
|---|---|---|
| `src/`, `apps/`, `tools/`, `tests/` | Written for this project | MIT |
| Filter coefficients `EEG_BANDPASS_0_5_45`, harmonic notches | Standard Butterworth and second-order notch designs | Re-derived from their parameters in `tests/coefficients.test.js` |
| Coefficients `CHORDS_SNAPSHOT_*` (50 Hz notch used by the analysis plan; high/low-pass by the Chords view) | Values as found in Chords-Web `a0a77f7`; **no code copied** | They are 8-decimal roundings of textbook Butterworth designs (band-stop 48–52 Hz, high-pass 0.1 Hz, low-pass 90 Hz, order 2, 500 Hz), re-derived in `tests/coefficients.test.js`. The upstream snapshot has no licence file, which is why nothing else from it is included |
| Packet format, BLE UUIDs, `START`/`STOP` commands | Interoperability facts from vendor docs and firmware reading | No code copied from the GPL-3.0 firmware |
| `brand/thermodrift-logo.png` | Thermodrift | Trademark; included, not covered by the MIT licence |
| Fonts | None bundled (system fonts and Georgia) | — |
| Runtime and dev dependencies | None (Node built-ins only) | — |
| Data | No recordings. Tests generate labelled synthetic signals | — |

## Upstream projects consulted (not included)

| Project | Revision | Licence | Used for |
|---|---|---|---|
| upsidedownlabs/Chords-Web | `a0a77f7` (2.7.1a) | none found in snapshot | Reading the reference display chain |
| upsidedownlabs/Chords-Arduino-Firmware | `57adf4d` | GPL-3.0 | Reading packet layout, sampling and drop behaviour |
| upsidedownlabs/Chords-Python | `5f36655` | MIT | Inventoried only; not used by the code |
| upsidedownlabs/NPG-Lite firmware and flashers | `166f415` and current | GPL-3.0 | Not used by the apps; never flashed |
