// Breathwork: protocol definitions, rest comparison and an isolated end-to-end run.
// SYNTHETIC SIGNALS ONLY — this proves software behaviour, not BLE, contact, hearing or physiology.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LabController } from '../src/lab/controller.js';
import { MemoryStore } from '../src/session/store-memory.js';
import { readZip } from '../src/session/zip.js';
import { parseCsv } from '../src/session/csv.js';
import { encodePacket } from '../src/core/packets.js';
import { BergerV3WindowEngine } from '../src/analysis/berger-v3.js';
import { PROTOCOL } from '../src/protocol/engine.js';
import { plannedSeconds } from '../src/protocol/berger-protocol.js';
import { APP, GUIDE, MONTAGES, EEG_CHANNEL, channelLabel, blockName, protocolEntries, demoProtocol, describeBreathworkSession, restComparison } from '../apps/breathwork/config.js';
import { instrumentFor } from '../apps/registry.js';

test('breathwork protocols: durations, cue gates, simulated-only demo', () => {
  const entries = protocolEntries();
  assert.deepEqual(entries.map((e) => e.name), ['breath-check', 'rest-before', 'rest-after']);
  assert.deepEqual(entries.map((e) => plannedSeconds(e.create())), [240, 180, 180]);
  assert.ok(entries.every((e) => e.create().autoStopAcquisition === false), 'no protocol here stops acquisition');
  assert.equal(GUIDE.protocols.berger, undefined, 'the Berger test lives in Berger Effect');
  assert.ok(entries.every((e) => e.requireCueCheck && e.requireSpeech));
  const before = entries[1].create(), after = entries[2].create();
  assert.deepEqual(before.blocks.map((b) => b.seconds), after.blocks.map((b) => b.seconds), 'rests before and after are identical in timing');
  assert.equal(before.autoStopAcquisition, false, 'acquisition continues into the guided session');
  const sim = protocolEntries({ simulated: true });
  assert.equal(sim.at(-1).name, 'breath-demo');
  assert.ok(sim.every((e) => !e.requireSpeech));
  const demo = demoProtocol();
  assert.ok(demo.blocks.every((b) => b.label.startsWith('demo_') && b.spoken === undefined && b.seconds === 6));
  assert.equal(instrumentFor(APP.id).name, 'Breathwork');
  assert.equal(MONTAGES['breath-emg'].requiredChannels, 3);
  assert.equal(channelLabel(MONTAGES['breath-emg'], EEG_CHANNEL), 'EEG · Oz − left ear');
  const six = MONTAGES['breath-6ch'];
  assert.equal(six.requiredChannels, 6);
  assert.equal(six.channelNames.length, 6);
  assert.deepEqual(six.channelKinds, ['ecg', 'eeg', 'eeg', 'eog', 'emg', 'emg']);
  const pins = six.leads.map((l) => l.pin);
  assert.equal(new Set(pins).size, pins.length, 'one electrode per input');
  for (let ch = 0; ch < 6; ch++) assert.ok(pins.includes(`A${ch}P`) && pins.includes(`A${ch}N`), `channel ${ch + 1} has both inputs`);
  assert.ok(pins.includes('REF'));
  assert.equal(channelLabel(six, EEG_CHANNEL), 'EEG · Oz − left ear', 'Oz stays channel 2, the live EEG summary channel');
  const fpz = MONTAGES['breath-6ch-fpz'];
  assert.deepEqual(fpz.channelKinds, ['ecg', 'eeg', 'eeg', 'eeg', 'emg', 'emg']);
  const fpzPins = fpz.leads.map((l) => l.pin);
  assert.equal(new Set(fpzPins).size, fpzPins.length, 'one electrode per input (Fpz montage)');
  assert.equal(channelLabel(fpz, 3), 'EEG · Fpz − left ear');
  assert.equal(channelLabel(fpz, EEG_CHANNEL), 'EEG · Oz − left ear');
  assert.equal(blockName('eyes_closed_pair3'), 'Pair 3 · eyes closed');
  const meta = describeBreathworkSession({ session: { montage: 'breath-6ch', blocks: [], setup: {} }, sampleCount: 0 });
  assert.equal(meta.channel_names.length, 6);
  assert.equal(meta.channel_kinds[3], 'eog');
});

