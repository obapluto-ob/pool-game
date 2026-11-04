const cv = document.getElementById('c');
const g = cv.getContext('2d', { alpha: false });
const W = 900, H = 500, L = 50, T = 50, R = 850, B = 450, BR = 10;

// HiDPI / Retina scaling — fixes jagged cue stick and ball edges on mobile
(function scaleCanvasForDPR() {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  cv.width  = W * dpr;
  cv.height = H * dpr;
  cv.style.width  = '100%';
  cv.style.height = 'auto';
  g.scale(dpr, dpr);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
})();
const TABLE_CENTER_Y = H / 2;
const HEAD_STRING = L + (R - L) / 4;
const FOOT_SPOT = L + (R - L) * 3 / 4;
const POCKETS = [[L, T, 22], [450, T - 4, 20], [R, T, 22], [L, B, 22], [450, B + 4, 20], [R, B, 22]];
const BALL_BALL_RESTITUTION = 0.94;
const CUSHION_RESTITUTION = 0.8;
const ROLLING_DECELERATION = 0.14;
const PHYSICS_STEP = 1 / 60;
const MAX_FRAME_DELTA = 0.25;
const COL = ['', '#f2c230', '#2b5fc4', '#d6382f', '#6b3fa0', '#f08a24', '#2e9b5a', '#8b2a2a', '#161616'];
const WHITE = '#f7f5ee';
const cuePalettes = {
  wood:    { main: '#d9b27a', dark: '#5b3a1e', glow: 'rgba(195,144,63,0.32)' },
  black:   { main: '#f3f6ff', dark: '#23262b', glow: 'rgba(113,118,130,0.28)' },
  gold:    { main: '#f3d27b', dark: '#795f18', glow: 'rgba(221,180,85,0.32)' },
  neon:    { main: '#16d69a', dark: '#0d7b60', glow: 'rgba(22,214,154,0.32)' },
  chrome:  { main: '#e8edf5', dark: '#6a7080', glow: 'rgba(180,190,210,0.35)' },
  crimson: { main: '#e84040', dark: '#6b0f0f', glow: 'rgba(220,50,50,0.32)' }
};
const feltPalettes = {
  green:   { top:'#2a7a4a', center:'#1e6038', bottom:'#163d24', cushionTop:'#1a5c34', cushionCenter:'#144a28', cushionBottom:'#0e3319' },
  blue:    { top:'#1a4a8a', center:'#133670', bottom:'#0c2450', cushionTop:'#122e6a', cushionCenter:'#0d2254', cushionBottom:'#081840' },
  burgundy:{ top:'#7a1a2e', center:'#5e1222', bottom:'#3e0c18', cushionTop:'#5e1222', cushionCenter:'#4a0e1c', cushionBottom:'#360a14' },
  slate:   { top:'#3a4a5a', center:'#2c3a48', bottom:'#1e2a36', cushionTop:'#2c3a48', cushionCenter:'#222e3a', cushionBottom:'#18242e' },
  sand:    { top:'#8a7040', center:'#6e5830', bottom:'#4e3e20', cushionTop:'#6e5830', cushionCenter:'#5a4828', cushionBottom:'#40341c' }
};
const playerNames = ['Player One', 'Player 2'];
const playerAvatars = ['marlow', 'rook'];
let groupBallNumbers = [null, null];
let balls, cue, state, turn, groups, aim, pocketed, msg, winner, ptr = { x: HEAD_STRING, y: TABLE_CENTER_Y };
let selectedCue = 'wood';
let last = null, acc = 0;
let lastOnlineStateAt = 0;
let lastOnlineTurnSecond = 0;
let aimPointerId = null, placePointerId = null, powerPointerId = null, powerPointerActive = false;
let powerPullStart = null, powerStartingValue = 50, powerPullAxis = null;
let botMode = false, botMascot = 'marlow', botDifficulty = 'medium', botTimer = null;
let onlineMode = false;
let onlineRole = null;
let onlineLocalPlayer = 0;
let remoteStateReceivedAt = 0;
let remoteStateInterval = 1000 / 20;
let view3d = false;
let selectedFelt = 'green';
let turnRemaining = 30;
let firstHit = null, eightBallReadyAtShot = false;
let extraShots = 0; // 2-shot rule: opponent gets 2 shots after a foul
let audioContext = null, masterGain = null, musicBus = null, effectsBus = null;
let musicTimer = null, musicEnabled = false, musicStarting = false, sfxEnabled = true, lastMenuSound = 0;
let loungeMeasureIndex = 0;
let tableColors = {};
const pocketedToasts = []; // { n, x, y, born }
const lastSoundAt = new Map();
const recentPhysicalSounds = [];
let lastImpactSoundAt = 0;
let lastRollingSampleAt = 0;
const audioSettings = { master: 0.75, music: 0.18, effects: 0.55 };

function grp(n) {
  if (n > 0 && n < 8) return 'solid';
  if (n > 8 && n < 16) return 'stripes'; // match CSS data-group="stripes"
  return 'eight';
}

function updateAvatarDisplays() {
  const avatars = {
    profile: playerAvatars[0],
    'room-host': playerAvatars[0],
    'player-0': playerAvatars[0],
    'player-1': playerAvatars[1],
    'result-0': playerAvatars[0],
    'result-1': playerAvatars[1]
  };
  document.querySelectorAll('[data-avatar-display]').forEach((element) => {
    element.innerHTML = window.FeltoraMascots.render(avatars[element.dataset.avatarDisplay]);
  });
  document.querySelectorAll('[data-avatar]').forEach((button) => {
    const selected = button.dataset.avatar === playerAvatars[0];
    const artEl = button.querySelector('.avatar-choice-art'); if (artEl) artEl.innerHTML = window.FeltoraMascots.render(button.dataset.avatar);
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  document.querySelectorAll('[data-bot]').forEach((button) => {
    const botArtEl = button.querySelector('.bot-avatar-art'); if (botArtEl) botArtEl.innerHTML = window.FeltoraMascots.render(button.dataset.bot);
    const selected = button.dataset.bot === botMascot;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const selectedMascot = window.FeltoraMascots.resolve(playerAvatars[0]);
  document.getElementById('profile-mascot-title').textContent =
    `${selectedMascot.name} · ${selectedMascot.title}`;
}

function setCueStyle(style) {
  selectedCue = style;
  const palette = cuePalettes[style] || cuePalettes.wood;
  document.documentElement.style.setProperty('--cue-main', palette.main);
  document.documentElement.style.setProperty('--cue-dark', palette.dark);
  document.documentElement.style.setProperty('--cue-glow', palette.glow);
  document.querySelectorAll('[data-cue]').forEach((b) => b.classList.toggle('active', b.dataset.cue === style));
  if (window.FeltoraAuth && window.FeltoraAuth.currentUser()) window.FeltoraAuth.update({ cue: style });
  try { localStorage.setItem('feltora-cue', style); } catch {}
}

function setFelt(felt) {
  selectedFelt = felt;
  const p = feltPalettes[felt] || feltPalettes.green;
  const r = document.documentElement;
  r.style.setProperty('--felt-top',        p.top);
  r.style.setProperty('--felt-center',     p.center);
  r.style.setProperty('--felt-bottom',     p.bottom);
  r.style.setProperty('--cushion-top',     p.cushionTop);
  r.style.setProperty('--cushion-center',  p.cushionCenter);
  r.style.setProperty('--cushion-bottom',  p.cushionBottom);
  updateTableColors();
  document.querySelectorAll('[data-felt]').forEach((b) => b.classList.toggle('active', b.dataset.felt === felt));
  try { localStorage.setItem('feltora-felt', felt); } catch {}
}

function toggle3D() {
  view3d = !view3d;
  const shell = document.querySelector('.table-shell');
  const btn   = document.getElementById('toggle-3d');
  if (view3d) {
    shell.style.transition = 'transform 0.55s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.55s ease, filter 0.55s ease';
    shell.style.transform  = 'perspective(1000px) rotateX(28deg) rotateY(-2deg) scale(1.04)';
    shell.style.boxShadow  = '0 40px 80px rgba(0,0,0,0.75), 0 20px 40px rgba(0,0,0,0.5), 0 0 0 2px rgba(245,200,66,0.3)';
    shell.style.filter     = 'drop-shadow(0 20px 28px rgba(0,0,0,0.55))';
    shell.style.borderRadius = '14px';
  } else {
    shell.style.transition = 'transform 0.4s cubic-bezier(0.22,1,0.36,1), box-shadow 0.4s ease, filter 0.4s ease';
    shell.style.transform  = '';
    shell.style.boxShadow  = '';
    shell.style.filter     = '';
    shell.style.borderRadius = '';
  }
  shell.classList.toggle('view-3d', view3d);
  btn.setAttribute('aria-pressed', String(view3d));
  btn.classList.toggle('active', view3d);
}

function updateTableColors() {
  const styles = getComputedStyle(document.documentElement);
  for (const name of [
    '--wood-highlight', '--wood-upper', '--wood-center', '--wood-lower', '--wood-shadow',
    '--cushion-top', '--cushion-center', '--cushion-bottom',
    '--felt-top', '--felt-center', '--felt-bottom'
  ]) {
    tableColors[name] = styles.getPropertyValue(name).trim();
  }
  // map new token names to legacy canvas keys
  tableColors['--accent-2'] = styles.getPropertyValue('--gold').trim();
  tableColors['--accent-3'] = styles.getPropertyValue('--gold').trim();
}

function saveAudioSettings() {
  try {
    localStorage.setItem('feltora-audio', JSON.stringify({
      ...audioSettings,
      muted: document.getElementById('master-mute').checked
    }));
  } catch (error) {
    console.warn('Audio settings could not be saved.', error);
  }
}

function updateAudioMix() {
  if (!audioContext || !masterGain) return;
  const now = audioContext.currentTime;
  masterGain.gain.setTargetAtTime(
    document.getElementById('master-mute').checked ? 0 : audioSettings.master,
    now,
    0.035
  );
  if (musicBus) musicBus.gain.setTargetAtTime(audioSettings.music, now, 0.035);
  if (effectsBus) effectsBus.gain.setTargetAtTime(audioSettings.effects, now, 0.025);
}

async function ensureAudio() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return false;
  audioContext ||= new AudioContextClass();
  if (!masterGain) {
    masterGain = audioContext.createGain();
    musicBus = audioContext.createGain();
    effectsBus = audioContext.createGain();
    musicBus.connect(masterGain);
    effectsBus.connect(masterGain);
    masterGain.connect(audioContext.destination);
    updateAudioMix();
  }
  await audioContext.resume();
  return true;
}

function playPluck(frequency, startAt, volume, destination, duration = 1.4) {
  if (!audioContext || !destination) return;
  const partials = [
    { ratio: 1, level: 1 },
    { ratio: 2.01, level: 0.22 },
    { ratio: 3.98, level: 0.055 }
  ];
  for (const partial of partials) {
    const oscillator = audioContext.createOscillator();
    const envelope = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency * partial.ratio, startAt);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2200, startAt);
    envelope.gain.setValueAtTime(0.0001, startAt);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume * partial.level), startAt + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(filter);
    filter.connect(envelope);
    envelope.connect(destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.03);
    oscillator.addEventListener('ended', () => {
      oscillator.disconnect();
      filter.disconnect();
      envelope.disconnect();
    }, { once: true });
  }
}

function playNoiseBurst(startAt, duration, volume, filterFrequency, destination) {
  if (!audioContext || !destination) return;
  const frameCount = Math.ceil(audioContext.sampleRate * duration);
  const buffer = audioContext.createBuffer(1, frameCount, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) data[i] = Math.random() * 2 - 1;
  const source = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const envelope = audioContext.createGain();
  source.buffer = buffer;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(filterFrequency, startAt);
  envelope.gain.setValueAtTime(volume, startAt);
  envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(destination);
  source.start(startAt);
  source.stop(startAt + duration);
  source.addEventListener('ended', () => {
    source.disconnect();
    filter.disconnect();
    envelope.disconnect();
  }, { once: true });
}

async function playGameSound(kind, strength = 1) {
  if (!sfxEnabled || document.getElementById('master-mute').checked) return;
  const timestamp = performance.now();
  const limits = { collision: 95, cushion: 95, pocket: 110, rolling: 165, menu: 85 };
  if (limits[kind] && timestamp - (lastSoundAt.get(kind) || 0) < limits[kind]) return;
  if ((kind === 'collision' || kind === 'cushion') && timestamp - lastImpactSoundAt < 55) return;
  const physicalSound = ['cue', 'collision', 'cushion', 'pocket', 'rolling'].includes(kind);
  while (recentPhysicalSounds.length && timestamp - recentPhysicalSounds[0] > 140) recentPhysicalSounds.shift();
  if (physicalSound && ['collision', 'cushion', 'rolling'].includes(kind) && recentPhysicalSounds.length >= 3) return;
  if (physicalSound) recentPhysicalSounds.push(timestamp);
  if (kind === 'collision' || kind === 'cushion') lastImpactSoundAt = timestamp;
  lastSoundAt.set(kind, timestamp);
  if (!await ensureAudio() || !effectsBus) return;
  const now = audioContext.currentTime;
  const level = Math.max(0.12, Math.min(1.3, strength));

  if (kind === 'cue') {
    playNoiseBurst(now, 0.045, (0.035 + 0.13 * level), 1800, effectsBus);
    playPluck(76 + level * 34, now, 0.035 + 0.075 * level, effectsBus, 0.14);
  } else if (kind === 'collision') {
    playNoiseBurst(now, 0.025, 0.012 + 0.045 * level, 3200, effectsBus);
    playPluck(390 + Math.random() * 170, now, 0.02 + 0.055 * level, effectsBus, 0.09);
  } else if (kind === 'cushion') {
    playNoiseBurst(now, 0.045, 0.018 + 0.05 * level, 1700, effectsBus);
    playPluck(155 + level * 85, now, 0.025 + 0.04 * level, effectsBus, 0.11);
  } else if (kind === 'pocket') {
    playNoiseBurst(now, 0.12, 0.035 + 0.04 * level, 720, effectsBus);
    playPluck(78, now, 0.035 + 0.035 * level, effectsBus, 0.2);
  } else if (kind === 'rolling') {
    playNoiseBurst(now, 0.105, 0.008 + 0.018 * level, 520, effectsBus);
  } else if (kind === 'menu') {
    playPluck(740, now, 0.035, effectsBus, 0.24);
  } else if (kind === 'victory') {
    [523.25, 659.25, 783.99].forEach((note, index) => {
      playPluck(note, now + index * 0.13, 0.11, effectsBus, 0.7);
    });
  } else if (kind === 'defeat') {
    [392, 311.13, 233.08].forEach((note, index) => {
      playPluck(note, now + index * 0.16, 0.085, effectsBus, 0.65);
    });
  }
}

