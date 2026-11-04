// ── Community / Clubhouse Feed ───────────────────────────────────
const MAX_POSTS = 120;
let communityFilter = 'all';
let composeType = 'chat';
let pendingWinImage = null;
let communityPosts = [];
let communityLikes = {};
let communityFollows = {};
let communityListener = null;
let communitySupporters = {};
let activeTournament = null;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function communityTimeAgo(ts) {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  return Math.floor(seconds / 86400) + 'd ago';
}

function communityWeekKey(date) {
  const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((value - yearStart) / 86400000) + 1) / 7);
  return value.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
}

function communityRenderLeaderboard(data, week) {
  const container = document.getElementById('weekly-leaderboard');
  const label = document.getElementById('leaderboard-week-label');
  if (!container) return;
  if (label) label.textContent = week;
  const entries = data && typeof data === 'object' ? Object.keys(data).map(function(uid) {
    return Object.assign({ uid: uid }, data[uid]);
  }).filter(function(entry) { return entry && Number(entry.wins) > 0; }) : [];
  entries.sort(function(a, b) { return Number(b.wins) - Number(a.wins) || String(a.username).localeCompare(String(b.username)); });
  const top = entries.slice(0, 5);
  if (!top.length) {
    container.innerHTML = '<p class="leaderboard-empty">No wins recorded this week yet.</p>';
    return;
  }
  container.innerHTML = top.map(function(entry, index) {
    const mascot = window.FeltoraMascots ? window.FeltoraMascots.render(entry.avatar || 'marlow') : '';
    const rank = entry.rank || (window.FeltoraAuth && window.FeltoraAuth.rankForXp
      ? window.FeltoraAuth.rankForXp(entry.xp).name : 'Hustler');
    return '<article class="leaderboard-player">'
      + '<span class="leaderboard-avatar">' + mascot + '</span>'
      + '<span class="leaderboard-rank">#' + (index + 1) + ' · ' + escapeHtml(rank) + '</span>'
      + '<strong>' + escapeHtml(entry.username || 'Player') + '</strong>'
      + '<small>' + Number(entry.wins) + (Number(entry.wins) === 1 ? ' win' : ' wins') + '</small>'
      + '</article>';
  }).join('');
}

function communityRenderTournament(tournament) {
  const card = document.getElementById('tournament-card');
  if (!card) return;
  activeTournament = tournament && typeof tournament === 'object'
    && typeof tournament.title === 'string' && typeof tournament.description === 'string'
    ? tournament : null;
  card.hidden = !activeTournament;
  if (!activeTournament) return;
  document.getElementById('tournament-title').textContent = activeTournament.title.slice(0, 80);
  document.getElementById('tournament-description').textContent = activeTournament.description.slice(0, 500);
  const ends = Date.parse(activeTournament.endsAt || '');
  document.getElementById('tournament-ends').textContent = Number.isFinite(ends)
    ? 'Ends ' + new Date(ends).toLocaleString() : '';
  document.getElementById('tournament-join').disabled = typeof activeTournament.hostUid !== 'string'
    || !activeTournament.hostUid;
}

function communityLoadExtras() {
  if (!window.FeltoraFirebase) return;
  const week = communityWeekKey(new Date());
  window.FeltoraFirebase.get('/leaderboard/weekly/' + week).then(function(data) {
    communityRenderLeaderboard(data, week);
  }).catch(function(error) {
    console.warn('Weekly leaderboard could not load:', error);
    communityRenderLeaderboard(null, week);
  });
  window.FeltoraFirebase.get('/supporters').then(function(data) {
    communitySupporters = data && typeof data === 'object' ? data : {};
    communityRenderFeed();
  }).catch(function(error) {
    console.warn('Supporter badges could not load:', error);
  });
  window.FeltoraFirebase.get('/tournament/active').then(communityRenderTournament).catch(function(error) {
    console.warn('Tournament announcement could not load:', error);
  });
}

