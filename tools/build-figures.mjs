#!/usr/bin/env node
/**
 * Writes the electrode placement sheets used by the README, from the montages in the app configs.
 *   node tools/build-figures.mjs          write docs/img/*.svg
 *   node tools/build-figures.mjs --check  exit 1 if a figure is out of date
 *   node tools/build-figures.mjs --plates <dir>  also write each view as its own SVG, a phone version of it, the lead list, and the bare front and back anatomy, for embedding
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { placementLeads, placementSheet, placementSvg, placementViews } from '../src/ui/components/placement.js';
import { MONTAGES as BERGER } from '../apps/berger/config.js';
import { MONTAGES as BREATHWORK } from '../apps/breathwork/config.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const FIGURES = [
  { file: 'placement-berger.svg', app: 'berger', title: 'Berger Effect · one EEG channel', leads: BERGER.single.leads },
  { file: 'placement-breathwork.svg', app: 'breathwork', title: 'Breathwork · six channels', leads: BREATHWORK['breath-6ch'].leads },
];

const check = process.argv.includes('--check');
let stale = 0;
mkdirSync(resolve(ROOT, 'docs/img'), { recursive: true });
for (const { file, title, leads } of FIGURES) {
  const path = resolve(ROOT, 'docs/img', file);
  const text = `${placementSheet(leads, { title })}\n`;
  if (check) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== text) {
      console.error(`Out of date: docs/img/${file}. Run: npm run figures`);
      stale++;
    }
  } else {
    writeFileSync(path, text);
    console.log(`wrote docs/img/${file} (${(text.length / 1024).toFixed(1)} kB)`);
  }
}
const plates = process.argv.indexOf('--plates');
if (plates > 0) {
  const dir = resolve(process.argv[plates + 1]);
  mkdirSync(dir, { recursive: true });
  for (const { app, leads } of FIGURES) {
    for (const view of placementViews(leads)) {
      writeFileSync(resolve(dir, `${app}-${view}.svg`), `${placementSvg(view, leads)}\n`);
      writeFileSync(resolve(dir, `${app}-${view}-compact.svg`), `${placementSvg(view, leads, { compact: true })}\n`);
    }
    writeFileSync(resolve(dir, `${app}-leads.json`), `${JSON.stringify(placementLeads(leads), null, 2)}\n`);
  }
  for (const view of ['front', 'back']) writeFileSync(resolve(dir, `anatomy-${view}.svg`), `${placementSvg(view, [])}\n`);
}
process.exit(stale ? 1 : 0);
