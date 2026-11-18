const test = require('node:test');
const assert = require('node:assert/strict');
const Profile = require('../profile.js');

function harness({ userId = 'user-1', email = 'shopper@example.com', row = null } = {}) {
  const data = { measurements: { waistCm: 61, hipCm: 87, inseamCm: 72 } };
  const storage = {
    get: async key => ({ [key]: data[key] }),
    set: async object => Object.assign(data, object),
    remove: async key => { delete data[key]; }
  };
  const auth = { getAccessToken: async () => 'access', getSession: async () => ({ user_id: userId, email }) };
  const config = { supabaseUrl: 'https://project.example', publishableKey: 'public-key' };
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'GET') return { ok: true, json: async () => row ? [row] : [] };
    return { ok: true, json: async () => ({}) };
  };
  return { data, storage, auth, config, calls, fetcher };
}

test('loads required and optional measurements from the signed-in account', async () => {
  const h = harness({ row: { user_id: 'user-1', waist_cm: 66, hip_cm: 91, height_cm: 165,
    weight_kg: 56.7, weight_unit: 'lb', inseam_cm: null, thigh_cm: null } });
  assert.deepEqual(await Profile.load(h), { waistCm: 66, hipCm: 91, heightCm: 165,
    weightKg: 56.7, weightUnit: 'lb' });
  assert.equal(h.data.measurements, undefined);
  assert.match(h.calls[0].url, /user_measurements\?select=/);
  assert.equal(h.calls[0].options.headers.Authorization, 'Bearer access');
});

test('loads measurements with the browser fetch bound to its global object', async () => {
  const h = harness({ row: { user_id: 'user-1', waist_cm: 61, hip_cm: 87,
    height_cm: 158, weight_kg: 50 } });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = function (url, options) {
    assert.equal(this, globalThis);
    return h.fetcher(url, options);
  };
  try {
    const profile = await Profile.load({ ...h, fetcher: undefined });
    assert.equal(profile.waistCm, 61);
    assert.equal(profile.heightCm, 158);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('does not give a new shopper the previous local measurements', async () => {
  const h = harness();
  assert.equal(await Profile.load(h), null);
  assert.equal(h.data.measurements, undefined);
  assert.equal(h.calls.length, 1);
});

test('saves measurements with the signed-in account id', async () => {
  const h = harness();
  await Profile.save({ waistCm: 65, hipCm: 90, heightCm: 160, weightKg: 55,
    weightUnit: 'kg' }, h);
  assert.deepEqual(JSON.parse(h.calls[0].options.body), { user_id: 'user-1', waist_cm: 65,
    hip_cm: 90, height_cm: 160, weight_kg: 55, weight_unit: 'kg', inseam_cm: null,
    thigh_cm: null });
  assert.equal(h.calls[0].options.headers.Prefer, 'resolution=merge-duplicates');
  assert.equal(h.data.measurements, undefined);
});

test('does not silently accept a failed cloud save', async () => {
  const h = harness();
  h.fetcher = async () => ({ ok: false, status: 404, json: async () => ({ message: 'Table missing' }) });
  await assert.rejects(Profile.save({ waistCm: 65, hipCm: 90, heightCm: 160, weightKg: 55 }, h), /Table missing/);
});

test('requires height and weight before saving a profile', async () => {
  const h = harness();
  await assert.rejects(Profile.save({ waistCm: 65, hipCm: 90 }, h), /height|weight/i);
  assert.equal(h.calls.length, 0);
});

test('prefills old owner measurements without saving an incomplete profile', async () => {
  const h = harness({ email: 'jollarae_ngabdi@berkeley.edu' });
  assert.deepEqual(await Profile.load(h), { waistCm: 61, hipCm: 87, inseamCm: 72 });
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.data.measurements, { waistCm: 61, hipCm: 87, inseamCm: 72 });
});

test('keeps the original owner measurements for later migration after another account signs in', async () => {
  const h = harness();
  assert.equal(await Profile.load(h), null);
  assert.equal(h.data.measurements, undefined);
  assert.deepEqual(h.data.legacyOwnerMeasurements, { waistCm: 61, hipCm: 87, inseamCm: 72 });
  h.auth.getSession = async () => ({ user_id: 'owner-id', email: 'jollarae_ngabdi@berkeley.edu' });
  assert.deepEqual(await Profile.load(h), { waistCm: 61, hipCm: 87, inseamCm: 72 });
  assert.deepEqual(h.data.legacyOwnerMeasurements, { waistCm: 61, hipCm: 87, inseamCm: 72 });
});

test('loading an existing different account also preserves the old owner profile', async () => {
  const h = harness({ row: { user_id: 'user-1', waist_cm: 66, hip_cm: 91, inseam_cm: 73 } });
  await Profile.load(h);
  assert.deepEqual(h.data.legacyOwnerMeasurements, { waistCm: 61, hipCm: 87, inseamCm: 72 });
});
