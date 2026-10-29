/**
 * Design catalogue: every token, component state and chart form used by the instruments.
 * All chart data here are synthetic and drawn with the simulated watermark.
 */
import { h, statusIcon, actionButton } from '../../src/ui/dom.js';
import { createCanvas, drawTrace, drawSpectrum, drawPairs, drawTimeline } from '../../src/ui/charts/canvas.js';
import { montageSvg, SITES_1020, REGION_LETTERS } from '../../src/ui/components/montage.js';
import { theme } from '../../src/design/theme.js';
import { MONTAGES } from '../berger/config.js';

const root = document.getElementById('app');
const report = await fetch('../../src/design/contrast-report.json').then((r) => r.json()).catch(() => null);

const panel = (index, title, kicker, ...body) => h('section', { class: 'td-panel', 'aria-label': title },
  h('header', {}, h('h2', {}, h('span', { class: 'td-index', text: index }), title), kicker ? h('span', { class: 'td-kicker', text: kicker }) : null),
  h('div', { class: 'td-body' }, ...body));

root.append(h('header', { class: 'td-header' },
  h('a', { href: '../', 'aria-label': 'Thermodrift Lab home' }, h('img', { class: 'td-logo', src: '../../brand/thermodrift-logo.png', width: 1172, height: 227, alt: 'Thermodrift' })),
  h('div', { class: 'td-app-name' }, h('strong', { text: 'Design catalogue' }), h('span', { class: 'td-caption', text: `tokens v${theme.version} · square geometry · 8 px rhythm` }))));

const main = h('main', { class: 'td-main' });
root.append(main);

// ---------------------------------------------------------------- 01 colour
const swatches = Object.entries(theme.color).flatMap(([group, value]) => (typeof value === 'object' ? Object.entries(value).map(([name, v]) => [`${group}-${name}`, v]) : [[group, value]]));
main.append(panel('01', 'Colour', 'from tokens.json',
  h('div', { class: 'ct-swatches' }, ...swatches.map(([name, value]) => h('div', { class: 'ct-swatch' }, h('i', { style: `background:${value}` }), h('span', {}, h('b', { text: name }), h('br'), value)))),
  report ? h('div', { class: 'td-scroll-x' }, h('table', { class: 'td-table' },
    h('caption', { class: 'td-caption', style: 'text-align:left;padding-bottom:6px', text: `Contrast (WCAG 2.x): ${report.pairs.filter((p) => p.pass).length} of ${report.pairs.length} pairs pass. Brand red carries fills and labels with white text, never text on navy.` }),
    h('thead', {}, h('tr', {}, ...['Pair', 'Ratio', 'Minimum', ''].map((t) => h('th', { scope: 'col', text: t })))),
    h('tbody', {}, ...report.pairs.map((p) => h('tr', {}, h('td', { text: p.name }), h('td', { class: 'td-num', text: p.ratio.toFixed(2) }), h('td', { class: 'td-num', text: p.min }), h('td', {}, statusIcon(p.pass ? 'ready' : 'error'), p.pass ? ' pass' : ' fail')))))) : null));

// ---------------------------------------------------------------- 02 type
main.append(panel('02', 'Type', null,
  h('div', { class: 'ct-type' },
    h('p', { style: `font:400 ${theme.text['3xl']}px/1 ${theme.font.editorial};text-shadow:var(--td-shadow-title)`, text: 'Thermodrift' }),
    h('p', { style: `font:400 ${theme.text.xl}px/1.15 ${theme.font.editorial}`, text: 'Editorial · Georgia · titles and story' }),
    h('p', { style: `font:400 ${theme.text.md}px/1.5 ${theme.font.ui}`, text: 'Interface · system sans · controls, labels, explanations' }),
    h('p', { class: 'td-num', style: `font-size:${theme.text.xl}px;color:var(--td-color-data-rose)`, text: '2.00× · 120,000 samples · 0.49 Hz' }),
    h('p', { class: 'td-mono', text: 'mono · session ids, hashes · 98436b86f5a5adc3' }),
    h('p', {}, h('span', { class: 'td-label', text: 'Label' }), ' ', h('span', { class: 'td-kicker', text: 'Kicker' }), ' ', h('span', { class: 'td-index', text: '01' })))));

