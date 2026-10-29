import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Sha256, sha256Hex } from '../src/session/sha256.js';
import { Crc32, ZipWriter, readZip } from '../src/session/zip.js';
import { SessionRecorder, chunkHash, chunkRows } from '../src/session/recorder.js';
import { MemoryStore } from '../src/session/store-memory.js';
import { parseCsv, csvLine } from '../src/session/csv.js';

test('SHA-256 matches node:crypto for many sizes and split updates', () => {
  for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000, 65537]) {
    const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 31 + 7) & 0xff);
    const expected = createHash('sha256').update(bytes).digest('hex');
    assert.equal(sha256Hex(bytes), expected, `size ${n}`);
    const h = new Sha256();
    for (let i = 0; i < n; i += 37) h.update(bytes.subarray(i, i + 37));
    assert.equal(h.hex(), expected, `split ${n}`);
  }
  assert.equal(sha256Hex('é'), createHash('sha256').update('é').digest('hex'), 'strings hashed as UTF-8');
});

test('zip writer/reader round trip with CRC-32', async () => {
  assert.equal(new Crc32().update(new TextEncoder().encode('123456789')).value(), 0xcbf43926);
  const parts = [];
  const zip = new ZipWriter((b) => parts.push(b));
  await zip.addBytes('a/raw.csv', new TextEncoder().encode('x,y\n1,2\n'));
  await zip.addBytes('a/é.json', new TextEncoder().encode('{}'));
  await zip.finish();
  const files = readZip(Uint8Array.from(parts.flatMap((p) => [...p])));
  assert.equal(new TextDecoder().decode(files['a/raw.csv']), 'x,y\n1,2\n');
  assert.equal(new TextDecoder().decode(files['a/é.json']), '{}');
  await assert.rejects(new ZipWriter(() => {}).addEntry('bad', { size: 3, crc: 0 }, (w) => w(new Uint8Array(2))));
});

test('CSV quoting round trip', () => {
  const line = csvLine(['a', 'b,c', 'say "hi"', 'x\ny', null]);
  const parsed = parseCsv(`h1,h2,h3,h4,h5\n${line}\n`);
  assert.deepEqual(parsed.rows[0], ['a', 'b,c', 'say "hi"', 'x\ny', '']);
});

const row = (i, phase = 'idle') => ({ index: i, arrival_ms: i * 2 + 0.25, counter: i & 0xff, channels: [2000 + (i % 7), 2048, 2048], phase, protocol_id: 0, block_id: 0 });

test('recorder: chunked flushes, hashes, immutable events, bounded memory', async () => {
  let now = 0;
  const store = new MemoryStore();
  const rec = new SessionRecorder({ store, session: { id: 's1', created_utc: 'x', app: 't' }, clock: () => now, flushIntervalMs: 1000 });
  await rec.open();
  for (let i = 0; i < 1200; i++) { rec.appendRow(row(i, i < 600 ? 'idle' : 'eyes_open_pair1')); now += 2; rec.maybeFlush(); }
  const event = rec.logEvent({ label: 'x', payload: { a: 1 } });
  event.payload.a = 2;
  await rec.flush();
  assert.equal(rec.pendingRows(), 0);
  const chunks = [];
  for await (const c of store.readChunks('s1')) chunks.push(c);
  assert.ok(chunks.length >= 2, 'time-based chunking');
  assert.ok(chunks.every((c) => chunkHash(c) === c.sha256));
  const rows = chunks.flatMap((c) => [...chunkRows(c)]);
  assert.equal(rows.length, 1200);
  assert.deepEqual(rows[700], { ...row(700, 'eyes_open_pair1') });
  const events = await store.readAll('s1', 'events');
  assert.equal(events[0].payload.a, 1, 'stored events are copies, not live references');
  // tamper detection
  chunks[0].columns.channels[0] ^= 1;
  assert.notEqual(chunkHash(chunks[0]), chunks[0].sha256);
  // layout change is refused, never padded
  assert.throws(() => rec.appendRow({ ...row(1200), channels: [1, 2, 3, 4, 5, 6] }), /layout changed/i);
});

test('recorder: failed flush keeps data, quota error is fatal and reported', async () => {
  const store = new MemoryStore({ quotaBytes: 5000 });
  const statuses = [];
  const rec = new SessionRecorder({ store, session: { id: 's2', created_utc: 'x', app: 't' }, onStatus: (s) => statuses.push(s) });
  await rec.open();
  for (let i = 0; i < 3000; i++) rec.appendRow(row(i));
  await assert.rejects(rec.flush(), (e) => e.name === 'QuotaExceededError');
  assert.equal(rec.pendingRows(), 3000, 'nothing dropped');
  assert.equal(rec.status().error.quota, true);
  assert.equal(statuses.at(-1).error.fatal, true);
  assert.equal(rec.pendingChunk().count, 3000);
});
