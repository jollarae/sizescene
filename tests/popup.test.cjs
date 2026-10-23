const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

test('popup explores hidden product sizes and a sizing frame before recommending', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      let stage = 0;
      window.__restoredPanels = [];
      window.SizeSceneAIConfig = { enabled: true, endpoint: 'https://example.test/analyze-listing', publishableKey: 'public-key' };
      window.fetch = async (_url, options) => {
        const body = JSON.parse(options.body);
        if (body.task === 'navigate') {
          const label = body.goal === 'product-options' ? 'Select size' : stage === 1 ? 'Find your size' : 'Size chart';
          return { ok: true, json: async () => ({ actionId: body.actions.find(action => action.label === label)?.id || '' }) };
        }
        return { ok: true, json: async () => ({ extraction: { productOptionIds: ['e1'],
          charts: [{ evidenceId: 'e2', title: 'Body size chart', headers: ['Size', 'Waist', 'Hip'], rows: [['W24', '62', '86']] }],
          fitEvidenceIds: [] } }) };
      };
      window.chrome.tabs = { query: async () => [{ id: 27 }] };
      window.chrome.storage = { local: { get: async key => key === 'sizeSceneSession' ? { sizeSceneSession: {
        access_token: 'test-access', refresh_token: 'test-refresh', expires_at: 9999999999
      } } : { measurements: { waistCm: 61, hipCm: 87, inseamCm: 72 } }, set: async () => {}, remove: async () => {} } };
      window.chrome.scripting = { executeScript: async ({ target, files, func, args }) => {
        if (files?.[0] === 'scanner.js') return [{ result: { page: { store: 'Other', title: 'Booty Bei Jeans', url: 'https://shop.example/jeans' },
          sizes: { waist: [], length: [], combined: [], other: [], unavailable: { waist: [], length: [], combined: [], other: [] } },
          sizeGuides: [], sizeGuideStatus: 'none', details: { fit: [], rise: [], inseam: [], model: [], materials: [], sizingAdvice: [] },
          hasSizingInformation: false } }];
        if (files?.[0] === 'page-snapshot.js') return [{ frameId: 0, result: { version: 1, host: 'shop.example', title: 'Jeans', items: stage ?
          [{ id: 'o1', kind: 'option', label: '24/30', text: 'Select size 24/30', availability: 'available' }] : [] } },
          ...(target.allFrames && stage >= 3 ? [{ frameId: 8, result: { version: 1, host: 'modules.ecomid.com', items: [
            { id: 'c1', kind: 'chart', context: 'Body measurements', text: 'SIZE | WAIST | HIP ; W24 | 62 | 86' }
          ] } }] : [])];
        if (files?.[0] === 'size-actions.js') return [{ frameId: 0 }, ...(stage >= 2 ? [{ frameId: 8 }] : [])];
        if (func?.name === 'collectInFrame') return [{ frameId: 0, result: [
          { id: 'a1', label: 'Select size', context: '', type: 'combobox' },
          { id: 'a2', label: 'Find your size', context: '', type: 'button' }
        ] }, ...(stage >= 2 ? [{ frameId: 8, result: [{ id: 'a1', label: 'Size chart', context: '', type: 'button' }] }] : [])];
        if (func?.name === 'panelStateInFrame') return [{ frameId: 0, result: null }];
        if (func?.name === 'activateInFrame') { stage++; return [{ frameId: target.frameIds[0], result: true }]; }
        if (func?.name === 'closePanelInFrame' || func?.name === 'collapseInFrame') {
          window.__restoredPanels.push([func.name, target.frameIds[0]]);
          return [{ frameId: target.frameIds[0], result: true }];
        }
        throw new Error('Unexpected injection ' + files?.[0]);
      } };
    });
    await page.goto(pathToFileURL(path.join(__dirname, '..', 'popup.html')).href);
    await page.locator('.recommended-size').getByText('W24 L30').waitFor();
    assert.equal(await page.getByText('AI scan used').count(), 0);
    assert.deepEqual(await page.evaluate(() => window.__restoredPanels), [['closePanelInFrame', 8], ['collapseInFrame', 0]]);
  } finally { await browser.close(); }
});

