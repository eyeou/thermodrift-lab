/**
 * Breathwork 0.2 — live acquisition surface for breathing sessions: ECG, EEG, EOG and EMG on an NPG
 * Lite. A signal check, then a guided session that runs outside the app while acquisition
 * continues, marked with keys.
 * Saved sessions open in ../report/, which never connects to hardware.
 *
 *   ?source=simulated   on a local server only: synthetic test pattern + silent cues (labelled everywhere)
 *   (default)           NPG Lite over Web Bluetooth + spoken cues
 */
import { appName, brand } from '../../src/ui/components/lab-mark.js';
import { h, setText, statusIcon, actionButton, uid } from '../../src/ui/dom.js';
import { createCanvas, drawStack, drawTrace, drawSpectrum } from '../../src/ui/charts/canvas.js';
import { restCard, svgHost } from '../../src/ui/charts/report.js';
import { placementSvg, placementViews } from '../../src/ui/components/placement.js';
import { createTabs } from '../../src/ui/components/tabs.js';
import { createProtocolGuide, needsList } from '../../src/ui/components/protocol-guide.js';
import { createSegmented } from '../../src/ui/components/segmented.js';
import { sessionTimelineSvg } from '../../src/ui/components/session-timeline.js';
import { BREATHWORK_EXAMPLES, exampleButton, exampleView } from '../../src/ui/components/example-results.js';
import { bundleStage, mainsFigure, placementStage, signalFigure } from '../../src/ui/components/guide-figures.js';
import { LabController } from '../../src/lab/controller.js';
import { deviceBadge } from '../../src/ui/components/device-badge.js';
import { controlStates, protocolCard, statusItems, sharedReason } from '../../src/lab/viewmodel.js';
import { BergerV3WindowEngine } from '../../src/analysis/berger-v3.js';
import { assessRawWindow, WARNINGS } from '../../src/core/quality.js';
import { createDisplayProcessor } from '../../src/core/display-reference.js';
import { openIdbStore } from '../../src/session/store-idb.js';
import { MemoryStore } from '../../src/session/store-memory.js';
import { createNpgBleTransport } from '../../src/transport/npg-ble.js';
import { createSimulatedTransport } from '../../src/transport/simulated.js';
import { createSpeechCues, createSilentCues } from '../../src/protocol/cues.js';
import { createSessionLocks, recoverAbandonedSessions } from '../../src/lab/locks.js';
import { StatusMonitor } from '../../src/lab/status-monitor.js';
import { createDiskMirror } from '../../src/session/disk-mirror.js';
import { buttonAction, parseButton } from './button.js';
import { GREEN, ORANGE, RED } from '../../src/core/live-status.js';
import { saveBundle } from '../../src/ui/save-bundle.js';
import { bundleStem, latestRecording, lengthText, recordingSummaries } from '../../src/session/recordings.js';
import { APP, MONTAGES, DEFAULT_MONTAGE, MAX_CHANNELS, EEG_CHANNEL, TRACE_RANGE, channelLabel, channelKind, blockName, protocolEntries, describeBreathworkSession, breathBlockSummary, restComparison, SESSION_FORMATS, DEFAULT_SESSION_FORMAT, guideFor, sessionTimeline, markerNote, completionCue } from './config.js';

const simulated = new URLSearchParams(location.search).get('source') === 'simulated' && ['127.0.0.1', 'localhost'].includes(location.hostname);
const root = document.getElementById('app');
const fmt = (v, digits = 2) => (Number.isFinite(v) ? v.toFixed(digits) : '—');
const pct = (v) => (Number.isFinite(v) ? `${(100 * v).toFixed(0)}%` : '—');
const RAW_SAMPLES = 2048;
const localClock = (utc) => (utc ? new Date(utc).toLocaleTimeString('en-GB') : '—');
const localDate = (utc) => new Date(utc).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

