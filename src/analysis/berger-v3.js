/**
 * Berger analysis plan v3 ("filtered primary"), extracted from Berger-Lab-3.0.1-filtered without
 * changing its arithmetic or its gating rules.
 *
 * Primary metric: per block, the median absolute 8–13 Hz Welch power of accepted windows after a
 * fixed causal 0.5–45 Hz Butterworth band-pass plus 50/100/150/200 Hz notches; then closed/open
 * within each prompted pair; descriptive median of the paired ratios. Unit: count-equivalent²
 * (ADC counts are not calibrated microvolts). Raw-signal Welch alpha is a secondary check.
 *
 * Window selection (live, unchanged from v3): every ≥500 ms of arrival time, once 2048 valid
 * contiguous samples exist, a window is emitted if ≥2048 samples have arrived since the previous
 * one (non-overlapping; start positions depend on BLE arrival cadence and are stored with each
 * window). A window counts for a block only if it lies inside the block and starts ≥3 s after
 * the browser reported the end of the spoken cue (no end report → no accepted windows).
 * Windows are rejected for raw clipping/flatness, for starting within 10 s of a filter restart,
 * or for a raw near-rail sample within the preceding 10 s or inside the window.
 *
 * Plan history: v2 used raw Welch alpha as primary. Results from different plans are not pooled
 * without re-analysis.
 */
import { SosCascade } from '../core/biquad.js';
import { chainSpec, describeChain, COUNT_RESTORE } from '../core/filters.js';
import { assessRawWindow, windowMetrics, isNearRail, REASONS } from '../core/quality.js';
import { median } from '../core/stats.js';

export const BERGER_V3 = Object.freeze({
  plan_id: 'berger-v3-filtered-primary',
  recorded_app_version: 'Berger-Lab-3.0.1-filtered',
  fs_nominal: 500,
  window_samples: 2048,
  psd_cadence_ms: 500,
  transition_exclusion_s: 3,
  filter_warmup_and_rail_guard_s: 10,
  welch: '2048-sample windows, three 1024-point symmetric-Hann segments, 50% overlap, per-segment mean removal, density scaling',
  bands_half_open_hz: { delta: [0.5, 4], theta: [4, 8], alpha: [8, 13], beta: [13, 30], gamma: [30, 45] },
  units: 'count-equivalent squared, not calibrated microvolts',
  primary_metric: 'median absolute 8–13 Hz power after fixed causal 0.5–45 Hz filter and 50/100/150/200 Hz notches; closed/open within confirmed-adherence pairs; raw alpha is secondary',
  eligibility: 'both blocks complete, both adherence = as_instructed, ≥2 accepted windows each, open alpha > 0',
});

/** Analysis filter description as stored in exports (v3 field names). */
export function analysisFilterDescription() {
  const description = describeChain('eeg', { notch50: true, harmonics: true });
  description.output_units = 'filter output is multiplied by 2048 to restore count-equivalent scale';
  return description;
}

export function createAnalysisFilter() {
  return new SosCascade({ ...chainSpec('eeg', { notch50: true, harmonics: true }), outputGain: COUNT_RESTORE });
}

/**
 * Live window engine. One instance per acquisition pipeline.
 * mode 'single' and 'direct' analyse channel 1; 'shared' analyses channels 1 and 2 and, when
 * `derived` is set, the software difference channel 2 − channel 1.
 */
export class BergerV3WindowEngine {
  constructor({ mode = 'single', derived = false } = {}) {
    this.mode = mode;
    this.derived = mode === 'shared' && derived;
    this.W = BERGER_V3.window_samples;
    this.guardSamples = BERGER_V3.filter_warmup_and_rail_guard_s * BERGER_V3.fs_nominal;
    this.reset();
  }

  get requiredChannels() {
    return this.mode === 'shared' ? 2 : 1;
  }

