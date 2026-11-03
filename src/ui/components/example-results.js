/**
 * Example results for the Results tab: what a complete run can look like, before any recording.
 * Round figures inspired by real experimental data. They stay in this view: nothing here reaches a
 * session, the browser store or an export, and every chart carries an EXAMPLE mark.
 */
import { h } from '../dom.js';
import { CARD, EYES_CLOSED, EYES_OPEN, INK, MUTED, SAND, gridLine, isNarrow, legend, pairsChart, pathOf, reportCard, restChart, restFinding, restHero, round, sizeFor, spanLabels, svgChart, text, timeCourseChart, xLabels, yGrid } from '../charts/report.js';

const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export const EXAMPLE_LABEL = 'Example results';
export const EXAMPLE_NOTE = 'Not a recording. Inspired from real experimental data.';

// ---------------------------------------------------------------- Berger Effect data
const PAIRS = [[1, 11, 64], [2, 10, 88], [3, 9.5, 92], [4, 9, 82]]
  .map(([pair, open, closed]) => ({ pair, open, closed, status: 'eligible', ratio: round(closed / open, 1) }));

/** A nine-minute test: settling, four prompted pairs in a balanced order, recovery. One point per window. */
function bergerTimeCourse() {
  const blockMs = 60000, settle = { label: 'settling_eyes_open', start_arrival_ms: 0, end_arrival_ms: blockMs };
  const order = [['open', 'closed'], ['closed', 'open'], ['closed', 'open'], ['open', 'closed']];
  const blocks = [settle];
  order.forEach((states, i) => states.forEach((state) => {
    const start = blocks.at(-1).end_arrival_ms;
    blocks.push({ label: `eyes_${state}_pair${i + 1}`, start_arrival_ms: start, end_arrival_ms: start + blockMs });
  }));
  const last = blocks.at(-1).end_arrival_ms;
  blocks.push({ label: 'recovery_eyes_open', start_arrival_ms: last, end_arrival_ms: last + 20000 });
  const windows = [];
  blocks.forEach((block, b) => {
    const match = /^eyes_(open|closed)_pair(\d)$/.exec(block.label);
    const level = match ? PAIRS[Number(match[2]) - 1][match[1]] : 12;
    const state = match ? match[1] : 'other';
    const swing = Array.from({ length: Math.floor((block.end_arrival_ms - block.start_arrival_ms - 7000) / 4500) }, (_, k) => 1 + 0.05 * Math.sin(0.6 * k + 0.9 * b));
    const centre = median(swing);
    swing.forEach((s, k) => windows.push({ mid_ms: block.start_arrival_ms + 7000 + k * 4500, value: round((level * s) / centre, 1), state, good: true }));
  });
  return { blocks, windows, origin: 0 };
}

export const BERGER_EXAMPLE = Object.freeze({
  kind: 'berger',
  pairs: PAIRS,
  higher_closed: PAIRS.filter((p) => p.closed > p.open).length,
  median_ratio: round(median(PAIRS.map((p) => p.ratio)), 1),
  time_course: bergerTimeCourse(),
  reading: [
    'Alpha power is higher with the eyes closed in all 4 pairs.',
    'With the eyes closed the spectrum peaks near 11 Hz, inside the 8–13 Hz band. The rest of the spectrum barely moves.',
    'A rise limited to the alpha band is what a working recording chain should show. It says nothing about the person.',
  ],
});

