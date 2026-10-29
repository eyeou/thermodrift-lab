/**
 * Second-order sections, Direct Form II, causal and stateful.
 * Coefficient layout per section: [b0, b1, b2, a0(=1), a1, a2].
 * The operation order is fixed on purpose: it is the order used by Berger Lab v3, so stored
 * analysis outputs can be reproduced bit for bit.
 */

/** One section as a closure with private state. */
export function createSection(sos) {
  if (sos.length !== 6 || sos[3] !== 1) throw new Error('SOS sections must be [b0,b1,b2,1,a1,a2]');
  let z1 = 0;
  let z2 = 0;
  return (x) => {
    const v = x - sos[4] * z1 - sos[5] * z2;
    const y = sos[0] * v + sos[1] * z1 + sos[2] * z2;
    z2 = z1;
    z1 = v;
    return y;
  };
}

/**
 * A cascade with an optional exact power-of-two gain between two groups of sections,
 * mirroring v3: band-pass → × gain → notches → × outputGain.
 */
export class SosCascade {
  /**
   * @param {{pre: number[][], post?: number[][], gain?: number, outputGain?: number}} spec
   */
  constructor(spec) {
    this.spec = spec;
    this.reset();
  }

  /** Discard all filter memory. Required at every acquisition start, gap or invalid sample. */
  reset() {
    this.pre = this.spec.pre.map(createSection);
    this.post = (this.spec.post ?? []).map(createSection);
    this.samples = 0;
  }

  process(x) {
    let y = x;
    for (const section of this.pre) y = section(y);
    if (this.spec.gain !== undefined) y *= this.spec.gain;
    for (const section of this.post) y = section(y);
    if (this.spec.outputGain !== undefined) y *= this.spec.outputGain;
    this.samples++;
    return y;
  }
}

/** Complex frequency response magnitude of a cascade at `frequency` Hz (for tests and docs). */
export function cascadeGain(sections, frequency, fs) {
  const w = (2 * Math.PI * frequency) / fs;
  let magnitude = 1;
  for (const [b0, b1, b2, , a1, a2] of sections) {
    const cr1 = Math.cos(w), ci1 = -Math.sin(w), cr2 = Math.cos(2 * w), ci2 = -Math.sin(2 * w);
    const nr = b0 + b1 * cr1 + b2 * cr2, ni = b1 * ci1 + b2 * ci2;
    const dr = 1 + a1 * cr1 + a2 * cr2, di = a1 * ci1 + a2 * ci2;
    magnitude *= Math.hypot(nr, ni) / Math.hypot(dr, di);
  }
  return magnitude;
}

/**
 * Standard second-order IIR notch (same formula as scipy.signal.iirnotch).
 * @returns {number[]} one SOS section
 */
export function iirNotch(frequency, fs, q = 30) {
  const w = (2 * Math.PI * frequency) / fs;
  const beta = Math.tan(w / (2 * q));
  const gain = 1 / (1 + beta);
  return [gain, -2 * gain * Math.cos(w), gain, 1, -2 * gain * Math.cos(w), 2 * gain - 1];
}