// UI-only state. Session data live in the controller and the store.
const ui = {
  montageId: DEFAULT_MONTAGE,
  sessionFormat: DEFAULT_SESSION_FORMAT,
  liveChannel: 0,
  signalLayout: 'one',
  view: 'eeg',
  notch: '50h',
  spectrumMax: 45,
  traceRange: TRACE_RANGE.ecg,
  hideDuringProtocol: false,
  setup: { battery_only: false, contact: false, routing: false, pad_condition: 'unknown', position: 'unknown', condition: 'unset', placement_notes: '', hypothesis: '', audio_notes: '' },
  recordingsSignature: null,
  refusals: new Map(),
  markers: [],
  protocolSignature: '',
  armed: false,
  exportedSession: null,
  boardBattery: null,
  batteryAlerted: new Set(),
  firmware: null,
  buttonPresses: 0,
  videoRunning: false,
  lastButton: '',
  boardTestUntil: 0,
  reconnecting: false,
  reconnectAttempts: 0,
  distanceOpen: false,
  macBattery: null,
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

/**
 * Display pipeline (display only; the analysis path is fixed). The selected view filters the live
 * channel; raw rings of every channel feed the per-channel quality chips.
 */
/** Short spoken name of a channel: 'Cz', 'neck EMG'. */
function voiceName(name) {
  const [kind, site = ''] = name.split(' · ');
  if (/sternocleidomastoid|neck/i.test(site)) return 'neck EMG';
  if (/trapezius|shoulder/i.test(site)) return 'shoulder EMG';
  const eeg = /^(Oz|Cz|Fpz)/.exec(site);
  return eeg ? eeg[1] : kind;
}

function createDisplay(_montage = null, { keepStatus = false } = {}) {
  const { view, notch, liveChannel } = ui;
  if (!keepStatus) { const m = MONTAGES[ui.montageId]; monitor.configure(m.channelKinds, m.channelNames.map(voiceName)); monitor.reset(); }
  const make = () => (view === 'raw' ? null : createDisplayProcessor(view, { notch50: notch !== 'off', harmonics: notch === '50h' }));
  let proc = make();
  const emptyRings = () => Array.from({ length: MAX_CHANNELS }, () => []);
  let rings = emptyRings();
  let count = 0, metricsAt = -Infinity, metrics = rings.map(() => null);
  return {
    push(row) {
      const live = row.channels[liveChannel];
      if (Number.isFinite(live)) proc?.push(live);
      for (let ch = 0; ch < rings.length; ch++) {
        const v = row.channels[ch];
        if (!Number.isFinite(v)) continue;
        rings[ch].push(v);
        if (rings[ch].length > RAW_SAMPLES) rings[ch].shift();
      }
      count++;
      mirror.row(controller.session?.id, row);
      monitor.push(row);
    },
    reset() { monitor.gap(); proc = make(); rings = emptyRings(); metrics = rings.map(() => null); metricsAt = -Infinity; },
    get proc() { return proc; },
    raw(ch) { return rings[ch]; },
    /** Raw-window metrics per channel (4.1 s), recomputed at most every 250 samples. */
    metrics() {
      if (count - metricsAt >= 250) {
        metricsAt = count;
        metrics = rings.map((r) => (r.length === RAW_SAMPLES ? assessRawWindow(r) : null));
      }
      return metrics;
    },
    describe() {
      return { selected_view: view, notch, live_channel: liveChannel + 1, reference: proc?.describe() ?? 'raw ADC + Welch PSD', upstream_snapshot: 'Chords-Web a0a77f7 (2.7.1a): numerical reference, not its UI code' };
    },
  };
}

const controller = new LabController({
  app: { id: APP.id, version: APP.version, analysisPlan: APP.analysisPlan },
  transport,
  store,
  // Window engine on channels 1 and 2 (ECG and Oz EEG): quality flags and per-block EEG summaries.
  analysis: { createEngine: () => new BergerV3WindowEngine({ mode: 'shared', derived: false }) },
  cues: () => cues,
  createDisplay,
  describe: (ctx) => describeBreathworkSession({ ...ctx, display: controller.display?.describe() }),
  channelLabel,
  locks,
  onProtocolEnded: (last, state) => {
    const cue = completionCue(last?.name, ui.sessionFormat);
    if (cue && state === 'completed' && cues.kind === 'speech') cues.speak(cue, {});
    resultsDirty = true;
  },
});
window.__breathworkLab = controller; // DevTools inspection only
const mirror = createDiskMirror();
if (location.hostname === '127.0.0.1') mirror.probe();
const loggedEvent = controller.log.bind(controller);
controller.log = (label, payload) => {
  const event = loggedEvent(label, payload);
  mirror.event(controller.session?.id, event);
  return event;
};
const monitor = new StatusMonitor({
  channels: MAX_CHANNELS,
  onEvaluate: () => sendBoardPattern(),
  log: (label, payload) => controller.log(label, payload),
  // Board feedback (Thermodrift firmware): buzzer and motor on sustained alerts, buzzer on setup problems.
  onAlert: (level) => boardFeedback(level === 'red' ? 2 : 1, `alert_${level}`),
  onAnnounce: (said) => { if (said.some((s) => s.level !== GREEN)) boardFeedback(1, 'setup_problem', { vibrate: false }); },
});
window.__breathworkStatus = monitor;

// ---------------------------------------------------------------- header, notices, status
const sessionLabel = h('span', { class: 'td-caption td-mono', text: 'No session yet' });
const sourceBadge = deviceBadge({ simulated });
root.append(h('header', { class: 'td-header' },
  brand({ href: '../', logo: '../../brand/thermodrift-logo.png' }),
  appName(APP.name),
  h('span', { class: 'td-spacer' }),
  sourceBadge.el,
  sessionLabel));
const notices = h('div');
root.append(notices);
if (storeWarning) notices.append(h('p', { class: 'bl-notice', text: storeWarning }));
if (recovered.length) notices.append(h('p', { class: 'bl-notice' }, `${recovered.length} earlier session${recovered.length > 1 ? 's were' : ' was'} left open by a closed tab; marked interrupted, data kept. To save it: `, h('a', { href: '../', text: 'Sessions' }), ' → Report → Export bundle.'));
const statusStrip = h('div', { class: 'td-status-strip', role: 'status', 'aria-label': 'Acquisition status' });
root.append(statusStrip);

// ---------------------------------------------------------------- transport bar
const distanceButton = h('button', { type: 'button', class: 'td-btn td-btn--light', title: 'Big lights to read from across the room (key L, Esc to close)', onclick: () => openDistance() }, 'Distance view');
const buttons = {
  connect: actionButton({ className: 'td-btn td-btn--primary', onClick: () => controller.connect() }),
  start: actionButton({ onClick: () => startAcquisition() }),
  stop: actionButton({ onClick: () => { ui.armed = false; controller.stopAcquisition(); } }),
  disconnect: actionButton({ onClick: () => { ui.armed = false; controller.disconnect(); } }),
  finish: actionButton({ onClick: () => finishSession() }),
  newSession: actionButton({ onClick: () => newSession() }),
  export: actionButton({ onClick: () => exportBundle() }),
};
const exportStatus = h('p', { class: 'bl-export-status', role: 'status' });
const reportLink = h('a', { class: 'td-btn td-btn--light bl-report-link', hidden: true }, 'Open report');
root.append(h('div', { class: 'bl-transport', role: 'toolbar', 'aria-label': 'Acquisition controls' },
  buttons.connect.el, buttons.start.el, buttons.stop.el, buttons.disconnect.el, distanceButton,
  h('span', { class: 'td-spacer' }),
  buttons.finish.el, buttons.newSession.el, buttons.export.el, reportLink, exportStatus));

// ---------------------------------------------------------------- 01 setup
const select = (options, value) => h('select', {}, ...options.map(([v, t]) => h('option', { value: v, text: t, selected: String(v) === String(value) })));
const montageSelect = select(Object.values(MONTAGES).map((m) => [m.id, m.label]), ui.montageId);
const montageFigure = h('div', { class: 'td-plates', role: 'group', 'aria-label': 'Electrode placement figures' });
// Up to a tablet the plates show one at a time, chosen by name; on a phone with larger pins and the
// site names left to the lead list. A wider screen shows them side by side.
const platesOne = globalThis.matchMedia?.('(max-width: 980px)');
const platesPhone = globalThis.matchMedia?.('(max-width: 640px)');
for (const query of [platesOne, platesPhone]) query?.addEventListener?.('change', () => renderMontage());
const leadList = h('div', { class: 'td-lead-list' });
const montageNotes = h('p', { class: 'td-caption' });
const checks = { battery_only: h('input', { type: 'checkbox' }), contact: h('input', { type: 'checkbox' }), routing: h('input', { type: 'checkbox' }) };
const routingText = h('span');
const padSelect = select([['unknown', 'Not recorded'], ['fresh', 'Fresh today'], ['retained', 'Kept from an earlier session'], ['reapplied', 'Removed and reapplied']], ui.setup.pad_condition);
const positionSelect = select([['unknown', 'Not recorded'], ['lying', 'Lying on the back'], ['sitting', 'Sitting'], ['other', 'Other (see notes)']], ui.setup.position);
const conditionSelect = select([['unset', 'Not set'], ['check', 'Signal check only'], ['A', 'A · Active breathwork'], ['P', 'P · Guided audio, normal breathing'], ['M', 'M · Meditation'], ['F', 'F · Flat rest'], ['other', 'Other (see notes)']], ui.setup.condition);
const placement = h('textarea', { rows: 2, placeholder: 'Actual sites, electrodes, paste, CN switch state' });
const hypothesis = h('textarea', { rows: 2, placeholder: 'I expect … I would call it inconclusive if …' });
const audioNotes = h('textarea', { rows: 1, placeholder: 'Guided video, speakers or headphones, volume' });
const lockedNote = h('p', { class: 'bl-locked', hidden: true, text: 'Setup is locked for this session. Finish it and start a new session to rewire.' });
const setupFields = [montageSelect, ...Object.values(checks), padSelect, positionSelect, conditionSelect, placement, hypothesis, audioNotes];
const field = (label, control) => h('label', { class: 'td-field' }, h('span', { text: label }), control);
const panel = (index, title, kicker, ...body) => h('section', { class: 'td-panel', 'aria-label': title },
  h('header', {}, h('h2', {}, h('span', { class: 'td-index', text: index }), title), kicker ? h('span', { class: 'td-kicker', text: kicker }) : null),
  h('div', { class: 'td-body' }, ...body));

const needsHost = h('div');
const paintNeeds = (formatId) => needsHost.replaceChildren(needsList(guideFor(formatId).needs));
paintNeeds(ui.sessionFormat);
const setupPanel = panel('01', 'Setup', null,
  field('Montage', montageSelect), montageFigure,
  h('div', { class: 'td-setup-columns' },
    h('div', { class: 'td-setup-left' }, leadList, montageNotes, needsHost),
    h('div', {},
      h('div', { class: 'bl-protocol-settings' }, field('Electrodes', padSelect), field('Position', positionSelect)),
      field('Condition (goes in the file name)', conditionSelect),
      h('div', { class: 'td-field' }, h('span', { text: 'Before acquisition' }),
        h('label', { class: 'td-check' }, checks.battery_only, h('span', { text: 'NPG and laptop on battery; nothing mains-powered touches the setup.' })),
        h('label', { class: 'td-check' }, checks.contact, h('span', { text: 'Skin intact and comfortable; contacts stable.' })),
        h('label', { class: 'td-check' }, checks.routing, routingText)),
      field('Placement notes', placement),
      field('Prediction', hypothesis),
      field('Audio notes', audioNotes),
      lockedNote)));

// ---------------------------------------------------------------- 02 signal
// Live status lights: connection checks per channel, plus checks adapted to the signal kind.
const statusLamps = h('div', { class: 'bw-lamps', role: 'group', 'aria-label': 'Live status per channel' });
const bigLamps = h('div', { class: 'bw-big-lamps' });
const modeHelp = { setup: 'Setup: a voice names any channel that changes and holds 4 s.', session: 'Session: one tone only when a problem lasts (red 20 s, orange 60 s); a soft tick every 5 min means the app is alive.', silent: 'Silent: lights only.' };
const modeCaption = h('p', { class: 'td-caption' });
const makeModeControl = () => createSegmented({ label: 'Status sounds', options: [{ value: 'setup', label: 'Setup · voice' }, { value: 'session', label: 'Session · tones' }, { value: 'silent', label: 'Silent' }], value: monitor.mode, onChange: (v) => setStatusMode(v) });
const modeControl = makeModeControl();
const bigModeControl = makeModeControl();
const boardChecks = { lights: h('input', { type: 'checkbox', checked: true }), buzzer: h('input', { type: 'checkbox', checked: true }), vibrate: h('input', { type: 'checkbox', checked: false }) };
const boardNote = h('span', { class: 'td-caption' });
const boardInfo = h('p', { class: 'td-caption bw-board-info' });
const bigBoard = h('p', { class: 'bw-big-info' });
const boardRow = h('div', { class: 'bw-board' },
  h('strong', { text: 'NPG Beast' }),
  h('label', { class: 'td-check' }, boardChecks.lights, h('span', { text: 'LEDs show the six lights' })),
  h('label', { class: 'td-check' }, boardChecks.buzzer, h('span', { text: 'Buzzer on alerts' })),
  h('label', { class: 'td-check' }, boardChecks.vibrate, h('span', { text: 'Vibration on alerts (motor sits near the leads)' })),
  h('button', { type: 'button', class: 'td-btn td-btn--light', onclick: () => testBoard() }, 'Test board'),
  h('span', { class: 'td-caption', text: 'Button: 1 click marker · 2 clicks video or music start, then end' }),
  boardNote);
const statusRow = h('div', { class: 'bw-status' }, h('div', { class: 'bw-status-head' }, h('strong', { text: 'Live status' }), modeControl.el, h('button', { type: 'button', class: 'td-btn td-btn--light', onclick: () => openDistance() }, 'Distance view')), statusLamps, boardRow, boardInfo, modeCaption);
const bigInfo = h('p', { class: 'bw-big-info' });
const bigAlerts = h('p', { class: 'bw-big-alerts' });
const distance = h('div', { class: 'bw-distance', hidden: true, role: 'dialog', 'aria-label': 'Live status, distance view' },
  h('div', { class: 'bw-big-head' }, h('strong', { text: 'Live status' }), bigModeControl.el, h('span', { class: 'td-spacer' }), h('button', { type: 'button', class: 'td-btn td-btn--light', onclick: () => closeDistance() }, 'Close (Esc)')),
  bigLamps, bigInfo, bigBoard, bigAlerts);
document.body.append(distance);
function setStatusMode(mode) {
  monitor.setMode(mode);
  for (const c of [modeControl, bigModeControl]) for (const input of c.inputs) input.checked = input.value === mode;
  render();
}

const channelChips = h('div', { class: 'bw-chips', role: 'group', 'aria-label': 'Raw quality per channel' });
const viewSelect = select([['eeg', 'Filtered · 0.5–45 Hz'], ['chords', 'Reference · 0.1–90 Hz'], ['raw', 'Raw + Welch PSD']], ui.view);
const notchSelect = select([['50h', '50 Hz + harmonics'], ['50', '50 Hz only'], ['off', 'Off']], ui.notch);
const spectrumSelect = select([[45, '0–45 Hz'], [100, '0–100 Hz'], [250, '0–250 Hz']], ui.spectrumMax);
const rangeSelect = select([25, 50, 100, 250, 500, 1000, 2048].map((v) => [v, `±${v}`]), ui.traceRange);
const hideCheck = h('input', { type: 'checkbox', checked: ui.hideDuringProtocol });
const traceHost = h('div'), spectrumHost = h('div');
const traceHead = h('div', { class: 'td-chart-head' }), spectrumHead = h('div', { class: 'td-chart-head' });
const traceFoot = h('p', { class: 'td-chart-foot' }), spectrumFoot = h('p', { class: 'td-chart-foot' });
const bandBars = h('div', { class: 'td-band-bars', 'aria-label': 'Band shares' });
const bandCaption = h('p', { class: 'td-caption' });
const metricsLine = h('p', { class: 'bl-metrics-line' });
const flagsLine = h('p', { class: 'bl-flags', role: 'status' });
const displayControls = [viewSelect, notchSelect];
const viewControls = h('div', { class: 'bl-view-controls' }, field('View', viewSelect), field('Notch', notchSelect), field('Spectrum', spectrumSelect), field('Trace scale', rangeSelect));
const onePair = h('div', { class: 'td-chart-pair' },
  h('div', { class: 'td-chart' }, traceHead, traceHost, traceFoot),
  h('div', { class: 'td-chart' }, spectrumHead, spectrumHost, spectrumFoot));
const stackHost = h('div');
const stackFoot = h('p', { class: 'td-chart-foot', text: 'Raw ADC counts with the mean removed, each row on its own scale. Display only: recording does not change.' });
const allPanel = h('div', { class: 'td-chart', hidden: true }, stackHost, stackFoot);
const layoutControl = createSegmented({
  label: 'How many channels to show',
  options: [{ value: 'one', label: 'One channel' }, { value: 'all', label: 'All channels' }],
  value: ui.signalLayout,
  onChange: (value) => setSignalLayout(value),
});
const signalPanel = panel('02', 'Signal', 'Display only',
  statusRow,
  layoutControl.el,
  channelChips,
  viewControls,
  flagsLine,
  onePair,
  allPanel,
  bandCaption, bandBars, metricsLine,
  h('label', { class: 'td-check' }, hideCheck, h('span', { text: 'Hide signal and numbers during protocols' })));
const traceChart = createCanvas(traceHost, { height: 170, label: 'Live channel trace' });
const spectrumChart = createCanvas(spectrumHost, { height: 210, label: 'Live channel spectrum' });
const stackChart = createCanvas(stackHost, { height: 430, label: 'All channels' });

// ---------------------------------------------------------------- 03 protocol
const cueButton = actionButton({ onClick: () => controller.testCue() });
const heardCheck = h('input', { type: 'checkbox' });
const heardWhy = h('p', { class: 'td-why', hidden: true });
const protocolList = h('div', { class: 'td-field' });
const protocolButtons = new Map();
const blockTitle = h('strong'), blockInstruction = h('p'), blockStep = h('p', { class: 'td-caption' });
const blockCountdown = h('div', { class: 'td-countdown td-num' });
const blockProgress = h('div', { class: 'td-progress' }, h('i'));
const blockCard = h('div', { class: 'td-block-card', role: 'status', 'aria-live': 'polite' },
  h('span', { class: 'td-kicker', text: 'Current block' }), blockTitle, blockCountdown, blockProgress, blockInstruction, blockStep);
const abortButton = actionButton({ onClick: () => controller.abortProtocol() });
const markerInput = h('input', { type: 'text', placeholder: 'What happened? (optional)', 'aria-label': 'Marker note' });
const markerButton = actionButton({ onClick: () => addMarker() });
const markerList = h('ul', { class: 'bl-markers' });
const keysCaption = h('p', { class: 'td-caption' });
const runFormat = h('span', { class: 'td-kicker' });
const formatWhyId = uid('format-why');
const formatWhy = h('p', { class: 'td-why', id: formatWhyId, hidden: true, text: 'Fixed for this session. Start a new session to change it.' });
const formatPicker = createSegmented({ label: 'Session format', options: Object.values(SESSION_FORMATS).map((f) => ({ value: f.id, label: f.label })), value: ui.sessionFormat, onChange: (id) => chooseFormat(id), describedBy: formatWhyId });
const formatSummary = h('p', { class: 'td-format-summary' });
const formatTimeline = svgHost((width) => sessionTimelineSvg(sessionTimeline(ui.sessionFormat), SESSION_FORMATS[ui.sessionFormat].key, { width }), 860);
const formatCare = h('p', { class: 'td-guide-limit', hidden: true });
const formatBlock = h('div', { class: 'td-format' },
  h('div', { class: 'td-field' }, h('span', { text: 'Session format' }), formatPicker.el, formatWhy),
  formatSummary,
  formatTimeline.el,
  h('p', { class: 'td-caption', text: 'The planned order, to scale. Inside the session your guide sets the pace, so those lengths are approximate.' }),
  formatCare);
const tabLive = h('span', { class: 'td-tab-live', role: 'status' });
const guideVisuals = {
  placement: () => placementStage(currentMontage().leads),
  mains: () => mainsFigure({ distance: 'at least 1 m', mat: true }),
  signal: () => signalFigure('body'),
  session: () => h('figure', { class: 'td-stage-figure' }, svgHost((width) => sessionTimelineSvg(sessionTimeline(ui.sessionFormat), SESSION_FORMATS[ui.sessionFormat].key, { width }), 380).el,
    h('figcaption', { class: 'td-caption', text: 'The planned order, to scale. Your guide sets the pace inside the session.' })),
  bundle: () => bundleStage(),
};
const guideView = createProtocolGuide({ guide: guideFor(ui.sessionFormat), blockName, goToTab: (id) => mainTabs.select(id), intro: formatBlock, visuals: guideVisuals });
const protocolReason = h('p', { class: 'td-why', role: 'status', hidden: true });
const cueField = h('div', { class: 'td-field td-cue-field' }, h('span', { text: 'Spoken cues (optional check)' }), cueButton.el,
  h('label', { class: 'td-check' }, heardCheck, h('span', { text: 'I heard it clearly' })), heardWhy);
const protocolLauncher = h('div', { class: 'td-protocol-run' },
  protocolList);
const protocolPanel = panel('03', 'Protocol', null, guideView.el);
const runPanel = h('aside', { class: 'td-panel td-rail', 'aria-label': 'Run a protocol' },
  h('header', {}, h('h2', { text: 'Run' }), runFormat),
  h('div', { class: 'td-protocol-run' }, blockCard, abortButton.el, protocolLauncher,
    h('div', { class: 'td-field' }, h('span', { text: 'Markers (movement, noise, phases of the session)' }),
      h('div', { class: 'bl-marker-row' }, markerInput, markerButton.el),
      keysCaption,
      markerList), cueField));

// ---------------------------------------------------------------- 04 results
const resultsBody = h('div', { class: 'td-body' });
const resultsKicker = h('span', { class: 'td-kicker' });
const resultsPanel = h('section', { class: 'td-panel td-panel--open', 'aria-label': 'Results' },
  h('header', {}, h('h2', {}, h('span', { class: 'td-index', text: '04' }), 'Results'), resultsKicker),
  resultsBody);
let resultsDirty = true;
let showExample = false;

// ---------------------------------------------------------------- 05 recordings
const recordingsBody = h('div', { class: 'td-body' });
const recordingsPanel = h('section', { class: 'td-panel', 'aria-label': 'Recordings' },
  h('header', {}, h('h2', {}, h('span', { class: 'td-index', text: '05' }), 'Recordings'), h('span', { class: 'td-kicker', text: 'This session' })),
  recordingsBody);

const mainTabs = createTabs({
  label: APP.name,
  hash: true,
  aside: tabLive,
  rail: runPanel,
  railOn: ['signal', 'protocol'],
  tabs: [
    { id: 'setup', index: '01', title: 'Setup', panel: setupPanel },
    { id: 'signal', index: '02', title: 'Signal', panel: signalPanel },
    { id: 'protocol', index: '03', title: 'Protocol', panel: protocolPanel },
    { id: 'results', index: '04', title: 'Results', panel: resultsPanel },
    { id: 'recordings', index: '05', title: 'Recordings', panel: recordingsPanel },
  ],
});
root.append(h('main', { class: 'td-main td-main--tabs' }, mainTabs.el));
guideView.mountRail(runPanel);

// ---------------------------------------------------------------- setup wiring
const currentMontage = () => MONTAGES[ui.montageId];

function missingSetup() {
  const missing = [];
  if (!ui.setup.battery_only) missing.push('battery check');
  if (!ui.setup.contact) missing.push('contact check');
  if (!ui.setup.routing) missing.push('wiring check');
  if (ui.setup.pad_condition === 'unknown') missing.push('electrodes');
  if (ui.setup.position === 'unknown') missing.push('position');
  return missing;
}

function pushSetup() {
  const m = currentMontage();
  controller.setSetup({
    montage: m.id,
    pad_condition: ui.setup.pad_condition,
    position: ui.setup.position,
    condition: ui.setup.condition,
    session_format: ui.sessionFormat,
    placement_notes: ui.setup.placement_notes,
    hypothesis: ui.setup.hypothesis,
    operator_confirmations: { battery_only: ui.setup.battery_only, contact_intact_comfortable: ui.setup.contact, wiring_and_switches: ui.setup.routing },
    audio_notes: ui.setup.audio_notes,
    cue_mode: cues.kind,
  }, m);
}

const chipRefs = [];
function renderMontage() {
  const m = currentMontage();
  montageFigure.replaceChildren(...(platesOne?.matches ? [placementStage(m.leads, { list: false, compact: !!platesPhone?.matches })]
    : placementViews(m.leads).map((view) => h('figure', { class: 'td-plate', html: placementSvg(view, m.leads) }))));
  leadList.replaceChildren(...m.leads.map((l) => h('div', { class: 'td-lead' }, h('i', { style: `background:${l.cableColor}` }), h('strong', { text: l.pin }), h('span', { text: [l.siteLabel, l.electrode, l.cable ? `${l.cable} cable` : null, l.role].filter(Boolean).join(' · ') }))));
  setText(montageNotes, m.notes);
  setText(routingText, `Wiring checked: ${m.routingCheck}`);
  guideView.refreshVisual();
  if (ui.liveChannel >= m.requiredChannels) ui.liveChannel = 0;
  chipRefs.length = 0;
  channelChips.replaceChildren(...m.channelNames.map((name, ch) => {
    const value = h('span', { class: 'bw-chip-value', text: '—' });
    const chip = h('button', { type: 'button', class: 'bw-chip', title: name, 'aria-pressed': String(ch === ui.liveChannel), onclick: () => { selectChannel(ch); setSignalLayout('one'); } }, h('strong', { text: `${ch + 1} · ${channelKind(m, ch).toUpperCase()}` }), value);
    chipRefs.push({ chip, value });
    return chip;
  }));
}

/** What the Protocol tab and the Run panel say for the chosen format. */
function renderFormat() {
  const format = SESSION_FORMATS[ui.sessionFormat];
  setText(formatSummary, format.summary);
  formatTimeline.redraw();
  formatCare.hidden = !format.care;
  formatCare.replaceChildren(...(format.care ? [h('strong', { text: 'Care. ' }), format.care] : []));
  setText(runFormat, format.label);
  setText(keysCaption, format.keys);
  guideView.setGuide(guideFor(format.id));
  paintNeeds(format.id);
}

function chooseFormat(id) {
  if (controller.locked || id === ui.sessionFormat) return;
  ui.sessionFormat = id;
  pushSetup();
  renderFormat();
  resultsDirty = true;
  render();
}

/** One channel with its spectrum, or every channel stacked. Display only. */
function setSignalLayout(layout) {
  ui.signalLayout = layout;
  layoutControl.inputs.forEach((input) => { input.checked = input.value === layout; });
  const all = layout === 'all';
  allPanel.hidden = !all;
  onePair.hidden = all;
  viewControls.hidden = all;
  bandCaption.hidden = bandBars.hidden = all;
  metricsLine.hidden = all;
  paintSignal();
}

function selectChannel(ch) {
  if (controller.protocol.running || ch === ui.liveChannel) return;
  ui.liveChannel = ch;
  const kind = channelKind(currentMontage(), ch);
  ui.traceRange = TRACE_RANGE[kind] ?? 50;
  ui.view = kind === 'emg' ? 'raw' : ui.view === 'raw' ? 'eeg' : ui.view;
  ui.spectrumMax = kind === 'emg' ? 250 : 45;
  rangeSelect.value = String(ui.traceRange);
  viewSelect.value = ui.view;
  spectrumSelect.value = String(ui.spectrumMax);
  changeDisplay();
}

montageSelect.onchange = () => { ui.montageId = montageSelect.value; checks.routing.checked = false; ui.setup.routing = false; renderMontage(); pushSetup(); render({ charts: true }); };
for (const [key, input] of Object.entries(checks)) input.onchange = () => { ui.setup[key] = input.checked; pushSetup(); };
padSelect.onchange = () => { ui.setup.pad_condition = padSelect.value; pushSetup(); };
positionSelect.onchange = () => { ui.setup.position = positionSelect.value; pushSetup(); };
conditionSelect.onchange = () => { ui.setup.condition = conditionSelect.value; pushSetup(); };
placement.oninput = () => { ui.setup.placement_notes = placement.value; pushSetup(); };
hypothesis.oninput = () => { ui.setup.hypothesis = hypothesis.value; pushSetup(); };
audioNotes.oninput = () => { ui.setup.audio_notes = audioNotes.value; pushSetup(); };

function changeDisplay() {
  if (controller.protocol.running) return;
  if (controller.display) {
    controller.display = createDisplay(null, { keepStatus: true });
    controller.log('display_processing_change', controller.display.describe());
  }
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

async function newSession() {
  try {
    if (!(await controller.startNewSession())) return;
  } catch (error) {
    setExportStatus(`Could not finish this session: ${error.message}. Its data are still in this browser; export them first.`, 'error');
    return;
  }
  for (const [key, input] of Object.entries(checks)) { input.checked = false; ui.setup[key] = false; }
  ui.setup.condition = 'unset';
  conditionSelect.value = 'unset';
  heardCheck.checked = false;
  reportLink.hidden = true;
  ui.markers = [];
  ui.videoRunning = false;
  ui.buttonPresses = 0;
  ui.lastButton = '';
  ui.refusals.clear();
  setExportStatus('');
  pushSetup();
  resultsDirty = true;
  render({ charts: true });
}

function addMarker() {
  ui.markers.unshift(controller.mark(markerInput.value));
  markerInput.value = '';
  render();
}

/**
 * Keyboard markers for eyes-closed, hands-busy sessions. Ignored while typing in a field or
 * without acquisition; a focused button (e.g. the protocol just started) does not block them.
 */
document.addEventListener('keydown', (event) => {
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
  const t = event.target;
  const typing = t instanceof HTMLElement && (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && !['checkbox', 'radio', 'button'].includes(t.type)));
  if (typing) return;
  if (event.key === 'Escape' && ui.distanceOpen) { closeDistance(); return; }
  if (event.key.toLowerCase() === 'l') { event.preventDefault(); if (ui.distanceOpen) closeDistance(); else openDistance(); return; }
  const note = markerNote(ui.sessionFormat, event.key.toLowerCase());
  if (!note || controller.acquisition !== 'acquiring') return;
  event.preventDefault();
  if (event.key.toLowerCase() === 'v') ui.videoRunning = true;
  ui.markers.unshift(controller.mark(`${note} (key)`));
  render();
});

async function startProtocol(entry) {
  ui.refusals.delete(entry.name);
  guideView.show(entry.name);
  if (monitor.mode === 'setup') setStatusMode('session'); // no voice over a rest or a session
  const result = await controller.startProtocol(entry.create(), { requireCueCheck: !!entry.requireCueCheck, requireCleanSignal: !!entry.requireCleanSignal, requireSpeech: !!entry.requireSpeech });
  if (!result.ok) ui.refusals.set(entry.name, `${result.reason} ${result.howTo ?? ''}`.trim());
  else { ui.refusals.clear(); resultsDirty = true; }
  render({ charts: true });
}

function setExportStatus(text, tone = 'idle') {
  exportStatus.dataset.tone = tone;
  setText(exportStatus, text);
}

/**
 * Called straight from the click: the save dialog must open before any other await. Exports one
 * recording, by default the latest; null exports the whole session in one file.
 */
const defaultExportSegment = () => (controller.segments.some((s) => s.end_reason === 'device_disconnected') ? null : latestRecording(controller.segments)?.id ?? null);
async function exportBundle(segmentId = defaultExportSegment()) {
  if (!controller.session) return;
  const segment = controller.segments.find((s) => s.id === segmentId) ?? null;
  const result = await saveBundle({
    suggestedName: `${bundleStem({ ...controller.session, segments: controller.segments }, segment)}.zip`,
    assemble: (sink, method) => controller.exportBundle(sink, { method, segmentId }),
    onStatus: setExportStatus,
  });
  if (result) {
    ui.exportedSession = controller.session.id;
    controller.log(result.method === 'file-picker' ? 'export_written' : 'export_download_requested', { filename: result.filename, method: result.method });
  }
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
  paintStatus();
  const entries = protocolEntries({ simulated });
  const states = controlStates(c, { missingSetup: missingSetup(), protocols: entries, deviceLabel: simulated ? 'simulator' : 'NPG', recordings: true });
  for (const [key, button] of Object.entries(buttons)) button.update(states[key]);
  const recordingCount = c.segments.length;
  setText(sessionLabel, c.session ? `Session of ${localDate(c.session.created_utc)}, ${localClock(c.session.created_utc)} · ${recordingCount} recording${recordingCount === 1 ? '' : 's'} · ${c.session.status}` : 'No session yet');
  sessionLabel.title = c.session?.id ?? '';
  sourceBadge.update(c);
  statusStrip.replaceChildren(...statusItems(c).filter((item) => item.tone === 'warning' || item.tone === 'error' || item.tone === 'stale').map((item) => h('span', { class: 'td-status', dataset: { tone: item.tone }, title: item.detail ?? '' },
    statusIcon(item.tone), h('span', { class: 'td-status-label', text: item.label }), h('span', { class: 'td-status-value', text: item.value }))));

  for (const el of setupFields) el.disabled = c.locked;
  for (const el of formatPicker.inputs) el.disabled = c.locked;
  for (const el of displayControls) el.disabled = c.protocol.running;
  lockedNote.hidden = !c.locked;
  formatWhy.hidden = !c.locked;
  guideView.setDevice(c.connection === 'connected' || c.acquisition === 'acquiring' || c.protocol.running, c.protocol.running);

  // Protocol buttons are rebuilt only when their content changes, so focus survives renders.
  const signature = entries.map((e) => `${e.name}:${e.detail}`).join('|');
  if (signature !== ui.protocolSignature) {
    ui.protocolSignature = signature;
    guideView.update(entries);
    const hadFocus = [...protocolButtons.entries()].find(([, b]) => b.button === document.activeElement)?.[0];
    protocolButtons.clear();
    protocolList.replaceChildren(h('span', { text: 'Protocols' }), protocolReason);
    for (const entry of entries) {
      const b = actionButton({ className: `td-btn td-protocol-btn${entry.primary ? ' td-btn--primary' : ''}`, onClick: () => startProtocol(entry) });
      b.update({ enabled: false, label: entry.label, content: () => [h('span', { class: 'td-index', text: entry.index }), h('b', { text: entry.label }), h('small', { text: entry.detail })] });
      protocolButtons.set(entry.name, b);
      protocolList.append(b.el);
    }
    if (hadFocus) protocolButtons.get(hadFocus)?.button.focus();
  }
  const reasons = new Map([...protocolButtons.keys()].map((name) => [name, states.protocols[name].why ?? ui.refusals.get(name) ?? null]));
  const shared = sharedReason([...reasons.values()]);
  protocolReason.hidden = !shared;
  setText(protocolReason, shared ?? '');
  for (const [name, b] of protocolButtons) b.update({ ...states.protocols[name], why: shared ? null : reasons.get(name) });
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
  protocolLauncher.hidden = running;
  setText(tabLive, running ? `${blockName(c.protocol.currentBlock().label)} · ${card.remaining} s` : '');
  setText(blockTitle, running ? blockName(c.protocol.currentBlock().label) : card.title);
  setText(blockInstruction, card.instruction);
  blockCountdown.hidden = blockProgress.hidden = !running;
  setText(blockCountdown, running ? `${card.remaining} s` : '');
  setText(blockStep, running ? `Block ${card.step} of ${card.steps}` : '');
  blockProgress.firstChild.style.width = `${Math.round((card.progress ?? 0) * 100)}%`;

  const now = performance.now();
  if (forceCharts || now - lastCharts > 240) { lastCharts = now; paintSignal(); }
  if (c.protocol.running && showExample) { showExample = false; renderResults(); }
  if (resultsDirty && !c.protocol.running) { resultsDirty = false; renderResults(); }
  renderRecordings();
}

const recordingCells = new Map();

/** One row per recording, each with its own export and test flag. Rebuilt only when it changes. */
function renderRecordings() {
  const c = controller;
  if (!c.session) {
    if (ui.recordingsSignature === 'none') return;
    ui.recordingsSignature = 'none';
    recordingsBody.replaceChildren(h('p', { class: 'td-muted', text: 'Each start of acquisition opens a recording, saved as it arrives. A lost device, a dead battery or a closed tab keeps everything up to the last second.' }));
    return;
  }
  const list = recordingSummaries({ ...c.session, segments: c.segments, protocols: c.protocol.protocols }, { liveIndex: c.counters.index, nowUtc: new Date().toISOString() });
  // Live numbers update in place: rebuilding the rows every second could swallow a click.
  const samplesText = (r) => (r.samples === null ? '—' : r.samples.toLocaleString('en-GB'));
  const signature = JSON.stringify([c.session.id, c.session.status, list.map((r) => [r.id, r.flag, r.ended, r.samples === 0, r.protocols])]);
  if (signature === ui.recordingsSignature) {
    for (const r of list) {
      const cells = recordingCells.get(r.id);
      if (cells) { setText(cells.length, lengthText(r.seconds)); setText(cells.samples, samplesText(r)); }
    }
    return;
  }
  ui.recordingsSignature = signature;
  recordingCells.clear();
  const hadFocus = document.activeElement?.dataset?.recordingAction;
  const rows = list.map((r) => {
    const cells = { length: h('td', { class: 'td-num', text: lengthText(r.seconds) }), samples: h('td', { class: 'td-num', text: samplesText(r) }) };
    recordingCells.set(r.id, cells);
    return h('tr', {},
    h('td', {}, String(r.id), r.flag === 'test' ? h('strong', { class: 'bw-test-flag', text: ' TEST' }) : null),
    h('td', { class: 'td-num', text: `${localClock(r.start_utc)} → ${r.live ? 'now' : localClock(r.end_utc)}` }),
    cells.length,
    cells.samples,
    h('td', { text: r.ended }),
    h('td', { text: r.protocols.map((p) => `${p.name} (${p.state})`).join(', ') || '—' }),
    h('td', { class: 'bw-recording-actions' },
      h('button', { class: 'td-btn', type: 'button', disabled: r.samples === 0, dataset: { recordingAction: `export-${r.id}` }, onclick: () => exportBundle(r.id) }, 'Export'),
      h('button', { class: 'td-btn', type: 'button', dataset: { recordingAction: `flag-${r.id}` }, onclick: () => c.flagRecording(r.id, r.flag === 'test' ? null : 'test') }, r.flag === 'test' ? 'Remove test flag' : 'Flag as test')));
  });
  recordingsBody.replaceChildren(
    h('div', { class: 'td-scroll-x' }, h('table', { class: 'td-table' },
      h('caption', { class: 'td-visually-hidden', text: 'Recordings of this session' }),
      h('thead', {}, h('tr', {}, ...['#', 'Time', 'Length', 'Samples', 'Ended', 'Protocols', ''].map((t) => h('th', { scope: 'col', text: t })))),
      h('tbody', {}, ...rows))),
    h('p', { class: 'td-caption', text: 'Each export holds one recording, and its file name gives the number and start time. A test flag deletes nothing: it adds TEST to the file name and to the metadata.' }),
    ...(list.length > 1 ? [h('button', { class: 'td-btn bw-export-all', type: 'button', dataset: { recordingAction: 'export-all' }, onclick: () => exportBundle(null) }, `Export all ${list.length} recordings in one file`)] : []));
  if (hadFocus) recordingsBody.querySelector(`[data-recording-action="${hadFocus}"]`)?.focus();
}

const SHORT_WARNING = Object.freeze({ [WARNINGS.line50]: '50 Hz', [WARNINGS.highFrequency]: 'high freq.', [WARNINGS.line150]: '150 Hz' });
/** Warnings that describe the expected signal of a channel kind are dropped (EMG is high-frequency). */
const relevantWarnings = (m, kind) => m.warnings.filter((w) => !(kind === 'emg' && w === WARNINGS.highFrequency));

const acquiringNow = (c) => c.acquisition === 'acquiring';

function chipState(m, acquiring, fresh, kind) {
  if (!acquiring) return { tone: 'idle', text: 'not acquiring' };
  if (!fresh) return { tone: 'warning', text: 'stale' };
  if (!m) return { tone: 'idle', text: 'waiting' };
  if (m.reasons.length) return { tone: 'error', text: m.reasons.join(', '), detail: m.reasons.join(' · ') };
  const warnings = relevantWarnings(m, kind);
  return { tone: warnings.length ? 'warning' : 'ready', text: `RMS ${fmt(m.rms, 0)}${warnings.length ? ` · ${warnings.map((w) => SHORT_WARNING[w] ?? w).join(' · ')}` : ''}`, detail: warnings.join(' · ') };
}

function paintSignal() {
  const c = controller;
  const d = c.display;
  const m = currentMontage();
  const ch = ui.liveChannel;
  const kind = channelKind(m, ch);
  const metrics = d?.metrics?.() ?? [];
  const deviceChannels = c.recorder?.channelCount ?? null;
  const shortOfChannels = acquiringNow(c) && deviceChannels !== null && deviceChannels < m.requiredChannels;
  const latest = metrics[ch];
  const proc = d?.proc;
  const acquiring = c.acquisition === 'acquiring';
  const hidden = ui.hideDuringProtocol && c.protocol.running;
  const status = hidden ? 'Hidden during the protocol'
    : !acquiring ? (c.engine ? 'Acquisition stopped' : 'Not acquiring')
    : !c.fresh ? 'Stale: no data for 2 s'
    : null;
  const raw = ui.view === 'raw', chords = ui.view === 'chords';
  const stacked = ui.signalLayout === 'all';
  const linkProblem = shortOfChannels ? { tone: 'error', text: `The device sends ${deviceChannels} channels; this montage needs ${m.requiredChannels}. Attach VibZ+ before switching the NPG on (it should appear as NPG-Lite-6CH), or start a new session with a three-channel montage.` }
    : acquiring && !c.fresh ? { tone: 'warning', text: 'No packets for 2 s. Check the link.' }
    : null;

  chipRefs.forEach(({ chip, value }, i) => {
    const s = shortOfChannels && i >= deviceChannels ? { tone: 'error', text: 'not sent by the device' } : chipState(metrics[i], acquiring, c.fresh, channelKind(m, i));
    chip.dataset.tone = s.tone;
    chip.title = [channelLabel(m, i), s.detail].filter(Boolean).join(' · ');
    chip.setAttribute('aria-pressed', String(!stacked && i === ch));
    chip.disabled = c.protocol.running;
    setText(value, s.text);
  });

  if (stacked) {
    const rows = m.channelNames.map((name, i) => ({
      name: `${i + 1} · ${channelKind(m, i).toUpperCase()}`,
      detail: name.split(' · ').slice(1).join(' · '),
      samples: d?.raw?.(i) ?? null,
      floor: TRACE_RANGE[channelKind(m, i)] ?? 50,
    }));
    drawStack(stackChart, { rows, status, simulated });
    flagsLine.dataset.tone = linkProblem?.tone ?? 'idle';
    setText(flagsLine, linkProblem?.text ?? (acquiring ? 'Each box above shows the raw quality of its channel.' : 'Not acquiring.'));
    return;
  }

  const rawRing = d?.raw?.(ch);
  const traceSamples = raw ? rawRing : chords ? proc?.samples : proc?.samples?.map((v) => v * 2048);
  const traceUnit = raw ? 'ADC counts (mean removed)' : chords ? 'Normalised (×2/4096)' : 'Count-equivalent';
  drawTrace(traceChart, { samples: traceSamples?.length ? traceSamples : null, range: chords ? ui.traceRange / 2048 : ui.traceRange, unit: traceUnit, status, simulated, centre: raw });
  traceChart.setLabel(`Channel ${ch + 1} ${raw ? 'raw' : 'filtered'} trace in ${traceUnit}`);
  traceHead.replaceChildren(h('strong', { text: `${ch + 1} · ${channelLabel(m, ch)}` }), h('span', { text: raw ? 'raw · last 4.1 s' : 'filtered · last 2 s' }));
  const notchText = ui.notch === '50h' ? '50/100/150/200 Hz notches' : ui.notch === '50' ? '50 Hz notch' : 'no notch';
  setText(traceFoot, raw ? `Unaltered ADC samples.${kind === 'emg' ? ' EMG is broadband: keep the raw view for it.' : ' Clipping and mains pickup stay visible here.'}` : `${chords ? 'Order-2 Butterworth ≈0.1–90 Hz' : 'Causal 0.5–45 Hz Butterworth'} · ${notchText} · restarts after any gap.`);

  if (raw) {
    drawSpectrum(spectrumChart, { values: latest?.psd, kind: 'psd', maxHz: ui.spectrumMax, unit: 'PSD (dB re 1 count²/Hz)', status, simulated });
    spectrumHead.replaceChildren(h('strong', { text: 'Welch PSD' }), h('span', { text: 'Hann 3 × 1024, 50% overlap' }));
    setText(spectrumFoot, 'Raw 4.1 s window. Dashed lines: multiples of 50 Hz.');
  } else {
    const magnitudes = proc?.latest?.magnitudes;
    drawSpectrum(spectrumChart, { values: chords ? magnitudes : magnitudes?.map((v) => v * 2048), kind: 'magnitude', maxHz: ui.spectrumMax, unit: chords ? 'FFT magnitude, normalised' : 'FFT magnitude, count-equiv.', status, simulated });
    spectrumHead.replaceChildren(h('strong', { text: 'Smoothed FFT magnitude' }), h('span', { text: '1024 points · ~2 s average' }));
    setText(spectrumFoot, 'Magnitude, not power density. Block summaries use the fixed analysis path.');
  }
  spectrumChart.setLabel(`Channel ${ch + 1} spectrum from 0 to ${ui.spectrumMax} Hz`);

  const eeg = kind === 'eeg';
  const shares = raw ? (latest ? Object.fromEntries(Object.entries(latest.relative).map(([k, v]) => [k, 100 * v])) : null) : proc?.latest?.bandPercent;
  bandBars.hidden = bandCaption.hidden = !eeg || hidden || !acquiring || !shares;
  setText(bandCaption, `Band shares of 0.5–45 Hz · ${raw ? 'raw Welch power' : 'display spectrum'} · not a focus score`);
  if (!bandBars.hidden) bandBars.replaceChildren(...Object.entries(shares).map(([name, v]) => h('div', {}, h('span', { text: name }), h('i', { style: `--v:${Math.max(0, Math.min(100, v))}%` }), h('strong', { class: 'td-num', text: `${v.toFixed(1)}%` }))));
  const analysisAlpha = c.engine?.filteredLatest?.[ch]?.bp.alpha;
  const quality = latest ? `near-rail ${(100 * latest.rail).toFixed(2)}% · 50 Hz ${(100 * latest.line).toFixed(1)}% · 150 Hz ${(100 * latest.line150).toFixed(1)}%` : '';
  setText(metricsLine, hidden ? 'Numbers hidden during the protocol.'
    : !latest || !acquiring ? ''
    : eeg ? `Alpha 8–13 Hz: ${Number.isFinite(analysisAlpha) ? `${fmt(analysisAlpha)} count-equiv.² (analysis) · ` : ''}raw ${fmt(latest.bp.alpha)} counts² · ${quality}`
    : `RMS ${fmt(latest.rms, 1)} counts · range ${fmt(latest.range, 0)} counts · ${quality}`);

  let tone = 'idle', text = acquiring ? 'Waiting for 4.1 s of continuous samples.' : 'Not acquiring.';
  if (linkProblem) { tone = linkProblem.tone; text = linkProblem.text; }
  else if (acquiring && latest) {
    if (latest.reasons.length) { tone = 'error'; text = `Channel ${ch + 1}: ${latest.reasons.join(', ')} in the raw signal. Filtering cannot repair it: check contacts.`; }
    else {
      const warnings = relevantWarnings(latest, kind);
      tone = warnings.length ? 'warning' : 'ready';
      text = warnings.length ? `Channel ${ch + 1}: no clipping · ${warnings.join(' · ')}` : `Channel ${ch + 1}: no clipping or flat signal.`;
    }
  }
  flagsLine.dataset.tone = tone;
  setText(flagsLine, text);
}

function renderResults() {
  const c = controller;
  const setExample = (on) => { showExample = on; renderResults(); };
  setText(resultsKicker, showExample ? 'Example · not a recording' : 'Descriptive · this session');
  if (showExample) {
    resultsBody.replaceChildren(...exampleView(BREATHWORK_EXAMPLES[ui.sessionFormat], { onHide: () => setExample(false), formatLabel: SESSION_FORMATS[ui.sessionFormat].label }));
    return;
  }
  const blocks = c.protocol.blocks;
  const m = currentMontage();
  if (!blocks.length) {
    resultsBody.replaceChildren(h('p', { class: 'td-muted', text: 'Block summaries appear after the first protocol. Heart rate, breathing and muscle activity are analysed after export.' }), exampleButton(() => setExample(true)));
    return;
  }
  const focused = document.activeElement?.dataset?.block;
  const adherenceSelect = (block) => {
    const s = h('select', { 'aria-label': `${blockName(block.label)}: adherence`, dataset: { block: block.id }, disabled: c.protocol.running },
      ...[['unconfirmed', 'Not confirmed'], ['as_instructed', 'Followed'], ['exclude', 'Missed / unsure → exclude']].map(([v, t]) => h('option', { value: v, text: t, selected: c.adherenceOf(block) === v })));
    s.onchange = () => { c.annotateAdherence(block.id, s.value); renderResults(); };
    return s;
  };
  const protocolName = (id) => c.protocol.protocols.find((p) => p.id === id)?.name ?? 'protocol';
  const eegName = `${EEG_CHANNEL + 1} · ${channelLabel(m, EEG_CHANNEL)}`;
  const rows = blocks.map((b) => {
    const s = breathBlockSummary(b, c.windows, EEG_CHANNEL, c.adherenceOf(b));
    const seconds = Number.isFinite(b.end_arrival_ms) ? (b.end_arrival_ms - b.start_arrival_ms) / 1000 : null;
    return h('tr', {},
      h('td', { text: `${protocolName(b.protocol_id)} #${b.protocol_id}` }),
      h('td', { text: blockName(b.label) }),
      h('td', { class: 'td-num', text: seconds != null ? `${Math.round(seconds)} s` : '—' }),
      h('td', { class: 'td-num', text: `${s.valid} / ${s.valid + s.rejected}` }),
      h('td', { class: 'td-num', text: fmt(s.alpha) }),
      h('td', { class: 'td-num', text: pct(s.relative_alpha_secondary) }),
      h('td', { class: 'td-num', text: pct(s.slow_share_secondary) }),
      h('td', {}, adherenceSelect(b)));
  });
  const nodes = [];
  const cmp = restComparison({ blocks, windows: c.windows, channel: EEG_CHANNEL, adherenceOf: (b) => c.adherenceOf(b) });
  if (cmp.rows.some((r) => r.before && r.after)) {
    const arrow = (a, b) => `${pct(a)} → ${pct(b)}`;
    nodes.push(restCard(cmp, { mark: simulated ? 'simulated' : null, channelName: eegName }));
    nodes.push(h('div', { class: 'td-report-block' }, h('h3', { text: 'Rest before → rest after' }), h('div', { class: 'td-scroll-x' }, h('table', { class: 'td-table' },
      h('caption', { class: 'td-visually-hidden', text: 'Rest before versus rest after, per eye state' }),
      h('thead', {}, h('tr', {}, ...['Eyes', 'α before', 'α after', 'After / before', 'α share', 'Slow share', 'Clean windows B / A'].map((t) => h('th', { scope: 'col', text: t })))),
      h('tbody', {}, ...cmp.rows.map((r) => h('tr', {},
        h('td', { text: r.state }),
        h('td', { class: 'td-num', text: fmt(r.before?.alpha) }),
        h('td', { class: 'td-num', text: fmt(r.after?.alpha) }),
        h('td', { class: 'td-num', text: r.status === 'eligible' ? `${r.alpha_ratio_after_before.toFixed(2)}×` : r.status.replaceAll('_', ' ') }),
        h('td', { class: 'td-num', text: arrow(r.before?.relative_alpha_secondary, r.after?.relative_alpha_secondary) }),
        h('td', { class: 'td-num', text: arrow(r.before?.slow_share_secondary, r.after?.slow_share_secondary) }),
        h('td', { class: 'td-num', text: `${r.before?.valid ?? 0} / ${r.after?.valid ?? 0}` }))))))));
  }
  nodes.push(h('div', { class: 'td-report-block' },
    h('h3', { text: `Blocks · EEG channel ${eegName}` }),
    h('div', { class: 'td-scroll-x' }, h('table', { class: 'td-table' },
      h('caption', { class: 'td-visually-hidden', text: `Per-block summary of channel ${eegName}` }),
      h('thead', {}, h('tr', {}, ...['Protocol', 'Block', 'Length', 'Clean windows', 'α power', 'α share', 'Slow share', 'Followed'].map((t) => h('th', { scope: 'col', text: t })))),
      h('tbody', {}, ...rows))),
    h('p', { class: 'td-caption', text: 'α power: median 8–13 Hz power after the fixed filter, count-equivalent². Shares: fraction of raw 0.5–45 Hz power in alpha (8–13 Hz) and in delta + theta (0.5–8 Hz).' })));
  if (simulated && !c.protocol.running) nodes.push(exampleButton(() => setExample(true)));
  resultsBody.replaceChildren(...nodes);
  if (focused) resultsBody.querySelector(`select[data-block="${focused}"]`)?.focus();
}

// ---------------------------------------------------------------- start
renderMontage();
renderFormat();
pushSetup();
render({ charts: true });


// ---------------------------------------------------------------- live status lights
const LAMP = Object.freeze({
  [GREEN]: { tone: 'green', word: 'GOOD' },
  [ORANGE]: { tone: 'orange', word: 'CHECK' },
  [RED]: { tone: 'red', word: 'NO SIGNAL' },
});

/** What one light shows, from the monitor plus link and montage state. */
function lampState(i) {
  const c = controller;
  const m = currentMontage();
  const kind = channelKind(m, i);
  if (i >= m.requiredChannels || kind === 'unused') return { tone: 'off', word: 'NOT USED', reason: '', info: '' };
  const acquiring = c.acquisition === 'acquiring';
  const deviceChannels = c.recorder?.channelCount ?? null;
  if (!acquiring) return ui.armed ? { tone: 'red', word: 'NO SIGNAL', reason: 'link lost', info: '' } : { tone: 'off', word: 'IDLE', reason: 'not acquiring', info: '' };
  if (deviceChannels !== null && i >= deviceChannels) return { tone: 'red', word: 'NO SIGNAL', reason: 'not sent by the device', info: '' };
  if (c.msSinceLastPacket > 2000) return { tone: 'red', word: 'NO SIGNAL', reason: 'no data', info: '' };
  const s = monitor.state[i];
  if (s.level === null) {
    const filled = Math.min(10, Math.floor(monitor.rings[i].len / 500));
    return { tone: 'wait', word: 'WAIT', reason: s.reasons[0] ?? `filling ${filled}/10 s`, info: '' };
  }
  const base = LAMP[s.level];
  return { ...base, reason: s.reasons.join(' · '), info: s.info };
}

function lampEl(big) {
  const dot = h('i', { class: 'bw-lamp-dot' });
  const title = h('strong'), word = h('span', { class: 'bw-lamp-word' }), reason = h('span', { class: 'bw-lamp-reason' }), info = h('span', { class: 'bw-lamp-info' });
  const el = h('div', { class: big ? 'bw-lamp bw-lamp--big' : 'bw-lamp' }, dot, h('div', { class: 'bw-lamp-text' }, title, word, reason, info));
  return { el, title, word, reason, info };
}
const smallLampRefs = Array.from({ length: MAX_CHANNELS }, () => lampEl(false));
const bigLampRefs = Array.from({ length: MAX_CHANNELS }, () => lampEl(true));
statusLamps.replaceChildren(...smallLampRefs.map((r) => r.el));
bigLamps.replaceChildren(...bigLampRefs.map((r) => r.el));

function paintStatus() {
  const m = currentMontage();
  const states = Array.from({ length: MAX_CHANNELS }, (_, i) => lampState(i));
  for (const refs of [smallLampRefs, bigLampRefs]) {
    refs.forEach((r, i) => {
      const st = states[i];
      const kind = channelKind(m, i);
      const site = (m.channelNames[i] ?? '').split(' · ')[1] ?? '';
      r.el.dataset.tone = st.tone;
      const big = refs === bigLampRefs;
      setText(r.title, kind === 'unused' ? `${i + 1} · —` : big ? `${i + 1} · ${voiceName(m.channelNames[i] ?? '')}` : `${i + 1} · ${kind.toUpperCase()}${site ? ` · ${site}` : ''}`);
      setText(r.word, st.word);
      setText(r.reason, st.reason);
      setText(r.info, st.info);
      r.el.title = `${channelLabel(m, i)} · ${st.word}${st.reason ? ` · ${st.reason}` : ''}`;
    });
  }
  setText(modeCaption, `${modeHelp[monitor.mode]} Green means connected, not clean. ECG checks beats, EEG also flags muscle (colour only, no sound), EOG and EMG check the connection: eye movements and tension are their signal.`);
  const c = controller;
  const battery = ui.macBattery ? ` · Mac battery ${Math.round(100 * ui.macBattery.level)}%${ui.macBattery.charging ? ', charging: unplug the charger for less mains noise' : ''}` : '';
  setText(boardInfo, boardSummary());
  setText(bigBoard, boardSummary());
  setText(bigInfo, `${c.acquisition === 'acquiring' ? `Acquiring · ${Math.floor(monitor.time / 60)} min ${String(Math.floor(monitor.time % 60)).padStart(2, '0')} s` : 'Not acquiring'} · ${{ setup: 'setup sounds', session: 'session sounds', silent: 'silent' }[monitor.mode]}${battery}`);
  const recent = monitor.alerts.slice(0, 3).map((a) => `${new Date(a.at).toLocaleTimeString('en-GB')} ch ${a.channel} ${a.level}`);
  setText(bigAlerts, recent.length ? `Last sounds: ${recent.join(' · ')}` : '');
}

// Link watch and the wake lock run on their own clock: a lost link sends no packets to render on.
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { wakeLock = null; }
}
setInterval(() => {
  const c = controller;
  const acquiring = c.acquisition === 'acquiring';
  if (acquiring) { ui.acqSince ??= performance.now(); ui.armed = true; } else ui.acqSince = null;
  // Finishing or starting a new session is not a lost link.
  if (!c.session || c.session.status !== 'recording') ui.armed = false;
  const settled = acquiring && performance.now() - ui.acqSince > 5000;
  monitor.watchLink({ acquiring: settled, msSinceLastPacket: c.msSinceLastPacket, disconnectedWhileArmed: ui.armed && !acquiring && c.connection !== 'connected' });
  keepAwake(c.acquisition === 'acquiring' || ui.distanceOpen);
  tryReconnect();
  if (c.acquisition !== 'acquiring') mirror.flush(); // the last rows and the events after a stop have no packet to carry them
  render();
}, 1000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wakeLock = null; });
// Any first click unlocks Web Audio, so the first alert is never swallowed.
document.addEventListener('pointerdown', () => monitor.tones.unlock?.(), { once: true });
navigator.getBattery?.().then((b) => {
  const upd = () => { ui.macBattery = { level: b.level, charging: b.charging }; render(); };
  upd(); b.addEventListener('levelchange', upd); b.addEventListener('chargingchange', upd);
}).catch(() => {});

