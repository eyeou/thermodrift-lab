// Isolated end-to-end harness: fake clock, fake BLE transport, in-memory store.
// SYNTHETIC SIGNALS ONLY — this proves software behaviour, not BLE, contact, hearing or physiology.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { LabController } from '../src/lab/controller.js';
import { MemoryStore } from '../src/session/store-memory.js';
import { readZip } from '../src/session/zip.js';
import { parseCsv } from '../src/session/csv.js';
import { encodePacket } from '../src/core/packets.js';
import { BergerV3WindowEngine } from '../src/analysis/berger-v3.js';
import { pairedResults } from '../src/analysis/berger-v3.js';
import { PROTOCOL } from '../src/protocol/engine.js';
import { controlStates, protocolCard } from '../src/lab/viewmodel.js';
import { APP, MONTAGES, channelLabel, describeBergerSession, protocolEntries } from '../apps/berger/config.js';
import { bergerLongProtocol, baselineProtocol } from '../src/protocol/berger-protocol.js';

function harness({ cueDelayMs = 2500, quotaBytes = Infinity, speech = true, reportQuota = true } = {}) {
  let t = 0;
  const writes = [];
  const due = [];
  const transport = {
    kind: 'ble', transportName: 'fake', label: 'fake', supported: true,
    listeners: { disconnected: [] },
    on(e, fn) { (this.listeners[e] ??= []).push(fn); },
    async connect() { return { deviceName: 'NPG-TEST' }; },
    async start() { writes.push('START'); },
    async stop() { writes.push('STOP'); },
    async disconnect() {},
    drop() { for (const fn of this.listeners.disconnected) fn({ reason: 'test link loss' }); },
  };
  const cueLog = [];
  const cues = speech
    ? { kind: 'speech', failNext: false, speak(text, h) { cueLog.push(text); if (this.failNext) { this.failNext = false; h.onError('synthesis-failed'); return; } h.onStart(); due.push([t + cueDelayMs, h.onEnd]); }, cancel() {} }
    : { kind: 'silent', speak() {}, cancel() {} };
  const store = new MemoryStore({ quotaBytes, reportQuota });
  const montage = MONTAGES.single;
  const controller = new LabController({
    app: { id: APP.id, version: APP.version, analysisPlan: APP.analysisPlan },
    transport, store,
    analysis: { createEngine: (m) => new BergerV3WindowEngine({ mode: m?.id ?? 'single' }) },
    cues: () => cues,
    describe: (ctx) => describeBergerSession(ctx),
    channelLabel,
    clock: { now: () => t, epochOf: (x) => 1_790_000_000_000 + x },
  });
  controller.setSetup({ pad_condition: 'fresh', operator_confirmations: { battery_only: true, contact: true, routing: true } }, montage);
  let k = 0;
  let lastTick = 0;
  const feed = (ms, amp = () => 20, { counterJump = 0 } = {}) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 20) {
      k += counterJump; counterJump = 0;
      const records = [];
      for (let i = 0; i < 10; i++, k++) {
        const a = amp();
        const v = Math.round(2048 + a * Math.sin((2 * Math.PI * 10 * k) / 500) + 30 * Math.sin((2 * Math.PI * 50 * k) / 500));
        records.push({ counter: k & 0xff, channels: [v, 2048, 2048, 2048, 2048, 2048] });
      }
      t += 20;
      for (let i = due.length - 1; i >= 0; i--) if (due[i][0] <= t) { due[i][1](); due.splice(i, 1); }
      controller.onPacket(encodePacket(records), t);
      if (t - lastTick >= 250) { lastTick = t; controller.tick(); }
    }
  };
  const idle = (ms) => { for (let e = 0; e < ms; e += 250) { t += 250; lastTick = t; for (let i = due.length - 1; i >= 0; i--) if (due[i][0] <= t) { due[i][1](); due.splice(i, 1); } controller.tick(); } };
  const settle = () => new Promise((r) => setImmediate(r));
  return { controller, store, transport, cues, writes, feed, idle, settle, cueLog, get t() { return t; } };
}

const ui = (c, protocols = protocolEntries()) => ({ missingSetup: [], protocols });

