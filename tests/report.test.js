// Session report: a session is read under its own app, plan and EEG channel.
// SYNTHETIC SIGNALS ONLY — this proves software behaviour, not BLE, contact or physiology.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LabController } from '../src/lab/controller.js';
import { MemoryStore } from '../src/session/store-memory.js';
import { encodePacket } from '../src/core/packets.js';
import { BergerV3WindowEngine, BERGER_V3, pairedResults } from '../src/analysis/berger-v3.js';
import { effectiveAdherence } from '../src/analysis/adherence.js';
import { bergerLongProtocol } from '../src/protocol/berger-protocol.js';
import { exportSessionBundle } from '../src/session/bundle.js';
import { loadFromBundle, loadFromStore } from '../src/session/load.js';
import { APP, MONTAGES, EEG_CHANNEL, channelLabel, describeBreathworkSession, eegChannelOf } from '../apps/breathwork/config.js';
import { instrumentFor } from '../apps/registry.js';
import { eyeResults, processingFor, recordedResultFor } from '../apps/report/review.js';

const EARLIER_PLAN = 'an-earlier-plan-id';

async function collectZip(run) {
  const parts = [];
  await run((bytes) => parts.push(bytes));
  const zip = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0; for (const p of parts) { zip.set(p, o); o += p.length; }
  return zip;
}

/**
 * A Breathwork session recorded with the Berger test, as earlier sessions were. Channel 1 (ECG)
 * carries a large constant 10 Hz tone; channel 2 (Oz) carries a 10 Hz tone twice as large with the
 * eyes closed, so reading the wrong channel gives a ratio of 1 instead of 4.
 */
async function sessionWithBergerTest() {
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
  const c = new LabController({
    app: { id: APP.id, version: APP.version, analysisPlan: EARLIER_PLAN },
    transport, store,
    analysis: { createEngine: () => new BergerV3WindowEngine({ mode: 'shared', derived: false }) },
    cues: () => cues,
    describe: (ctx) => describeBreathworkSession(ctx),
    channelLabel,
    clock: { now: () => t, epochOf: (x) => 1_790_000_000_000 + x },
  });
  c.setSetup({ montage: 'breath-6ch', position: 'lying' }, MONTAGES['breath-6ch']);
  let k = 0, lastTick = 0;
  const feed = (ms) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 20) {
      const closed = c.protocol.running && c.protocol.currentLabel()?.startsWith('eyes_closed');
      const records = [];
      for (let i = 0; i < 10; i++, k++) {
        const wave = Math.sin((2 * Math.PI * 10 * k) / 500);
        records.push({ counter: k & 0xff, channels: [Math.round(2048 + 300 * wave), Math.round(2048 + (closed ? 40 : 20) * wave), 2048 + (k % 7), 2048, 2048, 2048] });
      }
      t += 20;
      for (let i = due.length - 1; i >= 0; i--) if (due[i][0] <= t) { due[i][1](); due.splice(i, 1); }
      c.onPacket(encodePacket(records), t);
      if (t - lastTick >= 250) { lastTick = t; c.tick(); }
    }
  };
  await c.connect();
  await c.startAcquisition();
  feed(5000);
  c.testCue();
  feed(3000);
  c.confirmCueHeard(true);
  const started = await c.startProtocol(bergerLongProtocol({ blockSeconds: 30, order: ['open', 'closed', 'open', 'closed'] }), { requireCueCheck: true, requireSpeech: true });
  assert.equal(started.ok, true);
  let guard = 0;
  while (c.protocol.running && guard++ < 40000) feed(20);
  await new Promise((r) => setImmediate(r));
  for (const b of c.protocol.blocks) if (b.label.startsWith('eyes_')) c.annotateAdherence(b.id, 'as_instructed');
  await c.finishSession('closed', 'operator');
  return { c, store };
}

const adherenceIn = (view) => (b) => effectiveAdherence(b, view.annotations);

