/**
 * Session report. Opens a session saved in this browser (?session=<id>), an exported bundle
 * (.zip) or a Berger v3 file set. Never connects to hardware and never plays a cue.
 * Results are recomputed from the stored windows with the same analysis code as the live app.
 */
import { appName, brand } from '../../src/ui/components/lab-mark.js';
import { h, setText, statusIcon } from '../../src/ui/dom.js';
import { pairsCard, restCard, timeCourseCard, timeCourseFrom } from '../../src/ui/charts/report.js';
import { montageSvg } from '../../src/ui/components/montage.js';
import { openIdbStore } from '../../src/session/store-idb.js';
import { loadFromStore, loadFromBundle, loadLegacyFiles, appendReviewAnnotation } from '../../src/session/load.js';
import { exportSessionBundle } from '../../src/session/bundle.js';
import { bundleStem, flagStoredRecording, lengthText, recordingSummaries } from '../../src/session/recordings.js';
import { effectiveAdherence, confirmableEyeBlocks } from '../../src/analysis/adherence.js';
import { blockSummary, BERGER_V3, analysisFilterDescription } from '../../src/analysis/berger-v3.js';
import { humanLabel } from '../../src/lab/viewmodel.js';
import { saveBundle } from '../../src/ui/save-bundle.js';
import { instrumentFor } from '../registry.js';
import { eyeProtocolIds, eyeResults, processingFor, recordedResultFor, restResults } from './review.js';

