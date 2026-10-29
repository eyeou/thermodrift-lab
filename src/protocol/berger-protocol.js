/**
 * Berger Lab protocol definitions. Labels, durations and spoken cue text are unchanged from
 * Berger-Lab-3.0.1 so that new recordings remain comparable with the 29 October 2026 run.
 */

export const BERGER_PROTOCOL_VERSION = 'berger-protocol-3';

export const BLOCK_SECONDS_OPTIONS = Object.freeze([30, 45, 60]);

export function baselineProtocol() {
  return {
    name: 'baseline',
    version: BERGER_PROTOCOL_VERSION,
    blocks: [{ label: 'baseline_eyes_open', seconds: 60, instruction: 'Quality baseline. Eyes open; blink normally, no talking or chewing. Do not force relaxation.', spoken: 'Quality baseline. Keep eyes open for one minute. Blink normally and rest your jaw.' }],
  };
}

export function artifactControlsProtocol() {
  return {
    name: 'artifact',
    version: BERGER_PROTOCOL_VERSION,
    blocks: [
      { label: 'rest_before', seconds: 15, instruction: 'Rest. Eyes open; relax face.', spoken: 'Rest.' },
      { label: 'blinks', seconds: 15, instruction: 'Make three deliberate blinks, spaced apart.', spoken: 'Three deliberate blinks.' },
      { label: 'rest_between', seconds: 15, instruction: 'Rest. Relax face again.', spoken: 'Rest.' },
      { label: 'jaw', seconds: 15, instruction: 'Three gentle jaw contractions. Stop if painful.', spoken: 'Three gentle jaw contractions.' },
      { label: 'rest_after', seconds: 15, instruction: 'Rest. Relax face again.', spoken: 'Rest.' },
    ],
  };
}

/** Balanced order: two pairs start open, two closed (Fisher–Yates with a uniform random source). */
export function balancedOrder(randomInt = cryptoRandomInt) {
  const orders = ['open', 'open', 'closed', 'closed'];
  for (let i = orders.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [orders[i], orders[j]] = [orders[j], orders[i]];
  }
  return orders;
}

export function cryptoRandomInt(n) {
  return globalThis.crypto.getRandomValues(new Uint32Array(1))[0] % n;
}

/**
 * Long Berger test: 60 s settling (eyes open) → four open/closed pairs → 20 s recovery.
 * @param {{blockSeconds?: number, audioCondition?: 'cues_only'|'external_audio', order?: string[]}} options
 */
export function bergerLongProtocol({ blockSeconds = 60, audioCondition = 'cues_only', order = balancedOrder() } = {}) {
  if (!BLOCK_SECONDS_OPTIONS.includes(blockSeconds)) blockSeconds = 60;
  const blocks = [{ label: 'settling_eyes_open', seconds: 60, instruction: 'Settling: eyes open. Blink normally; stay comfortably awake. This minute is not an eye-test block.', spoken: 'Settling period. Keep eyes open for one minute. Stay awake and blink normally.' }];
  for (let pair = 1; pair <= 4; pair++) {
    const states = order[pair - 1] === 'open' ? ['open', 'closed'] : ['closed', 'open'];
    for (const state of states) {
      blocks.push({
        label: `eyes_${state}_pair${pair}`,
        seconds: blockSeconds,
        instruction: `Pair ${pair} of 4: eyes ${state} for ${blockSeconds} seconds. Stay awake; rest face and jaw.`,
        spoken: `Pair ${pair} of four. Eyes ${state}. Keep them ${state} for ${blockSeconds} seconds. Stay awake and rest your jaw.`,
      });
    }
  }
  blocks.push({ label: 'recovery_eyes_open', seconds: 20, instruction: 'Recovery: eyes open for 20 seconds. Remain still; recording stops afterward.', spoken: 'Final recovery. Open your eyes and keep them open for twenty seconds. Recording will stop afterward.' });
  return {
    name: 'berger',
    version: BERGER_PROTOCOL_VERSION,
    blocks,
    autoStopAcquisition: true,
    settings: {
      transition_exclusion_s: 3,
      block_seconds: blockSeconds,
      classification: audioCondition === 'external_audio' ? 'exploratory_external_audio' : 'cues_only',
      audio_condition: audioCondition,
      pair_start_order: order,
    },
  };
}

export function plannedSeconds(protocol) {
  return protocol.blocks.reduce((s, b) => s + b.seconds, 0);
}

export const COMPLETION_CUE = 'Protocol complete. Keep your eyes open. Recording is stopping. Review the instructions you followed, then finish and export the session.';
export const INTERRUPTION_CUE = 'Protocol stopped. Open your eyes. Inspect the app and export your data.';
