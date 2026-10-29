# Contributing

Thanks for looking. Issues with hardware reports, failed sessions or confusing screens are as useful as code.

## Ground rules

1. **Raw first.** Received samples are stored unaltered, with their arrival time and counter. Everything else (windows, results, annotations) is derived and stored separately.
2. **Honest units.** ADC counts stay counts. An FFT magnitude is not a PSD. A prompted eye state is not an observed one.
3. **No synthetic physiology in live paths.** Generated signals live in tests and in the labelled simulator only.
4. **Versioned analysis plans.** Changing any arithmetic, threshold or window rule means a new plan id (`berger-v4…`). Results from different plans are not pooled without re-analysis.
5. **A blocked control says why**, next to itself, and what to do next.
6. **No build step, no runtime dependencies** unless a concrete need is written down in `docs/decisions/`.
7. **Private data never enters the repo**: recordings, personal paths, credentials. `npm run check` includes a privacy scan.

## Development

```sh
npm run serve   # http://127.0.0.1:8072/apps/
npm test        # node:test, synthetic fixtures only
npm run tokens  # regenerate design outputs after editing src/design/tokens.json
npm run check   # tokens in sync + tests + privacy scan (what CI runs)
```

Real recordings can be checked locally with `npm run replay:berger -- --source <dir> --stem <stem>`; the tool reads them in place and never copies them.

## Pull requests

- One topic per PR, with tests for any change in `src/core`, `src/analysis`, `src/session` or `src/protocol`.
- Say what was tested on hardware, what was simulated and what was replayed.
- New app? Follow [`docs/NEW_APP_GUIDE.md`](docs/NEW_APP_GUIDE.md).
- UI change? Check keyboard use, focus, contrast and reduced motion in [`apps/catalog/`](apps/catalog/).