test('full Berger flow: gates, 560 s protocol, auto-stop, adherence, export round trip', async () => {
  const h = harness();
  const c = h.controller;
  let vm = controlStates(c, { missingSetup: ['battery-only check'], protocols: protocolEntries() });
  assert.equal(vm.start.enabled, false);
  assert.match(vm.connect.label, /Connect/);
  await c.connect();
  assert.equal(c.connection, 'connected');
  vm = controlStates(c, { missingSetup: ['battery-only check'], protocols: protocolEntries() });
  assert.equal(vm.start.why, 'Complete setup: battery-only check.', 'blocker reason beside Start');
  assert.equal(controlStates(c, ui(c)).protocols.berger.why, 'Start acquisition first.');
  assert.deepEqual((await c.startAcquisition()).ok, true);
  assert.deepEqual(h.writes, ['START']);
  assert.equal(c.session.status, 'recording');
  assert.ok(c.locked, 'setup locked after first acquisition');
  h.feed(5000);
  assert.ok(c.engine.latest[0], 'a 2048-sample window exists after ~4.1 s');
  assert.equal(controlStates(c, ui(c)).protocols.berger.why, 'Test the spoken cue and confirm you heard it.');
  let refused = await c.startProtocol(bergerLongProtocol(), { requireCueCheck: true, requireCleanSignal: true });
  assert.equal(refused.ok, false);
  c.testCue();
  h.feed(3000);
  assert.equal(c.cueTest.state, 'spoken');
  c.confirmCueHeard(true);
  assert.equal(controlStates(c, ui(c)).protocols.berger.enabled, true);
  const started = await c.startProtocol(bergerLongProtocol({ blockSeconds: 60 }), { requireCueCheck: true, requireCleanSignal: true });
  assert.equal(started.ok, true);
  assert.equal(c.protocol.sequence.length, 10);
  assert.equal(c.protocol.active.planned_duration_s, 560);
  assert.equal(controlStates(c, ui(c)).abort.enabled, true);
  // Closed-eye blocks carry a larger synthetic 10 Hz tone (test signal, not physiology).
  let guard = 0;
  while (c.protocol.running && guard++ < 40000) h.feed(20, () => (c.protocol.currentLabel().startsWith('eyes_closed') ? 60 : 20));
  await h.settle();
  assert.equal(c.protocol.state, PROTOCOL.COMPLETED);
  assert.equal(c.acquisition, 'idle', 'Berger protocol stops acquisition when complete');
  assert.equal(h.writes.at(-1), 'STOP');
  const card = protocolCard(c);
  assert.equal(card.title, 'Completed — review & save');
  assert.equal(controlStates(c, ui(c)).abort.hidden, true, 'no misleading “end protocol” after completion');
  const blocks = c.protocol.blocks;
  assert.equal(blocks.length, 10);
  assert.ok(blocks.every((b) => b.complete));
  await c.recorder.flush();
  const windows = await h.store.readAll(c.session.id, 'windows');
  for (const b of blocks) {
    const accepted = windows.filter((w) => w.block_id === b.id && w.accepted_for_block);
    assert.ok(accepted.length >= 2, `block ${b.label} has ≥2 accepted windows`);
    for (const w of accepted) {
      const startRowArrival = w.arrival_ms - (w.index - w.start_index) * 2; // 500 Hz, 2 ms per sample in this harness
      assert.ok(startRowArrival >= b.speech_end_arrival_ms + 3000 - 20, '3 s after browser-reported cue end');
      assert.ok(w.start_index >= b.start_index && w.index <= b.end_index, 'window inside its block');
    }
  }
  // Adherence: provisional until confirmed; exclusion is an annotation, raw labels unchanged.
  let res = pairedResults({ blocks, windows, protocolId: 1, adherenceOf: (b) => c.adherenceOf(b) });
  assert.equal(res.eligible_count, 0);
  assert.ok(res.pairs.every((p) => p.status === 'review_adherence'));
  assert.equal(c.confirmAllEyeBlocks(), 8);
  res = pairedResults({ blocks, windows, protocolId: 1, adherenceOf: (b) => c.adherenceOf(b) });
  assert.equal(res.eligible_count, 4);
  assert.ok(res.median_ratio > 4, `synthetic tone ratio ${res.median_ratio}`);
  const closed2 = blocks.find((b) => b.label === 'eyes_closed_pair2');
  c.annotateAdherence(closed2.id, 'exclude');
  res = pairedResults({ blocks, windows, protocolId: 1, adherenceOf: (b) => c.adherenceOf(b) });
  assert.equal(res.eligible_count, 3);
  assert.equal(res.pairs[1].status, 'excluded');
  // Marker + export
  const parts = [];
  const exported = await c.exportBundle((bytes) => parts.push(bytes));
  const zip = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0; for (const p of parts) { zip.set(p, o); o += p.length; }
  const files = readZip(zip);
  const name = (f) => `${exported.stem}/${f}`;
  const manifest = JSON.parse(new TextDecoder().decode(files[name('manifest.json')]));
  for (const f of manifest.files) assert.equal(createHash('sha256').update(files[name(f.name)]).digest('hex'), f.sha256, `manifest hash ${f.name}`);
  assert.equal(manifest.integrity.ok, true);
  const raw = parseCsv(new TextDecoder().decode(files[name('raw.csv')]));
  assert.deepEqual(raw.header.slice(0, 8), ['sample_index', 'nominal_seconds_500hz', 'arrival_ms', 'counter', 'phase', 'protocol_id', 'block_id', 'ch1_adc']);
  assert.equal(raw.header.length, 13, '6 channels exported even though one is analysed');
  assert.equal(raw.rows.length, c.health.samples);
  assert.ok(raw.rows.some((r) => r[4] === 'eyes_closed_pair2'), 'prompted labels preserved after exclusion');
  const meta = JSON.parse(new TextDecoder().decode(files[name('metadata.json')]));
  assert.equal(meta.version, 'Berger-Lab-3.2.0');
  assert.equal(meta.analysis_processing.plan_id, 'berger-v3-filtered-primary');
  assert.deepEqual(meta.analysis_processing.filter.harmonic_notches_hz, [100, 150, 200]);
  assert.equal(meta.blocks.find((b) => b.label === 'eyes_closed_pair2').adherence, 'exclude');
  assert.equal(meta.blocks.find((b) => b.label === 'eyes_closed_pair2').adherence_as_recorded, 'unconfirmed');
  assert.ok(meta.annotations.length >= 9);
  assert.ok(meta.events.some((e) => e.label === 'speech_ended' && e.block_id > 0));
  assert.equal(meta.results[0].eligible_count, 3);
  const win = parseCsv(new TextDecoder().decode(files[name('windows.csv')]));
  assert.ok(win.header.includes('alpha_filtered_8_13_counts2') && win.header.includes('accepted_for_block_before_quality'));
});

