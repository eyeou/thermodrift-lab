/**
 * Session report. Opens a session saved in this browser (?session=<id>), an exported bundle
 * (.zip) or a Berger Lab v3 file set. Never connects to hardware and never plays a cue.
 * Results are recomputed from the stored windows with the same analysis code as the live app.
 */
import { h, setText, statusIcon } from '../../src/ui/dom.js';
import { createCanvas, drawPairs, drawTimeline } from '../../src/ui/charts/canvas.js';
import { montageSvg } from '../../src/ui/components/montage.js';
import { openIdbStore } from '../../src/session/store-idb.js';
import { loadFromStore, loadFromBundle, loadLegacyFiles, appendReviewAnnotation } from '../../src/session/load.js';
import { exportSessionBundle } from '../../src/session/bundle.js';
import { effectiveAdherence, confirmableEyeBlocks } from '../../src/analysis/adherence.js';
import { pairedResults, blockSummary, BERGER_V3, analysisFilterDescription } from '../../src/analysis/berger-v3.js';
import { humanLabel } from '../../src/lab/viewmodel.js';
import { saveBundle } from '../../src/ui/save-bundle.js';
import { instrumentFor } from '../registry.js';

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
  h('a', { href: '../', 'aria-label': 'Thermodrift Lab home' }, h('img', { class: 'td-logo', src: '../../brand/thermodrift-logo.png', width: 1172, height: 227, alt: 'Thermodrift' })),
  h('div', { class: 'td-app-name' }, h('strong', { text: 'Session report' }), h('span', { class: 'td-caption', text: 'Review only · no hardware' })),
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
  const eyeProtocols = [...new Set(view.blocks.filter((b) => b.label.startsWith('eyes_')).map((b) => b.protocol_id))];
  const results = eyeProtocols.map((id) => ({ id, protocol: view.protocols.find((p) => p.id === id), res: pairedResults({ blocks: view.blocks, windows: view.windows, protocolId: id, adherenceOf }) }));
  main.replaceChildren(
    summarySection(results),
    ...results.map((r) => resultsSection(r)),
    blocksSection(),
    h('div', { class: 'rp-columns' }, setupSection(), processingSection()),
    h('div', { class: 'rp-columns' }, integritySection(), eventsSection()),
    limitationsSection(),
  );
}

function panel(index, title, kicker, ...body) {
  return h('section', { class: 'td-panel', 'aria-label': title },
    h('header', {}, h('h2', {}, h('span', { class: 'td-index', text: index }), title), kicker ? h('span', { class: 'td-kicker', text: kicker }) : null),
    h('div', { class: 'td-body' }, ...body));
}

