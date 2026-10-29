/**
 * Berger Lab 3.2 — live acquisition surface.
 * Saved sessions open in ../report/, which never connects to hardware.
 *
 *   ?source=simulated   synthetic test pattern + silent cues (labelled everywhere)
 *   (default)           NPG Lite over Web Bluetooth + spoken cues
 */
import { h, setText, statusIcon, actionButton } from '../../src/ui/dom.js';
import { createCanvas, drawTrace, drawSpectrum, drawPairs } from '../../src/ui/charts/canvas.js';
import { montageSvg } from '../../src/ui/components/montage.js';
import { LabController } from '../../src/lab/controller.js';
import { controlStates, protocolCard, statusItems, humanLabel } from '../../src/lab/viewmodel.js';
import { BergerV3WindowEngine, pairedResults } from '../../src/analysis/berger-v3.js';
import { createDisplayProcessor } from '../../src/core/display-reference.js';
import { openIdbStore } from '../../src/session/store-idb.js';
import { MemoryStore } from '../../src/session/store-memory.js';
import { createNpgBleTransport } from '../../src/transport/npg-ble.js';
import { createSimulatedTransport } from '../../src/transport/simulated.js';
import { createSpeechCues, createSilentCues } from '../../src/protocol/cues.js';
import { createSessionLocks, recoverAbandonedSessions } from '../../src/lab/locks.js';
import { COMPLETION_CUE, INTERRUPTION_CUE } from '../../src/protocol/berger-protocol.js';
import { saveBundle } from '../../src/ui/save-bundle.js';
import { APP, MONTAGES, channelLabel, protocolEntries, describeBergerSession } from './config.js';

const simulated = new URLSearchParams(location.search).get('source') === 'simulated';
const root = document.getElementById('app');
const fmt = (v, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : '—');

// UI-only state. Session data live in the controller and the store.
const ui = {
  montageId: 'single',
  view: 'eeg',
  notch: '50h',
  spectrumMax: 45,
  traceRange: 50,
  hideDuringProtocol: true,
  blockSeconds: 60,
  audioCondition: 'cues_only',
  setup: { battery_only: false, contact: false, routing: false, pad_condition: 'unknown', placement_notes: '', hypothesis: '', audio_notes: '' },
  refusals: new Map(),
  markers: [],
  protocolSignature: '',
};

// ---------------------------------------------------------------- infrastructure
let store;
let storeWarning = null;
try {
  store = await openIdbStore();
} catch (error) {
  store = new MemoryStore();
  storeWarning = `Browser storage unavailable (${error.message}). This session lives in this tab only: export before closing.`;
}
const locks = createSessionLocks();
const recovered = await recoverAbandonedSessions(store, locks).catch(() => []);
const transport = simulated ? createSimulatedTransport() : createNpgBleTransport();
const cues = simulated ? createSilentCues('simulated session') : createSpeechCues() ?? createSilentCues('speech synthesis unavailable');

/** Display processor for the selected view (display only; the analysis path is fixed). */
function createDisplay() {
  const { view, notch } = ui;
  const make = () => (view === 'raw' ? null : createDisplayProcessor(view, { notch50: notch !== 'off', harmonics: notch === '50h' }));
  let proc = make();
  return {
    push(row) { proc?.push(row.channels[0]); },
    reset() { proc = make(); },
    get proc() { return proc; },
    describe() {
      return { selected_view: view, notch, reference: proc?.describe() ?? 'raw ADC + Welch PSD', upstream_snapshot: 'Chords-Web a0a77f7 (2.7.1a): numerical reference, not its UI code' };
    },
  };
}

const controller = new LabController({
  app: { id: APP.id, version: APP.version, analysisPlan: APP.analysisPlan },
  transport,
  store,
  analysis: { createEngine: (montage) => new BergerV3WindowEngine({ mode: montage?.id ?? 'single', derived: false }) },
  cues: () => cues,
  createDisplay,
  describe: (ctx) => describeBergerSession({ ...ctx, display: controller.display?.describe() }),
  channelLabel,
  locks,
  onProtocolEnded: (last, state) => {
    if (last?.name === 'berger' && cues.kind === 'speech') cues.speak(state === 'completed' ? COMPLETION_CUE : INTERRUPTION_CUE, {});
    resultsDirty = true;
  },
});
window.__bergerLab = controller; // DevTools inspection only

