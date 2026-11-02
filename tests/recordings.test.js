// Recordings: several takes in one session stay separate, false starts are flagged, nothing is lost.
// SYNTHETIC SIGNALS ONLY — this proves software behaviour, not BLE, contact or physiology.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LabController } from '../src/lab/controller.js';
import { controlStates } from '../src/lab/viewmodel.js';
import { MemoryStore } from '../src/session/store-memory.js';
import { readZip } from '../src/session/zip.js';
import { parseCsv } from '../src/session/csv.js';
import { encodePacket } from '../src/core/packets.js';
import { BergerV3WindowEngine } from '../src/analysis/berger-v3.js';
import { exportSessionBundle } from '../src/session/bundle.js';
import { loadFromBundle, loadFromStore } from '../src/session/load.js';
import { bundleStem, flagStoredRecording, latestRecording, lengthText, recordingScope, recordingSummaries } from '../src/session/recordings.js';
import { APP, MONTAGES, channelLabel, protocolEntries, describeBreathworkSession } from '../apps/breathwork/config.js';

function harness() {
  let t = 0;
  const due = [];
  const transport = {
    kind: 'ble', transportName: 'fake', label: 'fake', supported: true,
    listeners: { disconnected: [] },
    on(e, fn) { (this.listeners[e] ??= []).push(fn); },
    async connect() { return { deviceName: 'NPG-TEST' }; },
    async start() {}, async stop() {}, async disconnect() {},
  };
  const cues = { kind: 'speech', speak(text, h) { h.onStart(); due.push([t + 500, h.onEnd]); }, cancel() {} };
  const store = new MemoryStore();
  const describe = (ctx) => describeBreathworkSession(ctx);
  const controller = new LabController({
    app: { id: APP.id, version: APP.version, analysisPlan: APP.analysisPlan },
    transport, store,
    analysis: { createEngine: () => new BergerV3WindowEngine({ mode: 'shared', derived: false }) },
    cues: () => cues,
    describe,
    channelLabel,
    clock: { now: () => t, epochOf: (x) => 1_790_000_000_000 + x },
  });
  controller.setSetup({ montage: 'breath-emg', condition: 'A', position: 'lying' }, MONTAGES['breath-emg']);
  let k = 0, lastTick = 0;
  const feed = (ms) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 20) {
      const records = [];
      for (let i = 0; i < 10; i++, k++) records.push({ counter: k & 0xff, channels: [2048 + (k % 500 < 10 ? 400 : 0), Math.round(2048 + 20 * Math.sin((2 * Math.PI * 10 * k) / 500)), 2048 + (k % 7), 2048, 2048, 2048] });
      t += 20;
      for (let i = due.length - 1; i >= 0; i--) if (due[i][0] <= t) { due[i][1](); due.splice(i, 1); }
      controller.onPacket(encodePacket(records), t);
      if (t - lastTick >= 250) { lastTick = t; controller.tick(); }
    }
  };
  const settle = () => new Promise((r) => setImmediate(r));
  return { controller, store, transport, describe, feed, settle };
}

async function unzip(exportFn) {
  const parts = [];
  const exported = await exportFn((bytes) => parts.push(bytes));
  const zip = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0; for (const p of parts) { zip.set(p, o); o += p.length; }
  const files = readZip(zip);
  const text = (f) => new TextDecoder().decode(files[`${exported.stem}/${f}`]);
  return { exported, zip, raw: parseCsv(text('raw.csv')), windowsCsv: parseCsv(text('windows.csv')), meta: JSON.parse(text('metadata.json')), manifest: JSON.parse(text('manifest.json')) };
}

const indices = (raw) => raw.rows.map((r) => Number(r[raw.header.indexOf('sample_index')]));

async function twoRecordings(h) {
  const c = h.controller;
  await c.connect();
  assert.equal((await c.startAcquisition()).ok, true);
  h.feed(6000);
  await c.stopAcquisition();
  assert.equal((await c.startAcquisition()).ok, true);
  c.mark('in recording 2');
  h.feed(9000);
  await c.stopAcquisition();
  return c;
}

