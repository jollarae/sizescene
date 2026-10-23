const scanButton = document.getElementById('scan');
const results = document.getElementById('results');
const defaultMeasurements = { waistCm: 61, hipCm: 87, inseamCm: 72 };
let currentScan = null;
let measurements = defaultMeasurements;
let fitPreference = 'as-designed';
let detailsOpen = false;
let renderRevision = 0;

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
  const revision = ++renderRevision;
  fitPreference = value;
  scanButton.disabled = true;
  try {
    const explanation = requestExplanation(currentScan, value, measurements);
    await showLoading('fit', value);
    const response = await explanation;
    if (revision === renderRevision) render(currentScan, response);
  } finally {
    scanButton.disabled = false;
  }
}

async function requestExplanation(scan, preference, profile) {
  const recommendation = JeansRecommendation.recommend(scan, profile, preference);
  if (!SizeSceneAIConfig.enabled || !recommendation.size || !recommendation.explanationFacts?.length) return null;
  try {
    const token = await SizeSceneAuth.getAccessToken();
    if (!token) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(SizeSceneAIConfig.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SizeSceneAIConfig.publishableKey,
          Authorization: `Bearer ${token}` },
        body: JSON.stringify({ version: 1, task: 'explain', size: recommendation.size,
          status: recommendation.status, preference,
          measurements: Object.fromEntries(['waistCm', 'hipCm', 'inseamCm', 'heightCm', 'thighCm']
            .filter(key => Number.isFinite(Number(profile[key])) && Number(profile[key]) > 0)
            .map(key => [key, Number(profile[key])])),
          facts: recommendation.explanationFacts }),
        signal: controller.signal
      });
      return response.ok ? await response.json() : null;
    } finally { clearTimeout(timeout); }
  } catch { return null; }
}

async function readImageChart(scan, imageUrl, token, replaceUnmatched = false) {
  if (!imageUrl || (scan.sizeGuides?.length && !replaceUnmatched)) return scan;
  const productSizes = [...new Set(['waist', 'combined', 'other'].flatMap(key =>
    [...(scan.sizes?.[key] || []), ...(scan.sizes?.unavailable?.[key] || [])]))].slice(0, 40);
  if (!productSizes.length) return scan;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(SizeSceneAIConfig.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SizeSceneAIConfig.publishableKey,
        Authorization: `Bearer ${token}` },
      body: JSON.stringify({ version: 1, task: 'read-chart-image', imageUrl,
        title: scan.page.title || '', productSizes }), signal: controller.signal
    });
    if (!response.ok) return scan;
    const data = await response.json();
    const base = replaceUnmatched ? { ...scan, sizeGuides: [], imageChartUsed: false } : scan;
    const candidate = SizeSceneAI.mergeImageChart(base, data.chart);
    return candidate !== base && candidate.imageChartUsed ? candidate : scan;
  } catch { return scan; }
  finally { clearTimeout(timeout); }
}

async function extractSnapshot(scan, snapshot, token) {
  if (!snapshot?.items?.length) return scan;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(SizeSceneAIConfig.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SizeSceneAIConfig.publishableKey,
        Authorization: `Bearer ${token}` },
      body: JSON.stringify(snapshot), signal: controller.signal
    });
    if (response.status === 401) {
      await SizeSceneAuth.signOut();
      return { ...scan, aiStatus: 'sign-in-required' };
    }
    if (!response.ok) throw new Error(`AI extraction returned ${response.status}`);
    const data = await response.json();
    return { ...SizeSceneAI.merge(scan, snapshot, data.extraction), aiStatus: 'used' };
  } finally { clearTimeout(timeout); }
}

