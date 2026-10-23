const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

test('sizing actions open a product dropdown and a nested chart without entering retailer measurements', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<main><h1>Booty Bei Jeans</h1>
      <button id="sizes">Select size</button><button id="finder">Find your size</button>
      <button id="cart">Add to cart</button><div id="options"></div><div id="modal"></div>
      <script>
        document.querySelector('#sizes').addEventListener('click', () => {
          document.querySelector('#options').innerHTML = '<div role="listbox"><div role="option">23/30</div></div>';
        });
        document.querySelector('#finder').addEventListener('click', () => {
          document.querySelector('#modal').innerHTML = '<button id="chart">Size chart</button><input placeholder="Age"><button>Continue</button>';
          document.querySelector('#chart').addEventListener('click', () => {
            document.querySelector('#modal').innerHTML += '<table><tr><th>Size</th><th>Waist</th></tr><tr><td>W23</td><td>59.5</td></tr></table>';
          });
        });
      </script></main>`);
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '..', 'size-actions.js'), 'utf8') });
    const initial = await page.evaluate(() => SizeScenePageActions.collect());
    assert.deepEqual(initial.map(action => action.label), ['Select size', 'Find your size']);
    assert.equal(await page.evaluate(id => SizeScenePageActions.activate(id), initial[0].id), true);
    assert.equal(await page.locator('[role="option"]').innerText(), '23/30');
    const finder = (await page.evaluate(() => SizeScenePageActions.collect())).find(action => action.label === 'Find your size');
    assert.equal(await page.evaluate(id => SizeScenePageActions.activate(id), finder.id), true);
    const chart = (await page.evaluate(() => SizeScenePageActions.collect())).find(action => action.label === 'Size chart');
    assert.equal(await page.evaluate(id => SizeScenePageActions.activate(id), chart.id), true);
    assert.equal(await page.locator('table tr').count(), 2);
    assert.equal(await page.locator('input').inputValue(), '');
    assert.equal(await page.evaluate(() => SizeScenePageActions.activate('unknown')), false);
  } finally { await browser.close(); }
});

test('sizing actions recognize a React-style combobox by its accessible label', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<main><div class="product-size-select"><input role="combobox" aria-label="Select size"></div></main>');
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '..', 'size-actions.js'), 'utf8') });
    assert.deepEqual((await page.evaluate(() => SizeScenePageActions.collect())).map(action => action.label), ['Select size']);
  } finally { await browser.close(); }
});

test('sizing actions ignore controls inside hidden panels', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<main><div style="display:none"><button>Size chart</button></div><button>Find your size</button></main>');
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '..', 'size-actions.js'), 'utf8') });
    assert.deepEqual((await page.evaluate(() => SizeScenePageActions.collect())).map(action => action.label), ['Find your size']);
  } finally { await browser.close(); }
});

test('sizing actions reject submitting buttons and links to another page', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.route('https://example.test/product/jeans', route => route.fulfill({ contentType: 'text/html', body: '<main><form><button>Size chart</button></form><a href="/other#sizes">Size guide</a><a href="#sizes">Find your size</a></main>' }));
    await page.goto('https://example.test/product/jeans');
    await page.setContent('<main><form><button>Size chart</button></form><a href="/other#sizes">Size guide</a><a href="#sizes">Find your size</a></main>');
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '..', 'size-actions.js'), 'utf8') });
    assert.deepEqual((await page.evaluate(() => SizeScenePageActions.collect())).map(action => action.label), ['Find your size']);
  } finally { await browser.close(); }
});

test('sizing actions use an in-page Size Guide link and restore its custom modal', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<main>
      <a id="guide" href="javascript:void(0)">Size Guide</a>
      <a href="javascript:alert('unsafe')">Size chart</a>
      <div role="button" id="finder">Find your size</div>
      <div class="esc-size-guide--popup" style="display:none"><div class="modal_close">✖</div><table><tr><th>Waist</th></tr></table></div>
      <script>
        document.querySelector('#guide').onclick = () => document.querySelector('.esc-size-guide--popup').style.display = 'block';
        document.querySelector('.modal_close').onclick = () => document.querySelector('.esc-size-guide--popup').style.display = 'none';
      </script></main>`);
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '..', 'size-actions.js'), 'utf8') });
    const before = await page.evaluate(() => SizeScenePageActions.panelState());
    const actions = await page.evaluate(() => SizeScenePageActions.collect());
    assert.deepEqual(actions.map(action => action.label), ['Size Guide', 'Find your size']);
    await page.evaluate(id => SizeScenePageActions.activate(id), actions[0].id);
    assert.equal(await page.locator('.esc-size-guide--popup').isVisible(), true);
    await page.evaluate(state => SizeScenePageActions.restorePanels(state), before);
    assert.equal(await page.locator('.esc-size-guide--popup').isVisible(), false);
  } finally { await browser.close(); }
});

