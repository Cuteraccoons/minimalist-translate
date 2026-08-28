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
if (!content.includes('function isArticleProseLink') || content.includes("'.tab-bar a','.tabs a','.tablist a','a'")) fail('article links can still be misclassified as navigation');
if (!content.includes("rememberInlineStyles(record, ['position', 'padding-bottom', 'min-height'])")) fail('expandable navigation restoration missing');
if (!content.includes('function setTranslationBadgeSafely')) fail('badge messaging context guard missing');
if (!background.includes('const TRANSLATION_CACHE_NAMESPACE = "trans:v3"') || !background.includes('const BUNDLE_SIZE = engine === "google" ? 1 : 8')) fail('paragraph-safe Google translation mapping missing');
if (!background.includes('Array.from(memoryCache.entries()).slice(-3000)')) fail('recent translation cache entries are not persisted');
if (!content.includes('const CONCURRENCY = 2') || !content.includes('const completedChunks = new Map()') || !content.includes('flushCompletedChunks')) fail('translation request fan-out or ordered commit buffer missing');
if (!content.includes("sidebarPreviousDisplayMode || 'bilingual'") || !content.includes('function requestSidebarClose()')) fail('temporary sidebar mode restoration missing');
if (!content.includes('translationRunGeneration') || !content.includes('runId !== translationRunGeneration')) fail('stale async translation run cancellation missing');
if (!content.includes('function refreshRenderedTranslationContrast') || !content.includes('applyAdaptiveTranslationColor(transNode, transNode')) fail('post-insertion contrast recalculation missing');
if (!content.includes('refreshRenderedTranslationContrast(parent, parent, activePageRenderStyle()')) fail('replacement post-style contrast recalculation missing');
if (!content.includes('normalized.match(/^#([\\da-f]{3,8})$/i)')) fail('hex translation colour parsing missing');
if (!content.includes('const placeBehind = (background) =>') || !content.includes('background.a ?? 1')) fail('translucent surface compositing missing');
if (!content.includes('const offset = preferredGap') || content.includes('preferredGap - hostBottom')) fail('negative bilingual overlap spacing remains');
if (!content.includes('const allowHiddenToc') || !content.includes("(!allowHiddenToc && !isVisibleTranslationElement(liveElement))")) fail('hidden source response guard or structured-TOC exception missing');
if (!content.includes('function isRichContentControl') || !content.includes('function collectCompactComponentTextUnits')) fail('rich-card/component translation boundary missing');
if (!content.includes('raccoon-linked-card-translation') || !content.includes('textHost.appendChild(transNode)')) fail('linked editorial-card translation safeguard missing');
if (!content.includes('function buildImageTranslationLayout') || !content.includes('textAlign:item.alignment||inferred')) fail('OCR bounded alignment layout missing');
if (!content.includes('cloneWalker.currentNode.nodeValue = originalTextForNode')) fail('reader original-text restoration missing');
if (!content.includes("meta?.kind === 'component-text'")) fail('compact component render branch missing');
if (!content.includes('function isStructuredTocControl') || !content.includes('.vector-toc-numb,.tocnumber')) fail('TOC numbering preservation missing');
if (!content.includes('parentIsRowFlex') || !content.includes('canOwnTranslation')) fail('row-flex bilingual squeeze safeguard missing');
if (!content.includes('className = "raccoon-translation-text"') || !css.includes('>.raccoon-translation-text')) fail('glyph-only translation highlight wrapper missing');
if (!content.includes('function warmReaderLazyContent') || !content.includes("[role='heading'][aria-level]")) fail('reader lazy-content or semantic-heading expansion missing');
if (!content.includes('readerOriginalTextPreservingWhitespace') || !content.includes('reader-code-block') || !css.includes('#raccoon-reader-root .reader-blockquote')) fail('semantic reader blocks missing');
if (!content.includes('function isReaderMaintenanceContainer') || !content.includes('.ambox,.tmbox,.cmbox,.ombox,.fmbox,.mw-message-box,.metadata')) fail('reader maintenance-template filtering missing');
if (!content.includes('class="reader-outline-label"') || !css.includes('.reader-outline-label{')) fail('reader outline line-box safeguard missing');
if (!content.includes('new Set(["card", "flat", "column", "folio"])') || (content.match(/data-reader-surface=/g) || []).length !== 4) fail('reader page surface choices are incomplete');
if (content.includes('reader-toggle-divider') || content.includes('readerDividerVisible') || background.includes('readerDividerVisible')) fail('obsolete reader metadata divider setting remains');
if (!css.includes('.reader-meta-bar{\n  border-bottom:0!important') || !css.includes('.reader-outline-item.level-3{opacity:.72!important')) fail('reader metadata rule or outline hierarchy finish missing');
if (!css.includes('data-surface="column"') || !css.includes('data-surface="folio"') || !css.includes('border:2px solid #202328!important')) fail('reader surface layout or outlined selection state missing');
if (!background.includes('async function translateUnitWithRetry') || !background.includes('const CONCURRENCY = engine === "google" ? 3 : 4')) fail('resilient bounded Google retry missing');
if (!content.includes("data-render-style=\"${escapeHtml(savedRenderStyle)}\"")) fail('reader render-style inheritance missing');
if (/\[data-raccoon-translated=[^\]]+\]\s*\{[^}]*margin-bottom/i.test(css)) fail('host translated nodes still receive forced margin-bottom');
if (!css.includes('white-space:nowrap!important')) fail('translated tab height safeguard missing');
if (!css.includes('clear:none!important')) fail('float-safe bilingual layout missing');
if (!css.includes('overflow-wrap:break-word!important;word-break:normal!important')) fail('navigation word-wrap safeguard missing');
if ((content.match(/transNode\.appendChild\(actions\)/g) || []).length !== 1) fail('action toolbar should be appended exactly once');
if (!content.includes('function getReaderImageInfo')) fail('reader image source resolver missing');
if (!content.includes('data-lazy-src')) fail('reader lazy image source fallback missing');
if (!content.includes('node.currentSrc,') || !content.includes('fallbacks.indexOf(img.src)')) fail('reader animated/current image fallback missing');
if (!css.includes('.reader-img-wrap.reader-img-inline')) fail('reader mixed image layout missing');
if (!css.includes('max-height:min(72vh,760px)')) fail('reader image viewport limit missing');
if (!css.includes('.dict-word-title.is-fade-clipped')) fail('passage title fade safeguard missing');
if (!css.includes('max-height:calc(4.44em + 1px)')) fail('passage title complete-line height missing');
if (!layoutMatrix.includes('const TOTAL_CASES = 120') || !layoutMatrix.includes('dataset.surfaceTone') || !layoutMatrix.includes('window.runBilingualLayoutAudit') || !layoutMatrix.includes('window.runReplacementLayoutAudit')) fail('120-case layout matrix fixture missing');
if (!content.includes('function prioritizeTranslationBlocks')) fail('viewport-first translation ordering missing');
if (!content.includes('const FIRST_CHUNK_SIZE = 6') || !content.includes('const CHUNK_SIZE = 8')) fail('viewport-first translation batch sizing missing');
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

