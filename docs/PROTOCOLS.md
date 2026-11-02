# Protocols and events

A protocol is a timed list of blocks. Each block has a label (the **prompt**), a duration, an on-screen instruction and an optional spoken cue. Labels are recorded on every raw row as they were prompted and never edited.

## Berger Effect protocols (`berger-protocol-3`, frozen)

| Protocol | Blocks | Duration |
|---|---|---|
| Relaxed baseline | `baseline_eyes_open` | 60 s |
| Blink / jaw controls | `rest_before`, `blinks`, `rest_between`, `jaw`, `rest_after` | 5 × 15 s |
| Long Berger test | `settling_eyes_open` 60 s → four pairs `eyes_open_pairN` / `eyes_closed_pairN` → `recovery_eyes_open` 20 s | 9 min 20 s with 60 s blocks |
| Flow demo (simulator only) | Same labels, 16 s eye blocks | 2 min 24 s |

- Eye-block length: 30, 45 or 60 s.
- Pair order is balanced: two pairs start eyes open, two eyes closed, shuffled with `crypto.getRandomValues`.
- Audio condition: `cues_only` (primary) or `external_audio` (exploratory, never pooled with the primary).
- The long test stops acquisition when it ends.

## Breathwork protocols (`breath-check-2`)

| Protocol | Blocks | Duration |
|---|---|---|
| Signal check | `still_open` 45 s → `still_closed` 45 s → `slow_breathing` 60 s → `shrugs` 15 s → `deep_breaths` 30 s → `exhale_hold` 15 s → `recovery` 30 s | 4 min |
| Rest before, rest after | `rest_*_open` 60 s → `rest_*_closed` 120 s | 3 min each |
| Flow demo (simulator only) | The signal-check blocks at 6 s each, silent | 42 s |

The guided session runs between the two rests, outside any protocol, with acquisition on. The operator marks it with keys while acquiring: V video start, B breathing, H hold, R recovery breath, M marker.

### Session formats

The Protocol tab offers two formats for the guided session. The rests and the signal check are the same in both.

| Format | `session_format` | The session | Length |
|---|---|---|---|
| Wim Hof-style | `wim-hof-style` | Four rounds of deep breathing, each followed by an exhale hold and a recovery breath | About 16 min |
| Holotropic-style | `holotropic-style` | About forty minutes of deep connected breathing to music, guided live; a closing sequence (fast breaths, an exhale hold, an inhale hold with a whole-body contraction, shaking); a long recovery lying still | About 65 min |

A format states the plan and nothing measures it. The lengths in the timeline are approximate because the guide sets the pace. The format is fixed with the rest of the setup when acquisition starts, and it changes neither the recording nor the analysis. In the long format V records `music start` and R records `recovery start`. Run the long format with a trained facilitator present.

These names describe the shape of a session only. This project has no link with the people or organisations behind either method.

## Session conditions

The Breathwork app's Setup records one condition per session. Its code goes in the file name and the metadata; `unset` adds nothing to the file name.

| Code | Condition |
|---|---|
| `check` | Signal check only, no guided session |
| `A` | Active breathwork: a guided session, following its breathing |
| `P` | The same guided audio, breathing normally |
| `M` | Meditation |
| `F` | Flat rest: quiet rest lying down, no guided session |
| `other` | Anything else, described in the notes |

## Written protocol

Each app has a `GUIDE` in `config.js`: the question, what you need, the steps of a whole session, one line per protocol, care and limits. The Protocol tab shows it beside the launchers. Its block tables come from `entry.create()`, so the table and the run cannot disagree, except for the order of a shuffled long test, which the tab says.

## Gates before a protocol starts

Connected device · running acquisition · no other protocol · storage room for the whole protocol. The Berger Effect app's long test also needs a heard cue test (speech mode) and a fresh 4-second window without clipping. Breathwork needs the heard cue test for every protocol on a board and never the clean-signal window. A blocked launcher shows the first unmet gate beside itself.

## Ending

| End | When | State |
|---|---|---|
| Complete | Last block ends | `completed` |
| Operator | *End protocol* | `aborted` |
| System | Acquisition stopped, device disconnected, stream stalled > 10 s, speech error, storage full | `interrupted` (never resumed: start a new protocol) |

A block whose cue failed is excluded by the system. Late timers (> 1 s), stale data (> 2 s) and a hidden page are recorded as block deviations.

## Adherence

Prompted ≠ observed. After a protocol, the operator marks each eye block *followed*, *missed / unsure → exclude* or leaves it *not confirmed*. Marks are annotations with their own sequence numbers; the latest one wins, a system exclusion always wins. The report can add marks later; they are appended, never overwrite.

## Event log

| Event | Meaning |
|---|---|
| `session_created`, `session_finished` | Session lifecycle |
| `device_connected`, `device_disconnected` | Transport |
| `acquisition_start`, `acquisition_stop`, `acquisition_start_failed` | Segments |
| `recording_flag` | A recording flagged as a test, or the flag removed |
| `counter_gap` | Inferred missing samples (analysis restarts) |
| `protocol_start`, `phase_<label>`, `protocol_end_<reason>`, `protocol_refused` | Protocol timeline |
| `speech_requested`, `speech_started`, `speech_ended`, `speech_error`, `cue_not_spoken` | What the browser speech engine reported |
| `cue_heard_confirmation` | Operator ticked “I heard it clearly” |
| `stream_stale`, `late_phase_timer`, `visibility_change` | Timing quality |
| `operator_marker` | Free-text marker with its block |
| `adherence_annotation` | Adherence mark (live or in review) |
| `display_processing_change` | View or notch changed |
| `storage_error`, `export_assembled`, `export_written`, `export_download_requested` | Storage and export |

Each event carries the sample index, `arrival_ms` and UTC time when it was logged.
