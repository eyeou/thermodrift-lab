/**
 * SIMULATED TEST PATTERN — for demonstrating and testing the interface without a body or a board.
 * It emits the real NPG packet format (6 channels, 10 records per notification, 8-bit counter)
 * carrying a fixed, non-physiological pattern: a constant 10 Hz tone, 50 Hz hum and noise.
 * Nothing in it responds to protocol prompts, so a "Berger effect" cannot appear in simulated
 * data. Sessions it produces are tagged source.kind = 'simulated' everywhere.
 *
 * Timing: samples are produced from elapsed time (500 Hz), not from timer ticks, so a throttled
 * tab receives late bursts — like queued BLE notifications — instead of silently losing samples.
 * A backlog beyond `maxBacklogMs` is dropped and the counter skips, which the app sees as a gap.
 */
import { encodePacket } from '../core/packets.js';

export function createSimulatedTransport({ now = () => performance.now(), setIntervalFn = globalThis.setInterval, clearIntervalFn = globalThis.clearInterval, seed = 12345, maxBacklogMs = 2000 } = {}) {
  const listeners = { packet: new Set(), disconnected: new Set() };
  let timer = null, counter = 0, sample = 0, connected = false, stalled = false;
  let startedAt = 0, produced = 0;
  let s = seed >>> 0;
  const random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const noise = () => Math.sqrt(-2 * Math.log(Math.max(random(), 1e-12))) * Math.cos(2 * Math.PI * random());
  const packet = () => {
    const records = [];
    for (let i = 0; i < 10; i++, sample++) {
      const t = sample / 500;
      const ch1 = 2048 + 18 * Math.sin(2 * Math.PI * 10 * t) + 40 * Math.sin(2 * Math.PI * 50 * t) + 6 * noise();
      const channels = [ch1, 2048 + 3 * noise(), 2048 + 3 * noise(), 2048 + 3 * noise(), 2048 + 3 * noise(), 2048 + 3 * noise()].map((v) => Math.max(0, Math.min(4095, Math.round(v))));
      records.push({ counter: counter++ & 0xff, channels });
    }
    return encodePacket(records);
  };
  const tick = () => {
    const due = Math.floor((now() - startedAt) / 2);
    if (stalled) { produced = due; return; } // link frozen: those samples never arrive, counter does not move
    const backlog = due - produced;
    if (backlog > maxBacklogMs / 2) {
      const dropped = backlog - maxBacklogMs / 2;
      produced += dropped;
      sample += dropped;
      counter += dropped; // visible as a counter gap (8-bit: multiples of 256 would hide it)
    }
    const arrival = now();
    while (produced + 10 <= due) {
      const view = packet();
      produced += 10;
      for (const fn of listeners.packet) fn(view, arrival);
    }
  };
  return {
    kind: 'simulated',
    transportName: 'simulated-test-pattern',
    label: 'Simulated test pattern (synthetic, not a recording)',
    supported: true,
    on(event, fn) { listeners[event].add(fn); return () => listeners[event].delete(fn); },
    async connect() {
      connected = true;
      return { deviceName: 'SIMULATED-TEST-PATTERN' };
    },
    async start() {
      if (!connected) throw new Error('Not connected');
      counter = 0; // the real firmware resets its counter on START
      startedAt = now();
      produced = 0;
      timer = setIntervalFn(tick, 20);
    },
    async stop() {
      if (timer) clearIntervalFn(timer);
      timer = null;
    },
    async disconnect() {
      if (timer) clearIntervalFn(timer);
      timer = null;
      connected = false;
    },
    /** Demo helpers for the catalogue: freeze the stream or drop the link. */
    simulateStall(on = true) { stalled = on; },
    simulateDisconnect() {
      if (timer) clearIntervalFn(timer);
      timer = null;
      connected = false;
      for (const fn of listeners.disconnected) fn({ reason: 'Simulated link loss' });
    },
    /** Test helper: run one timer tick now. */
    tick,
  };
}
