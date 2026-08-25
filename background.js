importScripts("vendor/pako_inflate.min.js", "vendor/mdict-lite.js");

/* Extension service worker. */

const EXTENSION_VERSION = chrome.runtime.getManifest().version;

const SEARCH_ENGINE_BLACKLIST_DOMAINS = [
  "google.com", "google.cn", "bing.com", "duckduckgo.com", "baidu.com",
  "sogou.com", "so.com", "yandex.com", "search.brave.com", "ecosia.org"
];
const SEARCH_ENGINE_BLACKLIST_RULE = {
  floating: true,
  hover: true,
  selection: true,
  image: false,
  auto: true
};

const DEFAULT_SETTINGS = {
  version: EXTENSION_VERSION,
  targetLang: "zh-CN",
  sourceLang: "auto",
  displayMode: "bilingual", // "bilingual" | "replace" | "sidebar"

  sidebarWidth: "400",
  sidebarSyncScroll: true,
  sidebarSide: "right",

  // 沉浸阅读偏好持久化设置
  readerWidth: "920", // 默认宽敞舒适版面 (已记忆)
  readerTheme: "envelope", // envelope | white | dark | mint | mist | lavender | stone
  readerSurface: "card", // card | flat | column | folio
  readerFont: "system",
  readerFontSize: "17.5",
  readerLineHeight: "1.82",
  readerParagraphSpacing: "28",
  readerWritingMode: "horizontal", // horizontal | vertical
  readerOutlineCollapsed: false,
  readerOutlineWidth: 270,
  readerImageShadow: true,
  readerProgressVisible: true,
  readerMetaVisible: true,

  fontFamily: "system",
  fontStyle: "normal",
  renderStyle: "classic", // "native" 参考原网页 | 其他为自定义译文样式
  replaceRenderStyle: "clean", // clean 纯净排版 | native 参考原文（始终正体）
  bgHighlight: "soft-yellow",
  customBgColor: "rgba(254, 240, 138, 0.45)",
  textColor: "black",
  customTextColor: "#111827",
  fontSizeRatio: "100",
  paragraphSpacing: "4",
  translationLineHeight: "1.62",
  underlineStyle: "solid",
  underlineColor: "accent",
  clickRevealColor: "charcoal",
  highlightStyle: "soft-marker",

  // 交互与智能检测
  enableParagraphHoverTranslate: true,
  enableParagraphActions: true,
  dictTriggerMode: "both", // "both" | "double_click" | "selection" | "none"
  dictTriggerLastMode: "both",
  dictionaryLookupMode: "standard", // standard | ai
  enableDictionaryAi: true,
  dictionaryAiAnswerStyle: "balanced", // professional | balanced | conversational
  dictionaryAiEmojiLevel: "light", // none | light | rich
  dictionaryAiLayout: "mixed", // bullets | paragraphs | mixed
  dictionaryAiExplanationDepth: "standard", // simple | standard | deep
  dictionaryAiStoryMode: "as-needed", // off | as-needed | story-first
  dictionaryAiPosition: "first", // first | last
  dictionaryAiConceptRigor: true,
  localDictionaryPriority: false,
  dictionaryAiMode: "manual", // Retained for settings-schema compatibility.
  enableImageTranslation: true, // 图片角落显示本机识字翻译入口
  imageOcrLanguage: "auto", // auto | eng | jpn | chi_sim | chi_tra | kor | fra | deu | spa | ita | por | rus | nld | pol | tur | ukr | ara | vie | tha | ind | mixed presets
  imageTranslationFont: "system", // system | rounded | serif | handwriting
  selectionModifierKey: "none",
  enableInputBoxTranslate: true,
  inputReplaceTargetLang: "en",
  enableFloatingBall: true,
  autoDetectPageLanguage: true,
  floatingShortcut: "zz",
  readerShortcut: "aa",
  donationUrl: "",
  projectUrl: "",
  verifiedEngines: {},

  // 发音设置
  preferredVoiceAccent: "us", // "us" 美音 | "uk" 英音
  preferredVoiceSpeed: "1.0",

  // 翻译与 AI 词典引擎配置
  translationEngine: "google", // "google" | "deepseek" | "deepl" | "openai" | "claude" | "gemini" | "ollama" | "custom"

  deepseekApiKey: "",
  deepseekBaseUrl: "https://api.deepseek.com/v1",
  deepseekModel: "deepseek-v4-flash",

  deeplAuthKey: "",
  deeplApiType: "free",

  openaiApiKey: "",
  openaiBaseUrl: "https://api.openai.com/v1",
  openaiModel: "gpt-5.6-luna",
  openaiCustomPrompt: "You are a professional translator. Translate the text into the target language accurately and fluently. Output ONLY the direct translation.",

  claudeApiKey: "",
  claudeBaseUrl: "https://api.anthropic.com",
  claudeModel: "claude-sonnet-5",

  geminiApiKey: "",
  geminiModel: "gemini-3.6-flash",

  ollamaBaseUrl: "http://localhost:11434",
  ollamaModel: "qwen2.5:7b",

  customApiKey: "",
  customBaseUrl: "",
  customModel: "",

  autoTranslateEnabled: false,
  autoTranslateEngine: "google", // google | primary
  autoTranslateDomainList: [],
  vocabularyViewMode: "list",
  excludeDomainList: ["translate.google.com", "chatgpt.com", "claude.ai", "gemini.google.com", "youtube.com", "localhost", "127.0.0.1", ...SEARCH_ENGINE_BLACKLIST_DOMAINS],
  // Each domain can override the disabled interaction scopes.
  excludeDomainRules: Object.fromEntries(SEARCH_ENGINE_BLACKLIST_DOMAINS.map(domain => [domain, { ...SEARCH_ENGINE_BLACKLIST_RULE }])),
  // Default scopes for newly added blacklist entries.
  excludeDomainDefaultRule: { floating:true, hover:true, selection:true, image:true, auto:true }
};

// Credentials and private provider endpoints stay on this device. Non-sensitive
// preferences may continue to use Chrome Sync across the user's browsers.
const LOCAL_ONLY_SETTING_KEYS = Object.freeze([
  "deepseekApiKey", "deepseekBaseUrl", "deepseekModel",
  "deeplAuthKey", "deeplApiType",
  "openaiApiKey", "openaiBaseUrl", "openaiModel", "openaiCustomPrompt",
  "claudeApiKey", "claudeBaseUrl", "claudeModel",
  "geminiApiKey", "geminiModel",
  "ollamaBaseUrl", "ollamaModel",
  "customApiKey", "customBaseUrl", "customModel",
  "verifiedEngines"
]);
const LOCAL_ONLY_SETTING_KEY_SET = new Set(LOCAL_ONLY_SETTING_KEYS);

chrome.storage.local.setAccessLevel?.({ accessLevel:"TRUSTED_CONTEXTS" })?.catch(() => {});
chrome.storage.sync.setAccessLevel?.({ accessLevel:"TRUSTED_CONTEXTS" })?.catch(() => {});

function partitionSettingsByStorage(settings = {}) {
  const synced = {};
  const local = {};
  Object.entries(settings || {}).forEach(([key, value]) => {
    (LOCAL_ONLY_SETTING_KEY_SET.has(key) ? local : synced)[key] = value;
  });
  return { synced, local };
}

async function loadStoredSettings({ migrate = true } = {}) {
  const [syncedRaw, localRaw] = await Promise.all([
    chrome.storage.sync.get(null).catch(() => ({})),
    chrome.storage.local.get(LOCAL_ONLY_SETTING_KEYS).catch(() => ({}))
  ]);
  const synced = Object.assign({}, syncedRaw || {});
  const local = Object.assign({}, localRaw || {});
  const legacyLocal = {};
  const legacyKeys = [];

  LOCAL_ONLY_SETTING_KEYS.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(synced, key)) return;
    legacyKeys.push(key);
    if (!Object.prototype.hasOwnProperty.call(local, key)) {
      legacyLocal[key] = synced[key];
      local[key] = synced[key];
    }
    delete synced[key];
  });

  if (migrate && legacyKeys.length) {
    if (Object.keys(legacyLocal).length) await chrome.storage.local.set(legacyLocal);
    await chrome.storage.sync.remove(legacyKeys);
  }

  return Object.assign({}, DEFAULT_SETTINGS, synced, local);
}

async function saveSettingsByStorage(settings = {}) {
  const { synced, local } = partitionSettingsByStorage(settings);
  const writes = [];
  if (Object.keys(synced).length) writes.push(chrome.storage.sync.set(synced));
  if (Object.keys(local).length) {
    writes.push(chrome.storage.local.set(local));
    writes.push(chrome.storage.sync.remove(Object.keys(local)));
  }
  await Promise.all(writes);
}

function settingsForContentScript(settings = {}) {
  const safe = Object.assign({}, settings, {
    aiDictionaryAvailable: !!(
      settings.deepseekApiKey || settings.openaiApiKey || settings.claudeApiKey ||
      settings.geminiApiKey || (settings.customBaseUrl && settings.customApiKey)
    )
  });
  LOCAL_ONLY_SETTING_KEYS.forEach(key => delete safe[key]);
  return safe;
}

function isTrustedExtensionSender(sender) {
  const senderUrl = String(sender?.url || sender?.origin || "");
  return senderUrl.startsWith(chrome.runtime.getURL(""));
}

function settingsForSender(settings, sender) {
  return isTrustedExtensionSender(sender) ? settings : settingsForContentScript(settings);
}

// Two-tier memory and local cache with a 10,000-entry limit.
const memoryCache = new Map();
const MAX_MEMORY_CACHE = 10000;
// v3 invalidates entries created before Google batches were split into
// independent requests. Those older entries could associate a neighbouring
// paragraph with a short navigation label when a marker was dropped.
const TRANSLATION_CACHE_NAMESPACE = "trans:v3";

function translationCacheKey(engine, sl, tl, text) {
  return `${TRANSLATION_CACHE_NAMESPACE}::${engine}::${sl}->${tl}::${String(text || "").trim()}`;
}

const persistentCacheReady = chrome.storage.local.get("persistentTranslationCache").then((res) => {
  if (res && res.persistentTranslationCache && typeof res.persistentTranslationCache === "object") {
    Object.entries(res.persistentTranslationCache).forEach(([k, v]) => {
      memoryCache.set(k, v);
    });
  }
}).catch(() => {});

function getCache(key) {
  if (!memoryCache.has(key)) return undefined;
  const value = memoryCache.get(key);
  memoryCache.delete(key);
  memoryCache.set(key, value);
  return value;
}

function setCache(key, val) {
  if (memoryCache.has(key)) memoryCache.delete(key);
  if (memoryCache.size >= MAX_MEMORY_CACHE) {
    const first = memoryCache.keys().next().value;
    memoryCache.delete(first);
  }
  memoryCache.set(key, val);
}

let collectionCountsCache = null;

function invalidateDictionaryCache() {
  let changed = false;
  for (const key of Array.from(memoryCache.keys())) {
    if (String(key).startsWith("dict::")) { memoryCache.delete(key); changed = true; }
  }
  if (changed) chrome.storage.local.set({ persistentTranslationCache:Object.fromEntries(Array.from(memoryCache.entries()).slice(0,3000)) }).catch(()=>{});
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.jijianLocalDictionaryMeta) invalidateDictionaryCache();
  if (changes.raccoonVocabularyList || changes.raccoonHighlightSentences) collectionCountsCache = null;
});

let saveCacheTimer = null;
function schedulePersistCache() {
  clearTimeout(saveCacheTimer);
  saveCacheTimer = setTimeout(() => {
    const obj = Object.fromEntries(Array.from(memoryCache.entries()).slice(-3000));
    chrome.storage.local.set({ persistentTranslationCache: obj }).catch(() => {});
  }, 2000);
}

// Initialize defaults and migrate stored settings.
chrome.runtime.onInstalled.addListener(async () => {
  const current = await loadStoredSettings();
  const updated = Object.assign({}, DEFAULT_SETTINGS, current, { version: EXTENSION_VERSION });
  // Migrate legacy defaults without replacing explicit model choices.
  if (!current.deepseekModel || current.deepseekModel === "deepseek-chat" || current.deepseekModel === "deepseek-reasoner") updated.deepseekModel = "deepseek-v4-flash";
  if (!current.openaiModel || (current.openaiModel === "gpt-4o-mini" || current.openaiModel === "gpt-5-mini")) updated.openaiModel = "gpt-5.6-luna";
  if (current.renderStyle === "left-bar") updated.renderStyle = "classic";
  if (current.renderStyle === "wavy") { updated.renderStyle = "underline"; updated.underlineStyle = "wavy"; }
  if (!['clean','native'].includes(current.replaceRenderStyle)) updated.replaceRenderStyle = "clean";
  if (!current.claudeModel || (current.claudeModel === "claude-3-5-sonnet-20241022" || current.claudeModel === "claude-sonnet-4-20250514")) updated.claudeModel = "claude-sonnet-5";
  if (!current.geminiModel || current.geminiModel === "gemini-1.5-flash") updated.geminiModel = "gemini-3.6-flash";
  // Remove only untouched legacy rules so customized domain rules survive.
  const legacyDefaultRule = { floating:true, hover:true, image:true, auto:true, selection:false };
  const sameRule = (a,b) => Object.keys(b).every(k => a?.[k] === b[k]) && Object.keys(a || {}).every(k => k in b);
  if (!current.excludeDomainDefaultRule) updated.excludeDomainDefaultRule = { ...DEFAULT_SETTINGS.excludeDomainDefaultRule };
  if (current.excludeDomainRules && typeof current.excludeDomainRules === "object") {
    const migratedRules = { ...current.excludeDomainRules };
    Object.entries(migratedRules).forEach(([domain, rule]) => { if (sameRule(rule, legacyDefaultRule)) delete migratedRules[domain]; });
    updated.excludeDomainRules = migratedRules;
  }
  if (!current.searchEngineBlacklistSeeded) {
    updated.excludeDomainList = Array.from(new Set([...(Array.isArray(current.excludeDomainList) ? current.excludeDomainList : DEFAULT_SETTINGS.excludeDomainList), ...SEARCH_ENGINE_BLACKLIST_DOMAINS]));
    updated.excludeDomainRules = { ...(updated.excludeDomainRules || {}), ...Object.fromEntries(SEARCH_ENGINE_BLACKLIST_DOMAINS.map(domain => [domain, { ...SEARCH_ENGINE_BLACKLIST_RULE }])) };
    updated.searchEngineBlacklistSeeded = true;
  }
  await saveSettingsByStorage(updated).catch(() => {});
  createContextMenus();
});

