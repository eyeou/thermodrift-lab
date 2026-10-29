/**
 * Session recorder: append-only raw rows, events, analysis windows and annotations, flushed to
 * a store in bounded chunks. Memory stays bounded by the flush interval, not by session length.
 *
 * Saved-versus-unsaved is explicit: `status()` reports rows/events still pending, the last
 * successful flush, and any storage error. When a flush fails, pending data stay in memory and
 * remain exportable from this tab.
 */
import { sha256Hex, Sha256 } from './sha256.js';

export const SESSION_SCHEMA = 'thermodrift.session/1';

/** Hash the column bytes of a chunk in a fixed order (used at write and at export). */
export function chunkHash(chunk) {
  const h = new Sha256();
  for (const key of ['index', 'arrival_ms', 'counter', 'channels', 'protocol_id', 'block_id', 'phase_code']) {
    const c = chunk.columns[key];
    h.update(new Uint8Array(c.buffer, c.byteOffset, c.byteLength));
  }
  h.update(JSON.stringify(chunk.phase_table));
  return h.hex();
}

class RowBuffer {
  constructor(channelCount) {
    this.channelCount = channelCount;
    this.index = [];
    this.arrival = [];
    this.counter = [];
    this.channels = [];
    this.protocol = [];
    this.block = [];
    this.phase = [];
    this.phaseTable = new Map();
  }
  get length() {
    return this.index.length;
  }
  push(row) {
    this.index.push(row.index);
    this.arrival.push(row.arrival_ms);
    this.counter.push(row.counter);
    for (let c = 0; c < this.channelCount; c++) this.channels.push(row.channels[c] ?? 0);
    this.protocol.push(row.protocol_id);
    this.block.push(row.block_id);
    if (!this.phaseTable.has(row.phase)) this.phaseTable.set(row.phase, this.phaseTable.size);
    this.phase.push(this.phaseTable.get(row.phase));
  }
  toChunk(seq) {
    const chunk = {
      seq,
      count: this.length,
      first_index: this.index[0],
      last_index: this.index.at(-1),
      channel_count: this.channelCount,
      phase_table: [...this.phaseTable.keys()],
      columns: {
        index: Int32Array.from(this.index),
        arrival_ms: Float64Array.from(this.arrival),
        counter: Uint8Array.from(this.counter),
        channels: Uint16Array.from(this.channels),
        protocol_id: Uint16Array.from(this.protocol),
        block_id: Uint32Array.from(this.block),
        phase_code: Uint16Array.from(this.phase),
      },
    };
    chunk.sha256 = chunkHash(chunk);
    return chunk;
  }
}

/** Iterate rows of a stored chunk. */
export function* chunkRows(chunk) {
  const { columns, channel_count: n, phase_table: phases } = chunk;
  for (let i = 0; i < chunk.count; i++) {
    yield {
      index: columns.index[i],
      arrival_ms: columns.arrival_ms[i],
      counter: columns.counter[i],
      channels: Array.from(columns.channels.subarray(i * n, i * n + n)),
      protocol_id: columns.protocol_id[i],
      block_id: columns.block_id[i],
      phase: phases[columns.phase_code[i]],
    };
  }
}

export class SessionRecorder {
  /**
   * @param {{store:object, session:object, channelCount:number, flushIntervalMs?:number, maxChunkRows?:number, clock?:()=>number, onStatus?:(status)=>void}} options
   */
  constructor({ store, session, channelCount = null, flushIntervalMs = 1000, maxChunkRows = 5000, clock = () => Date.now(), onStatus = () => {} }) {
    this.store = store;
    this.session = session;
    this.channelCount = channelCount;
    this.flushIntervalMs = flushIntervalMs;
    this.maxChunkRows = maxChunkRows;
    this.clock = clock;
    this.onStatus = onStatus;
    this.buffer = new RowBuffer(channelCount ?? 0);
    this.pendingEvents = [];
    this.pendingWindows = [];
    this.pendingAnnotations = [];
    this.inFlight = null;
    this.chunkSeq = 0;
    this.eventSeq = 0;
    this.windowSeq = 0;
    this.annotationSeq = 0;
    this.savedSamples = 0;
    this.savedChunks = 0;
    this.lastFlushAt = null;
    this.lastFlushUtc = null;
    this.error = null;
    this.closed = false;
    this.protocolSnapshot = { protocols: [], blocks: [] };
  }

  async open() {
    await this.store.createSession(this.session);
    this.lastFlushAt = this.clock();
    this.#emit();
  }

  /** The first row fixes the channel layout; a later change is refused (never padded). */
  appendRow(row) {
    if (this.channelCount === null) {
      this.channelCount = row.channels.length;
      this.buffer = new RowBuffer(this.channelCount);
      this.patchSession({ channel_count: this.channelCount });
    }
    if (row.channels.length !== this.channelCount) {
      const error = new Error(`Channel layout changed from ${this.channelCount} to ${row.channels.length} channels`);
      error.name = 'LayoutChangedError';
      throw error;
    }
    this.buffer.push(row);
  }

  /** Events are immutable once logged. Returns the stored event. */
  logEvent(event) {
    const stored = { seq: this.eventSeq++, ...structuredClone(event) };
    this.pendingEvents.push(stored);
    return structuredClone(stored);
  }

  addWindow(window) {
    const stored = { seq: this.windowSeq++, ...structuredClone(window) };
    this.pendingWindows.push(stored);
    return stored;
  }

