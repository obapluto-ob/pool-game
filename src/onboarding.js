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