function openDistance() {
  ui.distanceOpen = true;
  distance.hidden = false;
  monitor.tones.unlock?.();
  distance.requestFullscreen?.().catch(() => {});
  controller.log('distance_view', { open: true });
  render();
}
function closeDistance() {
  ui.distanceOpen = false;
  distance.hidden = true;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  controller.log('distance_view', { open: false });
  render();
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && ui.distanceOpen) closeDistance(); });


// ---------------------------------------------------------------- NPG Beast feedback (Thermodrift firmware)
const LETTER = Object.freeze({ green: 'G', orange: 'O', red: 'R', wait: 'B', off: 'X' });
function boardPattern() {
  return 'Q' + Array.from({ length: MAX_CHANNELS }, (_, i) => LETTER[lampState(i).tone] ?? 'X').join('');
}
async function boardSend(text) {
  const t = controller.deps?.transport ?? transport;
  if (!t.command) return false;
  return t.command(text);
}
/** n: 1 orange, 2 red. Buzzer and motor are stimuli: each one is logged with its time. */
function boardFeedback(n, why, { vibrate = true } = {}) {
  const sent = [];
  if (boardChecks.buzzer.checked) { boardSend(`BZ${n}`); sent.push(`BZ${n}`); }
  if (vibrate && boardChecks.vibrate.checked) { boardSend(`VB${n}`); sent.push(`VB${n}`); }
  if (sent.length) controller.log('board_feedback', { commands: sent, why, t_s: Math.round(monitor.time) });
}
async function testBoard() {
  ui.boardTestUntil = performance.now() + 8000;
  const ok = await boardSend('QGORBXG');
  if (boardChecks.buzzer.checked) await boardSend('BZ1');
  if (boardChecks.vibrate.checked) await boardSend('VB1');
  controller.log('board_feedback', { commands: ['QGORBXG', 'BZ1'], why: 'test' });
  setText(boardNote, ok ? 'Sent: LEDs read green, orange, red, blue, off, green for 8 s. Nothing on the board means the stock firmware.' : 'Not connected to an NPG (or simulator): nothing sent.');
}
/** Called on every status evaluation (2 s of samples). The firmware clears the LEDs after 15 s of silence, so a stopped stream never leaves a stale green. */
function sendBoardPattern() {
  if (!boardChecks.lights.checked || controller.connection !== 'connected' || controller.acquisition !== 'acquiring') return;
  if (performance.now() < ui.boardTestUntil) return;
  boardSend(boardPattern());
}
boardChecks.lights.onchange = () => { if (!boardChecks.lights.checked) boardSend('QXXXXXX'); controller.log('board_feedback_settings', { lights: boardChecks.lights.checked }); };
boardChecks.buzzer.onchange = () => controller.log('board_feedback_settings', { buzzer: boardChecks.buzzer.checked });
boardChecks.vibrate.onchange = () => controller.log('board_feedback_settings', { vibrate: boardChecks.vibrate.checked });

