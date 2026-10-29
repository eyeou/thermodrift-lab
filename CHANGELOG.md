# Changelog

## 0.1.0 — unreleased

First public candidate. Berger Lab rebuilt from the single-file Berger Lab 3.0.1 on shared modules. Code under the MIT licence.

### Berger Lab 3.2.0
- Same analysis plan as 3.0.1 (`berger-v3-filtered-primary`): filters, Welch settings, window rules and acceptance gates unchanged. On the reference recording, the port reproduces every saved window and block summary of 3.0.1.
- Sessions are saved continuously in the browser (IndexedDB, ≈1 s chunks, SHA-256 per chunk) instead of living only in memory until export.
- A tab that closes mid-session leaves an *interrupted* session with its data, detected through Web Locks.
- One export bundle (`.zip`): `raw.csv`, `windows.csv`, `metadata.json`, `manifest.json` with file hashes.
- Every disabled control shows why, beside itself.
- Setup locks at the first acquisition; *New session* keeps the device connected.
- Simulated source (`?source=simulated`) with silent cues and a short demo protocol, labelled everywhere.

### New
- Session report: reopens browser sessions, bundles and v3 file sets; post-hoc adherence annotations; timeline; integrity checks.
- Lab home with the session list and storage status.
- Design tokens (JSON → CSS / JS / Tailwind preset) with a contrast report, and a design catalogue.
- Tools: local server, privacy scan, v3 replay.
