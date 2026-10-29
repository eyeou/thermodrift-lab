# 0002 — Analysis plan v3 is frozen

**Status**: accepted (0.1.0)

## Context

The 29 October 2026 session was analysed with Berger Lab 3.0.1 (`berger-v3-filtered-primary`). The port to shared modules must not change what a "result" means.

## Decision

- Extract the v3 arithmetic without changes: coefficients, operation order, Welch settings, window cadence, acceptance and rejection rules, eligibility.
- Prove it by replay: every saved window of the reference recording recomputed from raw samples, plus a live re-derivation of window positions from the recorded arrival stream (`tools/replay-berger-v3.mjs`).
- Any future change gets a new plan id; results of different plans are not pooled without re-analysis.

## Consequences

- Known v3 limitations stay (window positions depend on Bluetooth cadence; uncalibrated count units; heuristic flags) and are documented rather than silently fixed.
- Improvements go into `berger-v4` with their own validation.
