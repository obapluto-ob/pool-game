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
  let voiceActive = false;
  let spotHeartbeat = null;

  // ── Code generator ───────────────────────────────────────────────
  function genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  // ── PeerJS config ────────────────────────────────────────────────
  // Metered TURN — handles strict NAT (mobile networks, corporate WiFi)
  const METERED_USERNAME   = 'fa204cf077001153a288e315';
  const METERED_CREDENTIAL = 'ThTKuVAdTjnnzRet';
  const PEER_CONFIG = {
    host: '0.peerjs.com', port: 443, path: '/', secure: true,
    config: {
      iceServers: [
        { urls: 'stun:stun.relay.metered.ca:80' },
        { urls: 'turn:global.relay.metered.ca:80',                  username: METERED_USERNAME, credential: METERED_CREDENTIAL },
        { urls: 'turn:global.relay.metered.ca:80?transport=tcp',    username: METERED_USERNAME, credential: METERED_CREDENTIAL },
        { urls: 'turn:global.relay.metered.ca:443',                 username: METERED_USERNAME, credential: METERED_CREDENTIAL },
        { urls: 'turns:global.relay.metered.ca:443?transport=tcp',  username: METERED_USERNAME, credential: METERED_CREDENTIAL },
      ],
      iceCandidatePoolSize: 10
    },
    debug: 0,
    pingInterval: 3000,
  };

  // ── Spots registry (Firebase Realtime Database REST API) ────────
  // Free project — public read/write rules set to true.
  // Uses REST so no SDK needed. Real-time via SSE (EventSource).
  const FB_URL      = 'https://feltora-spots-default-rtdb.firebaseio.com/spots';
  const FB_PRESENCE = 'https://feltora-spots-default-rtdb.firebaseio.com/presence';
  const SPOT_TTL = 120000;
  let spotsListener    = null; // EventSource for real-time push
  let presenceListener = null; // EventSource for online count
  let onSpotsUpdate    = null; // callback(spots[]) set by game.js
  let presenceId       = null; // this session's presence key
  let presenceHb       = null; // heartbeat interval

  async function publishSpot(code, name, avatar) {
    const spot = { code, name, avatar, ts: Date.now() };
    try {
      await fetch(`${FB_URL}/${code}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(spot),
      });
    } catch (e) { console.warn('[spots] publish failed', e); }
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
    try {
      await fetch(`${FB_PRESENCE}/${presenceId}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
    } catch {}
    // heartbeat every 30s
    if (presenceHb) clearInterval(presenceHb);
    presenceHb = setInterval(async () => {
      try {
        await fetch(`${FB_PRESENCE}/${presenceId}.json`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ts: Date.now() }),
        });
      } catch {}
    }, 30000);
  }

  async function leavePresence() {
    if (presenceHb) { clearInterval(presenceHb); presenceHb = null; }
    if (!presenceId) return;
    try { await fetch(`${FB_PRESENCE}/${presenceId}.json`, { method: 'DELETE' }); } catch {}
    presenceId = null;
  }

  async function getOnlineCount() {
    try {
      const res  = await fetch(`${FB_PRESENCE}.json`, { cache: 'no-store' });
      const data = await res.json();
      if (!data) return 0;
      const now = Date.now();
      return Object.values(data).filter((e) => e && now - e.ts < 90000).length;
    } catch { return 0; }
  }

  function subscribeOnlineCount(callback) {
    if (presenceListener) { presenceListener.close(); presenceListener = null; }
    try {
      presenceListener = new EventSource(`${FB_PRESENCE}.json`);
      const refresh = () => getOnlineCount().then(callback);
      presenceListener.addEventListener('put',   refresh);
      presenceListener.addEventListener('patch', refresh);
      presenceListener.onerror = () => {
        if (presenceListener) { presenceListener.close(); presenceListener = null; }
      };
    } catch {}
  }

  function unsubscribeOnlineCount() {
    if (presenceListener) { presenceListener.close(); presenceListener = null; }
  }

  async function removeSpot(code) {
    try {
      await fetch(`${FB_URL}/${code}.json`, { method: 'DELETE', keepalive: true });
    } catch (e) { console.warn('[spots] remove failed', e); }
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
      const data = await res.json();
      if (!data) return [];
      return Object.values(data).filter((s) => s && now - s.ts < SPOT_TTL);
    } catch (e) {
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
    if (audioCall) { try { audioCall.close(); } catch {} audioCall = null; }
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
    voiceActive = false;
  }

  function sendData(msg) {
    if (conn && conn.open) {
      try { conn.send(msg); } catch (e) { console.warn('[online] send failed', e); }
    }
  }

  // ── Voice ────────────────────────────────────────────────────────
  async function startMic() {
    if (localStream) return localStream;
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000,
        }
      });
      return localStream;
    } catch (e) {
      console.warn('[online] mic access denied', e);
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
    updateVoiceUI();
  }

  async function callPeer(peerId) {
    const stream = await startMic();
    if (!stream || !peer) return;
    audioCall = peer.call(peerId, stream);
    audioCall.on('stream', attachRemoteAudio);
    audioCall.on('close', () => { voiceActive = false; updateVoiceUI(); });
    audioCall.on('error', (e) => console.warn('[online] call error', e));
  }

  function answerCall(call) {
    startMic().then((stream) => {
      if (!stream) { call.answer(); return; }
      call.answer(stream);
    });
    call.on('stream', attachRemoteAudio);
    call.on('close', () => { voiceActive = false; updateVoiceUI(); });
    audioCall = call;
  }

  function toggleMic() {
    if (!localStream) return;
    micEnabled = !micEnabled;
    localStream.getAudioTracks().forEach((t) => { t.enabled = micEnabled; });
    updateVoiceUI();
  }

  function updateVoiceUI() {
    const btn = document.getElementById('voice-toggle-btn');
    if (!btn) return;
    btn.dataset.active = String(voiceActive);
    btn.dataset.muted  = String(!micEnabled);
    btn.textContent    = !voiceActive ? '🎙 Connecting…' : micEnabled ? '🎙 Mic On' : '🎙 Muted';
    btn.setAttribute('aria-pressed', String(micEnabled));
  }

  // ── Data channel ─────────────────────────────────────────────────
  function wireConn(c, onError, onClose, onOpen) {
    conn = c;
    conn.on('open', () => {
      sendData({
        type: 'hello',
        name:   window._feltoraLocalName   || 'Player',
        avatar: window._feltoraLocalAvatar || 'marlow',
      });
      if (onOpen) onOpen();
    });
    conn.on('data', (msg) => {
      if (msg.type === 'hello') {
        if (onPeerReady) onPeerReady(msg.name, msg.avatar);
        if (role === 'host') callPeer(conn.peer);
      } else if (onStateMsg) {
        onStateMsg(msg);
      }
    });
    conn.on('close', () => {
      if (onClose) onClose();
      else if (onPeerLeft) onPeerLeft();
    });
    conn.on('error', (e) => {
      console.warn('[online] conn error', e);
      if (onError) onError(e);
    });
  }

  // ── Host ─────────────────────────────────────────────────────────
  function host(onReady, onPeer, onLeft, onMsg) {
    destroyPeer();
    onPeerReady = onPeer;
    onPeerLeft  = onLeft;
    onStateMsg  = onMsg;
    role = 'host';
    roomCode = genCode();

    peer = new Peer('feltora-' + roomCode, PEER_CONFIG);

    peer.on('open', () => {
      const name   = window._feltoraLocalName   || 'Player';
      const avatar = window._feltoraLocalAvatar || 'marlow';
      publishSpot(roomCode, name, avatar);
      // heartbeat: re-publish every 45s to keep spot alive
      if (spotHeartbeat) clearInterval(spotHeartbeat);
      spotHeartbeat = setInterval(() => {
        if (roomCode) publishSpot(roomCode, name, avatar);
      }, 45000);
      onReady(roomCode);
    });

    peer.on('connection', (c) => {
      wireConn(c, null, null, () => {
        removeSpot(roomCode);
        if (spotHeartbeat) { clearInterval(spotHeartbeat); spotHeartbeat = null; }
      });
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
  function join(code, onConnected, onPeer, onLeft, onMsg) {
    destroyPeer();
    onPeerReady = onPeer;
    onPeerLeft  = onLeft;
    onStateMsg  = onMsg;
    role = 'guest';
    roomCode = code.toUpperCase().trim();

    peer = new Peer(undefined, PEER_CONFIG);
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
    toggleMic, updateVoiceUI,
    isHost()   { return role === 'host'; },
    isGuest()  { return role === 'guest'; },
    isOnline() { return role !== null; },
    getCode()  { return roomCode; },
    startMic,
    getOpenSpots,
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