// ---------------------------------------------------------------- header, notices, status
const sessionLabel = h('span', { class: 'td-caption td-mono', text: 'No session yet' });
root.append(h('header', { class: 'td-header' },
  h('a', { href: '../', 'aria-label': 'Thermodrift Lab home' }, h('img', { class: 'td-logo', src: '../../brand/thermodrift-logo.png', width: 1172, height: 227, alt: 'Thermodrift' })),
  h('div', { class: 'td-app-name' }, h('strong', { text: APP.name }), h('span', { class: 'td-caption', text: `v${APP.version} · eyes-open / eyes-closed alpha · analysis plan berger-v3` })),
  h('span', { class: 'td-spacer' }),
  h('span', { class: 'td-source', dataset: { kind: simulated ? 'simulated' : 'ble' } }, statusIcon(simulated ? 'simulated' : 'live'), simulated ? 'Simulated test pattern' : 'NPG Lite · Bluetooth'),
  sessionLabel));
if (simulated) root.append(h('div', { class: 'td-simulated-banner', role: 'note' }, 'SIMULATED — a synthetic test pattern, not a recording and not physiology. For trying the interface.'));
const notices = h('div');
root.append(notices);
if (storeWarning) notices.append(h('p', { class: 'bl-notice', text: storeWarning }));
if (recovered.length) notices.append(h('p', { class: 'bl-notice' }, `${recovered.length} earlier session${recovered.length > 1 ? 's were' : ' was'} left open by a closed tab; marked interrupted, data kept. `, h('a', { href: '../', text: 'Sessions' })));
const statusStrip = h('div', { class: 'td-status-strip', role: 'status', 'aria-label': 'Acquisition status' });
root.append(statusStrip);

// ---------------------------------------------------------------- transport bar
const buttons = {
  connect: actionButton({ className: 'td-btn td-btn--primary', onClick: () => controller.connect() }),
  start: actionButton({ onClick: () => startAcquisition() }),
  stop: actionButton({ onClick: () => controller.stopAcquisition() }),
  disconnect: actionButton({ onClick: () => controller.disconnect() }),
  finish: actionButton({ onClick: () => finishSession() }),
  newSession: actionButton({ onClick: () => newSession() }),
  export: actionButton({ onClick: () => exportBundle() }),
};
const exportStatus = h('p', { class: 'bl-export-status', role: 'status' });
const reportLink = h('a', { class: 'td-btn td-btn--light bl-report-link', hidden: true }, 'Open report');
root.append(h('div', { class: 'bl-transport', role: 'toolbar', 'aria-label': 'Acquisition controls' },
  buttons.connect.el, buttons.start.el, buttons.stop.el, buttons.disconnect.el,
  h('span', { class: 'td-spacer' }),
  buttons.finish.el, buttons.newSession.el, buttons.export.el, reportLink, exportStatus));

// ---------------------------------------------------------------- 01 setup
const montageSelect = h('select', {}, ...Object.values(MONTAGES).map((m) => h('option', { value: m.id, text: m.label })));
const montageFigure = h('div', { class: 'td-montage' });
const leadList = h('div', { class: 'td-lead-list' });
const montageNotes = h('p', { class: 'td-caption' });
const checks = { battery_only: h('input', { type: 'checkbox' }), contact: h('input', { type: 'checkbox' }), routing: h('input', { type: 'checkbox' }) };
const routingText = h('span');
const padSelect = h('select', {}, ...[['unknown', 'Not recorded'], ['fresh', 'Fresh pads today'], ['retained', 'Kept from an earlier session'], ['reapplied', 'Peeled and reapplied']].map(([v, t]) => h('option', { value: v, text: t })));
const placement = h('textarea', { rows: 2, placeholder: 'Actual sites, pad model, CN switch state' });
const hypothesis = h('textarea', { rows: 2, placeholder: 'I expect … I would call it inconclusive if …' });
const audioNotes = h('textarea', { rows: 1, placeholder: 'Headphones or speakers; any external audio' });
const lockedNote = h('p', { class: 'bl-locked', hidden: true, text: 'Setup is locked for this session. Finish it and start a new session to rewire.' });
const setupFields = [montageSelect, ...Object.values(checks), padSelect, placement, hypothesis, audioNotes];
const field = (label, control) => h('label', { class: 'td-field' }, h('span', { text: label }), control);
const panel = (index, title, kicker, ...body) => h('section', { class: 'td-panel', 'aria-label': title },
  h('header', {}, h('h2', {}, h('span', { class: 'td-index', text: index }), title), kicker ? h('span', { class: 'td-kicker', text: kicker }) : null),
  h('div', { class: 'td-body' }, ...body));