const root = document.getElementById('app');
const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');
const seconds = (ms) => (Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)} s` : '—');
const localTime = (utc) => (utc ? new Date(utc).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

let store = null;
try { store = await openIdbStore(); } catch { /* files can still be opened */ }

let view = null;
let localAnnotations = []; // file views only: kept in this page, not saved anywhere

// ---------------------------------------------------------------- frame
const titleLine = h('span', { class: 'td-caption td-mono', text: 'No session open' });
root.append(h('header', { class: 'td-header' },
  brand({ href: '../', logo: '../../brand/thermodrift-logo.png' }),
  appName('Session report', 'Review only · no hardware'),
  h('span', { class: 'td-spacer' }),
  titleLine));
const banner = h('div', { class: 'td-simulated-banner', role: 'note', hidden: true }, 'SIMULATED — synthetic test pattern, not a recording and not physiology.');
root.append(banner);

const sessionSelect = h('select', { 'aria-label': 'Sessions saved in this browser' });
const fileInput = h('input', { type: 'file', accept: '.zip,.csv,.json', multiple: true });
root.append(h('div', { class: 'rp-chooser' },
  h('label', { class: 'td-field' }, h('span', { text: 'Saved in this browser' }), sessionSelect),
  h('label', { class: 'td-btn rp-file' }, fileInput, 'Open a bundle or v3 files…')));
const main = h('main', { class: 'td-main' });
root.append(main);

const message = (text, tone) => main.replaceChildren(h('p', { class: 'rp-message', dataset: { tone: tone ?? 'idle' }, text }));

async function refreshSessionList(selected) {
  const sessions = store ? await store.listSessions() : [];
  sessionSelect.replaceChildren(h('option', { value: '', text: sessions.length ? `${sessions.length} session${sessions.length > 1 ? 's' : ''} — choose one` : 'None yet' }),
    ...sessions.map((s) => h('option', { value: s.id, selected: s.id === selected, text: `${localTime(s.created_utc)} · ${s.source?.kind === 'simulated' ? 'SIMULATED · ' : ''}${s.status} · ${s.id}` })));
  sessionSelect.disabled = !sessions.length;
}

sessionSelect.onchange = () => {
  if (!sessionSelect.value) return;
  history.replaceState(null, '', `?session=${encodeURIComponent(sessionSelect.value)}`);
  openFromStore(sessionSelect.value);
};

fileInput.onchange = async () => {
  const files = [...fileInput.files];
  fileInput.value = '';
  if (!files.length) return;
  message('Reading files…');
  try {
    const loaded = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })));
    const zip = loaded.find((f) => f.name.endsWith('.zip'));
    show(zip ? await loadFromBundle(zip.bytes) : await loadLegacyFiles(loaded));
    history.replaceState(null, '', location.pathname);
    sessionSelect.value = '';
  } catch (error) {
    message(`Could not open these files: ${error.message}`, 'error');
  }
};

async function openFromStore(id) {
  if (!store) return message('Browser storage is unavailable here. Open an exported bundle instead.', 'error');
  message('Opening and verifying the saved session…');
  try {
    show(await loadFromStore(store, id));
  } catch (error) {
    message(error.message, 'error');
  }
}

// ---------------------------------------------------------------- rendering
function annotations() {
  return view.editable ? view.annotations : [...view.annotations, ...localAnnotations];
}
const adherenceOf = (b) => effectiveAdherence(b, annotations());

let app = null; // registry entry for the open session

function show(next) {
  view = next;
  app = instrumentFor(view.app);
  if (!app) return message(`This report does not know the app "${view.app}" yet.`, 'error');
  localAnnotations = [];
  banner.hidden = !view.simulated;
  setText(titleLine, `${view.id} · ${view.status}`);
  document.title = `${view.simulated ? 'SIMULATED · ' : ''}Report ${view.id} · Thermodrift Lab`;
  render();
}

function render() {
  const channel = app.analysisChannel(view);
  const results = eyeResults(view, channel, adherenceOf);
  const rests = restResults(view, app, channel, adherenceOf);
  main.replaceChildren(
    summarySection(results, channel),
    ...results.map((r) => resultsSection(r)),
    ...(rests ? [restSection(rests, channel)] : []),
    blocksSection(channel),
    h('div', { class: 'rp-columns' }, setupSection(), processingSection(channel)),
    h('div', { class: 'rp-columns' }, integritySection(), eventsSection()),
    limitationsSection(),
  );
}

function panel(index, title, kicker, ...body) {
  return h('section', { class: 'td-panel', 'aria-label': title },
    h('header', {}, h('h2', {}, h('span', { class: 'td-index', text: index }), title), kicker ? h('span', { class: 'td-kicker', text: kicker }) : null),
    h('div', { class: 'td-body' }, ...body));
}

function summarySection(results, channel) {
  const montage = app.montages[view.montage];
  const duration = (view.segments ?? []).reduce((s, g) => s + Math.max(0, (g.end_arrival_ms ?? g.start_arrival_ms) - g.start_arrival_ms), 0);
  const metric = (label, value, small = false) => h('div', { class: `td-metric${small ? ' rp-metric-small' : ''}` }, h('span', { text: label }), h('strong', { text: String(value) }));
  const latest = results.at(-1)?.res;
  const lead = latest?.eligible_count
    ? [h('strong', { text: `${latest.higher_closed_count} of ${latest.eligible_count}` }), ' eligible pairs have higher alpha with eyes closed; median closed / open ', h('strong', { text: `${fmt(latest.median_ratio)}×` }), '.']
    : results.length ? 'No eligible pair yet: review adherence below.'
    : channel === null && eyeProtocolIds(view).length ? 'This session does not say which channel holds the EEG, so no alpha result is shown.'
    : app.results === 'eye-pairs' ? 'No eyes-open / eyes-closed protocol in this session.'
    : `${app.name} session: blocks, markers and integrity below; the export holds every channel.`;
  const origin = { browser: 'Saved in this browser', bundle: 'Exported bundle', 'legacy-v3': 'Berger v3 files' }[view.origin];
  return panel('01', 'Summary', origin,
    h('p', { class: 'rp-lead' }, lead),
    h('div', { class: 'td-metrics' },
      metric('Source', view.simulated ? 'Simulated pattern' : view.source?.device_name ?? 'unknown', true),
      metric('Started', localTime(view.created_utc), true),
      metric('Recorded', duration ? `${Math.round(duration / 1000)} s` : '—'),
      metric('Samples', view.sample_count != null ? view.sample_count.toLocaleString('en-GB') : '—'),
      metric('Missing', view.health?.gaps ?? '—'),
      metric('Montage', montage?.summary ?? montage?.channelNames?.[0] ?? view.montage, true),
      app.sessionFormatLabel ? metric('Session format', app.sessionFormatLabel(view.session_format), true) : null,
      metric('App', `${view.app} ${view.app_version}`, true),
      metric('Analysis plan', view.analysis_plan, true)),
    view.close_reason && view.status !== 'closed' ? h('p', { class: 'rp-note', dataset: { tone: 'warning' }, text: view.close_reason }) : null);
}

function resultsSection({ id, protocol, res }) {
  const blocks = view.blocks.filter((b) => b.protocol_id === id);
  const canEdit = view.editable || view.origin !== 'browser';
  const adherenceSelect = (block) => {
    if (!block) return '—';
    const s = h('select', { 'aria-label': `${humanLabel(block.label)}: adherence`, dataset: { block: block.id }, disabled: !canEdit || block.adherence === 'exclude' },
      ...[['unconfirmed', 'Not confirmed'], ['as_instructed', 'Followed'], ['exclude', 'Missed / unsure → exclude']].map(([v, t]) => h('option', { value: v, text: t, selected: adherenceOf(block) === v })));
    s.onchange = () => annotate([block], s.value, s.dataset.block);
    return s;
  };
  const rows = res.pairs.map((p) => {
    const ob = blocks.find((b) => b.label === `eyes_open_pair${p.pair}`);
    const cb = blocks.find((b) => b.label === `eyes_closed_pair${p.pair}`);
    return h('tr', {},
      h('th', { scope: 'row', text: `Pair ${p.pair}` }),
      h('td', { class: 'td-num', text: fmt(p.open?.alpha) }),
      h('td', { class: 'td-num', text: fmt(p.closed?.alpha) }),
      h('td', { class: 'td-num', text: p.status === 'eligible' ? `${p.ratio.toFixed(2)}×` : p.status.replace('_', ' ') }),
      h('td', { class: 'td-num', text: p.status === 'eligible' ? `${p.raw_ratio_secondary.toFixed(2)}×` : '—' }),
      h('td', { class: 'td-num', text: `${p.open?.valid ?? 0} / ${p.closed?.valid ?? 0}` }),
      h('td', {}, adherenceSelect(ob)), h('td', {}, adherenceSelect(cb)));
  });
  const name = protocol?.name === 'berger-demo' ? 'Demo run (simulated)' : 'Berger test';
  const title = `${name} #${id}${protocol?.audio_condition === 'external_audio' ? ' · external audio, exploratory' : ''}`;
  const recorded = recordedResultFor(view, id);
  const mark = view.simulated ? 'simulated' : null;
  const course = timeCourseFrom({ blocks, windows: view.windows.filter((w) => w.protocol_id === id), markers: view.events.filter((e) => e.label === 'operator_marker' || e.label === 'marker'), channel: res.channel });
  const confirm = h('button', { class: 'td-btn', type: 'button', disabled: !canEdit }, 'I followed every eye-state instruction not excluded');
  confirm.onclick = () => annotate(confirmableEyeBlocks(blocks, annotations()), 'as_instructed');
  return panel('02', title, protocol?.end_reason ? `${protocol.end_reason}` : null,
    timeCourseCard(course, res, { mark, hero: true }),
    pairsCard(res, { mark, hero: false }),
    h('div', { class: 'td-scroll-x' }, h('table', { class: 'td-table' },
      h('caption', { class: 'td-visually-hidden', text: `${title}: alpha per prompted pair` }),
      h('thead', {}, h('tr', {}, ...['Pair', 'Open α', 'Closed α', 'Closed / open', 'Raw ratio (secondary)', 'Clean windows O / C', 'Open block', 'Closed block'].map((t) => h('th', { scope: 'col', text: t })))),
      h('tbody', {}, ...rows))),
    h('div', { class: 'rp-export' }, confirm,
      !view.editable && view.origin === 'browser' ? h('p', { text: 'Still recording in another tab: review it there.' }) : null,
      view.origin !== 'browser' ? h('p', { text: 'File view: adherence changes stay on this page.' }) : null),
    h('p', { class: 'rp-note' }, `α = median absolute 8–13 Hz power of clean windows after the fixed 0.5–45 Hz filter and notches (count-equivalent², not µV). A pair counts when both blocks are marked followed and each has ≥2 clean windows. Eye states are prompted, not measured.${res.channel ? ` Read from channel ${res.channel + 1}.` : ''}`),
    recorded ? h('p', { class: 'rp-note', text: `At export: ${recorded.eligible_count} eligible pair(s)${recorded.eligible_count ? `, median ${fmt(recorded.median_ratio)}×` : ''}, with the adherence recorded then.` }) : null);
}

