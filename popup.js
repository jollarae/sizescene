const scanButton = document.getElementById('scan');
const results = document.getElementById('results');
const defaultMeasurements = { waistCm: 61, hipCm: 87, inseamCm: 72 };
let currentScan = null;
let measurements = defaultMeasurements;
let fitPreference = 'as-designed';
let detailsOpen = false;

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

const loadingPause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function showLoading(mode, preference = fitPreference) {
  const isFitChange = mode === 'fit';
  const stages = isFitChange ? [
    ['Rechecking available sizes', 'Looking at the choices on this listing.'],
    ['Comparing your measurements', 'Checking the fit against your profile.'],
    [`Finding your ${preference === 'closer' ? 'closer' : 'roomier'} fit`, 'Almost ready with your updated size.']
  ] : [
    ['Reading product sizing', 'Finding the sizes and fit details on this page.'],
    ['Comparing your measurements', 'Checking the retailer’s guidance against your profile.'],
    ['Preparing your recommendation', 'Putting your fit guidance together.']
  ];

  results.replaceChildren();
  const panel = add(results, 'div', undefined, 'loading-panel');
  panel.setAttribute('role', 'status');
  panel.setAttribute('aria-live', 'polite');
  panel.setAttribute('aria-atomic', 'true');
  const visual = add(panel, 'div', undefined, 'loading-visual');
  visual.setAttribute('aria-hidden', 'true');
  add(visual, 'div', undefined, 'loading-jeans');
  add(visual, 'div', undefined, 'loading-scan-line');
  add(panel, 'p', 'FINDING YOUR FIT', 'loading-eyebrow');
  const title = add(panel, 'h2', stages[0][0], 'loading-title');
  const detail = add(panel, 'p', stages[0][1], 'loading-detail');
  const progress = add(panel, 'div', undefined, 'loading-progress');
  progress.setAttribute('aria-hidden', 'true');
  add(progress, 'div', undefined, 'loading-progress-fill');

  panel.dataset.step = '1';
  await loadingPause(1000);
  panel.dataset.step = '2';
  title.textContent = stages[1][0];
  detail.textContent = stages[1][1];
  await loadingPause(1000);
  panel.dataset.step = '3';
  title.textContent = stages[2][0];
  detail.textContent = stages[2][1];
  await loadingPause(1000);
}

async function chooseFit(value) {
  if (value === fitPreference) return;
  fitPreference = value;
  chrome.storage?.local?.set({ fitPreference });
  scanButton.disabled = true;
  try {
    await showLoading('fit', value);
    render(currentScan);
  } finally {
    scanButton.disabled = false;
  }
}

