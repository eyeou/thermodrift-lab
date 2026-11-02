/**
 * Breathwork app definition: everything app-specific lives here (montages, protocols, labels,
 * export metadata). Acquisition, storage, DSP, protocol timing and charts come from src/.
 *
 * A session is a signal check, then a rest before and an identical rest after a guided breathing
 * session. The guided session (a video) runs outside any protocol while acquisition continues;
 * the operator marks it with keys. Heart rate, breathing and muscle activity are analysed after
 * export; the live windows check signal quality and summarise the EEG channel per block.
 */
import { BERGER_V3, analysisFilterDescription, blockSummary } from '../../src/analysis/berger-v3.js';
import { effectiveAdherence } from '../../src/analysis/adherence.js';
import { median } from '../../src/core/stats.js';
import { plannedSeconds } from '../../src/protocol/berger-protocol.js';
import { breathSignalCheckProtocol, breathRestProtocol, BREATH_COMPLETION_CUES, BREATH_PROTOCOL_VERSION } from '../../src/protocol/breath-protocol.js';

export const APP = Object.freeze({ id: 'breathwork-lab', name: 'Breathwork', version: '0.2.0', versionLabel: 'Breathwork-Lab-0.2.0', analysisPlan: 'breathwork-1' });

/** Channel whose live windows summarise the EEG (channel 2, Oz, in every montage). */
export const EEG_CHANNEL = 1;
/** Channels analysed live by the window engine (channels 1 and 2); later channels are exported raw only. */
export const LIVE_CHANNELS = 2;

const RED = '#E5484D', BLACK = '#151515', WHITE = '#F2F2F2', BLUE = '#3E7BFA', GREEN = '#3DD68C', AMBER = '#E5A84D', VIOLET = '#B98CF2', TEAL = '#4DC9D6';

const ECG_LEADS = [
  { site: 'chest-left', pin: 'A0P', cable: 'red', cableColor: RED, role: 'ECG +', siteLabel: 'left lower ribs, below the chest muscle', electrode: 'patch', short: 'L ribs' },
  { site: 'chest-right', pin: 'A0N', cable: 'black', cableColor: BLACK, role: 'ECG −', siteLabel: 'just below the right collarbone', electrode: 'patch', short: 'R collarbone' },
];
const OZ_LEADS = [
  { site: 'Oz', pin: 'A1P', cable: 'blue', cableColor: BLUE, role: 'EEG +', siteLabel: 'Oz area, on intact skin', electrode: 'gold cup + paste', short: 'Oz' },
  { site: 'M1', pin: 'A1N', cable: 'black', cableColor: BLACK, role: 'EEG −', siteLabel: 'left rear-ear bony site', electrode: 'gold cup + paste', short: 'L ear' },
];
const REF_LEAD = { site: 'M2', pin: 'REF', cable: 'white', cableColor: WHITE, role: 'REF (shared)', siteLabel: 'right rear-ear bony site', electrode: 'gold cup + paste', short: 'R ear' };

