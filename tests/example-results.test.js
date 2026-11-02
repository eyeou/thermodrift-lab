import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { BERGER_EXAMPLE, BREATHWORK_EXAMPLE, EXAMPLE_NOTE, heartRateSvg, pairsSvg, restSvg, slowingSvg, spectrumSvg, timeCourseSvg } from '../src/ui/components/example-results.js';

const listFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));

test('example results: every chart is marked as an example, in its picture and in its label', () => {
  for (const width of [340, 520, 1040]) {
    const options = { width };
    for (const svg of [timeCourseSvg(BERGER_EXAMPLE, options), pairsSvg(BERGER_EXAMPLE, options), spectrumSvg(options), heartRateSvg(BREATHWORK_EXAMPLE, options), slowingSvg(BREATHWORK_EXAMPLE, options), restSvg(BREATHWORK_EXAMPLE, options)]) {
      assert.match(svg, />EXAMPLE</);
      assert.match(svg, /aria-label="Example, not a recording\./);
      assert.doesNotMatch(svg, /NaN|undefined|µV|PSD/);
    }
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
  for (const row of BREATHWORK_EXAMPLE.rest_alpha) {
    const shown = rest.find(([measure]) => measure.startsWith(`Alpha at Oz, eyes ${row.state}`));
    assert.deepEqual([String(row.before.alpha), String(row.after.alpha)], shown.slice(1), 'the rest chart and the table agree');
    assert.equal(row.alpha_ratio_after_before, Math.round((row.after.alpha / row.before.alpha) * 100) / 100);
  }
});

test('example results: the Berger time course agrees with its pairs', () => {
  const { time_course: course, pairs } = BERGER_EXAMPLE;
  const middle = (values) => { const s = [...values].sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };
  for (const p of pairs) {
    for (const state of ['open', 'closed']) {
      const block = course.blocks.find((b) => b.label === `eyes_${state}_pair${p.pair}`);
      const values = course.windows.filter((w) => w.state === state && w.mid_ms >= block.start_arrival_ms && w.mid_ms < block.end_arrival_ms).map((w) => w.value);
      assert.ok(values.length >= 2, block.label);
      assert.ok(Math.abs(middle(values) - p[state]) <= 0.02 * p[state], `${block.label}: median ${middle(values)} against ${p[state]}`);
    }
  }
  const firsts = course.blocks.filter((b) => /pair\d$/.test(b.label)).filter((_, i) => i % 2 === 0).map((b) => b.label.includes('open'));
  assert.equal(firsts.filter(Boolean).length, 2, 'two pairs start eyes open, two eyes closed');
  assert.equal(course.blocks.at(-1).end_arrival_ms, 560000, 'as long as the test with 60 s blocks');
});

test('example results stay in the view: acquisition, storage and export code never import them', () => {
  for (const dir of ['src/lab', 'src/session', 'src/core', 'src/analysis', 'src/protocol', 'src/transport']) {
    for (const file of listFiles(dir)) assert.doesNotMatch(readFileSync(file, 'utf8'), /example-results/, file);
  }
});