function createContextMenus() {
  chrome.contextMenus.removeAll(() => {
    if (chrome.runtime.lastError) {}
    const menus = [
      { id: "raccoon-translate-page", title: "翻译当前网页 (双语/替换对照)", contexts: ["page"] },
      { id: "raccoon-toggle-sidebar", title: "展开/收起侧边栏双语对照", contexts: ["page"] },
      { id: "raccoon-toggle-reader", title: "进入沉浸式精排阅读视图", contexts: ["page"] },
      { id: "raccoon-translate-selection", title: "查词与翻译: '%s'", contexts: ["selection"] },
      { id: "raccoon-open-options", title: "偏好与 API 设置...", contexts: ["action", "page"] }
    ];
    menus.forEach(m => {
      chrome.contextMenus.create(m, () => {
        if (chrome.runtime.lastError) {}
      });
    });
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === "raccoon-translate-page") {
    chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_PAGE_TRANSLATION" }).catch(() => {});
  } else if (info.menuItemId === "raccoon-toggle-sidebar") {
    chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_SIDEBAR_VIEW" }).catch(() => {});
  } else if (info.menuItemId === "raccoon-toggle-reader") {
    chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_READER_MODE" }).catch(() => {});
  } else if (info.menuItemId === "raccoon-translate-selection") {
    chrome.tabs.sendMessage(tab.id, {
      action: "SHOW_SELECTION_TRANSLATION",
      text: info.selectionText
    }).catch(() => {});
  } else if (info.menuItemId === "raccoon-open-options") {
    chrome.runtime.openOptionsPage();
  }
});

chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0]?.id) return;
    const tabId = tabs[0].id;
    if (command === "toggle_page_translation") {
      chrome.tabs.sendMessage(tabId, { action: "TOGGLE_PAGE_TRANSLATION" }).catch(() => {});
    } else if (command === "toggle_sidebar_mode") {
      chrome.tabs.sendMessage(tabId, { action: "TOGGLE_SIDEBAR_VIEW" }).catch(() => {});
    } else if (command === "toggle_selection_translation") {
      chrome.tabs.sendMessage(tabId, { action: "TOGGLE_SELECTION_FEATURE" }).catch(() => {});
    }
  });
});

/**
 * 分层词典引擎（简明翻译 + 完整英文释义 + 英日发音）
 */
async function googleQuickTranslate(text, sl = "auto", tl = "zh-CN") {
  const clean = (text || "").trim();
  if (!clean) return "";
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t&dt=rm&dt=ex&dt=bd&q=${encodeURIComponent(clean)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2600);
    const res = await fetch(url, { headers: { "Accept": "application/json" }, signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return "";
    const data = await res.json();
    const translated = Array.isArray(data?.[0]) ? data[0].map(x => x?.[0] || "").join("") : "";
    const phonetic = data?.[0]?.find?.(x => x?.[3])?.[3] || data?.[0]?.[1]?.[3] || "";
    const romanization = data?.[0]?.find?.(x => x?.[2])?.[2] || data?.[0]?.[1]?.[2] || "";
    const examples = Array.isArray(data?.[13]?.[0]) ? data[13][0].slice(0, 4).map(ex => ex?.[0]?.replace(/<\/?b>/g, "")).filter(Boolean) : [];
    const dictionaryPosMap = {noun:"名词",verb:"动词",adjective:"形容词",adverb:"副词",pronoun:"代词",preposition:"介词",conjunction:"连词",interjection:"感叹词",determiner:"限定词",phrase:"词组"};
    const dictionary = Array.isArray(data?.[1]) ? data[1].map(group => {
      const rawPos = String(group?.[0] || "释义").trim();
      const pos = dictionaryPosMap[rawPos.toLowerCase()] || rawPos;
      const meanings = Array.isArray(group?.[1]) ? group[1].map(item => {
        if (typeof item === "string") return item.trim();
        if (Array.isArray(item) && typeof item[0] === "string") return item[0].trim();
        if (item && typeof item === "object") return String(item.word || item.term || item.translation || "").trim();
        return "";
      }).filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i).slice(0, 6) : [];
      return meanings.length ? { pos, meanings } : null;
    }).filter(Boolean).slice(0, 5) : [];
    return { translated, phonetic, romanization, detectedLang: data?.[2] || sl, examples, dictionary };
  } catch (_) {
    return "";
  }
}

async function translateSenseText(text, sl) {
  const res = await googleQuickTranslate(text, sl, "zh-CN");
  return (res && typeof res === "object" && res.translated) ? res.translated : "";
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 3500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
  } finally {
    clearTimeout(timer);
  }
}

function japaneseDeinflectionCandidates(word) {
  const clean = (word || "").trim();
  const out = [];
  const add = v => { if (v && v !== clean && !out.includes(v)) out.push(v); };
  const iToU = { "い":"う", "き":"く", "ぎ":"ぐ", "し":"す", "ち":"つ", "に":"ぬ", "び":"ぶ", "み":"む", "り":"る" };
  const aToU = { "わ":"う", "か":"く", "が":"ぐ", "さ":"す", "た":"つ", "な":"ぬ", "ば":"ぶ", "ま":"む", "ら":"る" };
  const stemToDictionary = stem => {
    const last = stem.slice(-1);
    if (iToU[last]) add(stem.slice(0, -1) + iToU[last]);
    add(stem + "る");
  };
  const aStemToDictionary = stem => {
    const last = stem.slice(-1);
    if (aToU[last]) add(stem.slice(0, -1) + aToU[last]);
    add(stem + "る");
  };

  let matchedPolite = false;
  ["ませんでした", "ません", "ました", "ます"].forEach(end => {
    if (clean.endsWith(end) && clean.length > end.length) {
      matchedPolite = true;
      const stem = clean.slice(0, -end.length);
      // 「勉強しました」のような する 系も候補に含める。通常の五段/一段候補は辞書側で照合する。
      if (stem === "し") add("する");
      else if (stem.endsWith("し") && stem.length > 1) add(stem.slice(0, -1) + "する");
      stemToDictionary(stem);
    }
  });
  // 丁寧形が明確に取れた場合、末尾の「した」「た」を再解釈して無意味な候補を増やさない。
  if (matchedPolite) return out.slice(0, 6);

  if (clean.endsWith("なかった") && clean.length > 4) {
    const stem = clean.slice(0, -4);
    aStemToDictionary(stem);
  }
  if (clean.endsWith("ない") && clean.length > 2) {
    const stem = clean.slice(0, -2);
    aStemToDictionary(stem);
  }
  if (clean.endsWith("くなかった") && clean.length > 5) add(clean.slice(0, -5) + "い");
  if (clean.endsWith("くない") && clean.length > 3) add(clean.slice(0, -3) + "い");
  if (clean.endsWith("かった") && clean.length > 3) {
    // 「高かった」(高い) と「分かった」(分かる) の両方を上位候補に置く。
    add(clean.slice(0, -3) + "い");
    add(clean.slice(0, -2) + "る");
  }

  if (clean.endsWith("っている")) ["う","つ","る"].forEach(e => add(clean.slice(0, -4) + e));
  if (clean.endsWith("って")) ["う","つ","る"].forEach(e => add(clean.slice(0, -2) + e));
  if (clean.endsWith("った")) ["う","つ","る"].forEach(e => add(clean.slice(0, -2) + e));
  if (clean.endsWith("いている")) add(clean.slice(0, -4) + "く");
  if (clean.endsWith("いた")) add(clean.slice(0, -2) + "く");
  if (clean.endsWith("いでいる")) add(clean.slice(0, -4) + "ぐ");
  if (clean.endsWith("いだ")) add(clean.slice(0, -2) + "ぐ");
  if (clean.endsWith("している")) add(clean.slice(0, -4) + "す");
  if (clean.endsWith("した")) { add(clean.slice(0, -2) + "する"); add(clean.slice(0, -2) + "す"); }
  if (clean.endsWith("んでいる")) ["ぬ","ぶ","む"].forEach(e => add(clean.slice(0, -4) + e));
  if (clean.endsWith("んだ")) ["ぬ","ぶ","む"].forEach(e => add(clean.slice(0, -2) + e));
  if (clean.endsWith("ている") && clean.length > 3) add(clean.slice(0, -3) + "る");
  if (clean.endsWith("て") && clean.length > 1) add(clean.slice(0, -1) + "る");
  if (clean.endsWith("た") && clean.length > 1) add(clean.slice(0, -1) + "る");

  return out.slice(0, 10);
}

function japaneseSegmentCandidates(text) {
  const clean = (text || "").trim();
  const out = [clean];
  // 原形候选必须优先于分词碎片，否则「食べました」可能先命中「した」等无关词条。
  const wholeDeinflected = japaneseDeinflectionCandidates(clean);
  wholeDeinflected.forEach(c => { if (!out.includes(c)) out.push(c); });

  // 一个短的连续词已经能还原出辞书形时，不再继续切出「した / ま / べ」之类碎片。
  // 只有短语或无法整词还原时才交给 Intl.Segmenter 做第二层候选。
  const looksLikeSingleToken = !/[\s、。！？,.!?]/.test(clean) && clean.length <= 16;
  if (wholeDeinflected.length && looksLikeSingleToken) return out.slice(0, 8);

  const parts = [];
  try {
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      const seg = new Intl.Segmenter("ja", { granularity: "word" });
      Array.from(seg.segment(clean))
        .filter(x => x.isWordLike && /[\u3040-\u30ff\u3400-\u9fff]/.test(x.segment))
        .map(x => x.segment.trim())
        .filter(x => x.length > 0 && x !== clean)
        .sort((a,b) => b.length - a.length)
        .slice(0, 5)
        .forEach(x => { if (!parts.includes(x)) parts.push(x); });
    }
  } catch (_) {}
  parts.forEach(x => {
    if (!out.includes(x)) out.push(x);
    japaneseDeinflectionCandidates(x).forEach(c => { if (!out.includes(c)) out.push(c); });
  });
  return out.slice(0, 12);
}

