// Breathwork session formats: what they say, what they record, and what they leave unchanged.
// SYNTHETIC SIGNALS ONLY — this proves software behaviour, not BLE, contact or physiology.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { LabController } from '../src/lab/controller.js';
import { MemoryStore } from '../src/session/store-memory.js';
import { encodePacket } from '../src/core/packets.js';
import { BergerV3WindowEngine } from '../src/analysis/berger-v3.js';
import { plannedSeconds } from '../src/protocol/berger-protocol.js';
import { BREATH_COMPLETION_CUES, breathRestProtocol, breathSignalCheckProtocol } from '../src/protocol/breath-protocol.js';
import { loadFromBundle, loadFromStore } from '../src/session/load.js';
import { exportSessionBundle } from '../src/session/bundle.js';
import { ZipWriter, readZip } from '../src/session/zip.js';
import { sha256Hex } from '../src/session/sha256.js';
import { effectiveAdherence } from '../src/analysis/adherence.js';
import { sessionTimelineSvg } from '../src/ui/components/session-timeline.js';
import { APP, DEFAULT_SESSION_FORMAT, EEG_CHANNEL, GUIDE, MONTAGES, SESSION_FORMATS, channelLabel, completionCue, describeBreathworkSession, guideFor, markerNote, protocolEntries, restComparison, sessionFormatLabel, sessionTimeline } from '../apps/breathwork/config.js';
import { instrumentFor } from '../apps/registry.js';
import { eyeResults, processingFor, restResults } from '../apps/report/review.js';

const SHORT = 'wim-hof-style', LONG = 'holotropic-style';
const secondsOf = (parts) => parts.reduce((sum, part) => sum + part.seconds, 0);
const listFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));

test('formats: two of them, with the lengths they state', () => {
  assert.deepEqual(Object.keys(SESSION_FORMATS), [SHORT, LONG]);
  assert.equal(DEFAULT_SESSION_FORMAT, SHORT);
  assert.equal(SESSION_FORMATS[SHORT].label, 'Wim Hof-style');
  assert.equal(SESSION_FORMATS[LONG].label, 'Holotropic-style');

  const short = SESSION_FORMATS[SHORT].parts;
  assert.equal(secondsOf(short), 16 * 60, 'about 16 minutes');
  assert.deepEqual([...new Set(short.map((p) => p.kind))], ['breathing', 'hold', 'recovery']);
  assert.equal(short.filter((p) => p.kind === 'breathing').length, 4, 'four rounds');
  assert.equal(short.filter((p) => p.kind === 'hold').length, 4, 'each with an exhale hold');
  assert.equal(short.filter((p) => p.kind === 'recovery').length, 4, 'and a recovery breath');

  const long = SESSION_FORMATS[LONG].parts;
  assert.deepEqual(long.map((p) => p.kind), ['breathing', 'closing', 'recovery']);
  assert.equal(long[0].seconds, 40 * 60, 'about forty minutes of connected breathing');
  assert.ok(long[2].seconds > long[1].seconds, 'a long recovery');
  assert.match(SESSION_FORMATS[LONG].length, /60/);
  assert.equal(secondsOf(long), 60 * 60);
});

test('guide: only the session step and the needs follow the format', () => {
  const short = guideFor(SHORT), long = guideFor(LONG);
  assert.deepEqual(GUIDE, short, 'the default guide is the short format');
  assert.deepEqual(short.steps.map((s) => s.title), long.steps.map((s) => s.title));
  short.steps.forEach((step, i) => {
    if (step.title === 'Your session') assert.notEqual(step.text, long.steps[i].text);
    else assert.deepEqual(step, long.steps[i], `${step.title} stays the same`);
  });
  const session = (guide) => guide.steps.find((s) => s.title === 'Your session').text;
  assert.match(session(short), /four rounds of deep breathing/i);
  assert.match(session(short), /exhale hold and a recovery breath/);
  for (const words of [/forty minutes of deep connected breathing/, /guided live/, /fast breaths/, /an exhale hold/, /an inhale hold with a whole-body contraction/, /shaking/, /long recovery lying still/]) assert.match(session(long), words);
  assert.ok(long.needs.some((n) => /trained facilitator/.test(n)));
  assert.ok(short.needs.some((n) => /audio or video/.test(n)));
  assert.equal(short.needs.length, long.needs.length);
});

test('care: one line, for the long format only', () => {
  assert.equal(SESSION_FORMATS[LONG].care, 'Run the long format with a trained facilitator present.');
  assert.equal(SESSION_FORMATS[SHORT].care, undefined);
});

