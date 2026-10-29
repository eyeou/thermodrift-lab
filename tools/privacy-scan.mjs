#!/usr/bin/env node
/**
 * Release gate: scans every file Git would publish (tracked + untracked, minus .gitignore) for
 * private material: personal paths, credentials, raw recordings, bundled fonts, oversized files.
 * Exit code 1 when anything is found. Patterns are assembled from fragments so this file does not
 * match itself.
 *
 *   node tools/privacy-scan.mjs [--list]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SELF = 'tools/privacy-scan.mjs';
const MAX_BYTES = 1_000_000;
const j = (...parts) => parts.join('');

const CONTENT_RULES = [
  { id: 'home-path', re: new RegExp(j('/', 'Users', '/[A-Za-z0-9._-]+'), 'g') },
  { id: 'home-path', re: new RegExp(j('/', 'home', '/[a-z][a-z0-9_-]+/'), 'g') },
  { id: 'personal-name', re: new RegExp(j('emeric', 'yeou'), 'gi') },
  { id: 'vault-name', re: new RegExp(j('Kyrie', ' Thermo'), 'g') },
  { id: 'cloud-path', re: new RegExp(j('Mobile', ' Documents'), 'g') },
  { id: 'app-support', re: new RegExp(j('Application', ' Support'), 'g') },
  { id: 'compound-token', re: new RegExp(j('mcp', '-token'), 'gi') },
  { id: 'private-manifest', re: new RegExp(j('private-source', '-manifest'), 'g') },
  { id: 'private-key', re: new RegExp(j('-----BEGIN ', '[A-Z ]*PRIVATE KEY'), 'g') },
  { id: 'github-token', re: new RegExp(j('gh', '[pousr]_[A-Za-z0-9]{20,}'), 'g') },
  { id: 'api-key', re: new RegExp(j('sk', '-[A-Za-z0-9_-]{20,}'), 'g') },
  { id: 'aws-key', re: new RegExp(j('AK', 'IA[0-9A-Z]{16}'), 'g') },
  { id: 'email', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, allow: [/^noreply@/, /@example\.(com|org)$/, /^[^@]+@users\.noreply\.github\.com$/] },
  { id: 'recording-stem', re: new RegExp(j('berger-lab-2026', '-\\d\\d-\\d\\dT'), 'g') },
];

const NAME_RULES = [
  { id: 'raw-recording', re: /(-raw|-windows)\.csv$|-metadata\.json$/ },
  { id: 'archive', re: /\.(zip|tar|gz|7z)$/ },
  { id: 'font-file', re: /\.(ttf|otf|woff2?)$/i },
  { id: 'env-file', re: /(^|\/)\.env(\.|$)/ },
  { id: 'agent-instructions', re: /(^|\/)(CLAUDE|AGENTS)\.md$/ },
  { id: 'notebook-output', re: /\.ipynb$/ },
];

const TEXT = new Set(['.js', '.mjs', '.cjs', '.json', '.md', '.html', '.css', '.yml', '.yaml', '.txt', '.svg', '.py', '.toml', '']);

function candidates() {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: ROOT });
  return out.toString('utf8').split('\0').filter(Boolean).sort();
}

const files = candidates();
if (process.argv.includes('--list')) for (const f of files) console.log(f);
const findings = [];
for (const file of files) {
  for (const rule of NAME_RULES) if (rule.re.test(file)) findings.push({ file, rule: rule.id, detail: 'file name' });
  const size = statSync(resolve(ROOT, file)).size;
  if (size > MAX_BYTES) findings.push({ file, rule: 'oversized', detail: `${(size / 1e6).toFixed(1)} MB` });
  if (file === SELF || !TEXT.has(extname(file))) continue;
  const text = readFileSync(resolve(ROOT, file), 'utf8');
  for (const rule of CONTENT_RULES) {
    for (const match of text.matchAll(rule.re)) {
      if (rule.allow?.some((re) => re.test(match[0]))) continue;
      const line = text.slice(0, match.index).split('\n').length;
      findings.push({ file, rule: rule.id, detail: `line ${line}` });
    }
  }
}

if (findings.length) {
  console.error(`privacy-scan: ${findings.length} finding(s) in ${files.length} candidate files`);
  for (const f of findings) console.error(`  ${f.rule.padEnd(18)} ${f.file} (${f.detail})`);
  process.exit(1);
}
console.log(`privacy-scan: clean (${files.length} candidate files)`);
