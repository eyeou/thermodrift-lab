/**
 * Sample-counter continuity for 8-bit wrapping counters.
 *
 * What it can see: duplicated records and gaps of 1–255 records between two received records.
 * What it cannot see: losses of a multiple of 256 records, and losses that happen on the device
 * before a record is numbered. In the inspected NPG-LITE-BLE firmware snapshot, samples are
 * dropped before numbering when its BLE payload buffers are full, so such losses leave no
 * counter gap. Arrival-rate monitoring is the complementary check.
 */

/** Records advanced since `previous` (1 = contiguous, 0 = duplicate). */
export function counterDelta(previous, counter) {
  return previous === null ? 1 : (counter - previous + 256) % 256;
}

/**
 * Tracks sample indices across one acquisition. `index` follows the v3 convention: it advances
 * by the counter delta, so inferred missing records consume indices.
 */
export class CounterTracker {
  constructor() {
    this.previous = null;
    this.index = -1;
    this.gaps = 0;
    this.duplicates = 0;
  }

  /** Call at every acquisition (re)start: the device resets its counter on START. */
  restartSegment() {
    this.previous = null;
  }

  /**
   * @returns {{kind:'contiguous'|'gap'|'duplicate', missing:number, index:number}}
   */
  accept(counter) {
    const delta = counterDelta(this.previous, counter);
    if (delta === 0) {
      this.duplicates++;
      return { kind: 'duplicate', missing: 0, index: this.index };
    }
    const missing = delta - 1;
    if (missing) this.gaps += missing;
    this.index += delta;
    this.previous = counter;
    return { kind: missing ? 'gap' : 'contiguous', missing, index: this.index };
  }
}
