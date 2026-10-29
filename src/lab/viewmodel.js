/**
 * Pure view-model: controller state → what each control shows, whether it is enabled and, when
 * blocked, one short line saying why and what to do. Rendered beside the control itself.
 * No DOM here, so every blocker is unit-tested.
 */
import { PROTOCOL } from '../protocol/engine.js';

const ok = (label, extra = {}) => ({ enabled: true, label, why: null, ...extra });
const no = (label, why, extra = {}) => ({ enabled: false, label, why, ...extra });

/**
 * @param {object} c controller (or a plain object with the same fields)
 * @param {{missingSetup:string[], protocols?:object[], deviceLabel?:string}} ui
 */
export function controlStates(c, ui) {
  const device = ui.deviceLabel ?? 'NPG';
  const connected = c.connection === 'connected';
  const acquiring = c.acquisition === 'acquiring';
  const busy = c.connection === 'connecting' || c.acquisition === 'starting' || c.acquisition === 'stopping';
  const running = c.protocol.state === PROTOCOL.RUNNING;
  const finished = !!c.session && c.session.status !== 'recording';
  const storageFull = !!c.recorder?.error?.fatal;
  const latest = c.engine?.latest?.[0] ?? null;

  const states = {};
  states.connect =
    c.connection === 'unsupported' ? no(`Connect ${device}`, 'Web Bluetooth unavailable: open in desktop Chrome.')
    : c.connection === 'connecting' ? no('Connecting…', `Choose the ${device} in the browser dialog.`)
    : connected ? no('Connected', null)
    : ok(c.connection === 'permission_denied' ? 'Retry connection' : `Connect ${device}`);

  states.start =
    finished ? no('Start acquisition', 'Session finished. Start a new session.')
    : !connected ? no('Start acquisition', 'Connect the device first.')
    : acquiring ? no('Acquiring', null)
    : busy ? no('Start acquisition', 'Wait for the current operation.')
    : ui.missingSetup.length ? no('Start acquisition', `Complete setup: ${ui.missingSetup.join(', ')}.`)
    : storageFull ? no('Start acquisition', 'Storage full. Export, then start a new session.')
    : ok(c.segments?.length ? 'Restart acquisition' : 'Start acquisition', { note: c.segments?.length ? 'Opens a new segment in this session. Filters restart.' : null });

  states.stop = acquiring ? ok(running ? 'Stop (ends protocol)' : 'Stop') : no('Stop', null);
  states.disconnect = connected && !busy ? ok('Disconnect') : no('Disconnect', null);

  const protocolWhy = (requireCue, requireSignal, requireSpeech) => {
    if (!connected) return 'Connect the device first.';
    if (!acquiring) return 'Start acquisition first.';
    if (running) return 'A protocol is running.';
    if (storageFull) return 'Storage full. Export first.';
    if (requireSpeech && c.cues.kind !== 'speech') return 'Spoken cues unavailable in this browser.';
    if (requireCue && c.cues.kind === 'speech' && !(c.cueTest.state === 'spoken' && c.cueTest.heard)) return 'Test the spoken cue and confirm you heard it.';
    if (requireSignal) {
      if (!c.fresh || !latest) return 'Wait for 4 s of continuous signal.';
      if (latest.reasons.length) return `Raw signal flagged (${latest.reasons.join(', ')}). Check contacts.`;
    }
    return null;
  };
  states.protocols = {};
  for (const p of ui.protocols ?? []) {
    const why = protocolWhy(p.requireCueCheck, p.requireCleanSignal, p.requireSpeech);
    states.protocols[p.name] = why ? no(p.label, why) : ok(p.label);
  }

  states.abort = running ? ok('End protocol') : no('End protocol', null, { hidden: true });
  states.marker = acquiring ? ok('Mark event') : no('Mark event', 'Markers need running acquisition.');
  states.testCue =
    c.cues.kind !== 'speech' ? no('Test spoken cue', c.cues.kind === 'silent' ? 'Silent cue mode: nothing is spoken.' : 'Speech unavailable in this browser.')
    : running ? no('Test spoken cue', 'Not during a protocol.')
    : c.cueTest.state === 'speaking' ? no('Speaking…', null)
    : ok(c.cueTest.state === 'spoken' ? 'Test again' : 'Test spoken cue');
  states.heard = c.cueTest.state === 'spoken' && !running ? ok('I heard it clearly') : no('I heard it clearly', c.cueTest.state === 'failed' ? `Cue failed (${c.cueTest.error}). Check audio output.` : null);
  states.finish = c.session && !finished && !running ? ok('Finish session') : no('Finish session', running ? 'End or complete the protocol first.' : null, { hidden: !c.session || finished });
  states.newSession = finished && c.acquisition === 'idle' ? ok('New session') : no('New session', null, { hidden: true });
  states.export = c.session ? ok('Export bundle (.zip)') : no('Export bundle (.zip)', 'Nothing recorded yet.');
  return states;
}

