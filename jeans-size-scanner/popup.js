const scanButton = document.getElementById('scan');
const results = document.getElementById('results');
const defaultMeasurements = { waistCm: 61, hipCm: 87, inseamCm: 72 };
let currentScan = null;
let measurements = defaultMeasurements;
let fitPreference = 'as-designed';

function add(parent, tag, text, className) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  parent.append(element);
  return element;
}

function showMessage(message, isError = false) {
  results.replaceChildren();
  add(results, 'p', message, isError ? 'message error' : 'message');
}

function render(scan) {
  results.replaceChildren();
  if (!scan?.hasSizingInformation) {
    showMessage('No jeans sizing details were found on this page. Open a product listing and scan again.');
    return;
  }
  const product = add(results, 'div', undefined, 'product');
  add(product, 'div', scan.page.store, 'store');
  add(product, 'h2', scan.page.title || 'Product page');
  if (scan.page.image) {
    const photo = add(product, 'img', undefined, 'product-photo');
    photo.src = scan.page.image;
    photo.alt = scan.page.title || 'Product photo';
  }
  const link = add(product, 'a', 'View source page');
  link.href = scan.page.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  if (scan.availability !== 'Unknown') add(product, 'div', scan.availability, 'badge');

  const recommendation = JeansRecommendation.recommend(scan, measurements, fitPreference);
  const recommendationSection = add(results, 'section', undefined, 'recommendation');
  recommendationSection.dataset.section = 'recommendation';
  add(recommendationSection, 'h3', 'Your recommended size');
  add(recommendationSection, 'div', recommendation.size || 'Not enough sizing data', 'recommended-size');
  add(recommendationSection, 'p',
    `Based on your ${measurements.waistCm} cm waist, ${measurements.hipCm} cm hip, and ${measurements.inseamCm} cm inseam.`, 'note');
  if (measurements.heightCm || measurements.thighCm) add(recommendationSection, 'p',
    `Also using ${[measurements.heightCm && `${measurements.heightCm} cm height`, measurements.thighCm && `${measurements.thighCm} cm thigh`].filter(Boolean).join(' and ')} when the page provides matching guidance.`, 'note');
  if (recommendation.status === 'tentative') add(recommendationSection, 'p', 'Estimate · check the fit notes below', 'estimate-badge');
  const fitChoices = add(recommendationSection, 'div', undefined, 'fit-choices');
  fitChoices.setAttribute('role', 'group');
  fitChoices.setAttribute('aria-label', 'Fit preference');
  for (const [value, label] of [['closer', 'Closer'], ['as-designed', 'As designed'], ['roomier', 'Roomier']]) {
    const button = add(fitChoices, 'button', label, value === fitPreference ? 'fit-choice selected' : 'fit-choice');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(value === fitPreference));
    button.addEventListener('click', () => {
      fitPreference = value;
      chrome.storage?.local?.set({ fitPreference });
      render(currentScan);
    });
  }
  const explanation = add(recommendationSection, 'div', undefined, 'recommendation-explanation');
  for (const reason of recommendation.reasons) add(explanation, 'p', reason);
  for (const note of recommendation.notes) add(explanation, 'p', note, 'caution');

  const naturalSection = add(results, 'section', undefined, 'natural-fit');
  naturalSection.dataset.section = 'natural-fit';
  add(naturalSection, 'h3', 'How these jeans are designed to fit');
  add(naturalSection, 'p', recommendation.naturalFit);
  add(naturalSection, 'p', '“As designed” follows this silhouette. Closer and roomier adjust your size choice relative to it.', 'note');

  const sizeSection = add(results, 'section');
  sizeSection.dataset.section = 'product-options';
  add(sizeSection, 'h3', 'Product size options');
  add(sizeSection, 'p', 'Sizes offered on this listing. These are the choices to use when ordering.', 'note');
  let foundSizes = false;
  for (const [key, label] of [['waist', 'Waist / size'], ['length', 'Length'], ['combined', 'Waist × length'], ['other', 'Other']]) {
    const available = scan.sizes[key] || [];
    const unavailable = scan.sizes.unavailable?.[key] || [];
    if (!available.length && !unavailable.length) continue;
    foundSizes = true;
    add(sizeSection, 'p', label, 'note');
    const chips = add(sizeSection, 'div', undefined, 'chips');
    for (const size of available) add(chips, 'span', size, 'chip');
    for (const size of unavailable) add(chips, 'span', size, 'chip unavailable-size');
  }
  if (!foundSizes) add(sizeSection, 'p', 'No product size options found.', 'note');
  else if (Object.values(scan.sizes.unavailable || {}).some(values => values.length))
    add(sizeSection, 'p', 'Crossed-out sizes appear unavailable.', 'note');

  const chartSection = add(results, 'section');
  chartSection.dataset.section = 'size-guide';
  add(chartSection, 'h3', 'Size guide · reference only');
  add(chartSection, 'p', 'Chart rows explain the brand’s sizing. Labels like XS or S are not product options unless they also appear above.', 'note');
  if (!scan.sizeGuides.length) add(chartSection, 'p', 'No chart table found in the page. If there is a Size Guide button, open it and scan again.', 'note');
  for (const guide of scan.sizeGuides) {
    const wrap = add(chartSection, 'div', undefined, 'guide');
    add(wrap, 'h4', guide.title);
    const table = add(wrap, 'table');
    if (guide.headers.length) {
      const row = add(add(table, 'thead'), 'tr');
      for (const heading of guide.headers) add(row, 'th', heading);
    }
    const body = add(table, 'tbody');
    for (const cells of guide.rows.slice(0, 40)) {
      const row = add(body, 'tr');
      for (const cell of cells) add(row, 'td', cell);
    }
  }

  const detailSection = add(results, 'section');
  add(detailSection, 'h3', 'Fit and product details');
  const labels = { sizingAdvice: 'Sizing advice', rise: 'Rise', fit: 'Leg shape and fit', inseam: 'Inseam / length', model: 'Model shown', materials: 'Fabric' };
  let detailCount = 0;
  for (const [key, label] of Object.entries(labels)) {
    const entries = scan.details[key] || [];
    if (!entries.length) continue;
    detailCount += entries.length;
    const fact = add(detailSection, 'div', undefined, 'fact');
    add(fact, 'div', label, 'fact-label');
    const list = add(fact, 'ul');
    for (const entry of entries) add(list, 'li', entry);
  }
  if (!detailCount) add(detailSection, 'p', 'No fit notes found.', 'note');
}

async function scanPage() {
  scanButton.disabled = true;
  showMessage('Scanning this page…');
  try {
    if (chrome.storage?.local) {
      const saved = await chrome.storage.local.get(['measurements', 'fitPreference']);
      measurements = saved.measurements || defaultMeasurements;
      fitPreference = saved.fitPreference || 'as-designed';
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab found.');
    const [injection] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['scanner.js'] });
    currentScan = injection?.result;
    render(currentScan);
  } catch (error) {
    showMessage('Could not scan this tab. Open a normal product page and try again. Chrome blocks scanning its own settings and store pages.', true);
  } finally {
    scanButton.disabled = false;
  }
}

scanButton.addEventListener('click', scanPage);
scanPage();
