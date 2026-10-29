/**
 * IndexedDB session store (browser). One transaction per flush, so a crash loses at most the
 * rows received since the previous flush (≈1 s). Typed arrays are stored as-is (structured
 * clone). Origin-scoped: http://127.0.0.1:8072 and http://localhost:8072 are different stores.
 */
const DB_NAME = 'thermodrift-lab';
const DB_VERSION = 1;
const TABLES = ['chunks', 'events', 'windows', 'annotations'];

function request(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
    tx.onerror = () => reject(tx.error);
  });
}

export async function openIdbStore(indexedDB = globalThis.indexedDB) {
  if (!indexedDB) throw new Error('IndexedDB unavailable');
  const open = indexedDB.open(DB_NAME, DB_VERSION);
  open.onupgradeneeded = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
    for (const table of TABLES) if (!db.objectStoreNames.contains(table)) db.createObjectStore(table, { keyPath: ['session_id', 'seq'] });
  };
  const db = await request(open);
  return new IdbStore(db);
}

export class IdbStore {
  constructor(db) {
    this.kind = 'indexeddb';
    this.durable = true;
    this.db = db;
  }

  async createSession(record) {
    const tx = this.db.transaction('sessions', 'readwrite');
    tx.objectStore('sessions').add(record);
    await done(tx);
  }

  async updateSession(id, patch) {
    const tx = this.db.transaction('sessions', 'readwrite');
    const store = tx.objectStore('sessions');
    const current = await request(store.get(id));
    if (!current) throw new Error(`Unknown session ${id}`);
    const next = { ...current, ...patch };
    store.put(next);
    await done(tx);
    return next;
  }

  async getSession(id) {
    const tx = this.db.transaction('sessions', 'readonly');
    return (await request(tx.objectStore('sessions').get(id))) ?? null;
  }

  async listSessions() {
    const tx = this.db.transaction('sessions', 'readonly');
    const all = await request(tx.objectStore('sessions').getAll());
    return all.sort((a, b) => (a.created_utc < b.created_utc ? 1 : -1));
  }

  async writeBatch(id, batch) {
    const tx = this.db.transaction(['sessions', ...TABLES], 'readwrite');
    if (batch.chunk) tx.objectStore('chunks').add({ ...batch.chunk, session_id: id });
    for (const key of ['events', 'windows', 'annotations']) for (const item of batch[key] ?? []) tx.objectStore(key).add({ ...item, session_id: id });
    if (batch.session) {
      const store = tx.objectStore('sessions');
      const current = await request(store.get(id));
      store.put({ ...current, ...batch.session });
    }
    await done(tx);
  }

  async *readChunks(id) {
    // Read in pages to keep memory bounded on long sessions.
    let lower = 0;
    for (;;) {
      const tx = this.db.transaction('chunks', 'readonly');
      const range = IDBKeyRange.bound([id, lower], [id, Number.MAX_SAFE_INTEGER]);
      const page = await request(tx.objectStore('chunks').getAll(range, 64));
      if (!page.length) return;
      for (const chunk of page) yield chunk;
      lower = page.at(-1).seq + 1;
    }
  }

  async readAll(id, table) {
    const tx = this.db.transaction(table, 'readonly');
    const range = IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]);
    return request(tx.objectStore(table).getAll(range));
  }

  async deleteSession(id) {
    const tx = this.db.transaction(['sessions', ...TABLES], 'readwrite');
    tx.objectStore('sessions').delete(id);
    const range = IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]);
    for (const table of TABLES) tx.objectStore(table).delete(range);
    await done(tx);
  }

  async estimate() {
    const estimate = (await globalThis.navigator?.storage?.estimate?.()) ?? {};
    const persisted = (await globalThis.navigator?.storage?.persisted?.()) ?? 'unknown';
    return { usage: estimate.usage ?? null, quota: estimate.quota ?? null, persisted };
  }
}
