import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const fail = msg => { console.error(`FAIL ${msg}`); process.exitCode = 1; };
const pass = msg => console.log(`PASS ${msg}`);

const manifest = JSON.parse(read('manifest.json'));
const version = manifest.version;
if (!fs.existsSync(path.join(root, 'LICENSE')) || !read('LICENSE').includes('Apache License')) fail('Apache License 2.0 file missing');
if (!fs.existsSync(path.join(root, 'NOTICE'))) fail('project NOTICE file missing');
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`invalid manifest version ${version}`);
if (!read('options.js').includes('chrome.runtime.getManifest().version')) fail('settings page does not read the manifest version');
if (!process.exitCode) pass(`version consistency ${version}`);

const required = [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  manifest.options_ui?.page,
  ...(manifest.sandbox?.pages || []),
  ...manifest.content_scripts.flatMap(x => [...(x.js || []), ...(x.css || [])])
].filter(Boolean);
for (const f of required) {
  if (!fs.existsSync(path.join(root, f))) fail(`missing manifest asset ${f}`);
}
if (!process.exitCode) pass('manifest assets');

for (const f of [
  'vendor/tesseract/tesseract.min.js',
  'vendor/tesseract/worker.min.js',
  'vendor/tesseract/tesseract-core-lstm.wasm.js',
  'vendor/tesseract/tesseract-core-lstm.wasm'
]) {
  if (!fs.existsSync(path.join(root, f))) fail(`missing local OCR runtime ${f}`);
}
const sandboxCsp = manifest.content_security_policy?.sandbox || '';
if (/script-src[^;]*https?:/i.test(sandboxCsp) || /worker-src[^;]*https?:/i.test(sandboxCsp)) fail('remote executable code remains allowed by sandbox CSP');
if (!read('ocr-sandbox.html').includes('vendor/tesseract/tesseract.min.js')) fail('OCR sandbox does not load local Tesseract runtime');
if (!process.exitCode) pass('local-only OCR executable runtime');

for (const [htmlFile, jsFile] of [['options.html','options.js'],['popup.html','popup.js']]) {
  const html = read(htmlFile), js = read(jsFile);
  const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m => m[1]);
  const dup = [...new Set(ids.filter((x,i) => ids.indexOf(x) !== i))];
  if (dup.length) fail(`${htmlFile} duplicate ids: ${dup.join(', ')}`);
  const idSet = new Set(ids);
  const refs = [...js.matchAll(/document\.getElementById\(["']([^"']+)["']\)/g)].map(m => m[1]);
  const missing = [...new Set(refs.filter(x => !idSet.has(x)))];
  if (missing.length) fail(`${jsFile} missing static ids: ${missing.join(', ')}`);
}
if (!process.exitCode) pass('static DOM id references');

const forbidden = [];
for (const entry of fs.readdirSync(root, {withFileTypes:true})) {
  if (entry.isFile() && /\.(mdx|mdd)$/i.test(entry.name)) forbidden.push(entry.name);
}
if (forbidden.length) fail(`dictionary payload accidentally bundled: ${forbidden.join(', ')}`);
else pass('no MDX/MDD payload bundled');

const content = read('content.js');
for (const needle of [
  'function getHostOriginalText',
  'function collectReplaceTextUnits',
  'function renderUiTranslationInPlace',
  'function restoreInPlaceTranslations',
  'sourceTextById = new Map',
  'removeAttribute("data-raccoon-id")',
  'prepareImageForOcr',
  'aria-label="切换本地词典"'
]) {
  const target = needle === 'prepareImageForOcr' ? read('ocr-sandbox.html') : content;
  if (!target.includes(needle)) fail(`missing release invariant: ${needle}`);
}
if (!process.exitCode) pass('translation core invariants');