function communityApplyData(data) {
  const source = data && typeof data === 'object' ? data : {};
  const posts = source.posts && typeof source.posts === 'object' ? source.posts : {};
  communityPosts = Object.keys(posts)
    .map(function(id) { return Object.assign({ id: id }, posts[id]); })
    .sort(function(a, b) { return (b.ts || 0) - (a.ts || 0); })
    .slice(0, MAX_POSTS);
  communityLikes = source.likes && typeof source.likes === 'object' ? source.likes : {};
  communityFollows = source.follows && typeof source.follows === 'object' ? source.follows : {};
  communityRenderFeed();
  communityLoadExtras();
}

function communityRefresh() {
  if (!window.FeltoraFirebase) return Promise.reject(new Error('Community service is unavailable.'));
  return window.FeltoraFirebase.get('/community').then(function(data) {
    communityApplyData(data);
    return communityPosts;
  });
}

function communityShowStatus(message) {
  const status = document.getElementById('community-status');
  if (!status) return;
  status.textContent = message || '';
  status.hidden = !message;
}

function communityErrorMessage(error) {
  const message = String(error && error.message || error || '');
  if (/401.*permission denied|permission denied.*401|PERMISSION_DENIED/i.test(message)) {
    return 'Firebase is denying Community reads. Publish firebase-rules.json to the Realtime Database configured for this app.';
  }
  return 'Community could not load. Check your connection and try again.';
}

