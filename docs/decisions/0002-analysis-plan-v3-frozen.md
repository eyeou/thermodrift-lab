# 0002 — Analysis plan v3 is frozen

**Status**: accepted (0.1.0)

## Context

A result means what its analysis plan says. Results must stay comparable across app versions, so shared code cannot change `berger-v3-filtered-primary`.

## Decision

- Freeze the plan: coefficients, operation order, Welch settings, window cadence, acceptance and rejection rules, eligibility.
- Checked by replay: every saved window of a recording is recomputed from raw samples, and window positions are re-derived from the recorded arrival stream (`tools/replay-berger-v3.mjs`).
- Any future change gets a new plan id; results of different plans are not pooled without re-analysis.

## Consequences

- Known limitations of the plan stay (window positions depend on Bluetooth cadence; uncalibrated count units; heuristic flags) and are documented rather than silently fixed.
- Improvements go into `berger-v4` with their own validation.