for (const forbiddenPattern of [
  /origEl\.innerText\s*=\s*translatedText/,
  /origEl\.innerHTML\s*=\s*translatedText/,
  /origEl\.textContent\s*=\s*translatedText/
]) {
  if (forbiddenPattern.test(content)) fail(`destructive replacement path remains: ${forbiddenPattern}`);
}
const appendActionsCount = (content.match(/transNode\.appendChild\(actions\)/g) || []).length;
if (appendActionsCount !== 1) fail(`translation action bar append count expected 1, got ${appendActionsCount}`);
if (!content.includes('function shouldUseCompactUiReplacement') || !content.includes("origEl.setAttribute('data-raccoon-ui-mode', 'compact')")) fail('adaptive compact navigation safeguard missing');
if (!content.includes("line.className = 'raccoon-ui-translation-line'") || !content.includes("origEl.setAttribute('data-raccoon-ui-mode', 'bilingual')")) fail('expandable bilingual navigation path missing');
if (!content.includes("element.addEventListener('mouseenter', showOriginal") || !content.includes('record.interactionController?.abort?.()')) fail('compact navigation preview lifecycle missing');
if (!content.includes('function positionExpandableUiTranslation') || !content.includes('function setTranslationBadgeSafely')) fail('navigation geometry or badge safety missing');
if (!content.includes("sidebarPreviousDisplayMode || 'bilingual'") || !content.includes('function requestSidebarClose()')) fail('temporary sidebar mode restoration missing');
if (!content.includes('translationRunGeneration') || !content.includes('runId !== translationRunGeneration')) fail('stale async translation run cancellation missing');
if (!read('background.js').includes('const TRANSLATION_CACHE_NAMESPACE = "trans:v3"') || !read('background.js').includes('const BUNDLE_SIZE = engine === "google" ? 1 : 8')) fail('paragraph-safe translation cache/mapping missing');
if (!content.includes('function refreshRenderedTranslationContrast') || !content.includes('applyAdaptiveTranslationColor(transNode, transNode')) fail('post-insertion contrast recalculation missing');
if (!content.includes('refreshRenderedTranslationContrast(parent, parent, activePageRenderStyle()')) fail('replacement post-style contrast recalculation missing');
if (!content.includes('normalized.match(/^#([\\da-f]{3,8})$/i)')) fail('hex translation colour parsing missing');
if (!content.includes('const placeBehind = (background) =>')) fail('translucent surface compositing missing');
if (!content.includes('const offset = preferredGap') || content.includes('preferredGap - hostBottom')) fail('bilingual spacing can still collapse into a negative overlap');
if (!read('floating.css').includes('clear:none!important')) fail('float-safe bilingual layout missing');
if (!read('floating.css').includes('ruby.raccoon-replaced-ruby')) fail('missing ruby replacement safeguard');
if (content.includes('reader-toggle-divider') || !content.includes('data-reader-surface="column"') || !content.includes('data-reader-surface="folio"')) fail('reader finishing controls are incomplete');
if (!read('floating.css').includes('.reader-outline-item.level-3{opacity:.72!important') || !read('floating.css').includes('border-bottom:0!important;padding-bottom:0!important;margin-bottom:28px!important')) fail('reader outline hierarchy or metadata separator regressed');
if (!content.includes('activeReaderViewController(readerViewForDisplayMode') || !content.includes('persistDisplayMode:true') || !read('background.js').includes('changedKeys') || !read('popup.js').includes('{ notifyOnActive:true }')) fail('popup and reader presentation controls are not synchronized');
if (!read('floating.css').includes('.reader-drawer-backdrop {\n  display: none !important;') || !read('floating.css').includes('overscroll-behavior: contain;\n  scrollbar-gutter: stable;')) fail('reader settings drawer still blocks or scroll-captures the article');
if (content.includes('has-orig-highlight') || content.includes('"MARK","CODE"') || read('floating.css').includes('.raccoon-translated-block.has-orig-highlight')) fail('clean translation still copies a host highlight across the whole translated block');
if (!content.includes('for (let index = 0; index < uncachedItems.length; index += 6)') || !content.includes('翻译请求等待时间过长')) fail('direct reader translation is not progressive or timeout-safe');
if (!process.exitCode) pass('DOM-preserving translation safeguards');

