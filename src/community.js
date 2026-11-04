// ── Community / Clubhouse Feed ───────────────────────────────────
const MAX_POSTS = 120;
let communityFilter = 'all';
let composeType = 'chat';
let pendingWinImage = null;
let communityPosts = [];
let communityLikes = {};
let communityFollows = {};
let communityListener = null;

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

function communityRequireAccount(action) {
  if (window.FeltoraAuth && window.FeltoraAuth.currentUser() && window.FeltoraAuth.uid()) return true;
  const loginError = document.getElementById('login-error');
  if (loginError) {
    loginError.textContent = 'Sign in or create an account to ' + action + '.';
    loginError.hidden = false;
  }
  if (typeof showScreen === 'function') showScreen('auth');
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

    return '<article class="feed-card" data-id="' + escapeHtml(post.id) + '">'
      + '<div class="feed-card-top">'
      + '<span class="feed-type-badge feed-type-' + escapeHtml(post.type || 'chat') + '">' + label + '</span>'
      + '<span class="feed-meta">' + escapeHtml(post.author || 'Player') + ' <span class="verified-badge" title="Registered player">&#x2714;</span> &middot; ' + communityTimeAgo(post.ts || Date.now()) + '</span>'
      + deleteBtn
      + '</div>'
      + image
      + '<p class="feed-body">' + escapeHtml(post.body || '') + '</p>'
      + '<div class="feed-card-footer">'
      + followBtn
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
    type: type,
    ts: Date.now()
  };
  if (typeof image === 'string' && image.length <= 150000
      && /^data:image\/(png|jpeg|webp);base64,/.test(image)) post.image = image;

  await window.FeltoraFirebase.push('/community/posts', post);
  await communityRefresh();
  return true;
}

window.FeltoraCommunity = {
  refresh: communityRefresh,
  getPosts: function() { return communityPosts.slice(); }
};

const communityFeed = document.getElementById('community-feed');
communityFeed.addEventListener('click', async function(event) {
  const likeBtn = event.target.closest('.feed-like-btn');
  const delBtn = event.target.closest('.feed-delete');
  const followBtn = event.target.closest('.feed-follow-btn');
  if (!likeBtn && !delBtn && !followBtn) return;

  if (!communityRequireAccount('interact with the community')) return;
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
    }
    await communityRefresh();
    communityShowStatus('');
  } catch (error) {
    console.error('Community action failed:', error);
    communityShowStatus('That action could not be saved. Check your connection and try again.');
  }
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
  if (!window.FeltoraFirebase) {
    communityShowStatus('Community could not connect. Please try again later.');
    return;
  }

  communityListener = window.FeltoraFirebase.listen('/community', function() {
    communityRefresh().catch(function(error) {
      console.error('Community refresh failed:', error);
      communityShowStatus('Community could not refresh. Check your connection.');
    });
  });
  communityRefresh().catch(function(error) {
    console.error('Community load failed:', error);
    communityShowStatus('Community could not load. Check your connection and try again.');
  });
});
