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
if (!read('floating.css').includes('ruby.raccoon-replaced-ruby')) fail('missing ruby replacement safeguard');
if (!process.exitCode) pass('DOM-preserving translation safeguards');

const sandbox = read('ocr-sandbox.html');
for (const needle of [
  'calculateOcrScale',
  'prepareImageForOcr',
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
if (!read('floating.css').includes(':not([data-render-style="hover-reveal"])') || !read('floating.css').includes('20%,transparent)')) fail('hover reveal is indistinguishable from clean text');
if (!read('floating.css').includes('[data-render-style="blur-reveal"] .raccoon-action-btn:hover')) fail('concealment action toolbar contrast safeguard missing');
if (!backgroundJs.includes('enableParagraphActions: true') || !content.includes('raccoon-paragraph-actions-disabled')) fail('paragraph action toolbar preference missing');
if (content.includes('speechSynthesis.cancel()') || content.includes('speechSynthesis.onvoiceschanged =')) fail('speech synthesis can interrupt other page audio');
if (/\bWebSocket\b/.test(content) || /\bWebSocket\b/.test(backgroundJs)) fail('unexpected WebSocket integration present');
if (content.includes('TextDetector') || !backgroundJs.includes('jijianImageOcrReadyV1') || !content.includes('GET_IMAGE_OCR_READY_MAP')) fail('image OCR must use the verified local model path');
if (!content.includes('TRANSLATE_BATCH_IDS')) fail('structured image-line translation mapping missing');
if (!content.includes('dataset?.canonicalSrc') || !backgroundJs.includes('credentials: "include"')) fail('authenticated GitHub image fallback missing');
for (const direction of ['n','e','s','w','nw','ne','se','sw']) {
  if (!content.includes(`data-resize="${direction}"`)) fail(`dictionary resize direction missing: ${direction}`);
}
if (!read('floating.css').includes('.dict-resize-handle::before,.dict-resize-handle::after{display:none')) fail('dictionary resize handles still expose a visible corner mark');
if (!content.includes('dict-ai-answer-bubble') || !content.includes('settings:currentSettings')) fail('dictionary AI chat state/config refresh missing');
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
if (!content.includes('class="trigger-logo-icon trigger-translate-brand-icon" viewBox="0 0 128 128"') || !read('floating.css').includes('fill:#fff!important')) fail('selection translation mark still exposes the blue app-icon background');
if (!popupJs.includes('function closePopupMenus') || !read('options.js').includes('model-input-row.model-menu-open')) fail('single-open menu coordination missing');
if (!popupJs.includes('radial-gradient(circle at center') || !read('popup.html').includes('color-wheel-dot')) fail('follow-page colour icon is not a colour wheel');
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
