import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDiskMirror } from '../src/session/disk-mirror.js';

const row = (index) => ({ index, arrival_ms: index * 2, counter: index % 256, phase: 'idle', channels: [1, 2, 3, 4, 5, 6] });

function harness({ fail = () => false } = {}) {
  const posts = [];
  const mirror = createDiskMirror({
    now: () => 0,
    fetchImpl: async (url, init) => {
      if (url === '/__mirror/status') return { ok: true };
      if (fail()) throw new Error('down');
      posts.push({ url, body: init.body });
      return { ok: true };
    },
  });
  return { mirror, posts };
}

test('stays off until the server says it is on', async () => {
  const mirror = createDiskMirror({ fetchImpl: async () => ({ ok: false }) });
  assert.equal(await mirror.probe(), false);
  mirror.row('s1', row(0));
  assert.equal(mirror.pendingRows, 0);
});

test('writes the header once, then rows in order', async () => {
  const { mirror, posts } = harness();
  await mirror.probe();
  mirror.row('s1', row(0));
  await mirror.flush();
  mirror.row('s1', row(1));
  await mirror.flush();
  const raw = posts.filter((p) => p.url.includes('raw.csv')).map((p) => p.body);
  assert.equal(raw.length, 2);
  assert.match(raw[0], /^sample_index,/);
  assert.doesNotMatch(raw[1], /^sample_index,/);
  assert.match(raw[1], /^1,2\.0,1,idle,1,2,3,4,5,6\n$/);
});

test('a failed write keeps the rows for the next attempt, in order', async () => {
  let down = true;
  const { mirror, posts } = harness({ fail: () => down });
  await mirror.probe();
  mirror.row('s1', row(0));
  await mirror.flush();
  assert.equal(mirror.state.failed, true);
  assert.equal(mirror.pendingRows, 1);
  mirror.row('s1', row(1));
  down = false;
  await mirror.flush();
  assert.equal(mirror.state.failed, false);
  const lines = posts[0].body.trim().split('\n');
  assert.equal(lines.length, 3);
  assert.match(lines[1], /^0,/);
  assert.match(lines[2], /^1,/);
});
