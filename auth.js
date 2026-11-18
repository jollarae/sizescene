(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.SizeSceneAuth = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const sessionKey = 'sizeSceneSession';
  const dependencies = options => ({
    storage: options?.storage || chrome.storage.local,
    config: options?.config || SizeSceneAIConfig,
    fetcher: options?.fetcher || ((...args) => globalThis.fetch(...args))
  });
  async function authRequest(path, body, options) {
    const { config, fetcher } = dependencies(options);
    const response = await fetcher(`${config.supabaseUrl}/auth/v1/${path}`, {
      method: 'POST',
      headers: { apikey: config.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      const error = new Error(detail.msg || detail.message || detail.error_description || 'Account request failed');
      error.status = response.status;
      error.authRejected = true;
      throw error;
    }
    return response.json();
  }
  function storeSession(session, storage) {
    if (!session?.access_token || !session?.refresh_token) throw new Error('No session returned');
    const expiresAt = session.expires_at || Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600);
    return storage.set({ [sessionKey]: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: expiresAt,
      email: session.user?.email || '',
      user_id: session.user?.id || ''
    } });
  }
  function credentials(email, password) {
    email = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address');
    if (typeof password !== 'string' || password.length < 8) throw new Error('Use a password with at least 8 characters');
    return { email, password };
  }
  async function signUp(email, password, options) {
    const signup = credentials(email, password);
    if (options?.displayName !== undefined) {
      const displayName = String(options.displayName).trim().replace(/\s+/g, ' ');
      if (!displayName || displayName.length > 80) throw new Error('Enter a name of 80 characters or fewer');
      signup.data = { display_name: displayName };
    }
    const session = await authRequest('signup', signup, options);
    if (!session.access_token) throw new Error('Email confirmation is enabled. Turn it off for this test version.');
    await storeSession(session, dependencies(options).storage);
    return session.user;
  }
  async function signIn(email, password, options) {
    const session = await authRequest('token?grant_type=password', credentials(email, password), options);
    await storeSession(session, dependencies(options).storage);
    return session.user;
  }
  async function updatePassword(password, options) {
    if (typeof password !== 'string' || password.length < 8)
      throw new Error('Use a password with at least 8 characters');
    const { config, fetcher } = dependencies(options);
    const token = await getAccessToken(options);
    if (!token) throw new Error('Sign in with your email link first');
    const response = await fetcher(`${config.supabaseUrl}/auth/v1/user`, {
      method: 'PUT',
      headers: { apikey: config.publishableKey, Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.msg || detail.message || detail.error_description || 'Could not set your password');
    }
    return response.json();
  }
  async function getUser(options) {
    const { config, fetcher } = dependencies(options);
    const token = await getAccessToken(options);
    if (!token) throw new Error('Sign in first');
    const response = await fetcher(`${config.supabaseUrl}/auth/v1/user`, {
      headers: { apikey: config.publishableKey, Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error('Could not load your profile');
    return response.json();
  }
  async function updateDisplayName(name, options) {
    name = String(name || '').trim().replace(/\s+/g, ' ');
    if (!name || name.length > 80) throw new Error('Enter a name of 80 characters or fewer');
    const { config, fetcher } = dependencies(options);
    const token = await getAccessToken(options);
    if (!token) throw new Error('Sign in first');
    const response = await fetcher(`${config.supabaseUrl}/auth/v1/user`, {
      method: 'PUT',
      headers: { apikey: config.publishableKey, Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json' },
      body: JSON.stringify({ data: { display_name: name } })
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.msg || detail.message || detail.error_description || 'Could not save your name');
    }
    return response.json();
  }
  async function sendCode(email, options) {
    email = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address');
    const config = dependencies(options).config;
    if (config.ownerEmail && email !== config.ownerEmail.toLowerCase()) throw new Error('Use the approved test email');
    await authRequest('otp', { email, create_user: false }, options);
  }
  async function verifyCode(email, token, options) {
    email = String(email || '').trim().toLowerCase();
    token = String(token || '').trim();
    if (!/^\d{6,8}$/.test(token)) throw new Error('Enter the code from your email');
    const { storage } = dependencies(options);
    const session = await authRequest('verify', { email, token, type: 'email' }, options);
    await storeSession(session, storage);
    return session.user;
  }
  async function verifyLink(link, options) {
    const { config, storage, fetcher } = dependencies(options);
    let url;
    try { url = new URL(String(link || '').trim()); }
    catch { throw new Error('Paste the full sign-in link from your email'); }
    if (url.origin === 'http://localhost:3000' && url.pathname === '/') {
      const params = new URLSearchParams(url.hash.slice(1));
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      if (!accessToken || !refreshToken || params.get('token_type') !== 'bearer')
        throw new Error('The redirect does not contain a sign-in session');
      const response = await fetcher(`${config.supabaseUrl}/auth/v1/user`, {
        headers: { apikey: config.publishableKey, authorization: `Bearer ${accessToken}` }
      });
      if (!response.ok) throw new Error('The sign-in session expired. Request a new link');
      const user = await response.json();
      if ((config.ownerEmail && user.email?.toLowerCase() !== config.ownerEmail.toLowerCase()) ||
          !user.email_confirmed_at) throw new Error('Use the approved test email');
      await storeSession({
        access_token: accessToken, refresh_token: refreshToken,
        expires_at: Number(params.get('expires_at')) || undefined,
        expires_in: Number(params.get('expires_in')) || 3600,
        user
      }, storage);
      return user;
    }
    const expected = new URL(config.supabaseUrl);
    const tokenHash = url.searchParams.get('token');
    const type = url.searchParams.get('type');
    if (url.origin !== expected.origin || url.pathname !== '/auth/v1/verify' ||
        !tokenHash || !['email', 'magiclink', 'signup'].includes(type)) {
      throw new Error('This is not a SizeScene sign-in link');
    }
    const session = await authRequest('verify', { token_hash: tokenHash, type }, options);
    if (config.ownerEmail && session.user?.email?.toLowerCase() !== config.ownerEmail.toLowerCase()) {
      throw new Error('Use the approved test email');
    }
    await storeSession(session, storage);
    return session.user;
  }
  async function getSession(options) {
    const { storage } = dependencies(options);
    return (await storage.get(sessionKey))[sessionKey] || null;
  }
  async function getAccessToken(options) {
    const { storage } = dependencies(options);
    const session = await getSession(options);
    if (!session?.access_token || !session.refresh_token) return null;
    if (Number(session.expires_at) > Math.floor(Date.now() / 1000) + 60) return session.access_token;
    try {
      const refreshed = await authRequest('token?grant_type=refresh_token', { refresh_token: session.refresh_token }, options);
      await storeSession(refreshed, storage);
      return refreshed.access_token;
    } catch (error) {
      if (error.authRejected) {
        await storage.remove(sessionKey);
        return null;
      }
      throw error;
    }
  }
  async function signOut(options) { await dependencies(options).storage.remove(sessionKey); }
  return { signUp, signIn, updatePassword, getUser, updateDisplayName, sendCode, verifyCode, verifyLink,
    getSession, getAccessToken, signOut };
});
