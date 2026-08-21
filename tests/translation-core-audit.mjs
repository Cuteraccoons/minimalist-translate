import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const content = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'floating.css'), 'utf8');
const fail = msg => { console.error(`FAIL ${msg}`); process.exitCode = 1; };
const pass = msg => console.log(`PASS ${msg}`);

const requiredFunctions = [
  'collectReplaceTextUnits',
  'collectUiTranslationUnits',
  'renderUiTranslationInPlace',
  'applyReplaceTextUnit',
  'restoreInPlaceTranslations',
  'adaptTranslatedUiLayout'
];
for (const name of requiredFunctions) {
  if (!content.includes(`function ${name}`)) fail(`missing ${name}`);
}

if (/origEl\.(?:innerText|innerHTML|textContent)\s*=\s*translatedText/.test(content)) {
  fail('replace mode still destroys host subtree');
}
if (!content.includes("meta?.kind === 'replace-text'")) fail('replace-text render branch missing');
if (!content.includes("meta?.kind === 'ui-inplace'")) fail('UI in-place render branch missing');
if (!content.includes("rt, rp")) fail('ruby annotations are not excluded from replacement translation');
if (!css.includes('.raccoon-tablist-overflow')) fail('tab overflow CSS missing');
if (/\[data-raccoon-translated=[^\]]+\]\s*\{[^}]*margin-bottom/i.test(css)) fail('host translated nodes still receive forced margin-bottom');
if (!css.includes('white-space:nowrap!important')) fail('translated tab height safeguard missing');
if ((content.match(/transNode\.appendChild\(actions\)/g) || []).length !== 1) fail('action toolbar should be appended exactly once');

if (!process.exitCode) pass('translation core invariants');
if (process.exitCode) process.exit(process.exitCode);
