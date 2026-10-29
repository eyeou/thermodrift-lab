/**
 * Protocol engine: a deterministic block timer with explicit lifecycle, independent of
 * acquisition, UI and DSP.
 *
 *   idle ──start()──▶ running ──last block ends──▶ completed
 *                        │ interrupt(reason) ─────▶ interrupted   (acquisition stopped, device lost,
 *                        │                                         stream stalled, cue failed)
 *                        └ abort() ──────────────▶ aborted        (operator)
 *
 * Time comes from an injected clock (session-relative ms). The engine never assumes ticks are
 * punctual: a block ends when real elapsed time reaches its duration, and lateness is recorded
 * as a deviation. A protocol is never resumed after an interruption; the operator starts a new
 * one. Prompted labels are recorded as they were prompted; adherence lives in annotations.
 */

export const PROTOCOL = Object.freeze({ IDLE: 'idle', RUNNING: 'running', COMPLETED: 'completed', INTERRUPTED: 'interrupted', ABORTED: 'aborted' });

export const INTERRUPT_REASONS = Object.freeze({
  acquisition_stopped: 'Acquisition stopped',
  device_disconnected: 'Device disconnected',
  stream_stalled: 'Data stream stalled',
  cue_failed: 'Speech cue failed',
  capacity: 'Storage capacity reached',
  storage_error: 'Storage error',
});

export class ProtocolEngine {
  /**
   * @param {{
   *   now: () => number,                 session-relative milliseconds
   *   sampleIndex: () => number,         index of the latest received sample
   *   cues: { kind: string, speak: (text:string, handlers:object) => void, cancel: () => void },
   *   log: (label:string, payload?:object) => void,
   *   onChange?: () => void,
   *   staleDeviationMs?: number, stallInterruptMs?: number, latenessDeviationS?: number,
   * }} deps
   */
  constructor(deps) {
    this.deps = { staleDeviationMs: 2000, stallInterruptMs: 10000, latenessDeviationS: 1, onChange: () => {}, ...deps };
    this.state = PROTOCOL.IDLE;
    this.protocols = [];
    this.blocks = [];
    this.active = null;
    this.sequence = [];
    this.phase = -1;
    this.phaseStart = 0;
    this.blockSerial = 0;
    this.protocolSerial = 0;
    this.endReason = null;
  }

  get running() {
    return this.state === PROTOCOL.RUNNING;
  }

  /** Current block record while running, else null (windows outside protocols are 'idle'). */
  currentBlock() {
    return this.running ? this.blocks.at(-1) ?? null : null;
  }

  /** Prompted label for incoming samples. */
  currentLabel() {
    return this.running ? this.sequence[this.phase]?.label ?? 'idle' : 'idle';
  }

  currentIds() {
    return this.running ? { protocol_id: this.protocolSerial, block_id: this.blockSerial } : { protocol_id: 0, block_id: 0 };
  }

  /** Seconds left in the current block (for the countdown), or null. */
  remainingSeconds() {
    if (!this.running) return null;
    const block = this.sequence[this.phase];
    return Math.max(0, block.seconds - (this.deps.now() - this.phaseStart) / 1000);
  }

  /**
   * Start a protocol. Preconditions (acquisition running, fresh data, capacity, cue check) are
   * checked by the caller; the engine only refuses to overlap protocols.
   * @param {{name:string, version:string, blocks:{label:string, seconds:number, instruction:string, spoken?:string}[], settings?:object, autoStopAcquisition?:boolean}} definition
   */
  start(definition) {
    if (this.running) return { ok: false, reason: 'A protocol is already running.' };
    const seconds = definition.blocks.reduce((s, b) => s + b.seconds, 0);
    this.sequence = definition.blocks;
    this.phase = -1;
    this.protocolSerial++;
    this.endReason = null;
    this.active = {
      id: this.protocolSerial,
      name: definition.name,
      definition_version: definition.version,
      planned_duration_s: seconds,
      order: definition.blocks.map((b) => ({ label: b.label, seconds: b.seconds })),
      cue_mode: this.deps.cues.kind,
      start_index: this.deps.sampleIndex() + 1,
      start_arrival_ms: this.deps.now(),
      auto_stop_acquisition: !!definition.autoStopAcquisition,
      ...(definition.settings ?? {}),
    };
    this.protocols.push(this.active);
    this.state = PROTOCOL.RUNNING;
    this.deps.log('protocol_start', { protocol: definition.name, protocol_id: this.protocolSerial, settings: structuredClone(this.active) });
    this.#nextPhase();
    this.deps.onChange();
    return { ok: true };
  }

  /** Call every ~250 ms. Ends blocks on real elapsed time and records lateness. */
  tick() {
    if (!this.running) return;
    const now = this.deps.now();
    const current = this.sequence[this.phase];
    const elapsed = (now - this.phaseStart) / 1000;
    if (elapsed < current.seconds) return;
    const block = this.blocks.at(-1);
    block.complete = true;
    block.end_index = this.deps.sampleIndex();
    block.end_arrival_ms = now;
    block.timer_lateness_s = Math.max(0, elapsed - current.seconds);
    if (block.speech_requested && !Number.isFinite(block.speech_end_arrival_ms)) block.deviations.push('Browser did not report cue completion; no primary windows accepted.');
    if (block.timer_lateness_s > this.deps.latenessDeviationS) {
      block.deviations.push(`Timer callback more than ${this.deps.latenessDeviationS} s late`);
      this.deps.log('late_phase_timer', { block_id: block.id, seconds: block.timer_lateness_s });
    }
    this.#nextPhase();
    this.deps.onChange();
  }