const parsedColorSource = extractFunction(content, 'parsedCssColor');
const luminanceSource = extractFunction(content, 'cssColorLuminance');
if (!parsedColorSource || !luminanceSource) {
  fail('CSS colour parser or luminance helper missing');
} else {
  const parseColour = Function(`${parsedColorSource}; return parsedCssColor;`)();
  const luminance = Function(`${luminanceSource}; return cssColorLuminance;`)();
  const paleOklch = luminance(parseColour('oklch(0.98 0.01 95)'));
  const darkOklch = luminance(parseColour('oklch(0.22 0.01 95)'));
  if (!(paleOklch > .85) || !(darkOklch < .08)) fail('OKLCH colours are misread as RGB channel numbers');
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
    ['这是正文。[2] [n 1]', 'zh-CN', '这是正文。'],
    ['Translated sentence [12]', 'en', 'Translated sentence'],
    ['数组 [1, 2, 3]', 'zh-CN', '数组 [1, 2, 3]'],
    ['product-market fit', 'zh-CN', 'product-market fit'],
    ['https://example.com/a-b', 'zh-CN', 'https://example.com/a-b'],
    ['text - note', 'en', 'text - note']
  ];
  for (const [input, lang, expected] of punctuationCases) {
    if (normalize(input, lang) !== expected) fail(`punctuation normalization failed: ${input}`);
  }
}

const imageLayoutSource = extractFunction(content, 'buildImageTranslationLayout');
if (!imageLayoutSource) {
  fail('image translation layout function missing');
} else {
  const buildLayout = Function(`function clampNumber(value,min,max){return Math.max(min,Math.min(max,value));}${imageLayoutSource};return buildImageTranslationLayout;`)();
  const layout = buildLayout([
    {translated:'左侧',alignment:'left',bbox:{x0:30,y0:40,x1:260,y1:92}},
    {translated:'右侧',alignment:'right',bbox:{x0:650,y0:42,x1:970,y1:94}},
    {translated:'下一行',alignment:'center',bbox:{x0:300,y0:140,x1:700,y1:196}}
  ],1,1,1000,240);
  const [left,right,below] = layout;
  if (layout.length !== 3 || left.textAlign !== 'left' || right.textAlign !== 'right' || below.textAlign !== 'center') fail('image translation source alignment was not preserved');
  if (left.rect.x + left.rect.width > right.rect.x || left.rect.y + left.rect.height > below.rect.y) fail('image translation rectangles overlap neighbouring OCR regions');
}

if (!process.exitCode) pass('translation core invariants');
if (process.exitCode) process.exit(process.exitCode);