const setupPanel = panel('01', 'Setup', null,
  field('Montage', montageSelect), montageFigure, leadList, montageNotes,
  field('Pads', padSelect),
  h('div', { class: 'td-field' }, h('span', { text: 'Before acquisition' }),
    h('label', { class: 'td-check' }, checks.battery_only, h('span', { text: 'NPG and laptop on battery; nothing mains-powered touches the setup.' })),
    h('label', { class: 'td-check' }, checks.contact, h('span', { text: 'Skin intact and comfortable; contacts stable.' })),
    h('label', { class: 'td-check' }, checks.routing, routingText)),
  field('Placement notes', placement),
  field('Prediction', hypothesis),
  field('Audio notes', audioNotes),
  lockedNote);

// ---------------------------------------------------------------- 02 signal
const select = (options, value) => h('select', {}, ...options.map(([v, t]) => h('option', { value: v, text: t, selected: String(v) === String(value) })));
const viewSelect = select([['eeg', 'EEG view · 0.5–45 Hz'], ['chords', 'Chords-reference view'], ['raw', 'Raw ADC + Welch PSD']], ui.view);
const notchSelect = select([['50h', '50 + 100/150/200 Hz'], ['50', '50 Hz only'], ['off', 'Off']], ui.notch);
const spectrumSelect = select([[45, '0–45 Hz'], [100, '0–100 Hz'], [250, '0–250 Hz']], ui.spectrumMax);
const rangeSelect = select([25, 50, 100, 250, 500, 1000, 2048].map((v) => [v, `±${v}`]), ui.traceRange);
const hideCheck = h('input', { type: 'checkbox', checked: true });
const traceHost = h('div'), spectrumHost = h('div');
const traceHead = h('div', { class: 'td-chart-head' }), spectrumHead = h('div', { class: 'td-chart-head' });
const traceFoot = h('p', { class: 'td-chart-foot' }), spectrumFoot = h('p', { class: 'td-chart-foot' });
const bandBars = h('div', { class: 'td-band-bars', 'aria-label': 'Band shares' });
const bandCaption = h('p', { class: 'td-caption' });
const metricsLine = h('p', { class: 'bl-metrics-line' });
const flagsLine = h('p', { class: 'bl-flags', role: 'status' });
const channelTitle = h('h3');
const signalPanel = panel('02', 'Signal', 'Display only',
  h('div', { class: 'bl-view-controls' }, field('View', viewSelect), field('Notch', notchSelect), field('Spectrum', spectrumSelect), field('Trace scale', rangeSelect)),
  h('div', {}, h('span', { class: 'td-kicker', text: 'Channel 1 · A0' }), channelTitle),
  flagsLine,
  h('div', { class: 'td-chart' }, traceHead, traceHost, traceFoot),
  h('div', { class: 'td-chart' }, spectrumHead, spectrumHost, spectrumFoot),
  bandCaption, bandBars, metricsLine,
  h('label', { class: 'td-check' }, hideCheck, h('span', { text: 'Hide signal and numbers during protocols' })));
const traceChart = createCanvas(traceHost, { height: 170, label: 'Channel 1 trace' });
const spectrumChart = createCanvas(spectrumHost, { height: 210, label: 'Channel 1 spectrum' });

// ---------------------------------------------------------------- 03 protocol
const cueButton = actionButton({ onClick: () => controller.testCue() });
const heardCheck = h('input', { type: 'checkbox' });
const heardWhy = h('p', { class: 'td-why', hidden: true });
const blockSelect = select([30, 45, 60].map((s) => [s, `${s} s`]), ui.blockSeconds);
const audioSelect = select([['cues_only', 'Spoken cues only'], ['external_audio', 'External audio (exploratory)']], ui.audioCondition);
const protocolList = h('div', { class: 'td-field' });
const protocolButtons = new Map();
const blockTitle = h('strong'), blockInstruction = h('p'), blockStep = h('p', { class: 'td-caption' });
const blockCountdown = h('div', { class: 'td-countdown td-num' });
const blockProgress = h('div', { class: 'td-progress' }, h('i'));
const blockCard = h('div', { class: 'td-block-card', role: 'status', 'aria-live': 'polite' },
  h('span', { class: 'td-kicker', text: 'Current block' }), blockTitle, blockCountdown, blockProgress, blockInstruction, blockStep);