function render(scan, aiExplanation = null) {
  results.replaceChildren();
  if (!scan?.hasSizingInformation) {
    if (scan?.aiStatus === 'sign-in-required') {
      showMessage('Sign in to scan sizing on this store.');
      const accountLink = add(results, 'a', 'Sign in for assisted scanning →');
      accountLink.href = 'measurements.html#account-heading';
      return;
    }
    showMessage(scan?.aiStatus === 'unavailable' ?
      'This page did not expose readable sizing, and the assisted scan is temporarily unavailable. Open the retailer’s size guide and rescan.' :
      'No jeans sizing details were found on this page. Open a product listing and scan again.');
    return;
  }
  const product = add(results, 'div', undefined, 'product');
  if (scan.page.image) {
    const photo = add(product, 'img', undefined, 'product-photo');
    photo.src = scan.page.image;
    photo.alt = scan.page.title || 'Product photo';
  }
  const productCopy = add(product, 'div', undefined, 'product-copy');
  add(productCopy, 'div', scan.page.brand || scan.page.store, 'store');
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
  const disclosure = add(results, 'details', undefined, 'size-details');
  disclosure.open = detailsOpen;
  disclosure.addEventListener('toggle', () => { detailsOpen = disclosure.open; });
  add(disclosure, 'summary', 'Why this size?');
  const detailContent = add(disclosure, 'div', undefined, 'size-details-content');
  const summary = SizeSceneExplanation.summarize(recommendation, aiExplanation);
  const reasonList = add(detailContent, 'div', undefined, 'reason-list');
  for (const item of summary.items) {
    const card = add(reasonList, 'div', undefined, 'reason-card');
    add(card, 'strong', item.title);
    add(card, 'p', item.text);
  }
  if (!summary.items.length) add(detailContent, 'p', 'The listing does not connect its size choices to enough body measurements for an explanation.', 'note');
  if (summary.caution) add(detailContent, 'p', summary.caution, 'explanation-caution');
  const sourceDisclosure = add(detailContent, 'details', undefined, 'source-details');
  add(sourceDisclosure, 'summary', 'See source details');
  const sourceContent = add(sourceDisclosure, 'div', undefined, 'source-details-content');
  add(sourceContent, 'p',
    `Saved measurements: ${measurements.waistCm} cm waist · ${measurements.hipCm} cm hip · ${measurements.inseamCm} cm inseam.`, 'note');
  if (measurements.heightCm || measurements.thighCm) add(sourceContent, 'p',
    `Additional saved measurements: ${[measurements.heightCm && `${measurements.heightCm} cm height`, measurements.thighCm && `${measurements.thighCm} cm thigh`].filter(Boolean).join(' · ')}.`, 'note');

  if (recommendation.naturalFit !== 'The listing does not describe its intended fit.') {
    const naturalSection = add(sourceContent, 'section', undefined, 'natural-fit');
    naturalSection.dataset.section = 'natural-fit';
    add(naturalSection, 'h3', 'How these jeans are designed to fit');
    add(naturalSection, 'p', recommendation.naturalFit);
    add(naturalSection, 'p', '“As designed” follows this silhouette. Closer and roomier adjust your size choice relative to it.', 'note');
  }

  const sizeSection = add(sourceContent, 'section');
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
    const chartSection = add(sourceContent, 'section');
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
    const detailSection = add(sourceContent, 'section');
    add(detailSection, 'h3', 'Fit and product details');
    for (const [key, label] of providedDetails) {
      const fact = add(detailSection, 'div', undefined, 'fact');
      add(fact, 'div', label, 'fact-label');
      const list = add(fact, 'ul');
      for (const entry of scan.details[key]) add(list, 'li', entry);
    }
  }
  add(results, 'p', 'Your size recommendation is based on the sizing details available. Fit may vary by style.', 'recommendation-disclaimer');
}