  /** v3 clearRings(): drop all analysis state. Call at acquisition start, gaps, duplicates and invalid samples. */
  reset() {
    this.rings = [[], [], []];
    this.rowRing = [];
    this.analysisRings = [[], [], []];
    this.analysisFilters = [0, 1, 2].map(() => createAnalysisFilter());
    this.latest = [null, null, null];
    this.filteredLatest = [null, null, null];
    this.filterStartIndex = null;
    this.lastRailIndex = [-Infinity, -Infinity, -Infinity];
    this.lastPSD = -Infinity;
    this.lastWindowIndex = -1;
    this.lastIndex = -1;
  }

  /**
   * Push one valid, contiguous row. `row.channels` are raw ADC counts.
   * @param {{index:number, arrival_ms:number, channels:number[], phase:string, protocol_id:number, block_id:number}} row
   */
  pushRow(row) {
    const { index, channels } = row;
    if (this.filterStartIndex === null) this.filterStartIndex = index;
    this.lastIndex = index;
    const shared = this.mode === 'shared';
    const values = [channels[0], shared ? channels[1] : null, this.derived ? channels[1] - channels[0] : null];
    this.rings[0].push(channels[0]);
    if (shared) this.rings[1].push(channels[1]);
    if (this.derived) this.rings[2].push(channels[1] - channels[0]);
    for (let ch = 0; ch < 3; ch++) {
      if (values[ch] === null) continue;
      const nearRail = ch === 2 ? isNearRail(channels[0]) || isNearRail(channels[1]) : isNearRail(values[ch]);
      if (nearRail) this.lastRailIndex[ch] = index;
      this.analysisRings[ch].push(this.analysisFilters[ch].process(values[ch]));
      if (this.analysisRings[ch].length > this.W) this.analysisRings[ch].shift();
    }
    for (const ring of this.rings) if (ring.length > this.W) ring.shift();
    this.rowRing.push({ index, arrival_ms: row.arrival_ms, phase: row.phase });
    if (this.rowRing.length > this.W) this.rowRing.shift();
  }

  /**
   * Run after each notification (v3 cadence). Returns null when nothing was computed.
   * @param {number} nowMs session-relative arrival time of the notification
   * @param {null|{id:number, label:string, protocol_id:number, start_arrival_ms:number, speech_requested?:boolean, speech_start_arrival_ms?:number, speech_end_arrival_ms?:number}} block
   *   the protocol block current at this moment, or null when no protocol runs
   */
  compute(nowMs, block) {
    const W = this.W;
    if (!(nowMs - this.lastPSD >= BERGER_V3.psd_cadence_ms && this.rings[0].length === W)) return null;
    this.lastPSD = nowMs;
    const latest = [null, null, null];
    latest[0] = assessRawWindow(this.rings[0]);
    latest[1] = this.mode === 'shared' && this.rings[1].length === W ? assessRawWindow(this.rings[1]) : null;
    latest[2] = this.derived && this.rings[2].length === W && latest[1] ? assessRawWindow(this.rings[2], [latest[0], latest[1]]) : null;
    const filtered = [0, 1, 2].map((ch) => (latest[ch] && this.analysisRings[ch].length === W ? windowMetrics(this.analysisRings[ch]) : null));
    this.latest = latest;
    this.filteredLatest = filtered;
    const windows = [];
    if (this.lastIndex - this.lastWindowIndex >= W) {
      this.lastWindowIndex = this.lastIndex;
      const current = block ? block.label : 'idle';
      const first = this.rowRing.length >= W ? this.rowRing[this.rowRing.length - W] : null;
      const contained = !!first && first.phase === current;
      for (let ch = 0; ch < 3; ch++) {
        const m = latest[ch];
        if (!m) continue;
        const ref = block ? Math.max(block.start_arrival_ms, block.speech_end_arrival_ms ?? block.speech_start_arrival_ms ?? block.start_arrival_ms) : 0;
        const cueFinished = !block?.speech_requested || Number.isFinite(block.speech_end_arrival_ms);
        const accepted = !!(block && cueFinished && contained && first.arrival_ms >= ref + BERGER_V3.transition_exclusion_s * 1000);
        const reasons = m.reasons.slice();
        if (first && first.index < this.filterStartIndex + this.guardSamples) reasons.push(REASONS.filterStart);
        if (first && this.lastRailIndex[ch] >= first.index - this.guardSamples) reasons.push(REASONS.recentRail);
        windows.push({
          index: this.lastIndex,
          start_index: first?.index,
          arrival_ms: nowMs,
          phase: current,
          protocol_id: block ? block.protocol_id : 0,
          block_id: block ? block.id : 0,
          accepted_for_block: accepted,
          channel: ch,
          rms: m.rms,
          range: m.range,
          rail: m.rail,
          line: m.line,
          line150: m.line150,
          hf: m.hf,
          bp: m.bp,
          filtered_alpha: filtered[ch]?.bp.alpha ?? null,
          relative_alpha: m.relative.alpha,
          reasons,
          warnings: m.warnings,
        });
      }
    }
    return { latest, filtered, windows };
  }
}

