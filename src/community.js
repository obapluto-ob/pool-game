// ── Community / Clubhouse Feed ───────────────────────────────────
const COMMUNITY_KEY = 'feltora-community-posts';
const MAX_POSTS = 120;
let communityFilter = 'all';
let composeType = 'chat';
let pendingWinImage = null;

function communityLoad() {
  try { return JSON.parse(localStorage.getItem(COMMUNITY_KEY) || '[]'); } catch (e) { return []; }
}
function communitySave(posts) {
  try { localStorage.setItem(COMMUNITY_KEY, JSON.stringify(posts.slice(0, MAX_POSTS))); } catch (e) {}
}
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function communityTimeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

function communityRenderFeed() {
  const feed = document.getElementById('community-feed');
  const empty = document.getElementById('feed-empty');
  if (!feed) return;
  const posts = communityLoad();
  const filtered = communityFilter === 'all'
    ? posts
    : posts.filter(function(p) { return p.type === communityFilter; });
  if (!filtered.length) {
    feed.innerHTML = '';
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;
  const me = (window.FeltoraAuth && window.FeltoraAuth.currentUser()) || null;
  const typeLabel = { win: '🏆 Win', bug: '🐛 Bug', idea: '💡 Idea', chat: '💬 Chat' };
  feed.innerHTML = filtered.map(function(p) {
    const liked = (p.likes || []).indexOf(me || '_guest') !== -1;
    const canDelete = !!(me && p.author === me);
    const ago = communityTimeAgo(p.ts);
    const label = typeLabel[p.type] || '💬 Chat';
    const deleteBtn = canDelete
      ? '<button class="feed-delete" data-id="' + p.id + '" title="Delete" aria-label="Delete post">&#x2715;</button>'
      : '';
    const img = p.image
      ? '<img class="feed-win-img" src="' + p.image + '" alt="Win screenshot" loading="lazy">'
      : '';
    const heart = liked ? '&#x2764;&#xFE0F;' : '&#x1F90D;';
    const likeCount = (p.likes || []).length;
    const likedClass = liked ? ' liked' : '';
    return '<article class="feed-card" data-id="' + p.id + '">'
      + '<div class="feed-card-top">'
      + '<span class="feed-type-badge feed-type-' + p.type + '">' + label + '</span>'
      + '<span class="feed-meta">' + escapeHtml(p.author || 'Guest') + ' &middot; ' + ago + '</span>'
      + deleteBtn
      + '</div>'
      + img
      + '<p class="feed-body">' + escapeHtml(p.body) + '</p>'
      + '<div class="feed-card-footer">'
      + '<button class="feed-like-btn' + likedClass + '" data-id="' + p.id + '" aria-label="Like">'
      + heart + ' <span>' + likeCount + '</span>'
      + '</button>'
      + '</div>'
      + '</article>';
  }).join('');
}

function communityPost(body, type, image) {
  if (!body.trim()) return false;
  const posts = communityLoad();
  const me = (window.FeltoraAuth && window.FeltoraAuth.currentUser()) || null;
  posts.unshift({
    id: String(Date.now()) + Math.random().toString(36).slice(2),
    author: me || 'Guest',
    body: body.trim(),
    type: type,
    image: image || null,
    ts: Date.now(),
    likes: []
  });
  communitySave(posts);
  communityRenderFeed();
  return true;
}

// feed interactions — like + delete
document.getElementById('community-feed').addEventListener('click', function(e) {
  const likeBtn = e.target.closest('.feed-like-btn');
  const delBtn  = e.target.closest('.feed-delete');
  const me = (window.FeltoraAuth && window.FeltoraAuth.currentUser()) || '_guest';
  if (likeBtn) {
    const id = likeBtn.dataset.id;
    const posts = communityLoad();
    const p = posts.filter(function(x) { return x.id === id; })[0];
    if (p) {
      p.likes = p.likes || [];
      const idx = p.likes.indexOf(me);
      if (idx === -1) p.likes.push(me); else p.likes.splice(idx, 1);
      communitySave(posts);
      communityRenderFeed();
    }
  }
  if (delBtn) {
    const id = delBtn.dataset.id;
    const me2 = window.FeltoraAuth && window.FeltoraAuth.currentUser();
    if (!me2) return;
    communitySave(communityLoad().filter(function(p) {
      return !(p.id === id && p.author === me2);
    }));
    communityRenderFeed();
  }
});

// filter tabs
document.querySelectorAll('.community-tab').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.community-tab').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    communityFilter = btn.dataset.feed;
    communityRenderFeed();
  });
});

// compose panel
var composePanel = document.getElementById('community-compose');

document.getElementById('community-new-post').addEventListener('click', function() {
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

document.getElementById('compose-text').addEventListener('input', function(e) {
  document.getElementById('compose-chars').textContent = String(280 - e.target.value.length);
});

document.querySelectorAll('.compose-type-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.compose-type-btn').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    composeType = btn.dataset.type;
  });
});

document.getElementById('compose-submit').addEventListener('click', function() {
  var body = document.getElementById('compose-text').value;
  if (!body.trim()) { document.getElementById('compose-text').focus(); return; }
  communityPost(body, composeType, pendingWinImage);
  composePanel.hidden = true;
  document.getElementById('compose-text').value = '';
  document.getElementById('compose-chars').textContent = '280';
  pendingWinImage = null;
  if (typeof announceGameAction === 'function') announceGameAction('Posted to the Clubhouse!', 2500);
});

// back button
document.getElementById('community-back').addEventListener('click', function() {
  if (typeof showScreen === 'function') showScreen('lobby');
});

// Community button from results screen — pre-fills compose as a win post
var communityResultBtn = document.getElementById('btn-post-community');
if (communityResultBtn) {
  communityResultBtn.addEventListener('click', function() {
    if (typeof showScreen === 'function') showScreen('community');
    communityRenderFeed();
    var w = typeof winner !== 'undefined' ? winner : -1;
    var role = typeof onlineRole !== 'undefined' ? onlineRole : null;
    if (w !== null && w !== -1) {
      var localWon = role === 'guest' ? w === 1 : w === 0;
      if (localWon) {
        composeType = 'win';
        document.querySelectorAll('.compose-type-btn').forEach(function(b) {
          b.classList.toggle('active', b.dataset.type === 'win');
        });
        composePanel.hidden = false;
        document.getElementById('compose-text').value = 'Just won a match on FELTORA!';
        document.getElementById('compose-chars').textContent = String(280 - 30);
      }
    }
  });
}
