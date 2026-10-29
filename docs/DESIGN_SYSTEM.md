# Design system

Source of truth: `src/design/tokens.json`. `npm run tokens` generates `tokens.css` (`--td-*` variables), `theme.js` (charts), `tailwind-preset.cjs` (website) and `contrast-report.json`. `npm run check` fails if they are stale. Live reference: `apps/catalog/`.

## Identity

- **Logo**: `brand/thermodrift-logo.png`, aspect 1172 : 227, never recoloured or stretched; 176 px wide in app headers.
- **Brand red `#B61E20`**: fills and labels with white text, primary buttons. Never text or thin lines on navy (contrast 2.97).
- **Rose `#E5606E`**: eyes-closed data and key numbers. **Periwinkle `#6F86F2`**: eyes-open data, traces and links. This pair passes the dark-mode palette checks on the panel colour (lightness band, chroma, colour-blind separation ΔE 20); the earlier pastels `#FA8B94` / `#B6C2FF` were too light and read as grey. The website's charts use the same pair.
- Navy surfaces (`#070A22` base), square corners, 8 px rhythm, hard black shadows on titles.
- Type: Georgia for titles and story, system sans for interface, tabular numerals for numbers, monospace for ids and hashes. No font files are bundled.

## Editorial layer: Art Deco, Parisian

Thermodrift's brand is slightly Art Deco and slightly Parisian. That taste lives on editorial surfaces: the website, report covers, figures and posts. Instruments stay sober: data and status first.

| Element | Use |
|---|---|
| **Brass `#C9A86A`** | Hairlines, double-rule frames with stepped corners, kickers, numerals. Never data or status. |
| **Ivory `#F3EADB`** | Passe-partout mat behind photographs and screenshots, with a thin brass rule inside. |
| Kickers | Small capitals with wide tracking (the website uses Josefin Sans, loaded there only; apps keep system fonts). |
| Numbering | `Nº 01` for experiments; Roman numerals in Georgia for sections, notes and plates; `Fig. 1` for figures. |
| Quotation | Questions in guillemets « ». |
| Ornament | One sunburst per page at most (hero), a diamond-and-fan rule between parts. Drawn in SVG, still under reduced motion. |
| Illustrations | Labelled "Illustration" and never carry measured values. |

## Rules for instruments

1. **A blocked control says why**, beside itself, linked with `aria-describedby`.
2. **Status by shape, not only colour**: check (ready), dot (live), triangle (warning), cross (error), dashed ring (stale), hatch (simulated), ring (idle).
3. **Simulated is unmistakable**: hatched banner, purple source chip, `SIMULATED-` file names, watermark on every chart.
4. **Live numbers hide during a protocol** by default, so the operator is not steered by them.
5. **Prompted labels** are named as prompts (“Pair 2 · eyes closed”), never as observed states.

## Chart grammar

| Rule | Why |
|---|---|
| Every axis has a label with its unit | Counts, count-equivalent² and dB are different things |
| PSD only for density-scaled Welch output; otherwise “FFT magnitude” | They differ in scale and meaning |
| Gaps are never bridged; missing, stale or hidden data show a message in the plot | No invented continuity |
| Same quantity, same axis | Open and closed bars share one scale |
| Not-eligible values are drawn hatched and grey, with the reason | Visible but not mistaken for results |
| Legends and the simulated label sit above the plot | Never over data |
| 50 Hz multiples dashed on spectra | Mains is the first suspect |

## Accessibility

Contrast pairs are checked automatically (36 of 36 pass), including the data colours and brass where they are used as text. Focus ring `#F2F2F2`, 2 px offset. Charts carry an `aria-label` describing what they show; tables have scoped headers. Motion is decorative and stops under `prefers-reduced-motion`; live charts redraw at most four times a second.
