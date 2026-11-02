/**
 * Result charts in the report grammar: a card on the navy page, a Georgia heading that states the
 * finding, an optional hero ratio, then a plot with sans labels and a horizontal grid only. Soft rose
 * is eyes closed and soft periwinkle eyes open.
 *
 * Charts are SVG strings drawn at the real width of their card, so text keeps its size on a phone.
 * They draw what they are given and compute no result. Headings for a real session come from the
 * finding functions below, which read the analysis results and never assert more than these show.
 */
import { h } from '../dom.js';
import { theme } from '../../design/theme.js';
import { BERGER_V3 } from '../../analysis/berger-v3.js';
import { compact, niceTicks } from './canvas.js';

const C = theme.color;
const FONT = theme.font.ui;
export const INK = C.ink.primary;
export const MUTED = C.ink.muted;
export const GRID = C.surface.border;
export const CARD = C.surface.panel;
const NEUTRAL = C.data.neutral;
export const EYES_OPEN = C.data['periwinkle-soft'];
export const EYES_CLOSED = C.data['rose-soft'];
export const SAND = C.data.sand;

export const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const widthOf = (s, size) => String(s).length * size * 0.56;
const finite = Number.isFinite;
/** A tick as it is: niceTicks already gives round values. */
const tick = (v) => (Math.abs(v) >= 1000 ? compact(v) : String(v));

/** Below this width a chart redraws for a phone: smaller margins, fewer ticks, shorter labels. */
export const isNarrow = (width) => width < 480;
export const sizeFor = (width) => (isNarrow(width) ? 12 : 13);

// ---------------------------------------------------------------- primitives
export const text = (x, y, value, { size = 12, fill = MUTED, anchor = 'start', weight = 400 } = {}) =>
  `<text x="${round(x)}" y="${round(y)}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${esc(value)}</text>`;

const stampWidth = (mark, W) => (mark === 'example' ? 66 : mark === 'simulated' ? (W < 420 ? 76 : 232) : 0);

/** Diagonal hatch over the plot of a simulated chart. Plain lines, so it needs no shared definition. */
function hatch({ left, right, top, bottom }, step = 14) {
  const w = right - left, height = bottom - top;
  let d = '';
  for (let k = step; k < w + height; k += step) {
    const [x0, y0] = k <= w ? [left + k, top] : [right, top + k - w];
    const [x1, y1] = k <= height ? [left, top + k] : [left + k - height, bottom];
    d += `M${round(x0)} ${round(y0)}L${round(x1)} ${round(y1)}`;
  }
  return `<path d="${d}" stroke="${C.status.simulated}" stroke-opacity="0.12" fill="none"/>`;
}

/**
 * The svg element of a chart. `mark` is 'example' or 'simulated': it names the chart in its label,
 * stamps it above the plot and, when simulated, hatches the plot.
 */
export function svgChart({ W, H, label, mark = null, box = null, body }) {
  const prefix = mark === 'example' ? 'Example, not a recording. ' : mark === 'simulated' ? 'Simulated test pattern, not a recording. ' : '';
  const title = esc(`${prefix}${label}`);
  const stamp = mark === 'example' ? text(W - 2, 14, 'EXAMPLE', { fill: SAND, anchor: 'end', weight: 600 })
    : mark === 'simulated' ? text(W - 2, 14, W < 420 ? 'SIMULATED' : 'SIMULATED — synthetic test pattern', { fill: C.status.simulated, anchor: 'end', weight: 600 })
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${title}" font-family="${esc(FONT)}" style="font-variant-numeric:tabular-nums lining-nums"><title>${title}</title>${body}${mark === 'simulated' && box ? hatch(box) : ''}${stamp}</svg>`;
}

/** A not-eligible value: grey and hatched, so it is visible but not mistaken for a result. */
function hatchedDot(cx, cy, r, title = '') {
  const a = r * 0.7;
  return `<g>${title}<circle cx="${round(cx)}" cy="${round(cy)}" r="${r}" fill="${CARD}" stroke="${NEUTRAL}" stroke-width="1.4"/><path d="M${round(cx - a)} ${round(cy + a)}L${round(cx + a)} ${round(cy - a)}M${round(cx - a + r * 0.55)} ${round(cy + a)}L${round(cx + a)} ${round(cy - a + r * 0.55)}M${round(cx - a)} ${round(cy + a - r * 0.55)}L${round(cx + a - r * 0.55)} ${round(cy - a)}" stroke="${NEUTRAL}" stroke-width="1.1"/></g>`;
}