function restSection(comparison, channel) {
  const channelName = `${channel + 1} · ${view.channel_names?.[channel] ?? app.channelLabel(app.montages[view.montage], channel)}`;
  return panel('02', 'Rest before → rest after', 'descriptive',
    restCard(comparison, { mark: view.simulated ? 'simulated' : null, channelName }),
    h('div', { class: 'td-scroll-x' }, h('table', { class: 'td-table' },
      h('caption', { class: 'td-visually-hidden', text: 'Rest before versus rest after, per eye state' }),
      h('thead', {}, h('tr', {}, ...['Eyes', 'α before', 'α after', 'After / before', 'Clean windows B / A'].map((t) => h('th', { scope: 'col', text: t })))),
      h('tbody', {}, ...comparison.rows.map((r) => h('tr', {},
        h('td', { text: r.state }),
        h('td', { class: 'td-num', text: fmt(r.before?.alpha) }),
        h('td', { class: 'td-num', text: fmt(r.after?.alpha) }),
        h('td', { class: 'td-num', text: r.status === 'eligible' ? `${r.alpha_ratio_after_before.toFixed(2)}×` : r.status.replaceAll('_', ' ') }),
        h('td', { class: 'td-num', text: `${r.before?.valid ?? 0} / ${r.after?.valid ?? 0}` })))))));
}

