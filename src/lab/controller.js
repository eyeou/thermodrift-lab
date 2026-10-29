/**
 * Lab session controller — the reusable core of every acquisition app.
 *
 * Wires: transport → packet decoder → counter continuity → recorder (durable raw store)
 *        → analysis plugin (windows) → display processor, with a protocol engine alongside.
 * An app supplies: transport, montage, analysis plugin, protocol definitions, metadata `describe`.
 *
 * Lifecycles are separate and explicit:
 *   connection   unsupported | disconnected | connecting | connected | permission_denied | error
 *   acquisition  idle | starting | acquiring | stopping            (+ acquisitionError)
 *   protocol     idle | running | completed | interrupted | aborted (ProtocolEngine)
 *   session      none | recording | closed | interrupted           (+ recorder status)
 * Stopping acquisition never deletes a session: a restart opens a new segment in the same
 * session, with all filter state discarded. A protocol is interrupted, never paused, when
 * acquisition stops, the device disconnects, the stream stalls or a cue fails.
 */
import { decodePacket, channelsValid } from '../core/packets.js';
import { CounterTracker } from '../core/continuity.js';
import { ProtocolEngine, PROTOCOL } from '../protocol/engine.js';
import { SessionRecorder, SESSION_SCHEMA } from '../session/recorder.js';
import { exportSessionBundle } from '../session/bundle.js';
import { effectiveAdherence, confirmableEyeBlocks } from '../analysis/adherence.js';

export { effectiveAdherence };

export const STALE_AFTER_MS = 2000;
export const BYTES_PER_SAMPLE_ESTIMATE = 64; // generous: columns + IndexedDB overhead + windows/events

export function newSessionId(date = new Date()) {
  const stamp = date.toISOString().replace(/[:.]/g, '-').replace('Z', 'Z');
  const suffix = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(3)), (b) => b.toString(16).padStart(2, '0')).join('');
  return `${stamp}-${suffix}`;
}

export class LabController {
  /**
   * @param {{
   *   app: {id:string, version:string, analysisPlan:string},
   *   transport: object, store: object, analysis: {createEngine:(montage)=>object},
   *   cues: () => object, describe: (ctx)=>object, channelLabel: (montage, ch:number)=>string,
   *   clock?: { now: () => number, epochOf?: (t:number) => number },
   *   createDisplay?: (montage)=>object, locks?: object,
   * }} deps
   */
  constructor(deps) {
    this.deps = deps;
    this.clock = deps.clock ?? { now: () => performance.now(), epochOf: (t) => performance.timeOrigin + t };
    this.listeners = new Set();
    this.connection = deps.transport.supported === false ? 'unsupported' : 'disconnected';
    this.connectionError = null;
    this.deviceName = null;
    this.acquisition = 'idle';
    this.acquisitionError = null;
    this.session = null;
    this.recorder = null;
    this.storageStatus = null;
    this.setup = null;
    this.locked = false;
    this.montage = null;
    this.counters = new CounterTracker();
    this.engine = null;
    this.display = null;
    this.sessionStart = null;
    this.lastReceipt = null;
    this.receipt = [];
    this.health = { samples: 0, gaps: 0, duplicates: 0, badPackets: 0, invalid: 0, layoutErrors: 0 };
    this.segments = [];
    this.cueTest = { state: 'untested', heard: false, error: null };
    this.annotations = [];
    this.windows = []; // in-memory copy for live results; the store holds the durable one
    this.cues = deps.cues();
    this.protocol = this.#createProtocolEngine();
    this.lastProtocolState = PROTOCOL.IDLE;
    deps.transport.on?.('packet', (view, arrival) => this.onPacket(view, arrival));
    deps.transport.on?.('disconnected', (info) => this.#onDisconnected(info));
  }

  #createProtocolEngine() {
    return new ProtocolEngine({
      now: () => this.#t(),
      sampleIndex: () => this.counters.index,
      cues: this.cues,
      log: (label, payload) => this.log(label, payload),
      onChange: () => this.#protocolChanged(),
    });
  }

  // ---------- observation ----------
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit() {
    for (const listener of this.listeners) listener(this);
  }

