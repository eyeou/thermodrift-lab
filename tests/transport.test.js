import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulatedTransport } from '../src/transport/simulated.js';
import { decodePacket } from '../src/core/packets.js';
import { CounterTracker } from '../src/core/continuity.js';

function harness(options = {}) {
  let t = 0;
  const transport = createSimulatedTransport({ now: () => t, setIntervalFn: () => 1, clearIntervalFn: () => {}, ...options });
  const tracker = new CounterTracker();
  const seen = { samples: 0, gaps: 0, packets: 0 };
  transport.on('packet', (view) => {
    seen.packets++;
    for (const r of decodePacket(view)) {
      const result = tracker.accept(r.counter);
      if (result.kind === 'gap') seen.gaps++;
      seen.samples++;
    }
  });
  return { transport, seen, advance: (ms) => { t += ms; transport.tick(); } };
}

test('simulator: 500 Hz from elapsed time, whatever the timer cadence', async () => {
  const { transport, seen, advance } = harness();
  await transport.connect();
  await transport.start();
  for (let i = 0; i < 50; i++) advance(20); // regular 20 ms ticks: 1 s
  assert.equal(seen.samples, 500);
  advance(1000); // one late tick, as in a throttled tab: catches up as a burst
  assert.equal(seen.samples, 1000);
  assert.equal(seen.gaps, 0);
});

test('simulator: backlog beyond the cap is dropped and shows as a counter gap', async () => {
  const { transport, seen, advance } = harness({ maxBacklogMs: 2000 });
  await transport.connect();
  await transport.start();
  advance(20);
  const before = seen.samples;
  advance(3000); // 1500 samples due, cap 1000
  assert.equal(seen.samples - before, 1000);
  assert.equal(seen.gaps, 1);
});

test('simulator: a stall delivers nothing and resumes without a burst', async () => {
  const { transport, seen, advance } = harness();
  await transport.connect();
  await transport.start();
  advance(200);
  transport.simulateStall(true);
  advance(1000);
  assert.equal(seen.samples, 100);
  transport.simulateStall(false);
  advance(20);
  assert.equal(seen.samples, 110);
});
