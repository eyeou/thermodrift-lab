/**
 * Small figures for the written protocol: what each step looks like, shown beside the step. They
 * are illustrations or examples, never recordings, and carry no measured value. The placement step
 * reuses the plates; the results step reuses the example charts.
 */
import { h } from '../dom.js';
import { theme } from '../../design/theme.js';
import { esc, round } from '../charts/report.js';
import { placementLeads, placementSvg, placementViews } from './placement.js';

const C = theme.color;
const INK = C.ink.primary, MUTED = C.ink.muted, LINE = C.surface['border-strong'], BG = C.surface.base, BODY = '#0E1433';
const BRASS = C.brand.brass, SAND = C.data.sand, ROSE = C.data.rose, PERI = C.data.periwinkle;
const SERIF = "Georgia, 'Times New Roman', serif";
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

const label = (x, y, value, { anchor = 'start', size = 16, fill = INK, italic = true } = {}) =>
  `<text x="${round(x)}" y="${round(y)}" font-family="${SERIF}"${italic ? ' font-style="italic"' : ''} font-size="${size}" fill="${fill}" text-anchor="${anchor}">${esc(value)}</text>`;
const note = (x, y, value, { anchor = 'start', fill = MUTED, size = 13.5 } = {}) =>
  `<text x="${round(x)}" y="${round(y)}" font-family="${FONT}" font-size="${size}" fill="${fill}" text-anchor="${anchor}">${esc(value)}</text>`;
/** Hairline frame with stepped brass corners, as on the plates. */
const frame = (W, H) => `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="${BG}" stroke="${LINE}"/>`
  + `<path d="M8 22V8H22M${W - 22} 8H${W - 8}V22M${W - 8} ${H - 22}V${H - 8}H${W - 22}M22 ${H - 8}H8V${H - 22}" fill="none" stroke="${BRASS}" stroke-opacity="0.55"/>`;
const svg = (W, H, title, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(title)}"><title>${esc(title)}</title>${frame(W, H)}${body}`
  + `${note(W - 18, 28, 'Illustration', { anchor: 'end', size: W < 400 ? 15 : 13.5 })}</svg>`;

/**
 * Below this width a step picture is redrawn for a phone: a narrower plate, so its words land at
 * 13 px or more on screen instead of shrinking with a desktop drawing.
 */
export const NARROW_FIGURES = '(max-width: 560px)';
const narrowScreen = () => !!globalThis.matchMedia?.(NARROW_FIGURES).matches;
// Phone plates are 300 units wide and show at about 230 to 300 px: words at 17 and 19 units stay legible.
const N = { W: 300, note: 17, label: 19 };

const figure = (markup, caption) => h('figure', { class: 'td-stage-figure' }, h('div', { class: 'td-stage-svg', html: markup }), caption ? h('figcaption', { class: 'td-caption', text: caption }) : null);

/** A battery glyph, charge in sand. */
const battery = (x, y) => `<rect x="${x}" y="${y}" width="22" height="11" fill="none" stroke="${INK}" stroke-opacity="0.8"/><rect x="${x + 22}" y="${y + 3}" width="2.5" height="5" fill="${INK}" fill-opacity="0.8"/><rect x="${x + 2}" y="${y + 2}" width="13" height="7" fill="${SAND}"/>`;

/**
 * Board and laptop on battery, apart, with no mains lead.
 * @param {{distance?:string, mat?:boolean}} options
 */
