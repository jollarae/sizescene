const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const scanner = fs.readFileSync(path.join(__dirname, '..', 'scanner.js'), 'utf8');
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

async function scan(html, url) {
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto(url);
    return await page.evaluate(scanner);
  } finally {
    await browser.close();
  }
}

test('Levi listing includes waist and length choices, size chart, and fit advice', async () => {
  const result = await scan(`
    <main>
      <h1>Low Loose Women's Jeans</h1>
      <div>Waist <button>23</button><button>24</button><button>25</button></div>
      <div>Length <button>30</button><button>32</button><button>34</button></div>
      <section><h2>Size Guide</h2><table><tr><th>Jean Size</th><th>Waist (in)</th><th>Hip (in)</th></tr><tr><td>24</td><td>25.25</td><td>34</td></tr></table></section>
      <div><h2>How it Fits</h2><p>Low rise. Relaxed through the hip and thigh. Runs a bit small; buy one or two sizes up.</p></div>
      <div><h2>Composition</h2><p>100% Cotton. Non-stretch.</p></div>
      <p>Model is 5'9" with a 27" waist. They are wearing a size 27 x 30.</p>
    </main>`, 'https://www.levi.com/US/en_US/p/A55660044');
  assert.equal(result.page.store, "Levi's");
  assert.deepEqual(result.sizes.waist, ['23', '24', '25']);
  assert.deepEqual(result.sizes.length, ['30', '32', '34']);
  assert.equal(result.sizeGuides[0].rows[0][1], '25.25');
  assert.ok(result.details.sizingAdvice.some(x => x.includes('Runs a bit small')));
  assert.ok(result.details.fit.some(x => x.includes('Relaxed through the hip')));
  assert.ok(result.details.materials.some(x => x.includes('100% Cotton')));
  assert.ok(result.details.model.some(x => x.includes('27 x 30')));
});

test('Levi radio labels and dialog chart are scanned without leaving the guide open', async () => {
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `
      <div id="pdp-product-content"><h1>Low Loose Women's Jeans</h1>
        <button role="radio" id="waist_0" aria-label="Waist 23" aria-disabled="false"><div>23</div></button>
        <button role="radio" id="waist_1" aria-label="Waist 24" aria-disabled="false"><div>24</div></button>
        <button role="radio" id="waist_2" aria-label="Waist 25" aria-disabled="true"><div>25</div></button>
        <button role="radio" id="length_0" aria-label="Length 30"><div>30</div></button>
        <button role="radio" id="length_1" aria-label="Length 32"><div>32</div></button>
        <a class="pdp-size-guide__link" aria-label="Size Guide" role="button">Size Guide</a>
      </div>
      <section><h2>About this Style</h2><p>This pair runs a bit small. We suggest buying one or two sizes up.</p></section>
      <script>
        document.querySelector('.pdp-size-guide__link').addEventListener('click', () => {
          const dialog = document.createElement('div');
          dialog.setAttribute('role', 'dialog');
          dialog.setAttribute('aria-label', 'Find Your Size');
          dialog.innerHTML = '<button class="modal__close" aria-label="Close Modal">Close</button><table><caption>FIND YOUR LEVI&#39;S WAIST</caption><tr><th>Levi&#39;s Size</th><th>23</th><th>24</th><th>25</th></tr><tr><th>Your Waist (in.)</th><td>24.25</td><td>25.25</td><td>26.25</td></tr><tr><th>Your Hip (in.)</th><td>33</td><td>34</td><td>35</td></tr><tr><th>Your Thigh (in.)</th><td>18.75</td><td>19.38</td><td>20</td></tr></table>';
          dialog.querySelector('button').addEventListener('click', () => dialog.remove());
          document.body.append(dialog);
        });
      </script>` }));
    await page.goto('https://www.levi.com/US/en_US/p/A55660028');
    const result = await page.evaluate(scanner);
    assert.deepEqual(result.sizes.waist, ['23', '24']);
    assert.deepEqual(result.sizes.unavailable.waist, ['25']);
    assert.deepEqual(result.sizes.length, ['30', '32']);
    assert.deepEqual(result.sizeGuides[0].headers, ['Size', 'Your Waist (in.)', 'Your Hip (in.)', 'Your Thigh (in.)']);
    assert.deepEqual(result.sizeGuides[0].rows[1], ['24', '25.25', '34', '19.38']);
    assert.equal(await page.locator('[role="dialog"]').count(), 0);
  } finally {
    await browser.close();
  }
});