async function scanPage() {
  const revision = ++renderRevision;
  fitPreference = 'as-designed';
  scanButton.disabled = true;
  const loading = showLoading('scan');
  try {
    if (chrome.storage?.local) {
      const saved = await chrome.storage.local.get(['measurements']);
      measurements = saved.measurements || defaultMeasurements;
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab found.');
    const [injection] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['scanner.js'] });
    currentScan = injection?.result;
    const needsChart = currentScan && JeansRecommendation.recommend(currentScan, measurements, 'as-designed').status === 'tentative';
    const needsTextChart = needsChart && !currentScan.sizeGuideImage;
    if (currentScan && SizeSceneAIConfig.enabled &&
        (SizeSceneAI.shouldEnhance(currentScan) || currentScan.sizeGuideImage || needsTextChart)) {
      try {
        const accessToken = await SizeSceneAuth.getAccessToken();
        if (!accessToken) currentScan.aiStatus = 'sign-in-required';
        else {
          let snapshot = null;
          if (SizeSceneAI.shouldEnhance(currentScan) || needsTextChart) {
            const [snapshotInjection] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['page-snapshot.js'] });
            snapshot = snapshotInjection?.result;
            const hasOptions = snapshot?.items?.some(item => item.kind === 'option');
            const hasChart = snapshot?.items?.some(item => item.kind === 'chart') || snapshot?.chartImages?.length;
            if ((!hasOptions || !hasChart) && typeof SizeSceneGuidedScan !== 'undefined') {
              const explored = await SizeSceneGuidedScan.explore({
                tabId: tab.id,
                token: accessToken,
                page: currentScan.page,
                endpoint: SizeSceneAIConfig.endpoint,
                publishableKey: SizeSceneAIConfig.publishableKey
              });
              if (explored?.snapshot) snapshot = explored.snapshot;
            }
          }
          currentScan = await extractSnapshot(currentScan, snapshot, accessToken);
          const imageUrl = currentScan.sizeGuideImage || snapshot?.chartImages?.[0]?.url;
          if (imageUrl && !currentScan.sizeGuides?.length)
            currentScan = await readImageChart(currentScan, imageUrl, accessToken);

          // A visible chart is only useful if its rows match the orderable sizes.
          // Keep exploring nested sizing controls when the first chart did not.
          if (currentScan.aiStatus !== 'sign-in-required' &&
              JeansRecommendation.recommend(currentScan, measurements, 'as-designed').status === 'tentative' &&
              typeof SizeSceneGuidedScan !== 'undefined') {
            const ignoredCharts = {
              texts: (snapshot?.items || []).filter(item => item.kind === 'chart').map(item => item.text),
              imageUrls: [...new Set([currentScan.sizeGuideImage,
                ...(snapshot?.chartImages || []).map(image => image.url)].filter(Boolean))]
            };
            const explored = await SizeSceneGuidedScan.explore({
              tabId: tab.id, token: accessToken, page: currentScan.page,
              endpoint: SizeSceneAIConfig.endpoint, publishableKey: SizeSceneAIConfig.publishableKey,
              ignoredCharts
            });
            const expanded = explored?.snapshot;
            const foundNewChart = expanded?.items?.some(item => item.kind === 'chart' && !ignoredCharts.texts.includes(item.text));
            const newImage = expanded?.chartImages?.find(image => !ignoredCharts.imageUrls.includes(image.url));
            if (foundNewChart) currentScan = await extractSnapshot(currentScan, expanded, accessToken);
            if (newImage?.url || imageUrl)
              currentScan = await readImageChart(currentScan, newImage?.url || imageUrl, accessToken, true);
          }
        }
      } catch (error) {
        currentScan.aiStatus = 'unavailable';
      }
    }
    detailsOpen = false;
    const explanation = requestExplanation(currentScan, fitPreference, measurements);
    await loading;
    const response = await explanation;
    if (revision === renderRevision) render(currentScan, response);
  } catch (error) {
    await loading;
    showMessage('Could not scan this tab. Open a normal product page and try again. Chrome blocks scanning its own settings and store pages.', true);
  } finally {
    scanButton.disabled = false;
  }
}

scanButton.addEventListener('click', scanPage);
scanPage();