export function mainsFigure({ distance = 'about 1 m', mat = false, narrow = narrowScreen() } = {}) {
  if (narrow) return mainsNarrow({ distance, mat });
  const W = 420, H = 272;
  let b = '';
  if (mat) b += `<rect x="34" y="150" width="138" height="12" fill="${BODY}" stroke="${LINE}"/>` + note(103, 176, 'mat, taped down', { anchor: 'middle' });
  // Board
  b += `<rect x="58" y="96" width="90" height="54" fill="${BODY}" stroke="${INK}" stroke-opacity="0.82" stroke-width="1.4"/>`
    + `<circle cx="72" cy="110" r="2" fill="${MUTED}"/><circle cx="80" cy="110" r="2" fill="${MUTED}"/><circle cx="88" cy="110" r="2" fill="${MUTED}"/>`
    + battery(114, 130) + label(103, 84, 'NPG Lite', { anchor: 'middle' });
  // Leads to the body
  b += `<path d="M64 110C46 100 38 78 30 60M72 110C60 92 56 74 52 56M80 110C74 90 76 72 74 52" fill="none" stroke="${MUTED}" stroke-opacity="0.7"/>` + note(26, 46, 'to the electrodes');
  // Laptop
  b += `<rect x="286" y="70" width="96" height="62" fill="${BODY}" stroke="${INK}" stroke-opacity="0.82" stroke-width="1.4"/>`
    + `<path d="M274 140H394L386 132H282Z" fill="${BODY}" stroke="${INK}" stroke-opacity="0.82" stroke-width="1.4"/>`
    + battery(323, 95) + label(334, 58, 'Laptop', { anchor: 'middle' });
  // Bluetooth, no wire between them
  b += `<path d="M156 112C200 96 240 96 278 108" fill="none" stroke="${PERI}" stroke-dasharray="3 5"/>` + note(217, 92, 'Bluetooth', { anchor: 'middle', fill: PERI });
  // Distance
  b += `<path d="M103 228H334M103 222V234M334 222V234" stroke="${BRASS}" fill="none"/>` + label(218, 252, distance, { anchor: 'middle', fill: SAND });
  // No mains
  b += `<g transform="translate(356 166)"><rect x="-10" y="-8" width="20" height="16" fill="none" stroke="${MUTED}"/><path d="M-5 -8V-15M5 -8V-15M0 8V20" stroke="${MUTED}"/>`
    + `<path d="M-17 -19L17 17" stroke="${ROSE}" stroke-width="2"/></g>` + note(352, 206, 'no mains lead', { anchor: 'middle' });
  return figure(svg(W, H, `Board and laptop on battery, ${distance} apart, linked by Bluetooth, with no mains lead.`, b));
}

/** The same scene for a phone: board left, laptop right, the lengths and the warnings under them. */
function mainsNarrow({ distance, mat }) {
  const { W, note: ns, label: ls } = N, H = 300;
  let b = '';
  b += note(16, 42, 'to the electrodes', { size: ns });
  b += `<path d="M28 116C16 110 12 84 16 54M28 124C10 114 26 80 30 54M28 132C6 120 42 78 44 54" fill="none" stroke="${MUTED}" stroke-opacity="0.7"/>`;
  if (mat) b += `<rect x="18" y="152" width="96" height="10" fill="${BODY}" stroke="${LINE}"/>` + note(16, 188, 'mat, taped down', { size: ns });
  b += `<rect x="28" y="104" width="76" height="48" fill="${BODY}" stroke="${INK}" stroke-opacity="0.82" stroke-width="1.4"/>`
    + `<circle cx="40" cy="117" r="2" fill="${MUTED}"/><circle cx="48" cy="117" r="2" fill="${MUTED}"/><circle cx="56" cy="117" r="2" fill="${MUTED}"/>`
    + battery(74, 134) + label(66, 94, 'NPG Lite', { anchor: 'middle', size: ls });
  b += `<rect x="206" y="96" width="76" height="50" fill="${BODY}" stroke="${INK}" stroke-opacity="0.82" stroke-width="1.4"/>`
    + `<path d="M198 154H290L282 146H206Z" fill="${BODY}" stroke="${INK}" stroke-opacity="0.82" stroke-width="1.4"/>`
    + battery(233, 115) + label(244, 84, 'Laptop', { anchor: 'middle', size: ls });
  b += `<path d="M110 124C136 110 172 110 200 120" fill="none" stroke="${PERI}" stroke-dasharray="3 5"/>` + note(155, 146, 'Bluetooth', { anchor: 'middle', fill: PERI, size: ns });
  b += `<g transform="translate(258 186)"><rect x="-10" y="-8" width="20" height="16" fill="none" stroke="${MUTED}"/><path d="M-5 -8V-15M5 -8V-15M0 8V20" stroke="${MUTED}"/>`
    + `<path d="M-17 -19L17 17" stroke="${ROSE}" stroke-width="2"/></g>` + note(284, 228, 'no mains lead', { anchor: 'end', size: ns });
  b += `<path d="M66 250H244M66 244V256M244 244V256" stroke="${BRASS}" fill="none"/>` + label(155, 280, distance, { anchor: 'middle', fill: SAND, size: ls });
  return figure(svg(W, H, `Board and laptop on battery, ${distance} apart, linked by Bluetooth, with no mains lead.`, b));
}