const swatch = (x, y, { kind = 'dot', color = INK, opacity = 0.3 }) => {
  const cy = y - 4;
  if (kind === 'ring') return `<circle cx="${x + 6}" cy="${cy}" r="4" fill="none" stroke="${color}" stroke-width="1.6"/>`;
  if (kind === 'band') return `<rect x="${x}" y="${y - 10}" width="12" height="12" fill="${color}" fill-opacity="${opacity}"/>`;
  if (kind === 'hatched') return hatchedDot(x + 6, cy, 4.5);
  if (kind === 'line') return `<line x1="${x}" x2="${x + 12}" y1="${cy}" y2="${cy}" stroke="${color}" stroke-width="2"/>`;
  return `<circle cx="${x + 6}" cy="${cy}" r="4" fill="${color}"/>`;
};

/** Legend rows above the plot, never over data. The first row leaves room for the stamp. */
export function legend(items, { W, mark = null, size = 12, x = 0, y = 14 }) {
  const firstMax = W - stampWidth(mark, W) - 8;
  let cx = x, cy = y, out = '', row = 0;
  for (const item of items) {
    const width = 18 + widthOf(item.label, size);
    if (cx > x && cx + width > (row ? W : firstMax)) { cx = x; cy += size + 8; row++; }
    out += swatch(cx, cy, item) + text(cx + 18, cy, item.label, { size, fill: INK });
    cx += width + 14;
  }
  return { markup: out, bottom: items.length || mark ? cy : 0 };
}

export const gridLine = (box, y, stroke = GRID) => `<line x1="${box.left}" x2="${box.right}" y1="${round(y)}" y2="${round(y)}" stroke="${stroke}"/>`;

/** Horizontal grid with its tick labels. No tick marks. */
export function yGrid(box, ticks, y, format = tick, size = 12) {
  return ticks.map((t) => gridLine(box, y(t)) + text(box.left - 8, y(t) + size * 0.35, format(t), { size, anchor: 'end' })).join('');
}

/** Tick labels under the plot. */
export function xLabels(ticks, x, baseline, format = tick, size = 12) {
  return ticks.map((t) => text(x(t), baseline, format(t), { size, anchor: 'middle' })).join('');
}