const sandbox = read('ocr-sandbox.html');
for (const needle of [
  'calculateOcrScale',
  'prepareImageForOcr',
  'prepareCanvasPixelsForOcr',
  'selectPageSegMode',
  'lineTextSimilarity',
  'segments',
  'TESSDATA_GITHUB',
  'recognizing segment'
]) {
  if (!sandbox.includes(needle)) fail(`missing OCR geometry/download invariant: ${needle}`);
}
for (const needle of ['showImageSource','restoreImageSource','data-act="download-current"','translateOcrForImage','makeTranslatedImageDataUrl']) {
  if (!content.includes(needle)) fail(`missing translated-image invariant: ${needle}`);
}
if (content.includes('class="image-translate-render"')) fail('translated image still renders in a fixed viewport overlay');
if (content.includes('data-act="save-original"') || content.includes('data-act="save-translated"')) fail('legacy two-download image actions remain');
if (!content.includes('function buildImageTranslationLayout') || !content.includes('textAlign:item.alignment||inferred')) fail('translated image does not preserve bounded source alignment');
if (!content.includes('function isArticleProseLink') || content.includes("'.tab-bar a','.tabs a','.tablist a','a'")) fail('article links can still be classified as navigation chrome');
if (!manifest.content_security_policy?.sandbox?.includes('raw.githubusercontent.com')) fail('OCR fallback host missing from sandbox CSP');
if (!process.exitCode) pass('image translation geometry / OCR fallback safeguards');

if (content.includes('imageTranslateTrigger.style.display')) fail('image trigger visibility bypasses explicit data state');
if (!content.includes('function mergeOcrLineItems')) fail('OCR visual-line merge missing');
if (!read('floating.css').includes('#raccoon-image-translate-trigger[data-visible="true"]')) fail('image trigger visible-state CSS missing');
if (!content.includes('imageTranslateTarget=imgEl;translateImageElement(imgEl)')) fail('reader lightbox OCR target binding missing');
if (!process.exitCode) pass('1.0 image trigger / reader OCR safeguards');

if (!read('options.js').includes('function syncImageOcrUi()')) fail('settings early-init function is not hoisted');
if (!read('background.js').includes('SEARCH_ENGINE_BLACKLIST_RULE') || !read('background.js').includes('image: false')) fail('search-engine blacklist does not preserve image translation');
if (!read('floating.css').includes('is-ocr-downloading')) fail('single-surface OCR download progress state missing');
if (!content.includes('无法解码这张图片') || !read('floating.css').includes('.is-recognizing .image-translate-scan')) fail('SVG OCR decode fallback or scan-state gate missing');
const optionsJs = read('options.js');
const folderPermissionAt = optionsJs.indexOf('const granted=await requestLocalReadPermission(handle)');
const folderPersistAt = optionsJs.indexOf('await putLocalDirectoryHandle(handle)', folderPermissionAt);
if (folderPermissionAt < 0 || folderPersistAt < 0 || folderPermissionAt > folderPersistAt || !optionsJs.includes('id:"jijian-local-dictionaries"') || !optionsJs.includes('localDictionaryImportError')) fail('local dictionary re-import can lose the picker gesture or hide its failure');
if (!content.includes('action:"OPEN_OPTIONS_PAGE", tab:"tab-local-dict"') || !read('background.js').includes('options.html?tab=${encodeURIComponent(targetTab)}')) fail('local dictionary recovery does not open its settings section directly');
if (!read('options.html').includes('高亮原文、译文和来源保存在浏览器本地')) fail('highlight local-storage note missing');
if (!read('options.js').includes('class="domain-row-actions"') || !read('options.js').includes('class="domain-remove-btn"') || read('options.js').includes('class="domain-remove-icon"')) fail('blacklist actions still use the ambiguous close icon');
if (!read('options.css').includes('.blacklist-domain-list .domain-row{\n  display:block!important') || !read('options.css').includes('position:static!important')) fail('blacklist feature controls do not expand as a second row');
if (!read('options.css').includes('#local-dict-list .local-dict-row:first-child') || !read('options.css').includes('border-top:1px solid #e7eaee!important')) fail('first local dictionary entry can lose its rounded top edge');
if (!process.exitCode) pass('settings startup / search-engine / OCR prompt safeguards');


