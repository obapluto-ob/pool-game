const cv = document.getElementById('c');
const g = cv.getContext('2d');
const W = 900, H = 500, L = 50, T = 50, R = 850, B = 450, BR = 10;
const POCKETS = [[L, T, 22], [450, T - 4, 20], [R, T, 22], [L, B, 22], [450, B + 4, 20], [R, B, 22]];
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
let balls, cue, state, turn, groups, aim, pocketed, msg, winner, ptr = { x: 230, y: 250 };
let selectedCue = 'wood';
let last = 0, acc = 0;
let aimPointerId = null, placePointerId = null, powerPointerId = null, powerPointerActive = false;
let powerPullStart = null, powerStartingValue = 50;
let botMode = false, botMascot = 'marlow', botDifficulty = 'medium', botTimer = null;
let onlineMode = false;
let onlineRole = null;
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
    button.querySelector('.avatar-choice-art').innerHTML = window.FeltoraMascots.render(button.dataset.avatar);
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  document.querySelectorAll('[data-bot]').forEach((button) => {
    button.querySelector('.bot-avatar-art').innerHTML = window.FeltoraMascots.render(button.dataset.bot);
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
  shell.classList.toggle('view-3d', view3d);
  const btn = document.getElementById('toggle-3d');
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
    [392, 311.13].forEach((note, index) => {
      playPluck(note, now + index * 0.2, 0.1, effectsBus, 0.65);
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

function updateLandscapeHint() {
  const hint = document.getElementById('landscape-hint');
  if (!hint) return;
  const gameActive = document.getElementById('game-screen').classList.contains('active');
  const blockedOrientation = window.matchMedia(
    '(max-width: 900px) and (max-height: 600px) and (orientation: landscape)'
  ).matches;
  hint.classList.toggle('game-active', gameActive);
  hint.setAttribute('aria-hidden', String(!gameActive || !blockedOrientation));
  if (gameActive && blockedOrientation) {
    aimPointerId = null;
    placePointerId = null;
    powerPointerId = null;
    powerPullStart = null;
    powerPointerActive = false;
    document.getElementById('power-box').classList.remove('power-charging');
  }
  if (gameActive) updateStatusText();
}

window.addEventListener('resize', updateLandscapeHint);
window.addEventListener('orientationchange', updateLandscapeHint);

function showScreen(screenName) {
  if (screenName !== 'game' && state === 'bot') {
    window.clearTimeout(botTimer);
    botTimer = null;
    state = 'aim';
  }
  document.getElementById('auth-screen').classList.toggle('active', screenName === 'auth');
  document.getElementById('lobby-screen').classList.toggle('active', screenName === 'lobby');
  document.getElementById('game-screen').classList.toggle('active', screenName === 'game');
  document.getElementById('results-screen').classList.toggle('active', screenName === 'results');
  updateLandscapeHint();
}

function updatePlayerDisplay() {
  for (let i = 0; i < 2; i++) {
    const card = document.getElementById('player-card-' + i);
    const tag = card.querySelector('.player-tag');
    card.querySelector('.player-title').textContent = playerNames[i];
    const group = document.getElementById('group-' + i);
    const groupPill = document.getElementById('group-pill-' + i);
    const groupRemaining = document.getElementById('group-remaining-' + i);
    const indicator = document.getElementById('group-indicator-' + i);
    const resultGroup = document.getElementById('result-group-' + i);
    const label = groups[i] ? (groups[i] === 'solid' ? 'Solids' : 'Stripes') : 'Open';
    const remaining = groups[i]
      ? balls.filter((ball) => ball.on && grp(ball.n) === groups[i]).length
      : 0;
    group.textContent = label;
    groupRemaining.textContent = groups[i] ? `${remaining} left` : '';
    groupRemaining.hidden = !groups[i];
    groupPill.setAttribute(
      'aria-label',
      groups[i] ? `${label}, ${remaining} ${remaining === 1 ? 'ball' : 'balls'} remaining` : 'Group not assigned'
    );
    indicator.dataset.group = groups[i] || 'open';
    // show count of balls pocketed by this player
    const pocketedCount = groups[i]
      ? balls.filter((b) => !b.on && b.n > 0 && b.n !== 8 && grp(b.n) === groups[i]).length
      : 0;
    const ballNumber = groupBallNumbers[i];
    indicator.dataset.ballNumber = ballNumber === null ? '' : String(ballNumber);
    indicator.textContent = pocketedCount > 0 ? String(pocketedCount) : (ballNumber === null ? '' : String(ballNumber));
    if (ballNumber === null || ballNumber === 0 || !COL[ballNumber]) {
      indicator.style.removeProperty('--ball-color');
    } else {
      indicator.style.setProperty('--ball-color', COL[ballNumber]);
    }
    indicator.setAttribute(
      'aria-label',
      ballNumber === null
        ? groups[i] ? `${label} group; no own ball pocketed yet` : 'Group not assigned'
        : `${label} group, ${pocketedCount} ball${pocketedCount !== 1 ? 's' : ''} pocketed`
    );
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
      ? 'drag right on the power control and release to shoot.'
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
      ? 'Shot power. Drag right to increase, release to shoot.'
      : 'Shot power. Pull up to increase, release to shoot.'
  );
  powerBox.tabIndex = canShoot ? 0 : -1;
  document.getElementById('power-hint').textContent = canShoot
    ? (horizontalPowerBar ? 'Drag →' : 'Pull up')
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
  const winnerName = playerNames[winner] || 'Player 1';
  document.getElementById('winner-name').textContent = winnerName;
  for (let i = 0; i < 2; i++) {
    document.getElementById(`result-player-name-${i}`).textContent = playerNames[i];
    document.getElementById(`result-player-${i}`).classList.toggle('winner', winner === i);
  }
  updateAvatarDisplays();
  document.getElementById('results-badge').textContent = 'Match complete';
  document.getElementById('results-outcome').textContent =
    `${winnerName} wins the frame · ${playerNames[1 - winner]} loses`;
  document.getElementById('winner-summary').textContent = msg || `${winnerName} wins the frame.`;
  showScreen('results');
  requestSound(winner === 0 ? 'victory' : 'defeat');
  // confetti burst for winner
  if (winner === 0) {
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
  // record result for logged-in player (player 0 = local user)
  if (window.FeltoraAuth && window.FeltoraAuth.currentUser()) {
    window.FeltoraAuth.recordResult(winner === 0);
    const earned = winner === 0 ? 50 : 10;
    window.FeltoraAuth.addCoins(earned);
    const acc = window.FeltoraAuth.getAccount(window.FeltoraAuth.currentUser());
    if (acc) {
      document.getElementById('stat-wins').textContent   = acc.stats.wins;
      document.getElementById('stat-losses').textContent = acc.stats.losses;
      document.getElementById('stat-frames').textContent = acc.stats.frames;
      refreshCoinBadge(acc.coins);
    }
    const toast = document.getElementById('coin-earned-toast');
    const toastText = document.getElementById('coin-earned-text');
    if (toast && toastText) {
      toastText.textContent = `+${earned} coins earned`;
      toast.hidden = false;
    }
  } else {
    const toast = document.getElementById('coin-earned-toast');
    if (toast) toast.hidden = true;
  }
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
  balls = [{ n: 0, x: 230, y: 250, vx: 0, vy: 0, on: true }];
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
      balls.push({ n: slots[si++], x: 600 + i * 17.7, y: 250 + (j - (count - 1) / 2) * 20.4, vx: 0, vy: 0, on: true });
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
  powerPointerActive = false;
  document.getElementById('power-box').classList.remove('power-charging');
  ptr = { x: 230, y: 250 };
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
        if (d2 >= 4 * BR * BR || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
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
          const imp = -(1 + 0.96) * rel / 2;
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
        b.vx = Math.abs(b.vx) * 0.8;
      }
      if (b.x > R - BR) {
        if (Math.abs(b.vx) > 0.6) requestSound('cushion', Math.min(1.3, Math.abs(b.vx) / 11));
        b.x = R - BR;
        b.vx = -Math.abs(b.vx) * 0.8;
      }
      if (b.y < T + BR) {
        if (Math.abs(b.vy) > 0.6) requestSound('cushion', Math.min(1.3, Math.abs(b.vy) / 11));
        b.y = T + BR;
        b.vy = Math.abs(b.vy) * 0.8;
      }
      if (b.y > B - BR) {
        if (Math.abs(b.vy) > 0.6) requestSound('cushion', Math.min(1.3, Math.abs(b.vy) / 11));
        b.y = B - BR;
        b.vy = -Math.abs(b.vy) * 0.8;
      }
    }
  }
  for (const b of balls) {
    if (!b.on) continue;
    b.vx *= 0.988;
    b.vy *= 0.988;
    if (b.vx * b.vx + b.vy * b.vy < 0.0036) b.vx = b.vy = 0;
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
    const clearedThisShot = mine ? !p.filter((n) => n > 0 && n !== 8 && grp(n) === mine).length === 0 || !left : false;
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

  aim = Math.atan2(250 - cue.y, 600 - cue.x);
  turnRemaining = 30;
  setPower(50);
  ui();
  scheduleBotTurn();
}

function shoot() {
  if (state !== 'aim' || isMobileLandscape()) return;
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
  const sp = 6 + (power / 100) * 32;
  const group = groups[turn];
  eightBallReadyAtShot = !!group && !balls.some((b) => b.on && b.n !== 8 && b.n > 0 && grp(b.n) === group);
  firstHit = null;
  requestSound('cue', sp / 23);
  lastRollingSampleAt = performance.now();
  cue.vx = Math.cos(aim) * sp;
  cue.vy = Math.sin(aim) * sp;
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

function isMobileLandscape() {
  return window.matchMedia(
    '(max-width: 900px) and (max-height: 600px) and (orientation: landscape)'
  ).matches;
}

function updatePulledPower(clientX, clientY) {
  if (powerPullStart === null) return;
  if (isHorizontalPowerBar()) {
    // drag right = more power
    setPower(powerStartingValue + (clientX - powerPullStart) * 1.0);
  } else {
    // drag up = more power
    setPower(powerStartingValue - (clientY - powerPullStart) * 1.0);
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
  let best = { x: 230, y: 250, clearance: -Infinity };
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
  aim = Math.atan2(250 - cue.y, 600 - cue.x);
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
  g.moveTo(230, T);
  g.lineTo(230, B);
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
    // Determine if the first ball we'd hit is a legal target
    const myGroup = groups[turn];
    // recalculate 8-ball readiness live for the aim line (eightBallReadyAtShot is only set at shoot time)
    const liveEightReady = !!myGroup && !balls.some((b) => b.on && b.n !== 8 && b.n > 0 && grp(b.n) === myGroup);
    const hitIsLegal = !r.hit || (
      myGroup
        ? grp(r.hit.n) === myGroup || (r.hit.n === 8 && liveEightReady)
        : r.hit.n !== 8
    );
    const lineColor = hitIsLegal ? 'rgba(255,255,255,.7)' : 'rgba(255,90,70,.65)';
    g.save();
    g.setLineDash([6, 6]);
    g.strokeStyle = lineColor;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(cue.x, cue.y);
    g.lineTo(cue.x + r.dx * r.t, cue.y + r.dy * r.t);
    g.stroke();
    g.setLineDash([]);
    const gx = cue.x + r.dx * r.t;
    const gy = cue.y + r.dy * r.t;
    g.beginPath();
    g.arc(gx, gy, BR, 0, 7);
    g.stroke();
    if (r.hit && hitIsLegal) {
      const hx = r.hit.x - gx;
      const hy = r.hit.y - gy;
      const hl = Math.hypot(hx, hy) || 1;
      g.beginPath();
      g.moveTo(r.hit.x, r.hit.y);
      g.lineTo(r.hit.x + hx / hl * 45, r.hit.y + hy / hl * 45);
      g.stroke();
    }
    g.restore();

    const pw = Number(document.getElementById('pw').value) / 100;
    const back = 16 + pw * 55;
    const sx = cue.x - Math.cos(aim) * back;
    const sy = cue.y - Math.sin(aim) * back;
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
  }

  for (const b of balls) {
    if (b.on) drawBall(b, b.x, b.y);
  }

  if (state === 'place') {
    const ok = valid(cue.x, cue.y);
    g.strokeStyle = ok ? '#fff' : '#ff6b5e';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(cue.x, cue.y, BR + 4, 0, 7);
    g.stroke();
    if (!cue.on) drawBall(cue, cue.x, cue.y);
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
  return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
}

function track(e) {
  if (isMobileLandscape()) return;
  if (!document.getElementById('game-screen').classList.contains('active')) return;
  if (state !== 'aim' && state !== 'place') return;
  if (botMode && turn === 1) return;
  if (onlineMode && onlineRole === 'guest' && turn === 0) return; // guest can't control host's turn
  if (state === 'aim') {
    if (e.pointerId !== aimPointerId) return;
    ptr = pos(e);
    aim = Math.atan2(ptr.y - cue.y, ptr.x - cue.x);
    if (onlineMode && onlineRole === 'guest') {
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
      aim = Math.atan2(250 - cue.y, 600 - cue.x);
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
  if (isMobileLandscape() || state !== 'aim' || (botMode && turn === 1)) return;
  event.preventDefault();
  powerPointerActive = true;
  powerPointerId = event.pointerId;
  powerPullStart = isHorizontalPowerBar() ? event.clientX : event.clientY;
  powerStartingValue = Number(document.getElementById('pw').value);
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
  powerBox.classList.remove('power-charging');
  if (state === 'aim' && !(botMode && turn === 1)) shoot();
});
powerBox.addEventListener('pointercancel', (event) => {
  if (event.pointerId !== powerPointerId) return;
  powerPointerActive = false;
  powerPointerId = null;
  powerPullStart = null;
  powerBox.classList.remove('power-charging');
});

document.getElementById('back-to-lobby').addEventListener('click', () => {
  if (onlineMode) {
    window.FeltoraOnline.destroy();
    onlineMode = false;
    onlineRole = null;
    updateLobbyForOnline(false);
  }
  showScreen('lobby');
});
document.getElementById('results-lobby').addEventListener('click', () => {
  if (onlineMode) {
    window.FeltoraOnline.destroy();
    onlineMode = false;
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
    } else {
      // guest requests rematch — send signal, wait for host to start
      window.FeltoraOnline.send({ type: 'rematch-request' });
      document.getElementById('rematch').textContent = 'Waiting for host…';
      document.getElementById('rematch').disabled = true;
    }
  } else {
    newGame();
  }
});
function adjustAim(direction) {
  if (isMobileLandscape() || state !== 'aim') return;
  aim += direction * 0.04;
}

document.getElementById('aim-left').addEventListener('click', () => adjustAim(-1));
document.getElementById('aim-right').addEventListener('click', () => adjustAim(1));

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

document.getElementById('theme-toggle').addEventListener('click', () => {
  const current = document.body.dataset.theme === 'dark' ? 'dark' : 'light';
  applyTheme(current === 'dark' ? 'light' : 'dark');
});
powerBox.addEventListener('keydown', (event) => {
  if (isMobileLandscape() || state !== 'aim' || (botMode && turn === 1)) return;
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
  const dot = '<span class="spots-live-dot" title="Live"></span>';
  if (!spots || !spots.length) {
    list.innerHTML = `<div class="spots-header">${dot}<span class="online-hint" style="margin:0">No open spots yet — ask a friend to create one</span></div>`;
    return;
  }
  list.innerHTML =
    `<div class="spots-header">${dot}<span class="mini-label" style="margin:0">${spots.length} open spot${spots.length !== 1 ? 's' : ''}</span></div>` +
    spots.map((s) => {
      const mascot = window.FeltoraMascots ? window.FeltoraMascots.resolve(s.avatar) : null;
      const art = mascot ? window.FeltoraMascots.render(s.avatar) : '';
      return `<button class="spot-card" type="button" data-spot-code="${s.code}">
        <span class="spot-card-avatar">${art}</span>
        <span class="spot-card-info">
          <strong>${s.name}</strong>
          <small>Waiting for opponent · tap to join</small>
        </span>
        <span class="spot-card-join">Join →</span>
      </button>`;
    }).join('');
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
        const isTimeout = errMsg.includes('timeout');
        errEl.textContent = isTimeout
          ? 'Could not connect — taking too long. Both players should be on the page at the same time. Try again.'
          : 'Could not reach that spot. Check the code is correct and the host is still waiting.';
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
      botMode = false;
      // from guest's perspective: they are player 0, host is player 1
      playerNames[1]  = peerName;
      playerAvatars[1] = peerAvatar;
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
  newGame();
  document.getElementById('voice-toggle-btn').hidden = false;
  window.FeltoraOnline.startMic().then((stream) => {
    if (stream) {
      stream.getAudioTracks().forEach((t) => { t.enabled = true; });
      window.FeltoraOnline.updateVoiceUI();
    }
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
    onlineMode = false;
    onlineRole = null;
    updateLobbyForOnline(false);
    showScreen('lobby');
  }
}

// ── Online game sync ─────────────────────────────────────────────
// Host sends full ball state every frame during rolling, and turn events.
// Guest sends aim + shoot commands. Host is authoritative.
function sendOnlineState() {
  if (!onlineMode || onlineRole !== 'host') return;
  window.FeltoraOnline.send({
    type: 'state',
    balls: balls.map((b) => ({ n: b.n, x: b.x, y: b.y, vx: b.vx, vy: b.vy, on: b.on })),
    state, turn, groups, groupBallNumbers, extraShots, msg,
    // only send aim+power when it's the guest's turn so host aim stays hidden
    aim:   turn === 1 ? aim  : undefined,
    power: turn === 1 ? Number(document.getElementById('pw').value) : undefined
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
    newGame();
    return;
  }
  if (msg_.type === 'rematch-request' && onlineRole === 'host') {
    // guest wants a rematch — show prompt to host
    const rematchBtn = document.getElementById('rematch');
    rematchBtn.textContent = 'Accept Rematch';
    rematchBtn.disabled = false;
    return;
  }
  if (msg_.type === 'state' && onlineRole === 'guest') {
    // apply authoritative state from host
    if (msg_.balls) {
      msg_.balls.forEach((bd, i) => {
        if (!balls[i]) return;
        Object.assign(balls[i], bd);
      });
    }
    state  = msg_.state;
    turn   = msg_.turn;
    groups = msg_.groups;
    groupBallNumbers = msg_.groupBallNumbers;
    extraShots = msg_.extraShots;
    msg    = msg_.msg;
    if (msg_.aim !== undefined) aim = msg_.aim;
    if (msg_.power !== undefined) setPower(msg_.power);
    ui();
    return;
  }
  if (msg_.type === 'aim' && onlineRole === 'host') {
    // guest is aiming — update aim for rendering
    if (state === 'aim' && turn === 1) aim = msg_.angle;
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
        aim = Math.atan2(250 - cue.y, 600 - cue.x);
        msg = '';
        turnRemaining = 30;
        ui();
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
  if (isMobileLandscape()) return;
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
  const dt = Math.min(0.05, (t - last) / 1000 || 0);
  last = t;
  if (document.getElementById('game-screen').classList.contains('active') && (state === 'aim' || state === 'place')) {
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
      powerPointerActive = false;
      document.getElementById('power-box').classList.remove('power-charging');
      setPower(50);
      if (expiredState === 'place') {
        cue.on = true;
        cue.vx = cue.vy = 0;
        cue.x = 230;
        cue.y = 250;
      }
      state = 'aim';
      aim = Math.atan2(250 - cue.y, 600 - cue.x);
      msg = 'Turn expired. Your turn.';
      ui();
      scheduleBotTurn();
    } else if (Math.ceil(turnRemaining) !== priorSecond) {
      updatePlayerDisplay();
      updateStatusText();
    }
  }
  if (state === 'rolling') {
    acc += dt;
    while (acc >= 1 / 60) {
      acc -= 1 / 60;
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
  if (onlineMode && onlineRole === 'host' && (state === 'rolling' || state === 'aim' || state === 'place')) {
    sendOnlineState();
  }
  if (document.getElementById('game-screen').classList.contains('active')) draw();
  requestAnimationFrame(frame);
}

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
  } else {
    // pre-fill last used username so returning users only need their PIN
    try {
      const last = localStorage.getItem('feltora-last-user');
      if (last) document.getElementById('login-username').value = last;
    } catch {}
    showScreen('auth');
  }
}

function refreshCoinBadge(amount) {
  const badge = document.getElementById('coin-badge');
  if (badge) badge.textContent = `🪙 ${amount}`;
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
  refreshCoinBadge(acc.coins || 0);
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

document.getElementById('btn-login').addEventListener('click', () => {
  clearAuthError('login-error');
  const u = document.getElementById('login-username').value;
  const p = document.getElementById('login-pin').value;
  const result = window.FeltoraAuth.login(u, p);
  if (!result.ok) { showAuthError('login-error', result.error); return; }
  try { localStorage.setItem('feltora-last-user', u.trim().toLowerCase()); } catch {}
  applyAccountToLobby(u.trim().toLowerCase());
  showScreen('lobby');
});

// Enter key on login fields
['login-username', 'login-pin'].forEach((id) => {
  document.getElementById(id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-login').click();
  });
});

document.getElementById('btn-register').addEventListener('click', () => {
  clearAuthError('reg-error');
  const u  = document.getElementById('reg-username').value;
  const p  = document.getElementById('reg-pin').value;
  const p2 = document.getElementById('reg-pin2').value;
  if (p !== p2) { showAuthError('reg-error', 'PINs do not match.'); return; }
  const result = window.FeltoraAuth.register(u, p);
  if (!result.ok) { showAuthError('reg-error', result.error); return; }
  try { localStorage.setItem('feltora-last-user', u.trim().toLowerCase()); } catch {}
  applyAccountToLobby(u.trim().toLowerCase());
  showScreen('lobby');
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
  if (!val || val.length < 3) { errEl.hidden = true; return; }
  const taken = window.FeltoraAuth.getAccount(val) !== null;
  if (taken) {
    errEl.textContent = `"${val}" is already taken.`;
    errEl.hidden = false;
  } else {
    errEl.hidden = true;
  }
});

document.getElementById('btn-guest').addEventListener('click', () => {
  document.getElementById('profile-account-tag').textContent = 'Guest';
  refreshCoinBadge(0);
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

// ── Presence (online count) ──────────────────────────────────────
function updateOnlineCountBadge(n) {
  const el = document.getElementById('online-count-num');
  if (el) el.textContent = n > 0 ? String(n) : '—';
}

if (window.FeltoraOnline) {
  window.FeltoraOnline.joinPresence();
  window.FeltoraOnline.getOnlineCount().then(updateOnlineCountBadge);
  window.FeltoraOnline.subscribeOnlineCount(updateOnlineCountBadge);
  window.addEventListener('pagehide', () => window.FeltoraOnline.leavePresence());
  window.addEventListener('beforeunload', () => window.FeltoraOnline.leavePresence());
}
