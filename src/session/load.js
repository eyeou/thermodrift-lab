/**
 * Session views for review surfaces. One shape whether the session comes from this browser's
 * store, an exported bundle (.zip) or a Berger Lab v3 file set (windows CSV + metadata JSON).
 *
 * Nothing here talks to hardware. Results are recomputed by the caller from the stored windows
 * with the app's analysis code; for files, the results recorded at export are kept alongside so a
 * difference would be visible rather than silently replaced.
 */
import { parseCsv } from './csv.js';
import { readZip } from './zip.js';
import { Sha256 } from './sha256.js';
import { chunkHash } from './recorder.js';

const decoder = new TextDecoder();

async function sha256(bytes) {
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return new Sha256().update(bytes).hex();
}

const num = (v) => (v === '' || v === undefined || v === null ? null : Number(v));

/** windows.csv (bundle or v3) → window records. Channel labels map to indices via `channelNames`. */
export function parseWindowsCsv(text, channelNames = []) {
  const { header, rows } = parseCsv(text);
  const at = Object.fromEntries(header.map((name, i) => [name, i]));
  const need = ['sample_index', 'block_id', 'accepted_for_block_before_quality', 'channel', 'alpha', 'alpha_filtered_8_13_counts2', 'reject_flags'];
  const missing = need.filter((n) => !(n in at));
  if (missing.length) throw new Error(`windows.csv is missing columns: ${missing.join(', ')}`);
  return rows.filter((r) => r.length > 1).map((r) => {
    const label = r[at.channel];
    const index = channelNames.indexOf(label);
    return {
      index: num(r[at.sample_index]),
      start_index: num(r[at.window_start_index]),
      arrival_ms: num(r[at.arrival_ms]),
      phase: r[at.phase],
      protocol_id: num(r[at.protocol_id]),
      block_id: num(r[at.block_id]),
      accepted_for_block: r[at.accepted_for_block_before_quality] === 'true',
      channel: index >= 0 ? index : /^\d+$/.test(label) ? Number(label) : -1,
      channel_label: label,
      rms: num(r[at.rms]),
      range: num(r[at.range]),
      rail: num(r[at.rail_fraction]),
      line: num(r[at.line_50_fraction_0_5_100]),
      line150: num(r[at.line_150_fraction_0_5_250]),
      hf: num(r[at.hf_fraction]),
      relative_alpha: num(r[at.relative_alpha_secondary_0_5_45]),
      bp: { delta: num(r[at.delta]), theta: num(r[at.theta]), alpha: num(r[at.alpha]), beta: num(r[at.beta]), gamma: num(r[at.gamma]) },
      filtered_alpha: num(r[at.alpha_filtered_8_13_counts2]),
      reasons: r[at.reject_flags] ? r[at.reject_flags].split(';') : [],
      warnings: r[at.warnings] ? r[at.warnings].split(';') : [],
    };
  });
}

/**
 * Exported metadata lists one block summary per channel. Rebuild one block record per block from
 * the first channel, keeping the adherence as recorded (not the effective one).
 */
export function blocksFromMetadata(meta) {
  const first = meta.channel_names?.[0];
  const seen = new Map();
  for (const b of meta.blocks ?? []) {
    if (seen.has(b.block_id) || (first && b.channel && b.channel !== first)) continue;
    seen.set(b.block_id, {
      id: b.block_id,
      protocol_id: b.protocol_id,
      label: b.label,
      complete: !!b.complete,
      adherence: b.adherence_as_recorded ?? b.adherence ?? 'unconfirmed',
      deviations: b.deviations ?? [],
      timer_lateness_s: b.timer_lateness_s,
      start_index: b.start_index,
      end_index: b.end_index,
      start_arrival_ms: b.start_arrival_ms,
      end_arrival_ms: b.end_arrival_ms,
      speech_start_arrival_ms: b.speech_start_arrival_ms,
      speech_end_arrival_ms: b.speech_end_arrival_ms,
    });
  }
  return [...seen.values()].sort((a, b) => a.id - b.id);
}