function communityRequireAccount(action) {
  if (window.FeltoraAuth && window.FeltoraAuth.currentUser() && window.FeltoraAuth.uid()) return true;
  const nudge = document.getElementById('community-auth-nudge');
  const message = document.getElementById('community-auth-nudge-text');
  if (message) message.textContent = 'Sign in to ' + action + '. You can keep browsing the feed as a guest.';
  if (nudge) {
    nudge.hidden = false;
    nudge.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  return false;
}

function communityRenderFeed() {
  const feed = document.getElementById('community-feed');
  const empty = document.getElementById('feed-empty');
  const newPostBtn = document.getElementById('community-new-post');
  if (!feed) return;

  const me = window.FeltoraAuth && window.FeltoraAuth.currentUser();
  const uid = window.FeltoraAuth && window.FeltoraAuth.uid();
  if (newPostBtn) newPostBtn.textContent = me ? '+ Post' : 'Sign in to post';

  const filtered = communityFilter === 'all'
    ? communityPosts
    : communityPosts.filter(function(post) { return post.type === communityFilter; });
  if (!filtered.length) {
    feed.innerHTML = '';
    if (empty) empty.hidden = false;
    return;
  }

  if (empty) empty.hidden = true;
  const typeLabel = { win: '🏆 Win', bug: '🐛 Bug', idea: '💡 Idea', chat: '💬 Chat' };
  feed.innerHTML = filtered.map(function(post) {
    const likes = communityLikes[post.id] && typeof communityLikes[post.id] === 'object'
      ? communityLikes[post.id]
      : {};
    const liked = !!(uid && likes[uid]);
    const followed = !!(uid && communityFollows[uid] && communityFollows[uid][post.authorUid]);
    const canDelete = !!(uid && post.authorUid === uid);
    const label = typeLabel[post.type] || typeLabel.chat;
    const deleteBtn = canDelete
      ? '<button class="feed-delete" data-id="' + escapeHtml(post.id) + '" title="Delete" aria-label="Delete post">&#x2715;</button>'
      : '';
    const image = typeof post.image === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(post.image)
      ? '<img class="feed-win-img" src="' + escapeHtml(post.image) + '" alt="Win screenshot" loading="lazy">'
      : '';
    const heart = liked ? '&#x2764;&#xFE0F;' : '&#x1F90D;';
    const followBtn = me && post.authorUid !== uid
      ? '<button class="feed-follow-btn' + (followed ? ' following' : '') + '" data-author-uid="' + escapeHtml(post.authorUid || '') + '" data-author="' + escapeHtml(post.author || '') + '" aria-pressed="' + followed + '">'
        + (followed ? 'Following' : '+ Follow') + '</button>'
      : '';
    const supporter = communitySupporters[post.authorUid];
    const supporterValid = supporter && Number(supporter.tier) > 0
      && (!supporter.expiresAt || Number(supporter.expiresAt) > Date.now());
    const supporterIcon = supporterValid
      ? ['', '⭐', '🔥', '👻', '👑'][Math.min(4, Number(supporter.tier))]
      : '';
    const rankName = post.rank || (window.FeltoraAuth && window.FeltoraAuth.rankForXp
      ? window.FeltoraAuth.rankForXp(post.xp).name : 'Hustler');
    const challengeBtn = me && uid && post.authorUid && post.authorUid !== uid
      ? '<button class="feed-challenge-btn" data-challenge-author="' + escapeHtml(post.author || '') + '">Challenge</button>'
      : '';

    return '<article class="feed-card" data-id="' + escapeHtml(post.id) + '">'
      + '<div class="feed-card-top">'
      + '<span class="feed-type-badge feed-type-' + escapeHtml(post.type || 'chat') + '">' + label + '</span>'
      + '<span class="feed-meta">' + escapeHtml(post.author || 'Player') + ' <span class="verified-badge" title="Registered player">&#x2714;</span>'
      + '<span class="community-rank-badge">' + escapeHtml(rankName) + '</span>'
      + (supporterIcon ? '<span class="community-supporter-badge" title="FELTORA supporter">' + supporterIcon + '</span>' : '')
      + ' &middot; ' + communityTimeAgo(post.ts || Date.now()) + '</span>'
      + deleteBtn
      + '</div>'
      + image
      + '<p class="feed-body">' + escapeHtml(post.body || '') + '</p>'
      + '<div class="feed-card-footer">'
      + followBtn
      + challengeBtn
      + '<button class="feed-like-btn' + (liked ? ' liked' : '') + '" data-id="' + escapeHtml(post.id) + '" title="' + (me ? 'Like post' : 'Sign in to like') + '" aria-label="' + (me ? (liked ? 'Unlike post' : 'Like post') : 'Sign in to like') + '" aria-pressed="' + liked + '">'
      + heart + ' <span>' + Object.keys(likes).length + '</span>'
      + '</button>'
      + '</div>'
      + '</article>';
  }).join('');
}

async function communityPost(body, type, image) {
  const me = window.FeltoraAuth && window.FeltoraAuth.currentUser();
  const uid = window.FeltoraAuth && window.FeltoraAuth.uid();
  if (!me || !uid || !body.trim()) return false;
  if (!['win', 'bug', 'idea', 'chat'].includes(type)) throw new Error('Choose a valid post type.');

  const post = {
    authorUid: uid,
    author: me,
    body: body.trim().slice(0, 280),
    xp: (window.FeltoraAuth.getAccount(me) || {}).xp || 0,
    rank: (window.FeltoraAuth.rankForXp((window.FeltoraAuth.getAccount(me) || {}).xp || 0)).name,
    type: type,
    ts: Date.now()
  };
  if (typeof image === 'string' && image.length <= 150000
      && /^data:image\/(png|jpeg|webp);base64,/.test(image)) post.image = image;

  await window.FeltoraFirebase.push('/community/posts', post);
  await communityRefresh();
  return true;
}

async function communityRecordWin() {
  const auth = window.FeltoraAuth;
  const firebase = window.FeltoraFirebase;
  const username = auth && auth.currentUser();
  const uid = auth && auth.uid();
  if (!username || !uid || !firebase) return false;
  const account = auth.getAccount(username) || {};
  const week = communityWeekKey(new Date());
  const path = '/leaderboard/weekly/' + week + '/' + encodeURIComponent(uid);
  const existing = await firebase.get(path);
  const entry = {
    username: username,
    avatar: account.avatar || 'marlow',
    xp: Number(account.xp) || 0,
    rank: auth.rankForXp(Number(account.xp) || 0).name,
    wins: Math.max(0, Number(existing && existing.wins) || 0) + 1,
    updatedAt: Date.now()
  };
  await firebase.set(path, entry);
  communityLoadExtras();
  return true;
}

window.FeltoraCommunity = {
  refresh: communityRefresh,
  getPosts: function() { return communityPosts.slice(); },
  recordWin: communityRecordWin
};

const communityFeed = document.getElementById('community-feed');
communityFeed.addEventListener('click', async function(event) {
  const likeBtn = event.target.closest('.feed-like-btn');
  const delBtn = event.target.closest('.feed-delete');
  const followBtn = event.target.closest('.feed-follow-btn');
  const challengeBtn = event.target.closest('.feed-challenge-btn');
  const tournamentJoin = event.target.closest('#tournament-join');
  if (!likeBtn && !delBtn && !followBtn && !challengeBtn && !tournamentJoin) return;

  if (!communityRequireAccount(challengeBtn ? 'challenge another player' : tournamentJoin ? 'join the tournament' : 'interact with the community')) return;
  const uid = window.FeltoraAuth.uid();
  const firebase = window.FeltoraFirebase;
  try {
    if (likeBtn) {
      const postId = likeBtn.dataset.id;
      const liked = !!(communityLikes[postId] && communityLikes[postId][uid]);
      const path = '/community/likes/' + encodeURIComponent(postId) + '/' + encodeURIComponent(uid);
      if (liked) await firebase.delete(path);
      else await firebase.set(path, true);
    } else if (delBtn) {
      await firebase.delete('/community/posts/' + encodeURIComponent(delBtn.dataset.id));
    } else if (followBtn) {
      const followedUid = followBtn.dataset.authorUid;
      if (!followedUid) return;
      const followed = !!(communityFollows[uid] && communityFollows[uid][followedUid]);
      const path = '/community/follows/' + encodeURIComponent(uid) + '/' + encodeURIComponent(followedUid);
      if (followed) await firebase.delete(path);
      else {
        await firebase.set(path, true);
        if (window.FeltoraPhone) window.FeltoraPhone.addFriend(followBtn.dataset.author);
      }
    } else if (challengeBtn) {
      const username = challengeBtn.dataset.challengeAuthor;
      if (!username || username === window.FeltoraAuth.currentUser()) return;
      await firebase.sendDM(username, {
        from: window.FeltoraAuth.currentUser(),
        text: '⚡ ' + window.FeltoraAuth.currentUser() + ' challenges you to a game!',
        ts: Date.now()
      });
      communityShowStatus('Game challenge sent to @' + username + '.');
    } else if (tournamentJoin && activeTournament && activeTournament.hostUid) {
      if (activeTournament.hostUid === uid) {
        communityShowStatus('You are hosting this tournament.');
        return;
      }
      const host = await firebase.get('/profiles/' + encodeURIComponent(activeTournament.hostUid));
      if (!host || typeof host.username !== 'string') throw new Error('Tournament host profile is unavailable.');
      await firebase.sendDM(host.username, {
        from: window.FeltoraAuth.currentUser(),
        text: '⚡ ' + window.FeltoraAuth.currentUser() + ' would like to join "' + activeTournament.title.slice(0, 80) + '".',
        ts: Date.now()
      });
      communityShowStatus('Message sent to the tournament host.');
    }
    if (!challengeBtn && !tournamentJoin) {
      await communityRefresh();
      communityShowStatus('');
    }
  } catch (error) {
    console.error('Community action failed:', error);
    communityShowStatus('That action could not be saved. Check your connection and try again.');
  }
});

document.getElementById('community-auth-signin').addEventListener('click', function() {
  document.getElementById('community-auth-nudge').hidden = true;
  if (typeof showScreen === 'function') showScreen('auth');
});

document.getElementById('community-auth-dismiss').addEventListener('click', function() {
  document.getElementById('community-auth-nudge').hidden = true;
});

document.querySelectorAll('.community-tab').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.community-tab').forEach(function(tab) { tab.classList.remove('active'); });
    btn.classList.add('active');
    communityFilter = btn.dataset.feed;
    communityRenderFeed();
  });
});

