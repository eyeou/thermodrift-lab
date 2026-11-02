// Result charts: headings stay true for any session, marks and units stay honest. Synthetic values only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { theme } from '../src/design/theme.js';
import { pairedResults } from '../src/analysis/berger-v3.js';
import { pairFinding, pairHero, pairsChart, pairsFromResults, restChart, restFinding, restHero, spanLabels, timeCourseChart, timeCourseFinding, timeCourseFrom } from '../src/ui/charts/report.js';

const WIDTHS = [340, 1040];
const assertClean = (svg, label) => assert.doesNotMatch(svg, /NaN|undefined|null|Infinity/, label);

test('pair headings follow the counts of the session, whatever they are', () => {
  for (let n = 0; n <= 4; n++) {
    for (let k = 0; k <= n; k++) {
      const heading = pairFinding({ eligible_count: n, higher_closed_count: k });
      const course = timeCourseFinding({ eligible_count: n, higher_closed_count: k });
      if (n === 0) {
        assert.doesNotMatch(heading, /higher/, 'no eligible pair: no direction claimed');
        assert.doesNotMatch(course, /higher/);
      } else if (k === 0) {
        assert.match(heading, /not higher/, `${k} of ${n}`);
        assert.match(course, /none of|does not read higher/, `${k} of ${n}`);
      } else if (k === n) {
        assert.doesNotMatch(heading, /not higher/);
        assert.match(heading, n === 1 ? /the one eligible pair/ : new RegExp(`all ${n} eligible pairs`));
      } else {
        assert.match(heading, new RegExp(`${k} of ${n} eligible pairs`));
        assert.match(course, new RegExp(`${k} of ${n} eligible pairs`));
      }
    }
  }
});

test('a session without an eye effect never gets a heading that claims one', () => {
  const blocks = [1, 2, 3, 4].flatMap((p) => ['open', 'closed'].map((state, i) => ({ id: p * 10 + i, protocol_id: 1, label: `eyes_${state}_pair${p}`, complete: true })));
  const windowsOf = (block) => [0, 1, 2].map((k) => ({ block_id: block.id, channel: 0, accepted_for_block: true, reasons: [], filtered_alpha: block.label.startsWith('eyes_closed') ? 40 + k : 50 + k, bp: { alpha: 50 }, relative_alpha: 0.5 }));
  const res = pairedResults({ blocks, windows: blocks.flatMap(windowsOf), protocolId: 1, adherenceOf: () => 'as_instructed' });
  assert.equal(res.eligible_count, 4);
  assert.equal(res.higher_closed_count, 0);
  assert.match(pairFinding(res), /not higher with the eyes closed in any of the 4/);
  assert.match(timeCourseFinding(res), /none of the 4/);
  assert.equal(pairHero(res).value, `${res.median_ratio.toFixed(2)}×`, 'the hero is the computed ratio, unchanged');

  const pending = pairedResults({ blocks, windows: blocks.flatMap(windowsOf), protocolId: 1, adherenceOf: () => 'unconfirmed' });
  assert.equal(pending.eligible_count, 0);
  assert.equal(pairFinding(pending), 'No pair can be compared yet');
  assert.equal(pairHero(pending), null, 'no eligible pair, no hero');
  const svg = pairsChart({ pairs: pairsFromResults(pending) });
  assert.match(svg, />review</, 'the reason is on the chart');
  assert.match(svg, />Hatched: not eligible</);
  assert.doesNotMatch(svg, />[\d.]+×</, 'no ratio on a pair that is not eligible');
});

test('rest headings follow the eligible row, and say so when there is none', () => {
  const row = (state, ratio, status = 'eligible') => ({ state, status, before: { alpha: 10 }, after: { alpha: 10 * (ratio ?? 1) }, alpha_ratio_after_before: status === 'eligible' ? ratio : null });
  assert.match(restFinding([row('open', 2), row('closed', 0.5)]), /^Eyes-closed alpha is lower/);
  assert.match(restFinding([row('open', 0.5), row('closed', 2)]), /^Eyes-closed alpha is higher/);
  assert.match(restFinding([row('open', 1), row('closed', 1.001)]), /reads the same/, 'what the table shows as 1.00×');
  assert.match(restFinding([row('open', 2), row('closed', null, 'too_few_windows')]), /^Eyes-open alpha is higher/, 'the row that can be read');
  assert.match(restFinding([row('open', null, 'missing_block'), row('closed', null, 'excluded')]), /cannot be compared/);
  assert.deepEqual(restHero([row('open', 2), row('closed', 0.5)]), { value: '0.50×', definition: 'alpha after ÷ before, eyes closed' });
  assert.equal(restHero([row('open', null, 'missing_block'), row('closed', null, 'excluded')]), null);
});

test('rest chart: ring for before, filled for after, reason for a row that is not eligible', () => {
  const rows = [
    { state: 'open', status: 'eligible', before: { alpha: 10 }, after: { alpha: 12 }, alpha_ratio_after_before: 1.2 },
    { state: 'closed', status: 'too_few_windows', before: { alpha: 90 }, after: null, alpha_ratio_after_before: null },
  ];
  for (const width of WIDTHS) {
    const svg = restChart({ rows, width });
    assertClean(svg, width);
    assert.match(svg, />1\.20×</);
    assert.match(svg, />too few/, 'the reason replaces the ratio');
    assert.match(svg, />Rest before</);
    assert.match(svg, /count-equiv\.²/);
  }
});