// Lightweight local Romaji -> Hiragana normalizer for Japanese dictionary input.
// It intentionally runs only when the lookup context is already Japanese, so normal English words are never stolen.
function romajiToHiragana(input) {
  let src = String(input || "").toLowerCase().trim()
    .replace(/ā/g, "aa").replace(/ī/g, "ii").replace(/ū/g, "uu").replace(/ē/g, "ee").replace(/ō/g, "ou")
    .replace(/[^a-z'\-\s]/g, "");
  if (!src) return "";

  const table = {
    kya:"きゃ", kyu:"きゅ", kyo:"きょ", gya:"ぎゃ", gyu:"ぎゅ", gyo:"ぎょ",
    sha:"しゃ", shu:"しゅ", sho:"しょ", sya:"しゃ", syu:"しゅ", syo:"しょ",
    ja:"じゃ", ju:"じゅ", jo:"じょ", jya:"じゃ", jyu:"じゅ", jyo:"じょ",
    cha:"ちゃ", chu:"ちゅ", cho:"ちょ", cya:"ちゃ", cyu:"ちゅ", cyo:"ちょ",
    nya:"にゃ", nyu:"にゅ", nyo:"にょ", hya:"ひゃ", hyu:"ひゅ", hyo:"ひょ",
    bya:"びゃ", byu:"びゅ", byo:"びょ", pya:"ぴゃ", pyu:"ぴゅ", pyo:"ぴょ",
    mya:"みゃ", myu:"みゅ", myo:"みょ", rya:"りゃ", ryu:"りゅ", ryo:"りょ",
    fa:"ふぁ", fi:"ふぃ", fe:"ふぇ", fo:"ふぉ", va:"ゔぁ", vi:"ゔぃ", vu:"ゔ", ve:"ゔぇ", vo:"ゔぉ",
    tsa:"つぁ", tsi:"つぃ", tse:"つぇ", tso:"つぉ", she:"しぇ", che:"ちぇ", je:"じぇ",
    ti:"てぃ", tu:"とぅ", di:"でぃ", du:"どぅ",
    shi:"し", chi:"ち", tsu:"つ", fu:"ふ",
    a:"あ", i:"い", u:"う", e:"え", o:"お",
    ka:"か", ki:"き", ku:"く", ke:"け", ko:"こ",
    ga:"が", gi:"ぎ", gu:"ぐ", ge:"げ", go:"ご",
    sa:"さ", si:"し", su:"す", se:"せ", so:"そ",
    za:"ざ", ji:"じ", zi:"じ", zu:"ず", ze:"ぜ", zo:"ぞ",
    ta:"た", te:"て", to:"と", da:"だ", de:"で", do:"ど",
    na:"な", ni:"に", nu:"ぬ", ne:"ね", no:"の",
    ha:"は", hi:"ひ", he:"へ", ho:"ほ",
    ba:"ば", bi:"び", bu:"ぶ", be:"べ", bo:"ぼ",
    pa:"ぱ", pi:"ぴ", pu:"ぷ", pe:"ぺ", po:"ぽ",
    ma:"ま", mi:"み", mu:"む", me:"め", mo:"も",
    ya:"や", yu:"ゆ", yo:"よ",
    ra:"ら", ri:"り", ru:"る", re:"れ", ro:"ろ",
    wa:"わ", wo:"を", wi:"うぃ", we:"うぇ"
  };
  const keys = Object.keys(table).sort((a,b) => b.length - a.length);
  let out = "";
  for (let i = 0; i < src.length;) {
    const c = src[i];
    if (/\s/.test(c)) { out += " "; i++; continue; }
    if (c === "-") { out += "ー"; i++; continue; }
    if (c === "n") {
      const next = src[i + 1] || "";
      if (!next) { out += "ん"; i++; continue; }
      if (next === "'") { out += "ん"; i += 2; continue; }
      if (!/[aeiouy]/.test(next)) { out += "ん"; i++; continue; }
    }
    const next = src[i + 1] || "";
    if (c === next && /[bcdfghjkmprstvwxyz]/.test(c) && c !== "n") {
      out += "っ"; i++; continue;
    }
    let matched = false;
    for (const key of keys) {
      if (src.startsWith(key, i)) {
        out += table[key]; i += key.length; matched = true; break;
      }
    }
    if (!matched) { out += c; i++; }
  }
  return out.replace(/\s+/g, " ").trim();
}

function mapJapanesePos(posList) {
  const joined = (posList || []).join(" · ");
  const maps = [
    [/Ichidan verb/i, "一段动词"], [/Godan verb/i, "五段动词"], [/Suru verb/i, "サ变动词"],
    [/i-adjective/i, "い形容词"], [/na-adjective|adjectival nouns/i, "な形容词"],
    [/noun/i, "名词"], [/adverb/i, "副词"], [/particle/i, "助词"], [/expression/i, "表达"],
    [/transitive verb/i, "及物"], [/intransitive verb/i, "不及物"]
  ];
  const labels = [];
  maps.forEach(([re,label]) => { if (re.test(joined) && !labels.includes(label)) labels.push(label); });
  return labels.length ? labels.join(" · ") : (joined || "释义");
}

async function lookupJapaneseJisho(clean) {
  // Bound the total delay across Japanese dictionary candidates.
  const candidates = japaneseSegmentCandidates(clean).slice(0, 3);

  async function fetchCandidate(candidate) {
    try {
      const url = `https://jisho.org/api/v1/search/words?keyword=${encodeURIComponent(candidate)}`;
      const res = await fetchWithTimeout(url, { headers: { "Accept": "application/json" } }, 1450);
      if (!res.ok) return null;
      const data = await res.json();
      const entries = Array.isArray(data?.data) ? data.data : [];
      if (!entries.length) return null;
      const ranked = entries.slice(0, 6).sort((a,b) => {
        const aw = a?.japanese?.[0]?.word || a?.slug || "";
        const bw = b?.japanese?.[0]?.word || b?.slug || "";
        const score = (w) => w === candidate ? 4 : (w && (w.includes(candidate) || candidate.includes(w)) ? 1 : 0);
        return score(bw) - score(aw);
      });
      return { candidate, entry: ranked[0] };
    } catch (_) {
      return null;
    }
  }

  const fetched = (await Promise.all(candidates.map(fetchCandidate))).filter(Boolean);
  if (!fetched.length) return null;
  fetched.sort((a,b) => {
    const aw = a.entry?.japanese?.[0]?.word || a.entry?.slug || "";
    const bw = b.entry?.japanese?.[0]?.word || b.entry?.slug || "";
    return (bw === b.candidate ? 1 : 0) - (aw === a.candidate ? 1 : 0);
  });

  const { candidate, entry } = fetched[0];
  const jp = entry?.japanese?.find(x => x.word) || entry?.japanese?.[0] || {};
  const lemma = jp.word || entry.slug || candidate;
  const reading = jp.reading || entry?.japanese?.find(x => x.reading)?.reading || "";
  const sensesRaw = (entry.senses || []).slice(0, 3).filter(s => Array.isArray(s.english_definitions) && s.english_definitions.length);
  const senses = await Promise.all(sensesRaw.map(async (sense) => {
    const en = sense.english_definitions.slice(0, 5).join("; ");
    const zh = await translateSenseText(en, "en");
    return { pos: mapJapanesePos(sense.parts_of_speech), en, zh: zh || "" };
  }));
  return { candidate, lemma, reading, senses, tags: entry.tags || [] };
}

async function lookupTatoebaJapaneseExamples(word) {
  const clean = (word || "").trim();
  if (!clean) return [];
  try {
    const url = `https://tatoeba.org/eng/api_v0/search?from=jpn&query=${encodeURIComponent(clean)}&sort=relevance&trans_filter=limit&trans_link=direct&trans_to=eng&to=eng`;
    const res = await fetchWithTimeout(url, { headers: { "Accept": "application/json" } }, 2400);
    if (!res.ok) return [];
    const data = await res.json();
    const rows = Array.isArray(data?.results) ? data.results : (Array.isArray(data?.sentences) ? data.sentences : []);
    const seen = new Set();
    const examples = [];
    for (const row of rows) {
      const source = String(row?.text || row?.sentence || "").trim();
      if (!source || source.length > 160 || seen.has(source) || !source.includes(clean)) continue;
      seen.add(source);
      examples.push(source);
      if (examples.length >= 3) break;
    }
    return Promise.all(examples.map(async source => ({
      source,
      translation: (await translateSenseText(source, "ja")) || ""
    })));
  } catch (_) {
    return [];
  }
}

async function lookupChineseMoedict(word) {
  const clean = (word || "").trim();
  const empty = { definitions: [], classical: [], pinyin: "", pinyinReadings: [], sourceName: "", translations: {}, resolvedTitle: "", sourceQuery: "" };
  if (!clean) return empty;
  const candidates = [clean];
  try {
    const trad = await googleQuickTranslate(clean, "zh-CN", "zh-TW");
    if (trad?.translated && trad.translated !== clean) candidates.push(trad.translated.trim());
  } catch (_) {}
  for (const candidate of [...new Set(candidates)]) {
    try {
      const url = `https://www.moedict.tw/uni/${encodeURIComponent(candidate)}`;
      const res = await fetchWithTimeout(url, { headers: { "Accept": "application/json" } }, 2800);
      if (!res.ok) continue;
      const data = await res.json();
      const heteronyms = Array.isArray(data?.heteronyms) ? data.heteronyms : [];
      if (!heteronyms.length) continue;
      const rawDefs = [];
      const classical = [];
      const readings = [];
      const strip = (v) => String(v || "").replace(/<[^>]+>/g, "").replace(/`[^`]*~/g, "").replace(/\s+/g, " ").trim();
      const asList = (v) => (Array.isArray(v) ? v : (v ? [v] : [])).map(strip).filter(Boolean);
      for (const het of heteronyms.slice(0, 8)) {
        const reading = strip(het?.bopomofo2 || het?.pinyin || "");
        if (reading && !readings.includes(reading)) readings.push(reading);
        for (const def of (Array.isArray(het?.definitions) ? het.definitions : []).slice(0, 10)) {
          const text = strip(def?.def);
          if (text && text.length <= 220 && !rawDefs.some(x => x.text === text)) rawDefs.push({ text, type: strip(def?.type) });
          for (const q of (Array.isArray(def?.quote) ? def.quote : []).slice(0, 2)) {
            const qt = strip(q);
            if (qt && qt.length <= 240 && !classical.includes(qt)) classical.push(qt);
          }
        }
      }
      const translation = data?.translation && typeof data.translation === "object" ? data.translation : {};
      const translations = {
        en: asList(translation.English ?? data?.English),
        de: asList(translation.Deutsch ?? data?.Deutsch),
        fr: asList(translation.francais ?? data?.francais)
      };
      const definitions = await Promise.all(rawDefs.slice(0, 8).map(async item => {
        let text = item.text;
        try { const simp = await googleQuickTranslate(text, "zh-TW", "zh-CN"); if (simp?.translated) text = simp.translated.trim(); } catch (_) {}
        return { text, type: item.type };
      }));
      const classicalSimplified = await Promise.all(classical.slice(0, 4).map(async q => {
        let text = q;
        try { const simp = await googleQuickTranslate(text, "zh-TW", "zh-CN"); if (simp?.translated) text = simp.translated.trim(); } catch (_) {}
        return text;
      }));
      const resolvedTitle = strip(data?.title || candidate) || candidate;
      const isSemanticRedirect = !!resolvedTitle && !candidates.includes(resolvedTitle);
      // Alias entries can contain definitions but omit the CC-CEDICT / CFDict / HanDeDict
      // sidecar fields. For a real semantic redirect, merge translations from the canonical
      // target so 法文/德文不会因为“语法 → 文法”这类跳转而消失。
      if (isSemanticRedirect && (!translations.fr.length || !translations.de.length || !translations.en.length)) {
        try {
          const canonicalRes = await fetchWithTimeout(`https://www.moedict.tw/uni/${encodeURIComponent(resolvedTitle)}`, { headers:{ "Accept":"application/json" } }, 2400);
          if (canonicalRes.ok) {
            const canonical = await canonicalRes.json();
            const ct = canonical?.translation && typeof canonical.translation === "object" ? canonical.translation : {};
            if (!translations.en.length) translations.en = asList(ct.English ?? canonical?.English);
            if (!translations.fr.length) translations.fr = asList(ct.francais ?? canonical?.francais);
            if (!translations.de.length) translations.de = asList(ct.Deutsch ?? canonical?.Deutsch);
          }
        } catch (_) {}
      }
      return {
        definitions,
        classical: classicalSimplified,
        pinyin: readings.join(" · "),
        pinyinReadings: readings,
        translations,
        resolvedTitle,
        redirected: isSemanticRedirect,
        sourceName: "萌典 · 教育部国语辞典",
        sourceQuery: candidate
      };
    } catch (_) {}
  }
  return empty;
}

// ---------- 本地 MDX / MDD 词典 ----------
const LOCAL_DICT_DB_NAME = "jijian-local-dictionaries";
const LOCAL_DICT_HANDLE_STORE = "handles";
const localMdictCache = new Map();

function openLocalDictionaryDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LOCAL_DICT_DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(LOCAL_DICT_HANDLE_STORE)) req.result.createObjectStore(LOCAL_DICT_HANDLE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("无法打开本地词典授权记录"));
  });
}

async function getLocalDictionaryHandle(key) {
  const db = await openLocalDictionaryDb();
  return await new Promise((resolve, reject) => { const tx=db.transaction(LOCAL_DICT_HANDLE_STORE,"readonly"); const req=tx.objectStore(LOCAL_DICT_HANDLE_STORE).get(key); req.onsuccess=()=>resolve(req.result||null); req.onerror=()=>reject(req.error); });
}
async function getLocalDictionaryDirectoryHandle() { return getLocalDictionaryHandle("directory"); }

async function ensureLocalDictionaryPermission(handle) {
  if (!handle) return false;
  try {
    if (typeof handle.queryPermission !== "function") return true;
    const state = await handle.queryPermission({ mode: "read" });
    if (state === "granted") return true;
    // Some Chromium builds restore a persisted directory handle in `prompt`
    // even though an actual read is still permitted in the service worker.
    // Trust a successful benign read instead of making the source disappear.
    try {
      const iterator = handle.values();
      await iterator.next();
      return true;
    } catch (_) { return false; }
  } catch (_) { return false; }
}

async function scanLocalDictionaryFiles(handle) {
  const byBase = new Map();
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind !== "file" || !/\.(mdx|mdd|css)$/i.test(name)) continue;
    const ext = (name.match(/\.([^.]+)$/) || [])[1]?.toLowerCase();
    const base = name.replace(/\.(mdx|mdd|css)$/i, "");
    const row = byBase.get(base) || { name: base, mdxName: "", mddName: "", cssName: "" };
    row[`${ext}Name`] = name;
    byBase.set(base, row);
  }
  return Array.from(byBase.values()).filter(x => x.mdxName).sort((a,b) => a.name.localeCompare(b.name));
}

async function getLocalDictionaryMetaAndHandle() {
  const handle = await getLocalDictionaryDirectoryHandle().catch(() => null);
  const stored = await chrome.storage.local.get("jijianLocalDictionaryMeta").catch(() => ({}));
  let dictionaries = Array.isArray(stored?.jijianLocalDictionaryMeta?.dictionaries) ? stored.jijianLocalDictionaryMeta.dictionaries : [];
  if (!handle) {
    const imported = dictionaries.filter(x=>x.source === "file" && x.enabled !== false);
    // “没有配置词典”不是权限错误。只有确实存在单文件词典时才检查文件权限。
    return { handle: null, dictionaries: imported, permission: imported.length ? true : true };
  }
  const permission = await ensureLocalDictionaryPermission(handle);
  if (!permission) {
    // A persisted File System Access handle can report `prompt` after a restart.
    // Keep metadata intact so settings/lookup can say "reauthorize" rather than
    // making the source appear to have vanished. Reads remain blocked until the
    // user explicitly restores permission from the options page.
    return { handle, dictionaries: dictionaries.filter(x => x.enabled !== false), permission: false };
  }
  // A persisted folder handle must also be represented in metadata; an older
  // same-name file entry must not hide the folder's CSS, audio or image assets.
  if (!dictionaries.length || dictionaries.some(x => !x.mdxName) || !dictionaries.some(x => x.source === "folder")) {
    const scanned = await scanLocalDictionaryFiles(handle);
    const oldAll = stored?.jijianLocalDictionaryMeta?.dictionaries || [];
    const oldByName = new Map(oldAll.map(x => [x.name, x]));
    const imported = oldAll.filter(x => x.source === "file");
    const folderDicts = scanned.map(d => ({ ...d, source:"folder", enabled: oldByName.get(d.name)?.enabled !== false }));
    // Full-folder sources win on a same-base collision. Keep unrelated single-file
    // dictionaries, but do not let a stale single MDX shadow a richer folder source.
    const folderNames = new Set(folderDicts.map(x => x.name));
    dictionaries = [...folderDicts, ...imported.filter(x => !folderNames.has(x.name))];
    await chrome.storage.local.set({ jijianLocalDictionaryMeta: { folderName: handle.name, dictionaries, updatedAt: Date.now() } });
  }
  return { handle, dictionaries: dictionaries.filter(x => x.enabled !== false), permission: true };
}

async function getDictionaryFile(handle, dict, kind = "mdx") {
  const filename = kind === "mdd" ? dict.mddName : dict.mdxName; if(!filename) return null;
  if (dict.source === "file") {
    const key=kind === "mdd" ? dict.mddHandleKey : dict.mdxHandleKey;
    const fh=await getLocalDictionaryHandle(key);
    if(!fh) throw new Error("本地词典文件需要重新选择");
    // Some Chromium builds report persisted handles as `prompt` in a service worker
    // even though getFile() is still allowed. Try the actual read first.
    try { return await fh.getFile(); } catch (_) { throw new Error("本地词典文件需要重新授权"); }
  }
  if(!handle) throw new Error("本地词典文件夹需要重新授权");
  try { const fh=await handle.getFileHandle(filename); return await fh.getFile(); }
  catch (_) { throw new Error("本地词典文件夹需要重新授权"); }
}