test('popup keeps searching when the first chart cannot be matched to product sizes', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      let stage = 0;
      window.__chartSearch = [];
      window.SizeSceneAIConfig = { enabled: true, endpoint: 'https://example.test/analyze-listing', publishableKey: 'public-key' };
      window.fetch = async (_url, options) => {
        const request = JSON.parse(options.body);
        if (request.task === 'navigate') {
          window.__chartSearch.push(request.actions.map(action => action.label));
          return { ok: true, json: async () => ({ actionId: request.actions[0]?.id || '' }) };
        }
        const actual = request.items?.find(item => item.kind === 'chart' && item.text.includes('24.5'));
        return { ok: true, json: async () => ({ extraction: { productOptionIds: [], fitEvidenceIds: [], charts: actual ? [
          { evidenceId: actual.id, title: 'Body size chart', headers: ['Size', 'Waist (in)', 'Hip (in)'],
            rows: [['24', '24.5', '34.5'], ['25', '25.5', '35.5']] }
        ] : [] } }) };
      };
      window.chrome.tabs = { query: async () => [{ id: 27 }] };
      window.chrome.storage = { local: { get: async key => key === 'sizeSceneSession' ? { sizeSceneSession: {
        access_token: 'test-access', refresh_token: 'test-refresh', expires_at: 9999999999
      } } : { measurements: { waistCm: 61, hipCm: 87, inseamCm: 72 } }, set: async () => {} } };
      window.chrome.scripting = { executeScript: async ({ files, func, args }) => {
        if (files?.[0] === 'scanner.js') return [{ result: {
          page: { store: 'Other', title: 'Jeans', url: 'https://shop.example/jeans' },
          sizes: { waist: ['24', '25'], length: [], combined: [], other: [], unavailable: { waist: [], length: [], combined: [], other: [] } },
          sizeGuides: [], sizeGuideStatus: 'none', details: { fit: [], rise: [], inseam: [], model: [], materials: [], sizingAdvice: [] },
          hasSizingInformation: true
        } }];
        if (files?.[0] === 'page-snapshot.js') return [{ frameId: 0, result: { host: 'shop.example', title: 'Jeans', items: [
          { id: 'o1', kind: 'option', label: '24', text: 'Size 24' },
          { id: 'c1', kind: 'chart', context: 'Generic chart', text: 'SIZE | WAIST ; XS | 24 ; S | 26' },
          ...(stage >= 2 ? [{ id: 'c2', kind: 'chart', context: 'Jeans body chart', text: 'SIZE | WAIST | HIP ; 24 | 24.5 | 34.5 ; 25 | 25.5 | 35.5' }] : [])
        ] } }];
        if (files?.[0] === 'size-actions.js') return [{ frameId: 0 }];
        if (func?.name === 'collectInFrame') return [{ frameId: 0, result: stage === 0 ?
          [{ id: 'a1', label: 'Find your size', context: 'product', type: 'button' }] :
          [{ id: 'a2', label: 'Size chart', context: 'Find your size', type: 'button' }] }];
        if (func?.name === 'panelStateInFrame') return [{ frameId: 0, result: { stage } }];
        if (func?.name === 'activateInFrame') { stage++; return [{ frameId: 0, result: true }]; }
        if (func?.name === 'restorePanelsInFrame') { stage = args[0].stage; return [{ frameId: 0, result: true }]; }
        throw new Error('Unexpected injection ' + files?.[0]);
      } };
    });
    await page.goto(pathToFileURL(path.join(__dirname, '..', 'popup.html')).href);
    await page.locator('.recommended-size').getByText('24').waitFor();
    assert.equal(await page.locator('.recommendation h3').innerText(), 'Your recommended size');
    assert.equal(await page.getByText('Estimate · based on listed sizes').count(), 0);
    assert.deepEqual(await page.evaluate(() => window.__chartSearch), [['Find your size'], ['Size chart']]);
  } finally { await browser.close(); }
});