  /**
   * Stream health while running: a stale stream becomes a block deviation; a stall beyond
   * `stallInterruptMs` interrupts the protocol rather than letting the clock run on.
   */
  noteStream({ msSinceLastPacket }) {
    if (!this.running) return;
    const block = this.blocks.at(-1);
    if (msSinceLastPacket > this.deps.staleDeviationMs && !block.deviations.includes('Data stream stale during this block')) {
      block.deviations.push('Data stream stale during this block');
      this.deps.log('stream_stale', { protocol_id: this.protocolSerial, block_id: block.id, ms_since_last_packet: msSinceLastPacket });
    }
    if (msSinceLastPacket > this.deps.stallInterruptMs) this.interrupt('stream_stalled');
  }

  noteVisibility(state) {
    if (!this.running || state !== 'hidden') return;
    const block = this.blocks.at(-1);
    const note = 'Page hidden during this block; inspect timing.';
    if (!block.deviations.includes(note)) block.deviations.push(note);
  }

  /** System-initiated end. `code` is a key of INTERRUPT_REASONS. */
  interrupt(code, extra = {}) {
    if (!this.running) return false;
    this.#end(PROTOCOL.INTERRUPTED, INTERRUPT_REASONS[code] ?? code, { reason_code: code, ...extra });
    return true;
  }

  /** Operator-initiated end of an active protocol. */
  abort() {
    if (!this.running) return false;
    this.#end(PROTOCOL.ABORTED, 'Aborted', { reason_code: 'operator_abort' });
    return true;
  }

  /** Back to idle after the operator has acknowledged a finished protocol. Data are kept. */
  acknowledge() {
    if (this.running) return;
    this.state = PROTOCOL.IDLE;
    this.deps.onChange();
  }

  /** Last finished protocol (for "Completed — review & save"). */
  lastProtocol() {
    return this.protocols.at(-1) ?? null;
  }

  #nextPhase() {
    this.phase++;
    if (this.phase >= this.sequence.length) {
      this.#end(PROTOCOL.COMPLETED, 'Complete', { reason_code: 'complete' });
      return;
    }
    this.phaseStart = this.deps.now();
    const current = this.sequence[this.phase];
    const block = {
      id: ++this.blockSerial,
      protocol_id: this.protocolSerial,
      label: current.label,
      duration_s: current.seconds,
      start_index: this.deps.sampleIndex() + 1,
      start_arrival_ms: this.phaseStart,
      complete: false,
      adherence: 'unconfirmed',
      deviations: [],
      speech_requested: false,
    };
    this.blocks.push(block);
    this.deps.log('phase_' + current.label, { protocol_id: this.protocolSerial, block_id: block.id });
    this.#cue(current.spoken || current.instruction, block);
  }

  #cue(text, block) {
    const cues = this.deps.cues;
    if (cues.kind === 'none') return;
    const context = { protocol_id: block.protocol_id, block_id: block.id, text };
    block.speech_requested = cues.kind === 'speech';
    this.deps.log(cues.kind === 'speech' ? 'speech_requested' : 'cue_not_spoken', { ...context, cue_mode: cues.kind });
    if (cues.kind !== 'speech') return;
    cues.speak(text, {
      onStart: () => {
        block.speech_start_arrival_ms = this.deps.now();
        this.deps.log('speech_started', context);
        this.deps.onChange();
      },
      onEnd: () => {
        block.speech_end_arrival_ms = this.deps.now();
        this.deps.log('speech_ended', context);
        this.deps.onChange();
      },
      onError: (error) => {
        this.deps.log('speech_error', { ...context, error: error || 'unknown' });
        if (this.running && this.blocks.at(-1)?.id === block.id) {
          block.adherence = 'exclude';
          block.deviations.push('Spoken cue failed; block excluded by the system.');
          this.interrupt('cue_failed');
        }
      },
    });
  }

  #end(state, reason, payload) {
    const block = this.blocks.at(-1);
    if (block && block.protocol_id === this.protocolSerial && block.end_arrival_ms === undefined) {
      block.complete = state === PROTOCOL.COMPLETED;
      block.end_index = this.deps.sampleIndex();
      block.end_arrival_ms = this.deps.now();
      if (state !== PROTOCOL.COMPLETED) block.interrupted = true;
    }
    if (this.active) {
      this.active.end_index = this.deps.sampleIndex();
      this.active.end_arrival_ms = this.deps.now();
      this.active.end_reason = reason;
      this.active.end_state = state;
    }
    this.deps.log('protocol_end_' + reason, { protocol_id: this.protocolSerial, state, ...payload });
    if (state !== PROTOCOL.COMPLETED) this.deps.cues.cancel?.();
    this.sequence = [];
    this.phase = -1;
    this.state = state;
    this.endReason = reason;
    this.active = null;
    this.deps.onChange();
  }
}