const abortButton = actionButton({ onClick: () => controller.abortProtocol() });
const markerNote = h('input', { type: 'text', placeholder: 'What happened? (optional)', 'aria-label': 'Marker note' });
const markerButton = actionButton({ onClick: () => addMarker() });
const markerList = h('ul', { class: 'bl-markers' });
const protocolPanel = panel('03', 'Protocol', null,
  h('div', { class: 'td-field' }, h('span', { text: 'Spoken cues' }), cueButton.el,
    h('label', { class: 'td-check' }, heardCheck, h('span', { text: 'I heard it clearly' })), heardWhy),
  h('div', { class: 'bl-protocol-settings' }, field('Eye-state blocks', blockSelect), field('Audio', audioSelect)),
  protocolList, blockCard, abortButton.el,
  h('div', { class: 'td-field' }, h('span', { text: 'Marker (movement, noise, missed cue…)' }), h('div', { class: 'bl-marker-row' }, markerNote, markerButton.el), markerList));

// ---------------------------------------------------------------- 04 results
const resultsBody = h('div', { class: 'td-body' });
const resultsPanel = h('section', { class: 'td-panel', 'aria-label': 'Results' },
  h('header', {}, h('h2', {}, h('span', { class: 'td-index', text: '04' }), 'Results'), h('span', { class: 'td-kicker', text: 'Descriptive · this session' })),
  resultsBody);
const pairHost = h('div');
let pairChart = null;
let resultsDirty = true;

root.append(h('main', { class: 'td-main' }, h('div', { class: 'td-grid-3' }, setupPanel, signalPanel, protocolPanel), resultsPanel));

// ---------------------------------------------------------------- setup wiring
const currentMontage = () => MONTAGES[ui.montageId];

function missingSetup() {
  const missing = [];
  if (!ui.setup.battery_only) missing.push('battery check');
  if (!ui.setup.contact) missing.push('contact check');
  if (!ui.setup.routing) missing.push('wiring check');
  if (ui.setup.pad_condition === 'unknown') missing.push('pads');
  return missing;
}

function pushSetup() {
  const m = currentMontage();
  controller.setSetup({
    montage: m.id,
    pad_condition: ui.setup.pad_condition,
    placement_notes: ui.setup.placement_notes,
    hypothesis: ui.setup.hypothesis,
    operator_confirmations: { battery_only: ui.setup.battery_only, contact_intact_comfortable: ui.setup.contact, wiring_and_switches: ui.setup.routing },
    audio_condition: ui.audioCondition,
    audio_notes: ui.setup.audio_notes,
    planned_eye_block_seconds: ui.blockSeconds,
    cue_mode: cues.kind,
  }, m);
}

function renderMontage() {
  const m = currentMontage();
  montageFigure.replaceChildren(montageSvg({ leads: m.leads }));
  leadList.replaceChildren(...m.leads.map((l) => h('div', { class: 'td-lead' }, h('i', { style: `background:${l.cableColor}` }), h('strong', { text: l.pin }), h('span', { text: `${l.siteLabel} · ${l.cable} cable · ${l.role}` }))));
  setText(montageNotes, m.notes);
  setText(routingText, `Wiring checked: ${m.routingCheck}`);
  setText(channelTitle, m.channelNames[0]);
}

montageSelect.onchange = () => { ui.montageId = montageSelect.value; checks.routing.checked = false; ui.setup.routing = false; renderMontage(); pushSetup(); };
for (const [key, input] of Object.entries(checks)) input.onchange = () => { ui.setup[key] = input.checked; pushSetup(); };
padSelect.onchange = () => { ui.setup.pad_condition = padSelect.value; pushSetup(); };
placement.oninput = () => { ui.setup.placement_notes = placement.value; pushSetup(); };
hypothesis.oninput = () => { ui.setup.hypothesis = hypothesis.value; pushSetup(); };
audioNotes.oninput = () => { ui.setup.audio_notes = audioNotes.value; pushSetup(); };
blockSelect.onchange = () => { ui.blockSeconds = Number(blockSelect.value); pushSetup(); render(); };
audioSelect.onchange = () => { ui.audioCondition = audioSelect.value; pushSetup(); render(); };

