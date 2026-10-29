/**
 * Berger Lab app definition: everything app-specific lives here (montages, protocols, labels,
 * export metadata). Acquisition, storage, DSP, protocol timing and charts come from src/.
 */
import { BERGER_V3, analysisFilterDescription, blockSummary, pairedResults } from '../../src/analysis/berger-v3.js';
import { baselineProtocol, artifactControlsProtocol, bergerLongProtocol, plannedSeconds } from '../../src/protocol/berger-protocol.js';
import { effectiveAdherence } from '../../src/analysis/adherence.js';

export const APP = Object.freeze({ id: 'berger-lab', name: 'Berger Lab', version: '3.2.0', versionLabel: 'Berger-Lab-3.2.0', analysisPlan: BERGER_V3.plan_id });

const RED = '#E5484D', BLACK = '#151515', WHITE = '#F2F2F2', BLUE = '#3E7BFA';

export const MONTAGES = Object.freeze({
  single: {
    id: 'single',
    label: 'One channel · Oz − left ear (validated 29 Oct 2026)',
    requiredChannels: 1,
    derived: false,
    channelNames: ['Oz − left ear'],
    leads: [
      { site: 'Oz', pin: 'A0P', cable: 'red', cableColor: RED, role: '+ input', siteLabel: 'Oz', short: 'Oz' },
      { site: 'M1', pin: 'A0N', cable: 'black', cableColor: BLACK, role: '− input', siteLabel: 'left rear-ear bony site', short: 'L ear' },
      { site: 'M2', pin: 'REF', cable: 'white', cableColor: WHITE, role: 'REF (separate from A0N; board-defined role)', siteLabel: 'right rear-ear bony site', short: 'R ear' },
    ],
    notes: 'CN unused; A0-to-CN link off; other body leads unused.',
    routingCheck: 'A0P–Oz, A0N–left ear, REF–right ear, CN link off, other leads unused.',
  },
  shared: {
    id: 'shared',
    label: 'Two channels · Oz and Fpz against a common negative (separate session)',
    requiredChannels: 2,
    derived: false,
    channelNames: ['Oz − common ear', 'Fpz − common ear', 'Fpz − Oz estimated'],
    leads: [
      { site: 'Oz', pin: 'A0P', cable: 'red', cableColor: RED, role: 'channel 1 +', siteLabel: 'Oz' },
      { site: 'Fpz', pin: 'A1P', cable: 'blue', cableColor: BLUE, role: 'channel 2 +', siteLabel: 'Fpz' },
      { site: 'M1', pin: 'CN', cable: 'black', cableColor: BLACK, role: 'shared −', siteLabel: 'left rear-ear bony site', short: 'L ear' },
      { site: 'M2', pin: 'REF', cable: 'white', cableColor: WHITE, role: 'REF', siteLabel: 'right rear-ear bony site', short: 'R ear' },
    ],
    notes: 'CN switch on (all negatives tied to CN). The estimated Fpz − Oz is a software difference, not a third electrode.',
    routingCheck: 'A0P–Oz, A1P–Fpz, CN–left ear with the CN switch on, REF–right ear.',
  },
  direct: {
    id: 'direct',
    label: 'One channel · Fpz − Oz direct (separate session)',
    requiredChannels: 1,
    derived: false,
    channelNames: ['Fpz − Oz direct'],
    leads: [
      { site: 'Fpz', pin: 'A0P', cable: 'blue', cableColor: BLUE, role: '+ input', siteLabel: 'Fpz' },
      { site: 'Oz', pin: 'A0N', cable: 'red', cableColor: RED, role: '− input', siteLabel: 'Oz' },
      { site: 'M2', pin: 'REF', cable: 'white', cableColor: WHITE, role: 'REF', siteLabel: 'behind an ear', short: 'ear' },
    ],
    notes: 'A0N not tied to CN. Not a vendor-documented montage.',
    routingCheck: 'A0P–Fpz, A0N–Oz (CN link off), REF behind an ear.',
  },
});

export function channelLabel(montage, ch) {
  return montage?.channelNames?.[ch] ?? `Channel ${ch + 1}`;
}

/** Protocol launcher entries. `create(options)` returns a fresh definition. */
export function protocolEntries({ simulated = false, blockSeconds = 60, audioCondition = 'cues_only' } = {}) {
  const berger = bergerLongProtocol({ blockSeconds, audioCondition });
  const entries = [
    { name: 'baseline', index: '01', label: 'Relaxed baseline', detail: '60 s · eyes open · quality check', create: () => baselineProtocol() },
    { name: 'artifact', index: '02', label: 'Blink / jaw controls', detail: '75 s · gentle · inspect afterwards', create: () => artifactControlsProtocol() },
    { name: 'berger', index: '03', label: 'Long Berger test', detail: `${formatDuration(plannedSeconds(berger))} · four open/closed pairs`, create: () => bergerLongProtocol({ blockSeconds, audioCondition }), requireCueCheck: true, requireCleanSignal: true, requireSpeech: !simulated, primary: true },
  ];
  if (simulated) entries.push({ name: 'berger-demo', index: 'D', label: 'Flow demo (simulated only)', detail: `${formatDuration(plannedSeconds(demoProtocol()))} · same labels, short blocks · not an experiment`, create: demoProtocol, requireCleanSignal: true });
  return entries;
}