  /** Annotations never modify raw rows or prompted labels; they are a separate, ordered layer. */
  annotate(annotation) {
    const stored = { seq: this.annotationSeq++, utc: new Date().toISOString(), ...structuredClone(annotation) };
    this.pendingAnnotations.push(stored);
    return structuredClone(stored);
  }

  /** Protocol/block records are small and change while a block runs; persisted at each flush. */
  setProtocolSnapshot(protocols, blocks) {
    this.protocolSnapshot = { protocols: structuredClone(protocols), blocks: structuredClone(blocks) };
  }

  /** Session-level fields (segments, counters, status) persisted at the next flush. */
  patchSession(patch) {
    Object.assign(this.session, structuredClone(patch));
  }

  pendingRows() {
    return this.buffer.length;
  }

  status() {
    return {
      store: this.store.kind,
      durable: !!this.store.durable,
      savedSamples: this.savedSamples,
      pendingRows: this.buffer.length,
      pendingEvents: this.pendingEvents.length + this.pendingWindows.length + this.pendingAnnotations.length,
      lastFlushUtc: this.lastFlushUtc,
      flushing: !!this.inFlight,
      error: this.error,
      closed: this.closed,
    };
  }

  /** Flush if the interval elapsed or the chunk is full. Never runs two flushes at once. */
  maybeFlush() {
    if (this.inFlight || this.error?.fatal) return this.inFlight;
    const due = this.clock() - (this.lastFlushAt ?? 0) >= this.flushIntervalMs || this.buffer.length >= this.maxChunkRows;
    if (!due) return null;
    return this.flush();
  }

  async flush() {
    if (this.inFlight) await this.inFlight;
    if (this.error?.fatal) throw Object.assign(new Error(this.error.message), { name: this.error.name });
    const buffer = this.buffer;
    const events = this.pendingEvents;
    const layout = this.channelCount ?? 0;
    const windows = this.pendingWindows;
    const annotations = this.pendingAnnotations;
    const chunk = buffer.length ? buffer.toChunk(this.chunkSeq) : null;
    this.buffer = new RowBuffer(layout);
    this.pendingEvents = [];
    this.pendingWindows = [];
    this.pendingAnnotations = [];
    const savedSamples = this.savedSamples + (chunk?.count ?? 0);
    const savedChunks = this.savedChunks + (chunk ? 1 : 0);
    const session = {
      ...this.session,
      protocols: this.protocolSnapshot.protocols,
      blocks: this.protocolSnapshot.blocks,
      counts: { samples: savedSamples, chunks: savedChunks, events: this.eventSeq, windows: this.windowSeq, annotations: this.annotationSeq },
      last_flush_utc: new Date().toISOString(),
    };
    this.inFlight = (async () => {
      try {
        // Always write: the session patch doubles as a heartbeat for crash recovery.
        await this.store.writeBatch(this.session.id, { chunk, events, windows, annotations, session });
        if (chunk) this.chunkSeq++;
        this.savedSamples = savedSamples;
        this.savedChunks = savedChunks;
        this.lastFlushAt = this.clock();
        this.lastFlushUtc = session.last_flush_utc;
        this.error = null;
      } catch (error) {
        // Put everything back in front of what arrived meanwhile; nothing is dropped.
        this.#restore(buffer, events, windows, annotations);
        const quota = error?.name === 'QuotaExceededError';
        this.error = { name: error?.name ?? 'Error', message: error?.message ?? String(error), quota, fatal: quota, at: new Date().toISOString() };
        throw error;
      } finally {
        this.inFlight = null;
        this.#emit();
      }
    })();
    return this.inFlight;
  }

  /** Final flush and status. `status`: 'closed' | 'interrupted'. */
  async close(status = 'closed', reason = 'operator') {
    this.patchSession({ status, closed_utc: new Date().toISOString(), close_reason: reason });
    this.closed = true;
    try {
      await this.flush();
    } finally {
      this.#emit();
    }
  }

  #restore(buffer, events, windows, annotations) {
    const newer = this.buffer;
    const merged = new RowBuffer(this.channelCount ?? 0);
    for (const row of rowsOf(buffer)) merged.push(row);
    for (const row of rowsOf(newer)) merged.push(row);
    this.buffer = merged;
    this.pendingEvents = [...events, ...this.pendingEvents];
    this.pendingWindows = [...windows, ...this.pendingWindows];
    this.pendingAnnotations = [...annotations, ...this.pendingAnnotations];
  }

  /** Rows not yet stored (for exports from a tab whose storage failed). */
  pendingChunk() {
    return this.buffer.length ? this.buffer.toChunk(this.chunkSeq) : null;
  }

  pendingItems() {
    return { events: this.pendingEvents, windows: this.pendingWindows, annotations: this.pendingAnnotations };
  }

  #emit() {
    this.onStatus(this.status());
  }
}

function* rowsOf(buffer) {
  const n = buffer.channelCount;
  const phases = [...buffer.phaseTable.keys()];
  for (let i = 0; i < buffer.length; i++) {
    yield {
      index: buffer.index[i],
      arrival_ms: buffer.arrival[i],
      counter: buffer.counter[i],
      channels: buffer.channels.slice(i * n, i * n + n),
      protocol_id: buffer.protocol[i],
      block_id: buffer.block[i],
      phase: phases[buffer.phase[i]],
    };
  }
}

export { sha256Hex };
