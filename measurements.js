const measurementsForm = document.getElementById('measurements-form');
const saveStatus = document.getElementById('save-status');
const accountStatus = document.getElementById('account-status');
const signupForm = document.getElementById('signup-form');
const loginForm = document.getElementById('login-form');
const emailLinkForm = document.getElementById('email-link-form');
const passwordForm = document.getElementById('password-form');
const passwordSettings = document.querySelector('.password-settings');
const passwordStatus = document.getElementById('password-status');
const profileNameSettings = document.querySelector('.profile-name-settings');
const profileNameForm = document.getElementById('profile-name-form');
const profileNameStatus = document.getElementById('profile-name-status');
const signedIn = document.getElementById('signed-in');
const accountSwitch = document.getElementById('account-switch');
const passwordNote = document.getElementById('password-note');
const setupMode = new URLSearchParams(location.search).get('setup') === '1';
const setupLoading = document.getElementById('setup-loading');
const setupLoadStatus = document.getElementById('setup-load-status');
const setupRetry = document.getElementById('setup-retry');
if (setupMode) {
  document.body.classList.add('setup-mode');
  setupLoading.hidden = false;
}

function showSetupError(message) {
  setupLoading.classList.add('is-error');
  setupLoadStatus.textContent = message;
  setupRetry.hidden = false;
}
const measurementFields = {
  waistCm: 'waist', hipCm: 'hip', heightCm: 'height', weightKg: 'weight',
  inseamCm: 'inseam', thighCm: 'thigh'
};
let measurements = Object.fromEntries(Object.keys(measurementFields).map(key => [key, null]));
let displaySystem = 'metric';
let accountRenderId = 0;
let unitPreferenceKey = null;

function normalizeDecimalField(input) {
  input.value = input.value.replace(/,/g, '.');
  input.setCustomValidity('');
}

function validateDecimalFields() {
  for (const id of [...Object.values(measurementFields), 'height-inches']) {
    const input = document.getElementById(id);
    input.setCustomValidity('');
    if (input.disabled || !input.value.trim()) continue;
    const value = input.value.trim();
    const number = Number(value);
    const min = Number(input.getAttribute('min'));
    const max = Number(input.getAttribute('max'));
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value) || !Number.isFinite(number) || number < min || number > max) {
      input.setCustomValidity(`Enter a number from ${min} to ${max}, using a decimal point.`);
    }
  }
}

function renderMeasurements() {
  for (const [key, id] of Object.entries(measurementFields)) {
    if (key === 'heightCm') continue;
    const [min, max] = SizeSceneUnits.range(key, displaySystem);
    const input = document.getElementById(id);
    input.value = SizeSceneUnits.display(key, measurements[key], displaySystem);
    input.min = String(min);
    input.max = String(max);
    input.setCustomValidity('');
  }
  const imperialHeight = displaySystem === 'imperial';
  const metricHeightInput = document.getElementById('height');
  const feetInput = document.getElementById('height-feet');
  const inchesInput = document.getElementById('height-inches');
  metricHeightInput.value = SizeSceneUnits.display('heightCm', measurements.heightCm, 'metric');
  metricHeightInput.setCustomValidity('');
  const height = SizeSceneUnits.heightInFeetAndInches(measurements.heightCm);
  feetInput.value = height.feet;
  inchesInput.value = height.inches;
  inchesInput.setCustomValidity('');
  document.getElementById('height-metric-fields').hidden = imperialHeight;
  document.getElementById('height-imperial-fields').hidden = !imperialHeight;
  metricHeightInput.disabled = imperialHeight;
  feetInput.disabled = !imperialHeight;
  inchesInput.disabled = !imperialHeight;
  feetInput.required = imperialHeight;
  document.querySelectorAll('[data-length-unit]').forEach(node => {
    node.textContent = displaySystem === 'imperial' ? 'in' : 'cm';
  });
  document.querySelectorAll('[data-weight-unit]').forEach(node => {
    node.textContent = displaySystem === 'imperial' ? 'lb' : 'kg';
  });
  document.getElementById('weight').setAttribute('aria-label',
    displaySystem === 'imperial' ? 'Weight in pounds' : 'Weight in kilograms');
  document.getElementById('unit-metric').setAttribute('aria-pressed', String(displaySystem === 'metric'));
  document.getElementById('unit-imperial').setAttribute('aria-pressed', String(displaySystem === 'imperial'));
}

