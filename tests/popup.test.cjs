const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

test('popup scans the active tab and displays collected sizing evidence', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.chrome.tabs = { query: async () => [{ id: 17 }] };
      window.chrome.scripting = { executeScript: async () => [{ result: {
        page: { store: "Levi's", title: "Low Loose Women's Jeans", url: 'https://www.levi.com/example' },
        sizes: { waist: ['23', '24'], length: ['30', '32'], combined: [], other: [] },
        sizeGuides: [{ title: 'Size Guide', headers: ['Size', 'Waist'], rows: [['24', '25.25']] }],
        details: { sizingAdvice: ['Runs a bit small'], fit: ['Relaxed through the hip'], rise: [], inseam: [], model: [], materials: [] },
        availability: 'Unknown', hasSizingInformation: true
      } }] };
    });
    await page.goto(pathToFileURL(path.join(__dirname, '..', 'popup.html')).href);
    await page.getByText('Low Loose Women\'s Jeans').waitFor();
    assert.equal(await page.locator('table tbody tr').innerText(), '24\t25.25');
    assert.equal(await page.getByText('Runs a bit small').count(), 1);
    assert.equal(await page.getByText('No jeans sizing details were found').count(), 0);
  } finally {
    await browser.close();
  }
});

test('popup distinguishes purchasable W/L options from XS chart reference rows', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.chrome.tabs = { query: async () => [{ id: 18 }] };
      window.chrome.scripting = { executeScript: async () => [{ result: {
        page: { store: 'Motel Rocks', title: 'Roomy Jeans', url: 'https://us.motelrocks.com/example' },
        sizes: { waist: [], length: [], combined: ['W24 L30'], other: [], unavailable: { waist: [], length: [], combined: ['W26 L30'], other: [] } },
        sizeGuides: [{ title: 'Jeans Size Guide', headers: ['Size', 'Waist', 'Short Leg'], rows: [['XS', '69 cm', '30 in']] }],
        details: { sizingAdvice: [], fit: [], rise: [], inseam: [], model: [], materials: [] },
        availability: 'Unknown', hasSizingInformation: true
      } }] };
    });
    await page.goto(pathToFileURL(path.join(__dirname, '..', 'popup.html')).href);
    await page.getByText('Roomy Jeans').waitFor();
    const options = page.locator('[data-section="product-options"]');
    const chart = page.locator('[data-section="size-guide"]');
    assert.equal(await options.getByText('W24 L30').count(), 1);
    assert.equal(await options.getByText('XS').count(), 0);
    assert.equal(await options.locator('.unavailable-size').getByText('W26 L30').count(), 1);
    assert.equal(await chart.locator('td').getByText('XS', { exact: true }).count(), 1);
  } finally {
    await browser.close();
  }
});

