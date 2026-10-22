const test = require('node:test');
const assert = require('node:assert/strict');
const Guided = require('../guided-scan.js');

test('guided scan opens the direct Size Guide before a fit quiz and restores the page', async () => {
  let guideOpen = false;
  let finderOpen = false;
  const sent = [];
  const chromeApi = { scripting: { executeScript: async ({ target, files, func, args }) => {
    if (files?.[0] === 'size-actions.js') return [{ frameId: 0 }];
    if (files?.[0] === 'page-snapshot.js') return [{ frameId: 0, result: { host: 'us.motelrocks.com',
      items: [{ kind: 'option', label: 'W24 L30', text: 'W24 L30' }, ...(guideOpen ?
        [{ kind: 'chart', text: 'SIZE WAIST SHORT LEG W24 24 inches 30 inches' }] : [])] } }];
    if (func?.name === 'collectInFrame') return [{ frameId: 0, result: [
      { id: 'a1', label: 'Find your size', context: '', type: 'button' },
      { id: 'a2', label: 'Size Guide', context: '', type: 'a' }
    ] }];
    if (func?.name === 'panelStateInFrame') return [{ frameId: 0, result: { guideOpen, finderOpen } }];
    if (func?.name === 'activateInFrame') {
      if (args[0] === 'a1') finderOpen = true;
      if (args[0] === 'a2') guideOpen = true;
      return [{ frameId: 0, result: true }];
    }
    if (func?.name === 'restorePanelsInFrame') {
      guideOpen = args[0].guideOpen;
      finderOpen = args[0].finderOpen;
      return [{ frameId: 0, result: true }];
    }
    throw new Error(`Unexpected script ${func?.name}`);
  } } };
  const fetcher = async (_url, options) => {
    const request = JSON.parse(options.body);
    sent.push(request.actions.map(action => action.label));
    return { ok: true, json: async () => ({ actionId: request.actions[0].id }) };
  };
  const result = await Guided.explore({ tabId: 7, token: 'token', page: { url: 'https://us.motelrocks.com/products/jeans' },
    endpoint: 'https://project.example/function', publishableKey: 'public', chromeApi, fetcher });
  assert.deepEqual(sent, [['Size Guide']]);
  assert.deepEqual(result.steps, ['Size Guide']);
  assert.equal(result.snapshot.items.some(item => item.kind === 'chart'), true);
  assert.equal(guideOpen, false);
  assert.equal(finderOpen, false);
});

test('guided scan restores a sizing dialog opened by Select size', async () => {
  let dialogOpen = false;
  const chromeApi = { scripting: { executeScript: async ({ files, func, args }) => {
    if (files?.[0] === 'size-actions.js') return [{ frameId: 0 }];
    if (files?.[0] === 'page-snapshot.js') return [{ frameId: 0, result: { host: 'shop.example', items: dialogOpen ?
      [{ kind: 'option', label: '24', text: '24' }] : [] } }];
    if (func?.name === 'collectInFrame') return [{ frameId: 0, result: [{ id: 'a1', label: 'Select size', context: '', type: 'button' }] }];
    if (func?.name === 'panelStateInFrame') return [{ frameId: 0, result: { dialogOpen } }];
    if (func?.name === 'activateInFrame') { dialogOpen = true; return [{ frameId: 0, result: true }]; }
    if (func?.name === 'restorePanelsInFrame') { dialogOpen = args[0].dialogOpen; return [{ frameId: 0, result: true }]; }
    throw new Error(`Unexpected script ${func?.name}`);
  } } };
  const fetcher = async (_url, options) => ({ ok: true,
    json: async () => ({ actionId: JSON.parse(options.body).actions[0].id }) });
  const result = await Guided.explore({ tabId: 7, token: 'token', page: { url: 'https://shop.example/jeans' },
    endpoint: 'https://project.example/function', publishableKey: 'public', chromeApi, fetcher });
  assert.equal(result.snapshot.items.some(item => item.kind === 'option'), true);
  assert.equal(dialogOpen, false);
});

