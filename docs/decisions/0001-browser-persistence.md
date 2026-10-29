# 0001 — Browser persistence

**Status**: accepted (0.1.0)

## Context

Berger Lab 3.0.1 kept the whole session in memory (up to 900,000 samples) until the operator exported three files. A closed tab, a crash or a forgotten export lost everything. Recordings are personal data and should not leave the computer by default.

## Decision

- Store every session in IndexedDB as it is recorded: raw rows in columnar chunks of about one second, each with a SHA-256; events, windows and annotations in their own stores; one transaction per flush.
- Hold a Web Lock per recording session. On load, a session still marked `recording` whose lock nobody holds is marked `interrupted` (data kept). Without Web Locks, a session is considered abandoned after 30 s without a flush.
- Export one stored zip (`raw.csv`, `windows.csv`, `metadata.json`, `manifest.json`), written in two streaming passes.
- Ask the browser for persistent storage at the first acquisition; report the answer, never assume it.
- If IndexedDB is unavailable, fall back to memory with a visible warning.

## Consequences

- Memory stays bounded; a crash loses at most the last second.
- Data live in one browser profile. Clearing site data deletes them; export remains the archive.
- Integrity is checkable at any time (chunk hashes, index order, sample counts).