test('AI fallback enriches an unfamiliar retailer without sending body measurements', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.SizeSceneAIConfig = { enabled: true, endpoint: 'https://example.test/analyze-listing', publishableKey: 'public-key' };
      window.__sentSnapshot = null;
      window.__sentSummary = null;
      window.fetch = async (_url, options) => {
        const body = JSON.parse(options.body);
        if (body.task === 'explain') {
          window.__sentSummary = body;
          return { ok: true, json: async () => ({ items: [] }) };
        }
        window.__sentSnapshot = body;
        return { ok: true, json: async () => ({ extraction: {
          productOptionIds: ['o1', 'o2'],
          charts: [{ evidenceId: 'c1', title: 'Body size chart', headers: ['Size', 'Waist (cm)', 'Hip (cm)'], rows: [['24', '61cm', '87cm'], ['26', '66cm', '92cm']] }],
          fitEvidenceIds: []
        } }) };
      };
      window.chrome.tabs = { query: async () => [{ id: 27 }] };
      window.chrome.storage = { local: {
        get: async key => key === 'sizeSceneSession' ? { sizeSceneSession: {
          access_token: 'test-access', refresh_token: 'test-refresh', expires_at: 9999999999
        } } : { measurements: { waistCm: 61, hipCm: 87, inseamCm: 72 } },
        set: async () => {}, remove: async () => {}
      } };
      window.chrome.scripting = { executeScript: async ({ files }) => [{ result: files[0] === 'scanner.js' ? {
        page: { store: 'Other', title: 'Cigarette Jeans', url: 'https://shop.example/jeans' },
        sizes: { waist: [], length: [], combined: [], other: [], unavailable: { waist: [], length: [], combined: [], other: [] } },
        sizeGuides: [], sizeGuideStatus: 'none',
        details: { fit: [], rise: [], inseam: [], model: [], materials: [], sizingAdvice: [] },
        hasSizingInformation: false
      } : { version: 1, host: 'shop.example', title: 'Cigarette Jeans', items: [
        { id: 'o1', kind: 'option', text: 'Size 24', label: '24', availability: 'available' },
        { id: 'o2', kind: 'option', text: 'Size 26 Sold out', label: '26', availability: 'unavailable' },
        { id: 'c1', kind: 'chart', text: 'Body size chart Size Waist Hip 24 61cm 87cm 26 66cm 92cm' }
      ] } }] };
    });
    await page.goto(pathToFileURL(path.join(__dirname, '..', 'popup.html')).href);
    await page.locator('.recommended-size').getByText('24').waitFor();
    assert.equal(await page.locator('.recommended-size').innerText(), '24');
    assert.equal(await page.getByText('AI scan used').count(), 0);
    assert.equal(await page.evaluate(() => 'measurements' in window.__sentSnapshot), false);
    assert.equal(await page.evaluate(() => window.__sentSummary.measurements.waistCm), 61);
    await page.getByText('Why this size?').click();
    await page.getByText('See source details').click();
    assert.equal(await page.locator('[data-section="size-guide"] td').getByText('87cm').count(), 1);
  } finally { await browser.close(); }
});