/** Short version of the Berger sequence for demonstrating the UI with the simulated device. */
export function demoProtocol() {
  const p = bergerLongProtocol({ blockSeconds: 60 });
  const blocks = p.blocks.map((b) => {
    const seconds = b.label.startsWith('eyes_') ? 16 : b.label.startsWith('settling') ? 10 : 6;
    const eyes = b.label.match(/^eyes_(open|closed)_pair(\d)$/);
    const instruction = eyes ? `[Demo] Pair ${eyes[2]} of 4: eyes ${eyes[1]} for ${seconds} s.` : `[Demo] ${b.label.startsWith('settling') ? 'Settling' : 'Recovery'}: eyes open for ${seconds} s.`;
    return { ...b, seconds, spoken: undefined, instruction };
  });
  return { ...p, name: 'berger-demo', version: `${p.version}-demo`, blocks, settings: { ...p.settings, block_seconds: 16, classification: 'demo_simulated_only' } };
}

export function formatDuration(s) {
  return `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`;
}

export const LIMITATIONS = 'One participant at a time; prompted eye states are not measured eye states. ADC counts are not calibrated microvolts. Quality flags are heuristics, not impedance or source separation. Browser cue callbacks are not hearing or millisecond timing. Adjacent same-state blocks are not independent repetitions; results are descriptive, without p-values.';

/**
 * v3-compatible export metadata (superset), from stored data only: usable by the live app and by
 * the report page after a reload.
 */
export function describeBergerSession({ session, events, windows, annotations, sampleCount, acquisitionRunning = false, display = null }) {
  const montage = MONTAGES[session.montage] ?? null;
  const channels = session.montage === 'shared' ? (session.derived_enabled ? 3 : 2) : 1;
  const blocks = session.blocks ?? [];
  const adherence = (b) => effectiveAdherence(b, annotations);
  const eyeProtocols = [...new Set(blocks.filter((b) => b.label.startsWith('eyes_')).map((b) => b.protocol_id))];
  const setup = session.setup ?? {};
  const health = session.health ?? {};
  return {
    version: session.app_version ? `Berger-Lab-${session.app_version}` : APP.versionLabel,
    app: { id: session.app, version: session.app_version, analysis_plan: session.analysis_plan },
    device: session.source?.device_name,
    source: session.source,
    mode: session.montage,
    acquisition_running_at_export: acquisitionRunning,
    verified_shared_reference: !!session.derived_enabled,
    settings_before_acquisition: setup,
    placement_notes: setup.placement_notes || 'not recorded',
    hypothesis: setup.hypothesis || 'not recorded',
    audio_condition: setup.audio_condition ?? 'cues_only',
    audio_notes: setup.audio_notes || 'not recorded',
    hardware: {
      reported_board: 'NPG Lite with VibZ+ playmate (as reported; exact revision unverified)',
      firmware: 'unknown (not queried by the app)',
      adc: '12-bit (vendor specification); received as 16-bit containers',
      gain: 'unknown (not calibrated)',
      sample_clock: '500 Hz nominal; not calibrated against a reference clock',
      montage_leads: montage?.leads ?? [],
    },
    fs_nominal: 500,
    units: 'raw ADC counts; not calibrated microvolts',
    packet_formats: 'Chords 3/6-channel, 7/13/70/130 bytes',
    channel_names: Array.from({ length: channels }, (_, ch) => channelLabel(montage, ch)),
    derived: session.derived_enabled ? 'channel 2 ADC minus channel 1 ADC; not a direct bipolar recording' : 'not computed',
    primary_metric: BERGER_V3.primary_metric,
    method: 'Unaltered ADC samples are exported. The primary alpha path filters each channel causally (0.5–45 Hz plus 50/100/150/200 Hz notches) before Hann/Welch PSD: 1024 points, 50% overlap, three segments per non-overlapping 2048-sample window. Raw Welch alpha is retained as a secondary check. Windows must fit a block and start at least 3 s after browser-reported speech completion; spoken blocks without completion have no accepted primary windows. Reject raw clipping/flatness, windows starting within 10 s of filter restart/gap, and windows with a raw rail in the preceding 10 s or during the window. The 10 s guard is heuristic.',
    sample_count: sampleCount,
    missing_counter_inferred: health.gaps ?? null,
    duplicates: health.duplicates ?? null,
    badPackets: health.badPackets ?? null,
    invalid: health.invalid ?? null,
    protocols: session.protocols ?? [],
    blocks: blocks.flatMap((b) => Array.from({ length: channels }, (_, ch) => ({ channel: channelLabel(montage, ch), ...blockSummary(b, windows, ch, adherence(b)), adherence_as_recorded: b.adherence }))),
    results: eyeProtocols.map((id) => pairedResults({ blocks, windows, protocolId: id, channel: 0, adherenceOf: adherence })),
    limitations: LIMITATIONS,
    analysis_processing: { plan_id: BERGER_V3.plan_id, filter: analysisFilterDescription(), filter_warmup_and_rail_guard_s: BERGER_V3.filter_warmup_and_rail_guard_s, welch: BERGER_V3.welch, units: BERGER_V3.units, window_selection: 'live: every ≥500 ms of arrival time, non-overlapping 2048-sample windows; positions stored per window' },
    display_processing: display ?? { note: 'Display settings do not affect the analysis path.' },
    persistence: { store: session.persistence?.store ?? 'indexeddb', note: 'Rows saved in ≈1 s chunks with per-chunk SHA-256.' },
  };
}