// ---------------------------------------------------------------- Breathwork data
/** Rests, then four rounds of deep breathing, each ending in a longer exhale hold. Seconds from the start. */
const PHASES = [
  { kind: 'rest', label: 'Rest', start: 0, end: 180, bpm: 70 },
  { kind: 'breathing', label: 'R1', name: 'Round 1', start: 180, end: 320, bpm: 75 },
  { kind: 'hold', label: 'R1 hold', start: 320, end: 380, bpm: 65 },
  { kind: 'breathing', label: 'R2', name: 'Round 2', start: 395, end: 535, bpm: 75 },
  { kind: 'hold', label: 'R2 hold', start: 535, end: 610, bpm: 65 },
  { kind: 'breathing', label: 'R3', name: 'Round 3', start: 625, end: 765, bpm: 85 },
  { kind: 'hold', label: 'R3 hold', start: 765, end: 855, bpm: 75 },
  { kind: 'breathing', label: 'R4', name: 'Round 4', start: 870, end: 1010, bpm: 90 },
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
    ['Alpha, closed / open', '11×', '5×'],
  ],
  /** The two alpha rows above, as the rest chart reads them. */
  rest_alpha: [
    { state: 'open', status: 'eligible', before: { alpha: 10 }, after: { alpha: 12 }, alpha_ratio_after_before: 1.2 },
    { state: 'closed', status: 'eligible', before: { alpha: 110 }, after: { alpha: 60 }, alpha_ratio_after_before: 0.55 },
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
    'Muscle activity rises with the rounds, which is why EEG during the deep breaths is left out.',
    'In the holds, theta at Oz builds up while alpha falls: the EEG slows. In a longer session it went much further. Slowing is the classic response to sustained high ventilation, which lowers CO₂ and brain blood flow. Without a CO₂ sensor this stays an interpretation.',
    'After the session, heart rate is higher and RMSSD and eyes-closed alpha are lower than before. One session describes this; it does not show the breathing caused it.',
  ],
  source_note: 'Heart rate and muscle activity come from the exported file, not the live view.',
});

// ---------------------------------------------------------------- Breathwork data, long format
const LONG_STEP_MIN = 0.5;
/** Minutes from the start of the rest before. */
const LONG_PHASES = [
  { kind: 'rest', names: ['Rest'], start: 0, end: 3 },
  { kind: 'breathing', names: ['Deep connected breathing', 'Breathing'], start: 3, end: 43 },
  { kind: 'closing', names: ['Closing sequence', 'Closing'], start: 43, end: 47 },
  { kind: 'recovery', names: ['Long recovery', 'Recovery'], start: 47, end: 63 },
  { kind: 'rest', names: ['Rest'], start: 63, end: 66 },
];

/** Knots joined by straight lines, on a log scale for a ratio, then a five-point moving average. */
function longSeries(knots, { ratio = false } = {}) {
  const at = (t) => {
    const i = knots.findIndex(([x]) => x >= t);
    if (i <= 0) return knots[0][1];
    const [x0, y0] = knots[i - 1], [x1, y1] = knots[i];
    const f = (t - x0) / (x1 - x0);
    return ratio ? y0 * (y1 / y0) ** f : y0 + f * (y1 - y0);
  };
  const raw = Array.from({ length: LONG_PHASES.at(-1).end / LONG_STEP_MIN + 1 }, (_, i) => at(i * LONG_STEP_MIN));
  return raw.map((_, i) => {
    const near = raw.slice(Math.max(0, i - 2), i + 3);
    return round(near.reduce((sum, v) => sum + v, 0) / near.length, 3);
  });
}

