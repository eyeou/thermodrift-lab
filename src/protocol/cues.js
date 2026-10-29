/**
 * Cue adapters. Browser speech callbacks report what the speech engine did; they do not measure
 * whether the participant heard the cue, their eye state, or millisecond hardware timing.
 */

/** Web Speech API adapter. Returns null when speech synthesis is unavailable. */
export function createSpeechCues(win = globalThis.window) {
  const synth = win?.speechSynthesis;
  const Utterance = win?.SpeechSynthesisUtterance;
  if (!synth || !Utterance) return null;
  return {
    kind: 'speech',
    speak(text, { onStart, onEnd, onError } = {}) {
      try {
        synth.cancel();
        const utterance = new Utterance(text);
        utterance.rate = 0.95;
        utterance.onstart = () => onStart?.();
        utterance.onend = () => onEnd?.();
        utterance.onerror = (event) => onError?.(event?.error || 'unknown');
        synth.speak(utterance);
      } catch (error) {
        onError?.(error?.message || String(error));
      }
    },
    cancel() {
      try { synth.cancel(); } catch { /* nothing to cancel */ }
    },
  };
}

/** No audible cue (simulated sessions, or operator-run protocols without audio). Logged as not spoken. */
export function createSilentCues(reason = 'silent cue mode') {
  return { kind: 'silent', reason, speak() {}, cancel() {} };
}
