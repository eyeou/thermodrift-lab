# Session format

Schema ids: session `thermodrift.session/1`, bundle `thermodrift.bundle/1`.

## In the browser (IndexedDB `thermodrift-lab`, version 1)

| Object store | Key | Content |
|---|---|---|
| `sessions` | `id` | One record per session (below) |
| `chunks` | `[session_id, seq]` | Raw rows, ≈1 s per chunk, columnar |
| `events` | `[session_id, seq]` | Immutable log entries |
| `windows` | `[session_id, seq]` | Analysis windows |
| `annotations` | `[session_id, seq]` | Adherence and other post-hoc annotations |

Each flush writes one chunk plus pending events, windows, annotations and the session record in a single transaction. The session record doubles as a heartbeat (`last_flush_utc`).

**Session record**: `schema`, `id`, `app`, `app_version`, `analysis_plan`, `created_utc`, `session_start_epoch_ms`, `status` (`recording` · `closed` · `interrupted`), `source` (`kind`: `ble` or `simulated`, transport, device name, firmware `unknown`), `montage`, `channel_names`, `channel_count`, `setup`, `segments[]`, `health` (samples, gaps, duplicates, bad packets, invalid samples, layout errors), `protocols[]`, `blocks[]`, `counts`, `persistence`, and when relevant `closed_utc`, `close_reason`, `recovered_utc`, `last_review_utc`.

**Chunk**: `seq`, `count`, `first_index`, `last_index`, `channel_count`, `phase_table` (labels), `columns` — `index` Int32, `arrival_ms` Float64, `counter` Uint8, `channels` Uint16 (interleaved), `protocol_id` Uint16, `block_id` Uint32, `phase_code` Uint16 — and `sha256` over the column bytes in that order followed by the JSON phase table.

Times: `arrival_ms` is milliseconds since the session start on the browser's monotonic clock, read when the notification arrived. All rows of one notification share it.

## Exported bundle (`.zip`, stored, no compression)

File name `[SIMULATED-]<app>-<session id>.zip`, one folder of the same stem:

| File | Content |
|---|---|
| `raw.csv` | `sample_index, nominal_seconds_500hz, arrival_ms, counter, phase, protocol_id, block_id, ch1_adc … chN_adc` — every received sample, unaltered |
| `windows.csv` | One row per analysis window and channel: positions, prompted phase, ids, `accepted_for_block_before_quality`, raw metrics, band powers, `alpha_filtered_8_13_counts2`, `reject_flags`, `warnings` |
| `metadata.json` | Setup, montage and leads, source, hardware unknowns, units, method, analysis and display processing with coefficients, protocols, block summaries per channel, results, limitations, events, annotations, segments, integrity |
| `manifest.json` | Size and SHA-256 of each file, integrity at export (chunk hashes, index order, unsaved samples), export method |

`raw.csv` is written in two streaming passes over stored chunks, so export memory does not grow with session length. Rows still in memory when storage failed are included and counted as `unsaved_samples`.

## Compatibility

- Berger Lab 3.0.1 exports (three loose files) open in the report; `tools/replay-berger-v3.mjs` replays them.
- `windows.csv` keeps the v3 columns. `metadata.json` is a superset of v3 metadata.
