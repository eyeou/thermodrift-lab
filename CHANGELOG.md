# Changelog

## 0.2.0 — 2026-11-02

### Breathwork 0.2.0 (new, `/breathwork/`)
- Up to six channels (ECG, EEG at Oz and Cz, EOG, neck and shoulder EMG) around a guided breathing session: a 4-min signal check, then identical 3-min rests before and after the session, which runs between them with acquisition on.
- Keyboard markers (V, B, H, R, M), a live channel picker with per-channel raw quality, per-block EEG summaries and a before → after table. Every device channel is exported raw.
- One export per recording. File names give the recording number, local start time, condition and a `-TEST` flag.

### Berger Effect 3.3.0
- Same analysis plan and measurements, with the tabs and Protocol view below.

### Shared
- Setup, Signal, Protocol, Results (and Recordings) are tabs, and a link can open on one (`breathwork/#protocol`). The block and time remaining stay visible on every tab during a protocol.
- Protocol tab: the whole session step by step, then one tab per timed protocol. Block tables are generated from the definitions the engine runs.
- Header: Thermodrift, the Lab mark, then the app's name. Dropdown arrows moved in from the border.
- Electrode placement figures (front, back, left side, top) drawn from the montage definitions, in the apps and the README, with a phone version of each plate. `npm run check` fails if they are stale, and a test holds marker positions and labels fixed.
- A Run panel sits beside the Signal and Protocol tabs: current block, protocol launchers and markers, so the signal stays in view while a protocol starts and runs. During a protocol the launchers are hidden and the current block comes first.
- Results can show labelled example results before a first run: what a complete run can look like, inspired by real data, smoothed and rounded. They never reach a session or an export.
- Session report and home list recordings per session. The report names the app of a session, shows its montage, analysis plan and EEG channel, and can export or flag each recording.
- Hosting: `/berger/`, `/report/` and `/catalog/` now serve their page.
- Export metadata: the analysis filter's `preset` reads `eeg`, and `hardware.reported_board` names the board only. Field names are unchanged.

## 0.1.0 — 2026-10-30

First public release: Berger Effect, session report, lab home, design tokens and catalogue, tools. Hosted at <https://app.thermodrift.com>; code under the MIT licence.
