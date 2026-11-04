// ── Onboarding Wizard ────────────────────────────────────────────
(function() {
  var obStep = 0;
  var obAvatar = 'marlow';
  var obCue = 'wood';
  var obFelt = 'green';
  var obUsername = '';

  function obShowStep(n) {
    obStep = n;
    document.querySelectorAll('.ob-step').forEach(function(s, i) {
      s.hidden = i !== n;
    });
    document.querySelectorAll('.ob-dot').forEach(function(d, i) {
      d.classList.toggle('active', i === n);
      d.classList.toggle('done', i < n);
    });
  }

  function obBuildAvatarGrid() {
    var grid = document.getElementById('ob-avatar-grid');
    if (!grid || !window.FeltoraMascots) return;
    grid.innerHTML = '';
    window.FeltoraMascots.ids.forEach(function(id) {
      var m = window.FeltoraMascots.resolve(id);
      var btn = document.createElement('button');
      btn.className = 'ob-avatar-btn' + (id === obAvatar ? ' selected' : '');
      btn.type = 'button';
      btn.dataset.avatar = id;
      btn.innerHTML = window.FeltoraMascots.render(id) + '<span>' + m.name + '</span>';
      btn.addEventListener('click', function() {
        obAvatar = id;
        grid.querySelectorAll('.ob-avatar-btn').forEach(function(b) { b.classList.remove('selected'); });
        btn.classList.add('selected');
      });
      grid.appendChild(btn);
    });
  }

  function obOpen(username) {
    obUsername = username || 'Player';
    obAvatar = 'marlow';
    obCue = 'wood';
    obFelt = 'green';
    var overlay = document.getElementById('onboarding-overlay');
    overlay.hidden = false;
    // welcome step
    var nameEl = document.getElementById('ob-welcome-name');
    if (nameEl) nameEl.textContent = obUsername;
    var art = document.getElementById('ob-welcome-art');
    if (art && window.FeltoraMascots) art.innerHTML = window.FeltoraMascots.render('marlow');
    obBuildAvatarGrid();
    obShowStep(0);
  }

  function obClose() {
    document.getElementById('onboarding-overlay').hidden = true;
  }

  function obFinish() {
    // apply all choices
    if (typeof setProfileAvatar === 'function') setProfileAvatar(obAvatar);
    if (typeof setCueStyle === 'function') setCueStyle(obCue);
    if (typeof setFelt === 'function') setFelt(obFelt);
    // save to auth account
    if (window.FeltoraAuth && window.FeltoraAuth.currentUser()) {
      window.FeltoraAuth.update({ avatar: obAvatar, cue: obCue, felt: obFelt });
    }
    obClose();
    // show lobby
    if (typeof showScreen === 'function') showScreen('lobby');
  }

  // wire up buttons
  var startBtn = document.getElementById('ob-start');
  if (startBtn) startBtn.addEventListener('click', function() { obShowStep(1); });

  var avatarNext = document.getElementById('ob-avatar-next');
  if (avatarNext) avatarNext.addEventListener('click', function() {
    // update welcome art to selected avatar
    var art = document.getElementById('ob-welcome-art');
    if (art && window.FeltoraMascots) art.innerHTML = window.FeltoraMascots.render(obAvatar);
    obShowStep(2);
  });

  var cueNext = document.getElementById('ob-cue-next');
  if (cueNext) cueNext.addEventListener('click', function() { obShowStep(3); });

  var finishBtn = document.getElementById('ob-finish');
  if (finishBtn) finishBtn.addEventListener('click', obFinish);

  // cue selection
  document.querySelectorAll('.ob-cue-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      obCue = btn.dataset.cue;
      document.querySelectorAll('.ob-cue-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
    });
  });

  // felt selection
  document.querySelectorAll('.ob-felt-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      obFelt = btn.dataset.felt;
      document.querySelectorAll('.ob-felt-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
    });
  });

  // expose so game.js can call it after registration
  window.FeltoraOnboarding = { open: obOpen };
})();