async function getMdictReader(handle, dict, kind = "mdx") {
  const filename = kind === "mdd" ? dict.mddName : dict.mdxName;
  if (!filename) return null;
  const file = await getDictionaryFile(handle, dict, kind);
  const key = `${dict.source||"folder"}::${dict.name}::${filename}::${file.size}::${file.lastModified}`;
  if (localMdictCache.has(key)) return localMdictCache.get(key);
  const reader = await new JiJianMDict.MDictLite(file, kind).init();
  localMdictCache.set(key, reader);
  if (localMdictCache.size > 8) localMdictCache.delete(localMdictCache.keys().next().value);
  return reader;
}

function stripLocalDictionaryHtml(html) {
  // 词典自身的 HTML/CSS 是排印资产：保留 style / class / link，脚本则永不执行。
  // DOM/CSS isolation and resource rewriting are completed in the content script Shadow DOM.
  return String(html || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object\b[\s\S]*?<\/object>/gi, "")
    .replace(/<embed\b[^>]*>/gi, "")
    .trim();
}

function normalizeLocalDictionaryRecords(definitions) {
  const seen = new Set();
  const clean = [];
  for (const raw of definitions || []) {
    const html = stripLocalDictionaryHtml(raw);
    if (!html) continue;
    // 有些 MDX 会为同一 key 返回重复记录；不把完全相同的正文重复堆进卡片。
    const sig = html.replace(/\s+/g, " ").trim();
    if (seen.has(sig)) continue;
    seen.add(sig);
    clean.push(html);
    if (clean.length >= 3) break;
  }
  return clean;
}