function render(scan) {
  results.replaceChildren();
  if (!scan?.hasSizingInformation) {
    showMessage('No jeans sizing details were found on this page. Open a product listing and scan again.');
    return;
  }
  const product = add(results, 'div', undefined, 'product');
  if (scan.page.image) {
    const photo = add(product, 'img', undefined, 'product-photo');
    photo.src = scan.page.image;
    photo.alt = scan.page.title || 'Product photo';
  }
  const productCopy = add(product, 'div', undefined, 'product-copy');
  add(productCopy, 'div', scan.page.store, 'store');
  add(productCopy, 'h2', scan.page.title || 'Product page');
  const link = add(productCopy, 'a', 'View product ↗');
  link.href = scan.page.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  if (scan.availability !== 'Unknown') add(productCopy, 'div', scan.availability, 'badge');

  const recommendation = JeansRecommendation.recommend(scan, measurements, fitPreference);
  const recommendationSection = add(results, 'section', undefined, 'recommendation');
  recommendationSection.dataset.section = 'recommendation';
  add(recommendationSection, 'h3', recommendation.status === 'tentative' ? 'Your size estimate' : 'Your recommended size');
  add(recommendationSection, 'div', recommendation.size || 'Not enough sizing data', 'recommended-size');
  if (recommendation.soldOut) {
    add(recommendationSection, 'p', 'Sold out · best fit for your measurements', 'sold-out-notice');
    if (recommendation.availableSize) {
      const alternative = add(recommendationSection, 'div', undefined, 'available-alternative');
      add(alternative, 'span', 'Closest available size', 'alternative-label');
      add(alternative, 'strong', recommendation.availableSize);
    }
  }
  add(recommendationSection, 'p', 'Compared with your saved measurements', 'saved-measurements');
  if (recommendation.status === 'tentative') add(recommendationSection, 'p', 'Estimate · based on listed sizes', 'estimate-badge');
  const alternativeWarning = recommendation.notes.find(note => /substantially differently/i.test(note));
  if (alternativeWarning) add(recommendationSection, 'p', 'The available size may fit substantially differently.', 'alternative-warning');
  const fitChoices = add(recommendationSection, 'div', undefined, 'fit-choices');
  fitChoices.setAttribute('role', 'group');
  fitChoices.setAttribute('aria-label', 'Fit preference');
  for (const [value, label] of [['closer', 'Closer'], ['as-designed', 'As designed'], ['roomier', 'Roomier']]) {
    const button = add(fitChoices, 'button', label, value === fitPreference ? 'fit-choice selected' : 'fit-choice');
    button.type = 'button';
    button.setAttribute('aria-pressed', String(value === fitPreference));
    button.addEventListener('click', () => { void chooseFit(value); });
  }
  if (recommendation.naturalFit !== 'The listing does not describe its intended fit.')
    add(recommendationSection, 'p', `Designed fit: ${recommendation.naturalFit}`, 'fit-summary');

  const disclosure = add(results, 'details', undefined, 'size-details');
  disclosure.open = detailsOpen;
  disclosure.addEventListener('toggle', () => { detailsOpen = disclosure.open; });
  add(disclosure, 'summary', 'Why this size?');
  const detailContent = add(disclosure, 'div', undefined, 'size-details-content');
  add(detailContent, 'p',
    `Saved measurements: ${measurements.waistCm} cm waist · ${measurements.hipCm} cm hip · ${measurements.inseamCm} cm inseam.`, 'note');
  if (measurements.heightCm || measurements.thighCm) add(detailContent, 'p',
    `Additional saved measurements: ${[measurements.heightCm && `${measurements.heightCm} cm height`, measurements.thighCm && `${measurements.thighCm} cm thigh`].filter(Boolean).join(' · ')}.`, 'note');
  const explanation = add(detailContent, 'div', undefined, 'recommendation-explanation');
  for (const reason of recommendation.reasons) add(explanation, 'p', reason);
  for (const note of recommendation.notes) add(explanation, 'p', note, 'caution');

  if (recommendation.naturalFit !== 'The listing does not describe its intended fit.') {
    const naturalSection = add(detailContent, 'section', undefined, 'natural-fit');
    naturalSection.dataset.section = 'natural-fit';
    add(naturalSection, 'h3', 'How these jeans are designed to fit');
    add(naturalSection, 'p', recommendation.naturalFit);
    add(naturalSection, 'p', '“As designed” follows this silhouette. Closer and roomier adjust your size choice relative to it.', 'note');
  }

  const sizeSection = add(detailContent, 'section');
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

  if (scan.sizeGuides.length || scan.sizeGuideStatus === 'image-only') {
    const chartSection = add(detailContent, 'section');
    chartSection.dataset.section = 'size-guide';
    add(chartSection, 'h3', 'Size guide · reference only');
    if (scan.sizeGuides.length) add(chartSection, 'p', 'Chart rows explain the brand’s sizing. Labels like XS or S are not product options unless they also appear above.', 'note');
    else add(chartSection, 'p', 'The retailer’s size guide is an image. View the guide on the product page for more fit detail.', 'note');
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
  }

  const labels = { sizingAdvice: 'Sizing advice', rise: 'Rise', fit: 'Leg shape and fit', inseam: 'Inseam / length', model: 'Model shown', materials: 'Fabric' };
  const providedDetails = Object.entries(labels).filter(([key]) => scan.details[key]?.length);
  if (providedDetails.length) {
    const detailSection = add(detailContent, 'section');
    add(detailSection, 'h3', 'Fit and product details');
    for (const [key, label] of providedDetails) {
      const fact = add(detailSection, 'div', undefined, 'fact');
      add(fact, 'div', label, 'fact-label');
      const list = add(fact, 'ul');
      for (const entry of scan.details[key]) add(list, 'li', entry);
    }
  }
}

async function scanPage() {
  scanButton.disabled = true;
  const loading = showLoading('scan');
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
    detailsOpen = false;
    await loading;
    render(currentScan);
  } catch (error) {
    await loading;
    showMessage('Could not scan this tab. Open a normal product page and try again. Chrome blocks scanning its own settings and store pages.', true);
  } finally {
    scanButton.disabled = false;
  }
}

scanButton.addEventListener('click', scanPage);
scanPage();