test('AGOLDE size dropdown and image-only chart are reported without losing product details', async () => {
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `
      <main><h1>Romney Jean (Weightless) in Vanta</h1>
        <div class="variant-option"><label>Size</label><select name="options[Size]">
          <option value="23">23</option><option value="24">24</option><option value="25">25</option>
          <option value="34">34 - Unavailable</option>
        </select></div>
        <span class="ks-chart-modal-link" role="button">Size Chart</span>
        <p>The Romney Jean is designed with a mid-rise waist and a close fit through the leg. Crafted from non-stretch denim.</p>
        <p><strong>This fit is true to size.</strong></p>
        <details><summary>MORE DETAILS</summary><p><strong>Rise:</strong> 10 3/4"<br><strong>Inseam:</strong> 29"<br><strong>Model is 5'9" and is wearing a Size 27</strong><br><strong>Fabric:</strong> 100% Cotton</p></details>
        <script>
          document.querySelector('.ks-chart-modal-link').addEventListener('click', () => {
            const dialog = document.createElement('div');
            dialog.setAttribute('role', 'dialog');
            dialog.className = 'kiwi-sizing-modal';
            dialog.innerHTML = '<button class="ks-modal-close">Close</button><img class="ks-image" src="https://example.com/chart.jpg" alt="">';
            dialog.querySelector('button').addEventListener('click', () => dialog.remove());
            document.body.append(dialog);
          });
        </script>
      </main>` }));
    await page.goto('https://agolde.com/products/romney-mid-rise-vintage-straight-leg-vanta');
    const result = await page.evaluate(scanner);
    assert.equal(result.page.store, 'AGOLDE');
    assert.deepEqual(result.sizes.waist, ['23', '24', '25']);
    assert.deepEqual(result.sizes.unavailable.waist, ['34']);
    assert.equal(result.sizeGuides.length, 0);
    assert.equal(result.sizeGuideStatus, 'image-only');
    assert.ok(result.details.sizingAdvice.some(x => /true to size/i.test(x)));
    assert.ok(result.details.inseam.some(x => /29"/.test(x)));
    assert.ok(result.details.model.some(x => /size 27/i.test(x)));
    assert.ok(result.details.materials.some(x => /100% Cotton/i.test(x)));
    assert.equal(await page.locator('[role="dialog"]').count(), 0);
  } finally {
    await browser.close();
  }
});

test('AGOLDE uses its visible product name instead of the lowercase SEO title', async () => {
  const result = await scan(`<title>arc jean petite loose wide 27 central – AGOLDE</title>
    <meta property="og:title" content="arc jean petite loose wide 27 central">
    <main><div id="ProductInformation-template__main" class="product-details">
      <div class="group-block-content layout-panel-flex--row"><div><div style="font-size: 20px; text-transform: uppercase; font-weight: bold">Arc Jean Petite 27"</div></div><div>$268</div></div>
      <select name="options[Size]"><option value="23">23 - Unavailable</option><option value="24">24 - Unavailable</option><option value="32">32</option></select>
    </div></main>`, 'https://agolde.com/products/arc-jean-petite-loose-wide-27-central');
  assert.equal(result.page.title, 'Arc Jean Petite 27"');
  assert.deepEqual(result.sizes.unavailable.waist, ['23', '24']);
  assert.deepEqual(result.sizes.waist, ['32']);
});

test('scanner includes the listing image when the page provides one', async () => {
  const result = await scan(`<meta property="og:image" content="https://example.com/jeans.jpg">
    <main><h1>Blue Jeans</h1><button>W24 L30</button></main>`,
  'https://us.motelrocks.com/products/blue-jeans');
  assert.equal(result.page.image, 'https://example.com/jeans.jpg');
});

test('a malformed listing image does not prevent sizing scan', async () => {
  const result = await scan(`<meta property="og:image" content="http://[">
    <main><h1>Blue Jeans</h1><button>W24 L30</button></main>`,
  'https://us.motelrocks.com/products/blue-jeans');
  assert.equal(result.page.image, null);
  assert.deepEqual(result.sizes.combined, ['W24 L30']);
});

