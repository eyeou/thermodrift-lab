import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { BERGER_EXAMPLE, BREATHWORK_EXAMPLE, EXAMPLE_NOTE, heartRateSvg, pairsSvg, slowingSvg, spectrumSvg } from '../src/ui/components/example-results.js';

const listFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));

test('example results: every chart is marked as an example, in its picture and in its label', () => {
  for (const svg of [pairsSvg(BERGER_EXAMPLE), spectrumSvg(), heartRateSvg(BREATHWORK_EXAMPLE), slowingSvg(BREATHWORK_EXAMPLE)]) {
    assert.match(svg, />EXAMPLE</);
    assert.match(svg, /aria-label="Example, not a recording\./);
  }
  assert.match(EXAMPLE_NOTE, /Not a recording/);
});

test('example results: the figures shown agree with each other', () => {
  for (const p of BERGER_EXAMPLE.pairs) assert.equal(p.ratio, Math.round((p.closed / p.open) * 10) / 10);
  assert.equal(BERGER_EXAMPLE.higher_closed, BERGER_EXAMPLE.pairs.length);
  assert.ok(BREATHWORK_EXAMPLE.bpm.every(Number.isFinite));
  assert.equal(BREATHWORK_EXAMPLE.bpm.length * BREATHWORK_EXAMPLE.step_s, 1320);
  const { eeg, rest } = BREATHWORK_EXAMPLE;
  assert.equal(eeg.theta.length, eeg.points.length);
  assert.equal(eeg.alpha.length, eeg.points.length);
  const closed = rest.find(([measure]) => measure.startsWith('Alpha at Oz, eyes closed'));
  assert.equal(eeg.alpha.at(-1), Math.round((Number(closed[2]) / Number(closed[1])) * 100) / 100);
});

test('example results stay in the view: acquisition, storage and export code never import them', () => {
  for (const dir of ['src/lab', 'src/session', 'src/core', 'src/analysis', 'src/protocol', 'src/transport']) {
    for (const file of listFiles(dir)) assert.doesNotMatch(readFileSync(file, 'utf8'), /example-results/, file);
  }
});
