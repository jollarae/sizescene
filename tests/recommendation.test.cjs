const test = require('node:test');
const assert = require('node:assert/strict');
const { recommend } = require('../recommendation.js');

const profile = { waistCm: 61, hipCm: 87, inseamCm: 72 };

function motelScan() {
  return {
    sizes: {
      waist: [], length: [], combined: ['W24 L30', 'W24 L32', 'W26 L32', 'W28 L30'], other: [],
      unavailable: { waist: [], length: [], combined: ['W26 L30'], other: [] }
    },
    sizeGuides: [{ title: 'Size chart · inches', headers: ['SIZE', 'WAIST', 'SHORT LEG', 'REG LEG'], rows: [
      ['XXS', '24"', '30"', '32"'], ['XS', '26"', '30"', '32"'], ['S', '28"', '30"', '32"']
    ] }],
    details: { fit: ['Wide leg fit'], rise: ['Low rise waistband'], model: [], materials: [], inseam: [], sizingAdvice: [] }
  };
}

test('recommends an available W/L size from body measurements and chart evidence', () => {
  const result = recommend(motelScan(), profile, 'as-designed');
  assert.equal(result.status, 'recommended');
  assert.equal(result.size, 'W24 L30');
  assert.match(result.naturalFit, /wide leg/i);
  assert.ok(result.reasons.some(value => /24/.test(value)));
  assert.ok(result.notes.some(value => /inseam|length/i.test(value)));
  assert.equal(result.explanationFacts.find(fact => fact.id === 'length').kind, 'label');
  assert.match(result.explanationFacts.find(fact => fact.id === 'length').text, /L30.*label/i);
  assert.doesNotMatch(result.explanationFacts.find(fact => fact.id === 'length').text, /garment.*(76|30)/i);
  assert.match(result.explanationFacts.find(fact => fact.id === 'fit').text, /wide leg/i);
  assert.doesNotMatch(result.explanationFacts.find(fact => fact.id === 'waist').text, /L30/);
});

test('without inseam, recommends a waist but leaves an unverified length open', () => {
  const { inseamCm, ...withoutInseam } = profile;
  const result = recommend(motelScan(), { ...withoutInseam, heightCm: 158, weightKg: 50 });
  assert.equal(result.size, 'W24');
  assert.equal(result.lengthUnresolved, true);
  assert.ok(result.notes.some(value => /choose.*length/i.test(value)));
  assert.ok(result.explanationFacts.every(fact => fact.id !== 'length'));
});

test('without inseam, a retailer height guide may select a listed length', () => {
  const scan = motelScan();
  scan.sizeGuides.push({ title: 'Length by height', headers: ['Height (in.)', "5'2” or shorter", "5'3”–5'7”"],
    rows: [['Full-Length Styles (in.)', '30–30', '32–32']] });
  const result = recommend(scan, { waistCm: 61, hipCm: 87, heightCm: 158, weightKg: 50 });
  assert.equal(result.size, 'W24 L30');
  assert.equal(result.lengthUnresolved, false);
});

test('roomier preference shows the best fit even when its length is sold out', () => {
  const result = recommend(motelScan(), profile, 'roomier');
  assert.equal(result.size, 'W26 L30');
  assert.equal(result.soldOut, true);
  assert.equal(result.availableSize, 'W26 L32');
  assert.ok(result.notes.some(value => /longer|inseam|length/i.test(value)));
});

test('AGOLDE sold-out best fit remains recommended with the closest available alternative', () => {
  const scan = {
    sizes: { waist: ['32', '33', '34'], length: [], combined: [], other: [], unavailable: { waist: ['23', '24', '25', '26', '27', '28', '29', '30', '31'], length: [], combined: [], other: [] } },
    sizeGuides: [], sizeGuideStatus: 'image-only',
    details: { fit: ['Relaxed curved leg'], rise: [], sizingAdvice: ['This fit is true to size.'], inseam: ['Inseam: 27.5"'], model: [], materials: [] }
  };
  const result = recommend(scan, profile);
  assert.equal(result.size, '24');
  assert.equal(result.soldOut, true);
  assert.equal(result.availableSize, '32');
  assert.ok(result.notes.some(value => /estimate|chart/i.test(value)));
  assert.match(result.explanationFacts.find(fact => fact.id === 'availability').text, /24.*sold out.*32/i);
});

