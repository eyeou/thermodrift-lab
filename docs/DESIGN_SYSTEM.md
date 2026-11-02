# Design system

Source of truth: `src/design/tokens.json`. `npm run tokens` generates `tokens.css` (`--td-*` variables), `theme.js` (charts), `tailwind-preset.cjs` (website) and `contrast-report.json`. `npm run check` fails if they are stale. Live reference: `apps/catalog/`.

## Identity

- **Logo**: `brand/thermodrift-logo.png`, aspect 1172 : 227, never recoloured or stretched; 176 px wide in app headers.
- **Lab mark**: the logo, a brass diamond, then LAB in drawn inline capitals (`src/ui/components/lab-mark.js`), with 24 px either side of the diamond. App headers read `Thermodrift ◆ LAB ◆ App name`.
- **Brand red `#B61E20`**: fills and labels with white text, primary buttons. Never text or thin lines on navy (contrast 2.97).
- **Rose `#E5606E`**: eyes-closed data and key numbers. **Periwinkle `#6F86F2`**: eyes-open data, traces and links.
- **Soft rose `#FA8B94`, soft periwinkle `#B6C2FF`**: the same two states in result charts, as on the website. Soft rose also carries the hero number. Live canvas charts keep the pair above.
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
| Schematics | Georgia labels, italic for names on the figure, a hard black shadow on large ones, and the key word in a tight red block. Labels never sit on a wire. Data charts keep sans labels. |

## Rules for instruments

1. **A blocked control says why**, beside itself, linked with `aria-describedby`.
2. **Status by shape, not only colour**: check (ready), dot (live), triangle (warning), cross (error), dashed ring (stale), hatch (simulated), ring (idle).
3. **Simulated is unmistakable**: hatched purple source chip in the header, `SIMULATED-` file names, watermark on every chart, and a plain note on a saved simulated session.
4. **Dropdown arrows sit inside the control**: 16 px from the right border, in muted ink, with room reserved so text never runs under them.
5. **Live numbers can hide during a protocol**, so the operator is not steered by them: on by default in Berger Effect, off by default in Breathwork.
5. **Prompted labels** are named as prompts (“Pair 2 · eyes closed”), never as observed states.

## Tabs

An instrument page is tabs: Setup, Signal, Protocol, Results, plus Recordings in Breathwork. The tab bar stays in view and shows the running block.

**Run panel.** Signal and Protocol share a panel at their side: current block, protocol launchers and markers. An operator about to start a protocol sees the signal and the launcher together. The panel is sticky, and stacks under the tab below 1100 px.

**Example results.** Results can show an example before any run, so a visitor sees the charts and the reading before having a board. Figures are round, inspired by real data and smoothed. A dashed note names it, every chart carries an EXAMPLE mark, and the panel kicker reads “Example · not a recording”. An example never reaches a session, the store or an export, closes when a protocol starts, and is not offered next to results from hardware.

## Anatomical illustration

Placement plates are instructions first: the anatomy says where an electrode goes and nothing else. One source, `src/ui/components/placement.js`, draws them as plain SVG for the apps, the README and the tests.

| Topic | Rule |
|---|---|
| Figure | A neutral, generic adult with natural proportions, in a calm pose: about 7.5 heads tall, slightly square shoulders, elbow at the waist. Restrained musculature; no likeness of a real person. |
| Face | Fine features. Eyes at half the head height, jaw angle at mouth level, a fine and slightly square lower face, a short neck-to-jaw shade. Short hair as a soft tone with a faint line along its edge, low on the forehead and coming down the temples to the ears, so the skull never reads as a bare dome. |
| Definition of form | The contour carries the jaw and cheek, helped by soft tonal planes. No interior jaw or cheek line on the front view: it reads as a wrinkle. |
| Definition | Draw a structure when it helps someone find a site: collarbone, ribs, neck muscle, shoulder blade. Leave out muscle separation that locates nothing. |
| Line hierarchy | Outer contour in ink at 82%, 1.6 px. Eyes, nose and mouth at about 65%, body detail at 30% or less, all at 1 px or finer. Body fill `#0E1433` on `#070A22`; shade and hair are `#070A22` at 50% or less. |
| Muscle in use | The recorded muscle takes a sand tint with a thin sand edge. Unused muscles stay hairlines. |
| Views | Same person, proportions and stroke on every view. Front: the person's right on picture-left. Back and top: the person's left on picture-left. Side: seen from the left. The back view has no chin or facial marks. |
| Side view | The skull is the sphere the 10–20 sites are computed on. Draw the face, jaw, neck and trunk around it; never reshape it above the nasion–inion line. |
| Markers | Radius 8, filled with the cable colour. Gold ring: cup with paste. White ring and centre dot: patch with a snap. Two leads on one site: stacked, one label. Markers sit above all anatomy. |
| Labels | Board pin first, bold; site below it, muted. Labels stay in the side columns, off the figure, with a 1 px leader to the marker. |
| Limits | Every figure carries “Illustration, not to scale. Board pins are authoritative; cable colours vary.” Plates never carry measured values. |
| Accessibility | Each plate has a title and label listing every pin and site. Pins are named in text, so identity never depends on colour. Plates stay at least 400 px wide. For phones, the compact plate keeps every marker position, drops the site text, enlarges pins and markers, and sits with a table listing each pin and site. |

`tests/placement.test.js` freezes every marker position, colour and label against `tests/helpers/placement-golden.json`, so redrawing anatomy cannot move a site unnoticed. After changing a drawing, run `npm run figures` and review the plates. Update the frozen file (`UPDATE_PLACEMENT_GOLDEN=1 npm test`) only for a reviewed change of site or label.

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

**Result charts** (`src/ui/charts/report.js`) use the report grammar: a card on the navy page, a Georgia heading that states the finding, one hero ratio with its definition, sans labels, a horizontal grid only, block shading at 7.5%, points joined by thin lines. Text keeps its size on a phone because a chart is drawn at the real width of its card. In a session the heading is computed from the results, so it never says more than they show; only an example may state its finding in words.

## Accessibility

Contrast pairs are checked automatically (44 of 44 pass), including the data colours and brass where they are used as text. Focus ring `#F2F2F2`, 2 px offset. Charts carry an `aria-label` describing what they show; tables have scoped headers. Motion is decorative and stops under `prefers-reduced-motion`; live charts redraw at most four times a second.