test('protocols: rests and the signal check do not depend on the format', () => {
  assert.deepEqual(protocolEntries().map((e) => e.name), ['breath-check', 'rest-before', 'rest-after']);
  assert.equal(protocolEntries.length, 0, 'protocol entries take no format');
  const [check, before, , after] = [...sessionTimeline(LONG).map((g) => g.parts)];
  assert.deepEqual(check, [{ kind: 'plain', seconds: plannedSeconds(breathSignalCheckProtocol()) }]);
  assert.deepEqual(before, [{ kind: 'plain', seconds: plannedSeconds(breathRestProtocol('before')) }]);
  assert.deepEqual(after, [{ kind: 'plain', seconds: plannedSeconds(breathRestProtocol('after')) }]);
  assert.deepEqual(sessionTimeline(SHORT)[0], sessionTimeline(LONG)[0]);
  assert.deepEqual(sessionTimeline(SHORT)[1], sessionTimeline(LONG)[1]);
  assert.deepEqual(sessionTimeline(SHORT)[3], sessionTimeline(LONG)[3]);
});

test('timeline: drawn for both formats and any width, and in order', () => {
  for (const id of [SHORT, LONG]) {
    const format = SESSION_FORMATS[id];
    for (const width of [300, 340, 560, 860, 1040]) {
      const svg = sessionTimelineSvg(sessionTimeline(id), format.key, { width });
      assert.doesNotMatch(svg, /NaN|undefined|null/, `${id} at ${width}`);
      assert.match(svg, />Your session/);
      for (const { label } of format.key) assert.ok(svg.includes(`>${label}<`), `${id}: ${label}`);
      assert.match(svg, /Planned lengths, not a recording/);
      const rects = [...svg.matchAll(/<rect x="([\d.]+)" y="[\d.]+" width="[\d.]+" height="(?:18|22)"/g)].map((m) => Number(m[1]));
      assert.equal(rects.length, 3 + format.parts.length, 'check, rest, every part of the session, rest');
      assert.deepEqual(rects, [...rects].sort((a, b) => a - b));
      assert.ok(Math.max(...rects) < width);
    }
  }
});

test('keys and cues: the short format records what it always did, the long one names its own', () => {
  assert.equal(markerNote(SHORT, 'v'), 'video start');
  assert.equal(markerNote(SHORT, 'b'), 'breathing start');
  assert.equal(markerNote(SHORT, 'h'), 'hold start');
  assert.equal(markerNote(SHORT, 'r'), 'recovery breath');
  assert.equal(markerNote(SHORT, 'm'), 'marker');
  assert.equal(markerNote(SHORT, 'x'), null);
  assert.equal(markerNote(LONG, 'v'), 'music start');
  assert.equal(markerNote(LONG, 'r'), 'recovery start');
  assert.equal(markerNote(LONG, 'b'), 'breathing start');
  for (const key of ['V', 'B', 'H', 'R', 'M']) for (const id of [SHORT, LONG]) assert.match(SESSION_FORMATS[id].keys, new RegExp(`\\b${key} `), `${id} lists ${key}`);
  assert.match(SESSION_FORMATS[LONG].keys, /V music start/);
  assert.match(SESSION_FORMATS[LONG].keys, /R recovery start/);
  for (const name of Object.keys(BREATH_COMPLETION_CUES)) assert.equal(completionCue(name, SHORT), BREATH_COMPLETION_CUES[name], name);
  assert.match(completionCue('rest-before', LONG), /music/);
  assert.equal(completionCue('rest-after', LONG), BREATH_COMPLETION_CUES['rest-after']);
  assert.equal(completionCue('no-such-protocol', LONG), undefined);
});

test('the registered name appears nowhere in what is published', () => {
  const name = new RegExp(['Holotropic', 'Breathwork'].join('[ -]'), 'i');
  for (const file of [...['apps', 'src', 'docs', 'tools', 'tests', '.github'].flatMap(listFiles), 'README.md', 'CHANGELOG.md', 'SAFETY_AND_LIMITATIONS.md', 'CONTRIBUTING.md']) {
    if (/\.(png|ico)$/.test(file)) continue;
    assert.doesNotMatch(readFileSync(file, 'utf8'), name, file);
  }
});

