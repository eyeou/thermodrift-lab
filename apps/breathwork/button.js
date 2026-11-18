/**
 * What the board's button does. The firmware counts clicks and notifies BTN<clicks>:<ms>, ms being
 * the time since the first press. Hands-free for a lying operator with the laptop far away:
 *
 *   1 click   marker: something happened
 *   2 clicks  video or music start, then end (a toggle)
 *   3 clicks  unused
 */
export function parseButton(text) {
  const match = /^BTN([1-3])?(?::(\d+))?/.exec(text);
  return match ? { clicks: Number(match[1] ?? 1), offsetMs: Number(match[2] ?? 0) } : null;
}

/**
 * @param {number} clicks
 * @param {{acquiring: boolean, videoRunning: boolean}} context
 */
export function buttonAction(clicks, { acquiring, videoRunning }) {
  if (!acquiring) return { kind: 'refuse', reason: 'not acquiring' };
  if (clicks === 1) return { kind: 'marker' };
  if (clicks === 2) return { kind: 'video', to: videoRunning ? 'end' : 'start' };
  return { kind: 'refuse', reason: 'three clicks do nothing' };
}