test('marks: a simulated chart says so and is hatched, a recording carries no mark, an example is stamped', () => {
  const pairs = [{ pair: 1, open: 10, closed: 20, status: 'eligible', ratio: 2 }];
  for (const width of WIDTHS) {
    const simulated = pairsChart({ pairs, width, mark: 'simulated' });
    assert.match(simulated, />SIMULATED/);
    assert.match(simulated, /aria-label="Simulated test pattern, not a recording\./);
    assert.match(simulated, new RegExp(`stroke="${theme.color.status.simulated}" stroke-opacity`), 'hatched plot');
    const recorded = pairsChart({ pairs, width });
    assert.doesNotMatch(recorded, /SIMULATED|EXAMPLE|not a recording/);
    assert.match(pairsChart({ pairs, width, mark: 'example' }), />EXAMPLE</);
  }
});

const window = (mid_ms, value, state = 'open', good = true) => ({ mid_ms, value, state, good });
const blocks = [{ label: 'eyes_open_pair1', start_arrival_ms: 0, end_arrival_ms: 60000 }];

test('time course: a gap or a rejected window is never bridged', () => {
  const polylines = (svg) => [...svg.matchAll(/<polyline/g)].length;
  const count = (points) => polylines(timeCourseChart({ windows: points, blocks }));
  const run = [window(4000, 10), window(8200, 11), window(12400, 12)];
  assert.equal(count(run), 1, 'contiguous windows are joined');
  assert.equal(count([...run, window(30000, 10), window(34200, 11)]), 2, 'a time gap breaks the line');
  assert.equal(count([window(4000, 10), window(8200, 11), window(12400, 99, 'open', false), window(16600, 10), window(20800, 11)]), 2, 'a rejected window breaks the line');
  assert.equal(count([window(4000, 10), window(8200, 11, 'closed')]), 0, 'another prompted state is not joined');
  const svg = timeCourseChart({ windows: [window(4000, 10, 'open', false)], blocks });
  assert.match(svg, /fill="none"[^>]*stroke-width="1\.2"/, 'a rejected window is hollow');
  assert.match(svg, />Hollow: rejected or not counted</);
});

test('time course: operator text is escaped, empty data show a message, the axis names its unit', () => {
  for (const width of WIDTHS) {
    const svg = timeCourseChart({ windows: [window(4000, 10)], blocks, markers: [{ arrival_ms: 5000, note: '<img src=x onerror=alert(1)> & "q"' }], width });
    assert.doesNotMatch(svg, /<img/);
    assert.match(svg, /&lt;img/);
    assert.match(svg, /count-equiv\.²/);
    assert.doesNotMatch(svg, /µV|microvolt|PSD/);
    assertClean(svg, width);
    const empty = timeCourseChart({ windows: [], blocks, width });
    assert.match(empty, />No analysis windows yet</);
    assertClean(empty, width);
    const none = pairsChart({ pairs: [{ pair: 1, open: null, closed: null, status: 'review_adherence', ratio: null }], width });
    assert.match(none, />No complete pairs yet</);
    assertClean(none, width);
  }
});

test('time course: reads stored windows as the analysis wrote them', () => {
  const stored = [
    { channel: 0, arrival_ms: 10000, phase: 'eyes_closed_pair1', filtered_alpha: 5, accepted_for_block: true, reasons: [] },
    { channel: 0, arrival_ms: 15000, phase: 'eyes_open_pair1', filtered_alpha: 6, accepted_for_block: false, reasons: [] },
    { channel: 0, arrival_ms: 20000, phase: 'settling_eyes_open', filtered_alpha: 7, accepted_for_block: true, reasons: ['Flat signal'] },
    { channel: 1, arrival_ms: 10000, phase: 'eyes_closed_pair1', filtered_alpha: 99, accepted_for_block: true, reasons: [] },
  ];
  const course = timeCourseFrom({
    blocks: [{ label: 'eyes_closed_pair1', start_arrival_ms: 2000, end_arrival_ms: 30000 }],
    windows: stored,
    markers: [{ arrival_ms: 3000, note: 'in' }, { arrival_ms: 40000, note: 'after' }],
    channel: 0,
  });
  assert.equal(course.origin, 2000);
  assert.deepEqual(course.windows, [
    { mid_ms: 10000 - 2048, value: 5, state: 'closed', good: true },
    { mid_ms: 15000 - 2048, value: 6, state: 'open', good: false },
    { mid_ms: 20000 - 2048, value: 7, state: 'other', good: false },
  ]);
  assert.deepEqual(course.markers.map((m) => m.note), ['in'], 'markers of this protocol only');
});

test('span labels: the longest name that fits, an overhang only when asked for', () => {
  const spans = [{ x0: 0, x1: 300, names: ['A long name for this span', 'Short'] }, { x0: 300, x1: 310, names: ['Closing'] }];
  const plain = spanLabels(spans, { y: 10 });
  assert.match(plain.markup, />A long name for this span</);
  assert.doesNotMatch(plain.markup, />Closing</, 'a span too small goes unlabelled');
  const over = spanLabels([{ x0: 0, x1: 300, names: ['A long name for this span that fills it all up to its edge', 'Short'] }, ...spans.slice(1)], { y: 10, overhang: true });
  assert.match(over.markup, />Closing</);
});

test('result charts have their own soft pair of state colours in the theme', () => {
  assert.equal(theme.color.data['rose-soft'], '#FA8B94');
  assert.equal(theme.color.data['periwinkle-soft'], '#B6C2FF');
  assert.equal(theme.color.data.rose, '#E5606E', 'live charts keep the stepped pair');
  assert.equal(theme.color.data.periwinkle, '#6F86F2');
});
