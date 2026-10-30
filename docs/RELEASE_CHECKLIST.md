# Release checklist

Nothing below happens without an explicit, named approval from the project owner.

## Decisions to take

- [x] Licence for the code: MIT (`LICENSE`; inventory in `LICENSING.md`).
- [x] Logo in the public repository: included, outside the code licence (`brand/NOTICE.md`).
- [x] Which aggregate results may be published: per-pair power, ratios, median and closed-eye peak range of the 29 October 2026 session (approved 30 October 2026). Raw recordings stay private.
- [x] Repository: `eyeou/thermodrift-lab`, created private, made public on 30 October 2026 with the owner's approval; app hosted at `app.thermodrift.com`.

## Gates (all must pass)

- [x] `npm run check` green: tokens in sync, tests, privacy scan.
- [x] `git status` shows only intended files; no recordings, archives, `tmp/`, `private/`, credentials, agent instruction files.
- [x] History contains no private material (new repository from a clean tree, not a copy of a working repository).
- [x] Quick start works from a fresh clone: `npm run serve`, simulated flow, export, reopen in the report.
- [x] Docs truthful: hardware matrix separates vendor facts, code findings and operator reports; limitations up to date.
- [x] Issue templates and CI present; CI runs `npm run check`.
- [x] The original Berger Lab 3.0.1 still runs from its own folder; its recordings untouched (hashes unchanged).
- [x] CHANGELOG entry and version bump.

## After publication

- [ ] Tag the release.
- [ ] Link from the Thermodrift website lab page.