// ---------------------------------------------------------------- recording
function session({ format } = {}) {
  let t = 0, k = 0, lastTick = 0;
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
  const controller = new LabController({
    app: { id: APP.id, version: APP.version, analysisPlan: APP.analysisPlan },
    transport, store,
    analysis: { createEngine: () => new BergerV3WindowEngine({ mode: 'shared', derived: false }) },
    cues: () => cues,
    describe: (ctx) => describeBreathworkSession(ctx),
    channelLabel,
    clock: { now: () => t, epochOf: (x) => 1_790_000_000_000 + x },
  });
  controller.setSetup({ montage: 'breath-emg', pad_condition: 'fresh', position: 'lying', ...(format ? { session_format: format } : {}) }, MONTAGES['breath-emg']);
  const feed = (ms) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 20) {
      const amp = controller.protocol.running && controller.protocol.currentLabel()?.endsWith('_closed') ? 60 : 20;
      const records = [];
      for (let i = 0; i < 10; i++, k++) records.push({ counter: k & 0xff, channels: [2048 + (k % 500 < 10 ? 400 : 0), Math.round(2048 + amp * Math.sin((2 * Math.PI * 10 * k) / 500)), 2048 + (k % 7), 2048, 2048, 2048] });
      t += 20;
      for (let i = due.length - 1; i >= 0; i--) if (due[i][0] <= t) { due[i][1](); due.splice(i, 1); }
      controller.onPacket(encodePacket(records), t);
      if (t - lastTick >= 250) { lastTick = t; controller.tick(); }
    }
  };
  const run = async () => {
    await controller.connect();
    await controller.startAcquisition();
    feed(12000);
    for (const side of ['before', 'after']) {
      const definition = breathRestProtocol(side);
      definition.blocks = definition.blocks.map((b) => ({ ...b, seconds: 30, spoken: undefined }));
      assert.equal((await controller.startProtocol(definition, {})).ok, true, `rest ${side} starts`);
      let guard = 0;
      while (controller.protocol.running && guard++ < 5000) feed(20);
      feed(1000);
    }
    await controller.recorder.flush();
    await new Promise((r) => setImmediate(r));
  };
  return { controller, store, feed, run };
}

async function collect(write) {
  const parts = [];
  await write((bytes) => parts.push(bytes));
  const zip = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let at = 0;
  for (const p of parts) { zip.set(p, at); at += p.length; }
  return zip;
}

const encoder = new TextEncoder(), decoder = new TextDecoder();
const metaOf = (zip) => {
  const files = readZip(zip);
  return JSON.parse(decoder.decode(files[Object.keys(files).find((n) => n.endsWith('/metadata.json'))]));
};

/** A bundle as an earlier version wrote it: no session format anywhere, and a matching manifest. */
async function asEarlierBundle(zip) {
  const files = readZip(zip);
  const metaName = Object.keys(files).find((n) => n.endsWith('/metadata.json'));
  const manifestName = Object.keys(files).find((n) => n.endsWith('/manifest.json'));
  const meta = JSON.parse(decoder.decode(files[metaName]));
  delete meta.session_format;
  delete meta.settings_before_acquisition.session_format;
  for (const event of meta.events) delete event.settings?.setup?.session_format;
  assert.doesNotMatch(JSON.stringify(meta), /session_format/);
  const metaBytes = encoder.encode(`${JSON.stringify(meta, null, 2)}\n`);
  const manifest = JSON.parse(decoder.decode(files[manifestName]));
  const entry = manifest.files.find((f) => f.name === 'metadata.json');
  entry.bytes = metaBytes.length;
  entry.sha256 = sha256Hex(metaBytes);
  return collect(async (sink) => {
    const out = new ZipWriter(async (bytes) => sink(bytes));
    for (const name of Object.keys(files)) await out.addBytes(name, name === metaName ? metaBytes : name === manifestName ? encoder.encode(JSON.stringify(manifest)) : files[name]);
    await out.finish();
  });
}

test('metadata: the chosen format is recorded, and an earlier session says it was not', () => {
  const describe = (setup) => describeBreathworkSession({ session: { montage: 'breath-emg', blocks: [], setup }, sampleCount: 0 });
  const recorded = describe({ session_format: LONG });
  assert.equal(recorded.session_format, LONG);
  assert.equal(recorded.settings_before_acquisition.session_format, LONG);
  assert.equal(describe({}).session_format, 'not recorded');
  assert.equal(sessionFormatLabel(LONG), 'Holotropic-style');
  assert.equal(sessionFormatLabel(SHORT), 'Wim Hof-style');
  for (const none of [null, undefined, '', 'not recorded']) assert.equal(sessionFormatLabel(none), 'Not recorded');
  assert.equal(sessionFormatLabel('a-later-format'), 'a-later-format', 'a format this version does not know stays readable');
});

test('export: the format goes in the store, the bundle, one recording and the report view', async () => {
  const { controller: c, store, run } = session({ format: LONG });
  await run();
  const whole = await collect((sink) => c.exportBundle(sink));
  assert.equal(metaOf(whole).session_format, LONG);
  const fromBundle = await loadFromBundle(whole);
  assert.equal(fromBundle.integrity.ok, true);
  assert.equal(fromBundle.session_format, LONG);
  const one = await collect((sink) => c.exportBundle(sink, { segmentId: c.segments[0].id }));
  assert.equal(metaOf(one).session_format, LONG, 'one recording of the session');
  await c.finishSession('closed', 'operator');
  const fromStore = await loadFromStore(store, c.session.id);
  assert.equal(fromStore.session_format, LONG);
  const app = instrumentFor(fromStore.app);
  assert.equal(app.sessionFormatLabel(fromStore.session_format), 'Holotropic-style');
  const again = await collect((sink) => exportSessionBundle({
    store, sessionId: c.session.id, sink, exportInfo: { method: 'test', from: 'report' },
    describe: (ctx) => app.describe(ctx),
    windowChannelLabel: (ch) => app.channelLabel(app.montages[fromStore.montage], ch),
  }));
  assert.equal(metaOf(again).session_format, LONG, 'exported again from the report');
});