function reportAudioFailure(error) {
  console.error('The audio engine could not play sound.', error);
  setMusicButtons('Audio unavailable', false);
}

function requestSound(kind, strength = 1) {
  void playGameSound(kind, strength).catch(reportAudioFailure);
}

function scheduleLoungeMeasure() {
  if (!musicEnabled || !audioContext || !musicBus) return;
  const chords = [
    [196, 246.94, 293.66, 369.99],
    [174.61, 220, 261.63, 329.63],
    [130.81, 196, 246.94, 293.66],
    [146.83, 220, 261.63, 329.63]
  ];
  const chord = chords[loungeMeasureIndex % chords.length];
  loungeMeasureIndex += 1;
  const start = audioContext.currentTime + 0.04;
  playPluck(chord[0] / 2, start, 0.038, musicBus, 1.5);
  chord.forEach((note, index) => {
    playPluck(note, start + index * 0.42, 0.035, musicBus, 1.2);
  });
}

async function startLoungeMusic() {
  if (musicEnabled || musicStarting || document.getElementById('master-mute').checked) return;
  musicStarting = true;
  if (!await ensureAudio()) {
    musicStarting = false;
    setMusicButtons('Lounge unavailable', false);
    return;
  }
  musicBus.gain.setTargetAtTime(audioSettings.music, audioContext.currentTime, 0.04);
  musicEnabled = true;
  musicStarting = false;
  scheduleLoungeMeasure();
  musicTimer = window.setInterval(scheduleLoungeMeasure, 2400);
  setMusicButtons('Lounge: On', true);
}

function stopLoungeMusic() {
  musicEnabled = false;
  window.clearInterval(musicTimer);
  musicTimer = null;
  if (audioContext && musicBus) musicBus.gain.setTargetAtTime(0, audioContext.currentTime, 0.04);
  setMusicButtons('Lounge: Off', false);
}

function setMusicButtons(label, enabled) {
  document.querySelectorAll('[data-music-toggle]').forEach((button) => {
    button.textContent = label;
    button.setAttribute('aria-pressed', String(enabled));
  });
}

function applyTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  document.body.dataset.theme = next;
  updateTableColors();
  try {
    localStorage.setItem('pool-theme', next);
  } catch (error) {
    console.warn('Theme preference could not be saved.', error);
  }
  const toggle = document.getElementById('theme-toggle');
  toggle.textContent = next === 'dark' ? 'Light' : 'Dark';
  document.documentElement.style.setProperty('color-scheme', next === 'dark' ? 'dark' : 'light');
}

function showScreen(screenName) {
  if (screenName !== 'game') {
    window.clearTimeout(botTimer);
    botTimer = null;
    if (state === 'bot') state = 'aim';
  }
  document.getElementById('auth-screen').classList.toggle('active', screenName === 'auth');
  document.getElementById('lobby-screen').classList.toggle('active', screenName === 'lobby');
  document.getElementById('game-screen').classList.toggle('active', screenName === 'game');
  document.getElementById('results-screen').classList.toggle('active', screenName === 'results');
  document.getElementById('community-screen').classList.toggle('active', screenName === 'community');
  if (screenName === 'game' || screenName === 'lobby') {
    setTimeout(() => typeof startTutorial === 'function' && startTutorial(false), 900);
  }
  const fab = document.getElementById('game-phone-fab');
  if (fab) fab.style.display = screenName === 'game' ? 'flex' : 'none';
}

function updatePlayerDisplay() {
  for (let i = 0; i < 2; i++) {
    const card = document.getElementById('player-card-' + i);
    const tag = card.querySelector('.player-tag');
    card.querySelector('.player-title').textContent = playerNames[i];
    const group = document.getElementById('group-' + i);
    const groupPill = document.getElementById('group-pill-' + i);
    const groupRemaining = document.getElementById('group-remaining-' + i);
    const ballRack = document.getElementById('player-ball-rack-' + i);
    const resultGroup = document.getElementById('result-group-' + i);
    const label = groups[i] ? (groups[i] === 'solid' ? 'Solids' : 'Stripes') : 'Open';
    const remainingBalls = groups[i]
      ? balls.filter((ball) => ball.on && grp(ball.n) === groups[i]).sort((a, b) => a.n - b.n)
      : [];
    const remaining = remainingBalls.length;
    group.textContent = label;
    groupRemaining.textContent = groups[i] ? `${remaining} left` : '';
    groupRemaining.hidden = !groups[i];
    groupPill.setAttribute(
      'aria-label',
      groups[i] ? `${label}, ${remaining} ${remaining === 1 ? 'ball' : 'balls'} remaining` : 'Group not assigned'
    );
    ballRack.replaceChildren();
    ballRack.setAttribute(
      'aria-label',
      groups[i] ? `${label}: ${remainingBalls.map((ball) => ball.n).join(', ') || 'no balls remaining'}` : 'No group assigned yet'
    );
    for (const ball of remainingBalls) {
      const marker = document.createElement('span');
      marker.className = `rack-ball${ball.n > 8 ? ' stripe' : ''}`;
      marker.dataset.number = String(ball.n);
      marker.style.setProperty('--ball-color', COL[ball.n > 8 ? ball.n - 8 : ball.n]);
      marker.textContent = String(ball.n);
      marker.setAttribute('aria-hidden', 'true');
      ballRack.append(marker);
    }
    resultGroup.textContent = label;
    card.classList.toggle('active', state !== 'over' && turn === i);
    tag.textContent = state === 'bot' && turn === i
      ? 'Choosing a shot'
      : state === 'rolling' && turn === i
      ? 'Shot in motion'
      : state === 'place' && turn === i
        ? extraShots > 0 ? `Cue in hand · ${extraShots} shots` : 'Cue ball in hand'
        : turn === i
          ? extraShots > 0
            ? `${extraShots} shot${extraShots > 1 ? 's' : ''} · ${Math.ceil(turnRemaining)}s`
            : `Playing now · ${Math.ceil(turnRemaining)}s`
          : 'Up next';
  }
}

function updateStatusText() {
  const status = document.getElementById('status');
  let text = msg || '';
  if (state === 'over') {
    text = `${playerNames[winner]} wins. ${msg}`;
  } else if (state === 'bot') {
    text = `${playerNames[turn]} is lining up a shot…`;
  } else if (state === 'place') {
    text = `${msg ? `${msg} ` : ''}${playerNames[turn]} has the cue ball in hand. Tap or drag to place it · ${Math.ceil(turnRemaining)}s.`;
  } else if (state === 'aim') {
    const target = groups[turn]
      ? `Target: ${groups[turn] === 'solid' ? 'solids' : 'stripes'}.`
      : 'Open table: hit any numbered ball except the 8.';
    const powerInstruction = isHorizontalPowerBar()
      ? 'drag right or pull up on the power control and release to shoot.'
      : 'pull up on the power control and release to shoot.';
    text = `${msg ? `${msg} ` : ''}${playerNames[turn]}’s turn · ${Math.ceil(turnRemaining)}s. ${target} Aim on the table, then ${powerInstruction}`;
  } else if (state === 'rolling') {
    text = 'Balls rolling…';
  }
  status.textContent = text;
  const powerBox = document.getElementById('power-box');
  const canShoot = state === 'aim' && !(botMode && turn === 1);
  const horizontalPowerBar = isHorizontalPowerBar();
  powerBox.hidden = false;
  powerBox.setAttribute('aria-disabled', String(!canShoot));
  powerBox.setAttribute('aria-orientation', horizontalPowerBar ? 'horizontal' : 'vertical');
  powerBox.setAttribute(
    'aria-label',
    horizontalPowerBar
      ? 'Shot power. Drag right or pull up to increase, release to shoot.'
      : 'Shot power. Pull up to increase, release to shoot.'
  );
  powerBox.tabIndex = canShoot ? 0 : -1;
  document.getElementById('power-hint').textContent = canShoot
    ? (horizontalPowerBar ? 'Drag → / ↑' : 'Pull up')
    : state === 'rolling'
      ? 'In motion'
      : state === 'bot'
        ? 'Bot turn'
        : state === 'place'
          ? 'Place cue'
          : 'Unavailable';
  updatePowerReadout();
}

function setPower(value) {
  const power = Math.max(0, Math.min(100, Math.round(value)));
  const slider = document.getElementById('pw');
  slider.value = String(power);
  const powerBox = document.getElementById('power-box');
  powerBox.setAttribute('aria-valuenow', String(power));
  powerBox.setAttribute('aria-valuetext', `${power}%`);
  const fill = document.getElementById('power-bar-fill');
  const horizontal = isHorizontalPowerBar();
  if (horizontal) {
    fill.style.width  = `${power}%`;
    fill.style.height = '100%';
  } else {
    fill.style.height = `${power}%`;
    fill.style.width  = '';
  }
  // colour zones
  let fillColor;
  if (power >= 100) {
    fillColor = 'linear-gradient(to top, #ff2200, #ff6600, #ffaa00, #ffee00)';
    fill.dataset.fire = 'true';
  } else if (power >= 80) {
    fillColor = 'linear-gradient(to top, #cc1100, #ff4400, #ff8800)';
    fill.dataset.fire = '';
  } else if (power >= 60) {
    fillColor = 'linear-gradient(to top, #cc5500, #ffaa00, #ffcc44)';
    fill.dataset.fire = '';
  } else if (power >= 40) {
    fillColor = 'linear-gradient(to top, #aa8800, #ddcc00, #ffee44)';
    fill.dataset.fire = '';
  } else if (power >= 20) {
    fillColor = 'linear-gradient(to top, #228844, #44cc66, #88ffaa)';
    fill.dataset.fire = '';
  } else {
    fillColor = 'linear-gradient(to top, #1a6644, #22aa66)';
    fill.dataset.fire = '';
  }
  fill.style.background = fillColor;
  document.getElementById('power-readout').textContent = `${power}%`;
}

function updatePowerReadout() {
  setPower(Number(document.getElementById('pw').value));
}

function showResults() {
  const localWon = winner === onlineLocalPlayer;
  const winnerName = playerNames[winner] || 'Player 1';
  const resultsScreen = document.getElementById('results-screen');
  resultsScreen.dataset.outcome = localWon ? 'win' : 'loss';
  document.getElementById('winner-name').textContent = localWon ? 'You win!' : 'So close!';
  for (let i = 0; i < 2; i++) {
    document.getElementById(`result-player-name-${i}`).textContent = playerNames[i];
    document.getElementById(`result-player-${i}`).classList.toggle('winner', winner === i);
  }
  updateAvatarDisplays();
  document.getElementById('results-badge').textContent = localWon ? 'Victory' : 'Frame lost';
  document.getElementById('results-outcome').textContent =
    localWon
      ? `You beat ${playerNames[1 - winner]}!`
      : `${winnerName} takes this frame. Rematch?`;
  document.getElementById('winner-summary').textContent = msg || `${winnerName} wins the frame.`;
  showScreen('results');
  requestSound(localWon ? 'victory' : 'defeat');
  // mark spot as full so other users can't join a finished game
  if (onlineMode && onlineRole === 'host' && window.FeltoraOnline) {
    window.FeltoraOnline.markSpotFull();
  }
  // confetti burst for winner
  if (localWon) {
    const panel = document.getElementById('results-screen');
    const colors = ['#f2c230','#2b5fc4','#d6382f','#6b3fa0','#f08a24','#2e9b5a','#16d69a'];
    for (let i = 0; i < 28; i++) {
      const el = document.createElement('div');
      el.className = 'confetti-piece';
      el.style.cssText = `left:${10+Math.random()*80}%;top:0;background:${colors[i%colors.length]};animation-delay:${Math.random()*0.8}s;animation-duration:${1.1+Math.random()*0.8}s`;
      panel.appendChild(el);
      setTimeout(() => el.remove(), 2200);
    }
  }
  // Record stats for the logged-in local player.
  if (window.FeltoraAuth && window.FeltoraAuth.currentUser()) {
    window.FeltoraAuth.recordResult(localWon);
    const acc = window.FeltoraAuth.getAccount(window.FeltoraAuth.currentUser());
    if (acc) {
      document.getElementById('stat-wins').textContent   = acc.stats.wins;
      document.getElementById('stat-losses').textContent = acc.stats.losses;
      document.getElementById('stat-frames').textContent = acc.stats.frames;
    }
  }

  // show share/save button only for winner
  const shareBtn = document.getElementById('btn-share-win');
  if (shareBtn) shareBtn.hidden = !localWon;
}

function ui() {
  updatePlayerDisplay();
  updateStatusText();
}

