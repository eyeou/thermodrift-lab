# Building a new instrument

Worked outline for a new acquisition app. Allow a day; most of it is the protocol and the analysis plan, not the UI.

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
  config.js    APP {id, name, version, analysisPlan}, MONTAGES, protocolEntries(), GUIDE, describe<Name>Session()
  main.js      compose LabController + view-model + charts (start from apps/berger/main.js)
  <name>.css   only what the shared instrument CSS lacks
```

Montage entries list every lead by **board pin**, site (10–20 name), cable colour, role and a one-line wiring check. `requiredChannels` gates invalid samples. The Setup figures come from the leads: a site the figures do not know fails `tests/placement.test.js`, so add it to `src/ui/components/placement.js`.

The page is tabs (`createTabs`): Setup, Signal, Protocol, Results. To add a figure to the README, add the montage to `tools/build-figures.mjs`.

## 4. Protocol

Define blocks in `src/protocol/<name>-protocol.js` (labels are prompts; durations; instruction; spoken text). Write the `GUIDE` in `config.js`: the Protocol tab shows it, and `tests/placement.test.js` checks that its steps point at real protocols and tabs. Reuse the gates: cue test for spoken protocols, clean-signal check, storage preflight. Document labels and events in `docs/PROTOCOLS.md`.

## 5. Report

Register the app in `apps/registry.js` (name, plan, montages, channel label, describe function, limitations, analysis channel, metric and eligibility text). The report looks a session's app up there. It must open sessions from the store, bundles and earlier file formats without any hardware import.

## 6. Tests and checks

- Controller flow with the fake transport and fake clock (see `tests/controller.test.js`): full protocol, gap, stall, disconnect, cue failure, quota.
- `npm run check` passes (tokens, figures, tests, privacy scan).
- Browser pass with `?source=simulated`: keyboard only, reduced motion, 375 px width, export, reopen in the report.
- Hardware pass only by an operator, on battery.

## 7. Add it to the home page and the host

One entry in `apps/home.js` with a link to open the app. Add the app to the redirects and rewrites in `vercel.json`, and its URLs to `tools/serve.mjs`.
