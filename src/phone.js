// FELTORA Phone System v4
(function() {
  var phoneOpen = false;
  var batteryLevel = 100;
  var batteryCharging = false;
  var weatherData = { temp: '--', desc: 'Loading weather', icon: '🌤', place: 'Nairobi, Kenya' };
  var radioPlaying = false;
  var radioAudio = null;
  var currentStation = null;
  var PAYSTACK_KEY = 'pk_live_843fc3c7f2b2b12acf9de27e102dcb8ab3229136';
  var userCountry = 'KE'; // default Kenya, updated by geo fetch

  // ── Geo detection (ipapi.co — free, no key, 1000/day) ────────────
  function detectCountry() {
    fetch('https://ipapi.co/json/')
      .then(function(r) { return r.json(); })
      .then(function(d) {
        userCountry = d.country_code || 'KE';
        rebuildTipUI();
      }).catch(function() {
        rebuildTipUI(); // still build with default KE
      });
  }

  // Rebuild the entire tip UI for the detected country
  function rebuildTipUI() {
    var cfg = getGeoConfig(userCountry);
    selectedTipAmt = 0;

    // Update preset buttons
    var amtBtns = document.querySelectorAll('.phone-tip-amt');
    amtBtns.forEach(function(btn, i) {
      var preset = cfg.presets[i];
      if (!preset) return;
      btn.dataset.amount = preset.amount;
      btn.classList.remove('active');
      var emojiEl = btn.querySelector('.tip-amt-emoji');
      var valEl   = btn.querySelector('.tip-amt-val');
      var lblEl   = btn.querySelector('.tip-amt-label');
      if (emojiEl) emojiEl.textContent = preset.emoji;
      if (valEl)   valEl.textContent   = cfg.symbol + ' ' + preset.amount.toLocaleString();
      if (lblEl)   lblEl.textContent   = preset.label;
    });

    // Update display
    var display = document.getElementById('tip-amount-display');
    if (display) display.textContent = '—';

    // Update pay button methods label
    var payBtn = document.getElementById('phone-tip-pay');
    if (payBtn) {
      var methodsEl = payBtn.querySelector('.tip-pay-methods');
      if (methodsEl) methodsEl.textContent = cfg.label;
    }

    // Update custom input min
    var custom = document.getElementById('tip-custom-amount');
    if (custom) {
      custom.min = cfg.minAmount;
      custom.placeholder = 'Custom amount (' + cfg.symbol + ')';
    }

    // Reset tipInitDone so initTipView re-binds with new amounts
    tipInitDone = false;
    initTipView();
  }

  // Full geo config — currency, channels, preset amounts, labels
  var GEO_CONFIG = {
    KE: { currency:'KES', symbol:'KES', channels:['card','mobile_money','bank'],
          label:'M-Pesa · Card · Bank',
          presets:[
            { amount:50,   emoji:'☕', label:'Coffee' },
            { amount:200,  emoji:'🍕', label:'Pizza slice' },
            { amount:500,  emoji:'🍺', label:'Round of drinks' },
            { amount:1000, emoji:'👑', label:'Legend tier' }
          ],
          minAmount: 10 },
    NG: { currency:'NGN', symbol:'₦', channels:['card','bank','ussd'],
          label:'Card · Bank · USSD',
          presets:[
            { amount:500,   emoji:'☕', label:'Coffee' },
            { amount:2000,  emoji:'🍕', label:'Pizza slice' },
            { amount:5000,  emoji:'🍺', label:'Round of drinks' },
            { amount:10000, emoji:'👑', label:'Legend tier' }
          ],
          minAmount: 100 },
    GH: { currency:'GHS', symbol:'GH₵', channels:['card','mobile_money'],
          label:'Card · Mobile Money',
          presets:[
            { amount:5,   emoji:'☕', label:'Coffee' },
            { amount:20,  emoji:'🍕', label:'Pizza slice' },
            { amount:50,  emoji:'🍺', label:'Round of drinks' },
            { amount:100, emoji:'👑', label:'Legend tier' }
          ],
          minAmount: 1 },
    ZA: { currency:'ZAR', symbol:'R', channels:['card','bank'],
          label:'Card · Bank',
          presets:[
            { amount:20,  emoji:'☕', label:'Coffee' },
            { amount:80,  emoji:'🍕', label:'Pizza slice' },
            { amount:200, emoji:'🍺', label:'Round of drinks' },
            { amount:500, emoji:'👑', label:'Legend tier' }
          ],
          minAmount: 5 },
    TZ: { currency:'TZS', symbol:'TSh', channels:['card','mobile_money'],
          label:'Card · Mobile Money',
          presets:[
            { amount:2000,  emoji:'☕', label:'Coffee' },
            { amount:8000,  emoji:'🍕', label:'Pizza slice' },
            { amount:20000, emoji:'🍺', label:'Round of drinks' },
            { amount:50000, emoji:'👑', label:'Legend tier' }
          ],
          minAmount: 500 },
    UG: { currency:'UGX', symbol:'USh', channels:['card','mobile_money'],
          label:'Card · Mobile Money',
          presets:[
            { amount:5000,   emoji:'☕', label:'Coffee' },
            { amount:20000,  emoji:'🍕', label:'Pizza slice' },
            { amount:50000,  emoji:'🍺', label:'Round of drinks' },
            { amount:100000, emoji:'👑', label:'Legend tier' }
          ],
          minAmount: 1000 },
    US: { currency:'USD', symbol:'$', channels:['card'],
          label:'Card · Apple Pay · Google Pay',
          presets:[
            { amount:1,  emoji:'☕', label:'Coffee' },
            { amount:5,  emoji:'🍕', label:'Pizza slice' },
            { amount:10, emoji:'🍺', label:'Round of drinks' },
            { amount:25, emoji:'👑', label:'Legend tier' }
          ],
          minAmount: 1 },
    GB: { currency:'GBP', symbol:'£', channels:['card'],
          label:'Card · Apple Pay · Google Pay',
          presets:[
            { amount:1,  emoji:'☕', label:'Coffee' },
            { amount:4,  emoji:'🍕', label:'Pizza slice' },
            { amount:8,  emoji:'🍺', label:'Round of drinks' },
            { amount:20, emoji:'👑', label:'Legend tier' }
          ],
          minAmount: 1 },
    EU: { currency:'EUR', symbol:'€', channels:['card'],
          label:'Card · Apple Pay · Google Pay',
          presets:[
            { amount:1,  emoji:'☕', label:'Coffee' },
            { amount:5,  emoji:'🍕', label:'Pizza slice' },
            { amount:10, emoji:'🍺', label:'Round of drinks' },
            { amount:20, emoji:'👑', label:'Legend tier' }
          ],
          minAmount: 1 }
  };

  // EU countries
  var EU_COUNTRIES = ['DE','FR','IT','ES','NL','BE','AT','PT','FI','IE','GR','LU','SK','SI','EE','LV','LT','MT','CY'];

  function getGeoConfig(country) {
    if (GEO_CONFIG[country]) return GEO_CONFIG[country];
    if (EU_COUNTRIES.indexOf(country) !== -1) return GEO_CONFIG['EU'];
    // other Africa — use USD with mobile_money
    var africa = ['RW','ET','SN','CI','CM','MZ','ZM','MW','BW','NA','SZ'];
    if (africa.indexOf(country) !== -1) return {
      currency:'USD', symbol:'$', channels:['card','mobile_money'],
      label:'Card · Mobile Money',
      presets:[
        { amount:1, emoji:'☕', label:'Coffee' },
        { amount:5, emoji:'🍕', label:'Pizza slice' },
        { amount:10, emoji:'🍺', label:'Round of drinks' },
        { amount:25, emoji:'👑', label:'Legend tier' }
      ],
      minAmount: 1
    };
    // rest of world — card only
    return GEO_CONFIG['US'];
  }

  // kept for backward compat
  function getTipPaymentMethods(country) {
    var cfg = getGeoConfig(country);
    return { currency: cfg.currency, channels: cfg.channels, label: cfg.label };
  }

  // Thank you messages based on tip size (in USD equivalent tiers)
  function getThankyouMessage(amount, currency, symbol) {
    // normalize to rough USD for tier comparison
    var usdRates = { KES:0.0077, NGN:0.00065, GHS:0.068, ZAR:0.054, TZS:0.00038, UGX:0.00027, USD:1, GBP:1.27, EUR:1.09 };
    var rate = usdRates[currency] || 1;
    var usd = amount * rate;
    if (usd < 1)  return { emoji:'☕', msg:'Even a coffee means the world. Thank you for keeping FELTORA alive!' };
    if (usd < 5)  return { emoji:'🍕', msg:'That pizza slice just funded a new feature. Seriously, thank you!' };
    if (usd < 15) return { emoji:'🍺', msg:'A round of drinks! You are the reason FELTORA keeps getting better. Legend.' };
    if (usd < 30) return { emoji:'👑', msg:'You just became FELTORA royalty. This tip covers a whole month of server costs. Thank you!' };
    return { emoji:'🏆', msg:'This is unreal. You are an absolute legend. FELTORA exists because of people like you. Thank you from the bottom of my heart.' };
  }

  var KENYA_STATIONS = [
    { name: 'Capital FM',    url: 'https://stream.zeno.fm/0r0xa792kwzuv', emoji: '🎵' },
    { name: 'Radio Jambo',   url: 'https://stream.zeno.fm/yn65m7h9p7zuv', emoji: '🎶' },
    { name: 'Classic 105',   url: 'https://stream.zeno.fm/tsxbm1qp7wzuv', emoji: '🎸' },
    { name: 'Kiss 100',      url: 'https://stream.zeno.fm/f3b8w8p9p7zuv', emoji: '💋' },
    { name: 'Homeboyz Radio',url: 'https://stream.zeno.fm/r8b2m3h9p7zuv', emoji: '🏠' }
  ];

  var ABUSIVE_PATTERNS = [
    /\b(fuck|shit|bitch|nigga|nigger|cunt|asshole|bastard|whore|slut|faggot|retard)\b/i,
    /\b(kill\s+your?self|kys|go\s+die)\b/i
  ];

  function isAbusive(text) {
    return ABUSIVE_PATTERNS.some(function(p) { return p.test(text); });
  }

  // ── Battery ──────────────────────────────────────────────────────
  function initBattery() {
    if (!navigator.getBattery) return;
    navigator.getBattery().then(function(bat) {
      batteryLevel = Math.round(bat.level * 100);
      batteryCharging = bat.charging;
      updateStatusBar();
      bat.addEventListener('levelchange', function() { batteryLevel = Math.round(bat.level * 100); updateStatusBar(); });
      bat.addEventListener('chargingchange', function() { batteryCharging = bat.charging; updateStatusBar(); });
    }).catch(function() {});
  }

  // ── Weather ──────────────────────────────────────────────────────
  function fetchWeather(latitude, longitude, place) {
    var lat = typeof latitude === 'number' ? latitude : -1.2921;
    var lon = typeof longitude === 'number' ? longitude : 36.8219;
    var location = place || 'Nairobi, Kenya';
    var status = document.getElementById('phone-weather-status');
    weatherData = { temp: '--', desc: 'Loading weather', icon: '🌤', place: location };
    if (status) status.textContent = 'Loading current conditions…';
    updateWeatherWidget();
    fetch('https://api.open-meteo.com/v1/forecast?latitude=' + encodeURIComponent(lat) + '&longitude=' + encodeURIComponent(lon) + '&current_weather=true&temperature_unit=celsius')
      .then(function(r) {
        if (!r.ok) throw new Error('Weather service returned HTTP ' + r.status);
        return r.json();
      })
      .then(function(d) {
        if (!d.current_weather || typeof d.current_weather.temperature !== 'number') {
          throw new Error('Weather service response did not include current conditions');
        }
        var temp = Math.round(d.current_weather.temperature);
        var code = d.current_weather.weathercode;
        var icon = code <= 1 ? '☀️' : code <= 3 ? '⛅' : code <= 67 ? '🌧' : '🌩';
        weatherData = { temp: temp + '°C', desc: 'Current conditions', icon: icon, place: location };
        if (status) status.textContent = 'Live weather via Open-Meteo.';
        updateWeatherWidget();
      }).catch(function(error) {
        weatherData = { temp: '--', desc: 'Weather unavailable', icon: '—', place: location };
        if (status) status.textContent = 'Could not load weather. Check your connection and try again.';
        updateWeatherWidget();
        console.warn('Weather load failed:', error);
      });
  }

  function fetchLocalWeather() {
    var status = document.getElementById('phone-weather-status');
    if (!navigator.geolocation) {
      if (status) status.textContent = 'Location is not supported by this browser.';
      return;
    }
    if (status) status.textContent = 'Waiting for location permission…';
    navigator.geolocation.getCurrentPosition(function(position) {
      fetchWeather(position.coords.latitude, position.coords.longitude, 'Your location');
    }, function(error) {
      if (status) {
        status.textContent = error.code === error.PERMISSION_DENIED
          ? 'Location permission was denied. Weather is still available for Nairobi.'
          : 'Could not get your location. Weather is still available for Nairobi.';
      }
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  }

  function updateWeatherWidget() {
    var el = document.getElementById('phone-weather-widget');
    if (el) el.innerHTML = weatherData.icon + ' <strong>' + weatherData.temp + '</strong> ' + weatherData.desc;
    var place = document.getElementById('phone-weather-location');
    if (place) place.textContent = weatherData.place;
  }

  function updateStatusBar() {
    var timeEl = document.getElementById('phone-time');
    var battEl = document.getElementById('phone-battery');
    if (timeEl) {
      var now = new Date();
      var h = now.getHours(), m = now.getMinutes();
      timeEl.textContent = h + ':' + (m < 10 ? '0' + m : m);
    }
    if (battEl) {
      var icon = batteryCharging ? '⚡' : batteryLevel > 20 ? '🔋' : '🪫';
      battEl.textContent = icon + ' ' + batteryLevel + '%';
    }
    var psUser = document.getElementById('ps-username-val');
    if (psUser) {
      var me = window.FeltoraAuth && window.FeltoraAuth.currentUser();
      psUser.textContent = me || 'Guest';
    }
  }

  // ── Radio ────────────────────────────────────────────────────────
  function playStation(station) {
    if (radioAudio) { radioAudio.pause(); radioAudio = null; }
    currentStation = station;
    radioAudio = new Audio(station.url);
    radioAudio.volume = 0.6;
    radioAudio.play().then(function() {
      radioPlaying = true; updateRadioUI();
    }).catch(function() {
      radioPlaying = false; updateRadioUI();
      var s = document.getElementById('radio-status');
      if (s) s.textContent = 'Stream unavailable — try another';
    });
  }

  function stopRadio() {
    if (radioAudio) { radioAudio.pause(); radioAudio = null; }
    radioPlaying = false; currentStation = null; updateRadioUI();
  }

  function updateRadioUI() {
    var np = document.getElementById('radio-now-playing');
    var pb = document.getElementById('radio-play-btn');
    if (np) np.textContent = radioPlaying && currentStation ? currentStation.name : 'Not playing';
    if (pb) pb.textContent = radioPlaying ? '⏹ Stop' : '▶ Play';
    document.querySelectorAll('.radio-station-btn').forEach(function(btn) {
      btn.classList.toggle('active', !!(radioPlaying && currentStation && btn.dataset.name === currentStation.name));
    });
  }

  function buildRadioList() {
    var list = document.getElementById('radio-stations-list');
    if (!list) return;
    var entitled = window.FeltoraStore && window.FeltoraStore.hasTipTier
      ? window.FeltoraStore.hasTipTier(currentPhoneProfile()) : false;
    list.innerHTML = KENYA_STATIONS.map(function(s, index) {
      var locked = index > 1 && !entitled;
      return '<button class="radio-station-btn' + (locked ? ' locked' : '') + '" data-name="' + s.name + '" data-url="' + s.url + '" data-locked="' + locked + '">'
        + s.emoji + ' ' + s.name + (locked ? ' · 🔒' : '') + '</button>';
    }).join('');
  }

  function currentPhoneProfile() {
    var auth = window.FeltoraAuth;
    var username = auth && auth.currentUser();
    return username && auth.getAccount(username);
  }


  // ── Storage helpers ──────────────────────────────────────────────
  var FRIENDS_KEY  = 'feltora-friends';
  var MESSAGES_KEY = 'feltora-messages';
  var FCHAT_KEY    = 'feltora-fchat';
  var REPORTS_KEY  = 'feltora-reports';
  var ORION_KEY    = 'feltora-orion-history';
  var UNREAD_KEY   = 'feltora-unread';
  var REACTIONS_KEY= 'feltora-reactions';
  var ONLINE_KEY   = 'feltora-online';
  var MSG_CAP      = 100; // max DMs per conversation
  var ORION_USAGE_KEY = 'feltora-orion-daily-usage';

  // localStorage safe write — warns user if storage is full
  function lsSet(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
      return true;
    } catch(e) {
      showToast('Storage full! Delete old messages to free space.');
      return false;
    }
  }

  function getFriends() { try { return JSON.parse(localStorage.getItem(FRIENDS_KEY) || '[]'); } catch(e) { return []; } }
  function saveFriends(l) { lsSet(FRIENDS_KEY, l); }

  function getMessages(fid) {
    try { var a = JSON.parse(localStorage.getItem(MESSAGES_KEY) || '{}'); return a[fid] || []; } catch(e) { return []; }
  }
  function saveMessage(fid, msg) {
    try {
      var a = JSON.parse(localStorage.getItem(MESSAGES_KEY) || '{}');
      if (!a[fid]) a[fid] = [];
      a[fid].push(msg);
      // cap at MSG_CAP per conversation
      if (a[fid].length > MSG_CAP) a[fid] = a[fid].slice(-MSG_CAP);
      lsSet(MESSAGES_KEY, a);
    } catch(e) {}
  }

  // ── Unread badge counts ──────────────────────────────────────────
  function getUnread() { try { return JSON.parse(localStorage.getItem(UNREAD_KEY) || '{}'); } catch(e) { return {}; } }
  function markUnread(fid) {
    var u = getUnread(); u[fid] = (u[fid] || 0) + 1; lsSet(UNREAD_KEY, u);
    updateUnreadBadges();
  }
  function clearUnread(fid) {
    var u = getUnread(); delete u[fid]; lsSet(UNREAD_KEY, u);
    updateUnreadBadges();
  }
  function updateUnreadBadges() {
    var u = getUnread();
    var total = Object.values(u).reduce(function(s,v){ return s+v; }, 0);
    // badge on contacts app icon
    document.querySelectorAll('[data-open="contacts"]').forEach(function(el) {
      var badge = el.querySelector('.app-badge');
      if (total > 0) {
        if (!badge) { badge = document.createElement('span'); badge.className = 'app-badge'; el.style.position='relative'; el.appendChild(badge); }
        badge.textContent = total > 9 ? '9+' : total;
      } else if (badge) badge.remove();
    });
    // per-contact unread dot in contact list
    document.querySelectorAll('.phone-contact-row').forEach(function(row) {
      var fid = row.dataset.friend;
      var dot = row.querySelector('.contact-unread-dot');
      if (u[fid] > 0) {
        if (!dot) { dot = document.createElement('span'); dot.className = 'contact-unread-dot'; row.appendChild(dot); }
        dot.textContent = u[fid];
      } else if (dot) dot.remove();
    });
  }

  // ── Online status (localStorage heartbeat) ───────────────────────
  function setOnline() {
    var me = window.FeltoraAuth && window.FeltoraAuth.currentUser();
    if (!me) return;
    try {
      var o = JSON.parse(localStorage.getItem(ONLINE_KEY) || '{}');
      o[me] = Date.now();
      localStorage.setItem(ONLINE_KEY, JSON.stringify(o));
    } catch(e) {}
    // also write to Firebase so other devices can see
    if (window.FeltoraFirebase) window.FeltoraFirebase.setOnline(me).catch(function() {});
  }
  function isOnline(username) {
    try {
      var o = JSON.parse(localStorage.getItem(ONLINE_KEY) || '{}');
      return o[username] && (Date.now() - o[username]) < 120000; // 2 min window
    } catch(e) { return false; }
  }

  // ── Message reactions ────────────────────────────────────────────
  var REACTION_EMOJIS = ['👍','❤️','😂','😮','🔥','🎱'];
  function getReactions(convId) {
    try { var r = JSON.parse(localStorage.getItem(REACTIONS_KEY) || '{}'); return r[convId] || {}; } catch(e) { return {}; }
  }
  function addReaction(convId, msgTs, emoji) {
    try {
      var r = JSON.parse(localStorage.getItem(REACTIONS_KEY) || '{}');
      if (!r[convId]) r[convId] = {};
      var key = String(msgTs);
      if (!r[convId][key]) r[convId][key] = {};
      var me = (window.FeltoraAuth && window.FeltoraAuth.currentUser()) || 'Guest';
      r[convId][key][me] = emoji;
      lsSet(REACTIONS_KEY, r);
    } catch(e) {}
  }

  // ── Orion history persistence ────────────────────────────────────
  function loadOrionHistory() {
    try { return JSON.parse(localStorage.getItem(ORION_KEY) || '[]'); } catch(e) { return []; }
  }
  function saveOrionHistory(h) { lsSet(ORION_KEY, h.slice(-20)); }

  function addFriend(username) {
    var me = window.FeltoraAuth && window.FeltoraAuth.currentUser();
    if (!me || !username || username === me) return false;
    var friends = getFriends();
    if (friends.indexOf(username) !== -1) return false;
    friends.push(username);
    saveFriends(friends);
    return true;
  }

  // ── FeltoraChat rooms ────────────────────────────────────────────
  function getFChatRooms() { try { return JSON.parse(localStorage.getItem(FCHAT_KEY) || '[]'); } catch(e) { return []; } }
  function saveFChatRooms(r) { try { localStorage.setItem(FCHAT_KEY, JSON.stringify(r)); } catch(e) {} }

  function getFChatMessages(roomId) {
    try { var a = JSON.parse(localStorage.getItem(FCHAT_KEY + '-msgs') || '{}'); return a[roomId] || []; } catch(e) { return []; }
  }
  function saveFChatMessage(roomId, msg) {
    try {
      var a = JSON.parse(localStorage.getItem(FCHAT_KEY + '-msgs') || '{}');
      if (!a[roomId]) a[roomId] = [];
      a[roomId].push(msg);
      if (a[roomId].length > 200) a[roomId] = a[roomId].slice(-200);
      localStorage.setItem(FCHAT_KEY + '-msgs', JSON.stringify(a));
    } catch(e) {}
  }

  function renderFChatRooms() {
    var el = document.getElementById('fchat-rooms');
    if (!el) return;
    var rooms = getFChatRooms();
    if (!rooms.length) {
      rooms = [
        { id: 'general', name: '\uD83C\uDFB1 General', desc: 'Everyone welcome' },
        { id: 'wins',    name: '\uD83C\uDFC6 Wins',    desc: 'Share your victories' },
        { id: 'trash',   name: '\uD83D\uDD25 Trash Talk', desc: 'Keep it fun' }
      ];
      saveFChatRooms(rooms);
    }
    var u = getUnread();
    el.innerHTML = rooms.map(function(r) {
      var msgs = getFChatMessages(r.id);
      var last = msgs.length ? msgs[msgs.length-1] : null;
      var unreadCount = u['fchat-' + r.id] || 0;
      var badge = unreadCount > 0 ? '<span class="fchat-unread-badge">' + (unreadCount > 9 ? '9+' : unreadCount) + '</span>' : '';
      return '<div class="fchat-room-row" data-room-id="' + r.id + '" data-room-name="' + r.name + '">'
        + '<div class="fchat-room-icon">' + r.name.slice(0,2) + '</div>'
        + '<div class="fchat-room-info"><strong>' + r.name + '</strong>'
        + '<small>' + (last ? last.from + ': ' + (last.voice ? '\uD83C\uDFA4 Voice note' : last.text.slice(0,30)) : r.desc) + '</small></div>'
        + badge + '</div>';
    }).join('');
  }

  var activeFChatListener = null;

  function renderFChatMsgList(msgs, roomId) {
    var el = document.getElementById('fchat-messages');
    if (!el) return;
    var me = (window.FeltoraAuth && window.FeltoraAuth.currentUser()) || 'Guest';
    var u = getUnread(); delete u['fchat-' + roomId]; lsSet(UNREAD_KEY, u);
    el.innerHTML = msgs.length ? msgs.map(function(m) {
      var mine = m.from === me;
      var reportBtn = !mine ? '<button class="fchat-report-btn" data-from="' + m.from + '" data-text="' + encodeURIComponent(m.text || '') + '" title="Report">\u2691</button>' : '';
      var reactBtn = '<button class="msg-react-btn" data-ts="' + m.ts + '" data-conv="fchat-' + roomId + '" title="React">\uD83D\uDE42</button>';
      var content = m.voice
        ? '<audio class="voice-note-player" src="' + m.voice + '" controls preload="none"></audio>'
        : '<span class="fchat-msg-text">' + (m.text || '') + '</span>';
      return '<div class="fchat-msg ' + (mine ? 'mine' : 'theirs') + '" data-ts="' + m.ts + '">'
        + (!mine ? '<span class="fchat-msg-from">' + m.from + '</span>' : '')
        + content
        + '<time>' + new Date(m.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) + '</time>'
        + reactBtn + reportBtn + '</div>';
    }).join('') : '<p style="text-align:center;color:rgba(255,255,255,0.3);font-size:0.65rem;padding:20px;">No messages yet. Say hi! \uD83D\uDC4B</p>';
    el.scrollTop = el.scrollHeight;
  }

  function openFChatRoom(roomId, roomName) {
    var roomsEl = document.getElementById('fchat-rooms');
    var roomView = document.getElementById('fchat-room-view');
    var nameEl = document.getElementById('fchat-room-name');
    if (!roomView) return;
    if (roomsEl) roomsEl.style.display = 'none';
    roomView.style.display = 'flex';
    roomView.dataset.room = roomId;
    if (nameEl) nameEl.textContent = roomName;
    renderFChatMessages(roomId);
  }

  function renderFChatMessages(roomId) {
    // close previous listener
    if (activeFChatListener) { try { activeFChatListener.close(); } catch(e) {} activeFChatListener = null; }

    if (window.FeltoraFirebase) {
      // show cached msgs instantly
      var cached = getFChatMessages(roomId);
      if (cached.length) renderFChatMsgList(cached, roomId);
      // subscribe real-time
      activeFChatListener = window.FeltoraFirebase.listenFChat(roomId, function(msgs) {
        renderFChatMsgList(msgs, roomId);
        // cache locally (cap 200)
        try {
          var a = JSON.parse(localStorage.getItem(FCHAT_KEY + '-msgs') || '{}');
          a[roomId] = msgs.slice(-200);
          localStorage.setItem(FCHAT_KEY + '-msgs', JSON.stringify(a));
        } catch(e) {}
      });
    } else {
      renderFChatMsgList(getFChatMessages(roomId), roomId);
    }
  }


  // ── Orion AI ─────────────────────────────────────────────────────
  var orionHistory = loadOrionHistory();

  function orionAddMessage(role, text) {
    var el = document.getElementById('orion-messages');
    if (!el) return;
    var div = document.createElement('div');
    div.className = 'orion-msg ' + role;
    var label = role === 'user' ? 'You' : role === 'system' ? 'Notice' : '✨ Orion';
    div.innerHTML = '<span class="orion-msg-label">' + label + '</span>'
      + '<p>' + text.replace(/</g,'&lt;') + '</p>';
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  }

  function orionSend() {
    var input = document.getElementById('orion-input');
    if (!input || !input.value.trim()) return;
    var profile = currentPhoneProfile();
    var unlimited = window.FeltoraStore && window.FeltoraStore.hasTipTier
      ? window.FeltoraStore.hasTipTier(profile) : false;
    var usage = readOrionUsage();
    if (!unlimited && usage.count >= 10) {
      showOrionLimit();
      return;
    }
    var text = input.value.trim();
    input.value = '';
    if (isAbusive(text)) { orionAddMessage('system', '⚠️ Please keep it respectful.'); return; }
    if (!unlimited) {
      usage.count++;
      writeOrionUsage(usage);
      updateOrionLimit();
    }
    orionAddMessage('user', text);
    orionHistory.push({ role: 'user', content: text });
    saveOrionHistory(orionHistory);
    var el = document.getElementById('orion-messages');
    var typing = document.createElement('div');
    typing.className = 'orion-msg assistant orion-typing';
    typing.innerHTML = '<span class="orion-msg-label">✨ Orion</span><p>Thinking<span class="orion-dots">...</span></p>';
    if (el) { el.appendChild(typing); el.scrollTop = el.scrollHeight; }
    var messages = [{ role: 'system', content: 'You are Orion, a friendly AI assistant built into FELTORA, a browser-based 8-ball pool game. Be helpful, concise, and fun. Keep responses short (under 120 words).' }]
      .concat(orionHistory.slice(-8));
    var prompt = messages.map(function(m) { return m.role + ': ' + m.content; }).join('\n');
    var apiUrl = 'https://text.pollinations.ai/' + encodeURIComponent(prompt) + '?model=openai&seed=' + Math.floor(Math.random()*9999);
    fetch(apiUrl).then(function(response) {
      if (!response.ok) throw new Error('Orion AI request failed (' + response.status + ').');
      return response.text();
    }).then(function(reply) {
      if (typing.parentNode) typing.parentNode.removeChild(typing);
      reply = reply.trim().slice(0, 300);
      if (!reply) throw new Error('empty');
      orionHistory.push({ role: 'assistant', content: reply });
      saveOrionHistory(orionHistory);
      orionAddMessage('assistant', reply);
    }).catch(function(error) {
      if (typing.parentNode) typing.parentNode.removeChild(typing);
      console.error('Orion could not complete the AI request:', error);
      if (!unlimited) {
        var failedUsage = readOrionUsage();
        failedUsage.count = Math.max(0, failedUsage.count - 1);
        writeOrionUsage(failedUsage);
        updateOrionLimit();
      }
      orionAddMessage('system', 'Orion could not reach its AI service. Please try again shortly.');
    });
  }

  function readOrionUsage() {
    var today = new Date().toISOString().slice(0, 10);
    try {
      var data = JSON.parse(localStorage.getItem(ORION_USAGE_KEY) || 'null');
      return data && data.date === today
        ? { date: today, count: Math.max(0, Number(data.count) || 0) }
        : { date: today, count: 0 };
    } catch (error) {
      return { date: today, count: 0 };
    }
  }

  function writeOrionUsage(usage) {
    try {
      localStorage.setItem(ORION_USAGE_KEY, JSON.stringify(usage));
    } catch (error) {
      console.error('Orion daily usage could not be saved.', error);
    }
  }

  function showOrionLimit() {
    var limit = document.getElementById('orion-limit');
    if (limit) limit.hidden = false;
  }

  function updateOrionLimit() {
    var profile = currentPhoneProfile();
    var entitled = window.FeltoraStore && window.FeltoraStore.hasTipTier
      ? window.FeltoraStore.hasTipTier(profile) : false;
    var limit = document.getElementById('orion-limit');
    if (limit) limit.hidden = entitled || readOrionUsage().count < 10;
    var count = document.getElementById('orion-usage-count');
    if (count) count.textContent = String(readOrionUsage().count);
  }

  // ── Contacts & Chat ──────────────────────────────────────────────
  function renderContacts() {
    var list = document.getElementById('phone-contacts-list');
    if (!list) return;
    var friends = getFriends();
    if (!friends.length) {
      list.innerHTML = '<p style="text-align:center;color:rgba(255,255,255,0.3);font-size:0.68rem;padding:20px 12px;">No contacts yet.<br>Follow players from the community feed.</p>';
      return;
    }
    var u = getUnread();
    list.innerHTML = friends.map(function(f) {
      var online = isOnline(f);
      var unread = u[f] || 0;
      var statusDot = '<span class="contact-status-dot ' + (online ? 'online' : 'offline') + '"></span>';
      var unreadBadge = unread > 0 ? '<span class="contact-unread-dot">' + (unread > 9 ? '9+' : unread) + '</span>' : '';
      return '<div class="phone-contact-row" data-friend="' + f + '">'
        + '<div class="phone-contact-avatar" style="position:relative;">' + f.slice(0,1).toUpperCase() + statusDot + '</div>'
        + '<div class="phone-contact-info"><strong>' + f + '</strong><small>' + (online ? 'Online now' : 'FELTORA player') + '</small></div>'
        + '<div class="phone-contact-actions">'
        + '<button class="phone-action-btn phone-call-btn" data-friend="' + f + '" title="Call">&#x260E;</button>'
        + '<button class="phone-action-btn phone-voice-btn" data-friend="' + f + '" title="Voice note">&#x1F3A4;</button>'
        + '<button class="phone-action-btn phone-msg-btn" data-friend="' + f + '" title="Message">&#x1F4AC;</button>'
        + '</div>' + unreadBadge + '</div>';
    }).join('');
  }

  // typing indicator state per friend
  var typingTimers = {};

  // active DM listener — close when leaving chat
  var activeDMListener = null;

  function renderChatMsgs(msgs, friendId) {
    var chatMessages = document.getElementById('phone-chat-messages');
    if (!chatMessages) return;
    var me = (window.FeltoraAuth && window.FeltoraAuth.currentUser()) || 'You';
    chatMessages.innerHTML = msgs.length ? msgs.map(function(m) {
      var mine = m.from === me;
      var reactBtn = '<button class="msg-react-btn" data-ts="' + m.ts + '" data-conv="dm-' + friendId + '" title="React">&#x1F642;</button>';
      var content = m.voice
        ? '<audio class="voice-note-player" src="' + m.voice + '" controls preload="none"></audio>'
        : '<span>' + (m.text || '') + '</span>';
      return '<div class="phone-msg ' + (mine ? 'mine' : 'theirs') + '" data-ts="' + m.ts + '">'
        + content
        + '<time>' + new Date(m.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) + '</time>'
        + reactBtn + '</div>';
    }).join('') : '<p style="text-align:center;color:rgba(255,255,255,0.3);font-size:0.65rem;padding:16px;">Say hi! \uD83D\uDC4B</p>';
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function renderChat(friendId) {
    var chatView = document.getElementById('phone-chat-view');
    var chatName = document.getElementById('phone-chat-name');
    var chatMessages = document.getElementById('phone-chat-messages');
    if (!chatView || !chatMessages) return;
    if (chatName) chatName.textContent = friendId;
    clearUnread(friendId);
    chatView.dataset.friend = friendId;
    var contacts = document.getElementById('phone-contacts-list');
    if (contacts) contacts.style.display = 'none';
    chatView.style.display = 'flex';

    // close previous listener
    if (activeDMListener) { try { activeDMListener.close(); } catch(e) {} activeDMListener = null; }

    if (window.FeltoraFirebase) {
      // show localStorage msgs instantly while Firebase loads
      var cached = getMessages(friendId);
      if (cached.length) renderChatMsgs(cached, friendId);
      // then subscribe to Firebase real-time
      activeDMListener = window.FeltoraFirebase.listenDMs(friendId, function(msgs) {
        renderChatMsgs(msgs, friendId);
        // also cache locally
        try {
          var a = JSON.parse(localStorage.getItem(MESSAGES_KEY) || '{}');
          a[friendId] = msgs.slice(-MSG_CAP);
          localStorage.setItem(MESSAGES_KEY, JSON.stringify(a));
        } catch(e) {}
      });
    } else {
      renderChatMsgs(getMessages(friendId), friendId);
    }
  }

  // Show typing indicator in DM chat
  function showTypingIndicator(chatMessagesEl) {
    var existing = chatMessagesEl.querySelector('.typing-indicator');
    if (existing) return;
    var div = document.createElement('div');
    div.className = 'phone-msg theirs typing-indicator';
    div.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';
    chatMessagesEl.appendChild(div);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  }
  function hideTypingIndicator(chatMessagesEl) {
    var existing = chatMessagesEl.querySelector('.typing-indicator');
    if (existing) existing.remove();
  }

  // Show reaction picker popup
  function showReactionPicker(msgEl, ts, convId) {
    var existing = document.querySelector('.reaction-picker');
    if (existing) existing.remove();
    var picker = document.createElement('div');
    picker.className = 'reaction-picker';
    picker.innerHTML = REACTION_EMOJIS.map(function(e) {
      return '<button class="reaction-pick-btn" data-emoji="' + e + '">' + e + '</button>';
    }).join('');
    msgEl.appendChild(picker);
    picker.addEventListener('click', function(ev) {
      var btn = ev.target.closest('.reaction-pick-btn');
      if (!btn) return;
      addReaction(convId, ts, btn.dataset.emoji);
      picker.remove();
      // re-render the right view
      if (convId.startsWith('fchat-')) {
        var roomId = convId.replace('fchat-', '');
        renderFChatMessages(roomId);
      } else {
        var fid = convId.replace('dm-', '');
        renderChat(fid);
      }
    });
    // close on outside click
    setTimeout(function() {
      document.addEventListener('click', function close(e) {
        if (!picker.contains(e.target)) { picker.remove(); document.removeEventListener('click', close); }
      });
    }, 50);
  }


  // ── Call availability ────────────────────────────────────────────
  function mockCall(friendName) {
    var overlay = document.getElementById('call-overlay');
    if (!overlay) return;
    var nameEl = document.getElementById('call-name');
    var statusEl = document.getElementById('call-status');
    if (nameEl) nameEl.textContent = friendName;
    if (statusEl) statusEl.textContent = 'Voice calling is not connected yet. Send a message instead.';
    overlay.hidden = false;
    var endBtn = document.getElementById('call-end-btn');
    if (endBtn) endBtn.onclick = function() { overlay.hidden = true; };
  }

  // ── Report system ────────────────────────────────────────────────
  function reportUser(fromUser, text) {
    try {
      var reports = JSON.parse(localStorage.getItem(REPORTS_KEY) || '[]');
      reports.push({ from: fromUser, text: text, ts: Date.now(), reporter: (window.FeltoraAuth && window.FeltoraAuth.currentUser()) || 'Guest' });
      localStorage.setItem(REPORTS_KEY, JSON.stringify(reports));
    } catch(e) {}
    showToast('Report submitted. Thank you for keeping FELTORA safe.');
  }

  function showToast(msg) {
    var t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);z-index:10500;background:#1a2e24;border:1px solid rgba(0,240,168,0.3);border-radius:12px;padding:10px 16px;font:600 0.78rem/1.4 system-ui,sans-serif;color:#e6f2eb;max-width:300px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.5);';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 3500);
  }


  // ── Paystack tip ─────────────────────────────────────────────────
  var selectedTipAmt = 0;

  var tipInitDone = false;
  var tipViewTemplate = null;
  function initTipView() {
    if (tipInitDone) return;
    tipInitDone = true;
    var tipView = document.getElementById('phone-tip-view-inner');
    if (tipView && tipViewTemplate === null) tipViewTemplate = tipView.innerHTML;

    // Remove old listeners by cloning nodes
    document.querySelectorAll('.phone-tip-amt').forEach(function(btn) {
      var fresh = btn.cloneNode(true);
      btn.parentNode.replaceChild(fresh, btn);
    });
    var customOld = document.getElementById('tip-custom-amount');
    if (customOld) {
      var customFresh = customOld.cloneNode(true);
      customOld.parentNode.replaceChild(customFresh, customOld);
    }
    var payOld = document.getElementById('phone-tip-pay');
    if (payOld) {
      var payFresh = payOld.cloneNode(true);
      payOld.parentNode.replaceChild(payFresh, payOld);
    }

    document.querySelectorAll('.phone-tip-amt').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.phone-tip-amt').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        selectedTipAmt = Number(btn.dataset.amount);
        var custom = document.getElementById('tip-custom-amount');
        if (custom) custom.value = '';
        updateTipDisplay(selectedTipAmt);
      });
    });

    var custom = document.getElementById('tip-custom-amount');
    if (custom) custom.addEventListener('input', function() {
      var v = Number(custom.value);
      if (v > 0) {
        document.querySelectorAll('.phone-tip-amt').forEach(function(b) { b.classList.remove('active'); });
        selectedTipAmt = v;
        updateTipDisplay(v);
      }
    });

    var payBtn = document.getElementById('phone-tip-pay');
    if (!payBtn) return;
    payBtn.addEventListener('click', function() {
      var cfg = getGeoConfig(userCountry);
      var emailEl = document.getElementById('tip-email');
      var amount = selectedTipAmt;
      var email = emailEl ? emailEl.value.trim() : '';
      if (!Number.isFinite(amount) || amount < cfg.minAmount) {
        showToast('Pick an amount first.'); return;
      }
      if (!email || email.indexOf('@') === -1) {
        showToast('Enter your email for the receipt.'); return;
      }
      if (typeof PaystackPop === 'undefined') {
        showToast('Loading payment...');
        var s = document.createElement('script');
        s.src = 'https://js.paystack.co/v1/inline.js';
        s.onload = function() { triggerPaystack(amount, email); };
        document.head.appendChild(s);
        return;
      }
      triggerPaystack(amount, email);
    });
  }

  function updateTipDisplay(amount) {
    var cfg = getGeoConfig(userCountry);
    var display = document.getElementById('tip-amount-display');
    if (display) display.textContent = cfg.symbol + ' ' + Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  function refreshVerifiedSupporter(uid, attempt) {
    var auth = window.FeltoraAuth;
    if (!auth || !uid || auth.uid() !== uid) return;
    auth.refreshProfile().then(function(profile) {
      if (profile && profile.supporter) {
        if (typeof updateProgressionDisplay === 'function') updateProgressionDisplay(profile);
        buildRadioList();
        updateOrionLimit();
        if (window.FeltoraStore) window.FeltoraStore.render();
        if (window.FeltoraCommunity) {
          window.FeltoraCommunity.refresh().catch(function(error) {
            console.error('Supporter badge could not refresh in the community feed:', error);
          });
        }
        return;
      }
      if (attempt < 5) setTimeout(function() { refreshVerifiedSupporter(uid, attempt + 1); }, 1500);
    }).catch(function(error) {
      console.error('Paid supporter status could not be refreshed:', error);
    });
  }

  function verifyTipPayment(reference) {
    var headers = { 'Content-Type': 'application/json' };
    var auth = window.FeltoraAuth;
    var token = auth && auth.uid && auth.uid() && auth.getIdToken ? auth.getIdToken() : Promise.resolve(null);
    return Promise.resolve(token).then(function(idToken) {
      if (idToken) headers.Authorization = 'Bearer ' + idToken;
      return fetch('/api/wallet', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ action: 'verify-tip', reference: reference })
      });
    }).then(function(response) {
      return response.json().catch(function() { return {}; }).then(function(result) {
        if (!response.ok || !result.verified) {
          throw new Error(result.error || 'Paystack has not verified this tip yet.');
        }
        return result;
      });
    });
  }

  function triggerPaystack(amount, email) {
    var cfg = getGeoConfig(userCountry);
    var thanks = getThankyouMessage(amount, cfg.currency, cfg.symbol);
    var ref = 'FELTORA-TIP-' + Date.now();

    var handler = PaystackPop.setup({
      key: PAYSTACK_KEY,
      email: email,
      amount: amount * 100,
      currency: cfg.currency,
      channels: cfg.channels,
      ref: ref,
      metadata: {
        paymentKind: 'tip',
        uid: window.FeltoraAuth && window.FeltoraAuth.uid() || '',
        username: window.FeltoraAuth && window.FeltoraAuth.currentUser() || '',
        custom_fields: [
          { display_name: 'Game', variable_name: 'game', value: 'FELTORA 8-ball pool' },
          { display_name: 'Country', variable_name: 'country', value: userCountry },
          { display_name: 'Message', variable_name: 'message', value: 'Tip for FELTORA developer' }
        ]
      },
      callback: function(response) {
        if (!response || !response.reference) {
          showToast('Paystack returned no payment reference. Please check your payment status before trying again.');
          return;
        }
        verifyTipPayment(response.reference).then(function() {
          var uid = window.FeltoraAuth && window.FeltoraAuth.uid();
          if (uid) refreshVerifiedSupporter(uid, 0);
          var tipView = document.getElementById('phone-tip-view-inner');
          if (tipView) {
            tipView.innerHTML = '<div class="tip-thankyou-screen">'
              + '<div class="tip-ty-emoji">' + thanks.emoji + '</div>'
              + '<h3 class="tip-ty-title">Thank you!</h3>'
              + '<p class="tip-ty-msg">' + thanks.msg + '</p>'
              + '<div class="tip-ty-amount">' + cfg.symbol + ' ' + Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 }) + ' ' + cfg.currency + '</div>'
              + '<div class="tip-ty-ref"></div>'
              + '<button class="tip-ty-back ob-btn-primary" type="button">Back to FELTORA</button>'
              + '</div>';
            var refEl = tipView.querySelector('.tip-ty-ref');
            if (refEl) refEl.textContent = 'Verified ref: ' + response.reference;
            var backBtn = tipView.querySelector('.tip-ty-back');
            if (backBtn) backBtn.addEventListener('click', function() {
              if (tipViewTemplate !== null) tipView.innerHTML = tipViewTemplate;
              selectedTipAmt = 0;
              tipInitDone = false;
              initTipView();
              phoneShowView('home');
            });
          }
          showToast(thanks.emoji + ' Tip verified. Thank you for supporting FELTORA!');
        }).catch(function(error) {
          console.error('Paystack tip verification failed:', error);
          showToast('Payment is not verified yet. Keep reference ' + response.reference + ' and check again shortly.');
        });
      },
      onClose: function() {
        // user closed without paying — show gentle nudge
        if (selectedTipAmt > 0) {
          showToast('No pressure! Come back anytime. Every tip helps. 🙏');
        }
      }
    });
    handler.openIframe();
  }

  // ── Profile & Feed ───────────────────────────────────────────────
  function phoneUpdateProfile() {
    var me = window.FeltoraAuth && window.FeltoraAuth.currentUser();
    var account = me && window.FeltoraAuth && window.FeltoraAuth.getAccount
      ? window.FeltoraAuth.getAccount(me) : null;
    var nameEl = document.getElementById('phone-profile-name');
    var tagEl  = document.getElementById('phone-profile-tag');
    var avatarEl = document.getElementById('phone-profile-avatar');
    var playArt  = document.getElementById('phone-play-art');
    if (nameEl) nameEl.textContent = (account && account.displayName) || me || 'Guest';
    if (tagEl)  tagEl.textContent  = me ? '@' + me : '@guest';
    if (avatarEl && window.FeltoraMascots) {
      var av = account ? (account.avatar || 'marlow') : 'marlow';
      avatarEl.innerHTML = window.FeltoraMascots.render(av);
    }
    if (playArt && window.FeltoraMascots) playArt.innerHTML = window.FeltoraMascots.render('marlow');
    if (account && account.stats) {
      var w = document.getElementById('pps-wins');
      var l = document.getElementById('pps-losses');
      var fr = document.getElementById('pps-frames');
      if (w) w.textContent = account.stats.wins;
      if (l) l.textContent = account.stats.losses;
      if (fr) fr.textContent = account.stats.frames;
    }
    var psUser = document.getElementById('ps-username-val');
    if (psUser) psUser.textContent = me || 'Guest';
  }

  function phoneEscapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function phoneRenderFeed() {
    var feed = document.getElementById('phone-feed');
    if (!feed) return;
    var posts = [];
    try {
      if (window.FeltoraCommunity) {
        await window.FeltoraCommunity.refresh();
        posts = window.FeltoraCommunity.getPosts();
      }
    } catch (error) {
      console.error('Phone community feed failed to load:', error);
      var errorText = String(error && error.message || error);
      var message = /401.*permission denied|permission denied.*401|PERMISSION_DENIED/i.test(errorText)
        ? 'Community database rules are blocking public reads. Publish firebase-rules.json to the configured Realtime Database.'
        : 'Community feed is unavailable right now. Check your connection and try again.';
      feed.textContent = '';
      var notice = document.createElement('p');
      notice.className = 'phone-feed-empty';
      notice.textContent = message;
      feed.appendChild(notice);
      return;
    }
    if (!posts.length) {
      feed.innerHTML = '<p class="phone-feed-empty">No posts yet. Be the first!</p>';
      return;
    }
    feed.innerHTML = posts.slice(0, 15).map(function(p) {
      var badge = (p.author && p.author !== 'Guest') ? ' <span style="color:#00f0a8;font-size:0.6rem;">&#x2714;</span>' : '';
      return '<div class="phone-feed-card">'
        + '<div class="phone-feed-top">'
        + '<div class="phone-feed-avatar">' + phoneEscapeHtml((p.author || 'G').slice(0,1).toUpperCase()) + '</div>'
        + '<span class="phone-feed-author">' + phoneEscapeHtml(p.author || 'Player') + badge + '</span>'
        + '</div>'
        + '<p class="phone-feed-body">' + phoneEscapeHtml(String(p.body || '').slice(0, 90)) + '</p>'
        + '</div>';
    }).join('');
  }


  // -- Phone view navigation
  var phoneCameraStream = null;
  var phoneCameraRequestId = 0;
  var PHONE_GALLERY_KEY = 'feltora_phone_gallery';

  function setCameraStatus(message) {
    var status = document.getElementById('phone-camera-status');
    if (status) status.textContent = message;
  }

  function stopPhoneCamera() {
    phoneCameraRequestId++;
    var cameraWasOn = phoneCameraStream !== null;
    if (phoneCameraStream) {
      phoneCameraStream.getTracks().forEach(function(track) { track.stop(); });
      phoneCameraStream = null;
    }
    var video = document.getElementById('phone-camera-video');
    var capture = document.getElementById('phone-camera-capture');
    var placeholder = document.getElementById('phone-camera-placeholder');
    if (video) video.srcObject = null;
    if (capture) capture.disabled = true;
    if (placeholder) placeholder.hidden = false;
    if (cameraWasOn) setCameraStatus('Camera is off.');
  }

  async function startPhoneCamera() {
    var video = document.getElementById('phone-camera-video');
    var capture = document.getElementById('phone-camera-capture');
    var placeholder = document.getElementById('phone-camera-placeholder');
    if (!video || !capture) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraStatus('Camera access requires a supported browser and a secure connection (HTTPS or localhost).');
      return;
    }
    stopPhoneCamera();
    var requestId = phoneCameraRequestId;
    setCameraStatus('Waiting for camera permission…');
    try {
      var stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      if (requestId !== phoneCameraRequestId) {
        stream.getTracks().forEach(function(track) { track.stop(); });
        return;
      }
      phoneCameraStream = stream;
      video.srcObject = phoneCameraStream;
      await video.play();
      capture.disabled = false;
      if (placeholder) placeholder.hidden = true;
      setCameraStatus('Camera is on. Photos stay in this browser on this device.');
    } catch (error) {
      stopPhoneCamera();
      if (error && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')) {
        setCameraStatus('Camera permission was denied. Allow camera access in your browser settings to continue.');
      } else if (error && error.name === 'NotFoundError') {
        setCameraStatus('No camera was found on this device.');
      } else {
        setCameraStatus('Could not start the camera. Check browser permission and try again.');
      }
    }
  }

  function readPhoneGallery() {
    try {
      var photos = JSON.parse(localStorage.getItem(PHONE_GALLERY_KEY) || '[]');
      return Array.isArray(photos) ? photos : null;
    } catch (error) {
      return null;
    }
  }

  function renderPhoneGallery() {
    var grid = document.getElementById('phone-gallery-grid');
    if (!grid) return;
    var photos = readPhoneGallery();
    grid.replaceChildren();
    if (photos === null) {
      grid.textContent = 'Could not read photos from this browser’s local storage.';
      return;
    }
    if (!photos.length) {
      var empty = document.createElement('p');
      empty.className = 'phone-gallery-empty';
      empty.textContent = 'Photos you take with this device appear here.';
      grid.appendChild(empty);
      return;
    }
    photos.forEach(function(photo, index) {
      if (!photo || typeof photo.data !== 'string' || !photo.data.startsWith('data:image/jpeg;base64,')) return;
      var link = document.createElement('a');
      link.href = photo.data;
      link.download = 'feltora-photo-' + (index + 1) + '.jpg';
      link.className = 'phone-gallery-photo';
      var image = document.createElement('img');
      image.src = photo.data;
      image.alt = 'Photo ' + (index + 1);
      link.appendChild(image);
      grid.appendChild(link);
    });
  }

  function capturePhonePhoto() {
    var video = document.getElementById('phone-camera-video');
    if (!video || !phoneCameraStream || !video.videoWidth || !video.videoHeight) {
      setCameraStatus('The camera is not ready yet. Wait for the preview and try again.');
      return;
    }
    var canvas = document.createElement('canvas');
    var scale = Math.min(1, 960 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    var context = canvas.getContext('2d');
    if (!context) {
      setCameraStatus('Could not capture this photo. Please try again.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    var photos = readPhoneGallery();
    if (photos === null) {
      setCameraStatus('Could not access the photo gallery in this browser.');
      return;
    }
    photos.unshift({ data: canvas.toDataURL('image/jpeg', 0.8), capturedAt: Date.now() });
    try {
      localStorage.setItem(PHONE_GALLERY_KEY, JSON.stringify(photos.slice(0, 6)));
      setCameraStatus('Photo saved to this device’s Feltora gallery.');
    } catch (error) {
      setCameraStatus('Could not save the photo. Device storage may be full.');
    }
  }

  function phoneShowView(id) {
    var activeView = document.querySelector('.phone-view.active');
    if (activeView && activeView.id === 'phone-camera' && id !== 'camera') stopPhoneCamera();
    document.querySelectorAll('.phone-view').forEach(function(v) {
      v.classList.toggle('active', v.id === 'phone-' + id);
    });
    if (id === 'gallery') renderPhoneGallery();
    if (id === 'store' && window.FeltoraStore) window.FeltoraStore.render();
    if (id === 'orion') updateOrionLimit();
    if (id === 'radio') buildRadioList();
    if (id === 'store' && window.FeltoraStore && window.FeltoraAuth && window.FeltoraAuth.currentUser()) {
      window.FeltoraStore.refreshWallet().catch(function(error) {
        if (window.FeltoraPhone && window.FeltoraPhone.notify) window.FeltoraPhone.notify(error.message);
      });
    }
    if (id === 'mpesa') {
      refreshPhoneWallet().catch(function(error) {
        console.error('Wallet could not be refreshed:', error);
      });
      verifyWalletReturn();
    }
  }

  var walletBusy = false;
  var walletTransferRequest = null;
  var walletReturnPromise = null;
  var WALLET_TRANSFER_STORAGE_KEY = 'feltora-wallet-transfer';

  function saveWalletTransferRequest(request) {
    try {
      localStorage.setItem(WALLET_TRANSFER_STORAGE_KEY, JSON.stringify(request));
      walletTransferRequest = request;
    } catch (error) {
      throw new Error('This transfer could not be saved for safe retry. Check device storage and try again.');
    }
  }

  function clearWalletTransferRequest() {
    walletTransferRequest = null;
    try {
      localStorage.removeItem(WALLET_TRANSFER_STORAGE_KEY);
    } catch (error) {
      console.error('The completed wallet transfer retry record could not be cleared:', error);
    }
  }

  function restoreWalletTransferRequest() {
    try {
      var saved = JSON.parse(localStorage.getItem(WALLET_TRANSFER_STORAGE_KEY) || 'null');
      var uid = window.FeltoraAuth && window.FeltoraAuth.uid();
      if (!saved || saved.uid !== uid || !saved.requestId || !saved.toUsername || !saved.amount) return;
      walletTransferRequest = saved;
      var recipient = document.getElementById('wallet-recipient');
      var amount = document.getElementById('wallet-transfer-amount');
      if (recipient) recipient.value = saved.toUsername;
      if (amount) amount.value = saved.amount;
      setWalletStatus('A previous transfer is awaiting confirmation. Retry with the same username and amount, or refresh your wallet.');
    } catch (error) {
      console.error('The pending wallet transfer could not be restored:', error);
    }
  }

  function setWalletStatus(message, isError) {
    var status = document.getElementById('wallet-status');
    if (!status) return;
    status.textContent = message || '';
    status.classList.toggle('is-error', !!isError);
  }

  function renderWallet(data) {
    var balance = document.getElementById('wallet-balance');
    var list = document.getElementById('wallet-transactions');
    if (balance) balance.textContent = Number(data.balance || 0).toLocaleString();
    if (!list) return;
    list.textContent = '';
    var entries = Array.isArray(data.transactions) ? data.transactions : [];
    if (!entries.length) {
      var empty = document.createElement('p');
      empty.textContent = 'No wallet activity yet.';
      list.appendChild(empty);
      return;
    }
    entries.forEach(function(transaction) {
      var row = document.createElement('div');
      row.className = 'wallet-transaction';
      var description = document.createElement('strong');
      var amount = document.createElement('strong');
      var date = document.createElement('span');
      var type = transaction.type;
      if (type === 'top_up') description.textContent = 'Credits added · KSh ' + Number(transaction.amountKes || 0).toLocaleString();
      else if (type === 'store_purchase') description.textContent = 'Store purchase · ' + String(transaction.itemName || transaction.itemId || 'Item');
      else if (type === 'transfer_out') description.textContent = 'Sent to @' + String(transaction.toUsername || 'player');
      else if (type === 'transfer_in') description.textContent = 'Received from @' + String(transaction.fromUsername || 'player');
      else description.textContent = 'Wallet activity';
      amount.className = transaction.direction === 'in' ? 'credit-in' : 'credit-out';
      amount.textContent = (transaction.direction === 'in' ? '+' : '−')
        + Number(transaction.amount || 0).toLocaleString() + ' credits';
      date.textContent = transaction.status === 'pending'
        ? 'Processing transfer…'
        : new Date(Number(transaction.createdAt) || Date.now()).toLocaleString();
      row.appendChild(description);
      row.appendChild(amount);
      row.appendChild(date);
      list.appendChild(row);
    });
  }

  function updateWalletButtons() {
    var signedIn = !!(window.FeltoraAuth && window.FeltoraAuth.currentUser());
    var signIn = document.getElementById('wallet-signin');
    var topUp = document.getElementById('wallet-topup');
    var send = document.getElementById('wallet-send');
    if (signIn) signIn.hidden = signedIn;
    if (topUp) topUp.disabled = walletBusy || !signedIn;
    if (send) send.disabled = walletBusy || !signedIn;
  }

  function refreshPhoneWallet() {
    var store = window.FeltoraStore;
    if (!store || !store.refreshWallet) {
      setWalletStatus('Wallet service is unavailable. Please reload and try again.', true);
      return Promise.reject(new Error('Wallet service is unavailable.'));
    }
    if (!window.FeltoraAuth || !window.FeltoraAuth.currentUser()) {
      var balance = document.getElementById('wallet-balance');
      var list = document.getElementById('wallet-transactions');
      if (balance) balance.textContent = '—';
      if (list) list.textContent = 'Sign in to load wallet activity.';
      setWalletStatus('Sign in to add, spend, send, or view game credits.');
      updateWalletButtons();
      return Promise.resolve(null);
    }
    updateWalletButtons();
    setWalletStatus('Loading wallet…');
    return store.refreshWallet().then(function(data) {
      renderWallet(data);
      if (walletTransferRequest && data.transactions.some(function(transaction) {
        return transaction.clientRequestId === walletTransferRequest.requestId
          && transaction.status === 'completed';
      })) clearWalletTransferRequest();
      setWalletStatus('');
      updateWalletButtons();
      return data;
    }).catch(function(error) {
      setWalletStatus(error.message || 'Wallet could not be loaded. Try refreshing.', true);
      updateWalletButtons();
      throw error;
    });
  }

  function handleWalletError(error) {
    setWalletStatus(error.message || 'Wallet action could not be completed.', true);
    updateWalletButtons();
  }

  function walletTopUp() {
    if (walletBusy) return;
    var amountInput = document.getElementById('wallet-topup-amount');
    var emailInput = document.getElementById('wallet-email');
    var amountKes = amountInput ? Number(amountInput.value) : 0;
    var email = emailInput ? emailInput.value.trim() : '';
    if (!Number.isSafeInteger(amountKes) || amountKes < 100) {
      setWalletStatus('The minimum top-up is KSh 100.', true);
      return;
    }
    if (!email || email.indexOf('@') < 1) {
      setWalletStatus('Enter a valid email address for your receipt.', true);
      if (emailInput) emailInput.focus();
      return;
    }
    walletBusy = true;
    updateWalletButtons();
    setWalletStatus('Preparing secure Paystack checkout…');
    window.FeltoraStore.walletAction('initialize-top-up', {
      amountKes: amountKes,
      email: email,
      callbackUrl: window.location.origin + window.location.pathname
    }).then(function(result) {
      if (!result.authorizationUrl) throw new Error('Paystack did not return a checkout link.');
      setWalletStatus('Opening secure checkout…');
      window.location.assign(result.authorizationUrl);
    }).catch(function(error) {
      walletBusy = false;
      handleWalletError(error);
    });
  }

  function sendWalletCredits() {
    if (walletBusy) return;
    var recipientInput = document.getElementById('wallet-recipient');
    var amountInput = document.getElementById('wallet-transfer-amount');
    var username = recipientInput ? recipientInput.value.trim().toLowerCase() : '';
    var amount = amountInput ? Number(amountInput.value) : 0;
    if (!/^[a-z0-9_]{3,18}$/.test(username)) {
      setWalletStatus('Enter a valid FELTORA username.', true);
      if (recipientInput) recipientInput.focus();
      return;
    }
    if (!Number.isSafeInteger(amount) || amount < 1) {
      setWalletStatus('Enter a whole number of credits to send.', true);
      if (amountInput) amountInput.focus();
      return;
    }
    if (!window.confirm('Send ' + amount.toLocaleString() + ' credits to @' + username + '? This transfer cannot be undone.')) return;
    var uid = window.FeltoraAuth && window.FeltoraAuth.uid();
    if (walletTransferRequest && walletTransferRequest.uid !== uid) clearWalletTransferRequest();
    if (walletTransferRequest
        && (walletTransferRequest.toUsername !== username || Number(walletTransferRequest.amount) !== amount)) {
      setWalletStatus('A transfer to @' + walletTransferRequest.toUsername + ' for '
        + Number(walletTransferRequest.amount).toLocaleString()
        + ' credits still needs confirmation. Retry it with the same details or refresh your wallet.', true);
      return;
    }
    if (!walletTransferRequest) {
      var requestId = window.crypto && typeof window.crypto.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
      try {
        saveWalletTransferRequest({ uid: uid, requestId: requestId, toUsername: username, amount: amount });
      } catch (error) {
        setWalletStatus(error.message, true);
        return;
      }
    }
    walletBusy = true;
    updateWalletButtons();
    setWalletStatus('Sending credits securely…');
    window.FeltoraStore.walletAction('transfer', {
      toUsername: walletTransferRequest.toUsername,
      amount: walletTransferRequest.amount,
      requestId: walletTransferRequest.requestId
    }).then(function(data) {
      clearWalletTransferRequest();
      renderWallet(data);
      if (amountInput) amountInput.value = '';
      setWalletStatus('Credits sent to @' + username + '.');
      if (window.FeltoraPhone && window.FeltoraPhone.notify) {
        window.FeltoraPhone.notify('Sent ' + amount.toLocaleString() + ' credits to @' + username + '.');
      }
    }).catch(function(error) {
      if (error.status && error.status < 500) clearWalletTransferRequest();
      handleWalletError(error);
    }).finally(function() {
      walletBusy = false;
      updateWalletButtons();
    });
  }

  function verifyWalletReturn() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('wallet') !== 'return') return;
    var reference = params.get('reference') || params.get('trxref');
    if (!reference || walletReturnPromise || !window.FeltoraStore) return;
    walletReturnPromise = Promise.resolve();
    openGamePhone('mpesa');
    setWalletStatus('Verifying your Paystack payment…');
    walletReturnPromise = window.FeltoraStore.walletAction('verify-top-up', { reference: reference })
      .then(function(data) {
        renderWallet(data);
        setWalletStatus('Payment verified. Your game credits are ready.');
        var cleanUrl = window.location.pathname + window.location.hash;
        window.history.replaceState({}, document.title, cleanUrl);
      })
      .catch(function(error) {
        walletReturnPromise = null;
        handleWalletError(error);
      });
  }

  function initWalletApp() {
    var topUp = document.getElementById('wallet-topup');
    var send = document.getElementById('wallet-send');
    var refresh = document.getElementById('wallet-refresh');
    var signIn = document.getElementById('wallet-signin');
    if (topUp) topUp.addEventListener('click', walletTopUp);
    if (send) send.addEventListener('click', sendWalletCredits);
    if (refresh) refresh.addEventListener('click', function() {
      if (new URLSearchParams(window.location.search).get('wallet') === 'return') {
        verifyWalletReturn();
        return;
      }
      refreshPhoneWallet().catch(function(error) {
        console.error('Wallet could not be refreshed:', error);
      });
    });
    if (signIn) signIn.addEventListener('click', function() {
      closeGamePhone();
      if (typeof window.showScreen === 'function') window.showScreen('auth');
    });
    restoreWalletTransferRequest();
    updateWalletButtons();
  }

  // -- Floating FAB
  function openGamePhone(initialApp, tipAmount) {
    var modal = document.getElementById('game-phone-modal');
    var inner = document.getElementById('game-phone-modal-inner');
    var frame = document.getElementById('phone-frame');
    if (!modal || !inner || !frame) return;
    if (!inner.contains(frame)) inner.appendChild(frame);
    modal.hidden = false;
    var navButton = document.getElementById('lbn-phone');
    if (navButton) {
      navButton.classList.add('active');
      navButton.setAttribute('aria-pressed', 'true');
    }
    updateStatusBar();
    phoneUpdateProfile();
    phoneRenderFeed();
    updateWeatherWidget();
    buildRadioList();
    renderFChatRooms();
    initTipView();
    buildRadioList();
    if (initialApp) phoneShowView(initialApp);
    if (initialApp === 'tip' && tipAmount) selectTipAmount(tipAmount);
  }

  function selectTipAmount(amount) {
    selectedTipAmt = Number(amount) || 0;
    var matched = false;
    document.querySelectorAll('.phone-tip-amt').forEach(function(button) {
      var selected = Number(button.dataset.amount) === selectedTipAmt;
      button.classList.toggle('active', selected);
      matched = matched || selected;
    });
    var custom = document.getElementById('tip-custom-amount');
    if (custom) custom.value = matched ? '' : String(selectedTipAmt);
    updateTipDisplay(selectedTipAmt);
  }

  function openPhoneApp(app, tipAmount) {
    openGamePhone(app, tipAmount);
  }

  function closeGamePhone() {
    var modal = document.getElementById('game-phone-modal');
    var frame = document.getElementById('phone-frame');
    if (modal) modal.hidden = true;
    stopPhoneCamera();
    var navButton = document.getElementById('lbn-phone');
    if (navButton) {
      navButton.classList.remove('active');
      navButton.setAttribute('aria-pressed', 'false');
    }
    var communityPhoneView = document.getElementById('community-phone-view');
    if (communityPhoneView && frame && !communityPhoneView.contains(frame)) {
      communityPhoneView.appendChild(frame);
    }
  }

  function initGameFAB() {
    var fab = document.getElementById('game-phone-fab');
    var modal = document.getElementById('game-phone-modal');
    var backdrop = document.getElementById('game-phone-modal-backdrop');
    var closeBtn = document.getElementById('game-phone-modal-close');
    if (!fab || !modal || !document.getElementById('phone-frame')) return;
    fab.addEventListener('click', openGamePhone);
    if (closeBtn) closeBtn.addEventListener('click', closeGamePhone);
    if (backdrop) backdrop.addEventListener('click', closeGamePhone);
  }

  // -- Community toggle
  function initCommunityToggle() {
    var toggleBtn = document.getElementById('community-phone-toggle');
    var phoneView = document.getElementById('community-phone-view');
    if (!toggleBtn || !phoneView) return;
    toggleBtn.addEventListener('click', function() {
      phoneOpen = !phoneOpen;
      phoneView.hidden = !phoneOpen;
      toggleBtn.setAttribute('aria-pressed', String(phoneOpen));
      toggleBtn.textContent = phoneOpen ? 'Feed' : 'Phone';
      if (phoneOpen) {
        updateStatusBar(); phoneUpdateProfile(); phoneRenderFeed();
        updateWeatherWidget(); phoneShowView('home'); buildRadioList();
        renderFChatRooms(); initTipView();
      }
    });
  }

  // -- Browser
  function initBrowser() {
    var goBtn = document.getElementById('phone-browser-go');
    var urlInput = document.getElementById('phone-browser-url');
    var frame = document.getElementById('phone-browser-frame');
    var openLink = document.getElementById('phone-browser-open');
    if (!goBtn || !urlInput || !frame || !openLink) return;
    function resolveBrowserInput() {
      var value = urlInput.value.trim();
      if (!value) return null;
      if (!/^https?:\/\//i.test(value)) {
        return 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(value);
      }
      var url;
      try {
        url = new URL(value);
      } catch {
        showToast('Enter a valid web address or search term.');
        return null;
      }
      if (url.hostname === 'duckduckgo.com' || url.hostname === 'www.duckduckgo.com') {
        url.hostname = 'html.duckduckgo.com';
        url.pathname = '/html/';
      }
      return url.href;
    }
    goBtn.addEventListener('click', function() {
      var url = resolveBrowserInput();
      if (!url) return;
      urlInput.value = url;
      openLink.href = url;
      frame.textContent = 'Opening this site in a new tab. If it did not open, use the link below.';
      openLink.click();
    });
    urlInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') goBtn.click(); });
  }

  // -- Orion AI
  function initOrion() {
    var sendBtn = document.getElementById('orion-send');
    var input = document.getElementById('orion-input');
    if (!sendBtn || !input) return;
    sendBtn.addEventListener('click', orionSend);
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') orionSend(); });
    var el = document.getElementById('orion-messages');
    if (el && !el.children.length) {
      orionAddMessage('assistant', 'Hey! I am Orion, your FELTORA AI. Ask me pool tips, rules, or anything!');
    }
  }

  // -- FeltoraChat new group (inline modal, no prompt())
  function initFChatNewGroup() {
    var btn = document.getElementById('fchat-new-group');
    var modal = document.getElementById('fchat-new-group-modal');
    var cancelBtn = document.getElementById('fchat-modal-cancel');
    var createBtn = document.getElementById('fchat-modal-create');
    var nameInput = document.getElementById('fchat-group-name-input');
    var emojiRow = document.getElementById('fchat-emoji-row');
    if (!btn || !modal) return;
    var selectedEmoji = '&#x1F3B1;';

    btn.addEventListener('click', function() {
      modal.hidden = false;
      if (nameInput) { nameInput.value = ''; nameInput.focus(); }
    });
    if (cancelBtn) cancelBtn.addEventListener('click', function() { modal.hidden = true; });
    if (emojiRow) emojiRow.addEventListener('click', function(e) {
      var eb = e.target.closest('.fchat-emoji-btn');
      if (!eb) return;
      emojiRow.querySelectorAll('.fchat-emoji-btn').forEach(function(b) { b.classList.remove('active'); });
      eb.classList.add('active');
      selectedEmoji = eb.dataset.emoji;
    });
    if (createBtn) createBtn.addEventListener('click', function() {
      var name = nameInput ? nameInput.value.trim() : '';
      if (!name) { if (nameInput) nameInput.focus(); return; }
      var rooms = getFChatRooms();
      rooms.push({ id: 'grp-' + Date.now(), name: selectedEmoji + ' ' + name, desc: 'Created by ' + ((window.FeltoraAuth && window.FeltoraAuth.currentUser()) || 'you') });
      saveFChatRooms(rooms);
      renderFChatRooms();
      modal.hidden = true;
    });
    if (modal) modal.addEventListener('click', function(e) { if (e.target === modal) modal.hidden = true; });
  }

  // -- Settings toggles
  // ── Wallpapers ───────────────────────────────────────────────────
  var WALLPAPERS = [
    { id: 'default',  label: 'Dark',      style: 'background:#050a08;' },
    { id: 'midnight', label: 'Midnight',  style: 'background:linear-gradient(160deg,#0d1f33,#050a08);' },
    { id: 'forest',   label: 'Forest',    style: 'background:linear-gradient(160deg,#0a2e1a,#050a08);' },
    { id: 'aurora',   label: 'Aurora',    style: 'background:linear-gradient(160deg,#0d2233,#1a0d33,#050a08);' },
    { id: 'sunset',   label: 'Sunset',    style: 'background:linear-gradient(160deg,#2e1a0a,#1a0a0a,#050a08);' },
    { id: 'ocean',    label: 'Ocean',     style: 'background:linear-gradient(160deg,#0a1a2e,#0a2e2e,#050a08);' },
    { id: 'neon',     label: 'Neon',      style: 'background:linear-gradient(160deg,#0a0a1a,#1a0a2e,#050a08);' },
    { id: 'gold',     label: 'Gold',      style: 'background:linear-gradient(160deg,#1a1400,#2e2000,#050a08);' }
  ];

  function applyWallpaper(id) {
    var wp = WALLPAPERS.find(function(w) { return w.id === id; }) || WALLPAPERS[0];
    var wallEl = document.querySelector('.phone-wallpaper');
    if (wallEl) wallEl.setAttribute('style', wp.style + 'position:absolute;inset:0;z-index:0;');
    var phoneScreen = document.querySelector('.phone-screen');
    if (phoneScreen) phoneScreen.style.background = wp.style.replace('background:', '').replace(';','');
    try { localStorage.setItem('feltora-wallpaper', id); } catch(e) {}
  }

  function loadWallpaper() {
    try { return localStorage.getItem('feltora-wallpaper') || 'default'; } catch(e) { return 'default'; }
  }

  function buildWallpaperPicker() {
    var existing = document.getElementById('ps-wallpaper-section');
    if (existing) return;
    var settingsList = document.getElementById('phone-settings-list');
    if (!settingsList) return;
    var section = document.createElement('div');
    section.id = 'ps-wallpaper-section';
    var current = loadWallpaper();
    section.innerHTML = '<div class="phone-settings-section">Wallpaper</div>'
      + '<div class="wallpaper-grid">'
      + WALLPAPERS.map(function(w) {
          return '<button class="wallpaper-btn' + (w.id === current ? ' active' : '') + '" data-wp="' + w.id + '" style="' + w.style + '">'
            + '<span>' + w.label + '</span></button>';
        }).join('')
      + '</div>'
      + '<div class="phone-settings-section">Account</div>'
      + '<div class="phone-setting-row phone-setting-info" id="ps-username-row"><span>Username</span><span id="ps-username-val" style="color:var(--accent);font-size:0.68rem;"></span></div>'
      + '<div class="phone-setting-row phone-setting-info"><span>Version</span><span style="color:rgba(255,255,255,0.3);font-size:0.68rem;">FELTORA v4.0</span></div>'
      + '<button class="phone-setting-danger-btn" id="ps-delete-account">Delete Account</button>';
    settingsList.appendChild(section);
    section.querySelectorAll('.wallpaper-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        section.querySelectorAll('.wallpaper-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        applyWallpaper(btn.dataset.wp);
        if (window.FeltoraAuth && window.FeltoraAuth.update) window.FeltoraAuth.update({ wallpaper: btn.dataset.wp });
      });
    });
    var delBtn = document.getElementById('ps-delete-account');
    if (delBtn) delBtn.addEventListener('click', function() {
      if (!confirm('Delete your account? This cannot be undone.')) return;
      var me = window.FeltoraAuth && window.FeltoraAuth.currentUser();
      if (!me) return;
      // wipe account from feltora-accounts
      try {
        var accounts = JSON.parse(localStorage.getItem('feltora-accounts') || '{}');
        delete accounts[me];
        localStorage.setItem('feltora-accounts', JSON.stringify(accounts));
      } catch(e) {}
      window.FeltoraAuth.logout();
      showToast('Account deleted.');
      setTimeout(function() { window.location.reload(); }, 1500);
    });
  }

  // ── Voice notes (MediaRecorder → base64) ────────────────────────
  var mediaRecorder = null;
  var voiceChunks = [];
  var voiceTarget = null; // { type: 'dm'|'fchat', id: string }

  function startVoiceNote(target) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showToast('Voice notes not supported on this browser.'); return;
    }
    voiceTarget = target;
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function(stream) {
      voiceChunks = [];
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = function(e) { if (e.data.size > 0) voiceChunks.push(e.data); };
      mediaRecorder.onstop = function() {
        stream.getTracks().forEach(function(t) { t.stop(); });
        var blob = new Blob(voiceChunks, { type: 'audio/webm' });
        // cap at ~500KB (about 30s)
        if (blob.size > 512000) { showToast('Voice note too long. Max ~30 seconds.'); return; }
        var reader = new FileReader();
        reader.onload = function() {
          var base64 = reader.result;
          var me = (window.FeltoraAuth && window.FeltoraAuth.currentUser()) || 'You';
          var msg = { from: me, voice: base64, text: '', ts: Date.now() };
          var convId = (voiceTarget.type === 'dm' ? 'dm-' : 'fchat-') + voiceTarget.id;
          if (window.FeltoraFirebase) {
            window.FeltoraFirebase.saveVoiceNote(convId, base64, me).catch(function() {
              // fallback to localStorage
              if (voiceTarget.type === 'dm') saveMessage(voiceTarget.id, msg);
              else saveFChatMessage(voiceTarget.id, msg);
            });
          }
          // also save locally for instant playback
          if (voiceTarget.type === 'dm') {
            saveMessage(voiceTarget.id, msg);
            renderChat(voiceTarget.id);
          } else {
            saveFChatMessage(voiceTarget.id, msg);
            renderFChatMessages(voiceTarget.id);
          }
          showToast('Voice note sent!');
        };
        reader.readAsDataURL(blob);
      };
      mediaRecorder.start();
      showToast('Recording... tap mic again to send.');
      // auto-stop after 30s
      setTimeout(function() { if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop(); }, 30000);
    }).catch(function() { showToast('Microphone access denied.'); });
  }

  function stopVoiceNote() {
    if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
  }

  // ── Settings ─────────────────────────────────────────────────────
  function initPhoneSettings() {
    var dark = document.getElementById('ps-dark');
    var motion = document.getElementById('ps-motion');
    var sounds = document.getElementById('ps-sounds');
    var music = document.getElementById('ps-music');
    if (dark) dark.addEventListener('change', function() {
      document.body.setAttribute('data-theme', dark.checked ? 'dark' : 'light');
    });
    if (motion) motion.addEventListener('change', function() {
      document.body.classList.toggle('reduce-motion', motion.checked);
    });
    if (sounds) sounds.addEventListener('change', function() {
      try { localStorage.setItem('feltora-sounds', sounds.checked ? '1' : '0'); } catch(e) {}
    });
    if (music) music.addEventListener('change', function() {
      var btn = document.getElementById('music-toggle');
      if (btn) btn.click();
    });
    buildWallpaperPicker();
  }

  // -- Play button inside phone
  function initPhonePlayBtn() {
    var playBtn = document.getElementById('phone-play-btn');
    if (!playBtn) return;
    playBtn.addEventListener('click', function() {
      closeGamePhone();
      var phoneView = document.getElementById('community-phone-view');
      if (phoneView) phoneView.hidden = true;
      phoneOpen = false;
      if (typeof showScreen === 'function') showScreen('lobby');
    });
  }

  // -- Main event delegation on phone-app
  function initPhoneApp() {
    var phoneApp = document.getElementById('phone-app');
    if (!phoneApp) return;
    initWalletApp();
    verifyWalletReturn();

    // typing indicator on DM input
    var chatInput = document.getElementById('phone-chat-input');
    if (chatInput) {
      chatInput.addEventListener('input', function() {
        var chatView = document.getElementById('phone-chat-view');
        var chatMessages = document.getElementById('phone-chat-messages');
        if (!chatView || !chatMessages) return;
        showTypingIndicator(chatMessages);
        clearTimeout(typingTimers[chatView.dataset.friend]);
        typingTimers[chatView.dataset.friend] = setTimeout(function() {
          hideTypingIndicator(chatMessages);
        }, 1500);
      });
    }

    phoneApp.addEventListener('click', function(e) {
      var icon = e.target.closest('[data-open]');
      var back = e.target.closest('[data-back]');
      var tab  = e.target.closest('.pft-tab');
      var callBtn     = e.target.closest('.phone-call-btn');
      var msgBtn      = e.target.closest('.phone-msg-btn');
      var voiceBtn    = e.target.closest('.phone-voice-btn');
      var stationBtn  = e.target.closest('.radio-station-btn');
      var radioBtn    = e.target.closest('#radio-play-btn');
      var sendBtn     = e.target.closest('#phone-chat-send');
      var chatBack    = e.target.closest('#phone-chat-back');
      var fchatRoomRow= e.target.closest('.fchat-room-row');
      var fchatBack   = e.target.closest('#fchat-room-back');
      var fchatSend   = e.target.closest('#fchat-send');
      var fchatVoice  = e.target.closest('#fchat-voice-btn');
      var reportBtn   = e.target.closest('.fchat-report-btn');
      var reactBtn    = e.target.closest('.msg-react-btn');
      var cameraStart = e.target.closest('#phone-camera-start');
      var cameraCapture = e.target.closest('#phone-camera-capture');
      var weatherLocate = e.target.closest('#phone-weather-locate');
      var orionTip = e.target.closest('#orion-tip-button');

      if (icon) {
        var app = icon.dataset.open;
        if (app === 'feltora') { phoneRenderFeed(); phoneUpdateProfile(); }
        if (app === 'contacts') renderContacts();
        if (app === 'feltorachat') renderFChatRooms();
        if (app === 'orion') initOrion();
        if (app === 'settings') { phoneUpdateProfile(); initPhoneSettings(); }
        if (app === 'tip') initTipView();
        phoneShowView(app);
        if (app === 'camera') void startPhoneCamera();
      }
      if (back) phoneShowView(back.dataset.back);
      if (cameraStart) void startPhoneCamera();
      if (cameraCapture) capturePhonePhoto();
      if (weatherLocate) fetchLocalWeather();
      if (orionTip && window.FeltoraStore) window.FeltoraStore.openTip(1);
      if (tab) {
        var tabId = tab.dataset.tab;
        document.querySelectorAll('.pft-tab').forEach(function(t) { t.classList.remove('active'); });
        tab.classList.add('active');
        document.querySelectorAll('.pft-panel').forEach(function(p) { p.hidden = true; });
        var panel = document.getElementById('pft-' + tabId);
        if (panel) panel.hidden = false;
        if (tabId === 'feed') phoneRenderFeed();
        if (tabId === 'profile') phoneUpdateProfile();
      }
      if (callBtn) mockCall(callBtn.dataset.friend);
      if (msgBtn)  renderChat(msgBtn.dataset.friend);
      if (voiceBtn) {
        var fid = voiceBtn.dataset.friend;
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          stopVoiceNote();
        } else {
          renderChat(fid);
          startVoiceNote({ type: 'dm', id: fid });
        }
      }
      if (stationBtn) {
        if (stationBtn.dataset.locked === 'true') {
          showToast('Tip KES 50+ to unlock all radio stations.');
          if (window.FeltoraStore) window.FeltoraStore.openTip(1);
        } else playStation({ name: stationBtn.dataset.name, url: stationBtn.dataset.url });
      }
      if (radioBtn) { if (radioPlaying) stopRadio(); else if (currentStation) playStation(currentStation); }
      if (chatBack) {
        var cv = document.getElementById('phone-chat-view');
        var cl = document.getElementById('phone-contacts-list');
        if (cv) cv.style.display = 'none';
        if (cl) cl.style.display = 'flex';
      }
      if (sendBtn) {
        var input = document.getElementById('phone-chat-input');
        var chatView = document.getElementById('phone-chat-view');
        if (!input || !input.value.trim() || !chatView) return;
        var txt = input.value.trim();
        if (isAbusive(txt)) { showToast('Keep it respectful please.'); return; }
        var me = (window.FeltoraAuth && window.FeltoraAuth.currentUser()) || 'You';
        var chatMessages = document.getElementById('phone-chat-messages');
        if (chatMessages) hideTypingIndicator(chatMessages);
        var msg = { from: me, text: txt, ts: Date.now() };
        input.value = '';
        if (window.FeltoraFirebase) {
          window.FeltoraFirebase.sendDM(chatView.dataset.friend, msg).catch(function() {
            // fallback to localStorage if Firebase fails
            saveMessage(chatView.dataset.friend, msg);
            renderChat(chatView.dataset.friend);
          });
          // optimistic local render
          saveMessage(chatView.dataset.friend, msg);
          renderChatMsgs(getMessages(chatView.dataset.friend), chatView.dataset.friend);
        } else {
          saveMessage(chatView.dataset.friend, msg);
          renderChat(chatView.dataset.friend);
        }
      }
      if (fchatRoomRow) openFChatRoom(fchatRoomRow.dataset.roomId, fchatRoomRow.dataset.roomName);
      if (fchatBack) {
        var rv = document.getElementById('fchat-room-view');
        var rl = document.getElementById('fchat-rooms');
        if (rv) rv.style.display = 'none';
        if (rl) rl.style.display = 'flex';
      }
      if (fchatSend) {
        var inp = document.getElementById('fchat-input');
        var rv = document.getElementById('fchat-room-view');
        if (!inp || !inp.value.trim() || !rv) return;
        var txt2 = inp.value.trim();
        if (isAbusive(txt2)) { showToast('Keep it respectful please.'); return; }
        var me2 = (window.FeltoraAuth && window.FeltoraAuth.currentUser()) || 'Guest';
        var msg2 = { from: me2, text: txt2, ts: Date.now() };
        inp.value = '';
        if (window.FeltoraFirebase) {
          window.FeltoraFirebase.sendFChat(rv.dataset.room, msg2).catch(function() {
            saveFChatMessage(rv.dataset.room, msg2);
            renderFChatMessages(rv.dataset.room);
          });
          // optimistic local render
          saveFChatMessage(rv.dataset.room, msg2);
          renderFChatMsgList(getFChatMessages(rv.dataset.room), rv.dataset.room);
        } else {
          saveFChatMessage(rv.dataset.room, msg2);
          renderFChatMessages(rv.dataset.room);
        }
      }
      if (fchatVoice) {
        var rv2 = document.getElementById('fchat-room-view');
        if (!rv2) return;
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          stopVoiceNote();
        } else {
          startVoiceNote({ type: 'fchat', id: rv2.dataset.room });
        }
      }
      if (reportBtn) reportUser(reportBtn.dataset.from, decodeURIComponent(reportBtn.dataset.text));
      if (reactBtn) {
        var msgEl = reactBtn.closest('.fchat-msg, .phone-msg');
        if (msgEl) showReactionPicker(msgEl, reactBtn.dataset.ts, reactBtn.dataset.conv);
      }
    });

    phoneApp.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter') return;
      var ci = document.getElementById('phone-chat-input');
      var fi = document.getElementById('fchat-input');
      var oi = document.getElementById('orion-input');
      if (document.activeElement === ci) { var s = document.getElementById('phone-chat-send'); if (s) s.click(); }
      if (document.activeElement === fi) { var fs = document.getElementById('fchat-send'); if (fs) fs.click(); }
      if (document.activeElement === oi) orionSend();
    });
  }

  // -- Init
  document.addEventListener('DOMContentLoaded', function() {
    initBattery();
    fetchWeather();
    detectCountry();
    updateStatusBar();
    initGameFAB();
    initCommunityToggle();
    initBrowser();
    initFChatNewGroup();
    initPhonePlayBtn();
    initPhoneApp();
    applyWallpaper(loadWallpaper());
    setOnline();
    setInterval(updateStatusBar, 30000);
    setInterval(fetchWeather, 600000);
    setInterval(setOnline, 60000);
    setInterval(updateUnreadBadges, 10000);
  });

  window.FeltoraPhone = {
    open: openGamePhone,
    openApp: openPhoneApp,
    close: closeGamePhone,
    addFriend: addFriend,
    getFriends: getFriends,
    renderContacts: renderContacts,
    showToast: showToast,
    notify: showToast,
    getPaymentConfig: function() {
      var config = getGeoConfig(userCountry);
      return { currency: config.currency, symbol: config.symbol };
    },
    startVoiceNote: startVoiceNote,
    stopVoiceNote: stopVoiceNote
  };
})();