/** The single protocol status line shown in the current-block card. */
export function protocolCard(c) {
  const p = c.protocol;
  if (p.state === PROTOCOL.RUNNING) {
    const block = p.currentBlock();
    const step = p.sequence.findIndex((b) => b.label === block.label) + 1;
    return { state: 'running', title: humanLabel(block.label), instruction: p.sequence[p.phase]?.instruction ?? '', remaining: Math.ceil(p.remainingSeconds() ?? 0), step, steps: p.sequence.length, progress: 1 - (p.remainingSeconds() ?? 0) / p.sequence[p.phase].seconds };
  }
  const last = p.lastProtocol();
  if (!last) return { state: 'idle', title: 'No protocol yet', instruction: 'Acquire, inspect the signal, then start a protocol.' };
  if (p.state === PROTOCOL.COMPLETED) return { state: 'completed', title: 'Completed — review & save', instruction: 'Review adherence below, then finish the session and open the report.' };
  if (p.state === PROTOCOL.INTERRUPTED) return { state: 'interrupted', title: `Interrupted — ${last.end_reason}`, instruction: 'Data up to the interruption are saved. Start a new protocol when ready.' };
  if (p.state === PROTOCOL.ABORTED) return { state: 'aborted', title: 'Ended by operator', instruction: 'Data are saved. Start a new protocol when ready.' };
  return { state: 'idle', title: `Last: ${last.name} · ${last.end_reason}`, instruction: 'Ready for another protocol.' };
}

/** Status strip items: label, value, tone (ready | live | warning | error | stale | idle | simulated). */
export function statusItems(c) {
  const items = [];
  const conn = { connected: ['Connected', 'ready'], connecting: ['Connecting', 'warning'], disconnected: ['Not connected', 'idle'], permission_denied: ['Permission denied', 'error'], unsupported: ['Unsupported browser', 'error'], error: ['Connection failed', 'error'] }[c.connection] ?? [c.connection, 'idle'];
  items.push({ key: 'device', label: c.deviceName ?? 'Device', value: conn[0], tone: conn[1], detail: c.connectionError });
  const acq = c.acquisition === 'acquiring' ? (c.fresh ? ['Acquiring', 'live'] : ['Stale — no data', 'stale']) : c.acquisition === 'idle' ? ['Stopped', 'idle'] : [c.acquisition === 'starting' ? 'Starting' : 'Stopping', 'warning'];
  items.push({ key: 'acquisition', label: 'Acquisition', value: acq[0], tone: c.acquisitionError ? 'error' : acq[1], detail: c.acquisitionError });
  if (c.acquisition === 'acquiring') items.push({ key: 'rate', label: 'Rate', value: `${c.sampleRate.toFixed(0)} /s`, tone: Math.abs(c.sampleRate - 500) > 25 && c.receipt.length > 1000 ? 'warning' : 'idle' });
  const h = c.health;
  items.push({ key: 'missing', label: 'Missing', value: String(h.gaps), tone: h.gaps ? 'warning' : 'idle', detail: `${h.duplicates} duplicates · ${h.badPackets} unsupported packets · ${h.invalid} invalid samples` });
  const latest = c.engine?.latest?.[0];
  if (c.acquisition === 'acquiring' && latest) {
    const clip = latest.reasons.length;
    items.push({ key: 'raw', label: 'Raw', value: clip ? latest.reasons.join(', ') : 'No clipping', tone: clip ? 'error' : 'ready' });
  }
  const s = c.storageStatus;
  if (c.session) {
    const value = s?.error ? (s.error.quota ? 'Storage full' : 'Save failed') : s?.pendingRows > 1500 ? `${s.pendingRows} unsaved` : s?.durable ? 'Saved locally' : 'In tab memory only';
    const tone = s?.error ? 'error' : s?.durable ? 'ready' : 'warning';
    items.push({ key: 'saved', label: 'Session', value, tone, detail: s ? `${s.savedSamples.toLocaleString('en-GB')} samples stored${s.lastFlushUtc ? ' · last save ' + s.lastFlushUtc.slice(11, 19) + ' UTC' : ''}` : null });
  }
  return items;
}

export function humanLabel(label) {
  return label
    .replace(/^eyes_(open|closed)_pair(\d)$/, (_, s, n) => `Pair ${n} · eyes ${s}`)
    .replace('settling_eyes_open', 'Settling · eyes open')
    .replace('recovery_eyes_open', 'Recovery · eyes open')
    .replace('baseline_eyes_open', 'Baseline · eyes open')
    .replaceAll('_', ' ');
}
