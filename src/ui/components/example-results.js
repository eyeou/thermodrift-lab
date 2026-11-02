/**
 * Example results for the Results tab: what a complete run can look like, before any recording.
 * Round figures inspired by real sessions, smoothed. They stay in this view: nothing here reaches a
 * session, the browser store or an export, and every chart carries an EXAMPLE mark.
 */
import { h } from '../dom.js';
import { theme } from '../../design/theme.js';

const C = theme.color;
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export const EXAMPLE_LABEL = 'Example results';
export const EXAMPLE_NOTE = 'Not a recording. Inspired by real data, smoothed and rounded.';

// ---------------------------------------------------------------- data
const PAIRS = [[1, 11, 64], [2, 10, 88], [3, 9.5, 92], [4, 9, 82]]
  .map(([pair, open, closed]) => ({ pair, open, closed, ratio: round(closed / open, 1) }));

export const BERGER_EXAMPLE = Object.freeze({
  kind: 'berger',
  pairs: PAIRS,
  higher_closed: PAIRS.filter((p) => p.closed > p.open).length,
  median_ratio: round(median(PAIRS.map((p) => p.ratio)), 1),
  reading: [
    'Alpha power is higher with the eyes closed in all 4 pairs.',
    'With the eyes closed the spectrum peaks near 11 Hz, inside the 8–13 Hz band. The rest of the spectrum barely moves.',
    'A rise limited to the alpha band is what a working recording chain should show. It says nothing about the person.',
  ],
});

/** Rests, then four rounds of deep breathing, each ending in a longer exhale hold. Seconds from the start. */
const PHASES = [
  { kind: 'rest', label: 'Rest', start: 0, end: 180, bpm: 70 },
  { kind: 'breathing', label: 'R1', start: 180, end: 320, bpm: 75 },
  { kind: 'hold', label: 'R1 hold', start: 320, end: 380, bpm: 65 },
  { kind: 'breathing', label: 'R2', start: 395, end: 535, bpm: 75 },
  { kind: 'hold', label: 'R2 hold', start: 535, end: 610, bpm: 65 },
  { kind: 'breathing', label: 'R3', start: 625, end: 765, bpm: 85 },
  { kind: 'hold', label: 'R3 hold', start: 765, end: 855, bpm: 75 },
  { kind: 'breathing', label: 'R4', start: 870, end: 1010, bpm: 90 },
  { kind: 'hold', label: 'R4 hold', start: 1010, end: 1115, bpm: 80 },
  { kind: 'rest', label: 'Rest', start: 1140, end: 1320, bpm: 75 },
];

const heartRate = () => {
  const out = [];
  let y = 70;
  for (let t = 0; t < 1320; t += 10) {
    const phase = PHASES.find((p) => t >= p.start && t < p.end);
    y += ((phase?.bpm ?? y) - y) * 0.28;
    out.push(round(y));
  }
  return out;
};

export const BREATHWORK_EXAMPLE = Object.freeze({
  kind: 'breathwork',
  step_s: 10,
  bpm: heartRate(),
  phases: PHASES,
  rest: [
    ['Heart rate, eyes closed (bpm)', '70', '75'],
    ['Heart rate, eyes open (bpm)', '70', '77'],
    ['RMSSD, eyes closed (ms)', '70', '35'],
    ['Alpha at Oz, eyes closed (count-equiv.²)', '110', '60'],
    ['Alpha at Oz, eyes open (count-equiv.²)', '10', '12'],
    ['Alpha, closed ÷ open', '11×', '5×'],
  ],
  /** Band power at Oz relative to the eyes-closed rest before. EEG is read in the rests and the holds. */
  eeg: {
    points: ['Rest before', 'Hold 1', 'Hold 2', 'Hold 3', 'Hold 4', 'Rest after'],
    theta: [1, 1.2, 1.3, 1.5, 2, 0.6],
    alpha: [1, 1.5, 1, 0.8, 0.7, 0.55],
  },
  rounds: [
    [1, '75 / 65', '1.5× / 0.9×', '1× / 1×'],
    [2, '75 / 65', '2× / 0.8×', '1.5× / 1×'],
    [3, '85 / 75', '2.5× / 0.7×', '1.5× / 1×'],
    [4, '90 / 80', '2.5× / 0.7×', '2× / 1×'],
  ],
  reading: [
    'At rest, alpha at Oz is many times higher with the eyes closed, before and after: the EEG channel can be read.',
    'Heart rate climbs across the rounds of deep breathing and drops in each hold.',
    'Muscle activity rises with the rounds, which is why EEG during deep breathing is left out.',
    'In the holds, theta at Oz builds up while alpha falls: the EEG slows. In a longer session it went much further. Slowing is the classic response to sustained high ventilation, which lowers CO₂ and brain blood flow. Without a CO₂ sensor this stays an interpretation.',
    'After the session, heart rate is higher and RMSSD and eyes-closed alpha are lower than before. One session describes this; it does not show the breathing caused it.',
  ],
  source_note: 'Heart rate and muscle activity come from the exported file, not the live view.',
});