// ---------------------------------------------------------------- lost link: back by itself
/**
 * After an unexpected link loss, retry the same device without any click and start a new recording
 * in the same session. The gap is in the file (segments + device_reconnected), and the default
 * export then takes the whole session, so nothing is left in a second file.
 */
async function tryReconnect() {
  const c = controller;
  if (!ui.armed || ui.reconnecting || c.acquisition !== 'idle' || c.connection === 'connected' || c.session?.status !== 'recording') return;
  if (ui.reconnectAttempts >= 300) return; // about 15 min: the board is off or the battery is dead
  ui.reconnecting = true;
  ui.reconnectAttempts++;
  try {
    if (await c.reconnect()) {
      const started = await c.startAcquisition();
      c.log('auto_restart', { ok: started.ok, attempts: ui.reconnectAttempts, reason: started.reason ?? null });
      if (started.ok) ui.reconnectAttempts = 0;
      boardSend('TDVER');
    }
  } finally {
    // Each failed connect can take seconds; the 1 s loop simply retries when this one ends.
    ui.reconnecting = false;
  }
}

// ---------------------------------------------------------------- what only the board knows
function boardSummary() {
  const c = controller;
  const parts = [];
  parts.push(ui.boardBattery === null ? 'Board battery: known about 10 s after Start' : `Board battery ${ui.boardBattery}%${ui.boardBattery <= 20 ? ' · LOW' : ''}`);
  parts.push(ui.firmware ? `firmware ${ui.firmware}` : 'firmware not reported');
  parts.push(`button ${ui.buttonPresses}${ui.lastButton ? ` (last: ${ui.lastButton})` : ''}`);
  const m = mirror.state;
  if (!m.on) parts.push('disk copy off');
  else if (m.failed) parts.push('DISK COPY FAILING');
  else parts.push(`disk copy ${(m.bytes / 1e6).toFixed(1)} MB`);
  if (ui.armed && c.acquisition !== 'acquiring') parts.push(`link lost, reconnecting (try ${ui.reconnectAttempts})`);
  return parts.join(' · ');
}

