/**
 * SYNTHETIC TEST SIGNALS — for isolated tests only. Nothing here is physiology and nothing here
 * is importable by the apps (see tests/boundaries.test.js).
 */
import { encodePacket } from '../src/core/packets.js';

/** Deterministic PRNG (mulberry32). */
export function prng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gaussian noise via Box–Muller. */
export function gaussian(random) {
  const u = Math.max(random(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random());
}

/** Sum of sines (amplitude in counts) around a 2048-count midpoint, rounded and clamped to 12 bits. */
export function tones(n, components, { fs = 500, offset = 2048, noise = 0, seed = 7, start = 0 } = {}) {
  const random = prng(seed);
  return Array.from({ length: n }, (_, i) => {
    const t = (start + i) / fs;
    let v = offset;
    for (const { f, a, phase = 0 } of components) v += a * Math.sin(2 * Math.PI * f * t + phase);
    if (noise) v += noise * gaussian(random);
    return Math.max(0, Math.min(4095, Math.round(v)));
  });
}

/** Wrap per-sample channel arrays into 10-record notifications with an 8-bit counter. */
export function toNotifications(channelsPerSample, { counterStart = 0, perPacket = 10 } = {}) {
  const packets = [];
  for (let i = 0; i < channelsPerSample.length; i += perPacket) {
    const records = channelsPerSample.slice(i, i + perPacket).map((channels, j) => ({ counter: (counterStart + i + j) & 0xff, channels }));
    packets.push(encodePacket(records));
  }
  return packets;
}
