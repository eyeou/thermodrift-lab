# Release checklist

Nothing below happens without an explicit, named approval from the project owner.

## Decisions to take

- [x] Licence for the code: MIT (`LICENSE`; inventory in `LICENSING.md`).
- [x] Logo in the public repository: included, outside the code licence (`brand/NOTICE.md`).
- [ ] Which aggregate results may be published (for example a median ratio), and with which caveats. Raw recordings stay private by default.
- [x] Repository: `eyeou/thermodrift-lab`, created private; made public only with a separate approval.

## Gates (all must pass)

- [ ] `npm run check` green: tokens in sync, tests, privacy scan.
- [ ] `git status` shows only intended files; no recordings, archives, `tmp/`, `private/`, credentials, agent instruction files.
- [ ] History contains no private material (new repository from a clean tree, not a copy of a working repository).
- [ ] Quick start works from a fresh clone: `npm run serve`, simulated flow, export, reopen in the report.
- [ ] Docs truthful: hardware matrix separates vendor facts, code findings and operator reports; limitations up to date.
- [ ] Issue templates and CI present; CI runs `npm run check`.
- [ ] The original Berger Lab 3.0.1 still runs from its own folder; its recordings untouched (hashes unchanged).
- [ ] CHANGELOG entry and version bump.

## After publication

- [ ] Tag the release.
- [ ] Link from the Thermodrift website lab page.