function viewFromMetadata(meta, { origin, windows, checks, files }) {
  const source = meta.source ?? { kind: 'ble', device_name: meta.device ?? 'unknown' };
  return {
    origin,
    editable: false,
    id: meta.session_id ?? meta.utc_export ?? 'unknown',
    app: meta.app?.id ?? (String(meta.version ?? '').startsWith('Berger-Lab') ? 'berger-lab' : 'unknown'),
    app_version: meta.app?.version ?? meta.version ?? 'unknown',
    analysis_plan: meta.app?.analysis_plan ?? meta.analysis_processing?.plan_id ?? 'unknown',
    status: 'exported',
    created_utc: meta.utc_start ?? meta.events?.[0]?.utc ?? null,
    exported_utc: meta.utc_export ?? null,
    source,
    simulated: source.kind === 'simulated',
    montage: meta.mode ?? 'unknown',
    channel_names: meta.channel_names ?? [],
    setup: meta.settings_before_acquisition ?? {},
    placement_notes: meta.placement_notes,
    hypothesis: meta.hypothesis,
    segments: meta.segments ?? [],
    health: { gaps: meta.missing_counter_inferred, duplicates: meta.duplicates, badPackets: meta.badPackets, invalid: meta.invalid },
    sample_count: meta.sample_count ?? null,
    protocols: meta.protocols ?? [],
    blocks: blocksFromMetadata(meta),
    events: meta.events ?? [],
    windows,
    annotations: meta.annotations ?? [],
    recorded_results: meta.results ?? null,
    processing: { analysis: meta.analysis_processing ?? null, display: meta.display_processing ?? null, method: meta.method ?? null, units: meta.units ?? null },
    limitations: meta.limitations ?? null,
    integrity: { ok: checks.every((c) => c.ok !== false), checks },
    files,
  };
}

/** Session saved in this browser. Verifies every stored chunk hash and the sample order. */
export async function loadFromStore(store, id) {
  const session = await store.getSession(id);
  if (!session) throw new Error(`No session ${id} in this browser.`);
  const [events, windows, annotations] = await Promise.all([store.readAll(id, 'events'), store.readAll(id, 'windows'), store.readAll(id, 'annotations')]);
  let chunks = 0, verified = 0, samples = 0, orderViolations = 0, lastIndex = -Infinity;
  const mismatches = [];
  for await (const chunk of store.readChunks(id)) {
    chunks++;
    if (chunkHash(chunk) === chunk.sha256) verified++;
    else mismatches.push(chunk.seq);
    if (chunk.first_index <= lastIndex) orderViolations++;
    lastIndex = chunk.last_index;
    samples += chunk.count;
  }
  const checks = [
    { label: 'Stored chunks match their SHA-256', ok: !mismatches.length, detail: mismatches.length ? `${mismatches.length} of ${chunks} differ (chunks ${mismatches.slice(0, 5).join(', ')})` : `${verified} of ${chunks}` },
    { label: 'Sample indices increase', ok: !orderViolations, detail: orderViolations ? `${orderViolations} violation(s)` : `${samples.toLocaleString('en-GB')} samples` },
    { label: 'Saved sample count matches the session record', ok: session.counts ? session.counts.samples === samples : null, detail: session.counts ? `${session.counts.samples.toLocaleString('en-GB')} recorded` : 'no count recorded' },
  ];
  return {
    origin: 'browser',
    editable: session.status !== 'recording',
    id: session.id,
    app: session.app,
    app_version: session.app_version,
    analysis_plan: session.analysis_plan,
    status: session.status,
    close_reason: session.close_reason ?? null,
    created_utc: session.created_utc,
    closed_utc: session.closed_utc ?? null,
    source: session.source ?? { kind: 'unknown' },
    simulated: session.source?.kind === 'simulated',
    montage: session.montage,
    channel_names: session.channel_names ?? [],
    setup: session.setup ?? {},
    placement_notes: session.setup?.placement_notes,
    hypothesis: session.setup?.hypothesis,
    segments: session.segments ?? [],
    health: session.health ?? {},
    sample_count: samples,
    protocols: session.protocols ?? [],
    blocks: session.blocks ?? [],
    events,
    windows,
    annotations,
    counts: session.counts ?? null,
    recorded_results: null,
    processing: null,
    persistence: session.persistence ?? null,
    integrity: { ok: checks.every((c) => c.ok !== false), checks },
    files: null,
  };
}