test('one recording exports alone: its rows, windows, blocks and events only', async () => {
  const h = harness();
  const c = await twoRecordings(h);
  const [first, second] = c.segments;
  assert.equal(second.start_index, first.end_index + 1, 'indices continue across recordings');
  const one = await unzip((sink) => c.exportBundle(sink, { segmentId: 1 }));
  const two = await unzip((sink) => c.exportBundle(sink, { segmentId: 2 }));
  const all = await unzip((sink) => c.exportBundle(sink));

  assert.deepEqual([indices(one.raw).at(0), indices(one.raw).at(-1)], [first.start_index, first.end_index]);
  assert.deepEqual([indices(two.raw).at(0), indices(two.raw).at(-1)], [second.start_index, second.end_index]);
  assert.equal(indices(one.raw).length + indices(two.raw).length, indices(all.raw).length, 'no sample lost or counted twice');
  assert.equal(new Set([...indices(one.raw), ...indices(two.raw)]).size, indices(all.raw).length);
  assert.equal(two.meta.integrity.samples, indices(two.raw).length);
  assert.equal(two.meta.integrity.inferred_missing, 0);
  assert.equal(two.manifest.integrity.ok, true);
  assert.equal(two.meta.export_scope.kind, 'recording');
  assert.equal(two.meta.export_scope.recording_id, 2);
  assert.equal(two.meta.export_scope.recordings_in_session, 2);
  assert.equal(two.manifest.scope.first_index, second.start_index);
  assert.equal(all.meta.export_scope.kind, 'session');
  assert.deepEqual(two.meta.segments.map((s) => s.id), [2]);
  assert.ok(two.windowsCsv.rows.every((r) => Number(r[0]) >= second.start_index), 'windows of recording 2 only');
  assert.equal(two.meta.markers.length, 1, 'the marker of recording 2');
  assert.equal(one.meta.markers.length, 0);
  assert.ok(two.meta.events.every((e) => e.label !== 'session_created'), 'events of recording 1 stay out');
  assert.ok(one.meta.events.some((e) => e.label === 'session_created'));

  assert.match(two.exported.stem, /-A-rec2-at-\d\dh\d\d$/, 'file name gives condition, recording and local start time');
  assert.match(all.exported.stem, /-A-all-2-recordings$/);
  assert.notEqual(one.exported.stem, two.exported.stem, 'two takes can never get the same file name');
  await assert.rejects(c.exportBundle(() => {}, { segmentId: 9 }), /Unknown recording 9/);
});

test('a chunk shared by two recordings is split at the row', async () => {
  const h = harness();
  const c = await twoRecordings(h);
  await c.recorder.flush();
  const chunks = [];
  for await (const chunk of h.store.readChunks(c.session.id)) chunks.push(chunk);
  const boundary = c.segments[1].start_index;
  assert.ok(chunks.some((x) => x.first_index < boundary && x.last_index >= boundary), 'this harness stops and restarts within one flush interval');
  const two = await unzip((sink) => c.exportBundle(sink, { segmentId: 2 }));
  assert.equal(indices(two.raw)[0], boundary);
});

test('blocks and protocols follow their recording', async () => {
  const h = harness();
  const c = h.controller;
  await c.connect();
  await c.startAcquisition();
  h.feed(1000);
  await c.stopAcquisition();
  await c.startAcquisition();
  h.feed(2000);
  c.testCue();
  h.feed(1000);
  c.confirmCueHeard(true);
  const [, rest] = protocolEntries();
  assert.equal((await c.startProtocol(rest.create(), { requireCueCheck: true, requireSpeech: true })).ok, true);
  let guard = 0;
  while (c.protocol.running && guard++ < 20000) h.feed(20);
  await h.settle();
  await c.stopAcquisition();
  const one = await unzip((sink) => c.exportBundle(sink, { segmentId: 1 }));
  const two = await unzip((sink) => c.exportBundle(sink, { segmentId: 2 }));
  assert.equal(one.meta.protocols.length, 0);
  assert.equal(one.meta.blocks.length, 0);
  assert.deepEqual(two.meta.protocols.map((p) => p.name), ['rest-before']);
  assert.ok(two.meta.blocks.length > 0);
  const list = recordingSummaries({ ...c.session, segments: c.segments, protocols: c.protocol.protocols });
  assert.deepEqual(list.map((r) => r.protocols.map((p) => p.name)), [[], ['rest-before']]);
});

