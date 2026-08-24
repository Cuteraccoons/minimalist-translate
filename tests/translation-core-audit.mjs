import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const content = fs.readFileSync(path.join(root, 'content.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'floating.css'), 'utf8');
const background = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
const layoutMatrix = fs.readFileSync(path.join(root, 'tests/fixtures/layout-matrix.js'), 'utf8');
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
if (!content.includes('function shouldUseCompactUiReplacement') || !content.includes("origEl.setAttribute('data-raccoon-ui-mode', 'compact')")) fail('adaptive compact UI safeguard missing');
if (!content.includes("line.className = 'raccoon-ui-translation-line'") || !content.includes("origEl.setAttribute('data-raccoon-ui-mode', 'bilingual')")) fail('expandable bilingual navigation path missing');
if (!content.includes("element.addEventListener('mouseenter', showOriginal") || !content.includes("element.addEventListener('focusin', showOriginal")) fail('compact UI original-text preview missing');
if (!content.includes('record.interactionController?.abort?.()')) fail('compact UI interaction cleanup missing');
if (!content.includes('function canUseExpandableUiBilingual') || !content.includes('function positionExpandableUiTranslation')) fail('bounded two-line navigation layout missing');
if (!content.includes("rememberInlineStyles(record, ['position', 'padding-bottom', 'min-height'])")) fail('expandable navigation restoration missing');
if (!content.includes('function setTranslationBadgeSafely')) fail('badge messaging context guard missing');
if (!background.includes('const TRANSLATION_CACHE_NAMESPACE = "trans:v2"') || !background.includes('const BUNDLE_SIZE = engine === "google" ? 1 : 8')) fail('paragraph-safe Google translation mapping missing');
if (!background.includes('Array.from(memoryCache.entries()).slice(-3000)')) fail('recent translation cache entries are not persisted');
if (!content.includes('const CONCURRENCY = activeEngine === "google" ? 2 : 3')) fail('Google translation request fan-out is unbounded');
if (!content.includes("sidebarPreviousDisplayMode || 'bilingual'") || !content.includes('function requestSidebarClose()')) fail('temporary sidebar mode restoration missing');
if (!content.includes('translationRunGeneration') || !content.includes('runId !== translationRunGeneration')) fail('stale async translation run cancellation missing');
if (!content.includes('function refreshRenderedTranslationContrast') || !content.includes('applyAdaptiveTranslationColor(transNode, transNode')) fail('post-insertion contrast recalculation missing');
if (!content.includes('refreshRenderedTranslationContrast(parent, parent, activePageRenderStyle()')) fail('replacement post-style contrast recalculation missing');
if (!content.includes('normalized.match(/^#([\\da-f]{3,8})$/i)')) fail('hex translation colour parsing missing');
if (!content.includes('const placeBehind = (background) =>') || !content.includes('background.a ?? 1')) fail('translucent surface compositing missing');
if (!content.includes('const offset = preferredGap') || content.includes('preferredGap - hostBottom')) fail('negative bilingual overlap spacing remains');
if (!content.includes("if (!liveElement || !isVisibleTranslationElement(liveElement))")) fail('hidden source response guard missing');
if (!content.includes("data-render-style=\"${escapeHtml(savedRenderStyle)}\"")) fail('reader render-style inheritance missing');
if (/\[data-raccoon-translated=[^\]]+\]\s*\{[^}]*margin-bottom/i.test(css)) fail('host translated nodes still receive forced margin-bottom');
if (!css.includes('white-space:nowrap!important')) fail('translated tab height safeguard missing');
if (!css.includes('clear:none!important')) fail('float-safe bilingual layout missing');
if (!css.includes('overflow-wrap:break-word!important;word-break:normal!important')) fail('navigation word-wrap safeguard missing');
if ((content.match(/transNode\.appendChild\(actions\)/g) || []).length !== 1) fail('action toolbar should be appended exactly once');
if (!content.includes('function getReaderImageInfo')) fail('reader image source resolver missing');
if (!content.includes('data-lazy-src')) fail('reader lazy image source fallback missing');
if (!css.includes('.reader-img-wrap.reader-img-inline')) fail('reader mixed image layout missing');
if (!css.includes('max-height:min(72vh,760px)')) fail('reader image viewport limit missing');
if (!css.includes('.dict-word-title.is-fade-clipped')) fail('passage title fade safeguard missing');
if (!css.includes('max-height:calc(4.44em + 1px)')) fail('passage title complete-line height missing');
if (!layoutMatrix.includes('const TOTAL_CASES = 120') || !layoutMatrix.includes('dataset.surfaceTone') || !layoutMatrix.includes('window.runBilingualLayoutAudit') || !layoutMatrix.includes('window.runReplacementLayoutAudit')) fail('120-case layout matrix fixture missing');
if (!content.includes('function prioritizeTranslationBlocks')) fail('viewport-first translation ordering missing');
if (!content.includes('const CHUNK_SIZE = 12')) fail('front/background translation batch size alignment missing');
if (!content.includes('function scheduleMutationTranslationRefresh')) fail('scoped dynamic-content translation refresh missing');
if (!content.includes('readerContainerCache')) fail('reader container cache missing');
if (!background.includes('await persistentCacheReady')) fail('persistent translation cache readiness safeguard missing');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) return '';
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  return '';
}

const punctuationSource = extractFunction(background, 'normalizeTranslationPunctuation');
if (!punctuationSource) {
  fail('translation punctuation normalizer missing');
} else {
  const normalize = Function(`${punctuationSource}; return normalizeTranslationPunctuation;`)();
  const punctuationCases = [
    ['这是解释 - 也是补充', 'zh-CN', '这是解释——也是补充'],
    ['这是解释 — 也是补充', 'zh-CN', '这是解释——也是补充'],
    ['这是说明,也是补充.', 'zh-CN', '这是说明，也是补充。'],
    ['第一段\n第二段', 'zh-CN', '第一段\n第二段'],
    ['2024-2025', 'zh-CN', '2024-2025'],
    ['-12°C', 'zh-CN', '-12°C'],
    ['product-market fit', 'zh-CN', 'product-market fit'],
    ['https://example.com/a-b', 'zh-CN', 'https://example.com/a-b'],
    ['text - note', 'en', 'text - note']
  ];
  for (const [input, lang, expected] of punctuationCases) {
    if (normalize(input, lang) !== expected) fail(`punctuation normalization failed: ${input}`);
  }
}

if (!process.exitCode) pass('translation core invariants');
if (process.exitCode) process.exit(process.exitCode);
