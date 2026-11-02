import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { BERGER_EXAMPLE, BREATHWORK_EXAMPLE, BREATHWORK_EXAMPLES, BREATHWORK_LONG_EXAMPLE, EXAMPLE_NOTE, heartRateSvg, longSessionSvg, pairsSvg, restSvg, slowingSvg, spectrumSvg, timeCourseSvg } from '../src/ui/components/example-results.js';
import { SESSION_FORMATS } from '../apps/breathwork/config.js';

const listFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listFiles(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));

test('example results: every chart is marked as an example, in its picture and in its label', () => {
  for (const width of [340, 520, 1040]) {
    const options = { width };
    for (const svg of [timeCourseSvg(BERGER_EXAMPLE, options), pairsSvg(BERGER_EXAMPLE, options), spectrumSvg(options), heartRateSvg(BREATHWORK_EXAMPLE, options), slowingSvg(BREATHWORK_EXAMPLE, options), restSvg(BREATHWORK_EXAMPLE, options), longSessionSvg(BREATHWORK_LONG_EXAMPLE, options)]) {
      assert.match(svg, />EXAMPLE</);
      assert.match(svg, /aria-label="Example, not a recording\./);
      assert.doesNotMatch(svg, /NaN|undefined|µV|PSD/);
    }
  }
  assert.equal(EXAMPLE_NOTE, 'Not a recording. Inspired by real data, smoothed and rounded.');
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

test('example results: each Breathwork format shows its own', () => {
  assert.deepEqual(Object.keys(BREATHWORK_EXAMPLES), Object.keys(SESSION_FORMATS));
  assert.equal(BREATHWORK_EXAMPLES['wim-hof-style'], BREATHWORK_EXAMPLE);
  assert.equal(BREATHWORK_EXAMPLES['holotropic-style'], BREATHWORK_LONG_EXAMPLE);
});

test('example results: the long format has the shape its heading and reading state', () => {
  const e = BREATHWORK_LONG_EXAMPLE;
  const at = (series, minute) => series[minute / e.step_min];
  const between = (series, from, to) => series.filter((_, i) => i * e.step_min >= from && i * e.step_min <= to);

  assert.equal(e.phases[0].start, 0);
  assert.equal(e.phases.at(-1).end, 70, 'about 70 minutes');
  e.phases.slice(1).forEach((p, i) => assert.equal(p.start, e.phases[i].end, 'the phases leave no gap'));
  assert.deepEqual(e.phases.filter((p) => p.kind !== 'rest').map((p) => [p.kind, (p.end - p.start) * 60]), SESSION_FORMATS['holotropic-style'].parts.map((p) => [p.kind, p.seconds]), 'the plan the Protocol tab shows');
  for (const series of [e.breathing, e.heart, e.theta, e.alpha]) {
    assert.equal(series.length, 141);
    assert.ok(series.every(Number.isFinite) && series.every((v) => v > 0));
  }

  assert.ok(between(e.theta, 0, 7).every((v) => Math.abs(v - 1) <= 0.1), 'theta is flat for the first minutes');
  const peak = Math.max(...e.theta);
  assert.ok(peak >= 7.5 && peak <= 8.5, `theta peaks at about 8×: ${peak}`);
  assert.equal(e.theta_plateau, Math.round(peak));
  assert.ok(between(e.theta, 28, 47).every((v) => v >= 7), 'theta stays up until the recovery');
  assert.ok(at(e.theta, 60) < 2, 'and comes down during it');

  assert.ok(Math.abs(at(e.alpha, 0) - 1) <= 0.1);
  assert.ok(between(e.alpha, 28, 47).every((v) => Math.abs(v - e.alpha_plateau) <= 0.05), 'alpha falls over the same stretch');
  assert.ok(at(e.alpha, 70) < 0.9, 'alpha stays below its starting level');

  assert.ok(between(e.breathing, 8, 42).every((v) => v >= 3.5 && v <= 5), 'breathing stays about fourfold');
  assert.ok(between(e.breathing, 52, 70).every((v) => Math.abs(v - 1) <= 0.1), 'breathing settles in the recovery');
  assert.ok(at(e.heart, 20) > at(e.heart, 0) + 20, 'heart rate climbs with the breathing');
  assert.ok(between(e.heart, 55, 70).every((v) => v <= 75), 'heart rate settles in the recovery');

  const reading = e.reading.join(' ');
  assert.match(reading, /sustained high ventilation lowers CO₂ and brain blood flow, which slows the EEG/);
  assert.match(reading, /Without a CO₂ sensor this stays an interpretation/);
  assert.match(reading, /does not show the breathing caused it/);
});

test('example results: the long chart keeps one scale per row on one time axis', () => {
  for (const width of [256, 300, 340, 520, 1040]) {
    const svg = longSessionSvg(BREATHWORK_LONG_EXAMPLE, { width });
    for (const words of ['Breathing, depth × rate', 'Heart rate (bpm)', 'Theta and alpha at Oz', 'Theta 8×', 'Alpha 0.4×', width < 300 ? '>Minutes from the start<' : '>Minutes from the start of the rest before<', '>70<', 'Theta 4–8 Hz', 'Alpha 8–13 Hz']) assert.ok(svg.includes(words), `${width}: ${words}`);
    assert.equal(svg.match(/<path d="M[^"]*" fill="none" stroke="[^"]*" stroke-width="1\.7"/g).length, 4, 'breathing, heart rate, theta and alpha');
    const anchored = [...svg.matchAll(/<text x="(-?[\d.]+)"/g)].map((m) => Number(m[1]));
    assert.ok(anchored.every((v) => v >= 0 && v <= width), `${width}: every label inside the picture`);
  }
});

test('example results stay in the view: acquisition, storage and export code never import them', () => {
  const files = ['src/lab', 'src/session', 'src/core', 'src/analysis', 'src/protocol', 'src/transport'].flatMap(listFiles);
  for (const file of [...files, 'apps/breathwork/config.js', 'apps/berger/config.js', 'apps/registry.js', 'apps/report/main.js', 'apps/report/review.js']) assert.doesNotMatch(readFileSync(file, 'utf8'), /example-results/, file);
});