/** The firmware has already beeped the click count. A refused action gets the two-tone alert on top. */
async function handleButton(text) {
  const press = parseButton(text);
  if (!press) return;
  const c = controller;
  const action = buttonAction(press.clicks, { acquiring: c.acquisition === 'acquiring', videoRunning: ui.videoRunning });
  const when = `button, first press ${press.offsetMs} ms before this mark`;
  const mark = (note) => { ui.markers.unshift(c.mark(`${note} (${when})`)); ui.lastButton = note; };
  const videoNote = (to) => markerNote(ui.sessionFormat, 'v').replace('start', to);
  const refuse = (reason) => {
    ui.lastButton = `refused: ${reason}`;
    c.log('button_refused', { clicks: press.clicks, reason });
    boardFeedback(2, 'button_refused', { vibrate: false });
  };
  ui.buttonPresses++;
  if (action.kind === 'refuse') refuse(action.reason);
  else if (action.kind === 'marker') mark(`marker ${ui.buttonPresses}`);
  else if (action.kind === 'video') { ui.videoRunning = action.to === 'start'; mark(videoNote(action.to)); }

  render();
}
window.__breathworkButton = handleButton; // DevTools inspection and simulator tests only

if (transport.kind === 'ble') {
  transport.on('control', (text) => {
    if (text.startsWith('TD-')) {
      ui.firmware = text;
      controller.log('firmware_version', { version: text });
      render();
    } else {
      handleButton(text);
    }
  });
  transport.on('battery', (pct) => {
    if (pct !== ui.boardBattery) controller.log('board_battery', { percent: pct });
    ui.boardBattery = pct;
    for (const limit of [20, 10]) {
      if (pct <= limit && !ui.batteryAlerted.has(limit)) {
        ui.batteryAlerted.add(limit);
        monitor.tones.orange?.();
        boardFeedback(1, `battery_${limit}`, { vibrate: false });
      }
    }
    render();
  });
}
// Ask the firmware its version as soon as a connection exists: it goes in the file.
{
  let wasConnected = false;
  controller.subscribe(() => {
    const connected = controller.connection === 'connected';
    if (connected && !wasConnected) boardSend('TDVER');
    wasConnected = connected;
  });
}

// ---------------------------------------------------------------- leaving the page
window.addEventListener('beforeunload', (event) => {
  const c = controller;
  mirror.flush();
  const unexported = c.session && c.health?.samples > 0 && ui.exportedSession !== c.session.id;
  if (c.acquisition === 'acquiring' || unexported) { event.preventDefault(); event.returnValue = ''; }
});
