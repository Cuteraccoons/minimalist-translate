(() => {
  const TOTAL_CASES = 180;
  const surfaces = ["light", "dark", "gradient-dark", "gradient-light", "color-dark", "transparent"];
  const layouts = ["normal", "flex", "grid", "float", "narrow"];
  const structures = ["links", "heading", "nested-list", "icon-nav", "semantic-heading", "media-card"];
  const matrix = document.getElementById("matrix");
  const inlineTableImage = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="44" height="28" viewBox="0 0 44 28"><rect width="44" height="28" rx="3" fill="#d9e8de"/><circle cx="14" cy="14" r="7" fill="#fff"/></svg>')}`;

  const maintenanceNotice = document.createElement("table");
  maintenanceNotice.className = "box-Expand_language metadata ambox ambox-notice";
  maintenanceNotice.setAttribute("role", "presentation");
  maintenanceNotice.innerHTML = `<tbody><tr><td><ul><li>Machine translation maintenance notice should not appear in reader mode.</li><li>Editors must compare the translated article with its original source.</li></ul></td></tr></tbody>`;
  matrix.appendChild(maintenanceNotice);

  const informationTable = document.createElement("table");
  informationTable.className = "infobox fixture-information-table";
  informationTable.innerHTML = `<caption>Field research profile</caption><tbody><tr><th>Region</th><td><img src="${inlineTableImage}" width="44" height="28" alt="Regional flag"> Coastal communities</td></tr><tr><th>Method</th><td>Participant observation and archival comparison</td></tr><tr><th>Period</th><td>2022–2026</td></tr></tbody>`;
  matrix.appendChild(informationTable);

  const comparisonTable = document.createElement("table");
  comparisonTable.className = "fixture-comparison-table";
  comparisonTable.innerHTML = `<caption>Comparative fieldwork matrix</caption><thead><tr><th rowspan="2">Site</th><th colspan="2">Observation</th><th rowspan="2">Archive</th></tr><tr><th>Duration</th><th>Participants</th></tr></thead><tbody><tr><td>Harbour</td><td>18 months</td><td>42 households</td><td>Municipal records</td></tr><tr><td>Island</td><td>9 months</td><td>17 households</td><td>Oral histories</td></tr><tr><td>Market</td><td>6 months</td><td>68 vendors</td><td>Trade ledgers</td></tr></tbody>`;
  matrix.appendChild(comparisonTable);

  const svgData = (width, height, fill, label) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" rx="18" fill="${fill}"/><circle cx="${Math.round(width * .28)}" cy="${Math.round(height * .36)}" r="${Math.round(Math.min(width,height) * .13)}" fill="rgba(255,255,255,.7)"/><text x="50%" y="72%" text-anchor="middle" font-family="sans-serif" font-size="${Math.round(Math.min(width,height) * .12)}" fill="#344054">${label}</text></svg>`)}`;
  const mediaWallFigure = document.createElement("figure");
  mediaWallFigure.className = "fixture-media-wall";
  mediaWallFigure.innerHTML = `<img src="${svgData(520,300,"#d9e8de","Landscape")}" width="520" height="300" alt="Landscape field site"><img src="${svgData(260,430,"#e8dfd3","Portrait")}" width="260" height="430" alt="Portrait archive sample"><img src="${svgData(420,420,"#dce2ef","Square")}" width="420" height="420" alt="Square material sample"><figcaption>Three source images retain their natural aspect ratios in the reader media wall.</figcaption>`;
  matrix.appendChild(mediaWallFigure);

  const disclosure = document.createElement("details");
  disclosure.className = "fixture-disclosure";
  disclosure.innerHTML = `<summary>Methodological note</summary><p>Interview dates were normalized before comparison, while the original archive references remain available for verification.</p>`;
  matrix.appendChild(disclosure);

  const definitions = document.createElement("dl");
  definitions.className = "fixture-definitions";
  definitions.innerHTML = `<dt>Participant observation</dt><dd>A method that combines everyday participation with systematic field notes.</dd><dt>Triangulation</dt><dd>Comparing several kinds of evidence before reaching an interpretation.</dd>`;
  matrix.appendChild(definitions);
  matrix.appendChild(document.createElement("hr"));

  const prose = [
    "Researchers compare social relationships across cities while preserving links to primary sources and supporting evidence.",
    "A readable translation should remain visually paired with its original paragraph without covering the next line of text.",
    "Navigation labels, icons, cards, tables, and floating media all impose different constraints on bilingual page layout.",
    "Dynamic websites may hide a loading placeholder before an asynchronous translation response returns to the browser."
  ];

  for (let index = 0; index < TOTAL_CASES; index += 1) {
    const surface = surfaces[index % surfaces.length];
    const layout = layouts[Math.floor(index / surfaces.length) % layouts.length];
    const structure = structures[Math.floor(index / (surfaces.length * layouts.length)) % structures.length];
    const card = document.createElement("section");
    card.className = `fixture-case surface-${surface} layout-${layout}`;
    card.dataset.fixtureId = String(index + 1);
    card.dataset.surfaceTone = /dark/.test(surface) ? "dark" : "light";
    card.dataset.layout = layout;
    card.dataset.structure = structure;

    const media = document.createElement("div");
    media.className = "fixture-media";
    media.textContent = "media";
    card.appendChild(media);

    if (index % 24 === 0) {
      const animated = document.createElement("img");
      animated.className = "fixture-reader-image";
      animated.src = "data:image/gif;base64,R0lGODlhAgACAIAAAAAAAP///yH5BAEAAAAALAAAAAACAAIAAAIDhI9WADs=";
      animated.alt = "Animated research diagram";
      animated.width = 240;
      animated.height = 140;
      card.appendChild(animated);
    }
    if (index % 24 === 1) {
      const figure = document.createElement("figure");
      figure.className = "fixture-table-figure";
      figure.innerHTML = `<div class="fixture-figure-surface" aria-hidden="true">figure</div><figcaption>A table-caption description must keep its translated text inside the figure caption.</figcaption>`;
      card.appendChild(figure);
    }
    if (index === 2) {
      const quote = document.createElement("blockquote");
      quote.textContent = "A quoted observation should remain visibly distinct from the surrounding article prose.";
      card.appendChild(quote);
    }
    if (index === 3) {
      const code = document.createElement("pre");
      code.textContent = "const reading = true;\nconsole.log(reading);";
      card.appendChild(code);
    }
    if (index === 4) {
      const video = document.createElement("video");
      video.controls = true;
      video.width = 640;
      video.height = 360;
      video.poster = svgData(640, 360, "#dce7df", "Video");
      video.src = "data:video/mp4;base64,AAAA";
      video.setAttribute("aria-label", "Embedded fieldwork recording");
      card.appendChild(video);
    }

    if (structure === "heading") {
      const heading = document.createElement("h3");
      heading.className = "fixture-source";
      heading.textContent = `A resilient heading in layout case ${index + 1}`;
      card.appendChild(heading);
    } else if (structure === "semantic-heading") {
      const heading = document.createElement("div");
      heading.className = "fixture-source";
      heading.setAttribute("role", "heading");
      heading.setAttribute("aria-level", String(2 + (index % 4)));
      heading.textContent = `A semantic heading with a long descriptive label for layout case ${index + 1}`;
      card.appendChild(heading);
    } else if (structure === "media-card") {
      const article = document.createElement("article");
      article.className = "fixture-linked-media-card";
      article.innerHTML = `<p class="fixture-source"><strong>Visual archive ${index + 1}</strong><br><span>Captions, links, and proportional media remain attached to their article block.</span></p>`;
      card.appendChild(article);
    } else if (structure === "nested-list") {
      const list = document.createElement("ul");
      list.className = "case-list";
      list.innerHTML = `<li>Primary research topic<ul><li class="fixture-source">Detailed evidence remains readable inside a nested list without duplicate parent translation.</li></ul></li>`;
      card.appendChild(list);
    } else {
      const paragraph = document.createElement("p");
      paragraph.className = "fixture-source";
      paragraph.innerHTML = `${prose[index % prose.length]} Read the <a href="#case-${index + 1}">linked reference</a> for more context.`;
      card.appendChild(paragraph);
    }

    if (structure === "icon-nav" || index % 7 === 0) {
      const nav = document.createElement("nav");
      nav.className = `case-nav ${index % 2 ? "vertical" : ""} ${index % 3 ? "" : "clipped"} ${index % 5 ? "" : "narrow"}`;
      nav.setAttribute("aria-label", `Case ${index + 1} controls`);
      nav.innerHTML = `<a href="#one"><span class="fixture-icon" aria-hidden="true">◆</span><span>Latest research</span></a><a href="#two"><span class="fixture-icon" aria-hidden="true">●</span><span>Learning resources</span></a>`;
      card.appendChild(nav);
    }
    const typographySource = card.querySelector(".fixture-source");
    if (typographySource && index % 10 === 0) typographySource.style.textAlign = "center";
    if (typographySource && index % 11 === 0) typographySource.style.fontWeight = "700";
    matrix.appendChild(card);
  }

  requestAnimationFrame(() => {
    document.querySelectorAll(".case-nav a,.fixture-header a").forEach(node => {
      const rect = node.getBoundingClientRect();
      node.dataset.fixtureInitialWidth = rect.width.toFixed(2);
      node.dataset.fixtureInitialHeight = rect.height.toFixed(2);
      const icon = node.querySelector(".fixture-icon")?.getBoundingClientRect();
      if (icon) node.dataset.fixtureIconWidth = icon.width.toFixed(2);
    });
    const flexSource = document.querySelector(".fixture-flex-source");
    if (flexSource) flexSource.dataset.fixtureInitialWidth = flexSource.getBoundingClientRect().width.toFixed(2);
    const richMedia = document.querySelector(".fixture-rich-media");
    if (richMedia) richMedia.dataset.fixtureInitialWidth = richMedia.getBoundingClientRect().width.toFixed(2);
    document.documentElement.dataset.fixtureReady = String(TOTAL_CASES);
    document.documentElement.dataset.fixtureLinkCount = String(document.querySelectorAll("a[href]").length);
  });

  window.runBilingualLayoutAudit = () => {
    const translated = Array.from(document.querySelectorAll(".raccoon-translated-block,.raccoon-translated-inline"));
    const report = { cases:TOTAL_CASES, translated:translated.length, missing:0, overlaps:0, lowContrast:0, overflow:0, iconDrift:0, squeezedRows:0, richControlDamage:0, richLinkedMissing:0, proseLinkDamage:0, hiddenTocMissing:0, tocNumberDamage:0, alignmentMismatch:0, emphasisMismatch:0 };
    translated.forEach(node => {
      const sourceId = node.dataset.raccoonSourceId;
      const source = sourceId ? document.querySelector(`[data-raccoon-id="${CSS.escape(sourceId)}"]`) : null;
      if (source && !source.contains(node)) {
        const sourceRect = source.getBoundingClientRect();
        const translatedRect = node.getBoundingClientRect();
        const horizontalIntersection = Math.min(sourceRect.right, translatedRect.right) - Math.max(sourceRect.left, translatedRect.left);
        if (horizontalIntersection > 1 && translatedRect.top - sourceRect.bottom < -.5) report.overlaps += 1;
      }
      if(source){
        const sourceStyle=getComputedStyle(source),translatedStyle=getComputedStyle(node);
        if(sourceStyle.textAlign==="center"&&translatedStyle.textAlign!=="center")report.alignmentMismatch+=1;
        if(Number.parseInt(sourceStyle.fontWeight,10)>=600&&Number.parseInt(translatedStyle.fontWeight,10)<600)report.emphasisMismatch+=1;
      }
      const card = node.closest(".fixture-case");
      if (card) {
        const rgb = getComputedStyle(node).color.match(/[\d.]+/g)?.map(Number) || [];
        const luminance = rgb.length >= 3 ? (.2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2]) / 255 : null;
        if ((card.dataset.surfaceTone === "dark" && luminance < .58) || (card.dataset.surfaceTone === "light" && luminance > .52)) report.lowContrast += 1;
      }
      if (node.scrollWidth > node.clientWidth + 2) report.overflow += 1;
    });
    document.querySelectorAll(".fixture-source,.fixture-table-figure figcaption").forEach(source => {
      const inside = source.querySelector(".raccoon-translated-block,.raccoon-translated-inline");
      const sibling = source.nextElementSibling?.matches(".raccoon-translated-block,.raccoon-translated-inline");
      if (!inside && !sibling && !source.classList.contains("raccoon-ui-translated")) report.missing += 1;
    });
    document.querySelectorAll(".case-nav a,.fixture-header a").forEach(link => {
      const icon = link.querySelector(".fixture-icon");
      if (icon && Math.abs(icon.getBoundingClientRect().width - Number(link.dataset.fixtureIconWidth)) > .75) report.iconDrift += 1;
    });
    const flexSource = document.querySelector(".fixture-flex-source");
    if (flexSource && flexSource.getBoundingClientRect().width < Number(flexSource.dataset.fixtureInitialWidth) * .78) report.squeezedRows += 1;
    const richCard = document.querySelector(".fixture-rich-card");
    const richMedia = richCard?.querySelector(".fixture-rich-media");
    if (richCard?.classList.contains("raccoon-ui-translated") || (richMedia && Math.abs(richMedia.getBoundingClientRect().width - Number(richMedia.dataset.fixtureInitialWidth)) > .75)) report.richControlDamage += 1;
    const richTranslation = richCard?.querySelector(".raccoon-linked-card-translation");
    if (!richTranslation || richTranslation.closest("a[href]") !== richCard || !richCard.innerText.includes("Research model card")) report.richLinkedMissing += 1;
    const relatedProse = document.querySelector(".fixture-related-prose");
    const relatedLinks = Array.from(relatedProse?.querySelectorAll("a[href]") || []);
    const relatedTranslation = relatedProse?.querySelector(".raccoon-translated-block,.raccoon-translated-inline") || relatedProse?.nextElementSibling?.matches(".raccoon-translated-block,.raccoon-translated-inline");
    if (relatedLinks.length !== 3 || relatedLinks.some(link => link.classList.contains("raccoon-ui-translated")) || relatedLinks.some(link => /^译文/.test(link.textContent.trim())) || !relatedTranslation) report.proseLinkDamage += 1;
    const hiddenToc = document.querySelector(".fixture-toc-collapsed .vector-toc-link");
    if (hiddenToc && !hiddenToc.classList.contains("raccoon-ui-translated")) report.hiddenTocMissing += 1;
    document.querySelectorAll(".fixture-toc .vector-toc-link").forEach(link => {
      const number = link.querySelector(".vector-toc-numb")?.textContent.trim() || "";
      const label = Array.from(link.querySelectorAll(".vector-toc-text>span:not(.vector-toc-numb)")).map(node => node.textContent.trim()).join(" ");
      if (!number || new RegExp(`^${number.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(label)) report.tocNumberDamage += 1;
    });
    return report;
  };

  window.runReplacementLayoutAudit = () => {
    const report = { cases:TOTAL_CASES, replaced:0, lowContrast:0, overflow:0, italic:0, iconDrift:0, linksChanged:false };
    document.querySelectorAll(".fixture-case .raccoon-replaced-text").forEach(node => {
      report.replaced += 1;
      const card = node.closest(".fixture-case");
      const rgb = getComputedStyle(node).color.match(/[\d.]+/g)?.map(Number) || [];
      const luminance = rgb.length >= 3 ? (.2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2]) / 255 : null;
      if (card && ((card.dataset.surfaceTone === "dark" && luminance < .58) || (card.dataset.surfaceTone === "light" && luminance > .52))) report.lowContrast += 1;
      if (node.scrollWidth > node.clientWidth + 2) report.overflow += 1;
      if (getComputedStyle(node).fontStyle === "italic") report.italic += 1;
    });
    document.querySelectorAll(".case-nav a,.fixture-header a").forEach(link => {
      const icon = link.querySelector(".fixture-icon");
      if (icon && Math.abs(icon.getBoundingClientRect().width - Number(link.dataset.fixtureIconWidth)) > .75) report.iconDrift += 1;
    });
    report.linksChanged = document.querySelectorAll("a[href]").length !== Number(document.documentElement.dataset.fixtureLinkCount);
    return report;
  };
})();
