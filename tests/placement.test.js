import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { placementSheet, placementSvg, placementViews, sitePosition, spreadLabels } from '../src/ui/components/placement.js';
import { sharedReason } from '../src/lab/viewmodel.js';
import * as berger from '../apps/berger/config.js';
import * as breathwork from '../apps/breathwork/config.js';

const APPS = [
  { name: 'berger', config: berger, tabs: ['setup', 'signal', 'protocol', 'results'] },
  { name: 'breathwork', config: breathwork, tabs: ['setup', 'signal', 'protocol', 'results', 'recordings'] },
];

const montages = APPS.flatMap(({ name, config }) => Object.entries(config.MONTAGES).map(([id, montage]) => ({ id: `${name}/${id}`, leads: montage.leads })));

test('placement: every lead of every montage is drawn on a plate, with its pin', () => {
  assert.ok(montages.length >= 3);
  for (const { id, leads } of montages) {
    const views = placementViews(leads);
    assert.ok(views.length >= 1 && views.length <= 3, id);
    const drawn = views.map((view) => placementSvg(view, leads)).join('');
    for (const lead of leads) {
      assert.ok(views.some((view) => sitePosition(view, lead.site)), `${id}: site ${lead.site} is on no plate`);
      assert.ok(drawn.includes(lead.pin), `${id}: pin ${lead.pin} is not labelled`);
    }
  }
});

/** What an illustration must never change by accident: markers, their colours and every label. */
function plateFacts(view, leads) {
  const svg = placementSvg(view, leads);
  const markers = [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="8" fill="([^"]+)" stroke="([^"]+)"/g)].map((m) => m.slice(1, 5).join(' '));
  const labels = [...svg.matchAll(/<text x="(\d+)" y="([\d.]+)" text-anchor="(start|end)"[^>]*font-size="(?:16|13)"[^>]*>([^<]+)<\/text>/g)].map((m) => m.slice(1, 5).join(' '));
  return { markers, labels };
}

test('placement: marker positions, colours and labels match the reviewed plates', () => {
  const url = new URL('./helpers/placement-golden.json', import.meta.url);
  const facts = Object.fromEntries(montages.map(({ id, leads }) => [id, Object.fromEntries(placementViews(leads).map((view) => [view, plateFacts(view, leads)]))]));
  // Change this file only after reviewing the figures: UPDATE_PLACEMENT_GOLDEN=1 npm test
  if (process.env.UPDATE_PLACEMENT_GOLDEN) writeFileSync(url, `${JSON.stringify(facts, null, 1)}\n`);
  assert.deepEqual(facts, JSON.parse(readFileSync(url, 'utf8')));
});

test('placement: drawings hold no undefined or NaN coordinates', () => {
  for (const { id, leads } of montages) {
    const sheet = placementSheet(leads, { title: id });
    assert.doesNotMatch(sheet, /undefined|NaN|null/, id);
  }
});

test('placement: left and right are the person\'s, on every view', () => {
  const centre = 300;
  // Front: seen from facing the person, so their left is on the right of the picture.
  assert.ok(sitePosition('front', 'chest-left').x > centre);
  assert.ok(sitePosition('front', 'chest-right').x < centre);
  assert.ok(sitePosition('front', 'eye-left').x > centre);
  assert.ok(sitePosition('front', 'eye-right').x < centre);
  // Back and top: seen from behind or above, so their left is on the left of the picture.
  assert.ok(sitePosition('back', 'M1').x < centre);
  assert.ok(sitePosition('back', 'M2').x > centre);
  assert.ok(sitePosition('top', 'M1').x < centre);
  assert.ok(sitePosition('top', 'M2').x > centre);
  // Oz is at the back of the head: to the right of Cz on a left-side view, at the bottom from above.
  assert.ok(sitePosition('side', 'Oz').x > sitePosition('side', 'Cz').x);
  assert.ok(sitePosition('top', 'Oz').y > sitePosition('top', 'Cz').y);
});

test('placement: labels keep their spacing and stay on the plate', () => {
  const out = spreadLabels([100, 101, 102, 600, 601], { gap: 44, top: 84, bottom: 570 });
  assert.equal(out.length, 5);
  for (let i = 1; i < out.length; i++) assert.ok(out[i] - out[i - 1] >= 44 - 1e-9);
  assert.ok(out[0] >= 84 && out.at(-1) <= 570);
});

for (const { name, config, tabs } of APPS) {
  test(`guide (${name}): steps point at real protocols and tabs, and every protocol is described`, () => {
    const { GUIDE, protocolEntries } = config;
    const entries = protocolEntries({ simulated: true });
    const names = entries.map((entry) => entry.name);
    for (const step of GUIDE.steps) {
      assert.ok(step.title && step.text, step.title);
      if (step.protocol) assert.ok(names.includes(step.protocol), `${step.title}: ${step.protocol}`);
      if (step.tab) assert.ok(tabs.includes(step.tab), `${step.title}: ${step.tab}`);
    }
    for (const key of Object.keys(GUIDE.protocols)) assert.ok(names.includes(key), key);
    for (const entry of entries) assert.ok(GUIDE.protocols[entry.name]?.purpose, entry.name);
  });

  test(`guide (${name}): the block tables can be built from the definitions`, () => {
    for (const entry of config.protocolEntries({ simulated: true })) {
      const { blocks } = entry.create();
      assert.ok(blocks.length > 0, entry.name);
      for (const block of blocks) {
        assert.ok(block.label && block.seconds > 0 && block.instruction, `${entry.name}: ${block.label}`);
      }
    }
  });
}

test('protocol reasons: shown once only when every protocol shares the same one', () => {
  assert.equal(sharedReason(['Connect first.', 'Connect first.']), 'Connect first.');
  assert.equal(sharedReason(['Connect first.', null]), null);
  assert.equal(sharedReason([null, null]), null);
  assert.equal(sharedReason(['A', 'B']), null);
  assert.equal(sharedReason(['Only one.']), null);
  assert.equal(sharedReason([]), null);
});

test('a phone plate keeps every marker position and pin of the full plate', () => {
  const positions = (svg, r) => [...svg.matchAll(new RegExp(`<circle cx="([\\d.]+)" cy="([\\d.]+)" r="${r}"`, 'g'))].map((m) => `${m[1]},${m[2]}`);
  for (const { leads } of [berger.MONTAGES.single, breathwork.MONTAGES['breath-6ch']]) {
    for (const view of placementViews(leads)) {
      const full = placementSvg(view, leads);
      const phone = placementSvg(view, leads, { compact: true });
      assert.deepEqual(positions(phone, 11), positions(full, 8));
      for (const lead of leads) if (full.includes(lead.pin)) assert.ok(phone.includes(lead.pin), lead.pin);
    }
  }
});
