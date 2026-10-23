(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SizeSceneExplanation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function summarize(recommendation, response) {
    const facts = Array.isArray(recommendation?.explanationFacts) ? recommendation.explanationFacts : [];
    const byId = new Map(facts.map(fact => [fact.id, fact]));
    const aiItems = Array.isArray(response?.items) ? response.items : [];
    const items = ['waist', 'length', 'availability', 'fit'].map(id => byId.get(id)).filter(Boolean).slice(0, 3)
      .map(fact => {
        const excerpt = aiItems.find(item => item?.factId === fact.id)?.excerpt;
        const mayShorten = fact.kind === 'chart' || fact.kind === 'retailer' || fact.kind === 'listed-measurement';
        const validExcerpt = mayShorten && typeof excerpt === 'string' && excerpt.length >= 20 &&
          fact.text.includes(excerpt) && excerpt.trim() === excerpt;
        return { id: fact.id, title: fact.title, text: validExcerpt ? excerpt : fact.text };
      });
    return { items, caution: byId.get('uncertainty')?.text || '' };
  }
  return { summarize };
});