function summarySection(results) {
  const montage = app.montages[view.montage];
  const duration = (view.segments ?? []).reduce((s, g) => s + Math.max(0, (g.end_arrival_ms ?? g.start_arrival_ms) - g.start_arrival_ms), 0);
  const metric = (label, value, small = false) => h('div', { class: `td-metric${small ? ' rp-metric-small' : ''}` }, h('span', { text: label }), h('strong', { text: String(value) }));
  const latest = results.at(-1)?.res;
  const lead = latest?.eligible_count
    ? [h('strong', { text: `${latest.higher_closed_count} of ${latest.eligible_count}` }), ' eligible pairs have higher alpha with eyes closed; median closed / open ', h('strong', { text: `${fmt(latest.median_ratio)}×` }), '.']
    : results.length ? 'No eligible pair yet: review adherence below.' : 'No eyes-open / eyes-closed protocol in this session.';
  const origin = { browser: 'Saved in this browser', bundle: 'Exported bundle', 'legacy-v3': 'Berger Lab v3 files' }[view.origin];
  return panel('01', 'Summary', origin,
    h('p', { class: 'rp-lead' }, lead),
    h('div', { class: 'td-metrics' },
      metric('Source', view.simulated ? 'Simulated pattern' : view.source?.device_name ?? 'unknown', true),
      metric('Started', localTime(view.created_utc), true),
      metric('Recorded', duration ? `${Math.round(duration / 1000)} s` : '—'),
      metric('Samples', view.sample_count != null ? view.sample_count.toLocaleString('en-GB') : '—'),
      metric('Missing', view.health?.gaps ?? '—'),
      metric('Montage', montage?.channelNames?.[0] ?? view.montage, true),
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
  const pairHost = h('div'), timelineHost = h('div');
  const recorded = view.recorded_results?.find((r) => r.protocol_id === id);
  const confirm = h('button', { class: 'td-btn', type: 'button', disabled: !canEdit }, 'I followed every eye-state instruction not excluded');
  confirm.onclick = () => annotate(confirmableEyeBlocks(blocks, annotations()), 'as_instructed');
  const section = panel('02', title, protocol?.end_reason ? `${protocol.end_reason}` : null,
    h('div', { class: 'td-scroll-x' }, h('table', { class: 'td-table' },
      h('caption', { class: 'td-visually-hidden', text: `${title}: alpha per prompted pair` }),
      h('thead', {}, h('tr', {}, ...['Pair', 'Open α', 'Closed α', 'Closed / open', 'Raw ratio (secondary)', 'Clean windows O / C', 'Open block', 'Closed block'].map((t) => h('th', { scope: 'col', text: t })))),
      h('tbody', {}, ...rows))),
    h('div', { class: 'rp-export' }, confirm,
      !view.editable && view.origin === 'browser' ? h('p', { text: 'Still recording in another tab: review it there.' }) : null,
      view.origin !== 'browser' ? h('p', { text: 'File view: adherence changes stay on this page.' }) : null),
    h('p', { class: 'rp-note' }, 'α = median absolute 8–13 Hz power of clean windows after the fixed 0.5–45 Hz filter and notches (count-equivalent², not µV). A pair counts when both blocks are marked followed and each has ≥2 clean windows. Eye states are prompted, not measured.'),
    recorded ? h('p', { class: 'rp-note', text: `At export: ${recorded.eligible_count} eligible pair(s)${recorded.eligible_count ? `, median ${fmt(recorded.median_ratio)}×` : ''}, with the adherence recorded then.` }) : null,
    pairHost,
    h('div', { class: 'td-chart-head' }, h('strong', { text: 'Timeline' }), h('span', { text: 'one dot per 4.1 s analysis window' })),
    timelineHost);
  queueMicrotask(() => {
    drawPairs(createCanvas(pairHost, { height: 240, label: `${title}: alpha per pair, eyes open versus closed` }), {
      pairs: res.pairs.map((p) => ({ pair: p.pair, open: p.open?.alpha ?? null, closed: p.closed?.alpha ?? null, status: p.status, ratio: p.ratio })), simulated: view.simulated,
    });
    const origin = Math.min(...blocks.map((b) => b.start_arrival_ms));
    const windows = view.windows.filter((w) => w.protocol_id === id && w.channel === 0).map((w) => ({
      mid_ms: w.arrival_ms - (BERGER_V3.window_samples / BERGER_V3.fs_nominal) * 500,
      value: w.filtered_alpha,
      state: w.phase?.startsWith('eyes_closed') ? 'closed' : w.phase?.startsWith('eyes_open') ? 'open' : 'other',
      good: w.accepted_for_block && !w.reasons.length,
    }));
    const markers = view.events.filter((e) => (e.label === 'operator_marker' || e.label === 'marker') && e.arrival_ms >= origin && e.arrival_ms <= Math.max(...blocks.map((b) => b.end_arrival_ms ?? 0)));
    drawTimeline(createCanvas(timelineHost, { height: 220, label: `${title}: alpha per analysis window over time` }), { windows, blocks, markers, origin, simulated: view.simulated });
  });
  return section;
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

function blocksSection() {
  const rows = view.blocks.map((b) => {
    const s = blockSummary(b, view.windows, 0, adherenceOf(b));
    const cue = Number.isFinite(b.speech_end_arrival_ms) ? seconds(b.speech_end_arrival_ms - b.start_arrival_ms) : b.speech_requested === false ? 'not spoken' : '—';
    return h('tr', {},
      h('td', { class: 'td-num', text: `${b.protocol_id}.${b.id}` }),
      h('th', { scope: 'row', text: humanLabel(b.label) }),
      h('td', { class: 'td-num', text: seconds((b.end_arrival_ms ?? b.start_arrival_ms) - b.start_arrival_ms) }),
      h('td', { class: 'td-num', text: cue }),
      h('td', { class: 'td-num', text: `${s.valid} / ${s.valid + s.rejected}` }),
      h('td', { text: { as_instructed: 'followed', exclude: 'excluded', unconfirmed: 'not confirmed' }[s.adherence] ?? s.adherence }),
      h('td', { text: [b.complete ? null : 'incomplete', ...(b.deviations ?? [])].filter(Boolean).join(' · ') || '—' }));
  });
  return panel('03', 'Blocks', 'as prompted',
    rows.length ? h('div', { class: 'td-scroll-x' }, h('table', { class: 'td-table' },
      h('thead', {}, h('tr', {}, ...['#', 'Block', 'Length', 'Cue ended after', 'Clean / counted windows', 'Adherence', 'Notes'].map((t) => h('th', { scope: 'col', text: t })))),
      h('tbody', {}, ...rows))) : h('p', { class: 'td-muted', text: 'No protocol blocks in this session.' }));
}

function setupSection() {
  const montage = app.montages[view.montage];
  const s = view.setup ?? {};
  const confirmations = s.operator_confirmations ? Object.entries(s.operator_confirmations).map(([k, v]) => `${k.replaceAll('_', ' ')}: ${v ? 'yes' : 'no'}`).join(' · ') : '—';
  return panel('04', 'Setup', 'as entered before acquisition',
    montage ? h('div', { class: 'td-montage' }, montageSvg({ leads: montage.leads, compact: false })) : null,
    h('dl', { class: 'rp-dl' },
      h('dt', { text: 'Montage' }), h('dd', { text: montage?.label ?? view.montage }),
      h('dt', { text: 'Leads' }), h('dd', { text: montage ? montage.leads.map((l) => `${l.pin} → ${l.siteLabel}`).join(' · ') : '—' }),
      h('dt', { text: 'Pads' }), h('dd', { text: s.pad_condition ?? '—' }),
      h('dt', { text: 'Checks' }), h('dd', { text: confirmations }),
      h('dt', { text: 'Placement notes' }), h('dd', { text: view.placement_notes || '—' }),
      h('dt', { text: 'Prediction' }), h('dd', { text: view.hypothesis || '—' }),
      h('dt', { text: 'Audio' }), h('dd', { text: [{ cues_only: 'spoken cues only', external_audio: 'external audio (exploratory)' }[s.audio_condition] ?? s.audio_condition, s.audio_notes].filter(Boolean).join(' · ') || '—' }),
      h('dt', { text: 'Cues' }), h('dd', { text: s.cue_mode ?? '—' })));
}

function processingSection() {
  const filter = view.processing?.analysis?.filter ?? analysisFilterDescription();
  const notches = [filter.notch_sos?.length ? 50 : null, ...(filter.harmonic_notches_hz ?? [])].filter(Boolean);
  return panel('05', 'Processing', BERGER_V3.plan_id,
    h('dl', { class: 'rp-dl' },
      h('dt', { text: 'Primary metric' }), h('dd', { text: BERGER_V3.primary_metric }),
      h('dt', { text: 'Filter' }), h('dd', { text: `${filter.note ?? 'Causal 0.5–45 Hz Butterworth.'}${notches.length ? ` Notches at ${notches.join(', ')} Hz.` : ''}` }),
      h('dt', { text: 'Spectrum' }), h('dd', { text: BERGER_V3.welch }),
      h('dt', { text: 'Window rules' }), h('dd', { text: `${BERGER_V3.window_samples} samples; inside the block; ≥${BERGER_V3.transition_exclusion_s} s after the cue ended; ${BERGER_V3.filter_warmup_and_rail_guard_s} s guard after filter start or a raw rail.` }),
      h('dt', { text: 'Units' }), h('dd', { text: BERGER_V3.units }),
      h('dt', { text: 'Eligibility' }), h('dd', { text: BERGER_V3.eligibility })));
}

function integritySection() {
  const tone = (ok) => (ok === true ? 'ready' : ok === false ? 'error' : 'idle');
  const items = view.integrity.checks.map((c) => h('li', { dataset: { tone: tone(c.ok) } }, statusIcon(tone(c.ok)), h('span', { text: c.label }), h('small', { text: c.detail ?? '' })));
  const files = view.files?.length ? h('details', {}, h('summary', { text: 'File hashes (SHA-256)' }),
    h('ul', { class: 'rp-checks' }, ...view.files.map((f) => h('li', {}, h('span'), h('span', { class: 'td-mono', text: `${f.name} · ${f.sha256}` }), h('small', { text: `${(f.bytes / 1e6).toFixed(2)} MB` }))))) : null;
  const exportStatus = h('p', { role: 'status' });
  const exportButton = view.origin === 'browser' ? h('button', { class: 'td-btn', type: 'button' }, 'Export bundle (.zip)') : null;
  if (exportButton) exportButton.onclick = () => saveBundle({
    suggestedName: `${view.simulated ? 'SIMULATED-' : ''}${view.app}-${view.id}.zip`,
    assemble: (sink, method) => exportSessionBundle({ store, sessionId: view.id, describe: (ctx) => app.describe(ctx), windowChannelLabel: (ch) => app.channelLabel(app.montages[view.montage], ch), sink, exportInfo: { method, from: 'report' } }),
    onStatus: (text, t = 'idle') => { exportStatus.dataset.tone = t; setText(exportStatus, text); },
  });
  return panel('06', 'Integrity', view.integrity.ok ? 'checks pass' : 'see below',
    h('ul', { class: 'rp-checks' }, ...items), files,
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
else message('Choose a session saved in this browser, or open an exported bundle (.zip) or a Berger Lab v3 file set (metadata.json + windows.csv).');