export const pathOf = (points) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${round(x)} ${round(y)}`).join('');

/**
 * Labels over a row of spans, each the longest of its names that fits. With `overhang`, a span too
 * small for any of them lets its shortest name run over its edges, on a second row when it would
 * collide on the first. Without it, that span goes unlabelled.
 * @param {{x0:number, x1:number, names:string[]}[]} spans
 * @returns {{markup:string, rows:number}}
 */
export function spanLabels(spans, { y, size = 12, rowGap = 15, left = -Infinity, right = Infinity, fill = MUTED, overhang = false }) {
  const placed = [[], []];
  let markup = '', rows = 1;
  const free = (row, a, b) => placed[row].every(([p, q]) => b + 4 < p || a - 4 > q);
  for (const span of spans) {
    const name = span.names.find((n) => widthOf(n, size) <= span.x1 - span.x0 - 4);
    if (!name && !overhang) continue;
    const chosen = name ?? span.names.at(-1);
    const w = widthOf(chosen, size);
    const mid = (span.x0 + span.x1) / 2;
    const a = Math.max(left, Math.min(mid - w / 2, right - w)), b = a + w;
    const row = free(0, a, b) ? 0 : free(1, a, b) ? 1 : null;
    if (row === null) continue;
    placed[row].push([a, b]);
    rows = Math.max(rows, row + 1);
    markup += text(a + w / 2, y + row * rowGap, chosen, { size, anchor: 'middle', fill });
  }
  return { markup, rows };
}

// ---------------------------------------------------------------- two values per group
const valueLabel = (v) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));

/** Words on as many lines as a slot needs. */
function wrap(words, maxChars) {
  const lines = [];
  for (const word of words.split(' ')) {
    if (lines.length && `${lines.at(-1)} ${word}`.length <= maxChars) lines[lines.length - 1] += ` ${word}`;
    else lines.push(word);
  }
  return lines;
}

/**
 * Paired values on one shared axis, joined by a thin line: `first` on the left and `second` on the
 * right of each group, the higher value labelled above its point and the lower one below.
 * A group not `ok` is drawn grey and hatched with its reason, in place of a ratio.
 */
function dumbbellChart({ W, groups, items, yLabel, label, mark, plotHeight, emptyText, valueText, unit }) {
  const narrow = isNarrow(W), size = sizeFor(W);
  const lg = legend(items, { W, mark, size });
  const titleY = lg.bottom + size + 12;
  const T = titleY + 12, L = narrow ? 40 : 48, R = narrow ? 4 : 10;
  const box = { left: L, right: W - R, top: T, bottom: T + plotHeight };
  const H = box.bottom + 76;
  const values = groups.flatMap((g) => [g.first.value, g.second.value]).filter(finite);
  const peak = values.length ? Math.max(...values) : 1;
  const ticks = niceTicks(0, peak * 1.15, narrow ? 4 : 5);
  const top = Math.max(ticks.at(-1), peak * 1.15);
  const y = (v) => box.bottom - (v / top) * (box.bottom - box.top);
  const slot = (box.right - box.left) / groups.length;
  const r = narrow ? 5 : 5.5, spread = Math.min(slot * 0.16, 24);
  let body = lg.markup + text(0, titleY, yLabel, { size, fill: INK }) + yGrid(box, ticks, y, tick, size);
  if (!values.length) body += text((box.left + box.right) / 2, (box.top + box.bottom) / 2, emptyText, { size: 14, anchor: 'middle' });
  groups.forEach((g, i) => {
    const cx = box.left + slot * (i + 0.5);
    const a = finite(g.first.value) ? y(g.first.value) : null;
    const b = finite(g.second.value) ? y(g.second.value) : null;
    const xa = cx - spread, xb = cx + spread;
    if (a !== null && b !== null) body += `<line x1="${round(xa)}" x2="${round(xb)}" y1="${round(a)}" y2="${round(b)}" stroke="${g.ok ? MUTED : NEUTRAL}" stroke-opacity="0.45" stroke-width="1.7"/>`;
    [[g.first, a, xa, b === null || a <= b], [g.second, b, xb, a === null || b < a]].forEach(([end, at, px, upper]) => {
      if (at === null) return;
      const tip = `<title>${esc(`${g.name}, ${end.name}: ${valueText(end.value)} ${unit}`)}</title>`;
      if (!g.ok) body += hatchedDot(px, at, r, tip);
      else if (end.filled) body += `<circle cx="${round(px)}" cy="${round(at)}" r="${r}" fill="${end.color}" stroke="${CARD}" stroke-width="2">${tip}</circle>`;
      else body += `<circle cx="${round(px)}" cy="${round(at)}" r="${r - 1}" fill="${CARD}" stroke="${end.color}" stroke-width="2">${tip}</circle>`;
      body += text(px, upper ? at - r - 5 : at + r + size + 1, valueText(end.value), { size, anchor: 'middle' });
    });
    body += text(cx, box.bottom + 32, g.name, { size, anchor: 'middle' });
    if (g.ok && g.ratio) body += text(cx, box.bottom + 54, g.ratio, { size: size + 3, anchor: 'middle', fill: INK, weight: 600 });
    else if (g.reason) wrap(g.reason, Math.max(8, Math.floor(slot / (size * 0.56)))).forEach((line, k) => { body += text(cx, box.bottom + 50 + k * (size + 2), line, { size, anchor: 'middle' }); });
  });
  return svgChart({ W, H, label, mark, box, body });
}

const statusText = (status) => String(status ?? '').replaceAll('_', ' ');

/** The pairs of an analysis result, as the pairs chart reads them. */
export const pairsFromResults = (res) => res.pairs.map((p) => ({ pair: p.pair, open: p.open?.alpha ?? null, closed: p.closed?.alpha ?? null, status: p.status, ratio: p.ratio }));

/**
 * Alpha per prompted pair, eyes open and eyes closed on one axis.
 * @param {{pairs:{pair:number, open:number|null, closed:number|null, status:string, ratio:number|null}[], width?:number, mark?:string|null, digits?:number, valueText?:(v:number)=>string}} options
 */
export function pairsChart({ pairs, width = 520, mark = null, digits = 2, valueText = valueLabel }) {
  const eligible = (p) => p.status === 'eligible';
  const items = [
    { label: 'Eyes open', color: EYES_OPEN },
    { label: 'Eyes closed', color: EYES_CLOSED },
    ...(pairs.every(eligible) ? [] : [{ label: 'Hatched: not eligible', kind: 'hatched' }]),
  ];
  const groups = pairs.map((p) => ({
    name: `Pair ${p.pair}`,
    ok: eligible(p),
    ratio: eligible(p) && finite(p.ratio) ? `${p.ratio.toFixed(digits)}×` : null,
    reason: eligible(p) ? null : statusText(p.status),
    first: { name: 'eyes open', value: p.open, color: EYES_OPEN, filled: true },
    second: { name: 'eyes closed', value: p.closed, color: EYES_CLOSED, filled: true },
  }));
  const said = pairs.map((p) => `Pair ${p.pair}: ${finite(p.open) ? valueText(p.open) : 'no value'} open, ${finite(p.closed) ? valueText(p.closed) : 'no value'} closed, ${eligible(p) && finite(p.ratio) ? `${p.ratio.toFixed(digits)} times` : statusText(p.status)}.`).join(' ');
  return dumbbellChart({ W: width, groups, items, yLabel: 'α power (count-equiv.²)', label: `Alpha power per pair, eyes open and eyes closed. ${said}`, mark, plotHeight: isNarrow(width) ? 210 : 240, emptyText: 'No complete pairs yet', valueText, unit: 'count-equiv.²' });
}

const REST_STATES = { open: { name: 'Eyes open', color: EYES_OPEN }, closed: { name: 'Eyes closed', color: EYES_CLOSED } };

/**
 * Rest before and rest after per eye state, on one axis. The ring is the rest before, the filled
 * point the rest after.
 * @param {{rows:{state:string, status:string, before:{alpha:number|null}|null, after:{alpha:number|null}|null, alpha_ratio_after_before:number|null}[], width?:number, mark?:string|null, valueText?:(v:number)=>string}} options
 */
export function restChart({ rows, width = 520, mark = null, valueText = valueLabel }) {
  const eligible = (row) => row.status === 'eligible';
  const items = [
    { label: 'Rest before', kind: 'ring', color: MUTED },
    { label: 'Rest after', color: MUTED },
    ...(rows.every(eligible) ? [] : [{ label: 'Hatched: not eligible', kind: 'hatched' }]),
  ];
  const groups = rows.map((row) => {
    const state = REST_STATES[row.state];
    return {
      name: state.name,
      ok: eligible(row),
      ratio: eligible(row) && finite(row.alpha_ratio_after_before) ? `${row.alpha_ratio_after_before.toFixed(2)}×` : null,
      reason: eligible(row) ? null : statusText(row.status),
      first: { name: 'rest before', value: row.before?.alpha ?? null, color: state.color, filled: false },
      second: { name: 'rest after', value: row.after?.alpha ?? null, color: state.color, filled: true },
    };
  });
  const said = groups.map((g) => `${g.name}: ${finite(g.first.value) ? valueText(g.first.value) : 'no value'} before, ${finite(g.second.value) ? valueText(g.second.value) : 'no value'} after, ${g.ratio ? g.ratio.replace('×', ' times') : g.reason}.`).join(' ');
  return dumbbellChart({ W: width, groups, items, yLabel: 'α power (count-equiv.²)', label: `Alpha power in the rest before and the rest after. ${said}`, mark, plotHeight: isNarrow(width) ? 190 : 220, emptyText: 'No rests recorded yet', valueText, unit: 'count-equiv.²' });
}

// ---------------------------------------------------------------- alpha through time
/** Length of one analysis window in milliseconds. */
const WINDOW_MS = (BERGER_V3.window_samples / BERGER_V3.fs_nominal) * 1000;
/** Consecutive windows further apart than this are not joined: a gap is never bridged. */
const JOIN_LIMIT_MS = WINDOW_MS * 1.5;

const eyeState = (label) => {
  const bare = label.replace(/^demo_/, '');
  return bare.startsWith('eyes_closed') ? 'closed' : bare.startsWith('eyes_open') ? 'open' : 'other';
};
const stateColor = (state) => (state === 'closed' ? EYES_CLOSED : state === 'open' ? EYES_OPEN : NEUTRAL);

const blockNames = (label) => {
  const bare = label.replace(/^demo_/, '');
  const pair = /^eyes_(open|closed)_pair(\d+)$/.exec(bare);
  if (pair) return [`${pair[1] === 'open' ? 'Open' : 'Closed'} ${pair[2]}`, `${pair[1] === 'open' ? 'O' : 'C'}${pair[2]}`];
  if (bare === 'settling_eyes_open') return ['Settling', 'Set.'];
  if (bare === 'recovery_eyes_open') return ['Recovery', 'Rec.'];
  return [bare.replaceAll('_', ' ')];
};

/** What the time course draws for one protocol, from stored blocks and windows. */
export function timeCourseFrom({ blocks, windows, markers = [], channel = 0 }) {
  const origin = Math.min(...blocks.map((b) => b.start_arrival_ms));
  const end = Math.max(...blocks.map((b) => b.end_arrival_ms ?? 0));
  return {
    origin,
    blocks,
    windows: windows.filter((w) => w.channel === channel).map((w) => ({
      mid_ms: w.arrival_ms - WINDOW_MS / 2,
      value: w.filtered_alpha,
      state: eyeState(w.phase ?? ''),
      good: !!w.accepted_for_block && !w.reasons.length,
    })),
    markers: markers.filter((m) => m.arrival_ms >= origin && m.arrival_ms <= end),
  };
}

/**
 * Alpha per analysis window through a protocol. Blocks are shaded in their prompted state, points
 * are joined by thin lines inside a contiguous run of clean windows, hollow points were rejected or
 * not counted.
 * @param {{windows:{mid_ms:number, value:number, state:string, good:boolean}[], blocks:object[], markers?:object[], origin?:number, width?:number, mark?:string|null, tooltips?:boolean}} options
 */
export function timeCourseChart({ windows, blocks, markers = [], origin = 0, width = 1040, mark = null, tooltips = true }) {
  const W = width, narrow = isNarrow(W), size = sizeFor(W);
  const minutes = (ms) => (ms - origin) / 60000;
  const end = Math.max(10 / 60, ...blocks.map((b) => minutes(b.end_arrival_ms ?? b.start_arrival_ms)));
  const points = windows.filter((w) => finite(w.value)).sort((a, b) => a.mid_ms - b.mid_ms);
  const peak = points.length ? Math.max(...points.map((p) => p.value)) : 1;
  const yTicks = niceTicks(0, peak * 1.22, narrow ? 4 : 6);
  const top = Math.max(yTicks.at(-1), peak * 1.22);
  const items = [
    { label: 'Eyes open', color: EYES_OPEN },
    { label: 'Eyes closed', color: EYES_CLOSED },
    ...(points.some((p) => !p.good) ? [{ label: 'Hollow: rejected or not counted', kind: 'ring', color: MUTED }] : []),
  ];
  const lg = legend(items, { W, mark, size });
  const titleY = lg.bottom + size + 12;
  const box = { left: narrow ? 40 : 52, right: W - (narrow ? 4 : 8), top: titleY + 12, bottom: titleY + 12 + (narrow ? 210 : 280) };
  const H = box.bottom + 48;
  const x = (m) => box.left + (m / end) * (box.right - box.left);
  const y = (v) => box.bottom - (v / top) * (box.bottom - box.top);

  let body = lg.markup + text(0, titleY, 'α power (count-equiv.²)', { size, fill: INK });
  blocks.forEach((b) => {
    const state = eyeState(b.label);
    const x0 = x(minutes(b.start_arrival_ms)), x1 = x(minutes(b.end_arrival_ms ?? b.start_arrival_ms));
    if (state !== 'other') body += `<rect x="${round(x0)}" y="${box.top}" width="${round(Math.max(0, x1 - x0))}" height="${box.bottom - box.top}" fill="${stateColor(state)}" fill-opacity="0.075"/>`;
  });
  body += yGrid(box, yTicks, y, tick, size);
  blocks.slice(1).forEach((b) => { const bx = x(minutes(b.start_arrival_ms)); body += `<line x1="${round(bx)}" x2="${round(bx)}" y1="${box.top}" y2="${box.bottom}" stroke="${MUTED}" stroke-opacity="0.28"/>`; });
  body += spanLabels(blocks.map((b) => ({ x0: x(minutes(b.start_arrival_ms)), x1: x(minutes(b.end_arrival_ms ?? b.start_arrival_ms)), names: blockNames(b.label) })), { y: box.top + size + 3, size: 12, left: box.left, right: box.right }).markup;

  markers.forEach((m, i) => {
    const mx = x(minutes(m.arrival_ms));
    const note = `▲ ${String(m.note || 'marker').slice(0, 28)}`;
    const flip = mx > box.left + (box.right - box.left) * 0.7;
    body += `<line x1="${round(mx)}" x2="${round(mx)}" y1="${box.top}" y2="${box.bottom}" stroke="${C.status.warning}" stroke-dasharray="4 3"/>`;
    body += text(mx + (flip ? -4 : 4), box.bottom - 6 - (i % 3) * (size + 3), note, { size: 12, fill: C.status.warning, anchor: flip ? 'end' : 'start' });
  });

  // Thin lines join clean, contiguous windows of one prompted state.
  let run = [];
  const flush = () => {
    if (run.length > 1) body += `<polyline points="${run.map((p) => `${round(x(minutes(p.mid_ms)))},${round(y(p.value))}`).join(' ')}" fill="none" stroke="${stateColor(run[0].state)}" stroke-opacity="0.7" stroke-width="0.9"/>`;
    run = [];
  };
  for (const p of points) {
    if (!p.good) { flush(); continue; }
    const last = run.at(-1);
    if (last && (last.state !== p.state || p.mid_ms - last.mid_ms > JOIN_LIMIT_MS)) flush();
    run.push(p);
  }
  flush();
  const r = narrow ? 2.6 : 3.6;
  for (const p of points) {
    const cx = round(x(minutes(p.mid_ms))), cy = round(y(p.value)), color = stateColor(p.state);
    const tip = tooltips ? `<title>${esc(`${{ closed: 'Eyes closed', open: 'Eyes open' }[p.state] ?? 'Other block'}, ${minutes(p.mid_ms).toFixed(2)} min: ${p.value.toFixed(1)} count-equiv.²${p.good ? '' : ', rejected or not counted'}`)}</title>` : '';
    body += p.good ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}">${tip}</circle>` : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="1.2">${tip}</circle>`;
  }
  if (!points.length) body += text((box.left + box.right) / 2, (box.top + box.bottom) / 2, 'No analysis windows yet', { size: 14, anchor: 'middle' });

  const xTicks = niceTicks(0, end, narrow ? 4 : 8);
  body += xLabels(xTicks, x, box.bottom + size + 6, tick, size);
  body += text((box.left + box.right) / 2, H - 6, narrow ? 'Minutes since the protocol started' : 'Minutes since the protocol started (browser arrival time)', { size, anchor: 'middle', fill: INK });
  const closedPoints = points.filter((p) => p.state === 'closed' && p.good).length, openPoints = points.filter((p) => p.state === 'open' && p.good).length;
  return svgChart({ W, H, mark, box, body, label: `Alpha power per analysis window through the protocol: ${openPoints} clean windows in eyes-open blocks and ${closedPoints} in eyes-closed blocks.` });
}

// ---------------------------------------------------------------- findings for real sessions
const plural = (n) => (n === 1 ? 'the one eligible pair' : `all ${n} eligible pairs`);

/** Heading of the pairs chart: what the eligible pairs of this session show, and nothing more. */
export function pairFinding({ eligible_count: n, higher_closed_count: k }) {
  if (!n) return 'No pair can be compared yet';
  if (k === n) return `Alpha is higher with the eyes closed in ${plural(n)}`;
  if (k === 0) return n === 1 ? 'Alpha is not higher with the eyes closed in the one eligible pair' : `Alpha is not higher with the eyes closed in any of the ${n} eligible pairs`;
  return `Alpha is higher with the eyes closed in ${k} of ${n} eligible pairs`;
}

/** Heading of the time course: same count as the pairs, in the terms of this chart. */
export function timeCourseFinding({ eligible_count: n, higher_closed_count: k }) {
  if (!n) return 'Alpha through the blocks, window by window';
  if (k === n) return `The eyes-closed block reads higher in ${plural(n)}`;
  if (k === 0) return n === 1 ? 'The eyes-closed block does not read higher in the one eligible pair' : `The eyes-closed block reads higher in none of the ${n} eligible pairs`;
  return `The eyes-closed block reads higher in ${k} of ${n} eligible pairs`;
}

/** The hero of a paired result, or null when no pair is eligible. */
export function pairHero({ eligible_count: n, median_ratio: ratio }) {
  return n && finite(ratio) ? { value: `${ratio.toFixed(2)}×`, definition: 'median closed ÷ open, eligible pairs' } : null;
}

const comparedRow = (rows) => rows.find((r) => r.state === 'closed' && r.status === 'eligible') ?? rows.find((r) => r.state === 'open' && r.status === 'eligible') ?? null;

/** Heading of the rest chart: what the eligible rests of this session show, and nothing more. */
export function restFinding(rows) {
  const row = comparedRow(rows);
  if (!row) return 'Alpha cannot be compared before and after yet';
  const eyes = row.state === 'closed' ? 'Eyes-closed' : 'Eyes-open';
  if (row.alpha_ratio_after_before.toFixed(2) === '1.00') return `${eyes} alpha reads the same after the session as before`;
  return `${eyes} alpha is ${row.alpha_ratio_after_before > 1 ? 'higher' : 'lower'} after the session than before`;
}

/** The hero of a rest comparison, or null when no row is eligible. */
export function restHero(rows) {
  const row = comparedRow(rows);
  return row ? { value: `${row.alpha_ratio_after_before.toFixed(2)}×`, definition: `alpha after ÷ before, eyes ${row.state}` } : null;
}

// ---------------------------------------------------------------- cards
/**
 * A host that keeps an SVG string at the real width of its box. `draw(width)` returns the markup;
 * until the box has a size, as in a hidden tab, it draws at `fallback`.
 */
export function svgHost(draw, fallback = 1040, className = 'td-report-plot') {
  const el = h('div', { class: className });
  let painted = 0;
  const paint = (width) => { painted = width; el.innerHTML = draw(width); };
  const measured = () => Math.round(el.clientWidth);
  paint(fallback);
  if (globalThis.ResizeObserver) new ResizeObserver(() => { const width = measured(); if (width && width !== painted) paint(width); }).observe(el);
  return { el, redraw() { paint(measured() || fallback); } };
}

/**
 * A chart with the sentence it demonstrates.
 * @param {{title:string, sub?:string|null, hero?:{value:string, definition:string}|null, draw:(width:number)=>string, width?:number, after?:Node|null}} options
 */
export function reportCard({ title, sub = null, hero = null, draw, width = 1040, after = null }) {
  return h('figure', { class: 'td-report' },
    h('figcaption', { class: 'td-report-head' },
      h('div', { class: 'td-report-heading' }, h('h3', { class: 'td-report-title', text: title }), sub ? h('p', { class: 'td-report-sub', text: sub }) : null),
      hero ? h('div', { class: 'td-report-hero' }, h('strong', { text: hero.value }), h('span', { text: hero.definition })) : null),
    svgHost(draw, width).el,
    after);
}

const PAIRS_SUB = 'α is the median 8–13 Hz power of clean windows after the fixed filter, in count-equivalent². A pair gets a ratio once both blocks are marked followed and each has at least 2 clean windows.';
const COURSE_SUB = 'One point per 4.1 s analysis window, in filtered 8–13 Hz power. Eye states are prompted, not measured.';

/** The pairs of one protocol, with their finding. */
export function pairsCard(res, { mark = null, hero = true } = {}) {
  const pairs = pairsFromResults(res);
  return reportCard({ title: pairFinding(res), sub: PAIRS_SUB, hero: hero ? pairHero(res) : null, width: 720, draw: (width) => pairsChart({ pairs, width, mark }) });
}

/** The windows of one protocol, with the finding of its pairs. */
export function timeCourseCard(course, res, { mark = null, hero = false } = {}) {
  return reportCard({ title: timeCourseFinding(res), sub: COURSE_SUB, hero: hero ? pairHero(res) : null, draw: (width) => timeCourseChart({ ...course, width, mark }) });
}

/** Rest before and rest after, with their finding. `comparison` is what restComparison returns. */
export function restCard(comparison, { mark = null, channelName = null } = {}) {
  const { rows } = comparison;
  const where = channelName ? `Channel ${channelName}.` : '';
  const sub = comparedRow(rows)
    ? `α is the median 8–13 Hz power of clean windows after the fixed filter, in count-equivalent². Power depends on contact and gain. ${where}`
    : `A row gets a ratio once both rests are complete, not excluded, with at least 2 clean windows each. ${where}`;
  return reportCard({ title: restFinding(rows), sub: sub.trim(), hero: restHero(rows), width: 720, draw: (width) => restChart({ rows, width, mark }) });
}
