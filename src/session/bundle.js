/**
 * Session bundle export: one stored zip containing
 *   raw.csv        every received sample (v3 columns), prompted labels as captured
 *   windows.csv    every analysis window (v3 columns)
 *   metadata.json  setup, montage, source, events, protocols, block summaries, annotations,
 *                  analysis/display processing with coefficients, limitations (v3 superset)
 *   manifest.json  file sizes and SHA-256, integrity checks, export status
 * raw.csv is produced in two streaming passes over the stored chunks (hash/CRC, then write), so
 * memory does not grow with session length. Unknown values stay "unknown"; nothing is inferred.
 */
import { Crc32, ZipWriter } from './zip.js';
import { Sha256, sha256Hex } from './sha256.js';
import { chunkHash, chunkRows, SESSION_SCHEMA } from './recorder.js';
import { csvLine } from './csv.js';

export const RAW_HEADER_BASE = ['sample_index', 'nominal_seconds_500hz', 'arrival_ms', 'counter', 'phase', 'protocol_id', 'block_id'];
export const WINDOW_HEADER = ['sample_index', 'window_start_index', 'arrival_ms', 'phase', 'protocol_id', 'block_id', 'accepted_for_block_before_quality', 'channel', 'rms', 'range', 'rail_fraction', 'line_50_fraction_0_5_100', 'line_150_fraction_0_5_250', 'hf_fraction', 'relative_alpha_secondary_0_5_45', 'delta', 'theta', 'alpha', 'beta', 'gamma', 'alpha_filtered_8_13_counts2', 'reject_flags', 'warnings'];

const encoder = new TextEncoder();

/** All chunks: stored ones (verified) then the in-memory pending chunk, if any. */
async function* allChunks(store, sessionId, pendingChunk, maxSeq = Infinity) {
  for await (const chunk of store.readChunks(sessionId)) {
    if (chunk.seq > maxSeq) break;
    yield { chunk, stored: true };
  }
  if (pendingChunk) yield { chunk: pendingChunk, stored: false };
}

function rawLines(chunk, channelCount, derived) {
  const lines = [];
  for (const r of chunkRows(chunk)) {
    const channels = Array.from({ length: channelCount }, (_, i) => r.channels[i] ?? '');
    const extra = derived ? [r.channels.length >= 2 ? r.channels[1] - r.channels[0] : ''] : [];
    lines.push(csvLine([r.index, r.index / 500, r.arrival_ms.toFixed(3), r.counter, r.phase, r.protocol_id, r.block_id, ...channels, ...extra]));
  }
  return lines;
}

/**
 * @param {{store:object, sessionId:string, recorder?:object, describe:(ctx)=>object, windowChannelLabel:(ch:number)=>string, sink:(bytes:Uint8Array)=>Promise<void>|void, exportInfo?:object}} options
 * `describe(ctx)` returns the app-specific metadata (block summaries, analysis description...).
 */
