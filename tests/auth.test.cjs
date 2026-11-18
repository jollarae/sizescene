const test = require('node:test');
const assert = require('node:assert/strict');
const Auth = require('../auth.js');

function harness(initial = {}) {
  const data = { ...initial };
  const storage = {
    get: async key => ({ [key]: data[key] }),
    set: async value => Object.assign(data, value),
    remove: async key => { delete data[key]; }
  };
  const config = { supabaseUrl: 'https://project.example', publishableKey: 'public-key' };
  return { data, storage, config };
}

test('email code sign-in stores a session and refreshes an expired access token', async () => {
  const { data, storage, config } = harness();
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/otp')) return { ok: true, json: async () => ({}) };
    if (url.endsWith('/verify')) return { ok: true, json: async () => ({
      access_token: 'first-access', refresh_token: 'first-refresh', expires_in: 3600,
      user: { email: 'jollarae_ngabdi@berkeley.edu' }
    }) };
    return { ok: true, json: async () => ({
      access_token: 'second-access', refresh_token: 'second-refresh', expires_in: 3600,
      user: { email: 'jollarae_ngabdi@berkeley.edu' }
    }) };
  };
  await Auth.sendCode('jollarae_ngabdi@berkeley.edu', { storage, config, fetcher });
  await Auth.verifyCode('jollarae_ngabdi@berkeley.edu', '123456', { storage, config, fetcher });
  assert.equal(data.sizeSceneSession.access_token, 'first-access');
  assert.equal(await Auth.getAccessToken({ storage, config, fetcher }), 'first-access');
  data.sizeSceneSession.expires_at = 1;
  assert.equal(await Auth.getAccessToken({ storage, config, fetcher }), 'second-access');
  assert.equal(data.sizeSceneSession.refresh_token, 'second-refresh');
  assert.match(calls[2].url, /grant_type=refresh_token/);
  assert.equal(calls[0].options.headers.apikey, 'public-key');
  assert.equal(JSON.parse(calls[0].options.body).create_user, false);
});

test('missing or invalid session returns no token and clears expired credentials', async () => {
  const { data, storage, config } = harness();
  assert.equal(await Auth.getAccessToken({ storage, config }), null);
  data.sizeSceneSession = { access_token: 'expired', refresh_token: 'bad', expires_at: 1 };
  const fetcher = async () => ({ ok: false, json: async () => ({ msg: 'Invalid refresh token' }) });
  assert.equal(await Auth.getAccessToken({ storage, config, fetcher }), null);
  assert.equal(data.sizeSceneSession, undefined);
});

test('temporary network failure does not forget a returning shopper', async () => {
  const { data, storage, config } = harness({ sizeSceneSession: {
    access_token: 'old', refresh_token: 'valid-refresh', expires_at: 1,
    email: 'shopper@example.com', user_id: 'user-1'
  } });
  const fetcher = async () => { throw new Error('Network unavailable'); };
  await assert.rejects(Auth.getAccessToken({ storage, config, fetcher }), /Network unavailable/);
  assert.equal(data.sizeSceneSession.refresh_token, 'valid-refresh');
});

test('email and password signup stores a persistent session', async () => {
  const { data, storage, config } = harness();
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ access_token: 'new-access', refresh_token: 'new-refresh',
      expires_in: 3600, user: { id: 'user-1', email: 'shopper@example.com' } }) };
  };
  await Auth.signUp('shopper@example.com', 'long-password-123', { storage, config, fetcher });
  assert.match(calls[0].url, /\/auth\/v1\/signup$/);
  assert.deepEqual(calls[0].body, { email: 'shopper@example.com', password: 'long-password-123' });
  assert.equal(data.sizeSceneSession.user_id, 'user-1');
  assert.equal(JSON.stringify(data).includes('long-password-123'), false);
});

test('signup saves the shopper name in account metadata', async () => {
  const { storage, config } = harness();
  let requestBody;
  const fetcher = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ access_token: 'new-access', refresh_token: 'new-refresh',
      expires_in: 3600, user: { id: 'user-1', email: 'shopper@example.com' } }) };
  };
  await Auth.signUp('shopper@example.com', 'long-password-123',
    { storage, config, fetcher, displayName: '  Alex   Rivera  ' });
  assert.deepEqual(requestBody.data, { display_name: 'Alex Rivera' });
});

