// FELTORA Firebase — Realtime Database for messages, FeltoraChat, voice notes
// Uses REST API (no SDK import needed — works in plain browser JS)
// apiKey is safe to expose in frontend — Firebase security is handled by Rules

(function() {
  var FB_BASE = 'https://feltora-spots-default-rtdb.firebaseio.com';
  var FB_API_KEY = 'AIzaSyCck0pFu7FuXku8EOUvzX7hRRzpURMebjE';

  // Append ?auth=apiKey to all requests — works with public rules
  function fbUrl(path) {
    return FB_BASE + path + '.json?auth=' + FB_API_KEY;
  }

  // ── Generic REST helpers ─────────────────────────────────────────
  function fbGet(path) {
    return fetch(fbUrl(path), { cache: 'no-store' }).then(function(r) { return r.json(); });
  }

  function fbSet(path, data) {
    return fetch(fbUrl(path), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function(r) { return r.json(); });
  }

  function fbPush(path, data) {
    return fetch(fbUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(function(r) { return r.json(); });
  }

  function fbDelete(path) {
    return fetch(fbUrl(path), { method: 'DELETE' });
  }

  // ── SSE listener (real-time updates) ────────────────────────────
  // Returns an EventSource — call .close() to stop listening
  function fbListen(path, onData) {
    var url = FB_BASE + path + '.json?auth=' + FB_API_KEY;
    var es = new EventSource(url);
    es.addEventListener('put', function(e) {
      try {
        var payload = JSON.parse(e.data);
        onData(payload.data, payload.path);
      } catch(err) {}
    });
    es.addEventListener('patch', function(e) {
      try {
        var payload = JSON.parse(e.data);
        onData(payload.data, payload.path);
      } catch(err) {}
    });
    es.onerror = function() {
      // silently reconnect — EventSource does this automatically
    };
    return es;
  }

  // ── DM Messages ─────────────────────────────────────────────────
  // path: /messages/{userA}_{userB}  (sorted alphabetically so both sides match)
  function dmRoomId(userA, userB) {
    return [userA, userB].sort().join('_');
  }

  function fbSendDM(toUser, msg) {
    var me = window.FeltoraAuth && window.FeltoraAuth.currentUser();
    if (!me) return Promise.reject('not logged in');
    var roomId = dmRoomId(me, toUser);
    return fbPush('/messages/' + roomId, msg);
  }

  function fbGetDMs(toUser) {
    var me = window.FeltoraAuth && window.FeltoraAuth.currentUser();
    if (!me) return Promise.resolve([]);
    var roomId = dmRoomId(me, toUser);
    return fbGet('/messages/' + roomId).then(function(data) {
      if (!data) return [];
      // Firebase returns object with push keys — convert to sorted array
      return Object.values(data).sort(function(a, b) { return a.ts - b.ts; });
    });
  }

  function fbListenDMs(toUser, onMessages) {
    var me = window.FeltoraAuth && window.FeltoraAuth.currentUser();
    if (!me) return null;
    var roomId = dmRoomId(me, toUser);
    return fbListen('/messages/' + roomId, function(data) {
      if (!data) { onMessages([]); return; }
      var msgs = Object.values(data).sort(function(a, b) { return a.ts - b.ts; });
      onMessages(msgs);
    });
  }

  // ── FeltoraChat rooms ────────────────────────────────────────────
  function fbSendFChat(roomId, msg) {
    return fbPush('/fchat/' + roomId + '/messages', msg);
  }

  function fbGetFChat(roomId) {
    return fbGet('/fchat/' + roomId + '/messages').then(function(data) {
      if (!data) return [];
      return Object.values(data).sort(function(a, b) { return a.ts - b.ts; });
    });
  }

  function fbListenFChat(roomId, onMessages) {
    return fbListen('/fchat/' + roomId + '/messages', function(data) {
      if (!data) { onMessages([]); return; }
      var msgs = Object.values(data).sort(function(a, b) { return a.ts - b.ts; });
      onMessages(msgs);
    });
  }

  // ── Online presence ──────────────────────────────────────────────
  function fbSetOnline(username) {
    if (!username) return;
    return fbSet('/online/' + username, { ts: Date.now(), online: true });
  }

  function fbGetOnlineUsers() {
    return fbGet('/online').then(function(data) {
      if (!data) return {};
      var now = Date.now();
      var result = {};
      Object.keys(data).forEach(function(u) {
        result[u] = data[u].online && (now - data[u].ts) < 120000;
      });
      return result;
    });
  }

  // ── Reactions ────────────────────────────────────────────────────
  function fbAddReaction(convId, msgTs, emoji) {
    var me = (window.FeltoraAuth && window.FeltoraAuth.currentUser()) || 'Guest';
    return fbSet('/reactions/' + convId + '/' + msgTs + '/' + me, emoji);
  }

  function fbGetReactions(convId) {
    return fbGet('/reactions/' + convId);
  }

  // ── Voice notes (base64 stored in Firebase, not localStorage) ───
  // Voice notes go under /voicenotes/{roomId}/{pushKey}
  function fbSaveVoiceNote(convId, base64, fromUser) {
    return fbPush('/voicenotes/' + convId, {
      from: fromUser,
      voice: base64,
      text: '',
      ts: Date.now()
    });
  }

  // ── Export ───────────────────────────────────────────────────────
  window.FeltoraFirebase = {
    // DMs
    sendDM:       fbSendDM,
    getDMs:       fbGetDMs,
    listenDMs:    fbListenDMs,
    dmRoomId:     dmRoomId,
    // FeltoraChat
    sendFChat:    fbSendFChat,
    getFChat:     fbGetFChat,
    listenFChat:  fbListenFChat,
    // Presence
    setOnline:    fbSetOnline,
    getOnlineUsers: fbGetOnlineUsers,
    // Reactions
    addReaction:  fbAddReaction,
    getReactions: fbGetReactions,
    // Voice notes
    saveVoiceNote: fbSaveVoiceNote,
    // Raw helpers (for online.js to use too)
    get:    fbGet,
    set:    fbSet,
    push:   fbPush,
    delete: fbDelete,
    listen: fbListen
  };
})();