export const MONTAGES = Object.freeze({
  'breath-6ch': {
    id: 'breath-6ch',
    label: 'Six channels · ECG, Oz, Cz, EOG, neck and shoulder EMG',
    summary: 'ECG · Oz · Cz · EOG · neck EMG · shoulder EMG',
    requiredChannels: 6,
    derived: false,
    channelNames: ['ECG · left ribs − right collarbone', 'EEG · Oz − left ear', 'EEG · Cz − left ear', 'EOG · right − left eye corner', 'EMG · left sternocleidomastoid', 'EMG · right upper trapezius'],
    channelKinds: ['ecg', 'eeg', 'eeg', 'eog', 'emg', 'emg'],
    leads: [
      ...ECG_LEADS,
      ...OZ_LEADS,
      { site: 'Cz', pin: 'A2P', cableColor: AMBER, role: 'EEG +', siteLabel: 'Cz, top of the head, through the hair', electrode: 'gold cup + paste', short: 'Cz' },
      { site: 'M1', pin: 'A2N', cableColor: BLACK, role: 'EEG −', siteLabel: 'second electrode behind the left ear, just below the first', electrode: 'gold cup + paste', short: 'L ear' },
      { site: 'eye-right', pin: 'A3P', cableColor: VIOLET, role: 'EOG +', siteLabel: 'right eye, 1 cm out from the outer corner', electrode: 'patch', short: 'R eye' },
      { site: 'eye-left', pin: 'A3N', cableColor: BLACK, role: 'EOG −', siteLabel: 'left eye, 1 cm out from the outer corner', electrode: 'patch', short: 'L eye' },
      { site: 'neck-upper', pin: 'A4P', cableColor: GREEN, role: 'EMG +', siteLabel: 'left sternocleidomastoid, middle of the muscle', electrode: 'patch', short: 'neck' },
      { site: 'neck-lower', pin: 'A4N', cableColor: BLACK, role: 'EMG −', siteLabel: 'same muscle, 2 cm lower along its line', electrode: 'patch', short: 'neck' },
      { site: 'shoulder-medial', pin: 'A5P', cableColor: TEAL, role: 'EMG +', siteLabel: 'top of the right shoulder, midway between neck and shoulder tip', electrode: 'patch', short: 'shoulder' },
      { site: 'shoulder-lateral', pin: 'A5N', cableColor: BLACK, role: 'EMG −', siteLabel: '2 cm toward the shoulder tip, along the muscle', electrode: 'patch', short: 'shoulder' },
      REF_LEAD,
    ],
    notes: 'CN switch off: every channel has its own − electrode. Two cups behind the left ear (A1N and A2N). One REF serves all six channels; if channels 4–6 look floating, put the second REF next to the first. Channels 4–6 are on the VibZ+ board, attached before the NPG is switched on. Lying down, nothing should press Oz, the ear cups or the neck patches.',
    routingCheck: 'A0 ECG, A1 Oz, A2 Cz, A3 EOG, A4 left neck, A5 right shoulder, REF right ear, CN switch off, VibZ+ attached.',
  },
  'breath-6ch-fpz': {
    id: 'breath-6ch-fpz',
    label: 'Six channels · ECG, Oz, Cz, Fpz, neck and shoulder EMG',
    summary: 'ECG · Oz · Cz · Fpz · neck EMG · shoulder EMG',
    requiredChannels: 6,
    derived: false,
    channelNames: ['ECG · left ribs − right collarbone', 'EEG · Oz − left ear', 'EEG · Cz − left ear', 'EEG · Fpz − left ear', 'EMG · left sternocleidomastoid', 'EMG · right upper trapezius'],
    channelKinds: ['ecg', 'eeg', 'eeg', 'eeg', 'emg', 'emg'],
    leads: [
      ...ECG_LEADS,
      ...OZ_LEADS,
      { site: 'Cz', pin: 'A2P', cableColor: AMBER, role: 'EEG +', siteLabel: 'Cz, top of the head, through the hair', electrode: 'gold cup + paste', short: 'Cz' },
      { site: 'M1', pin: 'A2N', cableColor: BLACK, role: 'EEG −', siteLabel: 'second electrode behind the left ear, just below the first', electrode: 'gold cup or patch', short: 'L ear' },
      { site: 'Fpz', pin: 'A3P', cableColor: VIOLET, role: 'EEG +', siteLabel: 'Fpz, mid-forehead above the nose', electrode: 'patch or gold cup + paste', short: 'Fpz' },
      { site: 'M1', pin: 'A3N', cableColor: BLACK, role: 'EEG −', siteLabel: 'third electrode behind the left ear (or the left earlobe)', electrode: 'gold cup or patch', short: 'L ear' },
      { site: 'neck-upper', pin: 'A4P', cableColor: GREEN, role: 'EMG +', siteLabel: 'left sternocleidomastoid, middle of the muscle', electrode: 'patch', short: 'neck' },
      { site: 'neck-lower', pin: 'A4N', cableColor: BLACK, role: 'EMG −', siteLabel: 'same muscle, 2 cm lower along its line', electrode: 'patch', short: 'neck' },
      { site: 'shoulder-medial', pin: 'A5P', cableColor: TEAL, role: 'EMG +', siteLabel: 'top of the right shoulder, midway between neck and shoulder tip', electrode: 'patch', short: 'shoulder' },
      { site: 'shoulder-lateral', pin: 'A5N', cableColor: BLACK, role: 'EMG −', siteLabel: '2 cm toward the shoulder tip, along the muscle', electrode: 'patch', short: 'shoulder' },
      REF_LEAD,
    ],
    notes: 'Same as the six-channel montage with Fpz on channel 4 instead of the EOG. CN switch off: every channel has its own − electrode, so three electrodes behind the left ear (A1N, A2N, A3N), each on its own pin. Fpz also records vertical eye movements, blinks and forehead muscle. Channels 4–6 are on the VibZ+ board, attached before the NPG is switched on.',
    routingCheck: 'A0 ECG, A1 Oz, A2 Cz, A3 Fpz, A4 left neck, A5 right shoulder, REF right ear, CN switch off, VibZ+ attached.',
  },
  'breath-emg': {
    id: 'breath-emg',
    label: 'Three channels · ECG, Oz, neck EMG',
    summary: 'ECG · Oz EEG · neck EMG',
    requiredChannels: 3,
    derived: false,
    channelNames: ['ECG · left ribs − right collarbone', 'EEG · Oz − left ear', 'EMG · left sternocleidomastoid'],
    channelKinds: ['ecg', 'eeg', 'emg'],
    leads: [
      ...ECG_LEADS,
      ...OZ_LEADS,
      { site: 'neck-upper', pin: 'A2P', cable: 'green', cableColor: GREEN, role: 'EMG +', siteLabel: 'left sternocleidomastoid, middle of the muscle', electrode: 'patch', short: 'neck' },
      { site: 'neck-lower', pin: 'A2N', cable: 'black', cableColor: BLACK, role: 'EMG −', siteLabel: 'same muscle, 2 cm lower along its line', electrode: 'patch', short: 'neck' },
      REF_LEAD,
    ],
    notes: 'CN link off. The neck EMG records neck muscle activity.',
    routingCheck: 'A0P–left ribs, A0N–right collarbone, A1P–Oz, A1N–left ear, A2P/A2N–left neck muscle, REF–right ear, CN link off.',
  },
  'breath-fpz': {
    id: 'breath-fpz',
    label: 'Three channels · ECG, Oz, Fpz',
    summary: 'ECG · Oz EEG · Fpz EEG',
    requiredChannels: 3,
    derived: false,
    channelNames: ['ECG · left ribs − right collarbone', 'EEG · Oz − left ear', 'EEG · Fpz − left ear'],
    channelKinds: ['ecg', 'eeg', 'eeg'],
    leads: [
      ...ECG_LEADS,
      ...OZ_LEADS,
      { site: 'Fpz', pin: 'A2P', cable: 'green', cableColor: GREEN, role: 'EEG +', siteLabel: 'Fpz, mid-forehead', electrode: 'gold cup + paste', short: 'Fpz' },
      { site: 'M1', pin: 'A2N', cable: 'black', cableColor: BLACK, role: 'EEG −', siteLabel: 'second electrode behind the left ear, just below the first', electrode: 'gold cup + paste', short: 'L ear' },
      REF_LEAD,
    ],
    notes: 'CN link off; two electrodes behind the left ear (A1N and A2N). Fpz also records eye movements and forehead muscles.',
    routingCheck: 'A0P–left ribs, A0N–right collarbone, A1P–Oz, A1N–left ear, A2P–Fpz, A2N–left ear (second electrode), REF–right ear, CN link off.',
  },
  'breath-2ch': {
    id: 'breath-2ch',
    label: 'Two channels · ECG, Oz',
    summary: 'ECG · Oz EEG',
    requiredChannels: 2,
    derived: false,
    channelNames: ['ECG · left ribs − right collarbone', 'EEG · Oz − left ear'],
    channelKinds: ['ecg', 'eeg'],
    leads: [...ECG_LEADS, ...OZ_LEADS, REF_LEAD],
    notes: 'CN link off; channel 3 unused.',
    routingCheck: 'A0P–left ribs, A0N–right collarbone, A1P–Oz, A1N–left ear, REF–right ear, CN link off.',
  },
});

