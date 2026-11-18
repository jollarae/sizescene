(function (root, factory) {
  const units = factory();
  if (typeof module === 'object' && module.exports) module.exports = units;
  else root.SizeSceneUnits = units;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const centimetersPerInch = 2.54;
  const poundsPerKilogram = 2.2046226218;
  const ranges = {
    waistCm: [40, 200], hipCm: [50, 220], heightCm: [100, 230],
    weightKg: [20, 350], inseamCm: [40, 120], thighCm: [25, 100]
  };

  function factor(key, system) {
    if (system !== 'imperial') return 1;
    return key === 'weightKg' ? poundsPerKilogram : 1 / centimetersPerInch;
  }

  function toMetric(key, value, system) {
    if (value === '' || value == null) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number / factor(key, system) : null;
  }

  function display(key, metric, system) {
    if (metric == null || metric === '') return '';
    const value = Math.round(Number(metric) * factor(key, system) * 10) / 10;
    return String(value);
  }

  function range(key, system) {
    return ranges[key].map(value => Math.round(value * factor(key, system) * 10) / 10);
  }

  function heightInFeetAndInches(centimeters) {
    if (centimeters == null || centimeters === '') return { feet: '', inches: '' };
    const totalInches = Math.round(Number(centimeters) / centimetersPerInch * 10) / 10;
    let feet = Math.floor(totalInches / 12);
    let inches = Math.round((totalInches - feet * 12) * 10) / 10;
    if (inches === 12) { feet += 1; inches = 0; }
    return { feet: String(feet), inches: String(inches) };
  }

  function feetAndInchesToCm(feet, inches) {
    if (feet === '' || feet == null) return null;
    const feetNumber = Number(feet);
    const inchesNumber = inches === '' || inches == null ? 0 : Number(inches);
    if (!Number.isFinite(feetNumber) || !Number.isFinite(inchesNumber)) return null;
    return (feetNumber * 12 + inchesNumber) * centimetersPerInch;
  }

  return { toMetric, display, range, heightInFeetAndInches, feetAndInchesToCm };
});
