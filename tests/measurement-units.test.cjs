const test = require('node:test');
const assert = require('node:assert/strict');
const units = require('../measurement-units.js');

test('switching length display preserves the underlying measurement', () => {
  const centimeters = units.toMetric('heightCm', 157, 'metric');
  assert.equal(units.display('heightCm', centimeters, 'imperial'), '61.8');
  assert.equal(units.display('heightCm', centimeters, 'metric'), '157');
});

test('imperial input converts to metric for saving and back for display', () => {
  const centimeters = units.toMetric('waistCm', 24, 'imperial');
  assert.equal(Math.round(centimeters * 10) / 10, 61);
  assert.equal(units.display('waistCm', centimeters, 'imperial'), '24');
});

test('weight changes display units without changing saved kilograms', () => {
  const kilograms = units.toMetric('weightKg', 110.2, 'imperial');
  assert.equal(units.display('weightKg', kilograms, 'metric'), '50');
  assert.equal(units.display('weightKg', kilograms, 'imperial'), '110.2');
});

test('empty optional measurements stay empty across unit changes', () => {
  assert.equal(units.toMetric('inseamCm', '', 'imperial'), null);
  assert.equal(units.display('inseamCm', null, 'metric'), '');
});

test('height uses feet and inches in imperial mode while retaining centimeters', () => {
  assert.deepEqual(units.heightInFeetAndInches(157), { feet: '5', inches: '1.8' });
  assert.equal(Math.round(units.feetAndInchesToCm('5', '1.8') * 10) / 10, 157);
  assert.equal(units.feetAndInchesToCm('', '1.8'), null);
});