export const BREATHWORK_LONG_EXAMPLE = Object.freeze({
  kind: 'breathwork-long',
  step_min: LONG_STEP_MIN,
  phases: LONG_PHASES,
  breathing: longSeries([[0, 1], [3, 1], [6, 4], [43, 4.5], [43.5, 6.5], [44.5, 6.5], [45.5, 0.5], [46.5, 0.5], [47, 2], [50, 1], [66, 1]]),
  heart: longSeries([[0, 65], [3, 65], [8, 90], [43, 95], [44.5, 110], [46, 95], [47, 100], [52, 72], [66, 70]]),
  theta: longSeries([[0, 1], [9, 1], [28, 8], [47, 8], [58, 1.5], [66, 1.2]], { ratio: true }),
  alpha: longSeries([[0, 1], [6, 1], [28, 0.4], [47, 0.4], [58, 0.7], [66, 0.7]], { ratio: true }),
  theta_plateau: 8,
  alpha_plateau: 0.4,
  reading: [
    'Breathing depth × rate rises about fourfold within minutes and stays there for the forty minutes of connected breathing. Heart rate climbs with it.',
    'Theta at Oz stays flat for the first minutes, then climbs to about 8× the rest before and stays up until the recovery. Alpha falls over the same stretch.',
    'Why theta rises: sustained high ventilation lowers CO₂ and brain blood flow, which slows the EEG. Without a CO₂ sensor this stays an interpretation.',
    'In the long recovery breathing and heart rate settle within minutes. Theta comes down more slowly and alpha stays below its starting level.',
    'Muscle activity mostly sits above about 20 Hz, so theta and alpha can still be followed during the breathing, with more care than in the rests. One session describes this; it does not show the breathing caused it.',
  ],
  source_note: 'These traces come from analysing the exported file, not from the live view. No sensor measures breathing here, so depth × rate is an estimate.',
});

/** The example of each session format, under the Breathwork app's format ids. */
export const BREATHWORK_EXAMPLES = Object.freeze({ 'wim-hof-style': BREATHWORK_EXAMPLE, 'holotropic-style': BREATHWORK_LONG_EXAMPLE });

// ---------------------------------------------------------------- charts
export const timeCourseSvg = ({ time_course: course }, { width = 1040 } = {}) => timeCourseChart({ ...course, width, mark: 'example', tooltips: false });
export const pairsSvg = ({ pairs }, { width = 520 } = {}) => pairsChart({ pairs, width, mark: 'example', digits: 1, valueText: String });
export const restSvg = ({ rest_alpha: rows }, { width = 520 } = {}) => restChart({ rows, width, mark: 'example', valueText: String });

/** A spectrum sketch: slow background fall, and an alpha peak near 11 Hz when the eyes are closed. */
const spectrumAt = (f, closed) => 12 / (1 + f / 2.5) + (closed ? 16 : 1.2) * Math.exp(-((f - 10.8) ** 2) / (2 * 1.1 ** 2));

export function spectrumSvg({ width: W = 520 } = {}) {
  const narrow = isNarrow(W), size = sizeFor(W);
  const lg = legend([{ label: 'Eyes open', kind: 'line', color: EYES_OPEN }, { label: 'Eyes closed', kind: 'line', color: EYES_CLOSED }], { W, mark: 'example', size });
  const titleY = lg.bottom + size + 12;
  const box = { left: narrow ? 14 : 18, right: W - (narrow ? 10 : 8), top: titleY + 12, bottom: titleY + 12 + (narrow ? 210 : 240) };
  const H = box.bottom + 48;
  const fMax = 40, top = 20;
  const x = (f) => box.left + (f / fMax) * (box.right - box.left);
  const y = (v) => box.bottom - (v / top) * (box.bottom - box.top);
  const line = (closed) => pathOf(Array.from({ length: 79 }, (_, i) => 1 + i / 2).map((f) => [x(f), y(spectrumAt(f, closed))]));
  let body = lg.markup + text(0, titleY, 'Relative power', { size, fill: INK });
  body += `<rect x="${round(x(8))}" y="${box.top}" width="${round(x(13) - x(8))}" height="${box.bottom - box.top}" fill="${EYES_CLOSED}" fill-opacity="0.1" stroke="${MUTED}" stroke-opacity="0.22"/>`;
  for (const v of [0, 5, 10, 15, 20]) body += gridLine(box, y(v));
  body += text((x(8) + x(13)) / 2, box.top + size + 3, 'Alpha', { size: 12, anchor: 'middle' });
  body += `<path d="${line(false)}" fill="none" stroke="${EYES_OPEN}" stroke-width="1.7" stroke-linejoin="round"/><path d="${line(true)}" fill="none" stroke="${EYES_CLOSED}" stroke-width="1.7" stroke-linejoin="round"/>`;
  body += xLabels([0, 10, 20, 30, 40], x, box.bottom + size + 6, String, size);
  body += text((box.left + box.right) / 2, H - 6, 'Frequency (Hz)', { size, anchor: 'middle', fill: INK });
  return svgChart({ W, H, mark: 'example', box, body, label: 'Power spectrum with the eyes open and closed: with the eyes closed, a peak near 11 Hz inside the alpha band.' });
}