function newGame(options = {}) {
  const { openGame = true } = options;
  // reset rematch button state
  const rematchBtn = document.getElementById('rematch');
  if (rematchBtn) { rematchBtn.textContent = 'Rematch'; rematchBtn.disabled = false; }
  window.clearTimeout(botTimer);
  botTimer = null;
  balls = [{ n: 0, x: HEAD_STRING, y: TABLE_CENTER_Y, vx: 0, vy: 0, on: true }];
  cue = balls[0];
  // Rack: 8-ball fixed at centre (slot 4), one corner solid, one corner stripe, rest random
  function rackShuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
  const solids  = [1, 2, 3, 4, 5, 6, 7];
  const stripes = [9, 10, 11, 12, 13, 14, 15];
  rackShuffle(solids); rackShuffle(stripes);
  // slots: 0=apex, 4=centre(8), 14=back-corner, rest random mix
  const slots = new Array(15);
  slots[0]  = solids.pop();   // apex corner = solid
  slots[4]  = 8;              // centre always 8
  slots[14] = stripes.pop();  // back corner = stripe
  const rest = [...solids, ...stripes];
  rackShuffle(rest);
  let ri = 0;
  for (let i = 0; i < 15; i++) { if (slots[i] === undefined) slots[i] = rest[ri++]; }
  const rowDef = [1, 2, 3, 4, 5];
  let si = 0;
  rowDef.forEach((count, i) => {
    for (let j = 0; j < count; j++) {
      balls.push({ n: slots[si++], x: FOOT_SPOT + i * 17.7, y: TABLE_CENTER_Y + (j - (count - 1) / 2) * 20.4, vx: 0, vy: 0, on: true });
    }
  });
  state = 'aim';
  turn = 0;
  groups = [null, null];
  groupBallNumbers = [null, null];
  aim = 0;
  pocketed = [];
  msg = '';
  winner = -1;
  turnRemaining = 30;
  extraShots = 0;
  firstHit = null;
  eightBallReadyAtShot = false;
  aimPointerId = null;
  placePointerId = null;
  powerPointerId = null;
  powerPullStart = null;
  powerPullAxis = null;
  powerPointerActive = false;
  document.getElementById('power-box').classList.remove('power-charging');
  ptr = { x: HEAD_STRING, y: TABLE_CENTER_Y };
  setPower(50);
  if (openGame) showScreen('game');
  ui();
}

function sink(b) {
  const entrySpeed = Math.hypot(b.vx, b.vy);
  // snap to pocket center so ball can't bounce back
  for (const p of POCKETS) {
    if (Math.hypot(b.x - p[0], b.y - p[1]) < p[2]) {
      b.x = p[0]; b.y = p[1];
      break;
    }
  }
  b.on = false;
  b.vx = b.vy = 0;
  pocketed.push(b.n);
  requestSound('pocket', Math.min(1.2, entrySpeed / 12));
  if (b.n > 0) pocketedToasts.push({ n: b.n, x: b.x, y: b.y, born: performance.now() });
}

function physics() {
  const N = 6;
  for (let s = 0; s < N; s++) {
    for (const b of balls) {
      if (b.on) {
        b.x += b.vx / N;
        b.y += b.vy / N;
      }
    }
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (!a.on) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (!b.on) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 4 * BR * BR) continue;
        const d = Math.sqrt(d2);
        const nx = d > 1e-8 ? dx / d : 1;
        const ny = d > 1e-8 ? dy / d : 0;
        const ov = (2 * BR - d) / 2;
        a.x -= nx * ov;
        a.y -= ny * ov;
        b.x += nx * ov;
        b.y += ny * ov;
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) {
          if (a === cue || b === cue) {
            if (firstHit === null) firstHit = a === cue ? b : a;
          }
          if (Math.abs(rel) > 0.35) requestSound('collision', Math.min(1.3, Math.abs(rel) / 9));
          const imp = -(1 + BALL_BALL_RESTITUTION) * rel / 2;
          a.vx -= imp * nx;
          a.vy -= imp * ny;
          b.vx += imp * nx;
          b.vy += imp * ny;
        }
      }
    }
    for (const b of balls) {
      if (!b.on) continue;
      for (const p of POCKETS) {
        if (Math.hypot(b.x - p[0], b.y - p[1]) < p[2]) {
          sink(b);
          break;
        }
      }
      if (!b.on) continue;
      if (b.x < L + BR) {
        if (Math.abs(b.vx) > 0.6) requestSound('cushion', Math.min(1.3, Math.abs(b.vx) / 11));
        b.x = L + BR;
        b.vx = Math.abs(b.vx) * CUSHION_RESTITUTION;
      }
      if (b.x > R - BR) {
        if (Math.abs(b.vx) > 0.6) requestSound('cushion', Math.min(1.3, Math.abs(b.vx) / 11));
        b.x = R - BR;
        b.vx = -Math.abs(b.vx) * CUSHION_RESTITUTION;
      }
      if (b.y < T + BR) {
        if (Math.abs(b.vy) > 0.6) requestSound('cushion', Math.min(1.3, Math.abs(b.vy) / 11));
        b.y = T + BR;
        b.vy = Math.abs(b.vy) * CUSHION_RESTITUTION;
      }
      if (b.y > B - BR) {
        if (Math.abs(b.vy) > 0.6) requestSound('cushion', Math.min(1.3, Math.abs(b.vy) / 11));
        b.y = B - BR;
        b.vy = -Math.abs(b.vy) * CUSHION_RESTITUTION;
      }
    }
  }
  for (const b of balls) {
    if (!b.on) continue;
    const speed = Math.hypot(b.vx, b.vy);
    if (speed <= ROLLING_DECELERATION) {
      b.vx = b.vy = 0;
      continue;
    }
    const rollingFactor = (speed - ROLLING_DECELERATION) / speed;
    b.vx *= rollingFactor;
    b.vy *= rollingFactor;
  }
}

function endShot() {
  const p = pocketed;
  pocketed = [];
  const me = turn;
  const cueIn = p.includes(0);
  const obj = p.filter((n) => n > 0);
  const firstHitLegal = firstHit !== null && (
    groups[me]
      ? grp(firstHit.n) === groups[me] || (firstHit.n === 8 && eightBallReadyAtShot)
      : firstHit.n !== 8
  );
  const foul = cueIn || !firstHitLegal;
  msg = '';

  if (p.includes(8)) {
    const mine = groups[me];
    // check if all own group balls are now gone (including ones pocketed this shot)
    const left = mine ? balls.some((b) => b.on && b.n > 0 && b.n !== 8 && grp(b.n) === mine) : true;
    // also count balls pocketed THIS shot — if they cleared their last ball and 8 in same shot, that's legal
    const readyNow = eightBallReadyAtShot || (!left && !!mine);
    const win = !!mine && !left && !foul && readyNow;
    winner = win ? me : 1 - me;
    state = 'over';
    msg = win
      ? 'The 8-ball was legally pocketed. Victory.'
      : cueIn
        ? 'Scratch on the 8-ball. Instant loss.'
        : !firstHitLegal
          ? 'Foul: wrong ball hit first. Opponent wins.'
        : !mine || left
          ? 'The 8-ball was pocketed too early. Opponent wins.'
          : 'The 8-ball was not pocketed legally. Opponent wins.';
    ui();
    if (onlineMode && onlineRole === 'host') sendOnlineState();
    showResults();
    return;
  }

  if (!groups[me] && obj.length && !foul) {
    groups[me] = grp(obj[0]);
    groups[1 - me] = groups[me] === 'solid' ? 'stripes' : 'solid';
    groupBallNumbers[me] = obj[0];
    const oppGroup = groups[1 - me];
    const oppBall = balls.find((b) => b.on && grp(b.n) === oppGroup);
    if (oppBall) groupBallNumbers[1 - me] = oppBall.n;
    announceGameAction(`🎱 ${playerNames[me]}: ${groups[me] === 'solid' ? 'Solids' : 'Stripes'} — ${playerNames[1 - me]}: ${groups[1 - me] === 'solid' ? 'Solids' : 'Stripes'}`, 3500);
  } else if (!foul && groups[me] && groupBallNumbers[me] === null) {
    groupBallNumbers[me] = obj.find((n) => grp(n) === groups[me]) ?? null;
  }

  const own = !!groups[me] && obj.some((n) => grp(n) === groups[me]);
  const opponentBallPotted = !!groups[me] && obj.some((n) => grp(n) !== groups[me] && n !== 8);
  if (foul) {
    cue.on = true;
    cue.vx = cue.vy = 0;
    turn = 1 - me;
    extraShots = 2;
    state = 'place';
    msg = cueIn
      ? 'Scratch! Opponent gets 2 shots with cue ball in hand.'
      : firstHit === null
        ? 'Foul: cue ball missed everything. Opponent gets 2 shots.'
        : 'Foul: wrong group hit first. Opponent gets 2 shots.';
    announceGameAction('⚠ ' + msg + ' — tap the table to place it', 5000);
  } else if (own) {
    // potted own ball — consume one extra shot if active, keep turn
    if (extraShots > 0) extraShots--;
    state = 'aim';
    msg = opponentBallPotted
      ? "Nice pot. Opponent's ball stays pocketed. Shoot again."
      : 'Nice pot, shoot again.';
  } else {
    // missed or potted wrong group
    if (extraShots > 0) {
      extraShots--;
      state = 'aim';
      msg = extraShots > 0
        ? `${extraShots} shot${extraShots > 1 ? 's' : ''} remaining.`
        : 'Last extra shot used.';
    } else {
      turn = 1 - me;
      state = 'aim';
      msg = opponentBallPotted
        ? "Opponent's ball stays pocketed. Turn passes."
        : obj.length ? 'Wrong group potted.' : '';
    }
  }

  const nextTurn = groups[turn];
  if (state === 'aim' && nextTurn && !balls.some((b) => b.on && b.n > 0 && b.n !== 8 && grp(b.n) === nextTurn) && !msg) {
    msg = 'Only the 8-ball is left.';
  }

  aim = Math.atan2(TABLE_CENTER_Y - cue.y, FOOT_SPOT - cue.x);
  turnRemaining = 30;
  setPower(50);
  ui();
  if (onlineMode && onlineRole === 'host') sendOnlineState();
  scheduleBotTurn();
}

function shoot() {
  if (state !== 'aim') return;
  if (onlineMode && onlineRole === 'guest') {
    window.FeltoraOnline.send({ type: 'shoot', angle: aim, power: Number(document.getElementById('pw').value) });
    return;
  }
  const power = Number(document.getElementById('pw').value);
  if (power === 0) {
    msg = `Shot cancelled at 0% power. ${isHorizontalPowerBar() ? 'Drag right' : 'Pull up'} to set shot strength.`;
    ui();
    return;
  }
  const sp = 46 * (power / 100) ** 1.06;
  const group = groups[turn];
  eightBallReadyAtShot = !!group && !balls.some((b) => b.on && b.n !== 8 && b.n > 0 && grp(b.n) === group);
  firstHit = null;
  requestSound('cue', sp / 23);
  lastRollingSampleAt = performance.now();
  cue.vx = Math.cos(aim) * sp;
  cue.vy = Math.sin(aim) * sp;
  for (const ball of balls) {
    ball.renderX = ball.x;
    ball.renderY = ball.y;
  }
  acc = 0;
  pocketed = [];
  msg = '';
  aimPointerId = null;
  state = 'rolling';
  ui();
}

function isHorizontalPowerBar() {
  // portrait mobile uses horizontal bar
  return window.matchMedia('(max-width: 680px) and (orientation: portrait)').matches;
}

function updatePulledPower(clientX, clientY) {
  if (powerPullStart === null) return;
  const deltaX = clientX - powerPullStart.x;
  const deltaY = clientY - powerPullStart.y;
  if (powerPullAxis === null && Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= 4) {
    powerPullAxis = isHorizontalPowerBar() && Math.abs(deltaX) >= Math.abs(deltaY) ? 'x' : 'y';
  }
  if (powerPullAxis === 'x') {
    setPower(powerStartingValue + deltaX);
  } else if (powerPullAxis === 'y') {
    setPower(powerStartingValue - deltaY);
  } else {
    setPower(powerStartingValue);
  }
}

function segmentIsClear(start, end, ignoredBall) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (!lengthSquared) return true;
  return balls.every((ball) => {
    if (!ball.on || ball === ignoredBall || ball === cue) return true;
    const projection = Math.max(0, Math.min(1, ((ball.x - start.x) * dx + (ball.y - start.y) * dy) / lengthSquared));
    const nearestX = start.x + projection * dx;
    const nearestY = start.y + projection * dy;
    return Math.hypot(ball.x - nearestX, ball.y - nearestY) > BR * 2.15;
  });
}

function botTargets() {
  const group = groups[1];
  if (!group) return balls.filter((ball) => ball.on && ball !== cue && ball.n !== 8);
  const groupBalls = balls.filter((ball) => ball.on && ball !== cue && grp(ball.n) === group);
  return groupBalls.length ? groupBalls : balls.filter((ball) => ball.on && ball.n === 8);
}

function chooseBotShot() {
  const targets = botTargets();
  const candidates = [];
  for (const target of targets) {
    for (const pocket of POCKETS) {
      const pocketDirectionX = pocket[0] - target.x;
      const pocketDirectionY = pocket[1] - target.y;
      const pocketDistance = Math.hypot(pocketDirectionX, pocketDirectionY);
      if (pocketDistance < 1) continue;
      const unitX = pocketDirectionX / pocketDistance;
      const unitY = pocketDirectionY / pocketDistance;
      const ghost = {
        x: target.x - unitX * BR * 2,
        y: target.y - unitY * BR * 2
      };
      if (ghost.x < L + BR || ghost.x > R - BR || ghost.y < T + BR || ghost.y > B - BR) continue;
      const clearCuePath = segmentIsClear(cue, ghost, target);
      const clearPocketPath = segmentIsClear(target, pocket, target);
      const cueDistance = Math.hypot(ghost.x - cue.x, ghost.y - cue.y);
      const angle = Math.atan2(ghost.y - cue.y, ghost.x - cue.x);
      const score = cueDistance + pocketDistance * 0.38 + (clearCuePath ? 0 : 500) + (clearPocketPath ? 0 : 500);
      candidates.push({ angle, score, cueDistance, clearCuePath, clearPocketPath });
    }
  }
  if (!candidates.length) {
    const target = targets[0] || balls.find((ball) => ball.on && ball !== cue);
    if (!target) return { angle: aim, power: 50 };
    return {
      angle: Math.atan2(target.y - cue.y, target.x - cue.x),
      power: botDifficulty === 'easy' ? 45 : 55
    };
  }

  candidates.sort((a, b) => a.score - b.score);
  let candidate = candidates[0];
  if (botDifficulty === 'easy') {
    candidate = candidates[Math.floor(Math.random() * candidates.length)];
  } else if (botDifficulty === 'medium') {
    const viable = candidates.filter((shot) => shot.clearCuePath && shot.clearPocketPath).slice(0, 4);
    if (viable.length) candidate = viable[Math.floor(Math.random() * viable.length)];
  }

  const inaccuracy = botDifficulty === 'easy' ? 0.14 : botDifficulty === 'medium' ? 0.035 : 0.006;
  const power = botDifficulty === 'easy'
    ? 38 + Math.random() * 32
    : Math.max(42, Math.min(88, 48 + candidate.cueDistance * 0.08));
  return {
    angle: candidate.angle + (Math.random() * 2 - 1) * inaccuracy,
    power
  };
}

