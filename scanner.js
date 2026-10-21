(async () => {
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const unique = values => [...new Set(values.filter(Boolean))];
  const host = location.hostname.toLowerCase();
  const store = host.includes('levi.com') ? "Levi's" :
    host.includes('uniqlo.com') ? 'UNIQLO' :
    host.includes('motelrocks.com') ? 'Motel Rocks' :
    host.includes('agolde.com') ? 'AGOLDE' : 'Other';
  const root = document.querySelector('main') || document.body;
  const agoldeTitle = store === 'AGOLDE' ? clean(root.querySelector('[id^="ProductInformation-"] .group-block-content.layout-panel-flex--row > div:first-child > div')?.textContent) : '';
  const title = clean(agoldeTitle || root.querySelector('h1')?.textContent ||
    document.querySelector('meta[property="og:title"]')?.content || document.title);
  const imageSource = document.querySelector('meta[property="og:image"]')?.content;
  let image = null;
  if (imageSource) {
    try {
      const imageUrl = new URL(imageSource, location.href);
      if (/^https?:$/.test(imageUrl.protocol)) image = imageUrl.href;
    } catch (error) {
      image = null;
    }
  }

  const sizes = {
    waist: [], length: [], combined: [], other: [],
    unavailable: { waist: [], length: [], combined: [], other: [] }
  };
  const sizePattern = /^(?:W\s*)?(?:2[2-9]|3[0-9]|4[0-9])(?:\s*inch)?$|^(?:XXS|XS|S|M|L|XL|XXL|\d{1,2})$/i;
  const lengthPattern = /^(?:L\s*)?(?:2[6-9]|3[0-8])(?:\s*(?:in|inch))?$/i;
  const combinedPattern = /^W\s*\d{2}\s*[\/\- ]\s*L\s*\d{2}$/i;
  function isUnavailable(control) {
    const elements = [control, ...control.querySelectorAll('*')];
    return control.matches(':disabled,[aria-disabled="true"],[data-sold-out="true"]') ||
      (control.matches('option') && /\bunavailable\b|\bsold out\b/i.test(control.textContent)) ||
      /\bout of stock\b|\bsold out\b|\bunavailable\b/i.test(control.getAttribute('aria-label') || '') ||
      !!control.closest('[aria-disabled="true"],[data-sold-out="true"],.sold-out,.unavailable,.product-button-option__button-item--out-of-stock') ||
      elements.some(element => /sold.?out|out.?of.?stock|unavailable|is-disabled|strikethrough/i.test(element.className?.baseVal || element.className || '') ||
        getComputedStyle(element).textDecorationLine.includes('line-through'));
  }
  // Motel includes hidden fallback selectors and recommendations alongside the
  // main product. Its product form contains the actual orderable variants.
  const optionsRoot = store === 'Motel Rocks' ?
    (root.querySelector('product-form#productForm') || root) :
    store === "Levi's" ? (root.querySelector('#pdp-product-content') || root) : root;
  const controls = optionsRoot.querySelectorAll('button, option, select, input[type="radio"], input[type="checkbox"], label, [role="option"], [role="radio"], [role="checkbox"]');
  for (const control of controls) {
    if (control.closest('table,[class*="size-guide"],[id*="size-guide"]')) continue;
    if (store === 'Motel Rocks' && control.closest('fake-dropdown')) continue;
    if (control.matches('label') && control.closest('.radio__container')?.querySelector('input[type="radio"]')) continue;
    if (control.matches('option')) {
      const select = control.closest('select');
      const kind = clean(select?.name || select?.getAttribute('aria-label') || '');
      const value = clean(control.value);
      if (/\b(?:size|waist)\b/i.test(kind) && sizePattern.test(value)) {
        const target = isUnavailable(control) ? sizes.unavailable : sizes;
        target.waist.push(value);
        continue;
      }
      if (/\b(?:length|inseam|leg)\b/i.test(kind) && lengthPattern.test(value)) {
        const target = isUnavailable(control) ? sizes.unavailable : sizes;
        target.length.push(value);
        continue;
      }
    }
    if (store === "Levi's" && control.matches('button[role="radio"]')) {
      const size = clean(control.getAttribute('aria-label')).match(/^(Waist|Length)\s+(\d{2})\b/i);
      if (size) {
        const target = isUnavailable(control) ? sizes.unavailable : sizes;
        target[size[1].toLowerCase()].push(size[2]);
        continue;
      }
    }
    const inputValue = control.matches('input') ? clean(control.value) : '';
    const label = combinedPattern.test(inputValue) ? inputValue : clean(control.getAttribute('aria-label') || control.getAttribute('data-size') ||
      (control.matches('input') ? control.closest('label')?.textContent : control.textContent));
    if (!label || label.length > 35 || /cart|wishlist|guide|reviews/i.test(label)) continue;
    const context = clean(control.parentElement?.textContent || '').slice(0, 180);
    const unavailable = isUnavailable(control);
    const target = unavailable ? sizes.unavailable : sizes;
    if (combinedPattern.test(label)) target.combined.push(label.replace(/\s+/g, ' '));
    else if (/\binch$/i.test(label) && sizePattern.test(label)) target.waist.push(label);
    else if (sizePattern.test(label)) {
      if (/\b(?:length|inseam|leg)\b/i.test(context) && lengthPattern.test(label)) target.length.push(label);
      else if (/\b(?:waist|size)\b/i.test(context) || store !== 'Other') target.waist.push(label);
    } else if (lengthPattern.test(label) && /\b(?:length|inseam|leg)\b/i.test(context)) target.length.push(label);
  }
  for (const key of ['waist', 'length', 'combined', 'other']) {
    sizes[key] = unique(sizes[key]);
    sizes.unavailable[key] = unique(sizes.unavailable[key]).filter(value => !sizes[key].includes(value));
  }

  let openedGuide = null;
  if (store === "Levi's" && !document.querySelector('[role="dialog"][aria-label="Find Your Size"] table')) {
    const trigger = optionsRoot.querySelector('a.pdp-size-guide__link');
    if (trigger) {
      trigger.click();
      openedGuide = await new Promise(resolve => {
        const findGuide = () => document.querySelector('[role="dialog"][aria-label="Find Your Size"]');
        if (findGuide()?.querySelector('table')) return resolve(findGuide());
        const observer = new MutationObserver(() => {
          if (findGuide()?.querySelector('table')) {
            observer.disconnect();
            resolve(findGuide());
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => { observer.disconnect(); resolve(findGuide()); }, 3500);
      });
    }
  }
  if (store === 'AGOLDE' && !document.querySelector('.kiwi-sizing-modal')) {
    const trigger = optionsRoot.querySelector('.ks-chart-modal-link');
    if (trigger) {
      trigger.click();
      openedGuide = await new Promise(resolve => {
        const findGuide = () => document.querySelector('.kiwi-sizing-modal');
        if (findGuide()?.querySelector('table,img')) return resolve(findGuide());
        const observer = new MutationObserver(() => {
          if (findGuide()?.querySelector('table,img')) {
            observer.disconnect();
            resolve(findGuide());
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => { observer.disconnect(); resolve(findGuide()); }, 3500);
      });
    }
  }

  function nearestHeading(element) {
    let sibling = element.previousElementSibling;
    while (sibling) {
      if (/^H[2-6]$/.test(sibling.tagName)) return clean(sibling.textContent);
      sibling = sibling.previousElementSibling;
    }
    return clean(element.parentElement?.querySelector('h2,h3,h4')?.textContent || 'Size chart');
  }
  const sizeGuides = [];
  let sizeGuideStatus = 'none';
  const seenGuideTables = new Set();
  for (const table of document.querySelectorAll('table')) {
    const originalRows = [...table.querySelectorAll('tr')].map(row =>
      [...row.querySelectorAll('th,td')].map(cell => clean(cell.textContent))).filter(row => row.length);
    let rows = originalRows;
    const caption = clean(table.querySelector('caption')?.textContent);
    if (store === "Levi's" && /Levi's Size/i.test(rows[0]?.[0] || '') && rows[0].length > 2) {
      const fields = rows.slice(1).filter(row => /^(?:Numeric Size|Alpha Size|Your Waist|Your Hip|Your Thigh)/i.test(row[0]));
      const headers = ['Size', ...fields.map(row => row[0])];
      rows = [headers, ...rows[0].slice(1).map((size, index) =>
        [size, ...fields.map(row => row[index + 1] || '')])];
    }
    if (!rows.length) continue;
    const headerText = rows[0].join(' ');
    if (rows.length < 2 || rows[0].length < 2 ||
        !/\b(?:size|waist|hip|inseam|length|thigh|leg|height)\b/i.test(headerText)) continue;
    const hasHeader = !!table.querySelector('th');
    const headers = hasHeader ? rows[0] : [];
    const dataRows = hasHeader ? rows.slice(1) : rows;
    const fingerprint = JSON.stringify([headers, dataRows]);
    if (seenGuideTables.has(fingerprint)) continue;
    seenGuideTables.add(fingerprint);
    let title = caption || nearestHeading(table);
    if (/^size chart$/i.test(title)) {
      const values = dataRows.flat().join(' ');
      if (/\d\s*cm\b/i.test(values)) title += ' · cm';
      else if (/\d\s*(?:"|″|in\b)/i.test(values)) title += ' · inches';
    }
    sizeGuides.push({ title, headers, rows: dataRows });
  }
  if (sizeGuides.length) sizeGuideStatus = 'table';
  else if (document.querySelector('.kiwi-sizing-modal .ks-image img,.kiwi-sizing-modal img.ks-image')) sizeGuideStatus = 'image-only';
  if (openedGuide?.isConnected) openedGuide.querySelector('button.modal__close,button.ks-modal-close')?.click();

  const details = { fit: [], rise: [], inseam: [], model: [], materials: [], sizingAdvice: [] };
  const detailNodes = root.querySelectorAll('p,li,dd,div,span,[class*="product-detail"],[class*="product-info"],[class*="description"]');
  let reviewsReached = false;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  const eligible = new Set([...detailNodes].filter(element =>
    !/^(?:DIV|SPAN)$/.test(element.tagName) || element.children.length === 0));
  function splitFacts(value) {
    return value
      .replace(/(5['′]\s*\d{1,2})(?=Please note)/gi, '$1|')
      .replace(/([.!?])\s+(?=[A-Z])/g, '$1|')
      .split(/[•·\n|]/)
      .map(clean)
      .filter(Boolean);
  }
  function classifyFact(value) {
    if (/^(?:please note|complete the look)\b/i.test(value)) return null;
    if (/\b(?:runs? (?:a bit )?(?:small|large)|siz(?:e|es) (?:up|down)|true to size|recommend.*size)\b/i.test(value)) return 'sizingAdvice';
    if (/\b(?:model (?:is|wears|has)|wearing a size|5['′]\s*\d)/i.test(value)) return 'model';
    if (/\b(?:inseam|inside leg|leg length|length is|short leg)\b/i.test(value)) return 'inseam';
    if (/\b(?:rise|waistband|high.waisted|low.waisted|sits on the hips|high waist|low waist)\b/i.test(value)) return 'rise';
    if (/\b(?:fit|relaxed|loose|slim|straight|flare|bootcut|barrel|wide.leg|silhouette)\b/i.test(value)) return 'fit';
    if (/\b(?:cotton|denim|polyester|elastane|spandex|lyocell|fabric|composition|material|stretch)\b/i.test(value)) return 'materials';
    return null;
  }
  while (walker.nextNode()) {
    const element = walker.currentNode;
    if (/^H[1-6]$/.test(element.tagName) && /^(?:customer\s+)?reviews?$/i.test(clean(element.textContent))) reviewsReached = true;
    if (reviewsReached || !eligible.has(element) || element.closest('nav,footer,header')) continue;
    const factElement = element.cloneNode(true);
    factElement.querySelectorAll('br').forEach(br => br.replaceWith('|'));
    const value = clean(factElement.textContent);
    if (value.length < 8 || value.length > 450) continue;
    for (const fact of splitFacts(value)) {
      const category = classifyFact(fact);
      if (category) details[category].push(fact);
    }
  }
  for (const key of Object.keys(details)) details[key] = unique(details[key]).slice(0, 20);

  const statusText = clean(root.textContent).slice(0, 12000);
  const availability = /SOLD\s+OUT/i.test(statusText) ? 'Sold out' :
    /OUT\s+OF\s+STOCK/i.test(statusText) ? 'Out of stock' : 'Unknown';
  const hasSizingInformation = ['waist', 'length', 'combined', 'other'].some(key =>
    sizes[key].length || sizes.unavailable[key].length) ||
    sizeGuides.length > 0 || Object.values(details).some(values => values.length);
  return { page: { title, url: location.href, store, image }, sizes, sizeGuides, sizeGuideStatus, details,
    availability, hasSizingInformation, scannedAt: new Date().toISOString() };
})()
