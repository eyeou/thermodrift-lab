/**
 * In-memory session store with the same contract as the IndexedDB store. Used by tests and as
 * an explicit, clearly labelled fallback when IndexedDB is unavailable (data then lives only in
 * the tab: the UI says so).
 */
export class MemoryStore {
  /** `reportQuota: false` simulates a browser whose estimate is unavailable or optimistic. */
  constructor({ quotaBytes = Infinity, reportQuota = true } = {}) {
    this.kind = 'memory';
    this.reportQuota = reportQuota;
    this.durable = false;
    this.quotaBytes = quotaBytes;
    this.usedBytes = 0;
    this.sessions = new Map();
    this.tables = { chunks: new Map(), events: new Map(), windows: new Map(), annotations: new Map() };
  }

  async createSession(record) {
    if (this.sessions.has(record.id)) throw new Error(`Session ${record.id} exists`);
    this.sessions.set(record.id, structuredClone(record));
    for (const table of Object.values(this.tables)) table.set(record.id, []);
  }

  async updateSession(id, patch) {
    const current = this.sessions.get(id);
    if (!current) throw new Error(`Unknown session ${id}`);
    const next = { ...current, ...structuredClone(patch) };
    this.sessions.set(id, next);
    return structuredClone(next);
  }

  async getSession(id) {
    const s = this.sessions.get(id);
    return s ? structuredClone(s) : null;
  }

  async listSessions() {
    return [...this.sessions.values()].map((s) => structuredClone(s)).sort((a, b) => (a.created_utc < b.created_utc ? 1 : -1));
  }

  /**
   * Atomic write of one flush. Throws a DOMException-like QuotaExceededError when over quota.
   * @param {string} id
   * @param {{chunk?:object, events?:object[], windows?:object[], annotations?:object[], session?:object}} batch
   */
  async writeBatch(id, batch) {
    if (!this.sessions.has(id)) throw new Error(`Unknown session ${id}`);
    const bytes = estimateBytes(batch);
    if (this.usedBytes + bytes > this.quotaBytes) {
      const error = new Error('Quota exceeded');
      error.name = 'QuotaExceededError';
      throw error;
    }
    this.usedBytes += bytes;
    if (batch.chunk) this.tables.chunks.get(id).push(structuredClone(batch.chunk));
    for (const key of ['events', 'windows', 'annotations']) for (const item of batch[key] ?? []) this.tables[key].get(id).push(structuredClone(item));
    if (batch.session) await this.updateSession(id, batch.session);
  }

  async *readChunks(id) {
    for (const chunk of this.tables.chunks.get(id) ?? []) yield structuredClone(chunk);
  }

  async readAll(id, table) {
    return structuredClone(this.tables[table].get(id) ?? []);
  }

  async deleteSession(id) {
    this.sessions.delete(id);
    for (const table of Object.values(this.tables)) table.delete(id);
  }

  async estimate() {
    if (!this.reportQuota) return { usage: null, quota: null, persisted: false };
    return { usage: this.usedBytes, quota: Number.isFinite(this.quotaBytes) ? this.quotaBytes : null, persisted: false };
  }
}

export function estimateBytes(batch) {
  let bytes = 0;
  if (batch.chunk) for (const column of Object.values(batch.chunk.columns)) bytes += column.byteLength ?? 0;
  for (const key of ['events', 'windows', 'annotations']) bytes += (batch[key]?.length ?? 0) * 400;
  return bytes + 256;
}