test('discontinuities: counter gap resets analysis; restart opens a new segment without inferred loss', async () => {
  const h = harness();
  const c = h.controller;
  await c.connect();
  await c.startAcquisition();
  h.feed(5000);
  assert.ok(c.engine.latest[0]);
  h.feed(20, undefined, { counterJump: 3 });
  assert.equal(c.health.gaps, 3);
  assert.equal(c.engine.rings[0].length, 10, 'analysis restarted after the gap');
  await c.stopAcquisition();
  assert.equal(c.segments[0].end_reason, 'Operator stop');
  await c.startAcquisition();
  assert.equal(c.segments.length, 2, 'stop/start keeps the same session');
  h.feed(100);
  assert.equal(c.health.gaps, 3, 'the device counter restart is not counted as loss');
  assert.equal(c.engine.filterStartIndex, c.segments[1].start_index, 'filters restart at the new segment');
  await c.recorder.flush();
  const events = await h.store.readAll(c.session.id, 'events');
  assert.equal(events.filter((e) => e.label === 'acquisition_start').length, 2);
  assert.ok(events.some((e) => e.label === 'counter_gap' && e.inferred_missing === 3));
});

test('protocol interruptions: stalled stream, disconnect, failed cue, page hidden', async () => {
  // stalled stream
  let h = harness({ speech: false });
  let c = h.controller;
  await c.connect(); await c.startAcquisition(); h.feed(5000);
  assert.equal((await c.startProtocol(baselineProtocol())).ok, true);
  h.feed(2000);
  h.idle(3000);
  assert.ok(c.protocol.blocks.at(-1).deviations.includes('Data stream stale during this block'));
  assert.equal(c.protocol.state, PROTOCOL.RUNNING);
  h.idle(8000);
  assert.equal(c.protocol.state, PROTOCOL.INTERRUPTED, 'clock does not run on without data');
  assert.equal(c.protocol.lastProtocol().end_reason, 'Data stream stalled');
  assert.equal(protocolCard(c).state, 'interrupted');
  // disconnect
  h = harness({ speech: false }); c = h.controller;
  await c.connect(); await c.startAcquisition(); h.feed(5000);
  await c.startProtocol(baselineProtocol());
  h.feed(1000);
  h.transport.drop();
  assert.equal(c.protocol.state, PROTOCOL.INTERRUPTED);
  assert.equal(c.acquisition, 'idle');
  assert.equal(c.connection, 'disconnected');
  assert.equal(c.segments[0].end_reason, 'device_disconnected');
  assert.equal(controlStates(c, ui(c)).start.why, 'Connect the device first.');
  // failed cue
  h = harness(); c = h.controller;
  await c.connect(); await c.startAcquisition(); h.feed(5000);
  h.cues.failNext = true;
  await c.startProtocol(baselineProtocol());
  assert.equal(c.protocol.state, PROTOCOL.INTERRUPTED);
  assert.equal(c.protocol.blocks[0].adherence, 'exclude');
  // page hidden
  h = harness({ speech: false }); c = h.controller;
  await c.connect(); await c.startAcquisition(); h.feed(5000);
  await c.startProtocol(baselineProtocol());
  c.protocol.noteVisibility('hidden');
  assert.ok(c.protocol.blocks[0].deviations[0].startsWith('Page hidden'));
  // operator marker
  const marker = c.mark('arm moved');
  assert.equal(marker.label, 'operator_marker');
  assert.equal(marker.block_id, c.protocol.blocks[0].id);
});

