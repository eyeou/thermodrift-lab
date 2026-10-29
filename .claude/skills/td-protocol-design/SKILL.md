---
name: td-protocol-design
description: Design a Thermodrift protocol (blocks, cues, gates, events, adherence) and its descriptive analysis. Use when planning a new experiment, changing block timing, or interpreting eyes-open/closed style results.
---

# Protocol, events and descriptive inference

## Before you start
Read `docs/PROTOCOLS.md`, `src/protocol/engine.js`, and the experiment note you are working from.

## Steps
1. Write the question, prediction and "inconclusive if…" before recording.
2. Labels are prompts. Keep observed state separate (adherence annotations, markers).
3. Balance order (e.g. pairs starting open vs closed); keep blocks long enough for ≥ 2 clean windows after the 3 s transition exclusion.
4. Use the existing gates: cue test, clean signal, storage preflight. Protocols start only from an operator click.
5. Report descriptively: per-block medians, per-pair ratios, counts of eligible pairs. No p-values for adjacent blocks of one session.

## Stop if
The design needs an outcome the system cannot observe (sleepiness, eye position) without saying so.

## Check
Controller flow test for the new protocol (`tests/controller.test.js` pattern); simulator run shows no effect (ratio ≈ 1).