async function annotate(blocks, value, focusBlock) {
  if (view.editable) {
    for (const b of blocks) {
      try {
        view.annotations.push(await appendReviewAnnotation(store, view.id, { kind: 'adherence', block_id: b.id, protocol_id: b.protocol_id, value }));
      } catch (error) {
        message(`Could not save the annotation: ${error.message}`, 'error');
        return;
      }
    }
  } else {
    for (const b of blocks) localAnnotations.push({ seq: 1e9 + localAnnotations.length, kind: 'adherence', block_id: b.id, protocol_id: b.protocol_id, value, actor: 'operator (this page only)' });
  }
  const y = window.scrollY;
  render();
  window.scrollTo(0, y);
  if (focusBlock) main.querySelector(`select[data-block="${focusBlock}"]`)?.focus();
}

function blocksSection(channel) {
  const rows = view.blocks.map((b) => {
    const adherence = adherenceOf(b);
    const s = channel === null ? null : blockSummary(b, view.windows, channel, adherence);
    const cue = Number.isFinite(b.speech_end_arrival_ms) ? seconds(b.speech_end_arrival_ms - b.start_arrival_ms) : b.speech_requested === false ? 'not spoken' : '—';
    return h('tr', {},
      h('td', { class: 'td-num', text: `${b.protocol_id}.${b.id}` }),
      h('th', { scope: 'row', text: humanLabel(b.label) }),
      h('td', { class: 'td-num', text: seconds((b.end_arrival_ms ?? b.start_arrival_ms) - b.start_arrival_ms) }),
      h('td', { class: 'td-num', text: cue }),
      h('td', { class: 'td-num', text: s ? `${s.valid} / ${s.valid + s.rejected}` : '—' }),
      h('td', { text: { as_instructed: 'followed', exclude: 'excluded', unconfirmed: 'not confirmed' }[adherence] ?? adherence }),
      h('td', { text: [b.complete ? null : 'incomplete', ...(b.deviations ?? [])].filter(Boolean).join(' · ') || '—' }));
  });
  return panel('03', 'Blocks', channel ? `as prompted · windows of channel ${channel + 1}` : 'as prompted',
    rows.length ? h('div', { class: 'td-scroll-x' }, h('table', { class: 'td-table' },
      h('thead', {}, h('tr', {}, ...['#', 'Block', 'Length', 'Cue ended after', 'Clean / counted windows', 'Adherence', 'Notes'].map((t) => h('th', { scope: 'col', text: t })))),
      h('tbody', {}, ...rows))) : h('p', { class: 'td-muted', text: 'No protocol blocks in this session.' }));
}