test('guided scan restores an opened panel when activation fails afterward', async () => {
  let panelOpen = false;
  const chromeApi = { scripting: { executeScript: async ({ files, func, args }) => {
    if (files?.[0] === 'page-snapshot.js') return [{ frameId: 0, result: { host: 'shop.example', items: [] } }];
    if (files?.[0] === 'size-actions.js') return [{ frameId: 0 }];
    if (func?.name === 'collectInFrame') return [{ frameId: 0, result: [{ id: 'a1', label: 'Size guide', context: '', type: 'button' }] }];
    if (func?.name === 'panelStateInFrame') return [{ frameId: 0, result: { panelOpen } }];
    if (func?.name === 'activateInFrame') { panelOpen = true; throw new Error('Retailer handler failed'); }
    if (func?.name === 'restorePanelsInFrame') { panelOpen = args[0].panelOpen; return [{ frameId: 0, result: true }]; }
    throw new Error(`Unexpected script ${func?.name}`);
  } } };
  const fetcher = async (_url, options) => ({ ok: true,
    json: async () => ({ actionId: JSON.parse(options.body).actions[0].id }) });
  const result = await Guided.explore({ tabId: 7, token: 'token', page: { url: 'https://shop.example/jeans' },
    endpoint: 'https://project.example/function', publishableKey: 'public', chromeApi, fetcher });
  assert.equal(result.navigationStatus, 'unavailable');
  assert.equal(panelOpen, false);
});

test('guided scan opens size choices, then a finder and its chart in another frame', async () => {
  let stage = 0;
  const chosen = [];
  const restored = [];
  const mainActions = [
    { id: 'a1', label: 'Select size', context: 'product-size-select', type: 'combobox' },
    { id: 'a2', label: 'Find your size', context: 'product', type: 'button' }
  ];
  const chromeApi = { scripting: { executeScript: async ({ target, files, func, args }) => {
    if (files?.[0] === 'size-actions.js') return [{ frameId: 0 }, ...(stage >= 2 ? [{ frameId: 8 }] : [])];
    if (files?.[0] === 'page-snapshot.js') return [
      { frameId: 0, result: { version: 1, host: 'shop.example', title: 'Jeans', items: stage >= 1 ?
        [{ id: 'o1', kind: 'option', label: '23/30', text: '23/30', availability: 'available' }] : [] } },
      ...(stage >= 2 ? [{ frameId: 8, result: { version: 1, host: 'modules.ecomid.com', title: 'Size chart', items: stage >= 3 ? [
        { id: 'c1', kind: 'chart', context: 'Body measurements', text: 'SIZE | WAIST | HIP ; W23 | 59.5 | 83.5' }
      ] : [] } }] : [])
    ];
    if (func?.name === 'collectInFrame') return stage >= 2 ? [
      { frameId: 0, result: mainActions }, { frameId: 8, result: [{ id: 'a1', label: 'Size chart', context: 'Find your size', type: 'button' }] }
    ] : [{ frameId: 0, result: mainActions }];
    if (func?.name === 'panelStateInFrame') return [{ frameId: 0, result: null }];
    if (func?.name === 'activateInFrame') {
      chosen.push([target.frameIds[0], args[0]]);
      stage++;
      return [{ frameId: target.frameIds[0], result: true }];
    }
    if (func?.name === 'closePanelInFrame' || func?.name === 'collapseInFrame' || func?.name === 'backInFrame') {
      restored.push([func.name, target.frameIds[0], args?.[0]]);
      return [{ frameId: target.frameIds[0], result: true }];
    }
    throw new Error('Unexpected script');
  } } };
  const sent = [];
  const fetcher = async (_url, options) => {
    const body = JSON.parse(options.body);
    sent.push(body);
    const choice = body.goal === 'product-options' ? body.actions.find(action => action.label === 'Select size') :
      body.actions.find(action => action.label === (stage === 1 ? 'Find your size' : 'Size chart'));
    return { ok: true, json: async () => ({ actionId: choice?.id || '' }) };
  };
  const result = await Guided.explore({ tabId: 7, token: 'user-token', page: { url: 'https://shop.example/jeans', title: 'Jeans' },
    endpoint: 'https://project.example/functions/v1/analyze-listing', publishableKey: 'public-key', chromeApi, fetcher });
  assert.deepEqual(chosen, [[0, 'a1'], [0, 'a2'], [8, 'a1']]);
  assert.deepEqual(result.snapshot.items.filter(item => item.kind === 'option').map(item => item.label), ['23/30']);
  assert.equal(result.snapshot.items.some(item => item.kind === 'chart' && item.text.includes('W23')), true);
  assert.equal(sent.every(body => !('measurements' in body)), true);
  assert.deepEqual(restored, [['closePanelInFrame', 8, undefined], ['collapseInFrame', 0, 'Select size']]);
});