function changeDisplay() {
  if (controller.protocol.running) return;
  controller.display = createDisplay();
  controller.log('display_processing_change', controller.display.describe());
  render({ charts: true });
}
viewSelect.onchange = () => { ui.view = viewSelect.value; ui.spectrumMax = ui.view === 'raw' ? 250 : 45; spectrumSelect.value = String(ui.spectrumMax); changeDisplay(); };
notchSelect.onchange = () => { ui.notch = notchSelect.value; changeDisplay(); };
spectrumSelect.onchange = () => { ui.spectrumMax = Number(spectrumSelect.value); render({ charts: true }); };
rangeSelect.onchange = () => { ui.traceRange = Number(rangeSelect.value); render({ charts: true }); };
hideCheck.onchange = () => { ui.hideDuringProtocol = hideCheck.checked; render({ charts: true }); };
heardCheck.onchange = () => controller.confirmCueHeard(heardCheck.checked);
document.addEventListener('visibilitychange', () => {
  controller.log('visibility_change', { state: document.visibilityState });
  controller.protocol.noteVisibility(document.visibilityState);
});

// ---------------------------------------------------------------- actions
async function startAcquisition() {
  pushSetup();
  const first = !controller.session;
  const persisted = first && navigator.storage?.persist ? await navigator.storage.persist().catch(() => false) : null;
  const result = await controller.startAcquisition();
  if (result.ok && first) controller.recorder.patchSession({ persistence: { store: store.kind, persistent_storage_granted: persisted } });
}

async function finishSession() {
  await controller.finishSession('closed', 'operator');
  reportLink.href = `../report/?session=${encodeURIComponent(controller.session.id)}`;
  reportLink.hidden = false;
  render();
}

function newSession() {
  if (!controller.newSession()) return;
  for (const [key, input] of Object.entries(checks)) { input.checked = false; ui.setup[key] = false; }
  heardCheck.checked = false;
  reportLink.hidden = true;
  ui.markers = [];
  ui.refusals.clear();
  setExportStatus('');
  pushSetup();
  resultsDirty = true;
  render({ charts: true });
}

function addMarker() {
  ui.markers.unshift(controller.mark(markerNote.value));
  markerNote.value = '';
  render();
}

async function startProtocol(entry) {
  ui.refusals.delete(entry.name);
  const result = await controller.startProtocol(entry.create(), { requireCueCheck: !!entry.requireCueCheck, requireCleanSignal: !!entry.requireCleanSignal, requireSpeech: !!entry.requireSpeech });
  if (!result.ok) ui.refusals.set(entry.name, `${result.reason} ${result.howTo ?? ''}`.trim());
  else { ui.refusals.clear(); resultsDirty = true; }
  render({ charts: true });
}

function setExportStatus(text, tone = 'idle') {
  exportStatus.dataset.tone = tone;
  setText(exportStatus, text);
}

/** Called straight from the click: the save dialog must open before any other await. */
async function exportBundle() {
  if (!controller.session) return;
  const result = await saveBundle({
    suggestedName: `${simulated ? 'SIMULATED-' : ''}${APP.id}-${controller.session.id}.zip`,
    assemble: (sink, method) => controller.exportBundle(sink, { method }),
    onStatus: setExportStatus,
  });
  if (result) controller.log(result.method === 'file-picker' ? 'export_written' : 'export_download_requested', { filename: result.filename, method: result.method });
}

// ---------------------------------------------------------------- rendering
let raf = 0, lastCharts = 0, pendingCharts = false;
function render({ charts = false } = {}) {
  pendingCharts ||= charts;
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    const forceCharts = pendingCharts;
    pendingCharts = false;
    paint(forceCharts);
  });
}
controller.subscribe(() => render());
setInterval(() => controller.tick(), 250);