// ---------------------------------------------------------------- charts, as SVG strings
const text = (x, y, value, { size = 13, fill = C.ink.muted, anchor = 'start', weight = 400 } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" font-family="${FONT}">${esc(value)}</text>`;
const mark = (W) => text(W - 8, 18, 'EXAMPLE', { size: 12, fill: C.data.sand, anchor: 'end', weight: 600 });
const svg = (W, H, label, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Example, not a recording. ${label}`)}"><title>${esc(`Example, not a recording. ${label}`)}</title>${body}${mark(W)}</svg>`;
const legendItem = (x, y, color, label) => `<rect x="${x}" y="${y - 10}" width="12" height="12" rx="2" fill="${color}"/>${text(x + 18, y, label, { fill: C.ink.primary })}`;

export function pairsSvg({ pairs, median_ratio }) {
  const W = 560, H = 300, L = 58, R = 12, T = 44, B = 40;
  const max = Math.max(...pairs.map((p) => p.closed)) * 1.2;
  const y = (v) => H - B - (v / max) * (H - T - B);
  const slot = (W - L - R) / pairs.length;
  const bw = Math.min(44, slot * 0.3);
  let body = legendItem(L, 20, C.data.periwinkle, 'Eyes open') + legendItem(L + 100, 20, C.data.rose, 'Eyes closed');
  for (const t of [0, 25, 50, 75, 100]) {
    body += `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="${C.surface.border}"/>${text(L - 8, y(t) + 4, t, { anchor: 'end' })}`;
  }
  body += `<text transform="translate(14 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle" font-size="13" fill="${C.ink.primary}" font-family="${FONT}">α power (count-equiv.²)</text>`;
  pairs.forEach((p, i) => {
    const cx = L + slot * (i + 0.5);
    body += `<rect x="${cx - bw - 2}" y="${y(p.open)}" width="${bw}" height="${H - B - y(p.open)}" fill="${C.data.periwinkle}"><title>Pair ${p.pair}, eyes open: ${p.open}</title></rect>`;
    body += `<rect x="${cx + 2}" y="${y(p.closed)}" width="${bw}" height="${H - B - y(p.closed)}" fill="${C.data.rose}"><title>Pair ${p.pair}, eyes closed: ${p.closed}</title></rect>`;
    body += text(cx, y(p.closed) - 6, `${p.ratio.toFixed(1)}×`, { anchor: 'middle', size: 14, weight: 600, fill: C.ink.primary });
    body += text(cx, H - B + 20, `Pair ${p.pair}`, { anchor: 'middle' });
  });
  return svg(W, H, `Alpha power per pair, higher with the eyes closed in every pair; median ratio ${median_ratio}×.`, body);
}

/** A spectrum sketch: slow background fall, and an alpha peak near 11 Hz when the eyes are closed. */
const spectrumAt = (f, closed) => 12 / (1 + f / 2.5) + (closed ? 16 : 1.2) * Math.exp(-((f - 10.8) ** 2) / (2 * 1.1 ** 2));

export function spectrumSvg() {
  const W = 560, H = 300, L = 58, R = 12, T = 44, B = 44;
  const fMax = 40, x = (f) => L + (f / fMax) * (W - L - R);
  const top = 20, y = (v) => H - B - (v / top) * (H - T - B);
  const line = (closed) => Array.from({ length: 79 }, (_, i) => 1 + i / 2).map((f, i) => `${i ? 'L' : 'M'}${round(x(f))} ${round(y(spectrumAt(f, closed)))}`).join('');
  let body = legendItem(L, 20, C.data.periwinkle, 'Eyes open') + legendItem(L + 100, 20, C.data.rose, 'Eyes closed');
  body += `<rect x="${x(8)}" y="${T}" width="${x(13) - x(8)}" height="${H - T - B}" fill="${C.data.sand}" fill-opacity="0.1"/>${text((x(8) + x(13)) / 2, T + 14, 'Alpha', { anchor: 'middle', fill: C.data.sand, size: 12 })}`;
  body += `<line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="${C.ink.muted}"/>`;
  for (const f of [0, 10, 20, 30, 40]) body += text(x(f), H - B + 20, f, { anchor: 'middle' });
  body += text((L + W - R) / 2, H - 6, 'Frequency (Hz)', { anchor: 'middle', fill: C.ink.primary });
  body += `<text transform="translate(14 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle" font-size="13" fill="${C.ink.primary}" font-family="${FONT}">Relative power</text>`;
  body += `<path d="${line(false)}" fill="none" stroke="${C.data.periwinkle}" stroke-width="2" stroke-linejoin="round"/><path d="${line(true)}" fill="none" stroke="${C.data.rose}" stroke-width="2" stroke-linejoin="round"/>`;
  return svg(W, H, 'Power spectrum with the eyes open and closed: with the eyes closed, a peak near 11 Hz inside the alpha band.', body);
}

export function heartRateSvg({ bpm, phases, step_s: step }) {
  const W = 860, H = 300, L = 52, R = 14, T = 62, B = 44;
  const total = bpm.length * step;
  const x = (s) => L + (s / total) * (W - L - R);
  const low = 50, high = 100;
  const y = (v) => H - B - ((v - low) / (high - low)) * (H - T - B);
  let body = legendItem(L, 20, `${C.data.periwinkle}55`, 'Deep breathing') + legendItem(L + 130, 20, `${C.data.sand}55`, 'Exhale hold');
  for (const p of phases) {
    if (p.kind !== 'rest') body += `<rect x="${round(x(p.start))}" y="${T}" width="${round(x(p.end) - x(p.start))}" height="${H - T - B}" fill="${p.kind === 'hold' ? C.data.sand : C.data.periwinkle}" fill-opacity="${p.kind === 'hold' ? 0.14 : 0.16}"/>`;
    if (p.kind !== 'hold') body += text(round((x(p.start) + x(p.end)) / 2), T - 8, p.label, { anchor: 'middle' });
  }
  for (const t of [60, 80, 100]) body += `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="${C.surface.border}"/>${text(L - 8, y(t) + 4, t, { anchor: 'end' })}`;
  body += `<text transform="translate(14 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle" font-size="13" fill="${C.ink.primary}" font-family="${FONT}">Heart rate (bpm)</text>`;
  body += `<line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" stroke="${C.ink.muted}"/>`;
  for (const m of [0, 5, 10, 15, 20]) body += text(round(x(m * 60)), H - B + 20, m, { anchor: 'middle' });
  body += text((L + W - R) / 2, H - 6, 'Minutes from the start', { anchor: 'middle', fill: C.ink.primary });
  const d = bpm.map((v, i) => `${i ? 'L' : 'M'}${round(x((i + 0.5) * step))} ${round(y(v))}`).join('');
  body += `<path d="${d}" fill="none" stroke="${C.data.rose}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  return svg(W, H, 'Heart rate across a session: higher in the deep breathing of later rounds, lower in each hold, and higher in the rest after than the rest before.', body);
}

/** Theta and alpha at Oz across the rests and holds, on a ratio axis around the rest before. */
export function slowingSvg({ eeg }) {
  const W = 560, H = 300, L = 58, R = 16, T = 44, B = 40;
  const slot = (W - L - R) / eeg.points.length;
  const x = (i) => L + slot * (i + 0.5);
  const low = Math.log2(0.5), high = Math.log2(3);
  const y = (v) => H - B - ((Math.log2(v) - low) / (high - low)) * (H - T - B);
  let body = legendItem(L, 20, C.data.rose, 'Theta 4–8 Hz') + legendItem(L + 124, 20, C.data.periwinkle, 'Alpha 8–13 Hz');
  for (const t of [0.5, 1, 2]) {
    body += `<line x1="${L}" x2="${W - R}" y1="${round(y(t))}" y2="${round(y(t))}" stroke="${t === 1 ? C.ink.muted : C.surface.border}"/>${text(L - 8, round(y(t)) + 4, `${t}×`, { anchor: 'end' })}`;
  }
  body += `<text transform="translate(14 ${(T + H - B) / 2}) rotate(-90)" text-anchor="middle" font-size="13" fill="${C.ink.primary}" font-family="${FONT}">Power at Oz (× rest before)</text>`;
  eeg.points.forEach((name, i) => {
    const [first, second] = name.split(' ');
    body += text(round(x(i)), H - B + 18, first, { anchor: 'middle', size: 12 }) + text(round(x(i)), H - B + 33, second, { anchor: 'middle', size: 12 });
  });
  for (const [key, label, color] of [['alpha', 'Alpha', C.data.periwinkle], ['theta', 'Theta', C.data.rose]]) {
    const d = eeg[key].map((v, i) => `${i ? 'L' : 'M'}${round(x(i))} ${round(y(v))}`).join('');
    body += `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;
    eeg[key].forEach((v, i) => { body += `<circle cx="${round(x(i))}" cy="${round(y(v))}" r="4" fill="${color}" stroke="${C.surface.base ?? '#070A22'}" stroke-width="2"><title>${label}, ${eeg.points[i].toLowerCase()}: ${v}×</title></circle>`; });
  }
  body += text(round(x(4)), round(y(eeg.theta[4])) - 10, `${eeg.theta[4]}×`, { anchor: 'middle', size: 14, weight: 600, fill: C.ink.primary });
  body += text(round(x(4)), round(y(eeg.alpha[4])) + 20, `${eeg.alpha[4]}×`, { anchor: 'middle', size: 14, weight: 600, fill: C.ink.primary });
  return svg(W, H, `Theta and alpha at Oz relative to the rest before: theta rises across the holds to ${eeg.theta[4]} times, alpha falls to ${eeg.alpha[4]} times.`, body);
}

// ---------------------------------------------------------------- view
const figure = (markup) => h('figure', { class: 'td-example-figure', html: markup });
const table = (caption, heads, rows) => h('div', { class: 'td-scroll-x' }, h('table', { class: 'td-table' },
  h('caption', { class: 'td-visually-hidden', text: caption }),
  h('thead', {}, h('tr', {}, ...heads.map((t, i) => h('th', { scope: 'col', class: i ? 'td-num' : '', text: t })))),
  h('tbody', {}, ...rows.map((row) => h('tr', {}, ...row.map((cell, i) => h('td', { class: i ? 'td-num' : '', text: String(cell) })))))));
const reading = (items) => [h('h3', { text: 'How to read it' }), h('ul', { class: 'td-example-reading' }, ...items.map((t) => h('li', { text: t })))];

/** The button offered where results would be. */
export const exampleButton = (onShow) => h('button', { class: 'td-btn td-example-show', type: 'button', onclick: onShow }, 'Show example results');

/** @returns {Node[]} the example, for the Results panel */
export function exampleView(example, { onHide }) {
  const head = h('div', { class: 'td-example-note', role: 'note' },
    h('strong', { text: EXAMPLE_LABEL }), h('span', { text: EXAMPLE_NOTE }),
    h('button', { class: 'td-btn', type: 'button', onclick: onHide }, 'Hide'));
  if (example.kind === 'berger') {
    return [head,
      h('p', { class: 'bl-results-reading' }, h('strong', { text: `${example.higher_closed} of ${example.pairs.length}` }), ' pairs have higher alpha with eyes closed · median ratio ', h('strong', { text: `${example.median_ratio.toFixed(1)}×` })),
      h('div', { class: 'td-example-pair' }, figure(pairsSvg(example)), figure(spectrumSvg())),
      table('Example: alpha per pair', ['Pair', 'Open α', 'Closed α', 'Closed / open'], example.pairs.map((p) => [`Pair ${p.pair}`, p.open, p.closed, `${p.ratio.toFixed(1)}×`])),
      ...reading(example.reading)];
  }
  return [head,
    figure(heartRateSvg(example)),
    h('div', { class: 'td-example-pair' },
      h('div', {}, h('h3', { text: 'The EEG slows in the holds' }), figure(slowingSvg(example)),
        h('p', { class: 'td-caption', text: 'EEG is read in the rests and the holds. During deep breathing, muscle activity dominates the scalp signal.' })),
      h('div', {}, h('h3', { text: 'Rest before and after' }), table('Example: rest before and after', ['Measure', 'Before', 'After'], example.rest),
        h('h3', { text: 'Round by round' }), table('Example: round by round, deep breathing / hold', ['Round', 'Heart rate', 'Beside the eyes', 'Shoulder'], example.rounds),
        h('p', { class: 'td-caption', text: 'Each cell: deep breathing / hold. Muscle activity is relative to the eyes-closed rest before.' }))),
    ...reading(example.reading),
    h('p', { class: 'td-caption', text: example.source_note })];
}