test('Uniqlo listing captures inch sizes and hidden body and product charts', async () => {
  const result = await scan(`
    <main><h1>Barrel Jeans</h1>
      <div>Size: WOMEN 24inch <label><input type="checkbox" aria-label="22inch">22inch</label><label><input type="checkbox" aria-label="24inch" checked>24inch</label></div>
      <div hidden><h2>Size Guide</h2><h3>Body Size</h3><table><tr><th>Size</th><th>Waist</th></tr><tr><td>24inch</td><td>24</td></tr></table>
      <h3>Product Size</h3><table><tr><th>Size</th><th>Inseam</th></tr><tr><td>24inch</td><td>31</td></tr></table></div>
      <h2>Description</h2><p>Softly curved silhouette with a high waist and volume at the sides.</p>
      <h2>Reviews</h2><p>My waist is 26 and I wear a 30. Helpful review!</p>
    </main>`, 'https://www.uniqlo.com/us/en/products/E479000-000/00');
  assert.equal(result.page.store, 'UNIQLO');
  assert.deepEqual(result.sizes.waist, ['22inch', '24inch']);
  assert.equal(result.sizeGuides.length, 2);
  assert.equal(result.sizeGuides[0].rows[0][0], '24inch');
  assert.equal(result.sizeGuides[1].rows[0][1], '31');
  assert.ok(result.details.rise.some(x => x.includes('high waist')));
  assert.ok(!JSON.stringify(result.details).includes('Helpful review'));
});

test('Motel listing captures combined W/L variants and sold-out status', async () => {
  const result = await scan(`
    <main><h1>Ripped Ultra Low Rise Flare Jeans In Dirty Green</h1>
      <button>Size Please Select A Size</button>
      <div><button>W24 L30</button><button>W24 L32</button><button>W26 L30</button></div>
      <button disabled>SOLD OUT</button><p>COMING SOON</p>
      <h2>PRODUCT INFORMATION</h2><p>Ultra low waist fit. Flared leg silhouette. Model wears size W26/L34 and is 5'9.</p>
      <h2>FABRIC DETAILS & CARE</h2><p>80% COTTON 20% RECYCLED COTTON</p>
    </main>`, 'https://us.motelrocks.com/products/ripped-ultra-lr-flare-dirty-green');
  assert.equal(result.page.store, 'Motel Rocks');
  assert.deepEqual(result.sizes.combined, ['W24 L30', 'W24 L32', 'W26 L30']);
  assert.equal(result.availability, 'Sold out');
  assert.ok(result.details.rise.some(x => x.includes('Ultra low waist')));
  assert.ok(result.details.model.some(x => x.includes('W26/L34')));
});

test('unrelated page returns a clear empty scan', async () => {
  const result = await scan('<main><h1>Welcome</h1><p>Nothing for sale here.</p></main>', 'https://example.com/');
  assert.equal(result.page.store, 'Other');
  assert.deepEqual(result.sizes.waist, []);
  assert.deepEqual(result.sizeGuides, []);
  assert.equal(result.hasSizingInformation, false);
});

test('plain product detail blocks are captured without review text', async () => {
  const result = await scan(`
    <main><h1>Roomy Jeans</h1>
      <div class="product-information"><div>Low rise, wide leg fit</div><div>Model wears size W26/L34 and is 5'9</div></div>
      <div class="fabric-details"><div>100% COTTON</div></div>
      <h2>Reviews</h2><div class="review"><div>Low rise but super itchy cotton</div></div>
    </main>`, 'https://us.motelrocks.com/products/low-rise-roomy-true-white');
  assert.ok(result.details.rise.some(x => x.includes('Low rise, wide leg fit')));
  assert.ok(result.details.model.some(x => x.includes('W26/L34')));
  assert.ok(result.details.materials.some(x => x.includes('100% COTTON')));
  assert.ok(!JSON.stringify(result.details).includes('super itchy'));
});

test('mixed Motel product copy is split into distinct facts without repetition', async () => {
  const result = await scan(`
    <main><h1>True White Roomy Jeans</h1>
      <p>• True white denim fabric• Contains recycled cotton• Low rise waistband• Wide leg fit• 5 pocket styling, branded back patch• Button, rivets and a zip fly• Complete the look with Alon top• Model wears size W26L34 and is 5'9Please note, denim colour may vary.</p>
      <p>100% COTTON</p>
    </main>`, 'https://us.motelrocks.com/products/low-rise-roomy-true-white');
  assert.deepEqual(result.details.rise, ['Low rise waistband']);
  assert.deepEqual(result.details.fit, ['Wide leg fit']);
  assert.deepEqual(result.details.model, ["Model wears size W26L34 and is 5'9"]);
  assert.deepEqual(result.details.materials, ['True white denim fabric', 'Contains recycled cotton', '100% COTTON']);
  assert.ok(!JSON.stringify(result.details).includes('Complete the look'));
});