function placeBotCueBall() {
  let best = { x: HEAD_STRING, y: TABLE_CENTER_Y, clearance: -Infinity };
  for (let x = L + BR + 4; x <= R - BR - 4; x += 24) {
    for (let y = T + BR + 4; y <= B - BR - 4; y += 24) {
      if (!valid(x, y)) continue;
      const clearance = balls.reduce((nearest, ball) => (
        ball.on && ball !== cue ? Math.min(nearest, Math.hypot(ball.x - x, ball.y - y)) : nearest
      ), Infinity);
      if (clearance > best.clearance) best = { x, y, clearance };
    }
  }
  cue.x = best.x;
  cue.y = best.y;
  cue.on = true;
  cue.vx = cue.vy = 0;
  aim = Math.atan2(TABLE_CENTER_Y - cue.y, FOOT_SPOT - cue.x);
}

function scheduleBotTurn() {
  if (!botMode || turn !== 1 || !document.getElementById('game-screen').classList.contains('active')) return;
  if (state !== 'aim' && state !== 'place') return;
  window.clearTimeout(botTimer);
  const needsPlacement = state === 'place';
  state = 'bot';
  ui();
  botTimer = window.setTimeout(() => {
    botTimer = null;
    if (!botMode || turn !== 1 || state !== 'bot') return;
    if (!document.getElementById('game-screen').classList.contains('active')) return;
    if (needsPlacement) placeBotCueBall();
    const shot = chooseBotShot();
    aim = shot.angle;
    setPower(shot.power);
    state = 'aim';
    ui();
    shoot();
  }, botDifficulty === 'easy' ? 1100 : 850);
}

function ray() {
  const dx = Math.cos(aim), dy = Math.sin(aim);
  let t = 1e9, hit = null;
  for (const b of balls) {
    if (!b.on || b === cue) continue;
    const ox = b.x - cue.x;
    const oy = b.y - cue.y;
    const pr = ox * dx + oy * dy;
    if (pr <= 0) continue;
    const d2 = ox * ox + oy * oy - pr * pr;
    if (d2 >= 4 * BR * BR) continue;
    const tt = pr - Math.sqrt(4 * BR * BR - d2);
    if (tt < t) {
      t = tt;
      hit = b;
    }
  }
  const tx = dx > 0 ? (R - BR - cue.x) / dx : dx < 0 ? (L + BR - cue.x) / dx : 1e9;
  const ty = dy > 0 ? (B - BR - cue.y) / dy : dy < 0 ? (T + BR - cue.y) / dy : 1e9;
  const tw = Math.min(tx, ty);
  if (tw < t) {
    t = tw;
    hit = null;
  }
  return { t, hit, dx, dy };
}

function drawBall(b, x, y) {
  g.save();
  g.translate(x, y);
  // enhanced shadow — deeper offset when 3D view is active
  const shadowOffsetX = view3d ? 4 : 2;
  const shadowOffsetY = view3d ? 6 : 3;
  const shadowBlur   = view3d ? 8 : 4;
  g.fillStyle = view3d ? 'rgba(0,0,0,.45)' : 'rgba(0,0,0,.3)';
  g.beginPath();
  g.arc(shadowOffsetX, shadowOffsetY, BR + (view3d ? 1 : 0), 0, 7);
  g.fill();
  if (view3d) {
    // soft ambient shadow ring
    const sg = g.createRadialGradient(shadowOffsetX, shadowOffsetY, BR * 0.5, shadowOffsetX, shadowOffsetY, BR * 2);
    sg.addColorStop(0, 'rgba(0,0,0,0.25)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sg;
    g.beginPath();
    g.arc(shadowOffsetX, shadowOffsetY, BR * 2, 0, 7);
    g.fill();
  }
  g.beginPath();
  g.arc(0, 0, BR, 0, 7);
  g.clip();
  const c = b.n === 0 ? WHITE : COL[b.n > 8 ? b.n - 8 : b.n];
  g.fillStyle = b.n > 8 || b.n === 0 ? WHITE : c;
  g.fillRect(-BR, -BR, 2 * BR, 2 * BR);
  if (b.n > 8) {
    g.fillStyle = c;
    g.fillRect(-BR, -5, 2 * BR, 10);
  }
  if (b.n > 0) {
    g.fillStyle = WHITE;
    g.beginPath();
    g.arc(0, 0, 4.6, 0, 7);
    g.fill();
    g.fillStyle = '#111';
    g.font = 'bold 7px system-ui,sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(b.n, 0, 0.5);
  }
  g.fillStyle = 'rgba(255,255,255,.35)';
  g.beginPath();
  g.arc(-3, -3.5, 2.4, 0, 7);
  g.fill();
  g.restore();
}

function draw() {
  g.clearRect(0, 0, W, H);
  const color = (name) => tableColors[name];

  g.save();
  g.shadowColor = 'rgba(0,0,0,.48)';
  g.shadowBlur = 20;
  g.shadowOffsetY = 10;
  const wood = g.createLinearGradient(0, 8, 0, H - 8);
  wood.addColorStop(0, color('--wood-highlight'));
  wood.addColorStop(.22, color('--wood-upper'));
  wood.addColorStop(.52, color('--wood-center'));
  wood.addColorStop(.82, color('--wood-lower'));
  wood.addColorStop(1, color('--wood-shadow'));
  g.fillStyle = wood;
  g.beginPath();
  g.roundRect(8, 8, W - 16, H - 16, 26);
  g.fill();
  g.restore();

  g.strokeStyle = color('--accent-2');
  g.globalAlpha = document.documentElement.dataset.theme === 'light' ? .8 : .62;
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(16, 16, W - 32, H - 32, 21);
  g.stroke();
  g.globalAlpha = 1;

  const cushion = g.createLinearGradient(0, 36, 0, 464);
  cushion.addColorStop(0, color('--cushion-top'));
  cushion.addColorStop(.5, color('--cushion-center'));
  cushion.addColorStop(1, color('--cushion-bottom'));
  g.fillStyle = cushion;
  g.fillRect(36, 36, W - 72, H - 72);

  const felt = g.createLinearGradient(0, T, 0, B);
  felt.addColorStop(0, color('--felt-top'));
  felt.addColorStop(.45, color('--felt-center'));
  felt.addColorStop(1, color('--felt-bottom'));
  g.fillStyle = felt;
  g.fillRect(L, T, R - L, B - T);

  const sheen = g.createRadialGradient(445, 205, 20, 450, 250, 520);
  sheen.addColorStop(0, 'rgba(124,219,154,.09)');
  sheen.addColorStop(1, 'rgba(0,0,0,.16)');
  g.fillStyle = sheen;
  g.fillRect(L, T, R - L, B - T);

  g.strokeStyle = color('--accent-2');
  g.globalAlpha = document.documentElement.dataset.theme === 'light' ? .23 : .2;
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(HEAD_STRING, T);
  g.lineTo(HEAD_STRING, B);
  g.stroke();
  g.globalAlpha = 1;

  g.fillStyle = color('--accent-3');
  g.globalAlpha = document.documentElement.dataset.theme === 'light' ? .82 : .62;
  for (const x of [150, 250, 350, 550, 650, 750]) {
    for (const y of [42, 458]) {
      g.beginPath();
      g.arc(x, y, 2, 0, Math.PI * 2);
      g.fill();
    }
  }
  for (const y of [150, 250, 350]) {
    for (const x of [42, 858]) {
      g.beginPath();
      g.arc(x, y, 2, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  for (const p of POCKETS) {
    const pocket = g.createRadialGradient(p[0] - 3, p[1] - 4, 1, p[0], p[1], p[2]);
    pocket.addColorStop(0, '#030605');
    pocket.addColorStop(.72, '#080d0a');
    pocket.addColorStop(1, '#18231b');
    g.save();
    g.shadowColor = 'rgba(0,0,0,.5)';
    g.shadowBlur = 8;
    g.fillStyle = pocket;
    g.beginPath();
    g.arc(p[0], p[1], p[2] - 1, 0, Math.PI * 2);
    g.fill();
    g.restore();
    g.strokeStyle = color('--accent-2');
    g.globalAlpha = .5;
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(p[0], p[1], p[2] - 2, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 1;
  }

  const localTurn = onlineMode ? (onlineRole === 'host' ? 0 : 1) : turn;
  if (state === 'aim' && (!onlineMode || turn === localTurn)) {
    const palette = cuePalettes[selectedCue] || cuePalettes.wood;
    const r = ray();
    const myGroup = groups[turn];
    const liveEightReady = !!myGroup && !balls.some((b) => b.on && b.n !== 8 && b.n > 0 && grp(b.n) === myGroup);
    const hitIsLegal = !r.hit || (
      myGroup
        ? grp(r.hit.n) === myGroup || (r.hit.n === 8 && liveEightReady)
        : r.hit.n !== 8
    );

    // ── Ghost line: cue ball travel path ──────────────────────────
    const ghostX = cue.x + r.dx * r.t;
    const ghostY = cue.y + r.dy * r.t;
    const legalColor   = 'rgba(255,255,255,0.55)';
    const illegalColor = 'rgba(255,90,70,0.60)';
    const lineColor = hitIsLegal ? legalColor : illegalColor;

    g.save();
    // dashed travel line from cue ball to ghost position
    g.setLineDash([5, 7]);
    g.strokeStyle = lineColor;
    g.lineWidth = 1.4;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cue.x, cue.y);
    g.lineTo(ghostX, ghostY);
    g.stroke();
    g.setLineDash([]);

    // ghost cue ball circle at impact point
    g.strokeStyle = lineColor;
    g.lineWidth = 1.5;
    g.globalAlpha = 0.55;
    g.beginPath();
    g.arc(ghostX, ghostY, BR, 0, Math.PI * 2);
    g.stroke();
    // faint fill so ghost ball reads clearly
    g.fillStyle = hitIsLegal ? 'rgba(255,255,255,0.08)' : 'rgba(255,90,70,0.10)';
    g.fill();
    g.globalAlpha = 1;

    // ── Deflection line: where the object ball goes after impact ──
    if (r.hit) {
      const hx = r.hit.x - ghostX;
      const hy = r.hit.y - ghostY;
      const hl = Math.hypot(hx, hy) || 1;
      const deflectLen = 60;
      const deflectColor = hitIsLegal ? 'rgba(0,240,168,0.55)' : 'rgba(255,90,70,0.45)';
      g.setLineDash([4, 6]);
      g.strokeStyle = deflectColor;
      g.lineWidth = 1.3;
      g.beginPath();
      g.moveTo(r.hit.x, r.hit.y);
      g.lineTo(r.hit.x + hx / hl * deflectLen, r.hit.y + hy / hl * deflectLen);
      g.stroke();
      g.setLineDash([]);
      // small arrowhead at end of deflection line
      const ex = r.hit.x + hx / hl * deflectLen;
      const ey = r.hit.y + hy / hl * deflectLen;
      const ang = Math.atan2(hy, hx);
      g.fillStyle = deflectColor;
      g.beginPath();
      g.moveTo(ex, ey);
      g.lineTo(ex - Math.cos(ang - 0.4) * 7, ey - Math.sin(ang - 0.4) * 7);
      g.lineTo(ex - Math.cos(ang + 0.4) * 7, ey - Math.sin(ang + 0.4) * 7);
      g.closePath();
      g.fill();
    }
    g.restore();

    // ── Cue stick ─────────────────────────────────────────────────
    const pw = Number(document.getElementById('pw').value) / 100;
    const back = 16 + pw * 55;
    const sx = cue.x - Math.cos(aim) * back;
    const sy = cue.y - Math.sin(aim) * back;
    g.save();
    g.shadowColor = palette.glow;
    g.shadowBlur = 8;
    g.strokeStyle = palette.main;
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(sx, sy);
    g.lineTo(sx - Math.cos(aim) * 230, sy - Math.sin(aim) * 230);
    g.stroke();
    g.shadowBlur = 0;
    g.strokeStyle = palette.dark;
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(sx - Math.cos(aim) * 170, sy - Math.sin(aim) * 170);
    g.lineTo(sx - Math.cos(aim) * 230, sy - Math.sin(aim) * 230);
    g.stroke();
    g.restore();
  }

  const renderAlpha = state !== 'rolling' ? 1
    : onlineMode && onlineRole === 'guest' && remoteStateReceivedAt
      ? Math.min(1, (performance.now() - remoteStateReceivedAt) / remoteStateInterval)
      : Math.min(1, acc / PHYSICS_STEP);
  for (const b of balls) {
    if (!b.on) continue;
    const x = Number.isFinite(b.renderX) ? b.renderX + (b.x - b.renderX) * renderAlpha : b.x;
    const y = Number.isFinite(b.renderY) ? b.renderY + (b.y - b.renderY) * renderAlpha : b.y;
    drawBall(b, x, y);
  }

  if (state === 'place') {
    const ok = valid(cue.x, cue.y);
    g.strokeStyle = ok ? '#fff' : '#ff6b5e';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(cue.x, cue.y, BR + 4, 0, 7);
    g.stroke();
    if (!cue.on) drawBall(cue, cue.x, cue.y);
    // placement instruction drawn on canvas — visible on all screen sizes
    const label = 'TAP OR DRAG TO PLACE CUE BALL';
    g.save();
    g.font = 'bold 13px system-ui,sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const tw = g.measureText(label).width;
    const px = W / 2, py = B + 22;
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.beginPath();
    g.roundRect(px - tw / 2 - 10, py - 11, tw + 20, 22, 6);
    g.fill();
    g.fillStyle = ok ? '#00f0a8' : '#ff6b5e';
    g.fillText(label, px, py);
    g.restore();
  }

  // Pocketed ball toasts
  const now = performance.now();
  for (let i = pocketedToasts.length - 1; i >= 0; i--) {
    const toast = pocketedToasts[i];
    const age = now - toast.born;
    if (age > 1400) { pocketedToasts.splice(i, 1); continue; }
    const progress = age / 1400;
    const alpha = progress < 0.15 ? progress / 0.15 : progress > 0.7 ? 1 - (progress - 0.7) / 0.3 : 1;
    const rise = progress * 38;
    g.save();
    g.globalAlpha = alpha;
    drawBall({ n: toast.n }, toast.x, toast.y - rise);
    g.restore();
  }
}

function valid(x, y) {
  if (x < L + BR || x > R - BR || y < T + BR || y > B - BR) return false;
  return balls.every((b) => b === cue || !b.on || Math.hypot(b.x - x, b.y - y) >= 2 * BR);
}

function pos(e) {
  const r = cv.getBoundingClientRect();
  if (isPortraitMobile()) {
    const rotatedX = (e.clientX - r.left) / r.width;
    const rotatedY = (e.clientY - r.top) / r.height;
    return { x: rotatedY * W, y: (1 - rotatedX) * H };
  }
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
}

function isPortraitMobile() {
  return window.matchMedia('(max-width: 680px) and (orientation: portrait)').matches;
}

function track(e) {
  if (!document.getElementById('game-screen').classList.contains('active')) return;
  if (state !== 'aim' && state !== 'place') return;
  if (botMode && turn === 1) return;
  if (onlineMode && onlineRole === 'guest' && turn === 0) return; // guest can't control host's turn
  if (state === 'aim') {
    if (e.pointerId !== aimPointerId) return;
    ptr = pos(e);
    if (Math.hypot(ptr.x - cue.x, ptr.y - cue.y) >= 2 * BR) {
      aim = Math.atan2(ptr.y - cue.y, ptr.x - cue.x);
    }
    if (onlineMode) {
      window.FeltoraOnline.send({ type: 'aim', angle: aim });
    }
  } else if (state === 'place') {
    if (placePointerId !== null && e.pointerId !== placePointerId) return;
    ptr = pos(e);
    ptr.x = Math.max(L + BR, Math.min(R - BR, ptr.x));
    ptr.y = Math.max(T + BR, Math.min(B - BR, ptr.y));
    cue.x = ptr.x;
    cue.y = ptr.y;
    cue.on = true;
  }
}

cv.addEventListener('pointermove', track);
cv.addEventListener('pointerdown', (e) => {
  if (!document.getElementById('game-screen').classList.contains('active')) return;
  if (botMode && turn === 1) return;
  if (state === 'aim') aimPointerId = e.pointerId;
  else if (state === 'place') placePointerId = e.pointerId;
  else return;
  cv.setPointerCapture(e.pointerId);
  track(e);
});
cv.addEventListener('pointerup', (e) => {
  if (e.pointerId === aimPointerId) {
    track(e);
    aimPointerId = null;
  }
  if (e.pointerId === placePointerId) {
    track(e);
    placePointerId = null;
    if (valid(cue.x, cue.y)) {
      if (onlineMode && onlineRole === 'guest') {
        window.FeltoraOnline.send({ type: 'place', x: cue.x, y: cue.y });
      }
      state = 'aim';
      aim = Math.atan2(TABLE_CENTER_Y - cue.y, FOOT_SPOT - cue.x);
      msg = '';
      turnRemaining = 30;
    } else {
      msg = 'Choose an open spot on the table.';
    }
    ui();
  }
});
cv.addEventListener('pointercancel', (e) => {
  if (e.pointerId === aimPointerId) aimPointerId = null;
  if (e.pointerId === placePointerId) placePointerId = null;
});

const powerBox = document.getElementById('power-box');
powerBox.addEventListener('pointerdown', (event) => {
  if (state !== 'aim' || (botMode && turn === 1)) return;
  event.preventDefault();
  powerPointerActive = true;
  powerPointerId = event.pointerId;
  powerPullStart = { x: event.clientX, y: event.clientY };
  powerStartingValue = Number(document.getElementById('pw').value);
  powerPullAxis = null;
  powerBox.classList.add('power-charging');
  powerBox.setPointerCapture(event.pointerId);
});
powerBox.addEventListener('pointermove', (event) => {
  if (powerPointerActive && event.pointerId === powerPointerId) {
    updatePulledPower(event.clientX, event.clientY);
  }
});
powerBox.addEventListener('pointerup', (event) => {
  if (!powerPointerActive || event.pointerId !== powerPointerId) return;
  updatePulledPower(event.clientX, event.clientY);
  powerPointerActive = false;
  powerPointerId = null;
  powerPullStart = null;
  powerPullAxis = null;
  powerBox.classList.remove('power-charging');
  if (state === 'aim' && !(botMode && turn === 1)) shoot();
});
powerBox.addEventListener('pointercancel', (event) => {
  if (event.pointerId !== powerPointerId) return;
  powerPointerActive = false;
  powerPointerId = null;
  powerPullStart = null;
  powerPullAxis = null;
  powerBox.classList.remove('power-charging');
});

document.getElementById('back-to-lobby').addEventListener('click', () => {
  if (onlineMode) {
    window.FeltoraOnline.destroy();
    onlineMode = false;
    restoreLocalOnlineIdentity();
    onlineRole = null;
    document.getElementById('voice-toggle-btn').hidden = true;
    updateLobbyForOnline(false);
  }
  showScreen('lobby');
});
document.getElementById('results-lobby').addEventListener('click', () => {
  if (onlineMode) {
    window.FeltoraOnline.destroy();
    onlineMode = false;
    restoreLocalOnlineIdentity();
    onlineRole = null;
    document.getElementById('voice-toggle-btn').hidden = true;
    updateLobbyForOnline(false);
  }
  showScreen('lobby');
});
document.getElementById('rematch').addEventListener('click', () => {
  if (onlineMode) {
    if (onlineRole === 'host') {
      // host initiates rematch — send signal then start
      window.FeltoraOnline.send({ type: 'rematch' });
      newGame();
      sendOnlineState();
    } else {
      // guest requests rematch — send signal with name, wait for host to start
      window.FeltoraOnline.send({ type: 'rematch-request', name: playerNames[onlineLocalPlayer] });
      document.getElementById('rematch').textContent = 'Waiting for host…';
      document.getElementById('rematch').disabled = true;
      // timeout: re-enable after 30s if host doesn't respond
      setTimeout(() => {
        const btn = document.getElementById('rematch');
        if (btn.disabled && btn.textContent === 'Waiting for host…') {
          btn.textContent = 'Rematch';
          btn.disabled = false;
        }
      }, 30000);
    }
  } else {
    newGame();
  }
});
function adjustAim(direction) {
  if (state !== 'aim') return;
  aim += direction * 0.04;
}

document.getElementById('aim-left').addEventListener('click', () => adjustAim(-1));
document.getElementById('aim-right').addEventListener('click', () => adjustAim(1));

const gameTools = document.querySelector('.game-tools');
const focusViewButton = document.getElementById('focus-view-btn');
const gameFeedback = document.getElementById('game-feedback');
let gameFeedbackTimer = 0;

function announceGameAction(message, duration = 2400) {
  window.clearTimeout(gameFeedbackTimer);
  gameFeedback.textContent = message;
  gameFeedback.classList.add('visible');
  gameFeedbackTimer = window.setTimeout(() => {
    gameFeedback.classList.remove('visible');
    gameFeedback.textContent = '';
  }, duration);
}

focusViewButton.addEventListener('click', () => {
  const enabled = focusViewButton.getAttribute('aria-pressed') !== 'true';
  document.getElementById('game-screen').classList.toggle('focus-layout', enabled);
  focusViewButton.setAttribute('aria-pressed', String(enabled));
  gameTools.open = false;
});

document.getElementById('snapshot-btn').addEventListener('click', async () => {
  try {
    const blob = await new Promise((resolve, reject) => {
      cv.toBlob((image) => {
        if (image) resolve(image);
        else reject(new Error('The browser returned an empty image.'));
      }, 'image/png');
    });
    const fileName = `feltora-table-${Date.now()}.png`;
    const file = typeof File === 'function' ? new File([blob], fileName, { type: 'image/png' }) : null;
    if (file && typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'FELTORA table' });
        announceGameAction('Table image ready to save or share.');
        gameTools.open = false;
        return;
      } catch (error) {
        if (error?.name === 'AbortError') {
          gameTools.open = false;
          return;
        }
        console.warn('Native image sharing failed; opening the image instead.', error);
      }
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.target = '_blank';
    link.rel = 'noopener';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    announceGameAction('Table image opened or downloaded.');
  } catch (error) {
    if (error?.name === 'AbortError') {
      gameTools.open = false;
      return;
    }
    console.warn('Table snapshot could not be saved or shared.', error);
    announceGameAction('Could not save the table image.');
  }
  gameTools.open = false;
});

function updateProfileName(value) {
  const cleanName = value.trim().replace(/\s+/g, ' ').slice(0, 18);
  if (!cleanName) return;
  playerNames[0] = cleanName;
  document.getElementById('profile-name').textContent = cleanName;
  document.getElementById('room-player-name').textContent = cleanName;
  document.querySelector('#player-card-0 .player-title').textContent = cleanName;
  try {
    localStorage.setItem('feltora-display-name', cleanName);
  } catch (error) {
    console.warn('Display name could not be saved.', error);
  }
  ui();
}

const displayNameInput = document.getElementById('display-name');
displayNameInput.addEventListener('input', () => {
  const cleaned = displayNameInput.value.trim().replace(/\s+/g, ' ').slice(0, 18);
  if (cleaned) updateProfileName(cleaned);
});

const profileTabs = [...document.querySelectorAll('[data-profile-tab]')];
const activateProfileTab = (tab, focus = false) => {
  const selectedTab = tab.dataset.profileTab;
  profileTabs.forEach((item) => {
    const selected = item === tab;
    item.classList.toggle('active', selected);
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
  });
  document.querySelectorAll('[data-profile-pane]').forEach((pane) => {
    pane.hidden = pane.dataset.profilePane !== selectedTab;
  });
  if (focus) tab.focus();
};

profileTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => activateProfileTab(tab));
  tab.addEventListener('keydown', (event) => {
    let nextIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % profileTabs.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + profileTabs.length) % profileTabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = profileTabs.length - 1;
    else return;
    event.preventDefault();
    activateProfileTab(profileTabs[nextIndex], true);
  });
});

