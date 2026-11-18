(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SizeSceneOnboarding = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function nextStep(session, profile) {
    if (!session) return 'account';
    if (!profile || !['waistCm', 'hipCm', 'heightCm', 'weightKg'].every(key =>
      profile[key] != null && profile[key] !== '' &&
      Number.isFinite(Number(profile[key])) && Number(profile[key]) > 0)) return 'measurements';
    return 'scan';
  }
  async function openTabInCurrentWindow(browser, path) {
    const url = browser.runtime.getURL(path);
    const [sourceTab] = await browser.tabs.query({ active: true, currentWindow: true });
    const windowId = sourceTab?.windowId;
    const tab = await browser.tabs.create({
      url,
      active: true,
      ...(Number.isInteger(windowId) ? { windowId } : {}),
      ...(Number.isInteger(sourceTab?.id) ? { openerTabId: sourceTab.id } : {})
    });
    const targetWindowId = Number.isInteger(windowId) ? windowId : tab?.windowId;
    if (Number.isInteger(targetWindowId)) {
      await browser.windows.update(targetWindowId, { focused: true });
    }
    return tab;
  }
  async function openSetupTab(browser = chrome) {
    return openTabInCurrentWindow(browser, 'measurements.html?setup=1');
  }
  async function returnToShopping(browser = chrome) {
    const setupTab = await browser.tabs.getCurrent();
    if (!Number.isInteger(setupTab?.id)) return false;
    if (Number.isInteger(setupTab.openerTabId)) {
      try {
        const shoppingTab = await browser.tabs.get(setupTab.openerTabId);
        await browser.tabs.update(shoppingTab.id, { active: true });
        if (Number.isInteger(shoppingTab.windowId)) {
          await browser.windows.update(shoppingTab.windowId, { focused: true });
        }
      } catch {
        // The shopping tab may have been closed while measurements were entered.
      }
    }
    await browser.tabs.remove(setupTab.id);
    return true;
  }
  return { nextStep, openSetupTab, returnToShopping };
});