export const DEFAULT_MONTAGE = 'breath-6ch';
/** The NPG Lite Beast streams at most six channels. */
export const MAX_CHANNELS = 6;

export function channelLabel(montage, ch) {
  return montage?.channelNames?.[ch] ?? `Channel ${ch + 1}`;
}

export function channelKind(montage, ch) {
  return montage?.channelKinds?.[ch] ?? 'unused';
}

/** Typical live trace half-range in ADC counts, per channel kind. */
export const TRACE_RANGE = Object.freeze({ ecg: 500, eeg: 50, eog: 250, emg: 250, unused: 50 });

const BLOCK_NAMES = Object.freeze({
  still_open: 'Still · eyes open',
  still_closed: 'Still · eyes closed',
  slow_breathing: 'Slow breathing',
  shrugs: 'Shoulder shrugs',
  deep_breaths: 'Deep breaths',
  exhale_hold: 'Exhale hold',
  recovery: 'Recovery',
  rest_before_open: 'Rest before · eyes open',
  rest_before_closed: 'Rest before · eyes closed',
  rest_after_open: 'Rest after · eyes open',
  rest_after_closed: 'Rest after · eyes closed',
  settling_eyes_open: 'Settling · eyes open',
  recovery_eyes_open: 'Recovery · eyes open',
});