export function heartRateSvg({ bpm, phases, step_s: step }, { width: W = 1040 } = {}) {
  const narrow = isNarrow(W), size = sizeFor(W);
  const lg = legend([{ label: 'Deep breathing', kind: 'band', color: EYES_OPEN }, { label: 'Exhale hold', kind: 'band', color: SAND, opacity: 0.4 }], { W, mark: 'example', size });
  const titleY = lg.bottom + size + 12;
  const box = { left: narrow ? 30 : 36, right: W - (narrow ? 4 : 8), top: titleY + 12, bottom: titleY + 12 + (narrow ? 190 : 230) };
  const H = box.bottom + 48;
  const total = bpm.length * step;
  const x = (s) => box.left + (s / total) * (box.right - box.left);
  const low = 55, high = 100;
  const y = (v) => box.bottom - ((v - low) / (high - low)) * (box.bottom - box.top);
  let body = lg.markup + text(0, titleY, 'Heart rate (bpm)', { size, fill: INK });
  for (const p of phases) {
    if (p.kind !== 'rest') body += `<rect x="${round(x(p.start))}" y="${box.top}" width="${round(x(p.end) - x(p.start))}" height="${box.bottom - box.top}" fill="${p.kind === 'hold' ? SAND : EYES_OPEN}" fill-opacity="${p.kind === 'hold' ? 0.13 : 0.1}"/>`;
  }
  body += yGrid(box, [60, 70, 80, 90], y, String, size);
  body += spanLabels(phases.filter((p) => p.kind !== 'hold').map((p) => ({ x0: x(p.start), x1: x(p.end), names: [p.name ?? p.label, p.label] })), { y: box.top + size + 3, size: 12, left: box.left, right: box.right }).markup;
  const line = bpm.map((v, i) => [x((i + 0.5) * step), y(v)]);
  body += `<path d="${pathOf(line)}" fill="none" stroke="${INK}" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/>`;
  const peak = bpm.indexOf(Math.max(...bpm));
  body += text(line[peak][0], line[peak][1] - 9, `${Math.round(bpm[peak])} bpm`, { size, anchor: 'middle', fill: INK, weight: 600 });
  body += xLabels([0, 5, 10, 15, 20], (m) => x(m * 60), box.bottom + size + 6, String, size);
  body += text((box.left + box.right) / 2, H - 6, 'Minutes from the start', { size, anchor: 'middle', fill: INK });
  return svgChart({ W, H, mark: 'example', box, body, label: 'Heart rate across a session: higher in the deep breathing of later rounds, lower in each hold, and higher in the rest after than the rest before.' });
}