function setDisplaySystem(system) {
  if (system === displaySystem) return;
  displaySystem = system;
  renderMeasurements();
  if (unitPreferenceKey) {
    chrome.storage.local.set({ [unitPreferenceKey]: system }).catch(() => {
      saveStatus.textContent = 'Could not remember your unit choice. Please try again.';
    });
  }
}

for (const [key, id] of Object.entries(measurementFields)) {
  document.getElementById(id).addEventListener('input', event => {
    normalizeDecimalField(event.target);
    measurements[key] = SizeSceneUnits.toMetric(key, event.target.value,
      key === 'heightCm' ? 'metric' : displaySystem);
  });
}
for (const id of ['height-feet', 'height-inches']) {
  document.getElementById(id).addEventListener('input', event => {
    if (id === 'height-inches') normalizeDecimalField(event.target);
    measurements.heightCm = SizeSceneUnits.feetAndInchesToCm(
      document.getElementById('height-feet').value,
      document.getElementById('height-inches').value);
  });
}
document.getElementById('unit-metric').addEventListener('click', () => setDisplaySystem('metric'));
document.getElementById('unit-imperial').addEventListener('click', () => setDisplaySystem('imperial'));

function showAccount(mode) {
  signupForm.hidden = mode !== 'signup';
  loginForm.hidden = mode !== 'login';
  emailLinkForm.hidden = true;
  document.getElementById('show-signup').classList.toggle('selected', mode === 'signup');
  document.getElementById('show-login').classList.toggle('selected', mode === 'login');
  accountStatus.textContent = '';
}

function fallbackName(email) {
  const local = String(email || '').split('@')[0];
  return local.replace(/[._-]+/g, ' ').trim().replace(/\b\w/g, character => character.toUpperCase()) || 'Your profile';
}

function showProfile(name, email) {
  const displayName = name || fallbackName(email);
  document.getElementById('profile-name').textContent = displayName;
  document.getElementById('signed-in-email').textContent = email || '';
  document.getElementById('profile-avatar').textContent = displayName.split(/\s+/).slice(0, 2)
    .map(part => part[0]).join('').toUpperCase();
  document.getElementById('profile-name-input').value = name || '';
}