/** What actually ran: the audio is chosen per run, so the setup value alone can be out of date. */
function audioConditions(setup) {
  const ran = [...new Set(view.protocols.map((p) => p.audio_condition).filter(Boolean))];
  return (ran.length ? ran : [setup.audio_condition]).map((c) => ({ cues_only: 'spoken cues only', external_audio: 'external audio (exploratory)' })[c] ?? c);
}

function setupSection() {
  const montage = app.montages[view.montage];
  const s = view.setup ?? {};
  const confirmations = s.operator_confirmations ? Object.entries(s.operator_confirmations).map(([k, v]) => `${k.replaceAll('_', ' ')}: ${v ? 'yes' : 'no'}`).join(' · ') : '—';
  return panel('04', 'Setup', 'as entered before acquisition',
    montage ? h('div', { class: 'td-montage' }, montageSvg({ leads: montage.leads, compact: false })) : null,
    h('dl', { class: 'rp-dl' },
      h('dt', { text: 'Montage' }), h('dd', { text: montage?.label ?? view.montage }),
      app.sessionFormatLabel ? h('dt', { text: 'Session format' }) : null, app.sessionFormatLabel ? h('dd', { text: app.sessionFormatLabel(view.session_format) }) : null,
      h('dt', { text: 'Leads' }), h('dd', { text: montage ? montage.leads.map((l) => `${l.pin} → ${l.siteLabel}`).join(' · ') : '—' }),
      h('dt', { text: 'Pads' }), h('dd', { text: s.pad_condition ?? '—' }),
      h('dt', { text: 'Checks' }), h('dd', { text: confirmations }),
      h('dt', { text: 'Placement notes' }), h('dd', { text: view.placement_notes || '—' }),
      h('dt', { text: 'Prediction' }), h('dd', { text: view.hypothesis || '—' }),
      h('dt', { text: 'Audio' }), h('dd', { text: [...audioConditions(s), s.audio_notes].filter(Boolean).join(' · ') || '—' }),
      h('dt', { text: 'Cues' }), h('dd', { text: s.cue_mode ?? '—' })));
}

function processingSection(channel) {
  const filter = view.processing?.analysis?.filter ?? analysisFilterDescription();
  const notches = [filter.notch_sos?.length ? 50 : null, ...(filter.harmonic_notches_hz ?? [])].filter(Boolean);
  const { plan, metric, eligibility, channelName } = processingFor(view, app, channel);
  return panel('05', 'Processing', plan,
    h('dl', { class: 'rp-dl' },
      h('dt', { text: 'Primary metric' }), h('dd', { text: metric }),
      channelName ? h('dt', { text: 'Channel' }) : null, channelName ? h('dd', { text: channelName }) : null,
      h('dt', { text: 'Filter' }), h('dd', { text: `${filter.note ?? 'Causal 0.5–45 Hz Butterworth.'}${notches.length ? ` Notches at ${notches.join(', ')} Hz.` : ''}` }),
      h('dt', { text: 'Spectrum' }), h('dd', { text: BERGER_V3.welch }),
      h('dt', { text: 'Window rules' }), h('dd', { text: `${BERGER_V3.window_samples} samples; inside the block; ≥${BERGER_V3.transition_exclusion_s} s after the cue ended; ${BERGER_V3.filter_warmup_and_rail_guard_s} s guard after filter start or a raw rail.` }),
      h('dt', { text: 'Units' }), h('dd', { text: BERGER_V3.units }),
      h('dt', { text: 'Eligibility' }), h('dd', { text: eligibility })));
}