test('closer preference explains when no smaller waist is offered', () => {
  const result = recommend(motelScan(), profile, 'closer');
  assert.equal(result.size, 'W24 L30');
  assert.ok(result.notes.some(value => /no smaller|smallest/i.test(value)));
});

test('without a chart, numeric W/L labels give a tentative recommendation', () => {
  const scan = motelScan();
  scan.sizeGuides = [];
  const result = recommend(scan, profile, 'as-designed');
  assert.equal(result.status, 'tentative');
  assert.equal(result.size, 'W24 L30');
  assert.ok(result.notes.some(value => /estimate.*listed sizes/i.test(value)));
  assert.ok(result.notes.every(value => !/not used|cannot be checked|does not provide/i.test(value)));
});

test('generic directions to check a fit tab are not presented as a designed fit', () => {
  const scan = motelScan();
  scan.details.fit = ['Please check the sizing information and fit tab for details on each item.'];
  const result = recommend(scan, profile);
  assert.equal(result.explanationFacts.some(fact => fact.id === 'fit'), false);
});

test('letter-only options without a matching chart do not produce a guessed size', () => {
  const scan = motelScan();
  scan.sizes.combined = [];
  scan.sizes.waist = ['XS', 'S', 'M'];
  scan.sizeGuides = [];
  const result = recommend(scan, profile, 'as-designed');
  assert.equal(result.status, 'insufficient-data');
  assert.equal(result.size, null);
});

test('numeric waist options use the matching chart row and consider hip measurements', () => {
  const scan = {
    sizes: { waist: ['23', '24', '25'], length: ['30', '32'], combined: [], other: [], unavailable: { waist: [], length: [], combined: [], other: [] } },
    sizeGuides: [{ title: 'Size Guide', headers: ['Jean Size', 'Waist (in)', 'Hip (in)'], rows: [
      ['23', '24', '33'], ['24', '25', '34'], ['25', '26', '35']
    ] }],
    details: { fit: ['Relaxed through the hip'], rise: [], model: [], materials: [], inseam: [], sizingAdvice: [] }
  };
  const result = recommend(scan, profile, 'as-designed');
  assert.equal(result.status, 'recommended');
  assert.equal(result.size, 'W24 L30');
  assert.ok(result.reasons.some(value => /hip/i.test(value)));
  assert.match(result.explanationFacts.find(fact => fact.id === 'waist').text, /hip/i);
  assert.ok(result.notes.some(value => /combination|stock/i.test(value)));
  assert.match(result.explanationFacts.find(fact => fact.id === 'uncertainty').text, /exact.*combination.*stock/i);
});

test('letter options can be recommended when the chart maps labels to measurements', () => {
  const scan = {
    sizes: { waist: ['XS', 'S', 'M'], length: [], combined: [], other: [], unavailable: { waist: [], length: [], combined: [], other: [] } },
    sizeGuides: [{ title: 'Body Size', headers: ['Size', 'Waist (cm)'], rows: [['XS', '61'], ['S', '66'], ['M', '71']] }],
    details: { fit: [], rise: [], model: [], materials: [], inseam: [], sizingAdvice: [] }
  };
  const result = recommend(scan, profile, 'as-designed');
  assert.equal(result.status, 'recommended');
  assert.equal(result.size, 'XS');
});

