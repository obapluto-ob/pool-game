// FELTORA collection and cosmetic unlocks.
(function() {
  var FREE = {
    cues: ['wood', 'carbon', 'ivory', 'black', 'gold', 'chrome', 'crimson'],
    felts: ['green', 'blue', 'burgundy', 'slate', 'sand'],
    balls: [],
    mascots: ['marlow', 'ivy', 'rook', 'pip'],
    titles: [],
    tipTier: 0
  };
  var CATEGORIES = ['cues', 'felts', 'balls', 'mascots', 'titles'];
  var CATALOG = [
    { id: 'wood', name: 'Wood', category: 'cues', icon: '🪵', price: 0 },
    { id: 'carbon', name: 'Carbon', category: 'cues', icon: '◈', price: 0 },
    { id: 'ivory', name: 'Ivory', category: 'cues', icon: '◇', price: 0 },
    { id: 'black', name: 'Black', category: 'cues', icon: '◼', price: 0 },
    { id: 'gold', name: 'Gold', category: 'cues', icon: '✧', price: 0 },
    { id: 'chrome', name: 'Chrome', category: 'cues', icon: '◉', price: 0 },
    { id: 'crimson', name: 'Crimson', category: 'cues', icon: '◆', price: 0 },
    { id: 'neon', name: 'Neon', category: 'cues', icon: '✦', price: 800 },
    { id: 'obsidian', name: 'Obsidian', category: 'cues', icon: '◆', price: 1200 },
    { id: 'bamboo', name: 'Bamboo', category: 'cues', icon: '❖', price: 600 },
    { id: 'phantom', name: 'Phantom', category: 'cues', tipTier: 1, icon: '◌' },
    { id: 'inferno', name: 'Inferno', category: 'cues', tipTier: 2, icon: '✹' },
    { id: 'ghost', name: 'Ghost', category: 'cues', tipTier: 3, icon: '☄' },
    { id: 'legend-cue', name: 'Legend', category: 'cues', tipTier: 4, icon: '✧' },
    { id: 'green', name: 'Green', category: 'felts', icon: '🟢', price: 0 },
    { id: 'blue', name: 'Blue', category: 'felts', icon: '🔵', price: 0 },
    { id: 'burgundy', name: 'Burgundy', category: 'felts', icon: '🟣', price: 0 },
    { id: 'slate', name: 'Slate', category: 'felts', icon: '⬜', price: 0 },
    { id: 'sand', name: 'Sand', category: 'felts', icon: '🟤', price: 0 },
    { id: 'midnight', name: 'Midnight', category: 'felts', icon: '🌑', price: 700 },
    { id: 'crimson', name: 'Crimson', category: 'felts', icon: '🔴', price: 900 },
    { id: 'obsidian-felt', name: 'Obsidian', category: 'felts', tipTier: 1, icon: '⬛' },
    { id: 'galaxy', name: 'Galaxy', category: 'felts', tipTier: 3, icon: '🌌' },
    { id: 'gold-balls', name: 'Gold balls', category: 'balls', icon: '🟡', price: 1000 },
    { id: 'marble-balls', name: 'Marble balls', category: 'balls', icon: '⚪', price: 1500 },
    { id: 'chrome-balls', name: 'Chrome balls', category: 'balls', icon: '🔘', tipTier: 2 },
    { id: 'marlow', name: 'Marlow', category: 'mascots', icon: '🐺', price: 0 },
    { id: 'ivy', name: 'Ivy', category: 'mascots', icon: '🦊', price: 0 },
    { id: 'rook', name: 'Rook', category: 'mascots', icon: '🐻', price: 0 },
    { id: 'pip', name: 'Pip', category: 'mascots', icon: '🐰', price: 0 },
    { id: 'zara', name: 'Zara', category: 'mascots', icon: '🦊', price: 500 },
    { id: 'knox', name: 'Knox', category: 'mascots', icon: '🐻', price: 500 },
    { id: 'lena', name: 'Lena', category: 'mascots', tipTier: 2, icon: '🦉' },
    { id: 'dex', name: 'Dex', category: 'mascots', tipTier: 3, icon: '🦝' },
    { id: 'grinder', name: 'The Grinder', category: 'titles', icon: '♧', price: 300, title: 'The Grinder' },
    { id: 'night-owl', name: 'Night Owl', category: 'titles', icon: '☾', price: 400, title: 'Night Owl' },
    { id: 'supporter', name: 'Supporter', category: 'titles', icon: '⭐', tipTier: 1, title: 'Supporter' },
    { id: 'flame-title', name: 'Flame', category: 'titles', icon: '🔥', tipTier: 2, title: 'Flame' },
    { id: 'ghost-title', name: 'Ghost Tier', category: 'titles', icon: '👻', tipTier: 3, title: 'Ghost Tier' },
    { id: 'feltora-legend', name: 'FELTORA Legend', category: 'titles', icon: '👑', tipTier: 4, title: 'FELTORA Legend' }
  ];
  var TABS = [
    { id: 'all', label: 'All' },
    { id: 'cues', label: 'Cues' },
    { id: 'felts', label: 'Felts' },
    { id: 'balls', label: 'Balls' },
    { id: 'mascots', label: 'Mascots' },
    { id: 'titles', label: 'Titles' }
  ];
  var tipTierItems = {
    1: { cues: ['phantom'], felts: ['obsidian-felt'], balls: [], mascots: [], titles: ['supporter'] },
    2: { cues: ['inferno'], felts: [], balls: ['chrome-balls'], mascots: ['lena'], titles: ['flame-title'] },
    3: { cues: ['ghost'], felts: ['galaxy'], balls: [], mascots: ['dex'], titles: ['ghost-title'] },
    4: { cues: ['legend-cue'], felts: [], balls: [], mascots: [], titles: [] }
  };
  var currentTab = 'all';
  var selectedAmount = 0;
  var walletState = { balance: 0, inventory: {}, transactions: [], loaded: false, uid: null };
  var fallbackSessionId = 'tab-' + Date.now().toString(36) + Math.random().toString(36).slice(2);

  function account() {
    var auth = window.FeltoraAuth;
    var username = auth && auth.currentUser();
    return username && auth.getAccount(username);
  }

  function currentWallet() {
    var auth = window.FeltoraAuth;
    return auth && walletState.uid === auth.uid()
      ? walletState
      : { balance: 0, inventory: {}, transactions: [], loaded: false, uid: auth && auth.uid() };
  }

  function normalizeUnlocks(value) {
    var result = Object.assign({}, FREE, value && typeof value === 'object' ? value : {});
    CATEGORIES.forEach(function(category) {
      var owned = Array.isArray(result[category]) ? result[category].filter(function(id) {
        return typeof id === 'string';
      }) : [];
      result[category] = Array.from(new Set(FREE[category].concat(owned)));
    });
    result.tipTier = Math.max(0, Math.min(4, Number(result.tipTier) || 0));
    return result;
  }

  function normalizePoints(value) {
    var date = new Date().toISOString().slice(0, 10);
    var points = value && typeof value === 'object' ? value : {};
    return {
      today: points.lastReset === date ? Math.max(0, Number(points.today) || 0) : 0,
      total: Math.max(0, Number(points.total) || 0),
      lastReset: date
    };
  }

  function save(fields) {
    var auth = window.FeltoraAuth;
    if (!auth || !auth.currentUser()) return false;
    auth.update(fields);
    return true;
  }

  function isSupporter(profile) {
    var supporter = profile && profile.supporter;
    if (!supporter || !Number(supporter.tier)) return false;
    return !supporter.expiresAt || supporter.expiresAt > Date.now();
  }

  function hasTipTier(profile) {
    return !!(profile && profile.unlocks && Number(profile.unlocks.tipTier) > 0) || isSupporter(profile);
  }

  function syncWallet(response) {
    if (!response || !Number.isSafeInteger(response.balance) || response.balance < 0) {
      throw new Error('The wallet returned an invalid balance. Refresh and try again.');
    }
    var inventory = response.inventory && typeof response.inventory === 'object' ? response.inventory : {};
    walletState = {
      balance: response.balance,
      inventory: inventory,
      transactions: Array.isArray(response.transactions) ? response.transactions : [],
      loaded: true,
      uid: window.FeltoraAuth && window.FeltoraAuth.uid()
    };
    render();
    return walletState;
  }

  async function walletAction(action, fields) {
    var auth = window.FeltoraAuth;
    if (!auth || !auth.currentUser()) throw new Error('Sign in to use wallet credits.');
    var uid = auth.uid();
    if (walletState.uid && walletState.uid !== uid) {
      walletState = { balance: 0, inventory: {}, transactions: [], loaded: false, uid: uid };
    }
    var idToken = await auth.getIdToken();
    var response = await fetch('/api/wallet', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + idToken
      },
      body: JSON.stringify(Object.assign({ action: action }, fields || {}))
    });
    var result = await response.json().catch(function() { return {}; });
    if (!response.ok) {
      var error = new Error(result.error || 'The wallet request could not be completed.');
      error.status = response.status;
      throw error;
    }
    if (Number.isSafeInteger(result.balance)) syncWallet(result);
    return result;
  }

  async function refreshWallet() {
    var auth = window.FeltoraAuth;
    if (!auth || !auth.currentUser()) {
      walletState = { balance: 0, inventory: {}, transactions: [], loaded: false, uid: null };
      render();
      throw new Error('Sign in to see your FELTORA wallet.');
    }
    return walletAction('get');
  }

  function newRequestId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  }

  function tipAmountForTier(tier) {
    var config = window.FeltoraPhone && window.FeltoraPhone.getPaymentConfig
      ? window.FeltoraPhone.getPaymentConfig() : { currency: 'KES' };
    var currency = config.currency || 'KES';
    var exact = {
      KES: [0, 50, 150, 300, 500],
      USD: [0, 0.5, 1.5, 3, 5]
    };
    if (exact[currency]) return exact[currency][Math.max(1, Math.min(4, tier))];
    var rates = { NGN: 0.00065, GHS: 0.068, ZAR: 0.054, TZS: 0.00038, UGX: 0.00027, GBP: 1.27, EUR: 1.09 };
    var limits = [0, 0.5, 1.5, 3, 5];
    var rate = rates[currency] || 1;
    return Math.ceil(limits[Math.max(1, Math.min(4, tier))] / rate);
  }

  function applyTipTier(unlocks, tier) {
    for (var level = 1; level <= tier; level++) {
      var items = tipTierItems[level];
      Object.keys(items).forEach(function(category) {
        items[category].forEach(function(id) {
          if (unlocks[category].indexOf(id) === -1) unlocks[category].push(id);
        });
      });
    }
    unlocks.tipTier = Math.max(unlocks.tipTier, tier);
    if (tier >= 4) {
      if (unlocks.titles.indexOf('feltora-legend') === -1) unlocks.titles.push('feltora-legend');
      if (unlocks.cues.indexOf('legend-cue') === -1) unlocks.cues.push('legend-cue');
    }
    return unlocks;
  }

  function owns(item, profile) {
    var unlocks = normalizeUnlocks(profile && profile.unlocks);
    var wallet = currentWallet();
    return unlocks[item.category].indexOf(item.id) !== -1
      || (wallet.inventory[item.category] || []).indexOf(item.id) !== -1
      || (item.tipTier && unlocks.tipTier >= item.tipTier);
  }

  function equipped(item, profile) {
    if (!profile) return false;
    var current = profile.equipped && profile.equipped[item.category];
    if (item.category === 'cues') current = profile.cue || current;
    if (item.category === 'felts') current = profile.felt || current;
    if (item.category === 'balls') current = profile.ballSkin || current;
    if (item.category === 'mascots') current = profile.avatar || current;
    if (item.category === 'titles') current = profile.title || current;
    return current === item.id;
  }

  function itemPrice(item) {
    if (item.price) return item.price.toLocaleString() + ' pts · ' + item.price.toLocaleString() + ' credits';
    if (item.tipTier) {
      var config = window.FeltoraPhone && window.FeltoraPhone.getPaymentConfig
        ? window.FeltoraPhone.getPaymentConfig() : { currency: 'KES', symbol: 'KES' };
      return (config.symbol || config.currency || 'KES') + ' ' + tipAmountForTier(item.tipTier) + ' tip';
    }
    return 'Free';
  }

  function render() {
    var grid = document.getElementById('store-grid');
    var tabs = document.getElementById('store-tabs');
    var balance = document.getElementById('store-points');
    var walletBalance = document.getElementById('store-wallet-balance');
    var wallet = currentWallet();
    var profile = account();
    if (!grid || !tabs || !balance) return;
    tabs.innerHTML = TABS.map(function(tab) {
      return '<button class="store-tab' + (currentTab === tab.id ? ' active' : '') + '" type="button" data-store-tab="' + tab.id + '" aria-pressed="' + (currentTab === tab.id) + '">' + tab.label + '</button>';
    }).join('');
    var points = normalizePoints(profile && profile.points);
    balance.textContent = points.today.toLocaleString();
    if (walletBalance) walletBalance.textContent = wallet.loaded ? wallet.balance.toLocaleString() : '—';
    var items = CATALOG.filter(function(item) { return currentTab === 'all' || item.category === currentTab; });
    grid.innerHTML = items.map(function(item) {
      var owned = owns(item, profile);
      var equippedNow = owned && equipped(item, profile);
      var action;
      if (!profile) action = '<button type="button" class="store-action" data-store-action="signin">Sign in to save</button>';
      else if (equippedNow) action = '<button type="button" class="store-action equipped" disabled>Equipped</button>';
      else if (owned) action = '<button type="button" class="store-action" data-store-action="equip" data-item="' + item.id + '">Equip</button>';
      else if (item.price !== undefined) action = '<div class="store-actions">'
        + '<button type="button" class="store-action" data-store-action="unlock" data-item="' + item.id + '"' + (points.today < item.price ? ' disabled' : '') + '>Unlock with points</button>'
        + '<button type="button" class="store-action wallet-store-action" data-store-action="buy-wallet" data-item="' + item.id + '"' + (!wallet.loaded || wallet.balance < item.price ? ' disabled' : '') + '>Buy with ' + item.price.toLocaleString() + ' credits</button>'
        + '</div>';
      else action = '<button type="button" class="store-action" data-store-action="tip" data-tier="' + item.tipTier + '">Tip to unlock</button>';
      return '<article class="store-card' + (equippedNow ? ' is-equipped' : '') + '">'
        + '<div class="store-card-art" aria-hidden="true">' + item.icon + (owned ? '' : '<span class="store-lock" aria-label="Locked">🔒</span>') + '</div>'
        + '<strong>' + item.name + '</strong>'
        + '<span class="store-card-price">' + itemPrice(item) + '</span>'
        + action + '</article>';
    }).join('');
    var customTitle = document.getElementById('store-custom-title');
    if (customTitle) customTitle.hidden = !(profile && normalizeUnlocks(profile.unlocks).tipTier >= 3);
    var titleInput = document.getElementById('store-custom-title-input');
    if (titleInput && profile) titleInput.value = profile.customTitle || '';
  }

  function unlock(item) {
    var profile = account();
    if (!profile) return false;
    var points = normalizePoints(profile.points);
    if (!item.price || points.today < item.price || owns(item, profile)) return false;
    var unlocks = normalizeUnlocks(profile.unlocks);
    if (unlocks[item.category].indexOf(item.id) === -1) unlocks[item.category].push(item.id);
    points.today -= item.price;
    save({ points: points, unlocks: unlocks });
    render();
    return true;
  }

  async function buyWithWallet(item) {
    var profile = account();
    if (!profile) throw new Error('Sign in to purchase store items.');
    if (!item || !item.price || owns(item, profile)) return false;
    if (!currentWallet().loaded) await refreshWallet();
    var result = await walletAction('purchase', {
      category: item.category,
      itemId: item.id,
      requestId: newRequestId()
    });
    if (window.FeltoraPhone && window.FeltoraPhone.notify) {
      window.FeltoraPhone.notify(result.alreadyOwned ? 'You already own this item.' : item.name + ' unlocked with wallet credits.');
    }
    render();
    return true;
  }

  function equip(item) {
    var profile = account();
    if (!profile || !owns(item, profile)) return false;
    var fields = { equipped: Object.assign({}, profile.equipped || {}) };
    fields.equipped[item.category] = item.id;
    if (item.category === 'cues') fields.cue = item.id;
    if (item.category === 'felts') fields.felt = item.id;
    if (item.category === 'balls') fields.ballSkin = item.id;
    if (item.category === 'mascots') fields.avatar = item.id;
    if (item.category === 'titles') fields.title = item.title || item.name;
    save(fields);
    if (item.category === 'cues' && typeof window.setCueStyle === 'function') window.setCueStyle(item.id, true);
    if (item.category === 'felts' && typeof window.setFelt === 'function') window.setFelt(item.id, true);
    if (item.category === 'balls' && typeof window.setBallSkin === 'function') window.setBallSkin(item.id, true);
    if (item.category === 'mascots' && typeof window.setProfileAvatar === 'function') window.setProfileAvatar(item.id, true);
    if (item.category === 'titles') {
      var title = document.getElementById('profile-mascot-title');
      if (title) title.textContent = fields.title;
    }
    render();
    return true;
  }

  function openTip(tier) {
    selectedAmount = tipAmountForTier(tier);
    if (window.FeltoraPhone && window.FeltoraPhone.open) {
      window.FeltoraPhone.open('tip', selectedAmount);
      return;
    }
    var modal = document.getElementById('game-phone-modal');
    if (modal) modal.hidden = false;
  }

  function addPoints(amount, extra) {
    var profile = account();
    if (!profile) return false;
    var points = normalizePoints(profile.points);
    var earned = Math.max(0, Number(amount) || 0);
    points.today += earned;
    points.total += earned;
    save(Object.assign({ points: points }, extra || {}));
    return true;
  }

  function recordGame(result) {
    var profile = account();
    if (!profile || !result) return null;
    var today = new Date().toISOString().slice(0, 10);
    var yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    var previousDate = profile.lastPlayedDate || '';
    var firstToday = previousDate !== today;
    var dailyStreak = profile.dailyStreak || 0;
    if (firstToday) dailyStreak = previousDate === yesterday ? dailyStreak + 1 : 1;
    var sessionId;
    try {
      sessionId = sessionStorage.getItem('feltora-game-session');
      if (!sessionId) {
        sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2);
        sessionStorage.setItem('feltora-game-session', sessionId);
      }
    } catch (error) {
      sessionId = fallbackSessionId;
    }
    var previousSessionStreak = profile.sessionId === sessionId ? Number(profile.winStreak) || 0 : 0;
    var winStreak = result.won ? previousSessionStreak + 1 : 0;
    var xpGained = (result.won ? 100 : 40) + Math.max(0, Number(result.foulBonus) || 0);
    var oldXp = Math.max(0, Number(profile.xp) || 0);
    var newXp = oldXp + xpGained;
    var award = (firstToday ? 20 : 0) + (result.won ? 10 : 5) + (winStreak === 3 ? 15 : 0);
    var points = normalizePoints(profile.points);
    points.today += award;
    points.total += award;
    var fields = {
      xp: newXp,
      rank: rankForXp(newXp).name,
      lastPlayedDate: today,
      dailyStreak: dailyStreak,
      winStreak: winStreak,
      sessionId: sessionId,
      points: points
    };
    save(fields);
    return {
      xpGained: xpGained,
      xp: newXp,
      rank: rankForXp(newXp),
      previousRank: rankForXp(oldXp),
      points: points,
      pointsGained: award,
      dailyStreak: dailyStreak,
      winStreak: winStreak,
      firstToday: firstToday
    };
  }

  function rankForXp(xp) {
    var total = Math.max(0, Number(xp) || 0);
    var ranks = [
      { name: 'Hustler', min: 0, max: 499 },
      { name: 'Shark', min: 500, max: 1499 },
      { name: 'Assassin', min: 1500, max: 3999 },
      { name: 'Legend', min: 4000, max: 7999 },
      { name: 'Ghost', min: 8000, max: Infinity }
    ];
    var rank = ranks.find(function(entry) { return total <= entry.max; }) || ranks[ranks.length - 1];
    var next = ranks[ranks.indexOf(rank) + 1];
    return { name: rank.name, min: rank.min, max: rank.max, next: next ? next.min : null };
  }

  document.addEventListener('DOMContentLoaded', function() {
    var tabs = document.getElementById('store-tabs');
    var grid = document.getElementById('store-grid');
    if (!tabs || !grid) return;
    tabs.addEventListener('click', function(event) {
      var button = event.target.closest('[data-store-tab]');
      if (!button) return;
      currentTab = button.dataset.storeTab;
      render();
    });
    grid.addEventListener('click', function(event) {
      var button = event.target.closest('[data-store-action]');
      if (!button) return;
      var item = CATALOG.find(function(entry) { return entry.id === button.dataset.item; });
      if (button.dataset.storeAction === 'signin') {
        if (typeof window.showScreen === 'function') window.showScreen('auth');
      } else if (button.dataset.storeAction === 'unlock' && item) unlock(item);
      else if (button.dataset.storeAction === 'buy-wallet' && item) {
        button.disabled = true;
        buyWithWallet(item).catch(function(error) {
          if (window.FeltoraPhone && window.FeltoraPhone.notify) window.FeltoraPhone.notify(error.message);
          render();
        });
      }
      else if (button.dataset.storeAction === 'equip' && item) equip(item);
      else if (button.dataset.storeAction === 'tip') openTip(Number(button.dataset.tier));
    });
    var topUp = document.getElementById('store-wallet-topup');
    if (topUp) topUp.addEventListener('click', function() {
      if (window.FeltoraPhone) window.FeltoraPhone.openApp('mpesa');
    });
    var saveTitle = document.getElementById('store-custom-title-save');
    if (saveTitle) saveTitle.addEventListener('click', function() {
      var input = document.getElementById('store-custom-title-input');
      var profile = account();
      if (!input || !profile || normalizeUnlocks(profile.unlocks).tipTier < 3) return;
      var title = input.value.trim().slice(0, 20);
      if (!title) return;
      save({ customTitle: title, title: title });
      var visible = document.getElementById('profile-mascot-title');
      if (visible) visible.textContent = title;
      render();
    });
    render();
  });

  window.FeltoraStore = Object.freeze({
    catalog: CATALOG,
    free: FREE,
    render: render,
    recordGame: recordGame,
    addPoints: addPoints,
    rankForXp: rankForXp,
    hasTipTier: hasTipTier,
    openTip: openTip,
    walletAction: walletAction,
    refreshWallet: refreshWallet,
    getWallet: currentWallet,
    buyWithWallet: buyWithWallet,
    tipAmountForTier: tipAmountForTier,
    getPoints: function() {
      var profile = account();
      return normalizePoints(profile && profile.points);
    },
    owns: function(category, id) {
      var item = CATALOG.find(function(entry) { return entry.category === category && entry.id === id; });
      return !!item && owns(item, account());
    }
  });
})();