document.getElementById('theme-toggle').addEventListener('click', () => {
  const current = document.body.dataset.theme === 'dark' ? 'dark' : 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
});
powerBox.addEventListener('keydown', (event) => {
  if (state !== 'aim' || (botMode && turn === 1)) return;
  if (['ArrowLeft', 'ArrowDown'].includes(event.key)) {
    event.preventDefault();
    setPower(Number(document.getElementById('pw').value) - 5);
  } else if (['ArrowRight', 'ArrowUp'].includes(event.key)) {
    event.preventDefault();
    setPower(Number(document.getElementById('pw').value) + 5);
  } else if (event.key === 'Home') {
    event.preventDefault();
    setPower(0);
  } else if (event.key === 'End') {
    event.preventDefault();
    setPower(100);
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    shoot();
  }
});

document.querySelectorAll('[data-cue]').forEach((button) => {
  button.addEventListener('click', () => setCueStyle(button.dataset.cue));
});

document.querySelectorAll('[data-felt]').forEach((button) => {
  button.addEventListener('click', () => setFelt(button.dataset.felt));
});

document.getElementById('toggle-3d').addEventListener('click', toggle3D);

document.querySelectorAll('[data-avatar]').forEach((button) => {
  button.addEventListener('click', () => setProfileAvatar(button.dataset.avatar));
});

document.querySelectorAll('[data-bot]').forEach((button) => {
  button.addEventListener('click', () => {
    botMascot = window.FeltoraMascots.resolve(button.dataset.bot).id;
    updateAvatarDisplays();
  });
});

document.getElementById('play-bot').addEventListener('click', (event) => {
  const cfg    = document.getElementById('bot-config');
  const onCfg  = document.getElementById('online-config');
  onCfg.hidden = true;
  document.getElementById('play-online').setAttribute('aria-expanded', 'false');
  cfg.hidden = !cfg.hidden;
  event.currentTarget.setAttribute('aria-expanded', String(!cfg.hidden));
});

function updateLobbyOpponent() {
  const secondSeat = document.querySelectorAll('.room-seat')[1];
  const name  = secondSeat.querySelector('.seat-copy strong');
  const note  = secondSeat.querySelector('.seat-copy small');
  const badge = secondSeat.querySelector('.seat-badge');
  const roomNote = document.querySelector('.room-note');
  document.getElementById('mode-label').textContent = onlineMode ? 'Online' : botMode ? 'Vs bot' : 'Online';
  if (botMode) {
    const mascot = window.FeltoraMascots.resolve(botMascot);
    name.textContent  = `${mascot.name} (Bot)`;
    note.textContent  = `${botDifficulty[0].toUpperCase()}${botDifficulty.slice(1)} AI · Ready`;
    badge.textContent = 'AI';
    badge.classList.remove('open');
    roomNote.textContent = `${mascot.name} plays against you at ${botDifficulty} difficulty.`;
  } else {
    name.textContent  = 'Waiting…';
    note.textContent  = 'No opponent yet';
    badge.textContent = 'OPEN';
    badge.classList.add('open');
    roomNote.textContent = 'Create or join a spot to play online.';
  }
}

document.getElementById('start-bot-match').addEventListener('click', () => {
  botDifficulty = document.getElementById('bot-difficulty').value;
  const mascot = window.FeltoraMascots.resolve(botMascot);
  botMode = true;
  onlineMode = false;
  playerNames[1] = `${mascot.name} · ${botDifficulty[0].toUpperCase()}${botDifficulty.slice(1)} Bot`;
  playerAvatars[1] = mascot.id;
  document.getElementById('voice-toggle-btn').hidden = true;
  updateLobbyOpponent();
  updateAvatarDisplays();
  newGame();
});

// ── Online lobby UI ──────────────────────────────────────────────
function updateLobbyForOnline(online, code) {
  const dot  = document.getElementById('presence-dot');
  const text = document.getElementById('room-state-text');
  const note = document.querySelector('.room-note');
  if (online) {
    dot.style.background = '#22cc66';
    text.textContent = 'ONLINE';
    note.textContent = code ? `Spot code: ${code}` : 'Connected online.';
  } else {
    dot.style.removeProperty('background');
    text.textContent = 'WAITING';
    note.textContent = 'Create or join a spot to play online.';
  }
}