function paint(forceCharts) {
  const c = controller;
  const entries = protocolEntries({ simulated, blockSeconds: ui.blockSeconds, audioCondition: ui.audioCondition });
  const states = controlStates(c, { missingSetup: missingSetup(), protocols: entries, deviceLabel: simulated ? 'simulator' : 'NPG' });
  for (const [key, button] of Object.entries(buttons)) button.update(states[key]);
  setText(sessionLabel, c.session ? `Session ${c.session.id} · ${c.session.status}` : 'No session yet');
  statusStrip.replaceChildren(...statusItems(c).map((item) => h('span', { class: 'td-status', dataset: { tone: item.tone }, title: item.detail ?? '' },
    statusIcon(item.tone), h('span', { class: 'td-status-label', text: item.label }), h('span', { class: 'td-status-value', text: item.value }))));

  for (const el of setupFields) el.disabled = c.locked;
  lockedNote.hidden = !c.locked;
  blockSelect.disabled = audioSelect.disabled = c.protocol.running;

  // Protocol buttons are rebuilt only when their content changes, so focus survives renders.
  const signature = entries.map((e) => `${e.name}:${e.detail}`).join('|');
  if (signature !== ui.protocolSignature) {
    ui.protocolSignature = signature;
    const hadFocus = [...protocolButtons.entries()].find(([, b]) => b.button === document.activeElement)?.[0];
    protocolButtons.clear();
    protocolList.replaceChildren(h('span', { text: 'Protocols' }));
    for (const entry of entries) {
      const b = actionButton({ className: `td-btn td-protocol-btn${entry.primary ? ' td-btn--primary' : ''}`, onClick: () => startProtocol(entry) });
      b.update({ enabled: false, label: entry.label, content: () => [h('span', { class: 'td-index', text: entry.index }), h('b', { text: entry.label }), h('small', { text: entry.detail })] });
      protocolButtons.set(entry.name, b);
      protocolList.append(b.el);
    }
    if (hadFocus) protocolButtons.get(hadFocus)?.button.focus();
  }
  for (const [name, b] of protocolButtons) {
    const s = states.protocols[name];
    b.update({ ...s, why: s.why ?? ui.refusals.get(name) ?? null });
  }
  cueButton.update(states.testCue);
  heardCheck.disabled = !states.heard.enabled;
  heardCheck.checked = c.cueTest.heard;
  heardWhy.hidden = !states.heard.why;
  setText(heardWhy, states.heard.why ?? '');
  abortButton.update(states.abort);
  markerButton.update(states.marker);
  markerList.replaceChildren(...ui.markers.slice(0, 5).map((m) => h('li', { text: `${(m.arrival_ms / 1000).toFixed(1)} s · ${m.note || 'marker'}${m.block_id ? ` · block ${m.block_id}` : ''}` })));

  const card = protocolCard(c);
  const running = card.state === 'running';
  blockCard.dataset.state = card.state;
  setText(blockTitle, card.title);
  setText(blockInstruction, card.instruction);
  blockCountdown.hidden = blockProgress.hidden = !running;
  setText(blockCountdown, running ? `${card.remaining} s` : '');
  setText(blockStep, running ? `Block ${card.step} of ${card.steps}` : '');
  blockProgress.firstChild.style.width = `${Math.round((card.progress ?? 0) * 100)}%`;

  const now = performance.now();
  if (forceCharts || now - lastCharts > 240) { lastCharts = now; paintSignal(); }
  if (resultsDirty && !c.protocol.running) { resultsDirty = false; renderResults(); }
}

