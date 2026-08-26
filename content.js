/* Page translation, reading, lookup and image OCR controller. */

(function () {
  if (window.__RACCOON_TRANSLATE_INITIALIZED__) return;
  window.__RACCOON_TRANSLATE_INITIALIZED__ = true;

  // Resolve extension assets once. Existing page scripts can keep using these
  // URLs after the extension is reloaded instead of calling an invalidated runtime.
  const extensionAssetUrls = (() => {
    try {
      return {
        icon128: chrome.runtime.getURL("icons/icon128.png"),
        icon32: chrome.runtime.getURL("icons/icon32.png"),
        ocrSandbox: chrome.runtime.getURL("ocr-sandbox.html")
      };
    } catch (_) {
      return { icon128:"", icon32:"", ocrSandbox:"" };
    }
  })();

  // Preload the available speech voices before the first playback.
  if (typeof window !== "undefined" && window.speechSynthesis) {
    try {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.addEventListener?.("voiceschanged", () => {
        try { window.speechSynthesis.getVoices(); } catch (_) {}
      }, { once:true });
    } catch (_) {}
  }

  let currentSettings = {
    targetLang: "zh-CN",
    sourceLang: "auto",
    translationEngine: "google",
    displayMode: "bilingual", // "bilingual" | "replace" | "sidebar"
    sidebarWidth: "400",
    sidebarSyncScroll: true,
    sidebarSide: "right",

    // 阅读器持久化偏好
    readerWidth: "920",
    readerTheme: "envelope",
    readerSurface: "card",
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
    renderStyle: "classic",
    replaceRenderStyle: "clean",
    bgHighlight: "soft-yellow",
    customBgColor: "rgba(254, 240, 138, 0.45)",
    textColor: "black",
    customTextColor: "#111827",
    fontSizeRatio: "100",
    paragraphSpacing: "4",
    translationLineHeight: "1.62",
    underlineStyle: "solid",
    highlightStyle: "soft-marker",
    enableParagraphHoverTranslate: true,
    enableParagraphActions: true,
    dictTriggerMode: "both", // "both" | "double_click" | "selection" | "none"
    dictTriggerLastMode: "both",
    dictionaryLookupMode: "standard",
    enableDictionaryAi: true,
    dictionaryAiAnswerStyle: "balanced",
    dictionaryAiEmojiLevel: "light",
    dictionaryAiLayout: "mixed",
    dictionaryAiExplanationDepth: "standard",
    dictionaryAiStoryMode: "as-needed",
    dictionaryAiPosition: "first",
    dictionaryAiConceptRigor: true,
    localDictionaryPriority: false, // standard | ai
    dictionaryAiMode: "manual", // legacy compatibility
    enableImageTranslation: true,
    imageTranslationDisabledDomains: [],
    imageOcrLanguage: "auto", // auto | eng | jpn | chi_sim | chi_tra | kor | fra | deu | spa | ita | por | rus | nld | pol | tur | ukr | ara | vie | tha | ind | mixed presets
    imageTranslationFont: "system", // system | rounded | serif | handwriting
    selectionModifierKey: "none",
    enableInputBoxTranslate: true,
    inputReplaceTargetLang: "en",
    enableFloatingBall: true,
    autoDetectPageLanguage: true,
    floatingShortcut: "zz",
    readerShortcut: "aa",
    autoTranslateEnabled: false,
    autoTranslateEngine: "google",
    autoTranslateDomainList: [],
    preferredVoiceAccent: "us",
    preferredVoiceSpeed: "1.0",
    excludeDomainList: ["translate.google.com", "chatgpt.com", "claude.ai", "gemini.google.com", "youtube.com", "localhost", "127.0.0.1", "google.com", "google.cn", "bing.com", "duckduckgo.com", "baidu.com", "sogou.com", "so.com", "yandex.com", "search.brave.com", "ecosia.org"],
    excludeDomainRules: {},
    excludeDomainDefaultRule: { floating:true, hover:true, selection:true, image:true, auto:true }
  };

  let isPageTranslated = false;
  let isTranslating = false;
  let translationRunGeneration = 0;
  let isSidebarOpen = false;
  let isReaderOpen = false;
  let blockCounter = 0;
  let totalBlocks = 0;
  let translatedBlocksCount = 0;
  let mutationObserver = null;
  let mutationRefreshTimer = null;
  const pendingMutationTranslationRoots = new Set();
  let interactionRefreshHandler = null;
  let interactionRefreshTimer = null;
  let routeWatchTimer = null;
  let lastObservedTranslationUrl = location.href;

  const paragraphMap = new Map();

  // DOM-preserving translation registry. Replacement mode edits Text nodes in
  // place so host listeners, ARIA relationships and interactive component
  // identity survive translation. UI labels in bilingual mode use the same
  // mechanism instead of inserting a second label into tabs/toolbars.
  const inPlaceTranslationRecords = new Map();
  let inPlaceOriginalTextByNode = new WeakMap();
  let inPlaceTranslatedNodes = new WeakSet();
  const translationRevealBySource = new WeakMap();
  let activeTranslationReveal = null;
  let translationRevealLeaveTimer = null;


  function matchedExcludedDomain() {
    const host = String(window.location.hostname || "").toLowerCase();
    return (currentSettings.excludeDomainList || []).map(entry => String(entry || "").trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0]).find(domain => domain && (host === domain || host.endsWith(`.${domain}`))) || "";
  }

  function isCurrentHostExcluded(scope = "any") {
    const domain = matchedExcludedDomain();
    if (!domain) return false;
    if (scope === "any") return true;
    const rule = currentSettings.excludeDomainRules?.[domain] || {};
    const defaults = { floating:true, hover:true, selection:true, image:true, auto:true, ...(currentSettings.excludeDomainDefaultRule || {}) };
    return rule[scope] === undefined ? defaults[scope] === true : rule[scope] === true;
  }

  function isImageTranslationDisabledForHost() {
    const host = String(window.location.hostname || "").toLowerCase();
    return (currentSettings.imageTranslationDisabledDomains || []).some(entry => {
      const domain = String(entry || "").trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
      return domain && (host === domain || host.endsWith(`.${domain}`));
    });
  }

  function canUseImageTranslationHere() {
    return currentSettings.enableImageTranslation !== false
      && !isCurrentHostExcluded("image")
      && !isImageTranslationDisabledForHost();
  }

  /** Detect the effective host background before choosing text contrast. */
  function detectHostDarkTheme() {
    try {
      const computedBody = window.getComputedStyle(document.body);
      const computedText = computedBody.color;
      const textRgb = computedText.match(/\d+/g);

      if (textRgb && textRgb.length >= 3) {
        const textBrightness = (parseInt(textRgb[0], 10) * 299 + parseInt(textRgb[1], 10) * 587 + parseInt(textRgb[2], 10) * 114) / 1000;
        if (textBrightness < 130) {
          document.documentElement.classList.remove("raccoon-dark-host");
          return;
        }
      }

      const bodyBg = computedBody.backgroundColor;
      const rgb = bodyBg.match(/\d+(\.\d+)?/g);
      if (rgb && rgb.length >= 3) {
        const alpha = rgb.length >= 4 ? parseFloat(rgb[3]) : 1.0;
        if (alpha > 0.2) {
          const bgBrightness = (parseInt(rgb[0], 10) * 299 + parseInt(rgb[1], 10) * 587 + parseInt(rgb[2], 10) * 114) / 1000;
          if (bgBrightness < 110) {
            document.documentElement.classList.add("raccoon-dark-host");
            return;
          }
        }
      }
      document.documentElement.classList.remove("raccoon-dark-host");
    } catch (_) {}
  }

  // 1. 初始化
  chrome.runtime.sendMessage({ action: "GET_SETTINGS" }, (res) => {
    if (chrome.runtime.lastError) return;
    if (res && res.settings) {
      currentSettings = Object.assign({}, currentSettings, res.settings);

      detectHostDarkTheme();
      applyDynamicStyles(currentSettings);

      // 黑名单按域名、按交互类型生效；手动网页翻译/阅读/分栏仍始终可用。
      if (!isCurrentHostExcluded("floating")) initFloatingPillSmart();
      if (!isCurrentHostExcluded("hover")) initHoverSingleParagraphTranslate();
      if (canUseImageTranslationHere()) initImageTranslation();
      resumeTabTranslationSession().then(resumed => {
        if (!resumed && !isCurrentHostExcluded("auto")) checkAutoTranslate();
      });
      if (!isCurrentHostExcluded("selection")) initSelectionAndDoubleClick();
      initHighlightHoverDelete();
      initInputBoxTranslate();
      initPageShortcutSequences();
    }
  });

  // 2. 消息监听
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "TOGGLE_PAGE_TRANSLATION") {
      togglePageTranslation();
      sendResponse({ success: true, isTranslated: isPageTranslated });
      return true;
    }

    if (request.action === "TOGGLE_SIDEBAR_VIEW") {
      toggleSidebar();
      sendResponse({ success: true, isSidebarOpen: isSidebarOpen });
      return true;
    }

    if (request.action === "TOGGLE_READER_MODE") {
      toggleReaderMode();
      sendResponse({ success: true, isReaderOpen: isReaderOpen });
      return true;
    }

    if (request.action === "GET_PAGE_LANGUAGE_HINT") {
      const declared = (document.documentElement.lang || document.body?.lang || "").toLowerCase();
      let lang = declared.startsWith("ja") ? "ja" : declared.startsWith("en") ? "en" : declared.startsWith("zh") ? "zh-CN" : "auto";
      if (lang === "auto") {
        const sample = (document.body?.innerText || "").slice(0, 10000);
        const kana = (sample.match(/[\u3040-\u30ff]/g) || []).length;
        const han = (sample.match(/[\u3400-\u9fff]/g) || []).length;
        const latin = (sample.match(/[A-Za-z]/g) || []).length;
        if (kana >= 8 && kana / Math.max(1, han) > 0.02) lang = "ja";
        else if (latin > han * 2 && latin > 80) lang = "en";
        else if (han > 40) lang = "zh-CN";
      }
      sendResponse({ lang });
      return true;
    }

    if (request.action === "GET_TRANSLATION_STATUS") {
      sendResponse({
        isTranslated: isPageTranslated,
        isTranslating: isTranslating,
        isSidebarOpen: isSidebarOpen,
        isReaderOpen: isReaderOpen,
        totalBlocks: totalBlocks,
        translatedBlocksCount: translatedBlocksCount,
        displayMode: currentSettings.displayMode
      });
      return true;
    }

    if (request.action === "SETTINGS_UPDATED") {
      if (request.settings) {
        const prevMode = currentSettings.displayMode;
        currentSettings = Object.assign({}, currentSettings, request.settings);
        applyDynamicStyles(currentSettings);
        const activeReaderRoot = document.getElementById("raccoon-reader-root");
        if (activeReaderRoot) activeReaderRoot.style.setProperty("--reader-image-shadow", currentSettings.readerImageShadow === false ? "none" : "0 8px 24px rgba(0,0,0,.14)");
        const activeSidebarRoot = document.getElementById("raccoon-sidebar-root");
        if (activeSidebarRoot && request.settings.sidebarSide) {
          activeSidebarRoot.dataset.side = currentSettings.sidebarSide === "left" ? "left" : "right";
          applySidebarPageSpace(activeSidebarRoot.offsetWidth || parseInt(currentSettings.sidebarWidth, 10) || 400);
        }
        updateFloatingPillVisibility();
        if (isCurrentHostExcluded("hover")) hideHoverTranslateButton();
        if (canUseImageTranslationHere()) initImageTranslation();
        else teardownImageTranslation();

        if (isPageTranslated && request.settings.displayMode && request.settings.displayMode !== prevMode) {
          // Translation strategies are structurally different: replacement edits
          // Text nodes, bilingual inserts prose blocks, sidebar builds a separate
          // document. Re-run from pristine host content instead of trying to morph
          // one rendered mode into another.
          restoreOriginalPage({ preserveTranslationSession:true });
          setTimeout(() => startPageTranslation(), 40);
        }
      }
      sendResponse({ success: true });
      return true;
    }

    if (request.action === "SHOW_SELECTION_TRANSLATION") {
      if (request.text) showSelectionCardCentered(request.text);
      sendResponse({ success: true });
      return true;
    }
  });

  window.addEventListener("popstate", () => scheduleRouteTranslationRefresh());
  window.addEventListener("hashchange", () => scheduleRouteTranslationRefresh());

  function isForeignLanguagePage() {
    if (!currentSettings.autoDetectPageLanguage) return true;

    const docLang = (document.documentElement.lang || "").toLowerCase();
    const targetLang = (currentSettings.targetLang || "zh-CN").toLowerCase();

    const sampleNodes = document.querySelectorAll("p, h1, h2, h3, h4, h5, h6, article, blockquote");
    let combinedText = "";
    let sampled = 0;
    for (let i = 0; i < sampleNodes.length && sampled < 1500; i++) {
      const t = sampleNodes[i].innerText || "";
      if (t.length > 5) {
        combinedText += " " + t;
        sampled += t.length;
      }
    }

    if (!combinedText || combinedText.length < 25) {
      if (docLang && (docLang.startsWith("en") || docLang.startsWith("ja") || docLang.startsWith("ko") || docLang.startsWith("fr") || docLang.startsWith("de") || docLang.startsWith("es"))) {
        return true;
      }
      return false;
    }

    const chineseMatches = combinedText.match(/[\u4e00-\u9fa5]/g) || [];
    const latinMatches = combinedText.match(/[a-zA-Z]/g) || [];
    const japaneseMatches = combinedText.match(/[\u3040-\u30ff]/g) || [];
    const koreanMatches = combinedText.match(/[\uac00-\ud7af]/g) || [];

    const chineseCount = chineseMatches.length;
    const foreignCount = (latinMatches.length * 0.35) + japaneseMatches.length + koreanMatches.length;

    if (targetLang.startsWith("zh")) {
      if (chineseCount > 35 && chineseCount > foreignCount * 1.1) {
        return false;
      }
      return foreignCount > 20;
    }

    if (targetLang.startsWith("en")) {
      if (latinMatches.length > chineseCount * 2) return false;
      return chineseCount > 20 || japaneseMatches.length > 20;
    }

    return true;
  }

  function getFontFamilyCss(familyKey) {
    switch (familyKey) {
      case "kinghwa-song":
        return '"KingHwaOldSong", "KingHwa OldSong", "KingHwa_OldSong", "京華老宋体", "京华老宋体", "Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", "STSong", serif';
      case "source-serif":
        return '"Source Han Serif SC", "Noto Serif CJK SC", "Songti SC", "STSong", serif';
      case "source-sans":
        return '"Source Han Sans SC", "Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif';
      case "pingfang":
        return '"PingFang SC", "Hiragino Sans GB", "Heiti SC", "Microsoft YaHei", sans-serif';
      case "lxgw-wenkai":
        return '"LXGW WenKai", "Kaiti SC", "STKaiti", "KaiTi", serif';
      case "smiley-sans":
        return '"Smiley Sans", "PingFang SC", "Microsoft YaHei", sans-serif';
      case "fangsong":
        return '"FangSong", "STFangsong", "仿宋", serif';
      case "kaiti":
        return '"Kaiti SC", "STKaiti", "KaiTi", serif';
      case "yuanti":
        return '"Yuanti SC", "STYuanti", "Microsoft YaHei", sans-serif';
      case "georgia":
        return 'Georgia, "Times New Roman", "Source Han Serif SC", serif';
      case "garamond":
        return '"EB Garamond", Garamond, Baskerville, "Source Han Serif SC", serif';
      case "system":
      default:
        return '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "WenQuanYi Micro Hei", sans-serif';
    }
  }

  function activePageRenderStyle(settings = currentSettings) {
    if (settings.displayMode === "replace") return settings.replaceRenderStyle === "native" ? "native" : "classic";
    return settings.renderStyle || "classic";
  }

  function applyDynamicStyles(s) {
    const root = document.documentElement;
    root.classList.toggle("raccoon-paragraph-actions-disabled", s.enableParagraphActions === false);
    root.style.setProperty("--raccoon-font-style", s.fontStyle || "normal");
    root.style.setProperty("--raccoon-sidebar-width", `${s.sidebarWidth || 400}px`);

    const fontFam = getFontFamilyCss(s.fontFamily || "system");
    root.style.setProperty("--raccoon-font-family", fontFam);
    root.style.setProperty("--reader-font-family", fontFam);

    let bgColor = "transparent";
    switch (s.bgHighlight) {
      case "none": bgColor = "transparent"; break;
      case "soft-yellow": bgColor = "rgba(254, 240, 138, 0.45)"; break;
      case "soft-green": bgColor = "rgba(187, 247, 208, 0.45)"; break;
      case "soft-purple": bgColor = "rgba(233, 213, 255, 0.45)"; break;
      case "soft-orange": bgColor = "rgba(254, 215, 170, 0.45)"; break;
      case "soft-blue": bgColor = "rgba(191, 219, 254, 0.45)"; break;
      default: bgColor = "rgba(254, 240, 138, 0.45)";
    }
    root.style.setProperty("--raccoon-bg-color", bgColor);

    const isDarkHost = document.documentElement.classList.contains("raccoon-dark-host");
    const colorMap={black:"#111827",slate:"#5f6063",accent:"#2563eb",green:"#27835d",purple:"#7c5ac7",red:"#b84a4a",orange:"#b86d24",teal:"#207f7a",brown:"#8a6448",inherit:"inherit"};
    const textColor = isDarkHost ? "#f3f4f6" : (colorMap[s.textColor || "black"] || "#111827");
    root.style.setProperty("--raccoon-text-color", textColor);
    const activeRenderStyle = activePageRenderStyle(s);
    root.style.setProperty("--raccoon-font-style", (s.displayMode !== "replace" && activeRenderStyle === "italic" ? "italic" : "normal"));

    const ratio = (parseInt(s.fontSizeRatio, 10) || 100) / 100;
    root.style.setProperty("--raccoon-font-size", `${ratio}em`);
    document.querySelectorAll(".raccoon-replaced-text").forEach((el) => {
      const base = parseFloat(el.dataset.raccoonBaseFontSize || "") || parseFloat(getComputedStyle(el).fontSize) || 16;
      el.style.setProperty("--raccoon-replace-base-size", `${base}px`);
      el.style.setProperty("--raccoon-replace-font-size", `${Math.round(base * ratio * 100) / 100}px`);
      el.setAttribute("data-render-style", activeRenderStyle);
      const sourceStyle = getComputedStyle(el);
      const preferredColor = activeRenderStyle === "native"
        ? (el.dataset.raccoonSourceColor || sourceStyle.color)
        : root.style.getPropertyValue("--raccoon-text-color");
      applyAdaptiveTranslationColor(el, el, preferredColor, sourceStyle);
    });
    document.querySelectorAll(".raccoon-translated-block[data-raccoon-source-font-size], .raccoon-translated-inline[data-raccoon-source-font-size]").forEach((el) => {
      const base = parseFloat(el.dataset.raccoonSourceFontSize || "");
      if (Number.isFinite(base) && base > 0) {
        el.style.setProperty("--raccoon-block-font-size", `${Math.round(base * ratio * 100) / 100}px`);
      }
    });

    const spacing = parseInt(s.paragraphSpacing, 10) || 4;
    root.style.setProperty("--raccoon-spacing", `${spacing}px`);
    root.style.setProperty("--raccoon-translation-line-height", String(s.translationLineHeight || "1.62"));
    root.style.setProperty("--raccoon-underline-style", String(s.underlineStyle || "solid"));
    const underlineColors = { accent:"#3b82f6", slate:"#64748b", green:"#2f855a", purple:"#7c5ac7", red:"#b84a4a", inherit:"currentColor" };
    root.style.setProperty("--raccoon-underline-color", underlineColors[s.underlineColor || "accent"] || "#3b82f6");
    const revealColors = { charcoal:"#25282d", slate:"#46515f", navy:"#2f4057", forest:"#365247", plum:"#51415b", brown:"#5b4a3d" };
    root.style.setProperty("--raccoon-click-reveal-color", revealColors[s.clickRevealColor || "charcoal"] || "#25282d");
    root.style.setProperty("--raccoon-highlight-style", String(s.highlightStyle || "soft-marker"));

    document.querySelectorAll(".raccoon-translated-block, .raccoon-translated-inline").forEach((el) => {
      el.setAttribute("data-render-style", s.renderStyle || "classic");
      const sourceEl = el.__raccoonSourceElement;
      const sourceStyle = sourceEl ? getComputedStyle(sourceEl) : null;
      const preferredColor = s.renderStyle === "native" ? sourceStyle?.color : textColor;
      applyAdaptiveTranslationColor(sourceEl, el, preferredColor, sourceStyle);
      if (s.renderStyle !== "native") {
        el.style.setProperty("font-family", fontFam, "important");
        applySourceTypographyScale(el.__raccoonSourceElement, el);
      } else {
        el.style.removeProperty("font-family");
      }
    });
  }


  document.addEventListener("click", (event) => {
    const target = event.target?.closest?.('.raccoon-translated-block[data-render-style="click-reveal"], .raccoon-translated-inline[data-render-style="click-reveal"]');
    if (!target || event.target.closest('.raccoon-block-actions')) return;
    target.classList.toggle('raccoon-revealed');
  }, true);

  function revealTranslationForPointerNode(node) {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    if (!element) return null;
    const translated = element.closest?.('.raccoon-translated-block[data-render-style="hover-reveal"], .raccoon-translated-inline[data-render-style="hover-reveal"]');
    if (translated) return translated;
    for (let current = element, depth = 0; current && depth < 10; current = current.parentElement, depth += 1) {
      const paired = translationRevealBySource.get(current);
      if (paired?.isConnected && paired.getAttribute("data-render-style") === "hover-reveal") return paired;
    }
    return null;
  }

  document.addEventListener("pointerover", (event) => {
    const translated = revealTranslationForPointerNode(event.target);
    if (!translated) return;
    clearTimeout(translationRevealLeaveTimer);
    if (activeTranslationReveal && activeTranslationReveal !== translated) {
      activeTranslationReveal.classList.remove("raccoon-hover-revealed");
    }
    activeTranslationReveal = translated;
    translated.classList.add("raccoon-hover-revealed");
  }, true);

  document.addEventListener("pointerout", (event) => {
    const translated = revealTranslationForPointerNode(event.target);
    if (!translated || revealTranslationForPointerNode(event.relatedTarget) === translated) return;
    clearTimeout(translationRevealLeaveTimer);
    translationRevealLeaveTimer = setTimeout(() => {
      translated.classList.remove("raccoon-hover-revealed");
      if (activeTranslationReveal === translated) activeTranslationReveal = null;
    }, 70);
  }, true);

  function domainMatchesList(host, list) {
    const h = String(host || "").toLowerCase();
    return (list || []).some(entry => {
      const d = String(entry || "").trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
      return d && (h === d || h.endsWith(`.${d}`));
    });
  }

  function translationSiteKey() {
    try {
      return location.origin && location.origin !== "null" ? location.origin : location.hostname;
    } catch (_) {
      return location.hostname || "";
    }
  }

  function setTabTranslationSession(active) {
    try {
      chrome.runtime.sendMessage({
        action:"SET_TAB_TRANSLATION_SESSION",
        active:!!active,
        siteKey:translationSiteKey(),
        displayMode:currentSettings.displayMode || "bilingual"
      }, () => { if (chrome.runtime.lastError) {} });
    } catch (_) {}
  }

  function resumeTabTranslationSession() {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({ action:"GET_TAB_TRANSLATION_SESSION", siteKey:translationSiteKey() }, res => {
          if (chrome.runtime.lastError || !res?.active) { resolve(false); return; }
          setTimeout(() => {
            if (!isPageTranslated && !isTranslating) startPageTranslation();
          }, 420);
          resolve(true);
        });
      } catch (_) { resolve(false); }
    });
  }

  function parsedCssColor(value) {
    const normalized = String(value || "").trim();
    const hex = normalized.match(/^#([\da-f]{3,8})$/i)?.[1];
    if (hex) {
      const expanded = hex.length === 3 || hex.length === 4
        ? hex.split("").map(char => char + char).join("")
        : hex;
      if (expanded.length === 6 || expanded.length === 8) {
        return {
          r:parseInt(expanded.slice(0, 2), 16),
          g:parseInt(expanded.slice(2, 4), 16),
          b:parseInt(expanded.slice(4, 6), 16),
          a:expanded.length === 8 ? parseInt(expanded.slice(6, 8), 16) / 255 : 1
        };
      }
    }
    const numbers = normalized.match(/[\d.]+/g)?.map(Number) || [];
    if (numbers.length < 3) return null;
    return { r:numbers[0], g:numbers[1], b:numbers[2], a:numbers.length > 3 ? numbers[3] : 1 };
  }

  function cssColorLuminance(color) {
    if (!color) return null;
    const linear = [color.r,color.g,color.b].map(v => {
      const c = Math.max(0, Math.min(255, v)) / 255;
      return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
    });
    return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
  }

  function sourceSurfaceLuminance(origEl, sourceStyle) {
    const sourceLuminance = cssColorLuminance(parsedCssColor(sourceStyle?.color));
    let composite = { r:0, g:0, b:0, a:0 };
    const placeBehind = (background) => {
      const frontAlpha = Math.max(0, Math.min(1, composite.a || 0));
      const backAlpha = Math.max(0, Math.min(1, background.a ?? 1));
      const outAlpha = frontAlpha + backAlpha * (1 - frontAlpha);
      if (outAlpha <= 0) return;
      composite = {
        r:(composite.r * frontAlpha + background.r * backAlpha * (1 - frontAlpha)) / outAlpha,
        g:(composite.g * frontAlpha + background.g * backAlpha * (1 - frontAlpha)) / outAlpha,
        b:(composite.b * frontAlpha + background.b * backAlpha * (1 - frontAlpha)) / outAlpha,
        a:outAlpha
      };
    };
    let node = origEl;
    for (let depth = 0; node && depth < 7; depth++, node = node.parentElement) {
      try {
        const style = getComputedStyle(node);
        const bg = parsedCssColor(style.backgroundColor);
        if (bg && bg.a > 0) {
          placeBehind(bg);
          if (composite.a >= .96) return cssColorLuminance(composite);
        }
        // CSS gradients and background images frequently sit on a transparent
        // background colour. In that case the site's own text colour is the
        // safest available signal for whether the rendered surface is dark.
        if (style.backgroundImage && style.backgroundImage !== "none") {
          placeBehind(sourceLuminance != null && sourceLuminance > .55
            ? { r:0, g:0, b:0, a:1 }
            : { r:255, g:255, b:255, a:1 });
          return cssColorLuminance(composite);
        }
      } catch (_) {}
    }
    // Transparent and gradient surfaces do not expose a useful background
    // colour. The host text colour is still a reliable last-resort hint.
    if (composite.a > 0) {
      placeBehind({ r:255, g:255, b:255, a:1 });
      return cssColorLuminance(composite);
    }
    if (sourceLuminance != null && sourceLuminance > .72) return 0;
    return 1;
  }

  function contrastRatio(a, b) {
    if (a == null || b == null) return 0;
    const light = Math.max(a, b);
    const dark = Math.min(a, b);
    return (light + .05) / (dark + .05);
  }

  function applyAdaptiveTranslationColor(origEl, transNode, preferredColor, sourceStyle = null) {
    if (!origEl || !transNode) return;
    try {
      const cs = sourceStyle || getComputedStyle(origEl);
      const surface = sourceSurfaceLuminance(origEl, cs);
      let candidate = parsedCssColor(preferredColor);
      if (!candidate) candidate = parsedCssColor(cs.color);
      const candidateLuminance = cssColorLuminance(candidate);
      const readable = contrastRatio(candidateLuminance, surface) >= 4.5
        ? String(preferredColor || cs.color || "").trim()
        : (surface < .42 ? "#f5f7fa" : "#111827");
      transNode.style.setProperty("--raccoon-local-text-color", readable || (surface < .42 ? "#f5f7fa" : "#111827"));
      transNode.dataset.raccoonSurface = surface < .42 ? "dark" : "light";
    } catch (_) {}
  }

  function refreshRenderedTranslationContrast(origEl, transNode, renderStyle = currentSettings.renderStyle, preferredOverride = "") {
    if (!origEl || !transNode) return;
    requestAnimationFrame(() => {
      if (!transNode.isConnected || !origEl.isConnected) return;
      try {
        const sourceStyle = getComputedStyle(origEl);
        const preferredColor = preferredOverride || (renderStyle === "native"
          ? (transNode.dataset.raccoonSourceColor || sourceStyle.color)
          : getComputedStyle(document.documentElement).getPropertyValue("--raccoon-text-color"));
        const contrastSourceStyle = transNode.classList.contains("raccoon-replaced-text") && transNode.dataset.raccoonSourceColor
          ? { color:transNode.dataset.raccoonSourceColor }
          : sourceStyle;
        // Recalculate from the translation's final DOM position. Before it is
        // inserted, a sibling card/gradient can make the source surface differ
        // from the surface that the translated line actually lands on.
        applyAdaptiveTranslationColor(transNode, transNode, preferredColor, contrastSourceStyle);
      } catch (_) {}
    });
  }

  function applySourceTypographyScale(origEl, transNode) {
    if (!origEl || !transNode) return;
    try {
      const cs = getComputedStyle(origEl);
      const sourceAlign = ["left", "right", "center", "justify", "start", "end"].includes(cs.textAlign) ? cs.textAlign : "start";
      const sourceWeight = parseInt(cs.fontWeight || "", 10);
      const sourceLineHeight = parseFloat(cs.lineHeight || "");
      transNode.style.setProperty("--raccoon-source-text-align", sourceAlign);
      transNode.style.setProperty("--raccoon-source-font-weight", String(Number.isFinite(sourceWeight) ? sourceWeight : 400));
      if (Number.isFinite(sourceLineHeight) && sourceLineHeight > 0) {
        transNode.style.setProperty("--raccoon-source-line-height", `${Math.round(sourceLineHeight * 100) / 100}px`);
      }
      transNode.dataset.raccoonSourceAlign = sourceAlign;

      if (currentSettings.renderStyle === "native") return;
      applyAdaptiveTranslationColor(origEl, transNode, getComputedStyle(document.documentElement).getPropertyValue("--raccoon-text-color"), cs);
      const sourceSize = parseFloat(cs.fontSize || "");
      if (!Number.isFinite(sourceSize) || sourceSize <= 0) return;
      const ratio = (parseInt(currentSettings.fontSizeRatio, 10) || 100) / 100;
      transNode.dataset.raccoonSourceFontSize = String(sourceSize);
      transNode.style.setProperty("--raccoon-block-font-size", `${Math.round(sourceSize * ratio * 100) / 100}px`);

      const tag = String(origEl.tagName || "").toUpperCase();
      const role = String(origEl.getAttribute?.("role") || "").toLowerCase();
      const ariaLevel = parseInt(origEl.getAttribute?.("aria-level") || "", 10);
      const headingLike = /^H[1-6]$/.test(tag) || role === "heading" || Number.isFinite(ariaLevel);
      if (headingLike) {
        transNode.dataset.raccoonHeading = /^H[1-6]$/.test(tag) ? tag.toLowerCase() : `h${Math.min(6, Math.max(1, ariaLevel || 2))}`;
        const weight = Number.isFinite(sourceWeight) ? Math.max(600, Math.min(800, sourceWeight)) : 650;
        transNode.style.setProperty("--raccoon-block-font-weight", String(weight));
      }
    } catch (_) {}
  }

  function checkAutoTranslate() {
    const host = window.location.hostname;
    if (isCurrentHostExcluded("auto")) return;
    const enabled = currentSettings.autoTranslateEnabled === true || domainMatchesList(host, currentSettings.autoTranslateDomainList);
    if (!enabled || !isForeignLanguagePage()) return;
    const engineOverride = currentSettings.autoTranslateEngine === "google" ? "google" : null;
    setTimeout(() => {
      if (!isPageTranslated && !isTranslating) startPageTranslation(engineOverride);
    }, 700);
  }

  function togglePageTranslation() {
    if (isTranslating) return;
    if (isPageTranslated) {
      restoreOriginalPage();
    } else {
      startPageTranslation();
    }
  }

  function prioritizeTranslationBlocks(blocks) {
    if (!Array.isArray(blocks) || blocks.length < 2) return blocks || [];
    const viewportHeight = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 800);
    const rectCache = new WeakMap();
    const ranked = blocks.map((block, index) => {
      const el = block?.element;
      if (!el?.getBoundingClientRect) return { block, index, band:3, distance:index };
      let rect = rectCache.get(el);
      if (!rect) {
        try { rect = el.getBoundingClientRect(); } catch (_) { rect = { top:Infinity, bottom:Infinity }; }
        rectCache.set(el, rect);
      }
      const nearViewport = rect.bottom >= -120 && rect.top <= viewportHeight + 240;
      const belowViewport = rect.top > viewportHeight + 240;
      return {
        block,
        index,
        band:nearViewport ? 0 : (belowViewport ? 1 : 2),
        distance:nearViewport ? Math.abs(rect.top) : (belowViewport ? rect.top - viewportHeight : Math.abs(rect.bottom))
      };
    });
    ranked.sort((a, b) => a.band - b.band || a.distance - b.distance || a.index - b.index);
    return ranked.map(item => item.block);
  }

  async function startPageTranslation(engineOverride = null) {
    const runId = ++translationRunGeneration;
    const runMode = currentSettings.displayMode;
    setTabTranslationSession(true);
    isTranslating = true;
    updateFloatingPillStatus("loading", "翻译中...");
    setTranslationBadgeSafely("translating");

    const collectedBlocks = collectTranslatableBlocks();
    const blocks = runMode === "sidebar"
      ? collectedBlocks
      : prioritizeTranslationBlocks(collectedBlocks);
    // Freeze exact host-page source text before any translation node is inserted.
    // Concurrent chunks can otherwise observe DOM already modified by an earlier
    // chunk, especially inside lists and inline-heavy article layouts.
    const sourceTextById = new Map(blocks.map(block => [block.id, block.text]));
    const blockById = new Map(blocks.map(block => [block.id, block]));
    const failedBlocks = [];
    totalBlocks = blocks.length;
    translatedBlocksCount = 0;

    if (totalBlocks === 0) {
      isTranslating = false;
      isPageTranslated = true;
      updateFloatingPillStatus("done", "等待页面内容");
      setTranslationBadgeSafely("active");
      startMutationObserver();
      setTimeout(() => scheduleVisibleTranslationRefresh(0), 900);
      setTimeout(() => scheduleVisibleTranslationRefresh(0), 2600);
      return;
    }

    if (runMode === "sidebar") {
      openSidebar();
    }

    updateFloatingPillStatus("loading", `0/${totalBlocks}`);

    const CHUNK_SIZE = 12;
    const chunks = [];
    for (let i = 0; i < blocks.length; i += CHUNK_SIZE) {
      chunks.push(blocks.slice(i, i + CHUNK_SIZE).map(b => ({ id: b.id, text: b.text })));
    }

    const activeEngine = engineOverride || currentSettings.translationEngine || "google";
    // Google batches are translated as independent units in the service worker
    // to preserve exact paragraph mapping. Two outer workers keep at most twelve
    // requests in flight instead of creating a thirty-request burst.
    const CONCURRENCY = activeEngine === "google" ? 2 : 3;
    let nextChunkIdx = 0;

    async function pipelineWorker() {
      while (runId === translationRunGeneration && nextChunkIdx < chunks.length) {
        const chunk = chunks[nextChunkIdx++];
        if (!chunk) break;

        const markChunkFailed = () => {
          chunk.forEach(requestItem => {
            const meta = blockById.get(requestItem.id);
            if (!meta) return;
            meta.element?.removeAttribute?.('data-raccoon-id');
            failedBlocks.push(meta);
          });
        };

        try {
          const res = await sendBatchWithIds(chunk, engineOverride);
          if (runId !== translationRunGeneration) return;
          if (res && res.success && Array.isArray(res.data)) {
            res.data.forEach(item => {
              const meta = blockById.get(item.id);
              const blockEl = meta?.element || document.querySelector(`[data-raccoon-id="${item.id}"]`);
              if (blockEl && item.text && !item.error) {
                const liveElement = meta?.kind === 'replace-text' ? meta.textNode?.parentElement : blockEl;
                const allowHiddenToc = meta?.kind === 'ui-inplace' && isStructuredTocControl(blockEl);
                if (!liveElement || (!allowHiddenToc && !isVisibleTranslationElement(liveElement))) {
                  blockEl.removeAttribute?.('data-raccoon-id');
                  return;
                }
                const origText = sourceTextById.get(item.id) || getHostOriginalText(blockEl);
                if (meta?.kind !== 'replace-text' && meta?.kind !== 'component-text' && meta?.kind !== 'ui-inplace') {
                  paragraphMap.set(item.id, { origText: origText, transText: item.text, el: blockEl });
                }

                if (runMode === "sidebar") {
                  renderSidebarItem(item.id, blockEl, origText, item.text);
                } else {
                  renderTranslationNode(blockEl, item.text, meta || { id:item.id, kind:'content-block', element:blockEl });
                }
                translatedBlocksCount++;
              } else if (meta) {
                meta.element?.removeAttribute?.('data-raccoon-id');
                failedBlocks.push(meta);
              }
            });
            updateFloatingPillStatus("loading", `${translatedBlocksCount}/${totalBlocks}`);
          } else markChunkFailed();
        } catch (err) {
          console.warn("Pipeline chunk error:", err);
          markChunkFailed();
        }
      }
    }

    const workers = [];
    for (let w = 0; w < Math.min(CONCURRENCY, chunks.length); w++) {
      workers.push(pipelineWorker());
    }
    await Promise.all(workers);

    if (runId !== translationRunGeneration) return;

    isTranslating = false;
    isPageTranslated = true;
    const failedCount = new Set(failedBlocks.map(block => block.id)).size;
    updateFloatingPillStatus("done", failedCount ? `${runMode === "replace" ? "已替换" : "已翻译"} · ${failedCount} 段待重试` : (runMode === "replace" ? "已替换" : "已翻译"));
    setTranslationBadgeSafely("active");

    startMutationObserver();
    if (runMode === "sidebar") {
      initSidebarScrollSync();
    }
    if (failedCount) {
      setTimeout(() => scheduleVisibleTranslationRefresh(0), 1600);
      setTimeout(() => scheduleVisibleTranslationRefresh(0), 6200);
      setTimeout(() => scheduleVisibleTranslationRefresh(0), 16000);
    }
  }

  function sendBatchWithIds(items, engineOverride = null) {
    return new Promise((resolve) => {
      // 扩展更新/重载后，旧页面里的 content script 可能暂时失去 runtime 上下文。
      // sendMessage 在这种情况下会同步抛错，不能只依赖 callback 里的 lastError。
      try {
        if (!chrome?.runtime?.id) {
          resolve({ success: false, error: "扩展运行上下文暂不可用，请刷新页面后重试。" });
          return;
        }
        chrome.runtime.sendMessage(
          {
            action: "TRANSLATE_BATCH_IDS",
            items: Array.isArray(items) ? items : [],
            sl: currentSettings.sourceLang || "auto",
            tl: currentSettings.targetLang || "zh-CN",
            engineOverride: engineOverride || null
          },
          (res) => {
            const runtimeError = chrome.runtime.lastError;
            if (runtimeError) {
              resolve({ success: false, error: runtimeError.message || "翻译消息通道暂不可用" });
            } else {
              resolve(res || { success: false, error: "翻译服务未返回结果" });
            }
          }
        );
      } catch (err) {
        resolve({ success: false, error: err?.message || String(err) });
      }
    });
  }

  function setTranslationBadgeSafely(status) {
    try {
      if (!chrome?.runtime?.id) return;
      chrome.runtime.sendMessage({ action: "SET_BADGE", status }, () => {
        if (chrome.runtime.lastError) {}
      });
    } catch (_) {}
  }

  const INTERACTIVE_UI_SELECTOR = [
    '[role="tab"]', '[role="menuitem"]', '[role="option"]', '[role="button"]',
    'button', 'summary', '[aria-haspopup]', '[aria-controls]'
  ].join(',');

  const UI_CHROME_ANCESTOR_SELECTOR = [
    'nav', 'header', '[role="navigation"]', '[role="tablist"]', '[role="toolbar"]', '[role="menu"]',
    '.navbar', '.nav-bar', '.tab-bar', '.tabs', '.tablist', '.toolbar', '.breadcrumb'
  ].join(',');

  const TRANSLATION_EXTENSION_SELECTOR = [
    '.raccoon-translated-block', '.raccoon-translated-inline', '.raccoon-block-actions',
    '.raccoon-ui-translation-line',
    '#raccoon-hover-trigger-root', '#raccoon-selection-bubble-root', '#raccoon-floating-ball-root',
    '#raccoon-sidebar-root', '#raccoon-reader-root', '[data-reader-translate-one]'
  ].join(',');

  const TRANSLATABLE_BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6, [role='heading'], li, blockquote, dt, dd, figcaption, td, th, [role='article']";

  function queryScopedElements(container, selector) {
    const result = [];
    if (container?.nodeType === Node.ELEMENT_NODE && container.matches?.(selector)) result.push(container);
    container?.querySelectorAll?.(selector).forEach(el => result.push(el));
    return result;
  }

  function isExtensionOwnedElement(el) {
    return !!el?.closest?.(TRANSLATION_EXTENSION_SELECTOR);
  }

  function hasStickyOrFixedContext(el) {
    let node = el;
    for (let i = 0; node && i < 4; i++, node = node.parentElement) {
      try {
        const pos = getComputedStyle(node).position;
        if (pos === 'sticky' || pos === 'fixed') return true;
      } catch (_) {}
    }
    return false;
  }

  function isStructuredTocControl(el) {
    const control = el?.closest?.("a,button,[role='treeitem'],[role='menuitem']") || el;
    if (!control) return false;
    return !!control.matches?.(".vector-toc-link,.toc a,[data-glean-id*='toc_click']") ||
      !!control.closest?.("#vector-toc,.vector-toc,.toc,[role='tree']");
  }

  function isRichContentControl(el) {
    const control = el?.closest?.("a,button,[role='button']") || el;
    if (!control?.matches?.("a,button,[role='button']")) return false;
    if (control.closest?.("nav,header,[role='navigation'],[role='tablist'],[role='toolbar'],[role='menu']")) return false;
    try {
      const text = String(extractOriginalTextFromLiveDom(control) || control.innerText || "").replace(/\s+/g, " ").trim();
      const rect = control.getBoundingClientRect();
      const semanticCount = control.querySelectorAll("p,h1,h2,h3,h4,h5,h6,article,section,figure,table,[role='article']").length;
      const hasMedia = !!control.querySelector("img,picture,video,canvas");
      const hasEditorialCopy = !!control.querySelector("strong,b") && control.children.length >= 2 && text.length >= 52;
      const hasEditorialHeading = !!control.querySelector("h1,h2,h3,h4,h5,h6,[role='heading']");
      const stackedCopy = control.children.length >= 2 && rect.height >= 48 && text.length >= 30;
      return rect.height >= 46 && (
        (hasMedia && (semanticCount >= 1 || text.length >= 34)) ||
        (semanticCount >= 2 && text.length >= 42) ||
        hasEditorialCopy || hasEditorialHeading || stackedCopy
      );
    } catch (_) {
      return false;
    }
  }

  function isCompactTranslationComponent(el) {
    if (!el) return false;
    // Compact components are bounded reference/navigation surfaces whose text
    // can be replaced in place without changing article prose. A large link
    // card is content (Medium recommendations are a common example), not UI:
    // its original title must stay visible and receive a linked translation.
    return !!el.closest?.(".infobox,.sidebar,.navbox,.vertical-navbox,.metadata,.ambox");
  }

  function isArticleProseLink(el) {
    const link = el?.closest?.("a[href]");
    if (!link || link.closest?.(UI_CHROME_ANCESTOR_SELECTOR)) return false;
    if (link.matches?.("[role='tab'],[role='menuitem'],[role='option'],[role='button'],[aria-haspopup],[aria-controls]")) return false;
    if (isRichContentControl(link)) return true;

    const proseHost = link.closest?.("p,blockquote,figcaption,dd,dt,h1,h2,h3,h4,h5,h6,[role='heading']");
    if (proseHost) {
      const hostText = String(extractOriginalTextFromLiveDom(proseHost) || proseHost.textContent || "").replace(/\s+/g, " ").trim();
      const linkText = String(extractOriginalTextFromLiveDom(link) || link.textContent || "").replace(/\s+/g, " ").trim();
      if (proseHost !== link && hostText.length >= linkText.length + 4) return true;
      if (/^H[1-6]$/.test(proseHost.tagName || "")) return true;
    }

    const listItem = link.closest?.("li");
    if (listItem && listItem.closest?.("article,main,[role='main'],[role='article']") && !listItem.closest?.("nav,[role='navigation'],[role='menu'],[role='tablist']")) return true;
    return false;
  }

  function hasPeerNavigationContext(el) {
    const control = el.closest?.("a,button,[role='tab'],[role='menuitem']") || el;
    if (!control || String(extractOriginalTextFromLiveDom(control) || control.textContent || "").trim().length > 90) return false;
    if (isRichContentControl(control) || isArticleProseLink(control)) return false;
    let group = control.parentElement;
    for (let depth = 0; group && depth < 3; depth++, group = group.parentElement) {
      const controls = Array.from(group.querySelectorAll?.(":scope > a, :scope > button, :scope > [role='tab'], :scope > * > a, :scope > * > button, :scope > * > [role='tab']") || [])
        .filter(item => isVisibleTranslationElement(item));
      if (controls.length < 3 || controls.length > 12) continue;
      try {
        const rects = controls.slice(0, 6).map(item => item.getBoundingClientRect());
        const aligned = rects.filter(rect => Math.abs(rect.top - rects[0].top) < 24).length >= 3;
        const groupRect = group.getBoundingClientRect();
        const hint = `${group.id || ""} ${typeof group.className === "string" ? group.className : ""}`;
        if (aligned && (groupRect.top < Math.min(620, window.innerHeight * .62) || /(tab|nav|menu|category|service)/i.test(hint))) return true;
      } catch (_) {}
    }
    return false;
  }

  function getPeerNavigationLayout(el) {
    const control = el?.closest?.("a,button,[role='tab'],[role='menuitem'],[role='option']") || el;
    if (!control) return 'unknown';
    const selector = "a,button,[role='tab'],[role='menuitem'],[role='option']";
    let group = control.parentElement;
    for (let depth = 0; group && depth < 3; depth++, group = group.parentElement) {
      const controls = Array.from(group.querySelectorAll?.(selector) || [])
        .filter(item => item === control || (item.closest(selector) === item && isVisibleTranslationElement(item)))
        .slice(0, 12);
      if (controls.length < 2) continue;
      try {
        const style = getComputedStyle(group);
        if (style.display.includes('flex')) {
          return style.flexDirection.startsWith('column') ? 'vertical' : 'horizontal';
        }
        const rects = controls.map(item => item.getBoundingClientRect()).filter(rect => rect.width > 0 && rect.height > 0);
        if (rects.length < 2) continue;
        const sameRow = rects.filter(rect => Math.abs(rect.top - rects[0].top) < Math.max(10, rects[0].height * .55)).length;
        const sameColumn = rects.filter(rect => Math.abs(rect.left - rects[0].left) < Math.max(12, rects[0].width * .18)).length;
        const threshold = Math.min(3, rects.length);
        if (sameRow >= threshold) return 'horizontal';
        if (sameColumn >= threshold) return 'vertical';
      } catch (_) {}
    }
    return 'unknown';
  }

  function canUseExpandableUiBilingual(el, translatedText = '') {
    if (!el) return false;
    try {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (rect.width < 148 || rect.height < 18) return false;
      if (['hidden', 'clip'].includes(style.overflowX) || ['hidden', 'clip'].includes(style.overflowY)) return false;
      if (style.textOverflow === 'ellipsis') return false;
      const maxHeight = parseFloat(style.maxHeight || '');
      if (Number.isFinite(maxHeight) && maxHeight > 0 && maxHeight < rect.height + 24) return false;
      if (el.hasAttribute('height') || el.style.height || el.style.maxHeight) return false;

      const usableWidth = rect.width - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
      if (usableWidth < 120) return false;
      const source = String(extractOriginalTextFromLiveDom(el) || '').trim();
      const longestToken = [...source.split(/\s+/), ...String(translatedText || '').split(/\s+/)]
        .reduce((longest, token) => token.length > longest.length ? token : longest, '');
      const fontSize = parseFloat(style.fontSize || '') || 14;
      if (longestToken.length * fontSize * .58 > usableWidth * .92) return false;
      return true;
    } catch (_) {
      return false;
    }
  }

  function shouldUseCompactUiReplacement(el, translatedText = '') {
    const control = el?.closest?.("a,button,summary,[role='tab'],[role='menuitem'],[role='option'],[role='button']") || el;
    if (!control) return true;
    if (isStructuredTocControl(control)) return true;
    if (control.matches?.("button,summary,[role='tab'],[role='menuitem'],[role='option'],[role='button'],[aria-haspopup],[aria-controls]")) return true;
    if (control.closest?.("header,[role='tablist'],[role='toolbar'],[role='menu'],.tab-bar,.tabs,.tablist,.toolbar,.breadcrumb")) return true;
    if (hasStickyOrFixedContext(control)) return true;

    const peerLayout = getPeerNavigationLayout(control);
    if (peerLayout === 'horizontal') return true;
    if (peerLayout === 'vertical') return !canUseExpandableUiBilingual(control, translatedText);

    try {
      const style = getComputedStyle(control);
      const rect = control.getBoundingClientRect();
      const clipped = ['hidden', 'clip'].includes(style.overflowX) || ['hidden', 'clip'].includes(style.overflowY) || style.textOverflow === 'ellipsis';
      const nowrap = style.whiteSpace === 'nowrap';
      const labelLength = Math.max(
        String(extractOriginalTextFromLiveDom(control) || '').trim().length,
        String(translatedText || '').trim().length
      );
      if (clipped || (nowrap && rect.width > 0 && rect.width < Math.min(240, labelLength * 12 + 28))) return true;
    } catch (_) {}

    // An uncertain navigation layout gets the stable single-line treatment.
    // Only clearly vertical, expandable groups receive a second bilingual row.
    return true;
  }

  function isUiChromeElement(el) {
    if (!el || isExtensionOwnedElement(el)) return false;
    if (isRichContentControl(el) || isArticleProseLink(el)) return false;
    if (el.matches?.(INTERACTIVE_UI_SELECTOR)) return true;
    if (el.closest?.(UI_CHROME_ANCESTOR_SELECTOR)) return true;
    if (hasPeerNavigationContext(el)) return true;
    if (hasStickyOrFixedContext(el)) {
      let node = el;
      let hint = '';
      for (let i = 0; node && i < 4; i++, node = node.parentElement) {
        hint += ` ${node.id || ''} ${typeof node.className === 'string' ? node.className : ''} ${node.getAttribute?.('role') || ''}`;
      }
      if (/(tab|nav|menu|toolbar|breadcrumb|switch|filter|category|genre|channel|section)/i.test(hint)) return true;
    }
    return false;
  }

  function isTranslationNoiseElement(el, rawText = "") {
    if (!el) return true;
    if (isRichContentControl(el)) return false;
    // Interactive chrome is handled separately and translated in place. It is
    // not article prose and must never receive a second bilingual block.
    if (isUiChromeElement(el)) return true;
    if (el.closest("footer, aside, [aria-hidden='true']")) return true;
    const owner = el.closest("section, div, ul, ol, article") || el;
    const hint = `${owner.id || ""} ${typeof owner.className === "string" ? owner.className : ""} ${owner.getAttribute?.("aria-label") || ""} ${owner.getAttribute?.("data-testid") || ""}`.toLowerCase();
    if (/(^|[-_\s])(share|sharing|social|follow|reaction|toolbar|actions?|utility|breadcrumb|pagination|nav|menu|footer|sidebar|related|recommend|newsletter|comment|outbrain|taboola)([-_\s]|$)/i.test(hint)) return true;
    const text = String(rawText || el.innerText || "").replace(/\s+/g, " ").trim();
    if (!text) return true;
    const links = Array.from(el.querySelectorAll?.("a") || []);
    const linkText = links.reduce((n,a) => n + String(a.innerText || a.textContent || "").trim().length, 0);
    if (text.length < 180 && links.length >= 2 && linkText / Math.max(text.length,1) > .72) return true;
    const iconCount = el.querySelectorAll?.("svg, use, img[alt=''], img[aria-hidden='true']")?.length || 0;
    if (text.length < 70 && iconCount >= 2 && links.length) return true;
    return false;
  }

  function isIgnoredTranslationNode(node) {
    const el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (!el) return true;
    if (isExtensionOwnedElement(el)) return true;
    if (el.closest?.("script, style, noscript, textarea, input, code, pre, kbd, svg, canvas, iframe, audio, video, rt, rp, [translate='no'], .notranslate, .sr-only, .visually-hidden, .screen-reader-text, [class*='visually-hidden'], [contenteditable='true'], [aria-hidden='true'], [hidden]")) return true;
    return false;
  }

  function originalTextForNode(node) {
    return inPlaceOriginalTextByNode.has(node) ? inPlaceOriginalTextByNode.get(node) : (node?.nodeValue || "");
  }

  function extractOriginalTextFromLiveDom(el) {
    if (!el) return "";
    const parts = [];
    try {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (isIgnoredTranslationNode(node)) return NodeFilter.FILTER_REJECT;
          return originalTextForNode(node).trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });
      while (walker.nextNode()) parts.push(originalTextForNode(walker.currentNode));
    } catch (_) {}
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  function getHostOriginalText(el) {
    if (!el) return "";
    try {
      // Legacy migration path: an older content script may already have stored
      // the pristine subtree before replacing innerHTML/textContent.
      const storedHtml = el.getAttribute?.("data-raccoon-orig-html");
      if (storedHtml != null) {
        const clone = document.createElement("div");
        clone.innerHTML = storedHtml;
        clone.querySelectorAll?.(TRANSLATION_EXTENSION_SELECTOR).forEach(node => node.remove());
        return String(clone.textContent || "").replace(/\s+/g, " ").trim();
      }

      // Replacement mode edits existing text nodes, so the registry remains the
      // authoritative source for the host page's original wording.
      const liveOriginal = extractOriginalTextFromLiveDom(el);
      if (liveOriginal) return liveOriginal;

      const clone = el.cloneNode(true);
      clone.querySelectorAll?.(TRANSLATION_EXTENSION_SELECTOR).forEach(node => node.remove());
      return String(clone.textContent || "").replace(/\s+/g, " ").trim();
    } catch (_) {
      return String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
    }
  }

  function isVisibleTranslationElement(el) {
    if (!el) return false;
    if (el.tagName === 'OPTION') return true;
    try {
      if (el.hidden || el.closest?.('[hidden], [inert], [aria-hidden="true"]')) return false;
      const hint = `${el.id || ''} ${typeof el.className === 'string' ? el.className : ''}`;
      if (/(^|[-_\s])(sr-only|screen-reader|screenreader|visually-hidden|a11y-hidden)([-_\s]|$)/i.test(hint)) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      if (parseFloat(cs.opacity || '1') === 0) return false;
      const rect = el.getBoundingClientRect();
      if (!el.getClientRects().length || rect.width <= 0 || rect.height <= 0) return false;
      if (rect.width <= 2 && rect.height <= 2 && (cs.position === 'absolute' || cs.position === 'fixed')) return false;
      if (cs.clipPath === 'inset(50%)' || /^rect\(0(px)?[,\s]+0(px)?[,\s]+0(px)?[,\s]+0(px)?\)$/i.test(cs.clip || '')) return false;
      return true;
    } catch (_) { return true; }
  }

  function collectReplaceTextUnits(container = document.body) {
    const units = [];
    const seenTextNodes = new Set();
    let walker;
    try {
      walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (seenTextNodes.has(node) || inPlaceTranslatedNodes.has(node) || isIgnoredTranslationNode(node)) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent || !isVisibleTranslationElement(parent)) return NodeFilter.FILTER_REJECT;
          const clean = String(node.nodeValue || '').replace(/\s+/g, ' ').trim();
          if (!isValidText(clean) || isIsolatedMetadata(clean)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
    } catch (_) { return units; }

    while (walker.nextNode()) {
      const node = walker.currentNode;
      seenTextNodes.add(node);
      const raw = String(node.nodeValue || '');
      const clean = raw.replace(/\s+/g, ' ').trim();
      const id = `txt_${++blockCounter}`;
      units.push({ id, kind: 'replace-text', text: clean, element: node.parentElement, textNode: node, rawText: raw });
      // Keep a generous guardrail for extremely text-heavy/virtualized pages.
      // Newly revealed content can still be picked up incrementally later.
      if (units.length >= 1800) break;
    }
    return units;
  }

  function collectUiTranslationUnits(container = document.body) {
    const units = [];
    const seen = new Set();
    const selector = [
      '[role="tab"]','[role="menuitem"]','[role="option"]','[aria-selected]','[data-tab]','.tab','button','summary',
      'nav a','header a','[role="navigation"] a','[role="toolbar"] a','[role="menu"] a',
      '.tab-bar a','.tabs a','.tablist a'
    ].join(',');

    queryScopedElements(container, selector).forEach(el => {
      const allowHiddenToc = isStructuredTocControl(el);
      if (!el || seen.has(el) || el.hasAttribute('data-raccoon-translated') || isCompactTranslationComponent(el) || isRichContentControl(el) || !isUiChromeElement(el) || (!allowHiddenToc && isIgnoredTranslationNode(el)) || (!allowHiddenToc && !isVisibleTranslationElement(el))) return;
      // Avoid nested duplicate labels such as <button role=tab><span>...</span>.
      const owner = el.parentElement?.closest?.(selector);
      if (owner && owner !== el && owner.contains(el)) return;
      const labelNodes = collectInPlaceLabelTextNodes(el);
      const text = labelNodes.map(node => originalTextForNode(node)).join(" ").replace(/\s+/g, " ").trim();
      if (!isValidText(text) || text.length > 140 || isIsolatedMetadata(text)) return;
      seen.add(el);
      const id = `ui_${++blockCounter}`;
      el.setAttribute('data-raccoon-id', id);
      units.push({ id, kind: 'ui-inplace', text, element: el });
    });
    return units;
  }

  function collectCompactComponentTextUnits(container = document.body) {
    const units = [];
    const seenNodes = new Set();
    const roots = queryScopedElements(container, ".infobox,.sidebar,.navbox,.vertical-navbox,.metadata,.ambox");
    const compactRoots = Array.from(new Set(roots)).filter(root => !roots.some(other => other !== root && other.contains?.(root)));

    compactRoots.forEach(root => {
      let walker;
      try {
        walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
          acceptNode(node) {
            if (seenNodes.has(node) || inPlaceTranslatedNodes.has(node) || isIgnoredTranslationNode(node)) return NodeFilter.FILTER_REJECT;
            const parent = node.parentElement;
            if (!parent || !isVisibleTranslationElement(parent)) return NodeFilter.FILTER_REJECT;
            if (parent.closest?.(".vector-toc-numb,.tocnumber,.mw-editsection,.noprint")) return NodeFilter.FILTER_REJECT;
            const clean = String(node.nodeValue || "").replace(/\s+/g, " ").trim();
            if (!isValidText(clean) || isIsolatedMetadata(clean)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }
        });
      } catch (_) { return; }
      while (walker.nextNode()) {
        const node = walker.currentNode;
        seenNodes.add(node);
        const raw = String(node.nodeValue || "");
        const clean = raw.replace(/\s+/g, " ").trim();
        const id = `cmp_${++blockCounter}`;
        units.push({ id, kind:"component-text", text:clean, element:node.parentElement, textNode:node, rawText:raw });
        if (units.length >= 900) return;
      }
    });
    return units;
  }

  function collectTranslatableBlocks(container = document.body) {
    if (currentSettings.displayMode === 'replace') return collectReplaceTextUnits(container);

    const candidates = [];
    const seen = new Set();
    const IGNORE_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT", "OPTION", "CODE", "PRE", "KBD", "SVG", "IFRAME", "AUDIO", "VIDEO"]);

    const append = (el, readerPrimary = false) => {
      if (!el || seen.has(el)) return;
      seen.add(el);
      if (el.hasAttribute("data-raccoon-id") || el.hasAttribute("data-raccoon-translated")) return;
      if (isExtensionOwnedElement(el)) return;
      if (isCompactTranslationComponent(el)) return;
      if (IGNORE_TAGS.has(el.tagName) || el.closest("[translate='no'], .notranslate, [contenteditable='true']")) return;
      if (el.tagName === 'LI' && el.querySelector(':scope > ul, :scope > ol')) return;
      const hasDeeperBlock = el.querySelector("p, h1, h2, h3, h4, h5, h6, blockquote, dd");
      if (hasDeeperBlock) return;
      const rawText = getHostOriginalText(el);
      if (!isValidText(rawText) || isIsolatedMetadata(rawText) || isTranslationNoiseElement(el, rawText)) return;
      const id = `blk_${++blockCounter}`;
      el.setAttribute("data-raccoon-id", id);
      if (readerPrimary) el.setAttribute("data-raccoon-reader-primary", "1");
      candidates.push({ id, kind: 'content-block', element: el, text: rawText });
    };

    if (currentSettings.displayMode === "sidebar" && container === document.body) {
      try {
        const readerContainer = findBestReaderContainer();
        collectReaderContentNodes(readerContainer).filter(node => node.tagName !== "IMG").forEach(node => append(node, true));
      } catch (_) {}
    }

    queryScopedElements(container, TRANSLATABLE_BLOCK_SELECTOR).forEach(el => append(el, false));

    // Some editorial cards are a single <a> made only from spans. They do not
    // match the normal paragraph selector, but they are still article content.
    // Appending the translation inside the anchor preserves both the original
    // label and the destination for the translated line.
    queryScopedElements(container, "a[href]").forEach(link => {
      if (!isRichContentControl(link)) return;
      if (link.querySelector(TRANSLATABLE_BLOCK_SELECTOR)) return;
      append(link, false);
    });

    // Bilingual mode keeps prose bilingual, but compact navigation controls use
    // a single translated label so tabs and breadcrumbs retain their geometry.
    if (currentSettings.displayMode === 'bilingual') {
      collectCompactComponentTextUnits(container).forEach(unit => candidates.push(unit));
      collectUiTranslationUnits(container).forEach(unit => candidates.push(unit));
    }
    return candidates;
  }

  function isValidText(text) {
    if (!text) return false;
    if (text.length < 2 && !/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(text)) return false;
    if (/^[\d\s\p{P}\p{S}]+$/u.test(text)) return false;
    if (/^(https?:\/\/|www\.)\S+$/i.test(text)) return false;
    return true;
  }

  function isIsolatedMetadata(text) {
    const lower = text.toLowerCase();
    return lower === "member-only story" ||
           lower.includes("min read") ||
           lower.startsWith("· published in") ||
           lower === "featured" ||
           lower === "follow";
  }

  function languageCodeToSpeechTag(lang) {
    const value = String(lang || "").toLowerCase();
    if (value.startsWith("ja")) return "ja-JP";
    if (value.startsWith("zh-tw") || value.startsWith("zh-hk")) return "zh-TW";
    if (value.startsWith("zh")) return "zh-CN";
    if (value.startsWith("ko")) return "ko-KR";
    if (value.startsWith("fr")) return "fr-FR";
    if (value.startsWith("de")) return "de-DE";
    if (value.startsWith("es")) return "es-ES";
    return "en-US";
  }

  function inferSpeechLanguage(text, preferred = "auto") {
    const t = String(text || "");
    const kana = (t.match(/[\u3040-\u30ff]/g) || []).length;
    const han = (t.match(/[\u3400-\u9fff]/g) || []).length;
    const hangul = (t.match(/[\uac00-\ud7af]/g) || []).length;
    const latin = (t.match(/[A-Za-z]/g) || []).length;
    if (kana >= 2) return "ja-JP";
    if (hangul >= 2) return "ko-KR";
    if (han > Math.max(3, latin * .35)) return "zh-CN";
    if (preferred && preferred !== "auto") return languageCodeToSpeechTag(preferred);
    const declared = (document.documentElement.lang || "").toLowerCase();
    return languageCodeToSpeechTag(declared || "en");
  }

  function applyNativeReferenceStyle(origEl, transNode) {
    if (!origEl || !transNode || currentSettings.renderStyle !== "native") return;
    try {
      const cs = window.getComputedStyle(origEl);
      const copy = ["font-size", "line-height", "font-weight", "letter-spacing", "text-align", "text-transform", "font-variant", "word-spacing"];
      copy.forEach(prop => {
        const value = cs.getPropertyValue(prop);
        if (value) transNode.style.setProperty(prop, value, "important");
      });
      // Reference mode keeps the host font, while colour still obeys the same
      // minimum-contrast rule as every other translation style.
      transNode.style.setProperty("font-family", cs.fontFamily || "inherit", "important");
      applyAdaptiveTranslationColor(origEl, transNode, cs.color, cs);
    } catch (_) {}
  }

  function getExactSelectionRange() {
    try {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount < 1 || sel.isCollapsed) return null;
      const range = sel.getRangeAt(0);
      if (!range || !range.toString().trim()) return null;
      if (selectionRoot && selectionRoot.contains(range.commonAncestorContainer)) return null;
      return range.cloneRange();
    } catch (_) { return null; }
  }

  function wrapTextRangeWithHighlight(range, highlightId = "") {
    if (!range || range.collapsed) return false;
    const rootNode = range.commonAncestorContainer.nodeType === Node.TEXT_NODE ? range.commonAncestorContainer.parentElement : range.commonAncestorContainer;
    if (!rootNode) return false;
    const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent || parent.closest("#raccoon-selection-bubble-root, #raccoon-floating-ball-root, #raccoon-sidebar-root")) return NodeFilter.FILTER_REJECT;
        try { return range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; } catch (_) { return NodeFilter.FILTER_REJECT; }
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    if (!nodes.length && range.startContainer.nodeType === Node.TEXT_NODE) nodes.push(range.startContainer);
    let didWrap = false;
    // Reverse order keeps earlier offsets stable while splitting text nodes.
    nodes.reverse().forEach(node => {
      let start = 0, end = node.nodeValue.length;
      if (node === range.startContainer) start = range.startOffset;
      if (node === range.endContainer) end = range.endOffset;
      if (range.startContainer === range.endContainer && node === range.startContainer) { start = range.startOffset; end = range.endOffset; }
      if (end <= start) return;
      try {
        let target = node;
        if (end < target.nodeValue.length) target.splitText(end);
        if (start > 0) target = target.splitText(start);
        if (!target.nodeValue.trim()) return;
        if (target.parentElement?.classList.contains("minimal-text-highlight")) return;
        const mark = document.createElement("mark");
        mark.className = "minimal-text-highlight";
        if (highlightId) mark.dataset.highlightId = highlightId;
        target.parentNode.insertBefore(mark, target);
        mark.appendChild(target);
        didWrap = true;
      } catch (_) {}
    });
    return didWrap;
  }

  function highlightElementTextOnly(el) {
    if (!el) return false;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim() || node.parentElement?.closest(".raccoon-block-actions")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes=[]; while(walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => {
      if (node.parentElement?.classList.contains("minimal-text-highlight")) return;
      const mark=document.createElement("mark"); mark.className="minimal-text-highlight";
      node.parentNode.insertBefore(mark,node); mark.appendChild(node);
    });
    return nodes.length > 0;
  }

  function findTranslationForSelection(range) {
    try {
      const node = range?.commonAncestorContainer;
      const el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      const readerItem = el?.closest?.(".reader-bilingual-item, .reader-content-item");
      const readerTrans = readerItem?.querySelector?.(".reader-trans-text, .reader-translated-text");
      if (readerTrans?.innerText) return readerTrans.innerText.trim();
      const origBlock = el?.closest?.("[data-raccoon-translated='true']");
      const next = origBlock?.nextElementSibling;
      if (next?.classList?.contains("raccoon-translated-block")) return next.innerText.trim();
    } catch (_) {}
    return "";
  }

  function saveExactHighlight(text, range, translation = "", id = "") {
    const clean = String(text || "").trim();
    if (!clean) return "";
    const highlightId = id || `hl_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    chrome.runtime.sendMessage({ action: "ADD_HIGHLIGHT_SENTENCE", item: {
      id: highlightId,
      orig: clean,
      trans: translation || findTranslationForSelection(range),
      sourceUrl: window.location.href,
      title: document.title,
      date: new Date().toLocaleDateString()
    }}, () => { if (chrome.runtime.lastError) {} });
    return highlightId;
  }

  function collectInPlaceLabelTextNodes(el) {
    const nodes = [];
    const allowHiddenToc = isStructuredTocControl(el);
    try {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          if (!allowHiddenToc && isIgnoredTranslationNode(node)) return NodeFilter.FILTER_REJECT;
          if (node.parentElement?.closest?.(".vector-toc-numb,.tocnumber,.mw-editsection,.noprint")) return NodeFilter.FILTER_REJECT;
          const clean = String(originalTextForNode(node) || '').replace(/\s+/g, ' ').trim();
          if (!clean || /^[\d\s\p{P}\p{S}]+$/u.test(clean)) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      while (walker.nextNode()) nodes.push(walker.currentNode);
    } catch (_) {}
    return nodes;
  }

  function rememberInPlaceRecord(id, element, nodes, kind, translatedText = '') {
    const saved = nodes.map(node => {
      if (!inPlaceOriginalTextByNode.has(node)) inPlaceOriginalTextByNode.set(node, node.nodeValue || '');
      return { node, original: inPlaceOriginalTextByNode.get(node) };
    });
    const record = { id, element, nodes: saved, kind, translatedText };
    inPlaceTranslationRecords.set(id, record);
    nodes.forEach(node => inPlaceTranslatedNodes.add(node));
    return record;
  }

  function rememberInlineStyles(record, names) {
    if (!record?.element || !Array.isArray(names)) return;
    record.inlineStyles = names.map(name => ({
      name,
      value: record.element.style.getPropertyValue(name),
      priority: record.element.style.getPropertyPriority(name)
    }));
  }

  function restoreRememberedInlineStyles(record) {
    if (!record?.element || !Array.isArray(record.inlineStyles)) return;
    record.inlineStyles.forEach(({name, value, priority}) => {
      if (value) record.element.style.setProperty(name, value, priority || '');
      else record.element.style.removeProperty(name);
    });
  }

  function positionExpandableUiTranslation(record, line) {
    const element = record?.element;
    if (!element || !line) return;
    try {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const paddingLeft = Math.max(0, parseFloat(style.paddingLeft) || 0);
      const paddingRight = Math.max(0, parseFloat(style.paddingRight) || 0);
      const paddingBottom = Math.max(0, parseFloat(style.paddingBottom) || 0);
      let lineLeft = paddingLeft;
      const leadingVisual = Array.from(element.querySelectorAll(':scope > svg, :scope > img, :scope > picture, :scope > [aria-hidden="true"]'))
        .map(node => node.getBoundingClientRect())
        .find(iconRect => iconRect.width > 0 && iconRect.right <= rect.left + Math.min(rect.width * .46, 92));
      if (leadingVisual) lineLeft = Math.max(lineLeft, leadingVisual.right - rect.left + 7);

      rememberInlineStyles(record, ['position', 'padding-bottom', 'min-height']);
      if (style.position === 'static') element.style.setProperty('position', 'relative', 'important');
      line.style.setProperty('left', `${Math.round(lineLeft)}px`, 'important');
      line.style.setProperty('right', `${Math.round(paddingRight)}px`, 'important');
      line.style.setProperty('bottom', `${Math.round(paddingBottom)}px`, 'important');
      line.style.setProperty('visibility', 'hidden', 'important');
      element.appendChild(line);

      const measuredLineHeight = Math.max(16, Math.ceil(line.scrollHeight || (parseFloat(style.fontSize) || 14) * 1.35));
      const extraHeight = Math.min(46, measuredLineHeight + 4);
      element.style.setProperty('padding-bottom', `${Math.ceil(paddingBottom + extraHeight)}px`, 'important');
      element.style.setProperty('min-height', `${Math.ceil(rect.height + extraHeight)}px`, 'important');
      line.style.removeProperty('visibility');
    } catch (_) {
      element.appendChild(line);
    }
  }

  function setCompactUiLabel(record, showOriginal) {
    const saved = record?.nodes || [];
    if (!saved.length) return;
    if (showOriginal) {
      saved.forEach(({node, original}) => {
        try { if (node?.isConnected) node.nodeValue = original; } catch (_) {}
      });
      record.element?.setAttribute?.('data-raccoon-ui-showing', 'original');
      return;
    }
    saved.forEach(({node, original}, index) => {
      if (!node?.isConnected) return;
      const leading = original.match(/^\s*/)?.[0] || '';
      const trailing = original.match(/\s*$/)?.[0] || '';
      node.nodeValue = index === 0
        ? `${leading}${record.translatedText}${saved.length === 1 ? trailing : ''}`
        : (index === saved.length - 1 ? trailing : '');
    });
    record.element?.setAttribute?.('data-raccoon-ui-showing', 'translation');
  }

  function bindCompactUiOriginalPreview(record) {
    const element = record?.element;
    if (!element) return;
    const controller = new AbortController();
    record.interactionController = controller;
    const showOriginal = () => setCompactUiLabel(record, true);
    const restoreTranslation = () => {
      if (element.matches?.(':hover') || element.contains?.(document.activeElement)) return;
      setCompactUiLabel(record, false);
    };
    element.addEventListener('mouseenter', showOriginal, { signal: controller.signal });
    element.addEventListener('mouseleave', restoreTranslation, { signal: controller.signal });
    element.addEventListener('focusin', showOriginal, { signal: controller.signal });
    element.addEventListener('focusout', () => requestAnimationFrame(restoreTranslation), { signal: controller.signal });
  }

  function applyReplaceTextUnit(unit, translatedText) {
    const node = unit?.textNode;
    if (!node || !node.parentNode) return false;
    if (!isVisibleTranslationElement(node.parentElement)) return false;
    const raw = unit.rawText ?? node.nodeValue ?? '';
    if (!inPlaceOriginalTextByNode.has(node)) inPlaceOriginalTextByNode.set(node, raw);
    const original = inPlaceOriginalTextByNode.get(node) || raw;
    const leading = original.match(/^\s*/)?.[0] || '';
    const trailing = original.match(/\s*$/)?.[0] || '';
    rememberInPlaceRecord(unit.id, node.parentElement, [node], 'replace-text', translatedText);
    node.nodeValue = `${leading}${String(translatedText || '').trim()}${trailing}`;
    const parent = node.parentElement;
    if (parent) {
      const sourceStyle = getComputedStyle(parent);
      const baseSize = parseFloat(parent.dataset.raccoonBaseFontSize || "") || parseFloat(sourceStyle.fontSize || "") || 16;
      const ratio = (parseInt(currentSettings.fontSizeRatio, 10) || 100) / 100;
      parent.dataset.raccoonBaseFontSize = String(baseSize);
      parent.dataset.raccoonSourceColor = sourceStyle.color || "";
      parent.style.setProperty("--raccoon-source-text-decoration", sourceStyle.textDecorationLine || "none");
      parent.style.setProperty("--raccoon-replace-base-size", `${baseSize}px`);
      parent.style.setProperty("--raccoon-replace-font-size", `${Math.round(baseSize * ratio * 100) / 100}px`);
      parent.setAttribute("data-render-style", activePageRenderStyle());
      const preferredColor = activePageRenderStyle() === "native"
        ? sourceStyle.color
        : getComputedStyle(document.documentElement).getPropertyValue("--raccoon-text-color");
      applyAdaptiveTranslationColor(parent, parent, preferredColor, sourceStyle);
      parent.classList.add('raccoon-dom-preserved-translation','raccoon-replaced-text');
      refreshRenderedTranslationContrast(parent, parent, activePageRenderStyle(), activePageRenderStyle() === "native" ? parent.dataset.raccoonSourceColor : "");
      // Furigana belongs to the original Japanese glyphs. Once the ruby base is
      // replaced, keeping <rt>/<rp> above the translated label is misleading.
      parent.closest?.('ruby')?.classList?.add('raccoon-replaced-ruby');
      if (isUiChromeElement(parent)) adaptTranslatedUiLayout(parent);
    }
    return true;
  }

  function applyCompactComponentTextUnit(unit, translatedText) {
    const node = unit?.textNode;
    if (!node?.parentNode || !isVisibleTranslationElement(node.parentElement)) return false;
    const raw = unit.rawText ?? node.nodeValue ?? "";
    if (!inPlaceOriginalTextByNode.has(node)) inPlaceOriginalTextByNode.set(node, raw);
    const record = rememberInPlaceRecord(unit.id, node.parentElement, [node], "component-text", String(translatedText || "").trim());
    setCompactUiLabel(record, false);
    bindCompactUiOriginalPreview(record);
    node.parentElement.classList.add("raccoon-component-translated");
    return true;
  }

  function adaptTranslatedUiLayout(el) {
    if (!el) return;
    const role = String(el.getAttribute?.('role') || '').toLowerCase();
    const tabLike = role === 'tab' || !!el.closest?.('[role="tablist"], .tabs, .tab-bar, .tablist');
    if (!tabLike) return;
    const tablist = role === 'tab' ? el.closest?.('[role="tablist"], .tabs, .tab-bar, .tablist') : el.closest?.('[role="tablist"], .tabs, .tab-bar, .tablist');
    requestAnimationFrame(() => {
      try {
        const rect = el.getBoundingClientRect();
        const need = Math.ceil(Math.max(rect.width, el.scrollWidth || 0));
        if (need > rect.width + 3) {
          el.style.setProperty('--raccoon-ui-min-width', `${Math.min(Math.max(need + 14, rect.width), 360)}px`);
          el.classList.add('raccoon-ui-expand');
          tablist?.classList?.add('raccoon-tablist-overflow');
        }
        const neededHeight = Math.ceil(el.scrollHeight || 0);
        if (neededHeight > rect.height + 2) {
          el.style.setProperty('--raccoon-ui-min-height', `${Math.min(neededHeight + 4, 104)}px`);
          el.classList.add('raccoon-ui-expand-y');
        }
      } catch (_) {}
    });
  }

  function renderUiTranslationInPlace(origEl, translatedText, id = '') {
    if (!origEl || (!isStructuredTocControl(origEl) && !isVisibleTranslationElement(origEl))) return false;
    const nodes = collectInPlaceLabelTextNodes(origEl);
    if (!nodes.length) return false;
    const recordId = id || origEl.getAttribute('data-raccoon-id') || `ui_${++blockCounter}`;
    const cleanTranslation = String(translatedText || '').replace(/\s+/g, ' ').trim();
    if (!cleanTranslation) return false;
    if (shouldUseCompactUiReplacement(origEl, cleanTranslation)) {
      const record = rememberInPlaceRecord(recordId, origEl, nodes, 'ui-compact', cleanTranslation);
      setCompactUiLabel(record, false);
      bindCompactUiOriginalPreview(record);
      origEl.classList.add('raccoon-ui-translated', 'raccoon-ui-compact');
      origEl.setAttribute('data-raccoon-ui-mode', 'compact');
    } else {
      const line = document.createElement('span');
      line.className = 'raccoon-ui-translation-line';
      line.textContent = cleanTranslation;
      line.setAttribute('aria-hidden', 'true');
      const record = rememberInPlaceRecord(recordId, origEl, nodes, 'ui-bilingual', cleanTranslation);
      record.addedNode = line;
      origEl.classList.add('raccoon-ui-translated', 'raccoon-ui-bilingual');
      positionExpandableUiTranslation(record, line);
      origEl.setAttribute('data-raccoon-ui-mode', 'bilingual');
    }
    adaptTranslatedUiLayout(origEl);
    origEl.setAttribute('data-raccoon-translated', 'true');
    return true;
  }

  function restoreInPlaceTranslations() {
    inPlaceTranslationRecords.forEach(record => {
      try { record.interactionController?.abort?.(); } catch (_) {}
      (record.nodes || []).forEach(({node, original}) => {
        try { if (node?.isConnected) node.nodeValue = original; } catch (_) {}
      });
      try { record.addedNode?.remove?.(); } catch (_) {}
      try { restoreRememberedInlineStyles(record); } catch (_) {}
      try {
        record.element?.classList?.remove('raccoon-ui-translated', 'raccoon-ui-bilingual', 'raccoon-ui-bilingual-flex', 'raccoon-ui-compact', 'raccoon-ui-replaced', 'raccoon-ui-expand', 'raccoon-ui-expand-y', 'raccoon-dom-preserved-translation', 'raccoon-replaced-text', 'raccoon-component-translated');
        record.element?.removeAttribute?.('data-render-style');
        record.element?.removeAttribute?.('data-raccoon-ui-mode');
        record.element?.removeAttribute?.('data-raccoon-ui-showing');
        if (record.kind === 'replace-text' && record.element?.dataset) delete record.element.dataset.raccoonBaseFontSize;
        if (record.kind === 'replace-text' && record.element?.dataset) delete record.element.dataset.raccoonSourceColor;
        record.element?.style?.removeProperty('--raccoon-ui-min-width');
        record.element?.style?.removeProperty('--raccoon-ui-min-height');
        record.element?.style?.removeProperty('--raccoon-replace-base-size');
        record.element?.style?.removeProperty('--raccoon-replace-font-size');
        record.element?.style?.removeProperty('--raccoon-local-text-color');
        record.element?.style?.removeProperty('--raccoon-source-text-decoration');
      } catch (_) {}
    });
    document.querySelectorAll('.raccoon-tablist-overflow').forEach(el => el.classList.remove('raccoon-tablist-overflow'));
    document.querySelectorAll('.raccoon-replaced-ruby').forEach(el => el.classList.remove('raccoon-replaced-ruby'));
    inPlaceTranslationRecords.clear();
    inPlaceOriginalTextByNode = new WeakMap();
    inPlaceTranslatedNodes = new WeakSet();
  }

  function renderTranslationNode(origEl, translatedText, meta = null) {
    const allowHiddenToc = meta?.kind === 'ui-inplace' && isStructuredTocControl(origEl);
    if (!origEl || !origEl.parentNode || (!allowHiddenToc && !isVisibleTranslationElement(origEl))) return;

    if (meta?.kind === 'replace-text') {
      applyReplaceTextUnit(meta, translatedText);
      return;
    }

    if (meta?.kind === 'component-text') {
      applyCompactComponentTextUnit(meta, translatedText);
      return;
    }

    if (meta?.kind === 'ui-inplace' || isUiChromeElement(origEl)) {
      renderUiTranslationInPlace(origEl, translatedText, meta?.id || '');
      return;
    }

    if (origEl.hasAttribute("data-raccoon-translated")) return;
    origEl.setAttribute("data-raccoon-translated", "true");

    const origRawText = getHostOriginalText(origEl);
    const isNavOrTab = false;
    const isRichLinkedContent = origEl.tagName === "A" && isRichContentControl(origEl);
    let attachShortLabel = origEl.tagName === "A" && isRichLinkedContent;
    // A figcaption can be rendered as table-caption (Wikipedia does this).
    // Inserting a sibling DIV into that formatting context reorders geometry and
    // visually overlaps the caption; keep its translation inside the caption.
    if (origEl.tagName === "FIGCAPTION") attachShortLabel = true;
    if (!attachShortLabel && /^(P|DIV|SPAN|H[1-6]|BLOCKQUOTE|DT|DD)$/.test(origEl.tagName || "")) {
      try {
        const parentStyle = getComputedStyle(origEl.parentElement);
        const ownStyle = getComputedStyle(origEl);
        const parentIsGrid = parentStyle.display.includes("grid");
        const parentIsRowFlex = parentStyle.display.includes("flex") && !parentStyle.flexDirection.startsWith("column");
        const canOwnTranslation = !ownStyle.display.includes("flex") && !ownStyle.display.includes("grid") && !origEl.querySelector("p,h1,h2,h3,h4,h5,h6,blockquote,table");
        attachShortLabel = canOwnTranslation && (parentIsGrid || parentIsRowFlex);
      } catch (_) {}
    }

    const isTableCell = origEl.tagName === "TD" || origEl.tagName === "TH";
    const isInline = origEl.tagName === "SPAN" || isNavOrTab;
    const transNode = document.createElement(isInline || attachShortLabel ? "span" : "div");
    transNode.className = isInline ? "raccoon-translated-inline" : "raccoon-translated-block";
    transNode.__raccoonSourceElement = origEl;
    const sourceId = meta?.id || origEl.getAttribute("data-raccoon-id") || "";
    if (sourceId) transNode.setAttribute("data-raccoon-source-id", sourceId);
    if (attachShortLabel) transNode.classList.add("raccoon-attached-translation");
    transNode.setAttribute("data-render-style", currentSettings.renderStyle || "classic");

    const fontFam = getFontFamilyCss(currentSettings.fontFamily || "system");
    if (currentSettings.renderStyle === "native") applyNativeReferenceStyle(origEl, transNode);
    else {
      transNode.style.setProperty("font-family", fontFam, "important");
    }
    applySourceTypographyScale(origEl, transNode);

    const origHighlights = origEl.querySelectorAll("mark, [style*='background']");
    if (origHighlights.length > 0) {
      transNode.classList.add("has-orig-highlight");
    }

    const translationTextNode = document.createElement("span");
    translationTextNode.className = "raccoon-translation-text";
    translationTextNode.textContent = translatedText;
    transNode.appendChild(translationTextNode);

    if (!isInline && !attachShortLabel) {
      const actions = document.createElement("div");
      actions.className = "raccoon-block-actions";
      actions.innerHTML = `
        <button class="raccoon-action-btn" title="朗读原文" data-action="speak-orig">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
          <span>原文</span>
        </button>
        <button class="raccoon-action-btn" title="朗读译文" data-action="speak-trans">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
          <span>译文</span>
        </button>
        <button class="raccoon-action-btn" title="高亮此句并加入收藏" data-action="highlight">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m9 11-6 6v3h3l6-6"/><path d="m22 7-3-3a2 2 0 0 0-2.83 0L13 7l5 5 3.17-3.17a2 2 0 0 0 0-2.83z"/></svg>
          <span>高亮</span>
        </button>
        <button class="raccoon-action-btn" title="复制译文" data-action="copy">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          <span>复制</span>
        </button>
      `;
      actions.addEventListener("click", (e) => {
        e.stopPropagation();
        const btn = e.target.closest(".raccoon-action-btn");
        if (!btn) return;
        const action = btn.getAttribute("data-action");
        if (action === "copy") {
          navigator.clipboard.writeText(translatedText);
          btn.querySelector("span").textContent = "已复制";
          setTimeout(() => { btn.querySelector("span").textContent = "复制"; }, 1200);
        } else if (action === "speak-orig") {
          speakTextNeural(origRawText, inferSpeechLanguage(origRawText, currentSettings.sourceLang));
        } else if (action === "speak-trans") {
          speakTextNeural(translatedText, languageCodeToSpeechTag(currentSettings.targetLang));
        } else if (action === "highlight") {
          const range = getExactSelectionRange();
          const selected = range ? range.toString().trim() : "";
          const rangeInsideOrig = range && origEl.contains(range.commonAncestorContainer);
          if (rangeInsideOrig && selected) {
            const id = `hl_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
            if (wrapTextRangeWithHighlight(range, id)) saveExactHighlight(selected, range, translatedText, id);
          } else {
            highlightElementTextOnly(origEl);
            saveExactHighlight(origRawText, null, translatedText);
          }
          btn.querySelector("span").textContent = "已高亮";
          setTimeout(() => { btn.querySelector("span").textContent = "高亮"; }, 1500);
        }
      });
      transNode.appendChild(actions);
    }

    if (attachShortLabel || origEl.tagName === "LI" || isTableCell || isInline) {
      if (isRichLinkedContent) {
        const textHost = Array.from(origEl.children || []).reverse().find(child => {
          if (child.matches?.("img,picture,video,canvas,svg")) return false;
          return String(child.innerText || child.textContent || "").replace(/\s+/g, " ").trim().length >= 24;
        }) || origEl;
        transNode.classList.add("raccoon-linked-card-translation");
        textHost.appendChild(transNode);
      } else {
        origEl.appendChild(transNode);
      }
    } else {
      if (origEl.nextSibling) {
        origEl.parentNode.insertBefore(transNode, origEl.nextSibling);
      } else {
        origEl.parentNode.appendChild(transNode);
      }

      // Preserve the host element's own margins, but use them to tune spacing
      // on our generated translation. This keeps the source+translation pair
      // visually close without ever rewriting website CSS.
      try {
        const hostStyle = getComputedStyle(origEl);
        const hostBottom = Math.max(0, parseFloat(hostStyle.marginBottom) || 0);
        const preferredGap = Math.max(5, Math.min(8, parseFloat(currentSettings.paragraphSpacing) || 6));
        // A negative margin can collapse through host paragraphs and visibly
        // overlap the selectable source line. Keep the pair close with a small,
        // always-positive gap and leave the website's own margins untouched.
        const offset = preferredGap;
        const after = Math.min(28, Math.max(10, hostBottom || 16));
        transNode.style.setProperty("--raccoon-proximity-offset", `${offset}px`);
        transNode.style.setProperty("--raccoon-proximity-after", `${after}px`);
      } catch (_) {}
    }
    refreshRenderedTranslationContrast(origEl, transNode);
    translationRevealBySource.set(origEl, transNode);
  }

  function reRenderAllTranslatedBlocks() {
    restoreInPlaceTranslations();
    document.querySelectorAll(".raccoon-translated-block, .raccoon-translated-inline").forEach(el => el.remove());
    document.querySelectorAll("[data-raccoon-orig-html]").forEach(el => {
      el.innerHTML = el.getAttribute("data-raccoon-orig-html");
      el.removeAttribute("data-raccoon-orig-html");
      el.classList.remove("raccoon-replaced-text");
      delete el.dataset.raccoonBaseFontSize;
      delete el.dataset.raccoonSourceColor;
      el.style.removeProperty("--raccoon-replace-base-size");
      el.style.removeProperty("--raccoon-replace-font-size");
      el.style.removeProperty("--raccoon-local-text-color");
    });
    document.querySelectorAll("[data-raccoon-translated]").forEach(el => {
      el.removeAttribute("data-raccoon-translated");
    });

    paragraphMap.forEach((val) => {
      if (val.el && val.transText) {
        renderTranslationNode(val.el, val.transText);
      }
    });
  }

  /**
   * 鼠标悬停段落单段翻译快捷触发器
   */
  let hoverTriggerRoot = null;
  let hoverHideTimer = null;

  function initHoverSingleParagraphTranslate() {
    if (hoverTriggerRoot) return;

    const root = document.createElement("div");
    root.id = "raccoon-hover-trigger-root";
    document.documentElement.appendChild(root);
    hoverTriggerRoot = root;

    root.addEventListener("mouseenter", () => clearTimeout(hoverHideTimer));
    root.addEventListener("mouseleave", () => hideHoverTranslateButton());

    document.addEventListener("mouseover", (e) => {
      if (!currentSettings.enableParagraphHoverTranslate || isCurrentHostExcluded("hover")) { hideHoverTranslateButton(); return; }
      if (isPageTranslated) return;

      const target = e.target.closest("p, h1, h2, h3, h4, h5, h6, li, blockquote, dd");
      if (!target) {
        if (!hoverTriggerRoot.contains(e.target)) hideHoverTranslateButton();
        return;
      }

      if (target.hasAttribute("data-raccoon-translated") || target.closest(".raccoon-translated-block, #raccoon-sidebar-root, #raccoon-reader-root")) {
        hideHoverTranslateButton();
        return;
      }

      const text = target.innerText ? target.innerText.trim() : "";
      if (!isValidText(text) || isIsolatedMetadata(text)) {
        hideHoverTranslateButton();
        return;
      }

      clearTimeout(hoverHideTimer);
      showHoverTranslateButton(target);
    });
  }

  function showHoverTranslateButton(target) {
    if (!hoverTriggerRoot || !target) return;
    const rect = target.getBoundingClientRect();
    if (rect.width < 60 || rect.height < 14) return;

    // Keep the control outside the paragraph so it does not cover selectable text.
    const size = 26;
    let top = Math.max(8, Math.min(rect.top + 2, window.innerHeight - size - 8));
    let left;
    if (rect.right + size + 10 <= window.innerWidth) {
      left = rect.right + 7;
    } else if (rect.left - size - 8 >= 0) {
      left = rect.left - size - 7;
    } else {
      top = Math.max(8, rect.top - size - 5);
      left = Math.max(8, Math.min(rect.right - size, window.innerWidth - size - 8));
    }

    hoverTriggerRoot.innerHTML = `
      <button type="button" class="raccoon-hover-single-btn" title="翻译此段" aria-label="翻译此段" style="top:${top}px !important; left:${left}px !important;">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>
      </button>
    `;

    const btn = hoverTriggerRoot.querySelector(".raccoon-hover-single-btn");
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      btn.classList.add("is-loading");
      btn.disabled = true;
      const text = target.innerText.trim();

      chrome.runtime.sendMessage({
        action: "TRANSLATE_SINGLE_BLOCK",
        text,
        sl: currentSettings.sourceLang || "auto",
        tl: currentSettings.targetLang || "zh-CN"
      }, (res) => {
        hoverTriggerRoot.innerHTML = "";
        if (res && res.success && res.text) renderTranslationNode(target, res.text);
      });
    });
  }

  function hideHoverTranslateButton() {
    clearTimeout(hoverHideTimer);
    hoverHideTimer = setTimeout(() => {
      if (hoverTriggerRoot) hoverTriggerRoot.innerHTML = "";
    }, 280);
  }

  /** Independent bilingual sidebar with resizable width and paragraph speech. */
  let sidebarRoot = null;
  let sidebarScrollHandler = null;
  let sidebarUserScrollUntil = 0;
  let sidebarNavigationLockUntil = 0;
  let sidebarNavigationTimer = null;
  let sidebarPrimaryArticleSet = null;
  let sidebarOrderMap = new Map();
  let sidebarReaderMode = false;
  let sidebarShowExtraContent = false;
  let sidebarPreviousDisplayMode = null;
  let originalBodyMarginRight = null;
  let originalBodyMarginLeft = null;
  let originalBodyTransition = null;

  function applySidebarPageSpace(widthPx) {
    if (!document.body) return;
    if (originalBodyMarginRight === null) {
      originalBodyMarginRight = document.body.style.marginRight || "";
      originalBodyMarginLeft = document.body.style.marginLeft || "";
      originalBodyTransition = document.body.style.transition || "";
    }
    const side = currentSettings.sidebarSide === "left" ? "left" : "right";
    const otherSide = side === "left" ? "right" : "left";
    document.documentElement.style.setProperty("--raccoon-sidebar-width", `${widthPx}px`);
    if (otherSide === "right") {
      if (originalBodyMarginRight) document.body.style.setProperty("margin-right", originalBodyMarginRight); else document.body.style.removeProperty("margin-right");
    } else {
      if (originalBodyMarginLeft) document.body.style.setProperty("margin-left", originalBodyMarginLeft); else document.body.style.removeProperty("margin-left");
    }
    document.body.style.setProperty(`margin-${side}`, `${widthPx}px`, "important");
    document.body.style.setProperty("transition", `margin-${side} 180ms cubic-bezier(0.16,1,0.3,1)`, "important");
    if (sidebarReaderMode && readerRoot?.isConnected) {
      readerRoot.style.setProperty("width", `calc(100vw - ${widthPx}px)`, "important");
      readerRoot.style.setProperty("left", side === "left" ? `${widthPx}px` : "0px", "important");
      readerRoot.style.setProperty("right", side === "right" ? `${widthPx}px` : "auto", "important");
      readerRoot.style.setProperty("transition", "width 180ms cubic-bezier(0.16,1,0.3,1), left 180ms cubic-bezier(0.16,1,0.3,1)", "important");
    }
    document.documentElement.classList.add("raccoon-sidebar-page-shifted");
    document.documentElement.setAttribute("data-raccoon-sidebar-side", side);
  }

  function restoreSidebarPageSpace() {
    if (!document.body) return;
    if (originalBodyMarginRight !== null) {
      if (originalBodyMarginRight) document.body.style.setProperty("margin-right", originalBodyMarginRight);
      else document.body.style.removeProperty("margin-right");
      if (originalBodyMarginLeft) document.body.style.setProperty("margin-left", originalBodyMarginLeft);
      else document.body.style.removeProperty("margin-left");
    }
    if (originalBodyTransition) document.body.style.setProperty("transition", originalBodyTransition);
    else document.body.style.removeProperty("transition");
    document.documentElement.classList.remove("raccoon-sidebar-page-shifted");
    document.documentElement.removeAttribute("data-raccoon-sidebar-side");
    if (readerRoot?.isConnected) {
      readerRoot.style.removeProperty("width");
      readerRoot.style.removeProperty("left");
      readerRoot.style.removeProperty("right");
      readerRoot.style.removeProperty("transition");
    }
    originalBodyMarginRight = null;
    originalBodyTransition = null;
  }

  function toggleSidebar() {
    if (isSidebarOpen) {
      requestSidebarClose();
      return;
    }

    // 阅读模式拥有自己的正文 DOM；不能再回头扫描被阅读层覆盖的原网页。
    // 直接以 reader-paragraph-pair 的 DOM 顺序生成分栏，保证标题/正文顺序与阅读页完全一致。
    if (isReaderOpen && readerRoot?.isConnected) {
      openSidebar();
      return;
    }

    if (!isPageTranslated) {
      sidebarPreviousDisplayMode = currentSettings.displayMode === 'sidebar' ? 'bilingual' : currentSettings.displayMode;
      currentSettings.displayMode = "sidebar";
      startPageTranslation();
    } else {
      openSidebar();
      paragraphMap.forEach((val, blockId) => {
        renderSidebarItem(blockId, val.el, val.origText, val.transText);
      });
      initSidebarScrollSync();
    }
  }

  function openSidebar() {
    if (document.getElementById("raccoon-sidebar-root")) return;

    const root = document.createElement("div");
    root.id = "raccoon-sidebar-root";
    root.dataset.side = currentSettings.sidebarSide === "left" ? "left" : "right";
    sidebarShowExtraContent = false;
    sidebarItemIndexCounter = 0;
    sidebarOrderMap = new Map();
    sidebarReaderMode = !!(isReaderOpen && readerRoot?.isConnected);
    try {
      if (sidebarReaderMode) {
        const readerOrigNodes = Array.from(readerRoot.querySelectorAll(".reader-paragraph-pair .reader-orig-p"))
          .filter(node => String(node.innerText || "").trim());
        sidebarPrimaryArticleSet = new Set(readerOrigNodes);
        readerOrigNodes.forEach((node, index) => sidebarOrderMap.set(node, index));
      } else {
        const articleContainer = findBestReaderContainer();
        const primaryNodes = collectReaderContentNodes(articleContainer).filter(n => n.tagName !== "IMG");
        sidebarPrimaryArticleSet = new Set(primaryNodes);
        primaryNodes.forEach((node, index) => sidebarOrderMap.set(node, index));
      }
    } catch (_) {
      sidebarPrimaryArticleSet = null;
      sidebarOrderMap = new Map();
    }

    root.innerHTML = `
      <div class="raccoon-sidebar-resize-handle" id="raccoon-sidebar-resize-handle" title="按住拖拽调整侧边栏宽度"></div>
      <aside class="raccoon-sidebar-panel">
        <div class="sidebar-top-bar">
          <div class="sidebar-title-group">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0071e3" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/></svg>
            <span class="sidebar-title-text">双语分栏对照</span>
          </div>
          <div class="sidebar-ctrls">
            <button class="sidebar-icon-btn" id="sidebar-btn-copyall" title="复制全文译文">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            </button>
            <button class="sidebar-icon-btn" id="sidebar-btn-close" title="收起 (Esc)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        </div>
        <div class="sidebar-list-content" id="sidebar-list-content"><button type="button" class="sidebar-more-content" id="sidebar-more-content">显示页面其他内容</button></div>
      </aside>
    `;

    document.body.appendChild(root);
    sidebarRoot = root;
    isSidebarOpen = true;
    applySidebarPageSpace(root.offsetWidth || parseInt(currentSettings.sidebarWidth || "400", 10) || 400);

    const sidebarListEl = root.querySelector("#sidebar-list-content");
    if (sidebarListEl) {
      // 只把真实输入视为“用户滚动”。程序调用 scrollTo/scrollTop 不再误触发用户锁。
      const markSidebarUserScroll = () => { sidebarUserScrollUntil = Date.now() + 750; };
      sidebarListEl.addEventListener("wheel", markSidebarUserScroll, { passive: true });
      sidebarListEl.addEventListener("touchmove", markSidebarUserScroll, { passive: true });
      sidebarListEl.addEventListener("pointerdown", markSidebarUserScroll, { passive: true });
      sidebarListEl.addEventListener("keydown", markSidebarUserScroll, { passive: true });
    }

    root.querySelector("#sidebar-btn-close").addEventListener("click", requestSidebarClose);
    root.querySelector("#sidebar-more-content")?.addEventListener("click", (e) => {
      sidebarShowExtraContent = true;
      e.currentTarget.remove();
      paragraphMap.forEach((val, blockId) => renderSidebarItem(blockId, val.el, val.origText, val.transText, true));
    });

    // 拖拽调整宽度逻辑
    const resizeHandle = root.querySelector("#raccoon-sidebar-resize-handle");
    let isResizing = false;
    let startX = 0;
    let startWidth = 400;

    resizeHandle.addEventListener("mousedown", (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = root.offsetWidth;
      resizeHandle.classList.add("active-resizing");
      document.body.style.userSelect = "none";
      e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
      if (!isResizing) return;
      const isLeftSide = root.dataset.side === "left";
      const dx = isLeftSide ? (e.clientX - startX) : (startX - e.clientX);
      const newWidth = Math.max(320, Math.min(720, startWidth + dx));
      root.style.width = `${newWidth}px`;
      applySidebarPageSpace(newWidth);
    });

    window.addEventListener("mouseup", () => {
      if (isResizing) {
        isResizing = false;
        resizeHandle.classList.remove("active-resizing");
        document.body.style.userSelect = "";
        chrome.runtime.sendMessage({
          action: "UPDATE_SETTINGS",
          settings: { sidebarWidth: String(root.offsetWidth) }
        });
      }
    });

    root.querySelector("#sidebar-btn-copyall").addEventListener("click", (e) => {
      const allText = Array.from(root.querySelectorAll(".sidebar-item-trans"))
        .map(el => el.innerText)
        .join("\n\n");
      if (allText) {
        navigator.clipboard.writeText(allText);
        const iconBtn = e.currentTarget;
        iconBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34c759" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
        setTimeout(() => {
          iconBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
        }, 1500);
      }
    });

    if (sidebarReaderMode) {
      seedSidebarFromReader();
    }
  }

  async function seedSidebarFromReader() {
    if (!sidebarRoot || !readerRoot?.isConnected) return;
    const pairs = Array.from(readerRoot.querySelectorAll(".reader-paragraph-pair"));
    const missing = [];

    pairs.forEach((pair, index) => {
      const origEl = pair.querySelector(".reader-orig-p");
      const transEl = pair.querySelector(".reader-trans-p");
      const origText = String(origEl?.innerText || "").trim();
      if (!origEl || !origText) return;
      sidebarOrderMap.set(origEl, index);
      const blockId = `reader_sidebar_${index}`;
      const loaded = transEl?.dataset.loaded === "true" && String(transEl.innerText || "").trim();
      renderSidebarItem(blockId, origEl, origText, loaded ? String(transEl.innerText || "").trim() : "正在翻译…", false, index);
      if (!loaded) missing.push({ id:blockId, text:origText, index, origEl, transEl });
    });

    if (!missing.length) return;
    const chunkSize = 12;
    for (let i = 0; i < missing.length; i += chunkSize) {
      if (!sidebarRoot || !readerRoot?.isConnected) return;
      const chunk = missing.slice(i, i + chunkSize);
      try {
        const res = await sendBatchWithIds(chunk.map(x => ({id:x.id,text:x.text})));
        if (!res?.success || !Array.isArray(res.data)) continue;
        res.data.forEach(item => {
          const meta = chunk.find(x => x.id === item.id);
          if (!meta || !item.text || item.error) return;
          if (meta.transEl?.isConnected) {
            setReaderTranslationText(meta.transEl, item.text);
            meta.transEl.dataset.loaded = "true";
          }
          renderSidebarItem(meta.id, meta.origEl, meta.text, item.text, false, meta.index);
        });
      } catch (err) {
        console.warn("Jijian reader sidebar translation failed:", err);
      }
    }
  }

  let sidebarItemIndexCounter = 0;

  function refreshSidebarItemIndexes(list) {
    if (!list) return;
    // 序号描述的是当前分栏中实际可见的阅读顺序，而不是原网页候选
    // 节点的下标。部分站点的第一个候选节点会被过滤，直接使用其
    // DOM 下标会让第一条从 02 开始；异步返回也会暂时放大这个问题。
    Array.from(list.querySelectorAll(".raccoon-sidebar-item")).forEach((entry, index) => {
      const label = entry.querySelector(".sidebar-item-index");
      if (label) label.textContent = String(index + 1).padStart(2, "0");
    });
  }

  function isSidebarPrimaryArticleElement(origEl) {
    if (!origEl || !sidebarPrimaryArticleSet || sidebarPrimaryArticleSet.size < 3) return true;
    if (sidebarPrimaryArticleSet.has(origEl)) return true;
    for (const node of sidebarPrimaryArticleSet) {
      if (node.contains?.(origEl) || origEl.contains?.(node)) return true;
    }
    return false;
  }

  function renderSidebarItem(blockId, origEl, origText, transText, forceExtra = false, explicitOrder = null) {
    if (!sidebarRoot) return;
    const list = sidebarRoot.querySelector("#sidebar-list-content");
    if (!list) return;
    if (!forceExtra && !sidebarShowExtraContent && !isSidebarPrimaryArticleElement(origEl)) return;

    const existingItem = list.querySelector(`[data-sidebar-for="${blockId}"]`);
    if (existingItem) {
      const transNode = existingItem.querySelector(".sidebar-item-trans");
      if (transNode && transText) transNode.textContent = transText;
      return;
    }

    let resolvedOrder = Number.isFinite(explicitOrder) ? explicitOrder : sidebarOrderMap.get(origEl);
    if (!Number.isFinite(resolvedOrder)) {
      resolvedOrder = 100000 + (++sidebarItemIndexCounter);
    }
    const itemIdx = resolvedOrder < 100000 ? resolvedOrder + 1 : sidebarItemIndexCounter;
    const item = document.createElement("div");
    item.className = "raccoon-sidebar-item";
    item.setAttribute("data-sidebar-for", blockId);
    item.setAttribute("data-sidebar-order", String(resolvedOrder));
    item.innerHTML = `
      <div class="sidebar-item-header-bar">
        <span class="sidebar-item-index">${itemIdx.toString().padStart(2, '0')}</span>
      </div>
      <div class="sidebar-item-orig" title="双击或选词可直接查词">${escapeHtml(origText || "")}</div>
      <div class="sidebar-item-trans">${escapeHtml(transText || "")}</div>
      <div class="sidebar-item-footer">
        <button class="sidebar-item-btn" data-act="speak-orig" title="朗读原文">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
          <span>原文</span>
        </button>
        <button class="sidebar-item-btn" data-act="speak-trans" title="朗读译文">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
          <span>译文</span>
        </button>
        <button class="sidebar-item-btn" data-act="locate" title="定位到原文">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>
          <span>定位</span>
        </button>
        <button class="sidebar-item-btn" data-act="copy" title="复制译文">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
          <span>复制</span>
        </button>
      </div>
    `;

    function highlightOrigNode() {
      if (!origEl) return;
      origEl.style.transition = "outline 0.25s ease, background-color 0.25s ease";
      origEl.style.outline = "2px solid #0071e3";
      origEl.style.outlineOffset = "3px";
      origEl.style.borderRadius = "3px";
      origEl.style.backgroundColor = "rgba(0, 113, 227, 0.06)";
    }

    function unhighlightOrigNode() {
      if (!origEl) return;
      origEl.style.outline = "none";
      origEl.style.backgroundColor = "";
    }

    function scrollToOrigBlock() {
      if (!origEl) return;

      // 右栏主动定位正文时，暂时禁止“正文滚动 → 右栏同步”。
      // 否则 smooth scroll 经过中间段落时，会不断把右栏改到别的位置。
      sidebarNavigationLockUntil = Date.now() + 1450;
      if (sidebarNavigationTimer) clearTimeout(sidebarNavigationTimer);

      const list = sidebarRoot?.querySelector("#sidebar-list-content");
      const preservedSidebarTop = list ? list.scrollTop : 0;
      sidebarRoot?.querySelectorAll(".raccoon-sidebar-item").forEach(i => i.classList.remove("active-sync"));
      item.classList.add("active-sync");

      if (origEl.closest("#raccoon-reader-root")) {
        origEl.scrollIntoView({ behavior:"smooth", block:"center", inline:"nearest" });
      } else {
        const targetY = origEl.getBoundingClientRect().top + window.pageYOffset - (window.innerHeight / 3);
        window.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
      }
      highlightOrigNode();

      sidebarNavigationTimer = setTimeout(() => {
        sidebarNavigationLockUntil = 0;
        // 保持用户点击时右栏自己的阅读位置，不做二次跳动。
        if (list && list.isConnected && Math.abs(list.scrollTop - preservedSidebarTop) > 2) {
          list.scrollTop = preservedSidebarTop;
        }
        item.classList.add("active-sync");
      }, 1250);

      setTimeout(unhighlightOrigNode, 2200);
    }

    item.addEventListener("mouseenter", highlightOrigNode);
    item.addEventListener("mouseleave", unhighlightOrigNode);

    item.querySelector("[data-act='speak-orig']").addEventListener("click", (e) => {
      e.stopPropagation();
      speakTextNeural(origText, inferSpeechLanguage(origText, currentSettings.sourceLang));
    });

    item.querySelector("[data-act='speak-trans']").addEventListener("click", (e) => {
      e.stopPropagation();
      speakTextNeural(transText, languageCodeToSpeechTag(currentSettings.targetLang));
    });

    item.querySelector("[data-act='locate']").addEventListener("click", (e) => {
      e.stopPropagation();
      scrollToOrigBlock();
    });

    item.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      const sel = window.getSelection().toString();
      if (!sel) scrollToOrigBlock();
    });

    const origBox = item.querySelector(".sidebar-item-orig");
    origBox.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : "";
      if (isValidText(text)) {
        const rect = origBox.getBoundingClientRect();
        openDictionaryCard(rect.bottom + 6, Math.min(rect.left, window.innerWidth - 360), text);
      }
    });

    item.querySelector("[data-act='copy']").addEventListener("click", (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(transText);
      const span = e.target.closest("button").querySelector("span");
      if (span) {
        span.textContent = "已复制";
        setTimeout(() => { span.textContent = "复制"; }, 1200);
      }
    });

    const moreBtn = list.querySelector("#sidebar-more-content");
    const orderedItems = Array.from(list.querySelectorAll(".raccoon-sidebar-item"));
    const nextItem = orderedItems.find(el => Number(el.dataset.sidebarOrder || 1000000) > resolvedOrder);
    if (nextItem) list.insertBefore(item, nextItem);
    else if (moreBtn) list.insertBefore(item, moreBtn);
    else list.appendChild(item);
    refreshSidebarItemIndexes(list);
  }

  function initSidebarScrollSync() {
    if (sidebarScrollHandler) {
      window.removeEventListener("scroll", sidebarScrollHandler);
      sidebarScrollHandler = null;
    }
    if (!currentSettings.sidebarSyncScroll || !sidebarRoot) return;

    let syncTimer = null;
    sidebarScrollHandler = () => {
      if (!isSidebarOpen) return;
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => {
        if (!sidebarRoot || Date.now() < sidebarUserScrollUntil || Date.now() < sidebarNavigationLockUntil) return;

        const blocks = document.querySelectorAll("[data-raccoon-id]");
        let closestBlock = null;
        let minDistance = Infinity;
        blocks.forEach(b => {
          const rect = b.getBoundingClientRect();
          const dist = Math.abs(rect.top - Math.min(140, window.innerHeight * 0.24));
          if (dist < minDistance) {
            minDistance = dist;
            closestBlock = b;
          }
        });

        if (!closestBlock || !sidebarRoot) return;
        const id = closestBlock.getAttribute("data-raccoon-id");
        const sidebarItem = sidebarRoot.querySelector(`[data-sidebar-for="${id}"]`);
        const sidebarList = sidebarRoot.querySelector("#sidebar-list-content");
        if (!sidebarItem || !sidebarList) return;

        sidebarRoot.querySelectorAll(".raccoon-sidebar-item").forEach(i => i.classList.remove("active-sync"));
        sidebarItem.classList.add("active-sync");

        const desiredTop = Math.max(0, sidebarItem.offsetTop - Math.round(sidebarList.clientHeight * 0.22));
        if (Math.abs(sidebarList.scrollTop - desiredTop) > 8) {
          sidebarList.scrollTo({ top: desiredTop, behavior: "auto" });
        }
      }, 55);
    };
    window.addEventListener("scroll", sidebarScrollHandler, { passive: true });
    sidebarScrollHandler();
  }

  function closeSidebar() {
    if (sidebarScrollHandler) {
      window.removeEventListener("scroll", sidebarScrollHandler);
      sidebarScrollHandler = null;
    }
    if (sidebarRoot) {
      sidebarRoot.remove();
      sidebarRoot = null;
    }
    restoreSidebarPageSpace();
    sidebarUserScrollUntil = 0;
    sidebarNavigationLockUntil = 0;
    if (sidebarNavigationTimer) {
      clearTimeout(sidebarNavigationTimer);
      sidebarNavigationTimer = null;
    }
    isSidebarOpen = false;
    if (currentSettings.displayMode === 'sidebar') {
      currentSettings.displayMode = sidebarPreviousDisplayMode || 'bilingual';
    }
    sidebarPreviousDisplayMode = null;
  }

  function requestSidebarClose() {
    // A sidebar opened from an untranslated page owns a temporary translation
    // run. Closing it must cancel that run as well as restoring the previous
    // display mode; otherwise the next bilingual click can reopen the sidebar.
    if (currentSettings.displayMode === 'sidebar' && sidebarPreviousDisplayMode) {
      restoreOriginalPage();
      return;
    }
    closeSidebar();
  }

  /**
   * 7. 沉浸式精排阅读视图 (大纲双向折叠 + 偏好设置持久化)
   */
  let readerRoot = null;
  let readerKeydownHandler = null;
  let readerContainerCache = { url:"", element:null };
  let readerImageInfoCache = new WeakMap();

  function readerHeadingLevel(node) {
    const tagMatch = String(node?.tagName || "").match(/^H([1-6])$/);
    if (tagMatch) return Number(tagMatch[1]);
    if (String(node?.getAttribute?.("role") || "").toLowerCase() === "heading") {
      return Math.min(6, Math.max(1, parseInt(node.getAttribute("aria-level") || "2", 10) || 2));
    }
    return 0;
  }

  function setReaderTranslationText(element, text) {
    if (!element) return;
    const span = document.createElement("span");
    span.className = "reader-translation-text";
    span.textContent = String(text || "").replace(/(?:\s*(?:\[\d{1,3}\]|［\d{1,3}］|\(\d{1,3}\)|（\d{1,3}）|[¹²³⁴⁵⁶⁷⁸⁹⁰]))+\s*$/u, "").trim();
    element.replaceChildren(span);
  }

  async function warmReaderLazyContent() {
    const viewport = Math.max(600, window.innerHeight || 800);
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - viewport);
    if (maxScroll < viewport * 1.5) return;
    const startY = window.scrollY;
    const htmlStyle = document.documentElement.style;
    const previousBehavior = htmlStyle.scrollBehavior;
    htmlStyle.setProperty("scroll-behavior", "auto", "important");
    const steps = Math.min(8, Math.max(3, Math.ceil(maxScroll / (viewport * 2.4))));
    try {
      for (let index = 1; index <= steps; index++) {
        window.scrollTo(0, Math.round(maxScroll * index / steps));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await new Promise(resolve => setTimeout(resolve, 28));
      }
    } finally {
      window.scrollTo(0, startY);
      if (previousBehavior) htmlStyle.setProperty("scroll-behavior", previousBehavior);
      else htmlStyle.removeProperty("scroll-behavior");
      await new Promise(resolve => requestAnimationFrame(resolve));
      readerContainerCache = { url:"", element:null };
    }
  }

  function toggleReaderMode() {
    if (isReaderOpen) {
      closeReaderMode();
    } else {
      openReaderMode();
    }
  }

  function scoreReaderCandidate(el) {
    if (!el || el.closest("nav, header, footer, aside, [role='navigation']")) return -Infinity;
    const text = (el.innerText || "").trim();
    if (text.length < 180) return -Infinity;
    const paragraphs = Array.from(el.querySelectorAll(":scope > p, :scope > div > p, :scope > section > p"));
    const pText = paragraphs.reduce((sum, p) => sum + (p.innerText || "").trim().length, 0);
    const links = Array.from(el.querySelectorAll("a"));
    const linkText = links.reduce((sum, a) => sum + (a.innerText || "").trim().length, 0);
    const linkDensity = text.length ? linkText / text.length : 1;
    const headingCount = el.querySelectorAll("h1,h2,h3,h4").length;
    const semanticBoost = /^(ARTICLE|MAIN)$/.test(el.tagName) ? 280 : 0;
    const classBoost = /article|post|entry|story|content|markdown|reader/i.test(`${el.id || ""} ${el.className || ""}`) ? 180 : 0;
    return pText * 1.15 + paragraphs.length * 90 + headingCount * 28 + semanticBoost + classBoost - linkDensity * 900 - Math.max(0, text.length - 50000) * 0.03;
  }

  function findBestReaderContainer() {
    if (readerContainerCache.url === location.href && readerContainerCache.element?.isConnected) {
      return readerContainerCache.element;
    }
    const remember = (element) => {
      readerContainerCache = { url:location.href, element:element || document.body };
      return readerContainerCache.element;
    };
    const host = window.location.hostname.toLowerCase();
    const siteSelectors = [
      [/(?:medium\.com|substack\.com|wordpress\.com|blogspot\.com|ghost\.io)/, "article, .pw-post-body-paragraph, .body.markup, .entry-content, .post-content, .gh-content"],
      [/(?:zhihu\.com|zhuanlan\.zhihu\.com)/, ".Post-RichText, .QuestionAnswer-content, .RichContent-inner, .RichText.ztext"],
      [/douban\.com/, ".note-content, .review-content, #link-report, .topic-content"],
      [/bilibili\.com/, ".article-holder, .bili-article, .read-article-holder"],
      [/mp\.weixin\.qq\.com/, "#js_content, .rich_media_content"],
      [/(?:juejin\.cn|juejin\.im)/, ".article-content, .markdown-body, .entry-content"],
      [/cnblogs\.com/, "#cnblogs_post_body, .postBody, .blogpost-body"],
      [/csdn\.net/, "#content_views, .article_content, .markdown_views"],
      [/sspai\.com/, "#article-content, .article-content"],
      [/(?:github\.com|gitlab\.com|gitee\.com)/, ".markdown-body, .wiki, .readme, [data-testid='readme']"],
      [/(?:developer\.mozilla\.org|web\.dev|react\.dev|kubernetes\.io)/, "main article, article, .main-page-content, .content, .td-content"],
      [/(?:docs\.aws\.amazon\.com|readthedocs\.io)/, "#main-content, [role='main'], .rst-content, .document"],
      [/freecodecamp\.org/, "article, .post-content, .article-content"],
      [/(?:reuters\.com|apnews\.com|npr\.org|cnn\.com|cnbc\.com|axios\.com|politico\.com|propublica\.org)/, "article, [data-testid='article-body'], [data-key='article'], .article-body, .storytext"],
      [/(?:theguardian\.com|theverge\.com|arstechnica\.com|wired\.com|techcrunch\.com|theatlantic\.com|newyorker\.com)/, "article, .article-body, .article-content, .entry-content, .c-entry-content"],
      [/(?:economist\.com|ft\.com|foreignaffairs\.com|foreignpolicy\.com)/, "article, .article__body-text, .article-body, .story-body"],
      [/(?:nature\.com|sciencedirect\.com|ieeexplore\.ieee\.org)/, "article, .c-article-body, .article-body, .document-main"],
      [/pubmed\.ncbi\.nlm\.nih\.gov/, "main, .abstract-content, .full-view"],
      [/(?:nhk\.or\.jp|www3\.nhk\.or\.jp)/, "article, .content--detail-body, .body-text, .detail-main"],
      [/note\.com/, "article, .note-common-styles__textnote-body, .p-article__content"],
      [/(?:36kr\.com|huxiu\.com|thepaper\.cn|jiemian\.com|yicai\.com)/, "article, .article-content, .article-body, .news_txt, .kr-rich-text"],
      [/nytimes\.com/, 'section[name="articleBody"], .meteredContent, article'],
      [/psychologytoday\.com/, ".article-body, .field--name-body, article"],
      [/wikipedia\.org/, "#mw-content-text .mw-parser-output"]
    ];
    for (const [pattern, selector] of siteSelectors) {
      if (pattern.test(host)) {
        const hits = Array.from(document.querySelectorAll(selector)).filter(hit => (hit.innerText || "").trim().length > 180);
        const hit = hits.reduce((best, candidate) => scoreReaderCandidate(candidate) > scoreReaderCandidate(best) ? candidate : best, null);
        if (hit) return remember(hit);
      }
    }

    const preferred = Array.from(document.querySelectorAll("article, main, [role='main'], .post-content, .article-body, .entry-content, .story-body, .markdown-body"));
    let bestPreferred = null;
    let bestPreferredScore = -Infinity;
    preferred.forEach(el => {
      const score = scoreReaderCandidate(el);
      if (score > bestPreferredScore) {
        bestPreferred = el;
        bestPreferredScore = score;
      }
    });
    if (bestPreferred && bestPreferredScore >= 1200 && bestPreferred.querySelectorAll("p, blockquote").length >= 3) {
      return remember(bestPreferred);
    }

    // 不再对页面上的每一个 div 做深度评分；只保留含正文直系段落或正文语义命名的候选，避免长网页卡顿。
    const broad = Array.from(document.querySelectorAll("section, div")).filter(el => {
      const semanticName = `${el.id || ""} ${typeof el.className === "string" ? el.className : ""}`;
      if (/article|post|entry|story|content|markdown|reader|body/i.test(semanticName)) return true;
      const children = Array.from(el.children || []);
      const directParagraphs = children.filter(child => child.tagName === "P").length;
      const nestedParagraphBlocks = children.filter(child => /^(DIV|SECTION)$/.test(child.tagName) && Array.from(child.children || []).some(grand => grand.tagName === "P")).length;
      return directParagraphs >= 2 || nestedParagraphBlocks >= 2;
    }).slice(0, 700);
    let best = null;
    let bestScore = -Infinity;
    Array.from(new Set([...preferred, ...broad])).forEach(el => {
      const score = scoreReaderCandidate(el);
      if (score > bestScore) {
        best = el;
        bestScore = score;
      }
    });
    return remember(best || document.body);
  }

  function detectReaderWritingMode(container) {
    const candidates = [container, document.documentElement, document.body].filter(Boolean);
    for (const el of candidates) {
      try {
        const style = window.getComputedStyle(el);
        if ((style.writingMode || "").startsWith("vertical")) return "vertical";
        if ((style.direction || "") === "rtl" || el.getAttribute?.("dir") === "rtl") return "rtl";
      } catch (_) {}
    }
    return "horizontal";
  }

  function getReaderImageInfo(node) {
    const cached = readerImageInfoCache.get(node);
    if (cached) return cached;
    const candidates = [];
    const addCandidate = (value) => {
      const raw = String(value || "").trim();
      if (!raw || /^data:image\/gif;base64,R0lGODlhAQABA/i.test(raw)) return;
      try {
        const resolved = /^(?:data:|blob:)/i.test(raw) ? raw : new URL(raw, location.href).href;
        if (!candidates.includes(resolved)) candidates.push(resolved);
      } catch (_) {}
    };
    // The currently rendered asset is the best source after the warm-up pass.
    // Prefer it over lazy-loading placeholders or static poster variants so
    // animated GIF/WebP images keep moving in reading mode.
    [
      node.currentSrc,
      node.src,
      node.getAttribute("src"),
      node.getAttribute("data-original"),
      node.getAttribute("data-src"),
      node.getAttribute("data-lazy-src"),
      node.getAttribute("data-url")
    ].forEach(addCandidate);
    const srcset = String(node.getAttribute("srcset") || node.getAttribute("data-srcset") || "");
    if (srcset && !srcset.startsWith("data:")) {
      srcset.split(",").forEach(item => addCandidate(item.trim().split(/\s+/)[0]));
    }
    node.closest("picture")?.querySelectorAll("source").forEach(source => {
      const pictureSrcset = String(source.getAttribute("srcset") || source.getAttribute("data-srcset") || "");
      if (pictureSrcset && !pictureSrcset.startsWith("data:")) {
        pictureSrcset.split(",").forEach(item => addCandidate(item.trim().split(/\s+/)[0]));
      }
    });

    const animatedSource = candidates.find(src => /\.gif(?:$|[?#])/i.test(src) || /^data:image\/gif/i.test(src));
    const src = animatedSource || candidates[0] || "";
    const width = Number(node.naturalWidth) || Number(node.getAttribute("width")) || 0;
    const height = Number(node.naturalHeight) || Number(node.getAttribute("height")) || 0;
    const renderedRect = node.getBoundingClientRect();
    const displayWidth = renderedRect.width >= 160 ? Math.round(renderedRect.width) : 0;
    const displayHeight = renderedRect.height >= 100 ? Math.round(renderedRect.height) : 0;
    const layoutWidth = displayWidth || width;
    const ratio = width > 0 && height > 0 ? width / height : 0;
    const compact = layoutWidth > 0 && layoutWidth <= 620 && (displayHeight || height || 0) <= 760;
    const portrait = ratio > 0 && ratio <= .86;
    const wide = !compact && (ratio >= 1.55 || width >= 1000);
    const classes = [
      animatedSource ? "reader-img-animated" : "",
      wide ? "reader-img-wide" : "",
      compact || portrait ? "reader-img-inline" : ""
    ].filter(Boolean).join(" ");
    const info = {
      src,
      width,
      height,
      displayWidth,
      displayHeight,
      candidates,
      classes,
      alt: String(node.getAttribute("alt") || "文章配图").trim() || "文章配图"
    };
    readerImageInfoCache.set(node, info);
    return info;
  }

  function collectReaderContentNodes(container) {
    const selector = "p, h1, h2, h3, h4, h5, h6, [role='heading'][aria-level], blockquote, pre, li, dt, dd, figcaption, a[download], a[href$='.pdf'], a[href$='.epub'], a[href$='.zip'], img";
    const seenText = new Set();
    const raw = Array.from(container.querySelectorAll(selector));
    const result = [];
    let accumulatedText = 0;
    let tailReached = false;
    const noiseContainerRe = /(?:^|[-_\s])(related|recommend|recommended|suggest|suggested|more-stories|more-from|next-article|prev-article|newsletter|comments?|responses?|discussion|outbrain|taboola|sidebar|footer|social|share|promo|sponsored|advertisement|ads?|banner|popup|modal|subscribe|signup)(?:$|[-_\s])/i;
    const tailHeadingRe = /^(?:related|recommended|read more|more stories|you may also like|more from|keep reading|further reading|most read|popular now|相关推荐|相关阅读|推荐阅读|更多文章|相关文章|猜你喜欢|延伸阅读|更多推荐|関連記事|おすすめ|こちらもおすすめ|あわせて読みたい|次の記事|関連コンテンツ|人気記事|관련 기사|추천 기사|더보기|articles connexes|à lire aussi|artículos relacionados|te puede interesar|articoli correlati|ähnliche artikel|weiterlesen|похожие статьи|читайте также)/i;

    for (const node of raw) {
      if (tailReached) break;
      if (node.closest("nav, header, footer, aside, [role='navigation'], [aria-hidden='true'], #raccoon-sidebar-root, #raccoon-floating-ball-root, #raccoon-selection-bubble-root, .raccoon-translated-block, .raccoon-translated-inline, #raccoon-hover-trigger-root")) continue;
      const ancestor = node.closest("section, div, ul, ol");
      const noiseHint = `${ancestor?.id || ""} ${typeof ancestor?.className === "string" ? ancestor.className : ""}`.trim();
      if (noiseContainerRe.test(noiseHint)) continue;

      if (node.tagName === "IMG") {
        const src = getReaderImageInfo(node).src;
        const hint = `${src} ${node.alt || ""} ${node.className || ""} ${node.id || ""}`.toLowerCase();
        if (!src || /icon|avatar|logo|emoji|sprite|tracking|pixel|badge|button|chevron|favicon|placeholder|loading|spinner|divider|separator|advert|promo|sponsor|banner|watermark|qrcode|qr-code/.test(hint)) continue;
        const w = Number(node.getAttribute("width")) || node.naturalWidth || 0;
        const h = Number(node.getAttribute("height")) || node.naturalHeight || 0;
        if (w > 0 && h > 0 && Math.max(w,h) / Math.max(1,Math.min(w,h)) > 12) continue;
        if (!(w >= 180 || h >= 120 || (!w && !h))) continue;
        result.push(node);
        continue;
      }

      // A list item that already contains semantic paragraphs/headings is only a
      // wrapper. Keep its children, not both parent and child copies.
      if (node.tagName === "LI" && node.querySelector(":scope > p, :scope > blockquote, :scope > pre, :scope > div > p")) continue;
      const text = getHostOriginalText(node);
      const isHeading = readerHeadingLevel(node) > 0;
      if (text.length < (isHeading ? 2 : (node.tagName === "LI" ? 6 : 10))) continue;
      if (seenText.has(text)) continue;

      const linkText = Array.from(node.querySelectorAll?.("a") || []).reduce((n,a) => n + ((a.innerText || a.textContent || "").trim().length), 0);
      const linkDensity = text.length ? linkText / text.length : 0;
      // A recommendation heading after substantial article text is a strong end-of-article signal.
      if (accumulatedText > 650 && isHeading && tailHeadingRe.test(text)) {
        tailReached = true;
        break;
      }
      // Lists made mostly of links near the tail are usually related stories / navigation rather than article prose.
      if (accumulatedText > 900 && node.tagName === "LI" && linkDensity > .8) continue;

      seenText.add(text);
      result.push(node);
      accumulatedText += text.length;
    }
    return result;
  }

  function readerInlineHtml(sourceNode) {
    if (!sourceNode) return "";
    const holder = document.createElement("div");
    const clone = sourceNode.cloneNode(true);
    holder.appendChild(clone);

    // Reader Mode may be opened after compact navigation has been translated
    // in place. Restore every cloned text node from the live-node registry so
    // the reader's original column never starts from an already translated
    // Chinese label.
    try {
      const sourceWalker = document.createTreeWalker(sourceNode, NodeFilter.SHOW_TEXT);
      const cloneWalker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
      while (sourceWalker.nextNode() && cloneWalker.nextNode()) {
        cloneWalker.currentNode.nodeValue = originalTextForNode(sourceWalker.currentNode);
      }
    } catch (_) {}
    clone.querySelectorAll?.(TRANSLATION_EXTENSION_SELECTOR).forEach(node => node.remove());
    const allowed = new Set(["A","STRONG","B","EM","I","U","S","MARK","CODE","KBD","SAMP","SUB","SUP","RUBY","RT","RP","BR","SPAN","SMALL","Q"]);
    Array.from(clone.querySelectorAll?.("*") || []).reverse().forEach(node => {
      const tag = node.tagName;
      if (["SCRIPT","STYLE","NOSCRIPT","IFRAME","OBJECT","EMBED"].includes(tag)) { node.remove(); return; }
      if (!allowed.has(tag)) { node.replaceWith(...Array.from(node.childNodes)); return; }
      const originalHref = tag === "A" ? node.getAttribute("href") : "";
      Array.from(node.attributes || []).forEach(attr => node.removeAttribute(attr.name));
      if (tag === "A" && originalHref) {
        try {
          const resolved = new URL(originalHref, location.href);
          if (["http:","https:","mailto:"].includes(resolved.protocol)) {
            node.setAttribute("href", resolved.href);
            node.setAttribute("target", "_blank");
            node.setAttribute("rel", "noopener noreferrer");
          } else node.replaceWith(...Array.from(node.childNodes));
        } catch (_) { node.replaceWith(...Array.from(node.childNodes)); }
      }
    });
    const inner = String(clone.innerHTML || "").trim();
    if (sourceNode.tagName === "A") {
      const sourceHref = sourceNode.getAttribute("href") || "";
      try {
        const resolved = new URL(sourceHref, location.href);
        if (["http:","https:","mailto:"].includes(resolved.protocol)) {
          return `<a href="${escapeHtml(resolved.href)}" target="_blank" rel="noopener noreferrer">${inner || escapeHtml(getHostOriginalText(sourceNode))}</a>`;
        }
      } catch (_) {}
    }
    return inner;
  }

  function readerOriginalTextPreservingWhitespace(sourceNode) {
    if (!sourceNode) return "";
    try {
      const clone = sourceNode.cloneNode(true);
      const sourceWalker = document.createTreeWalker(sourceNode, NodeFilter.SHOW_TEXT);
      const cloneWalker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
      while (sourceWalker.nextNode() && cloneWalker.nextNode()) {
        cloneWalker.currentNode.nodeValue = originalTextForNode(sourceWalker.currentNode);
      }
      clone.querySelectorAll?.(TRANSLATION_EXTENSION_SELECTOR).forEach(node => node.remove());
      return String(clone.textContent || "").replace(/^\n+|\n+$/g, "");
    } catch (_) { return String(sourceNode.textContent || ""); }
  }

  function normalizedReaderTitle(value) {
    return String(value || "").toLowerCase().replace(/[\s\u00a0]+/g," ").replace(/[|｜—–-]\s*[^|｜—–-]{1,42}$/," ").replace(/[^\p{L}\p{N}]+/gu,"").trim();
  }

  function readerHeadingMatchesTitle(heading, title) {
    const a = normalizedReaderTitle(heading);
    const b = normalizedReaderTitle(title);
    if (!a || !b) return false;
    if (a === b) return true;
    const shorter = a.length <= b.length ? a : b;
    const longer = a.length > b.length ? a : b;
    return shorter.length >= 8 && shorter.length / longer.length >= .64 && longer.includes(shorter);
  }

  async function openReaderMode() {
    if (document.getElementById("raccoon-reader-root")) return;

    await warmReaderLazyContent();
    readerImageInfoCache = new WeakMap();
    const bestContainer = findBestReaderContainer();
    const title = document.querySelector('meta[property="og:title"]')?.content || document.querySelector("h1")?.innerText || document.title || "阅读文章";
    const detectedWritingMode = detectReaderWritingMode(bestContainer);
    let contentNodes = collectReaderContentNodes(bestContainer);
    contentNodes = contentNodes.filter((node, index) => {
      if (index > 12 || readerHeadingLevel(node) < 1 || readerHeadingLevel(node) > 3) return true;
      return !readerHeadingMatchesTitle(getHostOriginalText(node), title);
    });
    const headings = [];
    contentNodes.forEach((node, idx) => {
      const level = readerHeadingLevel(node);
      if (level) {
        headings.push({ id: `head_${idx}`, text: getHostOriginalText(node), level: `h${level}` });
      }
    });

    const savedTheme = currentSettings.readerTheme || "envelope";
    const readerSurfaceValues = new Set(["card", "flat", "column", "folio"]);
    const savedSurface = readerSurfaceValues.has(currentSettings.readerSurface) ? currentSettings.readerSurface : "card";
    const savedWidth = currentSettings.readerWidth || "920";
    const savedFont = currentSettings.readerFont || "system";
    const savedLineHeight = currentSettings.readerLineHeight || "1.82";
    const savedParagraphSpacing = currentSettings.readerParagraphSpacing || "28";
    const savedWritingMode = currentSettings.readerWritingMode === "vertical" ? "vertical" : "horizontal";
    const savedRenderStyle = currentSettings.renderStyle || "classic";
    const effectiveWritingMode = savedWritingMode;
    const isOutlineCollapsed = !!currentSettings.readerOutlineCollapsed;

    const root = document.createElement("div");
    root.id = "raccoon-reader-root";
    root.style.setProperty("--reader-image-shadow", currentSettings.readerImageShadow === false ? "none" : "0 8px 24px rgba(0,0,0,.14)");
    root.setAttribute("data-theme", savedTheme);
    root.setAttribute("data-surface", savedSurface);
    root.setAttribute("data-reader-view", isPageTranslated ? "bilingual" : "orig");
    root.setAttribute("data-writing-mode", effectiveWritingMode);
    root.setAttribute("data-reader-lang", inferDictionaryLanguageHint(title));
    root.setAttribute("data-reader-render-style", savedRenderStyle);
    root.classList.toggle("reader-progress-hidden", currentSettings.readerProgressVisible === false);
    root.classList.toggle("reader-meta-hidden", currentSettings.readerMetaVisible === false);
    root.style.setProperty("--reader-font-family", getFontFamilyCss(savedFont));
    root.style.setProperty("--reader-body-size", `${parseFloat(currentSettings.readerFontSize) || 17.5}px`);
    root.style.setProperty("--reader-outline-width", `${Math.max(190, Math.min(380, Number(currentSettings.readerOutlineWidth) || 270))}px`);
    root.style.setProperty("--reader-line-height", savedLineHeight);
    root.style.setProperty("--reader-paragraph-spacing", `${savedParagraphSpacing}px`);

    root.innerHTML = `
      <div class="reader-top-progress-bar" id="reader-top-progress-bar"></div>

      <!-- 大纲折叠后只保留一个安静的平面图标 -->
      <button type="button" class="reader-floating-expand-outline-btn" id="reader-btn-expand-outline" style="${isOutlineCollapsed && headings.length > 0 ? 'display:flex;' : 'display:none;'}" title="展开文章大纲" aria-label="展开文章大纲">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 6h14M5 12h14M5 18h9"/></svg>
      </button>

      <div class="reader-vertical-edge-dock" id="reader-vertical-edge-dock">
        <button type="button" class="reader-vertical-dock-btn" id="reader-btn-open-settings" title="打开阅读偏好设置">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82-.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
        <button type="button" class="reader-vertical-dock-btn exit-btn" id="reader-btn-exit" title="退出沉浸阅读 (Esc)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>

      <div class="reader-body-layout">
        ${headings.length > 0 ? `
          <aside class="reader-outline-panel ${isOutlineCollapsed ? 'collapsed' : ''}" id="reader-outline-panel">
            <div class="reader-outline-header-row">
              <span class="reader-outline-title">文章大纲</span>
              <button type="button" class="reader-outline-toggle-btn" id="reader-btn-toggle-outline" title="折叠大纲" aria-label="折叠大纲"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m14 6-6 6 6 6"/></svg></button>
            </div>
            ${headings.map(h => `
              <div class="reader-outline-item level-${Math.min(3, Math.max(1, Number(h.level.slice(1)) - 1))}" data-target-id="${h.id}" title="${escapeHtml(h.text)}">
                <span class="reader-outline-label">${escapeHtml(h.text)}</span>
              </div>
            `).join("")}
            <div class="reader-outline-resizer" id="reader-outline-resizer" title="拖动调整大纲宽度" aria-hidden="true"></div>
          </aside>
        ` : ''}

        <div class="reader-scroll-area" id="reader-scroll-area">
          <main class="reader-scroll-card" id="reader-scroll-card" style="max-width: ${savedWidth}px; --reader-max-width:${savedWidth}px;">
            <h1 class="reader-title">${escapeHtml(title)}</h1>
            <div class="reader-meta-bar">
              <span class="reader-meta-source">来源: ${escapeHtml(window.location.hostname)}</span>
              <span class="reader-meta-sep reader-meta-main-sep">·</span>
              <span class="reader-meta-mode" id="reader-mode-status-text">${isPageTranslated ? "双语对照精排" : "纯净原文阅读"}</span>
              <span class="reader-progress-meta"><span class="reader-meta-sep">·</span><span class="reader-pct-badge" id="reader-progress-pct-badge">已读 0%</span></span>
            </div>
            <div class="reader-content" id="reader-content">
              ${contentNodes.map((node, idx) => {
                if (node.tagName === "IMG") {
                  const media = getReaderImageInfo(node);
                  const naturalWidth = media.displayWidth || (media.width ? Math.min(media.width, 1800) : 960);
                  const inlineSide = idx % 2 === 0 ? "reader-img-inline-right" : "reader-img-inline-left";
                  return `<div class="reader-img-wrap ${media.classes} ${media.classes.includes("reader-img-inline") ? inlineSide : ""}" style="--reader-image-natural-width:${naturalWidth}px"><img src="${escapeHtml(media.src)}" alt="${escapeHtml(media.alt)}" loading="eager" decoding="async" title="点击或双击放大查看" /></div>`;
                }
                const headingLevel = readerHeadingLevel(node);
                const isHeading = headingLevel > 0;
                const isFigcaption = node.tagName === "FIGCAPTION";
                const isCode = node.tagName === "PRE";
                const isQuote = node.tagName === "BLOCKQUOTE";
                const isListItem = node.tagName === "LI";
                const contentTag = isHeading ? `h${headingLevel}` : "p";
                const wrapperClass = isCode ? "reader-code-block" : isQuote ? "reader-blockquote" : isListItem ? "reader-list-block" : "";
                const pairClass = isFigcaption ? " reader-figcaption" : "";
                const originalHtml = isCode
                  ? escapeHtml(readerOriginalTextPreservingWhitespace(node)).replace(/\n/g, "<br>")
                  : (readerInlineHtml(node) || escapeHtml(getHostOriginalText(node)));
                return `
                  ${wrapperClass ? `<div class="${wrapperClass}">` : ""}<div class="reader-paragraph-pair${pairClass}" id="head_${idx}" data-para-id="r_${idx}" data-heading="${isHeading ? 'true' : 'false'}">
                    <${contentTag} class="reader-orig-p ${isHeading ? 'reader-structural-heading' : ''}">${originalHtml}</${contentTag}>
                    <${contentTag} class="reader-trans-p ${isHeading ? 'reader-structural-heading' : ''}" data-render-style="${escapeHtml(savedRenderStyle)}"><span class="reader-translation-text">正在同步精排译文...</span></${contentTag}>
                    ${!isHeading && !isFigcaption && !isCode ? `<button type="button" class="reader-inline-translate-btn" data-reader-translate-one title="翻译这一段" aria-label="翻译这一段"><img src="${extensionAssetUrls.icon128}" alt="" aria-hidden="true"></button>` : ""}
                  </div>${wrapperClass ? "</div>" : ""}
                `;
              }).join("")}
            </div>
          </main>
        </div>

        <div class="reader-drawer-backdrop" id="reader-drawer-backdrop"></div>

        <aside class="reader-settings-drawer" id="reader-settings-drawer">
          <div class="drawer-header-row">
            <span class="drawer-title">阅读偏好设置</span>
            <button class="dock-close-btn" id="drawer-btn-close" title="关闭设置抽屉">✕</button>
          </div>

          <span class="drawer-section-label">阅读呈现模式</span>
          <div class="reader-mode-tabs">
            <span class="reader-tab-indicator" aria-hidden="true"></span>
            <button type="button" class="reader-mode-btn ${!isPageTranslated ? 'active' : ''}" data-mode="orig">原文</button>
            <button type="button" class="reader-mode-btn ${isPageTranslated ? 'active' : ''}" data-mode="bilingual">双语</button>
            <button type="button" class="reader-mode-btn" data-mode="trans">纯中文</button>
          </div>

          <span class="drawer-section-label">阅读主题</span>
          <div class="reader-theme-swatches" id="reader-theme-swatches" aria-label="阅读主题">
            <button type="button" class="reader-theme-swatch ${savedTheme === 'envelope' ? 'active' : ''}" data-theme-value="envelope" title="暖纸"><span style="background:#f5f0e5"></span></button>
            <button type="button" class="reader-theme-swatch ${savedTheme === 'white' ? 'active' : ''}" data-theme-value="white" title="白纸"><span style="background:#ffffff"></span></button>
            <button type="button" class="reader-theme-swatch ${savedTheme === 'stone' ? 'active' : ''}" data-theme-value="stone" title="石灰"><span style="background:#eeeeeb"></span></button>
            <button type="button" class="reader-theme-swatch ${savedTheme === 'mint' ? 'active' : ''}" data-theme-value="mint" title="浅绿"><span style="background:#edf5ef"></span></button>
            <button type="button" class="reader-theme-swatch ${savedTheme === 'mist' ? 'active' : ''}" data-theme-value="mist" title="雾蓝"><span style="background:#eaf0f4"></span></button>
            <button type="button" class="reader-theme-swatch ${savedTheme === 'lavender' ? 'active' : ''}" data-theme-value="lavender" title="淡紫"><span style="background:#f1eef7"></span></button>
            <button type="button" class="reader-theme-swatch ${savedTheme === 'dark' ? 'active' : ''}" data-theme-value="dark" title="深色"><span style="background:#1d1f22"></span></button>
          </div>

          <label class="reader-drawer-switch-row" for="reader-toggle-image-shadow">
            <span><b>图片阴影</b><small>为正文配图增加轻柔层次</small></span>
            <span class="reader-drawer-switch"><input type="checkbox" id="reader-toggle-image-shadow" ${currentSettings.readerImageShadow !== false ? 'checked' : ''}><i></i></span>
          </label>

          <span class="drawer-section-label">页面样式</span>
          <div class="reader-surface-switch" id="reader-surface-switch">
            <button type="button" class="${savedSurface === 'card' ? 'active' : ''}" data-reader-surface="card"><b>纸张</b><span>居中阅读页</span></button>
            <button type="button" class="${savedSurface === 'flat' ? 'active' : ''}" data-reader-surface="flat"><b>铺开</b><span>直接融入背景</span></button>
            <button type="button" class="${savedSurface === 'column' ? 'active' : ''}" data-reader-surface="column"><b>专栏</b><span>窄栏聚焦正文</span></button>
            <button type="button" class="${savedSurface === 'folio' ? 'active' : ''}" data-reader-surface="folio"><b>书页</b><span>宽边舒展留白</span></button>
          </div>

          <span class="drawer-section-label">字体</span>
          <select id="drawer-select-font" class="reader-hidden-select" tabindex="-1" aria-hidden="true">
            <option value="system" ${savedFont === 'system' ? 'selected' : ''}>系统默认</option><option value="source-sans" ${savedFont === 'source-sans' ? 'selected' : ''}>思源黑体</option><option value="pingfang" ${savedFont === 'pingfang' ? 'selected' : ''}>苹方</option><option value="kinghwa-song" ${savedFont === 'kinghwa-song' ? 'selected' : ''}>京華老宋体</option><option value="source-serif" ${savedFont === 'source-serif' ? 'selected' : ''}>思源宋体</option><option value="lxgw-wenkai" ${savedFont === 'lxgw-wenkai' ? 'selected' : ''}>霞鹜文楷</option><option value="smiley-sans" ${savedFont === 'smiley-sans' ? 'selected' : ''}>得意黑</option><option value="kaiti" ${savedFont === 'kaiti' ? 'selected' : ''}>楷体</option><option value="georgia" ${savedFont === 'georgia' ? 'selected' : ''}>Georgia</option><option value="garamond" ${savedFont === 'garamond' ? 'selected' : ''}>EB Garamond</option>
          </select>
          <div class="reader-font-grid" id="reader-font-grid">
            <button type="button" class="reader-font-card ${savedFont === 'system' ? 'active' : ''}" data-value="system" style="--sample-font:-apple-system,BlinkMacSystemFont,'PingFang SC',sans-serif"><span>系统默认</span><b>清 Aa 123</b></button>
            <button type="button" class="reader-font-card ${savedFont === 'source-sans' ? 'active' : ''}" data-value="source-sans" style="--sample-font:'Source Han Sans SC','PingFang SC',sans-serif"><span>思源黑体</span><b>清 Aa 123</b></button>
            <button type="button" class="reader-font-card ${savedFont === 'pingfang' ? 'active' : ''}" data-value="pingfang" style="--sample-font:'PingFang SC',sans-serif"><span>苹方</span><b>清 Aa 123</b></button>
            <button type="button" class="reader-font-card ${savedFont === 'kinghwa-song' ? 'active' : ''}" data-value="kinghwa-song" style="--sample-font:'KingHwa_OldSong','STSong',serif"><span>京華老宋体</span><b>清 Aa 123</b></button>
            <button type="button" class="reader-font-card ${savedFont === 'source-serif' ? 'active' : ''}" data-value="source-serif" style="--sample-font:'Source Han Serif SC','Songti SC',serif"><span>思源宋体</span><b>清 Aa 123</b></button>
            <button type="button" class="reader-font-card ${savedFont === 'lxgw-wenkai' ? 'active' : ''}" data-value="lxgw-wenkai" style="--sample-font:'LXGW WenKai','Kaiti SC',serif"><span>霞鹜文楷</span><b>清 Aa 123</b></button>
            <button type="button" class="reader-font-card ${savedFont === 'smiley-sans' ? 'active' : ''}" data-value="smiley-sans" style="--sample-font:'Smiley Sans','PingFang SC',sans-serif"><span>得意黑</span><b>清 Aa 123</b></button>
            <button type="button" class="reader-font-card ${savedFont === 'kaiti' ? 'active' : ''}" data-value="kaiti" style="--sample-font:'Kaiti SC','STKaiti',serif"><span>楷体</span><b>清 Aa 123</b></button>
            <button type="button" class="reader-font-card ${savedFont === 'georgia' ? 'active' : ''}" data-value="georgia" style="--sample-font:Georgia,'Times New Roman',serif"><span>Georgia</span><b>Aa 123</b></button>
            <button type="button" class="reader-font-card ${savedFont === 'garamond' ? 'active' : ''}" data-value="garamond" style="--sample-font:'EB Garamond',Garamond,serif"><span>EB Garamond</span><b>Aa 123</b></button>
          </div>

          <span class="drawer-section-label">正文宽度</span>
          <div class="drawer-slider-row">
            <input type="range" id="drawer-width-slider" class="drawer-slider" min="580" max="1100" step="20" value="${savedWidth}">
            <span class="drawer-slider-val" id="drawer-width-val">${savedWidth}px</span>
          </div>
          <div class="drawer-preset-chips">
            <button type="button" class="preset-chip" data-width="640">紧凑 640px</button>
            <button type="button" class="preset-chip" data-width="780">标准 780px</button>
            <button type="button" class="preset-chip" data-width="920">宽松 920px</button>
            <button type="button" class="preset-chip" data-width="1060">宽屏 1060px</button>
          </div>

          <span class="drawer-section-label">字号</span>
          <div class="dock-stepper-row reader-size-row">
            <button class="dock-mini-btn" id="drawer-btn-font-dec" title="缩小字号">A−</button>
            <span class="reader-size-value" id="drawer-font-size-val">${currentSettings.readerFontSize || '17.5'}px</span>
            <button class="dock-mini-btn" id="drawer-btn-font-inc" title="放大字号">A+</button>
          </div>

          <button type="button" class="reader-advanced-toggle open" id="reader-advanced-toggle" aria-expanded="true">
            <span>高级排版</span>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m7 10 5 5 5-5"/></svg>
          </button>
          <div class="reader-advanced-panel open" id="reader-advanced-panel">
            <span class="drawer-section-label">行距</span>
            <div class="drawer-slider-row">
              <input type="range" id="drawer-lineheight-slider" class="drawer-slider" min="1.45" max="2.2" step="0.05" value="${savedLineHeight}">
              <span class="drawer-slider-val" id="drawer-lineheight-val">${savedLineHeight}</span>
            </div>

            <span class="drawer-section-label">段落间距</span>
            <div class="drawer-slider-row">
              <input type="range" id="drawer-paragraph-slider" class="drawer-slider" min="16" max="48" step="2" value="${savedParagraphSpacing}">
              <span class="drawer-slider-val" id="drawer-paragraph-val">${savedParagraphSpacing}px</span>
            </div>

            <span class="drawer-section-label">排版方向</span>
            <div class="reader-writing-tabs" id="reader-writing-tabs">
              <button type="button" class="reader-writing-btn ${savedWritingMode === 'horizontal' ? 'active' : ''}" data-writing="horizontal">横排</button>
              <button type="button" class="reader-writing-btn reader-writing-vertical ${savedWritingMode === 'vertical' ? 'active' : ''}" data-writing="vertical">竖排</button>
            </div>
          </div>

          <div class="reader-visibility-controls">
            <label><span>阅读进度条</span><input type="checkbox" id="reader-toggle-progress" ${currentSettings.readerProgressVisible === false ? "" : "checked"}></label>
            <label><span>标题信息</span><input type="checkbox" id="reader-toggle-meta" ${currentSettings.readerMetaVisible === false ? "" : "checked"}></label>
          </div>

          <span class="drawer-section-label">快捷工具</span>
          <button class="drawer-item-btn" id="drawer-btn-speak">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
            <span>全文朗读</span>
          </button>

          <div class="reader-export-wrap reader-export-direct">
            <span class="drawer-section-label">导出文章</span>
            <div class="reader-export-direct-grid" id="reader-export-menu">
              <button type="button" data-format="md"><svg viewBox="0 0 24 24"><path d="M4 5h16v14H4z"/><path d="m7 15 2-6 2 6 2-6 2 6"/></svg><span>Markdown</span></button>
              <button type="button" data-format="html"><svg viewBox="0 0 24 24"><path d="m8 9-3 3 3 3M16 9l3 3-3 3M14 6l-4 12"/></svg><span>HTML</span></button>
              <button type="button" data-format="txt"><svg viewBox="0 0 24 24"><path d="M5 4h14v16H5z"/><path d="M8 8h8M8 12h8M8 16h5"/></svg><span>TXT</span></button>
              <button type="button" data-format="print"><svg viewBox="0 0 24 24"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5h20v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/></svg><span>PDF</span></button>
            </div>
          </div>

          <button class="drawer-item-btn" id="drawer-btn-copy">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            <span>复制全文译文</span>
          </button>
        </aside>
      </div>
    `;

    document.documentElement.appendChild(root);
    readerRoot = root;
    isReaderOpen = true;
    root.addEventListener("click", (event) => {
      const target = event.target?.closest?.('.reader-trans-p[data-render-style="click-reveal"]');
      if (!target) return;
      target.classList.toggle('raccoon-revealed');
    });

    const settingsDrawer = root.querySelector("#reader-settings-drawer");
    const drawerBackdrop = root.querySelector("#reader-drawer-backdrop");
    const scrollArea = root.querySelector("#reader-scroll-area");
    const cardElement = root.querySelector("#reader-scroll-card");
    const readerAdvancedToggle = root.querySelector("#reader-advanced-toggle");
    const readerAdvancedPanel = root.querySelector("#reader-advanced-panel");

    if (readerAdvancedToggle && readerAdvancedPanel) {
      readerAdvancedPanel.classList.add("open");
      readerAdvancedToggle.classList.add("open");
      readerAdvancedToggle.setAttribute("aria-expanded", "true");
      readerAdvancedToggle.addEventListener("click", () => {
        const open = readerAdvancedPanel.classList.toggle("open");
        readerAdvancedToggle.classList.toggle("open", open);
        readerAdvancedToggle.setAttribute("aria-expanded", String(open));
      });
    }

    const syncReaderTabIndicator = (container, buttonSelector) => {
      if (!container) return;
      const active = container.querySelector(`${buttonSelector}.active`);
      const indicator = container.querySelector(".reader-tab-indicator");
      if (!active || !indicator) return;
      indicator.style.width = `${active.offsetWidth}px`;
      indicator.style.transform = `translateX(${active.offsetLeft}px)`;
    };
    const readerModeTabs = root.querySelector(".reader-mode-tabs");
    const readerWritingTabs = root.querySelector(".reader-writing-tabs");
    syncReaderTabIndicator(readerModeTabs, ".reader-mode-btn");
    syncReaderTabIndicator(readerWritingTabs, ".reader-writing-btn");

    let readerFontSize = parseFloat(currentSettings.readerFontSize) || 17.5;
    const applyReaderTypography = () => {
      root.style.setProperty("--reader-body-size", `${readerFontSize}px`);
      root.querySelectorAll(".reader-trans-p, .reader-orig-p").forEach(p => {
        const pair = p.closest(".reader-paragraph-pair");
        if (pair?.getAttribute("data-heading") !== "true") {
          p.style.fontSize = `${readerFontSize}px`;
        }
      });
      root.style.setProperty("--reader-line-height", currentSettings.readerLineHeight || savedLineHeight);
      root.style.setProperty("--reader-paragraph-spacing", `${currentSettings.readerParagraphSpacing || savedParagraphSpacing}px`);
    };
    applyReaderTypography();

    // 大纲折叠与展开双向浮钮
    const outlinePanel = root.querySelector("#reader-outline-panel");
    const outlineResizer = root.querySelector("#reader-outline-resizer");
    if (outlineResizer && outlinePanel) {
      outlineResizer.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = outlinePanel.getBoundingClientRect().width;
        outlineResizer.setPointerCapture?.(event.pointerId);
        const move = (ev) => {
          const width = Math.max(190, Math.min(380, Math.round(startWidth + ev.clientX - startX)));
          root.style.setProperty("--reader-outline-width", `${width}px`);
          currentSettings.readerOutlineWidth = width;
        };
        const up = (ev) => {
          outlineResizer.releasePointerCapture?.(ev.pointerId);
          outlineResizer.removeEventListener("pointermove", move);
          outlineResizer.removeEventListener("pointerup", up);
          outlineResizer.removeEventListener("pointercancel", up);
          chrome.runtime.sendMessage({ action:"UPDATE_SETTINGS", settings:{ readerOutlineWidth: currentSettings.readerOutlineWidth } }).catch(()=>{});
        };
        outlineResizer.addEventListener("pointermove", move);
        outlineResizer.addEventListener("pointerup", up);
        outlineResizer.addEventListener("pointercancel", up);
      });
    }
    const toggleOutlineBtn = root.querySelector("#reader-btn-toggle-outline");
    const expandOutlineFloatingBtn = root.querySelector("#reader-btn-expand-outline");

    const setOutlineCollapsedState = (collapsed) => {
      if (!outlinePanel) return;
      if (collapsed) {
        outlinePanel.classList.add("collapsed");
        if (expandOutlineFloatingBtn) expandOutlineFloatingBtn.style.display = "block";
      } else {
        outlinePanel.classList.remove("collapsed");
        if (expandOutlineFloatingBtn) expandOutlineFloatingBtn.style.display = "none";
      }
      currentSettings.readerOutlineCollapsed = collapsed;
      chrome.runtime.sendMessage({
        action: "UPDATE_SETTINGS",
        settings: { readerOutlineCollapsed: collapsed }
      });
    };

    if (toggleOutlineBtn) {
      toggleOutlineBtn.addEventListener("click", () => setOutlineCollapsedState(true));
    }
    if (expandOutlineFloatingBtn) {
      expandOutlineFloatingBtn.addEventListener("click", () => setOutlineCollapsedState(false));
    }

    const openDrawer = () => {
      settingsDrawer.classList.add("open");
      drawerBackdrop.classList.add("open");
      root.classList.add("reader-settings-open");
    };

    const closeDrawer = () => {
      settingsDrawer.classList.remove("open");
      drawerBackdrop.classList.remove("open");
      root.classList.remove("reader-settings-open");
    };

    root.querySelector("#reader-btn-open-settings").addEventListener("click", openDrawer);
    root.querySelector("#drawer-btn-close").addEventListener("click", closeDrawer);
    drawerBackdrop.addEventListener("click", closeDrawer);

    const progressToggle = root.querySelector("#reader-toggle-progress");
    const metaToggle = root.querySelector("#reader-toggle-meta");
    progressToggle?.addEventListener("change", () => {
      currentSettings.readerProgressVisible = !!progressToggle.checked;
      root.classList.toggle("reader-progress-hidden", !progressToggle.checked);
      chrome.runtime.sendMessage({action:"UPDATE_SETTINGS",settings:{readerProgressVisible:!!progressToggle.checked}});
    });
    metaToggle?.addEventListener("change", () => {
      currentSettings.readerMetaVisible = !!metaToggle.checked;
      root.classList.toggle("reader-meta-hidden", !metaToggle.checked);
      chrome.runtime.sendMessage({action:"UPDATE_SETTINGS",settings:{readerMetaVisible:!!metaToggle.checked}});
    });
    const readerLangHint = inferDictionaryLanguageHint(title);
    const verticalBtn = root.querySelector(".reader-writing-vertical");
    if (verticalBtn) verticalBtn.title = "竖排更适合中文、日文等纵排文字，也可手动用于其他语言";

    const topProgBar = root.querySelector("#reader-top-progress-bar");
    const pctBadge = root.querySelector("#reader-progress-pct-badge");

    scrollArea.addEventListener("scroll", () => {
      const isVerticalWriting = root.getAttribute("data-writing-mode") === "vertical";
      const maxScroll = isVerticalWriting
        ? Math.max(0, scrollArea.scrollWidth - scrollArea.clientWidth)
        : Math.max(0, scrollArea.scrollHeight - scrollArea.clientHeight);
      const currentScroll = isVerticalWriting ? Math.abs(scrollArea.scrollLeft) : scrollArea.scrollTop;
      const pct = maxScroll > 0 ? (currentScroll / maxScroll) * 100 : 0;
      const boundedPct = Math.min(100, Math.max(0, pct));
      if (topProgBar) topProgBar.style.width = `${boundedPct}%`;
      if (pctBadge) pctBadge.textContent = `已读 ${Math.round(boundedPct)}%`;

      const headingPairs = root.querySelectorAll(".reader-paragraph-pair[data-heading='true']");
      let activeHeadId = "";
      headingPairs.forEach(pair => {
        const rect = pair.getBoundingClientRect();
        const inReadingEdge = isVerticalWriting
          ? rect.right <= window.innerWidth && rect.right >= window.innerWidth - 260
          : rect.top >= 0 && rect.top <= 200;
        if (inReadingEdge) activeHeadId = pair.id;
      });

      if (activeHeadId) {
        root.querySelectorAll(".reader-outline-item").forEach(item => {
          item.classList.toggle("active-heading", item.getAttribute("data-target-id") === activeHeadId);
        });
      }
    }, { passive: true });

    root.querySelectorAll(".reader-mode-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        root.querySelectorAll(".reader-mode-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        syncReaderTabIndicator(readerModeTabs, ".reader-mode-btn");
        const mode = btn.getAttribute("data-mode");
        root.setAttribute("data-reader-view", mode);

        const statusText = root.querySelector("#reader-mode-status-text");
        if (mode === "orig") {
          if (statusText) statusText.textContent = "纯净原文阅读";
        } else if (mode === "bilingual") {
          if (statusText) statusText.textContent = "双语对照精排";
          requestReaderTranslation();
        } else if (mode === "trans") {
          if (statusText) statusText.textContent = "纯中文精排阅读";
          requestReaderTranslation();
          const titleEl = root.querySelector(".reader-title");
          sendDictionaryRuntimeMessage({action:"TRANSLATE_SINGLE_BLOCK",text:title,sl:"auto",tl:currentSettings.targetLang || "zh-CN"}, res => {
            if (titleEl && res?.success && res.text && res.text.trim().length < 180 && root.getAttribute("data-reader-view") === "trans") titleEl.textContent = res.text.trim();
          });
        }
        if (mode === "orig" || mode === "bilingual") {
          const titleEl = root.querySelector(".reader-title");
          if (titleEl) titleEl.textContent = title;
        }
      });
    });

    // 偏好持久化监听
    root.querySelectorAll(".reader-theme-swatch").forEach(btn => btn.addEventListener("click", () => {
      const val = btn.dataset.themeValue || "envelope";
      root.setAttribute("data-theme", val);
      root.querySelectorAll(".reader-theme-swatch").forEach(b => b.classList.toggle("active", b === btn));
      currentSettings.readerTheme = val;
      chrome.runtime.sendMessage({ action: "UPDATE_SETTINGS", settings: { readerTheme: val } });
    }));
    const readerImageShadowToggle = root.querySelector("#reader-toggle-image-shadow");
    readerImageShadowToggle?.addEventListener("change", () => {
      const enabled = !!readerImageShadowToggle.checked;
      currentSettings.readerImageShadow = enabled;
      root.style.setProperty("--reader-image-shadow", enabled ? "0 8px 24px rgba(0,0,0,.14)" : "none");
      chrome.runtime.sendMessage({ action:"UPDATE_SETTINGS", settings:{ readerImageShadow:enabled } });
    });
    root.querySelectorAll("[data-reader-surface]").forEach(btn => btn.addEventListener("click", () => {
      const val = readerSurfaceValues.has(btn.dataset.readerSurface) ? btn.dataset.readerSurface : "card";
      root.setAttribute("data-surface", val);
      root.querySelectorAll("[data-reader-surface]").forEach(b => b.classList.toggle("active", b === btn));
      currentSettings.readerSurface = val;
      chrome.runtime.sendMessage({ action:"UPDATE_SETTINGS", settings:{ readerSurface:val } });
    }));

    const readerFontSelect = root.querySelector("#drawer-select-font");
    const applyReaderFontChoice = (val) => {
      const fam = getFontFamilyCss(val);
      root.style.setProperty("--reader-font-family", fam);
      cardElement.style.fontFamily = fam;
      currentSettings.readerFont = val;
      if (readerFontSelect) readerFontSelect.value = val;
      root.querySelectorAll(".reader-font-card").forEach(btn => btn.classList.toggle("active", btn.dataset.value === val));
      chrome.runtime.sendMessage({ action: "UPDATE_SETTINGS", settings: { readerFont: val } }, () => { if (chrome.runtime.lastError) {} });
    };
    readerFontSelect?.addEventListener("change", (e) => applyReaderFontChoice(e.target.value));
    root.querySelectorAll(".reader-font-card").forEach(btn => btn.addEventListener("click", () => applyReaderFontChoice(btn.dataset.value)));

    const widthSlider = root.querySelector("#drawer-width-slider");
    const widthValLabel = root.querySelector("#drawer-width-val");

    const updateReaderWidth = (w) => {
      widthValLabel.textContent = `${w}px`;
      cardElement.style.setProperty("--reader-max-width", `${w}px`);
      cardElement.style.maxWidth = `${w}px`;
      currentSettings.readerWidth = String(w);
      chrome.runtime.sendMessage({ action: "UPDATE_SETTINGS", settings: { readerWidth: String(w) } });
    };

    widthSlider.addEventListener("input", (e) => updateReaderWidth(e.target.value));

    root.querySelectorAll(".preset-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        const w = chip.getAttribute("data-width");
        widthSlider.value = w;
        updateReaderWidth(w);
      });
    });

    const fontSizeVal = root.querySelector("#drawer-font-size-val");
    const updateReaderFontSize = (next) => {
      readerFontSize = Math.max(14, Math.min(25, next));
      root.style.setProperty("--reader-body-size", `${readerFontSize}px`);
      root.querySelectorAll(".reader-trans-p, .reader-orig-p").forEach(p => {
        const pair = p.closest(".reader-paragraph-pair");
        const heading = pair?.getAttribute("data-heading") === "true";
        if (!heading) p.style.fontSize = `${readerFontSize}px`;
      });
      if (fontSizeVal) fontSizeVal.textContent = `${readerFontSize}px`;
      currentSettings.readerFontSize = String(readerFontSize);
      chrome.runtime.sendMessage({ action: "UPDATE_SETTINGS", settings: { readerFontSize: String(readerFontSize) } });
    };
    root.querySelector("#drawer-btn-font-dec").addEventListener("click", () => updateReaderFontSize(readerFontSize - 1));
    root.querySelector("#drawer-btn-font-inc").addEventListener("click", () => updateReaderFontSize(readerFontSize + 1));

    const lineHeightSlider = root.querySelector("#drawer-lineheight-slider");
    const lineHeightVal = root.querySelector("#drawer-lineheight-val");
    lineHeightSlider.addEventListener("input", (e) => {
      const val = e.target.value;
      root.style.setProperty("--reader-line-height", val);
      if (lineHeightVal) lineHeightVal.textContent = val;
      currentSettings.readerLineHeight = val;
      chrome.runtime.sendMessage({ action: "UPDATE_SETTINGS", settings: { readerLineHeight: val } });
    });

    const paragraphSlider = root.querySelector("#drawer-paragraph-slider");
    const paragraphVal = root.querySelector("#drawer-paragraph-val");
    paragraphSlider.addEventListener("input", (e) => {
      const val = e.target.value;
      root.style.setProperty("--reader-paragraph-spacing", `${val}px`);
      if (paragraphVal) paragraphVal.textContent = `${val}px`;
      currentSettings.readerParagraphSpacing = val;
      chrome.runtime.sendMessage({ action: "UPDATE_SETTINGS", settings: { readerParagraphSpacing: val } });
    });

    root.querySelectorAll(".reader-writing-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        root.querySelectorAll(".reader-writing-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        syncReaderTabIndicator(readerWritingTabs, ".reader-writing-btn");
        const val = btn.getAttribute("data-writing") === "vertical" ? "vertical" : "horizontal";
        root.setAttribute("data-writing-mode", val);
        currentSettings.readerWritingMode = val;
        chrome.runtime.sendMessage({ action: "UPDATE_SETTINGS", settings: { readerWritingMode: val } });
      });
    });

    root.querySelectorAll(".reader-outline-item").forEach(item => {
      item.addEventListener("click", () => {
        const targetId = item.getAttribute("data-target-id");
        const targetEl = root.querySelector(`#${targetId}`);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });

    const readerImageNodes = contentNodes.filter(node => node.tagName === "IMG");
    root.querySelectorAll(".reader-img-wrap img").forEach((img, index) => {
      const fallbacks = getReaderImageInfo(readerImageNodes[index])?.candidates || [];
      let fallbackIndex = Math.max(0, fallbacks.indexOf(img.src));
      img.addEventListener("error", () => {
        fallbackIndex += 1;
        if (fallbackIndex < fallbacks.length) img.src = fallbacks[fallbackIndex];
      });
      img.addEventListener("click", () => openImageLightbox(img.src));
    });
    if (canUseImageTranslationHere()) initImageTranslation();

    root.querySelectorAll("[data-reader-translate-one]").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const pair = btn.closest(".reader-paragraph-pair");
        const orig = pair?.querySelector(".reader-orig-p")?.innerText?.trim();
        const transEl = pair?.querySelector(".reader-trans-p");
        if (!orig || !transEl) return;
        if (transEl.dataset.loaded === "true") { pair.classList.toggle("reader-single-reveal"); btn.classList.toggle("is-active", pair.classList.contains("reader-single-reveal")); return; }
        pair.classList.add("reader-single-reveal"); btn.classList.add("is-active");
        btn.classList.add("is-loading");
        sendDictionaryRuntimeMessage({action:"TRANSLATE_SINGLE_BLOCK", text:orig, sl:"auto", tl:currentSettings.targetLang || "zh-CN"}, res => {
          btn.classList.remove("is-loading");
          if (res?.success && res.text) { setReaderTranslationText(transEl, res.text); transEl.dataset.loaded = "true"; }
          else setReaderTranslationText(transEl, "这一段暂时没有翻译结果。");
        });
      });
    });

    const exportMenu = root.querySelector("#reader-export-menu");
    const safeFileName = String(title || "article").replace(/[\\/:*?"<>|]/g, "-").slice(0, 48) || "article";
    const getReaderPairs = () => Array.from(root.querySelectorAll(".reader-paragraph-pair")).map(pair => ({
      orig: pair.querySelector(".reader-orig-p")?.innerText || "",
      trans: pair.querySelector(".reader-trans-p")?.innerText || ""
    }));
    const downloadTextFile = (content, mime, ext) => {
      const blob = new Blob([content], { type: `${mime};charset=utf-8;` });
      const url = URL.createObjectURL(blob); const a = document.createElement("a");
      a.href = url; a.download = `${safeFileName}.${ext}`; a.click(); setTimeout(()=>URL.revokeObjectURL(url), 400);
    };
    exportMenu?.addEventListener("click", (e) => {
      const btn=e.target.closest("button[data-format]"); if(!btn)return;
      const format=btn.dataset.format; const pairs=getReaderPairs();
      if (format === "md") {
        let md = `# ${title}\n\n来源: ${window.location.href}\n\n`;
        pairs.forEach(pair => { md += `${pair.orig}\n\n${pair.trans}\n\n---\n\n`; });
        downloadTextFile(md, "text/markdown", "md");
      } else if (format === "txt") {
        const txt = `${title}\n${window.location.href}\n\n` + pairs.map(p => `${p.orig}\n${p.trans}`).join("\n\n");
        downloadTextFile(txt, "text/plain", "txt");
      } else {
        const body = pairs.map(p => `<section><p class="orig">${escapeHtml(p.orig)}</p><p class="trans">${escapeHtml(p.trans)}</p></section>`).join("");
        const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>body{max-width:820px;margin:48px auto;padding:0 30px;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color:#202328;line-height:1.75}h1{font-size:30px;line-height:1.3}small{color:#7b818a}section{margin:0 0 24px}.orig{font-size:16px;margin:0 0 7px}.trans{font-size:17px;margin:0;color:#525a65}@media print{body{margin:0 auto}}</style></head><body><h1>${escapeHtml(title)}</h1><small>${escapeHtml(window.location.href)}</small>${body}</body></html>`;
        if (format === "html") downloadTextFile(html, "text/html", "html");
        else if (format === "print") { const w=window.open("","_blank"); if(w){ w.document.open(); w.document.write(html); w.document.close(); setTimeout(()=>{w.focus();w.print();},250); } }
      }
    });

    root.querySelector("#reader-btn-exit").addEventListener("click", closeReaderMode);
    if (readerKeydownHandler) window.removeEventListener("keydown", readerKeydownHandler);
    readerKeydownHandler = (e) => {
      if (e.key === "Escape" && isReaderOpen) closeReaderMode();
    };
    window.addEventListener("keydown", readerKeydownHandler);

    root.querySelector("#drawer-btn-speak").addEventListener("click", () => {
      const viewMode = root.getAttribute("data-reader-view") || "bilingual";
      const selector = viewMode === "orig" ? ".reader-orig-p" : viewMode === "trans" ? ".reader-trans-p" : ".reader-orig-p, .reader-trans-p";
      const allText = Array.from(root.querySelectorAll(selector)).map(p => p.innerText).join("\n");
      const lang = viewMode === "trans"
        ? languageCodeToSpeechTag(currentSettings.targetLang)
        : inferSpeechLanguage(allText, currentSettings.sourceLang);
      speakTextNeural(allText, lang);
    });

    root.querySelector("#drawer-btn-copy").addEventListener("click", (e) => {
      const allText = Array.from(root.querySelectorAll(".reader-trans-p")).map(p => p.innerText).join("\n\n");
      navigator.clipboard.writeText(allText);
      const span = e.currentTarget.querySelector("span");
      span.textContent = "已复制";
      setTimeout(() => { span.textContent = "复制全文译文"; }, 1500);
    });

    let hasTriggeredTranslation = false;

    async function triggerReaderTranslationIfNeeded() {
      if (hasTriggeredTranslation || !root?.isConnected) return;
      hasTriggeredTranslation = true;

      try {
        const uncachedItems = [];
        // Reuse translations already produced by webpage bilingual mode in O(n)
        // rather than scanning the whole paragraph map once per reader paragraph.
        const translationByOriginal = new Map();
        paragraphMap.forEach(val => {
          const key = String(val?.origText || "").replace(/\s+/g, " ").trim();
          if (key && val?.transText && !translationByOriginal.has(key)) translationByOriginal.set(key, val.transText);
        });

        contentNodes.forEach((node, idx) => {
          if (!node || node.tagName === "IMG") return;
          const raw = getHostOriginalText(node);
          if (!raw) return;
          const matchedTrans = translationByOriginal.get(raw) || "";

          const pairEl = root.querySelector(`[data-para-id="r_${idx}"] .reader-trans-p`);
          if (matchedTrans && pairEl) {
            setReaderTranslationText(pairEl, matchedTrans);
            pairEl.dataset.loaded = "true";
          } else if (pairEl) {
            uncachedItems.push({ id: `r_${idx}`, text: raw });
          }
        });

        if (uncachedItems.length === 0 || !root?.isConnected) return;

        const transRes = await sendBatchWithIds(uncachedItems);
        if (!root?.isConnected) return;

        if (transRes?.success && Array.isArray(transRes.data)) {
          let failedReaderItems = 0;
          transRes.data.forEach(item => {
            if (!item?.id) return;
            const pairEl = root.querySelector(`[data-para-id="${item.id}"] .reader-trans-p`);
            if (pairEl && item.text && !item.error) {
              setReaderTranslationText(pairEl, item.text);
              pairEl.dataset.loaded = "true";
              const pair = pairEl.closest(".reader-paragraph-pair");
              if (root.getAttribute("data-reader-view") === "trans" && pair?.dataset.heading === "true") {
                const titleEl = root.querySelector(".reader-title");
                if (titleEl && item.text.trim().length < 180) titleEl.textContent = item.text.trim();
              }
            } else if (pairEl) failedReaderItems++;
          });
          if (failedReaderItems) hasTriggeredTranslation = false;
          return;
        }

        // Keep failures contained and allow a later reader-mode transition to retry supplementation.
        hasTriggeredTranslation = false;
        console.warn("Jijian reader translation skipped:", transRes?.error || "unknown translation error");
      } catch (err) {
        hasTriggeredTranslation = false;
        console.warn("Jijian reader translation failed safely:", err);
      }
    }

    const requestReaderTranslation = () => {
      void triggerReaderTranslationIfNeeded().catch((err) => {
        hasTriggeredTranslation = false;
        console.warn("Jijian reader translation request failed safely:", err);
      });
    };

    if (isPageTranslated) {
      requestReaderTranslation();
    }
  }

  function closeReaderMode() {
    // A sidebar opened from Reader Mode is bound to the reader DOM. Close it with
    // the reader so no stale panel or page-width shift survives after exiting.
    if (sidebarReaderMode && sidebarRoot) closeSidebar();
    if (readerKeydownHandler) {
      window.removeEventListener("keydown", readerKeydownHandler);
      readerKeydownHandler = null;
    }
    if (readerRoot) {
      readerRoot.remove();
      readerRoot = null;
    }
    isReaderOpen = false;
  }


  // Local image OCR and translation.
  let imageTranslationInitialized = false;
  let imageTranslateTrigger = null;
  let imageTranslateTarget = null;
  let imageTranslateOverlay = null;
  let imageTranslateOverlayCleanup = null;
  let imageTranslateHideTimer = null;
  let imageTranslateMoveHandler = null;
  let imageTranslateOutHandler = null;
  let imageTranslateViewportHandler = null;
  let imageTranslatePointerHandler = null;
  let imageTranslateLastPointer = null;

  function setImageTranslateTriggerVisible(visible) {
    if (!imageTranslateTrigger) return;
    imageTranslateTrigger.dataset.visible = visible ? "true" : "false";
  }

  function teardownImageTranslation() {
    imageTranslationInitialized = false;
    if (imageTranslateTrigger) imageTranslateTrigger.remove();
    if (imageTranslateOverlayCleanup) { try { imageTranslateOverlayCleanup(); } catch (_) {} }
    else if (imageTranslateOverlay) imageTranslateOverlay.remove();
    imageTranslateTrigger = null; imageTranslateTarget = null; imageTranslateOverlay = null; imageTranslateOverlayCleanup = null;
    if (imageTranslateMoveHandler) document.removeEventListener("pointerover", imageTranslateMoveHandler, true);
    if (imageTranslateOutHandler) document.removeEventListener("pointerout", imageTranslateOutHandler, true);
    if (imageTranslatePointerHandler) document.removeEventListener("pointermove", imageTranslatePointerHandler, true);
    if (imageTranslateViewportHandler) { window.removeEventListener("scroll", imageTranslateViewportHandler); window.removeEventListener("resize", imageTranslateViewportHandler); }
    imageTranslateMoveHandler = null; imageTranslateOutHandler = null; imageTranslatePointerHandler = null; imageTranslateViewportHandler = null;
    imageTranslateLastPointer = null;
  }

  function isTranslatablePageImage(img) {
    if (!(img instanceof HTMLImageElement)) return false;
    const rect = img.getBoundingClientRect();
    const area = Math.max(0, rect.width) * Math.max(0, rect.height);
    const shortest = Math.min(rect.width, rect.height);
    const longest = Math.max(rect.width, rect.height);
    // Keep tiny decorative icons out, but allow genuine long screenshots and
    // banners whose short edge may be well below the old 88px threshold.
    if (area < 12000 || shortest < 40 || longest < 150) return false;
    if (!img.currentSrc && !img.src) return false;
    if (img.closest("#raccoon-image-translate-overlay, #raccoon-image-translate-trigger")) return false;
    return true;
  }

  function positionImageTranslateTrigger(img) {
    if (!imageTranslateTrigger || !img?.isConnected) return;
    const r = img.getBoundingClientRect();
    const size = (r.width >= 720 || r.height >= 460) ? 30 : (r.width >= 360 || r.height >= 260) ? 28 : 26;
    const visibleLeft = Math.max(0, r.left);
    const visibleTop = Math.max(0, r.top);
    const visibleRight = Math.min(innerWidth, r.right);
    const visibleBottom = Math.min(innerHeight, r.bottom);
    if (visibleRight - visibleLeft < size + 16 || visibleBottom - visibleTop < size + 16) {
      setImageTranslateTriggerVisible(false);
      return;
    }
    imageTranslateTrigger.dataset.triggerSize = String(size);
    imageTranslateTrigger.style.setProperty("--jijian-image-trigger-size", `${size}px`);
    imageTranslateTrigger.style.left = `${visibleRight - size - 12}px`;
    // Bottom-right avoids the close/menu controls that image viewers commonly
    // place in the top-right corner.
    imageTranslateTrigger.style.top = `${visibleBottom - size - 12}px`;
    setImageTranslateTriggerVisible(true);
  }

  function pointerInsideImageTriggerTarget(point = imageTranslateLastPointer) {
    if (!point || !imageTranslateTarget?.isConnected) return false;
    if (imageTranslateTrigger?.matches(":hover")) return true;
    const r = imageTranslateTarget.getBoundingClientRect();
    return point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom
      && point.x >= 0 && point.x <= innerWidth && point.y >= 0 && point.y <= innerHeight;
  }

  function initImageTranslation() {
    if (imageTranslationInitialized || !canUseImageTranslationHere()) return;
    imageTranslationInitialized = true;
    if (!imageTranslateTrigger) {
      imageTranslateTrigger = document.createElement("button");
      imageTranslateTrigger.id = "raccoon-image-translate-trigger";
      imageTranslateTrigger.type = "button";
      imageTranslateTrigger.title = "翻译图片文字";
      imageTranslateTrigger.setAttribute("aria-label", "翻译图片文字");
      imageTranslateTrigger.innerHTML = `<img src="${extensionAssetUrls.icon128}" alt="" width="24" height="24">`;
      setImageTranslateTriggerVisible(false);
      document.documentElement.appendChild(imageTranslateTrigger);
      imageTranslateTrigger.addEventListener("pointerenter", () => clearTimeout(imageTranslateHideTimer));
      imageTranslateTrigger.addEventListener("pointerleave", () => { imageTranslateHideTimer=setTimeout(()=>setImageTranslateTriggerVisible(false),180); });
      imageTranslateTrigger.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); if (imageTranslateTarget) translateImageElement(imageTranslateTarget); });
    }
    imageTranslateMoveHandler = (e) => {
      imageTranslateLastPointer = { x:e.clientX, y:e.clientY };
      const img = e.target instanceof HTMLImageElement ? e.target : e.target?.closest?.("img");
      if (!isTranslatablePageImage(img)) return;
      imageTranslateTarget = img;
      clearTimeout(imageTranslateHideTimer);
      positionImageTranslateTrigger(img);
    };
    document.addEventListener("pointerover", imageTranslateMoveHandler, true);
    imageTranslatePointerHandler = (e) => {
      imageTranslateLastPointer = { x:e.clientX, y:e.clientY };
      if (!pointerInsideImageTriggerTarget(imageTranslateLastPointer) && !imageTranslateOverlay) {
        clearTimeout(imageTranslateHideTimer);
        setImageTranslateTriggerVisible(false);
      }
    };
    document.addEventListener("pointermove", imageTranslatePointerHandler, true);
    imageTranslateOutHandler = (e) => {
      if (e.target === imageTranslateTarget && !imageTranslateTrigger?.matches(":hover")) {
        imageTranslateHideTimer=setTimeout(()=>setImageTranslateTriggerVisible(false),220);
      }
    };
    document.addEventListener("pointerout", imageTranslateOutHandler, true);
    imageTranslateViewportHandler = () => {
      if (!imageTranslateTarget || imageTranslateTrigger?.dataset.visible !== "true") return;
      if (!pointerInsideImageTriggerTarget()) setImageTranslateTriggerVisible(false);
      else positionImageTranslateTrigger(imageTranslateTarget);
    };
    window.addEventListener("scroll", imageTranslateViewportHandler, {passive:true});
    window.addEventListener("resize", imageTranslateViewportHandler, {passive:true});
  }

  function dataUrlToBlob(dataUrl) {
    const [head, body] = String(dataUrl).split(",");
    const mime = (head.match(/data:([^;]+)/) || [])[1] || "image/png";
    const binary = atob(body || "");
    const bytes = new Uint8Array(binary.length);
    for (let i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
    return new Blob([bytes], {type:mime});
  }

  async function getImageDataUrl(img) {
    const linkedImageUrl=img.closest("a[href]")?.href||"";
    const candidates=[img.currentSrc,img.src,img.getAttribute("src"),img.dataset?.canonicalSrc,linkedImageUrl]
      .map(value=>String(value||"").trim())
      .filter((value,index,list)=>value&&list.indexOf(value)===index);
    let lastError=new Error("图片没有可读取的地址");
    for(const src of candidates){
      try{
        if(src.startsWith("data:"))return src;
        if(src.startsWith("blob:")){
          const blob=await fetch(src).then(response=>{if(!response.ok)throw new Error(`图片读取失败 (${response.status})`);return response.blob();});
          return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error||new Error("无法读取页面图片"));reader.readAsDataURL(blob);});
        }
        if(!/^https?:\/\//i.test(src))continue;
        const dataUrl=await new Promise((resolve,reject)=>{
          sendDictionaryRuntimeMessage({action:"FETCH_IMAGE_DATA_URL",url:src,pageUrl:location.href},res=>res?.success&&res.dataUrl?resolve(res.dataUrl):reject(new Error(res?.error||"无法读取图片")));
        });
        if(dataUrl)return dataUrl;
      }catch(error){lastError=error instanceof Error?error:new Error(String(error));}
    }
    throw lastError;
  }

  const JIJIAN_OCR_LANGUAGES = {
    auto: { label: "自动", langs: ["eng"] },
    eng: { label: "英语", langs: ["eng"] },
    jpn: { label: "日语", langs: ["jpn"] },
    chi_sim: { label: "简体中文", langs: ["chi_sim"] },
    chi_tra: { label: "繁体中文", langs: ["chi_tra"] },
    kor: { label: "韩语", langs: ["kor"] },
    fra: { label: "法语", langs: ["fra"] },
    deu: { label: "德语", langs: ["deu"] },
    spa: { label: "西班牙语", langs: ["spa"] },
    ita: { label: "意大利语", langs: ["ita"] },
    por: { label: "葡萄牙语", langs: ["por"] },
    rus: { label: "俄语", langs: ["rus"] },
    nld: { label: "荷兰语", langs: ["nld"] },
    pol: { label: "波兰语", langs: ["pol"] },
    tur: { label: "土耳其语", langs: ["tur"] },
    ukr: { label: "乌克兰语", langs: ["ukr"] },
    ara: { label: "阿拉伯语", langs: ["ara"] },
    vie: { label: "越南语", langs: ["vie"] },
    tha: { label: "泰语", langs: ["tha"] },
    ind: { label: "印度尼西亚语", langs: ["ind"] },
    "eng+jpn": { label: "英语 + 日语", langs: ["eng", "jpn"] },
    "eng+chi_sim": { label: "英语 + 简体中文", langs: ["eng", "chi_sim"] },
    "eng+chi_tra": { label: "英语 + 繁体中文", langs: ["eng", "chi_tra"] }
  };

  function mapLanguageToOcrKey(value) {
    const lang = String(value || "").trim().toLowerCase().replace(/_/g, "-");
    if (!lang || lang === "auto") return "";
    if (lang.startsWith("ja")) return "jpn";
    if (lang.startsWith("ko")) return "kor";
    if (lang.startsWith("zh-tw") || lang.startsWith("zh-hk") || lang.includes("hant")) return "chi_tra";
    if (lang.startsWith("zh") || lang.includes("hans")) return "chi_sim";
    if (lang.startsWith("fr")) return "fra";
    if (lang.startsWith("de")) return "deu";
    if (lang.startsWith("es")) return "spa";
    if (lang.startsWith("it")) return "ita";
    if (lang.startsWith("pt")) return "por";
    if (lang.startsWith("ru")) return "rus";
    if (lang.startsWith("nl")) return "nld";
    if (lang.startsWith("pl")) return "pol";
    if (lang.startsWith("tr")) return "tur";
    if (lang.startsWith("uk")) return "ukr";
    if (lang.startsWith("ar")) return "ara";
    if (lang.startsWith("vi")) return "vie";
    if (lang.startsWith("th")) return "tha";
    if (lang.startsWith("id")) return "ind";
    if (lang.startsWith("en")) return "eng";
    return "";
  }

  function resolveImageOcrLanguage(image = null) {
    const configured = JIJIAN_OCR_LANGUAGES[currentSettings.imageOcrLanguage] ? currentSettings.imageOcrLanguage : "auto";
    let key = configured;
    if (configured === "auto") {
      const nearbyText = String([
        image?.getAttribute?.("alt"), image?.getAttribute?.("title"),
        image?.closest?.("figure")?.querySelector?.("figcaption")?.innerText
      ].filter(Boolean).join(" "));
      const kana = (nearbyText.match(/[\u3040-\u30ff]/g) || []).length;
      const han = (nearbyText.match(/[\u3400-\u9fff]/g) || []).length;
      const latin = (nearbyText.match(/[A-Za-z]/g) || []).length;
      const nearbyHint = kana >= 2 ? "jpn" : han >= 3 && han > latin * .45 ? "chi_sim" : latin >= 4 ? "eng" : "";
      const hinted = nearbyHint || mapLanguageToOcrKey(currentSettings.sourceLang)
        || mapLanguageToOcrKey(document.documentElement?.lang)
        || "eng";
      const uiLang = String(navigator.language || "").toLowerCase();
      // Chinese users commonly translate mixed screenshots. Loading the paired
      // model is slower only on first use, but avoids turning existing Han text
      // into Latin gibberish and gives the renderer reliable word geometry.
      key = hinted === "eng" && uiLang.startsWith("zh") ? "eng+chi_sim" : hinted;
    }
    const meta = JIJIAN_OCR_LANGUAGES[key] || JIJIAN_OCR_LANGUAGES.eng;
    return { key, label: meta.label, langs: [...meta.langs] };
  }

  function cleanImageOcrText(input) {
    let text = String(input || "")
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/\uFFFD/g, "")
      .replace(/([A-Za-z])[-‐‑]\n([a-z])/g, "$1$2");

    const cleaned = [];
    for (const raw of text.split("\n")) {
      let line = raw.replace(/[ \t\u00A0]+/g, " ").trim();
      if (!line) {
        if (cleaned.length && cleaned[cleaned.length - 1] !== "") cleaned.push("");
        continue;
      }

      const compact = line.replace(/\s/g, "");
      const contentCount = (line.match(/[\p{L}\p{N}]/gu) || []).length;
      const visibleCount = compact.length;
      if (contentCount === 0) continue;
      const hasCjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(line);
      const symbolRatio = 1 - contentCount / Math.max(1, visibleCount);
      if (!hasCjk && visibleCount >= 4 && contentCount <= 1 && symbolRatio >= .62) continue;
      if (visibleCount >= 4 && contentCount <= 1 && symbolRatio >= .72) continue;
      if (visibleCount >= 6 && contentCount <= 1 && contentCount / Math.max(1, visibleCount) < 0.22) continue;

      line = line
        .replace(/([!！?？。，、;；:：·•~～_=+*—…])\1{3,}/gu, "$1$1")
        .replace(/[│┃┆┇┊┋╎╏]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim();
      if (line) cleaned.push(line);
    }

    while (cleaned[0] === "") cleaned.shift();
    while (cleaned[cleaned.length - 1] === "") cleaned.pop();
    return cleaned.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function imageOcrTextQuality(text) {
    const clean = String(text || "").trim();
    if (!clean) return 0;
    const visible = (clean.match(/[^\s]/gu) || []).length;
    const content = (clean.match(/[\p{L}\p{N}]/gu) || []).length;
    const weird = (clean.match(/[│┃┆┇┊┋╎╏□■◆◇◊¤¦¬]+/gu) || []).length;
    if (content < 2 || visible < 2) return 0;
    const ratio = content / Math.max(1, visible);
    const weirdPenalty = weird / Math.max(1, visible);
    return Math.max(0, Math.min(1, ratio - weirdPenalty * .7));
  }

  let jijianOcrSandboxFrame = null;
  let jijianOcrRequestSeq = 0;
  const jijianOcrPending = new Map();
  let jijianOcrMessageBound = false;

  function ensureJijianOcrMessageBridge() {
    if (jijianOcrMessageBound) return;
    jijianOcrMessageBound = true;
    window.addEventListener("message", (event) => {
      if (jijianOcrSandboxFrame?.contentWindow && event.source !== jijianOcrSandboxFrame.contentWindow) return;
      const data = event?.data;
      if (!data || data.source !== "jijian-ocr-sandbox" || !data.id) return;
      const pending = jijianOcrPending.get(data.id);
      if (!pending) return;
      if (data.type === "progress") {
        pending.onProgress?.({ phase: "tesseract", status: data.status || "", detail:data.detail || "", percent: Math.round(Number(data.progress || 0) * 100) });
        return;
      }
      jijianOcrPending.delete(data.id);
      clearTimeout(pending.timer);
      if (data.type === "result" && String(data.text || "").trim()) {
        const text = cleanImageOcrText(data.text);
        if (!text) return pending.reject(new Error("OCR 结果只有噪声或标点，未检测到可翻译文字"));
        pending.resolve({
          text,
          lines:Array.isArray(data.lines) ? data.lines : [],
          imageWidth:Number(data.imageWidth || 0),
          imageHeight:Number(data.imageHeight || 0),
          language: "auto",
          engine: "tesseract-js",
          confidence: Number(data.confidence || 0),
          ocrLabel: pending.meta?.label || "Tesseract"
        });
      } else {
        pending.reject(new Error(data.error || "本地 OCR 没有识别到清晰文字"));
      }
    }, false);
  }

  function ensureJijianOcrSandbox() {
    ensureJijianOcrMessageBridge();
    if (jijianOcrSandboxFrame?.isConnected) return jijianOcrSandboxFrame;
    const frame = document.createElement("iframe");
    frame.id = "jijian-ocr-sandbox-frame";
    frame.src = extensionAssetUrls.ocrSandbox;
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    Object.assign(frame.style, { position:"fixed", width:"1px", height:"1px", left:"-9999px", top:"-9999px", opacity:"0", pointerEvents:"none", border:"0" });
    document.documentElement.appendChild(frame);
    jijianOcrSandboxFrame = frame;
    return frame;
  }

  async function waitJijianOcrSandboxReady(frame, timeout = 12000) {
    if (frame.dataset.ready === "1") return;
    await new Promise((resolve, reject) => {
      let done = false;
      const ping = () => { try { frame.contentWindow?.postMessage({ source:"jijian-translate", type:"ping" }, "*"); } catch (_) {} };
      const finish = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearInterval(pinger);
        window.removeEventListener("message", onMessage);
        frame.removeEventListener("load", ping);
        ok ? resolve() : reject(new Error("OCR 运行环境加载失败"));
      };
      const onMessage = (event) => {
        if (event?.source === frame.contentWindow && event?.data?.source === "jijian-ocr-sandbox" && event.data.type === "ready") {
          frame.dataset.ready = "1";
          finish(true);
        }
      };
      window.addEventListener("message", onMessage);
      frame.addEventListener("load", ping, { once:true });
      const pinger = setInterval(ping, 300);
      const timer = setTimeout(() => finish(false), timeout);
      ping();
    });
  }

  async function recognizeImageTextTesseract(dataUrl, onProgress, meta = resolveImageOcrLanguage()) {
    const frame = ensureJijianOcrSandbox();
    await waitJijianOcrSandboxReady(frame);
    const id = `ocr-${Date.now()}-${++jijianOcrRequestSeq}`;
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        jijianOcrPending.delete(id);
        reject(new Error("本地 OCR 超过 120 秒，已自动停止；请检查网络后重试或在设置中选择单一识别语言"));
      }, 120000);
      jijianOcrPending.set(id, { resolve, reject, onProgress, timer, meta });
      frame.contentWindow.postMessage({ source:"jijian-translate", type:"recognize", id, dataUrl, langs:meta.langs }, "*");
    });
  }

  function getImageOcrReadyMap() {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({ action:"GET_IMAGE_OCR_READY_MAP" }, response => {
          if (chrome.runtime.lastError || !response?.success || typeof response.readyMap !== "object") resolve({});
          else resolve(response.readyMap);
        });
      } catch (_) { resolve({}); }
    });
  }

  function setImageOcrReadyMap(readyMap) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage({ action:"SET_IMAGE_OCR_READY_MAP", readyMap }, response => {
          if (chrome.runtime.lastError) resolve(false);
          else resolve(response?.success === true);
        });
      } catch (_) { resolve(false); }
    });
  }

  async function ensureImageOcrConsent(overlay, status, result, meta) {
    const readyMap = await getImageOcrReadyMap();
    if (readyMap[meta.key]) return { allowed:true, cached:true };

    const prompt = overlay.querySelector(".image-ocr-model-prompt");
    overlay.classList.add("is-model-prompt", "controls-visible");
    if (result) { result.hidden = true; result.innerHTML = ""; }
    if (prompt) {
      prompt.hidden = false;
      prompt.innerHTML = `<strong>首次使用需要下载${escapeHtml(meta.label)} OCR 模型</strong><span>模型体积会因语言不同而变化。OCR 在本机浏览器中完成；图片不会发送给 OCR 服务。下载后会由浏览器缓存复用。</span><div><button type="button" data-ocr-model-download>下载并开始</button><button type="button" data-ocr-model-cancel>暂不使用</button></div>`;
    }
    status.textContent = `图片翻译 · ${meta.label} OCR`;
    return await new Promise(resolve => {
      const yes = prompt?.querySelector("[data-ocr-model-download]");
      const no = prompt?.querySelector("[data-ocr-model-cancel]");
      const finish = async (value) => {
        yes?.removeEventListener("click", onYes);
        no?.removeEventListener("click", onNo);
        overlay.classList.remove("is-model-prompt");
        overlay.classList.toggle("is-ocr-downloading", value);
        if (prompt) { prompt.hidden = true; prompt.innerHTML = ""; }
        resolve({ allowed:value, cached:false });
      };
      const onYes = () => finish(true);
      const onNo = () => finish(false);
      yes?.addEventListener("click", onYes);
      no?.addEventListener("click", onNo);
    });
  }

  async function markImageOcrModelReady(meta) {
    if (!meta?.key) return;
    const readyMap = { ...(await getImageOcrReadyMap()) };
    readyMap[meta.key] = true;
    await setImageOcrReadyMap(readyMap);
  }

  function positionImageOverlay(overlay, img) {
    if (!overlay || !img?.isConnected) return;
    const r = img.getBoundingClientRect();
    const cs = getComputedStyle(img);
    const compactHorizontal = r.height < 118 && r.width >= 280;
    const compactVertical = r.width < 210 && r.height >= 320;
    overlay.classList.toggle("compact-horizontal", compactHorizontal);
    overlay.classList.toggle("compact-vertical", compactVertical);
    Object.assign(overlay.style, {
      left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
      borderRadius: cs.borderRadius || "0px"
    });
    const translatedImage = overlay.querySelector(".image-translate-render");
    if (translatedImage) {
      translatedImage.style.objectFit = cs.objectFit || "fill";
      translatedImage.style.objectPosition = cs.objectPosition || "50% 50%";
      translatedImage.style.borderRadius = cs.borderRadius || "0px";
    }

    // For long screenshots, keep the controls inside the visible slice of the
    // image instead of attaching them to an off-screen top/bottom edge.
    const visibleTop = Math.max(0, -r.top);
    const visibleBottom = Math.max(0, r.bottom - innerHeight);
    const topbar = overlay.querySelector(".image-translate-topbar");
    const progress = overlay.querySelector(".image-translate-progress");
    const actions = overlay.querySelector(".image-translate-actions");
    const result = overlay.querySelector(".image-translate-result");
    if (topbar) {
      topbar.style.left = "8px";
      topbar.style.right = "8px";
      topbar.style.width = "auto";
      topbar.style.top = `${Math.min(Math.max(8, visibleTop + 8), Math.max(8, r.height - 42))}px`;
    }
    if (progress) progress.style.top = "auto";
    if (actions) {
      actions.style.left = "auto";
      actions.style.right = "8px";
      actions.style.width = "auto";
      actions.style.bottom = `${Math.min(Math.max(8, visibleBottom + 8), Math.max(8, r.height - 40))}px`;
    }
    if (result && !result.hidden) {
      const y = Math.min(Math.max(50, visibleTop + 50), Math.max(50, r.height - 180));
      result.style.top = `${y}px`;
      result.style.bottom = "auto";
      result.style.maxHeight = `${Math.max(90, Math.min(300, innerHeight - 120))}px`;
    }
  }

  async function saveDataUrl(dataUrl, filename) {
    const a=document.createElement("a"); a.href=dataUrl; a.download=filename; document.documentElement.appendChild(a); a.click(); a.remove();
  }

  function wrapCanvasText(ctx, text, maxWidth) {
    const lines=[];
    String(text||"").split(/\n+/).forEach(par => {
      let line="";
      const tokens = /\s/.test(par) ? par.split(/(\s+)/).filter(Boolean) : Array.from(par);
      for (const token of tokens) {
        const test=line+token;
        if (ctx.measureText(test).width>maxWidth && line.trim()) { lines.push(line.trim()); line=token.trimStart(); } else line=test;
      }
      if(line.trim()) lines.push(line.trim()); if(!par) lines.push("");
    });
    return lines;
  }

  function clampNumber(value, min, max) { return Math.max(min, Math.min(max, value)); }

  function readableOcrError(error) {
    const raw=String(error?.message||error||"").replace(/\s+/g," ").trim();
    if(!raw)return "OCR 运行组件加载失败，请刷新页面后重试";
    const looksLikeRuntimeCode=raw.length>260||/(?:WebAssembly|wasmBinary|function\s*\(|=>|\bvar\s+\w+|\breturn\s*\{|\.output\?\.length)/.test(raw);
    return looksLikeRuntimeCode?"OCR 运行组件加载失败，请刷新页面后重试":raw.slice(0,220);
  }

  function cleanOcrLineItems(ocr) {
    return (Array.isArray(ocr?.lines) ? ocr.lines : []).map((line,index) => ({
      index,
      text: cleanImageOcrText(line?.text || "").replace(/\n+/g," ").trim(),
      bbox: line?.bbox,
      confidence: Number(line?.confidence || 0),
      alignment: ["left","center","right"].includes(line?.alignment) ? line.alignment : ""
    })).filter(line => {
      const b=line.bbox;
      return line.text && b && Number.isFinite(b.x0) && Number.isFinite(b.y0) && Number.isFinite(b.x1) && Number.isFinite(b.y1)
        && b.x1>b.x0 && b.y1>b.y0 && imageOcrTextQuality(line.text) >= .28;
    }).sort((a,b)=>(a.bbox.y0-b.bbox.y0)||(a.bbox.x0-b.bbox.x0));
  }

  function mergeOcrLineItems(items) {
    // TSV parsing already splits a visual line at large horizontal gaps. Do
    // not merge it again here: two columns can share a baseline while belonging
    // to completely different text regions.
    const kept=[];
    for(const item of items){
      const duplicate=kept.find(previous=>{
        const a=previous.bbox,b=item.bbox;
        const overlapX=Math.max(0,Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0));
        const overlapY=Math.max(0,Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0));
        const area=Math.max(1,Math.min((a.x1-a.x0)*(a.y1-a.y0),(b.x1-b.x0)*(b.y1-b.y0)));
        return overlapX*overlapY/area>.72 && previous.text.toLowerCase()===item.text.toLowerCase();
      });
      if(!duplicate)kept.push({...item,index:kept.length});
      else if(item.confidence>duplicate.confidence)Object.assign(duplicate,item);
    }
    return kept.sort((a,b)=>(a.bbox.y0-b.bbox.y0)||(a.bbox.x0-b.bbox.x0));
  }

  async function translateOcrForImage(ocr) {
    const lines=mergeOcrLineItems(cleanOcrLineItems(ocr));
    const targetLang=currentSettings.targetLang||"zh-CN";
    if(lines.length){
      const batch=await new Promise(resolve=>sendDictionaryRuntimeMessage({
        action:"TRANSLATE_BATCH_IDS",
        items:lines.map((line,i)=>({id:`ocr-line-${i}`,text:line.text})),
        sl:"auto",tl:targetLang
      },resolve));
      if(batch?.success&&Array.isArray(batch.data)){
        const byId=new Map(batch.data.filter(Boolean).map(item=>[String(item.id||""),String(item.text||"").trim()]));
        const items=lines.map((line,i)=>({...line,translated:byId.get(`ocr-line-${i}`)||""})).filter(x=>x.translated);
        if(items.length)return { translatedText:items.map(x=>x.translated).join("\n"), items, structured:true };
      }
    }
    const trans=await new Promise(resolve=>sendDictionaryRuntimeMessage({action:"TRANSLATE_SINGLE_BLOCK",text:ocr.text,sl:"auto",tl:targetLang},resolve));
    if(!trans?.success) throw new Error(trans?.error||"图片文字翻译失败");
    const translatedText=String(trans.text||"").trim();
    if(!translatedText) throw new Error("翻译引擎没有返回译文");
    return {translatedText,items:[],structured:false};
  }

  function sampleCanvasBackground(ctx, rect, canvasWidth, canvasHeight) {
    try {
      const x0=clampNumber(Math.round(rect.x),0,canvasWidth-1), y0=clampNumber(Math.round(rect.y),0,canvasHeight-1);
      const x1=clampNumber(Math.round(rect.x+rect.width-1),0,canvasWidth-1), y1=clampNumber(Math.round(rect.y+rect.height-1),0,canvasHeight-1);
      const inset=Math.max(2,Math.round(Math.min(rect.width,rect.height)*.12));
      const points=[
        [x0-inset,y0-inset],[x0+(x1-x0)*.25,y0-inset],[x0+(x1-x0)*.5,y0-inset],[x0+(x1-x0)*.75,y0-inset],[x1+inset,y0-inset],
        [x0-inset,y0+(y1-y0)*.35],[x1+inset,y0+(y1-y0)*.35],[x0-inset,y0+(y1-y0)*.7],[x1+inset,y0+(y1-y0)*.7],
        [x0-inset,y1+inset],[x0+(x1-x0)*.25,y1+inset],[x0+(x1-x0)*.5,y1+inset],[x0+(x1-x0)*.75,y1+inset],[x1+inset,y1+inset]
      ];
      const rgb=[];
      for(const [x,y] of points){
        const px=ctx.getImageData(clampNumber(Math.round(x),0,canvasWidth-1),clampNumber(Math.round(y),0,canvasHeight-1),1,1).data;
        rgb.push([px[0],px[1],px[2]]);
      }
      const color=[0,1,2].map(channel=>rgb.map(value=>value[channel]).sort((a,b)=>a-b)[Math.floor(rgb.length/2)]);
      const dispersion=rgb.reduce((sum,value)=>sum+Math.hypot(value[0]-color[0],value[1]-color[1],value[2]-color[2]),0)/Math.max(1,rgb.length);
      return {color,dispersion};
    } catch (_) { return {color:[248,248,247],dispersion:0}; }
  }

  function paintImageTranslationBackdrop(ctx, sourceCanvas, rect, sample) {
    const [r,g,b]=sample.color;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x,rect.y,rect.width,rect.height);
    ctx.clip();
    if(sample.dispersion<24){
      ctx.fillStyle=`rgb(${r} ${g} ${b})`;
      ctx.fillRect(rect.x,rect.y,rect.width,rect.height);
    }else{
      const blur=Math.max(5,Math.min(16,Math.round(Math.min(rect.width,rect.height)*.22)));
      ctx.filter=`blur(${blur}px)`;
      ctx.drawImage(sourceCanvas,rect.x,rect.y,rect.width,rect.height,rect.x-blur,rect.y-blur,rect.width+blur*2,rect.height+blur*2);
      ctx.filter="none";
      ctx.fillStyle=`rgba(${r},${g},${b},.58)`;
      ctx.fillRect(rect.x,rect.y,rect.width,rect.height);
    }
    ctx.restore();
  }

  function fitTranslatedText(ctx,text,rect,initialFont) {
    const fontFamily = getImageTranslationFontCss();
    const cjk=/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(String(text||""));
    const minFont=Math.max(8,Math.round(initialFont*.43));
    for(let fs=Math.round(initialFont);fs>=minFont;fs--){
      ctx.font=`600 ${fs}px ${fontFamily}`;
      const lines=wrapCanvasText(ctx,text,Math.max(10,rect.width));
      const lineHeight=Math.round(fs*(cjk?1.34:1.27));
      if(lines.length*lineHeight<=rect.height && lines.every(line=>ctx.measureText(line).width<=rect.width+1)) return {fontSize:fs,lineHeight,lines};
    }
    const fs=minFont;
    ctx.font=`600 ${fs}px ${fontFamily}`;
    const lineHeight=Math.round(fs*(cjk?1.32:1.25));
    const maxLines=Math.max(1,Math.floor(rect.height/lineHeight));
    const lines=wrapCanvasText(ctx,text,Math.max(10,rect.width)).slice(0,maxLines);
    if(lines.length){
      let last=lines[lines.length-1];
      while(last.length>1&&ctx.measureText(`${last}…`).width>rect.width)last=last.slice(0,-1);
      if(lines.join("").length<String(text||"").replace(/\s/g,"").length)lines[lines.length-1]=`${last.replace(/[.,，。;；:：!?！？…]+$/u,"")}…`;
    }
    return {fontSize:fs,lineHeight,lines};
  }

  function buildImageTranslationLayout(items, sx, sy, canvasWidth, canvasHeight) {
    const mapped=items.map((item,index)=>{
      const box=item.bbox||{};
      const x0=clampNumber(Number(box.x0||0)*sx,0,canvasWidth-1);
      const y0=clampNumber(Number(box.y0||0)*sy,0,canvasHeight-1);
      const x1=clampNumber(Number(box.x1||0)*sx,x0+1,canvasWidth);
      const y1=clampNumber(Number(box.y1||0)*sy,y0+1,canvasHeight);
      return {...item,index,base:{x0,y0,x1,y1,width:x1-x0,height:y1-y0}};
    });

    return mapped.map(item=>{
      const base=item.base;
      let leftLimit=0,rightLimit=canvasWidth,topLimit=0,bottomLimit=canvasHeight;
      for(const other of mapped){
        if(other===item)continue;
        const box=other.base;
        const overlapY=Math.max(0,Math.min(base.y1,box.y1)-Math.max(base.y0,box.y0));
        const sameBand=overlapY/Math.max(1,Math.min(base.height,box.height))>.28 || Math.abs((base.y0+base.y1-box.y0-box.y1)/2)<Math.max(base.height,box.height)*.58;
        if(sameBand&&box.x1<=base.x0)leftLimit=Math.max(leftLimit,(box.x1+base.x0)/2);
        if(sameBand&&box.x0>=base.x1)rightLimit=Math.min(rightLimit,(base.x1+box.x0)/2);

        const overlapX=Math.max(0,Math.min(base.x1,box.x1)-Math.max(base.x0,box.x0));
        const sameColumn=overlapX/Math.max(1,Math.min(base.width,box.width))>.24;
        if(sameColumn&&box.y1<=base.y0)topLimit=Math.max(topLimit,(box.y1+base.y0)/2);
        if(sameColumn&&box.y0>=base.y1)bottomLimit=Math.min(bottomLimit,(base.y1+box.y0)/2);
      }
      const padX=Math.max(2,Math.min(12,Math.round(base.height*.22)));
      const padY=Math.max(2,Math.min(8,Math.round(base.height*.16)));
      const x0=clampNumber(Math.max(leftLimit,base.x0-padX),0,canvasWidth-1);
      const y0=clampNumber(Math.max(topLimit,base.y0-padY),0,canvasHeight-1);
      const x1=clampNumber(Math.min(rightLimit,base.x1+padX),x0+1,canvasWidth);
      const y1=clampNumber(Math.min(bottomLimit,base.y1+padY),y0+1,canvasHeight);
      const center=(base.x0+base.x1)/2;
      const inferred=Math.abs(center-canvasWidth/2)<Math.max(canvasWidth*.065,base.width*.12)
        ? "center"
        : (base.x1>canvasWidth*.9&&base.x0>canvasWidth*.45 ? "right" : "left");
      return {...item,rect:{x:x0,y:y0,width:x1-x0,height:y1-y0},textAlign:item.alignment||inferred};
    });
  }

  function getImageTranslationFontCss() {
    switch (currentSettings.imageTranslationFont) {
      case "rounded": return '"Yuanti SC","STYuanti","Microsoft YaHei","PingFang SC",sans-serif';
      case "serif": return '"Source Han Serif SC","Noto Serif CJK SC","Songti SC","STSong",serif';
      case "handwriting": return '"LXGW WenKai","Kaiti SC","STKaiti","KaiTi",serif';
      default: return '-apple-system,BlinkMacSystemFont,"PingFang SC","Noto Sans CJK SC","Segoe UI",sans-serif';
    }
  }

  async function makeTranslatedImageDataUrl(originalDataUrl, ocr, translation) {
    const image=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=originalDataUrl;});
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,image.naturalWidth||image.width); canvas.height=Math.max(1,image.naturalHeight||image.height);
    const ctx=canvas.getContext("2d",{alpha:false,willReadFrequently:true}); if(!ctx) throw new Error("无法创建译图画布");
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    const sourceCanvas=document.createElement("canvas"); sourceCanvas.width=canvas.width; sourceCanvas.height=canvas.height;
    const sourceCtx=sourceCanvas.getContext("2d",{alpha:false,willReadFrequently:true});
    if(!sourceCtx)throw new Error("无法读取译图背景");
    sourceCtx.drawImage(image,0,0,canvas.width,canvas.height);

    const sourceW=Math.max(1,Number(ocr?.imageWidth||canvas.width));
    const sourceH=Math.max(1,Number(ocr?.imageHeight||canvas.height));
    const sx=canvas.width/sourceW, sy=canvas.height/sourceH;
    const items=Array.isArray(translation?.items)?translation.items:[];

    if(items.length){
      const layoutItems=buildImageTranslationLayout(items,sx,sy,canvas.width,canvas.height);
      for(const item of layoutItems){
        const rect=item.rect;
        const inset=Math.max(2,Math.min(8,Math.round(rect.height*.12)));
        const textRect={x:rect.x+inset,y:rect.y,width:Math.max(8,rect.width-inset*2),height:rect.height};
        const initial=Math.max(10,Math.min(54,rect.height*.72));
        const fitted=fitTranslatedText(ctx,item.translated,textRect,initial);
        const sample=sampleCanvasBackground(sourceCtx,rect,canvas.width,canvas.height);
        const [localR,localG,localB]=sample.color;
        const useLightText=(localR*299+localG*587+localB*114)/1000<132;
        paintImageTranslationBackdrop(ctx,sourceCanvas,rect,sample);
        ctx.save();ctx.beginPath();ctx.rect(rect.x,rect.y,rect.width,rect.height);ctx.clip();
        ctx.fillStyle=useLightText?"#f8fafc":"#12161b";
        if(sample.dispersion>=24){ctx.shadowColor=useLightText?"rgba(0,0,0,.32)":"rgba(255,255,255,.32)";ctx.shadowBlur=Math.max(1,Math.round(fitted.fontSize*.08));}
        ctx.textBaseline="top";
        ctx.font=`600 ${fitted.fontSize}px ${getImageTranslationFontCss()}`;
        const totalH=fitted.lines.length*fitted.lineHeight;
        const startY=rect.y+Math.max(0,(rect.height-totalH)/2);
        ctx.textAlign=item.textAlign;
        const drawX=item.textAlign==="center"?rect.x+rect.width/2:item.textAlign==="right"?rect.x+rect.width-inset:rect.x+inset;
        fitted.lines.forEach((line,i)=>{
          ctx.fillText(line,drawX,startY+i*fitted.lineHeight,Math.max(8,rect.width-inset*2));
        });
        ctx.restore();
      }
    } else {
      throw new Error("OCR 没有返回可靠的文字位置，已保留原图；请切换识别语言后重试");
    }
    return canvas.toDataURL("image/png",.96);
  }

  async function translateImageElement(img) {
    if (!img || !img.isConnected) return;
    setImageTranslateTriggerVisible(false);
    if (imageTranslateOverlayCleanup) { try { imageTranslateOverlayCleanup(); } catch (_) {} }
    else if (imageTranslateOverlay) imageTranslateOverlay.remove();

    const overlay=document.createElement("div");
    overlay.id="raccoon-image-translate-overlay";
    overlay.className="is-preparing";
    imageTranslateOverlay=overlay;
    overlay.innerHTML=`<div class="image-translate-scan"><span></span></div><div class="image-translate-topbar"><span class="image-translate-status-wrap"><i class="image-translate-spinner" aria-hidden="true"></i><span class="image-translate-status">正在准备图片…</span><span class="image-translate-progress" aria-hidden="true"><span></span></span></span><div class="image-ocr-model-prompt" hidden></div><button type="button" data-act="close" aria-label="恢复原图并关闭"><svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7 7 17"/></svg></button></div><div class="image-translate-result" hidden></div><div class="image-translate-actions" hidden><div class="image-translate-view-switch"><button type="button" data-act="original">原图</button><button type="button" data-act="translated" class="active">译图</button></div><div class="image-translate-action-end"><button type="button" class="image-translate-download-current" data-act="download-current" title="下载当前图片"><svg viewBox="0 0 24 24"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 16.5V20h14v-3.5"/></svg><span>下载</span></button><button type="button" class="image-translate-action-close" data-act="close-ready" title="关闭图片翻译" aria-label="关闭图片翻译"><svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7 7 17"/></svg></button></div></div>`;
    document.documentElement.appendChild(overlay);
    positionImageOverlay(overlay,img);

    const sync=()=>positionImageOverlay(overlay,img);
    window.addEventListener("scroll",sync,{passive:true}); window.addEventListener("resize",sync,{passive:true});
    let controlsTimer=0,disposed=false,currentView="translated",translatedDataUrl="",originalDataUrl="",originalBlob=null,imageNodeChanged=false;
    const originalNodeState={
      src:img.getAttribute("src") || img.currentSrc || img.src || null,srcset:img.getAttribute("srcset"),sizes:img.getAttribute("sizes"),
      sources:Array.from(img.closest("picture")?.querySelectorAll("source")||[]).map(source=>({source,srcset:source.getAttribute("srcset"),sizes:source.getAttribute("sizes")}))
    };
    const setNodeAttr=(node,name,value)=>value===null?node.removeAttribute(name):node.setAttribute(name,value);
    const showImageSource=dataUrl=>{originalNodeState.sources.forEach(({source})=>source.removeAttribute("srcset"));img.removeAttribute("srcset");img.removeAttribute("sizes");img.src=dataUrl;imageNodeChanged=true;};
    const restoreImageSource=()=>{if(!imageNodeChanged)return;originalNodeState.sources.forEach(({source,srcset,sizes})=>{setNodeAttr(source,"srcset",srcset);setNodeAttr(source,"sizes",sizes);});setNodeAttr(img,"src",originalNodeState.src);setNodeAttr(img,"srcset",originalNodeState.srcset);setNodeAttr(img,"sizes",originalNodeState.sizes);imageNodeChanged=false;};
    const status=overlay.querySelector(".image-translate-status"),result=overlay.querySelector(".image-translate-result"),actions=overlay.querySelector(".image-translate-actions"),progressBar=overlay.querySelector(".image-translate-progress span");
    const setProgress=(percent,indeterminate=false)=>{
      const p=clampNumber(Number(percent||0),0,100);
      overlay.classList.toggle("progress-indeterminate",Boolean(indeterminate));
      if(progressBar) progressBar.style.width=`${p}%`;
    };
    const showControls=()=>{if(disposed)return;overlay.classList.add("controls-visible");clearTimeout(controlsTimer);controlsTimer=setTimeout(()=>{if(!disposed)overlay.classList.remove("controls-visible");},2200);};
    const hideControls=()=>{if(disposed)return;clearTimeout(controlsTimer);overlay.classList.remove("controls-visible");};
    const cleanup=()=>{if(disposed)return;disposed=true;restoreImageSource();clearTimeout(controlsTimer);window.removeEventListener("scroll",sync);window.removeEventListener("resize",sync);overlay.remove();if(imageTranslateOverlay===overlay)imageTranslateOverlay=null;if(imageTranslateOverlayCleanup===cleanup)imageTranslateOverlayCleanup=null;if(imageTranslateTrigger&&imageTranslateTarget===img&&pointerInsideImageTriggerTarget())setImageTranslateTriggerVisible(true);};
    imageTranslateOverlayCleanup=cleanup;
    overlay.addEventListener("pointerenter",showControls,{passive:true});
    overlay.addEventListener("pointermove",showControls,{passive:true});
    overlay.addEventListener("pointerleave",hideControls,{passive:true});
    overlay.querySelector('[data-act="close"]').addEventListener("click",cleanup);
    overlay.querySelector('[data-act="close-ready"]').addEventListener("click",cleanup);

    try {
      setProgress(4,true);
      originalDataUrl=await getImageDataUrl(img); if(disposed)return;
      originalBlob=dataUrlToBlob(originalDataUrl);
      status.textContent="正在读取原图尺寸…";
      let sourceBitmap=null;
      try{
        try {
          sourceBitmap=await createImageBitmap(originalBlob);
          overlay.dataset.imageNaturalWidth=String(sourceBitmap.width||img.naturalWidth||0);
          overlay.dataset.imageNaturalHeight=String(sourceBitmap.height||img.naturalHeight||0);
        } catch (_) {
          // Chromium cannot create an ImageBitmap for every SVG/GitHub image.
          // Fall back to the ordinary image decoder instead of failing before
          // the user even sees the OCR model prompt.
          const decoded=await new Promise((resolve,reject)=>{
            const probe=new Image();
            probe.onload=()=>resolve(probe);
            probe.onerror=()=>reject(new Error("无法解码这张图片"));
            probe.src=originalDataUrl;
          });
          overlay.dataset.imageNaturalWidth=String(decoded.naturalWidth||decoded.width||img.naturalWidth||0);
          overlay.dataset.imageNaturalHeight=String(decoded.naturalHeight||decoded.height||img.naturalHeight||0);
        }
      }finally{try{sourceBitmap?.close?.();}catch(_){}}
      positionImageOverlay(overlay,img);

      status.textContent="正在识别图片文字…"; setProgress(8,true);
      const meta=resolveImageOcrLanguage(img);
      const consent=await ensureImageOcrConsent(overlay,status,result,meta); if(disposed)return;
      if(!consent?.allowed){cleanup();return;}
      status.textContent=consent.cached?`正在加载已缓存的${meta.label} OCR…`:`正在下载并准备${meta.label} OCR…`; setProgress(10,true);
      overlay.classList.remove("is-preparing");
      overlay.classList.add("is-recognizing");
      const ocr=await recognizeImageTextTesseract(originalDataUrl,state=>{
        if(disposed)return;
        const s=String(state.status||"");
        const label=s==="preparing image"?"正在分析原图尺寸"
          :s.startsWith("loading language source")?(consent.cached?"正在读取 OCR 模型缓存":`正在连接 OCR 模型源${state.detail?`（${state.detail}）`:""}`)
          :s==="loading tesseract core"?"正在加载 OCR 运行组件"
          :s==="loading language traineddata"?(consent.cached?`正在读取${meta.label}模型`:`正在下载${meta.label}模型`)
          :s==="initializing api"?"正在初始化 OCR"
          :s.startsWith("recognizing segment")?"正在分段识别长图"
          :"本地 OCR 识别中";
        const stageFloor=s.startsWith("loading language source")?4:s==="loading tesseract core"?10:s==="loading language traineddata"?16:s==="initializing api"?72:s.startsWith("recognizing")?76:8;
        const ocrPercent=Math.max(stageFloor,Math.min(100,Number(state.percent||0)));
        const overall=Math.max(10,Math.min(78,10+ocrPercent*.68));
        status.textContent=`${label} · ${Math.round(overall)}%`;
        setProgress(overall,false);
      },meta);
      await markImageOcrModelReady(meta);
      overlay.classList.remove("is-ocr-downloading","is-recognizing");
      if(disposed)return;
      const cleanedText=cleanImageOcrText(ocr?.text); if(!cleanedText||(cleanedText.match(/[\p{L}\p{N}]/gu)||[]).length<2)throw new Error("OCR 没有识别到足够清晰的可翻译文字");
      ocr.text=cleanedText;
      status.textContent="已识别 · 正在翻译…"; setProgress(82,true);
      const translation=await translateOcrForImage(ocr); if(disposed)return;
      status.textContent="正在排版译图…"; setProgress(91,true);
      translatedDataUrl=await makeTranslatedImageDataUrl(originalDataUrl,ocr,translation); if(disposed)return;
      showImageSource(translatedDataUrl);

      overlay.classList.add("is-ready"); overlay.classList.remove("controls-visible","is-preparing","is-recognizing"); actions.hidden=false; result.hidden=true; result.innerHTML=""; setProgress(100,false);
      status.textContent="翻译完成"; positionImageOverlay(overlay,img);

      const selectView=name=>{if(disposed)return;currentView=name;const original=name==="original";if(original)restoreImageSource();else showImageSource(translatedDataUrl);overlay.classList.toggle("show-original",original);overlay.querySelectorAll('.image-translate-view-switch button').forEach(b=>b.classList.toggle('active',b.dataset.act===name));showControls();positionImageOverlay(overlay,img);};
      overlay.querySelector('[data-act="original"]').addEventListener("click",()=>selectView("original"));
      overlay.querySelector('[data-act="translated"]').addEventListener("click",()=>selectView("translated"));
      overlay.querySelector('[data-act="download-current"]').addEventListener("click",async()=>{
        const original=currentView==="original";
        const ext=originalBlob?.type?.includes("jpeg")?"jpg":originalBlob?.type?.includes("webp")?"webp":original?"png":"png";
        await saveDataUrl(original?originalDataUrl:translatedDataUrl,`jijian-${original?"original":"translated"}-${Date.now()}.${ext}`);
      });
    } catch(err) {
      if(disposed)return;
      overlay.classList.remove("is-preparing","is-recognizing","is-ocr-downloading");
      overlay.classList.add("is-error","controls-visible"); setProgress(0,false); result.hidden=false;
      result.innerHTML=`<strong>暂时无法翻译这张图片</strong><span>${escapeHtml(readableOcrError(err))}</span><small>OCR 在本机浏览器内运行；识别成功后的纯文本才交给你当前的翻译引擎。</small><div class="image-translate-error-actions"><button type="button" data-image-retry>重试</button><button type="button" data-image-close>关闭</button></div>`;
      status.textContent="图片翻译不可用"; showControls(); positionImageOverlay(overlay,img);
      result.querySelector("[data-image-retry]")?.addEventListener("click",()=>{ cleanup(); setTimeout(()=>translateImageElement(img),30); });
      result.querySelector("[data-image-close]")?.addEventListener("click",cleanup);
    }
  }

  function openImageLightbox(src) {
    const existing = document.getElementById("raccoon-image-lightbox");
    if (existing) existing.remove();

    const box = document.createElement("div");
    box.id = "raccoon-image-lightbox";
    const icon = (name) => ({
      plus:'<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M11 8v6M8 11h6M20 20l-4-4"/></svg>',
      minus:'<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M8 11h6M20 20l-4-4"/></svg>',
      save:'<svg viewBox="0 0 24 24"><path d="M5 4h12l2 2v14H5z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/></svg>',
      copy:'<svg viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>',
      translate:`<img class="lightbox-brand-icon" src="${extensionAssetUrls.icon128}" alt="" aria-hidden="true">`,
      close:'<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7 7 17"/></svg>'
    }[name] || '');
    box.innerHTML = `
      <button class="lightbox-close-btn" id="lightbox-btn-close" title="关闭 (Esc)">${icon('close')}</button>
      <div class="lightbox-stage">
        <div class="lightbox-img-container"><img class="lightbox-img" id="lightbox-target-img" src="${src}" alt="放大查看" /></div>
        <div class="lightbox-toolbar">
          <button class="lightbox-btn" id="lightbox-btn-zoom-in" title="放大">${icon('plus')}<span>放大</span></button>
          <button class="lightbox-btn" id="lightbox-btn-zoom-out" title="缩小">${icon('minus')}<span>缩小</span></button>
          ${currentSettings.enableImageTranslation ? `<button class="lightbox-btn lightbox-translate" id="lightbox-btn-translate" title="翻译图片文字">${icon('translate')}<span>翻译</span></button>` : ''}
          <button class="lightbox-btn" id="lightbox-btn-save" title="保存原图">${icon('save')}<span>保存</span></button>
          <button class="lightbox-btn" id="lightbox-btn-copy-url" title="复制图片链接">${icon('copy')}<span>复制链接</span></button>
        </div>
      </div>`;
    document.documentElement.appendChild(box);
    let scale = 1;
    const imgEl = box.querySelector("#lightbox-target-img");
    box.querySelector("#lightbox-btn-zoom-in")?.addEventListener("click", e => {e.stopPropagation();scale=Math.min(3,scale+.25);imgEl.style.transform=`scale(${scale})`;});
    box.querySelector("#lightbox-btn-zoom-out")?.addEventListener("click", e => {e.stopPropagation();scale=Math.max(.5,scale-.25);imgEl.style.transform=`scale(${scale})`;});
    imgEl?.addEventListener("dblclick", e => { e.stopPropagation(); scale=1; imgEl.style.transform="scale(1)"; });
    box.querySelector("#lightbox-btn-translate")?.addEventListener("click", e => {e.stopPropagation();imageTranslateTarget=imgEl;translateImageElement(imgEl);});
    box.querySelector("#lightbox-btn-save")?.addEventListener("click", e => {e.stopPropagation();const a=document.createElement("a");a.href=src;a.download=`image-${Date.now()}`;a.target="_blank";a.click();});
    box.querySelector("#lightbox-btn-copy-url")?.addEventListener("click", e => {e.stopPropagation();navigator.clipboard.writeText(src);const span=e.currentTarget.querySelector("span");if(span){span.textContent="已复制";setTimeout(()=>span.textContent="复制链接",1200);}});
    const closeLightbox = () => { if (imageTranslateTarget === imgEl) imageTranslateOverlayCleanup?.(); box.remove(); window.removeEventListener("keydown",esc); };
    box.addEventListener("click", e => {if(e.target===box || e.target.closest("#lightbox-btn-close")) closeLightbox();});
    const esc = e => {if(e.key==="Escape" && box.isConnected) closeLightbox();};
    window.addEventListener("keydown",esc);
  }

  function restoreOriginalPage({ preserveTranslationSession = false } = {}) {
    translationRunGeneration++;
    restoreInPlaceTranslations();
    document.querySelectorAll(".raccoon-translated-block, .raccoon-translated-inline").forEach(el => el.remove());
    document.querySelectorAll("[data-raccoon-orig-html]").forEach(el => {
      el.innerHTML = el.getAttribute("data-raccoon-orig-html");
      el.removeAttribute("data-raccoon-orig-html");
      el.classList.remove("raccoon-replaced-text");
      delete el.dataset.raccoonBaseFontSize;
      delete el.dataset.raccoonSourceColor;
      el.style.removeProperty("--raccoon-replace-base-size");
      el.style.removeProperty("--raccoon-replace-font-size");
      el.style.removeProperty("--raccoon-local-text-color");
    });
    document.querySelectorAll("[data-raccoon-translated]").forEach(el => {
      el.removeAttribute("data-raccoon-translated");
    });
    // Translation IDs are a session marker, not permanent host-page state. Keeping
    // them after restore made a second translation pass silently skip those nodes.
    document.querySelectorAll("[data-raccoon-id]").forEach(el => {
      el.removeAttribute("data-raccoon-id");
      el.removeAttribute("data-raccoon-reader-primary");
    });

    closeSidebar();
    closeReaderMode();
    paragraphMap.clear();

    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
    clearTimeout(mutationRefreshTimer);
    mutationRefreshTimer = null;
    pendingMutationTranslationRoots.clear();
    if (interactionRefreshHandler) {
      document.removeEventListener('click', interactionRefreshHandler, true);
      interactionRefreshHandler = null;
    }
    clearTimeout(interactionRefreshTimer);
    interactionRefreshTimer = null;
    clearInterval(routeWatchTimer);
    routeWatchTimer = null;
    if (!preserveTranslationSession) setTabTranslationSession(false);

    isPageTranslated = false;
    isTranslating = false;
    totalBlocks = 0;
    translatedBlocksCount = 0;

    updateFloatingPillStatus("idle", currentSettings.displayMode === "replace" ? "替换翻译" : "双语翻译");
    setTranslationBadgeSafely("off");
  }

  async function translateIncrementalBlocks(newBlocks) {
    if (!Array.isArray(newBlocks) || newBlocks.length === 0 || !isPageTranslated || isTranslating) return;
    const items = newBlocks.map(b => ({ id: b.id, text: b.text }));
    const sourceTextById = new Map(newBlocks.map(b => [b.id, b.text]));
    const blockById = new Map(newBlocks.map(b => [b.id, b]));
    let failedCount = 0;
    try {
      const res = await sendBatchWithIds(items);
      if (res && res.success && Array.isArray(res.data)) {
        res.data.forEach(item => {
          const meta = blockById.get(item.id);
          const el = meta?.element || document.querySelector(`[data-raccoon-id="${item.id}"]`);
          if (el && item.text && !item.error) {
            const liveElement = meta?.kind === 'replace-text' ? meta.textNode?.parentElement : el;
            const allowHiddenToc = meta?.kind === 'ui-inplace' && isStructuredTocControl(el);
            if (!liveElement || (!allowHiddenToc && !isVisibleTranslationElement(liveElement))) {
              el.removeAttribute?.('data-raccoon-id');
              return;
            }
            const origText = sourceTextById.get(item.id) || getHostOriginalText(el);
            if (meta?.kind !== 'replace-text' && meta?.kind !== 'component-text' && meta?.kind !== 'ui-inplace') {
              paragraphMap.set(item.id, { origText, transText: item.text, el });
            }
            if (currentSettings.displayMode === 'sidebar') renderSidebarItem(item.id, el, origText, item.text);
            else renderTranslationNode(el, item.text, meta || { id:item.id, kind:'content-block', element:el });
            translatedBlocksCount++;
          } else if (meta) {
            meta.element?.removeAttribute?.('data-raccoon-id');
            failedCount++;
          }
        });
        updateFloatingPillStatus('done', failedCount ? `${currentSettings.displayMode === 'replace' ? '已替换' : '已翻译'} · ${failedCount} 段待重试` : (currentSettings.displayMode === 'replace' ? '已替换' : '已翻译'));
      }
    } catch (e) {
      console.warn('Incremental translation warning:', e);
    }
  }

  function scheduleVisibleTranslationRefresh(delay = 120) {
    if (!isPageTranslated || isTranslating) return;
    clearTimeout(interactionRefreshTimer);
    interactionRefreshTimer = setTimeout(() => {
      const units = collectTranslatableBlocks();
      if (units.length) translateIncrementalBlocks(units);
    }, delay);
  }

  function mutationTranslationScope(node) {
    const el = node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    if (!el?.isConnected || isExtensionOwnedElement(el)) return null;
    const scopedSelector = `${TRANSLATABLE_BLOCK_SELECTOR}, ${INTERACTIVE_UI_SELECTOR}`;
    if (el.matches?.(scopedSelector) || el.querySelector?.(scopedSelector)) return el;
    return el.closest?.(scopedSelector) || el.parentElement || null;
  }

  function compactMutationTranslationRoots(roots) {
    const connected = Array.from(new Set(roots)).filter(root => root?.isConnected && !isExtensionOwnedElement(root));
    if (connected.includes(document.body)) return [document.body];
    return connected.filter(root => !connected.some(other => other !== root && other.contains?.(root)));
  }

  function scheduleMutationTranslationRefresh() {
    clearTimeout(mutationRefreshTimer);
    mutationRefreshTimer = setTimeout(() => {
      mutationRefreshTimer = null;
      if (!isPageTranslated || isTranslating) {
        pendingMutationTranslationRoots.clear();
        return;
      }
      const roots = compactMutationTranslationRoots(pendingMutationTranslationRoots);
      pendingMutationTranslationRoots.clear();
      const units = [];
      roots.forEach(root => units.push(...collectTranslatableBlocks(root)));
      if (!units.length) return;
      const ordered = currentSettings.displayMode === "sidebar" ? units : prioritizeTranslationBlocks(units);
      translateIncrementalBlocks(ordered);
    }, 180);
  }

  function scheduleRouteTranslationRefresh() {
    if (!isPageTranslated) return;
    scheduleVisibleTranslationRefresh(120);
    setTimeout(() => scheduleVisibleTranslationRefresh(0), 650);
  }

  function startMutationObserver() {
    if (mutationObserver) return;

    mutationObserver = new MutationObserver((mutations) => {
      if (!isPageTranslated || isTranslating) return;
      mutations.forEach(mutation => {
        mutation.addedNodes?.forEach(node => {
          const scope = mutationTranslationScope(node);
          if (scope) pendingMutationTranslationRoots.add(scope);
        });
      });
      if (!pendingMutationTranslationRoots.size) return;
      if (pendingMutationTranslationRoots.size > 60) {
        pendingMutationTranslationRoots.clear();
        pendingMutationTranslationRoots.add(document.body);
      }
      scheduleMutationTranslationRefresh();
    });

    mutationObserver.observe(document.body, { childList: true, subtree: true });

    // Some sites keep tab/menu content mounted and only toggle CSS classes. A
    // DOM observer sees no added nodes in that case. After an interaction, make
    // one cheap pass for newly visible labels/text that have never been handled.
    if (!interactionRefreshHandler) {
      interactionRefreshHandler = () => scheduleVisibleTranslationRefresh(90);
      document.addEventListener('click', interactionRefreshHandler, true);
    }

    // Content scripts run in an isolated JS world, so patching the page's
    // history.pushState is not reliable. A lightweight URL watch catches SPA
    // route changes, while the mutation/click paths above handle the new DOM.
    lastObservedTranslationUrl = location.href;
    if (!routeWatchTimer) {
      routeWatchTimer = setInterval(() => {
        if (!isPageTranslated) return;
        if (location.href !== lastObservedTranslationUrl) {
          lastObservedTranslationUrl = location.href;
          scheduleRouteTranslationRefresh();
        }
      }, 700);
    }
  }

  /**
   * 输入框实时快捷翻译 (Ctrl+Enter)
   */
  function initInputBoxTranslate() {
    document.addEventListener("keydown", async (e) => {
      if (!currentSettings.enableInputBoxTranslate) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        const target = e.target;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
          const val = target.value ? target.value.trim() : "";
          if (val && val.length > 0) {
            e.preventDefault();
            target.style.transition = "background-color 0.2s";
            const prevBg = target.style.backgroundColor;
            target.style.backgroundColor = "rgba(0, 113, 227, 0.1)";

            const targetLang = currentSettings.targetLang === "en" ? "zh-CN" : "en";
            chrome.runtime.sendMessage(
              { action: "TRANSLATE_INPUT_TEXT", text: val, tl: targetLang },
              (res) => {
                target.style.backgroundColor = prevBg;
                if (res && res.success && res.text) {
                  target.value = res.text;
                  target.dispatchEvent(new Event("input", { bubbles: true }));
                  target.dispatchEvent(new Event("change", { bubbles: true }));
                }
              }
            );
          }
        }
      }
    });
  }

  /**
   * 智能外文检测悬浮胶囊
   */
  let floatingPillRoot = null;
  let floatingPillDetectionTimer = null;
  let floatingPillDetectionAttempts = 0;

  function scheduleFloatingPillDetectionRetry() {
    if (floatingPillDetectionTimer || floatingPillDetectionAttempts >= 3 || !currentSettings.enableFloatingBall) return;
    const delay = [700, 1500, 2800][floatingPillDetectionAttempts] || 2800;
    floatingPillDetectionAttempts++;
    floatingPillDetectionTimer = setTimeout(() => {
      floatingPillDetectionTimer = null;
      if (!floatingPillRoot && !floatingPillSessionHidden && !isCurrentHostExcluded("floating")) initFloatingPillSmart();
    }, delay);
  }

  function initFloatingPillSmart() {
    if (document.getElementById("raccoon-floating-ball-root")) return;
    if (!currentSettings.enableFloatingBall) return;

    if (!isForeignLanguagePage()) {
      scheduleFloatingPillDetectionRetry();
      return;
    }

    clearTimeout(floatingPillDetectionTimer);
    floatingPillDetectionTimer = null;
    floatingPillDetectionAttempts = 0;

    const root = document.createElement("div");
    root.id = "raccoon-floating-ball-root";

    root.innerHTML = `
      <div class="raccoon-floating-main-pill" id="raccoon-pill-main" title="点击切换整页翻译 / 右键展开侧边栏">
        <svg class="raccoon-pill-svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0071e3" stroke-width="2.5">
          <path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>
        </svg>
        <span class="raccoon-pill-text" id="raccoon-pill-text">${currentSettings.displayMode === "replace" ? "替换翻译" : "双语翻译"}</span>
      </div>
      <div class="raccoon-floating-close-circle" id="raccoon-pill-close" title="临时关闭此页悬浮球">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </div>
    `;

    document.documentElement.appendChild(root);
    floatingPillRoot = root;

    const pillMain = root.querySelector("#raccoon-pill-main");
    pillMain.addEventListener("click", () => {
      togglePageTranslation();
    });

    pillMain.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      toggleSidebar();
    });

    const pillClose = root.querySelector("#raccoon-pill-close");
    pillClose.addEventListener("click", (e) => {
      e.stopPropagation();
      root.remove();
      floatingPillRoot = null;
    });
  }

  function updateFloatingPillStatus(status, text) {
    if (!floatingPillRoot) return;
    const textEl = floatingPillRoot.querySelector("#raccoon-pill-text");
    const pillMain = floatingPillRoot.querySelector("#raccoon-pill-main");
    if (textEl && text) textEl.textContent = text;
    if (pillMain) {
      if (status === "done") {
        pillMain.classList.add("active-state");
      } else {
        pillMain.classList.remove("active-state");
      }
    }
  }

  function resetFloatingPillText() {
    if (!floatingPillRoot) return;
    const textEl = floatingPillRoot.querySelector("#raccoon-pill-text");
    if (textEl) textEl.textContent = isPageTranslated ? (currentSettings.displayMode === "replace" ? "已替换" : "已翻译") : (currentSettings.displayMode === "replace" ? "替换翻译" : "双语翻译");
  }

  let floatingPillSessionHidden = false;

  function updateFloatingPillVisibility() {
    const isExcludedSite = isCurrentHostExcluded("floating");
    if (floatingPillRoot) {
      floatingPillRoot.style.display = currentSettings.enableFloatingBall && !isExcludedSite && !floatingPillSessionHidden ? "inline-flex" : "none";
    } else if (currentSettings.enableFloatingBall && !isExcludedSite && !floatingPillSessionHidden) {
      initFloatingPillSmart();
    }
  }

  let shortcutSequenceInitialized = false;
  let shortcutBuffer = "";
  let shortcutBufferTimer = null;
  function isEditableShortcutElement(target) {
    const el = target?.nodeType === Node.ELEMENT_NODE ? target : target?.parentElement;
    if (!el) return false;
    if (el.isContentEditable) return true;
    return !!el.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"], [role="searchbox"], .CodeMirror, .monaco-editor, .ProseMirror');
  }
  function isEditableShortcutEvent(e) {
    if (isEditableShortcutElement(e.target) || isEditableShortcutElement(document.activeElement)) return true;
    return typeof e.composedPath === "function" && e.composedPath().some(isEditableShortcutElement);
  }
  function normalizePageShortcut(value, fallback) {
    return String(value || fallback).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 4) || fallback;
  }
  function toggleFloatingPillSession() {
    floatingPillSessionHidden = !floatingPillSessionHidden;
    updateFloatingPillVisibility();
    showPageMiniNotice(floatingPillSessionHidden ? "已临时隐藏悬浮胶囊" : "已恢复悬浮胶囊");
  }
  function showPageMiniNotice(text) {
    let el = document.getElementById("minimal-translate-mini-notice");
    if (!el) { el = document.createElement("div"); el.id="minimal-translate-mini-notice"; document.documentElement.appendChild(el); }
    el.textContent=text; el.classList.add("show"); clearTimeout(el._hideTimer); el._hideTimer=setTimeout(()=>el.classList.remove("show"),1400);
  }
  function initPageShortcutSequences() {
    if (shortcutSequenceInitialized) return;
    shortcutSequenceInitialized=true;
    document.addEventListener("keydown", e => {
      if (e.defaultPrevented || e.repeat || e.isComposing || e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1 || isEditableShortcutEvent(e)) {
        shortcutBuffer="";
        clearTimeout(shortcutBufferTimer);
        return;
      }
      const ch=e.key.toLowerCase(); if(!/[a-z0-9]/.test(ch)) return;
      clearTimeout(shortcutBufferTimer); shortcutBuffer=(shortcutBuffer+ch).slice(-6); shortcutBufferTimer=setTimeout(()=>{shortcutBuffer="";},900);
      const floatingSeq=normalizePageShortcut(currentSettings.floatingShortcut,"zz");
      const readerSeq=normalizePageShortcut(currentSettings.readerShortcut,"aa");
      if (shortcutBuffer.endsWith(floatingSeq)) { shortcutBuffer=""; toggleFloatingPillSession(); return; }
      if (shortcutBuffer.endsWith(readerSeq)) {
        shortcutBuffer="";
        e.preventDefault();
        e.stopPropagation();
        toggleReaderMode();
      }
    }, true);
  }

  /** Movable selection lookup card and full local dictionary view. */
  let selectionRoot = null;
  let cardOpenedTimestamp = 0;
  let activeDictionaryCleanup = null;

  function disposeActiveDictionaryCard() {
    if (typeof activeDictionaryCleanup === "function") activeDictionaryCleanup();
    activeDictionaryCleanup = null;
  }
  let highlightHoverDeleteBtn = null;
  let highlightHoverMark = null;
  let highlightHoverHideTimer = null;

  function isDictionarySelectionCandidate(text) {
    const clean = (text || "").trim();
    if (!isValidText(clean) || clean.length > 900) return false;

    // 日语没有天然空格分词：允许直接选中短句/一小段进行 AI 语法解析。
    const hint = inferDictionaryLanguageHint(clean);
    if (hint === "ja") return true;

    // 英语/其他语言仍保持轻量查词，避免误选整页后弹出巨大词典卡。
    return clean.split(/\s+/).filter(Boolean).length <= 6;
  }

  function isJapanesePassageSelection(text, languageHint) {
    const clean = (text || "").trim();
    if (languageHint !== "ja") return false;
    const sentencePunctuation = (clean.match(/[。！？!?]/g) || []).length;
    const kanaCount = (clean.match(/[\u3040-\u30ff]/g) || []).length;
    return clean.length >= 16 || sentencePunctuation >= 1 || kanaCount >= 9;
  }

  function isPassageSelection(text) {
    const clean = String(text || "").trim();
    if (!isValidText(clean)) return false;
    const words = clean.split(/\s+/).filter(Boolean).length;
    const punctuation = (clean.match(/[。！？!?；;.!?]/g) || []).length;
    const hasCjk = /[\u3040-\u30ff\u3400-\u9fff]/.test(clean);
    if (hasCjk) return clean.length >= 10 || punctuation >= 1;
    return clean.length >= 34 || words >= 7 || punctuation >= 2;
  }

  function initHighlightHoverDelete() {
    if (highlightHoverDeleteBtn) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "raccoon-highlight-hover-delete";
    btn.title = "删除高亮";
    btn.setAttribute("aria-label", "删除高亮");
    btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 15 8-8 6 6-7 7H7l-2-2a2.1 2.1 0 0 1 0-3Z"/><path d="m11 20 8-8"/></svg>`;
    btn.style.display = "none";
    document.documentElement.appendChild(btn);
    highlightHoverDeleteBtn = btn;
    const hide = () => { btn.style.display = "none"; highlightHoverMark = null; };
    btn.addEventListener("pointerenter", () => clearTimeout(highlightHoverHideTimer));
    btn.addEventListener("pointerleave", () => { highlightHoverHideTimer = setTimeout(hide, 140); });
    btn.addEventListener("mousedown", e => e.preventDefault());
    btn.addEventListener("click", e => {
      e.preventDefault(); e.stopPropagation();
      const mark = highlightHoverMark;
      if (!mark?.isConnected) { hide(); return; }
      const id = mark.dataset.highlightId || "";
      const orig = String(mark.textContent || "").trim();
      unwrapHighlightMark(mark);
      sendDictionaryRuntimeMessage(id ? { action:"REMOVE_HIGHLIGHT_SENTENCE", id } : { action:"REMOVE_HIGHLIGHT_SENTENCE", orig }, () => {});
      hide();
    });
    document.addEventListener("pointerover", e => {
      if (isCurrentHostExcluded("selection")) return;
      const mark = e.target?.closest?.("mark.minimal-text-highlight");
      if (!mark || mark.closest("#raccoon-reader-root,#raccoon-sidebar-root")) return;
      clearTimeout(highlightHoverHideTimer);
      highlightHoverMark = mark;
      const r = mark.getBoundingClientRect();
      btn.style.left = `${Math.min(window.innerWidth - 34, Math.max(8, r.right + 5))}px`;
      btn.style.top = `${Math.max(8, r.top - 2)}px`;
      btn.style.display = "grid";
    }, true);
    document.addEventListener("pointerout", e => {
      const mark = e.target?.closest?.("mark.minimal-text-highlight");
      if (!mark) return;
      highlightHoverHideTimer = setTimeout(() => { if (!btn.matches(":hover")) hide(); }, 160);
    }, true);
    window.addEventListener("scroll", () => { if (btn.style.display !== "none") hide(); }, { passive:true });
  }

  function initSelectionAndDoubleClick() {
    if (selectionRoot) return;

    const root = document.createElement("div");
    root.id = "raccoon-selection-bubble-root";
    document.documentElement.appendChild(root);
    selectionRoot = root;

    document.addEventListener("mouseup", (e) => {
      if (isCurrentHostExcluded("selection")) return;
      const mode = currentSettings.dictTriggerMode || "both";
      if (selectionRoot.contains(e.target)) return;

      const clickX = e.clientX;
      const clickY = e.clientY;
      const inputSelection = captureInputTextSelection(e.target);
      if (inputSelection) {
        if (currentSettings.enableInputBoxTranslate !== false) showInputSelectionTrigger(inputSelection, clickX, clickY);
        else hideSelectionTriggerButton();
        return;
      }
      if (mode === "none" || mode === "double_click") return;

      setTimeout(() => {
        const selection = window.getSelection();
        const text = selection ? selection.toString().trim() : "";

        const canHighlight = isValidText(text) && text.length <= 2400;
        if (canHighlight) {
          let rect = null;
          try {
            const range = selection.getRangeAt(0);
            const r = range.getBoundingClientRect();
            if (r && r.width > 0 && r.height > 0 && r.top > 10 && r.left > 10) rect = r;
          } catch (_) {}
          let exactRange = null; try { exactRange = selection.getRangeAt(0).cloneRange(); } catch (_) {}
          const allowDictionary = isDictionarySelectionCandidate(text) && !isPassageSelection(text);
          showSelectionTriggerAbove(rect, clickX, clickY, text, exactRange, allowDictionary);
        } else hideSelectionTriggerButton();
      }, 50);
    });

    document.addEventListener("dblclick", (e) => {
      if (isCurrentHostExcluded("selection")) return;
      const mode = currentSettings.dictTriggerMode || "both";
      if (mode === "none") return;
      if (selectionRoot.contains(e.target)) return;

      const clickX = e.clientX;
      const clickY = e.clientY;

      setTimeout(() => {
        const selection = window.getSelection();
        const text = selection ? selection.toString().trim() : "";
        if (isValidText(text) && text.split(/\s+/).length <= 4) {
          let cardTop = clickY + 8;
          let cardLeft = clickX - 20;

          try {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            if (rect && rect.width > 0 && rect.bottom > 10 && rect.left > 10) {
              cardTop = rect.bottom + 6;
              cardLeft = rect.left;
            }
          } catch (_) {}

          if (cardTop + 340 > window.innerHeight) {
            cardTop = Math.max(15, clickY - 340);
          }

          cardTop = Math.max(15, Math.min(cardTop, window.innerHeight - 350));
          cardLeft = Math.max(15, Math.min(cardLeft, window.innerWidth - Math.min(414, window.innerWidth - 20)));
          openDictionaryCard(cardTop, cardLeft, text);
        }
      }, 30);
    });

    document.addEventListener("mousedown", (e) => {
      if (selectionRoot && !selectionRoot.contains(e.target)) {
        if (Date.now() - cardOpenedTimestamp > 250) {
          disposeActiveDictionaryCard();
          selectionRoot.innerHTML = "";
        }
      }
    });
  }

  function captureInputTextSelection(target) {
    const field = target?.closest?.("textarea, input");
    if (!field || field.disabled || field.readOnly || field.type === "password") return null;
    if (field.tagName === "INPUT" && !/^(?:text|search|url|tel|email)$/i.test(field.type || "text")) return null;
    if (typeof field.selectionStart !== "number" || typeof field.selectionEnd !== "number") return null;
    const start = Math.min(field.selectionStart, field.selectionEnd);
    const end = Math.max(field.selectionStart, field.selectionEnd);
    const text = String(field.value || "").slice(start, end);
    if (!isValidText(text.trim()) || start === end) return null;
    return { field, start, end, text };
  }

  function showInputSelectionTrigger(snapshot, clickX, clickY) {
    if (!selectionRoot || !snapshot?.field?.isConnected) return;
    disposeActiveDictionaryCard();
    const toolbarWidth = 182;
    let top = clickY - 44;
    if (top < 12) top = clickY + 10;
    const left = Math.max(12, Math.min(clickX - toolbarWidth / 2, window.innerWidth - toolbarWidth - 12));
    selectionRoot.innerHTML = `
      <div class="raccoon-selection-trigger raccoon-input-selection-trigger" style="top:${top}px!important;left:${left}px!important">
        <button type="button" class="selection-tool-btn" data-action="translate" title="翻译选中文字"><svg class="trigger-logo-icon trigger-translate-brand-icon" viewBox="0 0 128 128" fill="#fff" aria-hidden="true"><circle cx="44" cy="21" r="9" fill="#fff"/><path fill="#fff" d="M18 31h52v12H55l-9 11-14-12-9 9 15 13-19 19 10 9 17-18 13 18 10-9-15-18 18-22H18z"/><path fill="#fff" fill-rule="evenodd" d="M87 49c3 0 5 2 7 6l23 57h-14l-5-13H76l-5 13H57l24-57c1-4 3-6 6-6Zm0 21-7 18h14Z"/></svg><span>翻译</span></button>
        <button type="button" class="selection-tool-btn" data-action="replace-translate" title="翻译并替换选中文字"><svg class="trigger-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7h-9a5 5 0 0 0-5 5v1"/><path d="m17 4 3 3-3 3"/><path d="M4 17h9a5 5 0 0 0 5-5v-1"/><path d="m7 20-3-3 3-3"/></svg><span>替换翻译</span></button>
      </div>`;
    const toolbar = selectionRoot.querySelector(".raccoon-input-selection-trigger");
    toolbar.addEventListener("mousedown", e => e.preventDefault());
    toolbar.addEventListener("click", e => {
      e.stopPropagation();
      const action = e.target.closest(".selection-tool-btn")?.dataset.action;
      if (action === "replace-translate") {
        showInputReplaceCard(snapshot, top, left);
        return;
      }
      if (action === "translate") {
        let cardTop = top + 42;
        if (cardTop + 350 > window.innerHeight) cardTop = Math.max(15, top - 350);
        const cardLeft = Math.max(15, Math.min(left, window.innerWidth - 370));
        openDictionaryCard(cardTop, cardLeft, snapshot.text.trim(), { forcePassage:true });
      }
    });
  }

  const inputReplaceLanguages = [
    ["en", "英语"], ["zh-CN", "简体中文"], ["zh-TW", "繁体中文"], ["ja", "日语"],
    ["ko", "韩语"], ["fr", "法语"], ["de", "德语"], ["es", "西班牙语"]
  ];

  function showInputReplaceCard(snapshot, anchorTop, anchorLeft) {
    if (!selectionRoot || !snapshot?.field?.isConnected) return;
    const width = 288;
    let top = anchorTop + 42;
    if (top + 198 > window.innerHeight) top = Math.max(12, anchorTop - 198);
    const left = Math.max(12, Math.min(anchorLeft, window.innerWidth - width - 12));
    let targetLang = inputReplaceLanguages.some(([code]) => code === currentSettings.inputReplaceTargetLang)
      ? currentSettings.inputReplaceTargetLang
      : "en";
    cardOpenedTimestamp = Date.now();
    selectionRoot.innerHTML = `
      <div class="raccoon-input-replace-card" style="top:${top}px!important;left:${left}px!important;width:${width}px!important">
        <div class="input-replace-card-head">
          <strong>翻译并替换</strong>
          <button type="button" class="input-replace-close" aria-label="关闭"><svg viewBox="0 0 20 20"><path d="m6 6 8 8M14 6l-8 8"/></svg></button>
        </div>
        <div class="input-replace-card-label">目标语言</div>
        <div class="input-replace-language-grid" role="radiogroup" aria-label="替换目标语言">${inputReplaceLanguages.map(([code,label]) => `<button type="button" role="radio" aria-checked="${code === targetLang ? "true" : "false"}" class="${code === targetLang ? "active" : ""}" data-language="${code}">${label}</button>`).join("")}</div>
        <button type="button" class="input-replace-confirm">替换为${inputReplaceLanguages.find(([code]) => code === targetLang)?.[1] || "英语"}</button>
        <div class="input-replace-status" aria-live="polite"></div>
      </div>`;
    const card = selectionRoot.querySelector(".raccoon-input-replace-card");
    const button = card.querySelector(".input-replace-confirm");
    const status = card.querySelector(".input-replace-status");
    const languageButtons = Array.from(card.querySelectorAll("[data-language]"));
    const stopCardPointer = e => e.stopPropagation();
    card.addEventListener("pointerdown", stopCardPointer);
    card.addEventListener("mousedown", stopCardPointer);
    card.addEventListener("click", stopCardPointer);
    card.querySelector(".input-replace-close")?.addEventListener("click", () => { selectionRoot.innerHTML = ""; });
    languageButtons.forEach(languageButton => languageButton.addEventListener("click", () => {
      targetLang = languageButton.dataset.language || "en";
      languageButtons.forEach(item => {
        const active = item === languageButton;
        item.classList.toggle("active", active);
        item.setAttribute("aria-checked", active ? "true" : "false");
      });
      const languageName = inputReplaceLanguages.find(([code]) => code === targetLang)?.[1] || "英语";
      button.textContent = `替换为${languageName}`;
      currentSettings.inputReplaceTargetLang = targetLang;
      chrome.runtime.sendMessage({ action:"UPDATE_SETTINGS", settings:{ inputReplaceTargetLang:targetLang } }, () => {
        if (chrome.runtime.lastError) {}
      });
    }));
    button.addEventListener("click", () => {
      if (!snapshot.field.isConnected) return;
      button.disabled = true;
      languageButtons.forEach(item => { item.disabled = true; });
      button.textContent = "翻译中…";
      status.textContent = "";
      chrome.runtime.sendMessage({
        action:"TRANSLATE_INPUT_TEXT",
        text:snapshot.text,
        sl:"auto",
        tl:targetLang || "en"
      }, res => {
        if (chrome.runtime.lastError || !res?.success || !res.text) {
          button.disabled = false;
          languageButtons.forEach(item => { item.disabled = false; });
          button.textContent = "重试";
          status.textContent = res?.error || "翻译失败，请重试";
          return;
        }
        replaceInputSelection(snapshot, res.text);
        selectionRoot.innerHTML = "";
        showPageMiniNotice("已替换选中文字");
      });
    });
  }

  function replaceInputSelection(snapshot, replacement) {
    const field = snapshot.field;
    const currentValue = String(field.value || "");
    const nextValue = currentValue.slice(0, snapshot.start) + replacement + currentValue.slice(snapshot.end);
    const proto = field.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (nativeSetter) nativeSetter.call(field, nextValue);
    else field.value = nextValue;
    const caret = snapshot.start + String(replacement).length;
    try { field.focus({ preventScroll:true }); } catch (_) { field.focus(); }
    try { field.setSelectionRange(caret, caret); } catch (_) {}
    try {
      field.dispatchEvent(new InputEvent("input", { bubbles:true, inputType:"insertReplacementText", data:String(replacement) }));
    } catch (_) {
      field.dispatchEvent(new Event("input", { bubbles:true }));
    }
  }

  function getHighlightMarksForRange(range) {
    if (!range) return [];
    const marks = Array.from(document.querySelectorAll("mark.minimal-text-highlight"));
    return marks.filter(mark => {
      try {
        return range.intersectsNode(mark);
      } catch (_) { return false; }
    });
  }

  function unwrapHighlightMark(mark) {
    if (!mark?.parentNode) return;
    const parent = mark.parentNode;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    mark.remove();
    try { parent.normalize(); } catch (_) {}
  }

  function removeHighlightForRange(range, text) {
    const marks = getHighlightMarksForRange(range);
    if (!marks.length) return false;
    const ids = [...new Set(marks.map(m => m.dataset.highlightId).filter(Boolean))];
    marks.forEach(unwrapHighlightMark);
    if (ids.length) ids.forEach(id => chrome.runtime.sendMessage({ action:"REMOVE_HIGHLIGHT_SENTENCE", id }, () => { if (chrome.runtime.lastError) {} }));
    else chrome.runtime.sendMessage({ action:"REMOVE_HIGHLIGHT_SENTENCE", orig:String(text||"").trim() }, () => { if (chrome.runtime.lastError) {} });
    return true;
  }

  function showSelectionTriggerAbove(rect, clickX, clickY, text, exactRange = null, allowDictionary = true) {
    if (!selectionRoot) return;
    disposeActiveDictionaryCard();

    let top = rect ? (rect.top - 38) : (clickY - 42);
    if (top < 12) top = rect ? (rect.bottom + 6) : (clickY + 8);
    let left = rect ? (rect.left + rect.width / 2 - 70) : (clickX - 70);

    top = Math.max(12, Math.min(top, window.innerHeight - 46));
    left = Math.max(12, Math.min(left, window.innerWidth - 154));

    const selectedHighlightMarks = getHighlightMarksForRange(exactRange);
    const isHighlighted = selectedHighlightMarks.length > 0;
    const primaryAction = allowDictionary ? "dictionary" : "translate";
    const primaryLabel = allowDictionary ? "查词" : "翻译";
    const primaryIcon = allowDictionary
      ? `<svg class="trigger-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/><path d="M8.5 9.2h5M8.5 12.5h3.8"/></svg>`
      : `<svg class="trigger-logo-icon trigger-translate-brand-icon" viewBox="0 0 128 128" fill="#fff" aria-hidden="true"><circle cx="44" cy="21" r="9" fill="#fff"/><path fill="#fff" d="M18 31h52v12H55l-9 11-14-12-9 9 15 13-19 19 10 9 17-18 13 18 10-9-15-18 18-22H18z"/><path fill="#fff" fill-rule="evenodd" d="M87 49c3 0 5 2 7 6l23 57h-14l-5-13H76l-5 13H57l24-57c1-4 3-6 6-6Zm0 21-7 18h14Z"/></svg>`;
    selectionRoot.innerHTML = `
      <div class="raccoon-selection-trigger" style="top: ${top}px !important; left: ${left}px !important;">
        <button type="button" class="selection-tool-btn" data-action="${primaryAction}" title="${primaryLabel}">${primaryIcon}<span>${primaryLabel}</span></button>
        <button type="button" class="selection-tool-btn ${isHighlighted ? 'danger-lite' : ''}" data-action="${isHighlighted ? 'remove-highlight' : 'highlight'}" title="${isHighlighted ? '删除高亮' : '高亮并收藏'}"><svg class="trigger-highlight-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1">${isHighlighted ? '<path d="m5 15 8-8 6 6-7 7H7l-2-2a2.1 2.1 0 0 1 0-3Z"/><path d="m11 20 8-8"/>' : '<path d="m9 11-6 6v3h3l6-6"/><path d="m22 7-3-3a2 2 0 0 0-2.83 0L13 7l5 5 3.17-3.17a2 2 0 0 0 0-2.83z"/>'}</svg><span>${isHighlighted ? '删除高亮' : '高亮'}</span></button>
      </div>`;

    const toolbar = selectionRoot.querySelector(".raccoon-selection-trigger");
    toolbar.addEventListener("mousedown", e => e.preventDefault());
    toolbar.addEventListener("click", (e) => {
      e.stopPropagation();
      const btn = e.target.closest(".selection-tool-btn");
      if (!btn) return;
      const action = btn.dataset.action;
      if (action === "highlight") {
        const id = `hl_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
        if (exactRange && wrapTextRangeWithHighlight(exactRange, id)) saveExactHighlight(text, exactRange, "", id);
        hideSelectionTriggerButton();
        return;
      }
      if (action === "remove-highlight") {
        removeHighlightForRange(exactRange, text);
        hideSelectionTriggerButton();
        return;
      }
      let cardTop = top + 40;
      if (cardTop + 340 > window.innerHeight) cardTop = Math.max(15, top - 340);
      cardTop = Math.max(15, Math.min(cardTop, window.innerHeight - 350));
      const cardLeft = Math.max(15, Math.min(left, window.innerWidth - 370));
      openDictionaryCard(cardTop, cardLeft, text, { forcePassage: action === "translate" });
    });
  }

  function hideSelectionTriggerButton() {
    if (selectionRoot && !selectionRoot.querySelector(".raccoon-dict-card")) {
      selectionRoot.innerHTML = "";
    }
  }

  function showSelectionCardCentered(text) {
    const top = window.innerHeight / 3;
    const left = window.innerWidth / 2 - Math.min(202, (window.innerWidth - 20) / 2);
    openDictionaryCard(top, left, text);
  }

  function getDictionarySelectionContext(text) {
    const clean = (text || "").trim();
    try {
      const selection = window.getSelection();
      const anchor = selection?.anchorNode;
      const el = anchor?.nodeType === Node.TEXT_NODE ? anchor.parentElement : anchor;
      const localEl = el?.closest?.("p,li,blockquote,dd,dt,td,th,figcaption,h1,h2,h3,h4,article,section,main,div");
      let local = (localEl?.innerText || localEl?.textContent || "").replace(/\s+/g, " ").trim();
      if (!local) return "";
      const idx = clean ? local.toLocaleLowerCase().indexOf(clean.toLocaleLowerCase()) : -1;
      if (clean && idx < 0) return "";
      if (local.length <= 700) return local;
      if (idx >= 0) {
        const from = Math.max(0, idx - 280);
        const to = Math.min(local.length, idx + clean.length + 320);
        return local.slice(from, to);
      }
      return local.slice(0, 700);
    } catch (_) {
      return "";
    }
  }

  function inferDictionaryLanguageHint(text) {
    const clean = (text || "").trim();
    const pageLangEarly = (document.documentElement.lang || document.body?.lang || "").toLowerCase();
    let nearestLangEarly = "";
    try {
      const selection = window.getSelection();
      const anchor = selection?.anchorNode;
      const el = anchor?.nodeType === Node.TEXT_NODE ? anchor.parentElement : anchor;
      nearestLangEarly = (el?.closest?.("[lang]")?.getAttribute("lang") || "").toLowerCase();
    } catch (_) {}
    if (/^[a-zA-Zāīūēō][a-zA-Zāīūēō\s'’\-]*$/.test(clean)) {
      if (pageLangEarly.startsWith("ja") || nearestLangEarly.startsWith("ja") || (currentSettings.sourceLang || "").startsWith("ja")) return "ja";
      return "en";
    }
    if (/[\u3040-\u30ff\u31f0-\u31ff]/.test(clean)) return "ja";
    if (/[\u3400-\u9fff]/.test(clean)) {
      const pageLang = (document.documentElement.lang || document.body?.lang || "").toLowerCase();
      if (pageLang.startsWith("ja")) return "ja";
      try {
        const selection = window.getSelection();
        const anchor = selection?.anchorNode;
        const el = anchor?.nodeType === Node.TEXT_NODE ? anchor.parentElement : anchor;
        const nearestLang = (el?.closest?.("[lang]")?.getAttribute("lang") || "").toLowerCase();
        if (nearestLang.startsWith("ja")) return "ja";
      } catch (_) {}

      // 对“海外 / 情報”这种中日共形汉字词，优先判断选区附近文本。
      const localSample = getDictionarySelectionContext(clean);
      const localKana = (localSample.match(/[\u3040-\u30ff]/g) || []).length;
      if (localKana >= 1) return "ja";

      const metaLang = (document.querySelector('meta[http-equiv="content-language" i]')?.getAttribute("content") || "").toLowerCase();
      if (metaLang.includes("ja")) return "ja";
      if (/\.jp(?:\/|$)/i.test(location.hostname + location.pathname)) return "ja";

      const sample = (document.body?.innerText || "").slice(0, 9000);
      const kanaCount = (sample.match(/[\u3040-\u30ff]/g) || []).length;
      const hanCount = (sample.match(/[\u3400-\u9fff]/g) || []).length;
      if (kanaCount >= 8 && kanaCount / Math.max(1, hanCount) > 0.025) return "ja";
      if ((currentSettings.sourceLang || "").startsWith("ja")) return "ja";
      return "zh-CN";
    }
    return currentSettings.sourceLang || "auto";
  }

  function hasConfiguredAiDictionary() {
    if (currentSettings.enableDictionaryAi === false) return false;
    return currentSettings.aiDictionaryAvailable === true;
  }

  function sendDictionaryRuntimeMessage(payload, callback) {
    try {
      if (!chrome?.runtime?.id) {
        callback({ success: false, error: "扩展运行上下文暂不可用，请刷新页面后重试。" });
        return;
      }
      chrome.runtime.sendMessage(payload, (res) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) callback({ success: false, error: runtimeError.message || "扩展消息通道暂不可用" });
        else callback(res || { success: false, error: "服务未返回结果" });
      });
    } catch (err) {
      callback({ success: false, error: err?.message || String(err) });
    }
  }

  function cleanDictionaryPunctuation(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .replace(/[；;]+\s*(?=[。！？!?])/g, "")
      .replace(/([。！？!?])\s*[；;]+/g, "$1")
      .replace(/([。！？!?])\s*[,，]+/g, "$1")
      .replace(/[；;]{2,}/g, "；")
      .replace(/；\s*；/g, "；")
      .replace(/([。！？!?])\s*[；;，,]+/g, "$1")
      .replace(/[；;，,]+\s*([。！？!?])/g, "$1")
      .replace(/([。！？!?])\s*([。！？!?])/g, "$1")
      .replace(/^[；;，,\s]+|[；;，,\s]+$/g, "")
      .trim();
  }

  function formatDictionaryPhonetic(value) {
    const v = String(value || "").trim().replace(/^\/+|\/+$/g, "");
    return v ? `/${v}/` : "";
  }

  const DICT_SPEAKER_ICON = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6.5 9H3v6h3.5L11 19V5Z"/><path d="M15 9.5a4 4 0 0 1 0 5"/><path d="M18 7a8 8 0 0 1 0 10"/></svg>`;

  function clampDictionaryCardToViewport(cardEl) {
    if (!cardEl?.isConnected) return;
    const margin = 10;
    const rect = cardEl.getBoundingClientRect();
    let left = rect.left;
    let top = rect.top;
    if (rect.right > window.innerWidth - margin) left -= rect.right - (window.innerWidth - margin);
    if (rect.bottom > window.innerHeight - margin) top -= rect.bottom - (window.innerHeight - margin);
    left = Math.max(margin, Math.min(left, window.innerWidth - Math.min(rect.width, window.innerWidth - margin * 2) - margin));
    top = Math.max(margin, Math.min(top, window.innerHeight - Math.min(rect.height, window.innerHeight - margin * 2) - margin));
    cardEl.style.setProperty("left", `${Math.round(left)}px`, "important");
    cardEl.style.setProperty("top", `${Math.round(top)}px`, "important");
  }

  function makeDictionaryCardDraggable(cardEl) {
    if (!cardEl) return () => {};
    let gesture = null;
    let frame = 0;

    const onPointerMove = (event) => {
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      const activeGesture = gesture;
      const clientX = event.clientX;
      const clientY = event.clientY;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!cardEl.isConnected || gesture !== activeGesture) return;
        if (activeGesture.type === "resize") {
          const dx = clientX - activeGesture.x;
          const dy = clientY - activeGesture.y;
          const minWidth = Math.min(320, Math.max(220, window.innerWidth - 20));
          const minHeight = Math.min(240, Math.max(180, window.innerHeight - 20));
          const resizeWest = activeGesture.direction.includes("w");
          const resizeEast = activeGesture.direction.includes("e");
          const resizeNorth = activeGesture.direction.includes("n");
          const resizeSouth = activeGesture.direction.includes("s");
          let left = activeGesture.left;
          let width = activeGesture.width;
          if (resizeWest) {
            const fixedRight = activeGesture.left + activeGesture.width;
            left = Math.max(10, Math.min(fixedRight - minWidth, activeGesture.left + dx));
            width = fixedRight - left;
          } else if (resizeEast) {
            const maxWidth = Math.max(minWidth, window.innerWidth - activeGesture.left - 10);
            width = Math.max(minWidth, Math.min(maxWidth, activeGesture.width + dx));
          }
          const maxWidth = Math.max(minWidth, window.innerWidth - left - 10);
          if (resizeWest) cardEl.style.setProperty("left", `${Math.round(left)}px`, "important");
          cardEl.style.setProperty("width", `${Math.round(width)}px`, "important");
          cardEl.style.setProperty("max-width", `${Math.round(maxWidth)}px`, "important");
          if (resizeNorth) {
            const fixedBottom = activeGesture.top + activeGesture.height;
            const top = Math.max(10, Math.min(fixedBottom - minHeight, activeGesture.top + dy));
            const height = fixedBottom - top;
            const maxHeight = Math.max(minHeight, window.innerHeight - top - 10);
            cardEl.style.setProperty("top", `${Math.round(top)}px`, "important");
            cardEl.style.setProperty("height", `${Math.round(height)}px`, "important");
            cardEl.style.setProperty("max-height", `${Math.round(maxHeight)}px`, "important");
          } else if (resizeSouth) {
            const maxHeight = Math.max(minHeight, window.innerHeight - activeGesture.top - 10);
            const height = Math.max(minHeight, Math.min(maxHeight, activeGesture.height + dy));
            cardEl.style.setProperty("height", `${Math.round(height)}px`, "important");
            cardEl.style.setProperty("max-height", `${Math.round(maxHeight)}px`, "important");
          }
        } else {
          const maxLeft = Math.max(10, window.innerWidth - cardEl.offsetWidth - 10);
          const maxTop = Math.max(10, window.innerHeight - cardEl.offsetHeight - 10);
          const left = Math.max(10, Math.min(maxLeft, activeGesture.left + clientX - activeGesture.x));
          const top = Math.max(10, Math.min(maxTop, activeGesture.top + clientY - activeGesture.y));
          cardEl.style.setProperty("left", `${Math.round(left)}px`, "important");
          cardEl.style.setProperty("top", `${Math.round(top)}px`, "important");
        }
      });
    };
    const stopDrag = (event) => {
      if (!gesture || (event?.pointerId != null && event.pointerId !== gesture.pointerId)) return;
      cancelAnimationFrame(frame);
      frame = 0;
      gesture = null;
      cardEl.classList.remove("is-dragging", "is-resizing");
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", stopDrag, true);
      window.removeEventListener("pointercancel", stopDrag, true);
      clampDictionaryCardToViewport(cardEl);
    };
    const startDrag = (event) => {
      if (event.button !== 0) return;
      const resizeGrip = event.target.closest(".dict-resize-handle");
      const dragHandle = event.target.closest(".dict-header, .dict-local-page-head");
      if (!resizeGrip && (!dragHandle || event.target.closest("button,a,input,textarea,select"))) return;
      const rect = cardEl.getBoundingClientRect();
      gesture = {
        type:resizeGrip ? "resize" : "drag", direction:resizeGrip?.dataset.resize || "se", pointerId:event.pointerId,
        x:event.clientX, y:event.clientY, left:rect.left, top:rect.top,
        width:rect.width, height:rect.height
      };
      cardEl.classList.add(resizeGrip ? "is-resizing" : "is-dragging");
      event.preventDefault();
      window.addEventListener("pointermove", onPointerMove, true);
      window.addEventListener("pointerup", stopDrag, true);
      window.addEventListener("pointercancel", stopDrag, true);
    };
    const onResize = () => clampDictionaryCardToViewport(cardEl);
    cardEl.addEventListener("pointerdown", startDrag);
    window.addEventListener("resize", onResize, { passive:true });
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(() => requestAnimationFrame(onResize)) : null;
    observer?.observe(cardEl);
    requestAnimationFrame(onResize);
    return () => {
      stopDrag();
      cancelAnimationFrame(frame);
      observer?.disconnect();
      cardEl.removeEventListener("pointerdown", startDrag);
      window.removeEventListener("resize", onResize);
    };
  }

  async function openDictionaryCard(top, left, text, options = {}) {
    if (!selectionRoot) return;
    disposeActiveDictionaryCard();
    cardOpenedTimestamp = Date.now();
    const openToken = cardOpenedTimestamp;

    const latestSettings = await new Promise(resolve => sendDictionaryRuntimeMessage({ action:"GET_SETTINGS" }, resolve));
    if (openToken !== cardOpenedTimestamp) return;
    if (latestSettings?.success && latestSettings.settings) currentSettings = Object.assign({}, currentSettings, latestSettings.settings);

    const passageLike = options.forcePassage === true || isPassageSelection(text);
    const estimatedWidth = Math.min(passageLike ? 580 : 520, Math.max(300, window.innerWidth - 20));
    const maxLeft = window.innerWidth - estimatedWidth - 10;
    const adjustLeft = Math.max(10, Math.min(left, maxLeft));

    selectionRoot.innerHTML = `
      <div class="raccoon-dict-card" id="raccoon-dict-card-el" style="top: ${top}px !important; left: ${adjustLeft}px !important;">
        <div class="dict-header">
          <div class="dict-header-main-row">
            <div class="dict-title-group">
              <span class="dict-word-title">${escapeHtml(passageLike ? text : text.slice(0, 64))}</span>
              <span class="dict-head-meta" id="dict-head-meta"></span>
            </div>
            <div class="dict-actions">
              <button class="dict-action-btn" id="dict-btn-star" title="加入生词本">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              </button>
              <button class="dict-action-btn" id="dict-btn-copy" title="复制释义">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
              </button>
              <button class="dict-close-btn" id="dict-btn-close" title="关闭 (Esc)">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.15"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
          </div>
        </div>

        <div class="dict-body" id="dict-body-container">
          <div class="dict-ai-result" id="dict-ai-result" style="display:none;"></div>
          <div class="dict-loading" id="dict-loading">正在查询词典...</div>
          <div class="dict-content" id="dict-content" style="display: none;"></div>
          <div class="dict-footer dict-source-footer">
            <span class="dict-source-inline" id="dict-source-inline"></span>
          </div>
        </div>
        <div class="dict-ai-composer-dock" id="dict-ai-composer-dock" style="display:none;"></div>
        <span class="dict-toast" id="dict-toast">已存入生词本</span>
        <span class="dict-resize-handle dict-resize-edge dict-resize-edge-top" data-resize="n" aria-hidden="true"></span>
        <span class="dict-resize-handle dict-resize-edge dict-resize-edge-right" data-resize="e" aria-hidden="true"></span>
        <span class="dict-resize-handle dict-resize-edge dict-resize-edge-bottom" data-resize="s" aria-hidden="true"></span>
        <span class="dict-resize-handle dict-resize-edge dict-resize-edge-left" data-resize="w" aria-hidden="true"></span>
        <span class="dict-resize-handle dict-resize-corner dict-resize-corner-top-left" data-resize="nw" aria-hidden="true"></span>
        <span class="dict-resize-handle dict-resize-corner dict-resize-corner-top-right" data-resize="ne" aria-hidden="true"></span>
        <span class="dict-resize-handle dict-resize-corner dict-resize-corner-bottom-right" data-resize="se" aria-hidden="true"></span>
        <span class="dict-resize-handle dict-resize-corner dict-resize-corner-bottom-left" data-resize="sw" aria-hidden="true"></span>
      </div>
    `;

    const cardEl = selectionRoot.querySelector("#raccoon-dict-card-el");
    const closeBtn = selectionRoot.querySelector("#dict-btn-close");
    const copyBtn = selectionRoot.querySelector("#dict-btn-copy");
    const starBtn = selectionRoot.querySelector("#dict-btn-star");
    const loadingEl = selectionRoot.querySelector("#dict-loading");
    const contentEl = selectionRoot.querySelector("#dict-content");
    const toastEl = selectionRoot.querySelector("#dict-toast");
    const headMetaEl = selectionRoot.querySelector("#dict-head-meta");
    const sourceInlineEl = selectionRoot.querySelector("#dict-source-inline");
    const aiResultEl = selectionRoot.querySelector("#dict-ai-result");
    const aiComposerDock = selectionRoot.querySelector("#dict-ai-composer-dock");
    const dictionaryAiEnabled = currentSettings.enableDictionaryAi !== false;
    const effectiveDictionaryLookupMode = dictionaryAiEnabled ? currentSettings.dictionaryLookupMode : "standard";
    cardEl.classList.toggle("dict-ai-after-dictionary", dictionaryAiEnabled && currentSettings.dictionaryAiPosition === "last");
    const dragCleanup = makeDictionaryCardDraggable(cardEl);
    const closeOnEscape = (event) => {
      if (event.key !== "Escape" || !cardEl?.isConnected) return;
      disposeActiveDictionaryCard();
      selectionRoot.innerHTML = "";
    };
    document.addEventListener("keydown", closeOnEscape, true);
    activeDictionaryCleanup = () => {
      dragCleanup();
      document.removeEventListener("keydown", closeOnEscape, true);
    };


    closeBtn.addEventListener("click", () => {
      disposeActiveDictionaryCard();
      selectionRoot.innerHTML = "";
    });

    let currentEntry = null;
    let currentVocabularyLang = "und";
    let isCurrentWordStarred = false;

    const normalizeDictionaryVocabLang = (entry) => {
      let langTag = String(entry?.detectedLang || languageHint || "und").toLowerCase();
      if (langTag.startsWith("zh")) return "zh";
      if (langTag.startsWith("ja") || /[\u3040-\u30ff\u31f0-\u31ff]/.test(text)) return "ja";
      if (langTag.startsWith("en")) return "en";
      if (langTag.startsWith("ko")) return "ko";
      if (langTag.startsWith("fr")) return "fr";
      if (langTag.startsWith("de")) return "de";
      if (langTag.startsWith("es")) return "es";
      if (langTag.startsWith("ru")) return "ru";
      if (/^[a-zA-Z][a-zA-Z\s'’-]*$/.test(text)) return "en";
      return "other";
    };
    const setStarVisual = (starred) => {
      isCurrentWordStarred = !!starred;
      if (!starBtn) return;
      starBtn.classList.toggle("active-star", !!starred);
      starBtn.title = starred ? "移出生词本" : "加入生词本";
      const svg = starBtn.querySelector("svg");
      if (svg) svg.setAttribute("fill", starred ? "currentColor" : "none");
    };
    const syncStarState = () => {
      if (!currentEntry || isPassage || !starBtn) return;
      currentVocabularyLang = normalizeDictionaryVocabLang(currentEntry);
      sendDictionaryRuntimeMessage({ action: "GET_VOCABULARY" }, (res) => {
        const list = Array.isArray(res?.list) ? res.list : [];
        const target = String(text || "").trim().toLocaleLowerCase();
        const found = list.some(item => String(item?.word || "").trim().toLocaleLowerCase() === target && String(item?.lang || "und") === currentVocabularyLang);
        setStarVisual(found);
      });
    };

    copyBtn.addEventListener("click", () => {
      if (currentEntry && currentEntry.translation) {
        navigator.clipboard.writeText(currentEntry.translation);
        toastEl.textContent = "已复制";
        toastEl.style.display = "inline";
        setTimeout(() => { toastEl.style.display = "none"; }, 1200);
      }
    });

    starBtn.addEventListener("click", () => {
      if (!currentEntry) return;
      currentVocabularyLang = normalizeDictionaryVocabLang(currentEntry);
      if (isCurrentWordStarred) {
        sendDictionaryRuntimeMessage({ action: "REMOVE_VOCABULARY", word: text, lang: currentVocabularyLang }, (res) => {
          if (res?.success === false) return;
          setStarVisual(false);
          toastEl.textContent = "已移出生词本";
          toastEl.style.display = "inline";
          setTimeout(() => { toastEl.style.display = "none"; }, 1200);
        });
        return;
      }
      sendDictionaryRuntimeMessage({
        action: "ADD_VOCABULARY",
        entry: {
          word: text,
          lang: currentVocabularyLang,
          phonetic: currentEntry.phonetic || currentEntry.reading || currentEntry.pinyin || "",
          translation: currentEntry.translation || "",
          definitions: currentEntry.definitions || [],
          sourceName: currentEntry.sourceName || "",
          localDictionarySummary: Array.isArray(currentEntry.localDictionaryEntries) ? currentEntry.localDictionaryEntries.slice(0,2).map(entry => {
            const box = document.createElement("div"); box.innerHTML = entry.html || "";
            return { name: entry.dictionaryName || "本地词典", text: String(box.textContent || "").replace(/\s+/g," ").trim().slice(0,320) };
          }).filter(x=>x.text) : [],
          date: new Date().toLocaleDateString()
        }
      }, (res) => {
        if (res?.success === false) return;
        setStarVisual(true);
        toastEl.textContent = "已存入生词本";
        toastEl.style.display = "inline";
        setTimeout(() => { toastEl.style.display = "none"; }, 1200);
      });
    });

    const languageHint = inferDictionaryLanguageHint(text);
    const selectionContext = getDictionarySelectionContext(text);
    const isJapanesePassage = isJapanesePassageSelection(text, languageHint);
    const isGeneralPassage = !isJapanesePassage && (options.forcePassage === true || isPassageSelection(text));
    const isPassage = isJapanesePassage || isGeneralPassage;
    const aiAnalysisMode = isJapanesePassage ? "japanese_passage" : (isGeneralPassage ? "passage_help" : "word");
    if (isPassage) {
      const titleEl = selectionRoot.querySelector(".dict-word-title");
      if (titleEl) {
        titleEl.textContent = text;
        titleEl.title = text;
        cardEl?.classList.add("dict-passage-card");
        const syncPassageTitleFade = () => {
          const hasOverflow = titleEl.scrollHeight > titleEl.clientHeight + 1;
          const atBottom = titleEl.scrollTop + titleEl.clientHeight >= titleEl.scrollHeight - 2;
          titleEl.classList.toggle("is-fade-clipped", hasOverflow && !atBottom);
        };
        titleEl.addEventListener("scroll", syncPassageTitleFade, { passive:true });
        requestAnimationFrame(syncPassageTitleFade);
      }
      if (loadingEl) loadingEl.textContent = "正在翻译选中文本…";
      if (starBtn) starBtn.style.display = "none";
    }

    const contextPresetQuestion = isPassage
      ? "请结合语境详细解析这段话，包括整体含义、句子结构、关键语法、重点词语和相关例句。"
      : "请结合这段话完整解释这个词，包括此处义、读音、原形、词性、常用义、语感与搭配，并提供自然例句。";
    const contextShortcutLabel = isPassage ? "问语法与语境" : "问语境";
    let aiCacheRecord = { primary:"", followups:[], contextPresetUsed:false };
    let aiQuestionPending = 0;
    const aiCacheSource = `${aiAnalysisMode}|${languageHint}|${text}|${selectionContext.slice(0,1200)}`;
    let aiCacheHash = 5381;
    for (let i = 0; i < aiCacheSource.length; i++) aiCacheHash = ((aiCacheHash << 5) + aiCacheHash) ^ aiCacheSource.charCodeAt(i);
    const aiCacheKey = `${aiAnalysisMode}:${(aiCacheHash >>> 0).toString(36)}`;

    function persistAiCacheRecord() {
      sendDictionaryRuntimeMessage({ action:"SET_DICTIONARY_AI_CACHE", key:aiCacheKey, data:aiCacheRecord }, () => {});
    }

    function appendFlatAiFollowup(question, markdown, loading = false) {
      const answer = document.createElement("div");
      answer.className = "dict-ai-followup-answer";
      answer.innerHTML = `<div class="dict-ai-followup-question">${renderDictionaryAiMarkdown(question)}</div><div class="dict-ai-followup-body">${loading ? '<div class="dict-ai-answer-bubble dict-ai-pending-bubble"><div class="dict-ai-loading"><span>正在回答</span><i></i><i></i><i></i></div></div>' : renderDictionaryAiBubbleSections(markdown || "")}</div>`;
      aiResultEl.appendChild(answer);
      return answer.querySelector(".dict-ai-followup-body");
    }

    function focusNewAiTurnOnce(answerBody) {
      const body = selectionRoot.querySelector("#dict-body-container");
      const turn = answerBody?.closest(".dict-ai-followup-answer");
      if (!body || !turn) return;
      const currentHeight = cardEl.getBoundingClientRect().height;
      const maxHeight = Math.max(280, window.innerHeight - 20);
      if (!cardEl.style.height && currentHeight > 0) {
        cardEl.style.height = `${Math.min(maxHeight, Math.max(360, Math.round(currentHeight)))}px`;
      }
      requestAnimationFrame(() => {
        const bodyRect = body.getBoundingClientRect();
        const turnRect = turn.getBoundingClientRect();
        const nextTop = Math.max(0, body.scrollTop + turnRect.top - bodyRect.top - 10);
        body.scrollTo({ top:nextTop, behavior:"smooth" });
      });
    }

    function renderAiCacheRecord(record) {
      if ((!record?.primary && !record?.followups?.length && !record?.contextPresetUsed) || !aiResultEl?.isConnected) return false;
      aiCacheRecord = {
        primary:String(record.primary || ""),
        followups:Array.isArray(record.followups) ? record.followups.filter(item => item?.question && item?.markdown).slice(-8) : [],
        contextPresetUsed:record.contextPresetUsed === true || Boolean(record.primary) || (Array.isArray(record.followups) && record.followups.some(item => item?.contextPreset === true || item?.question === contextPresetQuestion))
      };
      aiResultEl.style.display = aiCacheRecord.primary || aiCacheRecord.followups.length ? "block" : "none";
      aiResultEl.innerHTML = "";
      if(aiCacheRecord.primary)appendFlatAiFollowup(contextPresetQuestion,aiCacheRecord.primary);
      aiCacheRecord.followups.forEach(item => appendFlatAiFollowup(item.question, item.markdown));
      appendAiQuestionBox();
      return true;
    }

    function appendAiQuestionBox() {
      if (!aiComposerDock) return;
      if (!dictionaryAiEnabled) {
        aiComposerDock.style.display = "none";
        aiComposerDock.innerHTML = "";
        return;
      }
      aiComposerDock.style.display = "block";
      const existing = aiComposerDock.querySelector(".dict-ai-question-box");
      if (existing) {
        const shortcut = existing.querySelector(".dict-ai-context-shortcut");
        const input = existing.querySelector("textarea,input");
        if (shortcut) {
          const presetSent = aiCacheRecord.contextPresetUsed === true || Boolean(aiCacheRecord.primary) || aiCacheRecord.followups.some(item => item.contextPreset === true || item.question === contextPresetQuestion);
          shortcut.dataset.sent = presetSent ? "true" : "false";
          shortcut.hidden = presetSent || Boolean(input?.value?.trim());
        }
        return;
      }
      const configured = hasConfiguredAiDictionary();
      const box = document.createElement("form");
      box.className = "dict-ai-question-box";
      box.innerHTML = `<div class="dict-ai-live-preview" hidden aria-label="Markdown 实时预览"></div><div class="dict-ai-input-shell"><textarea rows="1" maxlength="500" placeholder="${configured ? "直接输入你想问的问题…" : "请先在设置中配置 AI"}" aria-label="向 AI 提问" ${configured ? "" : "disabled"}></textarea></div><button type="button" class="dict-ai-context-shortcut" ${configured ? "" : "disabled"}>${contextShortcutLabel}${configured ? "" : "（尚未配置）"}</button><button type="submit" class="dict-ai-send" title="发送" aria-label="发送" ${configured ? "" : "disabled"}><svg viewBox="0 0 24 24"><path d="m4 4 16 8-16 8 3-8-3-8Z"/><path d="M7 12h13"/></svg></button>`;
      const input = box.querySelector("textarea");
      const inputShell = box.querySelector(".dict-ai-input-shell");
      const livePreview = box.querySelector(".dict-ai-live-preview");
      const contextButton = box.querySelector(".dict-ai-context-shortcut");
      const sendButton = box.querySelector(".dict-ai-send");
      const syncComposerPresentation = () => {
        input.style.height = "26px";
        const inputHeight = Math.min(84, Math.max(26, input.scrollHeight));
        input.style.height = `${inputHeight}px`;
        inputShell.style.height = `${Math.max(36, inputHeight + 8)}px`;
        const value = input.value;
        const hasMarkdown = /(^|\n)\s*(?:#{1,4}\s|>\s?|[-+*]\s+|\d+[.)]\s+|```)|\*\*[^*]+\*\*|~~[^~]+~~|`[^`]+`/m.test(value);
        livePreview.hidden = !hasMarkdown;
        livePreview.innerHTML = hasMarkdown ? `<div class="dict-ai-live-preview-label">Markdown 预览</div>${renderDictionaryAiMarkdown(value)}` : "";
      };
      const syncContextShortcut = () => {
        const presetSent = contextButton.dataset.sent === "true" || aiCacheRecord.contextPresetUsed === true || Boolean(aiCacheRecord.primary) || aiCacheRecord.followups.some(item => item.contextPreset === true || item.question === contextPresetQuestion);
        contextButton.hidden = presetSent || Boolean(input.value.trim());
      };
      contextButton.dataset.sent = aiCacheRecord.contextPresetUsed === true || Boolean(aiCacheRecord.primary) || aiCacheRecord.followups.some(item => item.contextPreset === true || item.question === contextPresetQuestion) ? "true" : "false";
      contextButton.dataset.prepared = "false";
      syncContextShortcut();

      const submitQuestion = q => {
        if (!configured || !q || input.disabled) return;
        const usesContextPreset = contextButton.dataset.prepared === "true";
        if (usesContextPreset) {
          contextButton.dataset.sent = "true";
          contextButton.dataset.prepared = "false";
          aiCacheRecord.contextPresetUsed = true;
          persistAiCacheRecord();
        }
        syncContextShortcut();
        input.disabled = true; sendButton.disabled = true; contextButton.disabled = true;
        aiResultEl.style.display = "block";
        aiQuestionPending += 1;
        const answerBody = appendFlatAiFollowup(q, "", true);
        focusNewAiTurnOnce(answerBody);
        const requestMode = usesContextPreset ? aiAnalysisMode : "ask_context";
        sendDictionaryRuntimeMessage({action:"LOOKUP_AI_DEEP_DICT",text,context:selectionContext,sl:languageHint,mode:requestMode,question:q,settings:currentSettings}, res => {
          aiQuestionPending = Math.max(0,aiQuestionPending-1);
          aiResultEl.style.display = "block";
          input.disabled = false; sendButton.disabled = false; contextButton.disabled = false; input.value = "";
          syncComposerPresentation();
          syncContextShortcut();
          try { input.focus({ preventScroll:true }); } catch (_) {}
          answerBody.innerHTML = res?.success && res.markdown ? renderDictionaryAiBubbleSections(res.markdown) : `<div class="dict-ai-answer-bubble"><div class="dict-ai-error">${escapeHtml(res?.error || "暂时没有回答")}</div></div>`;
          if (res?.success && res.markdown) {
            aiCacheRecord.followups = [...(aiCacheRecord.followups || []), { question:q, markdown:res.markdown, contextPreset:usesContextPreset }].slice(-8);
            persistAiCacheRecord();
          }
        });
      };
      contextButton.addEventListener("click", () => {
        contextButton.dataset.prepared = "true";
        input.value = contextPresetQuestion;
        syncComposerPresentation();
        syncContextShortcut();
        try { input.focus({ preventScroll:true }); } catch (_) {}
        input.setSelectionRange(input.value.length, input.value.length);
      });
      input.addEventListener("input", () => {
        if (!input.value.trim() && contextButton.dataset.sent !== "true") contextButton.dataset.prepared = "false";
        syncComposerPresentation();
        syncContextShortcut();
      });
      input.addEventListener("keydown", e => {
        if (e.key !== "Enter" || e.shiftKey || e.isComposing) return;
        e.preventDefault();
        box.requestSubmit();
      });
      box.addEventListener("submit", (e) => {
        e.preventDefault();
        submitQuestion(input?.value?.trim());
      });
      aiComposerDock.appendChild(box);
      syncComposerPresentation();
    }

    if (dictionaryAiEnabled) {
      appendAiQuestionBox();
      sendDictionaryRuntimeMessage({ action:"GET_DICTIONARY_AI_CACHE", key:aiCacheKey }, res => {
        if (res?.success && (res.data?.primary || res.data?.followups?.length || res.data?.contextPresetUsed)) renderAiCacheRecord(res.data);
      });
    } else {
      aiResultEl.style.display = "none";
      aiComposerDock.style.display = "none";
    }

    function renderAiDictionaryJson(raw) {
      try {
        const clean = String(raw || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        const data = JSON.parse(clean);
        const titleEl = selectionRoot.querySelector(".dict-word-title");
        if (titleEl && data.headword) titleEl.textContent = data.headword;
        const meta = [];
        if (data.phonetic) meta.push(`<span class="dict-inline-phonetic">${escapeHtml(formatDictionaryPhonetic(data.phonetic))}</span>`);
        if (data.reading) meta.push(`<span class="dict-inline-reading">${escapeHtml(data.reading)}</span>`);
        if (data.lemma && data.lemma !== data.headword) meta.push(`<span class="dict-lemma">${escapeHtml(data.lemma)}</span>`);
        if (headMetaEl) headMetaEl.innerHTML = meta.join("");
        if (sourceInlineEl) sourceInlineEl.textContent = "AI 查词";
        let html = `<section class="dict-brief-section"><div class="dict-brief-head"><span class="dict-section-title">简明释义</span></div><div class="dict-brief-groups">`;
        const brief = Array.isArray(data.brief) ? data.brief : [];
        brief.slice(0,5).forEach(g => {
          const meanings = Array.isArray(g.meanings) ? g.meanings.filter(Boolean).slice(0,5) : [];
          if (meanings.length) html += `<div class="dict-brief-row"><span class="dict-brief-pos">${escapeHtml(g.pos || "释义")}</span><span class="dict-brief-meaning">${escapeHtml(meanings.join("；"))}</span></div>`;
        });
        html += `</div></section>`;
        const details = Array.isArray(data.details) ? data.details : [];
        if (details.length) {
          html += `<section class="dict-detail-section"><div class="dict-section-title">详细释义</div><div class="dict-sense-groups">`;
          details.slice(0,5).forEach(g => {
            html += `<div class="dict-sense-group"><div class="dict-pos-label">${escapeHtml(g.pos || "释义")}</div><div class="dict-sense-list">`;
            (Array.isArray(g.senses) ? g.senses : []).slice(0,5).forEach((sense,i) => {
              html += `<div class="dict-sense-item"><div class="dict-sense-index">${i+1}</div><div class="dict-sense-copy">${sense.zh ? `<div class="dict-sense-zh">${escapeHtml(cleanDictionaryPunctuation(sense.zh))}</div>` : ""}${sense.en ? `<div class="dict-sense-en">${escapeHtml(cleanDictionaryPunctuation(sense.en))}</div>` : ""}</div></div>`;
            });
            html += `</div></div>`;
          });
          html += `</div></section>`;
        }
        const examples = Array.isArray(data.examples) ? data.examples : [];
        if (examples.length) {
          html += `<section class="dict-example-section"><div class="dict-section-title">例句</div><div class="dict-examples-detail">`;
          examples.slice(0,4).forEach((ex,i) => {
            html += `<div class="dict-example-detail"><span class="dict-example-no">${i+1}</span><div class="dict-example-copy"><div class="dict-example-source">${escapeHtml(ex.source || "")}</div>${ex.translation ? `<div class="dict-example-translation">${escapeHtml(ex.translation)}</div>` : ""}</div></div>`;
          });
          html += `</div></section>`;
        }
        const syn = Array.isArray(data.synonyms) ? data.synonyms.filter(Boolean).slice(0,8) : [];
        if (syn.length) html += `<section class="dict-related-section"><div class="dict-section-title">相关词</div><div class="dict-related-row"><span>近义</span><div>${syn.map(x=>`<button type="button" class="dict-related-word" data-dict-word="${escapeHtml(x)}">${escapeHtml(x)}</button>`).join("")}</div></div></section>`;
        contentEl.innerHTML = html || `<div class="dict-error">AI 未返回可展示的词典内容。</div>`;
        contentEl.style.display = "block"; loadingEl.style.display = "none";
        currentEntry = { original:text, detectedLang:data.language || languageHint, phonetic:data.phonetic || data.reading || "", translation: brief.flatMap(g => Array.isArray(g.meanings)?g.meanings:[]).slice(0,4).join("；"), definitions:details, sourceName:"AI 查词" };
        syncStarState();
        if (aiResultEl && !aiCacheRecord.primary && !aiCacheRecord.followups.length && aiQuestionPending===0) aiResultEl.style.display = "none";
        contentEl.querySelectorAll("[data-dict-word]").forEach(btn => btn.addEventListener("click", () => { const word=btn.getAttribute("data-dict-word"); if(word) openDictionaryCard(cardEl.getBoundingClientRect().top+20, cardEl.getBoundingClientRect().left+20, word); }));
        return true;
      } catch (_) { return false; }
    }

    if (isPassage) {
      // Route sentences and passages through fast translation before optional AI grammar/context analysis.
      // This avoids sending long passages through the single-word Jisho lookup path.
      sendDictionaryRuntimeMessage({
        action: "TRANSLATE_SINGLE_BLOCK",
        text,
        sl: languageHint || "auto",
        tl: String(languageHint || "").startsWith("zh") ? "en" : (currentSettings.targetLang || "zh-CN")
      }, (res) => {
        if (!loadingEl || !contentEl) return;
        if (!res?.success) {
          loadingEl.style.display = "none";
          contentEl.style.display = "block";
          contentEl.innerHTML = `<div class="dict-error">简明翻译暂时不可用，${hasConfiguredAiDictionary() ? "AI 语法解析仍可继续。" : "配置 AI API 后可直接解析语法。"}</div>`;
          return;
        }
        loadingEl.style.display = "none";
        contentEl.style.display = "block";
        const translated = res?.success ? (res.text || "") : "";
        currentEntry = {
          original: text,
          detectedLang: languageHint || "auto",
          translation: translated,
          definitions: [],
          sourceName: "简明翻译"
        };
        if (sourceInlineEl) sourceInlineEl.textContent = isJapanesePassage ? "日语片段" : "选中文本";
        contentEl.innerHTML = translated
          ? `<div class="dict-passage-head"><div class="dict-section-heading">翻译</div></div><div class="dict-passage-translation">${escapeHtml(translated)}</div>`
          : `<div class="dict-passage-head"><div class="dict-section-heading">翻译</div></div><div class="dict-error">暂未取得翻译，${hasConfiguredAiDictionary() ? "仍可使用 AI 分析。" : "请稍后重试。"}</div>`;

      });

    } else if (effectiveDictionaryLookupMode === "ai") {
      if (!hasConfiguredAiDictionary()) {
        loadingEl.style.display = "none"; contentEl.style.display = "block";
        contentEl.innerHTML = `<div class="dict-error">已选择 AI 查词，但尚未配置可用的 AI API。可在偏好设置中切回“标准词典”或完成 API 配置。</div>`;
      } else {
        loadingEl.textContent = "AI 正在按词典格式整理…";
        sendDictionaryRuntimeMessage({ action:"LOOKUP_AI_DEEP_DICT", text, context:selectionContext, sl:languageHint, mode:"word_json", settings:currentSettings }, (aiRes) => {
          if (!aiRes?.success || !renderAiDictionaryJson(aiRes.markdown)) {
            loadingEl.style.display = "none"; contentEl.style.display = "block";
            contentEl.innerHTML = `<div class="dict-error">AI 查词暂时没有返回有效的词典结构，请重试或切回标准词典。</div>`;
          }
        });
      }
    } else {
          const dictionaryUiTimeout = setTimeout(() => {
            if (loadingEl && loadingEl.style.display !== "none") {
              loadingEl.innerHTML = languageHint === "ja"
                ? "在线日语词典响应较慢，可稍后重试或在设置中切换为 AI 查词。"
                : "词典响应较慢，可稍后重试。";
            }
          }, 5200);

          sendDictionaryRuntimeMessage(
            {
              action: "LOOKUP_DICTIONARY",
              text: text,
              sl: languageHint,
              tl: currentSettings.targetLang || "zh-CN"
            },
            (res) => {
              clearTimeout(dictionaryUiTimeout);
              if (!res?.success) {
                loadingEl.style.display = "block";
                loadingEl.textContent = "词典连接失败，请稍后重试。";
                return;
              }
              loadingEl.style.display = "none";
              contentEl.style.display = "block";

              if (res && res.success && res.data) {
                currentEntry = res.data;
                syncStarState();
                const d = res.data;
                const titleEl = selectionRoot.querySelector(".dict-word-title");
                if (titleEl && d.detectedLang === "ja" && d.lookupForm) {
                  titleEl.textContent = d.lookupForm;
                  titleEl.title = d.original || d.lookupForm;
                }

                let basicHtml = "";
                const headPieces = [];
                if (d.lookupForm && d.lookupForm !== d.original) headPieces.push(`<span class="dict-lemma">${escapeHtml(d.lookupForm)}</span>`);
                if (d.detectedLang === "ja" && d.reading) headPieces.push(`<span class="dict-inline-reading">${escapeHtml(d.reading)}</span>`);
                if (d.detectedLang === "en" && d.phonetic) headPieces.push(`<span class="dict-inline-phonetic">${escapeHtml(formatDictionaryPhonetic(d.phonetic))}</span>`);
                if (d.isChineseQuery && d.pinyin) headPieces.push(`<span class="dict-inline-phonetic">${escapeHtml(d.pinyin)}</span>`);
                if (headMetaEl) headMetaEl.innerHTML = headPieces.join("");
                if (sourceInlineEl) sourceInlineEl.textContent = d.sourceName || "";

                const tags = Array.isArray(d.tags) ? d.tags.filter(tag => /^(?:JLPT\s*)?N[1-5]$/i.test(String(tag || "").trim()) || /^(?:常用|高频)$/.test(String(tag || "").trim())).slice(0, 3) : [];
                if (tags.length && headMetaEl) {
                  headMetaEl.insertAdjacentHTML("beforeend", tags.map(tag => `<span class="dict-meta-tag">${escapeHtml(tag)}</span>`).join(""));
                }

                if (d.isChineseQuery) {
                  const nativeDefs = Array.isArray(d.nativeDefinitions) ? d.nativeDefinitions.map(x => typeof x === "string" ? {text:x,type:""} : x).filter(x=>x?.text).slice(0, 6) : [];
                  const jaDisplay = [d.jaWord || "", d.jaReading || ""].filter(Boolean).join(" · ");
                  if (d.dictionaryRedirectedFrom && d.dictionaryResolvedTitle) {
                    basicHtml += `<div class="dict-form-note dict-moedict-redirect">萌典词条 <span>${escapeHtml(d.dictionaryRedirectedFrom)}</span><span class="dict-form-arrow">→</span><strong>${escapeHtml(d.dictionaryResolvedTitle)}</strong>${d.dictionaryResolvedPinyin ? `<em>${escapeHtml(d.dictionaryResolvedPinyin)}</em>` : ""}</div>`;
                  }
                  basicHtml += `<section class="dict-brief-section">
                    <div class="dict-brief-head"><span class="dict-section-title">汉语释义</span><div class="dict-brief-tools"><button type="button" class="audio-chip-clean" id="btn-play-zh-audio" title="朗读中文">${DICT_SPEAKER_ICON}<span>发音</span></button></div></div>
                    <div class="dict-zh-def-list">${nativeDefs.length ? nativeDefs.map((x,i)=>`<div class="dict-zh-def-row"><span class="dict-zh-def-index">${i+1}</span><span class="dict-brief-meaning">${x.type ? `<span class="dict-zh-type">${escapeHtml(x.type)}</span>` : ""}${escapeHtml(cleanDictionaryPunctuation(x.text))}</span></div>`).join("") : `<div class="dict-zh-def-row"><span class="dict-zh-def-index">—</span><span class="dict-brief-meaning">暂未取得可靠的汉语释义</span></div>`}</div>
                  </section>
                  <section class="dict-cross-section"><div class="dict-section-title">跨语言对照</div><div class="dict-cross-lang-grid dict-cross-lang-grid-zh">
                    <div class="dict-cross-lang-row"><span class="dict-cross-label">英文</span>${d.enWord ? `<button type="button" class="dict-cross-value dict-cross-link" data-dict-word="${escapeHtml(d.enWord)}">${escapeHtml(d.enWord)}</button>` : `<span class="dict-cross-value">—</span>`}</div>
                    ${d.frWord ? `<div class="dict-cross-lang-row"><span class="dict-cross-label">法文</span><button type="button" class="dict-cross-value dict-cross-link" data-dict-word="${escapeHtml(d.frWord)}">${escapeHtml(d.frWord)}</button></div>` : ""}
                    ${d.deWord ? `<div class="dict-cross-lang-row"><span class="dict-cross-label">德文</span><button type="button" class="dict-cross-value dict-cross-link" data-dict-word="${escapeHtml(d.deWord)}">${escapeHtml(d.deWord)}</button></div>` : ""}
                    <div class="dict-cross-lang-row"><span class="dict-cross-label">日文</span>${d.jaWord ? `<button type="button" class="dict-cross-value dict-cross-link" data-dict-word="${escapeHtml(d.jaWord)}">${escapeHtml(jaDisplay)}</button>` : `<span class="dict-cross-value">—</span>`}</div>
                  </div></section>`;
                  const classical = Array.isArray(d.classicalDefinitions) ? d.classicalDefinitions.filter(Boolean).slice(0, 4) : [];
                  if (classical.length) basicHtml += `<section class="dict-classical-section"><div class="dict-section-title">古典例证</div><div class="dict-classical-list">${classical.map(x=>`<div>${escapeHtml(x)}</div>`).join("")}</div></section>`;
                } else {
                  const groups = Array.isArray(d.senseGroups) ? d.senseGroups : [];
                  const fallbackGroups = !groups.length && Array.isArray(d.definitions)
                    ? d.definitions.map(group => ({ pos: group.pos || "释义", senses: (group.terms || []).map(term => ({ zh: term, en: "" })) }))
                    : groups;

                  let formNoteHtml = "";
                  if (d.romajiInput && d.normalizedQuery) {
                    formNoteHtml = `<div class="dict-form-note">罗马字 <span>${escapeHtml(d.romajiInput)}</span><span class="dict-form-arrow">→</span><span>${escapeHtml(d.normalizedQuery)}</span>${d.lookupForm && d.lookupForm !== d.normalizedQuery ? `<span class="dict-form-arrow">→</span><strong>${escapeHtml(d.lookupForm)}</strong>` : ""}</div>`;
                  } else if (d.deinflectedFrom && d.lookupForm && d.lookupForm !== d.deinflectedFrom) {
                    formNoteHtml = `<div class="dict-form-note">查询形式 <span>${escapeHtml(d.deinflectedFrom)}</span><span class="dict-form-arrow">→</span><strong>${escapeHtml(d.lookupForm)}</strong></div>`;
                  }
                  basicHtml += formNoteHtml;
                  basicHtml += `<section class="dict-brief-section">
                    <div class="dict-brief-head"><span class="dict-section-title">简明释义</span>
                      <div class="dict-brief-tools">
                        ${d.detectedLang === "ja"
                          ? `<button type="button" class="audio-chip-clean" id="btn-play-ja-audio" title="朗读日语">${DICT_SPEAKER_ICON}<span>发音</span></button>`
                          : `<button type="button" class="audio-chip-clean" id="btn-play-us-audio" title="美式发音">${DICT_SPEAKER_ICON}<span>US</span></button><button type="button" class="audio-chip-clean" id="btn-play-uk-audio" title="英式发音">${DICT_SPEAKER_ICON}<span>UK</span></button>`}
                      </div>
                    </div>
                    <div class="dict-brief-groups">`;

                  if (d.detectedLang === "en" && Array.isArray(d.briefGroups) && d.briefGroups.length) {
                    d.briefGroups.slice(0, 4).forEach(group => {
                      const concise = Array.isArray(group.meanings) ? group.meanings.filter(Boolean).slice(0, 5) : [];
                      if (!concise.length) return;
                      basicHtml += `<div class="dict-brief-row${basicHtml.includes("dict-brief-row") ? "" : " dict-brief-row-primary"}"><span class="dict-brief-pos">${escapeHtml(group.pos || "释义")}</span><span class="dict-brief-meaning">${escapeHtml(cleanDictionaryPunctuation(concise.join("；")))}</span></div>`;
                    });
                  } else if (d.detectedLang === "en" && d.translation && d.translation !== d.original) {
                    basicHtml += `<div class="dict-brief-row dict-brief-row-primary"><span class="dict-brief-pos">释义</span><span class="dict-brief-meaning">${escapeHtml(cleanDictionaryPunctuation(d.translation))}</span></div>`;
                  } else if (fallbackGroups.length) {
                    fallbackGroups.slice(0, 4).forEach(group => {
                      const concise = (group.senses || []).map(x => x.zh || x.en).filter(Boolean).slice(0, 4);
                      if (!concise.length) return;
                      basicHtml += `<div class="dict-brief-row"><span class="dict-brief-pos">${escapeHtml(group.pos || "释义")}</span><span class="dict-brief-meaning">${escapeHtml(cleanDictionaryPunctuation(concise.join("；")))}</span></div>`;
                    });
                  } else if (d.translation && d.translation !== d.original) {
                    basicHtml += `<div class="dict-brief-row"><span class="dict-brief-pos">释义</span><span class="dict-brief-meaning">${escapeHtml(cleanDictionaryPunctuation(d.translation))}</span></div>`;
                  }
                  basicHtml += `</div></section>`;

                  if (d.detectedLang === "ja" && Array.isArray(d.chineseSameFormDefinitions) && d.chineseSameFormDefinitions.length) {
                    const zhSame = d.chineseSameFormDefinitions.map(x => typeof x === "string" ? x : x?.text).filter(Boolean).slice(0,4);
                    if (zhSame.length) basicHtml += `<section class="dict-cross-section dict-same-form-section"><div class="dict-section-title">中文同形词</div><div class="dict-same-form-copy">${escapeHtml(zhSame.join("；"))}</div></section>`;
                  }

                  const shouldShowDetail = fallbackGroups.length && d.detectedLang !== "ja";
                  if (shouldShowDetail) {
                    basicHtml += `<section class="dict-detail-section"><div class="dict-section-title">详细释义</div><div class="dict-sense-groups">`;
                    fallbackGroups.slice(0, 5).forEach(group => {
                      basicHtml += `<div class="dict-sense-group"><div class="dict-pos-label">${escapeHtml(group.pos || "释义")}</div><div class="dict-sense-list">`;
                      (group.senses || []).slice(0, 4).forEach((sense, idx) => {
                        basicHtml += `<div class="dict-sense-item">
                          <div class="dict-sense-index">${idx + 1}</div>
                          <div class="dict-sense-copy">
                            ${sense.zh ? `<div class="dict-sense-zh">${escapeHtml(cleanDictionaryPunctuation(sense.zh))}</div>` : ""}
                            ${sense.en ? `<div class="dict-sense-en">${escapeHtml(cleanDictionaryPunctuation(sense.en))}</div>` : ""}
                          </div>
                        </div>`;
                      });
                      basicHtml += `</div></div>`;
                    });
                    basicHtml += `</div></section>`;
                  }

                  const exPairs = Array.isArray(d.examplePairs) ? d.examplePairs : [];
                  if (exPairs.length) {
                    basicHtml += `<section class="dict-example-section"><div class="dict-section-title">例句</div><div class="dict-examples-detail">`;
                    exPairs.slice(0, 4).forEach((ex, idx) => {
                      basicHtml += `<div class="dict-example-detail">
                        <span class="dict-example-no">${idx + 1}</span>
                        <div class="dict-example-copy"><div class="dict-example-source">${escapeHtml(ex.source || "")}</div>${ex.translation ? `<div class="dict-example-translation">${escapeHtml(ex.translation)}</div>` : ""}</div>
                      </div>`;
                    });
                    basicHtml += `</div></section>`;
                  }

                  const relatedSyn = Array.isArray(d.synonyms) ? d.synonyms.filter(Boolean).slice(0, 8) : [];
                  const relatedAnt = Array.isArray(d.antonyms) ? d.antonyms.filter(Boolean).slice(0, 8) : [];
                  if (relatedSyn.length || relatedAnt.length) {
                    basicHtml += `<section class="dict-related-section"><div class="dict-section-title">相关词</div>`;
                    if (relatedSyn.length) basicHtml += `<div class="dict-related-row"><span>近义</span><div>${relatedSyn.map(x => `<button type="button" class="dict-related-word" data-dict-word="${escapeHtml(x)}">${escapeHtml(x)}</button>`).join("")}</div></div>`;
                    if (relatedAnt.length) basicHtml += `<div class="dict-related-row"><span>反义</span><div>${relatedAnt.map(x => `<button type="button" class="dict-related-word" data-dict-word="${escapeHtml(x)}">${escapeHtml(x)}</button>`).join("")}</div></div>`;
                    basicHtml += `</section>`;
                  }
                }

                contentEl.innerHTML = basicHtml || `<div class="dict-error">暂未找到可用词条。</div>`;
                // Wikipedia is an optional, non-blocking supplement. Core dictionary
                // results render immediately; if Wikimedia is unreachable or has no
                // exact page, nothing is inserted and no error is shown.
                const wikiLang = d.isChineseQuery ? "zh" : (d.detectedLang === "ja" ? "ja" : (d.detectedLang === "en" ? "en" : ""));
                if (wikiLang && String(d.original || text).length <= 80) {
                  sendDictionaryRuntimeMessage({ action:"LOOKUP_WIKIPEDIA_SUMMARY", text:d.lookupForm || d.original || text, lang:wikiLang }, wikiRes => {
                    const wiki=wikiRes?.success ? wikiRes.data : null;
                    if (!wiki?.extract || !contentEl?.isConnected || contentEl.querySelector(".dict-wiki-section")) return;
                    const section=document.createElement("section");
                    section.className="dict-wiki-section";
                    const wikiText=String(wiki.extract || "").trim();
                    const expandable=wikiText.length > 360;
                    section.innerHTML=`<div class="dict-wiki-head"><span class="dict-section-title">维基百科</span>${wiki.url ? `<a class="dict-wiki-link" href="${escapeHtml(wiki.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(wiki.title || "查看原词条")}</a>` : ""}</div><div class="dict-wiki-copy${expandable ? " is-collapsed" : ""}">${escapeHtml(wikiText)}</div>${expandable ? `<button type="button" class="dict-wiki-expand" aria-expanded="false">展开全文</button>` : ""}`;
                    // Wikipedia is always the final, optional supplement. It should
                    // never jump above local dictionaries or interrupt the brief
                    // definition flow simply because its network request finished first.
                    contentEl.appendChild(section);
                    const expandBtn=section.querySelector(".dict-wiki-expand");
                    expandBtn?.addEventListener("click",()=>{
                      const copy=section.querySelector(".dict-wiki-copy");
                      const collapsed=copy?.classList.toggle("is-collapsed");
                      expandBtn.textContent=collapsed ? "展开全文" : "收起";
                      expandBtn.setAttribute("aria-expanded",String(!collapsed));
                    });
                  });
                }
                mountLocalDictionaryEntries(contentEl, d.localDictionaryEntries);
                mountLocalDictionaryStatus(contentEl, d);

                if (aiResultEl && !aiCacheRecord.primary && !aiCacheRecord.followups.length && aiQuestionPending===0) aiResultEl.style.display = "none";
                contentEl.querySelectorAll("[data-dict-word]").forEach(btn => {
                  btn.addEventListener("click", () => {
                    const word = btn.getAttribute("data-dict-word");
                    if (word) openDictionaryCard(Math.min(window.innerHeight - 180, cardEl.getBoundingClientRect().top + 24), Math.min(window.innerWidth - 360, cardEl.getBoundingClientRect().left + 20), word);
                  });
                });

                // 内容加载后再做一次视口校正，避免长释义卡片贴出屏幕。
                requestAnimationFrame(() => {
                  if (!cardEl || !cardEl.isConnected) return;
                  const rect = cardEl.getBoundingClientRect();
                  const safe = 10;
                  if (rect.right > window.innerWidth - safe) {
                    cardEl.style.setProperty("left", `${Math.max(safe, window.innerWidth - rect.width - safe)}px`, "important");
                  }
                  if (rect.bottom > window.innerHeight - safe) {
                    cardEl.style.setProperty("top", `${Math.max(safe, window.innerHeight - rect.height - safe)}px`, "important");
                  }
                });

                const playAudioUrl = (url, fallbackLang) => {
                  if (url) {
                    const audio = new Audio(url);
                    audio.play().catch(() => speakTextNeural(text, fallbackLang));
                  } else {
                    speakTextNeural(text, fallbackLang);
                  }
                };

                const btnUs = contentEl.querySelector("#btn-play-us-audio");
                const btnUk = contentEl.querySelector("#btn-play-uk-audio");
                const btnJa = contentEl.querySelector("#btn-play-ja-audio");
                const btnZh = contentEl.querySelector("#btn-play-zh-audio");

                if (btnUs) btnUs.addEventListener("click", () => playAudioUrl(d.humanAudioUs, "en-US"));
                if (btnUk) btnUk.addEventListener("click", () => playAudioUrl(d.humanAudioUk, "en-GB"));
                if (btnJa) btnJa.addEventListener("click", () => playAudioUrl(d.humanAudioUs, "ja-JP"));
                if (btnZh) btnZh.addEventListener("click", () => playAudioUrl(d.humanAudioUs, "zh-CN"));

              } else {
                contentEl.innerHTML = `<div class="dict-error">未找到词条释义，请检查网络</div>`;
              }
            }
          );
    }
  }

  function speakTextNeural(text, bcpLang = "en-US") {
    if (!window.speechSynthesis) return;
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = bcpLang;
      utterance.rate = parseFloat(currentSettings.preferredVoiceSpeed || "1.0") || 1.0;
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        const primary = bcpLang.split("-")[0].toLowerCase();
        const accent = String(currentSettings.preferredVoiceAccent || "us").toLowerCase();
        const candidates = voices.filter(v => String(v.lang || "").toLowerCase().startsWith(primary));
        const scoreVoice = (v) => {
          const name = String(v.name || "").toLowerCase();
          const lang = String(v.lang || "").toLowerCase();
          let score = 0;
          if (name.includes("natural")) score += 16;
          if (name.includes("microsoft")) score += 9;
          if (name.includes("google")) score += 7;
          if (/jenny|aria|guy|sonia|ryan|xiaoxiao|yunxi|nanami|keita|samantha|alex|tingting|kyoko/.test(name)) score += 6;
          if (!v.localService) score += 2;
          if (primary === "en") {
            if (accent === "uk" && /(gb|uk)/.test(lang)) score += 8;
            if (accent !== "uk" && /(us)/.test(lang)) score += 8;
          } else if (lang === bcpLang.toLowerCase()) score += 5;
          return score;
        };
        candidates.sort((a,b) => scoreVoice(b) - scoreVoice(a));
        if (candidates[0]) utterance.voice = candidates[0];
      }

      window.speechSynthesis.speak(utterance);
    } catch (_) {}
  }



  function annotateLocalDictionaryStructure(root) {
    if (!root) return;
    const headingExact = /^(?:word family|usage examples?|examples?|synonyms?|antonyms?|thesaurus|derivatives?|origin|phrases?|idioms?|collocations?|word forms?|related words?|usage notes?|notes?|definitions?)$/i;
    const relationExact = /^(?:syn\s*\|\s*ant\s*\|\s*hypo\s*\|\s*hyper|synonyms?\s*[|·/]\s*antonyms?)/i;
    const sourceLine = /^(?:Reuters|Associated Press|AP|BBC|CNN|The Guardian|New York Times|Washington Post|Washington Times|NPR|TIME|Forbes|Bloomberg|Financial Times)\b/i;
    const senseLine = /^\s*\d+(?:\.\d+)?\s*(?:n|v|adj|adv|prep|pron|conj|interj|det|aux|modal)\b/i;
    root.querySelectorAll("h1,h2,h3,h4,h5,h6,p,div,span,strong,b,dt").forEach(el => {
      if (el.children.length > 8) return;
      const text = String(el.textContent || "").replace(/\s+/g, " ").trim();
      if (!text || text.length > 96) return;
      if (headingExact.test(text) || (/^[A-Z][A-Z\s/&-]{3,36}$/.test(text) && !/[.!?]$/.test(text))) el.classList.add("mdict-semantic-heading");
      if (relationExact.test(text)) el.classList.add("mdict-semantic-relations");
      if (senseLine.test(text)) el.classList.add("mdict-semantic-sense");
      if (sourceLine.test(text)) el.classList.add("mdict-semantic-source");
    });
  }

  function sanitizeLocalDictionaryHtml(rawHtml, dictionaryName) {
    const rawSource = String(rawHtml || "");
    const bodyOpen = rawSource.match(/<body\b([^>]*)>/i);
    const bodyAttrs = bodyOpen?.[1] || "";
    const bodyClass = bodyAttrs.match(/\bclass\s*=\s*["']([^"']*)["']/i)?.[1] || "";
    const bodyId = bodyAttrs.match(/\bid\s*=\s*["']([^"']*)["']/i)?.[1] || "";
    const bodyStyle = bodyAttrs.match(/\bstyle\s*=\s*["']([^"']*)["']/i)?.[1] || "";
    const bodyLang = bodyAttrs.match(/\blang\s*=\s*["']([^"']*)["']/i)?.[1] || "";
    const bodyDir = bodyAttrs.match(/\bdir\s*=\s*["']([^"']*)["']/i)?.[1] || "";
    let source = rawSource
      .replace(/<!doctype[^>]*>/gi, "")
      // A surprising number of MDX entries contain a complete HTML document. If we
      // parse that document inside a <div>, DOMParser hoists <link>/<style> nodes
      // into <head> and the dictionary appears as unstyled plain text. Flatten the
      // document wrappers first and turn stylesheet links into neutral placeholders.
      .replace(/<\/?(?:html|head|body)\b[^>]*>/gi, "")
      .replace(/<link\b[^>]*>/gi, tag => {
        const rel = (tag.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1] || "").toLowerCase();
        const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] || "";
        if (!rel.includes("stylesheet") || !href || /^(?:https?:|data:)/i.test(href)) return "";
        return `<span data-mdict-css="${escapeHtml(href.replace(/^(?:file|mdd|res):\/\//i, ""))}" data-mdict-dictionary="${escapeHtml(dictionaryName)}"></span>`;
      });

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div id="mdict-safe-root">${source}</div>`, "text/html");
    const root = doc.querySelector("#mdict-safe-root");
    if (!root) return "";

    // 本地词典 HTML 当作“内容”而不是扩展代码：脚本、表单、嵌入对象一律不执行。
    root.querySelectorAll("script,iframe,object,embed,form,input,button,textarea,select,meta,base").forEach(el => el.remove());
    root.querySelectorAll("style").forEach(style => {
      style.textContent = String(style.textContent || "")
        .replace(/expression\s*\([^)]*\)/gi, "")
        .replace(/url\(\s*['\"]?javascript:[^)]+\)/gi, "none");
    });

    const allowedAttrs = new Set(["href","src","alt","title","colspan","rowspan","class","id","style","lang","dir","role"]);
    root.querySelectorAll("*").forEach(el => {
      Array.from(el.attributes).forEach(attr => {
        const name = attr.name.toLowerCase();
        if (name.startsWith("on")) el.removeAttribute(attr.name);
        else if (!allowedAttrs.has(name) && !name.startsWith("data-")) el.removeAttribute(attr.name);
      });
      if (el.hasAttribute("style")) {
        const cleaned = String(el.getAttribute("style") || "")
          .replace(/expression\s*\([^)]*\)/gi, "")
          .replace(/url\(\s*['\"]?javascript:[^)]+\)/gi, "none");
        el.setAttribute("style", cleaned);
      }
      if (el.tagName === "IMG" || el.tagName === "SOURCE") {
        const src = el.getAttribute("src") || "";
        if (src && !/^data:/i.test(src) && !/^https?:/i.test(src)) {
          el.removeAttribute("src");
          el.setAttribute("data-mdict-resource", src.replace(/^(?:file|mdd|res):\/\//i, ""));
          el.setAttribute("data-mdict-dictionary", dictionaryName);
          el.classList.add("dict-local-resource-pending");
        }
      }
      if (el.tagName === "A") {
        const href = el.getAttribute("href") || "";
        if (/^sound:\/\//i.test(href)) {
          el.removeAttribute("href");
          el.setAttribute("data-mdict-sound", href.replace(/^sound:\/\//i, ""));
          el.setAttribute("data-mdict-dictionary", dictionaryName);
          el.setAttribute("role", "button");
        } else if (/^entry:\/\//i.test(href) || /^@@@LINK=/i.test(href)) {
          el.removeAttribute("href");
          el.setAttribute("data-dict-word", href.replace(/^entry:\/\//i, "").replace(/^@@@LINK=/i, "").replace(/^[/\\]+|[/\\]+$/g, ""));
        } else if (href && !/^https?:/i.test(href) && !/^#/i.test(href)) {
          el.removeAttribute("href");
        }
      }
    });
    annotateLocalDictionaryStructure(root);
    const proxy = doc.createElement("div");
    proxy.className = `mdict-body-proxy ${bodyClass}`.trim();
    if (bodyId) proxy.id = bodyId;
    if (bodyStyle) proxy.setAttribute("style", bodyStyle.replace(/expression\s*\([^)]*\)/gi, "").replace(/url\(\s*['\"]?javascript:[^)]+\)/gi, "none"));
    if (bodyLang) proxy.setAttribute("lang", bodyLang);
    if (bodyDir) proxy.setAttribute("dir", bodyDir);
    while (root.firstChild) proxy.appendChild(root.firstChild);
    root.appendChild(proxy);
    return root.innerHTML;
  }

  function requestLocalDictionaryResource(dictionaryKey, path) {
    return new Promise(resolve => sendDictionaryRuntimeMessage({ action:"LOOKUP_LOCAL_DICTIONARY_RESOURCE", dictionaryName:dictionaryKey, path }, res => resolve(res?.success ? res.dataUrl : "")));
  }

  function resolveMdictResourcePath(basePath, ref) {
    let target = String(ref || "").trim().replace(/^(?:file|mdd|res):\/\//i, "").replace(/[?#].*$/, "");
    if (!target || /^(?:data:|https?:|#)/i.test(target)) return target;
    target = target.replace(/\\/g, "/");
    if (/^\//.test(target)) return target.replace(/^\/+/, "");
    const base = String(basePath || "").replace(/\\/g, "/").replace(/[?#].*$/, "");
    const parts = base.includes("/") ? base.split("/").slice(0, -1) : [];
    for (const bit of target.split("/")) {
      if (!bit || bit === ".") continue;
      if (bit === "..") parts.pop(); else parts.push(bit);
    }
    return parts.join("/");
  }

  async function hydrateLocalDictionaryCssText(cssText, dictionaryKey, basePath = "", depth = 0) {
    let css = String(cssText || "")
      .replace(/expression\s*\([^)]*\)/gi, "")
      .replace(/url\(\s*['\"]?javascript:[^)]+\)/gi, "none");
    // MDX CSS 经常直接写 body/html/:root。ShadowRoot 里没有页面 body，
    // 所以只把这些文档级选择器映射到本地词典容器，其余 class/id 完整保留。
    css = css
      .replace(/(^|[},])\s*:root(?=\s*[{,])/g, "$1 :host")
      .replace(/(^|[},])\s*html(?=\s*[{,])/gi, "$1 :host")
      .replace(/\bbody\b/gi, ".mdict-body-proxy");
    if (depth < 3) {
      const imports = [...css.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?\s*[^;]*;/gi)].slice(0, 8);
      for (const match of imports) {
        const ref = match[1];
        if (!ref || /^(?:data:|https?:|#)/i.test(ref)) { css = css.replace(match[0], ""); continue; }
        const resolved = resolveMdictResourcePath(basePath, ref);
        const dataUrl = await requestLocalDictionaryResource(dictionaryKey, resolved).catch(() => "");
        if (!dataUrl) { css = css.replace(match[0], ""); continue; }
        try {
          const imported = await fetch(dataUrl).then(r => r.text());
          const hydrated = await hydrateLocalDictionaryCssText(imported, dictionaryKey, resolved, depth + 1);
          css = css.replace(match[0], `\n${hydrated}\n`);
        } catch (_) { css = css.replace(match[0], ""); }
      }
    }
    const refs = [...new Set(Array.from(css.matchAll(/url\(\s*(['\"]?)([^)'\"]+)\1\s*\)/gi)).map(m => m[2]).filter(x => x && !/^(?:data:|https?:|#)/i.test(x)).slice(0, 48))];
    for (const ref of refs) {
      const resolved = resolveMdictResourcePath(basePath, ref);
      const dataUrl = await requestLocalDictionaryResource(dictionaryKey, resolved).catch(() => "");
      if (dataUrl) css = css.split(ref).join(dataUrl);
    }
    return css;
  }

  async function hydrateLocalDictionaryCss(styleEl, dictionaryKey, basePath = "") {
    if (!styleEl || !dictionaryKey) return;
    const css = await hydrateLocalDictionaryCssText(styleEl.textContent || "", dictionaryKey, basePath);
    if (styleEl.isConnected) styleEl.textContent = css;
  }

  function enhanceLocalDictionaryNativeNavigation(shadow) {
    if (!shadow) return;
    // Rich MDX dictionaries often rely on client-side scripts for internal tabs,
    // expandable examples, jump links and thesaurus links. Scripts are stripped for
    // safety, so recreate only these declarative interactions inside the ShadowRoot.
    const navItems = Array.from(shadow.querySelectorAll(".navigationItem[data-index]"));
    const panels = Array.from(shadow.querySelectorAll(".entryContent[data-index]"));
    const panelByIndex = new Map(panels.map(panel => [String(panel.getAttribute("data-index") || ""), panel]));
    const panelByDict = new Map(panels.map(panel => [String(panel.getAttribute("data-dictname") || "").toLowerCase(), panel]));

    let activeIndex = String(panels[0]?.getAttribute("data-index") || "0");
    const activate = index => {
      const chosen = panelByIndex.get(String(index)) || panels[0];
      if (!chosen) return;
      activeIndex = String(chosen.getAttribute("data-index") || index || "0");
      navItems.forEach(item => {
        const active = String(item.getAttribute("data-index") || "") === activeIndex;
        item.classList.toggle("mdict-native-nav-active", active);
        item.classList.toggle("active", active);
        item.classList.toggle("selected", active);
        item.setAttribute("role", "tab");
        item.setAttribute("aria-selected", String(active));
        item.tabIndex = active ? 0 : -1;
      });
      panels.forEach(panel => {
        const active = panel === chosen;
        panel.classList.toggle("mdict-native-section-hidden", !active);
        panel.classList.toggle("active", active);
        panel.classList.toggle("current", active);
        panel.hidden = !active;
        // The sidecar CSS of some dictionaries sets `.entryContent{display:none}`
        // and expects their own JS to add a proprietary active class. Force the
        // selected panel visible so switching tabs can never blank the dictionary.
        panel.style.setProperty("display", active ? "block" : "none", "important");
        panel.style.setProperty("visibility", active ? "visible" : "hidden", "important");
      });
    };

    if (navItems.length >= 2 && panels.length >= 2 && navItems.some(item => panelByIndex.has(String(item.getAttribute("data-index") || "")))) {
      shadow.querySelector(".od-entry-body")?.classList.add("mdict-native-tabs-enabled");
      navItems.forEach(item => {
        item.setAttribute("role", "tab");
        item.addEventListener("click", e => {
          e.preventDefault(); e.stopPropagation();
          activate(String(item.getAttribute("data-index") || ""));
        });
        item.addEventListener("keydown", e => {
          const idx = navItems.indexOf(item);
          if (["ArrowLeft","ArrowRight","Home","End"].includes(e.key)) {
            e.preventDefault(); e.stopPropagation();
            const nextIdx = e.key === "Home" ? 0 : e.key === "End" ? navItems.length - 1 : (idx + (e.key === "ArrowRight" ? 1 : -1) + navItems.length) % navItems.length;
            const next = navItems[nextIdx];
            activate(String(next?.getAttribute("data-index") || ""));
            next?.focus?.();
            return;
          }
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault(); e.stopPropagation();
          activate(String(item.getAttribute("data-index") || ""));
        });
      });
      const initial = String(navItems.find(item => panelByIndex.has(String(item.getAttribute("data-index") || "")))?.getAttribute("data-index") || activeIndex);
      activate(initial);
    }

    // Oxford-style "View synonyms" links point to another internal dictionary tab
    // and an anchor inside that tab. Keep the interaction local instead of opening a
    // second lookup card for the same word.
    shadow.querySelectorAll(".entrySynMore[data-target-dictname]").forEach(link => {
      link.setAttribute("role", "button");
      link.tabIndex = 0;
      const go = e => {
        e?.preventDefault?.(); e?.stopPropagation?.();
        const name = String(link.getAttribute("data-target-dictname") || "").toLowerCase();
        const targetPanel = panelByDict.get(name);
        if (targetPanel) activate(String(targetPanel.getAttribute("data-index") || activeIndex));
        const selector = String(link.getAttribute("data-target-id") || "").trim();
        const target = selector && targetPanel ? targetPanel.querySelector(selector) : null;
        target?.scrollIntoView({ block:"center", behavior:"smooth" });
      };
      link.addEventListener("click", go);
      link.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") go(e); });
    });

    // Jump links such as "Phrases" are data-title based rather than real anchors.
    shadow.querySelectorAll(".jumplink[data-title]").forEach(link => {
      link.setAttribute("role", "button"); link.tabIndex = 0;
      const go = e => {
        e?.preventDefault?.(); e?.stopPropagation?.();
        const title = String(link.getAttribute("data-title") || "").trim();
        const panel = panelByIndex.get(activeIndex) || shadow;
        const target = Array.from(panel.querySelectorAll("[data-title]")).find(el => el !== link && String(el.getAttribute("data-title") || "").trim() === title);
        // Jumping to a native reference section should also reveal it. The
        // original dictionary JS did this implicitly; our safe compatibility
        // layer keeps the same behaviour without executing dictionary scripts.
        const section = target?.matches?.("section[data-title]") ? target : target?.closest?.("section[data-title]");
        if (section?.classList?.contains("mdict-collapsible-section") && !section.classList.contains("mdict-section-open")) {
          section.querySelector(":scope > h2, :scope > .senseInnerWrapper > h2")?.click();
        }
        target?.scrollIntoView({ block:"start", behavior:"smooth" });
      };
      link.addEventListener("click", go);
      link.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") go(e); });
    });

    // "More example sentences" is normally toggled by the dictionary's own JS.
    shadow.querySelectorAll(".moreInformationExemples").forEach(toggle => {
      const list = toggle.parentElement?.querySelector?.(".sentence_dictionary");
      if (!list) return;
      toggle.setAttribute("role", "button"); toggle.tabIndex = 0;
      list.hidden = true;
      list.style.setProperty("display", "none", "important");
      toggle.classList.remove("mdict-expanded");
      toggle.setAttribute("aria-expanded", "false");
      const run = e => {
        e?.preventDefault?.(); e?.stopPropagation?.();
        const hidden = getComputedStyle(list).display === "none" || list.hidden;
        list.hidden = !hidden;
        list.style.setProperty("display", hidden ? "block" : "none", "important");
        toggle.classList.toggle("mdict-expanded", hidden);
        toggle.setAttribute("aria-expanded", String(hidden));
      };
      toggle.addEventListener("click", run);
      toggle.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") run(e); });
    });

    shadow.querySelectorAll(".moreInformationSynonyms").forEach(toggle => {
      const box = toggle.parentElement?.querySelector?.(".entrySynList");
      if (!box) return;
      toggle.setAttribute("role", "button"); toggle.tabIndex = 0;
      box.hidden = true;
      box.style.setProperty("display", "none", "important");
      toggle.setAttribute("aria-expanded", "false");
      const run = e => {
        e?.preventDefault?.(); e?.stopPropagation?.();
        const hidden = getComputedStyle(box).display === "none" || box.hidden;
        box.hidden = !hidden;
        box.style.setProperty("display", hidden ? "block" : "none", "important");
        toggle.setAttribute("aria-expanded", String(hidden));
      };
      toggle.addEventListener("click", run);
      toggle.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") run(e); });
    });

    // Bottom reference blocks (Origin / Phrases / rhymes / editors notes, etc.)
    // are commonly collapsed by the original dictionary stylesheet and expanded
    // by JavaScript that we intentionally strip. Recreate that small declarative
    // interaction without executing dictionary scripts.
    shadow.querySelectorAll("section[data-title]").forEach(section => {
      if (section.closest(".senseGroup") || section.classList.contains("senseGroup")) return;
      const title = String(section.getAttribute("data-title") || section.querySelector(":scope > h2, :scope > .senseInnerWrapper > h2")?.textContent || "").trim();
      if (!title) return;
      const heading = section.querySelector(":scope > h2, :scope > .senseInnerWrapper > h2");
      if (!heading) return;
      const bodyNodes = Array.from(section.children).filter(node => node !== heading && !(node.classList?.contains("senseInnerWrapper") && node.querySelector?.("h2") === heading));
      const wrapper = heading.parentElement?.classList?.contains("senseInnerWrapper") ? heading.parentElement : null;
      const managed = wrapper ? Array.from(wrapper.children).filter(node => node !== heading) : bodyNodes;
      if (!managed.length) return;
      section.classList.add("mdict-collapsible-section");
      heading.classList.add("mdict-collapsible-heading");
      heading.setAttribute("role", "button"); heading.tabIndex = 0;
      const setOpen = open => {
        section.classList.toggle("mdict-section-open", open);
        heading.setAttribute("aria-expanded", String(open));
        managed.forEach(node => {
          node.hidden = !open;
          // Native sidecar CSS often defaults these blocks to display:none and
          // waits for proprietary JS to override it. An empty inline display
          // value therefore cannot reliably reopen them; force a safe visible
          // display for the block-level reference content we manage.
          const visibleDisplay = /^(SPAN|A|EM|STRONG)$/i.test(node.tagName || "") ? "inline" : "block";
          node.style.setProperty("display", open ? visibleDisplay : "none", "important");
        });
      };
      // Keep compact reference blocks collapsed initially; Phrases is also folded
      // because it can contain dozens of examples and otherwise dominates the card.
      setOpen(false);
      const run = e => { e?.preventDefault?.(); e?.stopPropagation?.(); setOpen(!section.classList.contains("mdict-section-open")); };
      heading.addEventListener("click", run);
      heading.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") run(e); });
    });
  }

  function installLocalDictionaryBackToTop(host, shadow) {
    if (!host || !shadow || shadow.querySelector(".mdict-back-to-top")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mdict-back-to-top";
    button.title = "回到词典顶部";
    button.setAttribute("aria-label", "回到词典顶部");
    const iconUrl = extensionAssetUrls.icon32;
    button.innerHTML = iconUrl ? `<img src="${iconUrl}" alt="">` : `<span aria-hidden="true">↑</span>`;
    shadow.appendChild(button);

    const findScrollContainer = () => {
      let node = host.parentElement;
      while (node && node !== document.documentElement && node !== document.body) {
        const style = getComputedStyle(node);
        const overflowY = `${style.overflowY} ${style.overflow}`;
        if (/(auto|scroll|overlay)/.test(overflowY) && node.scrollHeight > node.clientHeight + 8) return node;
        node = node.parentElement;
      }
      return host.closest(".dict-local-page-body") || host.closest(".dict-body") || host.closest(".dict-local-panels") || document.scrollingElement;
    };

    let scrollContainer = null;
    let frame = 0;
    const targetTop = () => {
      const sc = scrollContainer;
      if (!sc) return 0;
      if (sc === document.scrollingElement || sc === document.documentElement || sc === document.body) {
        return Math.max(0, window.scrollY + host.getBoundingClientRect().top - 12);
      }
      const scRect = sc.getBoundingClientRect();
      return Math.max(0, sc.scrollTop + host.getBoundingClientRect().top - scRect.top - 8);
    };
    const update = () => {
      frame = 0;
      if (!host.isConnected) return;
      if (!scrollContainer || !scrollContainer.isConnected) scrollContainer = findScrollContainer();
      const sc = scrollContainer;
      if (!sc) return;
      const current = (sc === document.scrollingElement || sc === document.documentElement || sc === document.body) ? window.scrollY : sc.scrollTop;
      const delta = current - targetTop();
      const hostRect = host.getBoundingClientRect();
      const scRect = (sc === document.scrollingElement || sc === document.documentElement || sc === document.body)
        ? { left:0, top:0, right:window.innerWidth, bottom:window.innerHeight }
        : sc.getBoundingClientRect();
      const visible = delta > 180 && hostRect.width > 0 && hostRect.bottom > scRect.top + 28 && hostRect.top < scRect.bottom - 20;
      button.classList.toggle("is-visible", visible);
      if (!visible) return;
      const left = Math.max(scRect.left + 10, Math.min(scRect.right - 38, window.innerWidth - 40));
      const top = Math.max(scRect.top + 10, Math.min(scRect.bottom - 40, window.innerHeight - 42));
      button.style.left = `${Math.round(left)}px`;
      button.style.top = `${Math.round(top)}px`;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    scrollContainer = findScrollContainer();
    scrollContainer?.addEventListener?.("scroll", schedule, { passive:true });
    window.addEventListener("scroll", schedule, { passive:true });
    window.addEventListener("resize", schedule, { passive:true });
    button.addEventListener("click", e => {
      e.preventDefault(); e.stopPropagation();
      if (!scrollContainer) scrollContainer = findScrollContainer();
      const top = targetTop();
      if (scrollContainer === document.scrollingElement || scrollContainer === document.documentElement || scrollContainer === document.body) window.scrollTo({ top, behavior:"smooth" });
      else scrollContainer?.scrollTo?.({ top, behavior:"smooth" });
    });
    requestAnimationFrame(schedule);
  }

  function attachLocalDictionaryShadow(host, entry) {
    if (!host || host.shadowRoot) return;
    const dictionaryName = entry.dictionaryName || "本地词典";
    const dictionaryKey = entry.dictionaryKey || dictionaryName;
    const shadow = host.attachShadow({ mode:"open" });
    const records = Array.isArray(entry.records) && entry.records.length ? entry.records : [entry.html || ""];
    const mainRecord = String(records[0] || "");
    let bodyHtml = "";
    if (entry.oversized) {
      const plain = String(entry.oversizedPreview || "").trim().slice(0, 24000);
      bodyHtml = `<div class="od-oversize-note">这个词条包含非常大的附加内容，为避免页面卡顿，只显示正文预览。</div><div class="od-oversize-preview">${escapeHtml(plain)}</div>`;
    } else {
      bodyHtml = sanitizeLocalDictionaryHtml(mainRecord, dictionaryName);
    }
    const reset = `
      :host{all:initial;display:block;color:#1f242b;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Noto Sans CJK SC",sans-serif;font-size:13.5px;line-height:1.62;overflow-wrap:anywhere}
      *{box-sizing:border-box} img,svg,video{max-width:100%;height:auto} table{max-width:100%;border-collapse:collapse} pre{white-space:pre-wrap;overflow:auto} a{cursor:pointer}
      .od-oversize-note{padding:8px 10px;margin:0 0 10px;border-radius:7px;background:#f6f7f8;color:#737b86;font-size:12.5px}.od-oversize-preview{line-height:1.7}
      .mdict-css-warning{margin:0 0 12px;padding:8px 10px;border-radius:6px;background:#faf6ef;color:#8a654d;font:500 11.5px/1.5 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}
      .od-entry-body{min-width:0}.mdict-body-proxy{min-width:0;margin:0;padding:0;background:transparent;color:inherit}.od-entry-body p{margin:.52em 0}.od-entry-body ol,.od-entry-body ul{margin:.55em 0;padding-left:1.65em}.od-entry-body li{margin:.3em 0}.od-entry-body h1,.od-entry-body h2,.od-entry-body h3,.od-entry-body h4,.od-entry-body h5,.od-entry-body h6{margin:1.05em 0 .42em;color:#20262d;font-family:inherit;font-weight:720;line-height:1.38}.od-entry-body h1{font-size:1.3em}.od-entry-body h2{font-size:1.16em}.od-entry-body h3{font-size:1.07em}.od-entry-body h4,.od-entry-body h5,.od-entry-body h6{font-size:1em}.od-entry-body strong,.od-entry-body b{font-weight:700;color:#242a31}.od-entry-body em,.od-entry-body i{font-style:italic}.od-entry-body blockquote{margin:.7em 0;padding:.15em 0 .15em .9em;border-left:2px solid #e2e6ea;color:#626b75}.od-entry-body hr{height:1px;border:0;background:#eceff2;margin:1.05em 0}.od-entry-body dl{margin:.65em 0}.od-entry-body dt{font-weight:680;margin-top:.58em}.od-entry-body dd{margin:.22em 0 .48em 1.25em}.od-entry-body table{width:auto;max-width:100%;margin:.6em 0}.od-entry-body td,.od-entry-body th{padding:.3em .46em;vertical-align:top}.od-entry-body [class*="pos" i],.od-entry-body [class*="partofspeech" i],.od-entry-body [class*="label" i],.od-entry-body [class*="tag" i]{display:inline-block;margin:0 .34em .22em 0;padding:.08em .44em;border-radius:.32em;background:#f1f3f5;color:#68727d;font-size:.83em;line-height:1.45}.od-entry-body [class*="definition" i],.od-entry-body [class*="meaning" i],.od-entry-body [class*="sense" i]{margin:.42em 0;line-height:1.7}.od-entry-body [class*="example" i],.od-entry-body [class*="usage" i]{margin:.48em 0;color:#5d6671;line-height:1.65}.od-entry-body [class*="synonym" i],.od-entry-body [class*="antonym" i],.od-entry-body [class*="thesaurus" i],.od-entry-body [class*="word-family" i]{margin:.7em 0}.od-entry-body [class*="source" i],.od-entry-body [class*="credit" i]{color:#9aa1aa;font-size:.86em}.od-entry-body [class*="section" i]{margin-top:.8em}.od-entry-body .mdict-semantic-heading{display:block;margin:1.2em 0 .48em;padding-top:.08em;color:#333b44;font-size:.9em;font-weight:760;letter-spacing:.035em;text-transform:none}.od-entry-body .mdict-semantic-relations{display:block;margin:.65em 0 .38em;color:#8a929c;font-size:.82em;font-weight:650;letter-spacing:.02em}.od-entry-body .mdict-semantic-sense{display:block;margin:.9em 0 .35em;color:#2d343c;font-weight:690}.od-entry-body .mdict-semantic-source{display:block;margin:.18em 0 .7em;color:#9aa1aa;font-size:.83em}.od-entry-body br+br{line-height:1.15}
      /* Rich-dictionary fallback: original sidecar CSS still loads afterwards and
         wins normally; these rules only keep a missing-CSS dictionary readable. */
      .od-entry-body .navigation{display:flex;gap:4px;align-items:center;overflow-x:auto;scrollbar-width:none;margin:0 0 14px;padding:2px 0;white-space:nowrap;background:transparent;border-radius:0}.od-entry-body .navigation::-webkit-scrollbar{display:none}.od-entry-body .navigationItem{display:inline-flex;align-items:center;min-height:27px;padding:4px 9px;border:0;border-radius:5px;background:transparent;color:#737d88;font-size:11.5px;font-weight:590;cursor:pointer;box-shadow:none}.od-entry-body .navigationItem:hover{background:#f2f3f4;color:#30363d}.od-entry-body .navigationItem.mdict-native-nav-active{background:#17191c;color:#fff;box-shadow:none;font-weight:700}.od-entry-body .mdict-native-section-hidden{display:none!important}.od-entry-body .mdict-collapsible-section{overflow:visible!important;padding-top:2px!important}.od-entry-body .mdict-collapsible-heading{margin-top:0!important;min-height:32px!important;display:flex!important;align-items:center!important;box-sizing:border-box!important}
      .od-entry-body .entryHeader{margin:0 0 16px}.od-entry-body .definitionOf{margin:0 0 5px!important;color:#89919a!important;font-size:11.5px!important;font-weight:520!important;line-height:1.45!important}.od-entry-body .pageTitle{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;margin:0!important;font-size:25px!important;font-weight:720!important;letter-spacing:-.025em}.od-entry-body .realTitle{color:#1f252c}.od-entry-body .headpron,.od-entry-body .phonetics,.od-entry-body .phon{color:#747d87;font-size:12.5px!important;font-weight:520!important}.od-entry-body .top1000,.od-entry-body .jumplinks{margin-top:7px;color:#8b939c;font-size:11.5px}.od-entry-body .partOfSpeechTitle{margin:18px 0 8px!important;font-size:12px!important;line-height:1.4!important}.od-entry-body .partOfSpeech{display:inline-flex;padding:2px 7px;border-radius:5px;background:#f1f3f5;color:#4f5964;font-weight:700}.od-entry-body .senseGroup{margin:0 0 17px}.od-entry-body .sense{position:relative;margin:0!important;padding:0 0 0 25px;line-height:1.68}.od-entry-body .sense+.sense{margin-top:13px!important}.od-entry-body .iteration{position:absolute;left:0;top:.05em;min-width:18px;color:#8a929b;font-size:11.5px;font-weight:720;font-variant-numeric:tabular-nums}.od-entry-body .definition{color:#232a31;font-size:14px;font-weight:620}.od-entry-body .exampleGroup{display:block;margin:5px 0 0}.od-entry-body .transivityStatement{color:#8a929b;font-size:11.5px}.od-entry-body em.example{color:#5f6872;font-size:13px}.od-entry-body .moreInformation{margin:10px 0 0}.od-entry-body .moreInformationExemples{display:inline-block;margin-bottom:5px;color:#7f8892;font-size:11px;font-weight:650}.od-entry-body ul.sentence_dictionary{margin:3px 0 0!important;padding-left:17px!important}.od-entry-body li.sentence{margin:4px 0!important;color:#636d77;font-size:12.5px;line-height:1.55}.od-entry-body .entrySynList,.od-entry-body [class*="SynList"]{margin:10px 0 0;padding:8px 10px;border-radius:6px;background:#f7f8f9;color:#535d67}.od-entry-body .subEntryBlock,.od-entry-body .derivatives{margin-top:19px;padding-top:12px;border-top:1px solid #eceef0}.od-entry-body .subEntryBlock h2,.od-entry-body .derivatives h2{font-size:12.5px!important;color:#4b555f!important}.od-entry-body .entryContent{min-width:0}
    `;
    shadow.innerHTML = `<style>${reset}</style><div class="od-entry-body">${bodyHtml}</div>`;

    // Keep rich dictionary pages responsive inside a narrow lookup card without
    // overriding their typography. This compatibility layer intentionally comes
    // after sidecar CSS in cascade order and only constrains layout/interactions.
    const compatStyle = document.createElement("style");
    compatStyle.className = "jijian-mdict-compat";
    compatStyle.textContent = `
      .od-entry-body,.od-entry-body .entryContainer,.od-entry-body .entryPageContent,.od-entry-body .responsive_cell_center_plus_left,.od-entry-body .responsive_row,.od-entry-body .responsive_cell{max-width:100%!important;width:100%!important;min-width:0!important;margin-left:0!important;margin-right:0!important}
      .od-entry-body .entryContent{max-width:100%!important;min-width:0!important;overflow:visible!important}
      .od-entry-body .navigation{position:static!important;top:auto!important;z-index:auto!important;background:transparent!important;backdrop-filter:none!important;padding-top:2px!important}
      .od-entry-body [data-mdict-sound]{display:inline-grid!important;place-items:center!important;width:24px!important;height:24px!important;margin-left:4px!important;border:1px solid rgba(31,41,55,.10)!important;border-radius:6px!important;background:#fff!important;background-image:none!important;color:#65707c!important;vertical-align:middle!important;cursor:pointer!important;text-decoration:none!important;overflow:hidden!important}
      .od-entry-body [data-mdict-sound]:hover{background:#f3f5f7!important;color:#2f3740!important}
      .od-entry-body [data-mdict-sound]::before,.od-entry-body [data-mdict-sound]::after{display:none!important;content:none!important}.od-entry-body [data-mdict-sound] svg{width:14px!important;height:14px!important;fill:none!important;stroke:currentColor!important;stroke-width:1.8!important;stroke-linecap:round!important;stroke-linejoin:round!important}
      .od-entry-body .navigation{display:flex!important;align-items:center!important;gap:4px!important;overflow-x:auto!important;scrollbar-width:none!important;margin:0 0 14px!important;border:0!important;padding:2px 0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}
      .od-entry-body .navigationItem{display:inline-flex!important;align-items:center!important;min-height:27px!important;padding:0 9px!important;border:0!important;border-radius:5px!important;background:transparent!important;color:#737d88!important;font:590 11.5px/1 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif!important;white-space:nowrap!important;flex:0 0 auto!important;box-shadow:none!important}
      .od-entry-body .navigationItem:hover{background:#f2f3f4!important;color:#30363d!important}
      .od-entry-body .navigationItem.mdict-native-nav-active{color:#fff!important;border:0!important;background:#17191c!important;box-shadow:none!important;font-weight:700!important}
      .od-entry-body .entryHeader{margin-bottom:18px!important}.od-entry-body .definitionOf{margin:0 0 5px!important;color:#9299a2!important;font-size:11.5px!important}.od-entry-body .pageTitle{margin:0!important;line-height:1.2!important}.od-entry-body .realTitle{font-size:25px!important;letter-spacing:-.02em!important}
      .od-entry-body .partOfSpeechTitle{margin:18px 0 9px!important}.od-entry-body .partOfSpeech{display:inline-flex!important;align-items:center!important;min-height:23px!important;padding:2px 7px!important;border-radius:5px!important;background:#f1f3f5!important;color:#56606b!important;font-size:11.5px!important;font-weight:700!important}
      .od-entry-body .sense{margin-bottom:11px!important}.od-entry-body .definition{color:#252c34!important;line-height:1.65!important}.od-entry-body .exampleGroup{color:#68717c!important}.od-entry-body .transivityStatement{color:#9aa1aa!important}
      .od-entry-body .moreInformation{margin-top:9px!important}.od-entry-body .moreInformationExemples,.od-entry-body .entrySynMore,.od-entry-body .jumplink{cursor:pointer!important;text-decoration:none!important;color:#737d88!important;font-size:11.5px!important;font-weight:650!important}
      .od-entry-body .moreInformationExemples:hover,.od-entry-body .entrySynMore:hover,.od-entry-body .jumplink:hover{color:#303943!important}
      .od-entry-body .moreInformationExemples::after{content:"  ›";opacity:.55}.od-entry-body .moreInformationExemples.mdict-expanded::after{content:"  ⌄"}
      .od-entry-body ul.sentence_dictionary{list-style:none!important;padding-left:0!important;margin:8px 0 2px!important}.od-entry-body li.sentence{position:relative!important;padding-left:12px!important;margin:6px 0!important;color:#68717b!important;line-height:1.58!important}.od-entry-body li.sentence::before{content:"";position:absolute;left:1px;top:.72em;width:3px;height:3px;border-radius:50%;background:#c5cad0}
      .od-entry-body .entrySynList,.od-entry-body [class*="SynList"]{padding:9px 10px!important;border-radius:7px!important;background:#f7f8f9!important;color:#555f6a!important;line-height:1.62!important}
      .od-entry-body .mdict-collapsible-section{overflow:visible!important;padding-top:6px!important}.od-entry-body .mdict-collapsible-heading{margin-top:0!important;min-height:36px!important;box-sizing:border-box!important;padding:8px 1px!important;line-height:1.35!important;overflow:visible!important}.od-entry-body .subEntryBlock,.od-entry-body .derivatives{margin-top:22px!important;padding-top:5px!important;border-top:0!important}.od-entry-body .subEntryBlock>h2,.od-entry-body .derivatives>h2{margin:0 0 11px!important;color:#4e5863!important;font-size:12.5px!important;font-weight:760!important;letter-spacing:.01em!important}
      .mdict-back-to-top{position:fixed!important;z-index:2147483647!important;width:30px!important;height:30px!important;padding:5px!important;border:1px solid rgba(17,24,39,.10)!important;border-radius:8px!important;background:rgba(255,255,255,.96)!important;box-shadow:0 4px 14px rgba(15,23,42,.12)!important;display:grid!important;place-items:center!important;opacity:0!important;visibility:hidden!important;pointer-events:none!important;transform:translateY(4px)!important;transition:opacity .15s ease,transform .15s ease,visibility .15s!important;cursor:pointer!important}
      .mdict-back-to-top.is-visible{opacity:1!important;visibility:visible!important;pointer-events:auto!important;transform:none!important}
      .mdict-back-to-top:hover{background:#f4f5f6!important}.mdict-back-to-top img{width:18px!important;height:18px!important;display:block!important;border-radius:5px!important;filter:grayscale(1) contrast(1.18)!important}.mdict-back-to-top span{font:700 15px/1 -apple-system,BlinkMacSystemFont,sans-serif;color:#222831!important}
    `;
    shadow.appendChild(compatStyle);

    shadow.querySelectorAll("[data-mdict-sound]").forEach(sound => {
      sound.setAttribute("aria-label", sound.getAttribute("title") || "播放发音");
      if (!String(sound.textContent || "").trim()) sound.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6.8 8.5H4v7h2.8L11 19V5Z"/><path d="M15 9a4 4 0 0 1 0 6M17.8 6.8a7.3 7.3 0 0 1 0 10.4"/></svg>`;
    });
    enhanceLocalDictionaryNativeNavigation(shadow);
    installLocalDictionaryBackToTop(host, shadow);

    shadow.querySelectorAll("style").forEach(style => { if (!style.textContent.includes(":host{all:initial") && !style.classList.contains("jijian-mdict-compat")) hydrateLocalDictionaryCss(style, dictionaryKey); });
    shadow.querySelectorAll("[data-mdict-css]").forEach(async link => {
      const path = link.getAttribute("data-mdict-css");
      const dataUrl = await requestLocalDictionaryResource(dictionaryKey, path).catch(() => "");
      if (!dataUrl || !host.isConnected) {
        const note = document.createElement("div");
        note.className = "mdict-css-warning";
        note.textContent = `缺少词典样式文件：${path}。建议在设置中用“添加文件夹（推荐）”接入整个词典目录。`;
        link.replaceWith(note);
        return;
      }
      try {
        let css = await fetch(dataUrl).then(r => r.text());
        const style = document.createElement("style"); style.textContent = css; link.replaceWith(style);
        hydrateLocalDictionaryCss(style, dictionaryKey, path);
      } catch (_) {
        const note = document.createElement("div"); note.className="mdict-css-warning"; note.textContent=`无法读取词典样式：${path}`; link.replaceWith(note);
      }
    });
    shadow.querySelectorAll("[data-mdict-resource]").forEach(async el => {
      const path = el.getAttribute("data-mdict-resource");
      const dataUrl = await requestLocalDictionaryResource(dictionaryKey, path).catch(() => "");
      if (dataUrl && el.isConnected) { el.src = dataUrl; el.classList.remove("dict-local-resource-pending"); }
      else el.remove();
    });
    shadow.addEventListener("click", e => {
      const sound = e.target.closest?.("[data-mdict-sound]");
      if (sound) {
        e.preventDefault(); e.stopPropagation();
        const path = sound.getAttribute("data-mdict-sound");
        const remoteFallback = String(sound.getAttribute("data-href") || "").trim();
        sound.setAttribute("aria-busy", "true");
        requestLocalDictionaryResource(dictionaryKey, path).catch(() => "").then(dataUrl => {
          const src = dataUrl || (/^https?:\/\//i.test(remoteFallback) ? remoteFallback : "");
          if (!src) return;
          const audio = new Audio(src);
          audio.play().catch(() => {});
        }).finally(() => sound.removeAttribute("aria-busy"));
        return;
      }
      const wordEl = e.target.closest?.("[data-dict-word]");
      if (wordEl) {
        e.preventDefault();
        const word = wordEl.getAttribute("data-dict-word")?.trim();
        if (word) showSelectionCardCentered(word);
      }
    });
  }

  function mountLocalDictionaryStatus(contentEl, data) {
    if (!contentEl) return;
    const entries = Array.isArray(data?.localDictionaryEntries) ? data.localDictionaryEntries : [];
    if (entries.length) return;
    const enabledCount = Number(data?.localDictionaryEnabledCount || 0);
    const errors = Array.isArray(data?.localDictionaryErrors) ? data.localDictionaryErrors : [];
    if (!enabledCount) return;
    const note = document.createElement("div");
    note.className = "dict-local-status-note";
    if (data?.localDictionaryPermission === false) {
      note.innerHTML = `<span>本地词典读取权限已失效，请在设置里点“重新授权”</span><button type="button" data-open-local-dict>去设置</button>`;
    } else if (errors.length) {
      const first = errors[0];
      note.innerHTML = `<span>${escapeHtml(first.dictionaryName || "本地词典")}：${escapeHtml(first.message || "读取失败")}</span><button type="button" data-open-local-dict>检查词典</button>`;
    } else {
      return;
    }
    const anchor = contentEl.querySelector(".dict-brief-section, .dict-cross-section, .dict-form-note");
    if (anchor) anchor.insertAdjacentElement("afterend", note); else contentEl.prepend(note);
    note.querySelector("[data-open-local-dict]")?.addEventListener("click", () => {
      try { chrome.runtime.sendMessage({ action:"OPEN_OPTIONS_PAGE" }).catch(()=>{}); } catch (_) {}
    });
  }

  function openLocalDictionaryPage(contentEl, entries, initialIndex = 0) {
    const card = contentEl?.closest?.(".raccoon-dict-card");
    const localEntries = Array.isArray(entries) ? entries.filter(Boolean) : [];
    if (!card || !localEntries.length) return;
    card.querySelector(".dict-local-page-view")?.remove();
    card.classList.add("dict-local-page-open");
    const page = document.createElement("section");
    page.className = "dict-local-page-view";
    const render = (index) => {
      const entry = localEntries[index] || localEntries[0];
      page.innerHTML = `<div class="dict-local-page-head">
        <button type="button" class="dict-local-page-back" aria-label="返回查词结果"><svg viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg><span>返回</span></button>
        <div class="dict-local-page-title"><strong>${escapeHtml(entry.dictionaryName || "本地词典")}</strong><span>${escapeHtml(entry.matchedWord || "")}</span></div>
        <button type="button" class="dict-local-page-close" aria-label="关闭"><svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
      </div>
      ${localEntries.length > 1 ? `<div class="dict-local-page-tabs" role="tablist" aria-label="切换完整词典">${localEntries.map((x,i)=>`<button type="button" role="tab" aria-selected="${i===index?'true':'false'}" tabindex="${i===index?'0':'-1'}" data-local-page-index="${i}" class="${i===index?'active':''}">${escapeHtml(x.dictionaryName || `词典 ${i+1}`)}</button>`).join("")}</div>` : ""}
      <div class="dict-local-page-body"><div class="dict-local-page-shadow"></div></div>`;
      const host = page.querySelector(".dict-local-page-shadow");
      attachLocalDictionaryShadow(host, entry);
      const closePage = () => { page.remove(); card.classList.remove("dict-local-page-open"); };
      page.querySelector(".dict-local-page-back")?.addEventListener("click", closePage);
      page.querySelector(".dict-local-page-close")?.addEventListener("click", closePage);
      page.querySelectorAll("[data-local-page-index]").forEach(btn=>{
        btn.addEventListener("click",()=>render(Number(btn.dataset.localPageIndex||0)));
        btn.addEventListener("keydown",e=>{
          if (!["ArrowLeft","ArrowRight","Home","End"].includes(e.key)) return;
          e.preventDefault();
          const buttons=Array.from(page.querySelectorAll("[data-local-page-index]"));
          const idx=buttons.indexOf(btn);
          const nextIdx=e.key==="Home"?0:e.key==="End"?buttons.length-1:(idx+(e.key==="ArrowRight"?1:-1)+buttons.length)%buttons.length;
          render(nextIdx);
          requestAnimationFrame(()=>page.querySelector(`[data-local-page-index="${nextIdx}"]`)?.focus());
        });
      });
    };
    card.appendChild(page);
    render(Math.max(0, Math.min(localEntries.length-1, Number(initialIndex)||0)));
    requestAnimationFrame(() => {
      const rect = card.getBoundingClientRect(); const safe = 10;
      if (rect.right > window.innerWidth - safe) card.style.setProperty("left", `${Math.max(safe, window.innerWidth - rect.width - safe)}px`, "important");
      if (rect.bottom > window.innerHeight - safe) card.style.setProperty("top", `${Math.max(safe, window.innerHeight - rect.height - safe)}px`, "important");
    });
  }

  function mountLocalDictionaryEntries(contentEl, entries) {
    const localEntries = Array.isArray(entries) ? entries.filter(x => x && (x.html || x.records?.length || x.oversizedPreview)) : [];
    if (!contentEl || !localEntries.length) return;
    const wrap = document.createElement("section");
    wrap.className = "dict-local-dictionaries";

    if (!currentSettings.localDictionaryPriority) {
      wrap.classList.add("dict-local-launcher-wrap");
      wrap.innerHTML = `<div class="dict-local-launcher"><span class="dict-local-launcher-label">本地词典</span><div class="dict-local-launcher-buttons">${localEntries.slice(0,5).map((entry,i)=>`<button type="button" data-local-launch-index="${i}">${escapeHtml(entry.dictionaryName || `词典 ${i+1}`)}</button>`).join("")}</div>${localEntries.length>5?`<button type="button" class="dict-local-launch-more" data-local-launch-index="0">+${localEntries.length-5}</button>`:""}</div>`;
      contentEl.appendChild(wrap);
      wrap.querySelectorAll("[data-local-launch-index]").forEach(btn => btn.addEventListener("click", () => openLocalDictionaryPage(contentEl, localEntries, Number(btn.dataset.localLaunchIndex || 0))));
      return;
    }

    // Priority mode is a flat reading section, not a collapsible card. The title
    // and horizontally scrollable dictionary tabs live on one line; switching tabs
    // never collapses the article or adds decorative divider lines.
    wrap.classList.add("dict-local-priority");
    wrap.innerHTML = `<div class="dict-local-priority-head">
      <span class="dict-local-main-title">本地词典</span>
      <div class="dict-local-tabs" role="tablist" aria-label="切换本地词典">${localEntries.map((entry,i)=>`<button type="button" class="dict-local-tab ${i===0?'active':''}" data-local-index="${i}" role="tab" tabindex="${i===0?'0':'-1'}" aria-selected="${i===0?'true':'false'}" aria-controls="dict-local-panel-${i}">${escapeHtml(entry.dictionaryName || `词典 ${i+1}`)}</button>`).join("")}</div>
      <button type="button" class="dict-local-open-page" title="打开完整词典"><span>完整</span><svg viewBox="0 0 20 20"><path d="M7 13 13 7M8 7h5v5"/></svg></button>
    </div>
    <div class="dict-local-panels">${localEntries.map((entry,i)=>`<div class="dict-local-panel ${i===0?'active':''}" id="dict-local-panel-${i}" role="tabpanel" data-local-panel="${i}" ${i===0?'':'hidden'}><div class="dict-local-shadow-host"></div></div>`).join("")}</div>`;
    const form=contentEl.querySelector(".dict-form-note");
    if(form) form.after(wrap); else contentEl.prepend(wrap);

    const mountAt = index => {
      const panel = wrap.querySelector(`[data-local-panel="${index}"]`);
      const host = panel?.querySelector(".dict-local-shadow-host");
      if (host) attachLocalDictionaryShadow(host, localEntries[index]);
    };
    const activate = index => {
      wrap.querySelectorAll(".dict-local-tab").forEach((btn,i) => {
        const active=i===index; btn.classList.toggle("active",active); btn.setAttribute("aria-selected",String(active)); btn.tabIndex=active?0:-1;
      });
      wrap.querySelectorAll(".dict-local-panel").forEach((panel,i)=>{ const active=i===index; panel.classList.toggle("active",active); panel.hidden=!active; });
      mountAt(index);
      const activeBtn=wrap.querySelector(`.dict-local-tab[data-local-index="${index}"]`);
      activeBtn?.scrollIntoView({block:"nearest",inline:"nearest",behavior:"smooth"});
    };
    mountAt(0);
    wrap.querySelectorAll(".dict-local-tab").forEach(btn=>{
      btn.addEventListener("click",()=>activate(Number(btn.dataset.localIndex||0)));
      btn.addEventListener("keydown",e=>{
        if (!["ArrowLeft","ArrowRight","Home","End"].includes(e.key)) return;
        e.preventDefault();
        const buttons=Array.from(wrap.querySelectorAll(".dict-local-tab"));
        const idx=buttons.indexOf(btn);
        const nextIdx=e.key==="Home"?0:e.key==="End"?buttons.length-1:(idx+(e.key==="ArrowRight"?1:-1)+buttons.length)%buttons.length;
        activate(nextIdx); buttons[nextIdx]?.focus?.();
      });
    });
    wrap.querySelector(".dict-local-open-page")?.addEventListener("click",()=>{
      const active=wrap.querySelector(".dict-local-tab.active");
      openLocalDictionaryPage(contentEl, localEntries, Number(active?.dataset.localIndex||0));
    });
  }

  function renderDictionaryAiMarkdown(markdown) {
    const lines = String(markdown || "").split(/\r?\n/);
    let html = "";
    let inCode = false;
    let codeLines = [];
    const listStack = [];
    const orderedListNext = new Map();
    const inline = value => escapeHtml(value)
      .replace(/`([^`]+?)`/g, "<code>$1</code>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/__(.+?)__/g, "<strong>$1</strong>")
      .replace(/~~(.+?)~~/g, "<del>$1</del>")
      .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>");
    const closeListLevel = () => {
      const top = listStack[listStack.length - 1];
      if (!top) return;
      if (top.liOpen) html += "</li>";
      html += `</${top.tag}>`;
      listStack.pop();
    };
    const closeLists = () => { while (listStack.length) closeListLevel(); };
    const openList = (indent, tag, start = 1) => {
      html += `<${tag}${tag === "ol" && start > 1 ? ` start="${start}"` : ""} class="dict-ai-list dict-ai-${tag}">`;
      listStack.push({ indent, tag, liOpen:false, nextNumber:start });
    };
    const addListItem = (indent, tag, text, markerNumber = 1) => {
      const nextStart = () => tag === "ol" ? Math.max(markerNumber, orderedListNext.get(indent) || markerNumber) : 1;
      if (!listStack.length) openList(indent, tag, nextStart());
      while (listStack.length && indent < listStack[listStack.length - 1].indent) closeListLevel();
      if (!listStack.length) openList(indent, tag, nextStart());
      let top = listStack[listStack.length - 1];
      if (indent > top.indent) {
        openList(indent, tag, nextStart());
        top = listStack[listStack.length - 1];
      } else if (top.tag !== tag) {
        closeListLevel();
        openList(indent, tag, nextStart());
        top = listStack[listStack.length - 1];
      } else if (top.liOpen) {
        html += "</li>";
        top.liOpen = false;
      }
      html += `<li>${inline(text)}`;
      top.liOpen = true;
      if (tag === "ol") {
        orderedListNext.set(indent, top.nextNumber + 1);
        top.nextNumber += 1;
      }
    };
    lines.forEach(raw => {
      const line = raw.trim();
      if (/^```/.test(line)) {
        closeLists();
        if (inCode) {
          html += `<pre class="dict-ai-code-block"><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`;
          codeLines = [];
          inCode = false;
        } else {
          inCode = true;
        }
        return;
      }
      if (inCode) { codeLines.push(raw); return; }
      if (!line) {
        closeLists();
        return;
      }
      const listItem = raw.match(/^([ \t]*)([-+*]|\d+[.)])\s+(.+)$/);
      if (listItem) {
        const indent = listItem[1].replace(/\t/g, "    ").length;
        const ordered = /^\d/.test(listItem[2]);
        addListItem(indent, ordered ? "ol" : "ul", listItem[3].trim(), ordered ? Number.parseInt(listItem[2], 10) || 1 : 1);
        return;
      }
      closeLists();
      if (/^#{1,4}\s+/.test(line)) {
        const headingText = line.replace(/^#{1,4}\s+/, "").trim();
        if (/^(?:回答|答案|Answer)$/i.test(headingText)) return;
        html += `<div class="dict-ai-subheading">${inline(headingText)}</div>`;
      } else if (/^>\s?/.test(line)) {
        html += `<blockquote class="dict-ai-quote">${inline(line.replace(/^>\s?/, ""))}</blockquote>`;
      } else if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(line)) {
        html += `<hr class="dict-ai-rule">`;
      } else {
        const indent = Math.min(4, Math.floor(raw.match(/^[ \t]*/)?.[0].replace(/\t/g, "    ").length / 2));
        html += `<div class="dict-ai-paragraph${indent ? ` dict-ai-indent-${indent}` : ""}">${inline(line)}</div>`;
      }
    });
    closeLists();
    if (inCode) html += `<pre class="dict-ai-code-block"><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`;
    return html;
  }

  function renderDictionaryAiBubbleSections(markdown) {
    const sections=[];
    let current={title:"",lines:[]};
    let inCodeFence=false;
    const flush=()=>{
      if(current.title||current.lines.some(line=>line.trim()))sections.push(current);
      current={title:"",lines:[]};
    };
    String(markdown||"").split(/\r?\n/).forEach(raw=>{
      const line=raw.trim();
      if(/^```/.test(line)){
        inCodeFence=!inCodeFence;
        current.lines.push(raw);
        return;
      }
      if(inCodeFence){current.lines.push(raw);return;}
      const markdownHeading=line.match(/^#{1,4}\s+(.+)$/);
      const numberedBoldCandidate=raw===raw.trimStart()?line.match(/^(?:\d+[.)]\s*)?\*\*([^*]{1,28})\*\*\s*[:：]\s*(.*)$/):null;
      const numberedBold=numberedBoldCandidate&&/^(?:语境理解|此处义|核心义|含义|释义|读音(?:\s*\/\s*原形\s*\/\s*词性)?|原形|词性|常用义|义项|语感(?:与搭配)?|搭配|用法|辨析|例句|示例|结构|句子结构|语法|关键词|重点词语|表达扩展)$/i.test(numberedBoldCandidate[1].trim())?numberedBoldCandidate:null;
      const heading=markdownHeading||numberedBold;
      if(heading){
        flush();
        current.title=String(heading[1]||"").replace(/^\*+|\*+$/g,"").trim();
        if(/^AI\s*补充$/i.test(current.title))current.title="";
        const inlineText=String(heading[2]||"").trim();
        if(inlineText)current.lines.push(inlineText);
        return;
      }
      current.lines.push(raw);
    });
    flush();
    if(!sections.length)sections.push({title:"",lines:[String(markdown||"")]});

    const sectionEmoji=title=>{
      if(currentSettings.dictionaryAiEmojiLevel === "none")return "";
      if(/[\p{Extended_Pictographic}]/u.test(title))return "";
      if(/此处义|核心义|含义|释义/.test(title))return "🧭";
      if(/读音|原形|词性|发音/.test(title))return "🔤";
      if(/常用义|义项/.test(title))return "📚";
      if(/语感|搭配|用法|辨析/.test(title))return "✨";
      if(/例句|示例/.test(title))return "💬";
      if(/结构|句子/.test(title))return "🧩";
      if(/语法/.test(title))return "🧠";
      if(/关键词|重点/.test(title))return "🔎";
      return "•";
    };
    return `<div class="dict-ai-response-stack">${sections.map(section=>{
      const title=section.title.trim();
      const icon=title?sectionEmoji(title):"";
      const body=renderDictionaryAiMarkdown(section.lines.join("\n").trim());
      return `<div class="dict-ai-answer-bubble">${title?`<div class="dict-ai-section-label">${icon?`${icon} `:""}${escapeHtml(title)}</div>`:""}${body}</div>`;
    }).join("")}</div>`;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

})();