function setOnlineSeat(name, avatar) {
  document.getElementById('seat-1-name').textContent = name;
  document.getElementById('seat-1-note').textContent = 'Online · Ready';
  document.getElementById('seat-1-badge').textContent = 'ONLINE';
  document.getElementById('seat-1-badge').classList.remove('open');
  const avatarEl = document.getElementById('seat-1-avatar');
  avatarEl.innerHTML = window.FeltoraMascots.render(avatar);
  avatarEl.classList.remove('guest');
}

// Online tab switching
let spotsPollingTimer = null;

function applySpotsList(spots) {
  const list = document.getElementById('live-spots-list');
  if (!list) return;
  const registryAvailable = window.FeltoraOnline?.isSpotRegistryAvailable?.() !== false;
  const header = document.createElement('div');
  header.className = 'spots-header';
  const dot = document.createElement('span');
  dot.className = `spots-live-dot${registryAvailable ? '' : ' unavailable'}`;
  dot.title = registryAvailable ? 'Live' : 'Spot discovery unavailable';
  const hint = document.createElement('span');
  hint.className = 'online-hint';
  hint.style.margin = '0';
  header.append(dot, hint);
  list.replaceChildren(header);
  if (!spots || !spots.length) {
    hint.textContent = registryAvailable
      ? 'No open spots yet — ask a friend to create one'
      : 'Live spot discovery is unavailable. Ask your friend for the six-character room code.';
    return;
  }

  hint.classList.add('mini-label');
  hint.textContent = registryAvailable
    ? `${spots.length} open spot${spots.length !== 1 ? 's' : ''}`
    : 'Saved spots on this device only · cross-device discovery unavailable';
  for (const spot of spots) {
    const button = document.createElement('button');
    button.className = 'spot-card';
    button.type = 'button';
    button.dataset.spotCode = String(spot.code || '');
    const avatar = document.createElement('span');
    avatar.className = 'spot-card-avatar';
    if (window.FeltoraMascots) avatar.innerHTML = window.FeltoraMascots.render(spot.avatar);
    const info = document.createElement('span');
    info.className = 'spot-card-info';
    const name = document.createElement('strong');
    name.textContent = String(spot.name || 'Player');
    const note = document.createElement('small');
    note.textContent = 'Waiting for opponent · tap to join';
    info.append(name, note);
    const join = document.createElement('span');
    join.className = 'spot-card-join';
    join.textContent = 'Join →';
    button.append(avatar, info, join);
    list.append(button);
  }
  list.querySelectorAll('[data-spot-code]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.getElementById('join-code-input').value = btn.dataset.spotCode;
      document.getElementById('join-code-input').focus();
    });
  });
}

function startSpotsPolling() {
  stopSpotsPolling();
  const list = document.getElementById('live-spots-list');
  if (list) list.innerHTML = '<div class="spots-header"><span class="spots-live-dot"></span><span class="online-hint" style="margin:0">Scanning…</span></div>';
  // try real-time SSE first
  if (window.FeltoraOnline && window.FeltoraOnline.subscribeSpots) {
    window.FeltoraOnline.subscribeSpots(applySpotsList);
  }
  // also do an immediate fetch + poll every 4s as fallback
  renderOpenSpots();
  spotsPollingTimer = setInterval(renderOpenSpots, 4000);
}

function stopSpotsPolling() {
  if (spotsPollingTimer !== null) { clearInterval(spotsPollingTimer); spotsPollingTimer = null; }
  if (window.FeltoraOnline && window.FeltoraOnline.unsubscribeSpots) {
    window.FeltoraOnline.unsubscribeSpots();
  }
}

document.getElementById('tab-host').addEventListener('click', () => {
  document.getElementById('tab-host').classList.add('active');
  document.getElementById('tab-join').classList.remove('active');
  document.getElementById('online-host-panel').hidden = false;
  document.getElementById('online-join-panel').hidden = true;
  stopSpotsPolling();
});

document.getElementById('tab-join').addEventListener('click', () => {
  document.getElementById('tab-join').classList.add('active');
  document.getElementById('tab-host').classList.remove('active');
  document.getElementById('online-join-panel').hidden = false;
  document.getElementById('online-host-panel').hidden = true;
  startSpotsPolling();
});

function renderOpenSpots() {
  const list = document.getElementById('live-spots-list');
  if (!list) return;
  const dot = '<span class="spots-live-dot" title="Live"></span>';
  // show scanning state immediately while fetch is in flight
  if (!list.querySelector('.spot-card')) {
    list.innerHTML = `<div class="spots-header">${dot}<span class="online-hint" style="margin:0">Scanning…</span></div>`;
  }
  const spotsPromise = window.FeltoraOnline ? window.FeltoraOnline.getOpenSpots() : Promise.resolve([]);
  Promise.resolve(spotsPromise).then((spots) => {
    if (!list.isConnected) return;
    applySpotsList(spots);
  }).catch(() => {
    list.innerHTML = `<div class="spots-header">${dot}<span class="online-hint" style="margin:0">Could not reach server — enter code manually below</span></div>`;
  });
}

document.getElementById('play-online').addEventListener('click', () => {
  const cfg = document.getElementById('online-config');
  const botCfg = document.getElementById('bot-config');
  botCfg.hidden = true;
  document.getElementById('play-bot').setAttribute('aria-expanded', 'false');
  cfg.hidden = !cfg.hidden;
  document.getElementById('play-online').setAttribute('aria-expanded', String(!cfg.hidden));
  // stop polling if panel is being closed
  if (cfg.hidden) stopSpotsPolling();
});

document.getElementById('btn-create-room').addEventListener('click', () => {
  const btn = document.getElementById('btn-create-room');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Creating…';

  window._feltoraLocalName   = playerNames[0];
  window._feltoraLocalAvatar = playerAvatars[0];

  window.FeltoraOnline.host(
    (code) => {
      btn.disabled = false;
      btn.querySelector('span').textContent = 'Create Spot';
      document.getElementById('room-code-value').textContent = code;
      document.getElementById('room-code-display').hidden = false;
      document.getElementById('host-status').textContent = 'Spot open — waiting for opponent…';
      // hide tabs so host can't accidentally switch to the join panel
      document.getElementById('online-tabs').hidden = true;
      // populate spot card with host identity
      document.getElementById('spot-host-name').textContent = playerNames[0];
      document.getElementById('spot-host-avatar').innerHTML = window.FeltoraMascots.render(playerAvatars[0]);
      updateLobbyForOnline(true, code);
    },
    (peerName, peerAvatar) => {
      document.getElementById('host-status').textContent = `${peerName} joined! Starting…`;
      setOnlineSeat(peerName, peerAvatar);
      onlineMode = true;
      onlineRole = 'host';
      onlineLocalPlayer = 0;
      botMode = false;
      playerNames[1] = peerName;
      playerAvatars[1] = peerAvatar;
      updateAvatarDisplays();
      setTimeout(() => {
        window.FeltoraOnline.send({ type: 'start-game' });
        startOnlineGame();
      }, 600);
    },
    () => handlePeerLeft(),
    (m) => handleOnlineMsg(m)
  );
});

document.getElementById('btn-copy-code').addEventListener('click', () => {
  const code = document.getElementById('room-code-value').textContent;
  navigator.clipboard.writeText(code).catch(() => {});
  const btn = document.getElementById('btn-copy-code');
  btn.textContent = '✔';
  setTimeout(() => { btn.textContent = '⎘'; }, 1500);
});

document.getElementById('btn-cancel-spot').addEventListener('click', () => {
  window.FeltoraOnline.destroy();
  onlineMode = false;
  onlineRole = null;
  updateLobbyForOnline(false);
  // restore the host panel to initial state
  document.getElementById('room-code-display').hidden = true;
  document.getElementById('online-tabs').hidden = false;
  document.getElementById('host-status').textContent = 'Waiting for opponent to join…';
  const createBtn = document.getElementById('btn-create-room');
  createBtn.disabled = false;
  createBtn.querySelector('span').textContent = 'Create Spot';
});

document.getElementById('btn-join-room').addEventListener('click', () => {
  const code = document.getElementById('join-code-input').value.trim().toUpperCase();
  const errEl = document.getElementById('join-error');
  errEl.hidden = true;
  if (code.length !== 6) {
    errEl.textContent = 'Enter the full 6-character code.';
    errEl.hidden = false;
    return;
  }
  const btn = document.getElementById('btn-join-room');
  btn.disabled = true;
  const statusEl = document.getElementById('join-status');
  statusEl.textContent = 'Connecting…';
  statusEl.hidden = false;

  window._feltoraLocalName   = playerNames[0];
  window._feltoraLocalAvatar = playerAvatars[0];

  window.FeltoraOnline.join(
    code,
    (errMsg) => {
      if (errMsg && errMsg.startsWith('error:')) {
        btn.disabled = false;
        statusEl.hidden = true;
        const reason = errMsg.slice('error:'.length);
        errEl.textContent = reason === 'peer-unavailable'
          ? 'That spot is no longer reachable. Ask the host to create a fresh spot, then refresh this list.'
          : ['timeout', 'connection-closed', 'webrtc'].includes(reason)
            ? 'Connection timed out. The spot may be stale, or this network may block WebRTC. Keep both game pages open and try again on another network.'
            : 'Could not connect to that spot. Check the code and network, then try again.';
        errEl.hidden = false;
        return;
      }
      statusEl.textContent = 'Connected! Waiting for host…';
    },
    (peerName, peerAvatar) => {
      // host identity received — show who we're joining
      btn.disabled = false;
      statusEl.textContent = `Joining ${peerName}'s spot…`;
      setOnlineSeat(peerName, peerAvatar);
      updateLobbyForOnline(true, code);
      onlineMode = true;
      onlineRole = 'guest';
      onlineLocalPlayer = 1;
      botMode = false;
      const localName = playerNames[0];
      const localAvatar = playerAvatars[0];
      // Both screens use the host's authoritative player indexes.
      playerNames[0] = peerName;
      playerAvatars[0] = peerAvatar;
      playerNames[1] = localName;
      playerAvatars[1] = localAvatar;
      updateAvatarDisplays();
    },
    () => handlePeerLeft(),
    (m) => handleOnlineMsg(m)
  );
});

document.getElementById('join-code-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-join-room').click();
});

function startOnlineGame() {
  stopSpotsPolling();
  remoteStateReceivedAt = 0;
  remoteStateInterval = 1000 / 20;
  newGame();
  document.getElementById('voice-toggle-btn').hidden = false;
  window.FeltoraOnline.updateVoiceUI();
  if (onlineRole === 'host') sendOnlineState();
  // graceful reconnect handling
  window.FeltoraOnline.onConnectionLost(() => {
    if (!onlineMode) return;
    showReconnectBanner(true);
  });
  window.FeltoraOnline.onConnectionRestored(() => {
    showReconnectBanner(false);
    // host re-syncs state so guest catches up
    if (onlineRole === 'host') sendOnlineState();
  });
}

function restoreLocalOnlineIdentity() {
  if (onlineLocalPlayer === 1) {
    [playerNames[0], playerNames[1]] = [playerNames[1], playerNames[0]];
    [playerAvatars[0], playerAvatars[1]] = [playerAvatars[1], playerAvatars[0]];
    updateAvatarDisplays();
  }
  onlineLocalPlayer = 0;
}

function showReconnectBanner(show) {
  let banner = document.getElementById('reconnect-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'reconnect-banner';
    banner.setAttribute('role', 'alert');
    banner.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:9999',
      'background:rgba(10,14,12,0.96)', 'color:#f5c842',
      'font:700 0.85rem/1 system-ui,sans-serif',
      'text-align:center', 'padding:14px 16px',
      'border-bottom:1px solid rgba(245,200,66,0.4)',
      'backdrop-filter:blur(8px)',
      'transition:transform 0.25s cubic-bezier(0.22,1,0.36,1)',
      'transform:translateY(-100%)',
    ].join(';');
    banner.textContent = '⚠ Connection interrupted — reconnecting…';
    document.body.prepend(banner);
  }
  requestAnimationFrame(() => {
    banner.style.transform = show ? 'translateY(0)' : 'translateY(-100%)';
  });
}

function handlePeerLeft() {
  window.FeltoraOnline.destroy();
  document.getElementById('voice-toggle-btn').hidden = true;
  if (document.getElementById('game-screen').classList.contains('active')) {
    // opponent left mid-game — local player wins by forfeit
    const localPlayer = onlineRole === 'host' ? 0 : 1;
    winner = localPlayer;
    msg = 'Opponent disconnected. You win by forfeit.';
    state = 'over';
    onlineMode = false;
    onlineRole = null;
    ui();
    showResults();
  } else {
    restoreLocalOnlineIdentity();
    onlineMode = false;
    onlineRole = null;
    updateLobbyForOnline(false);
    showScreen('lobby');
  }
}

// ── Online game sync ─────────────────────────────────────────────
// The host simulates play and sends 20 Hz rolling snapshots plus turn changes.
function sendOnlineState() {
  if (!onlineMode || onlineRole !== 'host') return;
  window.FeltoraOnline.send({
    type: 'state',
    balls: balls.map((b) => ({ n: b.n, x: b.x, y: b.y, vx: b.vx, vy: b.vy, on: b.on })),
    state, turn, groups, groupBallNumbers, extraShots, msg, winner, turnRemaining,
    aim:   aim,
    power: Number(document.getElementById('pw').value)
  });
}