test('a test flag deletes nothing and travels with the file', async () => {
  const h = harness();
  const c = await twoRecordings(h);
  assert.equal(await c.flagRecording(1, 'test'), true);
  const one = await unzip((sink) => c.exportBundle(sink, { segmentId: 1 }));
  const two = await unzip((sink) => c.exportBundle(sink, { segmentId: 2 }));
  const all = await unzip((sink) => c.exportBundle(sink));
  assert.match(one.exported.stem, /-rec1-at-\d\dh\d\d-TEST$/);
  assert.doesNotMatch(two.exported.stem, /TEST/);
  assert.equal(one.meta.export_scope.flag, 'test');
  assert.deepEqual(all.meta.export_scope.flags, [{ recording_id: 1, flag: 'test' }]);
  assert.ok(indices(one.raw).length > 0, 'a flagged recording keeps its samples');
  assert.ok(one.meta.events.some((e) => e.label === 'recording_flag'));
  const stored = await h.store.getSession(c.session.id);
  assert.equal(stored.segments[0].flag, 'test', 'the flag is saved straight away');
  await c.flagRecording(1, null);
  assert.equal((await h.store.getSession(c.session.id)).segments[0].flag, undefined);
  assert.equal(await c.flagRecording(9, 'test'), false);
});

test('new session is one step from an open session; the finished one stays stored', async () => {
  const h = harness();
  const c = await twoRecordings(h);
  const firstId = c.session.id;
  const open = controlStates(c, { missingSetup: [], recordings: true });
  assert.equal(open.newSession.enabled, true);
  assert.equal(open.start.label, 'Add recording 3 to this session');
  assert.equal(open.export.label, 'Export recording 2 (latest)');
  await c.connect();
  await c.startAcquisition();
  assert.equal(await c.startNewSession(), false, 'refused while acquiring');
  assert.equal(controlStates(c, { missingSetup: [], recordings: true }).newSession.enabled, false);
  h.feed(1000);
  await c.stopAcquisition();
  assert.equal(await c.startNewSession(), true);
  assert.equal(c.session, null);
  assert.equal(c.segments.length, 0);
  const stored = await h.store.getSession(firstId);
  assert.equal(stored.status, 'closed');
  assert.equal(stored.close_reason, 'new_session');
  assert.equal(stored.segments.length, 3);
  assert.ok((stored.counts?.samples ?? 0) > 0);
  c.setSetup({ montage: 'breath-emg', position: 'lying' }, MONTAGES['breath-emg']);
  await c.startAcquisition();
  h.feed(1000);
  assert.notEqual(c.session.id, firstId, 'a new id, so a new file name');
  const fresh = await unzip((sink) => c.exportBundle(sink, { segmentId: 1 }));
  assert.equal(indices(fresh.raw)[0], 0, 'its own samples only');
});

test('without the option, Berger Effect keeps its wording and flow', async () => {
  const h = harness();
  const c = await twoRecordings(h);
  const states = controlStates(c, { missingSetup: [] });
  assert.equal(states.start.label, 'Restart acquisition');
  assert.equal(states.export.label, 'Export bundle (.zip)');
  assert.equal(states.newSession.hidden, true, 'a session is finished before a new one starts');
});

test('saved through failure: a lost device keeps every sample and the next take stays apart', async () => {
  const h = harness();
  const c = h.controller;
  await c.connect();
  await c.startAcquisition();
  h.feed(6000);
  const received = c.health.samples;
  h.transport.listeners.disconnected.forEach((fn) => fn({ reason: 'battery' }));
  assert.equal(c.acquisition, 'idle');
  assert.equal(c.segments[0].end_reason, 'device_disconnected');
  await c.connect();
  await c.startAcquisition();
  h.feed(3000);
  await c.stopAcquisition();
  const one = await unzip((sink) => c.exportBundle(sink, { segmentId: 1 }));
  assert.equal(indices(one.raw).length, received, 'everything received before the loss');
  const list = recordingSummaries({ ...c.session, segments: c.segments, protocols: c.protocol.protocols });
  assert.equal(list[0].ended, 'device disconnected');
  assert.equal(list[0].samples, received);
  assert.ok(list[0].seconds >= 0);
});