const composePanel = document.getElementById('community-compose');
document.getElementById('community-new-post').addEventListener('click', function() {
  if (!communityRequireAccount('post')) return;
  pendingWinImage = null;
  composePanel.hidden = false;
  document.getElementById('compose-text').focus();
  composePanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});

document.getElementById('compose-cancel').addEventListener('click', function() {
  composePanel.hidden = true;
  document.getElementById('compose-text').value = '';
  document.getElementById('compose-chars').textContent = '280';
  pendingWinImage = null;
});

document.getElementById('compose-text').addEventListener('input', function(event) {
  document.getElementById('compose-chars').textContent = String(280 - event.target.value.length);
});

document.querySelectorAll('.compose-type-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.compose-type-btn').forEach(function(typeBtn) { typeBtn.classList.remove('active'); });
    btn.classList.add('active');
    composeType = btn.dataset.type;
  });
});

document.getElementById('compose-submit').addEventListener('click', async function() {
  const body = document.getElementById('compose-text').value;
  if (!body.trim()) { document.getElementById('compose-text').focus(); return; }
  const submitBtn = document.getElementById('compose-submit');
  submitBtn.disabled = true;
  try {
    await communityPost(body, composeType, pendingWinImage);
    composePanel.hidden = true;
    document.getElementById('compose-text').value = '';
    document.getElementById('compose-chars').textContent = '280';
    pendingWinImage = null;
    communityShowStatus('');
    if (typeof announceGameAction === 'function') announceGameAction('Posted to the Clubhouse!', 2500);
  } catch (error) {
    console.error('Community post failed:', error);
    communityShowStatus('Your post could not be published. Check your connection and try again.');
  } finally {
    submitBtn.disabled = false;
  }
});