async function lookupLocalDictionaries(word, aliases = []) {
  if (!word || String(word).trim().length > 120) return { entries: [], permission: true, enabledCount: 0, errors: [] };
  const { handle, dictionaries, permission } = await getLocalDictionaryMetaAndHandle();
  if (!permission || !dictionaries.length) return { entries: [], permission, enabledCount: dictionaries.length, errors: [] };
  const baseQueries = [word, ...(aliases || [])].map(x => String(x || "").trim()).filter(Boolean);
  const queries = [];
  const addQuery = value => { const q=String(value||"").trim(); if(q && !queries.includes(q)) queries.push(q); };
  for (const q of baseQueries) {
    addQuery(q);
    // 少数英文 MDX 明确标记 KeyCaseSensitive，并只保存 About / ABOUT 等形式。
    // 查词体验仍按自然语言习惯做保守的大小写回退，不做模糊 contains 搜索。
    if (/^[A-Za-z][A-Za-z'’ -]{0,79}$/.test(q)) {
      addQuery(q.toLowerCase());
      addQuery(q.replace(/(^|[\s-])([a-z])/g, (_,a,b)=>a+b.toUpperCase()));
      addQuery(q.toUpperCase());
    }
  }
  const entries = [];
  const errors = [];
  // Limit each inline lookup to eight enabled dictionaries to bound query cost.
  const queue = dictionaries.slice(0, 8).map((dict, order) => ({ dict, order }));
  let cursor = 0;
  async function worker() {
    while (cursor < queue.length) {
      const item = queue[cursor++];
      const { dict, order } = item;
      try {
        const reader = await getMdictReader(handle, dict, "mdx");
        if (!reader) continue;
        let definitions = [];
        let matched = "";
        for (const q of queries) {
          const exact = await reader.lookup(q);
          if (exact.length) { definitions = exact; matched = q; break; }
          // Real-world MDX files sometimes store case variants or homograph suffixes.
          // Use the reader's nearby-key index only as a conservative fallback, never "contains" search.
          const candidates = await reader.suggest(q, 8).catch(() => []);
          const norm = (v) => String(v || "").normalize("NFKC").toLocaleLowerCase().replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]+$/g, "").trim();
          const wanted = norm(q);
          const candidate = candidates.find(c => norm(c) === wanted);
          if (candidate) {
            const near = await reader.lookup(candidate);
            if (near.length) { definitions = near; matched = candidate; break; }
          }
        }
        // MDict 常用 @@@LINK=target 保存别名词条；跟随少量重定向，避免把链接占位符当正文展示。
        for (let hop = 0; hop < 3 && definitions.length; hop++) {
          const firstRaw = String(definitions[0] || "").replace(/<[^>]+>/g, "").trim();
          const linkMatch = firstRaw.match(/^@@@LINK\s*=\s*(.+)$/i);
          if (!linkMatch) break;
          const target = String(linkMatch[1] || "").trim();
          if (!target || queries.includes(target)) break;
          const redirected = await reader.lookup(target).catch(() => []);
          if (!redirected.length) break;
          definitions = redirected;
          matched = matched ? `${matched} → ${target}` : target;
        }
        let records = normalizeLocalDictionaryRecords(definitions);
        if (!records.length) continue;
        const totalChars = records.reduce((n, x) => n + x.length, 0);
        const oversized = totalChars > 700000 || records[0].length > 600000;
        let oversizedPreview = "";
        if (oversized) {
          oversizedPreview = records.join(" ")
            .replace(/<style[\s\S]*?<\/style>/gi, " ")
            .replace(/<[^>]+>/g, " ")
            .replace(/&nbsp;|&#160;/gi, " ")
            .replace(/&amp;/gi, "&")
            .replace(/&lt;/gi, "<")
            .replace(/&gt;/gi, ">")
            .replace(/\s+/g, " ").trim().slice(0, 24000);
          // 不把巨型隐藏内容通过 runtime message 整包送进 content script。
          records = [];
        } else {
          // 小词卡只渲染一本词典的首个精确记录；避免同 key 的附加语法文章一次全部铺开。
          records = records.slice(0, 1);
        }
        const stylesheetRefs = [...new Set((definitions || []).flatMap(raw =>
          Array.from(String(raw || "").matchAll(/<link\b[^>]*rel\s*=\s*["'][^"']*stylesheet[^"']*["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*>|<link\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["'][^"']*stylesheet[^"']*["'][^>]*>/gi)).map(m => m[1] || m[2])
        ))].filter(Boolean).slice(0,6);
        entries.push({
          dictionaryName: dict.displayName || dict.name,
          dictionaryKey: dict.name,
          matchedWord: matched,
          order,
          records,
          html: records[0] || "",
          oversized,
          oversizedPreview,
          stylesheetRefs
        });
      } catch (err) {
        const message = String(err?.message || err || "读取失败").slice(0, 120);
        errors.push({ dictionaryName: dict.displayName || dict.name, dictionaryKey: dict.name, message });
        console.warn(`Local dictionary lookup failed: ${dict.name}`, err);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, () => worker()));
  entries.sort((a,b) => a.order - b.order).forEach(x => delete x.order);
  const permissionOk = !errors.some(item => /重新授权|重新选择|权限/.test(String(item?.message || "")));
  return { entries: entries.slice(0, 6), permission: permissionOk, enabledCount: dictionaries.length, errors: errors.slice(0, 4) };
}

function guessResourceMime(path) {
  const ext = String(path || "").split(".").pop().toLowerCase();
  return ({ png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg", gif:"image/gif", webp:"image/webp", svg:"image/svg+xml", mp3:"audio/mpeg", wav:"audio/wav", ogg:"audio/ogg", css:"text/css", ttf:"font/ttf", otf:"font/otf", woff:"font/woff", woff2:"font/woff2" })[ext] || "application/octet-stream";
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i=0;i<bytes.length;i+=chunk) binary += String.fromCharCode(...bytes.subarray(i, i+chunk));
  return btoa(binary);
}

function buildLocalResourceCandidates(resourcePath) {
  let raw = String(resourcePath || "").trim();
  if (!raw) return [];
  try { raw = decodeURIComponent(raw); } catch (_) {}
  raw = raw.replace(/^(?:file|mdd|res):\/\//i, "").replace(/[?#].*$/, "").trim();
  const out = [];
  const push = value => { const v=String(value||"").trim(); if(v && !out.includes(v)) out.push(v); };
  push(raw);
  push(raw.replace(/^\.\//, ""));
  push(raw.replace(/^[/\\]+/, ""));
  const slash = raw.replace(/\\/g, "/");
  push(slash); push(slash.replace(/^\.\//, "")); push(slash.replace(/^\//, ""));
  const backslash = slash.replace(/\//g, "\\");
  push(backslash); push(backslash.replace(/^\\+/, "")); push(`\\${backslash.replace(/^\\+/, "")}`);
  const base = slash.split("/").filter(Boolean).pop();
  if (base) { push(base); push(`\\${base}`); }
  return out.slice(0, 14);
}
async function readFileHandleAsDataUrl(fileHandle, resourceName) {
  if (!fileHandle) return "";
  const file = await fileHandle.getFile();
  const bytes = new Uint8Array(await file.arrayBuffer());
  return `data:${guessResourceMime(resourceName || file.name)};base64,${bytesToBase64(bytes)}`;
}

async function getFileHandleByRelativePath(directoryHandle, relativePath) {
  if (!directoryHandle) return null;
  let clean = String(relativePath || "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
  if (!clean || clean.includes("..")) return null;
  const parts = clean.split("/").filter(Boolean);
  if (!parts.length) return null;
  let dir = directoryHandle;
  for (let i=0;i<parts.length-1;i++) {
    try { dir = await dir.getDirectoryHandle(parts[i]); } catch (_) { return null; }
  }
  try { return await dir.getFileHandle(parts[parts.length-1]); } catch (_) { return null; }
}

async function lookupLocalDictionarySidecarResource(handle, dict, resourcePath) {
  const candidates = buildLocalResourceCandidates(resourcePath);
  // Folder mode is the preferred path: one authorization grants access to CSS,
  // fonts, images and audio next to the MDX/MDD, including nested asset folders.
  if (dict.source !== "file" && handle) {
    for (const candidate of candidates) {
      const clean = String(candidate || "").replace(/\\/g, "/").replace(/^\/+/, "");
      const fh = await getFileHandleByRelativePath(handle, clean).catch(() => null);
      if (fh) {
        try { return await readFileHandleAsDataUrl(fh, clean); } catch (_) {}
      }
    }
  }
  // Single-file mode can pair a standalone <same-base>.css with the MDX.
  // Large asset collections should use folder mode rather than requiring one
  // browser permission prompt per file.
  if (dict.source === "file" && dict.cssHandleKey && dict.cssName) {
    const wanted = candidates.map(x => String(x || "").replace(/\\/g, "/").split("/").pop()?.toLowerCase()).filter(Boolean);
    if (wanted.includes(String(dict.cssName).toLowerCase())) {
      const fh = await getLocalDictionaryHandle(dict.cssHandleKey).catch(() => null);
      if (fh) {
        try { return await readFileHandleAsDataUrl(fh, dict.cssName); } catch (_) { throw new Error("本地词典 CSS 需要重新授权"); }
      }
    }
  }
  return "";
}

async function lookupLocalDictionaryResource(dictionaryName, resourcePath) {
  const { handle, dictionaries, permission } = await getLocalDictionaryMetaAndHandle();
  if (!permission) throw new Error("本地词典需要重新授权");
  const dict = dictionaries.find(x => x.name === dictionaryName || x.displayName === dictionaryName);
  if (!dict) throw new Error("未找到对应的本地词典");

  const sidecar = await lookupLocalDictionarySidecarResource(handle, dict, resourcePath).catch(err => { throw err; });
  if (sidecar) return sidecar;

  if (dict.mddName) {
    const reader = await getMdictReader(handle, dict, "mdd");
    for (const candidate of buildLocalResourceCandidates(resourcePath)) {
      const bytes = await reader.resource(candidate).catch(() => null);
      if (bytes) return `data:${guessResourceMime(candidate)};base64,${bytesToBase64(bytes)}`;
    }
  }
  throw new Error("未找到词典资源；如果词条引用独立 CSS/图片/字体，建议使用“添加文件夹（推荐）”接入整个词典目录");
}


async function lookupWikipediaSummary(term, lang = "en") {
  const clean=String(term||"").replace(/\s+/g," ").trim();
  if(!clean || clean.length>80 || clean.split(/\s+/).length>8) return null;
  const wikiLang=/^(?:en|zh|ja)$/.test(lang)?lang:"en";
  try {
    const title=encodeURIComponent(clean.replace(/ /g,"_"));
    const res=await fetchWithTimeout(`https://${wikiLang}.wikipedia.org/api/rest_v1/page/summary/${title}`,{headers:{Accept:"application/json"}},1400);
    if(!res.ok) return null;
    const data=await res.json();
    if(!data || data.type==="disambiguation" || !String(data.extract||"").trim()) return null;
    const extract=String(data.extract||"").replace(/\s+/g," ").trim();
    if(extract.length<28) return null;
    return {
      title:String(data.title||clean),
      extract:extract.slice(0,2600),
      url:String(data?.content_urls?.desktop?.page||data?.content_urls?.mobile?.page||"")
    };
  } catch (_) { return null; }
}

async function lookupDictionary(text, sl = "auto", tl = "zh-CN") {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  const cacheKey = `dict::schema-1::${sl}->${tl}::${clean.toLowerCase()}`;
  const cached = getCache(cacheKey);
  // Local dictionaries are permission- and source-dependent and must never be
  // frozen inside the online dictionary cache. Refresh them on every lookup so
  // changing folder permissions/imports is reflected immediately in the page.
  if (cached) {
    const aliasCandidates = [cached.lookupForm, cached.normalizedQuery, cached.deinflectedFrom]
      .map(x => String(x || "").trim()).filter(x => x && x !== clean);
    const local = await lookupLocalDictionaries(clean, aliasCandidates);
    return {
      ...cached,
      localDictionaryEntries: local.entries || [],
      localDictionaryPermission: local.permission !== false,
      localDictionaryEnabledCount: Number(local.enabledCount || 0),
      localDictionaryErrors: Array.isArray(local.errors) ? local.errors : []
    };
  }

  const hasKana = /[\u3040-\u30ff\u31f0-\u31ff]/.test(clean);
  const hasHan = /[\u3400-\u9fff]/.test(clean);
  const isRomajiJapanese = sl === "ja" && /^[a-zA-Zāīūēō'\-\s]+$/.test(clean) && clean.length <= 80;
  const japaneseQuery = isRomajiJapanese ? (romajiToHiragana(clean) || clean) : clean;
  const isEnglishWord = !isRomajiJapanese && /^[a-zA-Z][a-zA-Z\s'’-]*$/.test(clean) && clean.split(/\s+/).length <= 5;
  const isJapanese = hasKana || sl === "ja";
  const isChinese = hasHan && !isJapanese && !isEnglishWord;
  const encodedWord = encodeURIComponent(clean);

  // 英语：Free Dictionary API 负责英文词典义，Google 只负责中文对应与例句翻译。
  if (isEnglishWord) {
    const quick = await googleQuickTranslate(clean, "en", "zh-CN");
    let translation = quick?.translated || clean;
    let phonetic = quick?.phonetic || "";
    let humanAudioUs = `https://dict.youdao.com/dictvoice?audio=${encodedWord}&type=2`;
    let humanAudioUk = `https://dict.youdao.com/dictvoice?audio=${encodedWord}&type=1`;
    const senseGroups = [];
    const examplePairs = [];
    const synonyms = new Set();
    const antonyms = new Set();
    let sourceUrls = [];

    try {
      const res = await fetchWithTimeout(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodedWord}`, { headers: { "Accept": "application/json" } }, 3200);
      if (res.ok) {
        const entries = await res.json();
        const posMap = new Map();
        const seenDef = new Set();
        const seenEx = new Set();
        (Array.isArray(entries) ? entries : []).forEach(entry => {
          sourceUrls.push(...(entry.sourceUrls || []));
          const p = entry.phonetics?.find(x => x?.text)?.text || entry.phonetic || "";
          if (p && !phonetic) phonetic = p;
          (entry.phonetics || []).forEach(ph => {
            if (!ph?.audio) return;
            if (/uk|gb/i.test(ph.audio)) humanAudioUk = ph.audio;
            else if (/us/i.test(ph.audio)) humanAudioUs = ph.audio;
          });
          (entry.meanings || []).forEach(meaning => {
            (meaning.synonyms || []).slice(0, 8).forEach(x => x && synonyms.add(String(x)));
            (meaning.antonyms || []).slice(0, 8).forEach(x => x && antonyms.add(String(x)));
            const pos = (meaning.partOfSpeech || "meaning").trim();
            if (!posMap.has(pos)) posMap.set(pos, []);
            (meaning.definitions || []).slice(0, 5).forEach(def => {
              const en = (def?.definition || "").trim();
              if (en && !seenDef.has(en.toLowerCase()) && posMap.get(pos).length < 3) {
                seenDef.add(en.toLowerCase());
                posMap.get(pos).push({ en, example: (def?.example || "").trim() });
              }
            });
          });
        });

        const groups = await Promise.all(Array.from(posMap.entries()).slice(0, 4).map(async ([pos, defs]) => {
          const selected = defs.slice(0, 2);
          const senses = await Promise.all(selected.map(async (def) => ({
            en: def.en,
            zh: (await translateSenseText(def.en, "en")) || "",
            example: def.example || ""
          })));
          const posLabel = ({noun:"名词",verb:"动词",adjective:"形容词",adverb:"副词",pronoun:"代词",preposition:"介词",conjunction:"连词",interjection:"感叹词",determiner:"限定词",exclamation:"感叹词",phrase:"词组"})[String(pos || "").toLowerCase()] || pos;
          return { pos: posLabel, senses };
        }));
        groups.filter(g => g.senses.length).forEach(g => senseGroups.push(g));

        const exampleCandidates = [];
        for (const group of groups) {
          for (const def of group.senses) {
            const ex = (def.example || "").trim();
            if (!ex || seenEx.has(ex.toLowerCase()) || exampleCandidates.length >= 3) continue;
            seenEx.add(ex.toLowerCase());
            exampleCandidates.push(ex);
          }
        }
        const translatedExamples = await Promise.all(exampleCandidates.map(async ex => ({
          source: ex,
          translation: (await translateSenseText(ex, "en")) || ""
        })));
        examplePairs.push(...translatedExamples);
      }
    } catch (err) {
      console.warn("English dictionary lookup warning:", err);
    }

    if (!examplePairs.length && Array.isArray(quick?.examples)) {
      const translatedFallbackExamples = await Promise.all(quick.examples.slice(0, 3).map(async ex => ({
        source: ex,
        translation: (await translateSenseText(ex, "en")) || ""
      })));
      examplePairs.push(...translatedFallbackExamples);
    }

    const local = await lookupLocalDictionaries(clean);
    const result = {
      original: clean,
      lookupForm: clean,
      detectedLang: "en",
      translation,
      phonetic,
      reading: "",
      briefGroups: Array.isArray(quick?.dictionary) ? quick.dictionary : [],
      senseGroups,
      definitions: senseGroups.map(g => ({ pos: g.pos, terms: g.senses.map(x => x.en) })),
      examples: examplePairs.map(x => x.source),
      examplePairs,
      humanAudioUs,
      humanAudioUk,
      sourceName: senseGroups.length ? "Free Dictionary API" : "Google Translate",
      synonyms: Array.from(synonyms).slice(0, 8),
      antonyms: Array.from(antonyms).slice(0, 8),
      sourceUrls: Array.from(new Set(sourceUrls)).slice(0, 2),
      definitionLanguage: "bilingual",
      localDictionaryEntries: local.entries || [],
      localDictionaryPermission: local.permission !== false,
      localDictionaryEnabledCount: Number(local.enabledCount || 0),
      localDictionaryErrors: Array.isArray(local.errors) ? local.errors : []
    };
    setCache(cacheKey, result); schedulePersistCache(); return result;
  }

  // 日语：先分词/尝试原形还原，再以 Jisho(JMdict 系)检索词条；中文解释由英文 sense 对齐翻译。
  if (isJapanese) {
    // Run translation and Jisho in parallel; load Tatoeba examples outside the initial response path.
    const [quick, jisho] = await Promise.all([
      googleQuickTranslate(japaneseQuery, "ja", "zh-CN"),
      lookupJapaneseJisho(japaneseQuery)
    ]);
    const lemma = jisho?.lemma || japaneseQuery;
    const reading = jisho?.reading || quick?.phonetic || "";
    const examplePairs = [];
    const senseGroups = [];
    (jisho?.senses || []).forEach(s => {
      const key = s.pos || "释义";
      let group = senseGroups.find(g => g.pos === key);
      if (!group) { group = { pos: key, senses: [] }; senseGroups.push(group); }
      group.senses.push({ en: s.en, zh: s.zh || "" });
    });
    const local = await lookupLocalDictionaries(clean, [japaneseQuery, lemma]);
    let chineseSameForm = null;
    if (/^[\u3400-\u9fff]{1,8}$/.test(clean)) {
      try { chineseSameForm = await lookupChineseMoedict(clean); } catch (_) {}
    }
    const result = {
      original: clean,
      lookupForm: lemma,
      detectedLang: "ja",
      translation: quick?.translated || senseGroups?.[0]?.senses?.[0]?.zh || japaneseQuery,
      phonetic: "",
      reading,
      romaji: quick?.romanization || "",
      senseGroups,
      definitions: senseGroups.map(g => ({ pos: g.pos, terms: g.senses.map(x => x.zh || x.en) })),
      examplePairs,
      humanAudioUs: `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(lemma)}&le=jap`,
      humanAudioUk: "",
      sourceName: jisho ? "Jisho / JMdict" : "Google 快速释义",
      tags: jisho?.tags || [],
      chineseSameFormDefinitions: Array.isArray(chineseSameForm?.definitions) ? chineseSameForm.definitions.slice(0,4) : [],
      chineseSameFormSource: chineseSameForm?.sourceName || "",
      definitionLanguage: "bilingual",
      deinflectedFrom: lemma !== japaneseQuery ? japaneseQuery : "",
      romajiInput: isRomajiJapanese ? clean : "",
      normalizedQuery: isRomajiJapanese ? japaneseQuery : "",
      localDictionaryEntries: local.entries || [],
      localDictionaryPermission: local.permission !== false,
      localDictionaryEnabledCount: Number(local.enabledCount || 0),
      localDictionaryErrors: Array.isArray(local.errors) ? local.errors : []
    };
    setCache(cacheKey, result); schedulePersistCache(); return result;
  }

  // 中文：中文释义是主体，拼音只作为词头元信息；英/日作为对照。
  if (isChinese) {
    const [en, ja, native] = await Promise.all([
      googleQuickTranslate(clean, "zh-CN", "en"),
      googleQuickTranslate(clean, "zh-CN", "ja"),
      lookupChineseMoedict(clean)
    ]);
    let jaEntry = null;
    if (ja?.translated) {
      try { jaEntry = await lookupJapaneseJisho(ja.translated); } catch (_) {}
    }
    const nativeDefinitions = Array.isArray(native?.definitions) ? native.definitions.map(x => typeof x === "string" ? { text:x, type:"" } : x).filter(x => x?.text) : [];
    const local = await lookupLocalDictionaries(clean);
    const result = {
      original: clean,
      lookupForm: clean,
      isChineseQuery: true,
      detectedLang: "zh",
      translation: nativeDefinitions[0]?.text || clean,
      nativeDefinitions,
      classicalDefinitions: Array.isArray(native?.classical) ? native.classical : [],
      // 萌典若把查询词重定向到另一个词条（例如“语法”→“文法”），
      // 不把目标词条“文法”的拼音直接挂在原查询词“语法”标题下。
      pinyin: native?.redirected ? (en?.romanization || en?.phonetic || "") : (native?.pinyin || en?.romanization || en?.phonetic || ""),
      pinyinReadings: native?.redirected ? [] : (Array.isArray(native?.pinyinReadings) ? native.pinyinReadings : []),
      dictionaryResolvedTitle: native?.resolvedTitle || "",
      dictionaryResolvedPinyin: native?.redirected ? (native?.pinyin || "") : "",
      dictionaryRedirectedFrom: native?.redirected ? clean : "",
      enWord: native?.translations?.en?.[0] || en?.translated || "",
      frWord: native?.translations?.fr?.[0] || "",
      deWord: native?.translations?.de?.[0] || "",
      jaWord: jaEntry?.lemma || ja?.translated || "",
      jaReading: jaEntry?.reading || "",
      jaRomaji: "",
      definitions: nativeDefinitions.length ? [{ pos: "中文", terms: nativeDefinitions.map(x=>x.text) }] : [],
      senseGroups: [],
      examplePairs: [],
      sourceName: native?.sourceName || "Google 对照",
      localDictionaryEntries: local.entries || [],
      localDictionaryPermission: local.permission !== false,
      localDictionaryEnabledCount: Number(local.enabledCount || 0),
      localDictionaryErrors: Array.isArray(local.errors) ? local.errors : []
    };
    setCache(cacheKey, result); schedulePersistCache(); return result;
  }

  const quick = await googleQuickTranslate(clean, sl, tl);
  const local = await lookupLocalDictionaries(clean);
  const result = {
    original: clean,
    detectedLang: quick?.detectedLang || sl,
    translation: quick?.translated || clean,
    phonetic: quick?.phonetic || "",
    definitions: [],
    senseGroups: [],
    examplePairs: [],
    sourceName: "Google Translate",
    localDictionaryEntries: local.entries || [],
    localDictionaryPermission: local.permission !== false,
    localDictionaryEnabledCount: Number(local.enabledCount || 0),
    localDictionaryErrors: Array.isArray(local.errors) ? local.errors : []
  };
  setCache(cacheKey, result); schedulePersistCache(); return result;
}

/**
 * Configurable AI dictionary analysis (DeepSeek / OpenAI / Claude / Gemini)
 */
async function lookupAIDeepDictionary(word, settings, langHint = "auto", context = "", mode = "word", question = "") {
  const contextText = (context || "").trim();
  const languageName = langHint === "ja" ? "Japanese" : (langHint === "en" ? "English" : "the detected language");
  const contextSection = contextText ? `\nSurrounding context from the webpage:\n---\n${contextText.slice(0, 1200)}\n---\n` : "";
  const s = Object.assign({}, DEFAULT_SETTINGS, settings || await loadStoredSettings());

  const basePrompt = mode === "ask_context"
    ? `You are a concise language-reading assistant for a Chinese-speaking learner.
Selected text: “${word}”.${contextSection}
The learner asks: “${String(question || "请解释这段内容").slice(0, 500)}”
Answer the question directly in Chinese. When useful, quote only short fragments of the selected text. Explain meaning, grammar, syntax or nuance only as needed. If the answer naturally contains distinct parts, use 1–3 short Markdown headings; do not force a fixed template. Do not add generic study advice or invented sources.`
    : mode === "word_json"
    ? `You are a professional lexicographer for a Chinese-speaking learner.
Analyze the selected word or short phrase: “${word}”.${contextSection}
Return ONLY valid JSON, no markdown fences, with this shape:
{
  "headword": "dictionary headword",
  "language": "en|ja|zh|other",
  "phonetic": "IPA for English or empty",
  "reading": "kana reading for Japanese or pinyin for Chinese, otherwise empty",
  "lemma": "dictionary form if different, otherwise empty",
  "brief": [{"pos":"part of speech in concise Chinese","meanings":["concise Chinese sense 1","sense 2"]}],
  "details": [{"pos":"part of speech","senses":[{"zh":"Chinese explanation","en":"English definition or gloss"}]}],
  "examples": [{"source":"natural source-language example","translation":"Chinese translation"}],
  "synonyms": ["useful synonym"],
  "notes": ["only genuinely useful usage or collocation note"]
}
Prioritize the meaning in the supplied webpage context when context exists. Keep brief meanings concise, details dictionary-like, maximum 4 POS groups and 3 examples. Do not invent frequency labels or dictionary sources.`
    : mode === "passage_help"
    ? `You are a concise reading assistant for a Chinese-speaking learner.
The selected passage is:
---
${word}
---${contextSection}
The normal translation is already visible in the UI. Do NOT repeat or retranslate the passage.
Use concise Markdown with only these sections when they add value:
## 语境理解
Explain the intended meaning and nuance in this context without repeating the full visible translation.
## 结构
Break the sentence/passage into meaningful chunks and explain their relationship.
## 关键词
Explain only difficult or important words/phrases in context.
## 语法
Explain at most 4 grammar or syntax points that actually appear here.
## 表达扩展
Give 1–2 short new examples for the most useful grammar pattern or expression, each with a Chinese translation.
If there is a genuine ambiguity or nuance, include it naturally under the most relevant section instead of creating a generic “回答” section.
Do not add generic learning advice, invented sources, or unrelated examples.`
    : mode === "japanese_passage"
    ? `You are a Japanese reading tutor for a Chinese-speaking learner.
The learner selected this Japanese sentence or short passage:
---
${word}
---${contextSection}

The normal translation is already visible in the UI. Do NOT repeat it.
Explain THIS passage, not Japanese grammar in general. Use concise clean Markdown with these sections:
## 句子结构
Break the sentence into meaningful chunks. Show each Japanese chunk followed by a short Chinese explanation.
## 语法
Explain only the grammar patterns that actually appear here (maximum 5). For each: pattern → function/meaning → how it works in this sentence.
## 关键词
List only useful words from the selection. For verbs/adjectives give dictionary form; for kanji words give kana reading; include POS and concise Chinese meaning.
## 语感
Briefly explain nuance, omitted subjects, register, or ambiguity only when useful.
## 例句
Give at most 2 short new examples using the most useful grammar pattern or expression from this passage, with Chinese translations.

Do not add invented dictionary-source claims, long introductions, or unrelated examples.`
    : contextText
    ? `You are a concise bilingual lexicographer helping a Chinese-speaking language learner.
The selected ${languageName} word or phrase is: “${word}”.${contextSection}

Your first priority is the meaning of THIS selection IN THIS webpage context. Do not start with a broad encyclopedia-style explanation.
Use clean Markdown and this order:
1. **此处义**: one short Chinese explanation of what the selection means here. If context is available, explicitly tie the explanation to that sentence.
2. **读音 / 原形 / 词性**: for Japanese, give kana reading, dictionary form and POS when relevant; for English, give IPA and POS when useful.
3. **常用义**: give up to 5 useful senses when they genuinely differ, concise Chinese first and English gloss second.
4. **语感与搭配**: only details that help distinguish usage.
5. **例句**: 2–3 natural examples with Chinese translations.

Avoid redundant headings, long introductions, and invented dictionary-source claims.`
    : `You are a concise bilingual lexicographer helping a Chinese-speaking language learner.
Explain the standalone ${languageName} word or phrase “${word}” without pretending that webpage context is available.
Use clean Markdown and this order:
1. **核心义**: one short Chinese definition.
2. **读音 / 原形 / 词性**: give the useful dictionary form and pronunciation information.
3. **常用义**: give up to 5 genuinely useful senses, Chinese first and an English gloss when useful.
4. **语感与搭配**: only distinctions and common collocations that help actual use.
5. **例句**: 2–3 natural examples with Chinese translations.
Avoid redundant headings, long introductions, invented context, and invented dictionary-source claims.`;

  const preferenceInstructions = [
    s.dictionaryAiAnswerStyle === "professional"
      ? "Use a precise, neutral and professional tone with correct terminology."
      : s.dictionaryAiAnswerStyle === "conversational"
        ? "Use approachable conversational Chinese and explain jargon in plain language."
        : "Use a clear, natural tone that balances precision and accessibility.",
    s.dictionaryAiEmojiLevel === "none"
      ? "Do not use emoji."
      : s.dictionaryAiEmojiLevel === "rich"
        ? "Use a few relevant emoji in headings or transitions, but never decorate every sentence."
        : "Use at most one relevant emoji in an occasional heading; keep body text clean.",
    s.dictionaryAiLayout === "bullets"
      ? "Prefer short bullet points when several facts or steps are present."
      : s.dictionaryAiLayout === "paragraphs"
        ? "Prefer short coherent paragraphs; use lists only when necessary for clarity."
        : "Choose short paragraphs or bullets according to the content.",
    s.dictionaryAiExplanationDepth === "simple"
      ? "Keep the explanation introductory and concise; define unavoidable jargon."
      : s.dictionaryAiExplanationDepth === "deep"
        ? "Explain underlying mechanisms, distinctions and edge cases when they genuinely help understanding."
        : "Give a medium-depth explanation with the most useful distinctions.",
    s.dictionaryAiStoryMode === "story-first"
      ? "For abstract concepts, begin with a brief story or fable that builds intuition, then reveal the concept near the end and explain it precisely."
      : s.dictionaryAiStoryMode === "as-needed"
        ? "A very short analogy, story or fable is welcome only when it materially clarifies an abstract concept."
        : "Do not use stories or fables; explain directly.",
    s.dictionaryAiConceptRigor !== false
      ? "For professional concepts, separate established facts from interpretation, state uncertainty, and never claim live web search or cite a source you did not actually access."
      : "Do not fabricate facts, searches or sources."
  ].join("\n- ");
  const prompt = mode === "word_json" ? basePrompt : `${basePrompt}\n\nUser response preferences:\n- ${preferenceInstructions}`;
  const responseMaxTokens = mode === "word_json"
    ? 1100
    : s.dictionaryAiExplanationDepth === "deep"
      ? 1500
      : s.dictionaryAiExplanationDepth === "simple" ? 650 : 1000;
  let engine = s.translationEngine || "deepseek";
  const usableAiEngine = (name) => {
    if (name === "deepseek") return !!s.deepseekApiKey;
    if (name === "openai") return !!s.openaiApiKey;
    if (name === "claude") return !!s.claudeApiKey;
    if (name === "gemini") return !!s.geminiApiKey;
    if (name === "custom") return !!(s.customBaseUrl && s.customApiKey);
    return false;
  };
  if (!usableAiEngine(engine)) {
    if (s.deepseekApiKey) engine = "deepseek";
    else if (s.openaiApiKey) engine = "openai";
    else if (s.claudeApiKey) engine = "claude";
    else if (s.geminiApiKey) engine = "gemini";
    else if (s.customBaseUrl && s.customApiKey) engine = "custom";
  }

  if (engine === "deepseek" && s.deepseekApiKey) {
    let baseUrl = (s.deepseekBaseUrl || "https://api.deepseek.com/v1").replace(/\/+$/, "");
    const url = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${s.deepseekApiKey}` },
      body: JSON.stringify({
        model: s.deepseekModel || "deepseek-v4-flash",
        temperature: 0.3,
        max_tokens: responseMaxTokens,
        messages: [
          { role: "system", content: "You are a professional lexicographer." },
          { role: "user", content: prompt }
        ]
      })
    });
    if (!res.ok) throw new Error(`DeepSeek API 错误 (${res.status})`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
  } else if (engine === "openai" && s.openaiApiKey) {
    let baseUrl = (s.openaiBaseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
    const url = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${s.openaiApiKey}` },
      body: JSON.stringify({
        model: s.openaiModel || "gpt-5.6-luna",
        temperature: 0.3,
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!res.ok) throw new Error(`OpenAI API 错误 (${res.status})`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
  } else if (engine === "claude" && s.claudeApiKey) {
    let baseUrl = (s.claudeBaseUrl || "https://api.anthropic.com").replace(/\/+$/, "");
    const url = baseUrl.endsWith("/v1/messages") ? baseUrl : `${baseUrl}/v1/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": s.claudeApiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: s.claudeModel || "claude-sonnet-5",
        max_tokens: responseMaxTokens,
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!res.ok) throw new Error(`Claude API 错误 (${res.status})`);
    const data = await res.json();
    return data.content?.[0]?.text?.trim() || "";
  } else if (engine === "gemini" && s.geminiApiKey) {
    const model = s.geminiModel || "gemini-3.6-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${s.geminiApiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    if (!res.ok) throw new Error(`Gemini API 错误 (${res.status})`);
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
  } else if (engine === "custom" && s.customBaseUrl && s.customApiKey) {
    let baseUrl = s.customBaseUrl.replace(/\/+$/, "");
    const url = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${s.customApiKey}` },
      body: JSON.stringify({
        model: s.customModel || "gpt-5.6-luna",
        temperature: 0.25,
        messages: [
          { role: "system", content: "You are a concise contextual lexicographer." },
          { role: "user", content: prompt }
        ]
      })
    });
    if (!res.ok) throw new Error(`自定义 AI API 错误 (${res.status})`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
  } else {
    const basic = await lookupDictionary(word, "auto", "zh-CN");
    let text = `### 📖 基础词典释义\n\n**${basic.original}**`;
    if (basic.phonetic) text += ` \`[${basic.phonetic}]\``;
    text += `\n\n**核心翻译**: ${basic.translation}\n\n`;
    if (basic.definitions && basic.definitions.length > 0) {
      text += `**词性与义项**:\n`;
      basic.definitions.forEach(d => {
        text += `- *${d.pos}*: ${d.terms.join("； ")}\n`;
      });
    }
    if (basic.examples && basic.examples.length > 0) {
      text += `\n**例句**:\n`;
      basic.examples.forEach(ex => { text += `- ${ex}\n`; });
    }
    return text;
  }
}

function normalizeTranslationPunctuation(value, targetLang = "") {
  const text = String(value ?? "");
  // Citation links remain usable in the original line. A translation engine
  // can only return their bracketed labels as dead text, so omit trailing
  // reference clusters such as "[2] [n 1]" from the translated line.
  const withoutTrailingReferences = text.replace(/(?:\s*(?:\[\s*(?:[a-z]{1,4}\s*)?\d+(?:\s*[-–]\s*\d+)?\s*\]|【\s*(?:[a-z]{1,4}\s*)?\d+(?:\s*[-–]\s*\d+)?\s*】)){1,8}\s*$/gi, "").trimEnd();
  const normalizedTarget = String(targetLang || "").trim().toLowerCase().replace(/_/g, "-");
  if (!/^zh(?:-|$)/.test(normalizedTarget)) return withoutTrailingReferences;

  return withoutTrailingReferences
    // 中文行文使用双破折号；保留负数、数值区间、URL 与单词内部连字符。
    .replace(/[ \t]*[—–―][ \t]*/g, "——")
    .replace(/(\S)[ \t]+-[ \t]+(\S)/g, "$1——$2")
    .replace(/([\u3400-\u9fff])[ \t]*-[ \t]*([\u3400-\u9fff])/g, "$1——$2")
    .replace(/(?:——){2,}/g, "——")
    .replace(/\.{3,}/g, "……")
    .replace(/([\u3400-\u9fff])[ \t]*,[ \t]*(?=[\u3400-\u9fff]|$)/g, "$1，")
    .replace(/([\u3400-\u9fff])[ \t]*;[ \t]*(?=[\u3400-\u9fff]|$)/g, "$1；")
    .replace(/([\u3400-\u9fff])[ \t]*:[ \t]*(?=[\u3400-\u9fff]|$)/g, "$1：")
    .replace(/([\u3400-\u9fff])[ \t]*\?+/g, "$1？")
    .replace(/([\u3400-\u9fff])[ \t]*!+/g, "$1！")
    .replace(/([\u3400-\u9fff])\.(?=\s|$|[”’"）】])/g, "$1。")
    .replace(/[ \t]+([，。；：！？])/g, "$1");
}

/**
 * 翻译调度核心
 */
async function translateText(text, sl = "auto", tl = "zh-CN", settings = null) {
  if (!text || !text.trim()) return { text: "", detectedLang: sl };
  await persistentCacheReady;

  if (!settings) {
    settings = await loadStoredSettings();
  }

  const engine = settings.translationEngine || "google";
  const cacheKey = translationCacheKey(engine, sl, tl, text);
  const cached = getCache(cacheKey);
  if (cached) {
    const normalizedText = normalizeTranslationPunctuation(cached.text, tl);
    if (normalizedText !== cached.text) {
      const normalizedCached = Object.assign({}, cached, { text: normalizedText });
      setCache(cacheKey, normalizedCached);
      schedulePersistCache();
      return normalizedCached;
    }
    return cached;
  }

  let res = null;

  switch (engine) {
    case "deepseek":
      res = await translateWithDeepSeek(text, sl, tl, settings);
      break;
    case "deepl":
      res = await translateWithDeepL(text, sl, tl, settings);
      break;
    case "openai":
      res = await translateWithOpenAI(text, sl, tl, settings);
      break;
    case "claude":
      res = await translateWithClaude(text, sl, tl, settings);
      break;
    case "gemini":
      res = await translateWithGemini(text, sl, tl, settings);
      break;
    case "ollama":
      res = await translateWithOllama(text, sl, tl, settings);
      break;
    case "custom":
      res = await translateWithCustomOpenAI(text, sl, tl, settings);
      break;
    case "google":
    default:
      res = await translateWithGoogle(text, sl, tl);
      break;
  }

  if (res && res.text) {
    res = Object.assign({}, res, { text: normalizeTranslationPunctuation(res.text, tl) });
    setCache(cacheKey, res);
    schedulePersistCache();
  }
  return res;
}

async function translateWithDeepSeek(text, sl, tl, settings) {
  if (!settings.deepseekApiKey) throw new Error("请在弹窗或设置中配置 DeepSeek API Key");
  let baseUrl = (settings.deepseekBaseUrl || "https://api.deepseek.com/v1").replace(/\/+$/, "");
  const url = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;
  const model = settings.deepseekModel || "deepseek-v4-flash";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${settings.deepseekApiKey}`
    },
    body: JSON.stringify({
      model: model,
      temperature: 0.2,
      messages: [
        { role: "system", content: `You are an expert bilingual translator. Translate the text into '${tl}'. Preserve sentence structure, terminology, and natural phrasing. Output ONLY the direct translated text.` },
        { role: "user", content: text }
      ]
    })
  });

  if (!response.ok) {
    const err = await response.text().catch(() => "");
    throw new Error(`DeepSeek API 错误 (${response.status}): ${err || response.statusText}`);
  }

  const data = await response.json();
  const trans = data.choices?.[0]?.message?.content?.trim();
  return { original: text, text: trans || text, detectedLang: sl };
}

async function translateWithGoogle(text, sl = "auto", tl = "zh-CN") {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6500);

  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(sl)}&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`;
  try {
    const response = await fetch(url, { headers: { "Accept": "application/json" }, signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`Google 翻译响应异常 (${response.status})`);
    const data = await response.json();
    let translatedText = "";
    let detectedLang = sl;

    if (Array.isArray(data) && Array.isArray(data[0])) {
      translatedText = data[0].map(item => item[0] || "").join("");
    }
    if (Array.isArray(data) && data[2]) detectedLang = data[2];

    return { original: text, text: translatedText, detectedLang: detectedLang };
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

async function translateWithDeepL(text, sl, tl, settings) {
  if (!settings.deeplAuthKey) throw new Error("请在设置中配置 DeepL Auth Key");
  const endpoint = settings.deeplApiType === "pro" ? "https://api.deepl.com/v2/translate" : "https://api-free.deepl.com/v2/translate";
  let targetUpper = tl.replace("-CN", "").replace("-TW", "").toUpperCase();
  if (targetUpper === "ZH") targetUpper = "ZH-HANS";

  const params = new URLSearchParams();
  params.append("auth_key", settings.deeplAuthKey);
  params.append("text", text);
  params.append("target_lang", targetUpper);
  if (sl && sl !== "auto") params.append("source_lang", sl.toUpperCase());

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });
  if (!response.ok) throw new Error(`DeepL API 错误 (${response.status})`);
  const data = await response.json();
  return { original: text, text: data.translations[0]?.text || text, detectedLang: sl };
}

async function translateWithOpenAI(text, sl, tl, settings) {
  if (!settings.openaiApiKey) throw new Error("请在设置中配置 OpenAI API Key");
  let baseUrl = (settings.openaiBaseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const url = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${settings.openaiApiKey}` },
    body: JSON.stringify({
      model: settings.openaiModel || "gpt-5.6-luna",
      temperature: 0.2,
      messages: [
        { role: "system", content: `${settings.openaiCustomPrompt || "Translate accurately with natural phrasing."}\nTarget language: ${tl}` },
        { role: "user", content: text }
      ]
    })
  });
  if (!response.ok) throw new Error(`OpenAI 响应异常 (${response.status})`);
  const data = await response.json();
  return { original: text, text: data.choices?.[0]?.message?.content?.trim() || text, detectedLang: sl };
}

async function translateWithClaude(text, sl, tl, settings) {
  if (!settings.claudeApiKey) throw new Error("请在设置中配置 Claude API Key");
  let baseUrl = (settings.claudeBaseUrl || "https://api.anthropic.com").replace(/\/+$/, "");
  const url = baseUrl.endsWith("/v1/messages") ? baseUrl : `${baseUrl}/v1/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": settings.claudeApiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: settings.claudeModel || "claude-sonnet-5",
      max_tokens: 1024,
      system: `Translate accurately into target language '${tl}'. Output ONLY direct translation.`,
      messages: [{ role: "user", content: text }]
    })
  });
  if (!response.ok) throw new Error(`Claude 响应异常 (${response.status})`);
  const data = await response.json();
  return { original: text, text: data.content?.[0]?.text?.trim() || text, detectedLang: sl };
}

async function translateWithGemini(text, sl, tl, settings) {
  if (!settings.geminiApiKey) throw new Error("请在设置中配置 Gemini API Key");
  const model = settings.geminiModel || "gemini-3.6-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.geminiApiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: `Translate directly into '${tl}':\n\n${text}` }] }] })
  });
  if (!response.ok) throw new Error(`Gemini 响应异常 (${response.status})`);
  const data = await response.json();
  return { original: text, text: data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || text, detectedLang: sl };
}

async function translateWithOllama(text, sl, tl, settings) {
  const baseUrl = (settings.ollamaBaseUrl || "http://localhost:11434").replace(/\/+$/, "");
  const url = baseUrl.endsWith("/api/generate") ? baseUrl : `${baseUrl}/api/generate`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: settings.ollamaModel || "qwen2.5:7b", prompt: `Translate into ${tl}:\n${text}`, stream: false })
  });
  if (!response.ok) throw new Error(`Ollama 连接失败 (${response.status})`);
  const data = await response.json();
  return { original: text, text: data.response?.trim() || text, detectedLang: sl };
}

async function translateWithCustomOpenAI(text, sl, tl, settings) {
  if (!settings.customBaseUrl) throw new Error("请填写自定义 Base URL");
  let baseUrl = settings.customBaseUrl.replace(/\/+$/, "");
  const url = baseUrl.endsWith("/chat/completions") ? baseUrl : `${baseUrl}/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${settings.customApiKey || ""}` },
    body: JSON.stringify({
      model: settings.customModel || "gpt-3.5-turbo",
      temperature: 0.2,
      messages: [{ role: "system", content: `Translate into ${tl}. Output only translation.` }, { role: "user", content: text }]
    })
  });
  if (!response.ok) throw new Error(`自定义 API 响应异常 (${response.status})`);
  const data = await response.json();
  return { original: text, text: data.choices?.[0]?.message?.content?.trim() || text, detectedLang: sl };
}

/**
 * 结构化合批批量并发
 */
async function translateBatchWithIds(items, sl = "auto", tl = "zh-CN", engineOverride = null) {
  if (!items || !items.length) return [];
  await persistentCacheReady;

  const settings = await loadStoredSettings();
  if (engineOverride) settings.translationEngine = engineOverride;
  const engine = settings.translationEngine || "google";

  const results = new Array(items.length);
  const uncachedList = [];

  items.forEach((item, index) => {
    const key = translationCacheKey(engine, sl, tl, item.text);
    const cached = getCache(key);
    if (cached) {
      results[index] = { id: item.id, text: normalizeTranslationPunctuation(cached.text, tl), detectedLang: cached.detectedLang };
    } else {
      uncachedList.push({ index, id: item.id, text: item.text });
    }
  });

  if (uncachedList.length === 0) return results;

  // Google's public endpoint has no structured response contract for our
  // paragraph markers. Translating it one unit at a time prevents a dropped or
  // duplicated marker from assigning one paragraph's translation to another.
  const BUNDLE_SIZE = engine === "google" ? 1 : 8;
  const bundles = [];
  for (let i = 0; i < uncachedList.length; i += BUNDLE_SIZE) {
    bundles.push(uncachedList.slice(i, i + BUNDLE_SIZE));
  }

  const CONCURRENCY = engine === "google" ? 3 : 4;
  let currBundle = 0;

  async function translateUnitWithRetry(target) {
    const attempts = engine === "google" ? 3 : 1;
    let lastError = null;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        return await translateText(target.text, sl, tl, settings);
      } catch (error) {
        lastError = error;
        if (attempt + 1 < attempts) {
          await new Promise(resolve => setTimeout(resolve, 260 * (attempt + 1) + Math.floor(Math.random() * 180)));
        }
      }
    }
    throw lastError || new Error("翻译请求失败");
  }

  async function bundleWorker() {
    while (currBundle < bundles.length) {
      const bundle = bundles[currBundle++];
      if (!bundle) break;

      if (bundle.length === 1) {
        const target = bundle[0];
        try {
          const singleRes = await translateUnitWithRetry(target);
          results[target.index] = { id: target.id, text: singleRes.text, detectedLang: singleRes.detectedLang };
          setCache(translationCacheKey(engine, sl, tl, target.text), singleRes);
        } catch (error) {
          results[target.index] = { id: target.id, text: target.text, error:error?.message || String(error) };
        }
        continue;
      }

      const taggedTexts = bundle.map((item, idx) => `⟦${idx}⟧ ${item.text}`).join("\n\n");

      try {
        const transRes = await translateText(taggedTexts, sl, tl, settings);
        const rawText = transRes.text;
        const pattern = /(?:⟦|\[|【)(\d+)(?:⟧|\]|】)\s*([\s\S]*?)(?=(?:⟦|\[|【)\d+(?:⟧|\]|】)|$)/g;
        let match;
        let matchCount = 0;

        while ((match = pattern.exec(rawText)) !== null) {
          const idx = parseInt(match[1], 10);
          const content = normalizeTranslationPunctuation(match[2].trim(), tl);
          if (idx >= 0 && idx < bundle.length && content) {
            const target = bundle[idx];
            const rObj = { id: target.id, text: content, detectedLang: transRes.detectedLang };
            setCache(translationCacheKey(engine, sl, tl, target.text), { text: content, detectedLang: transRes.detectedLang });
            results[target.index] = rObj;
            matchCount++;
          }
        }

        if (matchCount < bundle.length) {
          for (let k = 0; k < bundle.length; k++) {
            const target = bundle[k];
            if (!results[target.index]) {
              const singleRes = await translateUnitWithRetry(target);
              results[target.index] = { id: target.id, text: singleRes.text, detectedLang: singleRes.detectedLang };
              setCache(translationCacheKey(engine, sl, tl, target.text), singleRes);
            }
          }
        }
      } catch (err) {
        for (let k = 0; k < bundle.length; k++) {
          const target = bundle[k];
          try {
            const singleRes = await translateUnitWithRetry(target);
            results[target.index] = { id: target.id, text: singleRes.text, detectedLang: singleRes.detectedLang };
            setCache(translationCacheKey(engine, sl, tl, target.text), singleRes);
          } catch (e2) {
            results[target.index] = { id: target.id, text: target.text, error: e2.message };
          }
        }
      }
    }
  }

  const workers = [];
  for (let w = 0; w < Math.min(CONCURRENCY, bundles.length); w++) {
    workers.push(bundleWorker());
  }
  await Promise.all(workers);

  schedulePersistCache();
  return results;
}


async function listProviderModels(engine, suppliedSettings = null) {
  const s = Object.assign({}, DEFAULT_SETTINGS, suppliedSettings || await loadStoredSettings());
  const cleanBase = (value, fallback) => String(value || fallback || "").replace(/\/+$/, "");
  const normalize = (items) => Array.from(new Set((items || []).filter(Boolean).map(String))).sort((a, b) => a.localeCompare(b));

  if (engine === "deepseek" || engine === "openai" || engine === "custom") {
    const base = engine === "deepseek"
      ? cleanBase(s.deepseekBaseUrl, "https://api.deepseek.com/v1")
      : engine === "openai"
        ? cleanBase(s.openaiBaseUrl, "https://api.openai.com/v1")
        : cleanBase(s.customBaseUrl, "");
    const key = engine === "deepseek" ? s.deepseekApiKey : engine === "openai" ? s.openaiApiKey : s.customApiKey;
    if (!base) throw new Error("请先填写 Base URL");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    try {
      const res = await fetch(`${base}/models`, {
        headers: key ? { "Authorization": `Bearer ${key}`, "Accept": "application/json" } : { "Accept": "application/json" },
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`模型列表请求失败 (${res.status})`);
      const data = await res.json();
      return normalize((data?.data || data?.models || []).map(x => x?.id || x?.name));
    } finally { clearTimeout(timer); }
  }

  if (engine === "claude") {
    if (!s.claudeApiKey) throw new Error("请先填写 Claude API Key");
    const base = cleanBase(s.claudeBaseUrl, "https://api.anthropic.com");
    const res = await fetchWithTimeout(`${base}/v1/models`, {
      headers: {
        "x-api-key": s.claudeApiKey,
        "anthropic-version": "2023-06-01",
        "Accept": "application/json"
      }
    }, 6500);
    if (!res.ok) throw new Error(`模型列表请求失败 (${res.status})`);
    const data = await res.json();
    return normalize((data?.data || []).map(x => x?.id));
  }

  if (engine === "gemini") {
    if (!s.geminiApiKey) throw new Error("请先填写 Gemini API Key");
    const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(s.geminiApiKey)}`, {
      headers: { "Accept": "application/json" }
    }, 6500);
    if (!res.ok) throw new Error(`模型列表请求失败 (${res.status})`);
    const data = await res.json();
    return normalize((data?.models || [])
      .filter(x => !Array.isArray(x?.supportedGenerationMethods) || x.supportedGenerationMethods.includes("generateContent"))
      .map(x => String(x?.name || "").replace(/^models\//, "")));
  }

  if (engine === "ollama") {
    const base = cleanBase(s.ollamaBaseUrl, "http://localhost:11434");
    const res = await fetchWithTimeout(`${base}/api/tags`, { headers: { "Accept": "application/json" } }, 4500);
    if (!res.ok) throw new Error(`Ollama 模型列表请求失败 (${res.status})`);
    const data = await res.json();
    return normalize((data?.models || []).map(x => x?.name || x?.model));
  }

  throw new Error("此翻译引擎没有可选择的模型");
}

// 同一浏览器标签页中的翻译会话。使用 storage.session 而不是仅存内存，
// 避免 MV3 service worker 休眠后丢失状态；离开当前站点时自动失效。
function tabTranslationSessionKey(tabId) {
  return `jijianTabTranslationSession:${tabId}`;
}

async function setTabTranslationSession(tabId, payload = {}) {
  if (!Number.isInteger(tabId)) return;
  const key = tabTranslationSessionKey(tabId);
  if (payload.active === false) {
    await chrome.storage.session.remove(key).catch(() => {});
    return;
  }
  const siteKey = String(payload.siteKey || "").trim();
  if (!siteKey) return;
  await chrome.storage.session.set({
    [key]: { active:true, siteKey, displayMode:String(payload.displayMode || "bilingual"), updatedAt:Date.now() }
  }).catch(() => {});
}

async function getTabTranslationSession(tabId, siteKey = "") {
  if (!Number.isInteger(tabId)) return null;
  const key = tabTranslationSessionKey(tabId);
  const data = await chrome.storage.session.get(key).catch(() => ({}));
  const session = data?.[key];
  if (!session?.active) return null;
  const requestedSite = String(siteKey || "").trim();
  if (requestedSite && session.siteKey !== requestedSite) {
    await chrome.storage.session.remove(key).catch(() => {});
    return null;
  }
  return session;
}

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(tabTranslationSessionKey(tabId)).catch(() => {});
});

// 统一消息监听

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const { action } = request;

  if (action === "OPEN_OPTIONS_PAGE") {
    chrome.runtime.openOptionsPage().then(() => sendResponse({ success:true })).catch(err => sendResponse({ success:false, error:err?.message || "无法打开设置" }));
    return true;
  }

  if (action === "SET_TAB_TRANSLATION_SESSION") {
    const tabId = sender.tab?.id;
    setTabTranslationSession(tabId, { active:request.active !== false, siteKey:request.siteKey, displayMode:request.displayMode })
      .then(() => sendResponse({ success:true }))
      .catch(err => sendResponse({ success:false, error:err?.message || String(err) }));
    return true;
  }

  if (action === "GET_TAB_TRANSLATION_SESSION") {
    const tabId = sender.tab?.id;
    getTabTranslationSession(tabId, request.siteKey)
      .then(session => sendResponse({ success:true, active:!!session, session:session || null }))
      .catch(err => sendResponse({ success:false, active:false, error:err?.message || String(err) }));
    return true;
  }

  if (action === "LOOKUP_DICTIONARY") {
    lookupDictionary(request.text, request.sl || "auto", request.tl || "zh-CN")
      .then(res => sendResponse({ success: true, data: res }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === "LOOKUP_WIKIPEDIA_SUMMARY") {
    lookupWikipediaSummary(request.text || "", request.lang || "en")
      .then(data => sendResponse({ success:true, data:data || null }))
      .catch(() => sendResponse({ success:true, data:null }));
    return true;
  }


  if (action === "LOOKUP_LOCAL_DICTIONARIES_TEST") {
    lookupLocalDictionaries(request.text || "")
      .then(res => sendResponse({ success: true, ...res }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === "LOOKUP_LOCAL_DICTIONARY_RESOURCE") {
    lookupLocalDictionaryResource(request.dictionaryName, request.path)
      .then(dataUrl => sendResponse({ success: true, dataUrl }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === "RESCAN_LOCAL_DICTIONARIES") {
    getLocalDictionaryMetaAndHandle()
      .then(({ dictionaries, permission, handle }) => sendResponse({ success: true, permission, folderName: handle?.name || "", dictionaries }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === "LOOKUP_AI_DEEP_DICT") {
    const aiRequestKey = `dict-ai-response::${JSON.stringify([request.text || "", request.sl || "auto", request.context || "", request.mode || "word", request.question || ""])}`;
    const cachedAiResponse = getCache(aiRequestKey);
    if (typeof cachedAiResponse === "string" && cachedAiResponse) {
      sendResponse({ success:true, markdown:cachedAiResponse, cached:true });
      return false;
    }
    lookupAIDeepDictionary(request.text, request.settings, request.sl || "auto", request.context || "", request.mode || "word", request.question || "")
      .then(markdown => {
        if (markdown) { setCache(aiRequestKey, markdown); schedulePersistCache(); }
        sendResponse({ success: true, markdown: markdown });
      })
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === "GET_DICTIONARY_AI_CACHE") {
    sendResponse({ success:true, data:getCache(`dict-ai-ui::${String(request.key || "")}`) || null });
    return false;
  }

  if (action === "SET_DICTIONARY_AI_CACHE") {
    const key = `dict-ai-ui::${String(request.key || "")}`;
    setCache(key, request.data || null);
    schedulePersistCache();
    sendResponse({ success:true });
    return false;
  }

  if (action === "TRANSLATE_SINGLE_BLOCK") {
    translateText(request.text, request.sl || "auto", request.tl || "zh-CN")
      .then(res => sendResponse({ success: true, text: res.text, detectedLang: res.detectedLang }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === "TRANSLATE_INPUT_TEXT") {
    translateText(request.text, request.sl || "auto", request.tl || "en")
      .then(res => sendResponse({ success: true, text: res.text }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === "ADD_HIGHLIGHT_SENTENCE") {
    chrome.storage.local.get("raccoonHighlightSentences").then(res => {
      const list = Array.isArray(res.raccoonHighlightSentences) ? res.raccoonHighlightSentences : [];
      const isExist = list.some(item => (item.orig || "").trim() === (request.item.orig || "").trim());
      if (!isExist) {
        list.unshift(request.item);
        chrome.storage.local.set({ raccoonHighlightSentences: list }).then(() => {
          sendResponse({ success: true, added: true });
        });
      } else {
        sendResponse({ success: true, added: false });
      }
    }).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === "GET_COLLECTION_COUNTS") {
    if (collectionCountsCache) {
      sendResponse({ success: true, ...collectionCountsCache });
      return false;
    }
    chrome.storage.local.get(["raccoonVocabularyList", "raccoonHighlightSentences"]).then(res => {
      const vocabulary = Array.isArray(res.raccoonVocabularyList) ? res.raccoonVocabularyList : [];
      const highlights = Array.isArray(res.raccoonHighlightSentences) ? res.raccoonHighlightSentences : [];
      collectionCountsCache = { vocabularyCount: vocabulary.length, highlightCount: highlights.length };
      sendResponse({ success: true, ...collectionCountsCache });
    }).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === "GET_HIGHLIGHT_SENTENCES") {
    chrome.storage.local.get("raccoonHighlightSentences").then(res => {
      const list = Array.isArray(res.raccoonHighlightSentences) ? res.raccoonHighlightSentences : [];
      sendResponse({ success: true, list: list });
    }).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === "REMOVE_HIGHLIGHT_SENTENCE") {
    chrome.storage.local.get("raccoonHighlightSentences").then(res => {
      let list = Array.isArray(res.raccoonHighlightSentences) ? res.raccoonHighlightSentences : [];
      list = request.id
        ? list.filter(item => item.id !== request.id)
        : list.filter(item => String(item.orig || "").trim() !== String(request.orig || "").trim());
      chrome.storage.local.set({ raccoonHighlightSentences: list }).then(() => {
        sendResponse({ success: true });
      });
    }).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === "ADD_VOCABULARY") {
    const entry = request.entry || {};
    const lang = String(entry.lang || "und").toLowerCase();
    if (!entry.word || !String(entry.word).trim()) {
      sendResponse({ success: false, error: "生词内容为空" });
      return false;
    }
    entry.lang = lang;
    chrome.storage.local.get("raccoonVocabularyList").then(res => {
      const list = Array.isArray(res.raccoonVocabularyList) ? res.raccoonVocabularyList : [];
      if (!list.some(item => String(item.word || "").toLowerCase() === String(entry.word).toLowerCase() && String(item.lang || 'und').toLowerCase() === lang)) {
        list.unshift(entry);
        chrome.storage.local.set({ raccoonVocabularyList: list });
      }
      sendResponse({ success: true });
    }).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === "GET_VOCABULARY") {
    chrome.storage.local.get("raccoonVocabularyList").then(res => {
      const list = Array.isArray(res.raccoonVocabularyList) ? res.raccoonVocabularyList : [];
      sendResponse({ success: true, list });
    }).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === "REMOVE_VOCABULARY") {
    chrome.storage.local.get("raccoonVocabularyList").then(res => {
      let list = Array.isArray(res.raccoonVocabularyList) ? res.raccoonVocabularyList : [];
      const targetLang = String(request.lang || "").toLowerCase();
      list = list.filter(item => {
        const sameWord = String(item.word || "").toLowerCase() === String(request.word || "").toLowerCase();
        const sameLang = !targetLang || String(item.lang || "und").toLowerCase() === targetLang;
        return !(sameWord && sameLang);
      });
      chrome.storage.local.set({ raccoonVocabularyList: list });
      sendResponse({ success: true });
    }).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }


  if (action === "FETCH_IMAGE_DATA_URL") {
    (async () => {
      try {
        const url = String(request.url || "");
        if (!/^https?:\/\//i.test(url)) throw new Error("仅支持 http/https 图片地址");
        const pageUrl = /^https?:\/\//i.test(String(request.pageUrl || "")) ? String(request.pageUrl) : undefined;
        const res = await fetchWithTimeout(url, {
          headers: { "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8" },
          credentials: "include",
          referrer: pageUrl,
          referrerPolicy: "strict-origin-when-cross-origin"
        }, 18000);
        if (!res.ok) throw new Error(`图片读取失败 (${res.status})`);
        const responseType = String(res.headers.get("content-type") || "").toLowerCase();
        if (responseType.startsWith("text/html") || responseType.includes("application/json")) throw new Error("图片地址返回了网页内容，可能需要重新登录或刷新页面");
        const blob = await res.blob();
        if (!blob.size) throw new Error("图片内容为空");
        if (blob.size > 25 * 1024 * 1024) throw new Error("图片超过 25MB，暂不处理");
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
        const dataUrl = `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
        sendResponse({ success: true, dataUrl, mime: blob.type || "image/png" });
      } catch (err) {
        sendResponse({ success: false, error: err?.message || String(err) });
      }
    })();
    return true;
  }

  if (action === "TRANSLATE_BATCH_IDS") {
    translateBatchWithIds(request.items, request.sl || "auto", request.tl || "zh-CN", request.engineOverride || null)
      .then(res => sendResponse({ success: true, data: res }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === "TRANSLATE_TEXT") {
    translateText(request.text, request.sl || "auto", request.tl || "zh-CN")
      .then(res => sendResponse({ success: true, data: res }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === "LIST_MODELS") {
    listProviderModels(request.engine, request.settings)
      .then(models => sendResponse({ success: true, models }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === "TEST_API_CONNECTION") {
    // Connection testing should not silently spend generation tokens. For providers
    // with a model-list endpoint, validate credentials/base URL with that lightweight
    // request. Only unknown custom providers fall back to a tiny generation request.
    const supplied = Object.assign({}, request.settings || {});
    const engine = supplied.translationEngine || DEFAULT_SETTINGS.translationEngine;
    const modelListEngines = new Set(["deepseek","openai","claude","gemini","ollama"]);
    if (modelListEngines.has(engine)) {
      listProviderModels(engine, supplied)
        .then(models => sendResponse({ success: true, models: Array.isArray(models) ? models.slice(0, 12) : [], verification: "models" }))
        .catch(err => sendResponse({ success: false, error: err.message }));
    } else {
      translateText("Hi", "en", "zh-CN", supplied)
        .then(res => sendResponse({ success: true, translation: res.text, verification: "generation" }))
        .catch(err => sendResponse({ success: false, error: err.message }));
    }
    return true;
  }

  if (action === "CLEAR_TRANSLATION_CACHE") {
    memoryCache.clear();
    chrome.storage.local.remove("persistentTranslationCache").then(() => {
      sendResponse({ success: true, count: 0 });
    }).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === "GET_CACHE_STATS") {
    sendResponse({ success: true, count: memoryCache.size });
    return true;
  }

  if (action === "GET_IMAGE_OCR_READY_MAP") {
    (async () => {
      try {
        const stored = await chrome.storage.local.get("jijianImageOcrReadyV1");
        sendResponse({ success:true, readyMap:stored?.jijianImageOcrReadyV1 || {} });
      } catch (err) {
        sendResponse({ success:false, error:err.message, readyMap:{} });
      }
    })();
    return true;
  }

  if (action === "SET_IMAGE_OCR_READY_MAP") {
    (async () => {
      try {
        await chrome.storage.local.set({ jijianImageOcrReadyV1:request.readyMap && typeof request.readyMap === "object" ? request.readyMap : {} });
        sendResponse({ success:true });
      } catch (err) {
        sendResponse({ success:false, error:err.message });
      }
    })();
    return true;
  }

  if (action === "GET_SETTINGS") {
    (async () => {
      try {
        const merged = await loadStoredSettings();
        if (!merged.searchEngineBlacklistSeeded) {
          merged.excludeDomainList = Array.from(new Set([...(Array.isArray(merged.excludeDomainList) ? merged.excludeDomainList : DEFAULT_SETTINGS.excludeDomainList), ...SEARCH_ENGINE_BLACKLIST_DOMAINS]));
          merged.excludeDomainRules = { ...(merged.excludeDomainRules || {}), ...Object.fromEntries(SEARCH_ENGINE_BLACKLIST_DOMAINS.map(domain => [domain, { ...SEARCH_ENGINE_BLACKLIST_RULE }])) };
          merged.searchEngineBlacklistSeeded = true;
          await saveSettingsByStorage({ excludeDomainList: merged.excludeDomainList, excludeDomainRules: merged.excludeDomainRules, searchEngineBlacklistSeeded: true });
        }
        sendResponse({ success: true, settings: settingsForSender(merged, sender) });
      } catch (_) {
        sendResponse({ success: true, settings: settingsForSender(DEFAULT_SETTINGS, sender) });
      }
    })();
    return true;
  }

  if (action === "UPDATE_SETTINGS") {
    (async () => {
      try {
        await saveSettingsByStorage(request.settings || {});
        const contentSettings = settingsForContentScript(await loadStoredSettings({ migrate:false }));
        const tabs = await chrome.tabs.query({}).catch(() => []);
        for (const tab of tabs) {
          if (tab.id) {
            chrome.tabs.sendMessage(tab.id, {
              action: "SETTINGS_UPDATED",
              settings: contentSettings
            }).catch(() => {});
          }
        }
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (action === "SET_BADGE") {
    const tabId = sender.tab ? sender.tab.id : undefined;
    if (tabId) {
      try {
        if (request.status === "active") {
          chrome.action.setBadgeText({ tabId, text: "ON" });
          chrome.action.setBadgeBackgroundColor({ tabId, color: "#0071e3" });
        } else if (request.status === "translating") {
          chrome.action.setBadgeText({ tabId, text: "..." });
          chrome.action.setBadgeBackgroundColor({ tabId, color: "#ff9500" });
        } else {
          chrome.action.setBadgeText({ tabId, text: "" });
        }
      } catch (_) {}
    }
    sendResponse({ success: true });
    return true;
  }
});