/** Theta and alpha at Oz across the rests and holds, on a ratio axis around the rest before. */
export function slowingSvg({ eeg }, { width: W = 520 } = {}) {
  const narrow = isNarrow(W), size = sizeFor(W);
  const lg = legend([{ label: 'Theta 4–8 Hz', color: EYES_CLOSED }, { label: 'Alpha 8–13 Hz', color: EYES_OPEN }], { W, mark: 'example', size });
  const titleY = lg.bottom + size + 12;
  const box = { left: narrow ? 34 : 40, right: W - (narrow ? 4 : 10), top: titleY + 12, bottom: titleY + 12 + (narrow ? 200 : 230) };
  const H = box.bottom + 44;
  const slot = (box.right - box.left) / eeg.points.length;
  const x = (i) => box.left + slot * (i + 0.5);
  const low = Math.log2(0.45), high = Math.log2(2.6);
  const y = (v) => box.bottom - ((Math.log2(v) - low) / (high - low)) * (box.bottom - box.top);
  let body = lg.markup + text(0, titleY, 'Power at Oz (× rest before)', { size, fill: INK });
  body += yGrid(box, [0.5, 1, 2], y, (t) => `${t}×`, size);
  eeg.points.forEach((name, i) => {
    const [first, second] = name.split(' ');
    body += text(x(i), box.bottom + size + 6, first, { size, anchor: 'middle' }) + text(x(i), box.bottom + 2 * size + 9, second, { size, anchor: 'middle' });
  });
  for (const [key, label, color] of [['alpha', 'Alpha', EYES_OPEN], ['theta', 'Theta', EYES_CLOSED]]) {
    const points = eeg[key].map((v, i) => [x(i), y(v)]);
    body += `<path d="${pathOf(points)}" fill="none" stroke="${color}" stroke-opacity="0.7" stroke-width="1"/>`;
    eeg[key].forEach((v, i) => { body += `<circle cx="${round(x(i))}" cy="${round(y(v))}" r="${narrow ? 3.6 : 4}" fill="${color}" stroke="${CARD}" stroke-width="2"><title>${label}, ${eeg.points[i].toLowerCase()}: ${v}×</title></circle>`; });
  }
  body += text(x(4), y(eeg.theta[4]) - 10, `${eeg.theta[4]}×`, { size: size + 1, anchor: 'middle', fill: INK, weight: 600 });
  body += text(x(4), y(eeg.alpha[4]) + 20, `${eeg.alpha[4]}×`, { size: size + 1, anchor: 'middle', fill: INK, weight: 600 });
  return svgChart({ W, H, mark: 'example', box, body, label: `Theta and alpha at Oz relative to the rest before: theta rises across the holds to ${eeg.theta[4]} times, alpha falls to ${eeg.alpha[4]} times.` });
}

const linearScale = (low, high) => (v, row) => row.bottom - ((v - low) / (high - low)) * row.height;
const logScale = (low, high) => (v, row) => row.bottom - (Math.log2(v / low) / Math.log2(high / low)) * row.height;

/**
 * A whole long session on one time axis: one row per measure with its own scale and title, and the
 * phases shaded through all of them, so no row carries two scales.
 */
