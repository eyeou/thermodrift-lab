# Source register

| Source | Revision / accessed | Supports | What was inspected | Licence | Limits |
|---|---|---|---|---|---|
| [NPG Lite hardware docs](https://docs.upsidedownlabs.tech/hardware/bioamp/neuro-play-ground-lite/index.html) | Oct 2026 | V1 | Specs page | — | No gain, filters or sample rate stated |
| [NPG Lite Beast kit docs](https://docs.upsidedownlabs.tech/kits/npg-lite-kits/npg-lite-beast/index.html) | Oct 2026 | V2, V3 | CN switch, EEG placement | — | REF role not described |
| [EEG recording quality guide](https://docs.upsidedownlabs.tech/guides/troubleshoot/recording_quality_eeg/index.html) | Oct 2026 | Troubleshooting | Guide | — | Generic advice |
| [Chords-Web](https://github.com/upsidedownlabs/Chords-Web) | `a0a77f7` (2.7.1a) | C2, C4 | `filters.tsx`, BLE parsing, FFT display | No licence file in snapshot | Read only; no code copied |
| [Chords-Arduino-Firmware](https://github.com/upsidedownlabs/Chords-Arduino-Firmware) | `57adf4d` | C1, V4, packet format | `NPG-LITE-BLE.ino` | GPL-3.0 | Installed firmware on the board not verified |
| [Chords-Python](https://github.com/upsidedownlabs/Chords-Python) | `5f36655` | — | Inventoried | MIT | Not used |
| [SciPy signal](https://docs.scipy.org/doc/scipy/reference/signal.html) | 1.x docs | Filter designs, Welch | `butter`, `iirnotch`, `welch` | BSD-3 | Used as the reference for independent checks |
| Berger, H. (1929). Über das Elektrenkephalogramm des Menschen. *Archiv für Psychiatrie und Nervenkrankheiten*, 87, 527–570 | — | The eyes-closed alpha effect | Citation | — | Historical; not a method reference |
