// FELTORA Phone System v3
(function() {
  var phoneOpen = false;
  var batteryLevel = 100;
  var batteryCharging = false;
  var weatherData = { temp: '--', desc: 'Nairobi', icon: '🌤' };
  var radioPlaying = false;
  var radioAudio = null;
  var currentStation = null;
  var PAYSTACK_KEY = 'pk_live_843fc3c7f2b2b12acf9de27e102dcb8ab3229136';

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
  function fetchWeather() {
    fetch('https://api.open-meteo.com/v1/forecast?latitude=-1.2921&longitude=36.8219&current_weather=true&temperature_unit=celsius')
      .then(function(r) { return r.json(); })
      .then(function(d) {
        var temp = Math.round(d.current_weather.temperature);
        var code = d.current_weather.weathercode;
        var icon = code <= 1 ? '☀️' : code <= 3 ? '⛅' : code <= 67 ? '🌧' : '🌩';
        weatherData = { temp: temp + '°C', desc: 'Nairobi', icon: icon };
        updateWeatherWidget();
      }).catch(function() {});
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
    if (!list || list.children.length) return;
    list.innerHTML = KENYA_STATIONS.map(function(s) {
      return '<button class="radio-station-btn" data-name="' + s.name + '" data-url="' + s.url + '">' + s.emoji + ' ' + s.name + '</button>';
    }).join('');
  }


  // ── Storage ──────────────────────────────────────────────────────
  var FRIENDS_KEY  = 'feltora-friends';
  var MESSAGES_KEY = 'feltora-messages';
  var FCHAT_KEY    = 'feltora-fchat';
  var REPORTS_KEY  = 'feltora-reports';

  function getFriends() { try { return JSON.parse(localStorage.getItem(FRIENDS_KEY) || '[]'); } catch(e) { return []; } }
  function saveFriends(l) { try { localStorage.setItem(FRIENDS_KEY, JSON.stringify(l)); } catch(e) {} }

  function getMessages(fid) {
    try { var a = JSON.parse(localStorage.getItem(MESSAGES_KEY) || '{}'); return a[fid] || []; } catch(e) { return []; }
  }
  function saveMessage(fid, msg) {
    try {
      var a = JSON.parse(localStorage.getItem(MESSAGES_KEY) || '{}');
      if (!a[fid]) a[fid] = [];
      a[fid].push(msg);
      localStorage.setItem(MESSAGES_KEY, JSON.stringify(a));
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
    var me = (window.FeltoraAuth && window.FeltoraAuth.currentUser()) || 'Guest';
    if (!rooms.length) {
      // seed default rooms
      rooms = [
        { id: 'general', name: '🎱 General', desc: 'Everyone welcome' },
        { id: 'wins',    name: '🏆 Wins',    desc: 'Share your victories' },
        { id: 'trash',   name: '🔥 Trash Talk', desc: 'Keep it fun' }
      ];
      saveFChatRooms(rooms);
    }
    el.innerHTML = rooms.map(function(r) {
      var msgs = getFChatMessages(r.id);
      var last = msgs.length ? msgs[msgs.length-1] : null;
      return '<div class="fchat-room-row" data-room-id="' + r.id + '" data-room-name="' + r.name + '">'
        + '<div class="fchat-room-icon">' + r.name.slice(0,2) + '</div>'
        + '<div class="fchat-room-info"><strong>' + r.name + '</strong>'
        + '<small>' + (last ? last.from + ': ' + last.text.slice(0,30) : r.desc) + '</small></div>'
        + '</div>';
    }).join('');
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
    var el = document.getElementById('fchat-messages');
    if (!el) return;
    var msgs = getFChatMessages(roomId);
    var me = (window.FeltoraAuth && window.FeltoraAuth.currentUser()) || 'Guest';
    el.innerHTML = msgs.length ? msgs.map(function(m) {
      var mine = m.from === me;
      var reportBtn = !mine ? '<button class="fchat-report-btn" data-from="' + m.from + '" data-text="' + encodeURIComponent(m.text) + '" title="Report">⚑</button>' : '';
      return '<div class="fchat-msg ' + (mine ? 'mine' : 'theirs') + '">'
        + (!mine ? '<span class="fchat-msg-from">' + m.from + '</span>' : '')
        + '<span class="fchat-msg-text">' + m.text + '</span>'
        + '<time>' + new Date(m.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) + '</time>'
        + reportBtn + '</div>';
    }).join('') : '<p style="text-align:center;color:rgba(255,255,255,0.3);font-size:0.65rem;padding:20px;">No messages yet. Say hi! 👋</p>';
    el.scrollTop = el.scrollHeight;
  }


  // ── Orion AI ─────────────────────────────────────────────────────
  var orionHistory = [];

  function orionAddMessage(role, text) {
    var el = document.getElementById('orion-messages');
    if (!el) return;
    var div = document.createElement('div');
    div.className = 'orion-msg ' + role;
    div.innerHTML = '<span class="orion-msg-label">' + (role === 'user' ? 'You' : '✨ Orion') + '</span>'
      + '<p>' + text.replace(/</g,'&lt;') + '</p>';
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  }

  function orionSend() {
    var input = document.getElementById('orion-input');
    if (!input || !input.value.trim()) return;
    var text = input.value.trim();
    input.value = '';
    if (isAbusive(text)) {
      orionAddMessage('system', '⚠️ Please keep it respectful.');
      return;
    }
    orionAddMessage('user', text);
    orionHistory.push({ role: 'user', content: text });
    // typing indicator
    var el = document.getElementById('orion-messages');
    var typing = document.createElement('div');
    typing.className = 'orion-msg assistant orion-typing';
    typing.innerHTML = '<span class="orion-msg-label">✨ Orion</span><p>Thinking<span class="orion-dots">...</span></p>';
    if (el) el.appendChild(typing);
    if (el) el.scrollTop = el.scrollHeight;

    var messages = [
      { role: 'system', content: 'You are Orion, a friendly AI assistant built into FELTORA, a browser-based 8-ball pool game. Be helpful, concise, and fun. Keep responses short (under 120 words).' }
    ].concat(orionHistory.slice(-8));

    // pollinations.ai — free, no API key needed
    var prompt = messages.map(function(m) { return m.role + ': ' + m.content; }).join('\n');
    var apiUrl = 'https://text.pollinations.ai/' + encodeURIComponent(prompt) + '?model=openai&seed=' + Math.floor(Math.random()*9999);
    fetch(apiUrl)
    .then(function(r) { return r.text(); })
    .then(function(reply) {
      if (typing.parentNode) typing.parentNode.removeChild(typing);
      reply = reply.trim().slice(0, 300);
      if (!reply) throw new Error('empty');
      orionHistory.push({ role: 'assistant', content: reply });
      orionAddMessage('assistant', reply);
    }).catch(function() {
      if (typing.parentNode) typing.parentNode.removeChild(typing);
      var tips = [
        'Always aim for the centre of the pocket, not the ball edge.',
        'Control your power. A soft shot with good angle beats a hard miss.',
        'Watch the cue ball after contact — that is your next shot setup.',
        'When in doubt, play safe. Leave your opponent with nothing.',
        'Ghost ball method: imagine a ball touching your target, aim for its centre.'
      ];
      var reply = tips[Math.floor(Math.random() * tips.length)];
      orionHistory.push({ role: 'assistant', content: reply });
      orionAddMessage('assistant', reply);
    });
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
      var mine = m.from === me;
      return '<div class="phone-msg ' + (mine ? 'mine' : 'theirs') + '">'
        + '<span>' + m.text + '</span>'
        + '<time>' + new Date(m.ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) + '</time>'
        + '</div>';
    }).join('') : '<p style="text-align:center;color:rgba(255,255,255,0.3);font-size:0.65rem;padding:16px;">Say hi! 👋</p>';
    chatMessages.scrollTop = chatMessages.scrollHeight;
    chatView.dataset.friend = friendId;
    var contacts = document.getElementById('phone-contacts-list');
    if (contacts) contacts.style.display = 'none';
    chatView.style.display = 'flex';
  }


  // ── Mock Call ────────────────────────────────────────────────────
  var CALL_RESPONSES = [
    { duration: '0:32', outcome: 'They picked up! Rematch incoming.' },
    { duration: '1:14', outcome: 'Great call! Game arranged for tonight.' },
    { duration: '0:08', outcome: 'They were busy, will hit you up later.' },
    { duration: '0:00', outcome: 'No answer. They might be in a game.' },
    { duration: '0:45', outcome: 'They challenged you to a best-of-3!' }
  ];

  function mockCall(friendName) {
    var overlay = document.getElementById('call-overlay');
    if (!overlay) return;
    var nameEl = document.getElementById('call-name');
    var statusEl = document.getElementById('call-status');
    if (nameEl) nameEl.textContent = friendName;
    if (statusEl) statusEl.textContent = 'Calling...';
    overlay.hidden = false;
    var response = CALL_RESPONSES[Math.floor(Math.random() * CALL_RESPONSES.length)];
    var ringTime = response.duration === '0:00' ? 4000 : 2000;
    setTimeout(function() {
      if (overlay.hidden) return;
      if (response.duration === '0:00') {
        if (statusEl) statusEl.textContent = 'No answer';
        setTimeout(function() { endCall(response); }, 1500);
      } else {
        if (statusEl) statusEl.textContent = 'Connected 0:00';
        var secs = 0;
        var iv = setInterval(function() {
          secs++;
          if (statusEl && !overlay.hidden) statusEl.textContent = 'Connected 0:' + (secs < 10 ? '0' + secs : secs);
        }, 1000);
        setTimeout(function() { clearInterval(iv); endCall(response); }, 6000);
      }
    }, ringTime);
    var endBtn = document.getElementById('call-end-btn');
    if (endBtn) endBtn.onclick = function() { endCall({ duration: '0:00', outcome: 'You ended the call.' }); };
  }

  function endCall(response) {
    var overlay = document.getElementById('call-overlay');
    if (overlay) overlay.hidden = true;
    showToast('Call ended ' + response.duration + ' - ' + response.outcome);
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
  function initTipView() {
    if (tipInitDone) return;
    tipInitDone = true;
    document.querySelectorAll('.phone-tip-amt').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.phone-tip-amt').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        selectedTipAmt = parseInt(btn.dataset.amount, 10);
        var custom = document.getElementById('tip-custom-amount');
        if (custom) { custom.value = ''; custom.placeholder = 'or enter custom amount'; }
        updateTipDisplay(selectedTipAmt);
      });
    });
    var custom = document.getElementById('tip-custom-amount');
    if (custom) custom.addEventListener('input', function() {
      var v = parseInt(custom.value, 10);
      if (v > 0) {
        document.querySelectorAll('.phone-tip-amt').forEach(function(b) { b.classList.remove('active'); });
        selectedTipAmt = v;
        updateTipDisplay(v);
      }
    });
    var payBtn = document.getElementById('phone-tip-pay');
    if (!payBtn) return;
    payBtn.addEventListener('click', function() {
      var emailEl = document.getElementById('tip-email');
      var amount = selectedTipAmt;
      var email = emailEl ? emailEl.value.trim() : '';
      if (!amount || amount < 10) { showToast('Pick an amount first.'); return; }
      if (!email || email.indexOf('@') === -1) { showToast('Enter your email for the receipt.'); return; }
      if (typeof PaystackPop === 'undefined') {
        showToast('Loading payment... try again in a moment.');
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
    var display = document.getElementById('tip-amount-display');
    if (display) display.textContent = 'KES ' + amount.toLocaleString();
  }

  function triggerPaystack(amount, email) {
    var handler = PaystackPop.setup({
      key: PAYSTACK_KEY,
      email: email,
      amount: amount * 100,
      currency: 'KES',
      ref: 'FELTORA-TIP-' + Date.now(),
      metadata: {
        custom_fields: [{ display_name: 'Message', variable_name: 'message', value: 'Tip for FELTORA developer' }]
      },
      callback: function(response) {
        showToast('Thank you so much! Your tip means everything. Ref: ' + response.reference);
        var tipView = document.getElementById('phone-tip-view-inner');
        if (tipView) {
          tipView.innerHTML = '<div style="text-align:center;padding:32px 16px;">'
            + '<div style="font-size:3rem;margin-bottom:12px;">&#x1F917;</div>'
            + '<h3 style="color:var(--accent);font:800 1rem/1 system-ui,sans-serif;margin:0 0 8px;">Thank you!</h3>'
            + '<p style="color:var(--muted);font:400 0.72rem/1.5 system-ui,sans-serif;margin:0;">Your tip of KES ' + amount.toLocaleString() + ' was received. You are a legend.</p>'
            + '</div>';
        }
      },
      onClose: function() {}
    });
    handler.openIframe();
  }

  // ── Profile & Feed ───────────────────────────────────────────────
  function phoneUpdateProfile() {
    var me = window.FeltoraAuth && window.FeltoraAuth.currentUser();
    var nameEl = document.getElementById('phone-profile-name');
    var tagEl  = document.getElementById('phone-profile-tag');
    var avatarEl = document.getElementById('phone-profile-avatar');
    var playArt  = document.getElementById('phone-play-art');
    if (nameEl) nameEl.textContent = me || 'Guest';
    if (tagEl)  tagEl.textContent  = me ? '@' + me : '@guest';
    if (avatarEl && window.FeltoraMascots) {
      var av = (me && window.FeltoraAuth && window.FeltoraAuth.getAccount && window.FeltoraAuth.getAccount(me))
        ? (window.FeltoraAuth.getAccount(me).avatar || 'marlow') : 'marlow';
      avatarEl.innerHTML = window.FeltoraMascots.render(av);
    }
    if (playArt && window.FeltoraMascots) playArt.innerHTML = window.FeltoraMascots.render('marlow');
    if (me && window.FeltoraAuth && window.FeltoraAuth.getAccount) {
      var acc = window.FeltoraAuth.getAccount(me);
      if (acc && acc.stats) {
        var w = document.getElementById('pps-wins');
        var l = document.getElementById('pps-losses');
        var fr = document.getElementById('pps-frames');
        if (w) w.textContent = acc.stats.wins;
        if (l) l.textContent = acc.stats.losses;
        if (fr) fr.textContent = acc.stats.frames;
      }
    }
    var psUser = document.getElementById('ps-username-val');
    if (psUser) psUser.textContent = me || 'Guest';
  }

  function phoneRenderFeed() {
    var feed = document.getElementById('phone-feed');
    if (!feed) return;
    var posts = [];
    try { posts = JSON.parse(localStorage.getItem('feltora-community-posts') || '[]'); } catch(e) {}
    if (!posts.length) {
      feed.innerHTML = '<p class="phone-feed-empty">No posts yet. Be the first!</p>';
      return;
    }
    feed.innerHTML = posts.slice(0, 15).map(function(p) {
      var badge = (p.author && p.author !== 'Guest') ? ' <span style="color:#00f0a8;font-size:0.6rem;">&#x2714;</span>' : '';
      return '<div class="phone-feed-card">'
        + '<div class="phone-feed-top">'
        + '<div class="phone-feed-avatar">' + (p.author || 'G').slice(0,1).toUpperCase() + '</div>'
        + '<span class="phone-feed-author">' + (p.author || 'Guest') + badge + '</span>'
        + '</div>'
        + '<p class="phone-feed-body">' + String(p.body || '').slice(0, 90) + '</p>'
        + '</div>';
    }).join('');
  }


  // -- Phone view navigation
  function phoneShowView(id) {
    document.querySelectorAll('.phone-view').forEach(function(v) {
      v.classList.toggle('active', v.id === 'phone-' + id);
    });
  }

  // -- Floating FAB
  function initGameFAB() {
    var fab = document.getElementById('game-phone-fab');
    var modal = document.getElementById('game-phone-modal');
    var backdrop = document.getElementById('game-phone-modal-backdrop');
    var closeBtn = document.getElementById('game-phone-modal-close');
    var inner = document.getElementById('game-phone-modal-inner');
    var phoneFrame = document.getElementById('phone-frame');
    if (!fab || !modal || !phoneFrame) return;
    fab.addEventListener('click', function() {
      modal.hidden = false;
      if (!inner.contains(phoneFrame)) inner.appendChild(phoneFrame);
      updateStatusBar(); phoneUpdateProfile(); phoneRenderFeed();
      updateWeatherWidget(); buildRadioList(); renderFChatRooms(); initTipView();
    });
    function closeModal() {
      modal.hidden = true;
      var cv = document.getElementById('community-phone-view');
      if (cv && !cv.contains(phoneFrame)) cv.appendChild(phoneFrame);
    }
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (backdrop) backdrop.addEventListener('click', closeModal);
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
    if (!goBtn || !urlInput || !frame) return;
    goBtn.addEventListener('click', function() {
      var url = urlInput.value.trim();
      if (!url) return;
      if (url.indexOf('http') !== 0) url = 'https://duckduckgo.com/?q=' + encodeURIComponent(url) + '&kae=d';
      frame.src = url;
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
  }

  // -- Play button inside phone
  function initPhonePlayBtn() {
    var playBtn = document.getElementById('phone-play-btn');
    if (!playBtn) return;
    playBtn.addEventListener('click', function() {
      var modal = document.getElementById('game-phone-modal');
      if (modal) modal.hidden = true;
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
      var fchatRoomRow = e.target.closest('.fchat-room-row');
      var fchatBack  = e.target.closest('#fchat-room-back');
      var fchatSend  = e.target.closest('#fchat-send');
      var reportBtn  = e.target.closest('.fchat-report-btn');

      if (icon) {
        var app = icon.dataset.open;
        if (app === 'feltora') { phoneRenderFeed(); phoneUpdateProfile(); }
        if (app === 'contacts') renderContacts();
        if (app === 'feltorachat') renderFChatRooms();
        if (app === 'orion') initOrion();
        if (app === 'settings') { phoneUpdateProfile(); initPhoneSettings(); }
        if (app === 'tip') initTipView();
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
        saveMessage(chatView.dataset.friend, { from: me, text: txt, ts: Date.now() });
        input.value = '';
        renderChat(chatView.dataset.friend);
      }
      if (fchatRoomRow) {
        openFChatRoom(fchatRoomRow.dataset.roomId, fchatRoomRow.dataset.roomName);
      }
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
        saveFChatMessage(rv.dataset.room, { from: me2, text: txt2, ts: Date.now() });
        inp.value = '';
        renderFChatMessages(rv.dataset.room);
      }
      if (reportBtn) {
        reportUser(reportBtn.dataset.from, decodeURIComponent(reportBtn.dataset.text));
      }
    });
    phoneApp.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter') return;
      var ci = document.getElementById('phone-chat-input');
      var fi = document.getElementById('fchat-input');
      var oi = document.getElementById('orion-input');
      if (document.activeElement === ci) document.getElementById('phone-chat-send') && document.getElementById('phone-chat-send').click();
      if (document.activeElement === fi) document.getElementById('fchat-send') && document.getElementById('fchat-send').click();
      if (document.activeElement === oi) orionSend();
    });
  }

  // -- Init
  document.addEventListener('DOMContentLoaded', function() {
    initBattery();
    fetchWeather();
    updateStatusBar();
    initGameFAB();
    initCommunityToggle();
    initBrowser();
    initFChatNewGroup();
    initPhonePlayBtn();
    initPhoneApp();
    setInterval(updateStatusBar, 30000);
    setInterval(fetchWeather, 600000);
  });

  window.FeltoraPhone = {
    addFriend: addFriend,
    getFriends: getFriends,
    renderContacts: renderContacts,
    showToast: showToast
  };
})();
