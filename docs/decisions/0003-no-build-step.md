# 0003 — No build step

**Status**: accepted (0.1.0)

## Context

The instruments must stay inspectable and runnable for years by one person, offline, on any machine with a browser.

## Decision

Plain ES modules and CSS served as files. No bundler, framework or runtime dependency. Node is used only for the local server, token generation and tests (built-in `node:test`). The website, a separate project, consumes the generated Tailwind preset.

## Consequences

- `view-source` shows exactly what runs. Tests import the same modules as the apps.
- Some conveniences (JSX, TypeScript checking, minification) are not available; JSDoc types document the interfaces instead.
- Adding a dependency requires a decision record.