document.getElementById('community-back').addEventListener('click', function() {
  if (typeof showScreen === 'function') showScreen('lobby');
});

const communityResultBtn = document.getElementById('btn-post-community');
if (communityResultBtn) {
  communityResultBtn.addEventListener('click', function() {
    if (typeof showScreen === 'function') showScreen('community');
    communityRenderFeed();
    const won = typeof winner !== 'undefined' && winner !== null && winner !== -1
      && (typeof onlineRole !== 'undefined' && onlineRole === 'guest' ? winner === 1 : winner === 0);
    if (!won) return;
    composeType = 'win';
    document.querySelectorAll('.compose-type-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.type === 'win');
    });
    if (!communityRequireAccount('share a win')) {
      communityShowStatus('Sign in or create an account to share your win.');
      return;
    }
    composePanel.hidden = false;
    document.getElementById('compose-text').value = 'Just won a match on FELTORA!';
    document.getElementById('compose-chars').textContent = String(280 - 30);
  });
}

document.addEventListener('DOMContentLoaded', function() {
  communityLoadExtras();
  if (!window.FeltoraFirebase) {
    communityShowStatus('Community could not connect. Please try again later.');
    return;
  }

  communityListener = window.FeltoraFirebase.listen('/community', function() {
    communityRefresh().catch(function(error) {
      console.error('Community refresh failed:', error);
      communityShowStatus(communityErrorMessage(error));
    });
  });
  communityRefresh().catch(function(error) {
    console.error('Community load failed:', error);
    communityShowStatus(communityErrorMessage(error));
  });
});