// ---------------------------------------------------------------- 03 components and states
const states = [
  ['Enabled', { enabled: true, label: 'Start acquisition', why: null }],
  ['Blocked, with reason', { enabled: false, label: 'Start acquisition', why: 'Complete setup: wiring check, pads.' }],
  ['Enabled, with note', { enabled: true, label: 'Restart acquisition', why: null, note: 'Opens a new segment in this session. Filters restart.' }],
  ['Busy', { enabled: false, label: 'Connecting…', why: 'Choose the NPG in the browser dialog.' }],
];
const buttons = states.map(([caption, state], i) => {
  const b = actionButton({ className: i === 0 ? 'td-btn td-btn--primary' : 'td-btn', onClick: () => {} });
  b.update(state);
  return h('div', { class: 'td-field' }, h('span', { text: caption }), b.el);
});
const protocolButton = actionButton({ className: 'td-btn td-protocol-btn td-btn--primary', onClick: () => {} });
protocolButton.update({ enabled: true, label: 'Long Berger test', content: () => [h('span', { class: 'td-index', text: '03' }), h('b', { text: 'Long Berger test' }), h('small', { text: '9 min 20 s · four open/closed pairs' })] });
const protocolBlocked = actionButton({ className: 'td-btn td-protocol-btn', onClick: () => {} });
protocolBlocked.update({ enabled: false, label: 'Long Berger test', why: 'Test the spoken cue and confirm you heard it.', content: () => [h('span', { class: 'td-index', text: '03' }), h('b', { text: 'Long Berger test' }), h('small', { text: '9 min 20 s · four open/closed pairs' })] });
const tones = [['ready', 'Device', 'Connected'], ['live', 'Acquisition', 'Acquiring'], ['warning', 'Missing', '12'], ['error', 'Raw', 'ADC clipping'], ['stale', 'Acquisition', 'Stale — no data'], ['idle', 'Acquisition', 'Stopped'], ['simulated', 'Source', 'Simulated']];
const cards = [
  ['idle', 'No protocol yet', 'Acquire, inspect the signal, then start a protocol.'],
  ['running', 'Pair 2 · eyes closed', 'Pair 2 of 4: eyes closed for 60 seconds. Stay awake; rest face and jaw.'],
  ['completed', 'Completed — review & save', 'Review adherence below, then finish the session and open the report.'],
  ['interrupted', 'Interrupted — Data stream stalled', 'Data up to the interruption are saved. Start a new protocol when ready.'],
];
main.append(panel('03', 'Components and states', 'a blocked control always says why, next to itself',
  h('div', { class: 'ct-states' }, ...buttons),
  h('div', { class: 'ct-states' }, h('div', { class: 'td-field' }, h('span', { text: 'Protocol launcher' }), protocolButton.el), h('div', { class: 'td-field' }, h('span', { text: 'Protocol launcher, blocked' }), protocolBlocked.el)),
  h('div', { class: 'td-status-strip', style: 'border:1px solid var(--td-color-surface-border)' }, ...tones.map(([tone, label, value]) => h('span', { class: 'td-status', dataset: { tone } }, statusIcon(tone), h('span', { class: 'td-status-label', text: label }), h('span', { class: 'td-status-value', text: value })))),
  h('p', { class: 'td-caption', text: 'Status shape carries the meaning (check, dot, triangle, cross, dashed ring, hatch); colour only reinforces it.' }),
  h('div', { class: 'ct-states' }, ...cards.map(([state, title, instruction]) => h('div', { class: 'td-block-card', dataset: { state } },
    h('span', { class: 'td-kicker', text: `Current block · ${state}` }), h('strong', { text: title }),
    state === 'running' ? h('div', { class: 'td-countdown td-num', text: '37 s' }) : null,
    state === 'running' ? h('div', { class: 'td-progress' }, h('i', { style: 'width:38%' })) : null,
    h('p', { text: instruction })))),
  h('div', { class: 'td-simulated-banner', role: 'note', text: 'SIMULATED — a synthetic test pattern, not a recording and not physiology.' }),
  h('div', { class: 'ct-states' },
    h('label', { class: 'td-field' }, h('span', { text: 'Select' }), h('select', {}, h('option', { text: 'One channel · Oz − left ear' }))),
    h('label', { class: 'td-field' }, h('span', { text: 'Disabled (locked setup)' }), h('select', { disabled: true }, h('option', { text: 'One channel · Oz − left ear' }))),
    h('label', { class: 'td-field' }, h('span', { text: 'Text' }), h('textarea', { rows: 2, placeholder: 'I expect … I would call it inconclusive if …' })),
    h('div', { class: 'td-field' }, h('span', { text: 'Checks' }),
      h('label', { class: 'td-check' }, h('input', { type: 'checkbox', checked: true }), h('span', { text: 'Checked' })),
      h('label', { class: 'td-check' }, h('input', { type: 'checkbox' }), h('span', { text: 'Unchecked' })),
      h('label', { class: 'td-check' }, h('input', { type: 'checkbox', disabled: true }), h('span', { text: 'Disabled' }))))));