export function blockName(label) {
  const bare = label.replace(/^demo_/, '');
  const pair = /^eyes_(open|closed)_pair(\d+)$/.exec(bare);
  if (pair) return `Pair ${pair[2]} · eyes ${pair[1]}`;
  return BLOCK_NAMES[bare] ?? bare.replaceAll('_', ' ');
}

/** Protocol launcher entries. `create()` returns a fresh definition. */
export function protocolEntries({ simulated = false } = {}) {
  const speech = !simulated;
  const entries = [
    { name: 'breath-check', index: '01', label: 'Signal check', detail: '4 min · still, eyes closed, slow breathing, shrugs, deep breaths, short hold', create: () => breathSignalCheckProtocol(), requireCueCheck: true, requireSpeech: speech, primary: true },
    { name: 'rest-before', index: '02', tabTitle: 'Rest before', label: 'Rest before the session', detail: '3 min · 1 min eyes open, 2 min eyes closed · then start your session', create: () => breathRestProtocol('before'), requireCueCheck: true, requireSpeech: speech },
    { name: 'rest-after', index: '03', tabTitle: 'Rest after', label: 'Rest after the session', detail: '3 min · same as before', create: () => breathRestProtocol('after'), requireCueCheck: true, requireSpeech: speech },
  ];
  if (simulated) entries.push({ name: 'breath-demo', index: 'D', tabTitle: 'Flow demo', label: 'Flow demo (simulated only)', detail: '42 s · the signal-check blocks, 6 s each · not an experiment', create: demoProtocol });
  return entries;
}

/** The signal-check sequence with short, silent blocks, for trying the interface with the simulator. */
export function demoProtocol() {
  const p = breathSignalCheckProtocol();
  const blocks = p.blocks.map((b) => ({ ...b, label: `demo_${b.label}`, seconds: 6, spoken: undefined, instruction: `[Demo] ${b.instruction}` }));
  return { ...p, name: 'breath-demo', version: `${p.version}-demo`, blocks, settings: { ...p.settings, classification: 'demo_simulated_only' } };
}

const NOT_RECORDED = 'not recorded';

