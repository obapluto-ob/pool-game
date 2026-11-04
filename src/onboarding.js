// ── Onboarding Wizard ────────────────────────────────────────────
(function() {
  var obStep = 0;
  var obAvatar = 'marlow';
  var obCue = 'wood';
  var obFelt = 'green';
  var obUsername = '';

  var CUE_DATA = [
    { id: 'wood',    label: 'Wood',    color: '#c8924a', tip: '#f0d090', desc: 'Classic feel' },
    { id: 'black',   label: 'Black',   color: '#2a2a2a', tip: '#ffffff', desc: 'Stealth mode' },
    { id: 'gold',    label: 'Gold',    color: '#d4a017', tip: '#fff0a0', desc: 'Flex on them' },
    { id: 'neon',    label: 'Neon',    color: '#00c87a', tip: '#a0ffe0', desc: 'Glow up' },
    { id: 'chrome',  label: 'Chrome',  color: '#9ab0c8', tip: '#e8f0ff', desc: 'Ice cold' },
    { id: 'crimson', label: 'Crimson', color: '#c82020', tip: '#ffb0b0', desc: 'Blood money' }
  ];

  var FELT_DATA = [
    { id: 'green',   label: 'Classic Green', bg: '#1e6038', rail: '#0d3a1e', desc: 'The OG' },
    { id: 'blue',    label: 'Ocean Blue',    bg: '#133670', rail: '#0a1f45', desc: 'Deep water' },
    { id: 'burgundy',label: 'Burgundy',      bg: '#5e1222', rail: '#3a0a14', desc: 'Prestige' },
    { id: 'slate',   label: 'Slate',         bg: '#2c3a48', rail: '#1a2430', desc: 'Midnight' },
    { id: 'sand',    label: 'Sand',          bg: '#6e5830', rail: '#3e3018', desc: 'Desert run' }
  ];

  function obShowStep(n) {
    var prev = obStep;
    obStep = n;
    document.querySelectorAll('.ob-step').forEach(function(s, i) {
      s.hidden = i !== n;
    });
    document.querySelectorAll('.ob-dot').forEach(function(d, i) {
      d.classList.toggle('active', i === n);
      d.classList.toggle('done', i < n);
    });
    // update back button visibility
    var backBtn = document.getElementById('ob-back');
    if (backBtn) backBtn.hidden = n === 0;
    // animate direction
    var card = document.getElementById('onboarding-card');
    if (card) {
      card.classList.remove('ob-slide-left', 'ob-slide-right');
      void card.offsetWidth;
      card.classList.add(n > prev ? 'ob-slide-left' : 'ob-slide-right');
    }
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
      btn.innerHTML = '<div class="ob-avatar-art">' + window.FeltoraMascots.render(id) + '</div>'
        + '<span class="ob-av-name">' + m.name + '</span>'
        + '<span class="ob-av-role">' + (m.title || '') + '</span>';
      btn.addEventListener('click', function() {
        obAvatar = id;
        grid.querySelectorAll('.ob-avatar-btn').forEach(function(b) { b.classList.remove('selected'); });
        btn.classList.add('selected');
        // live preview in header
        var art = document.getElementById('ob-welcome-art');
        if (art && window.FeltoraMascots) art.innerHTML = window.FeltoraMascots.render(id);
      });
      grid.appendChild(btn);
    });
  }

  function obBuildCueGrid() {
    var grid = document.getElementById('ob-cue-grid');
    if (!grid) return;
    grid.innerHTML = CUE_DATA.map(function(c) {
      return '<button class="ob-cue-btn' + (c.id === obCue ? ' active' : '') + '" data-cue="' + c.id + '" type="button">'
        + '<div class="ob-cue-visual">'
        + '<div class="ob-cue-shaft" style="--cue-color:' + c.color + '"></div>'
        + '<div class="ob-cue-tip" style="--tip-color:' + c.tip + '"></div>'
        + '</div>'
        + '<span class="ob-cue-label">' + c.label + '</span>'
        + '<span class="ob-cue-desc">' + c.desc + '</span>'
        + '</button>';
    }).join('');
    grid.querySelectorAll('.ob-cue-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        obCue = btn.dataset.cue;
        grid.querySelectorAll('.ob-cue-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });
  }

  function obBuildFeltGrid() {
    var grid = document.getElementById('ob-felt-grid');
    if (!grid) return;
    grid.innerHTML = FELT_DATA.map(function(f) {
      return '<button class="ob-felt-btn' + (f.id === obFelt ? ' active' : '') + '" data-felt="' + f.id + '" type="button">'
        + '<div class="ob-table-preview">'
        + '<div class="ob-table-felt" style="background:' + f.bg + '">'
        + '<div class="ob-table-rail" style="border-color:' + f.rail + '"></div>'
        + '<div class="ob-table-pocket ob-tp-tl"></div>'
        + '<div class="ob-table-pocket ob-tp-tm"></div>'
        + '<div class="ob-table-pocket ob-tp-tr"></div>'
        + '<div class="ob-table-pocket ob-tp-bl"></div>'
        + '<div class="ob-table-pocket ob-tp-bm"></div>'
        + '<div class="ob-table-pocket ob-tp-br"></div>'
        + '</div>'
        + '</div>'
        + '<span class="ob-felt-label">' + f.label + '</span>'
        + '<span class="ob-felt-desc">' + f.desc + '</span>'
        + '</button>';
    }).join('');
    grid.querySelectorAll('.ob-felt-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        obFelt = btn.dataset.felt;
        grid.querySelectorAll('.ob-felt-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });
  }

  function obOpen(username) {
    obUsername = username || 'Player';
    obAvatar = 'marlow';
    obCue = 'wood';
    obFelt = 'green';
    var overlay = document.getElementById('onboarding-overlay');
    overlay.hidden = false;
    var nameEl = document.getElementById('ob-welcome-name');
    if (nameEl) nameEl.textContent = obUsername;
    var art = document.getElementById('ob-welcome-art');
    if (art && window.FeltoraMascots) art.innerHTML = window.FeltoraMascots.render('marlow');
    obBuildAvatarGrid();
    obBuildCueGrid();
    obBuildFeltGrid();
    obShowStep(0);
  }

  function obClose() {
    document.getElementById('onboarding-overlay').hidden = true;
  }

  function obFinish() {
    if (typeof setProfileAvatar === 'function') setProfileAvatar(obAvatar);
    if (typeof setCueStyle === 'function') setCueStyle(obCue);
    if (typeof setFelt === 'function') setFelt(obFelt);
    if (window.FeltoraAuth && window.FeltoraAuth.currentUser()) {
      window.FeltoraAuth.update({ avatar: obAvatar, cue: obCue, felt: obFelt });
    }
    obClose();
    if (typeof showScreen === 'function') showScreen('lobby');
  }

  // wire buttons after DOM ready
  document.addEventListener('DOMContentLoaded', function() {
    var startBtn = document.getElementById('ob-start');
    if (startBtn) startBtn.addEventListener('click', function() { obShowStep(1); });

    var backBtn = document.getElementById('ob-back');
    if (backBtn) backBtn.addEventListener('click', function() {
      if (obStep > 0) obShowStep(obStep - 1);
    });

    var avatarNext = document.getElementById('ob-avatar-next');
    if (avatarNext) avatarNext.addEventListener('click', function() { obShowStep(2); });

    var cueNext = document.getElementById('ob-cue-next');
    if (cueNext) cueNext.addEventListener('click', function() { obShowStep(3); });

    var finishBtn = document.getElementById('ob-finish');
    if (finishBtn) finishBtn.addEventListener('click', obFinish);
  });

  window.FeltoraOnboarding = { open: obOpen };
})();