test('popup scans the active tab and displays collected sizing evidence', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.chrome.tabs = { query: async () => [{ id: 17 }] };
      window.chrome.scripting = { executeScript: async () => [{ result: {
        page: { store: "Levi's", brand: 'Cheap Monday', title: "Low Loose Women's Jeans", url: 'https://www.levi.com/example', image: 'https://example.com/jeans.jpg' },
        sizes: { waist: ['23', '24'], length: ['30', '32'], combined: [], other: [] },
        sizeGuides: [{ title: 'Size Guide', headers: ['Size', 'Waist'], rows: [['24', '25.25']] }],
        details: { sizingAdvice: ['Runs a bit small'], fit: ['Relaxed through the hip'], rise: [], inseam: [], model: [], materials: [] },
        availability: 'Unknown', hasSizingInformation: true
      } }] };
    });
    await page.goto(pathToFileURL(path.join(__dirname, '..', 'popup.html')).href);
    await page.getByText('Low Loose Women\'s Jeans').waitFor();
    assert.equal(await page.locator('.product .store').innerText(), 'CHEAP MONDAY');
    assert.equal(await page.locator('.product-photo').isVisible(), true);
    assert.ok(await page.locator('.product-photo').evaluate(image => image.getBoundingClientRect().width) <= 100);
    assert.equal(await page.getByText('Why this size?').count(), 1);
    assert.equal(await page.locator('[data-section="size-guide"]').isVisible(), false);
    await page.getByText('Why this size?').click();
    assert.equal(await page.locator('[data-section="size-guide"]').isVisible(), false);
    await page.getByText('See source details').click();
    assert.equal(await page.locator('[data-section="size-guide"]').isVisible(), true);
    assert.equal(await page.locator('table tbody tr').innerText(), '24\t25.25');
    assert.equal(await page.getByText('Runs a bit small').count(), 1);
    assert.equal(await page.getByText('No jeans sizing details were found').count(), 0);
    assert.equal(await page.getByText('AI scan used').count(), 0);
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
    assert.equal(await page.locator('[data-section="product-options"]').isVisible(), false);
    await page.getByText('Why this size?').click();
    assert.equal(await page.locator('.reason-card').count(), 2);
    assert.equal(await page.locator('[data-section="size-guide"]').isVisible(), false);
    await page.getByText('See source details').click();
    const options = page.locator('[data-section="product-options"]');
    const chart = page.locator('[data-section="size-guide"]');
    assert.equal(await options.getByText('W24 L30').count(), 1);
    assert.equal(await options.getByText('XS').count(), 0);
    assert.equal(await options.locator('.unavailable-size').getByText('W26 L30').count(), 1);
    assert.equal(await chart.locator('td').getByText('XS', { exact: true }).count(), 1);
    assert.equal(await page.getByText('Fit and product details').count(), 0);
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
      window.__summaryRequests = [];
      window.fetch = async (_url, options) => {
        const body = JSON.parse(options.body);
        if (body.task === 'explain') window.__summaryRequests.push(body);
        return { ok: true, json: async () => ({ items: [] }) };
      };
      window.chrome.tabs = { query: async () => [{ id: 19 }] };
      window.chrome.storage = { local: { get: async key => key === 'sizeSceneSession' ? { sizeSceneSession: {
        access_token: 'test-access', refresh_token: 'test-refresh', expires_at: 9999999999
      } } : { measurements: { waistCm: 61, hipCm: 87, inseamCm: 72 } }, set: async () => {} } };
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
    assert.equal(await page.evaluate(() => window.__summaryRequests.length), 1);
    assert.equal(await page.evaluate(() => window.__summaryRequests[0].measurements.waistCm), 61);
    assert.equal(await page.locator('.fit-summary').count(), 0);
    await page.getByRole('button', { name: 'Roomier' }).click();
    assert.equal(await page.locator('.loading-panel').isVisible(), true);
    assert.match(await page.locator('.loading-panel').innerText(), /rechecking available sizes/i);
    assert.equal(await page.locator('[data-section="recommendation"]').count(), 0);
    await page.locator('[data-section="recommendation"] .recommended-size').getByText('W26 L30').waitFor();
    assert.equal(await page.locator('[data-section="recommendation"] .recommended-size').innerText(), 'W26 L30');
    assert.equal(await page.evaluate(() => window.__summaryRequests.length), 2);
    assert.equal(await page.evaluate(() => window.__summaryRequests[1].preference), 'roomier');
    assert.match(await page.locator('.sold-out-notice').innerText(), /sold out/i);
    assert.match(await page.locator('.available-alternative').innerText(), /W26 L32/);
    assert.equal(await page.evaluate(() => window.__scanCalls), 1);
    assert.match(await page.locator('[aria-label="Edit body measurements"]').getAttribute('href'), /measurements\.html$/);
  } finally {
    await browser.close();
  }
});

test('a new product scan starts with As designed after choosing Roomier on the previous product', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.__scanCalls = 0;
      window.__storageWrites = [];
      window.chrome.tabs = { query: async () => [{ id: 19 }] };
      window.chrome.storage = { local: {
        get: async () => ({ measurements: { waistCm: 61, hipCm: 87, inseamCm: 72 }, fitPreference: 'roomier' }),
        set: async value => { window.__storageWrites.push(value); }
      } };
      window.chrome.scripting = { executeScript: async () => {
        window.__scanCalls++;
        return [{ result: {
          page: { store: 'Motel Rocks', title: window.__scanCalls === 1 ? 'First Jeans' : 'Second Jeans', url: `https://shop.example/jeans-${window.__scanCalls}` },
          sizes: { waist: ['24', '25', '26'], length: [], combined: [], other: [], unavailable: { waist: [], length: [], combined: [], other: [] } },
          sizeGuides: [], details: { sizingAdvice: [], fit: [], rise: [], inseam: [], model: [], materials: [] },
          availability: 'Unknown', hasSizingInformation: true
        } }];
      } };
    });
    await page.goto(pathToFileURL(path.join(__dirname, '..', 'popup.html')).href);
    await page.getByText('First Jeans').waitFor();
    assert.equal(await page.getByRole('button', { name: 'As designed' }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Roomier' }).click();
    await page.getByRole('button', { name: 'Roomier' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Roomier' }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Rescan' }).click();
    await page.getByText('Second Jeans').waitFor();
    assert.equal(await page.getByRole('button', { name: 'As designed' }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => window.__storageWrites.length), 0);
  } finally { await browser.close(); }
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
    assert.match(await page.locator('#save-status').innerText(), /saved/i);
  } finally {
    await browser.close();
  }
});

