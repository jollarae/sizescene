const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test('Edge Function requires a user session and sends only page evidence to OpenAI', async () => {
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
    const result = JSON.parse(modelRequest.input).goal ? { actionId: 'a1' } :
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
    assert.equal(JSON.parse(modelRequest.input).items[0].text, 'Size 24');
    assert.equal('measurements' in JSON.parse(modelRequest.input), false);
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
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.Deno = originalDeno;
  }
});
