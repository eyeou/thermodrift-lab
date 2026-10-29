# Building the next instrument

Worked outline for the planned **Oz and Fpz alpha comparison** (two channels against a common negative, CN switch on). Allow a day; most of it is the protocol and the analysis plan, not the UI.

## 1. Write the question first

One paragraph in `docs/experiments/<slug>.md`: what you expect, what would make the result inconclusive, the montage, the protocol, the primary metric. Decide this before recording.

## 2. Analysis plan

- Reuse `berger-v3` when the arithmetic is the same. `BergerV3WindowEngine({ mode: 'shared' })` already analyses channels 1 and 2 (and, when explicitly enabled, the software difference channel 2 − channel 1, labelled as derived).
- Anything different (bands, windows, gates, a new contrast) is a **new plan** in `src/analysis/<plan>.js` with its own id, constants object and `blockSummary`/results functions. Never edit a published plan.
- Test it on synthetic fixtures (`tests/synthetic.js`): tones of known power per channel, gaps, clipping, resets.

## 3. App folder

```
apps/<name>/
  index.html   copy from apps/berger, change the title
  config.js    APP {id, name, version, analysisPlan}, MONTAGES, protocolEntries(), describe<Name>Session()
  main.js      compose LabController + view-model + charts (start from apps/berger/main.js)
  <name>.css   only what the shared instrument CSS lacks
```

Montage entries list every lead by **board pin**, site (10–20 name), cable colour, role and a one-line wiring check. `requiredChannels` gates invalid samples.

## 4. Protocol

Define blocks in `src/protocol/<name>-protocol.js` (labels are prompts; durations; instruction; spoken text). Reuse the gates: cue test for spoken protocols, clean-signal check, storage preflight. Document labels and events in `docs/PROTOCOLS.md`.

## 5. Report

Register the app in `apps/report/main.js` (montages, describe function, results renderer). The report must open sessions from the store, bundles and earlier file formats without any hardware import.

## 6. Tests and checks

- Controller flow with the fake transport and fake clock (see `tests/controller.test.js`): full protocol, gap, stall, disconnect, cue failure, quota.
- `npm run check` passes (tokens, tests, privacy scan).
- Browser pass with `?source=simulated`: keyboard only, reduced motion, 375 px width, export, reopen in the report.
- Hardware pass only by an operator, on battery.

## 7. Add it to the home page

One entry in `apps/home.js` with a hardware link and a simulator link.