test('opening a JavaScript no-op guide link does not trigger a CSP violation', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    const source = fs.readFileSync(path.join(__dirname, '..', 'size-actions.js'), 'utf8');
    await page.route('https://shop.example/**', route => route.fulfill(route.request().url().endsWith('/size-actions.js') ?
      { status: 200, contentType: 'text/javascript', body: source } :
      { status: 200, contentType: 'text/html', headers: { 'content-security-policy': "script-src 'self'" }, body:
        '<main><a href="javascript:void(0)">Size Guide</a><div id="opened"></div></main><script src="/size-actions.js"></script>' }));
    await page.goto('https://shop.example/product/jeans');
    await page.evaluate(() => {
      window.cspViolations = 0;
      document.addEventListener('securitypolicyviolation', () => window.cspViolations++);
      document.querySelector('a').addEventListener('click', () => { document.querySelector('#opened').textContent = 'Guide opened'; });
    });
    const guide = (await page.evaluate(() => SizeScenePageActions.collect()))[0];
    await page.evaluate(id => SizeScenePageActions.activate(id), guide.id);
    assert.equal(await page.locator('#opened').innerText(), 'Guide opened');
    assert.equal(await page.evaluate(() => window.cspViolations), 0);
  } finally { await browser.close(); }
});

test('sizing actions restore a newly opened fit quiz without closing a preexisting guide', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<main>
      <div class="esc-size-guide--popup" style="display:block"><div class="modal_close">✖</div></div>
      <div role="button" id="finder">Find your size</div>
      <script>
        document.querySelector('#finder').onclick = () => {
          const overlay = document.createElement('div');
          overlay.id = 'es-background'; overlay.setAttribute('role', 'dialog');
          overlay.setAttribute('aria-label', 'Fit Quiz Size Advisor');
          document.body.append(overlay);
        };
        document.addEventListener('keydown', event => {
          if (event.key === 'Escape') document.querySelector('#es-background')?.remove();
        });
      </script></main>`);
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '..', 'size-actions.js'), 'utf8') });
    const before = await page.evaluate(() => SizeScenePageActions.panelState());
    const finder = (await page.evaluate(() => SizeScenePageActions.collect())).find(action => action.label === 'Find your size');
    await page.evaluate(id => SizeScenePageActions.activate(id), finder.id);
    assert.equal(await page.locator('#es-background').count(), 1);
    await page.evaluate(state => SizeScenePageActions.restorePanels(state), before);
    assert.equal(await page.locator('#es-background').count(), 0);
    assert.equal(await page.locator('.esc-size-guide--popup').isVisible(), true);
  } finally { await browser.close(); }
});

test('sizing actions close only the newly opened sizing dialog', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<main>
      <button id="select-size">Select size</button>
      <div role="dialog" aria-label="Choose a size" id="already-open"><button aria-label="Close">Close</button></div>
      <div role="dialog" aria-label="Choose a size" id="new-dialog" style="display:none"><button aria-label="Close">Close</button></div>
      <script>
        document.querySelector('#select-size').onclick = () => document.querySelector('#new-dialog').style.display = 'block';
        document.querySelector('#new-dialog button').onclick = () => document.querySelector('#new-dialog').style.display = 'none';
        document.querySelector('#already-open button').onclick = () => document.querySelector('#already-open').style.display = 'none';
      </script></main>`);
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '..', 'size-actions.js'), 'utf8') });
    const before = await page.evaluate(() => SizeScenePageActions.panelState());
    const select = (await page.evaluate(() => SizeScenePageActions.collect())).find(action => action.label === 'Select size');
    await page.evaluate(id => SizeScenePageActions.activate(id), select.id);
    assert.equal(await page.locator('#new-dialog').isVisible(), true);
    await page.evaluate(state => SizeScenePageActions.restorePanels(state), before);
    assert.equal(await page.locator('#new-dialog').isVisible(), false);
    assert.equal(await page.locator('#already-open').isVisible(), true);
  } finally { await browser.close(); }
});

