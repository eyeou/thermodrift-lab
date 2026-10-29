---
name: td-scientific-ui
description: Design or review Thermodrift Lab instrument screens and charts (tokens, states, chart grammar, accessibility). Use when adding a control, chart, status, report section or catalogue entry, or when a screen looks wrong.
---

# Scientific UI and charts

## Before you start
Read `docs/DESIGN_SYSTEM.md`; open `apps/catalog/` at http://127.0.0.1:8072/apps/catalog/ (`npm run serve`).

## Steps
1. Colours, type and spacing come from `src/design/tokens.json` only. Edit tokens, then `npm run tokens`.
2. Every control that can be blocked uses `actionButton` with a state from `src/lab/viewmodel.js` (`enabled`, `label`, `why`). Add the blocker to the view-model, with a unit test, not to the DOM code.
3. Charts use `src/ui/charts/canvas.js`: axis labels with units; `status` message instead of missing, stale or hidden data; `simulated: true` for any non-hardware data.
4. Name things by what they are: ADC counts, count-equivalent², PSD only for Welch density, "FFT magnitude" otherwise, prompted labels as prompts.
5. Add the new state to the catalogue.

## Stop if
A chart would need a unit you cannot state, or a control has no clear reason when blocked: resolve the meaning first.

## Check
`npm run check`; keyboard-only pass; `prefers-reduced-motion`; 375 px width; contrast report still 100 % pass.