// ── Phone Mockup ─────────────────────────────────────────────────
(function() {
  var phoneOpen = false;
  var currentPhoneView = 'home';

  function phoneShowView(id) {
    currentPhoneView = id;
    document.querySelectorAll('.phone-view').forEach(function(v) {
      v.classList.toggle('active', v.id === 'phone-' + id);
    });
  }

  function phoneUpdateTime() {
    var el = document.getElementById('phone-time');
    if (!el) return;
    var now = new Date();
    var h = now.getHours();
    var m = now.getMinutes();
    el.textContent = h + ':' + (m < 10 ? '0' + m : m);
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
      var av = (window.FeltoraAuth && me && window.FeltoraAuth.getAccount(me))
        ? (window.FeltoraAuth.getAccount(me).avatar || 'marlow')
        : 'marlow';
      avatarEl.innerHTML = window.FeltoraMascots.render(av);
    }
    if (playArt && window.FeltoraMascots) {
      playArt.innerHTML = window.FeltoraMascots.render('marlow');
    }
    // stats
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
    try { posts = JSON.parse(localStorage.getItem('feltora-community-posts') || '[]'); } catch (e) {}
    if (!posts.length) {
      feed.innerHTML = '<p class="phone-feed-empty">No posts yet.<br>Be the first to post!</p>';
      return;
    }
    var me = window.FeltoraAuth && window.FeltoraAuth.currentUser();
    feed.innerHTML = posts.slice(0, 12).map(function(p) {
      var isRegistered = p.author && p.author !== 'Guest';
      var initials = (p.author || 'G').slice(0, 1).toUpperCase();
      var badge = isRegistered ? '<span class="phone-feed-badge">&#x2714;</span>' : '';
      return '<div class="phone-feed-card">'
        + '<div class="phone-feed-top">'
        + '<div class="phone-feed-avatar">' + initials + '</div>'
        + '<span class="phone-feed-author">' + (p.author || 'Guest') + badge + '</span>'
        + '</div>'
        + '<p class="phone-feed-body">' + String(p.body || '').slice(0, 80) + '</p>'
        + '</div>';
    }).join('');
  }

  // toggle phone view
  var toggleBtn = document.getElementById('community-phone-toggle');
  var phoneView = document.getElementById('community-phone-view');
  var feedSection = document.querySelector('.community-tabs');

  if (toggleBtn && phoneView) {
    toggleBtn.addEventListener('click', function() {
      phoneOpen = !phoneOpen;
      phoneView.hidden = !phoneOpen;
      toggleBtn.setAttribute('aria-pressed', String(phoneOpen));
      toggleBtn.textContent = phoneOpen ? '📋 Feed' : '📱 Phone';
      if (phoneOpen) {
        phoneUpdateTime();
        phoneUpdateProfile();
        phoneRenderFeed();
        phoneShowView('home');
      }
    });
  }

  // app icon clicks — open apps
  document.getElementById('phone-app').addEventListener('click', function(e) {
    var icon = e.target.closest('[data-open]');
    var back = e.target.closest('[data-back]');
    var tab  = e.target.closest('.pft-tab');
    if (icon) {
      var app = icon.dataset.open;
      if (app === 'feltora') {
        phoneRenderFeed();
        phoneUpdateProfile();
      }
      phoneShowView(app);
    }
    if (back) {
      phoneShowView(back.dataset.back);
    }
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
  });

  // play button inside phone
  var playBtn = document.getElementById('phone-play-btn');
  if (playBtn) {
    playBtn.addEventListener('click', function() {
      // close phone view and go to lobby
      if (phoneView) phoneView.hidden = true;
      if (toggleBtn) { toggleBtn.setAttribute('aria-pressed', 'false'); toggleBtn.textContent = '📱 Phone'; }
      phoneOpen = false;
      if (typeof showScreen === 'function') showScreen('lobby');
    });
  }

  // update time every minute
  setInterval(phoneUpdateTime, 60000);
})();