// ---------------------------------------------------------------- 04 charts (synthetic)
let s = 7;
const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
const trace = Array.from({ length: 1024 }, (_, i) => 18 * Math.sin((2 * Math.PI * 10 * i) / 500) + 6 * gauss());
const psd = Array.from({ length: 513 }, (_, k) => { const f = (k * 500) / 1024; return 40 / (1 + f) + 30 * Math.exp(-((f - 10) ** 2) / 2) + 60 * Math.exp(-((f - 50) ** 2) / 0.3) + 0.4; });
// Round, obviously synthetic values: never echo a real session's results here.
const pairs = [
  { pair: 1, open: 100, closed: 200, status: 'eligible', ratio: 2 },
  { pair: 2, open: 100, closed: 300, status: 'eligible', ratio: 3 },
  { pair: 3, open: 100, closed: 150, status: 'eligible', ratio: 1.5 },
  { pair: 4, open: 100, closed: null, status: 'excluded', ratio: null },
];
const blocks = ['settling_eyes_open', 'eyes_open_pair1', 'eyes_closed_pair1', 'eyes_closed_pair2', 'eyes_open_pair2'].map((label, i) => ({ label, start_arrival_ms: i * 20000, end_arrival_ms: (i + 1) * 20000 }));
const timelineWindows = Array.from({ length: 24 }, (_, i) => {
  const mid = 2500 + i * 4100;
  const block = blocks.find((b) => mid >= b.start_arrival_ms && mid < b.end_arrival_ms);
  const closed = block?.label.startsWith('eyes_closed');
  return { mid_ms: mid, value: (closed ? 200 : 100) * (0.8 + 0.4 * rand()), state: closed ? 'closed' : block?.label.startsWith('eyes_open') ? 'open' : 'other', good: rand() > 0.15 };
});
const chartCell = (title, height, draw) => {
  const host = h('div');
  queueMicrotask(() => draw(createCanvas(host, { height, label: `${title} (synthetic)` })));
  return h('div', { class: 'td-chart' }, h('div', { class: 'td-chart-head' }, h('strong', { text: title }), h('span', { text: 'synthetic' })), host);
};
main.append(panel('04', 'Charts', 'synthetic data, always watermarked',
  h('p', { class: 'td-caption', text: 'Grammar: every axis states its unit; ADC counts are never called µV; an FFT magnitude is never called a PSD; gaps are never bridged; a status message replaces data that are missing, stale or hidden.' }),
  h('div', { class: 'ct-states' },
    chartCell('Trace', 170, (c) => drawTrace(c, { samples: trace, range: 50, unit: 'Count-equivalent', simulated: true, centre: false })),
    chartCell('Trace · stale', 170, (c) => drawTrace(c, { samples: trace, range: 50, unit: 'Count-equivalent', status: 'Stale: no data for 2 s', simulated: true })),
    chartCell('Welch PSD', 200, (c) => drawSpectrum(c, { values: psd, kind: 'psd', maxHz: 100, unit: 'PSD (dB re 1 count²/Hz)', simulated: true })),
    chartCell('Spectrum · hidden during protocol', 200, (c) => drawSpectrum(c, { values: psd, kind: 'magnitude', maxHz: 45, unit: 'FFT magnitude, count-equiv.', status: 'Hidden during the protocol', simulated: true }))),
  chartCell('Pairs', 240, (c) => drawPairs(c, { pairs, simulated: true })),
  chartCell('Timeline', 220, (c) => drawTimeline(c, { windows: timelineWindows, blocks, markers: [{ arrival_ms: 47000, note: 'swallow' }], origin: 0, simulated: true }))));

// ---------------------------------------------------------------- 05 montage and 10–20 names
const allSites = Object.keys(SITES_1020).filter((k) => !['M1', 'M2'].includes(k)).map((site) => ({ site, pin: '', cable: 'none', cableColor: 'transparent', role: '' }));
main.append(panel('05', 'Montages and the 10–20 map', 'pin labels are authoritative; cable colours are for recognition',
  h('div', { class: 'ct-montages' }, ...Object.values(MONTAGES).map((m) => h('figure', { class: 'td-montage', style: 'margin:0' }, montageSvg({ leads: m.leads }), h('figcaption', { class: 'td-caption', text: m.label })))),
  h('div', { class: 'ct-regions' }, ...Object.entries(REGION_LETTERS).map(([letter, region]) => h('span', {}, h('b', { text: letter }), ` ${region}`)), h('span', { text: 'odd numbers left · even right · z midline' })),
  h('p', { class: 'td-caption', text: `${allSites.length} standard sites plus mastoids M1/M2, drawn on a spherical head model (azimuthal equidistant projection).` })));

// ---------------------------------------------------------------- 06 motion and focus
main.append(panel('06', 'Motion and focus', null,
  h('div', { class: 'ct-motion', 'aria-hidden': 'true' }),
  h('p', { class: 'td-caption', text: 'Motion is decorative only and stops under prefers-reduced-motion. Live charts redraw at most four times a second.' }),
  h('div', { class: 'ct-row' }, h('button', { class: 'td-btn', type: 'button' }, 'Tab to me: focus ring'), h('a', { href: '#top' }, 'Link focus'))));