export function longSessionSvg(example, { width: W = 1040 } = {}) {
  const { phases, step_min: step, breathing, heart, theta, alpha, theta_plateau: thetaLabel, alpha_plateau: alphaLabel } = example;
  const narrow = isNarrow(W), size = sizeFor(W);
  const plot = { left: narrow ? 42 : 48, right: W - (narrow ? 8 : 10) };
  const total = phases.at(-1).end;
  const x = (minutes) => plot.left + (minutes / total) * (plot.right - plot.left);
  const times = (t) => `${t}×`;
  const lg = (y) => legend([{ label: 'Theta 4–8 Hz', kind: 'line', color: EYES_CLOSED }, { label: 'Alpha 8–13 Hz', kind: 'line', color: EYES_OPEN }], { W, size, y });

  const labelY = size + 28;
  const labels = spanLabels(phases.map((p) => ({ x0: x(p.start), x1: x(p.end), names: p.names })), { y: labelY, size: 12, left: plot.left, right: plot.right, overhang: true });
  const stackTop = labelY + (labels.rows - 1) * 15 + 8;

  const rows = [
    { title: 'Breathing, depth × rate (× rest)', height: narrow ? 80 : 96, ticks: [0, 2, 4, 6], format: times, scale: linearScale(0, 7), lines: [[breathing, SAND]], labels: [[20, breathing, 'about 4×', -8]] },
    { title: 'Heart rate (bpm)', height: narrow ? 80 : 96, ticks: [60, 80, 100], format: String, scale: linearScale(55, 115), lines: [[heart, INK]], labels: [[20, heart, 'about 90 bpm', -8]] },
    { title: 'Theta and alpha at Oz (× rest before)', height: narrow ? 140 : 170, ticks: [0.25, 0.5, 1, 2, 4, 8], format: times, scale: logScale(0.25, 12), lines: [[alpha, EYES_OPEN], [theta, EYES_CLOSED]], labels: [[37, theta, `Theta ${thetaLabel}×`, -8], [37, alpha, `Alpha ${alphaLabel}×`, size + 6]], legend: true },
  ];
  let at = stackTop;
  for (const row of rows) {
    row.titleY = at + size + 6;
    row.legend = row.legend ? lg(row.titleY + size + 8) : null;
    row.top = (row.legend?.bottom ?? row.titleY) + 10;
    row.bottom = row.top + row.height;
    at = row.bottom + 10;
  }
  const stackBottom = rows.at(-1).bottom;

  let body = labels.markup;
  for (const p of phases) {
    if (p.kind === 'breathing' || p.kind === 'closing') body += `<rect x="${round(x(p.start))}" y="${stackTop}" width="${round(x(p.end) - x(p.start))}" height="${stackBottom - stackTop}" fill="${p.kind === 'closing' ? SAND : EYES_OPEN}" fill-opacity="${p.kind === 'closing' ? 0.12 : 0.07}"/>`;
  }
  for (const row of rows) {
    const y = (v) => row.scale(v, row);
    for (const p of phases.slice(1)) body += `<line x1="${round(x(p.start))}" x2="${round(x(p.start))}" y1="${row.top}" y2="${row.bottom}" stroke="${MUTED}" stroke-opacity="0.22"/>`;
    body += text(0, row.titleY, row.title, { size, fill: INK }) + (row.legend?.markup ?? '');
    body += yGrid(plot, row.ticks, y, row.format, size);
    for (const [values, color] of row.lines) body += `<path d="${pathOf(values.map((v, i) => [x(i * step), y(v)]))}" fill="none" stroke="${color}" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/>`;
    for (const [minute, values, label, dy] of row.labels) body += text(x(minute), y(values[minute / step]) + dy, label, { size, anchor: 'middle', fill: INK, weight: 600 });
  }
  body += xLabels([0, 10, 20, 30, 40, 50, 60], x, stackBottom + size + 6, String, size);
  const H = stackBottom + 48;
  body += text(W / 2, H - 6, W < 300 ? 'Minutes from the start' : 'Minutes from the start of the rest before', { size, anchor: 'middle', fill: INK });
  return svgChart({ W, H, mark: 'example', body, label: `A session of ${total} minutes on one time axis. Breathing depth × rate rises about fourfold and heart rate climbs. Theta at Oz stays flat for the first minutes, climbs to about ${thetaLabel} times the rest before and stays up until the recovery, while alpha falls to about ${alphaLabel} times.` });
}

// ---------------------------------------------------------------- view
const table = (caption, heads, rows) => h('div', { class: 'td-scroll-x' }, h('table', { class: 'td-table' },
  h('caption', { class: 'td-visually-hidden', text: caption }),
  h('thead', {}, h('tr', {}, ...heads.map((t, i) => h('th', { scope: 'col', class: i ? 'td-num' : '', text: t })))),
  h('tbody', {}, ...rows.map((row) => h('tr', {}, ...row.map((cell, i) => h('td', { class: i ? 'td-num' : '', text: String(cell) })))))));
const reading = (items) => [h('h3', { text: 'How to read it' }), h('ul', { class: 'td-example-reading' }, ...items.map((t) => h('li', { text: t })))];

/** The button offered where results would be. */
export const exampleButton = (onShow) => h('button', { class: 'td-btn td-example-show', type: 'button', onclick: onShow }, 'Show example results');

