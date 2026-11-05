// FELTORA Firebase — Realtime Database for messages, FeltoraChat, voice notes
// Uses REST API (no SDK import needed — works in plain browser JS)
// apiKey is safe to expose in frontend — Firebase security is handled by Rules

(function() {
  var FB_BASE = 'https://feltora-spots-default-rtdb.firebaseio.com';
  var FB_API_KEY = 'AIzaSyCck0pFu7FuXku8EOUvzX7hRRzpURMebjE';

  function fbUrl(path, token) {
    var url = FB_BASE + path + '.json?key=' + encodeURIComponent(FB_API_KEY);
    if (token) url += '&auth=' + encodeURIComponent(token);
    return url;
  }

  async function fbRequest(path, options) {
    var token = window.FeltoraAuth && window.FeltoraAuth.getIdToken
      ? await window.FeltoraAuth.getIdToken()
      : null;
    var response = await fetch(fbUrl(path, token), options);
    var result = response.status === 204 ? null : await response.json();
    if (!response.ok) {
      var detail = result && result.error ? ': ' + result.error : '';
      throw new Error('Firebase request failed (' + response.status + ')' + detail);
    }
    return result;
  }

  function fbGet(path) {
    return fbRequest(path, { cache: 'no-store' });
  }

  function fbSet(path, data) {
    return fbRequest(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  }

  function fbPush(path, data) {
    return fbRequest(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  }

  function fbUpdate(path, data) {
    return fbRequest(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  }

  function fbDelete(path) {
    return fbRequest(path, { method: 'DELETE' });
  }

  // ── SSE listener (real-time updates) ────────────────────────────
  // Returns an EventSource — call .close() to stop listening
  function fbListen(path, onData) {
    var url = fbUrl(path);
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

  // ── Private DM Messages ──────────────────────────────────────────
  function dmRoomId(uidA, uidB) {
    return [uidA, uidB].sort().join('_');
  }

  async function dmTargetIdentity(username) {
    var auth = window.FeltoraAuth;
    var store = window.FeltoraStore;
    if (!auth || !auth.currentUser() || !auth.uid()) throw new Error('Sign in to use private messages.');
    if (!store || !store.lookupPlayerIdentity) throw new Error('Player lookup is unavailable. Reload and try again.');
    var target = await store.lookupPlayerIdentity(username);
    if (!target || !target.uid || target.uid === auth.uid()) throw new Error('Choose another FELTORA player.');
    return target;
  }

  function sortedMessages(data) {
    return data ? Object.values(data).sort(function(a, b) { return Number(a.ts) - Number(b.ts); }) : [];
  }

  function fbSendDM(toUser, msg) {
    var auth = window.FeltoraAuth;
    return dmTargetIdentity(toUser).then(function(target) {
      var timestamp = Number(msg && msg.ts) || Date.now();
      var payload = Object.assign({}, msg, {
        from: auth.currentUser(),
        fromUid: auth.uid(),
        ts: timestamp
      });
      var roomId = dmRoomId(auth.uid(), target.uid);
      var messageId = timestamp.toString(36) + '-' + Math.random().toString(36).slice(2, 12);
      var updates = {};
      updates['messages/' + roomId + '/' + messageId] = payload;
      updates['messageIndex/' + auth.uid() + '/' + target.uid] = {
        peerUid: target.uid,
        peerUsername: target.username,
        updatedAt: timestamp
      };
      updates['messageIndex/' + target.uid + '/' + auth.uid()] = {
        peerUid: auth.uid(),
        peerUsername: auth.currentUser(),
        updatedAt: timestamp
      };
      return fbUpdate('/', updates);
    });
  }

  function fbGetDMIndex() {
    var auth = window.FeltoraAuth;
    if (!auth || !auth.currentUser() || !auth.uid()) return Promise.reject(new Error('Sign in to open private messages.'));
    return fbGet('/messageIndex/' + auth.uid());
  }

  function fbGetDMs(toUser) {
    var auth = window.FeltoraAuth;
    return dmTargetIdentity(toUser).then(function(target) {
      return fbGet('/messages/' + dmRoomId(auth.uid(), target.uid)).then(sortedMessages);
    });
  }

  function fbListenAuthenticated(path, onData, onError) {
    var closed = false;
    var source = null;
    var errorReported = false;
    var auth = window.FeltoraAuth;
    Promise.resolve().then(function() {
      if (!auth || !auth.currentUser()) throw new Error('Sign in to read private messages.');
      return auth.getIdToken();
    }).then(function(token) {
      if (closed) return;
      source = new EventSource(fbUrl(path, token));
      ['put', 'patch'].forEach(function(eventName) {
        source.addEventListener(eventName, function(event) {
          try {
            var payload = JSON.parse(event.data);
            errorReported = false;
            onData(payload.data, payload.path);
          } catch (error) {
            console.error('Private message update could not be read:', error);
          }
        });
      });
      source.onerror = function() {
        if (closed || !onError || errorReported) return;
        errorReported = true;
        onError(new Error('Private messages could not connect. Check your sign-in and connection.'));
      };
    }).catch(function(error) {
      if (!closed && onError) onError(error);
    });
    return {
      close: function() {
        closed = true;
        if (source) source.close();
      }
    };
  }

  function fbListenDMs(toUser, onMessages, onError) {
    var auth = window.FeltoraAuth;
    if (!auth || !auth.currentUser()) {
      if (onError) onError(new Error('Sign in to read private messages.'));
      return null;
    }
    var closed = false;
    var listener = null;
    dmTargetIdentity(toUser).then(function(target) {
      if (closed) return;
      listener = fbListenAuthenticated('/messages/' + dmRoomId(auth.uid(), target.uid), function(data) {
        onMessages(sortedMessages(data));
      }, onError);
    }).catch(function(error) {
      if (!closed && onError) onError(error);
    });
    return {
      close: function() {
        closed = true;
        if (listener) listener.close();
      }
    };
  }

  // ── FeltoraChat rooms ────────────────────────────────────────────
  function fbSendFChat(roomId, msg) {
    return fbPush('/fchat/' + roomId + '/messages', msg);
  }

  function sortedFChatMessages(data) {
    if (!data || typeof data !== 'object') return [];
    return Object.values(data).filter(function(message) {
      if (!message || typeof message !== 'object' || typeof message.from !== 'string'
          || !message.from.trim() || !Number.isFinite(Number(message.ts)) || Number(message.ts) <= 0) return false;
      var hasText = typeof message.text === 'string' && message.text.trim();
      var hasVoice = typeof message.voice === 'string'
        && /^data:audio\/[a-z0-9.+-]+;base64,/i.test(message.voice);
      return !!(hasText || hasVoice);
    }).sort(function(a, b) { return Number(a.ts) - Number(b.ts); });
  }

  function fbGetFChat(roomId) {
    return fbGet('/fchat/' + roomId + '/messages').then(function(data) {
      return sortedFChatMessages(data);
    });
  }

  function fbListenFChat(roomId, onMessages) {
    return fbListen('/fchat/' + roomId + '/messages', function(data) {
      onMessages(sortedFChatMessages(data));
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
    if (typeof convId === 'string' && convId.indexOf('dm-') === 0) {
      return fbSendDM(convId.slice(3), { from: fromUser, text: '', voice: base64, ts: Date.now() });
    }
    return fbPush('/voicenotes/' + convId, {
      from: fromUser,
      voice: base64,
      text: '',
      ts: Date.now()
    });
  }

  // ── Export ───────────────────────────────────────────────────────
  window.FeltoraFirebase = {
    apiKey: FB_API_KEY,
    // DMs
    sendDM:       fbSendDM,
    getDMs:       fbGetDMs,
    getDMIndex:   fbGetDMIndex,
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
    update: fbUpdate,
    push:   fbPush,
    delete: fbDelete,
    listen: fbListen
  };
})();