test('jeans recommendation selects apparel body measurements over unrelated swim chart', () => {
  const scan = {
    sizes: { waist: ['XXS', 'XS', 'S'], length: [], combined: [], other: [], unavailable: { waist: [], length: [], combined: [], other: [] } },
    sizeGuides: [
      { title: 'Swimwear size guide', headers: ['Size', 'Waist (cm)', 'Hip (cm)'], rows: [['XXS', '50 - 54', '76 - 80'], ['XS', '55 - 59', '81 - 85'], ['S', '60 - 64', '86 - 90']] },
      { title: 'Apparel size guide', headers: ['Size', 'Waist (cm)', 'Hip (cm)'], rows: [['XXS', '59 - 63', '85 - 89'], ['XS', '64 - 68', '90 - 94'], ['S', '69 - 73', '95 - 99']] }
    ], details: { fit: [], rise: [], model: [], materials: [], inseam: [], sizingAdvice: [] }
  };
  const result = recommend(scan, profile);
  assert.equal(result.size, 'XXS');
  assert.equal(result.status, 'recommended');
  assert.ok(result.reasons.some(reason => /61 cm/i.test(reason)));
});

test('numeric jeans sizes do not use a swimwear chart that happens to share size labels', () => {
  const scan = {
    sizes: { waist: ['24', '25'], length: [], combined: [], other: [], unavailable: { waist: [], length: [], combined: [], other: [] } },
    sizeGuides: [
      { title: 'Swimwear size guide', headers: ['Size', 'Waist (cm)'], rows: [['24', '75'], ['25', '80']] },
      { title: 'Apparel body size guide', headers: ['Size', 'Waist (cm)'], rows: [['24', '61'], ['25', '66']] }
    ], details: { fit: [], rise: [], model: [], materials: [], inseam: [], sizingAdvice: [] }
  };
  const result = recommend(scan, profile);
  assert.equal(result.size, '24');
  assert.equal(result.status, 'recommended');
  assert.ok(result.reasons.some(reason => /chart associates 24 with about 61 cm/i.test(reason)));
});

test('numeric jeans sizes prefer a labeled apparel body chart over a generic conversion chart', () => {
  const scan = {
    sizes: { waist: ['24', '25'], length: [], combined: [], other: [], unavailable: { waist: [], length: [], combined: [], other: [] } },
    sizeGuides: [
      { title: 'Size chart', headers: ['Size', 'Waist (cm)'], rows: [['24', '68'], ['25', '73']] },
      { title: 'Apparel body size chart', headers: ['Size', 'Waist (cm)'], rows: [['24', '61'], ['25', '66']] }
    ], details: { fit: [], rise: [], model: [], materials: [], inseam: [], sizingAdvice: [] }
  };
  const result = recommend(scan, profile);
  assert.equal(result.size, '24');
  assert.ok(result.reasons.some(reason => /chart associates 24 with about 61 cm/i.test(reason)));
});

test('Levi chart fit advice moves the default one available waist size up', () => {
  const scan = {
    sizes: { waist: ['23', '24', '25', '26'], length: ['30', '32'], combined: [], other: [], unavailable: { waist: [], length: [], combined: [], other: [] } },
    sizeGuides: [{ title: "Find Your Levi's Waist", headers: ['Size', 'Your Waist (in.)', 'Your Hip (in.)', 'Your Thigh (in.)'], rows: [
      ['23', '24.25', '33', '18.75'], ['24', '25.25', '34', '19.38'], ['25', '26.25', '35', '20'], ['26', '27.25', '36', '20.63']
    ] }],
    details: { fit: ['Relaxed through the hip and thigh'], rise: ['Low rise'], model: [], materials: [], inseam: [], sizingAdvice: ['This pair runs a bit small. We suggest buying one or two sizes up.'] }
  };
  const result = recommend(scan, profile, 'as-designed');
  assert.equal(result.size, 'W25 L30');
  assert.equal(result.status, 'recommended');
  assert.ok(result.reasons.some(value => /runs.*small|size up/i.test(value)));
});

test('optional thigh measurement contributes when the chart provides thigh sizes', () => {
  const scan = {
    sizes: { waist: ['24', '25'], length: [], combined: [], other: [], unavailable: { waist: [], length: [], combined: [], other: [] } },
    sizeGuides: [{ title: 'Jeans', headers: ['Size', 'Waist (in.)', 'Hip (in.)', 'Thigh (in.)'], rows: [
      ['24', '25.25', '34', '19'], ['25', '26.25', '35', '22']
    ] }],
    details: { fit: [], rise: [], model: [], materials: [], inseam: [], sizingAdvice: [] }
  };
  const result = recommend(scan, { ...profile, thighCm: 55 }, 'as-designed');
  assert.equal(result.size, '25');
  assert.ok(result.reasons.some(value => /thigh/i.test(value)));
});

