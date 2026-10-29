---
name: td-acquisition-quality
description: Diagnose signal quality in a Thermodrift session (clipping, flat signal, mains, EMG share, gaps, stale stream, segments). Use when a session looks noisy, results are inconclusive, or before trusting a recording.
---

# Acquisition and quality diagnosis

## Before you start
Open the session in the report (`apps/report/`) and read its Blocks, Integrity and Events sections. Read `docs/DSP_CONTRACT.md` for flag definitions.

## Steps
1. Integrity first: chunk hashes, index order, sample counts; segments and counter gaps.
2. Raw before filtered: switch the live view to "Raw ADC + Welch PSD". Clipping and mains are visible there; filtering cannot repair clipping.
3. Read the flags per window: rejected (clipping, flat, filter start, recent rail) vs warnings (50 Hz, high-frequency, 150 Hz).
4. Correlate with events: markers, stale stream, hidden page, late timers.
5. Write findings as operator report vs measured number vs hypothesis.

## Stop if
The question needs microvolts, impedance or eye tracking: the system does not measure them.

## Check
Every claim cites a session id and a window, block or event.