test('export metadata: plan id, neutral board name, and which channels are raw only', () => {
  const method = (montage, extra = {}) => describeBreathworkSession({ session: { montage, blocks: [], setup: {}, ...extra }, sampleCount: 0 }).method;
  assert.match(method('breath-6ch'), /Channels 3–6 are exported raw only\./);
  assert.match(method('breath-emg'), /Channel 3 is exported raw only\./);
  assert.doesNotMatch(method('breath-2ch'), /raw only/);
  assert.match(method('breath-2ch', { channel_count: 3 }), /Channel 3 is exported raw only\./, 'the device still sends a third channel');
  assert.match(method('breath-emg', { channel_count: 6 }), /Channels 3–6 are exported raw only\./, 'a three-channel montage on a six-channel device');
  assert.equal(APP.analysisPlan, 'breathwork-1');
  const fresh = describeBreathworkSession({ session: { montage: 'breath-6ch', blocks: [], setup: {} }, sampleCount: 0 });
  assert.equal(fresh.analysis_processing.plan_id, 'breathwork-1');
  assert.equal(fresh.hardware.reported_board, 'NPG Lite (exact revision unverified)');
  const earlier = describeBreathworkSession({ session: { montage: 'breath-6ch', blocks: [], setup: {}, analysis_plan: 'an-earlier-plan-id' }, sampleCount: 0 });
  assert.equal(earlier.analysis_processing.plan_id, 'an-earlier-plan-id', 'a session keeps the plan it recorded');
});

test('rest comparison: missing blocks, exclusion and too few windows are explicit', () => {
  const blocks = [
    { id: 1, protocol_id: 1, label: 'rest_before_closed', complete: true },
    { id: 2, protocol_id: 2, label: 'rest_after_closed', complete: true },
  ];
  const bp = (alpha) => ({ delta: 10, theta: 10, alpha, beta: 10, gamma: 5 });
  const win = (block_id, alpha, channel = EEG_CHANNEL) => ({ block_id, channel, accepted_for_block: true, reasons: [], filtered_alpha: alpha, bp: bp(alpha), relative_alpha: alpha / (35 + alpha) });
  const windows = [win(1, 40), win(1, 40), win(1, 40), win(2, 20), win(2, 20), win(1, 999, 0)];
  let res = restComparison({ blocks, windows });
  assert.equal(res.rows[0].status, 'missing_block', 'no eyes-open rests');
  assert.equal(res.rows[1].status, 'eligible');
  assert.equal(res.rows[1].alpha_ratio_after_before, 0.5);
  assert.ok(res.rows[1].slow_share_change > 0, 'same slow power, less alpha: larger slow share');
  res = restComparison({ blocks, windows, adherenceOf: (b) => (b.id === 2 ? 'exclude' : 'unconfirmed') });
  assert.equal(res.rows[1].status, 'excluded');
  res = restComparison({ blocks, windows: windows.slice(0, 4) });
  assert.equal(res.rows[1].status, 'too_few_windows');
});

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
  const cues = { kind: 'speech', speak(text, h) { h.onStart(); due.push([t + 2500, h.onEnd]); }, cancel() {} };
  const store = new MemoryStore();
  const controller = new LabController({
    app: { id: APP.id, version: APP.version, analysisPlan: APP.analysisPlan },
    transport, store,
    analysis: { createEngine: () => new BergerV3WindowEngine({ mode: 'shared', derived: false }) },
    cues: () => cues,
    describe: (ctx) => describeBreathworkSession(ctx),
    channelLabel,
    clock: { now: () => t, epochOf: (x) => 1_790_000_000_000 + x },
  });
  controller.setSetup({ montage: 'breath-emg', pad_condition: 'fresh', position: 'lying', operator_confirmations: { battery_only: true, contact: true, routing: true } }, MONTAGES['breath-emg']);
  let k = 0, lastTick = 0;
  // Channel 1: a 1 Hz pulse train; channel 2: a 10 Hz tone of the given amplitude; channel 3: noise-free offset.
  const feed = (ms, eegAmp = () => 20) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 20) {
      const records = [];
      for (let i = 0; i < 10; i++, k++) {
        const ecg = 2048 + (k % 500 < 10 ? 400 : 0);
        const eeg = Math.round(2048 + eegAmp() * Math.sin((2 * Math.PI * 10 * k) / 500) + 5 * Math.sin((2 * Math.PI * 3 * k) / 500));
        records.push({ counter: k & 0xff, channels: [ecg, eeg, 2048 + (k % 7), 2048, 2048, 2048] });
      }
      t += 20;
      for (let i = due.length - 1; i >= 0; i--) if (due[i][0] <= t) { due[i][1](); due.splice(i, 1); }
      controller.onPacket(encodePacket(records), t);
      if (t - lastTick >= 250) { lastTick = t; controller.tick(); }
    }
  };
  return { controller, store, feed, settle: () => new Promise((r) => setImmediate(r)) };
}