/**
 * How the guided session runs between the two rests. A format is what the operator plans and what
 * the export records: it changes no protocol, filter or analysis window, and the app does not check
 * that a session followed it.
 */
export const SESSION_FORMATS = Object.freeze({
  'wim-hof-style': Object.freeze({
    id: 'wim-hof-style',
    label: 'Wim Hof-style',
    length: 'about 16 minutes',
    summary: 'A guided session of about 16 minutes, with four rounds of deep breathing, each followed by an exhale hold and a recovery breath.',
    need: 'Your guided session, as audio or video',
    step: 'Start your guided audio or video and press V. Four rounds of deep breathing follow over about 16 minutes, each with an exhale hold and a recovery breath. While acquiring, B marks breathing, H a hold, R a recovery breath and M anything else. If you film it, three phone taps with three jaw clenches tie the video to the recording, at both ends.',
    keys: 'Keys while acquiring: V video start · B breathing · H hold · R recovery breath · M marker.',
    key: Object.freeze([{ kind: 'breathing', label: 'Deep breathing' }, { kind: 'hold', label: 'Exhale hold' }, { kind: 'recovery', label: 'Recovery breath' }]),
    parts: Object.freeze([1, 2, 3, 4].flatMap(() => [{ kind: 'breathing', seconds: 140 }, { kind: 'hold', seconds: 85 }, { kind: 'recovery', seconds: 15 }])),
  }),
  'holotropic-style': Object.freeze({
    id: 'holotropic-style',
    label: 'Holotropic-style',
    length: 'about 60 minutes',
    summary: 'About forty minutes of deep connected breathing to music, guided live, then a closing sequence and a long recovery lying still.',
    need: 'Music, and a trained facilitator to guide you live',
    step: 'Start the music and press V. About forty minutes of deep connected breathing follow, guided live. The closing sequence is fast breaths, an exhale hold, an inhale hold with a whole-body contraction, and shaking. A long recovery lying still ends the session. While acquiring, B marks breathing, H a hold, R the start of the recovery and M anything else, and a helper can press them for you. If you film it, three phone taps with three jaw clenches tie the video to the recording, at both ends.',
    keys: 'Keys while acquiring: V music start · B breathing · H hold · R recovery start · M marker.',
    key: Object.freeze([{ kind: 'breathing', label: 'Deep connected breathing' }, { kind: 'closing', label: 'Closing sequence' }, { kind: 'recovery', label: 'Long recovery' }]),
    parts: Object.freeze([{ kind: 'breathing', seconds: 2400 }, { kind: 'closing', seconds: 240 }, { kind: 'recovery', seconds: 960 }]),
    care: 'Run the long format with a trained facilitator present.',
    markers: Object.freeze({ v: 'music start', r: 'recovery start' }),
    completionCues: Object.freeze({ 'rest-before': 'Rest done. Open your eyes. Press V when the music starts.' }),
  }),
});

export const DEFAULT_SESSION_FORMAT = 'wim-hof-style';
const formatOf = (id) => SESSION_FORMATS[id] ?? SESSION_FORMATS[DEFAULT_SESSION_FORMAT];

/** A recorded format in words. Sessions from before formats existed did not record one. */
export function sessionFormatLabel(id) {
  if (!id || id === NOT_RECORDED) return 'Not recorded';
  return SESSION_FORMATS[id]?.label ?? String(id);
}

const MARKER_NOTES = Object.freeze({ b: 'breathing start', h: 'hold start', r: 'recovery breath', v: 'video start', m: 'marker' });

/** What a marker key records, or null for any other key. A format can name its own start and recovery. */
export function markerNote(formatId, key) {
  return formatOf(formatId).markers?.[key] ?? MARKER_NOTES[key] ?? null;
}

/** What is spoken when a protocol completes, or undefined when nothing is. */
export function completionCue(protocolName, formatId) {
  return formatOf(formatId).completionCues?.[protocolName] ?? BREATH_COMPLETION_CUES[protocolName];
}

