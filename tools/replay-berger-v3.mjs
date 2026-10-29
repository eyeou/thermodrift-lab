#!/usr/bin/env node
/**
 * Replay a Berger Lab v3 export (raw CSV + windows CSV + metadata JSON) through this repository's
 * analysis core and compare with what the live app saved.
 *
 *   node tools/replay-berger-v3.mjs --source <dir> --stem <export stem> [--expect-median <value>]
 *                                    [--confirm-adherence] [--json out.json]
 *
 * Checks
 *   A. Files are read-only: SHA-256 before == after.
 *   B. Recorded analysis coefficients equal this plan's coefficients.
 *   C. Continuity: contiguous sample indices, counters advance by 1 mod 256, one acquisition.
 *   D. Saved windows: every metric recomputed at the saved positions (raw and filtered) — exact match.
 *   E. Live re-derivation: the recorded notification stream (rows grouped by arrival time) is fed
 *      to the live window engine; emitted windows (positions, acceptance, flags, values) are
 *      compared with the saved ones. Arrival times in the raw CSV are rounded to 1 µs, so a tick
 *      that fell exactly on the 500 ms cadence boundary could resolve differently; any mismatch is
 *      reported, not hidden.
 *   F. Block summaries and paired ratios from the saved windows.
 *
 * Real recordings are private. This tool reads them from a path you pass; it never copies them.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { BergerV3WindowEngine, BERGER_V3, analysisFilterDescription, createAnalysisFilter, pairedResults } from '../src/analysis/berger-v3.js';
import { assessRawWindow, windowMetrics } from '../src/core/quality.js';
import { parseCsv } from '../src/session/csv.js';

const args = process.argv.slice(2);
const arg = (name, fallback = undefined) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);
const source = arg('source');
const stem = arg('stem');
if (!source || !stem) {
  console.error('Usage: replay-berger-v3.mjs --source <dir> --stem <stem> [--expect-median N] [--confirm-adherence] [--json out]');
  process.exit(2);
}

const paths = { raw: join(source, `${stem}-raw.csv`), windows: join(source, `${stem}-windows.csv`), metadata: join(source, `${stem}-metadata.json`) };
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const hashesBefore = Object.fromEntries(Object.entries(paths).map(([k, p]) => [k, sha(p)]));
const report = { source_sha256: hashesBefore, checks: {}, failures: [] };
const fail = (check, message) => report.failures.push(`${check}: ${message}`);

const meta = JSON.parse(readFileSync(paths.metadata, 'utf8'));
const rawTable = parseCsv(readFileSync(paths.raw, 'utf8'));
const winTable = parseCsv(readFileSync(paths.windows, 'utf8'));

// ---------- B. coefficients ----------
{
  const recorded = meta.analysis_processing?.filter;
  const ours = analysisFilterDescription();
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const ok = recorded && same(recorded.sos, ours.sos) && same(recorded.notch_sos, ours.notch_sos) && same(recorded.harmonic_notch_sos, ours.harmonic_notch_sos);
  report.checks.coefficients = ok ? 'identical to recorded analysis filter' : 'MISMATCH';
  if (!ok) fail('B', 'recorded coefficients differ from plan coefficients');
}

// ---------- C. continuity ----------
const H = rawTable.header;
const col = (name) => H.indexOf(name);
const iIndex = col('sample_index'), iArrival = col('arrival_ms'), iCounter = col('counter'), iPhase = col('phase'), iProtocol = col('protocol_id'), iBlock = col('block_id'), iCh1 = col('ch1_adc'), iCh2 = col('ch2_adc');
const rows = rawTable.rows.map((r) => ({
  index: Number(r[iIndex]),
  arrivalText: r[iArrival],
  arrival_ms: Number(r[iArrival]),
  counter: Number(r[iCounter]),
  phase: r[iPhase],
  protocol_id: Number(r[iProtocol]),
  block_id: Number(r[iBlock]),
  ch1: Number(r[iCh1]),
  ch2: iCh2 >= 0 && r[iCh2] !== '' ? Number(r[iCh2]) : null,
}));
{
  let ok = rows.length === meta.sample_count && rows[0].index === 0;
  for (let i = 1; i < rows.length && ok; i++) {
    if (rows[i].index !== rows[i - 1].index + 1) ok = false;
    if ((rows[i].counter - rows[i - 1].counter + 256) % 256 !== 1) ok = false;
    if (rows[i].arrival_ms < rows[i - 1].arrival_ms) ok = false;
  }
  const starts = meta.events.filter((e) => e.label === 'acquisition_start').length;
  if (starts !== 1) ok = false;
  report.checks.continuity = ok ? `${rows.length} samples, contiguous indices and counters, one acquisition` : 'FAILED (this tool handles one continuous acquisition only)';
  if (!ok) fail('C', 'not a single continuous acquisition; refusing to filter across a restart');
}
if (meta.mode !== 'single') fail('C', `mode ${meta.mode} not handled by this replay (single only)`);

// Filter the whole continuous recording once (filter starts at the first valid sample).
const x = rows.map((r) => r.ch1);
const filter = createAnalysisFilter();
const y = x.map((v) => filter.process(v));

// ---------- D. saved windows at saved positions ----------
const W = BERGER_V3.window_samples;
const WH = winTable.header;
const wcol = (name) => WH.indexOf(name);
const saved = winTable.rows.map((r) => ({
  index: Number(r[wcol('sample_index')]),
  start_index: Number(r[wcol('window_start_index')]),
  arrival_ms: Number(r[wcol('arrival_ms')]),
  phase: r[wcol('phase')],
  protocol_id: Number(r[wcol('protocol_id')]),
  block_id: Number(r[wcol('block_id')]),
  accepted_for_block: r[wcol('accepted_for_block_before_quality')] === 'true',
  values: Object.fromEntries(['rms', 'range', 'rail_fraction', 'line_50_fraction_0_5_100', 'line_150_fraction_0_5_250', 'hf_fraction', 'relative_alpha_secondary_0_5_45', 'delta', 'theta', 'alpha', 'beta', 'gamma', 'alpha_filtered_8_13_counts2'].map((k) => [k, Number(r[wcol(k)])])),
  reasons: r[wcol('reject_flags')] ? r[wcol('reject_flags')].split(';') : [],
  warnings: r[wcol('warnings')] ? r[wcol('warnings')].split(';') : [],
}));
const toExportValues = (m, filtered) => ({
  rms: m.rms, range: m.range, rail_fraction: m.rail, line_50_fraction_0_5_100: m.line, line_150_fraction_0_5_250: m.line150, hf_fraction: m.hf,
  relative_alpha_secondary_0_5_45: m.relative.alpha, delta: m.bp.delta, theta: m.bp.theta, alpha: m.bp.alpha, beta: m.bp.beta, gamma: m.bp.gamma,
  alpha_filtered_8_13_counts2: filtered.bp.alpha,
});
{
  let exact = 0, maxRel = 0, worst = null;
  for (const w of saved) {
    if (w.index - w.start_index + 1 !== W) fail('D', `window ${w.index} is not ${W} samples`);
    const m = assessRawWindow(x.slice(w.start_index, w.index + 1));
    const f = windowMetrics(y.slice(w.start_index, w.index + 1));
    const ours = toExportValues(m, f);
    let allExact = true;
    for (const [k, v] of Object.entries(w.values)) {
      if (ours[k] !== v) {
        allExact = false;
        const rel = Math.abs(ours[k] - v) / Math.max(Math.abs(v), 1e-300);
        if (rel > maxRel) { maxRel = rel; worst = { window: w.index, field: k, saved: v, recomputed: ours[k] }; }
      }
    }
    if (JSON.stringify(m.warnings) !== JSON.stringify(w.warnings)) fail('D', `warnings differ at window ${w.index}`);
    if (allExact) exact++;
  }
  report.checks.saved_windows = { windows: saved.length, bit_exact: exact, max_relative_difference: maxRel, worst };
  if (maxRel > 1e-9) fail('D', `recomputed values differ (max relative ${maxRel})`);
}

// ---------- E. live re-derivation ----------
{
  const speechRequested = new Set(meta.events.filter((e) => e.label === 'speech_requested' && e.block_id).map((e) => e.block_id));
  const blocks = new Map(meta.blocks.filter((b) => b.channel === meta.channel_names[0]).map((b) => [b.block_id, b]));
  const engine = new BergerV3WindowEngine({ mode: 'single' });
  const emitted = [];
  let ambiguousTicks = 0;
  let i = 0;
  while (i < rows.length) {
    let j = i;
    while (j < rows.length && rows[j].arrivalText === rows[i].arrivalText) j++;
    for (let k = i; k < j; k++) engine.pushRow({ index: rows[k].index, arrival_ms: rows[k].arrival_ms, channels: [rows[k].ch1], phase: rows[k].phase, protocol_id: rows[k].protocol_id, block_id: rows[k].block_id });
    const last = rows[j - 1];
    const now = last.arrival_ms;
    if (Math.abs(now - engine.lastPSD - BERGER_V3.psd_cadence_ms) < 1e-3) ambiguousTicks++;
    let view = null;
    if (last.protocol_id !== 0) {
      const b = blocks.get(last.block_id);
      const ended = Number.isFinite(b.speech_end_arrival_ms) && b.speech_end_arrival_ms <= now;
      const started = Number.isFinite(b.speech_start_arrival_ms) && b.speech_start_arrival_ms <= now;
      view = { id: b.block_id, label: b.label, protocol_id: b.protocol_id, start_arrival_ms: b.start_arrival_ms, speech_requested: speechRequested.has(b.block_id), speech_start_arrival_ms: started ? b.speech_start_arrival_ms : undefined, speech_end_arrival_ms: ended ? b.speech_end_arrival_ms : undefined };
    }
    const out = engine.compute(now, view);
    if (out) emitted.push(...out.windows);
    i = j;
  }
  let positions = 0, acceptance = 0, flags = 0, values = 0;
  const byIndex = new Map(emitted.map((w) => [w.index, w]));
  for (const s of saved) {
    const e = byIndex.get(s.index);
    if (!e || e.start_index !== s.start_index) continue;
    positions++;
    if (e.accepted_for_block === s.accepted_for_block && e.block_id === s.block_id && e.phase === s.phase) acceptance++;
    if (JSON.stringify(e.reasons) === JSON.stringify(s.reasons) && JSON.stringify(e.warnings) === JSON.stringify(s.warnings)) flags++;
    if (e.bp.alpha === s.values.alpha && e.filtered_alpha === s.values.alpha_filtered_8_13_counts2) values++;
  }
  report.checks.live_rederivation = { saved: saved.length, emitted: emitted.length, same_positions: positions, same_acceptance: acceptance, same_flags: flags, same_alpha_values: values, cadence_boundary_ticks: ambiguousTicks };
  if (positions !== saved.length || emitted.length !== saved.length) fail('E', 'live re-derivation did not reproduce every saved window position');
}

// ---------- F. block summaries and pairs ----------
{
  const windows = saved.map((w) => ({ block_id: w.block_id, accepted_for_block: w.accepted_for_block, channel: 0, reasons: w.reasons, filtered_alpha: w.values.alpha_filtered_8_13_counts2, bp: { alpha: w.values.alpha }, relative_alpha: w.values.relative_alpha_secondary_0_5_45 }));
  const blocks = meta.blocks.filter((b) => b.channel === meta.channel_names[0]).map((b) => ({ ...b, id: b.block_id }));
  const confirm = flag('confirm-adherence');
  const result = pairedResults({ blocks, windows, protocolId: meta.protocols.find((p) => p.name === 'berger')?.id ?? 1, adherenceOf: (b) => (confirm && b.label.startsWith('eyes_') ? 'as_instructed' : b.adherence) });
  let summaryMismatch = 0;
  for (const b of blocks) {
    const ours = result.pairs.flatMap((p) => [p.open, p.closed]).find((s) => s && s.block_id === b.id);
    if (ours && (ours.valid !== b.valid || ours.rejected !== b.rejected || ours.alpha !== b.alpha)) summaryMismatch++;
  }
  report.checks.pairs = {
    adherence_basis: confirm ? 'eye blocks treated as confirmed (participant confirmation after export; recorded export adherence = unconfirmed)' : 'as recorded in export',
    block_summary_mismatches: summaryMismatch,
    pairs: result.pairs.map((p) => ({ pair: p.pair, open_alpha: p.open?.alpha, closed_alpha: p.closed?.alpha, ratio: p.ratio, raw_ratio_secondary: p.raw_ratio_secondary, windows: [p.open?.valid, p.closed?.valid], status: p.status })),
    eligible: result.eligible_count,
    higher_closed: result.higher_closed_count,
    median_ratio: result.median_ratio,
  };
  if (summaryMismatch) fail('F', `${summaryMismatch} block summaries differ from the export`);
  const expect = arg('expect-median');
  if (expect !== undefined) {
    const ok = result.median_ratio !== null && Math.abs(result.median_ratio - Number(expect)) <= 1e-9 * Number(expect);
    report.checks.expected_median = { expected: Number(expect), ok };
    if (!ok) fail('F', `median ${result.median_ratio} != expected ${expect}`);
  }
}

// ---------- A. read-only ----------
const hashesAfter = Object.fromEntries(Object.entries(paths).map(([k, p]) => [k, sha(p)]));
report.checks.read_only = JSON.stringify(hashesAfter) === JSON.stringify(hashesBefore) ? 'source files unchanged' : 'CHANGED';
if (report.checks.read_only !== 'source files unchanged') fail('A', 'source files changed during replay');

report.result = report.failures.length ? 'FAIL' : 'PASS';
const outPath = arg('json');
if (outPath) {
  const { writeFileSync } = await import('node:fs');
  writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report, null, 2));
process.exit(report.failures.length ? 1 : 0);
