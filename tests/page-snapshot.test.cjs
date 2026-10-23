const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

test('page snapshot separates selectable sizes from chart rows and excludes review copy', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<main><h1>Cigarette Jeans</h1>
      <fieldset><legend>Size</legend><button>24</button><button disabled>26</button></fieldset>
      <section class="size-chart"><h2>Body size chart</h2><table>
        <tr><th>Size</th><th>Waist</th><th>Hip</th></tr>
        <tr><td>XS</td><td>61cm</td><td>87cm</td></tr></table></section>
      <p>Slim fit with straight leg.</p>
      <section class="reviews"><p>My waist is 70cm and I bought size 30.</p></section></main>`);
    const source = fs.readFileSync(path.join(__dirname, '..', 'page-snapshot.js'), 'utf8');
    const snapshot = await page.evaluate(source);
    assert.deepEqual(snapshot.items.filter(item => item.kind === 'option').map(item => [item.label, item.availability]),
      [['24', 'available'], ['26', 'unavailable']]);
    assert.ok(snapshot.items.some(item => item.kind === 'chart' && item.text.includes('XS | 61cm | 87cm')));
    assert.equal(snapshot.items.some(item => item.text.includes('My waist is 70cm')), false);
  } finally { await browser.close(); }
});

test('page snapshot includes hidden retailer guide tables with their category headings', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<main><h1>Agnes Jeans</h1><fieldset><legend>Size</legend><button>XXS</button></fieldset>
      <div hidden><h3>Swimwear</h3><table><tr><th>Measurement</th><th>XXS</th></tr><tr><th>Waist</th><td>50 - 54 cm</td></tr></table>
      <h3>Apparel</h3><table><tr><th>Measurement</th><th>XXS</th></tr><tr><th>Waist</th><td><span data-unit="cm">59 - 63</span><span data-unit="in">23 - 25</span></td></tr></table></div></main>`);
    const source = fs.readFileSync(path.join(__dirname, '..', 'page-snapshot.js'), 'utf8');
    const snapshot = await page.evaluate(source);
    const charts = snapshot.items.filter(item => item.kind === 'chart');
    assert.equal(charts.length, 2);
    assert.equal(charts.find(item => item.text.includes('59 - 63')).context, 'Apparel');
    assert.match(charts.find(item => item.context === 'Apparel').text, /59 - 63 cm/);
    assert.doesNotMatch(charts.find(item => item.context === 'Apparel').text, /6323/);
  } finally { await browser.close(); }
});

test('page snapshot reads a linked size guide on the same retailer site', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.route('https://shop.example/**', route => route.fulfill({ status: 200, contentType: 'text/html', body:
      route.request().url().endsWith('/pages/size-guide') ?
        '<main><h2>Jeans body size chart</h2><table><tr><th>Size</th><th>Waist (cm)</th><th>Hip (cm)</th></tr><tr><td>XS</td><td>61</td><td>87</td></tr></table></main>' :
        '<main><h1>Blue Jeans</h1><button>XS</button><a href="/pages/size-guide">Size Guide</a><a href="https://elsewhere.example/size-guide">Size Guide elsewhere</a></main>' }));
    await page.goto('https://shop.example/products/blue-jeans');
    const source = fs.readFileSync(path.join(__dirname, '..', 'page-snapshot.js'), 'utf8');
    const snapshot = await page.evaluate(source);
    assert.ok(snapshot.items.some(item => item.kind === 'chart' && item.text.includes('XS | 61 | 87')));
    assert.equal(snapshot.items.filter(item => item.kind === 'chart').length, 1);
  } finally { await browser.close(); }
});

test('page snapshot keeps Weekday slash sizes and their stock status separate from chart rows', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<main><h1>Booty Bei Jeans</h1><div class="product-size-select"><div role="listbox">
      <div role="option">23/30</div><div role="option">24/30</div>
      <div role="option">26/34 <span>OUT OF STOCK - NOTIFY ME</span></div>
    </div></div><section class="size-chart"><table><tr><th>Size</th><th>Waist</th></tr>
      <tr><td>W23</td><td>59.5</td></tr></table></section></main>`);
    const source = fs.readFileSync(path.join(__dirname, '..', 'page-snapshot.js'), 'utf8');
    const snapshot = await page.evaluate(source);
    assert.deepEqual(snapshot.items.filter(item => item.kind === 'option').map(item => [item.label, item.availability]),
      [['23/30', 'available'], ['24/30', 'available'], ['26/34', 'unavailable']]);
    assert.equal(snapshot.items.some(item => item.kind === 'option' && item.label === 'W23'), false);
  } finally { await browser.close(); }
});

test('page snapshot reads an opened jeans guide modal outside main but ignores its hidden duplicates', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<main><h1>Extra Wide Jeans</h1><button>W24 L30</button></main>
      <div class="esc-size-guide--popup" style="display:none"><h5>Old guide</h5><table>
        <tr><th>Size</th><th>Waist</th></tr><tr><td>XL</td><td>99cm</td></tr></table></div>
      <div class="esc-size-guide--popup" style="display:block"><h5>Jeans Size Guide</h5><table>
        <tr><th>Size</th><th>Waist</th></tr><tr><td>XXS</td><td>64cm</td></tr></table></div>`);
    const snapshot = await page.evaluate(fs.readFileSync(path.join(__dirname, '..', 'page-snapshot.js'), 'utf8'));
    const charts = snapshot.items.filter(item => item.kind === 'chart');
    assert.equal(charts.length, 1);
    assert.match(charts[0].text, /XXS \| 64cm/);
    assert.equal(charts[0].context, 'Jeans Size Guide');
  } finally { await browser.close(); }
});

test('page snapshot captures a visible retailer chart image but skips hidden copies', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<main><h1>Arc Jean Petite 27"</h1><button>24</button></main>
      <div class="kiwi-sizing-modal" style="display:none"><img src="https://example.com/old-chart.jpg"></div>
      <div class="kiwi-sizing-modal" style="display:block"><img src="https://example.com/body-chart.jpg"></div>`);
    const snapshot = await page.evaluate(fs.readFileSync(path.join(__dirname, '..', 'page-snapshot.js'), 'utf8'));
    assert.deepEqual(snapshot.chartImages.map(image => image.url), ['https://example.com/body-chart.jpg']);
  } finally { await browser.close(); }
});

test('page snapshot excludes letter sizes from Motel recommended-product quick add cards', async () => {
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<main><h1>Roomy Extra Wide Low Rise Jeans</h1>
      <product-form id="productForm" class="product-form"><product-button-option name="Size">
        <label><input type="radio" value="W24 L30">W24 L30</label>
        <label><input type="radio" value="W26 L30">W26 L30</label>
      </product-button-option></product-form>
      <section class="recommended-products"><product-card><product-form id="productForm" class="product-form product-form--quick">
        <product-button-option name="Size"><label><input type="radio" value="XS">XS</label></product-button-option>
      </product-form></product-card></section></main>`);
    const snapshot = await page.evaluate(fs.readFileSync(path.join(__dirname, '..', 'page-snapshot.js'), 'utf8'));
    assert.deepEqual([...new Set(snapshot.items.filter(item => item.kind === 'option').map(item => item.label))],
      ['W24 L30', 'W26 L30']);
  } finally { await browser.close(); }
});