test('sizing actions restore the selected tab in a panel that was already open', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<main><div role="dialog" aria-label="Find your size">
      <div role="tablist"><button role="tab" aria-selected="true">Fit quiz</button>
      <button role="tab" aria-selected="false">Size chart</button></div>
      <script>
        document.querySelectorAll('[role="tab"]').forEach(tab => tab.onclick = () => {
          document.querySelectorAll('[role="tab"]').forEach(other => other.setAttribute('aria-selected', String(other === tab)));
        });
      </script></div></main>`);
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '..', 'size-actions.js'), 'utf8') });
    const before = await page.evaluate(() => SizeScenePageActions.panelState());
    const chart = (await page.evaluate(() => SizeScenePageActions.collect())).find(action => action.label === 'Size chart');
    await page.evaluate(id => SizeScenePageActions.activate(id), chart.id);
    assert.equal(await page.getByRole('tab', { name: 'Size chart' }).getAttribute('aria-selected'), 'true');
    await page.evaluate(state => SizeScenePageActions.restorePanels(state), before);
    assert.equal(await page.getByRole('tab', { name: 'Fit quiz' }).getAttribute('aria-selected'), 'true');
    assert.equal(await page.getByRole('dialog', { name: 'Find your size' }).isVisible(), true);
  } finally { await browser.close(); }
});

test('sizing actions unwind a nested Levi size guide and how-to-measure view', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<main>
      <button id="open-guide">Size Guide</button>
      <div class="modal" role="dialog" aria-label="Find Your Size" style="display:none">
        <h2 id="modal-header">Size Guide</h2>
        <button class="modal__close" aria-label="Close Modal">×</button>
        <button id="measure">How To Measure</button>
        <button class="how-to-measure__back-button" style="display:none">Size Guide</button>
      </div>
      <script>
        const modal = document.querySelector('.modal');
        const measure = document.querySelector('#measure');
        const back = document.querySelector('.how-to-measure__back-button');
        document.querySelector('#open-guide').onclick = () => modal.style.display = 'block';
        document.querySelector('.modal__close').onclick = () => modal.style.display = 'none';
        measure.onclick = () => {
          document.querySelector('#modal-header').textContent = 'How To Measure';
          measure.style.display = 'none'; back.style.display = 'block';
        };
        back.onclick = () => {
          document.querySelector('#modal-header').textContent = 'Size Guide';
          measure.style.display = 'block'; back.style.display = 'none';
        };
      </script></main>`);
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '..', 'size-actions.js'), 'utf8') });
    const initial = await page.evaluate(() => SizeScenePageActions.panelState());
    await page.locator('#open-guide').click();
    const guide = await page.evaluate(() => SizeScenePageActions.panelState());
    await page.locator('#measure').click();
    assert.equal(await page.locator('#modal-header').innerText(), 'How To Measure');
    await page.evaluate(state => SizeScenePageActions.restorePanels(state), guide);
    assert.equal(await page.locator('#modal-header').innerText(), 'Size Guide');
    assert.equal(await page.locator('.modal').isVisible(), true);
    await page.evaluate(state => SizeScenePageActions.restorePanels(state), initial);
    assert.equal(await page.locator('.modal').isVisible(), false);

    await page.locator('#open-guide').click();
    const preexistingGuide = await page.evaluate(() => SizeScenePageActions.panelState());
    await page.locator('#measure').click();
    await page.evaluate(state => SizeScenePageActions.restorePanels(state), preexistingGuide);
    assert.equal(await page.locator('#modal-header').innerText(), 'Size Guide');
    assert.equal(await page.locator('.modal').isVisible(), true);
  } finally { await browser.close(); }
});

test('sizing actions can restore a dropdown and a sizing panel', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<main>
      <input role="combobox" aria-label="Select size" aria-expanded="true">
      <div role="dialog" aria-label="Find your size"><button aria-label="Back">Back</button><button aria-label="Close">Close</button></div>
      <script>
        document.querySelector('[role="combobox"]').addEventListener('keydown', event => {
          if (event.key === 'Escape') event.currentTarget.setAttribute('aria-expanded', 'false');
        });
        document.querySelector('[aria-label="Back"]').addEventListener('click', () => document.querySelector('[role="dialog"]').dataset.view = 'initial');
        document.querySelector('[aria-label="Close"]').addEventListener('click', () => document.querySelector('[role="dialog"]').remove());
      </script></main>`);
    await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '..', 'size-actions.js'), 'utf8') });
    assert.equal(await page.evaluate(() => SizeScenePageActions.collapseSize('Select size')), true);
    assert.equal(await page.locator('[role="combobox"]').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.evaluate(() => SizeScenePageActions.back()), true);
    assert.equal(await page.locator('[role="dialog"]').getAttribute('data-view'), 'initial');
    assert.equal(await page.evaluate(() => SizeScenePageActions.closePanel()), true);
    assert.equal(await page.locator('[role="dialog"]').count(), 0);
  } finally { await browser.close(); }
});
