(async () => {
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const root = document.querySelector('main,[role="main"],#MainContent') || document.body;
  const items = [];
  const seen = new Set();
  let textBudget = 48000;
  const blocked = 'nav,header,footer,[class*="review"],[id*="review"],[class*="recommendation"],form[action*="search"]';
  const add = (kind, text, extra = {}) => {
    text = clean(text);
    if (!text || items.length >= 190 || textBudget < 100) return;
    const fingerprint = `${kind}:${text}`;
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    text = text.slice(0, Math.min(textBudget, kind === 'chart' ? 6500 : 320));
    textBudget -= text.length;
    items.push({ id: `e${items.length + 1}`, kind, text, ...extra });
  };
  const visible = node => !node.closest('[hidden],[aria-hidden="true"],template') &&
    getComputedStyle(node).display !== 'none';
  const visiblyOpen = node => {
    for (let current = node; current?.nodeType === 1; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    }
    return true;
  };
  const unavailable = node => node.matches(':disabled,[aria-disabled="true"],[data-sold-out="true"]') ||
    !!node.closest('[aria-disabled="true"],[data-sold-out="true"],.sold-out,.unavailable') ||
    /sold\s*out|unavailable|out\s*of\s*stock/i.test(node.getAttribute('aria-label') || node.textContent || '') ||
    /sold.?out|unavailable|disabled|strikethrough/i.test(String(node.className?.baseVal || node.className || '')) ||
    getComputedStyle(node).textDecorationLine.includes('line-through');
  const chartHeading = element => {
    for (let node = element; node && node !== root; node = node.parentElement) {
      let sibling = node.previousElementSibling;
      while (sibling) {
        if (/^H[2-6]$/.test(sibling.tagName)) return clean(sibling.textContent);
        sibling = sibling.previousElementSibling;
      }
    }
    return clean(element.closest('section')?.querySelector('h2,h3,h4')?.textContent || '');
  };
  const chartCell = cell => {
    const centimeters = cell.querySelector('[data-unit="cm"]');
    return centimeters ? `${clean(centimeters.textContent)} cm` : clean(cell.innerText || cell.textContent);
  };
  const chartImages = [];
  const imageContainers = '.kiwi-sizing-modal,[role="dialog"][aria-label*="size" i],dialog[aria-label*="size" i],[class*="size-guide"],[class*="size-chart"],[id*="size-guide"],[id*="size-chart"]';
  for (const image of document.querySelectorAll(imageContainers.split(',').map(selector => `${selector} img`).join(','))) {
    if (!visiblyOpen(image) || image.closest('template') || chartImages.length >= 3) continue;
    const context = clean(`${image.alt || ''} ${image.closest(imageContainers)?.textContent || ''}`).slice(0, 240);
    let url;
    try { url = new URL(image.currentSrc || image.src, location.href); } catch { continue; }
    if (url.protocol !== 'https:' || url.username || url.password ||
        chartImages.some(entry => entry.url === url.href)) continue;
    chartImages.push({ url: url.href, context });
  }

  const choices = new Set([...root.querySelectorAll('button,option,label,[role="button"],[role="option"],[role="radio"],[data-size],input[type="radio"]'),
    ...document.querySelectorAll('[role="listbox"] [role="option"]')]);
  for (const node of choices) {
    if (node.closest(blocked) || node.closest('table,[role="table"],[class*="size-guide"],[id*="size-guide"],[class*="size-chart"],[id*="size-chart"]')) continue;
    if (node.closest('product-card,.product-form--quick,[class*="recommended-product"]')) continue;
    if (!visible(node)) continue;
    const label = clean(node.matches('input') ? node.closest('label')?.textContent || node.value : node.matches('option') ? node.value || node.textContent : node.getAttribute('data-size') || node.getAttribute('aria-label') || node.textContent)
      .replace(/\s*(?:sold out|unavailable|out of stock)(?:\s*[-–]\s*notify me)?\s*$/i, '');
    if (!/^(?:W\s*)?\d{1,2}(?:\s*inch)?$|^(?:XXS|XS|S|M|L|XL|XXL)$|^W\s*\d{2}\s*[\/\- ]\s*L\s*\d{2}$|^(?:2[2-9]|3\d|4\d)\s*\/\s*(?:2[6-9]|3\d)$/i.test(label)) continue;
    const parent = node.closest('fieldset,[class*="variant"],[class*="option"],[class*="size"],select') || node.parentElement;
    const context = clean([parent?.getAttribute('aria-label'), parent?.querySelector('legend,label')?.textContent,
      node.closest('select')?.name, parent?.parentElement?.querySelector('h2,h3')?.textContent].filter(Boolean).join(' ')).slice(0, 180);
    const text = clean(`${context} ${node.getAttribute('aria-label') || node.textContent || label} ${unavailable(node) ? 'Sold out' : ''}`);
    add('option', text, { label, context, availability: unavailable(node) ? 'unavailable' : 'available' });
  }

  const chartNodes = new Set([...root.querySelectorAll('table,[role="table"],[role="grid"],[class*="size-chart"],[class*="size-guide"],[id*="size-chart"],[id*="size-guide"]'),
    ...[...document.querySelectorAll('.esc-size-guide--popup table,[role="dialog"] table,dialog table,[aria-modal="true"] table')]
      .filter(node => !root.contains(node) && visiblyOpen(node))]);
  for (const node of chartNodes) {
    if (node.closest(blocked) || node.closest('template')) continue;
    const rows = [...node.querySelectorAll('tr,[role="row"]')].map(row =>
      [...row.querySelectorAll('th,td,[role="cell"],[role="columnheader"],[role="rowheader"]')]
        .map(chartCell).filter(Boolean).join(' | ')).filter(Boolean);
    const text = rows.length >= 2 ? rows.join(' ; ') : clean(node.innerText || node.textContent);
    if (text.length < 20 || !/\b(?:size|waist|hip|inseam|length|thigh)\b/i.test(text)) continue;
    add('chart', text, { context: chartHeading(node) });
  }
  for (const heading of root.querySelectorAll('h2,h3,h4,[role="heading"]')) {
    if (!/\b(?:size chart|size guide|measurements?)\b/i.test(clean(heading.textContent))) continue;
    const section = heading.closest('section,[role="dialog"]') || heading.parentElement;
    if (!section || section.closest(blocked) || !visible(section)) continue;
    const text = clean(section.innerText || section.textContent);
    if (text.length >= 20 && /\b(?:waist|hip|inseam|length|thigh)\b/i.test(text)) add('chart', text);
  }
  const hasRelevantChart = items.some(item => item.kind === 'chart' &&
    /\b(?:apparel|body|jeans?|denim|pants|trousers)\b/i.test(item.context || ''));
  if (!hasRelevantChart) {
    const links = [...root.querySelectorAll('a[href]')].filter(link =>
      /\b(?:size|sizing|measurement)\s*(?:chart|guide|information)?\b/i.test(clean(link.textContent || link.getAttribute('aria-label'))));
    const visited = new Set();
    for (const link of links) {
      if (visited.size >= 2) break;
      let url;
      try { url = new URL(link.href, location.href); } catch { continue; }
      if (url.origin !== location.origin || url.pathname === location.pathname || visited.has(url.href)) continue;
      visited.add(url.href);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1800);
      try {
        const response = await fetch(url.href, { signal: controller.signal });
        if (!response.ok || !/text\/html/i.test(response.headers.get('content-type') || '') ||
            Number(response.headers.get('content-length') || 0) > 500000) continue;
        const guide = new DOMParser().parseFromString(await response.text(), 'text/html');
        for (const table of [...guide.querySelectorAll('table')].slice(0, 8)) {
          const rows = [...table.querySelectorAll('tr')].map(row =>
            [...row.querySelectorAll('th,td')].map(chartCell).filter(Boolean).join(' | ')).filter(Boolean);
          const value = rows.join(' ; ');
          if (rows.length >= 2 && /\b(?:waist|hip|inseam|thigh|leg length)\b/i.test(value))
            add('chart', value, { context: chartHeading(table) || clean(link.textContent), sourceUrl: url.href });
        }
      } catch { /* A linked guide may be unavailable; on-page evidence is still useful. */ }
      finally { clearTimeout(timeout); }
    }
  }
  for (const node of root.querySelectorAll('p,li,dd')) {
    if (node.closest(blocked) || !visible(node)) continue;
    const text = clean(node.innerText || node.textContent);
    if (text.length < 16 || text.length > 300 || !/\b(?:fit|rise|inseam|length|waist|hip|thigh|stretch|size|model|cotton|denim)\b/i.test(text)) continue;
    add('detail', text);
  }
  return { version: 1, host: location.hostname, title: clean(root.querySelector('h1')?.textContent || document.title).slice(0, 180), items, chartImages };
})()