function paintSignal() {
  const c = controller;
  const engine = c.engine;
  const latest = engine?.latest?.[0] ?? null;
  const filtered = engine?.filteredLatest?.[0] ?? null;
  const proc = c.display?.proc;
  const acquiring = c.acquisition === 'acquiring';
  const hidden = ui.hideDuringProtocol && c.protocol.running;
  const status = hidden ? 'Hidden during the protocol'
    : !acquiring ? (engine ? 'Acquisition stopped' : 'Not acquiring')
    : !c.fresh ? 'Stale: no data for 2 s'
    : null;
  const raw = ui.view === 'raw', chords = ui.view === 'chords';

  const traceSamples = raw ? engine?.rings?.[0] : chords ? proc?.samples : proc?.samples?.map((v) => v * 2048);
  const traceUnit = raw ? 'ADC counts (mean removed)' : chords ? 'Normalised (×2/4096)' : 'Count-equivalent';
  drawTrace(traceChart, { samples: traceSamples?.length ? traceSamples : null, range: chords ? ui.traceRange / 2048 : ui.traceRange, unit: traceUnit, status, simulated, centre: raw });
  traceChart.setLabel(`Channel 1 ${raw ? 'raw' : 'filtered'} trace in ${traceUnit}`);
  traceHead.replaceChildren(h('strong', { text: raw ? 'Raw signal' : 'Filtered trace' }), h('span', { text: raw ? 'last 4.1 s' : 'last 2 s' }));
  const notchText = ui.notch === '50h' ? '50/100/150/200 Hz notches' : ui.notch === '50' ? '50 Hz notch' : 'no notch';
  setText(traceFoot, raw ? 'Unaltered ADC samples. Clipping and mains pickup stay visible here.' : `${chords ? 'Chords-Web coefficients (≈0.1–90 Hz)' : 'Causal 0.5–45 Hz Butterworth'} · ${notchText} · restarts after any gap.`);

  if (raw) {
    drawSpectrum(spectrumChart, { values: latest?.psd, kind: 'psd', maxHz: ui.spectrumMax, unit: 'PSD (dB re 1 count²/Hz)', status, simulated });
    spectrumHead.replaceChildren(h('strong', { text: 'Welch PSD' }), h('span', { text: 'Hann 3 × 1024, 50% overlap' }));
    setText(spectrumFoot, 'Raw 4.1 s window. Dashed lines: multiples of 50 Hz.');
  } else {
    const magnitudes = proc?.latest?.magnitudes;
    drawSpectrum(spectrumChart, { values: chords ? magnitudes : magnitudes?.map((v) => v * 2048), kind: 'magnitude', maxHz: ui.spectrumMax, unit: chords ? 'FFT magnitude, normalised' : 'FFT magnitude, count-equiv.', status, simulated });
    spectrumHead.replaceChildren(h('strong', { text: 'Smoothed FFT magnitude' }), h('span', { text: '1024 points · ~2 s average' }));
    setText(spectrumFoot, 'Magnitude, not power density. Eye-state comparisons use the fixed analysis path.');
  }
  spectrumChart.setLabel(`Channel 1 spectrum from 0 to ${ui.spectrumMax} Hz`);

  const shares = raw ? (latest ? Object.fromEntries(Object.entries(latest.relative).map(([k, v]) => [k, 100 * v])) : null) : proc?.latest?.bandPercent;
  bandBars.hidden = bandCaption.hidden = hidden || !acquiring || !shares;
  setText(bandCaption, `Band shares of 0.5–45 Hz · ${raw ? 'raw Welch power' : 'display spectrum'} · not a focus score`);
  if (!bandBars.hidden) bandBars.replaceChildren(...Object.entries(shares).map(([name, v]) => h('div', {}, h('span', { text: name }), h('i', { style: `--v:${Math.max(0, Math.min(100, v))}%` }), h('strong', { class: 'td-num', text: `${v.toFixed(1)}%` }))));
  setText(metricsLine, hidden ? 'Numbers hidden during the protocol.'
    : latest && acquiring ? `Alpha 8–13 Hz: ${fmt(filtered?.bp.alpha)} count-equiv.² (analysis) · raw ${fmt(latest.bp.alpha)} counts² · near-rail ${(100 * latest.rail).toFixed(2)}% · 50 Hz ${(100 * latest.line).toFixed(1)}% · 150 Hz ${(100 * latest.line150).toFixed(1)}%`
    : '');

  let tone = 'idle', text = acquiring ? 'Waiting for 4.1 s of continuous samples.' : 'Not acquiring.';
  if (acquiring && !c.fresh) { tone = 'warning'; text = 'No packets for 2 s. Check the link.'; }
  else if (acquiring && latest) {
    const sinceStart = engine.lastIndex - engine.filterStartIndex;
    if (latest.reasons.length) { tone = 'error'; text = `${latest.reasons.join(', ')} in the raw signal. Filtering cannot repair it: check contacts.`; }
    else if (sinceStart < 5000) { tone = 'warning'; text = `Filters settling (${Math.ceil((5000 - sinceStart) / 500)} s).`; }
    else if (engine.lastRailIndex[0] >= engine.lastIndex - 5000) { tone = 'warning'; text = 'Recent raw rail: wait for recovery.'; }
    else { tone = 'ready'; text = latest.warnings.length ? `No clipping · ${latest.warnings.join(' · ')}` : 'No clipping or flat signal.'; }
  }
  flagsLine.dataset.tone = tone;
  setText(flagsLine, text);
}

