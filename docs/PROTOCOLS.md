# Protocols and events

A protocol is a timed list of blocks. Each block has a label (the **prompt**), a duration, an on-screen instruction and an optional spoken cue. Labels are recorded on every raw row as they were prompted and never edited.

## Berger Lab protocols (`berger-protocol-3`, unchanged from 3.0.1)

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

## Gates before a protocol starts

Connected device · running acquisition · no other protocol · storage room for the whole protocol · for the long test: a heard cue test (speech mode) and a fresh 4-second window without clipping. A blocked launcher shows the first unmet gate beside itself.

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