/** The plan of a whole sitting, in order. The check and the rests come from the protocols that run. */
export function sessionTimeline(formatId = DEFAULT_SESSION_FORMAT) {
  const format = formatOf(formatId);
  const plain = (protocol) => [{ kind: 'plain', seconds: plannedSeconds(protocol) }];
  return [
    { names: ['Signal check', 'Check'], parts: plain(breathSignalCheckProtocol()) },
    { names: ['Rest before', 'Rest'], parts: plain(breathRestProtocol('before')) },
    { names: [`Your session, ${format.length}`, 'Your session'], parts: format.parts },
    { names: ['Rest after', 'Rest'], parts: plain(breathRestProtocol('after')) },
  ];
}

const BASE_GUIDE = Object.freeze({
  question: 'What happens in the body and the brain during a breathing session, and how much of it can actually be measured?',
  needs: ['NPG Lite with VibZ+ for six channels', 'Gold cups with paste for the head', 'Adhesive patches for ECG, EOG and EMG', 'Tape and a measuring tape', 'A phone on a tripod, if you want the video'],
  steps: [
    { title: 'Place the electrodes', text: 'Follow the figures, with paste, gauze and tape for the gold cups. Leave a taped cable loop near each patch, so a pull never reaches the skin.', tab: 'setup', tabLabel: 'Open the figures' },
    { title: 'Fix the room', text: 'Keep the kit on a mat, taped down. Keep the laptop on battery and at least a metre away, because a laptop next to the kit can raise mains pickup.' },
    { title: 'Lie down and look', text: 'Arms at your sides, palms up. Start acquisition and look for beats on the ECG. If the 0–100 Hz spectrum shows narrow lines at 33 and 67 Hz, check the contacts and the wiring.', tab: 'signal', tabLabel: 'Open the signal' },
    { title: 'Signal check', text: 'Stillness, eyes closed, slow breathing, shrugs, deep breaths and a short hold, so each signal can be seen responding.', protocol: 'breath-check' },
    { title: 'Rest before', text: 'One minute with eyes open, two with eyes closed. It is the baseline for everything after.', protocol: 'rest-before' },
    { title: 'Your session' },
    { title: 'Rest after', text: 'The same three minutes. Stay lying until it ends.', protocol: 'rest-after' },
    { title: 'Export', text: 'Each recording gives one file, and a test run stays flagged as a test. Write your notes before looking at any signal.', tab: 'recordings', tabLabel: 'Open the recordings' },
  ],
  protocols: {
    'breath-check': { purpose: 'Does each signal behave as expected under the conditions of the session?' },
    'rest-before': { purpose: 'The baseline: identical to the rest after, so the two can be compared.' },
    'rest-after': { purpose: 'The same blocks as the rest before.' },
    'breath-demo': { purpose: 'The signal-check blocks at 6 s each, for trying the interface. Not an experiment.' },
  },
  care: 'Stay lying down, never in or near water, standing or driving. Stop for chest pain, faintness or anything unusual. With a heart condition, epilepsy or a pregnancy, ask a doctor first.',
});

/** The written protocol shown in the Protocol tab, for one format. Block tables come from the protocol definitions. */
export function guideFor(formatId = DEFAULT_SESSION_FORMAT) {
  const format = formatOf(formatId);
  const needs = [...BASE_GUIDE.needs];
  needs.splice(needs.length - 1, 0, format.need);
  return {
    ...BASE_GUIDE,
    needs,
    steps: BASE_GUIDE.steps.map((step) => (step.title === 'Your session' ? { ...step, text: format.step } : step)),
  };
}

export const GUIDE = Object.freeze(guideFor());

/** How the report describes this plan. Eye pairs apply to sessions that recorded them. */
export const PRIMARY_METRIC = 'per block on the EEG channel: median absolute 8–13 Hz power after fixed causal 0.5–45 Hz filter and 50/100/150/200 Hz notches; rest after / rest before per eye state; alpha and slow shares of raw power are secondary';
export const ELIGIBILITY = `rest rows: both rests complete, neither excluded, ≥2 accepted windows each, before alpha > 0; eye pairs, where a session recorded them: ${BERGER_V3.eligibility}`;