function handleOnlineMsg(msg_) {
  if (msg_.type === 'start-game') {
    startOnlineGame();
    return;
  }
  if (msg_.type === 'rematch') {
    // host started a rematch — guest resets and plays
    const rematchBtn = document.getElementById('rematch');
    rematchBtn.textContent = 'Rematch';
    rematchBtn.disabled = false;
    remoteStateReceivedAt = 0;
    remoteStateInterval = 1000 / 20;
    newGame();
    return;
  }
  if (msg_.type === 'rematch-request' && onlineRole === 'host') {
    // guest wants a rematch — show prompt to host with their name
    const rematchBtn = document.getElementById('rematch');
    const requesterName = msg_.name || playerNames[1];
    rematchBtn.textContent = `${requesterName} wants rematch — Accept`;
    rematchBtn.disabled = false;
    return;
  }
  if (msg_.type === 'state' && onlineRole === 'guest') {
    // apply authoritative state from host
    const wasOver = state === 'over';
    const receivedAt = performance.now();
    if (remoteStateReceivedAt) {
      const interval = receivedAt - remoteStateReceivedAt;
      if (interval > 0) remoteStateInterval = remoteStateInterval * 0.75 + interval * 0.25;
    }
    remoteStateReceivedAt = receivedAt;
    if (msg_.balls) {
      msg_.balls.forEach((bd, i) => {
        if (!balls[i]) return;
        balls[i].renderX = balls[i].x;
        balls[i].renderY = balls[i].y;
        Object.assign(balls[i], bd);
      });
    }
    state  = msg_.state;
    turn   = msg_.turn;
    groups = msg_.groups;
    groupBallNumbers = msg_.groupBallNumbers;
    extraShots = msg_.extraShots;
    msg    = msg_.msg;
    winner = msg_.winner;
    if (Number.isFinite(msg_.turnRemaining)) turnRemaining = msg_.turnRemaining;
    if (msg_.aim !== undefined) aim = msg_.aim;
    if (msg_.power !== undefined) setPower(msg_.power);
    ui();
    if (state === 'over' && !wasOver) showResults();
    return;
  }
  if (msg_.type === 'aim') {
    if (onlineRole === 'host' && state === 'aim' && turn === 1) aim = msg_.angle;
    if (onlineRole === 'guest' && state === 'aim' && turn === 0) aim = msg_.angle;
    return;
  }
  if (msg_.type === 'shoot' && onlineRole === 'host') {
    // guest fires — apply their aim+power then shoot
    if (state === 'aim' && turn === 1) {
      aim = msg_.angle;
      setPower(msg_.power);
      shoot();
    }
    return;
  }
  if (msg_.type === 'place' && onlineRole === 'host') {
    if (state === 'place' && turn === 1) {
      cue.x = msg_.x;
      cue.y = msg_.y;
      cue.on = true;
      if (valid(cue.x, cue.y)) {
        state = 'aim';
        aim = Math.atan2(TABLE_CENTER_Y - cue.y, FOOT_SPOT - cue.x);
        msg = '';
        turnRemaining = 30;
        ui();
        sendOnlineState();
      }
    }
    return;
  }
}

// Voice toggle button
document.getElementById('voice-toggle-btn').addEventListener('click', () => {
  if (!onlineMode || !onlineRole) return;
  window.FeltoraOnline.toggleMic();
});

function setProfileAvatar(avatar) {
  playerAvatars[0] = window.FeltoraMascots.resolve(avatar).id;
  updateAvatarDisplays();
  try {
    localStorage.setItem('feltora-avatar', playerAvatars[0]);
    if (window.FeltoraAuth && window.FeltoraAuth.currentUser()) {
      window.FeltoraAuth.update({ avatar: playerAvatars[0] });
    }
  } catch (error) {
    console.warn('Avatar preference could not be saved.', error);
  }
}

window.addEventListener('keydown', (e) => {
  if (e.target === powerBox) return;
  if (e.code === 'Space' && document.getElementById('game-screen').classList.contains('active')) {
    e.preventDefault();
    shoot();
  } else if (document.getElementById('game-screen').classList.contains('active') && state === 'aim' && e.key === 'ArrowLeft') {
    aim -= e.shiftKey ? 0.05 : 0.006;
  } else if (document.getElementById('game-screen').classList.contains('active') && state === 'aim' && e.key === 'ArrowRight') {
    aim += e.shiftKey ? 0.05 : 0.006;
  }
});

document.querySelectorAll('[data-music-toggle]').forEach((button) => button.addEventListener('click', () => {
  if (musicEnabled) stopLoungeMusic();
  else void startLoungeMusic().catch(reportAudioFailure);
}));

document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button || button.disabled) return;
  const now = performance.now();
  if (now - lastMenuSound < 85) return;
  lastMenuSound = now;
  requestSound('menu');
});

document.getElementById('music-volume').addEventListener('input', (event) => {
  audioSettings.music = Number(event.target.value) / 100;
  document.getElementById('music-volume-value').value = `${event.target.value}%`;
  updateAudioMix();
  if (!musicEnabled && musicBus) musicBus.gain.setTargetAtTime(0, audioContext.currentTime, 0.025);
  saveAudioSettings();
});

document.getElementById('effects-volume').addEventListener('input', (event) => {
  audioSettings.effects = Number(event.target.value) / 100;
  document.getElementById('effects-volume-value').value = `${event.target.value}%`;
  updateAudioMix();
  saveAudioSettings();
});

document.getElementById('master-mute').addEventListener('change', (event) => {
  updateAudioMix();
  saveAudioSettings();
  sfxEnabled = !event.target.checked;
});

function loadPreferences() {
  try {
    const savedAudio = JSON.parse(localStorage.getItem('feltora-audio') || '{}');
    for (const key of ['music', 'effects', 'master']) {
      if (Number.isFinite(savedAudio[key])) audioSettings[key] = Math.min(1, Math.max(0, savedAudio[key]));
    }
    document.getElementById('music-volume').value = String(Math.round(audioSettings.music * 100));
    document.getElementById('effects-volume').value = String(Math.round(audioSettings.effects * 100));
    document.getElementById('music-volume-value').value = document.getElementById('music-volume').value + '%';
    document.getElementById('effects-volume-value').value = document.getElementById('effects-volume').value + '%';
    document.getElementById('master-mute').checked = savedAudio.muted === true;
    sfxEnabled = !document.getElementById('master-mute').checked;
    const savedName = localStorage.getItem('feltora-display-name');
    if (savedName) {
      displayNameInput.value = savedName;
      updateProfileName(savedName);
    }
    const savedAvatar = localStorage.getItem('feltora-avatar') || 'marlow';
    setProfileAvatar(savedAvatar);
    const savedFelt = localStorage.getItem('feltora-felt') || 'green';
    setFelt(savedFelt);
    const savedCue = localStorage.getItem('feltora-cue') || 'wood';
    setCueStyle(savedCue);
  } catch (error) {
    console.warn('Saved preferences could not be loaded.', error);
  }
}

function frame(t) {
  const dt = last === null ? 0 : Math.min(MAX_FRAME_DELTA, (t - last) / 1000);
  last = t;
  if (document.getElementById('game-screen').classList.contains('active')
      && (state === 'aim' || state === 'place')
      && (!onlineMode || onlineRole === 'host')) {
    const priorSecond = Math.ceil(turnRemaining);
    turnRemaining = Math.max(0, turnRemaining - dt);
    if (turnRemaining === 0) {
      const expiredState = state;
      turn = 1 - turn;
      turnRemaining = 30;
      aimPointerId = null;
      placePointerId = null;
      powerPointerId = null;
      powerPullStart = null;
      powerPullAxis = null;
      powerPointerActive = false;
      document.getElementById('power-box').classList.remove('power-charging');
      // clear warning state
      document.querySelectorAll('.player-card').forEach((c) => c.classList.remove('timer-warning'));
      setPower(50);
      if (expiredState === 'place') {
        cue.on = true;
        cue.vx = cue.vy = 0;
        cue.x = HEAD_STRING;
        cue.y = TABLE_CENTER_Y;
      }
      state = 'aim';
      aim = Math.atan2(TABLE_CENTER_Y - cue.y, FOOT_SPOT - cue.x);
      msg = 'Turn expired. Your turn.';
      announceGameAction('⏰ Time\'s up! Turn passed.');
      if (expiredState === 'place') announceGameAction('🔴 Cue ball in hand — tap the table to place it', 5000);
      requestSound('menu');
      ui();
      if (onlineMode && onlineRole === 'host') sendOnlineState();
      scheduleBotTurn();
    } else if (Math.ceil(turnRemaining) !== priorSecond) {
      // warning pulse on active card when ≤10s
      const activeCard = document.getElementById('player-card-' + turn);
      if (activeCard) activeCard.classList.toggle('timer-warning', turnRemaining <= 10);
      // countdown beep for last 5 seconds
      if (turnRemaining <= 5 && Math.ceil(turnRemaining) !== Math.ceil(turnRemaining + dt)) {
        requestSound('menu', 0.4);
      }
      updatePlayerDisplay();
      updateStatusText();
    }
  }
  if (state === 'rolling' && (!onlineMode || onlineRole === 'host')) {
    acc += dt;
    while (acc >= PHYSICS_STEP - 1e-10) {
      acc = Math.max(0, acc - PHYSICS_STEP);
      for (const ball of balls) {
        ball.renderX = ball.x;
        ball.renderY = ball.y;
      }
      physics();
    }
    if (t - lastRollingSampleAt >= 170) {
      const speed = balls.reduce((max, ball) => (
        ball.on ? Math.max(max, Math.hypot(ball.vx, ball.vy)) : max
      ), 0);
      if (speed > 0.45) requestSound('rolling', Math.min(1, speed / 14));
      lastRollingSampleAt = t;
    }
    if (balls.every((b) => !b.on || (b.vx === 0 && b.vy === 0))) endShot();
  }
  if (onlineMode && onlineRole === 'guest'
      && document.getElementById('game-screen').classList.contains('active')
      && (state === 'aim' || state === 'place')) {
    turnRemaining = Math.max(0, turnRemaining - dt);
  }
  if (onlineMode && onlineRole === 'host' && (state === 'rolling' || state === 'aim' || state === 'place')) {
    const rollingSnapshotDue = state === 'rolling' && t - lastOnlineStateAt >= 1000 / 20;
    const timerSnapshotDue = state !== 'rolling' && Math.ceil(turnRemaining) !== lastOnlineTurnSecond;
    if (rollingSnapshotDue || timerSnapshotDue) {
      sendOnlineState();
      lastOnlineStateAt = t;
      lastOnlineTurnSecond = Math.ceil(turnRemaining);
    }
  }
  if (document.getElementById('game-screen').classList.contains('active')) draw();
  requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => {
  last = null;
  acc = 0;
  // when tab comes back, nudge the connection with a ping
  if (!document.hidden && onlineMode && window.FeltoraOnline) {
    window.FeltoraOnline.send({ type: 'ping', ts: Date.now() });
  }
});

setCueStyle('wood');
setProfileAvatar('marlow');
newGame({ openGame: false });
loadPreferences();
let initialTheme = 'dark';
try {
  initialTheme = localStorage.getItem('pool-theme') || 'dark';
} catch (error) {
  console.warn('Theme preference could not be loaded.', error);
}
applyTheme(initialTheme);

// ── Auth boot ────────────────────────────────────────────────────
function bootAuth() {
  const user = window.FeltoraAuth.currentUser();
  if (user) {
    applyAccountToLobby(user);
    showScreen('lobby');
    return;
  }
  // check if a returning user exists — pre-fill and hide the create account tab
  try {
    const last = localStorage.getItem('feltora-last-user');
    if (last && window.FeltoraAuth.getAccount(last)) {
      // returning user — show only sign-in, pre-fill username, hide create tab
      document.getElementById('login-username').value = last;
      document.getElementById('login-pin').focus();
      document.getElementById('tab-register').style.display = 'none';
      // show a "New player? Create account" link instead
      let newLink = document.getElementById('auth-new-player-link');
      if (!newLink) {
        newLink = document.createElement('button');
        newLink.id = 'auth-new-player-link';
        newLink.type = 'button';
        newLink.textContent = 'Create or upgrade an account';
        newLink.style.cssText = 'background:none;border:none;color:var(--muted);font-size:0.78rem;cursor:pointer;padding:8px 0 0;text-decoration:underline;width:100%;text-align:center;';
        newLink.addEventListener('click', () => {
          document.getElementById('tab-register').style.display = '';
          document.getElementById('tab-register').click();
          newLink.remove();
        });
        document.getElementById('panel-login').appendChild(newLink);
      }
    } else if (last) {
      document.getElementById('login-username').value = last;
    }
  } catch {}
  showScreen('auth');
}

function applyAccountToLobby(username) {
  const acc = window.FeltoraAuth.getAccount(username);
  if (!acc) return;
  document.getElementById('profile-account-tag').textContent = `@${acc.username}`;
  document.getElementById('profile-stats').hidden = false;
  document.getElementById('btn-signout').hidden = false;
  document.getElementById('stat-wins').textContent   = acc.stats.wins;
  document.getElementById('stat-losses').textContent = acc.stats.losses;
  document.getElementById('stat-frames').textContent = acc.stats.frames;
  const savedName = acc.displayName || acc.username;
  document.getElementById('display-name').value = savedName;
  updateProfileName(savedName);
  setProfileAvatar(acc.avatar || 'marlow');
  setCueStyle(acc.cue || 'wood');
}

// Auth tab switching
document.getElementById('tab-login').addEventListener('click', () => {
  document.getElementById('tab-login').classList.add('active');
  document.getElementById('tab-register').classList.remove('active');
  document.getElementById('panel-login').hidden = false;
  document.getElementById('panel-register').hidden = true;
});
document.getElementById('tab-register').addEventListener('click', () => {
  document.getElementById('tab-register').classList.add('active');
  document.getElementById('tab-login').classList.remove('active');
  document.getElementById('panel-register').hidden = false;
  document.getElementById('panel-login').hidden = true;
});

function showAuthError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.hidden = false;
}
function clearAuthError(id) { document.getElementById(id).hidden = true; }

document.getElementById('btn-login').addEventListener('click', async () => {
  clearAuthError('login-error');
  const u = document.getElementById('login-username').value;
  const p = document.getElementById('login-pin').value;
  const button = document.getElementById('btn-login');
  button.disabled = true;
  try {
    const result = await window.FeltoraAuth.login(u, p);
    if (!result.ok) { showAuthError('login-error', result.error); return; }
    try { localStorage.setItem('feltora-last-user', u.trim().toLowerCase()); } catch {}
    applyAccountToLobby(u.trim().toLowerCase());
    showScreen('lobby');
  } catch (error) {
    showAuthError('login-error', error.message || 'Sign-in failed. Try again.');
  } finally {
    button.disabled = false;
  }
});

// Enter key on login fields
['login-username', 'login-pin'].forEach((id) => {
  document.getElementById(id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-login').click();
  });
});