function renderResults() {
  const c = controller;
  const blocks = c.protocol.blocks;
  const eyeProtocols = [...new Set(blocks.filter((b) => b.label.startsWith('eyes_')).map((b) => b.protocol_id))];
  if (!eyeProtocols.length) {
    resultsBody.replaceChildren(h('p', { class: 'td-muted', text: 'Paired results appear after an eyes-open / eyes-closed protocol.' }));
    return;
  }
  const focused = document.activeElement?.dataset?.block;
  const nodes = [];
  eyeProtocols.forEach((id, i) => {
    const latestProtocol = i === eyeProtocols.length - 1;
    const prot = c.protocol.protocols.find((p) => p.id === id);
    const res = pairedResults({ blocks, windows: c.windows, protocolId: id, adherenceOf: (b) => c.adherenceOf(b) });
    const adherenceSelect = (block) => {
      if (!block) return '—';
      const s = h('select', { 'aria-label': `${humanLabel(block.label)}: adherence`, dataset: { block: block.id }, disabled: c.protocol.running },
        ...[['unconfirmed', 'Not confirmed'], ['as_instructed', 'Followed'], ['exclude', 'Missed / unsure → exclude']].map(([v, t]) => h('option', { value: v, text: t, selected: c.adherenceOf(block) === v })));
      s.onchange = () => { c.annotateAdherence(block.id, s.value); renderResults(); };
      return s;
    };
    const title = `${prot?.name === 'berger-demo' ? 'Demo run (simulated)' : 'Berger test'} #${id}${prot?.audio_condition === 'external_audio' ? ' · external audio, exploratory' : ''} · ${prot?.end_reason ?? 'running'}`;
    nodes.push(h('h3', { text: title }));
    const rows = res.pairs.map((p) => {
      const ob = blocks.find((b) => b.protocol_id === id && b.label === `eyes_open_pair${p.pair}`);
      const cb = blocks.find((b) => b.protocol_id === id && b.label === `eyes_closed_pair${p.pair}`);
      return h('tr', {},
        h('td', { text: `Pair ${p.pair}` }),
        h('td', { class: 'td-num', text: fmt(p.open?.alpha) }),
        h('td', { class: 'td-num', text: fmt(p.closed?.alpha) }),
        h('td', { class: 'td-num', text: p.status === 'eligible' ? `${p.ratio.toFixed(2)}×` : p.status.replace('_', ' ') }),
        h('td', { class: 'td-num', text: `${p.open?.valid ?? 0} / ${p.closed?.valid ?? 0}` }),
        h('td', {}, adherenceSelect(ob)), h('td', {}, adherenceSelect(cb)));
    });
    nodes.push(h('div', { class: 'td-scroll-x' }, h('table', { class: 'td-table' },
      h('caption', { class: 'td-visually-hidden', text: `${title}: alpha per prompted pair` }),
      h('thead', {}, h('tr', {}, ...['Pair', 'Open α', 'Closed α', 'Closed / open', 'Clean windows O / C', 'Open block', 'Closed block'].map((t) => h('th', { scope: 'col', text: t })))),
      h('tbody', {}, ...rows))));
    nodes.push(h('button', { class: 'td-btn', type: 'button', disabled: c.protocol.running, onclick: () => { c.confirmAllEyeBlocks(); renderResults(); } }, 'I followed every eye-state instruction not excluded'));
    nodes.push(h('p', { class: 'bl-results-reading' }, res.eligible_count
      ? [h('strong', { text: `${res.higher_closed_count} of ${res.eligible_count}` }), ' eligible pairs have higher alpha with eyes closed · median ratio ', h('strong', { text: `${res.median_ratio.toFixed(2)}×` }), '. α = median 8–13 Hz power after the fixed filter, count-equivalent².']
      : 'A pair gets a ratio once both blocks are marked followed and each has at least 2 clean windows.'));
    if (latestProtocol) {
      pairChart ??= createCanvas(pairHost, { height: 230, label: 'Alpha per pair, eyes open versus closed' });
      nodes.push(pairHost);
      drawPairs(pairChart, { pairs: res.pairs.map((p) => ({ pair: p.pair, open: p.open?.alpha ?? null, closed: p.closed?.alpha ?? null, status: p.status, ratio: p.ratio })), simulated });
    }
  });
  resultsBody.replaceChildren(...nodes);
  if (focused) resultsBody.querySelector(`select[data-block="${focused}"]`)?.focus();
}

// ---------------------------------------------------------------- start
renderMontage();
pushSetup();
render({ charts: true });