test('an earlier bundle without a format still loads and reports the same results', async () => {
  const { controller: c, run } = session({ format: LONG });
  await run();
  const current = await collect((sink) => c.exportBundle(sink));
  const earlier = await asEarlierBundle(current);
  const before = await loadFromBundle(current), view = await loadFromBundle(earlier);
  assert.equal(view.integrity.ok, true, 'the manifest of the earlier bundle matches');
  assert.equal(view.session_format, null);
  const app = instrumentFor(view.app);
  assert.equal(app.name, 'Breathwork');
  assert.equal(app.sessionFormatLabel(view.session_format), 'Not recorded');
  const channel = app.analysisChannel(view);
  assert.equal(channel, EEG_CHANNEL);
  const adherence = (v) => (b) => effectiveAdherence(b, v.annotations);
  const rests = restResults(view, app, channel, adherence(view));
  assert.deepEqual(rests, restResults(before, app, channel, adherence(before)), 'same rest comparison with or without the field');
  const closed = rests.rows.find((r) => r.state === 'closed');
  assert.equal(closed.status, 'eligible');
  assert.ok(Math.abs(closed.alpha_ratio_after_before - 1) < 0.05, 'the same signal in both rests');
  assert.ok(closed.before.alpha > 4 * rests.rows.find((r) => r.state === 'open').before.alpha, 'three times the amplitude with the eyes closed');
  assert.deepEqual(eyeResults(view, channel, adherence(view)), [], 'no eye protocol here');
  assert.equal(processingFor(view, app, channel).plan, APP.analysisPlan);
  assert.deepEqual(view.blocks.map((b) => b.label), before.blocks.map((b) => b.label));
  assert.equal(view.windows.length, before.windows.length);
});

test('an earlier session in this browser reads as not recorded, and exports as not recorded', async () => {
  const { controller: c, store, run } = session();
  await run();
  await c.finishSession('closed', 'operator');
  const view = await loadFromStore(store, c.session.id);
  assert.equal(view.session_format, null);
  assert.equal(view.integrity.ok, true);
  assert.equal(instrumentFor(view.app).sessionFormatLabel(view.session_format), 'Not recorded');
  assert.ok(restComparison({ blocks: view.blocks, windows: view.windows }).rows.every((r) => r.before && r.after));
  const app = instrumentFor(view.app);
  const bundle = await collect((sink) => exportSessionBundle({
    store, sessionId: c.session.id, sink, exportInfo: { method: 'test', from: 'report' },
    describe: (ctx) => app.describe(ctx),
    windowChannelLabel: (ch) => app.channelLabel(app.montages[view.montage], ch),
  }));
  assert.equal(metaOf(bundle).session_format, 'not recorded');
  assert.equal((await loadFromBundle(bundle)).session_format, 'not recorded');
  assert.equal(sessionFormatLabel((await loadFromBundle(bundle)).session_format), 'Not recorded');
});

test('a Berger Effect session has no session format to report', () => {
  assert.equal(instrumentFor('berger-lab').sessionFormatLabel, undefined);
});

test('acquisition and analysis do not depend on the format', async () => {
  const run = async (format) => {
    const s = session({ format });
    await s.run();
    return {
      windows: s.controller.windows.map(({ index, start_index, channel, phase, block_id, filtered_alpha, bp, reasons, warnings, accepted_for_block }) => ({ index, start_index, channel, phase, block_id, filtered_alpha, bp, reasons, warnings, accepted_for_block })),
      blocks: s.controller.protocol.blocks.map(({ label, start_index, end_index, complete }) => ({ label, start_index, end_index, complete })),
      samples: s.controller.health.samples,
    };
  };
  const [short, long, none] = await Promise.all([run(SHORT), run(LONG), run(undefined)]);
  assert.ok(short.windows.length > 0);
  assert.deepEqual(long, short);
  assert.deepEqual(none, short);
});

test('acquisition, storage and analysis code never read the format', () => {
  for (const dir of ['src/core', 'src/analysis', 'src/protocol', 'src/transport', 'src/lab']) {
    for (const file of listFiles(dir)) assert.doesNotMatch(readFileSync(file, 'utf8'), /session_format|sessionFormat|SESSION_FORMATS/, file);
  }
});