test('popup reveals its recommendation after a scan sequence and replays loading when fit changes', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.__scanCalls = 0;
      window.chrome.tabs = { query: async () => [{ id: 19 }] };
      window.chrome.storage = { local: { get: async () => ({ measurements: { waistCm: 61, hipCm: 87, inseamCm: 72 } }), set: async () => {} } };
      window.chrome.scripting = { executeScript: async () => { window.__scanCalls++; return [{ result: {
        page: { store: 'Motel Rocks', title: 'Roomy Jeans', url: 'https://us.motelrocks.com/example' },
        sizes: { waist: [], length: [], combined: ['W24 L30', 'W26 L32'], other: [], unavailable: { waist: [], length: [], combined: ['W26 L30'], other: [] } },
        sizeGuides: [{ title: 'Size chart · inches', headers: ['SIZE', 'WAIST'], rows: [['XXS', '24"'], ['XS', '26"']] }],
        details: { sizingAdvice: [], fit: ['Wide leg fit'], rise: ['Low rise waistband'], inseam: [], model: [], materials: [] },
        availability: 'Unknown', hasSizingInformation: true
      } }]; } };
    });
    await page.goto(pathToFileURL(path.join(__dirname, '..', 'popup.html')).href);
    assert.equal(await page.locator('.loading-panel').isVisible(), true);
    assert.match(await page.locator('.loading-panel').innerText(), /reading product sizing/i);
    assert.equal(await page.locator('[data-section="recommendation"]').count(), 0);
    await page.getByText('W24 L30', { exact: true }).first().waitFor();
    assert.equal(await page.locator('[data-section="recommendation"] .recommended-size').innerText(), 'W24 L30');
    assert.match(await page.locator('[data-section="natural-fit"]').innerText(), /Wide leg fit/);
    await page.getByRole('button', { name: 'Roomier' }).click();
    assert.equal(await page.locator('.loading-panel').isVisible(), true);
    assert.match(await page.locator('.loading-panel').innerText(), /rechecking available sizes/i);
    assert.equal(await page.locator('[data-section="recommendation"]').count(), 0);
    await page.locator('[data-section="recommendation"] .recommended-size').getByText('W26 L30').waitFor();
    assert.equal(await page.locator('[data-section="recommendation"] .recommended-size').innerText(), 'W26 L30');
    assert.match(await page.locator('.sold-out-notice').innerText(), /sold out/i);
    assert.match(await page.locator('.available-alternative').innerText(), /W26 L32/);
    assert.equal(await page.evaluate(() => window.__scanCalls), 1);
    assert.match(await page.locator('[aria-label="Edit body measurements"]').getAttribute('href'), /measurements\.html$/);
  } finally {
    await browser.close();
  }
});

test('measurements page loads the local profile and saves edits', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.__saved = null;
      window.chrome.storage = { local: {
        get: async () => ({ measurements: { waistCm: 61, hipCm: 87, inseamCm: 72 } }),
        set: async value => { window.__saved = value; }
      } };
    });
    await page.goto(pathToFileURL(path.join(__dirname, '..', 'measurements.html')).href);
    assert.equal(await page.getByLabel('Waist (cm)').inputValue(), '61');
    await page.getByLabel('Waist (cm)').fill('63');
    await page.getByLabel('Height (cm)').fill('160');
    await page.getByLabel('Thigh (cm)').fill('53');
    await page.getByRole('button', { name: 'Save measurements' }).click();
    assert.deepEqual(await page.evaluate(() => window.__saved), { measurements: { waistCm: 63, hipCm: 87, inseamCm: 72, heightCm: 160, thighCm: 53 } });
    assert.match(await page.locator('[role="status"]').innerText(), /saved/i);
  } finally {
    await browser.close();
  }
});

test('popup explains an image-only chart instead of asking the shopper to rescan', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.chrome.tabs = { query: async () => [{ id: 20 }] };
      window.chrome.scripting = { executeScript: async () => [{ result: {
        page: { store: 'AGOLDE', title: 'Romney Jean', url: 'https://agolde.com/products/romney' },
        sizes: { waist: ['23', '24', '25'], length: [], combined: [], other: [], unavailable: { waist: ['34'], length: [], combined: [], other: [] } },
        sizeGuides: [], sizeGuideStatus: 'image-only',
        details: { sizingAdvice: ['This fit is true to size.'], fit: ['Close fit through the leg'], rise: [], inseam: ['Inseam: 29"'], model: [], materials: [] },
        availability: 'Unknown', hasSizingInformation: true
      } }] };
    });
    await page.goto(pathToFileURL(path.join(__dirname, '..', 'popup.html')).href);
    await page.getByText('Romney Jean').waitFor();
    assert.equal(await page.locator('[data-section="recommendation"] h3').innerText(), 'Your size estimate');
    assert.equal(await page.locator('[data-section="recommendation"] .recommended-size').innerText(), '24');
    assert.match(await page.locator('[data-section="size-guide"]').innerText(), /image.*cannot|image.*read/i);
    assert.doesNotMatch(await page.locator('[data-section="size-guide"]').innerText(), /scan again/i);
  } finally {
    await browser.close();
  }
});