test('a Breathwork session recorded with the Berger test opens, reads its EEG channel and exports again', async () => {
  const { c, store } = await sessionWithBergerTest();
  const check = (view) => {
    const app = instrumentFor(view.app);
    assert.equal(app.name, 'Breathwork');
    assert.equal(recordedResultFor(view, 1), null, 'Breathwork exports its results as an object, not a list');
    const channel = app.analysisChannel(view);
    assert.equal(channel, EEG_CHANNEL);
    const [{ res }] = eyeResults(view, channel, adherenceIn(view));
    assert.equal(res.channel, EEG_CHANNEL);
    assert.equal(res.eligible_count, 4);
    assert.equal(res.higher_closed_count, 4);
    assert.ok(Math.abs(res.median_ratio - 4) < 0.2, `Oz doubled in amplitude: power ratio ${res.median_ratio}`);
    const ecg = pairedResults({ blocks: view.blocks, windows: view.windows, protocolId: res.protocol_id, channel: 0, adherenceOf: adherenceIn(view) });
    assert.ok(Math.abs(ecg.median_ratio - 1) < 0.05, 'the ECG channel would have read about 1×');
    const processing = processingFor(view, app, channel);
    assert.equal(processing.plan, EARLIER_PLAN, 'a session keeps the plan it recorded');
    assert.notEqual(processing.plan, BERGER_V3.plan_id);
    assert.notEqual(processing.metric, BERGER_V3.primary_metric);
    assert.match(processing.channelName, /^2 · EEG · Oz/);
  };

  const fromStore = await loadFromStore(store, c.session.id);
  assert.equal(fromStore.integrity.ok, true);
  check(fromStore);

  const live = await loadFromBundle(await collectZip((sink) => c.exportBundle(sink)));
  assert.equal(live.integrity.ok, true);
  assert.deepEqual(live.channel_kinds, MONTAGES['breath-6ch'].channelKinds);
  check(live);

  // The way the report exports a stored session.
  const app = instrumentFor(fromStore.app);
  const again = await loadFromBundle(await collectZip((sink) => exportSessionBundle({
    store, sessionId: c.session.id, sink, exportInfo: { method: 'test', from: 'report' },
    describe: (ctx) => app.describe(ctx),
    windowChannelLabel: (ch) => app.channelLabel(app.montages[fromStore.montage], ch),
  })));
  assert.equal(again.integrity.ok, true);
  assert.equal(again.processing.analysis.plan_id, EARLIER_PLAN);
  assert.ok(again.blocks.some((b) => b.label === 'eyes_closed_pair4'), 'its Berger blocks are still in the export');
  check(again);
});

test('alpha is never read from a channel the session does not name as EEG', () => {
  for (const [id, montage] of Object.entries(MONTAGES)) {
    assert.equal(eegChannelOf({ montage: id }), EEG_CHANNEL, id);
    assert.equal(montage.channelKinds[EEG_CHANNEL], 'eeg', id);
  }
  assert.equal(eegChannelOf({ montage: 'not-in-this-version', channel_names: ['ECG · a', 'EEG · Oz − left ear'] }), EEG_CHANNEL, 'from the recorded channel names');
  assert.equal(eegChannelOf({ montage: 'not-in-this-version', channel_kinds: ['ecg', 'eeg'] }), EEG_CHANNEL, 'from the recorded channel kinds');
  assert.equal(eegChannelOf({ montage: 'not-in-this-version' }), null, 'nothing recorded');
  assert.equal(eegChannelOf({ montage: 'not-in-this-version', channel_names: ['ECG · a', 'EMG · neck'] }), null, 'the second channel is not EEG');
  assert.equal(eegChannelOf({ montage: 'breath-6ch', channel_kinds: ['ecg', 'emg'] }), null, 'what the session recorded wins');

  const window = (channel) => ({ block_id: 1, protocol_id: 1, channel, accepted_for_block: true, reasons: [], filtered_alpha: 5, bp: { alpha: 5 }, relative_alpha: 0.5 });
  const view = { blocks: [{ id: 1, protocol_id: 1, label: 'eyes_open_pair1', complete: true }], protocols: [{ id: 1 }], windows: [window(0), window(1)], annotations: [] };
  assert.deepEqual(eyeResults(view, null, adherenceIn(view)), [], 'no channel, no result');
  assert.equal(eyeResults(view, EEG_CHANNEL, adherenceIn(view))[0].res.channel, EEG_CHANNEL);
  assert.match(processingFor({ ...view, analysis_plan: 'x' }, instrumentFor(APP.id), null).channelName, /^Not recorded/);
});

test('Berger Effect sessions keep channel 1, their plan and their recorded results', () => {
  const app = instrumentFor('berger-lab');
  const view = { app: 'berger-lab', analysis_plan: BERGER_V3.plan_id, montage: 'single', recorded_results: [{ protocol_id: 2, eligible_count: 4 }] };
  assert.equal(app.analysisChannel(view), 0);
  assert.deepEqual(recordedResultFor(view, 2), { protocol_id: 2, eligible_count: 4 });
  assert.equal(recordedResultFor(view, 3), null);
  assert.equal(recordedResultFor({ recorded_results: null }, 2), null);
  assert.deepEqual(processingFor(view, app, 0), { plan: BERGER_V3.plan_id, metric: BERGER_V3.primary_metric, eligibility: BERGER_V3.eligibility, channelName: null });
  const fileSet = instrumentFor('unknown');
  assert.equal(processingFor({ analysis_plan: 'unknown' }, fileSet, fileSet.analysisChannel({})).plan, BERGER_V3.plan_id, 'a file set that names no plan');
});
