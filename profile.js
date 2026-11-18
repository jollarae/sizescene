(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SizeSceneProfile = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ownerEmail = 'jollarae_ngabdi@berkeley.edu';
  const fields = { waistCm: 'waist_cm', hipCm: 'hip_cm', heightCm: 'height_cm',
    weightKg: 'weight_kg', inseamCm: 'inseam_cm', thighCm: 'thigh_cm' };
  const required = ['waistCm', 'hipCm', 'heightCm', 'weightKg'];
  const ranges = { waistCm: [40, 200], hipCm: [50, 220], heightCm: [100, 230],
    weightKg: [20, 350], inseamCm: [40, 120], thighCm: [25, 100] };
  const dependencies = options => ({
    auth: options?.auth || SizeSceneAuth,
    config: options?.config || SizeSceneAIConfig,
    storage: options?.storage || chrome.storage.local,
    fetcher: options?.fetcher || ((...args) => globalThis.fetch(...args))
  });
  async function context(options) {
    const { auth, config, fetcher } = dependencies(options);
    const token = await auth.getAccessToken(options);
    if (!token) throw new Error('Sign in to load your measurements');
    const session = await auth.getSession(options);
    if (!session) throw new Error('Sign in to load your measurements');
    let userId = session.user_id;
    let email = session.email;
    if (!userId) {
      const response = await fetcher(`${config.supabaseUrl}/auth/v1/user`, {
        headers: { apikey: config.publishableKey, Authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new Error('Could not identify your account');
      const user = await response.json();
      userId = user.id;
      email = user.email;
    }
    if (!userId) throw new Error('Could not identify your account');
    return { token, userId, email };
  }
  function profileFromRow(row) {
    if (!row) return null;
    const profile = {};
    for (const [key, column] of Object.entries(fields)) {
      if (row[column] != null) profile[key] = Number(row[column]);
    }
    if (row.weight_kg != null) profile.weightUnit = row.weight_unit === 'lb' ? 'lb' : 'kg';
    return profile;
  }
  function rowFromProfile(profile, userId) {
    const row = { user_id: userId };
    for (const [key, column] of Object.entries(fields)) {
      const value = profile?.[key];
      if (value == null || value === '') {
        if (required.includes(key)) throw new Error('Enter your waist, hip, height, and weight');
        row[column] = null;
        continue;
      }
      const number = Number(value);
      const [minimum, maximum] = ranges[key];
      if (!Number.isFinite(number) || number < minimum || number > maximum)
        throw new Error(`Check your ${key.replace('Cm', '').toLowerCase()} measurement`);
      row[column] = number;
    }
    row.weight_unit = profile?.weightUnit || 'kg';
    if (!['kg', 'lb'].includes(row.weight_unit)) throw new Error('Choose kilograms or pounds');
    return row;
  }
  async function request(url, init, options) {
    const response = await dependencies(options).fetcher(url, init);
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.message || detail.msg || 'Could not save measurements');
    }
    return response;
  }
  async function retireOldProfile(storage, email) {
    const legacy = (await storage.get('measurements')).measurements;
    if (legacy && email?.toLowerCase() !== ownerEmail) {
      const reserved = (await storage.get('legacyOwnerMeasurements')).legacyOwnerMeasurements;
      if (!reserved) await storage.set({ legacyOwnerMeasurements: legacy });
    }
    if (legacy) await storage.remove('measurements');
    if (email?.toLowerCase() === ownerEmail) await storage.remove('legacyOwnerMeasurements');
  }
  async function save(profile, options) {
    const { token, userId, email } = await context(options);
    const { config, storage } = dependencies(options);
    await request(`${config.supabaseUrl}/rest/v1/user_measurements?on_conflict=user_id`, {
      method: 'POST',
      headers: { apikey: config.publishableKey, Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify(rowFromProfile(profile, userId))
    }, options);
    await retireOldProfile(storage, email);
    return profile;
  }
  async function load(options) {
    const { token, email } = await context(options);
    const { config, storage } = dependencies(options);
    const response = await request(`${config.supabaseUrl}/rest/v1/user_measurements?select=*`, {
      method: 'GET', headers: { apikey: config.publishableKey, Authorization: `Bearer ${token}` }
    }, options);
    const rows = await response.json();
    if (rows[0]) {
      await retireOldProfile(storage, email);
      return profileFromRow(rows[0]);
    }
    const legacy = (await storage.get('measurements')).measurements;
    const reserved = (await storage.get('legacyOwnerMeasurements')).legacyOwnerMeasurements;
    if (email?.toLowerCase() === ownerEmail && (legacy || reserved)) return legacy || reserved;
    if (legacy) await retireOldProfile(storage, email);
    return null;
  }
  async function clearCache(options) {
    const { storage } = dependencies(options);
    await retireOldProfile(storage, '');
  }
  return { load, save, clearCache };
});
