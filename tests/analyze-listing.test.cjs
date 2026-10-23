const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test('Edge Function authenticates AI tasks, keeps extraction separate from personalized explanation', async () => {
  const originalFetch = globalThis.fetch;
  const originalDeno = globalThis.Deno;
  let handler;
  let modelRequest;
  let signedInEmail = 'jollarae_ngabdi@berkeley.edu';
  globalThis.Deno = {
    serve: callback => { handler = callback; },
    env: { get: name => ({ SUPABASE_URL: 'https://project.example', SUPABASE_ANON_KEY: 'public-key', OPENAI_API_KEY: 'server-only-key' })[name] }
  };
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: 'user-1', email: signedInEmail, email_confirmed_at: '2026-10-21T00:00:00Z' }), { status: 200 });
    modelRequest = JSON.parse(options.body);
    const result = Array.isArray(modelRequest.input) ? { chartType: 'body', unit: 'in', rows: [
      { size: '23', waist: '23 1/2', hip: '33 1/2' }, { size: '24', waist: '24 1/2', hip: '34 1/2' }
    ] } : JSON.parse(modelRequest.input).task === 'explain' ? { items: [{ factId: 'waist', excerpt: 'The retailer’s chart places W24 at about 61 cm.' }] } :
      JSON.parse(modelRequest.input).goal ? { actionId: 'a1' } :
      { productOptionIds: ['e1'], charts: [], fitEvidenceIds: [] };
    return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(result) }] }] }), { status: 200 });
  };
  try {
    await import(pathToFileURL(path.join(__dirname, '..', 'supabase/functions/analyze-listing/index.ts')).href);
    const snapshot = { version: 1, host: 'shop.example', title: 'Jeans', items: [{ id: 'e1', kind: 'option', text: 'Size 24', label: '24' }] };
    const unauthorized = await handler(new Request('https://project.example/functions/v1/analyze-listing', { method: 'POST', body: JSON.stringify(snapshot) }));
    assert.equal(unauthorized.status, 401);
    assert.equal(modelRequest, undefined);
    signedInEmail = 'someone@example.com';
    const otherAccount = await handler(new Request('https://project.example/functions/v1/analyze-listing', {
      method: 'POST', headers: { authorization: 'Bearer other-user-token' }, body: JSON.stringify(snapshot)
    }));
    assert.equal(otherAccount.status, 403);
    assert.equal(modelRequest, undefined);
    signedInEmail = 'jollarae_ngabdi@berkeley.edu';
    const authorized = await handler(new Request('https://project.example/functions/v1/analyze-listing', {
      method: 'POST', headers: { authorization: 'Bearer user-token' }, body: JSON.stringify(snapshot)
    }));
    assert.equal(authorized.status, 200);
    assert.deepEqual((await authorized.json()).extraction.productOptionIds, ['e1']);
    assert.equal(modelRequest.store, false);
    const imageChart = await handler(new Request('https://project.example/functions/v1/analyze-listing', {
      method: 'POST', headers: { authorization: 'Bearer user-token' }, body: JSON.stringify({
        version: 1, task: 'read-chart-image', imageUrl: 'https://cdn.kiwisizing.com/agolde-1615329726892.jpeg',
        productSizes: ['23', '24', '25', '32'], title: 'Arc Jean Petite 27"'
      })
    }));
    assert.equal(imageChart.status, 200);
    assert.deepEqual((await imageChart.json()).chart.rows[1], { size: '24', waist: '24 1/2', hip: '34 1/2' });
    assert.equal(modelRequest.input[0].content[1].type, 'input_image');
    assert.equal(modelRequest.input[0].content[1].image_url, 'https://cdn.kiwisizing.com/agolde-1615329726892.jpeg');
    assert.equal(modelRequest.store, false);
    const invalidImage = await handler(new Request('https://project.example/functions/v1/analyze-listing', {
      method: 'POST', headers: { authorization: 'Bearer user-token' }, body: JSON.stringify({
        version: 1, task: 'read-chart-image', imageUrl: 'http://127.0.0.1/private.png',
        productSizes: ['24'], title: 'Jeans'
      })
    }));
    assert.equal(invalidImage.status, 400);
    const navigation = await handler(new Request('https://project.example/functions/v1/analyze-listing', {
      method: 'POST', headers: { authorization: 'Bearer user-token' }, body: JSON.stringify({
        version: 1, task: 'navigate', host: 'shop.example', title: 'Jeans', goal: 'size-chart',
        actions: [{ id: 'a1', label: 'Find your size', context: 'Product sizing', type: 'button' },
          { id: 'a2', label: 'Add to cart', context: '', type: 'button' }]
      })
    }));
    assert.equal(navigation.status, 200);
    assert.deepEqual(await navigation.json(), { actionId: 'a1' });
    assert.equal(JSON.parse(modelRequest.input).goal, 'size-chart');
    assert.equal('measurements' in JSON.parse(modelRequest.input), false);
    const explanation = await handler(new Request('https://project.example/functions/v1/analyze-listing', {
      method: 'POST', headers: { authorization: 'Bearer user-token' }, body: JSON.stringify({
        version: 1, task: 'explain', size: 'W24 L30', preference: 'as-designed', status: 'recommended',
        measurements: { waistCm: 61, hipCm: 87, inseamCm: 72 },
        facts: [{ id: 'waist', title: 'Waist', kind: 'chart', text: 'Your waist is 61 cm. The retailer’s chart places W24 at about 61 cm.' }]
      })
    }));
    assert.equal(explanation.status, 200);
    assert.deepEqual(await explanation.json(), { items: [{ factId: 'waist', excerpt: 'The retailer’s chart places W24 at about 61 cm.' }] });
    assert.equal(JSON.parse(modelRequest.input).measurements.waistCm, 61);
    assert.equal(modelRequest.store, false);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.Deno = originalDeno;
  }
});
