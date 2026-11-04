/**
 * FELTORA account profiles stay local for offline game data.
 * Registered sign-ins are verified by the auth API and Firebase custom tokens.
 */
const Auth = (() => {
  const STORE_KEY = 'feltora-accounts';
  const SESSION_KEY = 'feltora-session';
  const CLOUD_SESSION_KEY = 'feltora-cloud-session';

  function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return (h >>> 0).toString(16);
  }

  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
      if (typeof data !== 'object' || Array.isArray(data) || data === null) return {};
      return Object.assign(Object.create(null), data);
    } catch {
      return {};
    }
  }

  function save(accounts) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(accounts));
      return true;
    } catch {
      return false;
    }
  }

  function session() {
    try {
      const username = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      return typeof username === 'string' ? username : null;
    } catch {
      return null;
    }
  }

  function cloudSession() {
    try {
      const data = JSON.parse(localStorage.getItem(CLOUD_SESSION_KEY) || 'null');
      return data && data.uid && data.refreshToken ? data : null;
    } catch {
      return null;
    }
  }

  function setCloudSession(data, username) {
    try {
      localStorage.setItem(CLOUD_SESSION_KEY, JSON.stringify(Object.assign({}, data, { username })));
      localStorage.setItem(SESSION_KEY, JSON.stringify(username));
    } catch {
      throw new Error('Sign-in could not be saved on this device. Check browser storage settings and try again.');
    }
  }

  function clearCloudSession() {
    try {
      localStorage.removeItem(CLOUD_SESSION_KEY);
      localStorage.removeItem(SESSION_KEY);
    } catch {
      console.error('Could not clear the saved sign-in session.');
    }
  }

  function apiKey() {
    const key = window.FeltoraFirebase && window.FeltoraFirebase.apiKey;
    if (!key) throw new Error('Firebase client configuration is not available.');
    return key;
  }

  async function callAuthEndpoint(action, username, pin, profile) {
    const response = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, username, pin, profile })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.error || 'Authentication request failed.');
      error.status = response.status;
      throw error;
    }
    return result;
  }

  async function exchangeCustomToken(customToken) {
    const response = await fetch(
      'https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=' + encodeURIComponent(apiKey()),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: customToken, returnSecureToken: true })
      }
    );
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.idToken || !result.refreshToken) {
      throw new Error('Could not establish a Firebase session. Please try again.');
    }
    return result;
  }

  function localProfile(account) {
    return {
      displayName: account.displayName,
      avatar: account.avatar,
      cue: account.cue,
      felt: account.felt,
      title: account.title,
      vibe: account.vibe
    };
  }

  function storeAccount(username, profile, existing) {
    const accounts = load();
    const account = Object.assign({}, profile || {}, existing || {}, {
      username,
      stats: (existing && existing.stats) || (profile && profile.stats) || { wins: 0, losses: 0, frames: 0 }
    });
    if (profile) {
      ['displayName', 'avatar', 'cue', 'felt', 'title', 'vibe'].forEach((key) => {
        if (profile[key] !== undefined) account[key] = profile[key];
      });
    }
    delete account.pinHash;
    accounts[username] = account;
    if (!save(accounts)) throw new Error('Your profile could not be saved on this device.');
    return account;
  }

  function saveTokenSession(tokenResult, authResult) {
    const expiresIn = Number(tokenResult.expiresIn);
    setCloudSession({
      uid: authResult.uid,
      idToken: tokenResult.idToken,
      refreshToken: tokenResult.refreshToken,
      expiresAt: Date.now() + expiresIn * 1000
    }, authResult.username);
  }

  return {
    currentUser() {
      const cloud = cloudSession();
      return cloud ? cloud.username || session() : null;
    },

    uid() {
      const cloud = cloudSession();
      return cloud ? cloud.uid : null;
    },

    getAccount(username) {
      if (typeof username !== 'string') return null;
      const accounts = load();
      const key = username.toLowerCase();
      return Object.prototype.hasOwnProperty.call(accounts, key) ? accounts[key] : null;
    },

    async register(username, pin) {
      const u = typeof username === 'string' ? username.trim().toLowerCase() : '';
      if (!u || u.length < 3 || u.length > 18) return { ok: false, error: 'Username must be 3–18 characters.' };
      if (!/^[a-z0-9_]+$/.test(u)) return { ok: false, error: 'Only letters, numbers and underscores.' };
      if (!pin || !/^\d{4}$/.test(pin)) return { ok: false, error: 'PIN must be exactly 4 digits.' };

      const accounts = load();
      const existing = Object.prototype.hasOwnProperty.call(accounts, u) ? accounts[u] : null;
      if (existing && existing.pinHash && existing.pinHash !== hash(pin)) {
        return { ok: false, error: 'Enter the existing PIN for this saved profile to keep its data.' };
      }

      try {
        const authResult = await callAuthEndpoint(
          'register',
          u,
          pin,
          existing ? localProfile(existing) : null
        );
        const tokenResult = await exchangeCustomToken(authResult.customToken);
        storeAccount(u, authResult.profile, existing);
        saveTokenSession(tokenResult, authResult);
        return { ok: true };
      } catch (error) {
        return { ok: false, error: error.message || 'Account creation failed.' };
      }
    },

    async login(username, pin) {
      const u = typeof username === 'string' ? username.trim().toLowerCase() : '';
      if (!u || !pin) return { ok: false, error: 'Enter your username and PIN.' };

      try {
        const authResult = await callAuthEndpoint('login', u, pin);
        const tokenResult = await exchangeCustomToken(authResult.customToken);
        const accounts = load();
        const local = Object.prototype.hasOwnProperty.call(accounts, u) ? accounts[u] : null;
        const preserveLocal = !local || !local.pinHash || local.pinHash === hash(pin);
        storeAccount(u, authResult.profile, preserveLocal ? local : null);
        saveTokenSession(tokenResult, authResult);
        return { ok: true };
      } catch (error) {
        const accounts = load();
        const existing = Object.prototype.hasOwnProperty.call(accounts, u) ? accounts[u] : null;
        if (error.status === 401 && existing && existing.pinHash === hash(pin)) {
          return {
            ok: false,
            error: 'This profile is saved only on this device. Use Create account with its existing PIN to enable online access.'
          };
        }
        return { ok: false, error: error.message || 'Sign-in failed.' };
      }
    },

    async getIdToken() {
      const cloud = cloudSession();
      if (!cloud) return null;
      if (cloud.idToken && cloud.expiresAt > Date.now() + 60_000) return cloud.idToken;

      const response = await fetch(
        'https://securetoken.googleapis.com/v1/token?key=' + encodeURIComponent(apiKey()),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: cloud.refreshToken
          })
        }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.id_token || !result.refresh_token) {
        if (response.status === 400 || response.status === 401) clearCloudSession();
        throw new Error('Your Firebase session could not be refreshed. Sign in again.');
      }

      const refreshed = {
        uid: result.user_id || cloud.uid,
        idToken: result.id_token,
        refreshToken: result.refresh_token,
        expiresAt: Date.now() + Number(result.expires_in) * 1000
      };
      try {
        localStorage.setItem(CLOUD_SESSION_KEY, JSON.stringify(refreshed));
      } catch {
        throw new Error('Your refreshed sign-in could not be saved on this device.');
      }
      return refreshed.idToken;
    },

    logout() {
      clearCloudSession();
    },

    update(fields) {
      const username = this.currentUser();
      if (!username) return;
      const accounts = load();
      if (!accounts[username]) return;
      Object.assign(accounts[username], fields);
      if (!save(accounts)) {
        console.error('Profile changes could not be saved on this device.');
        return;
      }

      const profile = localProfile(accounts[username]);
      if (window.FeltoraFirebase && window.FeltoraFirebase.update) {
        window.FeltoraFirebase.update('/profiles/' + this.uid(), profile)
          .catch((error) => console.error('Profile sync failed:', error));
      }
    },

    recordResult(won) {
      const username = this.currentUser();
      if (!username) return;
      const accounts = load();
      if (!accounts[username]) return;
      accounts[username].stats.frames++;
      if (won) accounts[username].stats.wins++; else accounts[username].stats.losses++;
      if (!save(accounts)) console.error('Game result could not be saved on this device.');
    }
  };
})();

window.FeltoraAuth = Auth;