test('a layout table containing product copy is not presented as a size chart', async () => {
  const result = await scan(`
    <main><h1>True White Roomy Jeans</h1>
      <section><h2>Fit Guide</h2><table><tr><td>Low rise waistband • Wide leg fit • Model wears W26/L34</td></tr></table></section>
    </main>`, 'https://us.motelrocks.com/products/low-rise-roomy-true-white');
  assert.deepEqual(result.sizeGuides, []);
});

test('repeated centimeter and inch size charts are each shown once', async () => {
  const centimeter = `<table><tr><th>SIZE</th><th>USA</th><th>WAIST</th><th>SHORT LEG</th></tr>
    <tr><td>XXS</td><td>2</td><td>64cm</td><td>76cm</td></tr>
    <tr><td>XS</td><td>4</td><td>69cm</td><td>76cm</td></tr></table>`;
  const inches = `<table><tr><th>SIZE</th><th>USA</th><th>WAIST</th><th>SHORT LEG</th></tr>
    <tr><td>XXS</td><td>2</td><td>24"</td><td>30"</td></tr>
    <tr><td>XS</td><td>4</td><td>26"</td><td>30"</td></tr></table>`;
  const result = await scan(`<main><h1>Roomy Jeans</h1>${centimeter}${inches}
    <div hidden>${centimeter}${inches}</div></main>`,
  'https://us.motelrocks.com/products/low-rise-roomy-true-white');
  assert.equal(result.sizeGuides.length, 2);
  assert.match(result.sizeGuides[0].title, /cm|centimeter/i);
  assert.match(result.sizeGuides[1].title, /inch/i);
  assert.equal(result.sizeGuides[0].rows[0][2], '64cm');
  assert.equal(result.sizeGuides[1].rows[0][2], '24"');
});

test('Motel W/L purchase options stay separate from XS chart labels and unavailable sizes', async () => {
  const result = await scan(`
    <main><h1>True White Roomy Jeans</h1>
      <div class="product-options"><button>W24 L30</button><button>W24 L32</button><button disabled>W26 L30</button></div>
      <section><h2>Size Guide</h2><table><tr><th>Size</th><th>Waist</th><th>Short Leg</th></tr>
        <tr><td><button>XS</button></td><td>69 cm</td><td>30 in</td></tr>
        <tr><td><button>S</button></td><td>74 cm</td><td>30 in</td></tr>
      </table></section>
    </main>`, 'https://us.motelrocks.com/products/low-rise-roomy-true-white');
  assert.deepEqual(result.sizes.combined, ['W24 L30', 'W24 L32']);
  assert.deepEqual(result.sizes.unavailable.combined, ['W26 L30']);
  assert.deepEqual(result.sizes.waist, []);
  assert.equal(result.sizeGuides[0].rows[0][0], 'XS');
});

test('Motel uses the main product form W/L radios, not hidden alpha or recommended-product controls', async () => {
  const result = await scan(`
    <main><h1>True White Roomy Jeans</h1>
      <product-form id="productForm"><product-button-option name="Size">
        <div class="product-button-option__option-group is-drawer" style="visibility:hidden">
          <div class="radio__container"><input type="radio" value="W24 L30" aria-label="W24 L30 In Stock"><label>W24 L30</label></div>
          <div class="radio__container product-button-option__button-item--out-of-stock"><input type="radio" value="W26 L30" aria-label="W26 L30 Out of Stock"><label>W26 L30</label></div>
        </div>
      </product-button-option></product-form>
      <fake-dropdown><button data-value="XXS" style="visibility:hidden">XXS</button><button data-value="XS" style="visibility:hidden">XS</button></fake-dropdown>
      <section class="recommended-products"><button>W36 L34</button></section>
    </main>`, 'https://us.motelrocks.com/products/low-rise-roomy-true-white');
  assert.deepEqual(result.sizes.combined, ['W24 L30']);
  assert.deepEqual(result.sizes.unavailable.combined, ['W26 L30']);
  assert.deepEqual(result.sizes.waist, []);
});

test('a crossed-out product size is recorded as unavailable', async () => {
  const result = await scan(`
    <main><h1>Roomy Jeans</h1><div class="product-options">
      <button>W24 L30</button><button style="text-decoration: line-through">W26 L30</button>
    </div></main>`, 'https://us.motelrocks.com/products/low-rise-roomy-true-white');
  assert.deepEqual(result.sizes.combined, ['W24 L30']);
  assert.deepEqual(result.sizes.unavailable.combined, ['W26 L30']);
});