  #t() {
    return this.sessionStart === null ? 0 : this.clock.now() - this.sessionStart;
  }

  get msSinceLastPacket() {
    return this.lastReceipt === null ? Infinity : this.#t() - this.lastReceipt;
  }

  get fresh() {
    return this.acquisition === 'acquiring' && this.msSinceLastPacket <= STALE_AFTER_MS;
  }

  /** Samples received over the last 5 s of arrival time (bursty BLE delivery does not inflate it). */
  get sampleRate() {
    const now = this.#t();
    const span = Math.min(5000, now - (this.receiptSince ?? now));
    if (span < 500) return 0;
    let n = 0;
    for (const t of this.receipt) if (now - t < 5000) n++;
    return n / (span / 1000);
  }

  log(label, payload = {}) {
    const event = { label, index: this.counters.index, arrival_ms: this.#t(), utc: new Date().toISOString(), ...payload };
    if (this.recorder) this.recorder.logEvent(event);
    else (this.preSessionEvents ??= []).push(event);
    return event;
  }

  // ---------- setup ----------
  /** Setup is editable until the first acquisition of a session, then locked. */
  setSetup(setup, montage) {
    if (this.locked) return false;
    this.setup = structuredClone(setup);
    this.montage = montage;
    this.emit();
    return true;
  }

  // ---------- connection ----------
  async connect() {
    if (this.connection === 'connecting' || this.connection === 'connected') return;
    this.connection = 'connecting';
    this.connectionError = null;
    this.emit();
    try {
      const info = await this.deps.transport.connect();
      this.deviceName = info.deviceName;
      this.connection = 'connected';
      this.log('device_connected', { device: info.deviceName, transport: this.deps.transport.kind });
    } catch (error) {
      this.connection = error.code === 'permission_denied' ? 'permission_denied' : error.code === 'unsupported' ? 'unsupported' : 'error';
      this.connectionError = error.message;
    } finally {
      this.emit();
    }
  }

  async disconnect() {
    if (this.acquisition === 'acquiring') await this.stopAcquisition('Disconnected by operator');
    await this.deps.transport.disconnect();
    this.connection = 'disconnected';
    this.log('device_disconnected', { reason: 'operator' });
    this.emit();
  }

  #onDisconnected(info = {}) {
    const wasAcquiring = this.acquisition === 'acquiring' || this.acquisition === 'starting';
    this.connection = 'disconnected';
    this.connectionError = info.reason ?? 'Device disconnected';
    if (this.protocol.running) this.protocol.interrupt('device_disconnected');
    if (wasAcquiring) {
      this.acquisition = 'idle';
      this.#closeSegment('device_disconnected');
      this.log('acquisition_stop', { reason: 'Device disconnected' });
      this.#flushSoon();
    }
    this.log('device_disconnected', { reason: info.reason ?? 'gattserverdisconnected' });
    this.emit();
  }

  // ---------- session ----------
  async #ensureSession() {
    if (this.session) return;
    const id = newSessionId();
    this.sessionStart = this.clock.now();
    const source = { kind: this.deps.transport.kind, transport: this.deps.transport.transportName, device_name: this.deviceName ?? 'unknown', firmware: 'unknown (not queried)', label: this.deps.transport.label };
    const record = {
      schema: SESSION_SCHEMA,
      id,
      app: this.deps.app.id,
      app_version: this.deps.app.version,
      analysis_plan: this.deps.app.analysisPlan,
      created_utc: new Date().toISOString(),
      session_start_epoch_ms: this.clock.epochOf ? this.clock.epochOf(this.sessionStart) : Date.now(),
      status: 'recording',
      source,
      montage: this.montage?.id ?? 'unknown',
      derived_enabled: !!this.montage?.derived,
      channel_names: this.montage ? this.montage.channelNames : [],
      setup: this.setup,
      segments: [],
    };
    this.recorder = new SessionRecorder({ store: this.deps.store, session: record, clock: () => this.clock.now(), onStatus: (s) => { this.storageStatus = s; this.emit(); } });
    await this.recorder.open();
    this.session = record;
    for (const e of this.preSessionEvents ?? []) this.recorder.logEvent({ ...e, before_session: true });
    this.preSessionEvents = [];
    this.locked = true;
    this.log('session_created', { session_id: id, source, montage: record.montage });
    await this.deps.locks?.hold(id);
  }

  async finishSession(status = 'closed', reason = 'operator') {
    if (!this.session) return;
    if (this.acquisition === 'acquiring') await this.stopAcquisition('Session finished');
    this.protocol.running && this.protocol.interrupt('acquisition_stopped');
    this.log('session_finished', { status, reason });
    this.recorder.setProtocolSnapshot(this.protocol.protocols, this.protocol.blocks);
    await this.recorder.close(status, reason);
    this.session.status = status;
    await this.deps.locks?.release(this.session.id);
    this.emit();
  }

  /**
   * After a finished session: fresh session state, same device connection. The previous
   * session stays in the store untouched. Setup unlocks and the cue check must be redone.
   */
  newSession() {
    if (this.acquisition !== 'idle' || this.protocol.running || this.session?.status === 'recording') return false;
    this.session = null;
    this.recorder = null;
    this.storageStatus = null;
    this.locked = false;
    this.counters = new CounterTracker();
    this.engine = null;
    this.display = null;
    this.sessionStart = null;
    this.lastReceipt = null;
    this.receipt = [];
    this.health = { samples: 0, gaps: 0, duplicates: 0, badPackets: 0, invalid: 0, layoutErrors: 0 };
    this.segments = [];
    this.annotations = [];
    this.windows = [];
    this.lastCompute = null;
    this.acquisitionError = null;
    this.cueTest = { state: 'untested', heard: false, error: null };
    this.preSessionEvents = [];
    this.protocol = this.#createProtocolEngine();
    this.lastProtocolState = PROTOCOL.IDLE;
    this.emit();
    return true;
  }

  // ---------- acquisition ----------
  async startAcquisition() {
    if (this.connection !== 'connected' || this.acquisition !== 'idle') return { ok: false, reason: 'Not ready' };
    if (this.session?.status && this.session.status !== 'recording') return { ok: false, reason: 'This session is finished. Start a new session.' };
    this.acquisition = 'starting';
    this.acquisitionError = null;
    this.emit();
    try {
      await this.#ensureSession();
      this.counters.restartSegment();
      this.#resetAnalysis();
      this.lastReceipt = null;
      const segment = { id: this.segments.length + 1, start_index: this.counters.index + 1, start_arrival_ms: this.#t(), start_utc: new Date().toISOString() };
      this.segments.push(segment);
      this.acquisition = 'acquiring';
      await this.deps.transport.start();
      this.recorder.patchSession({ segments: this.segments });
      this.log('acquisition_start', { segment_id: segment.id, settings: { montage: this.montage?.id, setup: this.setup } });
      this.#flushSoon();
      return { ok: true };
    } catch (error) {
      this.acquisition = 'idle';
      this.acquisitionError = error.message;
      const segment = this.segments.at(-1);
      if (segment && segment.end_arrival_ms === undefined) { segment.end_arrival_ms = this.#t(); segment.end_reason = 'start_failed'; }
      this.log('acquisition_start_failed', { error: error.message });
      return { ok: false, reason: error.message };
    } finally {
      this.emit();
    }
  }

  async stopAcquisition(reason = 'Operator stop') {
    if (this.acquisition !== 'acquiring') return;
    this.acquisition = 'stopping';
    if (this.protocol.running) this.protocol.interrupt('acquisition_stopped');
    this.emit();
    try {
      await this.deps.transport.stop();
    } catch (error) {
      this.acquisitionError = `Stopped locally; device command failed: ${error.message}`;
    } finally {
      this.acquisition = 'idle';
      this.#closeSegment(reason);
      this.log('acquisition_stop', { reason });
      this.#flushSoon();
      this.emit();
    }
  }

  #closeSegment(reason) {
    const segment = this.segments.at(-1);
    if (segment && segment.end_arrival_ms === undefined) {
      segment.end_index = this.counters.index;
      segment.end_arrival_ms = this.#t();
      segment.end_reason = reason;
      this.recorder?.patchSession({ segments: this.segments });
    }
  }

  #resetAnalysis() {
    this.engine = this.deps.analysis.createEngine(this.montage);
    this.display = this.deps.createDisplay?.(this.montage) ?? null;
    this.receipt = [];
    this.receiptSince = this.#t();
  }

  /** v3 clearRings(): analysis state is discarded, never bridged across a discontinuity. */
  #discontinuity() {
    this.engine?.reset();
    this.display?.reset?.();
    this.receipt = [];
    this.receiptSince = this.#t();
  }

  /** One BLE notification. `arrival` is the transport's clock reading (same clock as `clock.now`). */
  onPacket(view, arrival = this.clock.now()) {
    if (this.acquisition !== 'acquiring') return;
    const now = arrival - this.sessionStart;
    let decoded;
    try {
      decoded = decodePacket(view);
    } catch (error) {
      this.health.badPackets++;
      this.#discontinuity();
      this.lastPacketError = error.message;
      return;
    }
    this.lastReceipt = now;
    const required = this.montage?.requiredChannels ?? 1;
    for (const r of decoded) {
      const result = this.counters.accept(r.counter);
      if (result.kind === 'duplicate') { this.health.duplicates++; this.#discontinuity(); continue; }
      if (result.kind === 'gap') { this.health.gaps += result.missing; this.#discontinuity(); this.log('counter_gap', { inferred_missing: result.missing }); }
      const row = { index: result.index, arrival_ms: now, counter: r.counter, channels: r.channels, phase: this.protocol.currentLabel(), ...this.protocol.currentIds() };
      try {
        this.recorder.appendRow(row);
      } catch (error) {
        this.health.layoutErrors++;
        this.#discontinuity();
        this.lastPacketError = error.message;
        continue;
      }
      this.health.samples++;
      if (!channelsValid(r.channels, required)) {
        this.health.invalid++;
        this.#discontinuity();
      } else {
        this.engine.pushRow(row);
        this.display?.push(row);
      }
      this.receipt.push(now);
    }
    this.receipt = this.receipt.filter((t) => now - t < 5000);
    const out = this.engine.compute(now, this.protocol.currentBlock());
    if (out) {
      for (const w of out.windows) this.windows.push(this.recorder.addWindow(w));
      this.lastCompute = out;
    }
    this.#flushSoon();
    this.dirty = true;
  }

  #flushSoon() {
    if (!this.recorder) return;
    this.recorder.setProtocolSnapshot(this.protocol.protocols, this.protocol.blocks);
    this.recorder.patchSession({ health: this.health, segments: this.segments });
    const p = this.recorder.maybeFlush();
    p?.catch((error) => this.#storageFailure(error));
  }

  #storageFailure(error) {
    const quota = error?.name === 'QuotaExceededError';
    if (this.protocol.running) this.protocol.interrupt(quota ? 'capacity' : 'storage_error');
    this.log('storage_error', { name: error?.name, message: error?.message });
    if (quota && this.acquisition === 'acquiring') void this.stopAcquisition('Storage capacity reached');
    this.emit();
  }

  /** Call every ~250 ms: protocol timers, stale detection, UI refresh. */
  tick() {
    if (this.protocol.running) {
      this.protocol.noteStream({ msSinceLastPacket: this.msSinceLastPacket });
      this.protocol.tick();
    }
    if (this.recorder && this.session?.status === 'recording') this.#flushSoon();
    this.emit();
  }

  // ---------- protocols ----------
  /**
   * Check whether a protocol may start, with the reason and the way forward.
   * @returns {{ok:boolean, reason?:string, howTo?:string}}
   */
  async canStartProtocol(definition, { requireCueCheck = false, requireCleanSignal = false, requireSpeech = false } = {}) {
    if (this.connection !== 'connected') return { ok: false, reason: 'No device connected.', howTo: 'Connect the NPG first.' };
    if (this.acquisition !== 'acquiring') return { ok: false, reason: 'Acquisition is not running.', howTo: 'Click Start acquisition.' };
    if (this.protocol.running) return { ok: false, reason: 'A protocol is already running.', howTo: 'Wait for it to finish or end it.' };
    if (requireSpeech && this.cues.kind !== 'speech') return { ok: false, reason: 'Spoken cues unavailable in this browser.', howTo: 'Use desktop Chrome with audio output.' };
    if (requireCueCheck && this.cues.kind === 'speech' && !(this.cueTest.state === 'spoken' && this.cueTest.heard)) return { ok: false, reason: 'Spoken cues not checked.', howTo: 'Test the cue and tick “I heard it clearly”.' };
    if (requireCleanSignal) {
      const latest = this.engine?.latest?.[0];
      if (!this.fresh || !latest) return { ok: false, reason: 'No fresh 4-second signal window yet.', howTo: 'Wait for continuous data (about 5 s).' };
      if (latest.reasons.length) return { ok: false, reason: `Raw signal flagged: ${latest.reasons.join(', ')}.`, howTo: 'Check contacts until the flag clears.' };
    }
    if (this.recorder?.error?.fatal) return { ok: false, reason: 'Storage is full.', howTo: 'Export this session, then start a new one.' };
    const seconds = definition.blocks.reduce((s, b) => s + b.seconds, 0);
    const estimate = await this.deps.store.estimate?.();
    if (estimate?.quota != null && estimate?.usage != null) {
      const needed = (seconds + 30) * 500 * BYTES_PER_SAMPLE_ESTIMATE;
      if (estimate.quota - estimate.usage < needed) return { ok: false, reason: `Not enough browser storage (${Math.round(needed / 1e6)} MB needed).`, howTo: 'Export and delete old sessions, then retry.' };
    }
    return { ok: true };
  }

  async startProtocol(definition, checks = {}) {
    const verdict = await this.canStartProtocol(definition, checks);
    if (!verdict.ok) {
      this.log('protocol_refused', { protocol: definition.name, reason: verdict.reason });
      return verdict;
    }
    const result = this.protocol.start(definition);
    this.#flushSoon();
    this.emit();
    return result;
  }

  abortProtocol() {
    return this.protocol.abort();
  }

  #protocolChanged() {
    const state = this.protocol.state;
    if (state !== this.lastProtocolState) {
      const ended = this.lastProtocolState === PROTOCOL.RUNNING && state !== PROTOCOL.RUNNING;
      this.lastProtocolState = state;
      if (ended) {
        const last = this.protocol.lastProtocol();
        this.deps.onProtocolEnded?.(last, state);
        if (last?.auto_stop_acquisition && this.acquisition === 'acquiring') void this.stopAcquisition(`${last.name} protocol ${last.end_reason}`);
      }
    }
    this.recorder?.setProtocolSnapshot(this.protocol.protocols, this.protocol.blocks);
    this.emit();
  }

  // ---------- cues ----------
  testCue(text = 'Audio test only. The protocol has not started.') {
    if (this.cues.kind !== 'speech') return;
    this.cueTest = { state: 'speaking', heard: false, error: null };
    this.log('speech_requested', { protocol_id: 0, block_id: 0, text });
    this.cues.speak(text, {
      onStart: () => this.log('speech_started', { protocol_id: 0, block_id: 0, text }),
      onEnd: () => { this.cueTest = { ...this.cueTest, state: 'spoken' }; this.log('speech_ended', { protocol_id: 0, block_id: 0, text }); this.emit(); },
      onError: (error) => { this.cueTest = { state: 'failed', heard: false, error }; this.log('speech_error', { protocol_id: 0, block_id: 0, error }); this.emit(); },
    });
    this.emit();
  }

  confirmCueHeard(heard) {
    if (this.cueTest.state !== 'spoken') return;
    this.cueTest = { ...this.cueTest, heard: !!heard };
    this.log('cue_heard_confirmation', { heard: !!heard });
    this.emit();
  }

  // ---------- operator markers and annotations ----------
  mark(note = '') {
    const block = this.protocol.currentBlock();
    return this.log('operator_marker', { note: String(note).slice(0, 500), protocol_id: block?.protocol_id ?? 0, block_id: block?.id ?? 0 });
  }

  /** Adherence is an annotation; prompted labels in raw rows never change. */
  annotateAdherence(blockId, value, actor = 'operator') {
    if (!['unconfirmed', 'as_instructed', 'exclude'].includes(value) || !this.recorder) return null;
    const block = this.protocol.blocks.find((b) => b.id === blockId);
    if (!block || this.protocol.running) return null;
    const annotation = this.recorder.annotate({ kind: 'adherence', block_id: blockId, protocol_id: block.protocol_id, value, actor });
    this.annotations.push(annotation);
    this.log('adherence_annotation', { protocol_id: block.protocol_id, block_id: blockId, adherence: value });
    this.#flushSoon();
    this.emit();
    return annotation;
  }

  /** Effective adherence = system exclusion, else the latest operator annotation. */
  adherenceOf(block) {
    return effectiveAdherence(block, this.annotations);
  }

  /** v3 “I followed all unexcluded eye-state instructions”: one annotation per eligible block. */
  confirmAllEyeBlocks() {
    if (this.protocol.running) return 0;
    const blocks = confirmableEyeBlocks(this.protocol.blocks, this.annotations);
    for (const b of blocks) this.annotateAdherence(b.id, 'as_instructed');
    return blocks.length;
  }

  // ---------- export ----------
  async exportBundle(sink, exportInfo = {}) {
    if (!this.session) throw new Error('No session to export');
    try { await this.recorder.flush(); } catch { /* pending rows stay in memory and are exported below */ }
    const result = await exportSessionBundle({
      store: this.deps.store,
      sessionId: this.session.id,
      recorder: this.recorder,
      describe: (ctx) => this.deps.describe({ ...ctx, controller: this, acquisitionRunning: this.acquisition === 'acquiring' }),
      windowChannelLabel: (ch) => this.deps.channelLabel(this.montage, ch),
      sink,
      exportInfo,
    });
    this.log('export_assembled', { filename: result.filename, files: result.manifest.files, integrity_ok: result.manifest.integrity.ok });
    this.#flushSoon();
    return result;
  }
}