test('a closed tab: the open recording exports from the store alone, and its list row says so', async () => {
  const h = harness();
  const c = await twoRecordings(h);
  await c.startAcquisition();
  h.feed(4000);
  await c.recorder.flush();
  const stored = await h.store.getSession(c.session.id);
  assert.equal(stored.segments[2].end_arrival_ms, undefined, 'tab gone before the recording closed');
  await h.store.updateSession(stored.id, { status: 'interrupted' });
  const crashed = await h.store.getSession(stored.id);
  const list = recordingSummaries(crashed);
  assert.equal(list[2].ended, 'tab closed or crashed');
  assert.equal(list[2].samples, crashed.counts.samples - list[0].samples - list[1].samples);
  const out = await unzip((sink) => exportSessionBundle({ store: h.store, sessionId: stored.id, segmentId: 3, describe: h.describe, windowChannelLabel: (ch) => channelLabel(MONTAGES['breath-emg'], ch), sink }));
  assert.equal(indices(out.raw).length, list[2].samples);
  assert.equal(indices(out.raw)[0], stored.segments[2].start_index);
});

test('sessions saved by earlier versions: no flag, no end time, a chunk layout that predates this', async () => {
  const h = harness();
  const c = await twoRecordings(h);
  await c.recorder.flush();
  const stored = await h.store.getSession(c.session.id);
  const old = stored.segments.map(({ end_utc, flag, ...s }) => s);
  await h.store.updateSession(stored.id, { segments: old, setup: { montage: 'breath-emg' } });
  const session = await h.store.getSession(stored.id);
  const list = recordingSummaries(session);
  assert.ok(list.every((r) => r.flag === null && r.seconds > 0 && r.end_utc), 'times come from the session clock');
  assert.equal(bundleStem(session), `${session.app}-${session.id}-all-2-recordings`);
  const out = await unzip((sink) => exportSessionBundle({ store: h.store, sessionId: session.id, segmentId: 1, describe: h.describe, windowChannelLabel: (ch) => channelLabel(MONTAGES['breath-emg'], ch), sink }));
  assert.equal(indices(out.raw).at(-1), old[0].end_index);
});

test('a single-recording session keeps its plain name when exported whole', async () => {
  const h = harness();
  const c = h.controller;
  await c.connect();
  await c.startAcquisition();
  h.feed(1000);
  await c.stopAcquisition();
  const whole = await unzip((sink) => c.exportBundle(sink));
  assert.equal(whole.exported.stem, `${APP.id}-${c.session.id}-A`);
});

test('a recording bundle reopens in the review loader, and a stored session can be flagged there', async () => {
  const h = harness();
  const c = await twoRecordings(h);
  const two = await unzip((sink) => c.exportBundle(sink, { segmentId: 2 }));
  const view = await loadFromBundle(two.zip);
  assert.equal(view.sample_count ?? indices(two.raw).length, indices(two.raw).length);
  assert.deepEqual(view.segments.map((s) => s.id), [2]);
  assert.equal(view.integrity.ok, true);
  await assert.rejects(flagStoredRecording(h.store, c.session.id, 1, 'test'), /open in a recording tab/, 'a live session is flagged in its own tab');
  await c.finishSession();
  await flagStoredRecording(h.store, c.session.id, 1, 'test');
  const reopened = await loadFromStore(h.store, c.session.id);
  assert.equal(recordingSummaries(reopened)[0].flag, 'test');
  assert.equal(reopened.session_start_epoch_ms, c.session.session_start_epoch_ms);
});

test('a failed start is not the recording a plain export means', async () => {
  const h = harness();
  const c = await twoRecordings(h);
  h.transport.start = async () => { throw new Error('GATT error'); };
  assert.equal((await c.startAcquisition()).ok, false);
  assert.equal(c.segments.length, 3);
  assert.equal(latestRecording(c.segments).id, 2);
  assert.equal(controlStates(c, { missingSetup: [], recordings: true }).export.label, 'Export recording 2 (latest)');
  const list = recordingSummaries({ ...c.session, segments: c.segments, protocols: c.protocol.protocols }, { liveIndex: c.counters.index });
  assert.equal(list[2].samples, 0);
  assert.equal(list[2].ended, 'start failed');
  assert.equal(latestRecording([]), null);
});

test('length text: seconds while short, minutes after, a dash when unknown', () => {
  assert.equal(lengthText(3.4), '3 s');
  assert.equal(lengthText(119), '119 s');
  assert.equal(lengthText(4992), '83.2 min');
  assert.equal(lengthText(null), '—');
});

test('scope bounds an open recording by its successor', () => {
  const segments = [{ id: 1, start_index: 0, start_arrival_ms: 0 }, { id: 2, start_index: 100, start_arrival_ms: 500 }];
  assert.equal(recordingScope(segments, 1).last, 99);
  assert.equal(recordingScope(segments, 2).last, Infinity);
  assert.equal(recordingScope(segments, 3), null);
});