/** A seeded noise source, so the illustration is the same at every draw. */
function noise(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 - 0.5; };
}

const path = (points) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${round(x)} ${round(y)}`).join('');

/** One illustrated trace: `shape(t, rand)` returns the deflection, t from 0 to 1. */
function trace({ x0, x1, y, amp, shape, seed, color = INK }) {
  const rand = noise(seed), n = 220, pts = [];
  for (let i = 0; i <= n; i++) { const t = i / n; pts.push([x0 + t * (x1 - x0), y - amp * shape(t, rand)]); }
  return `<path d="${path(pts)}" fill="none" stroke="${color}" stroke-width="1.2" stroke-linejoin="round"/>`;
}

const eeg = (rand, t) => 0.35 * Math.sin(t * 70) + 0.25 * Math.sin(t * 131 + 1) + 0.5 * rand();
const clench = (t, rand) => eeg(rand, t) + (t > 0.52 && t < 0.7 ? 2.6 * rand() * Math.sin(Math.PI * (t - 0.52) / 0.18) : 0);
const clipped = (t, rand) => Math.max(-0.9, Math.min(0.9, 2.4 * Math.sin(t * 9) + eeg(rand, t)));
const ecg = (t, rand) => {
  const beat = (t * 5.2) % 1;
  const r = Math.exp(-((beat - 0.5) ** 2) / 0.0004) * 2.2 - Math.exp(-((beat - 0.47) ** 2) / 0.0003) * 0.3 - Math.exp(-((beat - 0.53) ** 2) / 0.0004) * 0.5;
  return r + 0.35 * Math.exp(-((beat - 0.78) ** 2) / 0.004) + 0.06 * rand();
};

/**
 * What a working signal looks like, and what to fix. Shapes, not values.
 * @param {'eeg'|'body'} kind eeg: one EEG channel and a jaw clench; body: ECG beats and mains lines
 */
export function signalFigure(kind = 'eeg', { narrow = narrowScreen() } = {}) {
  if (narrow) return signalNarrow(kind);
  const W = 420, H = kind === 'eeg' ? 268 : 300;
  const x0 = 26, x1 = W - 26;
  let b = '';
  if (kind === 'eeg') {
    b += label(x0, 40, 'Clench your jaw once')
      + `<rect x="${x0 + 0.52 * (x1 - x0)}" y="52" width="${0.18 * (x1 - x0)}" height="72" fill="${SAND}" fill-opacity="0.1"/>`
      + trace({ x0, x1, y: 88, amp: 13, shape: clench, seed: 7 }) + note(x0 + 0.61 * (x1 - x0), 140, 'a burst you can see', { anchor: 'middle', fill: SAND });
    b += label(x0, 170, 'Fix before you start')
      + `<path d="M${x0} 186H${(x0 + x1) / 2 - 12}M${x0} 222H${(x0 + x1) / 2 - 12}" stroke="${ROSE}" stroke-opacity="0.5" stroke-dasharray="2 3"/>`
      + trace({ x0, x1: (x0 + x1) / 2 - 12, y: 204, amp: 20, shape: clipped, seed: 3 })
      + `<path d="M${(x0 + x1) / 2 + 12} 204H${x1}" stroke="${INK}" stroke-width="1.2"/>`
      + note(x0, 244, 'clips at the rail') + note((x0 + x1) / 2 + 12, 244, 'stays flat');
    return figure(svg(W, H, 'Illustration of one EEG channel: a jaw clench shows as a burst. A trace that clips at the rail or stays flat needs fixing first.', b));
  }
  b += label(x0, 40, 'Beats on the ECG')
    + trace({ x0, x1, y: 86, amp: 16, shape: ecg, seed: 5 });
  // A spectrum sketch with narrow lines at 33 and 67 Hz over 0–100 Hz.
  const sx = (f) => x0 + (f / 100) * (x1 - x0), base = 236;
  const spec = [];
  for (let f = 0; f <= 100; f += 0.5) {
    const line = Math.exp(-((f - 33) ** 2) / 0.4) * 46 + Math.exp(-((f - 67) ** 2) / 0.4) * 34;
    spec.push([sx(f), base - (54 * Math.exp(-f / 9) + 10 + line)]);
  }
  b += label(x0, 140, 'Narrow lines at 33 and 67 Hz')
    + `<path d="M${x0} ${base}H${x1}" stroke="${LINE}"/>` + `<path d="${path(spec)}" fill="none" stroke="${INK}" stroke-width="1.2"/>`
    + note(sx(33), base + 16, '33 Hz', { anchor: 'middle', fill: SAND }) + note(sx(67), base + 16, '67 Hz', { anchor: 'middle', fill: SAND })
    + note(x0, base + 36, 'check the contacts and the wiring');
  return figure(svg(W, H, 'Illustration: beats should show on the ECG. Narrow spectrum lines at 33 and 67 Hz mean a contact or wiring to check.', b));
}

/** The same two checks for a phone: the rows stack and the words grow, the traces keep their shapes. */
function signalNarrow(kind) {
  const { W, note: ns, label: ls } = N;
  const x0 = 18, x1 = W - 18;
  let b = '';
  if (kind === 'eeg') {
    const H = 300, mid = (x0 + x1) / 2;
    b += label(x0, 44, 'Clench your jaw once', { size: ls })
      + `<rect x="${x0 + 0.52 * (x1 - x0)}" y="60" width="${0.18 * (x1 - x0)}" height="76" fill="${SAND}" fill-opacity="0.1"/>`
      + trace({ x0, x1, y: 98, amp: 14, shape: clench, seed: 7 }) + note(x1, 158, 'a burst you can see', { anchor: 'end', fill: SAND, size: ns });
    b += label(x0, 200, 'Fix before you start', { size: ls })
      + `<path d="M${x0} 214H${mid - 10}M${x0} 252H${mid - 10}" stroke="${ROSE}" stroke-opacity="0.5" stroke-dasharray="2 3"/>`
      + trace({ x0, x1: mid - 10, y: 233, amp: 21, shape: clipped, seed: 3 })
      + `<path d="M${mid + 10} 233H${x1}" stroke="${INK}" stroke-width="1.2"/>`
      + note(x0, 280, 'clips at the rail', { size: ns }) + note(x1, 280, 'stays flat', { anchor: 'end', size: ns });
    return figure(svg(W, H, 'Illustration of one EEG channel: a jaw clench shows as a burst. A trace that clips at the rail or stays flat needs fixing first.', b));
  }
  const H = 340, sx = (f) => x0 + (f / 100) * (x1 - x0), base = 252;
  b += label(x0, 44, 'Beats on the ECG', { size: ls }) + trace({ x0, x1, y: 92, amp: 17, shape: ecg, seed: 5 });
  const spec = [];
  for (let f = 0; f <= 100; f += 0.5) {
    const line = Math.exp(-((f - 33) ** 2) / 0.4) * 50 + Math.exp(-((f - 67) ** 2) / 0.4) * 38;
    spec.push([sx(f), base - (56 * Math.exp(-f / 9) + 10 + line)]);
  }
  b += label(x0, 150, 'Narrow lines at 33 and 67 Hz', { size: ls })
    + `<path d="M${x0} ${base}H${x1}" stroke="${LINE}"/>` + `<path d="${path(spec)}" fill="none" stroke="${INK}" stroke-width="1.2"/>`
    + note(sx(33), base + 20, '33 Hz', { anchor: 'middle', fill: SAND, size: ns }) + note(sx(67), base + 20, '67 Hz', { anchor: 'middle', fill: SAND, size: ns })
    + note(x0, base + 50, 'check the contacts', { size: ns }) + note(x0, base + 72, 'and the wiring', { size: ns });
  return figure(svg(W, H, 'Illustration: beats should show on the ECG. Narrow spectrum lines at 33 and 67 Hz mean a contact or wiring to check.', b));
}

/**
 * The placement plates of a montage, one view at a time, with every pin and site listed.
 * list: false leaves the lead list to the page; compact: false keeps the site names on the plate.
 * @param {{pin:string, site:string, siteLabel:string, cableColor:string, role:string}[]} leads
 */
export function placementStage(leads, { list: withList = true, compact = true } = {}) {
  const views = placementViews(leads);
  const plate = h('div', { class: 'td-stage-svg td-stage-plate' });
  const buttons = views.map((view) => h('button', { type: 'button', class: 'td-stage-view', 'aria-pressed': 'false', onclick: () => pick(view) }, view[0].toUpperCase() + view.slice(1)));
  let at = 0;
  const pick = (view) => {
    at = views.indexOf(view);
    plate.innerHTML = placementSvg(view, leads, { compact });
    buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(views[i] === view)));
  };
  pick(views[0]);
  // A sideways swipe on the plate turns to the next or previous view, as the buttons do.
  let start = null;
  plate.addEventListener('touchstart', (event) => { const t = event.touches[0]; start = t ? [t.clientX, t.clientY] : null; }, { passive: true });
  plate.addEventListener('touchend', (event) => {
    const t = event.changedTouches[0];
    if (!start || !t) return;
    const dx = t.clientX - start[0], dy = t.clientY - start[1];
    start = null;
    if (Math.abs(dx) < 48 || Math.abs(dx) < 1.5 * Math.abs(dy)) return;
    const next = at + (dx < 0 ? 1 : -1);
    if (next >= 0 && next < views.length) pick(views[next]);
  }, { passive: true });
  const list = withList ? h('ul', { class: 'td-stage-leads' }, ...placementLeads(leads).map((l) => h('li', {},
    h('i', { style: `background:${l.color}` }), h('strong', { text: l.pin }), h('span', { text: l.where })))) : null;
  return h('figure', { class: 'td-stage-figure' },
    h('div', { class: 'td-stage-views', role: 'group', 'aria-label': 'View' }, ...buttons), plate, list);
}

/**
 * What an exported bundle holds.
 * @param {{reportHref?:string}} options
 */
export function bundleStage({ reportHref = '../report/' } = {}) {
  const files = [
    ['raw.csv', 'Every sample, as unaltered ADC counts'],
    ['windows.csv', 'One row per analysis window, with its checks'],
    ['metadata.json', 'Settings, blocks, events and your confirmations'],
    ['manifest.json', 'A SHA-256 checksum for each file'],
  ];
  return h('figure', { class: 'td-stage-figure td-bundle' },
    h('p', { class: 'td-bundle-zip' }, h('span', { class: 'td-mono', text: 'session.zip' })),
    h('ul', {}, ...files.map(([name, what]) => h('li', {}, h('span', { class: 'td-mono', text: name }), h('span', { text: what })))),
    h('p', { class: 'td-caption' }, 'The ', h('a', { href: reportHref, text: 'report page' }), ' reopens a bundle without the board.'));
}