document.getElementById('btn-register').addEventListener('click', async () => {
  clearAuthError('reg-error');
  const u  = document.getElementById('reg-username').value;
  const p  = document.getElementById('reg-pin').value;
  const p2 = document.getElementById('reg-pin2').value;
  if (p !== p2) { showAuthError('reg-error', 'PINs do not match.'); return; }
  const button = document.getElementById('btn-register');
  const username = u.trim().toLowerCase();
  const existing = window.FeltoraAuth.getAccount(username);
  button.disabled = true;
  try {
    const result = await window.FeltoraAuth.register(u, p);
    if (!result.ok) { showAuthError('reg-error', result.error); return; }
    try { localStorage.setItem('feltora-last-user', username); } catch {}
    applyAccountToLobby(username);
    if (!existing && window.FeltoraOnboarding) window.FeltoraOnboarding.open(u.trim());
    else showScreen('lobby');
  } catch (error) {
    showAuthError('reg-error', error.message || 'Account creation failed. Try again.');
  } finally {
    button.disabled = false;
  }
});

// Enter key on register fields
['reg-username', 'reg-pin', 'reg-pin2'].forEach((id) => {
  document.getElementById(id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-register').click();
  });
});

// Real-time username availability check
document.getElementById('reg-username').addEventListener('input', () => {
  const val = document.getElementById('reg-username').value.trim().toLowerCase();
  const errEl = document.getElementById('reg-error');
  if (!val || val.length < 3 || !/^[a-z0-9_]+$/.test(val)) { errEl.hidden = true; return; }
  const existing = window.FeltoraAuth.getAccount(val);
  if (existing) {
    errEl.textContent = 'Saved on this device. Use its existing PIN to keep this profile when enabling online access.';
    errEl.hidden = false;
  } else {
    errEl.hidden = true;
  }
});

document.getElementById('btn-guest').addEventListener('click', () => {
  document.getElementById('profile-account-tag').textContent = 'Guest';
  showScreen('lobby');
});

document.getElementById('btn-signout').addEventListener('click', () => {
  window.FeltoraAuth.logout();
  document.getElementById('profile-stats').hidden = true;
  document.getElementById('btn-signout').hidden = true;
  document.getElementById('profile-account-tag').textContent = 'Guest';
  showScreen('auth');
});

bootAuth();
requestAnimationFrame(frame);

// ── Win card screenshot ─────────────────────────────────────────
async function saveWinCard() {
  const winnerName = playerNames[winner] || 'Player';
  const loserName  = playerNames[1 - winner] || 'Opponent';
  const W2 = 640, H2 = 360;
  const oc = document.createElement('canvas');
  oc.width  = W2 * 2; // 2x for sharpness
  oc.height = H2 * 2;
  const ctx = oc.getContext('2d');
  ctx.scale(2, 2);

  // background
  const bg = ctx.createLinearGradient(0, 0, W2, H2);
  bg.addColorStop(0,   '#050a08');
  bg.addColorStop(0.5, '#0d1a12');
  bg.addColorStop(1,   '#050a08');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W2, H2);

  // felt texture strip
  const felt = ctx.createLinearGradient(0, H2 * 0.28, 0, H2 * 0.72);
  felt.addColorStop(0,   '#1e6038');
  felt.addColorStop(0.5, '#155e3a');
  felt.addColorStop(1,   '#0f4a2e');
  ctx.fillStyle = felt;
  ctx.fillRect(0, H2 * 0.28, W2, H2 * 0.44);

  // wood border lines
  ctx.strokeStyle = 'rgba(245,200,66,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, H2 * 0.28); ctx.lineTo(W2, H2 * 0.28); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, H2 * 0.72); ctx.lineTo(W2, H2 * 0.72); ctx.stroke();

  // glow behind winner name
  const glow = ctx.createRadialGradient(W2 / 2, H2 / 2, 10, W2 / 2, H2 / 2, 200);
  glow.addColorStop(0,   'rgba(0,240,168,0.18)');
  glow.addColorStop(1,   'rgba(0,240,168,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W2, H2);

  // 8-ball emoji
  ctx.font = '52px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('🎱', W2 / 2, H2 * 0.22);

  // winner name
  ctx.font = 'bold 36px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#00f0a8';
  ctx.shadowColor = 'rgba(0,240,168,0.6)';
  ctx.shadowBlur = 18;
  ctx.fillText(winnerName, W2 / 2, H2 * 0.48);
  ctx.shadowBlur = 0;

  // "beats" line
  ctx.font = '500 15px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText(`beat ${loserName}`, W2 / 2, H2 * 0.58);

  // FELTORA watermark
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.letterSpacing = '0.18em';
  ctx.fillText('FELTORA · pool-game-gamma.vercel.app', W2 / 2, H2 * 0.92);

  // gold trophy
  ctx.font = '28px system-ui';
  ctx.fillText('🏆', W2 / 2, H2 * 0.78);

  // export
  const blob = await new Promise((res) => oc.toBlob(res, 'image/png'));
  const fileName = `feltora-win-${winnerName.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.png`;
  const file = typeof File === 'function' ? new File([blob], fileName, { type: 'image/png' }) : null;

  if (file && typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: `${winnerName} wins on FELTORA!`,
        text: `${winnerName} just beat ${loserName} in 8-ball pool on FELTORA 🎱`
      });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }
  // fallback: download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

document.getElementById('btn-share-win')?.addEventListener('click', () => saveWinCard().catch(console.warn));

// ── Tutorial system ──────────────────────────────────────────
const TUTORIAL_STEPS = [
  {
    icon: '🎱',
    title: 'Welcome to FELTORA!',
    body: 'Classic 8-ball pool in your browser. Pocket all your balls (solids or stripes), then sink the 8-ball to win.',
    spotlight: null,
    screen: 'any',
  },
  {
    icon: '🎮',
    title: 'Play Online or vs Bot',
    body: 'Tap “Play Online” to challenge a friend with a 6-character room code, or “Play vs Bot” to practice against AI.',
    spotlight: 'mode-list',
    screen: 'lobby',
  },
  {
    icon: '🔮',
    title: 'Aim your shot',
    body: 'Drag anywhere on the table to rotate the cue. The dashed line shows where the ball travels. A red line means an illegal hit.',
    spotlight: 'canvas',
    screen: 'game',
  },
  {
    icon: '⚡',
    title: 'Set your power',
    body: 'Pull UP on the PWR bar to charge your shot, then release to fire. On portrait mobile, drag RIGHT instead.',
    spotlight: 'power-box',
    screen: 'game',
  },
  {
    icon: '🎯',
    title: 'Fine-tune your aim',
    body: 'Use the ◂ AIM ▸ buttons for precise adjustments. On desktop, arrow keys work too. Space bar fires.',
    spotlight: 'aim-controls',
    screen: 'game',
  },
  {
    icon: '🏆',
    title: 'You\'re ready!',
    body: 'First ball you pocket assigns your group — solids or stripes. Clear your group then legally pocket the 8-ball to win. Good luck!',
    spotlight: null,
    screen: 'any',
  },
];

let tutStep = 0;
let tutActive = false;

function getTutSpotlightEl(key) {
  if (!key) return null;
  if (key === 'canvas')       return document.getElementById('c');
  if (key === 'power-box')    return document.getElementById('power-box');
  if (key === 'aim-controls') return document.querySelector('.aim-controls');
  if (key === 'mode-list')    return document.querySelector('.mode-list');
  return null;
}

function positionTutCard() {
  const card = document.getElementById('tutorial-card');
  const spotlight = document.getElementById('tutorial-spotlight');
  const arrow = document.getElementById('tutorial-arrow');
  const step = TUTORIAL_STEPS[tutStep];
  const el = getTutSpotlightEl(step.spotlight);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardW = Math.min(360, vw - 24);
  const cardH = card.offsetHeight || 240;
  const pad = 16;

  // reset — always use pixel left + no transform to avoid iPhone conflict
  arrow.style.display = 'none';
  spotlight.style.display = 'none';
  card.style.transform = 'none';
  card.style.bottom = '';

  // horizontal centre — always pixel-based, safe on all devices
  const cardLeft = Math.max(pad, Math.min(vw - cardW - pad, (vw - cardW) / 2));
  card.style.left = `${cardLeft}px`;
  card.style.width = `${cardW}px`;

  if (!el) {
    card.style.top = `${Math.max(pad, (vh - cardH) / 2)}px`;
    return;
  }

  const r = el.getBoundingClientRect();
  spotlight.style.display = 'block';
  spotlight.style.top    = `${r.top - 6}px`;
  spotlight.style.left   = `${r.left - 6}px`;
  spotlight.style.width  = `${r.width + 12}px`;
  spotlight.style.height = `${r.height + 12}px`;

  // try below, then above, then safe centre
  const belowTop = r.bottom + pad;
  const aboveTop = r.top - cardH - pad;
  if (belowTop + cardH + pad <= vh) {
    card.style.top = `${belowTop}px`;
  } else if (aboveTop >= pad) {
    card.style.top = `${aboveTop}px`;
  } else {
    card.style.top = `${Math.max(pad, Math.min(vh - cardH - pad, (vh - cardH) / 2))}px`;
  }
}

function renderTutStep() {
  const step = TUTORIAL_STEPS[tutStep];
  document.getElementById('tutorial-icon').textContent  = step.icon;
  document.getElementById('tutorial-title').textContent = step.title;
  document.getElementById('tutorial-body').textContent  = step.body;
  document.getElementById('tutorial-next').textContent  =
    tutStep === TUTORIAL_STEPS.length - 1 ? '🎮 Let\'s play!' : 'Next →';

  const dots = document.getElementById('tutorial-step-indicator');
  dots.innerHTML = TUTORIAL_STEPS.map((_, i) => {
    const cls = i < tutStep ? 'done' : i === tutStep ? 'active done' : '';
    return `<span class="${cls}"></span>`;
  }).join('');

  // re-run positioning after a frame so card height is known
  requestAnimationFrame(() => positionTutCard());
}

function getActiveScreen() {
  if (document.getElementById('game-screen').classList.contains('active'))   return 'game';
  if (document.getElementById('lobby-screen').classList.contains('active'))  return 'lobby';
  if (document.getElementById('auth-screen').classList.contains('active'))   return 'auth';
  return 'other';
}

function getFirstRelevantStep() {
  const screen = getActiveScreen();
  return TUTORIAL_STEPS.findIndex((s) => s.screen === 'any' || s.screen === screen);
}

function startTutorial(force = false) {
  try {
    // use sessionStorage so it auto-shows once per session, not permanently blocked
    if (!force && sessionStorage.getItem('feltora-tutorial-seen')) return;
  } catch {}
  tutStep = Math.max(0, getFirstRelevantStep());
  tutActive = true;
  const overlay = document.getElementById('tutorial-overlay');
  overlay.classList.add('active');
  renderTutStep();
}

function closeTutorial() {
  tutActive = false;
  document.getElementById('tutorial-overlay').classList.remove('active');
  try { sessionStorage.setItem('feltora-tutorial-seen', '1'); } catch {}
}

function tutNext() {
  // skip steps not relevant to current screen
  const screen = getActiveScreen();
  let next = tutStep + 1;
  while (next < TUTORIAL_STEPS.length) {
    const s = TUTORIAL_STEPS[next];
    if (s.screen === 'any' || s.screen === screen) break;
    next++;
  }
  if (next >= TUTORIAL_STEPS.length) {
    closeTutorial();
  } else {
    tutStep = next;
    renderTutStep();
  }
}

document.getElementById('tutorial-next').addEventListener('click', tutNext);
document.getElementById('tutorial-skip').addEventListener('click', closeTutorial);
document.getElementById('tutorial-backdrop').addEventListener('click', closeTutorial);
window.addEventListener('resize', () => { if (tutActive) positionTutCard(); });

const howToPlayBtn = document.getElementById('how-to-play-btn');
if (howToPlayBtn) howToPlayBtn.addEventListener('click', () => startTutorial(true));

// auto-show for first-time users after they enter the game screen
// patched directly into showScreen below

// ── Presence (online count) ──────────────────────────────────────
function updateOnlineCountBadge(n) {
  const el = document.getElementById('online-count-num');
  if (el) el.textContent = n > 0 ? String(n) : '—';
}

if (window.FeltoraOnline) {
  window.FeltoraOnline.joinPresence();
  window.FeltoraOnline.getOnlineCount().then(updateOnlineCountBadge);
  window.FeltoraOnline.subscribeOnlineCount(updateOnlineCountBadge);
  window.addEventListener('pagehide', () => {
    window.FeltoraOnline.destroy();
    window.FeltoraOnline.leavePresence();
  });
  window.addEventListener('beforeunload', () => window.FeltoraOnline.leavePresence());
}

// Bug fix 4: warn before refresh/close during an active online game
window.addEventListener('beforeunload', (e) => {
  if (onlineMode && state !== 'over') {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ── Lobby bottom nav ─────────────────────────────────────────────
(function() {
  var lbnCommunity = document.getElementById('lbn-community');
  var lbnHome = document.getElementById('lbn-home');
  var lbnPhone = document.getElementById('lbn-phone');

  if (lbnCommunity) {
    lbnCommunity.addEventListener('click', function() {
      showScreen('community');
      if (typeof communityRenderFeed === 'function') communityRenderFeed();
    });
  }

  if (lbnHome) {
    lbnHome.addEventListener('click', function() {
      showScreen('lobby');
    });
  }

  if (lbnPhone) {
    lbnPhone.addEventListener('click', function() {
      // Open the phone modal — same as game-phone-fab
      var modal = document.getElementById('game-phone-modal');
      var inner = document.getElementById('game-phone-modal-inner');
      var frame = document.getElementById('phone-frame');
      if (!modal || !inner || !frame) return;
      if (!inner.contains(frame)) inner.appendChild(frame);
      modal.hidden = false;
    });
  }

  // Keep home tab highlighted when on lobby
  var origShow = window.showScreen;
  if (typeof showScreen === 'function') {
    var _orig = showScreen;
    showScreen = function(name) {
      _orig(name);
      if (lbnHome) lbnHome.classList.toggle('active', name === 'lobby');
      if (lbnCommunity) lbnCommunity.classList.toggle('active', name === 'community');
    };
  }
})();