test('optional height checks a retailer length guide against the selected inseam', () => {
  const scan = motelScan();
  scan.sizeGuides.push({ title: "Find Your Levi's Length", headers: ['Height (in.)', "5'2” or shorter", "5'3”–5'7”", "5'8”–5'11”", "6' or taller"], rows: [
    ['Full-Length Styles (in.)', '26–28', '28–31', '32–34', '34–36']
  ] });
  const result = recommend(scan, { ...profile, heightCm: 160 }, 'as-designed');
  assert.equal(result.size, 'W24 L30');
  assert.ok(result.reasons.some(value => /height/i.test(value)));
});

test('AGOLDE numeric sizes yield a qualified estimate and account for its fixed inseam', () => {
  const scan = {
    page: { store: 'AGOLDE' },
    sizes: { waist: ['23', '24', '25'], length: [], combined: [], other: [], unavailable: { waist: ['34'], length: [], combined: [], other: [] } },
    sizeGuides: [], sizeGuideStatus: 'image-only',
    details: { fit: ['close fit through the leg'], rise: ['mid-rise waist'], sizingAdvice: ['This fit is true to size.'], inseam: ['Inseam: 29"'], model: [], materials: [] }
  };
  const result = recommend(scan, { ...profile, heightCm: 158, thighCm: 49 }, 'as-designed');
  assert.equal(result.status, 'tentative');
  assert.equal(result.size, '24');
  assert.equal(result.notes.filter(x => /estimate/i.test(x)).length, 1);
  assert.ok(result.notes.some(x => /listed sizes/i.test(x)));
  assert.ok(result.notes.some(x => /29.*72|72.*29/.test(x)));
  assert.ok(result.notes.every(x => !/not used|cannot be checked|does not provide|no readable/i.test(x)));
  assert.equal(recommend(scan, profile, 'roomier').size, '25');
});

test('Tank Air uses body chart instead of jeans garment dimensions', () => {
  const scan = {
    sizes: { waist: ['25'], length: [], combined: [], other: [], unavailable: { waist: ['23', '24'], length: [], combined: [], other: [] } },
    sizeGuides: [
      { title: 'Garment size chart', headers: ['SIZE', 'LOW WAIST (in)', 'HIP (in)'], rows: [['23', '27.5', '33'], ['24', '28', '34'], ['25', '29', '35']] },
      { title: 'Body size chart', headers: ['SIZE', 'WAIST (in)', 'HIP (in)'], rows: [['23', '23', '33'], ['24', '24', '34'], ['25', '25', '35']] }
    ],
    details: { fit: ['Very close fit'], rise: [], model: [], materials: [], inseam: [], sizingAdvice: [] }
  };
  const result = recommend(scan, profile);
  assert.equal(result.size, '24');
  assert.equal(result.soldOut, true);
  assert.equal(result.availableSize, '25');
  assert.equal(result.status, 'recommended');
  assert.ok(result.reasons.some(value => /waist.*about 61 cm/i.test(value)));
});

test('Tank Air garment-only chart yields a qualified numeric estimate', () => {
  const scan = {
    sizes: { waist: ['23', '24', '25'], length: [], combined: [], other: [], unavailable: { waist: [], length: [], combined: [], other: [] } },
    sizeGuides: [{ title: 'Garment size chart', headers: ['SIZE', 'LOW WAIST (in)', 'HIP (in)'], rows: [['23', '27.5', '33'], ['24', '28', '34'], ['25', '29', '35']] }],
    details: { fit: ['Very close fit'], rise: [], model: [], materials: [], inseam: [], sizingAdvice: [] }
  };
  const result = recommend(scan, profile);
  assert.equal(result.size, '24');
  assert.equal(result.status, 'tentative');
});