test('measurements page signs in with an email link without changing saved body measurements', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      const saved = { measurements: { waistCm: 61, hipCm: 87, inseamCm: 72 } };
      window.__saved = saved;
      window.chrome.storage = { local: {
        get: async key => typeof key === 'string' ? { [key]: saved[key] } : saved,
        set: async value => Object.assign(saved, value),
        remove: async key => { delete saved[key]; }
      } };
      window.fetch = async url => ({ ok: true, json: async () =>
        String(url).endsWith('/verify') ? { access_token: 'access', refresh_token: 'refresh', expires_in: 3600,
          user: { email: 'jollarae_ngabdi@berkeley.edu' } } : {} });
    });
    await page.goto(pathToFileURL(path.join(__dirname, '..', 'measurements.html')).href);
    await page.getByLabel('Sign-in link or redirect address').fill('https://lskymmiporxposyoybwq.supabase.co/auth/v1/verify?token=hash123&type=email');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByText('Signed in as jollarae_ngabdi@berkeley.edu').waitFor();
    assert.deepEqual(await page.evaluate(() => window.__saved.measurements), { waistCm: 61, hipCm: 87, inseamCm: 72 });
    await page.getByRole('button', { name: 'Sign out' }).click();
    assert.equal(await page.evaluate(() => window.__saved.sizeSceneSession), undefined);
  } finally { await browser.close(); }
});

test('popup gives one concise estimate qualifier when the chart is image-only', async () => {
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
    assert.match(await page.locator('[data-section="recommendation"]').innerText(), /estimate.*listed sizes/i);
    assert.equal(await page.locator('[data-section="size-guide"]').isVisible(), false);
    await page.getByText('Why this size?').click();
    await page.getByText('See source details').click();
    assert.match(await page.locator('[data-section="size-guide"]').innerText(), /view.*guide.*product page/i);
    assert.doesNotMatch(await page.locator('[data-section="size-guide"]').innerText(), /scan again/i);
    assert.doesNotMatch(await page.locator('.size-details').innerText(), /not used|cannot be checked|does not provide a usable/i);
  } finally {
    await browser.close();
  }
});

test('popup reads an AGOLDE chart image and explains the sold-out best fit', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.SizeSceneAIConfig = { enabled: true, endpoint: 'https://example.test/analyze-listing', publishableKey: 'public-key' };
      window.__imageRequest = null;
      window.fetch = async (_url, options) => {
        const body = JSON.parse(options.body);
        if (body.task === 'read-chart-image') {
          window.__imageRequest = body;
          return { ok: true, json: async () => ({ chart: { chartType: 'body', unit: 'in', rows: [
            { size: '23', waist: '23 1/2', hip: '33 1/2' },
            { size: '24', waist: '24 1/2', hip: '34 1/2' },
            { size: '25', waist: '25 1/2', hip: '35 1/2' },
            { size: '32', waist: '32 1/2', hip: '42 1/2' }
          ] } }) };
        }
        return { ok: true, json: async () => ({ items: [] }) };
      };
      window.chrome.tabs = { query: async () => [{ id: 20 }] };
      window.chrome.storage = { local: { get: async key => key === 'sizeSceneSession' ? { sizeSceneSession: {
        access_token: 'test-access', refresh_token: 'test-refresh', expires_at: 9999999999
      } } : { measurements: { waistCm: 61, hipCm: 87, inseamCm: 72 } }, set: async () => {} } };
      window.chrome.scripting = { executeScript: async () => [{ result: {
        page: { store: 'AGOLDE', title: 'Arc Jean Petite 27"', url: 'https://agolde.com/products/arc-jean-petite-loose-wide-27-central' },
        sizes: { waist: ['32'], length: [], combined: [], other: [], unavailable: { waist: ['23', '24', '25'], length: [], combined: [], other: [] } },
        sizeGuides: [], sizeGuideStatus: 'image-only', sizeGuideImage: 'https://cdn.kiwisizing.com/agolde-1615329726892.jpeg',
        details: { sizingAdvice: [], fit: [], rise: [], inseam: [], model: [], materials: [] },
        availability: 'Unknown', hasSizingInformation: true
      } }] };
    });
    await page.goto(pathToFileURL(path.join(__dirname, '..', 'popup.html')).href);
    await page.getByText('Arc Jean Petite 27"').waitFor();
    assert.equal(await page.locator('.recommended-size').innerText(), '24');
    assert.equal(await page.locator('.recommendation h3').innerText(), 'Your recommended size');
    assert.equal(await page.getByText('Estimate · chart read from image').count(), 0);
    assert.match(await page.locator('.recommendation').innerText(), /sold out/i);
    assert.equal(await page.locator('#results > :last-child').innerText(), 'Your size recommendation is based on the sizing details available. Fit may vary by style.');
    assert.deepEqual(await page.evaluate(() => window.__imageRequest.productSizes), ['32', '23', '24', '25']);
    assert.equal(await page.evaluate(() => 'measurements' in window.__imageRequest), false);
    await page.getByText('Why this size?').click();
    await page.getByText('See source details').click();
    assert.match(await page.locator('[data-section="size-guide"]').innerText(), /24.*24\.5 in.*34\.5 in/s);
  } finally { await browser.close(); }
});