export const LIMITATIONS = 'One participant at a time; prompted states are not measured states. ADC counts are not calibrated microvolts. Live windows check signal quality; heart rate, breathing and muscle activity are analysed after export. Breathwork changes CO₂, movement and muscle tone, and each of these can change the EEG: a before/after difference is descriptive.';

const shareOf = (w, bands) => {
  const total = Object.values(w.bp).reduce((s, v) => s + v, 0);
  return total > 0 ? bands.reduce((s, k) => s + (w.bp[k] ?? 0), 0) / total : null;
};

/** Block summary plus band shares from the raw Welch window (0.5–45 Hz), for one channel. */
export function breathBlockSummary(block, windows, channel, adherence) {
  const base = blockSummary(block, windows, channel, adherence);
  const good = windows.filter((w) => w.block_id === block.id && w.accepted_for_block && w.channel === channel && !w.reasons.length);
  const finite = (values) => values.filter(Number.isFinite);
  return {
    ...base,
    slow_share_secondary: median(finite(good.map((w) => shareOf(w, ['delta', 'theta'])))),
    beta_share_secondary: median(finite(good.map((w) => shareOf(w, ['beta'])))),
  };
}

/**
 * Rest before versus rest after, per eye state, on one channel: the latest complete block of each
 * label. A row is eligible when neither block is excluded and each has at least 2 clean windows.
 */
export function restComparison({ blocks, windows, channel = EEG_CHANNEL, adherenceOf = (b) => b.adherence ?? 'unconfirmed' }) {
  const latest = (label) => blocks.filter((b) => b.label === label && b.complete).at(-1) ?? null;
  const rows = ['open', 'closed'].map((state) => {
    const pick = (side) => {
      const block = latest(`rest_${side}_${state}`);
      return block ? breathBlockSummary(block, windows, channel, adherenceOf(block)) : null;
    };
    const before = pick('before'), after = pick('after');
    let status = 'eligible';
    if (!before || !after) status = 'missing_block';
    else if (before.adherence === 'exclude' || after.adherence === 'exclude') status = 'excluded';
    else if (before.valid < 2 || after.valid < 2) status = 'too_few_windows';
    const eligible = status === 'eligible' && Number.isFinite(before.alpha) && Number.isFinite(after.alpha) && before.alpha > 0;
    return {
      state,
      status: eligible ? 'eligible' : status === 'eligible' ? 'no_alpha' : status,
      before,
      after,
      alpha_ratio_after_before: eligible ? after.alpha / before.alpha : null,
      relative_alpha_change: eligible && Number.isFinite(before.relative_alpha_secondary) && Number.isFinite(after.relative_alpha_secondary) ? after.relative_alpha_secondary - before.relative_alpha_secondary : null,
      slow_share_change: eligible && Number.isFinite(before.slow_share_secondary) && Number.isFinite(after.slow_share_secondary) ? after.slow_share_secondary - before.slow_share_secondary : null,
    };
  });
  return { channel, rows };
}

/**
 * The live-window channel holding a session's EEG, from what the session recorded, or null when it
 * does not say. Live windows cover channels 1 and 2, and channel 1 is the ECG.
 */
export function eegChannelOf({ montage, channel_kinds, channel_names } = {}) {
  const known = MONTAGES[montage];
  const kind = channel_kinds?.[EEG_CHANNEL] ?? known?.channelKinds?.[EEG_CHANNEL];
  if (kind) return kind === 'eeg' ? EEG_CHANNEL : null;
  return /^EEG\b/.test(channel_names?.[EEG_CHANNEL] ?? '') ? EEG_CHANNEL : null;
}

/** The channels without live windows, in words, for a session with `count` device channels. */
function rawOnlySentence(count) {
  const first = LIVE_CHANNELS + 1;
  if (count < first) return '';
  return count === first ? `Channel ${first} is exported raw only. ` : `Channels ${first}–${count} are exported raw only. `;
}

