---
name: td-dsp-checks
description: Change or verify signal processing in Thermodrift Lab (filters, Welch, band powers, window rules, analysis plans) with independent numerical checks. Use before touching src/core or src/analysis, or when numbers disagree.
---

# DSP and numerical checks

## Before you start
Read `docs/DSP_CONTRACT.md` and decision `docs/decisions/0002-analysis-plan-v3-frozen.md`.

## Steps
1. Published plans are frozen. A change in arithmetic, thresholds or window rules is a new plan id.
2. Write the test first with synthetic signals of known answer (`tests/synthetic.js`): tone frequency, Parseval, band edges, filter response, reset behaviour.
3. Coefficients must be re-derivable from their parameters (`tests/coefficients.test.js`).
4. For recordings, replay locally: `npm run replay:berger -- --source <dir> --stem <stem>`. Never copy private data into the repository.
5. Compare against an independent implementation (SciPy) when available; report the maximum difference.

## Stop if
A change would alter results of an existing plan, or a check passes only on real data you cannot share.

## Check
`npm test`; replay report with zero mismatches for unchanged plans.
