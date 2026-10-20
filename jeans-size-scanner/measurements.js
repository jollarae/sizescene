const defaultMeasurements = { waistCm: 61, hipCm: 87, inseamCm: 72 };
const form = document.getElementById('measurements-form');
const status = document.getElementById('save-status');

async function loadMeasurements() {
  const saved = await chrome.storage.local.get('measurements');
  const measurements = saved.measurements || defaultMeasurements;
  for (const [key, value] of Object.entries(measurements)) {
    if (form.elements[key]) form.elements[key].value = value;
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const measurements = Object.fromEntries(['waistCm', 'hipCm', 'inseamCm'].map(key =>
    [key, Number(form.elements[key].value)]));
  for (const key of ['heightCm', 'thighCm']) {
    const value = form.elements[key].value.trim();
    if (value) measurements[key] = Number(value);
  }
  try {
    await chrome.storage.local.set({ measurements });
    status.textContent = 'Saved. Your next scan will use these measurements.';
  } catch (error) {
    status.textContent = 'Could not save measurements. Please try again.';
  }
});

loadMeasurements().catch(() => { status.textContent = 'Could not load measurements.'; });
