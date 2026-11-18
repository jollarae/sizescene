const test = require('node:test');
const assert = require('node:assert/strict');
const Onboarding = require('../onboarding.js');

test('first open asks for an account', () => {
  assert.equal(Onboarding.nextStep(null, null), 'account');
});

test('signed-in shopper without measurements sees profile setup', () => {
  assert.equal(Onboarding.nextStep({ email: 'shopper@example.com' }, null), 'measurements');
});

test('returning shopper with measurements scans immediately', () => {
  assert.equal(Onboarding.nextStep({ email: 'shopper@example.com' },
    { waistCm: 65, hipCm: 90, heightCm: 160, weightKg: 55 }), 'scan');
});

test('missing height or weight sends shopper to profile setup', () => {
  assert.equal(Onboarding.nextStep({ email: 'shopper@example.com' },
    { waistCm: 65, hipCm: 90, inseamCm: 72 }), 'measurements');
});

test('opens and focuses setup in the current Chrome window', async () => {
  const calls = [];
  const browser = {
    runtime: { getURL: path => `chrome-extension://test/${path}` },
    tabs: {
      query: async options => { calls.push(['query', options]); return [{ id: 7, windowId: 42 }]; },
      create: async options => { calls.push(['create', options]); return { id: 9 }; }
    },
    windows: { update: async (id, options) => { calls.push(['focus', id, options]); } }
  };
  await Onboarding.openSetupTab(browser);
  assert.deepEqual(calls, [
    ['query', { active: true, currentWindow: true }],
    ['create', { url: 'chrome-extension://test/measurements.html?setup=1', active: true, windowId: 42, openerTabId: 7 }],
    ['focus', 42, { focused: true }]
  ]);
});

test('returns to the exact shopping tab and closes setup', async () => {
  const calls = [];
  const browser = {
    tabs: {
      getCurrent: async () => ({ id: 9, openerTabId: 7 }),
      get: async id => { calls.push(['get', id]); return { id, windowId: 42 }; },
      update: async (id, options) => { calls.push(['activate', id, options]); },
      remove: async id => { calls.push(['remove', id]); }
    },
    windows: { update: async (id, options) => { calls.push(['focus', id, options]); } }
  };
  await Onboarding.returnToShopping(browser);
  assert.deepEqual(calls, [
    ['get', 7],
    ['activate', 7, { active: true }],
    ['focus', 42, { focused: true }],
    ['remove', 9]
  ]);
});

test('closes setup if the original shopping tab is gone', async () => {
  const calls = [];
  const browser = {
    tabs: {
      getCurrent: async () => ({ id: 9, openerTabId: 7 }),
      get: async () => { throw new Error('No tab with id 7'); },
      remove: async id => { calls.push(['remove', id]); }
    }
  };
  await Onboarding.returnToShopping(browser);
  assert.deepEqual(calls, [['remove', 9]]);
});