function integritySection() {
  const tone = (ok) => (ok === true ? 'ready' : ok === false ? 'error' : 'idle');
  const items = view.integrity.checks.map((c) => h('li', { dataset: { tone: tone(c.ok) } }, statusIcon(tone(c.ok)), h('span', { text: c.label }), h('small', { text: c.detail ?? '' })));
  const files = view.files?.length ? h('details', {}, h('summary', { text: 'File hashes (SHA-256)' }),
    h('ul', { class: 'rp-checks' }, ...view.files.map((f) => h('li', {}, h('span'), h('span', { class: 'td-mono', text: `${f.name} · ${f.sha256}` }), h('small', { text: `${(f.bytes / 1e6).toFixed(2)} MB` }))))) : null;
  const exportStatus = h('p', { role: 'status' });
  const fromBrowser = view.origin === 'browser';
  const exportOne = (segmentId) => saveBundle({
    suggestedName: `${bundleStem(view, view.segments.find((s) => s.id === segmentId) ?? null)}.zip`,
    assemble: (sink, method) => exportSessionBundle({ store, sessionId: view.id, segmentId, describe: (ctx) => app.describe(ctx), windowChannelLabel: (ch) => app.channelLabel(app.montages[view.montage], ch), sink, exportInfo: { method, from: 'report' } }),
    onStatus: (text, t = 'idle') => { exportStatus.dataset.tone = t; setText(exportStatus, text); },
  });
  const exportButton = fromBrowser ? h('button', { class: 'td-btn', type: 'button', onclick: () => exportOne(null) }, view.segments.length > 1 ? `Export all ${view.segments.length} recordings in one file` : 'Export bundle (.zip)') : null;
  const flagOne = async (segmentId, flag) => {
    try { await flagStoredRecording(store, view.id, segmentId, flag); openFromStore(view.id); }
    catch (error) { exportStatus.dataset.tone = 'error'; setText(exportStatus, error.message); }
  };
  const recordings = fromBrowser ? recordingSummaries(view) : [];
  const localClock = (utc) => (utc ? new Date(utc).toLocaleTimeString('en-GB') : '—');
  const recordingList = recordings.length ? h('div', { class: 'td-scroll-x' }, h('table', { class: 'td-table' },
    h('thead', {}, h('tr', {}, ...['Recording', 'Time', 'Length', 'Ended', ''].map((t) => h('th', { scope: 'col', text: t })))),
    h('tbody', {}, ...recordings.map((r) => h('tr', {},
      h('td', { class: 'td-num', text: `${r.id}${r.flag === 'test' ? ' · TEST' : ''}` }),
      h('td', { class: 'td-num', text: `${localClock(r.start_utc)} → ${localClock(r.end_utc)}` }),
      h('td', { class: 'td-num', text: lengthText(r.seconds) }),
      h('td', { text: r.ended }),
      h('td', {},
        recordings.length > 1 ? h('button', { class: 'td-btn', type: 'button', disabled: r.samples === 0, onclick: () => exportOne(r.id) }, 'Export') : null,
        view.status === 'recording' ? null : h('button', { class: 'td-btn', type: 'button', onclick: () => flagOne(r.id, r.flag === 'test' ? null : 'test') }, r.flag === 'test' ? 'Remove test flag' : 'Flag as test'))))))) : null;
  return panel('06', 'Integrity', view.integrity.ok ? 'checks pass' : 'see below',
    h('ul', { class: 'rp-checks' }, ...items), files, recordingList,
    exportButton ? h('div', { class: 'rp-export' }, exportButton, exportStatus) : null);
}

function eventsSection() {
  const rows = view.events.map((e) => h('tr', {},
    h('td', { class: 'td-num', text: Number.isFinite(e.arrival_ms) ? (e.arrival_ms / 1000).toFixed(1) : '—' }),
    h('td', { text: e.label }),
    h('td', { class: 'td-num', text: e.block_id ? `${e.protocol_id}.${e.block_id}` : '' }),
    h('td', { text: e.note ?? e.text ?? e.reason ?? e.error ?? '' })));
  return panel('07', 'Events', `${view.events.length} logged`,
    h('details', {}, h('summary', { text: 'Show the event log' }),
      h('div', { class: 'rp-events td-scroll-x' }, h('table', { class: 'td-table' },
        h('thead', {}, h('tr', {}, ...['Time (s)', 'Event', 'Block', 'Detail'].map((t) => h('th', { scope: 'col', text: t })))),
        h('tbody', {}, ...rows)))));
}

function limitationsSection() {
  return h('p', { class: 'rp-note', text: `Limits: ${app.limitations}` });
}

// ---------------------------------------------------------------- start
const requested = new URLSearchParams(location.search).get('session');
await refreshSessionList(requested);
if (requested) openFromStore(requested);
else message('Choose a session saved in this browser, or open an exported bundle (.zip) or a Berger v3 file set (metadata.json + windows.csv).');