export async function exportSessionBundle({ store, sessionId, recorder = null, describe, windowChannelLabel, sink, exportInfo = {} }) {
  while (recorder?.inFlight) await recorder.inFlight.catch(() => {});
  // Synchronous snapshot: stored chunks 0..maxSeq plus the rows still in memory. A flush that
  // starts after this point writes chunk maxSeq+1, which both passes ignore: no loss, no duplicate.
  const maxSeq = recorder ? recorder.chunkSeq - 1 : Infinity;
  const pendingChunk = recorder?.pendingChunk() ?? null;
  const pendingItems = recorder ? structuredClone(recorder.pendingItems()) : { events: [], windows: [], annotations: [] };
  const session = await store.getSession(sessionId);
  if (!session) throw new Error(`Unknown session ${sessionId}`);
  const merge = async (table) => {
    const bySeq = new Map();
    for (const item of [...(await store.readAll(sessionId, table)), ...pendingItems[table]]) bySeq.set(item.seq, item);
    return [...bySeq.values()].sort((a, b) => a.seq - b.seq);
  };
  const events = await merge('events');
  const windows = await merge('windows');
  const annotations = await merge('annotations');
  const sessionView = recorder ? { ...session, ...recorder.session, protocols: recorder.protocolSnapshot.protocols, blocks: recorder.protocolSnapshot.blocks } : session;
  const channelCount = sessionView.channel_count ?? 0;
  const derived = !!sessionView.derived_enabled;
  const header = [...RAW_HEADER_BASE, ...Array.from({ length: channelCount }, (_, i) => `ch${i + 1}_adc`), ...(derived ? ['derived_ch2_minus_ch1_counts'] : [])];
  const headerBytes = encoder.encode(header.join(',') + '\n');

  // Pass 1: integrity, size, CRC and SHA-256 of raw.csv.
  const integrity = { chunks: 0, stored_chunks_verified: 0, hash_mismatches: [], index_order_violations: 0, samples: 0, unsaved_samples: 0 };
  const crc = new Crc32().update(headerBytes);
  const sha = new Sha256().update(headerBytes);
  let size = headerBytes.length;
  let lastIndex = -Infinity;
  for await (const { chunk, stored } of allChunks(store, sessionId, pendingChunk, maxSeq)) {
    integrity.chunks++;
    if (stored) {
      if (chunkHash(chunk) === chunk.sha256) integrity.stored_chunks_verified++;
      else integrity.hash_mismatches.push(chunk.seq);
    } else integrity.unsaved_samples += chunk.count;
    if (chunk.first_index <= lastIndex) integrity.index_order_violations++;
    lastIndex = chunk.last_index;
    integrity.samples += chunk.count;
    const bytes = encoder.encode(rawLines(chunk, channelCount, derived).map((l) => l + '\n').join(''));
    crc.update(bytes);
    sha.update(bytes);
    size += bytes.length;
  }
  const rawInfo = { size, crc: crc.value(), sha256: sha.hex() };

  const windowsCsv = encoder.encode([WINDOW_HEADER.join(','), ...windows.map((w) => csvLine([w.index, w.start_index, w.arrival_ms, w.phase, w.protocol_id, w.block_id, w.accepted_for_block, windowChannelLabel(w.channel), w.rms, w.range, w.rail, w.line, w.line150, w.hf, w.relative_alpha, w.bp.delta, w.bp.theta, w.bp.alpha, w.bp.beta, w.bp.gamma, w.filtered_alpha, w.reasons.join(';'), w.warnings.join(';')]))].join('\n'));

  const utcExport = new Date().toISOString();
  const metadata = {
    schema: SESSION_SCHEMA,
    session_id: session.id,
    utc_export: utcExport,
    ...describe({ session: sessionView, events, windows, annotations, sampleCount: integrity.samples }),
    events,
    annotations,
    segments: sessionView.segments ?? [],
    integrity,
  };
  const metadataBytes = encoder.encode(JSON.stringify(metadata, null, 2) + '\n');

  const stem = `${session.source?.kind === 'simulated' ? 'SIMULATED-' : ''}${session.app}-${session.id}`;
  const files = [
    { name: `${stem}/raw.csv`, bytes: null, info: rawInfo },
    { name: `${stem}/windows.csv`, bytes: windowsCsv },
    { name: `${stem}/metadata.json`, bytes: metadataBytes },
  ];
  const manifest = {
    schema: 'thermodrift.bundle/1',
    session_id: session.id,
    app: session.app,
    app_version: session.app_version,
    analysis_plan: session.analysis_plan,
    source_kind: session.source?.kind ?? 'unknown',
    created_utc: utcExport,
    files: files.map((f) => ({ name: f.name.split('/').pop(), bytes: f.info ? f.info.size : f.bytes.length, sha256: f.info ? f.info.sha256 : sha256Hex(f.bytes) })),
    integrity: { ...integrity, ok: !integrity.hash_mismatches.length && !integrity.index_order_violations },
    export: { status: 'assembled', note: 'Download completion cannot be observed by the page unless written through the file picker.', ...exportInfo },
    units: 'ADC counts (uncalibrated)',
  };
  const manifestBytes = encoder.encode(JSON.stringify(manifest, null, 2) + '\n');

  // Pass 2: write.
  const zip = new ZipWriter(async (bytes) => sink(bytes));
  await zip.addEntry(files[0].name, rawInfo, async (write) => {
    await write(headerBytes);
    // Same snapshot as pass 1: chunks flushed after the export started are not included.
    for await (const { chunk } of allChunks(store, sessionId, pendingChunk, maxSeq)) {
      await write(encoder.encode(rawLines(chunk, channelCount, derived).map((l) => l + '\n').join('')));
    }
  });
  await zip.addBytes(files[1].name, windowsCsv);
  await zip.addBytes(files[2].name, metadataBytes);
  await zip.addBytes(`${stem}/manifest.json`, manifestBytes);
  await zip.finish();
  return { stem, filename: `${stem}.zip`, manifest, metadata };
}