async function renderAccount() {
  const renderId = ++accountRenderId;
  if (setupMode) {
    setupLoading.hidden = false;
    setupLoading.classList.remove('is-error');
    setupRetry.hidden = true;
    setupLoadStatus.textContent = 'Just a moment while we get everything ready.';
  }
  passwordSettings.open = false;
  passwordForm.reset();
  passwordStatus.textContent = '';
  profileNameSettings.open = false;
  profileNameForm.reset();
  profileNameStatus.textContent = '';
  const token = await SizeSceneAuth.getAccessToken();
  const session = token && await SizeSceneAuth.getSession();
  const active = !!session;
  unitPreferenceKey = active ? `sizeSceneUnitPreference:${session.user_id || session.email}` : null;
  accountSwitch.hidden = active;
  signupForm.hidden = active || !document.getElementById('show-signup').classList.contains('selected');
  loginForm.hidden = active || !document.getElementById('show-login').classList.contains('selected');
  emailLinkForm.hidden = active || emailLinkForm.dataset.sent !== 'true';
  passwordNote.hidden = active;
  signedIn.hidden = !active;
  document.getElementById('profile-actions').hidden = !active;
  measurementsForm.hidden = true;
  if (active) {
    document.getElementById('profile-name').textContent = 'Loading profile…';
    document.getElementById('profile-avatar').textContent = '';
    document.getElementById('signed-in-email').textContent = session.email || '';
    SizeSceneAuth.getUser().then(user => {
      if (renderId === accountRenderId && !profileNameSettings.open)
        showProfile(user.user_metadata?.display_name || user.user_metadata?.full_name, user.email || session.email);
    }).catch(() => {
      if (renderId === accountRenderId)
        document.getElementById('profile-name').textContent = 'Your profile';
    });
  }
  document.getElementById('page-title').hidden = active;
  document.getElementById('page-intro').hidden = active;
  document.getElementById('account-heading').textContent = active ? 'Your profile' : 'Find your fit, every time';
  document.getElementById('account-intro').hidden = active;
  if (!active) {
    if (setupMode) window.location.replace('measurements.html');
    return;
  }
  try {
    const profile = await SizeSceneProfile.load();
    if (!profile && !setupMode) {
      await SizeSceneOnboarding.openSetupTab();
      accountStatus.textContent = 'Continue in the new tab to save your measurements.';
      return;
    }
    if (setupMode) {
      document.getElementById('page-title').textContent = 'Set up your fit';
      document.getElementById('page-intro').textContent = 'Add your measurements once, then SizeScene will keep them ready wherever you shop.';
      document.getElementById('page-title').hidden = false;
      document.getElementById('page-intro').hidden = false;
      document.querySelector('.account-section').hidden = true;
      document.getElementById('profile-actions').hidden = true;
    }
    measurementsForm.reset();
    measurements = Object.fromEntries(Object.keys(measurementFields).map(key =>
      [key, profile?.[key] == null ? null : Number(profile[key])]));
    const savedUnit = unitPreferenceKey
      ? (await chrome.storage.local.get(unitPreferenceKey))[unitPreferenceKey] : null;
    displaySystem = savedUnit === 'imperial' || savedUnit === 'metric'
      ? savedUnit : profile?.weightUnit === 'lb' ? 'imperial' : 'metric';
    renderMeasurements();
    measurementsForm.hidden = false;
    if (setupMode) setupLoading.hidden = true;
    accountStatus.textContent = '';
  } catch {
    if (setupMode) showSetupError('We couldn’t load the measurement page. Check your connection and try again.');
    else accountStatus.textContent = 'Could not load your saved measurements. Check your connection and reopen SizeScene.';
  }
}

setupRetry.addEventListener('click', () => {
  renderAccount().catch(() => showSetupError('We couldn’t check your account. Please try again.'));
});

document.getElementById('show-signup').addEventListener('click', () => showAccount('signup'));
document.getElementById('show-login').addEventListener('click', () => showAccount('login'));
if (new URLSearchParams(location.search).get('mode') === 'login') showAccount('login');

signupForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!signupForm.reportValidity()) return;
  const name = document.getElementById('signup-name').value;
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  const button = signupForm.querySelector('button[type="submit"]');
  button.disabled = true;
  accountStatus.textContent = 'Creating your account…';
  try {
    await SizeSceneAuth.signUp(email, password, { displayName: name });
    signupForm.reset();
    await renderAccount();
  } catch (error) {
    accountStatus.textContent = error.message || 'Could not create your account. Please try again.';
  } finally { button.disabled = false; }
});

profileNameForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!profileNameForm.reportValidity()) return;
  ++accountRenderId;
  const button = profileNameForm.querySelector('button[type="submit"]');
  button.disabled = true;
  profileNameStatus.textContent = 'Saving your name…';
  try {
    const user = await SizeSceneAuth.updateDisplayName(document.getElementById('profile-name-input').value);
    showProfile(user.user_metadata?.display_name, user.email);
    profileNameStatus.textContent = 'Name saved.';
    profileNameSettings.open = false;
  } catch (error) {
    profileNameStatus.textContent = error.message || 'Could not save your name. Please try again.';
  } finally { button.disabled = false; }
});

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!loginForm.reportValidity()) return;
  const button = loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  accountStatus.textContent = 'Logging in…';
  try {
    await SizeSceneAuth.signIn(document.getElementById('login-email').value,
      document.getElementById('login-password').value);
    loginForm.reset();
    await renderAccount();
  } catch {
    accountStatus.textContent = 'Could not log in. Check your email and password and try again.';
  } finally { button.disabled = false; }
});

