import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buttonAction, parseButton } from '../apps/breathwork/button.js';

const base = { acquiring: true, videoRunning: false };

test('parses clicks and the time since the first press', () => {
  assert.deepEqual(parseButton('BTN2:612'), { clicks: 2, offsetMs: 612 });
  assert.deepEqual(parseButton('BTN'), { clicks: 1, offsetMs: 0 });
  assert.equal(parseButton('UNKNOWN COMMAND'), null);
  assert.equal(parseButton('TD-STATUS-3'), null);
});

test('one click is a marker, even during a protocol', () => {
  assert.deepEqual(buttonAction(1, base), { kind: 'marker' });
});

test('two clicks toggle the video', () => {
  assert.deepEqual(buttonAction(2, base), { kind: 'video', to: 'start' });
  assert.deepEqual(buttonAction(2, { ...base, videoRunning: true }), { kind: 'video', to: 'end' });
});

test('three clicks do nothing, and nothing acts without acquisition', () => {
  assert.equal(buttonAction(3, base).kind, 'refuse');
  for (const clicks of [1, 2, 3]) assert.equal(buttonAction(clicks, { ...base, acquiring: false }).kind, 'refuse');
});
