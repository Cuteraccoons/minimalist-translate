/* Popup controller. */

document.addEventListener("DOMContentLoaded", async () => {
  const manifestVersion = chrome.runtime.getManifest().version;
  const displayVersion = manifestVersion.replace(/\.0$/, "");

  // 视图切换
  const viewMain = document.getElementById("view-main");
  const viewVocab = document.getElementById("view-vocab");
  const viewHighlight = document.getElementById("view-highlight");

  const rowOpenVocabView = document.getElementById("row-open-vocab-view");
  const btnGotoVocabView = document.getElementById("btn-goto-vocab-view");
  const btnBackToMainFromVocab = document.getElementById("btn-back-to-main-from-vocab");

  const rowOpenHighlightView = document.getElementById("row-open-highlight-view");
  const btnGotoHighlightView = document.getElementById("btn-goto-highlight-view");
  const btnBackToMainFromHighlight = document.getElementById("btn-back-to-main-from-highlight");

  const btnTogglePage = document.getElementById("btn-toggle-page");
  const btnToggleText = document.getElementById("btn-toggle-text");
  const btnToggleSidebar = document.getElementById("btn-toggle-sidebar");
  const btnSidebarText = document.getElementById("btn-sidebar-text");
  const btnToggleReader = document.getElementById("btn-toggle-reader");
  const statusDot = document.getElementById("status-dot");
  const btnOpenOptions = document.getElementById("btn-open-options");
  const btnDonate = document.getElementById("btn-donate");

  // 顶部快速查词
  const popupDictInput = document.getElementById("popup-dict-input");
  const btnPopupDictSearch = document.getElementById("btn-popup-dict-search");
  const popupDictResultBox = document.getElementById("popup-dict-result-box");

  // 生词本与高亮收藏
  const labelVocabCount = document.getElementById("label-vocab-count");
  const labelHighlightCount = document.getElementById("label-highlight-count");
  const popupLangFilter = document.getElementById("popup-lang-filter");
  const popupVocabSearch = document.getElementById("popup-vocab-search");
  const popupFullVocabList = document.getElementById("popup-full-vocab-list");
  const popupVocabDetailPage = document.getElementById("popup-vocab-detail-page");
  const popupFullHighlightList = document.getElementById("popup-full-highlight-list");
  const btnPopupExportCsv = document.getElementById("btn-popup-export-csv");
  const btnPopupExportHighlightMd = document.getElementById("btn-popup-export-highlight-md");

  // 引擎与排版
  const controlDisplayMode = document.getElementById("control-display-mode");
  const selectEngine = document.getElementById("select-engine");
  const selectTargetLang = document.getElementById("select-target-lang");
  const selectRenderStyle = document.getElementById("select-render-style");
  const popupTextColorSelect = document.getElementById("popup-text-color-select");
  const popupTextColorTrigger = document.getElementById("popup-text-color-trigger");
  const popupTextColorMenu = document.getElementById("popup-text-color-menu");
  const popupTextColorMeta = {
    black:["#111827","黑色"], slate:["#5f6063","石墨灰"], accent:["#2563eb","蓝色"], green:["#27835d","绿色"],
    purple:["#7c5ac7","紫色"], red:["#b84a4a","红色"], orange:["#b86d24","橙色"], teal:["#207f7a","青色"], brown:["#8a6448","棕色"], inherit:["radial-gradient(circle at center,#fff 0 27%,transparent 30%),conic-gradient(from -30deg,#ff453a,#ffd60a,#30d158,#64d2ff,#0a84ff,#5e5ce6,#bf5af2,#ff375f,#ff453a)","跟随网页"]
  };
  const toggleLocalDictPriority = document.getElementById("toggle-local-dict-priority");
  const btnOpenLocalDict = document.getElementById("btn-open-local-dict");
  const selectFontFamily = document.getElementById("select-font-family");
  const popupStyleDependentOptions = document.getElementById("popup-style-dependent-options");
  const popupHighlightOptions = document.getElementById("popup-highlight-options");
  const popupUnderlineOptions = document.getElementById("popup-underline-options");
  const popupClickOptions = document.getElementById("popup-click-options");
  const paletteBgHighlight = document.getElementById("palette-bg-highlight");
  const popupUnderlinePicker = document.getElementById("popup-underline-picker");
  const popupUnderlineColor = document.getElementById("popup-underline-color");
  const popupClickColor = document.getElementById("popup-click-color");
  const btnFontDec = document.getElementById("btn-font-dec");
  const btnFontInc = document.getElementById("btn-font-inc");
  const labelFontSize = document.getElementById("label-font-size");
  const previewOrigText = document.getElementById("preview-orig-text");
  const previewTransText = document.getElementById("preview-trans-text");

  const selectDictTrigger = document.getElementById("select-dict-trigger");
  const toggleDictEnabled = document.getElementById("toggle-dict-enabled");
  const popupDictTriggerRow = document.getElementById("popup-dict-trigger-row");
  const popupHighlightStyleGrid = document.getElementById("popup-highlight-style-grid");
  const selectDictionaryMode = document.getElementById("select-dictionary-mode");
  const toggleHoverTranslate = document.getElementById("toggle-hover-translate");
  const toggleParagraphActions = document.getElementById("toggle-paragraph-actions");
  const toggleFloatingBall = document.getElementById("toggle-floating-ball");

  // 网站黑名单
  const currentSiteDomain = document.getElementById("current-site-domain");
  const btnToggleBlockSite = document.getElementById("btn-toggle-block-site");
  const siteDockNote = document.getElementById("site-dock-note");
  const popupRenderStyleGrid = document.getElementById("popup-render-style-grid");

  // 弹窗内 API 配置抽屉
  const apiQuickDrawer = document.getElementById("api-quick-drawer");
  const popupApiKey = document.getElementById("popup-api-key");
  const popupApiUrl = document.getElementById("popup-api-url");
  const popupApiModel = document.getElementById("popup-api-model");
  const btnPopupTestApi = document.getElementById("btn-popup-test-api");
  const popupApiStatus = document.getElementById("popup-api-status");
  const popupApiConnectedSummary = document.getElementById("popup-api-connected-summary");
  const popupApiConnectedCopy = document.getElementById("popup-api-connected-copy");
  const btnPopupEditApi = document.getElementById("btn-popup-edit-api");

  let isTranslated = false;
  let isTranslating = false;
  let isSidebarOpen = false;
  let isReaderOpen = false;
  let currentSettings = {};
  let currentVocabList = [];
  let currentHighlightList = [];
  let currentVocabLang = "all";
  let currentVocabQuery = "";
  let vocabLoaded = false;
  let highlightLoaded = false;
  let vocabLoadingPromise = null;
  let highlightLoadingPromise = null;
  let activeHost = "";
  let activePageLangHint = currentSettings.sourceLang || "auto";
  const popupModelPresets={deepseek:['deepseek-v4-flash','deepseek-v4-pro'],openai:['gpt-5.6-luna','gpt-5.6-terra','gpt-5.6-sol','gpt-5.4-mini'],claude:['claude-sonnet-5','claude-opus-5','claude-fable-5','claude-haiku-4-5'],gemini:['gemini-3.6-flash','gemini-3.5-flash','gemini-3.5-flash-lite'],ollama:['qwen2.5:7b','llama3.2:latest','gemma3:4b'],custom:[]};
  let popupModelPicker=null;

  function activePopupRenderStyle(settings = currentSettings) {
    if (settings.displayMode === "replace") return settings.replaceRenderStyle === "native" ? "native" : "classic";
    return settings.renderStyle || "classic";
  }

  function syncUnderlineIndicator(container) {
    if (!container) return;
    const active = container.querySelector(".underline-tab-item.active");
    if (!active) return;
    let indicator = container.querySelector(".underline-tab-indicator");
    if (!indicator) {
      indicator = document.createElement("span");
      indicator.className = "underline-tab-indicator";
      container.appendChild(indicator);
    }
    indicator.style.width = `${active.offsetWidth}px`;
    indicator.style.transform = `translateX(${active.offsetLeft}px)`;
  }

  // 1. 初始化设置
  const settingsRes = await sendRuntimeMessage({ action: "GET_SETTINGS" });
  currentSettings = (settingsRes && settingsRes.settings) ? settingsRes.settings : {};
  initUI(currentSettings);
  enhancePopupSelects();
  enhancePopupModelPicker();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    const delta = {};
    Object.entries(changes || {}).forEach(([key, change]) => { delta[key] = change.newValue; });
    if (!Object.keys(delta).length) return;
    Object.assign(currentSettings, delta);
    initUI(currentSettings);
    document.querySelectorAll("select.apple-select").forEach(select => select.__renderPopupSelect?.());
    refreshPopupModelPicker(selectEngine?.value || currentSettings.translationEngine);
  });

  // 2. 首页只读取收藏数量；完整列表进入对应子视图后再懒加载，避免反复打开 Popup 时创建大量 DOM。
  loadCollectionCounts();

  // 3. 视图切换逻辑
  function switchToVocabView() {
    viewMain.classList.remove("active");
    viewHighlight.classList.remove("active");
    viewVocab.classList.add("active");
    ensurePopupVocabularyLoaded();
  }

  function switchToHighlightView() {
    viewMain.classList.remove("active");
    viewVocab.classList.remove("active");
    viewHighlight.classList.add("active");
    ensurePopupHighlightsLoaded();
  }

  function switchToMainView() {
    viewVocab.classList.remove("active");
    viewHighlight.classList.remove("active");
    viewMain.classList.add("active");
  }

  if (rowOpenVocabView) rowOpenVocabView.addEventListener("click", switchToVocabView);
  if (btnGotoVocabView) btnGotoVocabView.addEventListener("click", (e) => { e.stopPropagation(); switchToVocabView(); });
  if (btnBackToMainFromVocab) btnBackToMainFromVocab.addEventListener("click", switchToMainView);

  if (rowOpenHighlightView) rowOpenHighlightView.addEventListener("click", switchToHighlightView);
  if (btnGotoHighlightView) btnGotoHighlightView.addEventListener("click", (e) => { e.stopPropagation(); switchToHighlightView(); });
  if (btnBackToMainFromHighlight) btnBackToMainFromHighlight.addEventListener("click", switchToMainView);

  // 4. 查询当前标签页状态
  const activeTab = await getActiveTab();
  if (activeTab && activeTab.url) {
    try {
      const urlObj = new URL(activeTab.url);
      activeHost = urlObj.hostname;
      if (currentSiteDomain) currentSiteDomain.textContent = activeHost;

      const isBlocked = (currentSettings.excludeDomainList || []).some(d => activeHost === d || activeHost.endsWith(`.${d}`));
      updateBlockButtonState(isBlocked);
    } catch (_) {}

    if (isRestrictedUrl(activeTab.url)) {
      btnTogglePage.disabled = true;
      btnTogglePage.style.opacity = "0.6";
      btnToggleSidebar.disabled = true;
      btnToggleSidebar.style.opacity = "0.6";
      if (btnToggleReader) {
        btnToggleReader.disabled = true;
        btnToggleReader.style.opacity = "0.6";
      }
    } else {
      chrome.tabs.sendMessage(activeTab.id, { action: "GET_TRANSLATION_STATUS" }, (res) => {
        if (!chrome.runtime.lastError && res) {
          isTranslated = !!res.isTranslated;
          isTranslating = !!res.isTranslating;
          isSidebarOpen = !!res.isSidebarOpen;
          isReaderOpen = !!res.isReaderOpen;
          updateButtonState(isTranslated, isTranslating, isSidebarOpen, res.translatedBlocksCount);
        }
      });
      chrome.tabs.sendMessage(activeTab.id, { action: "GET_PAGE_LANGUAGE_HINT" }, (langRes) => {
        if (!chrome.runtime.lastError && langRes?.lang) activePageLangHint = langRes.lang;
      });
    }
  }

  function updateBlockButtonState(isBlocked) {
    if (!btnToggleBlockSite) return;
    if (isBlocked) {
      btnToggleBlockSite.textContent = "移出黑名单";
      btnToggleBlockSite.classList.add("is-blocked");
    } else {
      btnToggleBlockSite.textContent = "加入黑名单";
      btnToggleBlockSite.classList.remove("is-blocked");
    }
  }

  if (btnToggleBlockSite) {
    btnToggleBlockSite.addEventListener("click", () => {
      if (!activeHost) return;
      let list = currentSettings.excludeDomainList || [];
      const idx = list.findIndex(d => activeHost === d || activeHost.endsWith(`.${d}`));
      const matchedDomain = idx > -1 ? list[idx] : activeHost;
      if (idx > -1) {
        list.splice(idx, 1);
        updateBlockButtonState(false);
      } else {
        list.push(activeHost);
        updateBlockButtonState(true);
      }
      currentSettings.excludeDomainList = list;
      const rules = {...(currentSettings.excludeDomainRules || {})};
      if (idx > -1) {
        delete rules[matchedDomain];
      }
      // 新加入域名保持“继承默认规则”，不在 Popup 写死一份旧配置。
      currentSettings.excludeDomainRules = rules;
      saveSetting({ excludeDomainList: list, excludeDomainRules:rules });
      if (siteDockNote) {
        siteDockNote.textContent = idx > -1 ? "已移出黑名单" : "已加入黑名单，刷新后生效";
        siteDockNote.classList.add("show-note");
        setTimeout(() => siteDockNote.classList.remove("show-note"), 3200);
      }
    });
  }

  // 5. 按钮 1: 网页双语 / 替换翻译 (满宽整行大按钮)
  btnTogglePage.addEventListener("click", async () => {
    const tab = await getActiveTab();
    if (!tab || !tab.id || isRestrictedUrl(tab.url)) return;

    if (statusDot) statusDot.className = "status-dot translating";
    btnToggleText.textContent = isTranslated ? "恢复中..." : "翻译中...";

    trySendMessageWithInjection(tab.id, { action: "TOGGLE_PAGE_TRANSLATION" }, (res) => {
      if (res && res.success) {
        isTranslated = !!res.isTranslated;
        updateButtonState(isTranslated, false, isSidebarOpen);
      } else {
        setTimeout(() => {
          chrome.tabs.sendMessage(tab.id, { action: "GET_TRANSLATION_STATUS" }, (statusRes) => {
            if (statusRes) {
              isTranslated = !!statusRes.isTranslated;
              isSidebarOpen = !!statusRes.isSidebarOpen;
              updateButtonState(isTranslated, !!statusRes.isTranslating, isSidebarOpen, statusRes.translatedBlocksCount);
            }
          });
        }, 300);
      }
    });
  });

  // 6. 按钮 2: 沉浸阅读 (第二行左)
  if (btnToggleReader) {
    btnToggleReader.addEventListener("click", async () => {
      const tab = await getActiveTab();
      if (!tab || !tab.id || isRestrictedUrl(tab.url)) return;
      trySendMessageWithInjection(tab.id, { action: "TOGGLE_READER_MODE" }, (res) => {
        if (res && res.success) {
          isReaderOpen = !!res.isReaderOpen;
        }
      });
      window.close();
    });
  }

  // 7. 按钮 3: 侧边分栏对照 (第二行右)
  btnToggleSidebar.addEventListener("click", async () => {
    const tab = await getActiveTab();
    if (!tab || !tab.id || isRestrictedUrl(tab.url)) return;
    trySendMessageWithInjection(tab.id, { action: "TOGGLE_SIDEBAR_VIEW" }, (res) => {
      if (res && res.success) {
        isSidebarOpen = !!res.isSidebarOpen;
        updateButtonState(isTranslated, isTranslating, isSidebarOpen);
      }
    });
    window.close();
  });

  // 8. 弹窗内快速查词功能
  function stripPopupDictionaryHtml(raw) {
    const holder = document.createElement("div");
    holder.innerHTML = String(raw || "");
    holder.querySelectorAll("script,style,iframe,object,embed,form,button,input,select,textarea,svg").forEach(el => el.remove());
    return (holder.textContent || "").replace(/\s+/g, " ").trim();
  }

  function renderPopupLocalDictionaries(entries) {
    if (!Array.isArray(entries) || !entries.length) return "";
    return `<div class="popup-local-dicts">${entries.slice(0,3).map(entry => {
      const preview = stripPopupDictionaryHtml(entry.html).slice(0,180);
      if (!preview) return "";
      return `<div class="popup-local-dict"><span>${escapeHtml(entry.dictionaryName || "本地词典")}</span><b>${escapeHtml(preview)}${preview.length >= 180 ? "…" : ""}</b></div>`;
    }).join("")}</div>`;
  }

  function splitPopupDictionarySenses(values) {
    const out = [];
    for (const value of values || []) {
      const protectedStops = String(value || "")
        .replace(/\s+/g, " ")
        .replace(/\b(?:e\.g|i\.e|etc|Mr|Mrs|Ms|Dr)\./gi, token => token.replace(/\./g, "\uE000"));
      const parts = protectedStops
        .split(/(?:[；;。]+|\.(?=\s|$))/u)
        .map(part => part.replace(/\uE000/g, "."))
        .map(part => part.trim().replace(/^[,，、:\s]+|[,，、:\s]+$/g, ""))
        .filter(Boolean);
      for (const part of parts) {
        if (!out.some(existing => existing.toLocaleLowerCase() === part.toLocaleLowerCase())) out.push(part);
      }
    }
    return out.slice(0, 5);
  }

  function renderPopupStandardDictionary(d) {
    if (!d) return `<span class="popup-dict-error">未找到词条</span>`;
    const rawMeta = d.phonetic || d.reading || d.pinyin || "";
    const meta = rawMeta && d.phonetic && !/^\/.+\/$/.test(rawMeta) ? `/${rawMeta.replace(/^\/|\/$/g, "")}/` : rawMeta;
    let html = `<div class="popup-dict-wordline"><strong>${escapeHtml(d.lookupForm || d.original || "")}</strong>${meta ? `<span>${escapeHtml(meta)}</span>` : ""}</div>`;
    if (d.isChineseQuery) {
      const nativeDefs = Array.isArray(d.nativeDefinitions) ? d.nativeDefinitions.map(x => typeof x === "string" ? x : x?.text).filter(Boolean).slice(0,4) : [];
      const ja = [d.jaWord || "", d.jaReading || ""].filter(Boolean).join(" · ");
      if (d.dictionaryRedirectedFrom && d.dictionaryResolvedTitle) html += `<div class="popup-dict-redirect">萌典词条 ${escapeHtml(d.dictionaryRedirectedFrom)} → <strong>${escapeHtml(d.dictionaryResolvedTitle)}</strong></div>`;
      html += `<div class="popup-dict-zh-defs">${nativeDefs.length ? nativeDefs.map((x,i)=>`<div><span>${i+1}</span><b>${escapeHtml(x)}</b></div>`).join("") : `<div><span>—</span><b>${escapeHtml(d.translation || "暂未取得中文释义")}</b></div>`}</div>`;
      html += `<div class="popup-dict-cross"><div><span>英文</span><b>${escapeHtml(d.enWord || "")}</b></div>${d.frWord?`<div><span>法文</span><b>${escapeHtml(d.frWord)}</b></div>`:""}${d.deWord?`<div><span>德文</span><b>${escapeHtml(d.deWord)}</b></div>`:""}<div><span>日文</span><b>${escapeHtml(ja)}</b></div></div>`;
    } else {
      const groups = Array.isArray(d.senseGroups) && d.senseGroups.length ? d.senseGroups : (Array.isArray(d.definitions) ? d.definitions.map(g=>({pos:g.pos,senses:(g.terms||[]).map(x=>({zh:x,en:""}))})) : []);
      if (groups.length) {
        html += `<div class="popup-dict-senses">` + groups.slice(0,3).map(g => { const vals=splitPopupDictionarySenses((g.senses||[]).map(x=>x.zh||x.en)); return vals.length ? `<div><span>${escapeHtml(g.pos||"释义")}</span><b class="popup-dict-sense-list">${vals.map((value,index)=>`<i><em>${index+1}</em>${escapeHtml(value)}</i>`).join("")}</b></div>` : ""; }).join("") + `</div>`;
      } else if (d.translation) html += `<div class="popup-dict-translation">${escapeHtml(d.translation)}</div>`;
    }
    html += renderPopupLocalDictionaries(d.localDictionaryEntries);
    return html;
  }

  function renderPopupAiDictionary(raw, fallbackWord) {
    try {
      const clean=String(raw||"").trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");
      const d=JSON.parse(clean); const brief=Array.isArray(d.brief)?d.brief:[];
      let html=`<div class="popup-dict-wordline"><strong>${escapeHtml(d.headword||fallbackWord)}</strong>${d.phonetic||d.reading?`<span>${escapeHtml(d.phonetic||d.reading)}</span>`:""}</div><div class="popup-dict-senses">`;
      brief.slice(0,3).forEach(g=>{const meanings=Array.isArray(g.meanings)?g.meanings.slice(0,4):[];if(meanings.length)html+=`<div><span>${escapeHtml(g.pos||"释义")}</span><b>${escapeHtml(meanings.join("；"))}</b></div>`;});
      return html+`</div>`;
    } catch(_) { return `<span class="popup-dict-error">AI 没有返回可解析的词典结构</span>`; }
  }

  function executeDictSearch() {
    // Pasted selections often contain their sentence punctuation. It is not
    // part of a dictionary headword and previously caused avoidable misses.
    const word = popupDictInput.value.trim().replace(/^[,.;:!?，。；：！？、\s]+|[,.;:!?，。；：！？、\s]+$/g, "");
    if (!word) return;
    popupDictResultBox.style.display = "block";
    popupDictResultBox.innerHTML = `<span class="popup-dict-loading">正在查询词典…</span>`;

    let searchLang = currentSettings.sourceLang || "auto";
    if (/^[a-zA-Z][a-zA-Z\s'’-]*$/.test(word)) searchLang = activePageLangHint === "ja" ? "ja" : "en";
    else if (/[\u3040-\u30ff\u31f0-\u31ff]/.test(word)) searchLang = "ja";
    else if (/[\u3400-\u9fff]/.test(word) && activePageLangHint === "ja") searchLang = "ja";

    if (currentSettings.enableDictionaryAi !== false && currentSettings.dictionaryLookupMode === "ai") {
      chrome.runtime.sendMessage({action:"LOOKUP_AI_DEEP_DICT",text:word,context:"",sl:searchLang,mode:"word_json"}, res => {
        popupDictResultBox.innerHTML = res?.success ? renderPopupAiDictionary(res.markdown,word) : `<span class="popup-dict-error">${escapeHtml(res?.error || "AI 查词不可用，请先配置 API")}</span>`;
      });
      return;
    }
    chrome.runtime.sendMessage({ action:"LOOKUP_DICTIONARY", text:word, sl:searchLang, tl:currentSettings.targetLang || "zh-CN" }, res => {
      popupDictResultBox.innerHTML = res?.success && res.data ? renderPopupStandardDictionary(res.data) : `<span class="popup-dict-error">查询未果，请检查网络</span>`;
    });
  }

  btnPopupDictSearch.addEventListener("click", executeDictSearch);
  popupDictInput.addEventListener("keydown", (e) => { if (e.key === "Enter") executeDictSearch(); });

  // 9. 模式切换 (双语对照 vs 替换原文)
  bindSegmentedControl(controlDisplayMode, (val) => {
    currentSettings.displayMode = val;
    syncPopupRenderModeAvailability();
    saveSetting({ displayMode: val });
    updateButtonState(isTranslated, isTranslating, isSidebarOpen);
    updateLiveCardPreview();
  });

  // 10. 引擎切换与弹窗内 API 配置
  selectEngine.addEventListener("change", (e) => {
    const eng = e.target.value;
    currentSettings.translationEngine = eng;
    saveSetting({ translationEngine: eng });
    updateApiDrawer(eng);
  });

  function getEngineModelLabel(eng) {
    if (eng === "deepseek") return currentSettings.deepseekModel || "deepseek-v4-flash";
    if (eng === "openai") return currentSettings.openaiModel || "gpt-5.6-luna";
    if (eng === "claude") return currentSettings.claudeModel || "claude-sonnet-5";
    if (eng === "gemini") return currentSettings.geminiModel || "gemini-3.6-flash";
    if (eng === "ollama") return currentSettings.ollamaModel || "qwen2.5:7b";
    if (eng === "custom") return currentSettings.customModel || "自定义模型";
    if (eng === "deepl") return "DeepL API";
    return "";
  }

  function setQuickDrawerConnected(eng, connected) {
    if (!apiQuickDrawer) return;
    apiQuickDrawer.classList.toggle("is-connected", !!connected);
    if (popupApiConnectedSummary) popupApiConnectedSummary.style.display = connected ? "flex" : "none";
    if (popupApiConnectedCopy && connected) popupApiConnectedCopy.textContent = `已连接 · ${getEngineModelLabel(eng)}`;
  }

  function updateApiDrawer(eng, forceEdit = false) {
    if (eng === "google") {
      apiQuickDrawer.style.display = "none";
      return;
    }

    apiQuickDrawer.style.display = "flex";
    popupApiStatus.textContent = "";
    popupApiKey.style.display = "block";
    popupApiUrl.style.display = "block";
    popupApiModel.style.display = "block";

    if (eng === "deepseek") {
      popupApiKey.value = currentSettings.deepseekApiKey || "";
      popupApiKey.placeholder = "DeepSeek API Key (sk-...)";
      popupApiUrl.value = currentSettings.deepseekBaseUrl || "https://api.deepseek.com/v1";
      popupApiModel.value = currentSettings.deepseekModel || "deepseek-v4-flash";
    } else if (eng === "deepl") {
      popupApiKey.value = currentSettings.deeplAuthKey || "";
      popupApiKey.placeholder = "DeepL API 密钥 (Auth Key)";
      popupApiUrl.style.display = "none";
      popupApiModel.style.display = "none";
    } else if (eng === "openai") {
      popupApiKey.value = currentSettings.openaiApiKey || "";
      popupApiKey.placeholder = "OpenAI API Key (sk-...)";
      popupApiUrl.value = currentSettings.openaiBaseUrl || "https://api.openai.com/v1";
      popupApiModel.value = currentSettings.openaiModel || "gpt-5.6-luna";
    } else if (eng === "claude") {
      popupApiKey.value = currentSettings.claudeApiKey || "";
      popupApiKey.placeholder = "Claude API Key (sk-ant-...)";
      popupApiUrl.value = currentSettings.claudeBaseUrl || "https://api.anthropic.com";
      popupApiModel.value = currentSettings.claudeModel || "claude-sonnet-5";
    } else if (eng === "gemini") {
      popupApiKey.value = currentSettings.geminiApiKey || "";
      popupApiKey.placeholder = "Gemini API Key (AIzaSy...)";
      popupApiUrl.style.display = "none";
      popupApiModel.value = currentSettings.geminiModel || "gemini-3.6-flash";
    } else if (eng === "ollama") {
      popupApiKey.style.display = "none";
      popupApiUrl.value = currentSettings.ollamaBaseUrl || "http://localhost:11434";
      popupApiModel.value = currentSettings.ollamaModel || "qwen2.5:7b";
    } else if (eng === "custom") {
      popupApiKey.value = currentSettings.customApiKey || "";
      popupApiKey.placeholder = "API Key";
      popupApiUrl.value = currentSettings.customBaseUrl || "";
      popupApiUrl.placeholder = "Base URL";
      popupApiModel.value = currentSettings.customModel || "";
    }

    refreshPopupModelPicker(eng);
    const verified = !!(currentSettings.verifiedEngines && currentSettings.verifiedEngines[eng]);
    setQuickDrawerConnected(eng, verified && !forceEdit);
  }

  [popupApiKey, popupApiUrl, popupApiModel].forEach(input => {
    input.addEventListener("input", () => {
      const eng = selectEngine.value;
      const delta = {};
      if (eng === "deepseek") {
        delta.deepseekApiKey = popupApiKey.value.trim();
        delta.deepseekBaseUrl = popupApiUrl.value.trim();
        delta.deepseekModel = popupApiModel.value.trim();
      } else if (eng === "deepl") {
        delta.deeplAuthKey = popupApiKey.value.trim();
      } else if (eng === "openai") {
        delta.openaiApiKey = popupApiKey.value.trim();
        delta.openaiBaseUrl = popupApiUrl.value.trim();
        delta.openaiModel = popupApiModel.value.trim();
      } else if (eng === "claude") {
        delta.claudeApiKey = popupApiKey.value.trim();
        delta.claudeBaseUrl = popupApiUrl.value.trim();
        delta.claudeModel = popupApiModel.value.trim();
      } else if (eng === "gemini") {
        delta.geminiApiKey = popupApiKey.value.trim();
        delta.geminiModel = popupApiModel.value.trim();
      } else if (eng === "ollama") {
        delta.ollamaBaseUrl = popupApiUrl.value.trim();
        delta.ollamaModel = popupApiModel.value.trim();
      } else if (eng === "custom") {
        delta.customApiKey = popupApiKey.value.trim();
        delta.customBaseUrl = popupApiUrl.value.trim();
        delta.customModel = popupApiModel.value.trim();
      }
      const verifiedEngines = Object.assign({}, currentSettings.verifiedEngines || {});
      verifiedEngines[eng] = false;
      delta.verifiedEngines = verifiedEngines;
      Object.assign(currentSettings, delta);
      setQuickDrawerConnected(eng, false);
      saveSetting(delta);
    });
  });

  btnPopupTestApi.addEventListener("click", async () => {
    const eng = selectEngine.value;
    popupApiStatus.className = "drawer-test-status loading";
    popupApiStatus.textContent = "测试中...";

    const testRes = await sendRuntimeMessage({
      action: "TEST_API_CONNECTION",
      settings: Object.assign({}, currentSettings, { translationEngine: eng })
    }, 20000);

    if (testRes && testRes.success) {
      popupApiStatus.className = "drawer-test-status success";
      popupApiStatus.textContent = "连通成功";
      const verifiedEngines = Object.assign({}, currentSettings.verifiedEngines || {});
      verifiedEngines[eng] = true;
      currentSettings.verifiedEngines = verifiedEngines;
      saveSetting({ verifiedEngines });
      setQuickDrawerConnected(eng, true);
    } else {
      popupApiStatus.className = "drawer-test-status error";
      popupApiStatus.textContent = `失败: ${testRes ? testRes.error : "未响应"}`;
    }
  });

  if (btnPopupEditApi) {
    btnPopupEditApi.addEventListener("click", () => updateApiDrawer(selectEngine.value, true));
  }

  // 11. 生词本弹窗子视图管理与纯平下划线导航栏 (Underline Tab Bar)
  async function loadCollectionCounts() {
    const res = await sendRuntimeMessage({ action: "GET_COLLECTION_COUNTS" });
    if (!res?.success) return;
    if (labelVocabCount) labelVocabCount.textContent = `${Number(res.vocabularyCount || 0)} 个生词`;
    if (labelHighlightCount) labelHighlightCount.textContent = `${Number(res.highlightCount || 0)} 条高亮`;
  }

  function ensurePopupVocabularyLoaded() {
    if (vocabLoaded) { filterAndRenderPopupVocab(); return Promise.resolve(); }
    if (vocabLoadingPromise) return vocabLoadingPromise;
    if (popupFullVocabList) popupFullVocabList.innerHTML = `<div class="vocab-empty-mini popup-vocab-empty">正在加载生词本…</div>`;
    vocabLoadingPromise = loadPopupVocabulary().finally(() => { vocabLoadingPromise = null; });
    return vocabLoadingPromise;
  }

  function ensurePopupHighlightsLoaded() {
    if (highlightLoaded) { renderPopupHighlights(); return Promise.resolve(); }
    if (highlightLoadingPromise) return highlightLoadingPromise;
    if (popupFullHighlightList) popupFullHighlightList.innerHTML = `<div class="vocab-empty-mini">正在加载高亮收藏…</div>`;
    highlightLoadingPromise = loadPopupHighlights().finally(() => { highlightLoadingPromise = null; });
    return highlightLoadingPromise;
  }

  async function loadPopupVocabulary() {
    closePopupVocabDetail();
    const vRes = await sendRuntimeMessage({ action: "GET_VOCABULARY" }, 5000);
    currentVocabList = (vRes && Array.isArray(vRes.list)) ? vRes.list : [];
    vocabLoaded = true;
    if (labelVocabCount) labelVocabCount.textContent = `${currentVocabList.length} 个生词`;
    if (viewVocab?.classList.contains("active")) filterAndRenderPopupVocab();
  }

  if (popupLangFilter) {
    popupLangFilter.addEventListener("change", () => {
      currentVocabLang = popupLangFilter.value || "all";
      filterAndRenderPopupVocab();
    });
  }

  if (popupVocabSearch) {
    popupVocabSearch.addEventListener("input", () => {
      currentVocabQuery = String(popupVocabSearch.value || "").trim().toLowerCase();
      filterAndRenderPopupVocab();
    });
  }

  function closePopupVocabDetail() {
    if (!popupVocabDetailPage) return;
    popupVocabDetailPage.hidden = true;
    popupVocabDetailPage.innerHTML = "";
    popupFullVocabList.hidden = false;
    document.querySelector(".popup-vocab-filter-row")?.removeAttribute("hidden");
  }

  function openPopupVocabDetail(item) {
    if (!popupVocabDetailPage || !popupFullVocabList || !item) return;
    const rawLang = String(item.lang || "other").toLowerCase();
    const lang = rawLang.startsWith("zh") ? "zh" : rawLang.split("-")[0];
    const langLabel = ({zh:"中文",en:"英语",ja:"日语",ko:"韩语",fr:"法语",de:"德语",es:"西班牙语",ru:"俄语"})[lang] || "其他";
    const standardDetails = Array.isArray(item.definitions)
      ? item.definitions.flatMap(d => Array.isArray(d.terms) ? d.terms : (Array.isArray(d.senses) ? d.senses.map(x => x.zh || x.en) : [])).filter(Boolean).slice(0,12)
      : [];
    const localDetails = Array.isArray(item.localDictionarySummary) ? item.localDictionarySummary.filter(x=>x?.text).slice(0,6) : [];
    popupFullVocabList.hidden = true;
    document.querySelector(".popup-vocab-filter-row")?.setAttribute("hidden", "");
    popupVocabDetailPage.hidden = false;
    popupVocabDetailPage.innerHTML = `<button type="button" class="popup-vocab-detail-back"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg><span>生词本</span></button>
      <div class="popup-vocab-detail-head"><div><div class="popup-vocab-detail-word">${escapeHtml(item.word || "")}</div>${item.phonetic ? `<div class="popup-vocab-detail-phonetic">${escapeHtml(item.phonetic)}</div>` : ""}</div><span class="popup-vocab-detail-lang">${langLabel}</span></div>
      <div class="popup-vocab-detail-translation">${escapeHtml(item.translation || "暂无简明释义")}</div>
      ${standardDetails.length ? `<section><h4>词典释义</h4>${standardDetails.map((x,i)=>`<div class="popup-vocab-detail-sense"><span>${i+1}</span><p>${escapeHtml(x)}</p></div>`).join("")}</section>` : ""}
      ${localDetails.length ? `<section><h4>本地词典</h4>${localDetails.map(x=>`<div class="popup-vocab-local-block"><b>${escapeHtml(x.name || "本地词典")}</b><p>${escapeHtml(x.text || "")}</p></div>`).join("")}</section>` : ""}`;
    popupVocabDetailPage.querySelector(".popup-vocab-detail-back")?.addEventListener("click", closePopupVocabDetail);
  }

  function filterAndRenderPopupVocab() {
    if (!popupFullVocabList) return;
    let list = currentVocabList;

    if (currentVocabLang !== "all") {
      list = list.filter(item => { const l=String(item.lang||"other").toLowerCase(); const n=l.startsWith("zh")?"zh":l.split("-")[0]; return (['zh','en','ja','ko','fr','de','es','ru'].includes(n)?n:'other') === currentVocabLang; });
    }
    if (currentVocabQuery) {
      list = list.filter(item => {
        const standard = Array.isArray(item.definitions) ? item.definitions.flatMap(d => Array.isArray(d.terms) ? d.terms : (Array.isArray(d.senses) ? d.senses.map(x => x.zh || x.en) : [])) : [];
        const local = Array.isArray(item.localDictionarySummary) ? item.localDictionarySummary.flatMap(x => [x?.name, x?.text]) : [];
        return [item.word,item.phonetic,item.translation,item.sourceName,...standard,...local].filter(Boolean).join(" ").toLowerCase().includes(currentVocabQuery);
      });
    }

    if (list.length === 0) {
      popupFullVocabList.innerHTML = `<div class="vocab-empty-mini popup-vocab-empty">没有符合当前筛选的生词。</div>`;
      return;
    }

    popupFullVocabList.innerHTML = list.map(item => {
      const rawLang = String(item.lang || "other").toLowerCase();
      const lang = rawLang.startsWith("zh") ? "zh" : rawLang.split("-")[0];
      const langLabel = ({zh:"中文",en:"英语",ja:"日语",ko:"韩语",fr:"法语",de:"德语",es:"西班牙语",ru:"俄语"})[lang] || "其他";
      const idx = currentVocabList.indexOf(item);
      const source = String(item.sourceName || "").trim();
      return `
        <article class="popup-vocab-card" data-popup-vocab-index="${idx}" tabindex="0" role="button" aria-label="查看 ${escapeHtml(item.word)}">
          <div class="popup-vocab-card-top">
            <div class="popup-vocab-word-wrap"><span class="vocab-word-bold">${escapeHtml(item.word)}</span>${item.phonetic ? `<span class="vocab-phonetic-sub">${escapeHtml(item.phonetic)}</span>` : ""}</div>
            <span class="popup-vocab-lang">${langLabel}</span>
          </div>
          <div class="vocab-trans-sub">${escapeHtml(item.translation || "暂无简明释义")}</div>
          ${source ? `<div class="vocab-source-sub">来源 ${escapeHtml(source)}</div>` : ""}
          <button class="vocab-del-btn popup-vocab-delete" data-word="${escapeHtml(item.word)}" data-lang="${escapeHtml(item.lang || "other")}" title="删除" aria-label="删除 ${escapeHtml(item.word)}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </article>`;
    }).join("");

    popupFullVocabList.querySelectorAll(".popup-vocab-card[data-popup-vocab-index]").forEach(row => {
      const open = (e) => {
        if (e?.target?.closest?.(".vocab-del-btn")) return;
        const item = currentVocabList[Number(row.dataset.popupVocabIndex || 0)];
        if (item) openPopupVocabDetail(item);
      };
      row.addEventListener("click", open);
      row.addEventListener("keydown", e => { if(e.key === "Enter" || e.key === " "){ e.preventDefault(); open(e); } });
    });

    popupFullVocabList.querySelectorAll(".vocab-del-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const w = btn.getAttribute("data-word");
        const lang = btn.getAttribute("data-lang") || undefined;
        if (!confirm(`确定从生词本删除「${w}」吗？`)) return;
        await sendRuntimeMessage({ action: "REMOVE_VOCABULARY", word: w, lang });
        loadPopupVocabulary();
      });
    });
  }

  btnPopupExportCsv.addEventListener("click", async () => {
    await ensurePopupVocabularyLoaded();
    if (!currentVocabList.length) {
      alert("生词本为空，无需导出");
      return;
    }
    let csv = "Word,Language,Phonetic,Translation,Date\n";
    currentVocabList.forEach(i => {
      csv += `"${(i.word || "").replace(/"/g, '""')}","${i.lang || "en"}","${(i.phonetic || "").replace(/"/g, '""')}","${(i.translation || "").replace(/"/g, '""')}","${i.date || ""}"\n`;
    });
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jijian-translate-vocabulary-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // 12. 高亮收藏按文章与网站分类管理
  async function loadPopupHighlights() {
    const hRes = await sendRuntimeMessage({ action: "GET_HIGHLIGHT_SENTENCES" }, 5000);
    currentHighlightList = (hRes && Array.isArray(hRes.list)) ? hRes.list : [];
    highlightLoaded = true;
    if (labelHighlightCount) labelHighlightCount.textContent = `${currentHighlightList.length} 条高亮`;
    if (viewHighlight?.classList.contains("active")) renderPopupHighlights();
  }

  function renderPopupHighlights() {
    if (!popupFullHighlightList) return;
    if (currentHighlightList.length === 0) {
      popupFullHighlightList.innerHTML = `<div class="vocab-empty-mini">暂无高亮记录，在悬停段落或阅读模式中点击「高亮」即可收录</div>`;
      return;
    }

    const groups = {};
    currentHighlightList.forEach(item => {
      const key = item.sourceUrl || item.title || "其他网页";
      if (!groups[key]) {
        let domain = "web";
        try { if (item.sourceUrl) domain = new URL(item.sourceUrl).hostname.replace(/^www\./, ""); } catch (_) {}
        groups[key] = { title: item.title || "网页文章", url: item.sourceUrl || "#", domain, items: [] };
      }
      groups[key].items.push(item);
    });

    popupFullHighlightList.innerHTML = Object.values(groups).map(g => `
      <section class="popup-highlight-group">
        <header class="popup-highlight-group-head">
          <div class="popup-highlight-group-copy">
            <div class="popup-highlight-group-title">${escapeHtml(g.title)}</div>
            <div class="popup-highlight-group-domain">${escapeHtml(g.domain)} · ${g.items.length} 条</div>
          </div>
        </header>
        <div class="popup-highlight-items">
          ${g.items.map(item => `
            <article class="popup-highlight-row">
              <button class="vocab-del-btn popup-highlight-delete" data-hl-id="${escapeHtml(item.id)}" title="删除" aria-label="删除这条高亮">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
              <div class="popup-highlight-original">${escapeHtml(item.orig)}</div>
              ${item.trans ? `<div class="popup-highlight-translation">${escapeHtml(item.trans)}</div>` : ""}
              <div class="popup-highlight-date">${escapeHtml(item.date || "")}</div>
            </article>`).join("")}
        </div>
      </section>`).join("");

    popupFullHighlightList.querySelectorAll(".vocab-del-btn").forEach(btn => {
      btn.addEventListener("click", async () => {
        const id = btn.getAttribute("data-hl-id");
        if (!confirm("确定删除这条高亮收藏吗？")) return;
        await sendRuntimeMessage({ action: "REMOVE_HIGHLIGHT_SENTENCE", id });
        await loadPopupHighlights();
        renderPopupHighlights();
      });
    });
  }

  btnPopupExportHighlightMd.addEventListener("click", async () => {
    await ensurePopupHighlightsLoaded();
    if (!currentHighlightList.length) {
      alert("高亮列表为空，无需导出");
      return;
    }

    const groups = {};
    currentHighlightList.forEach(item => {
      const key = item.sourceUrl || item.title || "其他网页";
      if (!groups[key]) {
        groups[key] = { title: item.title || "网页文章", url: item.sourceUrl || "#", items: [] };
      }
      groups[key].items.push(item);
    });

    let md = `# 极简翻译 · 高亮收藏\n导出时间: ${new Date().toLocaleString()}\n\n---\n\n`;
    Object.values(groups).forEach(g => {
      md += `## 📑 [${g.title}](${g.url})\n\n`;
      g.items.forEach((item, idx) => {
        md += `### ${idx + 1}. 高亮摘录\n`;
        md += `> **原文 (Original)**:\n> ${item.orig}\n\n`;
        md += `**译文 (Translation)**:\n${item.trans}\n\n`;
        md += `*收藏日期: ${item.date}*\n\n`;
      });
      md += `---\n\n`;
    });

    const blob = new Blob([md], { type: "text/markdown;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jijian-translate-highlight-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // 13. 字号 A- / A+ 步进器
  btnFontDec.addEventListener("click", () => {
    let curr = parseInt(currentSettings.fontSizeRatio, 10) || 100;
    if (curr > 80) {
      curr -= 5;
      currentSettings.fontSizeRatio = String(curr);
      labelFontSize.textContent = `${curr}%`;
      saveSetting({ fontSizeRatio: String(curr) });
      updateLiveCardPreview();
    }
  });

  btnFontInc.addEventListener("click", () => {
    let curr = parseInt(currentSettings.fontSizeRatio, 10) || 100;
    if (curr < 140) {
      curr += 5;
      currentSettings.fontSizeRatio = String(curr);
      labelFontSize.textContent = `${curr}%`;
      saveSetting({ fontSizeRatio: String(curr) });
      updateLiveCardPreview();
    }
  });

  // 14. 排版样式与实时大卡片演示
  function syncPopupRenderStyleGrid(value) {
    popupRenderStyleGrid?.querySelectorAll("button[data-value]").forEach(btn => btn.classList.toggle("active", btn.dataset.value === value));
  }
  function syncPopupStyleDependentOptions(value) {
    if (popupHighlightOptions) popupHighlightOptions.hidden = value !== "highlight";
    if (popupUnderlineOptions) popupUnderlineOptions.hidden = value !== "underline";
    if (popupClickOptions) popupClickOptions.hidden = value !== "click-reveal";
    popupStyleDependentOptions?.classList.toggle("has-option", ["highlight","underline","click-reveal"].includes(value));
  }
  popupRenderStyleGrid?.querySelectorAll("button[data-value]").forEach(btn => btn.addEventListener("click", () => {
    selectRenderStyle.value = btn.dataset.value;
    selectRenderStyle.dispatchEvent(new Event("change", { bubbles:true }));
  }));
  selectRenderStyle.addEventListener("change", (e) => {
    const replace = currentSettings.displayMode === "replace";
    const activeValue = replace ? (e.target.value === "native" ? "native" : "classic") : e.target.value;
    if (replace) currentSettings.replaceRenderStyle = activeValue === "native" ? "native" : "clean";
    else currentSettings.renderStyle = activeValue;
    currentSettings.fontStyle = replace ? "normal" : (activeValue === "italic" ? "italic" : "normal");
    syncPopupRenderModeAvailability();
    if (replace) saveSetting({ replaceRenderStyle:currentSettings.replaceRenderStyle, fontStyle:"normal" });
    else saveSetting({ renderStyle:activeValue, fontStyle:currentSettings.fontStyle });
    updateLiveCardPreview();
  });

  selectFontFamily.addEventListener("change", (e) => {
    currentSettings.fontFamily = e.target.value;
    saveSetting({ fontFamily: e.target.value });
    updateLiveCardPreview();
  });

  paletteBgHighlight.querySelectorAll(".color-dot").forEach((dot) => {
    dot.addEventListener("click", () => {
      paletteBgHighlight.querySelectorAll(".color-dot").forEach(d => d.classList.remove("active"));
      dot.classList.add("active");
      currentSettings.bgHighlight = dot.getAttribute("data-value");
      saveSetting({ bgHighlight: dot.getAttribute("data-value") });
      updateLiveCardPreview();
    });
  });

  popupUnderlinePicker?.querySelectorAll("button[data-value]").forEach(btn => btn.addEventListener("click", () => {
    const value = btn.dataset.value || "solid";
    currentSettings.underlineStyle = value;
    popupUnderlinePicker.querySelectorAll("button[data-value]").forEach(x => x.classList.toggle("active", x === btn));
    saveSetting({ underlineStyle:value });
    updateLiveCardPreview();
  }));
  popupUnderlineColor?.addEventListener("change", () => {
    currentSettings.underlineColor = popupUnderlineColor.value || "accent";
    saveSetting({ underlineColor:currentSettings.underlineColor });
    updateLiveCardPreview();
  });
  popupClickColor?.addEventListener("change", () => {
    currentSettings.clickRevealColor = popupClickColor.value || "charcoal";
    saveSetting({ clickRevealColor:currentSettings.clickRevealColor });
    updateLiveCardPreview();
  });

  function updateLiveCardPreview() {
    if (!previewTransText) return;
    const isReplace = currentSettings.displayMode === "replace";
    if (previewOrigText) {
      previewOrigText.style.display = isReplace ? "none" : "block";
    }

    const style = activePopupRenderStyle();

    syncPopupStyleDependentOptions(style);

    previewTransText.style.fontStyle = !isReplace && style === "italic" ? "italic" : "normal";
    previewTransText.style.backgroundColor = "transparent";
    previewTransText.style.borderBottom = "none";
    previewTransText.style.textDecoration = "none";
    previewTransText.style.borderLeft = "none";
    previewTransText.style.padding = "2px 0";
    previewTransText.style.opacity = "1";
    previewTransText.style.filter = "none";

    const ratio = (parseInt(currentSettings.fontSizeRatio, 10) || 100) / 100;
    previewTransText.style.fontSize = `${ratio * 12.5}px`;

    let fontFam = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Microsoft YaHei", sans-serif';
    if (currentSettings.fontFamily === "pingfang") fontFam = '"PingFang SC", "Heiti SC", sans-serif';
    else if (currentSettings.fontFamily === "kinghwa-song") fontFam = '"KingHwa_OldSong", "KingHwa OldSong", "STSong", "Songti SC", "SimSun", serif';
    else if (currentSettings.fontFamily === "source-serif") fontFam = '"Source Han Serif SC", "Songti SC", serif';
    else if (currentSettings.fontFamily === "source-sans") fontFam = '"Source Han Sans SC", "PingFang SC", sans-serif';
    else if (currentSettings.fontFamily === "lxgw-wenkai") fontFam = '"LXGW WenKai", "Kaiti SC", serif';
    else if (currentSettings.fontFamily === "smiley-sans") fontFam = '"Smiley Sans", "PingFang SC", sans-serif';
    else if (currentSettings.fontFamily === "fangsong") fontFam = '"FangSong", "STFangsong", "仿宋", serif';
    else if (currentSettings.fontFamily === "kaiti") fontFam = '"Kaiti SC", "STKaiti", serif';
    else if (currentSettings.fontFamily === "yuanti") fontFam = '"Yuanti SC", "STYuanti", sans-serif';
    else if (currentSettings.fontFamily === "georgia") fontFam = 'Georgia, "Times New Roman", serif';
    else if (currentSettings.fontFamily === "garamond") fontFam = '"EB Garamond", Garamond, serif';
    previewTransText.style.fontFamily = fontFam;
    const colorMap={black:"#111827",slate:"#5f6063",accent:"#2563eb",green:"#27835d",purple:"#7c5ac7",red:"#b84a4a",orange:"#b86d24",teal:"#207f7a",brown:"#8a6448",inherit:"inherit"}; previewTransText.style.color=colorMap[currentSettings.textColor||"black"]||"#111827";

    if (style === "native") {
      previewTransText.style.color = "inherit";
      previewTransText.style.fontFamily = "inherit";
      previewTransText.style.fontStyle = "normal";
      previewTransText.style.fontSize = "12.5px";
      previewTransText.style.opacity = "0.72";
    } else if (style === "highlight") {
      let bg = "#fef08a";
      if (currentSettings.bgHighlight === "soft-green") bg = "#bbf7d0";
      if (currentSettings.bgHighlight === "soft-purple") bg = "#e9d5ff";
      if (currentSettings.bgHighlight === "soft-orange") bg = "#fed7aa";
      if (currentSettings.bgHighlight === "soft-blue") bg = "#bfdbfe";
      if (currentSettings.bgHighlight === "none") bg = "transparent";
      previewTransText.style.backgroundColor = bg;
      previewTransText.style.padding = "2px 4px";
      previewTransText.style.borderRadius = "3px";
    } else if (style === "underline") {
      const underlineColors={accent:"#3b82f6",slate:"#64748b",green:"#2f855a",purple:"#7c5ac7",red:"#b84a4a",inherit:"currentColor"};
      previewTransText.style.textDecoration = `underline ${currentSettings.underlineStyle || "solid"} ${underlineColors[currentSettings.underlineColor || "accent"] || "#3b82f6"}`;
      previewTransText.style.textUnderlineOffset = "3px";
    } else if (style === "left-bar") {
      previewTransText.style.borderLeft = "3.5px solid #0071e3";
      previewTransText.style.paddingLeft = "8px";
      previewTransText.style.backgroundColor = "rgba(0, 113, 227, 0.05)";
    } else if (style === "hover-reveal") {
      previewTransText.style.opacity = "0.35";
    } else if (style === "blur-reveal") {
      previewTransText.style.filter = "blur(3px)";
      previewTransText.style.opacity = "0.68";
    } else if (style === "click-reveal") {
      const revealColors={charcoal:"#25282d",slate:"#46515f",navy:"#2f4057",forest:"#365247",plum:"#51415b",brown:"#5b4a3d"};
      previewTransText.style.backgroundColor = revealColors[currentSettings.clickRevealColor || "charcoal"] || "#25282d";
      previewTransText.style.color = "transparent";
      previewTransText.style.borderRadius = "3px";
      previewTransText.style.padding = "2px 4px";
    }
  }

  selectTargetLang.addEventListener("change", (e) => saveSetting({ targetLang: e.target.value }));
  function syncPopupDictTrigger(mode) {
    const actual = mode || "none";
    if (selectDictTrigger) selectDictTrigger.value = actual;
    if (toggleDictEnabled) toggleDictEnabled.checked = actual !== "none";
    popupDictTriggerRow?.querySelectorAll("button[data-value]").forEach(btn => {
      btn.classList.toggle("active", actual !== "none" && btn.dataset.value === actual);
      btn.disabled = actual === "none";
    });
    popupDictTriggerRow?.classList.toggle("is-disabled", actual === "none");
  }

  selectDictTrigger?.addEventListener("change", (e) => {
    const value = e.target.value;
    currentSettings.dictTriggerMode = value;
    if (value !== "none") currentSettings.dictTriggerLastMode = value;
    syncPopupDictTrigger(value);
    saveSetting({ dictTriggerMode:value, ...(value !== "none" ? {dictTriggerLastMode:value} : {}) });
  });
  toggleDictEnabled?.addEventListener("change", (e) => {
    const enabled = !!e.target.checked;
    const next = enabled ? (currentSettings.dictTriggerLastMode || (currentSettings.dictTriggerMode !== "none" ? currentSettings.dictTriggerMode : "both") || "both") : "none";
    currentSettings.dictTriggerMode = next;
    if (enabled) currentSettings.dictTriggerLastMode = next;
    syncPopupDictTrigger(next);
    saveSetting({dictTriggerMode:next, ...(enabled ? {dictTriggerLastMode:next} : {})});
  });
  popupDictTriggerRow?.querySelectorAll("button[data-value]").forEach(btn => btn.addEventListener("click", () => {
    if (!toggleDictEnabled?.checked) return;
    const value = btn.dataset.value || "both";
    currentSettings.dictTriggerMode = value;
    currentSettings.dictTriggerLastMode = value;
    syncPopupDictTrigger(value);
    saveSetting({dictTriggerMode:value, dictTriggerLastMode:value});
  }));

  function syncPopupHighlightStyle(value) {
    popupHighlightStyleGrid?.querySelectorAll("button[data-value]").forEach(btn => btn.classList.toggle("active", btn.dataset.value === value));
  }
  popupHighlightStyleGrid?.querySelectorAll("button[data-value]").forEach(btn => btn.addEventListener("click", () => {
    const value = btn.dataset.value || "soft-marker";
    currentSettings.highlightStyle = value;
    syncPopupHighlightStyle(value);
    saveSetting({highlightStyle:value});
  }));
  if (selectDictionaryMode) {
    selectDictionaryMode.addEventListener("change", (e) => {
      currentSettings.dictionaryLookupMode = e.target.value;
      const patch = { dictionaryLookupMode:e.target.value };
      if (e.target.value === "ai" && currentSettings.enableDictionaryAi === false) {
        currentSettings.enableDictionaryAi = true;
        patch.enableDictionaryAi = true;
      }
      saveSetting(patch);
    });
  }
  toggleLocalDictPriority?.addEventListener("change", e => { currentSettings.localDictionaryPriority=!!e.target.checked; saveSetting({localDictionaryPriority:!!e.target.checked}); });
  toggleHoverTranslate.addEventListener("change", (e) => saveSetting({ enableParagraphHoverTranslate: e.target.checked }));
  toggleParagraphActions?.addEventListener("change", (e) => saveSetting({ enableParagraphActions: e.target.checked }));
  toggleFloatingBall.addEventListener("change", (e) => saveSetting({ enableFloatingBall: e.target.checked }));

  btnOpenOptions.addEventListener("click", () => chrome.runtime.openOptionsPage());
  btnOpenLocalDict?.addEventListener("click", () => {
    const url = chrome.runtime.getURL("options.html?tab=tab-local-dict#tab-local-dict");
    chrome.tabs.create({ url });
  });
  if (btnDonate) {
    btnDonate.addEventListener("click", () => {
      chrome.tabs.create({ url: chrome.runtime.getURL("options.html?tab=tab-about#tab-about") });
    });
  }

  /**
   * 自动脚本注入兜底
   */
  async function trySendMessageWithInjection(tabId, message, callback) {
    chrome.tabs.sendMessage(tabId, message, async (response) => {
      if (chrome.runtime.lastError) {
        try {
          await chrome.scripting.insertCSS({
            target: { tabId: tabId },
            files: ["floating.css"]
          }).catch(() => {});

          await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ["content.js"]
          });

          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, message, (retryRes) => {
              if (chrome.runtime.lastError) {}
              if (callback) callback(retryRes);
            });
          }, 150);
        } catch (err) {
          if (statusDot) statusDot.className = "status-dot";
        }
      } else {
        if (callback) callback(response);
      }
    });
  }

  function updateButtonState(translated, translating, sidebarOpen, count = 0) {
    const isReplace = currentSettings.displayMode === "replace";
    if (translating) {
      btnTogglePage.className = "apple-primary-btn full-width";
      btnToggleText.textContent = "翻译中...";
      if (statusDot) statusDot.className = "status-dot translating";
    } else if (translated) {
      btnTogglePage.className = "apple-primary-btn full-width active-state";
      btnToggleText.textContent = count > 0 ? `恢复网页原文 (${count}${isReplace ? "处" : "段"})` : "恢复网页原文";
      if (statusDot) statusDot.className = "status-dot";
    } else {
      btnTogglePage.className = "apple-primary-btn full-width";
      btnToggleText.textContent = isReplace ? "网页替换翻译" : "网页双语翻译";
      if (statusDot) statusDot.className = "status-dot";
    }

    if (sidebarOpen) {
      btnSidebarText.textContent = "收起侧边栏";
    } else {
      btnSidebarText.textContent = "分栏对照";
    }
  }


  function syncPopupRenderModeAvailability(){
    const replace=currentSettings.displayMode === "replace";
    if(!['clean','native'].includes(currentSettings.replaceRenderStyle)) currentSettings.replaceRenderStyle="clean";
    const activeStyle=activePopupRenderStyle();
    popupRenderStyleGrid?.querySelectorAll("button[data-value]").forEach(btn=>{
      const hide=replace&&!['native','classic'].includes(btn.dataset.value);
      btn.hidden=hide;
      btn.classList.toggle('active',btn.dataset.value===activeStyle);
      const label=btn.querySelector('[data-bilingual-label]');
      if(label) label.textContent=replace?label.dataset.replaceLabel:label.dataset.bilingualLabel;
    });
    selectRenderStyle?.querySelectorAll('option[data-bilingual-label]').forEach(option=>{
      option.textContent=replace?option.dataset.replaceLabel:option.dataset.bilingualLabel;
    });
    if(selectRenderStyle) selectRenderStyle.value=activeStyle;
    document.querySelectorAll('.translation-style-only-row').forEach(el => { el.hidden = replace && activeStyle === 'native'; });
    document.querySelectorAll('.render-style-row').forEach(el => { el.hidden = false; });
    syncPopupStyleDependentOptions(activeStyle);
    controlDisplayMode?.closest('.inset-group')?.classList.toggle('is-replace-mode', replace);
  }

  function syncPopupTextColor(value) {
    const v = popupTextColorMeta[value] ? value : "black";
    const [color,name] = popupTextColorMeta[v];
    const dot = popupTextColorTrigger?.querySelector("i");
    const label = popupTextColorTrigger?.querySelector("span");
    if (dot) {
      dot.style.background = color;
      dot.style.setProperty("--c", color);
      dot.classList.toggle("color-wheel-dot", v === "inherit");
    }
    if (label) label.textContent = name;
    popupTextColorMenu?.querySelectorAll("button[data-value]").forEach(btn => btn.classList.toggle("active", btn.dataset.value === v));
  }
  popupTextColorTrigger?.addEventListener("click", (e) => {
    e.stopPropagation();
    closePopupMenus(popupTextColorSelect);
    popupTextColorSelect?.classList.toggle("open");
  });
  popupTextColorMenu?.querySelectorAll("button[data-value]").forEach(btn => btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const value = btn.dataset.value || "black";
    currentSettings.textColor = value;
    syncPopupTextColor(value);
    popupTextColorSelect?.classList.remove("open");
    saveSetting({textColor:value});
    updateLiveCardPreview();
  }));
  document.addEventListener("click", (e) => { if (popupTextColorSelect && !popupTextColorSelect.contains(e.target)) popupTextColorSelect.classList.remove("open"); });

  function initUI(s) {
    const eng = s.translationEngine || "google";
    selectEngine.value = eng;
    updateApiDrawer(eng);

    setSegmentedValue(controlDisplayMode, s.displayMode || "bilingual");

    if (s.targetLang) selectTargetLang.value = s.targetLang;
    syncPopupDictTrigger(s.dictTriggerMode || "both");
    syncPopupHighlightStyle(s.highlightStyle || "soft-marker");
    if (selectDictionaryMode) selectDictionaryMode.value = s.dictionaryLookupMode || "standard";
    if (btnDonate) btnDonate.style.display = "flex";
    const activeRenderStyle = activePopupRenderStyle(s);
    selectRenderStyle.value = activeRenderStyle;
    syncPopupRenderStyleGrid(activeRenderStyle);
    syncPopupStyleDependentOptions(activeRenderStyle);
    if (s.fontFamily) selectFontFamily.value = s.fontFamily;
    syncPopupTextColor(s.textColor || "black");
    if (s.fontSizeRatio) {
      labelFontSize.textContent = `${s.fontSizeRatio}%`;
    }

    if (toggleLocalDictPriority) toggleLocalDictPriority.checked = !!s.localDictionaryPriority;
    syncPopupRenderModeAvailability();

    const highlight = s.bgHighlight || "soft-yellow";
    paletteBgHighlight?.querySelectorAll(".color-dot").forEach((dot) => {
      dot.classList.toggle("active", dot.getAttribute("data-value") === highlight);
    });
    const underlineStyle = s.underlineStyle || "solid";
    popupUnderlinePicker?.querySelectorAll("button[data-value]").forEach(btn => btn.classList.toggle("active", btn.dataset.value === underlineStyle));
    if (popupUnderlineColor) popupUnderlineColor.value = s.underlineColor || "accent";
    if (popupClickColor) popupClickColor.value = s.clickRevealColor || "charcoal";

    toggleHoverTranslate.checked = s.enableParagraphHoverTranslate !== false;
    if (toggleParagraphActions) toggleParagraphActions.checked = s.enableParagraphActions !== false;
    toggleFloatingBall.checked = s.enableFloatingBall !== false;

    updateLiveCardPreview();
  }

  function syncSegmentIndicator(container, animate = false) {
    if (!container) return;
    const items = Array.from(container.querySelectorAll(".segment-item"));
    if (!items.length) return;
    let indicator = container.querySelector(".segment-indicator");
    if (!indicator) {
      indicator = document.createElement("span");
      indicator.className = "segment-indicator";
      container.prepend(indicator);
    }
    const active = items.find(item => item.classList.contains("active")) || items[0];
    const targetX = Math.max(0, active.offsetLeft - 3);
    const targetWidth = active.offsetWidth;
    const previousX = Number(indicator.dataset.x ?? targetX);
    const previousWidth = Number(indicator.dataset.width ?? targetWidth);
    indicator.dataset.x = String(targetX);
    indicator.dataset.width = String(targetWidth);
    if (animate && indicator.animate && (previousX !== targetX || previousWidth !== targetWidth)) {
      indicator.getAnimations().forEach(animation => animation.cancel());
      const direction = Math.sign(targetX - previousX) || 1;
      const stretch = Math.min(12, Math.max(7, Math.abs(targetX - previousX) * .12));
      const midX = previousX + (targetX - previousX) * .6 - (direction < 0 ? stretch : 0);
      indicator.classList.add('is-animating');
      const animation = indicator.animate([
        { transform:`translateX(${previousX}px)`, width:`${previousWidth}px`, offset:0 },
        { transform:`translateX(${previousX - (direction < 0 ? stretch : 0)}px)`, width:`${previousWidth + stretch}px`, offset:.24 },
        { transform:`translateX(${midX}px)`, width:`${targetWidth + stretch * .65}px`, offset:.68 },
        { transform:`translateX(${targetX}px)`, width:`${targetWidth}px`, offset:1 }
      ], { duration:300, easing:"cubic-bezier(.22,.72,.22,1)" });
      const finish = () => {
        indicator.style.width = `${targetWidth}px`;
        indicator.style.transform = `translateX(${targetX}px)`;
        indicator.classList.remove('is-animating');
      };
      animation.addEventListener('finish', finish, { once:true });
      animation.addEventListener('cancel', () => indicator.classList.remove('is-animating'), { once:true });
    } else {
      indicator.style.width = `${targetWidth}px`;
      indicator.style.transform = `translateX(${targetX}px)`;
    }
  }

  function bindSegmentedControl(container, onChange) {
    if (!container) return;
    const items = container.querySelectorAll(".segment-item");
    syncSegmentIndicator(container);
    items.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.classList.contains('active')) return;
        items.forEach(i => i.classList.remove("active"));
        btn.classList.add("active");
        syncSegmentIndicator(container, true);
        onChange(btn.getAttribute("data-value"));
      });
    });
  }

  function setSegmentedValue(container, value) {
    if (!container) return;
    const items = container.querySelectorAll(".segment-item");
    items.forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-value") === value);
    });
    syncSegmentIndicator(container);
  }

  function isRestrictedUrl(url) {
    if (!url) return true;
    return url.startsWith("chrome://") ||
           url.startsWith("edge://") ||
           url.startsWith("about:") ||
           url.startsWith("chrome-extension://") ||
           url.includes("chromewebstore.google.com");
  }

  function enhancePopupSelects() {
    document.querySelectorAll("select.apple-select").forEach(select => {
      if (select.dataset.enhanced === "1") return; select.dataset.enhanced="1";
      const wrap=document.createElement("div"); wrap.className="popup-select"; if(select.id==="select-font-family") wrap.classList.add("popup-font-family-select"); if(select.id==="select-dictionary-mode") wrap.classList.add("popup-dictionary-mode-select");
      const trigger=document.createElement("button"); trigger.type="button"; trigger.className="popup-select-trigger";
      const menu=document.createElement("div"); menu.className="popup-select-menu";
      select.parentNode.insertBefore(wrap,select); wrap.append(select,trigger,menu); select.classList.add("native-select-hidden");
      const render=()=>{ const opt=select.options[select.selectedIndex]; if(select.id==="select-dictionary-mode"){wrap.classList.toggle("is-standard",select.value==="standard");wrap.classList.toggle("is-ai",select.value==="ai");} trigger.innerHTML=`<span>${escapeHtml(opt?.textContent||"")}</span><svg viewBox="0 0 20 20"><path d="m6 8 4 4 4-4"/></svg>`; menu.innerHTML=Array.from(select.options).map(o=>`<button type="button" data-value="${escapeHtml(o.value)}" class="${o.value===select.value?'active':''}"><span>${escapeHtml(o.textContent)}</span>${o.value===select.value?'<svg viewBox="0 0 20 20"><path d="m5 10 3 3 7-7"/></svg>':''}</button>`).join(''); menu.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{select.value=b.dataset.value;select.dispatchEvent(new Event('change',{bubbles:true}));wrap.classList.remove('open');render();})); };
      select.__renderPopupSelect=render;
      trigger.addEventListener('click',e=>{e.stopPropagation();closePopupMenus(wrap);wrap.classList.toggle('open')}); select.addEventListener('change',render); render();
    });
    document.addEventListener('click',()=>document.querySelectorAll('.popup-select.open').forEach(x=>x.classList.remove('open')));
  }

  function closePopupMenus(except=null){
    document.querySelectorAll('.popup-select.open,.popup-color-select.open,.popup-model-picker.open').forEach(node=>{if(node!==except)node.classList.remove('open')});
  }
  function enhancePopupModelPicker(){ if(!popupApiModel||popupApiModel.dataset.enhanced==='1')return; popupApiModel.dataset.enhanced='1'; const wrap=document.createElement('div');wrap.className='popup-model-picker'; popupApiModel.parentNode.insertBefore(wrap,popupApiModel);wrap.appendChild(popupApiModel);const btn=document.createElement('button');btn.type='button';btn.className='popup-model-preset-btn';btn.textContent='选择模型';const menu=document.createElement('div');menu.className='popup-model-menu';wrap.append(btn,menu);popupModelPicker={wrap,btn,menu};btn.addEventListener('click',e=>{e.stopPropagation();closePopupMenus(wrap);wrap.classList.toggle('open');refreshPopupModelPicker(selectEngine.value)});document.addEventListener('click',()=>wrap.classList.remove('open')); }
  function refreshPopupModelPicker(engine){ if(!popupModelPicker)return; const arr=popupModelPresets[engine]||[]; popupModelPicker.btn.style.display=(engine==='deepl'||!popupApiModel||popupApiModel.style.display==='none')?'none':'inline-flex'; popupModelPicker.menu.innerHTML=arr.length?arr.map(m=>`<button type="button" data-model="${escapeHtml(m)}" class="${m===popupApiModel.value?'active':''}">${escapeHtml(m)}</button>`).join(''):'<div>直接输入模型名称</div>';popupModelPicker.menu.querySelectorAll('button').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();popupApiModel.value=b.dataset.model;popupApiModel.dispatchEvent(new Event('input',{bubbles:true}));popupModelPicker.wrap.classList.remove('open')})); }

  function saveSetting(delta) {
    Object.assign(currentSettings, delta || {});
    chrome.runtime.sendMessage({ action: "UPDATE_SETTINGS", settings: delta }, () => {
      if (chrome.runtime.lastError) {}
    });
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

  function getActiveTab(timeoutMs = 900) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => { if (settled) return; settled = true; clearTimeout(timer); resolve(value); };
      const timer = setTimeout(() => finish(null), timeoutMs);
      try {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (chrome.runtime.lastError) return finish(null);
          finish(tabs && tabs[0] ? tabs[0] : null);
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