document.getElementById('email-link-button').addEventListener('click', async () => {
  const emailInput = document.getElementById('login-email');
  if (!emailInput.reportValidity()) return;
  const button = document.getElementById('email-link-button');
  button.disabled = true;
  accountStatus.textContent = 'Sending your sign-in link…';
  try {
    await SizeSceneAuth.sendCode(emailInput.value);
    emailLinkForm.dataset.sent = 'true';
    emailLinkForm.hidden = false;
    accountStatus.textContent = 'Check your email. Copy the Sign in button’s link address and paste it below, or enter the code if your email shows one.';
  } catch (error) {
    accountStatus.textContent = error.message || 'Could not send a sign-in link. Please try again.';
  } finally { button.disabled = false; }
});

emailLinkForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!emailLinkForm.reportValidity()) return;
  const button = emailLinkForm.querySelector('button[type="submit"]');
  button.disabled = true;
  accountStatus.textContent = 'Signing in…';
  try {
    const value = document.getElementById('email-link-value').value.trim();
    const email = document.getElementById('login-email').value;
    if (/^\d{6,8}$/.test(value)) await SizeSceneAuth.verifyCode(email, value);
    else await SizeSceneAuth.verifyLink(value);
    emailLinkForm.reset();
    emailLinkForm.dataset.sent = 'false';
    await renderAccount();
  } catch (error) {
    accountStatus.textContent = error.message || 'That sign-in link or code did not work. Request a new one and try again.';
  } finally { button.disabled = false; }
});

passwordForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!passwordForm.reportValidity()) return;
  const password = document.getElementById('new-password').value;
  const status = document.getElementById('password-status');
  if (password !== document.getElementById('confirm-new-password').value) {
    status.textContent = 'The passwords do not match.';
    return;
  }
  const button = passwordForm.querySelector('button[type="submit"]');
  button.disabled = true;
  status.textContent = 'Saving your password…';
  try {
    await SizeSceneAuth.updatePassword(password);
    passwordForm.reset();
    status.textContent = 'Password saved. You can use it to log in next time.';
  } catch (error) {
    status.textContent = error.message || 'Could not save your password. Please try again.';
  } finally { button.disabled = false; }
});

measurementsForm.addEventListener('submit', async event => {
  event.preventDefault();
  validateDecimalFields();
  if (!measurementsForm.reportValidity()) return;
  const profile = Object.fromEntries(['waistCm', 'hipCm', 'heightCm', 'weightKg'].map(key =>
    [key, Math.round(measurements[key] * 10) / 10]));
  profile.weightUnit = displaySystem === 'imperial' ? 'lb' : 'kg';
  for (const key of ['inseamCm', 'thighCm']) {
    if (measurements[key] != null) profile[key] = Math.round(measurements[key] * 10) / 10;
  }
  const button = measurementsForm.querySelector('button[type="submit"]');
  button.disabled = true;
  saveStatus.textContent = 'Saving your measurements…';
  try {
    await SizeSceneProfile.save(profile);
    saveStatus.textContent = 'Saved to your account. Finding your fit…';
    if (setupMode) {
      measurementsForm.hidden = true;
      document.getElementById('setup-complete').hidden = false;
    } else window.location.href = 'popup.html';
  } catch (error) {
    saveStatus.textContent = error.message || 'Could not save your measurements. Please try again.';
  } finally { button.disabled = false; }
});

document.getElementById('close-setup').addEventListener('click', async () => {
  try {
    if (!await SizeSceneOnboarding.returnToShopping()) window.close();
  } catch {
    document.getElementById('close-setup').textContent = 'Close this tab to return to shopping';
  }
});

document.getElementById('sign-out').addEventListener('click', async () => {
  await SizeSceneAuth.signOut();
  await SizeSceneProfile.clearCache();
  measurementsForm.reset();
  measurements = Object.fromEntries(Object.keys(measurementFields).map(key => [key, null]));
  saveStatus.textContent = '';
  showAccount('login');
  await renderAccount();
});

renderAccount().catch(() => {
  if (setupMode) showSetupError('We couldn’t check your account. Please try again.');
  else accountStatus.textContent = 'Could not check your account. Please reopen SizeScene.';
});
