(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SizeSceneGuidedScan = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

  function collectInFrame() {
    return globalThis.SizeScenePageActions?.collect() || [];
  }

  function activateInFrame(id) {
    return globalThis.SizeScenePageActions?.activate(id) || false;
  }

  function closePanelInFrame() {
    return globalThis.SizeScenePageActions?.closePanel() || false;
  }

  function collapseInFrame(label) {
    return globalThis.SizeScenePageActions?.collapseSize(label) || false;
  }

  function backInFrame() {
    return globalThis.SizeScenePageActions?.back() || false;
  }

  function panelStateInFrame() {
    return globalThis.SizeScenePageActions?.panelState() || null;
  }

  function restorePanelsInFrame(previous) {
    return globalThis.SizeScenePageActions?.restorePanels(previous) || false;
  }

  async function inject(chromeApi, tabId, details) {
    try { return await chromeApi.scripting.executeScript({ target: { tabId, allFrames: true }, ...details }); }
    catch { return chromeApi.scripting.executeScript({ target: { tabId }, ...details }); }
  }

  function mergeEvidence(previous, results, page) {
    const host = new URL(page.url).hostname;
    const items = previous?.items ? [...previous.items] : [];
    const seen = new Set(items.map(item => `${item.kind}:${item.text}:${item.label || ''}:${item.context || ''}`));
    for (const frame of results || []) {
      for (const item of frame.result?.items || []) {
        const fingerprint = `${item.kind}:${item.text}:${item.label || ''}:${item.context || ''}`;
        if (items.length >= 190 || seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        items.push({ ...item, id: `e${items.length + 1}`, frameHost: frame.result.host });
      }
    }
    return { version: 1, host, title: page.title || '', items };
  }

  async function capture(chromeApi, tabId, previous, page) {
    const results = await inject(chromeApi, tabId, { files: ['page-snapshot.js'] });
    return { snapshot: mergeEvidence(previous, results, page), frames: results };
  }

  function rememberSizingFrames(frames, initialFrames, openedFrames) {
    for (const frame of frames) {
      if (initialFrames.has(frame.frameId)) continue;
      const result = frame.result || {};
      if (result.host === 'modules.ecomid.com' || /\b(?:size|sizing|fit|measurements?)\b/i.test(result.title || '') ||
          result.items?.some(item => item.kind === 'chart' || item.kind === 'option')) openedFrames.add(frame.frameId);
    }
  }

  function hasGoal(snapshot, goal) {
    return goal === 'product-options' ? snapshot.items.some(item => item.kind === 'option') :
      snapshot.items.some(item => item.kind === 'chart' && /\b(?:waist|hip|inseam|inner leg)\b/i.test(item.text));
  }

  async function availableActions(chromeApi, tabId, visited) {
    await inject(chromeApi, tabId, { files: ['size-actions.js'] });
    const frames = await inject(chromeApi, tabId, { func: collectInFrame });
    const actions = [];
    for (const frame of frames || []) {
      for (const action of frame.result || []) {
        const key = `${frame.frameId}:${action.label}:${action.context}`;
        if (!visited.has(key)) actions.push({ ...action, id: `f${frame.frameId}-${action.id}`, frameId: frame.frameId,
          localId: action.id, key });
      }
    }
    return actions.slice(0, 25);
  }

  async function chooseAction({ actions, goal, page, endpoint, publishableKey, token, fetcher }) {
    const response = await fetcher(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: publishableKey,
        Authorization: `Bearer ${token}` },
      body: JSON.stringify({ version: 1, task: 'navigate', host: new URL(page.url).hostname,
        title: page.title || '', goal, actions: actions.map(({ id, label, context, type }) => ({ id, label, context, type })) })
    });
    if (!response.ok) throw new Error(`AI navigation returned ${response.status}`);
    const { actionId } = await response.json();
    return actions.find(action => action.id === actionId) || null;
  }

  function prioritizeActions(actions, goal) {
    const direct = actions.filter(action => goal === 'product-options' ?
      /^(?:select|choose) (?:a )?size$/i.test(action.label) :
      /^(?:(?:size|sizing) (?:chart|guide|information|details)|fit guide|measurements?|how to measure)$/i.test(action.label));
    return direct.length ? direct : actions;
  }

  async function explore({ tabId, token, page, endpoint, publishableKey, chromeApi = chrome, fetcher = fetch }) {
    const first = await capture(chromeApi, tabId, null, page);
    let snapshot = first.snapshot;
    const initialFrames = new Set(first.frames.map(frame => frame.frameId));
    const openedFrames = new Set();
    const openedActions = [];
    const visited = new Set();
    const steps = [];
    let navigationStatus = 'complete';
    try {
      for (const goal of ['product-options', 'size-chart']) {
        for (let attempt = 0; attempt < 3 && steps.length < 4 && !hasGoal(snapshot, goal); attempt++) {
          try {
            const actions = prioritizeActions(await availableActions(chromeApi, tabId, visited), goal);
            if (!actions.length) break;
            const chosen = await chooseAction({ actions, goal, page, endpoint, publishableKey, token, fetcher });
            if (!chosen) break;
            visited.add(chosen.key);
            let panelState = null;
            if (chosen.frameId === 0) {
              const state = await chromeApi.scripting.executeScript({ target: { tabId, frameIds: [0] }, func: panelStateInFrame });
              panelState = state?.[0]?.result || null;
            }
            openedActions.push({ ...chosen, panelState });
            const result = await chromeApi.scripting.executeScript({
              target: { tabId, frameIds: [chosen.frameId] }, func: activateInFrame, args: [chosen.localId]
            });
            if (!result?.[0]?.result) continue;
            steps.push(chosen.label);
            let reading = await capture(chromeApi, tabId, snapshot, page);
            snapshot = reading.snapshot;
            rememberSizingFrames(reading.frames, initialFrames, openedFrames);
            if (!hasGoal(snapshot, goal)) {
              await pause(350);
              reading = await capture(chromeApi, tabId, snapshot, page);
              snapshot = reading.snapshot;
              rememberSizingFrames(reading.frames, initialFrames, openedFrames);
            }
          } catch {
            navigationStatus = 'unavailable';
            break;
          }
        }
      }
    } finally {
      try {
        const frames = await inject(chromeApi, tabId, { files: ['page-snapshot.js'] });
        rememberSizingFrames(frames, initialFrames, openedFrames);
      } catch { /* Preserve the evidence even if a frame disappears. */ }
      for (const frameId of [...openedFrames].reverse()) {
        try {
          await chromeApi.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, files: ['size-actions.js'] });
          await chromeApi.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, func: closePanelInFrame });
        }
        catch { /* A frame may already have closed. */ }
      }
      for (const action of openedActions.reverse()) {
        if (openedFrames.has(action.frameId)) continue;
        if (action.panelState) {
          try { await chromeApi.scripting.executeScript({ target: { tabId, frameIds: [action.frameId] },
            func: restorePanelsInFrame, args: [action.panelState] }); }
          catch { /* A retailer may remove a panel before cleanup. */ }
        }
        const func = action.type === 'combobox' && action.expanded !== true ? collapseInFrame :
          action.label.toLowerCase() === 'size chart' && action.frameId !== 0 ? backInFrame : null;
        if (!func) continue;
        try { await chromeApi.scripting.executeScript({ target: { tabId, frameIds: [action.frameId] },
          func, args: func === collapseInFrame ? [action.label] : [] }); }
        catch { /* A retailer may replace a control during the scan. */ }
      }
    }
    return { snapshot, steps, navigationStatus };
  }

  return { explore, mergeEvidence };
});