test('popup retries an AGOLDE chart image that was not readable on the first pass', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      window.__imageAttempts = 0;
      window.SizeSceneAIConfig = { enabled: true, endpoint: 'https://example.test/analyze-listing', publishableKey: 'public-key' };
      window.fetch = async (_url, options) => {
        const request = JSON.parse(options.body);
        if (request.task !== 'read-chart-image') throw new Error('Unexpected AI request');
        window.__imageAttempts++;
        return { ok: true, json: async () => ({ chart: window.__imageAttempts === 1 ?
          { chartType: 'unknown', unit: 'unknown', rows: [] } :
          { chartType: 'body', unit: 'in', rows: [
            { size: '24', waist: '24 1/2', hip: '34 1/2' },
            { size: '25', waist: '25 1/2', hip: '35 1/2' }
          ] } }) };
      };
      window.chrome.tabs = { query: async () => [{ id: 20 }] };
      window.chrome.storage = { local: { get: async key => key === 'sizeSceneSession' ? { sizeSceneSession: {
        access_token: 'test-access', refresh_token: 'test-refresh', expires_at: 9999999999
      } } : { measurements: { waistCm: 61, hipCm: 87, inseamCm: 72 } }, set: async () => {} } };
      window.chrome.scripting = { executeScript: async ({ files, func }) => {
        if (files?.[0] === 'scanner.js') return [{ result: {
          page: { store: 'AGOLDE', title: 'Arc Jean Petite 27"', url: 'https://agolde.com/products/arc-jean' },
          sizes: { waist: ['24', '25'], length: [], combined: [], other: [], unavailable: { waist: [], length: [], combined: [], other: [] } },
          sizeGuides: [], sizeGuideStatus: 'image-only', sizeGuideImage: 'https://cdn.example.com/agolde-chart.jpg',
          details: { fit: [], rise: [], inseam: [], model: [], materials: [], sizingAdvice: [] }, hasSizingInformation: true
        } }];
        if (files?.[0] === 'page-snapshot.js') return [{ frameId: 0, result: { host: 'agolde.com', items: [],
          chartImages: [{ url: 'https://cdn.example.com/agolde-chart.jpg' }] } }];
        if (files?.[0] === 'size-actions.js') return [{ frameId: 0 }];
        if (func?.name === 'collectInFrame') return [{ frameId: 0, result: [] }];
        throw new Error(`Unexpected script ${func?.name}`);
      } };
    });
    await page.goto(pathToFileURL(path.join(__dirname, '..', 'popup.html')).href);
    await page.locator('.recommended-size').getByText('24').waitFor();
    assert.equal(await page.locator('.recommendation h3').innerText(), 'Your recommended size');
    assert.equal(await page.evaluate(() => window.__imageAttempts), 2);
  } finally { await browser.close(); }
});
