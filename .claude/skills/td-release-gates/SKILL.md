---
name: td-release-gates
description: Prepare a clean public release of Thermodrift Lab (sanitation, licence and asset inventory, privacy scan, release checklist). Use before creating a public repository, tagging a release or publishing website content that links to code.
---

# Release gates

## Before you start
Read `docs/RELEASE_CHECKLIST.md` and `LICENSING.md`. Publishing, pushing and repository creation need the owner's explicit, named approval.

## Steps
1. `npm run check` (includes `tools/privacy-scan.mjs`: personal paths, credentials, recordings, archives, fonts, oversized files, agent instruction files).
2. Inventory every asset and dependency with origin and licence; nothing from a source without a licence beyond facts.
3. Build the public repository from a clean tree, never by copying a working repository's history.
4. Quick start from a fresh clone; simulator flow; export; reopen in the report.
5. Record the approvals obtained (what, who, when) in the release notes.

## Stop if
Any gate fails, a licence is unknown, or approval is missing.

## Check
Release checklist fully ticked; privacy scan clean; CI green.