test('guided scan returns an already-open finder to its original view', async () => {
  const restored = [];
  const chromeApi = { scripting: { executeScript: async ({ target, files, func, args }) => {
    if (files?.[0] === 'size-actions.js') return [{ frameId: 0 }, { frameId: 8 }];
    if (files?.[0] === 'page-snapshot.js') return [
      { frameId: 0, result: { host: 'shop.example', items: [{ id: 'o1', kind: 'option', label: '24', text: '24' }] } },
      { frameId: 8, result: { host: 'modules.ecomid.com', items: restored.some(item => item[0] === 'activateInFrame') ?
        [{ id: 'c1', kind: 'chart', text: 'Size Waist 24 62' }] : [] } }
    ];
    if (func?.name === 'collectInFrame') return [{ frameId: 0, result: [] },
      { frameId: 8, result: [{ id: 'a1', label: 'Size chart', context: '', type: 'button' }] }];
    if (func?.name === 'activateInFrame' || func?.name === 'backInFrame' || func?.name === 'closePanelInFrame') {
      restored.push([func.name, target.frameIds[0], args?.[0]]);
      return [{ frameId: target.frameIds[0], result: true }];
    }
    throw new Error('Unexpected script');
  } } };
  const fetcher = async (_url, options) => ({ ok: true,
    json: async () => ({ actionId: JSON.parse(options.body).actions[0].id }) });
  const result = await Guided.explore({ tabId: 7, token: 'token', page: { url: 'https://shop.example/jeans', title: 'Jeans' },
    endpoint: 'https://project.example/function', publishableKey: 'public', chromeApi, fetcher });
  assert.equal(result.snapshot.items.some(item => item.kind === 'chart'), true);
  assert.deepEqual(restored, [['activateInFrame', 8, 'a1'], ['backInFrame', 8, undefined]]);
});

test('guided scan still closes its dropdown when a later AI step fails', async () => {
  let opened = false;
  const restored = [];
  const chromeApi = { scripting: { executeScript: async ({ target, files, func, args }) => {
    if (files?.[0] === 'page-snapshot.js') return [{ frameId: 0, result: { host: 'shop.example', items: opened ?
      [{ id: 'o1', kind: 'option', label: '24', text: '24' }] : [] } }];
    if (files?.[0] === 'size-actions.js') return [{ frameId: 0 }];
    if (func?.name === 'collectInFrame') return [{ frameId: 0, result: [
      { id: 'a1', label: 'Select size', context: '', type: 'combobox', expanded: false },
      { id: 'a2', label: 'Size chart', context: '', type: 'button' }
    ] }];
    if (func?.name === 'panelStateInFrame') return [{ frameId: 0, result: null }];
    if (func?.name === 'activateInFrame') { opened = true; return [{ frameId: 0, result: true }]; }
    if (func?.name === 'collapseInFrame') { restored.push([target.frameIds[0], args[0]]); return [{ frameId: 0, result: true }]; }
    throw new Error('Unexpected script');
  } } };
  const fetcher = async (_url, options) => {
    const request = JSON.parse(options.body);
    if (request.goal === 'size-chart') throw new Error('AI unavailable');
    return { ok: true, json: async () => ({ actionId: request.actions[0].id }) };
  };
  const result = await Guided.explore({ tabId: 7, token: 'token', page: { url: 'https://shop.example/jeans', title: 'Jeans' },
    endpoint: 'https://project.example/function', publishableKey: 'public', chromeApi, fetcher });
  assert.equal(result.navigationStatus, 'unavailable');
  assert.deepEqual(restored, [[0, 'Select size']]);
});

test('guided scan does not close an unrelated frame that loads during scanning', async () => {
  let opened = false;
  const closed = [];
  const chromeApi = { scripting: { executeScript: async ({ target, files, func }) => {
    if (files?.[0] === 'size-actions.js') return [{ frameId: 0 }, ...(opened ? [{ frameId: 9 }] : [])];
    if (files?.[0] === 'page-snapshot.js') return [{ frameId: 0, result: { host: 'shop.example', items: opened ?
      [{ id: 'o1', kind: 'option', label: '24', text: '24' }, { id: 'c1', kind: 'chart', text: 'Waist 24 61' }] : [] } },
      ...(opened ? [{ frameId: 9, result: { host: 'ads.example', title: 'Sale', items: [] } }] : [])];
    if (func?.name === 'collectInFrame') return [{ frameId: 0, result: [{ id: 'a1', label: 'Select size', context: '', type: 'button' }] }];
    if (func?.name === 'panelStateInFrame') return [{ frameId: 0, result: null }];
    if (func?.name === 'activateInFrame') { opened = true; return [{ frameId: 0, result: true }]; }
    if (func?.name === 'closePanelInFrame') { closed.push(target.frameIds[0]); return [{ frameId: target.frameIds[0], result: true }]; }
    throw new Error('Unexpected script');
  } } };
  const fetcher = async (_url, options) => ({ ok: true,
    json: async () => ({ actionId: JSON.parse(options.body).actions[0].id }) });
  await Guided.explore({ tabId: 7, token: 'token', page: { url: 'https://shop.example/jeans', title: 'Jeans' },
    endpoint: 'https://project.example/function', publishableKey: 'public', chromeApi, fetcher });
  assert.deepEqual(closed, []);
});
