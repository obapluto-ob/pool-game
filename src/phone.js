// FELTORA Phone System
(function() {
  var phoneOpen = false;
  var batteryLevel = 100;
  var batteryCharging = false;
  var weatherData = { temp: '--', desc: 'Nairobi', icon: '🌤' };
  var radioPlaying = false;
  var radioAudio = null;
  var currentStation = null;

  var KENYA_STATIONS = [
    { name: 'Capital FM', url: 'https://stream.zeno.fm/0r0xa792kwzuv', emoji: '🎵' },
    { name: 'Radio Jambo', url: 'https://stream.zeno.fm/yn65m7h9p7zuv', emoji: '🎶' },
    { name: 'Classic 105', url: 'https://stream.zeno.fm/tsxbm1qp7wzuv', emoji: '🎸' },
    { name: 'Kiss 100', url: 'https://stream.zeno.fm/f3b8w8p9p7zuv', emoji: '💋' },
    { name: 'Homeboyz Radio', url: 'https://stream.zeno.fm/r8b2m3h9p7zuv', emoji: '🏠' }
  ];

  function initBattery() {
    if (!navigator.getBattery) return;
    navigator.getBattery().then(function(bat) {
      batteryLevel = Math.round(bat.level * 100);
      batteryCharging = bat.charging;
      updateStatusBar();
      bat.addEventListener('levelchange', function() {
        batteryLevel = Math.round(bat.level * 100);
        updateStatusBar();
      });
      bat.addEventListener('chargingchange', function() {
        batteryCharging = bat.charging;
        updateStatusBar();
      });
    }).catch(function() {});
  }

  function fetchWeather() {
    fetch('https://api.open-meteo.com/v1/forecast?latitude=-1.2921&longitude=36.8219&current_weather=true&temperature_unit=celsius')
      .then(function(r) { return r.json(); })
      .then(function(d) {
        var temp = Math.round(d.current_weather.temperature);
        var code = d.current_weather.weathercode;
        var icon = code <= 1 ? '☀️' : code <= 3 ? '⛅' : code <= 67 ? '🌧' : '🌩';
        weatherData = { temp: temp + '°C', desc: 'Nairobi', icon: icon };
        updateWeatherWidget();
      })
      .catch(function() {});
  }

  function updateWeatherWidget() {
    var el = document.getElementById('phone-weather-widget');
    if (el) el.innerHTML = weatherData.icon + ' <strong>' + weatherData.temp + '</strong> ' + weatherData.desc;
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
  }

  function playStation(station) {
    if (radioAudio) { radioAudio.pause(); radioAudio = null; }
    currentStation = station;
    radioAudio = new Audio(station.url);
    radioAudio.volume = 0.6;
    radioAudio.play().then(function() {
      radioPlaying = true;
      updateRadioUI();
    }).catch(function() {
      radioPlaying = false;
      updateRadioUI();
      var status = document.getElementById('radio-status');
      if (status) status.textContent = 'Stream unavailable — try another';
    });
  }

  function stopRadio() {
    if (radioAudio) { radioAudio.pause(); radioAudio = null; }
    radioPlaying = false;
    currentStation = null;
    updateRadioUI();
  }

  function updateRadioUI() {
    var nowPlaying = document.getElementById('radio-now-playing');
    var playBtn = document.getElementById('radio-play-btn');
    if (nowPlaying) nowPlaying.textContent = radioPlaying && currentStation ? currentStation.name : 'Not playing';
    if (playBtn) playBtn.textContent = radioPlaying ? '⏹ Stop' : '▶ Play';
    document.querySelectorAll('.radio-station-btn').forEach(function(btn) {
      btn.classList.toggle('active', !!(radioPlaying && currentStation && btn.dataset.name === currentStation.name));
    });
  }

  var FRIENDS_KEY = 'feltora-friends';
  var MESSAGES_KEY = 'feltora-messages';

  function getFriends() {
    try { return JSON.parse(localStorage.getItem(FRIENDS_KEY) || '[]'); } catch(e) { return []; }
  }
  function saveFriends(list) {
    try { localStorage.setItem(FRIENDS_KEY, JSON.stringify(list)); } catch(e) {}
  }
  function getMessages(friendId) {
    try {
      var all = JSON.parse(localStorage.getItem(MESSAGES_KEY) || '{}');
      return all[friendId] || [];
    } catch(e) { return []; }
  }
  function saveMessage(friendId, msg) {
    try {
      var all = JSON.parse(localStorage.getItem(MESSAGES_KEY) || '{}');
      if (!all[friendId]) all[friendId] = [];
      all[friendId].push(msg);
      localStorage.setItem(MESSAGES_KEY, JSON.stringify(all));
    } catch(e) {}
  }

  function addFriend(username) {
    var me = window.FeltoraAuth && window.FeltoraAuth.currentUser();
    if (!me || !username || username === me) return false;
    var friends = getFriends();
    if (friends.indexOf(username) !== -1) return false;
    friends.push(username);
    saveFriends(friends);
    return true;
  }

  var CALL_RESPONSES = [
    { duration: '0:32', outcome: 'They picked up! You talked about your last match. They want a rematch 🎱' },
    { duration: '1:14', outcome: 'Great call! You arranged a game for later tonight.' },
    { duration: '0:08', outcome: 'They were busy but said they\'ll hit you up later.' },
    { duration: '0:00', outcome: 'No answer. They might be in a game right now.' },
    { duration: '0:45', outcome: 'They challenged you to a best-of-3 series!' },
    { duration: '2:01', outcome: 'Long chat! You discussed strategies and trash-talked a bit 😄' }
  ];

  function mockCall(friendName) {
    var overlay = document.getElementById('call-overlay');
    if (!overlay) return;
    var nameEl = document.getElementById('call-name');
    var statusEl = document.getElementById('call-status');
    if (nameEl) nameEl.textContent = friendName;
    if (statusEl) statusEl.textContent = 'Calling…';
    overlay.hidden = false;

    var response = CALL_RESPONSES[Math.floor(Math.random() * CALL_RESPONSES.length)];
    var ringTime = response.duration === '0:00' ? 4000 : 2000;

    setTimeout(function() {
      if (overlay.hidden) return;
      if (response.duration === '0:00') {
        if (statusEl) statusEl.textContent = 'No answer';
        setTimeout(function() { endCall(response); }, 1500);
      } else {
        if (statusEl) statusEl.textContent = 'Connected · 0:00';
        var secs = 0;
        var iv = setInterval(function() {
          secs++;
          if (statusEl && !overlay.hidden) statusEl.textContent = 'Connected · 0:' + (secs < 10 ? '0' + secs : secs);
        }, 1000);
        setTimeout(function() {
          clearInterval(iv);
          endCall(response);
        }, 6000);
      }
    }, ringTime);

    var endBtn = document.getElementById('call-end-btn');
    if (endBtn) endBtn.onclick = function() { endCall({ duration: '0:00', outcome: 'You ended the call.' }); };
  }

  function endCall(response) {
    var overlay = document.getElementById('call-overlay');
    if (overlay) overlay.hidden = true;
    var summary = document.getElementById('call-summary');
    if (!summary) {
      summary = document.createElement('div');
      summary.id = 'call-summary';
      summary.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:10300;background:#1a2e24;border:1px solid rgba(0,240,168,0.3);border-radius:16px;padding:14px 18px;max-width:320px;width:calc(100vw - 32px);box-shadow:0 8px 32px rgba(0,0,0,0.6);';
      document.body.appendChild(summary);
    }
    summary.innerHTML = '<div style="font:700 0.8rem/1 system-ui,sans-serif;color:#00f0a8;margin-bottom:6px;">📞 Call ended · ' + response.duration + '</div>'
      + '<div style="font:400 0.82rem/1.5 system-ui,sans-serif;color:#e6f2eb;">' + response.outcome + '</div>';
    summary.style.display = 'block';
    setTimeout(function() { if (summary) summary.style.display = 'none'; }, 5000);
  }

  function renderContacts() {
    var list = document.getElementById('phone-contacts-list');
    if (!list) return;
    var friends = getFriends();
    if (!friends.length) {
      list.innerHTML = '<p style="text-align:center;color:rgba(255,255,255,0.3);font-size:0.68rem;padding:20px 12px;">No contacts yet.<br>Follow players from the community feed.</p>';
      return;
    }
    list.innerHTML = friends.map(function(f) {
      return '<div class="phone-contact-row">'
        + '<div class="phone-contact-avatar">' + f.slice(0,1).toUpperCase() + '</div>'
        + '<div class="phone-contact-info"><strong>' + f + '</strong><small>FELTORA player</small></div>'
        + '<div class="phone-contact-actions">'
        + '<button class="phone-action-btn phone-call-btn" data-friend="' + f + '" title="Call">📞</button>'
        + '<button class="phone-action-btn phone-msg-btn" data-friend="' + f + '" title="Message">💬</button>'
        + '</div></div>';
    }).join('');
  }

  function renderChat(friendId) {
    var chatView = document.getElementById('phone-chat-view');
    var chatName = document.getElementById('phone-chat-name');
    var chatMessages = document.getElementById('phone-chat-messages');
    if (!chatView || !chatMessages) return;
    if (chatName) chatName.textContent = friendId;
    var msgs = getMessages(friendId);
    var me = (window.FeltoraAuth && window.FeltoraAuth.currentUser()) || 'You';
    chatMessages.innerHTML = msgs.length ? msgs.map(function(m) {
      var isMine = m.from === me;
      return '<div class="phone-msg ' + (isMine ? 'mine' : 'theirs') + '">'
        + '<span>' + m.text + '</span>'
        + '<time>' + new Date(m.ts).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) + '</time>'
        + '</div>';
    }).join('') : '<p style="text-align:center;color:rgba(255,255,255,0.3);font-size:0.65rem;padding:16px;">Say hi! 👋</p>';
    chatMessages.scrollTop = chatMessages.scrollHeight;
    chatView.dataset.friend = friendId;
    var contacts = document.getElementById('phone-contacts');
    if (contacts) contacts.style.display = 'none';
    chatView.style.display = 'flex';
  }

  function phoneShowView(id) {
    document.querySelectorAll('.phone-view').forEach(function(v) {
      v.classList.toggle('active', v.id === 'phone-' + id);
    });
  }

  function phoneUpdateProfile() {
    var me = window.FeltoraAuth && window.FeltoraAuth.currentUser();
    var nameEl = document.getElementById('phone-profile-name');
    var tagEl  = document.getElementById('phone-profile-tag');
    var avatarEl = document.getElementById('phone-profile-avatar');
    var playArt  = document.getElementById('phone-play-art');
    if (nameEl) nameEl.textContent = me || 'Guest';
    if (tagEl)  tagEl.textContent  = me ? '@' + me : '@guest';
    if (avatarEl && window.FeltoraMascots) {
      var av = (me && window.FeltoraAuth && window.FeltoraAuth.getAccount(me))
        ? (window.FeltoraAuth.getAccount(me).avatar || 'marlow') : 'marlow';
      avatarEl.innerHTML = window.FeltoraMascots.render(av);
    }
    if (playArt && window.FeltoraMascots) playArt.innerHTML = window.FeltoraMascots.render('marlow');
    if (me && window.FeltoraAuth) {
      var acc = window.FeltoraAuth.getAccount(me);
      if (acc && acc.stats) {
        var w = document.getElementById('pps-wins');
        var l = document.getElementById('pps-losses');
        var f = document.getElementById('pps-frames');
        if (w) w.textContent = acc.stats.wins;
        if (l) l.textContent = acc.stats.losses;
        if (f) f.textContent = acc.stats.frames;
      }
    }
  }

  function phoneRenderFeed() {
    var feed = document.getElementById('phone-feed');
    if (!feed) return;
    var posts = [];
    try { posts = JSON.parse(localStorage.getItem('feltora-community-posts') || '[]'); } catch(e) {}
    if (!posts.length) {
      feed.innerHTML = '<p class="phone-feed-empty">No posts yet.<br>Be the first!</p>';
      return;
    }
    feed.innerHTML = posts.slice(0, 15).map(function(p) {
      var isReg = p.author && p.author !== 'Guest';
      var badge = isReg ? ' ✔' : '';
      return '<div class="phone-feed-card">'
        + '<div class="phone-feed-top">'
        + '<div class="phone-feed-avatar">' + (p.author || 'G').slice(0,1).toUpperCase() + '</div>'
        + '<span class="phone-feed-author">' + (p.author || 'Guest') + badge + '</span>'
        + '</div>'
        + '<p class="phone-feed-body">' + String(p.body || '').slice(0, 90) + '</p>'
        + '</div>';
    }).join('');
  }

  var toggleBtn = document.getElementById('community-phone-toggle');
  var phoneView = document.getElementById('community-phone-view');

  if (toggleBtn && phoneView) {
    toggleBtn.addEventListener('click', function() {
      phoneOpen = !phoneOpen;
      phoneView.hidden = !phoneOpen;
      toggleBtn.setAttribute('aria-pressed', String(phoneOpen));
      toggleBtn.textContent = phoneOpen ? '📋 Feed' : '📱 Phone';
      if (phoneOpen) {
        updateStatusBar();
        phoneUpdateProfile();
        phoneRenderFeed();
        updateWeatherWidget();
        phoneShowView('home');
        buildRadioList();
      }
    });
  }

  function buildRadioList() {
    var radioList = document.getElementById('radio-stations-list');
    if (!radioList || radioList.children.length) return;
    radioList.innerHTML = KENYA_STATIONS.map(function(s) {
      return '<button class="radio-station-btn" data-name="' + s.name + '" data-url="' + s.url + '">'
        + s.emoji + ' ' + s.name + '</button>';
    }).join('');
  }

  var phoneApp = document.getElementById('phone-app');
  if (phoneApp) {
    phoneApp.addEventListener('click', function(e) {
      var icon = e.target.closest('[data-open]');
      var back = e.target.closest('[data-back]');
      var tab  = e.target.closest('.pft-tab');
      var callBtn = e.target.closest('.phone-call-btn');
      var msgBtn  = e.target.closest('.phone-msg-btn');
      var stationBtn = e.target.closest('.radio-station-btn');
      var radioBtn   = e.target.closest('#radio-play-btn');
      var sendBtn    = e.target.closest('#phone-chat-send');
      var chatBack   = e.target.closest('#phone-chat-back');

      if (icon) {
        var app = icon.dataset.open;
        if (app === 'feltora') { phoneRenderFeed(); phoneUpdateProfile(); }
        if (app === 'contacts') renderContacts();
        phoneShowView(app);
      }
      if (back) phoneShowView(back.dataset.back);
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
      if (stationBtn) playStation({ name: stationBtn.dataset.name, url: stationBtn.dataset.url });
      if (radioBtn) { if (radioPlaying) stopRadio(); else if (currentStation) playStation(currentStation); }
      if (chatBack) {
        var cv = document.getElementById('phone-chat-view');
        var ct = document.getElementById('phone-contacts');
        if (cv) cv.style.display = 'none';
        if (ct) ct.style.display = 'flex';
      }
      if (sendBtn) {
        var input = document.getElementById('phone-chat-input');
        var chatView = document.getElementById('phone-chat-view');
        if (!input || !input.value.trim() || !chatView) return;
        var me = (window.FeltoraAuth && window.FeltoraAuth.currentUser()) || 'You';
        saveMessage(chatView.dataset.friend, { from: me, text: input.value.trim(), ts: Date.now() });
        input.value = '';
        renderChat(chatView.dataset.friend);
      }
    });

    // send on Enter key in chat
    phoneApp.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        var input = document.getElementById('phone-chat-input');
        var sendBtn = document.getElementById('phone-chat-send');
        if (document.activeElement === input && sendBtn) sendBtn.click();
      }
    });
  }

  var playBtn = document.getElementById('phone-play-btn');
  if (playBtn) {
    playBtn.addEventListener('click', function() {
      if (phoneView) phoneView.hidden = true;
      if (toggleBtn) { toggleBtn.setAttribute('aria-pressed', 'false'); toggleBtn.textContent = '📱 Phone'; }
      phoneOpen = false;
      if (typeof showScreen === 'function') showScreen('lobby');
    });
  }

  window.FeltoraPhone = {
    addFriend: addFriend,
    getFriends: getFriends,
    renderContacts: renderContacts
  };

  initBattery();
  fetchWeather();
  updateStatusBar();
  setInterval(updateStatusBar, 30000);
  setInterval(fetchWeather, 600000);
})();
