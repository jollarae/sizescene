const test = require('node:test');
const assert = require('node:assert/strict');
const AI = require('../ai-scan.js');

const scan = () => ({
  page: { title: 'Cigarette Jeans', store: 'Other', url: 'https://shop.example/jeans' },
  sizes: { waist: [], length: [], combined: [], other: [], unavailable: { waist: [], length: [], combined: [], other: [] } },
  sizeGuides: [], sizeGuideStatus: 'none',
  details: { fit: [], rise: [], inseam: [], model: [], materials: [], sizingAdvice: [] },
  hasSizingInformation: false
});

test('AI evidence fills unknown retailer sizes and body chart without promoting chart labels to product options', () => {
  const snapshot = { items: [
    { id: 'o1', kind: 'option', text: 'Size 24', label: '24', availability: 'available' },
    { id: 'o2', kind: 'option', text: 'Size 26 Sold out', label: '26', availability: 'unavailable' },
    { id: 'c1', kind: 'chart', text: 'BODY SIZE CHART Size Waist Hip 24 61cm 87cm 26 66cm 92cm' },
    { id: 'f1', kind: 'detail', text: 'Slim through the hips with a straight leg.' }
  ] };
  const extracted = {
    productOptionIds: ['o1', 'o2'],
    charts: [{ evidenceId: 'c1', title: 'Body size chart', headers: ['Size', 'Waist (cm)', 'Hip (cm)'], rows: [['24', '61cm', '87cm'], ['26', '66cm', '92cm']] }],
    fitEvidenceIds: ['f1']
  };
  const result = AI.merge(scan(), snapshot, extracted);
  assert.deepEqual(result.sizes.waist, ['24']);
  assert.deepEqual(result.sizes.unavailable.waist, ['26']);
  assert.equal(result.sizeGuides[0].rows[0][2], '87cm');
  assert.deepEqual(result.details.fit, ['Slim through the hips with a straight leg.']);
  assert.equal(result.hasSizingInformation, true);
});

test('AI result cannot introduce sizes absent from real product controls or unsupported chart cells', () => {
  const snapshot = { items: [
    { id: 'c1', kind: 'chart', text: 'SIZE XS S WAIST 60cm 65cm' },
    { id: 'o1', kind: 'option', text: 'Size 24', label: '24', availability: 'available' }
  ] };
  const result = AI.merge(scan(), snapshot, {
    productOptionIds: ['c1', 'o1', 'made-up'],
    charts: [{ evidenceId: 'c1', title: 'Body chart', headers: ['Size', 'Waist'], rows: [['XS', '61cm']] }],
    fitEvidenceIds: []
  });
  assert.deepEqual(result.sizes.waist, ['24']);
  assert.deepEqual(result.sizes.other, []);
  assert.deepEqual(result.sizeGuides, []);
});

test('AI can select a supported apparel chart and replace unrelated local guides', () => {
  const local = scan();
  local.sizes.waist = ['XXS', 'XS'];
  local.sizeGuides = [{ title: 'Swimwear', headers: ['Size', 'Waist (cm)'], rows: [['XXS', '50 - 54 cm']] }];
  const snapshot = { items: [
    { id: 'swim', kind: 'chart', context: 'Swimwear', text: 'Measurement | XXS | XS ; Waist | 50 - 54 cm | 55 - 59 cm' },
    { id: 'apparel', kind: 'chart', context: 'Apparel', text: 'Measurement | XXS | XS ; Waist | 59 - 63 cm | 64 - 68 cm ; Hip | 85 - 89 cm | 90 - 94 cm' }
  ] };
  const result = AI.merge(local, snapshot, { productOptionIds: [], fitEvidenceIds: [], charts: [{
    evidenceId: 'apparel', title: 'Apparel body size chart', headers: ['Size', 'Waist (cm)', 'Hip (cm)'],
    rows: [['XXS', '59 - 63 cm', '85 - 89 cm'], ['XS', '64 - 68 cm', '90 - 94 cm']]
  }] });
  assert.deepEqual(result.sizeGuides.map(guide => guide.title), ['Apparel body size chart']);
  assert.equal(result.sizeGuides[0].rows[0][1], '59 - 63 cm');
});

test('AI turns Weekday slash options into orderable W/L sizes and preserves sold-out choices', () => {
  const snapshot = { items: [
    { id: 'o1', kind: 'option', text: 'Select size 23/30', label: '23/30', availability: 'available' },
    { id: 'o2', kind: 'option', text: 'Select size 24/30', label: '24/30', availability: 'available' },
    { id: 'o3', kind: 'option', text: 'Select size 26/34 OUT OF STOCK - NOTIFY ME', label: '26/34', availability: 'unavailable' }
  ] };
  const result = AI.merge(scan(), snapshot, { productOptionIds: ['o1', 'o2', 'o3'], charts: [], fitEvidenceIds: [] });
  assert.deepEqual(result.sizes.combined, ['W23 L30', 'W24 L30']);
  assert.deepEqual(result.sizes.unavailable.combined, ['W26 L34']);
});

test('AI does not add a related product XS option to Motel W/L purchase sizes', () => {
  const local = scan();
  local.page.store = 'Motel Rocks';
  local.sizes.combined = ['W24 L30', 'W24 L32'];
  const snapshot = { items: [
    { id: 'main', kind: 'option', text: 'Size W24 L30', label: 'W24 L30', availability: 'available' },
    { id: 'related', kind: 'option', text: 'Size XS', label: 'XS', availability: 'available' }
  ] };
  const result = AI.merge(local, snapshot, { productOptionIds: ['main', 'related'], charts: [], fitEvidenceIds: [] });
  assert.deepEqual(result.sizes.combined, ['W24 L30', 'W24 L32']);
  assert.deepEqual(result.sizes.waist, []);
});
