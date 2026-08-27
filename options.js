/* Settings page controller. */

document.addEventListener("DOMContentLoaded", async () => {
  const manifestVersion = chrome.runtime.getManifest().version;
  const displayVersion = manifestVersion;
  const sidebarVersionLabel = document.getElementById("sidebar-version-label");
  const aboutVersionLabel = document.getElementById("about-version-label");
  if (sidebarVersionLabel) sidebarVersionLabel.textContent = `v${displayVersion}`;
  if (aboutVersionLabel) aboutVersionLabel.textContent = `版本 ${displayVersion} · Manifest V3`;

  // 1. 侧边栏导航切换
  const navBtns = document.querySelectorAll(".nav-btn");
  const tabViews = document.querySelectorAll(".tab-view");

  navBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      navBtns.forEach(b => b.classList.remove("active"));
      tabViews.forEach(v => v.classList.remove("active"));

      btn.classList.add("active");
      const tabId = btn.getAttribute("data-tab");
      const targetView = document.getElementById(tabId);
      if (targetView) {
        targetView.classList.add("active");
        requestAnimationFrame(() => syncAllSegmentIndicators());
        if (tabId === "tab-vocab") loadVocabularyList();
        if (tabId === "tab-highlights") loadHighlightCollection();
        if (tabId === "tab-backup") updateCacheStats();
      }
    });
  });

  // 支持从 Popup 直接跳到指定设置页。先记录目标，等页面状态与事件完成初始化后再切换，
  // 避免 hash 直达生词本/高亮页时在变量初始化前触发数据加载。
  const requestedTab = new URLSearchParams(location.search).get("tab");
  const initialTab = requestedTab || (location.hash || "").replace(/^#/, "");

  // 2. 表单元素引用
  const apiActiveEngine = document.getElementById("api-active-engine");

  // DeepSeek
  const inputDeepseekKey = document.getElementById("input-deepseek-key");
  const inputDeepseekUrl = document.getElementById("input-deepseek-url");
  const inputDeepseekModel = document.getElementById("input-deepseek-model");

  // DeepL
  const deeplTypeControl = document.getElementById("deepl-type-control");
  const inputDeeplKey = document.getElementById("input-deepl-key");

  // OpenAI
  const inputOpenaiKey = document.getElementById("input-openai-key");
  const inputOpenaiUrl = document.getElementById("input-openai-url");
  const inputOpenaiModel = document.getElementById("input-openai-model");
  const inputOpenaiPrompt = document.getElementById("input-openai-prompt");

  // Claude
  const inputClaudeKey = document.getElementById("input-claude-key");
  const inputClaudeUrl = document.getElementById("input-claude-url");
  const inputClaudeModel = document.getElementById("input-claude-model");

  // Gemini
  const inputGeminiKey = document.getElementById("input-gemini-key");
  const inputGeminiModel = document.getElementById("input-gemini-model");

  // Ollama
  const inputOllamaUrl = document.getElementById("input-ollama-url");
  const inputOllamaModel = document.getElementById("input-ollama-model");

  // Custom
  const inputCustomUrl = document.getElementById("input-custom-url");
  const inputCustomKey = document.getElementById("input-custom-key");
  const inputCustomModel = document.getElementById("input-custom-model");

  // 排版样式
  const optRenderStyle = document.getElementById("opt-render-style");
  const renderStyleCardGrid = document.getElementById("render-style-card-grid");
  const optFontFamily = document.getElementById("opt-font-family");
  const translationFontCardGrid = document.getElementById("translation-font-card-grid");
  const optBgHighlightGrid = document.getElementById("opt-bg-highlight-grid");
  const optTextColor = document.getElementById("opt-text-color");
  const translationColorGrid = document.getElementById("translation-color-grid");
  const translationColorFormItem = document.getElementById("translation-color-form-item");
  const translationFontFormItem = document.getElementById("translation-font-form-item");
  const typographyMetricsForm = document.getElementById("typography-metrics-form");
  const typographyNativeHint = document.getElementById("typography-native-hint");
  const optUnderlineColor = document.getElementById("opt-underline-color");
  const optClickRevealColor = document.getElementById("opt-click-reveal-color");
  const highlightStyleOptions = document.getElementById("highlight-style-options");
  const underlineStyleOptions = document.getElementById("underline-style-options");
  const clickStyleOptions = document.getElementById("click-style-options");
  const optFontSizeRange = document.getElementById("opt-fontsize-range");
  const optFontSizeLabel = document.getElementById("opt-fontsize-label");
  const optSpacingRange = document.getElementById("opt-spacing-range");
  const optSpacingLabel = document.getElementById("opt-spacing-label");
  const optLineHeightRange = document.getElementById("opt-lineheight-range");
  const optLineHeightLabel = document.getElementById("opt-lineheight-label");
  const optUnderlineStylePicker = document.getElementById("opt-underline-style-picker");

  // 预览元素
  const liveTransH = document.getElementById("live-trans-h");
  const liveTransP = document.getElementById("live-trans-p");
  const livePreviewCard = document.querySelector(".preview-card-sticky");
  let livePreviewHoverPair = "";
  const livePreviewClickRevealed = new Set();

  // 语言与交互
  const optTargetLang = document.getElementById("opt-target-lang");
  const optSidebarSync = document.getElementById("opt-sidebar-sync");
  const optSidebarSideControl = document.getElementById("opt-sidebar-side-control");
  const optDictTrigger = document.getElementById("opt-dict-trigger");
  const optDictEnabled = document.getElementById("opt-dict-enabled");
  const dictTriggerModeGrid = document.getElementById("dict-trigger-mode-grid");
  const optDictionaryMode = document.getElementById("opt-dictionary-mode");
  const optEnableDictionaryAi = document.getElementById("opt-enable-dictionary-ai");
  const dictionaryAiPreferences = document.getElementById("dictionary-ai-preferences");
  const optDictionaryAiAnswerStyle = document.getElementById("opt-dictionary-ai-answer-style");
  const optDictionaryAiEmojiLevel = document.getElementById("opt-dictionary-ai-emoji-level");
  const optDictionaryAiLayout = document.getElementById("opt-dictionary-ai-layout");
  const optDictionaryAiDepth = document.getElementById("opt-dictionary-ai-depth");
  const optDictionaryAiStoryMode = document.getElementById("opt-dictionary-ai-story-mode");
  const optDictionaryAiPosition = document.getElementById("opt-dictionary-ai-position");
  const optDictionaryAiConceptRigor = document.getElementById("opt-dictionary-ai-concept-rigor");
  const optDictionaryAiCustomPrompt = document.getElementById("opt-dictionary-ai-custom-prompt");
  const optEnableHover = document.getElementById("opt-enable-hover");
  const optEnableParagraphActions = document.getElementById("opt-enable-paragraph-actions");
  const optModifierKey = document.getElementById("opt-modifier-key");
  const optEnableInputBox = document.getElementById("opt-enable-input-box");
  const optEnableFloatingBall = document.getElementById("opt-enable-floating-ball");
  const optAutoDetectLanguage = document.getElementById("opt-auto-detect-language");
  const optEnableImageTranslation = document.getElementById("opt-enable-image-translation");
  const optImageOcrLanguage = document.getElementById("opt-image-ocr-language");
  const optImageTranslationFont = document.getElementById("opt-image-translation-font");
  const highlightStyleCardGrid = document.getElementById("highlight-style-card-grid");
  const optFloatingShortcut = document.getElementById("opt-floating-shortcut");
  const optReaderShortcut = document.getElementById("opt-reader-shortcut");
  const optAutoTranslate = document.getElementById("opt-auto-translate");
  const optAutoTranslateEngine = document.getElementById("opt-auto-translate-engine");
  const optExcludeDomainInput = document.getElementById("opt-exclude-domain-input");
  const btnAddExcludeDomain = document.getElementById("btn-add-exclude-domain");
  const excludeDomainListEl = document.getElementById("exclude-domain-list");

  // 多语言生词本
  const vocabLangFilter = document.getElementById("vocab-lang-filter");
  const vocabViewSwitch = document.getElementById("vocab-view-switch");
  const inputVocabSearch = document.getElementById("input-vocab-search");
  const btnExportVocabCsv = document.getElementById("btn-export-vocab-csv");
  const btnCopyHighlights = document.getElementById("btn-copy-highlights");
  const btnExportHighlightsMd = document.getElementById("btn-export-highlights-md");
  const btnAddLocalDictFolder = document.getElementById("btn-add-local-dict-folder");
  const btnAddLocalDictFiles = document.getElementById("btn-add-local-dict-files");
  const localDictStatus = document.getElementById("local-dict-status");
  const localDictList = document.getElementById("local-dict-list");
  const localDictTestInput = document.getElementById("local-dict-test-input");
  const btnTestLocalDict = document.getElementById("btn-test-local-dict");
  const btnReauthorizeLocalDict = document.getElementById("btn-reauthorize-local-dict");
  const btnRemoveLocalDictFolder = document.getElementById("btn-remove-local-dict-folder");
  const localDictTestStatus = document.getElementById("local-dict-test-status");
  const vocabListContainer = document.getElementById("vocab-list-container");
  const inputHighlightSearch = document.getElementById("input-highlight-search");
  const highlightManagerList = document.getElementById("highlight-manager-list");
  const highlightCount = document.getElementById("highlight-count");

  // 缓存与备份
  const cacheStatsBadge = document.getElementById("cache-stats-badge");
  const btnClearCache = document.getElementById("btn-clear-cache");
  const btnExportSettings = document.getElementById("btn-export-settings");
  const btnImportTrigger = document.getElementById("btn-import-trigger");
  const inputImportFile = document.getElementById("input-import-file");
  const btnExportFullBackup = document.getElementById("btn-export-full-backup");
  const btnImportFullBackup = document.getElementById("btn-import-full-backup");
  const inputFullBackupFile = document.getElementById("input-full-backup-file");
  const btnOpenDonationUrl = document.getElementById("btn-open-donation-url");
  const btnOpenProjectUrl = document.getElementById("btn-open-project-url");

  let currentSettings = {};
  let cachedVocabList = [];
  let cachedHighlightList = [];
  let currentVocabLangFilter = "all";
  let currentVocabView = "list";
  const modelPickerMenus = new Map();

  function activeTypographyRenderStyle(settings = currentSettings) {
    if (settings.displayMode === "replace") return settings.replaceRenderStyle === "native" ? "native" : "classic";
    return settings.renderStyle || "classic";
  }

  function syncRenderStyleCardLabels(replace) {
    const nativeLabel = renderStyleCardGrid?.querySelector('[data-value="native"] .style-choice-name');
    const cleanLabel = renderStyleCardGrid?.querySelector('[data-value="classic"] .style-choice-name');
    if (nativeLabel) nativeLabel.textContent = replace ? "参考原文" : "参考原网页";
    if (cleanLabel) cleanLabel.textContent = replace ? "纯净排版" : "纯净对照";
    const nativeOption = optRenderStyle?.querySelector('option[value="native"]');
    const cleanOption = optRenderStyle?.querySelector('option[value="classic"]');
    if (nativeOption) nativeOption.textContent = replace ? "参考原文" : "参考原网页";
    if (cleanOption) cleanOption.textContent = replace ? "纯净排版" : "纯净对照";
  }

  function syncStyleDependentOptions(value) {
    if (highlightStyleOptions) highlightStyleOptions.hidden = value !== "highlight";
    if (underlineStyleOptions) underlineStyleOptions.hidden = value !== "underline";
    if (clickStyleOptions) clickStyleOptions.hidden = value !== "click-reveal";
    const box = document.getElementById("style-dependent-options");
    if (box) {
      const active = ["highlight","underline","click-reveal"].includes(value);
      box.classList.toggle("is-empty", !active);
    }
  }

  // 3. 加载已有配置
  const res = await sendRuntimeMessage({ action: "GET_SETTINGS" });
  if (res && res.settings) {
    currentSettings = res.settings;
    initUIFromSettings(currentSettings);
    updateLivePreview(currentSettings);
  }
  enhanceSelects();
  enhanceModelPickers();
  syncAllSegmentIndicators();
  loadLocalDictionaryMeta();
  if (initialTab) {
    const targetBtn = Array.from(navBtns).find(btn => btn.getAttribute("data-tab") === initialTab);
    if (targetBtn) targetBtn.click();
  }

  function invalidateEngine(engine) {
    const verifiedEngines = Object.assign({}, currentSettings.verifiedEngines || {});
    if (verifiedEngines[engine]) {
      verifiedEngines[engine] = false;
      currentSettings.verifiedEngines = verifiedEngines;
      saveSetting({ verifiedEngines });
    }
    setEngineCardConnectedState(engine, false);
  }

  function engineModelValue(engine) {
    if (engine === "deepseek") return inputDeepseekModel?.value || "";
    if (engine === "openai") return inputOpenaiModel?.value || "";
    if (engine === "claude") return inputClaudeModel?.value || "";
    if (engine === "gemini") return inputGeminiModel?.value || "";
    if (engine === "ollama") return inputOllamaModel?.value || "";
    if (engine === "custom") return inputCustomModel?.value || "";
    return "API";
  }

  function setEngineCardConnectedState(engine, connected) {
    const card = document.getElementById(`card-engine-${engine}`);
    if (!card) return;
    card.classList.toggle("is-connected", !!connected);
    let summary = card.querySelector(".engine-connected-summary");
    if (!summary) {
      summary = document.createElement("div");
      summary.className = "engine-connected-summary";
      summary.innerHTML = `<span class="engine-connected-copy"></span><button type="button" class="engine-edit-btn">编辑配置</button>`;
      card.appendChild(summary);
      summary.querySelector(".engine-edit-btn")?.addEventListener("click", () => setEngineCardConnectedState(engine, false));
    }
    const copy = summary.querySelector(".engine-connected-copy");
    if (copy) copy.textContent = connected ? `已连接 · ${engineModelValue(engine) || engine}` : "";
  }

  // 4. 事件监听与自动保存
  apiActiveEngine.addEventListener("change", (e) => saveSetting({ translationEngine: e.target.value }));

  // DeepSeek
  if (inputDeepseekKey) inputDeepseekKey.addEventListener("input", (e) => { invalidateEngine("deepseek"); saveSetting({ deepseekApiKey: e.target.value.trim() }); });
  if (inputDeepseekUrl) inputDeepseekUrl.addEventListener("input", (e) => { invalidateEngine("deepseek"); saveSetting({ deepseekBaseUrl: e.target.value.trim() }); });
  if (inputDeepseekModel) inputDeepseekModel.addEventListener("input", (e) => { invalidateEngine("deepseek"); saveSetting({ deepseekModel: e.target.value.trim() }); });

  // DeepL
  bindSegmentedControl(deeplTypeControl, (val) => saveSetting({ deeplApiType: val }));
  inputDeeplKey.addEventListener("input", (e) => { invalidateEngine("deepl"); saveSetting({ deeplAuthKey: e.target.value.trim() }); });

  // OpenAI
  inputOpenaiKey.addEventListener("input", (e) => { invalidateEngine("openai"); saveSetting({ openaiApiKey: e.target.value.trim() }); });
  inputOpenaiUrl.addEventListener("input", (e) => { invalidateEngine("openai"); saveSetting({ openaiBaseUrl: e.target.value.trim() }); });
  inputOpenaiModel.addEventListener("input", (e) => { invalidateEngine("openai"); saveSetting({ openaiModel: e.target.value.trim() }); });
  inputOpenaiPrompt.addEventListener("input", (e) => saveSetting({ openaiCustomPrompt: e.target.value.trim() }));

  // Claude
  inputClaudeKey.addEventListener("input", (e) => { invalidateEngine("claude"); saveSetting({ claudeApiKey: e.target.value.trim() }); });
  inputClaudeUrl.addEventListener("input", (e) => { invalidateEngine("claude"); saveSetting({ claudeBaseUrl: e.target.value.trim() }); });
  inputClaudeModel.addEventListener("input", (e) => { invalidateEngine("claude"); saveSetting({ claudeModel: e.target.value.trim() }); });

  // Gemini
  inputGeminiKey.addEventListener("input", (e) => { invalidateEngine("gemini"); saveSetting({ geminiApiKey: e.target.value.trim() }); });
  inputGeminiModel.addEventListener("input", (e) => { invalidateEngine("gemini"); saveSetting({ geminiModel: e.target.value.trim() }); });

  // Ollama
  inputOllamaUrl.addEventListener("input", (e) => { invalidateEngine("ollama"); saveSetting({ ollamaBaseUrl: e.target.value.trim() }); });
  inputOllamaModel.addEventListener("input", (e) => { invalidateEngine("ollama"); saveSetting({ ollamaModel: e.target.value.trim() }); });

  // Custom
  inputCustomUrl.addEventListener("input", (e) => { invalidateEngine("custom"); saveSetting({ customBaseUrl: e.target.value.trim() }); });
  inputCustomKey.addEventListener("input", (e) => { invalidateEngine("custom"); saveSetting({ customApiKey: e.target.value.trim() }); });
  inputCustomModel.addEventListener("input", (e) => { invalidateEngine("custom"); saveSetting({ customModel: e.target.value.trim() }); });

  // 排版样式：整张卡片即选择器，高亮配色只属于高亮卡片。
  const setRenderStyleCard = (value, persist = true) => {
    if (!value) return;
    const replace = currentSettings.displayMode === "replace";
    const activeValue = replace ? (value === "native" ? "native" : "classic") : value;
    optRenderStyle.value = activeValue;
    if (replace) currentSettings.replaceRenderStyle = activeValue === "native" ? "native" : "clean";
    else currentSettings.renderStyle = activeValue;
    currentSettings.fontStyle = replace ? "normal" : (activeValue === "italic" ? "italic" : "normal");
    renderStyleCardGrid?.querySelectorAll(".style-choice-card").forEach(card => card.classList.toggle("active", card.dataset.value === activeValue));
    syncStyleDependentOptions(activeValue);
    syncTypographyModeAvailability();
    if (persist) {
      if (replace) saveSetting({ replaceRenderStyle: currentSettings.replaceRenderStyle, fontStyle:"normal" });
      else saveSetting({ renderStyle: activeValue, fontStyle:currentSettings.fontStyle });
    }
    updateLivePreview(currentSettings);
  };
  renderStyleCardGrid?.querySelectorAll(".style-choice-card").forEach(card => card.addEventListener("click", (e) => {
    if (e.target.closest(".style-inline-palette")) return;
    setRenderStyleCard(card.dataset.value, true);
  }));

  optBgHighlightGrid?.querySelectorAll(".mini-swatch").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      optBgHighlightGrid.querySelectorAll(".mini-swatch").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const val = btn.getAttribute("data-value");
      currentSettings.bgHighlight = val;
      saveSetting({ bgHighlight: val });
      setRenderStyleCard("highlight", true);
    });
  });

  optUnderlineStylePicker?.querySelectorAll("i[data-value]").forEach((dot) => {
    dot.addEventListener("click", (e) => {
      e.stopPropagation();
      const value = dot.dataset.value || "solid";
      currentSettings.underlineStyle = value;
      optUnderlineStylePicker.querySelectorAll("i").forEach(x => x.classList.toggle("active", x === dot));
      saveSetting({ underlineStyle: value });
      setRenderStyleCard("underline", true);
    });
  });

  const setTranslationFontCard = (value, persist = true) => {
    if (!value || activeTypographyRenderStyle() === "native") return;
    optFontFamily.value = value;
    currentSettings.fontFamily = value;
    translationFontCardGrid?.querySelectorAll(".font-choice-card").forEach(card => card.classList.toggle("active", card.dataset.value === value));
    if (persist) saveSetting({ fontFamily: value });
    updateLivePreview(currentSettings);
  };
  translationFontCardGrid?.querySelectorAll(".font-choice-card").forEach(card => card.addEventListener("click", () => setTranslationFontCard(card.dataset.value, true)));


  function syncTranslationColorGrid(value) {
    translationColorGrid?.querySelectorAll(".translation-color-choice").forEach(btn => {
      const active = btn.dataset.value === value;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-checked", active ? "true" : "false");
    });
  }
  translationColorGrid?.querySelectorAll(".translation-color-choice").forEach(btn => btn.addEventListener("click", () => {
    if (activeTypographyRenderStyle() === "native") return;
    const value = btn.dataset.value || "black";
    currentSettings.textColor = value;
    if (optTextColor) optTextColor.value = value;
    syncTranslationColorGrid(value);
    saveSetting({ textColor:value });
    updateLivePreview(currentSettings);
  }));
  optTextColor?.addEventListener("change", (e) => {
    currentSettings.textColor = e.target.value;
    syncTranslationColorGrid(e.target.value);
    saveSetting({ textColor: e.target.value });
    updateLivePreview(currentSettings);
  });

  optUnderlineColor?.addEventListener("change", (e) => {
    currentSettings.underlineColor = e.target.value;
    saveSetting({ underlineColor: e.target.value });
    updateLivePreview(currentSettings);
  });

  optClickRevealColor?.addEventListener("change", (e) => {
    currentSettings.clickRevealColor = e.target.value;
    livePreviewClickRevealed.clear();
    saveSetting({ clickRevealColor: e.target.value });
    updateLivePreview(currentSettings);
  });

  optFontSizeRange.addEventListener("input", (e) => {
    optFontSizeLabel.textContent = `${e.target.value}%`;
    currentSettings.fontSizeRatio = e.target.value;
    saveSetting({ fontSizeRatio: e.target.value });
    updateLivePreview(currentSettings);
  });

  optSpacingRange.addEventListener("input", (e) => {
    optSpacingLabel.textContent = `${e.target.value}px`;
    currentSettings.paragraphSpacing = e.target.value;
    saveSetting({ paragraphSpacing: e.target.value });
    updateLivePreview(currentSettings);
  });

  optLineHeightRange?.addEventListener("input", (e) => {
    const value = Number(e.target.value).toFixed(2);
    if (optLineHeightLabel) optLineHeightLabel.textContent = value;
    currentSettings.translationLineHeight = value;
    saveSetting({ translationLineHeight: value });
    updateLivePreview(currentSettings);
  });

  optTargetLang.addEventListener("change", (e) => saveSetting({ targetLang: e.target.value }));
  bindSegmentedControl(optSidebarSideControl, (val) => { currentSettings.sidebarSide = val; saveSetting({ sidebarSide: val }); });
  if (optSidebarSync) {
    optSidebarSync.addEventListener("change", (e) => saveSetting({ sidebarSyncScroll: e.target.checked }));
  }
  highlightStyleCardGrid?.querySelectorAll("button[data-value]").forEach(btn => btn.addEventListener("click", () => {
    const val = btn.dataset.value || "soft-marker";
    currentSettings.highlightStyle = val;
    highlightStyleCardGrid.querySelectorAll("button").forEach(b => b.classList.toggle("active", b===btn));
    saveSetting({highlightStyle:val});
  }));
  const refreshDictTriggerUi = (mode) => {
    const enabled = mode !== "none";
    if (optDictEnabled) optDictEnabled.checked = enabled;
    dictTriggerModeGrid?.querySelectorAll("button[data-value]").forEach(btn => {
      btn.disabled = !enabled;
      btn.classList.toggle("active", enabled && btn.dataset.value === mode);
    });
  };
  optDictEnabled?.addEventListener("change", () => {
    const mode = optDictEnabled.checked ? (currentSettings.dictTriggerLastMode || "both") : "none";
    if (mode !== "none") currentSettings.dictTriggerLastMode = mode;
    currentSettings.dictTriggerMode = mode;
    optDictTrigger.value = mode;
    saveSetting({ dictTriggerMode: mode, dictTriggerLastMode: currentSettings.dictTriggerLastMode || "both" });
    refreshDictTriggerUi(mode);
  });
  dictTriggerModeGrid?.querySelectorAll("button[data-value]").forEach(btn => btn.addEventListener("click", () => {
    if (!optDictEnabled?.checked) return;
    const mode = btn.dataset.value;
    currentSettings.dictTriggerMode = mode;
    currentSettings.dictTriggerLastMode = mode;
    optDictTrigger.value = mode;
    saveSetting({ dictTriggerMode: mode, dictTriggerLastMode: mode });
    refreshDictTriggerUi(mode);
  }));
  function syncDictionaryAiPreferencesUi() {
    const enabled = optEnableDictionaryAi?.checked !== false;
    const aiSelected = optDictionaryMode?.value === "ai";
    if (dictionaryAiPreferences) dictionaryAiPreferences.hidden = !(enabled && aiSelected);
    if (optDictionaryMode) {
      optDictionaryMode.disabled = !enabled;
      const trigger = optDictionaryMode.closest(".jijian-select")?.querySelector(".jijian-select-trigger");
      if (trigger) trigger.disabled = !enabled;
    }
  }
  if (optEnableDictionaryAi) optEnableDictionaryAi.addEventListener("change", (e) => {
    const enabled = e.target.checked;
    const patch = { enableDictionaryAi: enabled };
    if (!enabled && optDictionaryMode?.value === "ai") {
      optDictionaryMode.value = "standard";
      currentSettings.dictionaryLookupMode = "standard";
      patch.dictionaryLookupMode = "standard";
      optDictionaryMode.dispatchEvent(new Event("change", { bubbles:true }));
    }
    saveSetting(patch);
    syncDictionaryAiPreferencesUi();
  });
  if (optDictionaryMode) optDictionaryMode.addEventListener("change", (e) => {
    saveSetting({ dictionaryLookupMode: e.target.value });
    syncDictionaryAiPreferencesUi();
  });
  [
    [optDictionaryAiAnswerStyle, "dictionaryAiAnswerStyle"],
    [optDictionaryAiEmojiLevel, "dictionaryAiEmojiLevel"],
    [optDictionaryAiLayout, "dictionaryAiLayout"],
    [optDictionaryAiDepth, "dictionaryAiExplanationDepth"],
    [optDictionaryAiStoryMode, "dictionaryAiStoryMode"],
    [optDictionaryAiPosition, "dictionaryAiPosition"]
  ].forEach(([control, key]) => control?.addEventListener("change", (e) => saveSetting({ [key]: e.target.value })));
  optDictionaryAiConceptRigor?.addEventListener("change", (e) => saveSetting({ dictionaryAiConceptRigor:e.target.checked }));
  optDictionaryAiCustomPrompt?.addEventListener("input", (e) => saveSetting({ dictionaryAiCustomPrompt:e.target.value.trim() }));
  if (optEnableHover) optEnableHover.addEventListener("change", (e) => saveSetting({ enableParagraphHoverTranslate: e.target.checked }));
  if (optEnableParagraphActions) optEnableParagraphActions.addEventListener("change", (e) => saveSetting({ enableParagraphActions: e.target.checked }));
  optModifierKey.addEventListener("change", (e) => saveSetting({ selectionModifierKey: e.target.value }));
  optEnableInputBox.addEventListener("change", (e) => saveSetting({ enableInputBoxTranslate: e.target.checked }));
  optEnableFloatingBall.addEventListener("change", (e) => saveSetting({ enableFloatingBall: e.target.checked }));
  if (optAutoDetectLanguage) optAutoDetectLanguage.addEventListener("change", (e) => saveSetting({ autoDetectPageLanguage: e.target.checked }));
  // Function declaration is intentionally hoisted. initUIFromSettings() runs
  // immediately after GET_SETTINGS and must be able to call this before the
  // event-binding section below is reached.
  function syncImageOcrUi() {
    const enabled = optEnableImageTranslation?.checked !== false;
    if (optImageOcrLanguage) optImageOcrLanguage.disabled = !enabled;
    if (optImageTranslationFont) optImageTranslationFont.disabled = !enabled;
    optImageOcrLanguage?.closest(".image-ocr-language-row")?.classList.toggle("is-disabled", !enabled);
    optImageTranslationFont?.closest(".image-translation-font-row")?.classList.toggle("is-disabled", !enabled);
  }
  if (optEnableImageTranslation) optEnableImageTranslation.addEventListener("change", (e) => { saveSetting({ enableImageTranslation: e.target.checked }); syncImageOcrUi(); });
  if (optImageOcrLanguage) optImageOcrLanguage.addEventListener("change", (e) => saveSetting({ imageOcrLanguage: e.target.value || "auto" }));
  if (optImageTranslationFont) optImageTranslationFont.addEventListener("change", (e) => saveSetting({ imageTranslationFont: e.target.value || "system" }));
  const normalizeShortcut = (value, fallback) => String(value || fallback).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4) || fallback;
  optFloatingShortcut?.addEventListener("change", (e) => { const v = normalizeShortcut(e.target.value, "zz"); e.target.value = v.toUpperCase(); saveSetting({ floatingShortcut: v }); });
  optReaderShortcut?.addEventListener("change", (e) => { const v = normalizeShortcut(e.target.value, "aa"); e.target.value = v.toUpperCase(); saveSetting({ readerShortcut: v }); });
  optAutoTranslate?.addEventListener("change", (e) => saveSetting({ autoTranslateEnabled: e.target.checked }));
  optAutoTranslateEngine?.addEventListener("change", (e) => saveSetting({ autoTranslateEngine: e.target.value }));
  const openConfiguredUrl = (value) => {
    const url = String(value || "").trim();
    if (!/^https?:\/\//i.test(url)) return;
    chrome.tabs.create({ url });
  };
  btnOpenDonationUrl?.addEventListener("click", () => openConfiguredUrl(currentSettings.donationUrl));
  btnOpenProjectUrl?.addEventListener("click", () => openConfiguredUrl(currentSettings.projectUrl));

  function normalizeDomainEntry(value) {
    return String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
  }

  function defaultExcludeDomainRule() {
    return { floating:true, hover:true, selection:true, image:true, auto:true, ...(currentSettings.excludeDomainDefaultRule || {}) };
  }
  function getExcludeDomainRule(domain) {
    const rules = currentSettings.excludeDomainRules || {};
    return {...defaultExcludeDomainRule(), ...(rules[domain] || {})};
  }
  async function saveExcludeDomainRules() {
    await saveSetting({excludeDomainRules: currentSettings.excludeDomainRules || {}});
  }
  function renderDefaultExcludeRules() {
    const rule = defaultExcludeDomainRule();
    document.querySelectorAll("#domain-default-rules input[data-default-scope]").forEach(input => {
      const checked = rule[input.dataset.defaultScope] === true;
      input.checked = checked;
      input.closest("label")?.classList.toggle("active", checked);
    });
  }

  function renderExcludeDomainList() {
    if (!excludeDomainListEl) return;
    renderDefaultExcludeRules();
    const list = Array.isArray(currentSettings.excludeDomainList) ? currentSettings.excludeDomainList : [];
    if (!list.length) {
      excludeDomainListEl.innerHTML = `<div class="domain-list-empty">当前没有屏蔽域名</div>`;
      return;
    }
    const labels = {floating:"悬浮入口",hover:"段落翻译",selection:"划词查词",image:"图片翻译",auto:"自动翻译"};
    excludeDomainListEl.innerHTML = list.map(domain => {
      const rule = getExcludeDomainRule(domain);
      const disabledCount = Object.keys(labels).filter(scope => rule[scope]).length;
      const custom = Object.prototype.hasOwnProperty.call(currentSettings.excludeDomainRules || {}, domain);
      const chips = Object.entries(labels).map(([scope,label]) => `
        <label class="domain-scope-chip${rule[scope] ? " active" : ""}">
          <input type="checkbox" data-domain="${escapeHtml(domain)}" data-scope="${scope}" ${rule[scope] ? "checked" : ""}>
          <span>${label}</span>
        </label>`).join("");
      return `<div class="domain-row" data-domain-row="${escapeHtml(domain)}">
        <div class="domain-row-line">
          <div class="domain-row-copy"><strong>${escapeHtml(domain)}</strong><span>${custom ? `自定义 · 停用 ${disabledCount} 项` : `使用默认 · 停用 ${disabledCount} 项`}</span></div>
          <div class="domain-row-actions">
            <button type="button" class="domain-config-btn" data-domain="${escapeHtml(domain)}" aria-expanded="false">功能设置</button>
            <button type="button" class="domain-remove-btn" data-domain="${escapeHtml(domain)}" aria-label="从黑名单移除 ${escapeHtml(domain)}">移除</button>
          </div>
        </div>
        <div class="domain-scope-panel" hidden>${chips}<button type="button" class="domain-reset-rule" data-domain="${escapeHtml(domain)}">恢复默认</button></div>
      </div>`;
    }).join("");
    excludeDomainListEl.querySelectorAll(".domain-config-btn").forEach(btn => btn.addEventListener("click", () => {
      const row = btn.closest(".domain-row"); const panel = row?.querySelector(".domain-scope-panel");
      if (!panel) return;
      const opening=panel.hidden;
      excludeDomainListEl.querySelectorAll(".domain-scope-panel").forEach(other=>{other.hidden=true;other.classList.remove("is-open");other.closest(".domain-row")?.classList.remove("is-config-open");});
      excludeDomainListEl.querySelectorAll(".domain-config-btn").forEach(other=>{other.classList.remove("active");other.setAttribute("aria-expanded","false");});
      panel.hidden=!opening;
      panel.classList.toggle("is-open",opening);
      row?.classList.toggle("is-config-open",opening);
      btn.classList.toggle("active",opening);
      btn.setAttribute("aria-expanded", opening ? "true" : "false");
    }));
    excludeDomainListEl.querySelectorAll(".domain-remove-btn").forEach(btn => btn.addEventListener("click", async () => {
      const domain = btn.dataset.domain;
      if (!confirm(`确定将「${domain}」从网站黑名单移除吗？`)) return;
      currentSettings.excludeDomainList = (currentSettings.excludeDomainList || []).filter(x => x !== domain);
      const rules = {...(currentSettings.excludeDomainRules || {})}; delete rules[domain]; currentSettings.excludeDomainRules = rules;
      await saveSetting({ excludeDomainList: currentSettings.excludeDomainList, excludeDomainRules:rules });
      renderExcludeDomainList();
    }));
    excludeDomainListEl.querySelectorAll('.domain-scope-chip input[data-scope]').forEach(input => input.addEventListener('change', async () => {
      const domain=input.dataset.domain, scope=input.dataset.scope;
      const rules={...(currentSettings.excludeDomainRules||{})};
      rules[domain]={...getExcludeDomainRule(domain), [scope]:!!input.checked};
      currentSettings.excludeDomainRules=rules;
      await saveExcludeDomainRules(); renderExcludeDomainList();
      const row = excludeDomainListEl.querySelector(`[data-domain-row="${CSS.escape(domain)}"]`);
      const panel=row?.querySelector('.domain-scope-panel');
      const configBtn=row?.querySelector('.domain-config-btn');
      panel?.removeAttribute('hidden');
      panel?.classList.add('is-open');
      row?.classList.add('is-config-open');
      configBtn?.classList.add('active');
      configBtn?.setAttribute('aria-expanded','true');
    }));
    excludeDomainListEl.querySelectorAll('.domain-reset-rule').forEach(btn => btn.addEventListener('click', async () => {
      const rules={...(currentSettings.excludeDomainRules||{})}; delete rules[btn.dataset.domain]; currentSettings.excludeDomainRules=rules;
      await saveExcludeDomainRules(); renderExcludeDomainList();
    }));
  }

  document.querySelectorAll("#domain-default-rules input[data-default-scope]").forEach(input => input.addEventListener("change", async () => {
    const next = {...defaultExcludeDomainRule(), [input.dataset.defaultScope]: !!input.checked};
    currentSettings.excludeDomainDefaultRule = next;
    await saveSetting({ excludeDomainDefaultRule: next });
    renderExcludeDomainList();
  }));

  async function addExcludeDomain() {
    const domain = normalizeDomainEntry(optExcludeDomainInput?.value);
    if (!domain) return;
    const list = Array.from(new Set([...(currentSettings.excludeDomainList || []), domain]));
    currentSettings.excludeDomainList = list;
    // 新域名不复制默认值：保持继承，这样以后修改默认规则也会同步生效。
    await saveSetting({ excludeDomainList: list });
    if (optExcludeDomainInput) optExcludeDomainInput.value = "";
    renderExcludeDomainList();
  }

  btnAddExcludeDomain?.addEventListener("click", addExcludeDomain);
  optExcludeDomainInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addExcludeDomain(); } });

  // 在线读取当前服务可用模型；失败时保留内置建议和用户自定义输入能力。
  document.querySelectorAll(".model-refresh-btn[data-engine]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const engine = btn.getAttribute("data-engine");
      const listEl = document.getElementById(`models-${engine}`);
      const oldTitle = btn.title;
      btn.disabled = true;
      btn.classList.add("is-loading");
      btn.title = "正在读取模型";
      try {
        const res = await sendRuntimeMessage({ action: "LIST_MODELS", engine, settings: currentSettings });
        if (!res?.success) throw new Error(res?.error || "无法读取模型列表");
        const models = Array.from(new Set((res.models || []).filter(Boolean))).slice(0, 120);
        if (listEl && models.length) listEl.innerHTML = models.map(m => `<option value="${escapeHtml(m)}"></option>`).join("");
        refreshModelPickerMenu(engine);
        btn.title = models.length ? `已读取 ${models.length} 个模型` : "服务商未返回模型列表";
      } catch (err) {
        btn.title = "读取模型失败，可继续手动输入";
      } finally {
        btn.classList.remove("is-loading");
        btn.disabled = false;
        setTimeout(() => { btn.title = oldTitle || "从服务商读取模型"; }, 1800);
      }
    });
  });

  // 5. API 连通性测试
  document.querySelectorAll(".test-btn[data-engine]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const engine = btn.getAttribute("data-engine");
      const resultEl = document.getElementById(`test-result-${engine}`);
      if (!resultEl) return;

      resultEl.className = "test-result loading";
      resultEl.textContent = "正在测试连接...";

      const tempSettings = Object.assign({}, currentSettings, { translationEngine: engine });
      const testRes = await sendRuntimeMessage({ action: "TEST_API_CONNECTION", settings: tempSettings }, 20000);

      if (testRes && testRes.success) {
        resultEl.className = "test-result success";
        resultEl.textContent = "✓ 连接成功";
        const verifiedEngines = Object.assign({}, currentSettings.verifiedEngines || {});
        verifiedEngines[engine] = true;
        currentSettings.verifiedEngines = verifiedEngines;
        await saveSetting({ verifiedEngines });
        setEngineCardConnectedState(engine, true);
      } else {
        resultEl.className = "test-result error";
        resultEl.textContent = `✕ 失败: ${testRes ? testRes.error : "未知错误"}`;
      }
    });
  });

  // 6. 英日生词本功能
  async function loadVocabularyList() {
    const vRes = await sendRuntimeMessage({ action: "GET_VOCABULARY" });
    cachedVocabList = (vRes && Array.isArray(vRes.list)) ? vRes.list : [];
    filterAndRenderVocabulary();
  }

  const supportedVocabLangs = new Set(["zh","en","ja","ko","fr","de","es","ru"]);
  const normalizeVocabLang = (lang) => {
    const l = String(lang || "und").toLowerCase();
    if (l.startsWith("zh")) return "zh";
    const base = l.split("-")[0];
    return supportedVocabLangs.has(base) ? base : "other";
  };
  const vocabLangName = (lang) => ({zh:"中文",en:"英语",ja:"日语",ko:"韩语",fr:"法语",de:"德语",es:"西班牙语",ru:"俄语",other:"其他"}[normalizeVocabLang(lang)] || "其他");
  vocabLangFilter?.addEventListener("change", () => { currentVocabLangFilter = vocabLangFilter.value || "all"; filterAndRenderVocabulary(); });
  vocabViewSwitch?.querySelectorAll("button[data-view]").forEach(btn => btn.addEventListener("click", () => {
    currentVocabView = btn.dataset.view || "list";
    vocabViewSwitch.querySelectorAll("button").forEach(x => x.classList.toggle("active", x === btn));
    syncSegmentIndicator(vocabViewSwitch, true);
    if (vocabListContainer) vocabListContainer.dataset.view = currentVocabView;
    saveSetting({ vocabularyViewMode: currentVocabView });
    filterAndRenderVocabulary();
  }));

  function filterAndRenderVocabulary() {
    const query = String(inputVocabSearch?.value || "").toLowerCase().trim();
    let list = cachedVocabList;

    if (currentVocabLangFilter !== "all") {
      list = list.filter(item => normalizeVocabLang(item.lang) === currentVocabLangFilter);
    }

    if (query) {
      list = list.filter(item => {
        const standard = Array.isArray(item.definitions) ? item.definitions.flatMap(d => Array.isArray(d.terms) ? d.terms : (Array.isArray(d.senses) ? d.senses.map(x => x.zh || x.en) : [])) : [];
        const local = Array.isArray(item.localDictionarySummary) ? item.localDictionarySummary.flatMap(x => [x?.name, x?.text]) : [];
        const haystack = [item.word, item.phonetic, item.translation, item.sourceName, ...standard, ...local]
          .filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(query);
      });
    }

    renderVocabularyList(list);
  }

  function formatVocabDate(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return `${parsed.getMonth()+1}月${parsed.getDate()}日`;
    return raw;
  }

  function vocabDetailPreview(item, limit = 2) {
    const local = Array.isArray(item.localDictionarySummary)
      ? item.localDictionarySummary.map(x => x?.text).filter(Boolean)
      : [];
    const standard = Array.isArray(item.definitions)
      ? item.definitions.flatMap(d => Array.isArray(d.terms)
          ? d.terms
          : (Array.isArray(d.senses) ? d.senses.map(x => x.zh || x.en) : []))
        .filter(Boolean)
      : [];
    return standard.slice(0, limit);
  }

  function renderVocabularyList(list) {
    if (!list || list.length === 0) {
      vocabListContainer.innerHTML = `<div class="vocab-empty vocab-empty-state">当前筛选下暂无生词。网页查词时点击星标即可加入这里。</div>`;
      return;
    }
    const view = currentVocabView === "gallery" ? "gallery" : "list";
    currentVocabView = view;
    vocabListContainer.dataset.view = view;
    vocabListContainer.innerHTML = list.map(item => {
      const langName = vocabLangName(item.lang);
      const phonetic = String(item.phonetic || "").trim();
      const meaning = String(item.translation || "暂无简明释义").trim();
      const date = formatVocabDate(item.date);
      const source = String(item.sourceName || "").trim();
      const preview = view === "gallery" ? vocabDetailPreview(item, 2) : [];
      const index = cachedVocabList.indexOf(item);

      if (view === "gallery") {
        return `<article class="vocab-card-item vocab-gallery-card" data-view="gallery" data-vocab-index="${index}" title="点击查看完整释义">
          <div class="vocab-gallery-top">
            <div class="vocab-gallery-word-wrap"><span class="vocab-word-text">${escapeHtml(item.word)}</span></div>
            <span class="vocab-card-lang">${escapeHtml(langName)}</span>
          </div>
          <div class="vocab-gallery-meaning">${escapeHtml(meaning)}</div>
          ${preview.length ? `<div class="vocab-gallery-preview"><span>词典摘录</span><p>${escapeHtml(preview.join("；"))}</p></div>` : ""}
          <div class="vocab-gallery-footer">${date ? `<span>收藏于 ${escapeHtml(date)}</span>` : `<span>${source ? `来源 ${escapeHtml(source)}` : "已收藏"}</span>`}${source && date ? `<span>来源 ${escapeHtml(source)}</span>` : ""}</div>
          <button class="vocab-inline-delete btn-del-vocab" data-word="${escapeHtml(item.word)}" data-lang="${escapeHtml(item.lang || "und")}" title="删除生词" aria-label="删除生词"><svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V5h6v2M9 11v6M15 11v6M7 7l1 13h8l1-13"/></svg></button>
        </article>`;
      }

      return `<article class="vocab-card-item vocab-list-row" data-view="list" data-vocab-index="${index}" title="点击查看完整释义">
        <div class="vocab-list-lexical">
          <div class="vocab-list-wordline"><span class="vocab-word-text">${escapeHtml(item.word)}</span><span class="vocab-card-lang">${escapeHtml(langName)}</span></div>
          ${phonetic ? `<span class="vocab-phonetic-text">${escapeHtml(phonetic)}</span>` : `<span class="vocab-phonetic-text vocab-phonetic-empty">未记录音标</span>`}
        </div>
        <div class="vocab-list-definition"><span class="vocab-list-definition-label">简明释义</span><p>${escapeHtml(meaning)}</p></div>
        <div class="vocab-list-meta">${date ? `<span>收藏于 ${escapeHtml(date)}</span>` : ""}${source ? `<span>来源 ${escapeHtml(source)}</span>` : ""}</div>
        <button class="vocab-inline-delete btn-del-vocab" data-word="${escapeHtml(item.word)}" data-lang="${escapeHtml(item.lang || "und")}" title="删除生词" aria-label="删除生词"><svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V5h6v2M9 11v6M15 11v6M7 7l1 13h8l1-13"/></svg></button>
      </article>`;
    }).join("");

    vocabListContainer.querySelectorAll(".btn-del-vocab").forEach(b => {
      b.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm(`确定从生词本删除「${b.dataset.word}」吗？`)) return;
        await sendRuntimeMessage({ action: "REMOVE_VOCABULARY", word: b.dataset.word, lang: b.dataset.lang });
        loadVocabularyList();
      });
    });
    vocabListContainer.querySelectorAll(".vocab-card-item[data-vocab-index]").forEach(card => card.addEventListener("click", () => {
      const item = cachedVocabList[Number(card.dataset.vocabIndex)];
      if (item) openVocabularyDetailModal(item);
    }));
  }

  function openVocabularyDetailModal(item) {
    document.querySelector(".vocab-detail-modal-backdrop")?.remove();
    const standardDetails = Array.isArray(item.definitions) ? item.definitions.flatMap(d => Array.isArray(d.terms) ? d.terms : (Array.isArray(d.senses) ? d.senses.map(x => x.zh || x.en) : [])).filter(Boolean) : [];
    const localDetails = Array.isArray(item.localDictionarySummary) ? item.localDictionarySummary.filter(x=>x?.text) : [];
    const wrap=document.createElement("div"); wrap.className="vocab-detail-modal-backdrop";
    wrap.innerHTML=`<div class="vocab-detail-modal" role="dialog" aria-modal="true">
      <div class="vocab-detail-modal-head">
        <div><div class="vocab-detail-modal-word">${escapeHtml(item.word||"")}</div>${item.phonetic?`<div class="vocab-detail-modal-phonetic">${escapeHtml(item.phonetic)}</div>`:""}</div>
        <button type="button" class="vocab-detail-modal-close" aria-label="关闭">×</button>
      </div>
      <div class="vocab-detail-modal-translation">${escapeHtml(item.translation||"暂无简明释义")}</div>
      ${standardDetails.length?`<div class="vocab-detail-modal-section"><b>词典释义</b>${standardDetails.slice(0,10).map((x,i)=>`<div class="vocab-detail-sense"><span>${i+1}</span><p>${escapeHtml(x)}</p></div>`).join("")}</div>`:""}
      ${localDetails.length?`<div class="vocab-detail-modal-section"><b>本地词典</b>${localDetails.slice(0,4).map(x=>`<div class="vocab-detail-local"><strong>${escapeHtml(x.name||"本地词典")}</strong><p>${escapeHtml(x.text||"")}</p></div>`).join("")}</div>`:""}
    </div>`;
    document.body.appendChild(wrap);
    const localSection = wrap.querySelector(".vocab-detail-modal-section:last-of-type");
    if (localSection && localDetails.length) {
      const rich = document.createElement("div"); rich.className = "vocab-local-rich-loading"; rich.textContent = "正在读取本地词典…";
      localSection.querySelectorAll(".vocab-detail-local").forEach(el => el.remove());
      localSection.appendChild(rich);
      sendRuntimeMessage({ action:"LOOKUP_DICTIONARY", text:item.word || "", sl:item.lang || "auto", tl:"zh-CN" }).then(res => {
        if (!wrap.isConnected) return;
        const entries = res?.data?.localDictionaryEntries || [];
        if (!entries.length) { rich.className="vocab-local-rich-empty"; rich.textContent="当前未读取到本地词典详情。"; return; }
        const entry = entries[0];
        const doc = new DOMParser().parseFromString(String(entry.html || ""), "text/html");
        doc.querySelectorAll("script,style,link,iframe,object,embed,form,input,button,textarea,select,meta,base").forEach(el=>el.remove());
        doc.querySelectorAll("*").forEach(el=>Array.from(el.attributes).forEach(a=>{if(/^on/i.test(a.name))el.removeAttribute(a.name);}));
        rich.className="vocab-local-rich";
        rich.innerHTML=`<div class="vocab-local-rich-name">${escapeHtml(entry.dictionaryName || "本地词典")}</div><div class="vocab-local-rich-body">${doc.body.innerHTML}</div>`;
      }).catch(() => { if (rich.isConnected) {rich.className="vocab-local-rich-empty";rich.textContent="本地词典读取失败。";} });
    }
    const close=()=>wrap.remove();
    wrap.querySelector(".vocab-detail-modal-close")?.addEventListener("click",close);
    wrap.addEventListener("click",e=>{if(e.target===wrap)close();});
  }

  inputVocabSearch.addEventListener("input", () => {
    filterAndRenderVocabulary();
  });

  btnExportVocabCsv.addEventListener("click", () => {
    if (!cachedVocabList.length) {
      alert("生词本为空，无需导出");
      return;
    }
    let csv = "Word,Language,Phonetic,Translation,Details,Source,Date\n";
    cachedVocabList.forEach(i => {
      const standardDetails = Array.isArray(i.definitions) ? i.definitions.flatMap(d => Array.isArray(d.terms) ? d.terms : (Array.isArray(d.senses) ? d.senses.map(x => x.zh || x.en) : [])).filter(Boolean) : [];
      const localDetails = Array.isArray(i.localDictionarySummary) ? i.localDictionarySummary.map(x => `${x.name || "本地词典"}: ${x.text || ""}`).filter(Boolean) : [];
      const details = [...standardDetails, ...localDetails].join("；");
      const esc = v => String(v || "").replace(/"/g, '""').replace(/\r?\n/g, " ");
      csv += `"${esc(i.word)}","${esc(i.lang || "und")}","${esc(i.phonetic)}","${esc(i.translation)}","${esc(details)}","${esc(i.sourceName)}","${esc(i.date)}"\n`;
    });
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jijian-translate-vocabulary-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  function buildHighlightMarkdown(list = cachedHighlightList) {
    let md = `# 极简翻译 · 高亮收藏\n\n`;
    (list || []).forEach((item, idx) => {
      md += `${idx + 1}. ${String(item.orig || "").trim()}\n`;
      if (item.trans) md += `   - ${String(item.trans).trim()}\n`;
      if (item.url || item.title) md += `   - 来源：${item.title || item.url || ""}${item.url ? ` · ${item.url}` : ""}\n`;
      md += `\n`;
    });
    return md;
  }
  btnCopyHighlights?.addEventListener("click", async () => {
    if (!cachedHighlightList.length) return alert("高亮收藏为空");
    await navigator.clipboard.writeText(cachedHighlightList.map(x=>x.orig||"").filter(Boolean).join("\n"));
    btnCopyHighlights.textContent="已复制";
    setTimeout(()=>btnCopyHighlights.textContent="复制全部",1000);
  });
  btnExportHighlightsMd?.addEventListener("click", () => {
    if (!cachedHighlightList.length) return alert("高亮收藏为空");
    const blob=new Blob([buildHighlightMarkdown()],{type:"text/markdown;charset=utf-8"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`jijian-highlights-${new Date().toISOString().slice(0,10)}.md`; a.click(); URL.revokeObjectURL(url);
  });

  async function loadHighlightCollection() {
    const res = await sendRuntimeMessage({ action: "GET_HIGHLIGHT_SENTENCES" });
    cachedHighlightList = res?.success && Array.isArray(res.list) ? res.list : [];
    renderHighlightCollection();
  }

  function renderHighlightCollection() {
    if (!highlightManagerList) return;
    const q = String(inputHighlightSearch?.value || "").trim().toLowerCase();
    const list = cachedHighlightList.filter(x => !q || String(x.orig || "").toLowerCase().includes(q) || String(x.trans || "").toLowerCase().includes(q));
    if (highlightCount) highlightCount.textContent = `${list.length} 条`;
    if (!list.length) { highlightManagerList.innerHTML = `<div class="vocab-empty">没有符合条件的高亮收藏。</div>`; return; }
    highlightManagerList.innerHTML = list.map(item => `<article class="highlight-manager-item">
      <div class="highlight-quote">${escapeHtml(item.orig || "")}</div>
      ${item.trans ? `<div class="highlight-translation">${escapeHtml(item.trans)}</div>` : ""}
      <div class="highlight-meta">${escapeHtml(item.hostname || item.sourceUrl || item.url || "")}</div>
      <button type="button" class="highlight-delete" data-id="${escapeHtml(item.id || "")}" data-orig="${escapeHtml(item.orig || "")}" title="删除"><svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V5h6v2M9 11v6M15 11v6M7 7l1 13h8l1-13"/></svg></button>
    </article>`).join("");
    highlightManagerList.querySelectorAll(".highlight-delete").forEach(btn => btn.addEventListener("click", async () => {
      if (!confirm("确定删除这条高亮收藏吗？")) return;
      await sendRuntimeMessage({action:"REMOVE_HIGHLIGHT_SENTENCE", id:btn.dataset.id || undefined, orig:btn.dataset.orig || undefined});
      loadHighlightCollection();
    }));
  }
  inputHighlightSearch?.addEventListener("input", renderHighlightCollection);

  // 7. 缓存清理与导入导出
  btnClearCache.addEventListener("click", async () => {
    await sendRuntimeMessage({ action: "CLEAR_TRANSLATION_CACHE" });
    if (cacheStatsBadge) cacheStatsBadge.textContent = "当前已缓存 0 条翻译记录";
    alert("本地翻译缓存已全部清空！");
  });

  btnExportSettings.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(currentSettings, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jijian-translate-settings.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  btnExportFullBackup?.addEventListener("click", async () => {
    const [vocabRes, highlightRes] = await Promise.all([
      sendRuntimeMessage({ action: "GET_VOCABULARY" }),
      sendRuntimeMessage({ action: "GET_HIGHLIGHT_SENTENCES" })
    ]);
    const payload = {
      format: "jijian-translate-local-backup",
      schema: 1,
      extensionVersion: manifestVersion,
      exportedAt: new Date().toISOString(),
      settings: currentSettings,
      vocabulary: vocabRes?.success && Array.isArray(vocabRes.list) ? vocabRes.list : [],
      highlights: highlightRes?.success && Array.isArray(highlightRes.list) ? highlightRes.list : []
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jijian-translate-full-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  btnImportFullBackup?.addEventListener("click", () => inputFullBackupFile?.click());
  inputFullBackupFile?.addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(String(ev.target?.result || ""));
        if (parsed?.format !== "jijian-translate-local-backup" || Number(parsed?.schema) !== 1) throw new Error("unsupported backup");
        if (!confirm("恢复完整备份会覆盖当前设置、生词本与高亮收藏。继续吗？")) return;
        const nextSettings = parsed.settings && typeof parsed.settings === "object" ? parsed.settings : {};
        const vocabulary = Array.isArray(parsed.vocabulary) ? parsed.vocabulary : [];
        const highlights = Array.isArray(parsed.highlights) ? parsed.highlights : [];
        await Promise.all([
          saveSetting(nextSettings),
          chrome.storage.local.set({ raccoonVocabularyList: vocabulary, raccoonHighlightSentences: highlights })
        ]);
        currentSettings = Object.assign({}, currentSettings, nextSettings);
        initUIFromSettings(currentSettings);
        updateLivePreview(currentSettings);
        cachedVocabList = vocabulary;
        cachedHighlightList = highlights;
        alert(`完整备份已恢复：${vocabulary.length} 个生词，${highlights.length} 条高亮。`);
      } catch (_) {
        alert("这不是有效的极简翻译完整备份文件。");
      } finally {
        e.target.value = "";
      }
    };
    reader.readAsText(file);
  });

  btnImportTrigger.addEventListener("click", () => inputImportFile.click());
  inputImportFile.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        await saveSetting(parsed);
        currentSettings = Object.assign({}, currentSettings, parsed);
        initUIFromSettings(currentSettings);
        updateLivePreview(currentSettings);
        alert("配置导入成功并已生效！");
      } catch (err) {
        alert("配置文件格式错误，无法解析！");
      }
    };
    reader.readAsText(file);
  });

  /**
   * 辅助方法
   */
  async function updateCacheStats() {
    if (!cacheStatsBadge) return;
    const cRes = await sendRuntimeMessage({ action: "GET_CACHE_STATS" });
    if (cRes && typeof cRes.count === "number") {
      cacheStatsBadge.textContent = `当前已缓存 ${cRes.count} 条翻译记录`;
    }
  }

  function initUIFromSettings(s) {
    if (s.translationEngine) apiActiveEngine.value = s.translationEngine;

    // DeepSeek
    if (s.deepseekApiKey && inputDeepseekKey) inputDeepseekKey.value = s.deepseekApiKey;
    if (s.deepseekBaseUrl && inputDeepseekUrl) inputDeepseekUrl.value = s.deepseekBaseUrl;
    if (s.deepseekModel && inputDeepseekModel) inputDeepseekModel.value = s.deepseekModel;

    setSegmentedValue(deeplTypeControl, s.deeplApiType || "free");
    if (s.deeplAuthKey) inputDeeplKey.value = s.deeplAuthKey;

    if (s.openaiApiKey) inputOpenaiKey.value = s.openaiApiKey;
    if (s.openaiBaseUrl) inputOpenaiUrl.value = s.openaiBaseUrl;
    if (s.openaiModel) inputOpenaiModel.value = s.openaiModel;
    if (s.openaiCustomPrompt) inputOpenaiPrompt.value = s.openaiCustomPrompt;

    if (s.claudeApiKey) inputClaudeKey.value = s.claudeApiKey;
    if (s.claudeBaseUrl) inputClaudeUrl.value = s.claudeBaseUrl;
    if (s.claudeModel) inputClaudeModel.value = s.claudeModel;

    if (s.geminiApiKey) inputGeminiKey.value = s.geminiApiKey;
    if (s.geminiModel) inputGeminiModel.value = s.geminiModel;

    if (s.ollamaBaseUrl) inputOllamaUrl.value = s.ollamaBaseUrl;
    if (s.ollamaModel) inputOllamaModel.value = s.ollamaModel;

    if (s.customBaseUrl) inputCustomUrl.value = s.customBaseUrl;
    if (s.customApiKey) inputCustomKey.value = s.customApiKey;
    if (s.customModel) inputCustomModel.value = s.customModel;

    const activeRenderStyle = activeTypographyRenderStyle(s);
    optRenderStyle.value = activeRenderStyle;
    renderStyleCardGrid?.querySelectorAll(".style-choice-card").forEach(card => card.classList.toggle("active", card.dataset.value === activeRenderStyle));
    if (optFontFamily) optFontFamily.value = s.fontFamily || "system";
    translationFontCardGrid?.querySelectorAll(".font-choice-card").forEach(card => card.classList.toggle("active", card.dataset.value === (s.fontFamily || "system")));

    const highlight = s.bgHighlight || "soft-yellow";
    optBgHighlightGrid?.querySelectorAll(".mini-swatch").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-value") === highlight);
    });

    if (optTextColor) optTextColor.value = s.textColor || "black";
    const slateTextOption = optTextColor?.querySelector('option[value="slate"]');
    if (slateTextOption) slateTextOption.textContent = "石墨灰";
    syncTranslationColorGrid(s.textColor || "black");
    if (optUnderlineColor) optUnderlineColor.value = s.underlineColor || "accent";
    if (optClickRevealColor) optClickRevealColor.value = s.clickRevealColor || "charcoal";
    syncStyleDependentOptions(activeRenderStyle);

    if (s.fontSizeRatio) {
      optFontSizeRange.value = s.fontSizeRatio;
      optFontSizeLabel.textContent = `${s.fontSizeRatio}%`;
    }

    if (s.paragraphSpacing) {
      optSpacingRange.value = s.paragraphSpacing;
      optSpacingLabel.textContent = `${s.paragraphSpacing}px`;
    }
    const lineHeight = s.translationLineHeight || "1.62";
    if (optLineHeightRange) optLineHeightRange.value = lineHeight;
    if (optLineHeightLabel) optLineHeightLabel.textContent = Number(lineHeight).toFixed(2);
    optUnderlineStylePicker?.querySelectorAll("i[data-value]").forEach(i => i.classList.toggle("active", i.dataset.value === (s.underlineStyle || "solid")));

    if (s.targetLang) optTargetLang.value = s.targetLang;
    if (optSidebarSync) optSidebarSync.checked = s.sidebarSyncScroll !== false;
    setSegmentedValue(optSidebarSideControl, s.sidebarSide || "right");
    syncTypographyModeAvailability();
    if (optDictTrigger) optDictTrigger.value = s.dictTriggerMode || "both";
    const loadedDictMode = s.dictTriggerMode || "both";
    if (optDictEnabled) optDictEnabled.checked = loadedDictMode !== "none";
    dictTriggerModeGrid?.querySelectorAll("button[data-value]").forEach(btn => {
      btn.disabled = loadedDictMode === "none";
      btn.classList.toggle("active", loadedDictMode !== "none" && btn.dataset.value === loadedDictMode);
    });
    if (optDictionaryMode) optDictionaryMode.value = s.dictionaryLookupMode || "standard";
    if (optEnableDictionaryAi) optEnableDictionaryAi.checked = s.enableDictionaryAi !== false;
    if (optDictionaryAiAnswerStyle) optDictionaryAiAnswerStyle.value = s.dictionaryAiAnswerStyle || "balanced";
    if (optDictionaryAiEmojiLevel) optDictionaryAiEmojiLevel.value = s.dictionaryAiEmojiLevel || "light";
    if (optDictionaryAiLayout) optDictionaryAiLayout.value = s.dictionaryAiLayout || "mixed";
    if (optDictionaryAiDepth) optDictionaryAiDepth.value = s.dictionaryAiExplanationDepth || "standard";
    if (optDictionaryAiStoryMode) optDictionaryAiStoryMode.value = s.dictionaryAiStoryMode || "as-needed";
    if (optDictionaryAiPosition) optDictionaryAiPosition.value = s.dictionaryAiPosition || "first";
    if (optDictionaryAiConceptRigor) optDictionaryAiConceptRigor.checked = s.dictionaryAiConceptRigor !== false;
    if (optDictionaryAiCustomPrompt) optDictionaryAiCustomPrompt.value = s.dictionaryAiCustomPrompt || "";
    syncDictionaryAiPreferencesUi();
    if (optEnableHover) optEnableHover.checked = s.enableParagraphHoverTranslate !== false;
    if (optEnableParagraphActions) optEnableParagraphActions.checked = s.enableParagraphActions !== false;
    if (s.selectionModifierKey) optModifierKey.value = s.selectionModifierKey;
    optEnableInputBox.checked = s.enableInputBoxTranslate !== false;
    optEnableFloatingBall.checked = s.enableFloatingBall !== false;
    if (optAutoDetectLanguage) optAutoDetectLanguage.checked = s.autoDetectPageLanguage !== false;
    if (optEnableImageTranslation) optEnableImageTranslation.checked = s.enableImageTranslation === true;
    if (optImageOcrLanguage) {
      const validOcrValues = new Set(Array.from(optImageOcrLanguage.options).map(o => o.value));
      optImageOcrLanguage.value = validOcrValues.has(s.imageOcrLanguage) ? s.imageOcrLanguage : "auto";
    }
    if (optImageTranslationFont) optImageTranslationFont.value = s.imageTranslationFont || "system";
    syncImageOcrUi();
    highlightStyleCardGrid?.querySelectorAll("button[data-value]").forEach(btn => btn.classList.toggle("active", btn.dataset.value === (s.highlightStyle || "soft-marker")));
    if (optFloatingShortcut) optFloatingShortcut.value = String(s.floatingShortcut || "zz").toUpperCase();
    if (optReaderShortcut) optReaderShortcut.value = String(s.readerShortcut || "aa").toUpperCase();
    if (optAutoTranslate) optAutoTranslate.checked = s.autoTranslateEnabled === true;
    if (optAutoTranslateEngine) optAutoTranslateEngine.value = s.autoTranslateEngine || "google";
    if (btnOpenDonationUrl) btnOpenDonationUrl.dataset.configured = /^https?:\/\//i.test(String(s.donationUrl || "")) ? "true" : "false";
    if (btnOpenProjectUrl) btnOpenProjectUrl.dataset.configured = /^https?:\/\//i.test(String(s.projectUrl || "")) ? "true" : "false";

    Object.entries(s.verifiedEngines || {}).forEach(([engine, connected]) => {
      if (connected) setEngineCardConnectedState(engine, true);
    });

    currentSettings.excludeDomainList = Array.isArray(s.excludeDomainList) ? s.excludeDomainList : [];
    currentSettings.excludeDomainRules = (s.excludeDomainRules && typeof s.excludeDomainRules === "object") ? s.excludeDomainRules : {};
    currentSettings.excludeDomainDefaultRule = (s.excludeDomainDefaultRule && typeof s.excludeDomainDefaultRule === "object") ? s.excludeDomainDefaultRule : {floating:true,hover:true,selection:true,image:true,auto:true};
    currentVocabView = s.vocabularyViewMode === "gallery" ? "gallery" : "list";
    if (vocabLangFilter) vocabLangFilter.value = currentVocabLangFilter;
    vocabViewSwitch?.querySelectorAll("button[data-view]").forEach(btn => btn.classList.toggle("active", btn.dataset.view === currentVocabView));
    if (vocabListContainer) vocabListContainer.dataset.view = currentVocabView;
    renderExcludeDomainList();
  }

  livePreviewCard?.addEventListener("mouseover", (event) => {
    const pair = event.target?.closest?.("[data-preview-pair]");
    const next = pair?.dataset.previewPair || "";
    if (next === livePreviewHoverPair) return;
    livePreviewHoverPair = next;
    updateLivePreview(currentSettings);
  });
  livePreviewCard?.addEventListener("mouseleave", () => {
    livePreviewHoverPair = "";
    updateLivePreview(currentSettings);
  });
  livePreviewCard?.addEventListener("click", (event) => {
    if (activeTypographyRenderStyle() !== "click-reveal") return;
    const pairId = event.target?.closest?.("[data-preview-pair]")?.dataset.previewPair;
    if (!pairId) return;
    if (livePreviewClickRevealed.has(pairId)) livePreviewClickRevealed.delete(pairId);
    else livePreviewClickRevealed.add(pairId);
    updateLivePreview(currentSettings);
  });

  function updateLivePreview(s) {
    if (!liveTransH || !liveTransP) return;

    const renderStyle = activeTypographyRenderStyle(s);
    const fontStyle = s.displayMode === "replace" ? "normal" : (renderStyle === "italic" ? "italic" : "normal");
    const translatedEls = [liveTransH, liveTransP, ...document.querySelectorAll(".live-trans-extra")];
    const setPreviewStyle = (el, prop, value) => { if (el) el.style.setProperty(prop, value, "important"); };
    translatedEls.forEach(el => setPreviewStyle(el, "font-style", fontStyle));

    const previewColorMap = {black:"#111827",slate:"#5f6063",accent:"#2563eb",green:"#27835d",purple:"#7c5ac7",red:"#b84a4a",orange:"#b86d24",teal:"#207f7a",brown:"#8a6448",inherit:"#111827"};
    let textColor = previewColorMap[s.textColor || "black"] || "#111827";
    translatedEls.forEach(el => setPreviewStyle(el, "color", textColor));

    const ratio = (parseInt(s.fontSizeRatio, 10) || 100) / 100;
    setPreviewStyle(liveTransH, "font-size", `${Math.round(21 * ratio * 100) / 100}px`);
    setPreviewStyle(liveTransP, "font-size", `${Math.round(15 * ratio * 100) / 100}px`);
    document.querySelectorAll(".live-trans-extra").forEach(el => setPreviewStyle(el, "font-size", `${Math.round(15 * ratio * 100) / 100}px`));

    const spacing = parseInt(s.paragraphSpacing, 10) || 6;
    translatedEls.forEach(el => setPreviewStyle(el, "margin-top", `${spacing}px`));
    const lineHeight = parseFloat(s.translationLineHeight || "1.62") || 1.62;
    translatedEls.forEach(el => setPreviewStyle(el, "line-height", String(lineHeight)));

    const previewFontMap = {
      system: '-apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif',
      "source-sans": '"Source Han Sans SC", "PingFang SC", sans-serif',
      pingfang: '"PingFang SC", sans-serif',
      "kinghwa-song": '"KingHwa_OldSong", "STSong", serif',
      "source-serif": '"Source Han Serif SC", "Songti SC", serif',
      "lxgw-wenkai": '"LXGW WenKai", "Kaiti SC", serif',
      "smiley-sans": '"Smiley Sans", "PingFang SC", sans-serif',
      kaiti: '"Kaiti SC", "STKaiti", serif'
    };
    const previewFont = previewFontMap[s.fontFamily || "system"] || previewFontMap.system;
    translatedEls.forEach(el => { if (el) setPreviewStyle(el, "font-family", previewFont); });

    translatedEls.forEach((el) => {
      const pairId = el.closest?.("[data-preview-pair]")?.dataset.previewPair || "";
      const pairHovered = pairId && pairId === livePreviewHoverPair;
      setPreviewStyle(el, "background-color", "transparent");
      setPreviewStyle(el, "border-bottom", "none");
      setPreviewStyle(el, "text-decoration", "none");
      setPreviewStyle(el, "border-left", "none");
      setPreviewStyle(el, "padding-left", "0");
      setPreviewStyle(el, "opacity", "1");
      setPreviewStyle(el, "filter", "none");

      if (renderStyle === "native") {
        setPreviewStyle(el, "color", "inherit");
        setPreviewStyle(el, "font-family", "inherit");
        setPreviewStyle(el, "font-style", "normal");
        setPreviewStyle(el, "opacity", ".72");
      } else if (renderStyle === "highlight") {
        let bg = "#fef08a";
        if (s.bgHighlight === "soft-green") bg = "#bbf7d0";
        if (s.bgHighlight === "soft-purple") bg = "#e9d5ff";
        if (s.bgHighlight === "soft-orange") bg = "#fed7aa";
        if (s.bgHighlight === "soft-blue") bg = "#bfdbfe";
        if (s.bgHighlight === "none") bg = "transparent";
        setPreviewStyle(el, "background-color", bg);
        setPreviewStyle(el, "border-radius", "4px");
      } else if (renderStyle === "underline") {
        const u = s.underlineStyle || "solid";
        setPreviewStyle(el, "text-decoration-line", "underline");
        setPreviewStyle(el, "text-decoration-style", u === "double" ? "double" : u);
        const underlineColors = {accent:"#3b82f6",slate:"#64748b",green:"#2f855a",purple:"#7c5ac7",red:"#b84a4a",inherit:"currentColor"};
        setPreviewStyle(el, "text-decoration-color", underlineColors[s.underlineColor || "accent"] || "#3b82f6");
        setPreviewStyle(el, "text-underline-offset", "3px");
        setPreviewStyle(el, "text-decoration-thickness", "1.4px");
      } else if (renderStyle === "hover-reveal") {
        setPreviewStyle(el, "opacity", pairHovered ? "1" : ".2");
      } else if (renderStyle === "blur-reveal") {
        setPreviewStyle(el, "filter", pairHovered ? "none" : "blur(5px)");
        setPreviewStyle(el, "opacity", pairHovered ? "1" : ".74");
      } else if (renderStyle === "click-reveal") {
        if (!livePreviewClickRevealed.has(pairId)) {
          const revealColors = {charcoal:"#25282d",slate:"#46515f",navy:"#2f4057",forest:"#365247",plum:"#51415b",brown:"#5b4a3d"};
          setPreviewStyle(el, "background-color", revealColors[s.clickRevealColor || "charcoal"] || "#25282d");
          setPreviewStyle(el, "color", "transparent");
          setPreviewStyle(el, "border-radius", "3px");
        }
      } else if (renderStyle === "left-bar") {
        setPreviewStyle(el, "border-left", "3.5px solid #0071e3");
        setPreviewStyle(el, "padding-left", "8px");
        setPreviewStyle(el, "background-color", "rgba(0, 113, 227, 0.05)");
      }
    });
  }

  function ensureSegmentIndicator(container) {
    if (!container) return null;
    let indicator = container.querySelector(":scope > .settings-segment-indicator");
    if (!indicator) { indicator = document.createElement("span"); indicator.className = "settings-segment-indicator"; container.prepend(indicator); }
    return indicator;
  }

  function syncSegmentIndicator(container, animate = false) {
    if (!container) return;
    const active = container.querySelector(".segment-item.active, button.active");
    const indicator = ensureSegmentIndicator(container);
    if (!active || !indicator) return;
    requestAnimationFrame(() => {
      const targetX = active.offsetLeft;
      const targetWidth = active.offsetWidth;
      indicator.style.transitionDuration = animate ? ".22s" : "0s";
      indicator.style.width = `${targetWidth}px`;
      indicator.style.transform = `translateX(${targetX}px)`;
      indicator.dataset.x = String(targetX);
      indicator.dataset.width = String(targetWidth);
    });
  }

  function syncAllSegmentIndicators() {
    document.querySelectorAll(".segmented-control, .vocab-view-switch").forEach(syncSegmentIndicator);
  }

  function bindSegmentedControl(container, onChange) {
    if (!container) return;
    const items = container.querySelectorAll(".segment-item");
    ensureSegmentIndicator(container);
    items.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.classList.contains("active")) return;
        items.forEach(i => i.classList.remove("active"));
        btn.classList.add("active");
        syncSegmentIndicator(container, true);
        onChange(btn.getAttribute("data-value"));
      });
    });
    syncSegmentIndicator(container);
  }

  function setSegmentedValue(container, value) {
    if (!container) return;
    const items = container.querySelectorAll(".segment-item");
    items.forEach((btn) => btn.classList.toggle("active", btn.getAttribute("data-value") === value));
    syncSegmentIndicator(container);
  }

  function enhanceSelects() {
    document.querySelectorAll("select.apple-select").forEach(select => {
      if (select.dataset.enhanced === "1") return;
      select.dataset.enhanced = "1";
      const wrap = document.createElement("div"); wrap.className = "jijian-select";
      const btn = document.createElement("button"); btn.type = "button"; btn.className = "jijian-select-trigger";
      const menu = document.createElement("div"); menu.className = "jijian-select-menu";
      select.parentNode.insertBefore(wrap, select); wrap.appendChild(select); wrap.appendChild(btn); wrap.appendChild(menu);
      select.classList.add("native-select-hidden");
      const render = () => {
        const opt = select.options[select.selectedIndex];
        btn.disabled = select.disabled;
        const colorMode = select.dataset.colorSelect === "1";
        const selectedDot = colorMode && opt?.dataset?.color ? `<i class="select-color-dot" style="--dot:${escapeHtml(opt.dataset.color)}"></i>` : "";
        btn.innerHTML = `<span class="select-trigger-copy">${selectedDot}<span>${escapeHtml(opt?.textContent || "")}</span></span><svg viewBox="0 0 20 20"><path d="m6 8 4 4 4-4"/></svg>`;
        menu.innerHTML = Array.from(select.options).map(o => {
          const dot = colorMode && o.dataset?.color ? `<i class="select-color-dot" style="--dot:${escapeHtml(o.dataset.color)}"></i>` : "";
          return `<button type="button" data-value="${escapeHtml(o.value)}" class="${o.value === select.value ? "active" : ""}"><span class="select-menu-copy">${dot}<span>${escapeHtml(o.textContent)}</span></span>${o.value === select.value ? '<svg viewBox="0 0 20 20"><path d="m5 10 3 3 7-7"/></svg>' : ''}</button>`;
        }).join("");
        menu.querySelectorAll("button").forEach(item => item.addEventListener("click", () => {
          select.value = item.dataset.value;
          select.dispatchEvent(new Event("change", { bubbles:true }));
          wrap.classList.remove("open");
          wrap.closest('.macos-card')?.classList.remove('has-open-select');
          render();
        }));
      };
      btn.addEventListener("click", e => {
        e.stopPropagation();
        document.querySelectorAll(".model-input-row.model-menu-open").forEach(x => x.classList.remove("model-menu-open"));
        document.querySelectorAll(".jijian-select.open").forEach(x => {
          if (x === wrap) return;
          x.classList.remove("open");
          x.closest('.macos-card')?.classList.remove('has-open-select');
        });
        wrap.classList.toggle("open");
        wrap.closest('.macos-card')?.classList.toggle('has-open-select', wrap.classList.contains('open'));
      });
      select.addEventListener("change", render); render();
    });
    document.addEventListener("click", () => document.querySelectorAll(".jijian-select.open").forEach(x => {
      x.classList.remove("open");
      x.closest('.macos-card')?.classList.remove('has-open-select');
    }));
  }

  window.addEventListener('resize', () => requestAnimationFrame(syncAllSegmentIndicators), { passive:true });

  function enhanceModelPickers() {
    document.querySelectorAll(".model-input-row").forEach(row => {
      if (row.dataset.enhanced === "1") return; row.dataset.enhanced = "1";
      const input = row.querySelector('input[id$="-model"]'); if (!input) return;
      const engine = input.id.replace(/^input-/, "").replace(/-model$/, "");
      const picker = document.createElement("button"); picker.type="button"; picker.className="model-picker-btn"; picker.title="选择模型"; picker.innerHTML='<span>选择模型</span><svg viewBox="0 0 20 20"><path d="m6 8 4 4 4-4"/></svg>';
      const menu = document.createElement("div"); menu.className="model-picker-menu";
      const refresh = row.querySelector(".model-refresh-btn");
      if (refresh) row.insertBefore(picker, refresh); else row.appendChild(picker);
      row.appendChild(menu); modelPickerMenus.set(engine, {row,input,menu});
      picker.addEventListener("click", e => {
        e.stopPropagation();
        document.querySelectorAll(".jijian-select.open").forEach(x => {
          x.classList.remove("open");
          x.closest('.macos-card')?.classList.remove('has-open-select');
        });
        document.querySelectorAll(".model-input-row.model-menu-open").forEach(x => { if (x !== row) x.classList.remove("model-menu-open"); });
        row.classList.toggle("model-menu-open");
        refreshModelPickerMenu(engine);
      });
      refreshModelPickerMenu(engine);
    });
    document.addEventListener("click", () => document.querySelectorAll(".model-input-row.model-menu-open").forEach(x => x.classList.remove("model-menu-open")));
  }

  function refreshModelPickerMenu(engine) {
    const obj = modelPickerMenus.get(engine); if (!obj) return;
    const data = document.getElementById(`models-${engine}`);
    const vals = data ? Array.from(data.querySelectorAll("option")).map(o => o.value).filter(Boolean) : [];
    obj.menu.innerHTML = vals.length ? vals.map(v => `<button type="button" data-model="${escapeHtml(v)}" class="${v === obj.input.value ? "active" : ""}">${escapeHtml(v)}${v === obj.input.value ? '<svg viewBox="0 0 20 20"><path d="m5 10 3 3 7-7"/></svg>' : ''}</button>`).join("") : '<div class="model-picker-empty">暂无预设，可直接输入模型名称</div>';
    obj.menu.querySelectorAll("button[data-model]").forEach(btn => btn.addEventListener("click", e => { e.stopPropagation(); obj.input.value = btn.dataset.model; obj.input.dispatchEvent(new Event("input", {bubbles:true})); obj.row.classList.remove("model-menu-open"); refreshModelPickerMenu(engine); }));
  }

  function openLocalDictDb() {
    return new Promise((resolve,reject) => { const req=indexedDB.open("jijian-local-dictionaries",1); req.onupgradeneeded=()=>{ if(!req.result.objectStoreNames.contains("handles")) req.result.createObjectStore("handles"); }; req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error); });
  }
  async function putLocalHandle(key, handle) { const db=await openLocalDictDb(); return new Promise((res,rej)=>{ const tx=db.transaction("handles","readwrite"); tx.objectStore("handles").put(handle,key); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); }); }
  async function getLocalHandle(key) { const db=await openLocalDictDb(); return new Promise((res,rej)=>{ const tx=db.transaction("handles","readonly"); const q=tx.objectStore("handles").get(key); q.onsuccess=()=>res(q.result||null); q.onerror=()=>rej(q.error); }); }
  async function deleteLocalHandle(key) { if(!key) return; const db=await openLocalDictDb(); return new Promise((res,rej)=>{ const tx=db.transaction("handles","readwrite"); tx.objectStore("handles").delete(key); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); }); }
  async function queryLocalReadPermission(handle) {
    if (!handle) return "missing";
    try {
      if (typeof handle.queryPermission !== "function") return "granted";
      return await handle.queryPermission({ mode:"read" });
    } catch (_) { return "denied"; }
  }
  async function requestLocalReadPermission(handle) {
    if (!handle) return false;
    try {
      const state = await queryLocalReadPermission(handle);
      if (state === "granted") return true;
      if (typeof handle.requestPermission === "function") return (await handle.requestPermission({ mode:"read" })) === "granted";
    } catch (_) {}
    return false;
  }
  async function collectLocalDictionaryPermissionItems() {
    const stored=await chrome.storage.local.get("jijianLocalDictionaryMeta").catch(()=>({}));
    const meta=stored?.jijianLocalDictionaryMeta||{};
    const dicts=Array.isArray(meta?.dictionaries)?meta.dictionaries.filter(x=>x.enabled!==false):[];
    const items=[];
    // A remembered folder may not have produced dictionary rows yet if Chromium
    // required a permission prompt on first scan. Keep the directory re-authorizable
    // from the persisted folder record itself instead of inferring it from rows.
    if(meta.folderName) items.push({label:`词典文件夹 · ${meta.folderName}`,key:"directory"});
    for(const d of dicts.filter(x=>x.source==="file")){
      if(d.mdxHandleKey) items.push({label:`${d.displayName||d.name} · MDX`,key:d.mdxHandleKey});
      if(d.mddHandleKey) items.push({label:`${d.displayName||d.name} · MDD`,key:d.mddHandleKey});
      if(d.cssHandleKey) items.push({label:`${d.displayName||d.name} · CSS`,key:d.cssHandleKey});
    }
    return items;
  }
  async function reauthorizeLocalDictionaryHandles() {
    const items=await collectLocalDictionaryPermissionItems();
    if(!items.length) return {ok:true,checked:0,failed:[],remaining:0,granted:""};
    let target=null;
    const known=[];
    // Ask for the first missing permission as early as possible while the button
    // click still carries transient user activation. Do not preflight every file
    // before opening Chromium's permission prompt.
    for(const item of items){
      const h=await getLocalHandle(item.key).catch(()=>null);
      const state=await queryLocalReadPermission(h);
      known.push({...item,handle:h,state});
      if(state!=="granted"){ target={...item,handle:h}; break; }
    }
    if(!target) return {ok:true,checked:items.length,failed:[],remaining:0,granted:""};
    const granted=target.handle ? await requestLocalReadPermission(target.handle) : false;
    const remaining=[];
    for(const item of items){
      const h=await getLocalHandle(item.key).catch(()=>null);
      if((await queryLocalReadPermission(h))!=="granted") remaining.push(item.label);
    }
    return {ok:remaining.length===0,checked:items.length,failed:remaining,remaining:remaining.length,granted:granted?target.label:""};
  }
  async function inspectMdxHandle(handle, { deepCheck = false } = {}) {
    try {
      const file = await handle.getFile();
      const head = await file.slice(0,4).arrayBuffer();
      if (head.byteLength < 4) return {parserReady:false, parserError:"文件头无效"};
      const len = new DataView(head).getUint32(0,false);
      if (!len || len > 1024*1024) return {parserReady:false, parserError:"不是可识别的 MDX"};
      const raw = new TextDecoder("utf-16le").decode(new Uint8Array(await file.slice(4,4+len).arrayBuffer())).replace(/\0+$/g,"");
      const attrs={}; const tag=(raw.match(/<(?:Dictionary|Library_Data)\b([^>]*)>/i)||[])[1]||raw; const re=/([\w:-]+)\s*=\s*(["'])(.*?)\2/g; let m;
      while((m=re.exec(tag))) attrs[m[1]]=m[3].replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
      const plain=v=>String(v||"").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/\s+/g," ").trim();
      let displayName=plain(attrs.Title||attrs.BookName||attrs.DictionaryTitle||"");
      if(!displayName){const d=plain(attrs.Description||""); if(d && d.length<=90) displayName=d;}
      const engineVersion=String(attrs.GeneratedByEngineVersion||"");
      const encrypted=String(attrs.Encrypted||"0");
      let parserReady=false, parserError="";
      if (parseFloat(engineVersion||"2") >= 3) {
        parserError="MDict 3.x 暂不支持";
      } else if (encrypted === "1" || /^yes$/i.test(encrypted)) {
        parserError="受保护词典暂不支持";
      } else {
        try {
          if (window.JiJianMDict?.MDictLite) {
            // Large MDX files can take several seconds to build their index. The
            // import action only performs a quick header check so the picker never
            // appears frozen; the explicit lookup test performs the real read.
            if (deepCheck) {
              const reader = await new window.JiJianMDict.MDictLite(file, "mdx").init();
              const sampleWord = (reader.keyIndex || []).map(x => String(x?.firstWord || "").trim()).find(Boolean) || "";
              if (sampleWord) {
                const sampleResult = await reader.lookup(sampleWord);
                if (!Array.isArray(sampleResult) || !sampleResult.length) throw new Error("索引可解析，但词条记录读取失败");
              }
            }
            parserReady=true;
          } else {
            parserError="解析器未加载";
          }
        } catch(err) {
          parserError=String(err?.message||"无法初始化词典").slice(0,80);
        }
      }
      return {
        displayName:displayName.slice(0,90),
        description:plain(attrs.Description||"").slice(0,180),
        encoding:attrs.Encoding||"",
        engineVersion,
        encrypted,
        parserReady,
        parserError
      };
    } catch(err) { return {parserReady:false, parserError:String(err?.message||"无法读取文件").slice(0,80)}; }
  }
  async function putLocalDirectoryHandle(handle) { return putLocalHandle("directory", handle); }
  async function getLocalDirectoryHandle() { const db=await openLocalDictDb(); return new Promise((res,rej)=>{ const tx=db.transaction("handles","readonly"); const q=tx.objectStore("handles").get("directory"); q.onsuccess=()=>res(q.result||null); q.onerror=()=>rej(q.error); }); }
  async function scanLocalDictionaryFolder(handle) {
    const previous=(await chrome.storage.local.get("jijianLocalDictionaryMeta").catch(()=>({})))?.jijianLocalDictionaryMeta?.dictionaries||[];
    const imported=previous.filter(x=>x.source === "file");
    const prevByName=new Map(previous.map(x=>[x.name,x]));
    const files=[];
    for await (const [name,entry] of handle.entries()) {
      if(entry.kind !== "file" || !/\.(mdx|mdd|css)$/i.test(name)) continue;
      const ext=(name.match(/\.([^.]+)$/)||[])[1]?.toLowerCase();
      files.push({name,kind:ext});
    }
    const byBase=new Map();
    files.forEach(f=>{
      const base=f.name.replace(/\.(mdx|mdd|css)$/i,"");
      const x=byBase.get(base)||{name:base,mdxName:"",mddName:"",cssName:"",enabled:prevByName.get(base)?.enabled!==false};
      x[`${f.kind}Name`]=f.name; byBase.set(base,x);
    });
    const folderDicts=Array.from(byBase.values()).filter(x=>x.mdxName).map(x=>({...x,source:"folder"})).sort((a,b)=>a.name.localeCompare(b.name));
    // A complete folder source wins over an older same-name single-file import.
    // This prevents stale MDX handles from shadowing the folder's CSS/audio/assets.
    const folderNames=new Set(folderDicts.map(x=>x.name));
    const dictionaries=[...folderDicts, ...imported.filter(x=>!folderNames.has(x.name))];
    await chrome.storage.local.set({ jijianLocalDictionaryMeta:{ folderName:handle.name, dictionaries, updatedAt:Date.now() } });
    return dictionaries;
  }
  async function setLocalDictionaryEnabled(name, enabled){
    const result=await chrome.storage.local.get("jijianLocalDictionaryMeta");
    const meta=result.jijianLocalDictionaryMeta||{};
    const dictionaries=(meta.dictionaries||[]).map(d=>d.name===name?{...d,enabled}:d);
    const next={...meta,dictionaries,updatedAt:Date.now()};
    await chrome.storage.local.set({jijianLocalDictionaryMeta:next});
    renderLocalDictionaries(next);
  }
  function renderLocalDictionaries(meta) {
    if (!localDictList) return;
    const dicts=Array.isArray(meta?.dictionaries)?meta.dictionaries:[];
    const hasFolder=!!meta?.folderName;
    const folderCount=dicts.filter(d=>d.source==="folder").length;
    if (btnRemoveLocalDictFolder) btnRemoveLocalDictFolder.hidden=!hasFolder;
    if (localDictStatus) localDictStatus.textContent = hasFolder ? `${meta.folderName} · 已记录${folderCount?` · ${folderCount} 本词典`:""}` : (dicts.length ? `已接入 ${dicts.length} 本本地词典` : "");
    localDictList.innerHTML = dicts.length ? dicts.map(d=>{
      const health = d.parserReady === true
        ? `<span class="local-dict-health ready">可读取</span>`
        : (d.parserError ? `<span class="local-dict-health error" title="${escapeHtml(d.parserError)}">${escapeHtml(d.parserError)}</span>` : `<span class="local-dict-health">未验证</span>`);
      const sourceLabel=d.source === "file" ? "单文件" : `文件夹${meta?.folderName?` · ${escapeHtml(meta.folderName)}`:""}`;
      const remove=d.source === "file" ? `<button type="button" class="local-dict-remove-one" data-remove-dict="${escapeHtml(d.name)}" title="移除这项单文件导入" aria-label="移除 ${escapeHtml(d.name)}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>` : "";
      return `<div class="local-dict-row" data-dict-name="${escapeHtml(d.name)}" data-dict-source="${escapeHtml(d.source||"folder")}">
        <div class="local-dict-copy"><strong>${escapeHtml(d.displayName || d.name)}${health}</strong><span>${escapeHtml(d.displayName && d.displayName !== d.name ? d.name + " · " : "")}${[d.mdxName&&"MDX",d.mddName&&"MDD",d.cssName&&"CSS"].filter(Boolean).join(" + ") || "MDX"} · ${sourceLabel}${d.engineVersion ? ` · v${escapeHtml(d.engineVersion)}` : ""}</span></div>
        <div class="local-dict-row-actions">${remove}<label class="local-dict-switch" title="${d.enabled===false?"启用":"停用"} ${escapeHtml(d.name)}"><input type="checkbox" ${d.enabled===false?"":"checked"}><span></span></label></div>
      </div>`;
    }).join("") : '<div class="local-dict-empty">还没有添加本地词典。</div>';
    localDictList.querySelectorAll(".local-dict-row").forEach(row=>{
      const input=row.querySelector('input[type="checkbox"]');
      input?.addEventListener("change",()=>setLocalDictionaryEnabled(row.dataset.dictName,input.checked));
    });
    localDictList.querySelectorAll("[data-remove-dict]").forEach(btn=>btn.addEventListener("click",async()=>{
      const name=btn.dataset.removeDict;
      const stored=await chrome.storage.local.get("jijianLocalDictionaryMeta").catch(()=>({}));
      const current=stored?.jijianLocalDictionaryMeta||{};
      const target=(current.dictionaries||[]).find(d=>d.name===name&&d.source==="file");
      if(!target) return;
      if(!confirm(`确定移除单文件词典“${target.displayName||target.name}”吗？\n不会删除电脑上的原文件。`)) return;
      await Promise.all([target.mdxHandleKey,target.mddHandleKey,target.cssHandleKey].filter(Boolean).map(k=>deleteLocalHandle(k).catch(()=>{})));
      const next={...current,dictionaries:(current.dictionaries||[]).filter(d=>!(d.name===name&&d.source==="file")),updatedAt:Date.now()};
      await chrome.storage.local.set({jijianLocalDictionaryMeta:next}); renderLocalDictionaries(next);
    }));
  }
  async function loadLocalDictionaryMeta(){
    const x=await chrome.storage.local.get("jijianLocalDictionaryMeta");
    const meta=x.jijianLocalDictionaryMeta||{};
    renderLocalDictionaries(meta);
    // File-system handles can survive a restart while Chromium reports their state
    // as `prompt`.  Keep the remembered source visible instead of replacing it with
    // an empty scan.  Only rescan automatically when the options page can actually
    // read the stored directory handle right now.
    if(meta.folderName){
      const handle=await getLocalDirectoryHandle().catch(()=>null);
      const state=await queryLocalReadPermission(handle);
      if(localDictStatus){
        const folderCount=(meta.dictionaries||[]).filter(d=>d.source==="folder").length;
        localDictStatus.textContent = state === "granted"
          ? `${meta.folderName} · 已连接${folderCount?` · ${folderCount} 本词典`:""}`
          : `${meta.folderName} · 已记录 · 待恢复读取授权`;
      }
      if(state === "granted"){
        const res=await sendRuntimeMessage({action:"RESCAN_LOCAL_DICTIONARIES"},7000).catch(()=>null);
        if(res?.success && Array.isArray(res.dictionaries)){
          const next={...meta,folderName:res.folderName||meta.folderName,dictionaries:res.dictionaries,updatedAt:Date.now()};
          renderLocalDictionaries(next);
          if(localDictStatus) localDictStatus.textContent=`${next.folderName} · 已连接 · ${next.dictionaries.filter(d=>d.source==="folder").length} 本词典`;
        }
      } else if(handle){
        setLocalDictTestStatus("词典文件夹已经记住，不需要重新导入。点击“重新授权”即可恢复读取。", "warn");
      }
    }
  }

  function localDictionaryImportError(error, fallback) {
    const name=String(error?.name||"");
    if(name === "AbortError") return "";
    if(name === "NotAllowedError" || name === "SecurityError") return "没有取得文件读取权限，请重新选择并允许读取。";
    if(name === "NotFoundError") return "所选词典文件已经移动或不存在，请重新选择。";
    const message=String(error?.message||"").replace(/^Error:\s*/,"").trim();
    return message ? `${fallback}：${message.slice(0,120)}` : fallback;
  }

  btnAddLocalDictFiles?.addEventListener("click", async () => {
    if (!window.showOpenFilePicker) { setLocalDictTestStatus("当前浏览器不支持直接读取本地词典文件。请使用最新版 Chrome。", "error"); return; }
    btnAddLocalDictFiles.disabled=true;
    try {
      const handles=await window.showOpenFilePicker({id:"jijian-local-dictionary-files",multiple:true,types:[{description:"MDict 词典与样式",accept:{"application/octet-stream":[".mdx",".mdd"],"text/css":[".css"]}}]});
      if(!handles?.length) return;
      setLocalDictTestStatus(`正在接入 ${handles.length} 个词典文件…`);
      const stored=await chrome.storage.local.get("jijianLocalDictionaryMeta").catch(()=>({}));
      const meta=stored.jijianLocalDictionaryMeta||{};
      const existing=Array.isArray(meta.dictionaries)?meta.dictionaries:[];
      // Seed the merge table with already imported file dictionaries so users can
      // select MDX and its MDD in separate picker sessions and still pair them.
      const byBase=new Map(existing.filter(x=>x.source === "file").map(x=>[x.name,{...x}]));
      for(const h of handles){
        const name=h.name||""; if(!/\.(mdx|mdd|css)$/i.test(name)) continue;
        const ext=/\.mdd$/i.test(name)?"mdd":(/\.css$/i.test(name)?"css":"mdx"); const base=name.replace(/\.(mdx|mdd|css)$/i,"");
        const previous=byBase.get(base); const row=previous||{name:base,mdxName:"",mddName:"",cssName:"",source:"file",enabled:true};
        const key=`file:${base}:${ext}`; await putLocalHandle(key,h); row[`${ext}Name`]=name; row[`${ext}HandleKey`]=key; row.source="file";
        if(ext === "mdx") {
          const info=await inspectMdxHandle(h, {deepCheck:false});
          if(info.displayName) row.displayName=info.displayName;
          if(info.description) row.description=info.description;
          row.engineVersion=info.engineVersion||"";
          row.encoding=info.encoding||"";
          row.parserReady=!!info.parserReady;
          row.parserError=info.parserError||"";
        }
        byBase.set(base,row);
      }
      const imported=Array.from(byBase.values()).filter(x=>x.mdxName);
      const folderDicts=existing.filter(x=>x.source !== "file");
      const folderNames=new Set(folderDicts.map(x=>x.name));
      const dictionaries=[...folderDicts,...imported.filter(x=>!folderNames.has(x.name))].sort((a,b)=>a.name.localeCompare(b.name));
      const next={...meta,dictionaries,updatedAt:Date.now()};
      await chrome.storage.local.set({jijianLocalDictionaryMeta:next});
      renderLocalDictionaries(next);
      if(localDictStatus) localDictStatus.textContent=`已接入 ${imported.length} 本本地词典`;
      setLocalDictTestStatus(imported.length ? `文件接入完成。可在上方输入单词测试。` : "没有找到可用的 MDX 文件；MDD 与 CSS 需要和对应 MDX 一起使用。", imported.length ? "success" : "warn");
    } catch(err){
      const message=localDictionaryImportError(err,"无法读取所选 MDX / MDD / CSS 文件");
      if(message) setLocalDictTestStatus(message,"error");
    } finally {
      btnAddLocalDictFiles.disabled=false;
    }
  });

  function setLocalDictTestStatus(text, tone="") {
    if (!localDictTestStatus) return;
    localDictTestStatus.textContent = text || "";
    localDictTestStatus.classList.remove("success","warn","error");
    if (tone) localDictTestStatus.classList.add(tone);
  }
  async function testLocalDictionaryLookup() {
    const text = String(localDictTestInput?.value || "").trim();
    if (!text) { setLocalDictTestStatus("先输入一个测试词。", "warn"); return; }
    const stored=await chrome.storage.local.get("jijianLocalDictionaryMeta").catch(()=>({}));
    const enabled=(stored?.jijianLocalDictionaryMeta?.dictionaries||[]).filter(x=>x.enabled!==false && x.mdxName);
    if(!enabled.length){ setLocalDictTestStatus("还没有接入本地词典。先在下方添加词典即可。", ""); return; }
    if (btnTestLocalDict) btnTestLocalDict.disabled = true;
    setLocalDictTestStatus("正在读取本地词典…");
    const res = await sendRuntimeMessage({ action:"LOOKUP_LOCAL_DICTIONARIES_TEST", text }, 20000);
    if (btnTestLocalDict) btnTestLocalDict.disabled = false;
    if (!res?.success) { setLocalDictTestStatus(res?.error || "读取失败", "error"); return; }
    const entries = Array.isArray(res.entries) ? res.entries : [];
    if (entries.length) {
      const names = entries.slice(0,3).map(x => {
        const name=x.dictionaryName || "本地词典";
        const matched=String(x.matchedWord || "").trim();
        return matched && matched !== text ? `${name}（命中 ${matched}）` : name;
      }).join("、");
      const styleChecks=[];
      for(const entry of entries.slice(0,2)){
        const refs=Array.isArray(entry.stylesheetRefs)?entry.stylesheetRefs.slice(0,2):[];
        for(const ref of refs){
          const check=await sendRuntimeMessage({action:"LOOKUP_LOCAL_DICTIONARY_RESOURCE",dictionaryName:entry.dictionaryKey||entry.dictionaryName,path:ref},8000).catch(()=>null);
          styleChecks.push(`${ref}${check?.success?" ✓":" 缺失"}`);
        }
      }
      setLocalDictTestStatus(`命中 ${entries.length} 本：${names}${styleChecks.length?` · 样式：${styleChecks.join("、")}`:""}`, styleChecks.some(x=>x.includes("缺失"))?"warn":"success");
    } else if (res.permission === false) {
      setLocalDictTestStatus("读取权限已失效。单文件模式请点下方“继续授权”；文件夹模式通常只需确认一次。", "warn");
    } else if (Array.isArray(res.errors) && res.errors.length) {
      setLocalDictTestStatus(`${res.errors[0].dictionaryName || "词典"}：${res.errors[0].message || "读取失败"}`, "error");
    } else {
      setLocalDictTestStatus(`已读取 ${Number(res.enabledCount || 0)} 本词典，但没有命中“${text}”。`, "");
    }
  }
  btnTestLocalDict?.addEventListener("click", testLocalDictionaryLookup);
  btnReauthorizeLocalDict?.addEventListener("click", async () => {
    btnReauthorizeLocalDict.disabled=true;
    setLocalDictTestStatus("正在检查读取权限…");
    const auth=await reauthorizeLocalDictionaryHandles();
    if(auth.ok){
      const res=await sendRuntimeMessage({action:"RESCAN_LOCAL_DICTIONARIES"},12000).catch(()=>null);
      if(res?.success && Array.isArray(res.dictionaries)){
        const stored=await chrome.storage.local.get("jijianLocalDictionaryMeta").catch(()=>({}));
        const next={...(stored.jijianLocalDictionaryMeta||{}),folderName:res.folderName||(stored.jijianLocalDictionaryMeta||{}).folderName,dictionaries:res.dictionaries,updatedAt:Date.now()};
        await chrome.storage.local.set({jijianLocalDictionaryMeta:next});
        renderLocalDictionaries(next);
        if(localDictStatus && next.folderName) localDictStatus.textContent=`${next.folderName} · 已连接 · ${next.dictionaries.filter(d=>d.source==="folder").length} 本词典`;
      }
      setLocalDictTestStatus("本地词典读取权限已恢复，连接记录已保存。", "success");
    } else if(auth.granted){ setLocalDictTestStatus(`已恢复：${auth.granted}。还剩 ${auth.remaining} 项待授权，再点一次“继续授权”即可。`, "warn"); }
    else { setLocalDictTestStatus(`读取授权仍未完成，但文件夹记录会保留，不需要重新导入。`, "warn"); }
    btnReauthorizeLocalDict.disabled=false;
  });
  localDictTestInput?.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); testLocalDictionaryLookup(); } });

  btnAddLocalDictFolder?.addEventListener("click", async () => {
    if (!window.showDirectoryPicker) { setLocalDictTestStatus("当前浏览器不支持文件夹授权。请使用最新版 Chrome。", "error"); return; }
    btnAddLocalDictFolder.disabled=true;
    try {
      const handle=await window.showDirectoryPicker({id:"jijian-local-dictionaries",mode:"read"});
      // Permission must be checked immediately after the picker resolves. Extra
      // storage work before requestPermission can consume Chromium's user gesture.
      const granted=await requestLocalReadPermission(handle);
      // Persist the selected handle even when Chromium leaves it in `prompt`, so
      // the user can recover access later without choosing the folder again.
      await putLocalDirectoryHandle(handle);
      const stored=await chrome.storage.local.get("jijianLocalDictionaryMeta").catch(()=>({}));
      const remembered={...(stored.jijianLocalDictionaryMeta||{}),folderName:handle.name,folderHandleSavedAt:Date.now(),updatedAt:Date.now()};
      await chrome.storage.local.set({jijianLocalDictionaryMeta:remembered});
      renderLocalDictionaries(remembered);
      if(!granted){
        if(localDictStatus) localDictStatus.textContent=`${handle.name} · 已记录 · 待恢复读取授权`;
        setLocalDictTestStatus("文件夹已经保存，不需要重新导入。点击“继续授权”完成读取许可。", "warn");
        return;
      }
      if(localDictStatus) localDictStatus.textContent="正在扫描…";
      setLocalDictTestStatus(`正在扫描“${handle.name}”中的 MDX / MDD / CSS…`);
      const dictionaries=await scanLocalDictionaryFolder(handle);
      renderLocalDictionaries({folderName:handle.name,dictionaries});
      setLocalDictTestStatus(dictionaries.length ? `文件夹“${handle.name}”已接入 ${dictionaries.filter(x=>x.source==="folder").length} 本词典。` : `文件夹“${handle.name}”中没有找到 MDX 文件。`, dictionaries.length ? "success" : "warn");
    } catch(err){
      const message=localDictionaryImportError(err,"无法读取该词典文件夹");
      if(message) setLocalDictTestStatus(message,"error");
    } finally {
      btnAddLocalDictFolder.disabled=false;
    }
  });

  btnRemoveLocalDictFolder?.addEventListener("click", async () => {
    const stored=await chrome.storage.local.get("jijianLocalDictionaryMeta").catch(()=>({}));
    const meta=stored?.jijianLocalDictionaryMeta||{};
    if(!meta.folderName) return;
    if(!confirm(`确定移除词典文件夹“${meta.folderName}”吗？
不会删除电脑上的任何文件。`)) return;
    await deleteLocalHandle("directory").catch(()=>{});
    const remaining=(meta.dictionaries||[]).filter(d=>d.source==="file");
    const next={dictionaries:remaining,updatedAt:Date.now()};
    await chrome.storage.local.set({jijianLocalDictionaryMeta:next});
    renderLocalDictionaries(next);
    setLocalDictTestStatus(remaining.length?"已移除文件夹来源，单文件词典仍保留。":"已移除本地词典文件夹。", "success");
  });



  function syncTypographyModeAvailability() {
    const replace = currentSettings.displayMode === "replace";
    if (!['clean','native'].includes(currentSettings.replaceRenderStyle)) currentSettings.replaceRenderStyle = "clean";
    const activeStyle = activeTypographyRenderStyle();
    syncRenderStyleCardLabels(replace);
    renderStyleCardGrid?.querySelectorAll(".style-choice-card").forEach(card => {
      const off = replace && !["native","classic"].includes(card.dataset.value);
      card.classList.toggle("mode-disabled", off);
      card.hidden = off;
      card.classList.toggle("active", card.dataset.value === activeStyle);
    });
    if (optRenderStyle) optRenderStyle.value = activeStyle;
    syncStyleDependentOptions(activeStyle);
    const nativeTypography = activeStyle === "native";
    translationColorFormItem?.classList.toggle("is-native-locked", nativeTypography);
    translationFontFormItem?.classList.toggle("is-native-locked", nativeTypography);
    typographyMetricsForm?.classList.toggle("is-native-locked", nativeTypography);
    if (typographyNativeHint) typographyNativeHint.hidden = !nativeTypography;
    translationColorGrid?.querySelectorAll("button").forEach(button => {
      button.disabled = nativeTypography;
      button.setAttribute("aria-disabled", nativeTypography ? "true" : "false");
    });
    translationFontCardGrid?.querySelectorAll("button").forEach(button => {
      button.disabled = nativeTypography;
      button.setAttribute("aria-disabled", nativeTypography ? "true" : "false");
    });
    [optFontSizeRange,optSpacingRange,optLineHeightRange].forEach(input => {
      if (!input) return;
      input.disabled = nativeTypography;
      input.setAttribute("aria-disabled", nativeTypography ? "true" : "false");
    });
  }

  function saveSetting(delta) {
    Object.assign(currentSettings, delta || {});
    return sendRuntimeMessage({ action: "UPDATE_SETTINGS", settings: delta });
  }

  function sendRuntimeMessage(msg, timeoutMs = 1200) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
      const timer = setTimeout(() => finish(null), timeoutMs);
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          if (chrome.runtime.lastError) return finish(null);
          finish(res);
        });
      } catch (_) { finish(null); }
    });
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
});