test('email and password login refreshes without asking for credentials again', async () => {
  const { data, storage, config } = harness();
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    if (url.includes('grant_type=password')) return { ok: true, json: async () => ({
      access_token: 'initial', refresh_token: 'refresh-one', expires_in: 1,
      user: { id: 'user-2', email: 'shopper@example.com' }
    }) };
    return { ok: true, json: async () => ({
      access_token: 'renewed', refresh_token: 'refresh-two', expires_in: 3600,
      user: { id: 'user-2', email: 'shopper@example.com' }
    }) };
  };
  await Auth.signIn('shopper@example.com', 'long-password-123', { storage, config, fetcher });
  data.sizeSceneSession.expires_at = 1;
  assert.equal(await Auth.getAccessToken({ storage, config, fetcher }), 'renewed');
  assert.equal(data.sizeSceneSession.refresh_token, 'refresh-two');
  assert.equal(calls.length, 2);
  assert.equal(JSON.stringify(data).includes('long-password-123'), false);
});

test('a signed-in shopper can set a password on the same account', async () => {
  const { data, storage, config } = harness({ sizeSceneSession: {
    access_token: 'existing-access', refresh_token: 'existing-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    email: 'shopper@example.com', user_id: 'user-1'
  } });
  let request;
  const fetcher = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ id: 'user-1', email: 'shopper@example.com' }) };
  };
  await Auth.updatePassword('new-password-123', { storage, config, fetcher });
  assert.equal(request.url, 'https://project.example/auth/v1/user');
  assert.equal(request.options.method, 'PUT');
  assert.equal(request.options.headers.Authorization, 'Bearer existing-access');
  assert.equal(JSON.parse(request.options.body).password, 'new-password-123');
  assert.equal(JSON.stringify(data).includes('new-password-123'), false);
});

test('a shopper can load and save a profile name on the same account', async () => {
  const { storage, config } = harness({ sizeSceneSession: {
    access_token: 'existing-access', refresh_token: 'existing-refresh',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    email: 'shopper@example.com', user_id: 'user-1'
  } });
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({
      id: 'user-1', email: 'shopper@example.com', user_metadata: { display_name: 'Alex Rivera' }
    }) };
  };
  const options = { storage, config, fetcher };
  assert.equal((await Auth.getUser(options)).user_metadata.display_name, 'Alex Rivera');
  assert.equal((await Auth.updateDisplayName('  Alex   Rivera  ', options)).user_metadata.display_name, 'Alex Rivera');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer existing-access');
  assert.equal(calls[1].options.method, 'PUT');
  assert.deepEqual(JSON.parse(calls[1].options.body), { data: { display_name: 'Alex Rivera' } });
});

test('default Supabase email link signs in without visiting its redirect page', async () => {
  const { data, storage, config } = harness();
  config.ownerEmail = 'jollarae_ngabdi@berkeley.edu';
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({
      access_token: 'access', refresh_token: 'refresh', expires_in: 3600,
      user: { email: config.ownerEmail }
    }) };
  };
  await Auth.verifyLink('https://project.example/auth/v1/verify?token=hash123&type=email&redirect_to=https%3A%2F%2Fexample.com',
    { storage, config, fetcher });
  assert.deepEqual(calls[0].body, { token_hash: 'hash123', type: 'email' });
  assert.equal(data.sizeSceneSession.access_token, 'access');
});

test('sign-in links from another host or account are rejected', async () => {
  const { data, storage, config } = harness();
  config.ownerEmail = 'jollarae_ngabdi@berkeley.edu';
  const fetcher = async () => ({ ok: true, json: async () => ({
    access_token: 'other', refresh_token: 'refresh',
    user: { email: 'another@example.com' }
  }) });
  await assert.rejects(Auth.verifyLink('https://other.example/auth/v1/verify?token=abc&type=email',
    { storage, config, fetcher }), /not a SizeScene/);
  await assert.rejects(Auth.verifyLink('https://project.example/auth/v1/verify?token=abc&type=email',
    { storage, config, fetcher }), /approved test email/);
  assert.equal(data.sizeSceneSession, undefined);
});

test('an already-opened sign-in link can finish from its localhost redirect URL', async () => {
  const { data, storage, config } = harness();
  config.ownerEmail = 'jollarae_ngabdi@berkeley.edu';
  const fetcher = async (url, options) => {
    assert.equal(url, 'https://project.example/auth/v1/user');
    assert.equal(options.headers.authorization, 'Bearer test-access');
    return { ok: true, json: async () => ({ email: config.ownerEmail, email_confirmed_at: '2026-10-21T00:00:00Z' }) };
  };
  const redirect = 'http://localhost:3000/#access_token=test-access&refresh_token=test-refresh&expires_in=3600&token_type=bearer&type=magiclink';
  await Auth.verifyLink(redirect, { storage, config, fetcher });
  assert.equal(data.sizeSceneSession.access_token, 'test-access');
  assert.equal(data.sizeSceneSession.refresh_token, 'test-refresh');
  assert.equal(data.sizeSceneSession.email, config.ownerEmail);
});