test('storage preflight refuses a protocol that cannot fit', async () => {
  const h = harness({ speech: false, quotaBytes: 400_000 });
  const c = h.controller;
  await c.connect(); await c.startAcquisition(); h.feed(5000);
  const verdict = await c.startProtocol(bergerLongProtocol());
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /Not enough browser storage/);
  assert.equal(c.protocol.state, PROTOCOL.IDLE);
});

test('storage quota: protocol interrupted, acquisition stopped, unsaved rows still exported', async () => {
  const h = harness({ speech: false, quotaBytes: 200_000, reportQuota: false });
  const c = h.controller;
  await c.connect(); await c.startAcquisition(); h.feed(5000);
  await c.recorder.flush().catch(() => {});
  await c.startProtocol(baselineProtocol());
  for (let i = 0; i < 40 && !c.recorder.error; i++) { h.feed(1000); await h.settle(); await c.recorder.flush().catch(() => {}); }
  await h.settle();
  assert.equal(c.recorder.error?.quota, true);
  assert.equal(c.protocol.state, PROTOCOL.INTERRUPTED);
  assert.equal(c.protocol.lastProtocol().end_reason, 'Storage capacity reached');
  await h.settle();
  assert.equal(c.acquisition, 'idle');
  assert.equal(controlStates(c, ui(c)).start.why !== null, true);
  const parts = [];
  const exported = await c.exportBundle((b) => parts.push(b));
  assert.ok(exported.manifest.integrity.unsaved_samples > 0, 'rows that could not be stored are exported from memory');
  assert.equal(exported.manifest.integrity.samples, c.health.samples);
});

test('metadata describes unknowns explicitly', () => {
  const meta = describeBergerSession({ session: { app: 'berger-lab', app_version: '3.2.0', montage: 'single', source: { kind: 'ble', device_name: 'NPG' }, blocks: [], protocols: [] }, events: [], windows: [], annotations: [], sampleCount: 0 });
  assert.equal(meta.hardware.firmware, 'unknown (not queried by the app)');
  assert.equal(meta.hardware.gain, 'unknown (not calibrated)');
  assert.equal(meta.units, 'raw ADC counts; not calibrated microvolts');
  assert.deepEqual(meta.channel_names, ['Oz − left ear']);
});
