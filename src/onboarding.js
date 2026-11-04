// FELTORA Onboarding Wizard v3 — 6 steps
(function() {
  var obStep = 0;
  var obAvatar = 'marlow';
  var obCue = 'wood';
  var obFelt = 'green';
  var obTitle = 'The Hustler';
  var obVibe = 'aggressive';
  var obUsername = '';
  var TOTAL_STEPS = 6;

  var CUE_DATA = [
    { id:'wood',    label:'Wood',    color:'#c8924a', tip:'#f0d090', desc:'Classic feel',  glow:'rgba(200,146,74,0.4)' },
    { id:'black',   label:'Black',   color:'#2a2a2a', tip:'#e0e0ff', desc:'Stealth mode', glow:'rgba(180,180,255,0.3)' },
    { id:'gold',    label:'Gold',    color:'#d4a017', tip:'#fff0a0', desc:'Flex on them',  glow:'rgba(212,160,23,0.5)' },
    { id:'neon',    label:'Neon',    color:'#00c87a', tip:'#a0ffe0', desc:'Glow up',       glow:'rgba(0,200,122,0.5)' },
    { id:'chrome',  label:'Chrome',  color:'#9ab0c8', tip:'#e8f0ff', desc:'Ice cold',      glow:'rgba(154,176,200,0.4)' },
    { id:'crimson', label:'Crimson', color:'#c82020', tip:'#ffb0b0', desc:'Blood money',   glow:'rgba(200,32,32,0.5)' }
  ];

  var FELT_DATA = [
    { id:'green',    label:'Classic Green', bg:'#1e6038', rail:'#0d3a1e', spot:'#17a85a', desc:'The OG' },
    { id:'blue',     label:'Ocean Blue',    bg:'#133670', rail:'#0a1f45', spot:'#1a5abf', desc:'Deep water' },
    { id:'burgundy', label:'Burgundy',      bg:'#5e1222', rail:'#3a0a14', spot:'#a01830', desc:'Prestige' },
    { id:'slate',    label:'Slate',         bg:'#2c3a48', rail:'#1a2430', spot:'#3d5268', desc:'Midnight' },
    { id:'sand',     label:'Sand',          bg:'#6e5830', rail:'#3e3018', spot:'#a08040', desc:'Desert run' }
  ];

  var MASCOT_DESCS = {
    marlow: 'The Host — calm, collected, always in control.',
    ivy:    'The Tactician — plans three shots ahead.',
    rook:   'The Veteran — seen it all, fears nothing.',
    pip:    'The Trick Shot — style is everything.',
    zara:   'The Hustler — never shows her hand.',
    knox:   'The Enforcer — power over precision.',
    lena:   'The Sharpshooter — never misses twice.',
    dex:    'The Wildcard — unpredictable, unstoppable.'
  };

  function obShowStep(n) {
    var prev = obStep;
    obStep = n;
    document.querySelectorAll('.ob-step').forEach(function(s, i) { s.hidden = i !== n; });
    document.querySelectorAll('.ob-dot').forEach(function(d, i) {
      d.classList.toggle('active', i === n);
      d.classList.toggle('done', i < n);
    });
    var backBtn = document.getElementById('ob-back');
    if (backBtn) backBtn.hidden = n === 0;
    var card = document.getElementById('onboarding-card');
    if (card) {
      card.classList.remove('ob-slide-left','ob-slide-right');
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
        var art = document.getElementById('ob-welcome-art');
        if (art && window.FeltoraMascots) art.innerHTML = window.FeltoraMascots.render(id);
        var preview = document.getElementById('ob-avatar-preview');
        if (preview) {
          preview.innerHTML = '<span class="ob-preview-name">' + m.name + '</span>'
            + '<span class="ob-preview-desc">' + (MASCOT_DESCS[id] || '') + '</span>';
          preview.classList.add('visible');
        }
      });
      grid.appendChild(btn);
    });
    // trigger preview for default
    var preview = document.getElementById('ob-avatar-preview');
    if (preview && window.FeltoraMascots) {
      var m = window.FeltoraMascots.resolve(obAvatar);
      preview.innerHTML = '<span class="ob-preview-name">' + m.name + '</span>'
        + '<span class="ob-preview-desc">' + (MASCOT_DESCS[obAvatar] || '') + '</span>';
      preview.classList.add('visible');
    }
  }

  function obBuildCueGrid() {
    var grid = document.getElementById('ob-cue-grid');
    if (!grid) return;
    grid.innerHTML = CUE_DATA.map(function(c) {
      return '<button class="ob-cue-btn' + (c.id === obCue ? ' active' : '') + '" data-cue="' + c.id + '" type="button">'
        + '<div class="ob-cue-visual" style="--glow:' + c.glow + '">'
        + '<div class="ob-cue-butt" style="background:' + c.color + '"></div>'
        + '<div class="ob-cue-shaft" style="--cue-color:' + c.color + '"></div>'
        + '<div class="ob-cue-tip" style="--tip-color:' + c.tip + ';box-shadow:0 0 8px ' + c.glow + '"></div>'
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
        + '<div class="ob-table-spot" style="background:' + f.spot + '"></div>'
        + '<div class="ob-table-pocket ob-tp-tl"></div>'
        + '<div class="ob-table-pocket ob-tp-tm"></div>'
        + '<div class="ob-table-pocket ob-tp-tr"></div>'
        + '<div class="ob-table-pocket ob-tp-bl"></div>'
        + '<div class="ob-table-pocket ob-tp-bm"></div>'
        + '<div class="ob-table-pocket ob-tp-br"></div>'
        + '</div></div>'
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
    obAvatar = 'marlow'; obCue = 'wood'; obFelt = 'green';
    obTitle = 'The Hustler'; obVibe = 'aggressive';
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

  function obFinish() {
    if (typeof setProfileAvatar === 'function') setProfileAvatar(obAvatar);
    if (typeof setCueStyle === 'function') setCueStyle(obCue);
    if (typeof setFelt === 'function') setFelt(obFelt);
    if (window.FeltoraAuth && window.FeltoraAuth.currentUser()) {
      window.FeltoraAuth.update({ avatar: obAvatar, cue: obCue, felt: obFelt, title: obTitle, vibe: obVibe });
    }
    document.getElementById('onboarding-overlay').hidden = true;
    if (typeof showScreen === 'function') showScreen('lobby');
  }

  document.addEventListener('DOMContentLoaded', function() {
    var startBtn = document.getElementById('ob-start');
    if (startBtn) startBtn.addEventListener('click', function() { obShowStep(1); });

    var backBtn = document.getElementById('ob-back');
    if (backBtn) backBtn.addEventListener('click', function() { if (obStep > 0) obShowStep(obStep - 1); });

    var avatarNext = document.getElementById('ob-avatar-next');
    if (avatarNext) avatarNext.addEventListener('click', function() { obShowStep(2); });

    var cueNext = document.getElementById('ob-cue-next');
    if (cueNext) cueNext.addEventListener('click', function() { obShowStep(3); });

    var feltNext = document.getElementById('ob-felt-next');
    if (feltNext) feltNext.addEventListener('click', function() { obShowStep(4); });

    var titleNext = document.getElementById('ob-title-next');
    if (titleNext) titleNext.addEventListener('click', function() { obShowStep(5); });

    var finishBtn = document.getElementById('ob-finish');
    if (finishBtn) finishBtn.addEventListener('click', obFinish);

    document.querySelectorAll('.ob-title-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        obTitle = btn.dataset.title;
        document.querySelectorAll('.ob-title-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });

    document.querySelectorAll('.ob-vibe-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        obVibe = btn.dataset.vibe;
        document.querySelectorAll('.ob-vibe-btn').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });
  });

  window.FeltoraOnboarding = { open: obOpen };
})();