/** Exported bundle (.zip from this lab). Each file is checked against manifest.json. */
export async function loadFromBundle(bytes) {
  const byName = new Map(Object.entries(readZip(bytes)).map(([name, data]) => [name.split('/').pop(), { name, data }]));
  const manifestEntry = byName.get('manifest.json');
  if (!manifestEntry) throw new Error('Not a Thermodrift bundle: manifest.json missing.');
  const manifest = JSON.parse(decoder.decode(manifestEntry.data));
  const checks = [];
  const files = [];
  for (const f of manifest.files ?? []) {
    const entry = byName.get(f.name);
    if (!entry) { checks.push({ label: `${f.name} present`, ok: false, detail: 'missing from the zip' }); continue; }
    const hash = await sha256(entry.data);
    files.push({ name: f.name, bytes: entry.data.length, sha256: hash });
    checks.push({ label: `${f.name} matches manifest SHA-256`, ok: hash === f.sha256 && entry.data.length === f.bytes, detail: `${(entry.data.length / 1e6).toFixed(2)} MB` });
  }
  checks.push({ label: 'Integrity at export', ok: manifest.integrity?.ok ?? null, detail: manifest.integrity ? `${manifest.integrity.stored_chunks_verified}/${manifest.integrity.chunks} chunks verified, ${manifest.integrity.unsaved_samples} unsaved samples` : 'not recorded' });
  const meta = JSON.parse(decoder.decode(byName.get('metadata.json').data));
  const windows = parseWindowsCsv(decoder.decode(byName.get('windows.csv').data), meta.channel_names);
  const view = viewFromMetadata(meta, { origin: 'bundle', windows, checks, files });
  view.manifest = manifest;
  view.simulated ||= manifest.source_kind === 'simulated';
  return view;
}

/**
 * Berger Lab v3 export (three loose files). `files`: [{name, bytes}] — the windows CSV and the
 * metadata JSON are required; the raw CSV, if given, is hashed and counted but not parsed.
 */
export async function loadLegacyFiles(files) {
  const find = (suffix) => files.find((f) => f.name.endsWith(suffix));
  const metaFile = find('-metadata.json'), windowsFile = find('-windows.csv'), rawFile = find('-raw.csv');
  if (!metaFile || !windowsFile) throw new Error('Choose the …-metadata.json and …-windows.csv files of one export (the …-raw.csv is optional).');
  const meta = JSON.parse(decoder.decode(metaFile.bytes));
  const windows = parseWindowsCsv(decoder.decode(windowsFile.bytes), meta.channel_names);
  const checks = [];
  const listed = [];
  for (const f of [rawFile, windowsFile, metaFile].filter(Boolean)) listed.push({ name: f.name, bytes: f.bytes.length, sha256: await sha256(f.bytes) });
  if (rawFile) {
    let lines = 0;
    for (const b of rawFile.bytes) if (b === 10) lines++;
    checks.push({ label: 'Raw rows match the recorded sample count', ok: meta.sample_count ? lines - 1 === meta.sample_count : null, detail: `${(lines - 1).toLocaleString('en-GB')} rows` });
  } else checks.push({ label: 'Raw CSV', ok: null, detail: 'not opened (optional)' });
  checks.push({ label: 'Windows file parsed', ok: windows.length > 0, detail: `${windows.length} windows` });
  return viewFromMetadata(meta, { origin: 'legacy-v3', windows, checks, files: listed });
}

/**
 * Post-hoc annotation for a finished session stored in this browser: appended as an annotation
 * and an event with the next sequence numbers. Raw rows and prompted labels never change.
 */
export async function appendReviewAnnotation(store, id, annotation) {
  const session = await store.getSession(id);
  if (!session) throw new Error(`No session ${id}`);
  if (session.status === 'recording') throw new Error('This session is still recording in another tab.');
  const [annotations, events] = await Promise.all([store.readAll(id, 'annotations'), store.readAll(id, 'events')]);
  const nextSeq = (items) => items.reduce((m, x) => Math.max(m, x.seq), -1) + 1;
  const utc = new Date().toISOString();
  const stored = { seq: nextSeq(annotations), utc, actor: 'operator (review)', ...annotation };
  const event = { seq: nextSeq(events), label: `${annotation.kind}_annotation`, utc, index: null, arrival_ms: null, after_session: true, protocol_id: annotation.protocol_id, block_id: annotation.block_id, value: annotation.value };
  const counts = { ...(session.counts ?? {}), annotations: stored.seq + 1, events: event.seq + 1 };
  await store.writeBatch(id, { annotations: [stored], events: [event], session: { counts, last_review_utc: utc } });
  return stored;
}
