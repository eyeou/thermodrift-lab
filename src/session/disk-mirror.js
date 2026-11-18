/**
 * Optional second copy of a session on the Mac's disk, written live through the local server
 * (tools/serve.mjs --mirror <dir>). It exists because browser storage depends on the exact origin
 * and tab, and a session is safe only once exported. A backup only: the export stays the record.
 * Off when the server has no mirror directory, and always off on a hosted page.
 */
const CSV_HEADER = 'sample_index,arrival_ms,counter,phase,ch1_adc,ch2_adc,ch3_adc,ch4_adc,ch5_adc,ch6_adc\n';
const FLUSH_MS = 5000;
const MAX_PENDING_ROWS = 600000; // 20 min at 500 Hz; older rows are dropped and counted

export function createDiskMirror({ fetchImpl = (...a) => globalThis.fetch(...a), now = () => performance.now() } = {}) {
  let on = false, sessionId = null, rows = [], events = [], busy = false, lastFlush = 0;
  const started = new Set();
  const state = { on: false, bytes: 0, lastOkMs: null, failed: false, dropped: 0 };

  async function post(file, body) {
    const url = `/__mirror?session=${encodeURIComponent(sessionId)}&file=${file}`;
    const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'text/plain' }, body });
    if (!res.ok) throw new Error(`mirror ${res.status}`);
    state.bytes += body.length;
  }

  async function flush() {
    if (!on || busy || !sessionId || (!rows.length && !events.length)) return;
    busy = true;
    const r = rows, e = events;
    rows = []; events = [];
    try {
      if (r.length) await post('raw.csv', (started.has(sessionId) ? '' : CSV_HEADER) + r.join(''));
      started.add(sessionId);
      if (e.length) await post('events.jsonl', e.join(''));
      state.lastOkMs = now();
      state.failed = false;
    } catch {
      // Keep the data for the next attempt, in order.
      rows = r.concat(rows);
      events = e.concat(events);
      state.failed = true;
      if (rows.length > MAX_PENDING_ROWS) { state.dropped += rows.length - MAX_PENDING_ROWS; rows = rows.slice(-MAX_PENDING_ROWS); }
    } finally {
      busy = false;
    }
  }

  return {
    state,
    async probe() {
      try {
        const res = await fetchImpl('/__mirror/status');
        on = res.ok;
      } catch { on = false; }
      state.on = on;
      return on;
    },
    /** One sample row; called from the packet path, so hidden-tab timer throttling does not stop it. */
    row(id, row) {
      if (!on || !id) return;
      sessionId = id;
      const ch = row.channels;
      rows.push(`${row.index},${row.arrival_ms.toFixed(1)},${row.counter},${row.phase ?? ''},${ch[0] ?? ''},${ch[1] ?? ''},${ch[2] ?? ''},${ch[3] ?? ''},${ch[4] ?? ''},${ch[5] ?? ''}\n`);
      if (now() - lastFlush >= FLUSH_MS) { lastFlush = now(); flush(); }
    },
    event(id, event) {
      if (!on || !id) return;
      sessionId = id;
      events.push(`${JSON.stringify(event)}\n`);
    },
    flush,
    get pendingRows() { return rows.length; },
  };
}
