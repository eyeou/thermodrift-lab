/**
 * Breathwork protocols. Operator-started, voice-cued, fixed durations.
 * The guided breathing session itself (a video) runs outside any protocol: the operator marks its
 * phases with keys while acquisition runs. Results are descriptive checks of the recording chain.
 */

export const BREATH_PROTOCOL_VERSION = 'breath-check-2';

/** Four minutes: does each signal behave as expected under the conditions of the session? */
export function breathSignalCheckProtocol() {
  return {
    name: 'breath-check',
    version: BREATH_PROTOCOL_VERSION,
    blocks: [
      { label: 'still_open', seconds: 45, instruction: 'Stay still with eyes open. Breathe normally.', spoken: 'Signal check. Stay still with your eyes open and breathe normally.' },
      { label: 'still_closed', seconds: 45, instruction: 'Eyes closed. Breathe normally.', spoken: 'Close your eyes and breathe normally.' },
      { label: 'slow_breathing', seconds: 60, instruction: 'Eyes open. Breathe in for 5 seconds, out for 5 seconds.', spoken: 'Open your eyes. Slow breathing: in for five seconds, out for five seconds.' },
      { label: 'shrugs', seconds: 15, instruction: 'Three gentle shoulder shrugs: lift, hold one second, release.', spoken: 'Three gentle shoulder shrugs. Lift, hold one second, release.' },
      { label: 'deep_breaths', seconds: 30, instruction: 'About ten deep breaths, as in the session: full breath in, let it go.', spoken: 'About ten deep breaths, as in the session. Full breath in, then let it go.' },
      { label: 'exhale_hold', seconds: 15, instruction: 'Breathe out and hold, only if comfortable. Breathe again whenever you need.', spoken: 'Breathe out and hold, only if comfortable. Breathe again whenever you need.' },
      { label: 'recovery', seconds: 30, instruction: 'Breathe normally and stay still.', spoken: 'Breathe normally and stay still.' },
    ],
    autoStopAcquisition: false,
    settings: { classification: 'breath_signal_check' },
  };
}

/**
 * Rest before or after the guided session, identical on both sides so they can be compared:
 * 1 min eyes open, then 2 min eyes closed.
 */
export function breathRestProtocol(when = 'before') {
  const after = when === 'after';
  const side = after ? 'after' : 'before';
  return {
    name: `rest-${side}`,
    version: BREATH_PROTOCOL_VERSION,
    blocks: [
      { label: `rest_${side}_open`, seconds: 60, instruction: 'Stay still with eyes open. Breathe normally; relax jaw and shoulders.', spoken: `Rest ${side} the session. Eyes open, stay still and breathe normally for one minute.` },
      { label: `rest_${side}_closed`, seconds: 120, instruction: 'Eyes closed. Breathe normally for 2 minutes.', spoken: 'Close your eyes and breathe normally for two minutes.' },
    ],
    autoStopAcquisition: false,
    settings: { classification: 'breath_rest', comparable_with: after ? 'rest-before' : 'rest-after' },
  };
}

/** Spoken when a breath protocol completes; keys are protocol names. */
export const BREATH_COMPLETION_CUES = Object.freeze({
  'breath-check': 'Signal check done. You can stop acquisition and export.',
  'rest-before': 'Rest done. Open your eyes and start the video. Press V when it starts.',
  'rest-after': 'Rest done. You can stop acquisition and export.',
});
