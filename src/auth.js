/**
 * FELTORA – local account system
 * No server needed. Accounts stored in localStorage.
 * Each account: { username, pin (4-digit hash), avatar, cue, createdAt, stats }
 * PIN is hashed with a simple djb2 so it's not plaintext.
 */

const Auth = (() => {
  const STORE_KEY = 'feltora-accounts';
  const SESSION_KEY = 'feltora-session';

  function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return (h >>> 0).toString(16);
  }

  function load() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); }
    catch { return {}; }
  }

  function save(accounts) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(accounts)); } catch {}
  }

  function session() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
    catch { return null; }
  }

  function setSession(username) {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(username)); } catch {}
  }

  function clearSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch {}
  }

  return {
    /** Returns logged-in username or null */
    currentUser() { return session(); },

    /** Returns account object or null */
    getAccount(username) { return load()[username.toLowerCase()] || null; },

    /** Register new account. Returns { ok, error } */
    register(username, pin) {
      const u = username.trim().toLowerCase();
      if (!u || u.length < 3 || u.length > 18) return { ok: false, error: 'Username must be 3–18 characters.' };
      if (!/^[a-z0-9_]+$/.test(u)) return { ok: false, error: 'Only letters, numbers and underscores.' };
      if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) return { ok: false, error: 'PIN must be exactly 4 digits.' };
      const accounts = load();
      if (accounts[u]) return { ok: false, error: 'Username already taken.' };
      accounts[u] = {
        username: u,
        displayName: username.trim(),
        pinHash: hash(pin),
        avatar: 'marlow',
        cue: 'wood',
        createdAt: Date.now(),
        coins: 100,
        stats: { wins: 0, losses: 0, frames: 0 }
      };
      save(accounts);
      setSession(u);
      return { ok: true };
    },

    /** Login. Returns { ok, error } */
    login(username, pin) {
      const u = username.trim().toLowerCase();
      const accounts = load();
      const acc = accounts[u];
      if (!acc) return { ok: false, error: 'Account not found.' };
      if (acc.pinHash !== hash(pin)) return { ok: false, error: 'Wrong PIN.' };
      setSession(u);
      return { ok: true };
    },

    logout() { clearSession(); },

    /** Update account fields (avatar, cue, displayName) */
    update(fields) {
      const u = session();
      if (!u) return;
      const accounts = load();
      if (!accounts[u]) return;
      Object.assign(accounts[u], fields);
      save(accounts);
    },

    /** Record a game result */
    recordResult(won) {
      const u = session();
      if (!u) return;
      const accounts = load();
      if (!accounts[u]) return;
      accounts[u].stats.frames++;
      if (won) accounts[u].stats.wins++; else accounts[u].stats.losses++;
      save(accounts);
    },

    /** Add coins to logged-in user's balance */
    addCoins(amount) {
      const u = session();
      if (!u) return;
      const accounts = load();
      if (!accounts[u]) return;
      accounts[u].coins = (accounts[u].coins || 0) + amount;
      save(accounts);
    },

    /** Get coin balance for logged-in user, or null if not logged in */
    getCoins() {
      const u = session();
      if (!u) return null;
      const accounts = load();
      return accounts[u] ? (accounts[u].coins || 0) : null;
    }
  };
})();

window.FeltoraAuth = Auth;
