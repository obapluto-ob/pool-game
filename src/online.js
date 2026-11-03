/**
 * FELTORA – Online multiplayer + voice chat
 * Uses PeerJS (WebRTC) for P2P data + audio.
 * Spots registry uses Firebase so guests on any device can find open spots.
 * Host runs physics and is player 0. Guest is player 1.
 */

const FeltoraOnline = (() => {
  // ── State ────────────────────────────────────────────────────────
  let peer = null;
  let conn = null;
  let audioCall = null;
  let localStream = null;
  let remoteAudio = null;
  let role = null;
  let roomCode = null;
  let onStateMsg = null;
  let onPeerReady = null;
  let onPeerLeft = null;
  let micEnabled = false;
  let micIssue = '';
  let voiceStreamSent = false;
  let voiceActive = false;
  let voiceStatus = 'idle';
  let voiceError = '';
  let voiceTimeout = null;
  let spotHeartbeat = null;
  let pingTimer = null;
  let pongTimer = null;
  let onConnectionLost = null;
  let onConnectionRestored = null;

  // ── Code generator ───────────────────────────────────────────────
  function genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  // ── PeerJS config ────────────────────────────────────────────────
  // ICE servers are fetched at runtime from Metered so credentials
  // are never hardcoded in source. Falls back to Google STUN if fetch fails.
  const METERED_API_KEY = '6bdf4ab04af9476b5e811cdda567b7bd4251';
  const METERED_URL     = `https://poolgameapp.metered.live/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`;

  const FALLBACK_ICE = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  let cachedIceServers = null;

  async function getIceServers() {
    if (cachedIceServers) return cachedIceServers;
    try {
      const res = await fetch(METERED_URL);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      cachedIceServers = await res.json();
      return cachedIceServers;
    } catch (e) {
      console.warn('[online] failed to fetch TURN credentials, using fallback', e);
      return FALLBACK_ICE;
    }
  }

  async function buildPeerConfig() {
    const iceServers = await getIceServers();
    return {
      host: '0.peerjs.com', port: 443, path: '/', secure: true,
      config: { iceServers, iceCandidatePoolSize: 10 },
      debug: 0,
      pingInterval: 3000,
    };
  }

  // ── Spots registry (Firebase Realtime Database REST API) ────────
  // Free project — public read/write rules set to true.
  // Uses REST so no SDK needed. Real-time via SSE (EventSource).
  const FB_URL      = 'https://feltora-spots-default-rtdb.firebaseio.com/spots';
  const FB_PRESENCE = 'https://feltora-spots-default-rtdb.firebaseio.com/presence';
  const SPOT_TTL = 120000;
  let spotRegistryAvailable = null;
  let spotsListener    = null; // EventSource for real-time push
  let presenceListener = null; // EventSource for online count
  let onSpotsUpdate    = null; // callback(spots[]) set by game.js
  let presenceId       = null; // this session's presence key
  let presenceHb       = null; // heartbeat interval

  async function publishSpot(code, name, avatar) {
    const spot = { code, name, avatar, ts: Date.now() };
    try {
      const response = await fetch(`${FB_URL}/${code}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spot),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      spotRegistryAvailable = true;
    } catch (e) {
      spotRegistryAvailable = false;
      console.warn('[spots] publish failed', e);
    }
    // also mirror to localStorage for same-device fallback
    try {
      const local = JSON.parse(localStorage.getItem('feltora-open-spots') || '{}');
      local[code] = spot;
      localStorage.setItem('feltora-open-spots', JSON.stringify(local));
    } catch {}
  }

  // ── Presence (online user count) ───────────────────────────────
  async function joinPresence() {
    presenceId = 'u_' + Math.random().toString(36).slice(2, 10);
    const entry = { ts: Date.now() };
    let registered = false;
    try {
      const response = await fetch(`${FB_PRESENCE}/${presenceId}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      registered = true;
    } catch (e) {
      console.warn('[presence] registration failed', e);
    }
    if (!registered) return;
    // heartbeat every 30s
    if (presenceHb) clearInterval(presenceHb);
    presenceHb = setInterval(async () => {
      try {
        const response = await fetch(`${FB_PRESENCE}/${presenceId}.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ts: Date.now() }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
      } catch (e) {
        console.warn('[presence] heartbeat failed', e);
      }
    }, 30000);
  }

  async function leavePresence() {
    if (presenceHb) { clearInterval(presenceHb); presenceHb = null; }
    if (!presenceId) return;
    try {
      const response = await fetch(`${FB_PRESENCE}/${presenceId}.json`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (e) {
      console.warn('[presence] removal failed', e);
    }
    presenceId = null;
  }

  async function getOnlineCount() {
    try {
      const res  = await fetch(`${FB_PRESENCE}.json`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data) return 0;
      const now = Date.now();
      return Object.values(data).filter((e) => e && now - e.ts < 90000).length;
    } catch (e) {
      console.warn('[presence] count lookup failed', e);
      return 0;
    }
  }

  function subscribeOnlineCount(callback) {
    if (presenceListener) { presenceListener.close(); presenceListener = null; }
    try {
      presenceListener = new EventSource(`${FB_PRESENCE}.json`);
      const refresh = () => getOnlineCount().then(callback);
      presenceListener.addEventListener('put',   refresh);
      presenceListener.addEventListener('patch', refresh);
      presenceListener.onerror = () => {
        console.warn('[presence] realtime subscription failed.');
        if (presenceListener) { presenceListener.close(); presenceListener = null; }
      };
    } catch (e) {
      console.warn('[presence] realtime subscription could not start', e);
    }
  }

  function unsubscribeOnlineCount() {
    if (presenceListener) { presenceListener.close(); presenceListener = null; }
  }

  async function markSpotFull(code) {
    const target = code || roomCode;
    if (!target) return;
    try {
      await fetch(`${FB_URL}/${target}.json`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'full' }),
      });
    } catch (e) { console.warn('[spots] markSpotFull failed', e); }
  }

  async function removeSpot(code) {
    try {
      const response = await fetch(`${FB_URL}/${code}.json`, { method: 'DELETE', keepalive: true });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (e) {
      spotRegistryAvailable = false;
      console.warn('[spots] remove failed', e);
    }
    try {
      const local = JSON.parse(localStorage.getItem('feltora-open-spots') || '{}');
      delete local[code];
      localStorage.setItem('feltora-open-spots', JSON.stringify(local));
    } catch {}
  }

  async function getOpenSpots() {
    const now = Date.now();
    try {
      const res = await fetch(`${FB_URL}.json`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      spotRegistryAvailable = true;
      const data = await res.json();
      if (!data) return [];
      return Object.values(data).filter((s) => s && now - s.ts < SPOT_TTL && s.status !== 'full');
    } catch (e) {
      spotRegistryAvailable = false;
      console.warn('[spots] fetch failed, using localStorage', e);
      // fallback to localStorage
      try {
        const local = JSON.parse(localStorage.getItem('feltora-open-spots') || '{}');
        return Object.values(local).filter((s) => s && now - s.ts < SPOT_TTL);
      } catch { return []; }
    }
  }

  // Real-time push: subscribe to Firebase SSE so guests see spots instantly
  function subscribeSpots(callback) {
    onSpotsUpdate = callback;
    if (spotsListener) { spotsListener.close(); spotsListener = null; }
    try {
      spotsListener = new EventSource(`${FB_URL}.json`);
      spotsListener.addEventListener('put', (e) => {
        try {
          const payload = JSON.parse(e.data);
          const data = payload.data;
          const now = Date.now();
          const spots = data ? Object.values(data).filter((s) => s && now - s.ts < SPOT_TTL) : [];
          if (onSpotsUpdate) onSpotsUpdate(spots);
        } catch {}
      });
      spotsListener.addEventListener('patch', (e) => {
        // re-fetch on patch for simplicity
        getOpenSpots().then((spots) => { if (onSpotsUpdate) onSpotsUpdate(spots); });
      });
      spotsListener.onerror = () => {
        console.warn('[spots] realtime subscription failed.');
        // SSE failed — fall back to polling in game.js
        if (spotsListener) { spotsListener.close(); spotsListener = null; }
      };
    } catch (e) {
      console.warn('[spots] SSE not supported, polling fallback active', e);
    }
  }

  function unsubscribeSpots() {
    if (spotsListener) { spotsListener.close(); spotsListener = null; }
    onSpotsUpdate = null;
  }

  // ── Destroy ──────────────────────────────────────────────────────
  function destroyPeer() {
    const hostedCode = role === 'host' ? roomCode : null;
    role = null;
    roomCode = null;
    onStateMsg = null;
    onPeerReady = null;
    onPeerLeft = null;
    if (hostedCode) removeSpot(hostedCode);
    if (spotHeartbeat) { clearInterval(spotHeartbeat); spotHeartbeat = null; }
    stopPing();
    onConnectionLost = null;
    onConnectionRestored = null;
    if (audioCall) { try { audioCall.close(); } catch {} audioCall = null; }
    if (voiceTimeout) { clearTimeout(voiceTimeout); voiceTimeout = null; }
    if (conn)      { try { conn.close();      } catch {} conn = null; }
    if (peer)      { try { peer.destroy();    } catch {} peer = null; }
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
    }
    if (remoteAudio) {
      remoteAudio.srcObject = null;
      remoteAudio.remove();
      remoteAudio = null;
    }
    micEnabled = false;
    micIssue = '';
    voiceStreamSent = false;
    voiceActive = false;
    voiceStatus = 'idle';
    voiceError = '';
  }

  function sendData(msg) {
    if (conn && conn.open) {
      try { conn.send(msg); } catch (e) { console.warn('[online] send failed', e); }
    }
  }

  // ── Voice ────────────────────────────────────────────────────────
  async function startMic() {
    if (localStream) return localStream;
    voiceStatus = 'requesting-mic';
    voiceError = '';
    updateVoiceUI();
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone access requires a supported browser and secure connection.');
      }
      localStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
        }
      });
      micEnabled = false;
      micIssue = '';
      localStream.getAudioTracks().forEach((track) => { track.enabled = false; });
      voiceStatus = 'waiting';
      updateVoiceUI();
      return localStream;
    } catch (e) {
      console.warn('[online] mic access denied', e);
      micIssue = e.name === 'NotAllowedError' || e.name === 'SecurityError'
        ? 'mic-blocked'
        : 'mic-unavailable';
      voiceStatus = micIssue;
      voiceError = e.message || 'Check microphone permission and browser settings.';
      updateVoiceUI();
      return null;
    }
  }

  function attachRemoteAudio(stream) {
    if (!remoteAudio) {
      remoteAudio = document.createElement('audio');
      remoteAudio.autoplay = true;
      remoteAudio.style.display = 'none';
      document.body.appendChild(remoteAudio);
    }
    remoteAudio.srcObject = stream;
    voiceActive = true;
    if (voiceTimeout) { clearTimeout(voiceTimeout); voiceTimeout = null; }
    voiceStatus = micIssue || 'connected';
    updateVoiceUI();
    remoteAudio.play().catch((error) => {
      console.warn('[online] remote audio playback was blocked', error);
      voiceStatus = 'tap-to-hear';
      voiceError = 'Tap the microphone control to allow voice audio playback.';
      updateVoiceUI();
    });
  }

  function watchAudioCall(call) {
    if (voiceTimeout) clearTimeout(voiceTimeout);
    voiceStatus = 'connecting';
    voiceError = '';
    updateVoiceUI();
    voiceTimeout = setTimeout(() => {
      voiceTimeout = null;
      if (audioCall !== call || voiceActive) return;
      voiceStatus = 'unavailable';
      voiceError = 'Voice connection timed out. Check both players’ microphone permissions and network.';
      updateVoiceUI();
    }, 20000);
    call.on('stream', (stream) => {
      if (audioCall === call) attachRemoteAudio(stream);
    });
    call.on('close', () => {
      if (audioCall !== call) return;
      if (voiceTimeout) { clearTimeout(voiceTimeout); voiceTimeout = null; }
      audioCall = null;
      voiceActive = false;
      voiceStatus = 'disconnected';
      voiceError = 'Voice connection closed.';
      updateVoiceUI();
    });
    call.on('error', (e) => {
      if (audioCall !== call) return;
      console.warn('[online] call error', e);
      if (voiceTimeout) { clearTimeout(voiceTimeout); voiceTimeout = null; }
      voiceStatus = 'unavailable';
      voiceError = e.message || 'Could not establish the voice connection.';
      updateVoiceUI();
    });
  }

  function callPeer(peerId, replace = false) {
    if (!localStream || !peer || !peerId) return;
    if (audioCall && !replace) return;
    if (audioCall) {
      const previousCall = audioCall;
      audioCall = null;
      previousCall.close();
    }
    try {
      audioCall = peer.call(peerId, localStream);
      voiceStreamSent = true;
      watchAudioCall(audioCall);
    } catch (e) {
      console.warn('[online] could not start voice call', e);
      voiceStatus = 'unavailable';
      voiceError = e.message || 'Could not start the voice connection.';
      updateVoiceUI();
    }
  }

  function answerCall(call) {
    if (audioCall && audioCall !== call) {
      const previousCall = audioCall;
      audioCall = null;
      previousCall.close();
    }
    audioCall = call;
    voiceStreamSent = !!localStream;
    watchAudioCall(call);
    try {
      call.answer(localStream || undefined);
    } catch (e) {
      console.warn('[online] could not answer voice call', e);
      voiceStatus = 'unavailable';
      voiceError = e.message || 'Could not answer the voice connection.';
      updateVoiceUI();
    }
  }

  async function toggleMic() {
    if (voiceStatus === 'tap-to-hear' && remoteAudio) {
      remoteAudio.play().then(() => {
        voiceStatus = localStream ? 'connected' : 'mic-blocked';
        voiceError = '';
        updateVoiceUI();
      }).catch((error) => {
        console.warn('[online] remote audio playback could not start', error);
      });
    }
    if (!localStream && !await startMic()) return;
    micEnabled = !micEnabled;
    localStream.getAudioTracks().forEach((t) => { t.enabled = micEnabled; });
    const retryVoice = voiceStatus === 'unavailable' || voiceStatus === 'disconnected';
    if (micEnabled && role === 'guest' && (!voiceStreamSent || retryVoice)) {
      sendData({ type: 'voice-ready' });
      voiceStatus = 'waiting-host';
      updateVoiceUI();
    } else if (micEnabled && role === 'host' && (!audioCall || retryVoice)) {
      callPeer(conn?.peer, !!audioCall);
    }
    updateVoiceUI();
  }

  function updateVoiceUI() {
    const btn = document.getElementById('voice-toggle-btn');
    if (!btn) return;
    btn.dataset.active = String(voiceActive);
    btn.dataset.muted  = String(!micEnabled);
    const labels = {
      idle: '🎙 Enable mic',
      'requesting-mic': '🎙 Allow mic…',
      waiting: micEnabled ? '🎙 Mic on · finding friend…' : '🎙 Waiting for friend…',
      'waiting-host': micEnabled ? '🎙 Mic on · waiting for host…' : '🎙 Waiting for host…',
      connecting: micEnabled ? '🎙 Mic on · connecting…' : '🎙 Connecting…',
      connected: micEnabled ? '🎙 Mic On' : '🎙 Muted',
      'mic-blocked': '🎙 Mic blocked',
      'mic-unavailable': '🎙 Mic unavailable',
      unavailable: '🎙 Voice unavailable',
      disconnected: '🎙 Voice disconnected',
      'tap-to-hear': '🎙 Tap to hear'
    };
    btn.dataset.status = voiceStatus;
    btn.textContent = labels[voiceStatus] || '🎙 Voice unavailable';
    btn.title = voiceError || 'Voice chat with your online opponent.';
    btn.setAttribute('aria-label', voiceError ? `${labels[voiceStatus]}. ${voiceError}` : labels[voiceStatus]);
    btn.setAttribute('aria-pressed', String(micEnabled));
  }

  // ── Data channel ─────────────────────────────────────────────────
  function startPing() {
    stopPing();
    pingTimer = setInterval(() => {
      if (!conn || !conn.open) return;
      sendData({ type: 'ping', ts: Date.now() });
      // if no pong within 8s, flag connection as lost
      pongTimer = setTimeout(() => {
        pongTimer = null;
        if (onConnectionLost) onConnectionLost();
      }, 8000);
    }, 5000);
  }

  function stopPing() {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
  }

  function wireConn(c, onError, onClose, onOpen) {
    conn = c;
    conn.on('open', () => {
      sendData({
        type: 'hello',
        name:   window._feltoraLocalName   || 'Player',
        avatar: window._feltoraLocalAvatar || 'marlow',
      });
      startPing();
      if (onOpen) onOpen();
    });
    conn.on('data', (msg) => {
      if (msg.type === 'ping') {
        sendData({ type: 'pong', ts: msg.ts });
        return;
      }
      if (msg.type === 'pong') {
        // pong received — connection alive, cancel the lost timer
        if (pongTimer) { clearTimeout(pongTimer); pongTimer = null; }
        if (onConnectionRestored) onConnectionRestored();
        return;
      }
      if (msg.type === 'hello') {
        if (onPeerReady) onPeerReady(msg.name, msg.avatar);
      } else if (msg.type === 'voice-ready') {
        if (role === 'host') callPeer(conn.peer, true);
      } else if (onStateMsg) {
        onStateMsg(msg);
      }
    });
    conn.on('close', () => {
      stopPing();
      if (onClose) onClose();
      else if (onPeerLeft) onPeerLeft();
    });
    conn.on('error', (e) => {
      console.warn('[online] conn error', e);
      stopPing();
      if (onError) onError(e);
    });
  }

  // ── Host ─────────────────────────────────────────────────────────
  async function host(onReady, onPeer, onLeft, onMsg) {
    destroyPeer();
    onPeerReady = onPeer;
    onPeerLeft  = onLeft;
    onStateMsg  = onMsg;
    role = 'host';
    roomCode = genCode();

    peer = new Peer('feltora-' + roomCode, await buildPeerConfig());

    peer.on('open', () => {
      const name   = window._feltoraLocalName   || 'Player';
      const avatar = window._feltoraLocalAvatar || 'marlow';
      publishSpot(roomCode, name, avatar);
      // heartbeat: re-publish every 45s to keep spot alive
      if (spotHeartbeat) clearInterval(spotHeartbeat);
      spotHeartbeat = setInterval(() => {
        if (roomCode && !conn) publishSpot(roomCode, name, avatar);
      }, 45000);
      onReady(roomCode);
    });

    peer.on('connection', (c) => {
      // stop heartbeat immediately — don't wait for data channel open
      if (spotHeartbeat) { clearInterval(spotHeartbeat); spotHeartbeat = null; }
      removeSpot(roomCode);
      wireConn(c, null, null, null);
    });

    peer.on('call', (call) => { answerCall(call); });

    peer.on('error', (e) => {
      console.warn('[online] peer error', e);
      if (e.type === 'unavailable-id') {
        roomCode = genCode();
        peer.destroy();
        host(onReady, onPeer, onLeft, onMsg);
      }
    });
  }

  // ── Guest ────────────────────────────────────────────────────────
  async function join(code, onConnected, onPeer, onLeft, onMsg) {
    destroyPeer();
    onPeerReady = onPeer;
    onPeerLeft  = onLeft;
    onStateMsg  = onMsg;
    role = 'guest';
    roomCode = code.toUpperCase().trim();

    peer = new Peer(undefined, await buildPeerConfig());
    let settled = false;
    let connected = false;
    const timeout = setTimeout(() => fail('timeout'), 30000);
    function fail(reason) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      destroyPeer();
      onConnected(`error:${reason}`);
    }

    peer.on('open', () => {
      const targetId = 'feltora-' + roomCode;
      const c = peer.connect(targetId, { reliable: true, serialization: 'json' });
      wireConn(
        c,
        (error) => fail(error.type || 'connection'),
        () => {
          if (!connected) fail('connection-closed');
          else if (onPeerLeft) onPeerLeft();
        }
      );
      c.on('open', () => {
        if (settled) return;
        connected = true;
        settled = true;
        clearTimeout(timeout);
        onConnected();
      });
    });

    peer.on('call', (call) => { answerCall(call); });

    peer.on('error', (e) => {
      console.warn('[online] join error', e);
      fail(e.type || 'unknown');
    });
  }

  // ── Public API ───────────────────────────────────────────────────
  return {
    host, join,
    send: sendData,
    destroy: destroyPeer,
    onConnectionLost(cb)     { onConnectionLost = cb; },
    onConnectionRestored(cb) { onConnectionRestored = cb; },
    toggleMic, updateVoiceUI,
    markSpotFull,
    isHost()   { return role === 'host'; },
    isGuest()  { return role === 'guest'; },
    isOnline() { return role !== null; },
    getCode()  { return roomCode; },
    startMic,
    getOpenSpots,
    isSpotRegistryAvailable() { return spotRegistryAvailable; },
    subscribeSpots,
    unsubscribeSpots,
    joinPresence,
    leavePresence,
    getOnlineCount,
    subscribeOnlineCount,
    unsubscribeOnlineCount,
  };
})();

window.FeltoraOnline = FeltoraOnline;