// Popup / lookup stability invariants.
if (!content.includes('function makeDictionaryCardDraggable') || !content.includes('makeDictionaryCardDraggable(cardEl)')) fail('movable dictionary card safeguard missing');
if (!content.includes('function clampDictionaryCardToViewport')) fail('dictionary viewport clamping missing');
const popupJs = read('popup.js');
const backgroundJs = read('background.js');
const privacyCopy = read('PRIVACY.md');
for (const key of [
  'deepseekApiKey', 'deeplAuthKey', 'openaiApiKey', 'claudeApiKey',
  'geminiApiKey', 'customApiKey', 'customBaseUrl', 'openaiCustomPrompt'
]) {
  const localOnlyList = backgroundJs.match(/const LOCAL_ONLY_SETTING_KEYS = Object\.freeze\(\[([\s\S]*?)\]\);/)?.[1] || '';
  if (!localOnlyList.includes(`"${key}"`)) fail(`private setting is not local-only: ${key}`);
}
if (!backgroundJs.includes('settingsForContentScript') || !backgroundJs.includes('LOCAL_ONLY_SETTING_KEYS.forEach(key => delete safe[key])')) fail('content-script settings are not sanitized');
if (!backgroundJs.includes('senderUrl.startsWith(chrome.runtime.getURL(""))') || !backgroundJs.includes('settingsForSender(merged, sender)')) fail('trusted extension pages are not distinguished from ordinary tab content');
if (backgroundJs.includes('sender.tab ? settingsForContentScript')) fail('tab-based trust check can hide local credentials from the options page');
if (!backgroundJs.includes('chrome.storage.local.setAccessLevel?.({ accessLevel:"TRUSTED_CONTEXTS" })') || !backgroundJs.includes('chrome.storage.sync.setAccessLevel?.({ accessLevel:"TRUSTED_CONTEXTS" })')) fail('extension storage remains directly exposed to content scripts');
if (content.includes('chrome.storage.')) fail('content script directly accesses extension storage');
if (!content.includes('currentSettings.aiDictionaryAvailable === true')) fail('sanitized AI availability flag missing');
if (backgroundJs.includes('chrome.storage.sync.set(request.settings)')) fail('settings update still writes secrets to Chrome Sync');
if (!privacyCopy.includes('不通过 Chrome Sync 同步') || !privacyCopy.includes('当前设备')) fail('privacy copy does not disclose local-only credentials and sync boundaries');
if (!process.exitCode) pass('local-only credentials / content-script privacy boundary');
if (!popupJs.includes('GET_COLLECTION_COUNTS') || !popupJs.includes('ensurePopupVocabularyLoaded') || !popupJs.includes('ensurePopupHighlightsLoaded')) fail('popup lazy collection loading missing');
if (!backgroundJs.includes('if (action === "GET_COLLECTION_COUNTS")') || !backgroundJs.includes('collectionCountsCache')) fail('collection count endpoint/cache missing');
if (!read('popup.html').includes('list-row popup-highlight-style-row')) fail('popup highlight choices are not inline');
if (!read('options.html').includes('card-row highlight-style-row')) fail('settings highlight choices are not inline');
if (!read('popup.js').includes('石墨灰') || !read('content.js').includes('slate:"#5f6063"')) fail('translation graphite colour is inconsistent');
if (!backgroundJs.includes('replaceRenderStyle: "clean"')) fail('replacement clean style is not the default');
if (!content.includes("parent.classList.add('raccoon-dom-preserved-translation','raccoon-replaced-text')")) fail('replacement typography class is not applied');
if (!read('floating.css').includes('.raccoon-replaced-text[data-render-style="native"]') || !read('floating.css').includes('font-style:normal!important')) fail('replacement reference style may inherit italics');
if (!content.includes('function applyAdaptiveTranslationColor') || !read('floating.css').includes('var(--raccoon-local-text-color,var(--raccoon-text-color,inherit))')) fail('translation styles do not share adaptive surface contrast');
if (!content.includes('function foregroundLuminanceOnSurface') || !content.includes('candidateAlpha >= .92') || !content.includes('const binaryAdaptiveColor = renderStyle === "native"')) fail('transparent or muted host colours can still wash translations to grey');
if (!read('floating.css').includes('mix-blend-mode:normal!important') || !read('floating.css').includes('.raccoon-ui-translation-line{\n  color:var(--raccoon-local-text-color')) fail('host blend/text-fill rules can still reduce translated UI contrast');
if (!content.includes('const DYNAMIC_UI_SURFACE_SELECTOR') || !content.includes("document.addEventListener('pointerover', interactionRefreshHandler, true)") || !read('floating.css').includes('.raccoon-component-translated[data-raccoon-ui-showing="translation"]')) fail('footer and hover-menu translation support missing');
if (!read('floating.css').includes('var(--raccoon-bg-color,rgba(253,224,71,.43))')) fail('live webpage highlight colour binding missing');
if (!content.includes('style.backgroundImage && style.backgroundImage !== "none"') || !content.includes('dataset.raccoonSurface')) fail('gradient/dark surface diagnostics missing');
if (!read('floating.css').includes('opacity:.2!important') || !read('floating.css').includes('transition:opacity .18s ease!important')) fail('hover reveal is indistinguishable from clean text');
if (!read('floating.css').includes('[data-render-style="blur-reveal"]>.raccoon-translation-text') || !read('floating.css').includes('[data-render-style="click-reveal"]:not(.raccoon-revealed) .raccoon-block-actions')) fail('concealment text/action safeguards missing');
if (!backgroundJs.includes('enableParagraphActions: false') || !content.includes('enableParagraphActions: false') || !content.includes('raccoon-paragraph-actions-disabled')) fail('paragraph action toolbar default or preference missing');
if (!content.includes('<path d="M4 7h16"/><path d="M9 7V4h6v3"/>')) fail('saved-highlight delete control lacks a recognizable trash icon');
if (content.includes('speechSynthesis.cancel()') || content.includes('speechSynthesis.onvoiceschanged =')) fail('speech synthesis can interrupt other page audio');
if (/\bWebSocket\b/.test(content) || /\bWebSocket\b/.test(backgroundJs)) fail('unexpected WebSocket integration present');
if (content.includes('TextDetector') || !backgroundJs.includes('jijianImageOcrReadyV1') || !content.includes('GET_IMAGE_OCR_READY_MAP')) fail('image OCR must use the verified local model path');
if (!content.includes('TRANSLATE_BATCH_IDS')) fail('structured image-line translation mapping missing');
if (!content.includes('const missing=lines.map') || !content.includes('const unresolved=lines.map') || !content.includes('action:"TRANSLATE_SINGLE_BLOCK",text:target.line.text') || !content.includes('rgba(${r},${g},${b},.94)')) fail('partial OCR batches or translucent masks can leave source text visible');
if (!content.includes('const intersectsViewport =') || content.includes('visibleTop + 8') || content.includes('visibleBottom + 8')) fail('image progress can remain pinned to the viewport instead of its image');
if (!content.includes('dataset?.canonicalSrc') || !backgroundJs.includes('credentials:"include"') || !backgroundJs.includes('credentials:"omit"')) fail('authenticated/CDN GitHub image fallback missing');
for (const direction of ['n','e','s','w','nw','ne','se','sw']) {
  if (!content.includes(`data-resize="${direction}"`)) fail(`dictionary resize direction missing: ${direction}`);
}
if (!read('floating.css').includes('.dict-resize-handle::before,.dict-resize-handle::after{display:none')) fail('dictionary resize handles still expose a visible corner mark');
if (!content.includes('dict-ai-answer-bubble') || content.includes('LOOKUP_AI_DEEP_DICT",text,context:selectionContext,sl:languageHint,mode:requestMode,question:q,settings:currentSettings')) fail('dictionary AI chat state or trusted settings boundary regressed');
if (!backgroundJs.includes('const storedSettings = await loadStoredSettings()') || !backgroundJs.includes('dictionaryAiCacheSignature(storedSettings)')) fail('dictionary AI requests do not load trusted provider settings or invalidate stale prompt caches');
if (!backgroundJs.includes('dictionaryAiCustomPrompt') || !read('options.html').includes('opt-dictionary-ai-custom-prompt')) fail('dedicated dictionary AI prompt setting missing');
if (content.includes('id="dict-btn-ai"') || !content.includes('dict-ai-context-shortcut') || !content.includes('dict-ai-send')) fail('dictionary AI composer shortcuts missing');
if (!content.includes('此处义、读音、原形、词性、常用义、语感与搭配') || !content.includes('function renderDictionaryAiBubbleSections')) fail('full context lookup prompt or sectioned AI bubbles missing');
if (!content.includes('dict-ai-input-shell') || content.includes('submitQuestion(contextPresetQuestion)')) fail('context shortcut must fill the composer before explicit send');
if (!content.includes('整体含义、句子结构、关键语法、重点词语和相关例句') || !content.includes('contextShortcutLabel = isPassage')) fail('passage grammar/context shortcut missing');
if (!content.includes('usesContextPreset ? aiAnalysisMode : "ask_context"') || !content.includes('contextPresetUsed:true') && !content.includes('contextPresetUsed = true')) fail('context shortcut does not persist or route to full AI lookup');
if (!content.includes('dict-ai-list dict-ai-${tag}') || !content.includes('listItem = raw.match') || !content.includes('dict-ai-code-block')) fail('dictionary AI markdown list/indent renderer is incomplete');
if (!read('floating.css').includes('.dict-ai-answer-bubble .dict-ai-ol') || !read('floating.css').includes('list-style-type:decimal')) fail('dictionary AI ordered-list styling missing');
if (!read('floating.css').includes('button.dict-ai-send{width:36px') || !read('floating.css').includes('.dict-ai-question-box .dict-ai-context-shortcut')) fail('context shortcut sizing is still overridden by the generic send-button rule');
if (!read('floating.css').includes('min-height:36px!important;height:36px!important') || !read('floating.css').includes('font-size:13.5px!important') || !read('floating.css').includes('background:#17191c!important;color:#fff!important')) fail('external context shortcut dimensions or inverse colour missing');
if (!content.includes('</div><button type="button" class="dict-ai-context-shortcut"') || !read('floating.css').includes(':has(.dict-ai-context-shortcut[hidden])')) fail('context shortcut is not an external collapsing grid item');
if (!content.includes('dict-footer dict-source-footer') || !read('floating.css').includes('.dict-body>.dict-source-footer')) fail('dictionary source must scroll at the end of content');
if (!backgroundJs.includes('enableDictionaryAi: true') || !content.includes('currentSettings.enableDictionaryAi === false')) fail('dictionary AI master switch missing');
if (!read('options.html').includes('id="dictionary-ai-preferences"') || !read('options.js').includes('syncDictionaryAiPreferencesUi')) fail('conditional dictionary AI preferences missing');
for (const key of ['dictionaryAiAnswerStyle','dictionaryAiEmojiLevel','dictionaryAiLayout','dictionaryAiExplanationDepth','dictionaryAiStoryMode','dictionaryAiPosition','dictionaryAiConceptRigor']) {
  if (!backgroundJs.includes(key)) fail(`dictionary AI prompt preference missing: ${key}`);
}
if (!read('floating.css').includes('background:#285846!important') || !read('floating.css').includes('-webkit-text-fill-color:#fff!important') || !read('floating.css').includes('box-shadow:none!important')) fail('dictionary AI answer bubbles are not using the flat dark-green inverse treatment');
if (!content.includes('focusNewAiTurnOnce') || !read('floating.css').includes('overflow-anchor:none')) fail('stable dictionary AI answer viewport missing');
if (content.includes('confirmReaderShortcut') || !content.includes('isEditableShortcutEvent(e)') || !content.includes('toggleReaderMode();')) fail('direct reader shortcut or editable-field guard missing');
if (!content.includes('function showInputReplaceCard') || !content.includes('inputReplaceTargetLang: "en"') || !content.includes('insertReplacementText')) fail('selected input replacement translation missing');
if (!content.includes('input-replace-language-grid') || !read('floating.css').includes('pointer-events:auto!important') || content.includes('aria-label="替换目标语言">${inputReplaceLanguages.map(([code,label]) => `<option')) fail('input replacement language picker is not a stable in-card control');
if (!content.includes('const activeGesture = gesture') || content.includes('if (gesture.type === "resize")')) fail('dictionary resize frame can outlive its active gesture');
if (!read('floating.css').includes('.raccoon-input-selection-trigger{width:182px!important}') || !content.includes('M20 7h-9a5 5 0 0 0-5 5v1')) fail('input replacement toolbar dimensions or cycle icon regressed');
if (!read('floating.css').includes('button.active,.input-replace-language-grid button.active:hover')) fail('input replacement selected language can be overridden by hover styling');
if (!content.includes('dict-ai-live-preview') || !content.includes('renderDictionaryAiMarkdown(question)') || !content.includes('orderedListNext')) fail('two-way Markdown rendering or continuous ordered lists missing');
if (!read('floating.css').includes('.dict-ai-send svg{width:17px')) fail('AI send icon size regression');
if (!content.includes('class="trigger-highlight-icon"') || !read('floating.css').includes('width:10px!important;height:10px!important')) fail('selection highlight icon hierarchy regression');
if (!content.includes('class="trigger-logo-icon trigger-translate-brand-icon" viewBox="0 0 128 128" fill="#fff"') || !read('floating.css').includes('fill:#fff!important')) fail('selection translation mark still exposes the blue app-icon background');
if (!popupJs.includes('function closePopupMenus') || !read('options.js').includes('model-input-row.model-menu-open')) fail('single-open menu coordination missing');
if (!popupJs.includes('radial-gradient(circle at center') || !read('popup.html').includes('color-wheel-dot')) fail('follow-page colour icon is not a colour wheel');
if (!read('popup.css').includes('.api-quick-drawer.is-connected') || !read('popup.css').includes('border-bottom:1px solid #dfe5e1!important')) fail('connected API drawer bottom/side border missing');
if (!read('popup.css').includes('.site-image-translation-card{margin:0!important}') || read('popup.html').includes('site-image-translation-icon') || !read('popup.css').includes('grid-template-columns:minmax(0,1fr) auto 34px')) fail('site image translation card spacing or icon-free layout regressed');
if (!backgroundJs.includes('het?.pinyin || het?.bopomofo2') || backgroundJs.includes('het?.bopomofo2 || het?.pinyin')) fail('Chinese dictionary can prefer inaccurate Zhuyin romanisation over Hanyu Pinyin');
if (!content.includes('if (lang === requestedLocale) score += 36') || !content.includes('cantonese|hong kong|taiwan')) fail('Chinese speech can select a mismatched regional voice');
if (!read('popup.css').includes('#btn-open-local-dict.local-dict-link') || !read('floating.css').includes('.dict-local-tab[aria-selected="true"]') || !content.includes('dict-local-launch-choice ${i===0?\'active\':\'\'}')) fail('local dictionary actions are not aligned black inverse controls');
if (!popupJs.includes('wrap.classList.toggle("is-standard"') || !read('popup.css').includes('.popup-select.is-standard')) fail('dictionary engine selector does not adapt width by option length');
if (!popupJs.includes("!['native','classic'].includes(btn.dataset.value)")) fail('popup replacement style choices are not limited to two');
if (!read('options.js').includes('function activeTypographyRenderStyle')) fail('settings replacement typography mode is not independent');
const publicCopy = `${read('README.md')}\n${read('PRIVACY.md')}`;
if (publicCopy.includes('浏览器本机文字检测能力') || publicCopy.includes('正式发布 GitHub 仓库后')) fail('public OCR/privacy copy still contains inaccurate or placeholder wording');
if (!backgroundJs.includes('donationUrl: ""') || !backgroundJs.includes('projectUrl: ""')) fail('unpublished project or donation URL must remain empty');
const uiSources = ['content.js','floating.css','options.css','options.html','options.js','popup.css','popup.js'].map(read).join('\n');
if (/(?:dict-example|dict-examples|domain-list|domain-row-copy|domain-row|highlight-date|highlight-delete|highlight-group|highlight-items|highlight-orig|highlight-row|highlight-trans|popup-vocab-detail|segment-indicator|vocab-delete|vocab-empty|vocab-export|vocab-gallery-card|vocab-lang-label|vocab-lang-select|vocab-list-row|vocab-row-head|vocab-row-main|vocab-row|vocab-toolbar)-v\d/.test(uiSources) || backgroundJs.includes('dict::v1250::')) fail('historical version identifiers remain in UI classes or dictionary cache keys');
if (!process.exitCode) pass('popup / lookup stability safeguards');

if (process.exitCode) process.exit(process.exitCode);