/**
 * Export metadata, from stored data only: usable by the live app and by the report page after a
 * reload. Field names follow the Berger Effect exports where they mean the same thing.
 */
export function describeBreathworkSession({ session, events = [], windows = [], annotations = [], sampleCount, acquisitionRunning = false, display = null }) {
  const montage = MONTAGES[session.montage] ?? null;
  const channels = montage?.requiredChannels ?? 3;
  const analysed = Math.min(LIVE_CHANNELS, channels);
  const blocks = session.blocks ?? [];
  const adherence = (b) => effectiveAdherence(b, annotations);
  const setup = session.setup ?? {};
  const health = session.health ?? {};
  const markers = events.filter((e) => e.label === 'operator_marker');
  return {
    version: session.app_version ? `Breathwork-Lab-${session.app_version}` : APP.versionLabel,
    app: { id: session.app, version: session.app_version, analysis_plan: session.analysis_plan },
    device: session.source?.device_name,
    source: session.source,
    mode: session.montage,
    acquisition_running_at_export: acquisitionRunning,
    settings_before_acquisition: setup,
    placement_notes: setup.placement_notes || 'not recorded',
    hypothesis: setup.hypothesis || 'not recorded',
    position: setup.position ?? 'not recorded',
    audio_notes: setup.audio_notes || 'not recorded',
    session_format: setup.session_format ?? NOT_RECORDED,
    hardware: {
      reported_board: 'NPG Lite (exact revision unverified)',
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
    channel_kinds: Array.from({ length: channels }, (_, ch) => channelKind(montage, ch)),
    protocol_version: BREATH_PROTOCOL_VERSION,
    method: `Unaltered ADC samples of every device channel are exported. Live windows reuse the Berger v3 window engine on channels 1 and 2: causal 0.5–45 Hz filter with 50/100/150/200 Hz notches, Hann/Welch PSD (1024 points, 50% overlap) over non-overlapping 2048-sample windows, the same rejection rules, and windows accepted only inside a block, at least ${BERGER_V3.transition_exclusion_s} s after its spoken cue ends. Band shares are fractions of raw Welch power in 0.5–45 Hz. ${rawOnlySentence(session.channel_count ?? channels)}The guided session between the rests runs outside any protocol and is located by operator markers.`,
    sample_count: sampleCount,
    missing_counter_inferred: health.gaps ?? null,
    duplicates: health.duplicates ?? null,
    badPackets: health.badPackets ?? null,
    invalid: health.invalid ?? null,
    protocols: session.protocols ?? [],
    markers: markers.map((m) => ({ index: m.index, arrival_ms: m.arrival_ms, note: m.note ?? '', block_id: m.block_id ?? 0 })),
    blocks: blocks.flatMap((b) => Array.from({ length: analysed }, (_, ch) => ({ channel: channelLabel(montage, ch), ...breathBlockSummary(b, windows, ch, adherence(b)), adherence_as_recorded: b.adherence }))),
    results: { rest_comparison: { channel_name: channelLabel(montage, EEG_CHANNEL), ...restComparison({ blocks, windows, channel: EEG_CHANNEL, adherenceOf: adherence }) } },
    limitations: LIMITATIONS,
    analysis_processing: { plan_id: session.analysis_plan ?? APP.analysisPlan, window_engine: BERGER_V3.plan_id, analysed_channels: analysed, filter: analysisFilterDescription(), filter_warmup_and_rail_guard_s: BERGER_V3.filter_warmup_and_rail_guard_s, welch: BERGER_V3.welch, units: BERGER_V3.units, window_selection: 'live: every ≥500 ms of arrival time, non-overlapping 2048-sample windows; positions stored per window' },
    display_processing: display ?? { note: 'Display settings do not affect the analysis path.' },
    persistence: { store: session.persistence?.store ?? 'indexeddb', note: 'Rows saved in ≈1 s chunks with per-chunk SHA-256.' },
  };
}
