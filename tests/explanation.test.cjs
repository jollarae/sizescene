const test = require('node:test');
const assert = require('node:assert/strict');
const { summarize } = require('../explanation.js');

const recommendation = {
  status: 'tentative', soldOut: true,
  explanationFacts: [
    { id: 'waist', title: 'Waist', kind: 'label', text: 'W24 is the closest listed waist label to your 61 cm waist; the listing does not verify that measurement.' },
    { id: 'length', title: 'Length', kind: 'label', text: 'L30 is the closest listed length label to your 72 cm inseam. The garment’s measured inseam is unconfirmed.' },
    { id: 'availability', title: 'Availability', kind: 'stock', text: 'W24 L30 appears sold out; W26 L32 is the closest available option, but may fit differently.' },
    { id: 'uncertainty', title: 'Estimate', kind: 'limitation', text: 'This is an estimate from listed sizes; a matching body size chart was not confirmed.' }
  ]
};

test('summary keeps three checked facts and a single uncertainty note', () => {
  const result = summarize(recommendation);
  assert.deepEqual(result.items.map(item => item.id), ['waist', 'length', 'availability']);
  assert.match(result.items[1].text, /measured inseam is unconfirmed/);
  assert.match(result.caution, /estimate/);
});

test('AI may shorten verified chart facts but cannot replace size labels or stock facts with unsupported claims', () => {
  const result = summarize(recommendation, { items: [
    { factId: 'waist', excerpt: 'Perfect fit guaranteed.' },
    { factId: 'length', excerpt: 'L30 is the closest listed length label to your 72 cm inseam.' },
    { factId: 'availability', excerpt: 'W24 L30 appears sold out' }
  ] });
  assert.equal(result.items[0].text, recommendation.explanationFacts[0].text);
  assert.equal(result.items[1].text, recommendation.explanationFacts[1].text);
  assert.equal(result.items[2].text, recommendation.explanationFacts[2].text);
});

test('AI can choose a checked excerpt when the fact is a verified chart comparison', () => {
  const chartRecommendation = { status: 'recommended', explanationFacts: [
    { id: 'waist', title: 'Waist', kind: 'chart', text: 'Your waist is 61 cm. The retailer’s chart places W24 at about 61 cm.' }
  ] };
  const result = summarize(chartRecommendation, { items: [
    { factId: 'waist', excerpt: 'The retailer’s chart places W24 at about 61 cm.' }
  ] });
  assert.equal(result.items[0].text, 'The retailer’s chart places W24 at about 61 cm.');
});
