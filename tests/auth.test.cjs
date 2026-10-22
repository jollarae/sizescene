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
});

test('missing or invalid session returns no token and clears expired credentials', async () => {
  const { data, storage, config } = harness();
  assert.equal(await Auth.getAccessToken({ storage, config }), null);
  data.sizeSceneSession = { access_token: 'expired', refresh_token: 'bad', expires_at: 1 };
  const fetcher = async () => ({ ok: false, json: async () => ({ msg: 'Invalid refresh token' }) });
  assert.equal(await Auth.getAccessToken({ storage, config, fetcher }), null);
  assert.equal(data.sizeSceneSession, undefined);
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