/** @returns {Node[]} the example, for the Results panel */
export function exampleView(example, { onHide, formatLabel = null }) {
  const head = [h('div', { class: 'td-example-note', role: 'note' },
    h('strong', { text: EXAMPLE_LABEL }), h('span', { text: EXAMPLE_NOTE }),
    h('button', { class: 'td-btn', type: 'button', onclick: onHide }, 'Hide'))];
  if (formatLabel) head.push(h('p', { class: 'td-caption', text: `${formatLabel} format, chosen in the Protocol tab.` }));
  if (example.kind === 'breathwork-long') {
    return [...head,
      reportCard({
        title: `Theta climbs to about ${example.theta_plateau}× and stays up until the recovery`,
        sub: 'Breathing depth × rate, heart rate, and theta and alpha at Oz, on one time axis.',
        hero: { value: `${example.theta_plateau}×`, definition: 'theta at Oz, × the rest before' },
        draw: (width) => longSessionSvg(example, { width }),
      }),
      h('p', { class: 'td-caption', text: 'Power at Oz is relative to the eyes-closed rest before.' }),
      ...reading(example.reading),
      h('p', { class: 'td-caption', text: example.source_note })];
  }
  if (example.kind === 'berger') {
    return [...head,
      reportCard({
        title: 'Alpha rises each time the eyes close',
        sub: 'One point per 4.1 s analysis window. Shaded blocks are the prompted eye states.',
        hero: { value: `${example.median_ratio.toFixed(1)}×`, definition: 'median closed / open, all 4 pairs' },
        draw: (width) => timeCourseSvg(example, { width }),
      }),
      h('div', { class: 'td-example-pair' },
        reportCard({ title: 'Alpha is higher with the eyes closed in all 4 pairs', sub: 'Median 8–13 Hz power per block. The ratio is closed / open.', width: 520, draw: (width) => pairsSvg(example, { width }) }),
        reportCard({ title: 'The rise sits in the alpha band, near 11 Hz', sub: 'With the eyes closed, one narrow peak rises and the rest barely moves.', width: 520, draw: (width) => spectrumSvg({ width }) })),
      h('div', { class: 'td-report-block' }, table('Example: alpha per pair', ['Pair', 'Open α', 'Closed α', 'Closed / open'], example.pairs.map((p) => [`Pair ${p.pair}`, p.open, p.closed, `${p.ratio.toFixed(1)}×`]))),
      ...reading(example.reading)];
  }
  return [...head,
    reportCard({
      title: 'Heart rate climbs across the rounds and drops in each hold',
      sub: 'Heart rate through the session, with the rounds of deep breathing and the exhale holds shaded.',
      draw: (width) => heartRateSvg(example, { width }),
    }),
    h('div', { class: 'td-example-pair' },
      reportCard({ title: 'The EEG slows in the holds', sub: 'EEG is read in the rests and the holds. During the deep breaths, muscle activity takes over the scalp signal.', width: 520, draw: (width) => slowingSvg(example, { width }) }),
      reportCard({ title: restFinding(example.rest_alpha), sub: 'Median 8–13 Hz power at Oz in each rest. Power depends on contact and gain.', hero: restHero(example.rest_alpha), width: 520, draw: (width) => restSvg(example, { width }) })),
    h('div', { class: 'td-example-pair' },
      h('div', { class: 'td-report-block' }, h('h3', { text: 'Rest before and after' }), table('Example: rest before and after', ['Measure', 'Before', 'After'], example.rest)),
      h('div', { class: 'td-report-block' }, h('h3', { text: 'Round by round' }), table('Example: round by round, deep breathing / hold', ['Round', 'Heart rate', 'Beside the eyes', 'Shoulder'], example.rounds),
        h('p', { class: 'td-caption', text: 'Each cell: deep breathing / hold. Muscle activity is relative to the eyes-closed rest before.' }))),
    ...reading(example.reading),
    h('p', { class: 'td-caption', text: example.source_note })];
}
