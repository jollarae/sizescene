(function (root, factory) {
  root.SizeScenePageActions = factory(root);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
  const inertJavascriptHref = /^javascript:\s*void\s*\(\s*0\s*\)\s*;?$/i;
  const sizingAction = /^(?:select (?:a )?size|choose (?:a )?size|find (?:my|your|the right) size|what(?:'s| is) my size|size (?:chart|guide|finder|information|details)|sizing (?:chart|guide|information)|fit guide|measurements?|how to measure)$/i;
  const closeLabel = /^(?:close(?: (?:modal|dialog|size guide))?|×|✖|x)$/i;
  const panelSnapshots = root.SizeScenePanelSnapshots || (root.SizeScenePanelSnapshots = new Map());
  let candidates = new Map();

  function labelOf(node) {
    if (node.matches('input,[role="combobox"]'))
      return clean(node.getAttribute('aria-label') || node.getAttribute('placeholder') ||
        node.closest('[class*="size"]')?.textContent);
    return clean(node.getAttribute('aria-label') || node.getAttribute('title') || node.innerText || node.textContent);
  }

  function visible(node) {
    if (node.closest('[hidden],[aria-hidden="true"],template') || node.matches(':disabled,[aria-disabled="true"]')) return false;
    for (let current = node; current?.nodeType === 1; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
    }
    return true;
  }

  function samePageLink(node) {
    if (!node.matches('a[href]')) return true;
    if (inertJavascriptHref.test(node.getAttribute('href') || '')) return true;
    const url = new URL(node.href, location.href);
    return url.origin === location.origin && url.pathname === location.pathname;
  }

  function panelState() {
    const token = `panel-${root.SizeScenePanelSnapshotId = (root.SizeScenePanelSnapshotId || 0) + 1}`;
    const panels = openSizingPanels();
    panelSnapshots.set(token, {
      panels: new Set(panels),
      views: panels.map(panel => ({ panel, heading: clean(panel.querySelector('#modal-header,h1,h2,h3')?.textContent) })),
      selectedTabs: panels.flatMap(panel => [...panel.querySelectorAll('[role="tab"][aria-selected="true"]')]
        .map(tab => ({ panel, tab, label: labelOf(tab) })))
    });
    return {
      token,
      guides: [...document.querySelectorAll('.esc-size-guide--popup')].flatMap((panel, index) => visible(panel) ? [index] : []),
      finder: !!document.querySelector('#es-background')
    };
  }

  function openSizingPanels() {
    return [...document.querySelectorAll('dialog,[role="dialog"],[aria-modal="true"],.esc-size-guide--popup')]
      .filter(panel => visible(panel) && (panel.matches('.esc-size-guide--popup') ||
        /\b(?:size|sizing|fit|measurements?)\b/i.test(clean([panel.id, panel.className,
          panel.getAttribute('aria-label'), panel.querySelector('h1,h2,h3,h4,h5')?.textContent]
          .filter(value => typeof value === 'string').join(' ')))));
  }

  function restorePanels(previous) {
    if (!previous) return false;
    const snapshot = panelSnapshots.get(previous.token);
    const baseline = snapshot?.panels || new Set();
    panelSnapshots.delete(previous.token);
    let changed = false;
    const finder = document.querySelector('#es-background');
    if (finder && !previous.finder) {
      finder.focus();
      finder.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      changed = true;
    }
    const guides = [...document.querySelectorAll('.esc-size-guide--popup')];
    guides.forEach((panel, index) => {
      if (!visible(panel) || previous.guides?.includes(index)) return;
      const close = panel.querySelector('.modal_close,button[aria-label="Close"],[role="button"][aria-label="Close"]');
      if (close) { close.click(); changed = true; }
    });
    for (const panel of openSizingPanels().reverse()) {
      if (baseline.has(panel) || panel.matches('.esc-size-guide--popup') || panel.id === 'es-background') continue;
      const close = [...panel.querySelectorAll('button,[role="button"],.modal_close')].find(node => visible(node) &&
        closeLabel.test(labelOf(node)));
      if (close) { close.click(); changed = true; }
      else if (panel.matches('dialog[open]')) { panel.close(); changed = true; }
    }
    for (const { panel, heading } of snapshot?.views || []) {
      if (!panel.isConnected || !visible(panel) || !heading ||
          clean(panel.querySelector('#modal-header,h1,h2,h3')?.textContent) === heading) continue;
      const back = [...panel.querySelectorAll('button[class*="back"],[role="button"][class*="back"]')]
        .find(node => visible(node) && labelOf(node).toLowerCase() === heading.toLowerCase());
      if (back) { back.click(); changed = true; }
    }
    for (const { panel, tab, label } of snapshot?.selectedTabs || []) {
      if (!panel.isConnected || !visible(panel)) continue;
      const original = tab.isConnected ? tab : [...panel.querySelectorAll('[role="tab"]')]
        .find(candidate => labelOf(candidate) === label);
      if (original && original.getAttribute('aria-selected') !== 'true') {
        original.click();
        changed = true;
      }
    }
    return changed;
  }

  function collect() {
    candidates = new Map();
    const scope = document.querySelector('main,[role="main"],#MainContent') || document.body;
    const actions = [];
    for (const node of scope.querySelectorAll('button,[role="button"],[role="combobox"],summary,a[href]')) {
      if (actions.length >= 25) break;
      if (!visible(node) || node.closest('nav,footer,form[action*="search"],table,[role="table"]')) continue;
      if (node.matches('button') && node.closest('form') && node.type === 'submit') continue;
      const label = labelOf(node);
      if (!sizingAction.test(label)) continue;
      if (!samePageLink(node)) continue;
      const parent = node.closest('[role="dialog"],fieldset,[class*="product-size"],[class*="size-finder"]') || node.parentElement;
      const context = clean([parent?.getAttribute('aria-label'), parent?.id, parent?.className,
        parent?.querySelector('h1,h2,h3,legend')?.textContent].filter(value => typeof value === 'string').join(' ')).slice(0, 140);
      const id = `a${actions.length + 1}`;
      candidates.set(id, { node, label });
      actions.push({ id, label, context, type: node.getAttribute('role') || node.tagName.toLowerCase(),
        expanded: node.getAttribute('aria-expanded') === 'true' });
    }
    return actions;
  }

  function activate(id) {
    const entry = candidates.get(id);
    if (!entry || !entry.node.isConnected || !visible(entry.node) ||
        (entry.node.matches('button') && entry.node.closest('form') && entry.node.type === 'submit') || !samePageLink(entry.node) ||
        labelOf(entry.node) !== entry.label ||
        !sizingAction.test(entry.label)) return false;
    candidates.clear();
    if (entry.node.matches('a[href]') && inertJavascriptHref.test(entry.node.getAttribute('href') || '')) {
      const preventNavigation = event => event.preventDefault();
      entry.node.addEventListener('click', preventNavigation, { capture: true });
      try { entry.node.click(); }
      finally { entry.node.removeEventListener('click', preventNavigation, { capture: true }); }
    } else entry.node.click();
    if (entry.node.matches('[role="combobox"]')) {
      entry.node.focus();
      entry.node.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', bubbles: true }));
    }
    return true;
  }

  function collapseSize(label) {
    const node = [...document.querySelectorAll('[role="combobox"]')].find(candidate =>
      clean(candidate.getAttribute('aria-label') || candidate.getAttribute('placeholder')) === label &&
      candidate.getAttribute('aria-expanded') === 'true');
    if (!node) return false;
    node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    node.blur();
    return node.getAttribute('aria-expanded') !== 'true';
  }

  function panelButton(label) {
    return [...document.querySelectorAll('button,[role="button"]')].reverse().find(node =>
      visible(node) && clean(node.getAttribute('aria-label') || node.getAttribute('title') ||
        node.innerText || node.textContent).toLowerCase() === label.toLowerCase());
  }

  function closePanel() {
    const button = [...document.querySelectorAll('button,[role="button"]')].reverse()
      .find(node => visible(node) && closeLabel.test(labelOf(node)));
    if (!button) return false;
    button.click();
    return true;
  }

  function back() {
    const button = panelButton('Back');
    if (!button) return false;
    button.click();
    return true;
  }

  return { collect, activate, collapseSize, closePanel, back, panelState, restorePanels };
});