test('end to end: rest before, marked session, rest after, export with every channel', async () => {
  const { controller: c, feed, settle } = harness();
  await c.connect();
  assert.equal((await c.startAcquisition()).ok, true);
  feed(5000);
  c.testCue();
  feed(3000);
  c.confirmCueHeard(true);
  const [, beforeEntry, afterEntry] = protocolEntries();
  const run = async (entry, closedAmp) => {
    const started = await c.startProtocol(entry.create(), { requireCueCheck: true, requireSpeech: true });
    assert.equal(started.ok, true, `${entry.name} starts`);
    let guard = 0;
    while (c.protocol.running && guard++ < 20000) feed(20, () => (c.protocol.currentLabel().endsWith('_closed') ? closedAmp : 20));
    await settle();
    assert.equal(c.protocol.state, PROTOCOL.COMPLETED);
    assert.equal(c.acquisition, 'acquiring', 'rests never stop acquisition');
  };
  await run(beforeEntry, 60);
  c.mark('video start (key)');
  feed(10000);
  await run(afterEntry, 30);
  await c.recorder.flush();

  const cmp = restComparison({ blocks: c.protocol.blocks, windows: c.windows, adherenceOf: (b) => c.adherenceOf(b) });
  const closed = cmp.rows.find((r) => r.state === 'closed');
  assert.equal(closed.status, 'eligible');
  assert.ok(closed.alpha_ratio_after_before < 0.5, `synthetic tone halved in amplitude: power ratio ${closed.alpha_ratio_after_before}`);
  assert.equal(cmp.rows.find((r) => r.state === 'open').status, 'eligible');

  const parts = [];
  const exported = await c.exportBundle((bytes) => parts.push(bytes));
  const zip = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0; for (const p of parts) { zip.set(p, o); o += p.length; }
  const files = readZip(zip);
  const name = (f) => `${exported.stem}/${f}`;
  const raw = parseCsv(new TextDecoder().decode(files[name('raw.csv')]));
  assert.ok(raw.header.includes('ch3_adc'), 'channel 3 exported raw');
  assert.ok(raw.rows.some((r) => r[4] === 'rest_after_closed'));
  const meta = JSON.parse(new TextDecoder().decode(files[name('metadata.json')]));
  assert.equal(meta.version, 'Breathwork-Lab-0.2.0');
  assert.equal(meta.mode, 'breath-emg');
  assert.equal(meta.position, 'lying');
  assert.deepEqual(meta.channel_kinds, ['ecg', 'eeg', 'emg']);
  assert.equal(meta.markers.length, 1);
  assert.equal(meta.markers[0].note, 'video start (key)');
  assert.equal(meta.results.rest_comparison.channel_name, 'EEG · Oz − left ear');
  assert.equal(meta.results.rest_comparison.rows.find((r) => r.state === 'closed').status, 'eligible');
  assert.ok(meta.blocks.every((b) => ['ECG · left ribs − right collarbone', 'EEG · Oz − left ear'].includes(b.channel)), 'live summaries for channels 1 and 2 only');
  assert.match(meta.units, /not calibrated microvolts/);
});