/**
 * Block summary for one channel (v3 blockSummary). `windows` = all stored windows of the session.
 * @param {object} block
 * @param {object[]} windows
 * @param {number} channel
 * @param {string} adherence effective adherence ('unconfirmed' | 'as_instructed' | 'exclude')
 */
export function blockSummary(block, windows, channel, adherence = block.adherence ?? 'unconfirmed') {
  const all = windows.filter((w) => w.block_id === block.id && w.accepted_for_block && w.channel === channel);
  const good = all.filter((w) => !w.reasons.length);
  return {
    label: block.label,
    protocol_id: block.protocol_id,
    block_id: block.id,
    complete: !!block.complete,
    adherence,
    deviations: block.deviations ?? [],
    timer_lateness_s: block.timer_lateness_s,
    start_index: block.start_index,
    end_index: block.end_index,
    start_arrival_ms: block.start_arrival_ms,
    end_arrival_ms: block.end_arrival_ms,
    speech_start_arrival_ms: block.speech_start_arrival_ms,
    speech_end_arrival_ms: block.speech_end_arrival_ms,
    valid: good.length,
    rejected: all.length - good.length,
    alpha: median(good.map((w) => w.filtered_alpha).filter(Number.isFinite)),
    raw_alpha_secondary: median(good.map((w) => w.bp.alpha)),
    relative_alpha_secondary: median(good.map((w) => w.relative_alpha)),
  };
}

/**
 * Paired results for one eye protocol and channel.
 * @param {{blocks:object[], windows:object[], protocolId:number, channel?:number, adherenceOf:(block)=>string}} input
 */
export function pairedResults({ blocks, windows, protocolId, channel = 0, adherenceOf = (b) => b.adherence ?? 'unconfirmed' }) {
  const pairs = [];
  for (let p = 1; p <= 4; p++) {
    const ob = blocks.find((b) => b.protocol_id === protocolId && b.label === `eyes_open_pair${p}`);
    const cb = blocks.find((b) => b.protocol_id === protocolId && b.label === `eyes_closed_pair${p}`);
    const open = ob ? blockSummary(ob, windows, channel, adherenceOf(ob)) : null;
    const closed = cb ? blockSummary(cb, windows, channel, adherenceOf(cb)) : null;
    const followed = open?.adherence === 'as_instructed' && closed?.adherence === 'as_instructed';
    const excluded = open?.adherence === 'exclude' || closed?.adherence === 'exclude';
    const eligible = !!(followed && open.complete && closed.complete && open.valid >= 2 && closed.valid >= 2 && open.alpha > 0);
    const status = excluded ? 'excluded' : eligible ? 'eligible' : followed ? 'inconclusive' : 'review_adherence';
    pairs.push({ pair: p, open, closed, status, ratio: eligible ? closed.alpha / open.alpha : null, raw_ratio_secondary: eligible ? closed.raw_alpha_secondary / open.raw_alpha_secondary : null });
  }
  const eligible = pairs.filter((p) => p.status === 'eligible');
  return {
    plan_id: BERGER_V3.plan_id,
    protocol_id: protocolId,
    channel,
    pairs,
    eligible_count: eligible.length,
    higher_closed_count: eligible.filter((p) => p.ratio > 1).length,
    median_ratio: median(eligible.map((p) => p.ratio)),
  };
}
