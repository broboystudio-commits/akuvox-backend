/* Vela front end: plain JavaScript, no build step. */

// =============================================================
// Icons (static, trusted strings only)
// =============================================================
const ICONS = {
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  comment: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  repost: '<path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  compass: '<circle cx="12" cy="12" r="10"/><path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36z"/>',
  inbox: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  reset: '<path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  volume: '<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>',
  volumeX: '<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M23 9l-6 6M17 9l6 6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
};
const FILLED = {
  heart: ICONS.heart.replace('<path ', '<path fill="url(#vela-grad)" stroke="none" '),
  bookmark: ICONS.bookmark.replace('<path ', '<path fill="url(#vela-grad)" stroke="none" '),
  play: '<path d="M6 4l14 8-14 8z" fill="currentColor" stroke="none"/>',
};

function icon(name, size = 24, strokeWidth = 2, filled = false) {
  const span = document.createElement('span');
  span.className = 'icon';
  span.setAttribute('aria-hidden', 'true');
  const body = filled ? FILLED[name] : ICONS[name] || FILLED[name];
  span.innerHTML =
    `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" focusable="false">${body}</svg>`;
  return span;
}

// =============================================================
// DOM helper: user text always goes in as text nodes
// =============================================================
function h(tag, props, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style') Object.assign(el.style, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}
/** Replace an element's children, skipping null/false entries. */
function fill(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

// =============================================================
// Formatting
// =============================================================
function fmtCount(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString('en-US');
}
function timeAgo(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  if (s < 604800) return Math.floor(s / 86400) + 'd';
  return Math.floor(s / 604800) + 'w';
}
function initials(user) {
  const src = (user.displayName || user.username || '?').trim();
  const parts = src.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : [...src][0] || '?';
  return letters.toUpperCase();
}
function avatar(user, size = '') {
  return h('span', { class: 'avatar' + (size ? ' ' + size : ''), 'aria-hidden': 'true' }, h('span', {}, initials(user)));
}
function profileHash(user) {
  return user.isMe || (state.me && user.username.toLowerCase() === state.me.username.toLowerCase())
    ? '#/profile'
    : '#/u/' + encodeURIComponent(user.username);
}
function captionNodes(text) {
  const out = [];
  const re = /#([\p{L}\p{N}_]{1,40})/gu;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(h('a', { href: '#/discover?q=' + encodeURIComponent('#' + m[1].toLowerCase()) }, m[0]));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// =============================================================
// State, events, API
// =============================================================
const state = {
  me: null,
  config: { ephemeral: false, maxUploadMb: 50 },
  muted: true,
  draft: null, // { file, url }
  feedDirty: false,
};

const bus = {
  map: new Map(),
  on(event, fn) {
    if (!this.map.has(event)) this.map.set(event, new Set());
    this.map.get(event).add(fn);
    return () => this.map.get(event).delete(fn);
  },
  emit(event, detail) {
    for (const fn of this.map.get(event) || []) fn(detail);
  },
};

async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Network error. Check your connection and try again.');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    if (res.status === 401 && state.me) {
      state.me = null;
      resetFeed();
      location.hash = '#/login';
    }
    const err = new Error((data && data.error) || 'Something went wrong. Please try again.');
    err.status = res.status;
    throw err;
  }
  return data;
}

const VIDEO_TYPES = { mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime' };
function videoType(file) {
  if (/^video\/(mp4|webm|quicktime)$/.test(file.type)) return file.type;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  return VIDEO_TYPES[ext] || null;
}

function uploadVideo(file, caption, onProgress) {
  return new Promise((resolve, reject) => {
    const type = videoType(file);
    const blob = file.type === type ? file : new File([file], file.name, { type });
    const form = new FormData();
    form.append('caption', caption);
    form.append('video', blob, file.name);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/videos');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    };
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* not json */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new Error((data && data.error) || 'Upload failed. Please try again.'));
    };
    xhr.onerror = () => reject(new Error('Network error. Check your connection and try again.'));
    xhr.send(form);
  });
}

// =============================================================
// Shell: toast, sheets, tab bar, file picker
// =============================================================
const screenEl = document.getElementById('screen');
const tabbarEl = document.getElementById('tabbar');
const sheetRoot = document.getElementById('sheet-root');
const toastEl = document.getElementById('toast');
const fileInput = document.getElementById('file-input');

let toastTimer = null;
function toast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.classList.toggle('error', isError);
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3000);
}

let openSheets = [];
function openSheet({ title, body, foot, onClose }) {
  const previousFocus = document.activeElement;
  const titleId = 'sheet-' + Math.random().toString(36).slice(2, 9);
  const titleEl = h('h2', { id: titleId }, title);
  const closeBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close' }, icon('x', 20));
  const sheet = h(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
    h('div', { class: 'sheet-head' }, titleEl, closeBtn),
    h('div', { class: 'sheet-body' }, body),
    foot ? h('div', { class: 'sheet-foot' }, foot) : null,
  );
  const backdrop = h('div', { class: 'sheet-backdrop' });

  const handle = { close, titleEl, el: sheet };
  function onKey(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      const items = [...sheet.querySelectorAll('button, a[href], input, textarea, [tabindex]:not([tabindex="-1"])')].filter(
        (n) => !n.disabled,
      );
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
  function close() {
    if (!sheet.isConnected) return;
    backdrop.remove();
    sheet.remove();
    document.removeEventListener('keydown', onKey, true);
    openSheets = openSheets.filter((s) => s !== handle);
    if (onClose) onClose();
    if (previousFocus && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
  }
  backdrop.addEventListener('click', close);
  closeBtn.addEventListener('click', close);
  sheetRoot.append(backdrop, sheet);
  document.addEventListener('keydown', onKey, true);
  closeBtn.focus({ preventScroll: true });
  openSheets.push(handle);
  return handle;
}
function closeAllSheets() {
  [...openSheets].forEach((s) => s.close());
}

function renderTabbar(active) {
  if (!active) {
    tabbarEl.hidden = true;
    return;
  }
  tabbarEl.hidden = false;
  const tab = (name, hash, label, iconName) =>
    h('a', { class: 'tab', href: hash, 'aria-current': active === name ? 'page' : null }, icon(iconName, 24), h('span', {}, label));
  fill(tabbarEl, 
    tab('home', '#/', 'Home', 'home'),
    tab('discover', '#/discover', 'Discover', 'compass'),
    h(
      'button',
      { type: 'button', class: 'tab-create', 'aria-label': 'Create: upload a video', onclick: () => fileInput.click() },
      icon('plus', 24, 2.5),
    ),
    tab('inbox', '#/inbox', 'Inbox', 'inbox'),
    tab('profile', '#/profile', 'Profile', 'user'),
  );
}

function setDraft(file) {
  if (state.draft) URL.revokeObjectURL(state.draft.url);
  state.draft = file ? { file, url: URL.createObjectURL(file) } : null;
  bus.emit('draft');
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files && fileInput.files[0];
  fileInput.value = '';
  if (!file) return;
  if (!videoType(file)) return toast('Please choose an MP4, WebM or MOV video.', true);
  if (file.size > state.config.maxUploadMb * 1024 * 1024) {
    return toast(`Videos can be up to ${state.config.maxUploadMb} MB.`, true);
  }
  setDraft(file);
  if (currentRouteName !== 'feed') location.hash = '#/';
  toast('Video ready. Add a caption, then tap Post.');
});

// =============================================================
// Video slide
// =============================================================
function createSlide(data, { single = false, source = 'foryou', onDeleted } = {}) {
  let v = data;
  let userPaused = false;
  let viewed = false;
  let viewTimer = null;
  let tapTimer = null;
  let lastTap = 0;
  let active = false;

  const el = h('section', { class: 'slide' + (single ? ' single' : ''), 'aria-label': `Video by @${v.author.username}` });
  const video = h('video', { playsinline: true, 'webkit-playsinline': true, loop: true, muted: true, preload: 'metadata' });
  video.muted = state.muted;
  video.src = v.url;
  video.addEventListener('loadedmetadata', () => {
    if (video.videoWidth > video.videoHeight) video.classList.add('contain');
  });

  const tapLayer = h('div', { class: 'tap-layer', 'aria-hidden': 'true' });
  const pausedIcon = h('div', { class: 'paused-icon', 'aria-hidden': 'true' }, icon('play', 34, 2, true));
  const progressFill = h('div');
  const info = h('div', { class: 'slide-info' });
  const rail = h('div', { class: 'rail' });
  el.append(
    video,
    tapLayer,
    h('div', { class: 'scrim-top' }),
    h('div', { class: 'scrim-bottom' }),
    pausedIcon,
    info,
    h('div', { class: 'progress', 'aria-hidden': 'true' }, progressFill),
    rail,
  );

  video.addEventListener('timeupdate', () => {
    if (video.duration) progressFill.style.width = (video.currentTime / video.duration) * 100 + '%';
  });
  video.addEventListener('play', () => {
    el.classList.add('is-playing');
    el.classList.remove('is-paused');
  });
  video.addEventListener('pause', () => {
    el.classList.remove('is-playing');
    if (userPaused) el.classList.add('is-paused');
  });

  function play() {
    video.muted = state.muted;
    const p = video.play();
    if (p && p.catch) {
      p.catch(() => {
        // Browsers block autoplay with sound until the viewer interacts; fall back to muted.
        if (!video.muted) {
          state.muted = true;
          bus.emit('mute');
          video.play().catch(() => el.classList.add('is-paused'));
        } else {
          el.classList.add('is-paused');
        }
      });
    }
  }

  function togglePlay() {
    if (video.paused) {
      userPaused = false;
      play();
    } else {
      userPaused = true;
      video.pause();
    }
  }

  tapLayer.addEventListener('click', (e) => {
    const now = Date.now();
    if (now - lastTap < 280) {
      clearTimeout(tapTimer);
      lastTap = 0;
      burst(e);
      if (!v.liked) toggle('like');
      return;
    }
    lastTap = now;
    tapTimer = setTimeout(togglePlay, 280);
  });

  function burst(e) {
    const rect = el.getBoundingClientRect();
    const heart = icon('heart', 110, 2, true);
    heart.classList.add('heart-burst');
    heart.style.left = e.clientX - rect.left + 'px';
    heart.style.top = e.clientY - rect.top + 'px';
    el.append(heart);
    setTimeout(() => heart.remove(), 750);
  }

  // ---- actions ----
  const KEYS = { like: ['liked', 'likes'], save: ['saved', 'saves'], repost: ['reposted', 'reposts'] };
  async function toggle(kind) {
    const [flag, count] = KEYS[kind];
    const was = v[flag];
    const before = v;
    v = { ...v, [flag]: !was, counts: { ...v.counts, [count]: v.counts[count] + (was ? -1 : 1) } };
    renderRail(kind);
    try {
      const res = await api(`/videos/${v.id}/${kind}`, { method: was ? 'DELETE' : 'POST' });
      v = { ...res.video, why: before.why, repostedBy: before.repostedBy };
      renderRail();
      if (kind === 'repost' && !was) toast('Reposted to your followers');
      if (kind === 'save' && !was) toast('Saved to your profile');
    } catch (err) {
      v = before;
      renderRail();
      toast(err.message, true);
    }
  }

  async function follow() {
    try {
      await api(`/users/${encodeURIComponent(v.author.username)}/follow`, { method: 'POST' });
      bus.emit('follow', { username: v.author.username, isFollowing: true });
      toast(`Following @${v.author.username}`);
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function remove() {
    if (!window.confirm('Delete this video? This cannot be undone.')) return;
    try {
      await api(`/videos/${v.id}`, { method: 'DELETE' });
      toast('Video deleted');
      state.feedDirty = true;
      if (onDeleted) onDeleted();
    } catch (err) {
      toast(err.message, true);
    }
  }

  const offFollow = bus.on('follow', ({ username, isFollowing }) => {
    if (username.toLowerCase() === v.author.username.toLowerCase()) {
      v = { ...v, author: { ...v.author, isFollowing } };
      renderRail();
    }
  });
  const offMute = bus.on('mute', () => {
    video.muted = state.muted;
    renderRail();
  });

  // ---- rendering ----
  function railButton({ label, iconName, filled, count, pressed, cls, onclick, disabled, title }) {
    return h(
      'button',
      {
        type: 'button',
        class: 'rail-btn' + (cls ? ' ' + cls : ''),
        'aria-label': label,
        'aria-pressed': pressed === undefined ? null : String(pressed),
        disabled,
        title,
        onclick,
      },
      icon(iconName, 30, 2, filled),
      count === undefined ? null : h('span', { class: 'count' }, count),
    );
  }

  function renderRail(popKind) {
    const a = v.author;
    const avatarWrap = h(
      'div',
      { class: 'rail-avatar' },
      h('a', { href: profileHash(a), 'aria-label': a.isMe ? 'Your profile' : `@${a.username}'s profile` }, avatar(a)),
      !a.isMe && !a.isFollowing
        ? h(
            'button',
            { type: 'button', class: 'follow-badge', 'aria-label': `Follow @${a.username}`, onclick: follow },
            icon('plus', 14, 3),
          )
        : null,
    );
    const like = railButton({
      label: v.liked ? 'Unlike' : 'Like',
      iconName: 'heart',
      filled: v.liked,
      count: fmtCount(v.counts.likes),
      pressed: v.liked,
      cls: popKind === 'like' ? 'pop' : '',
      onclick: () => toggle('like'),
    });
    const comment = railButton({
      label: `Comments (${v.counts.comments})`,
      iconName: 'comment',
      count: fmtCount(v.counts.comments),
      onclick: openComments,
    });
    const save = railButton({
      label: v.saved ? 'Remove from saved' : 'Save to favorites',
      iconName: 'bookmark',
      filled: v.saved,
      count: fmtCount(v.counts.saves),
      pressed: v.saved,
      cls: popKind === 'save' ? 'pop' : '',
      onclick: () => toggle('save'),
    });
    const repostOrDelete = a.isMe
      ? railButton({ label: 'Delete this video', iconName: 'trash', count: 'Delete', onclick: remove })
      : railButton({
          label: v.reposted ? 'Undo repost' : 'Repost',
          iconName: 'repost',
          count: fmtCount(v.counts.reposts),
          pressed: v.reposted,
          cls: 'repost' + (popKind === 'repost' ? ' pop' : ''),
          disabled: !v.allowReposts && !v.reposted,
          title: v.allowReposts ? null : 'This creator has turned off reposts',
          onclick: () => toggle('repost'),
        });
    const sound = h(
      'button',
      {
        type: 'button',
        class: 'disc',
        'aria-label': state.muted ? 'Turn sound on' : 'Turn sound off',
        onclick: () => {
          state.muted = !state.muted;
          bus.emit('mute');
          if (active && video.paused && !userPaused) play();
        },
      },
      h('span', {}, icon(state.muted ? 'volumeX' : 'volume', 14, 2.5)),
    );
    fill(rail, avatarWrap, like, comment, save, repostOrDelete, sound);
  }

  function renderInfo() {
    const a = v.author;
    const caption = v.caption ? h('p', { class: 'caption' }, captionNodes(v.caption)) : null;
    const more = h('button', { type: 'button', class: 'more-btn', hidden: true, 'aria-expanded': 'false' }, 'more');
    more.addEventListener('click', () => {
      const open = caption.classList.toggle('open');
      more.textContent = open ? 'less' : 'more';
      more.setAttribute('aria-expanded', String(open));
    });
    fill(
      info,
      h(
        'div',
        { class: 'handle-row' },
        h('a', { class: 'handle', href: profileHash(a) }, '@' + a.username),
        a.username === 'vela' ? h('span', { class: 'badge' }, 'Official') : null,
        a.isMe ? h('span', { class: 'badge' }, 'You') : null,
      ),
      v.repostedBy ? h('div', { class: 'reposted' }, icon('repost', 14), `Reposted by @${v.repostedBy}`) : null,
      caption,
      caption ? more : null,
      h(
        'div',
        { class: 'meta-row' },
        h('span', { class: 'sound' }, icon('music', 14), h('span', {}, `Original sound · ${a.username}`)),
      ),
      h('button', { type: 'button', class: 'why-chip', onclick: openWhy }, icon('info', 16), 'Why you’re seeing this'),
    );
    if (caption) {
      requestAnimationFrame(() => {
        if (caption.scrollHeight > caption.clientHeight + 2) more.hidden = false;
      });
    }
  }

  // ---- sheets ----
  async function openComments() {
    const list = h('div', {}, h('div', { class: 'empty' }, h('div', { class: 'spinner' })));
    const input = h('input', {
      class: 'input',
      type: 'text',
      maxlength: '500',
      placeholder: 'Add a comment…',
      'aria-label': 'Add a comment',
      autocomplete: 'off',
      enterkeyhint: 'send',
    });
    const send = h('button', { type: 'submit', class: 'btn', 'aria-label': 'Send comment' }, icon('send', 18));
    const form = h('form', { class: 'comment-form' }, input, send);
    const title = () => `${fmtCount(v.counts.comments)} ${v.counts.comments === 1 ? 'comment' : 'comments'}`;
    const sheet = openSheet({ title: title(), body: list, foot: form });
    let comments = [];

    const render = () => {
      sheet.titleEl.textContent = title();
      if (!comments.length) {
        fill(list, h('div', { class: 'empty' }, h('p', {}, 'No comments yet. Start the conversation.')));
        return;
      }
      fill(list, 
        ...comments.map((c) =>
          h(
            'div',
            { class: 'comment' },
            avatar(c.user, 'sm'),
            h(
              'div',
              { class: 'comment-main' },
              h(
                'div',
                { class: 'comment-meta' },
                h('a', { href: profileHash(c.user), onclick: () => sheet.close() }, '@' + c.user.username),
                h('span', {}, timeAgo(c.createdAt)),
              ),
              h('p', { class: 'comment-body' }, c.body),
            ),
            c.canDelete
              ? h(
                  'button',
                  {
                    type: 'button',
                    class: 'del',
                    'aria-label': 'Delete comment',
                    onclick: async () => {
                      try {
                        const res = await api(`/comments/${c.id}`, { method: 'DELETE' });
                        comments = comments.filter((x) => x.id !== c.id);
                        v = { ...res.video, why: v.why, repostedBy: v.repostedBy };
                        renderRail();
                        render();
                      } catch (err) {
                        toast(err.message, true);
                      }
                    },
                  },
                  icon('trash', 16),
                )
              : null,
          ),
        ),
      );
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = input.value.trim();
      if (!body) return;
      send.disabled = true;
      try {
        const res = await api(`/videos/${v.id}/comments`, { method: 'POST', body: { body } });
        comments.unshift(res.comment);
        v = { ...res.video, why: v.why, repostedBy: v.repostedBy };
        input.value = '';
        renderRail();
        render();
      } catch (err) {
        toast(err.message, true);
      } finally {
        send.disabled = false;
        input.focus();
      }
    });

    try {
      comments = (await api(`/videos/${v.id}/comments`)).comments;
      render();
    } catch (err) {
      fill(list, h('div', { class: 'empty' }, h('p', {}, err.message)));
    }
  }

  function openWhy() {
    const body = [];
    if (v.why) {
      body.push(
        h(
          'ul',
          { class: 'why-list' },
          (v.why.reasons.length ? v.why.reasons : ['It fits the mix you chose in Algorithm Control']).map((r) =>
            h('li', {}, icon('check', 18, 2.5), h('span', {}, r)),
          ),
        ),
      );
      const p = v.why.parts;
      const bars = [
        ['Following', p.following],
        ['Your interests', p.interests],
        ['New creator', p.discovery],
        ['Engagement', p.engagement],
        ['Freshness', p.freshness],
        ['Interaction', p.affinity],
      ];
      body.push(
        h(
          'div',
          { class: 'why-bars' },
          bars.map(([label, value]) =>
            h(
              'div',
              { class: 'why-bar-row' },
              h('span', {}, label),
              h('div', { class: 'track' }, h('div', { style: { width: Math.round(value * 100) + '%' } })),
              h('span', { class: 'val' }, Math.round(value * 100)),
            ),
          ),
        ),
        h(
          'p',
          { class: 'why-note' },
          `Each signal is scored 0 to 100, then weighted by your Algorithm Control settings. ` +
            `Creator reach multiplier: ×${p.reach}. Final score: ${v.why.score}.`,
        ),
      );
    } else if (v.repostedBy) {
      body.push(h('p', {}, `@${v.repostedBy}, who you follow, reposted this. The Following tab shows posts and reposts from people you follow, newest first.`));
    } else if (source === 'following') {
      body.push(h('p', {}, `You follow @${v.author.username}. The Following tab shows posts from people you follow, newest first, with no ranking.`));
    } else {
      body.push(h('p', {}, 'You opened this video directly, so no ranking was applied.'));
    }
    const sheet = openSheet({
      title: "Why you're seeing this",
      body,
      foot: h(
        'a',
        { class: 'btn block', href: '#/algorithm', onclick: () => sheet.close() },
        icon('sliders', 18),
        'Adjust Algorithm Control',
      ),
    });
  }

  renderRail();
  renderInfo();

  return {
    el,
    get data() {
      return v;
    },
    activate() {
      active = true;
      if (!userPaused) play();
      if (!viewed) {
        clearTimeout(viewTimer);
        viewTimer = setTimeout(() => {
          viewed = true;
          api(`/videos/${v.id}/view`, { method: 'POST' }).catch(() => {});
        }, 1500);
      }
    },
    deactivate() {
      active = false;
      clearTimeout(viewTimer);
      video.pause();
    },
    togglePlay,
    destroy() {
      active = false;
      clearTimeout(viewTimer);
      clearTimeout(tapTimer);
      offFollow();
      offMute();
      video.pause();
      video.removeAttribute('src');
      video.load();
    },
  };
}

// =============================================================
// Feed (kept alive between visits so the scroll position survives)
// =============================================================
let feed = null;

function resetFeed() {
  if (feed) feed.destroy();
  feed = null;
}

function createFeed() {
  let tab = 'foryou';
  let slides = [];
  let loading = false;
  let done = false;
  let offset = 0;
  let current = null;
  let generation = 0;
  let savedScroll = 0;
  let visible = false;

  const scroller = h('div', { class: 'feed-scroller', 'aria-label': 'Video feed' });
  const tabs = {
    following: h('button', { type: 'button', class: 'feed-tab', role: 'tab', 'aria-selected': 'false' }, 'Following'),
    foryou: h('button', { type: 'button', class: 'feed-tab', role: 'tab', 'aria-selected': 'true' }, 'For You'),
  };
  for (const [name, btn] of Object.entries(tabs)) {
    btn.addEventListener('click', () => {
      if (tab === name) return;
      tab = name;
      tabs.following.setAttribute('aria-selected', String(name === 'following'));
      tabs.foryou.setAttribute('aria-selected', String(name === 'foryou'));
      load(true);
    });
  }
  const top = h(
    'div',
    { class: 'feed-top' },
    h('a', { class: 'icon-btn', href: '#/algorithm', 'aria-label': 'Open Algorithm Control' }, icon('sliders', 20)),
    h('div', { class: 'feed-tabs', role: 'tablist', 'aria-label': 'Feed' }, tabs.following, tabs.foryou),
    h('a', { class: 'icon-btn', href: '#/discover', 'aria-label': 'Search' }, icon('search', 20)),
  );
  const composer = createComposer();
  const el = h('div', { class: 'feed' }, scroller, top, composer.el);

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const slide = slides.find((s) => s.el === entry.target);
        if (!slide) continue;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) activate(slide);
        else if (slide === current && entry.intersectionRatio < 0.6) slide.deactivate();
      }
    },
    { root: scroller, threshold: [0, 0.6] },
  );

  function activate(slide) {
    if (current && current !== slide) current.deactivate();
    current = slide;
    if (visible) slide.activate();
    if (slides.indexOf(slide) >= slides.length - 3) load();
  }

  function addSlide(video) {
    const slide = createSlide(video, {
      source: tab,
      onDeleted: () => {
        observer.unobserve(slide.el);
        slide.destroy();
        slide.el.remove();
        slides = slides.filter((s) => s !== slide);
        if (current === slide) current = null;
      },
    });
    slides.push(slide);
    const status = scroller.querySelector('.end-card, .loading-card');
    if (status) status.before(slide.el);
    else scroller.append(slide.el);
    observer.observe(slide.el);
  }

  function statusCard(kind) {
    scroller.querySelectorAll('.end-card, .loading-card').forEach((n) => n.remove());
    if (kind === 'loading') {
      scroller.append(h('div', { class: 'slide loading-card' }, h('div', { class: 'center-fill' }, h('div', { class: 'spinner' }))));
      return;
    }
    if (kind !== 'end') return;
    let content;
    if (tab === 'following' && !slides.length) {
      content = [
        h('h3', {}, 'Nobody to show yet'),
        h('p', {}, 'Follow creators and their posts and reposts will show up here, newest first.'),
        h('a', { class: 'btn', href: '#/discover' }, icon('search', 18), 'Find creators'),
      ];
    } else if (!slides.length) {
      content = [
        h('h3', {}, 'No videos yet'),
        h('p', {}, 'Be the first to post. Tap the upload button below.'),
      ];
    } else if (tab === 'following') {
      content = [
        h('h3', {}, "That's everything"),
        h('p', {}, "You've seen all recent posts from people you follow."),
        h('a', { class: 'btn', href: '#/discover' }, icon('search', 18), 'Find more creators'),
      ];
    } else {
      content = [
        h('h3', {}, "You're all caught up"),
        h('p', {}, 'Change your mix in Algorithm Control, or watch your feed again.'),
        h('button', { type: 'button', class: 'btn', onclick: () => load(true) }, icon('reset', 18), 'Watch again'),
      ];
    }
    scroller.append(h('div', { class: 'slide end-card' }, h('div', { class: 'empty' }, content)));
  }

  async function load(reset = false) {
    if (reset) {
      generation++;
      slides.forEach((s) => {
        observer.unobserve(s.el);
        s.destroy();
      });
      slides = [];
      current = null;
      done = false;
      loading = false;
      offset = 0;
      fill(scroller);
      scroller.scrollTop = 0;
    }
    if (loading || done) return;
    loading = true;
    const gen = generation;
    if (!slides.length) statusCard('loading');
    try {
      const query =
        tab === 'following'
          ? `tab=following&offset=${offset}`
          : `tab=foryou&exclude=${slides.map((s) => s.data.id).join(',')}`;
      const res = await api('/feed?' + query);
      if (gen !== generation) return;
      statusCard(null);
      res.videos.forEach(addSlide);
      offset += res.videos.length;
      done = res.done;
      if (done) statusCard('end');
    } catch (err) {
      if (gen !== generation) return;
      statusCard(null);
      toast(err.message, true);
    } finally {
      if (gen === generation) loading = false;
    }
  }

  function onKey(e) {
    if (openSheets.length || e.target.closest('input, textarea, select, [contenteditable]')) return;
    if (e.key === ' ' && e.target.closest('button, a')) return; // let Space press the focused control
    if (e.key === 'ArrowDown' || e.key === 'j') {
      e.preventDefault();
      scroller.scrollBy({ top: scroller.clientHeight, behavior: 'smooth' });
    } else if (e.key === 'ArrowUp' || e.key === 'k') {
      e.preventDefault();
      scroller.scrollBy({ top: -scroller.clientHeight, behavior: 'smooth' });
    } else if (e.key === ' ' && current) {
      e.preventDefault();
      current.togglePlay();
    }
  }

  load();

  return {
    el,
    show() {
      visible = true;
      scroller.scrollTop = savedScroll;
      document.addEventListener('keydown', onKey);
      if (state.feedDirty && tab === 'foryou') {
        state.feedDirty = false;
        load(true);
      } else if (current) {
        current.activate();
      }
    },
    hide() {
      visible = false;
      savedScroll = scroller.scrollTop;
      document.removeEventListener('keydown', onKey);
      if (current) current.deactivate();
    },
    destroy() {
      this.hide();
      generation++;
      observer.disconnect();
      slides.forEach((s) => s.destroy());
      composer.destroy();
    },
  };
}

function createComposer() {
  const uploadBtn = h('button', { type: 'button', class: 'composer-upload', 'aria-label': 'Upload video', onclick: () => fileInput.click() });
  const input = h('input', {
    id: 'composer-caption',
    class: 'composer-input',
    type: 'text',
    maxlength: '300',
    placeholder: 'Write a caption…',
    autocomplete: 'off',
    enterkeyhint: 'send',
  });
  const post = h('button', { type: 'submit', class: 'btn' }, 'Post');
  const form = h(
    'form',
    { class: 'composer' },
    uploadBtn,
    h('label', { class: 'sr-only', for: 'composer-caption' }, 'Caption for your next video'),
    input,
    post,
  );

  function sync() {
    fill(uploadBtn);
    if (state.draft) {
      const preview = h('video', { muted: true, playsinline: true, preload: 'metadata', 'aria-hidden': 'true' });
      preview.muted = true;
      preview.src = state.draft.url + '#t=0.1';
      uploadBtn.append(preview, h('span', { class: 'check' }, icon('check', 11, 3)));
      uploadBtn.setAttribute('aria-label', `Change video (selected: ${state.draft.file.name})`);
    } else {
      uploadBtn.append(icon('upload', 20));
      uploadBtn.setAttribute('aria-label', 'Upload video');
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.draft) {
      fileInput.click();
      return;
    }
    post.disabled = true;
    uploadBtn.disabled = true;
    try {
      const res = await uploadVideo(state.draft.file, input.value.trim(), (pct) => {
        post.textContent = pct + '%';
      });
      input.value = '';
      setDraft(null);
      state.feedDirty = true;
      toast('Your video is live');
      location.hash = '#/v/' + res.video.id;
    } catch (err) {
      toast(err.message, true);
    } finally {
      post.disabled = false;
      uploadBtn.disabled = false;
      post.textContent = 'Post';
    }
  });

  const off = bus.on('draft', sync);
  sync();
  return { el: form, destroy: off };
}

// =============================================================
// Screens
// =============================================================
function page(...children) {
  return h('div', { class: 'page' }, children);
}
function backButton(fallback = '#/') {
  return h(
    'button',
    {
      type: 'button',
      class: 'icon-btn',
      'aria-label': 'Back',
      onclick: () => (history.length > 1 ? history.back() : (location.hash = fallback)),
    },
    icon('back', 20),
  );
}
function loadingBlock() {
  return h('div', { class: 'empty' }, h('div', { class: 'spinner' }));
}
function videoGrid(videos) {
  return h(
    'div',
    { class: 'grid' },
    videos.map((v) => {
      const preview = h('video', { muted: true, playsinline: true, preload: 'metadata', tabindex: '-1', 'aria-hidden': 'true' });
      preview.muted = true;
      preview.src = v.url + '#t=0.5';
      return h(
        'a',
        { class: 'tile', href: '#/v/' + v.id, 'aria-label': `Video by @${v.author.username}${v.caption ? ': ' + v.caption : ''}` },
        preview,
        h('span', { class: 'meta' }, icon('heart', 14), fmtCount(v.counts.likes)),
      );
    }),
  );
}

// ---------- single video ----------
function renderSingle(id) {
  const scroller = h('div', { class: 'feed-scroller' }, h('div', { class: 'slide loading-card' }, h('div', { class: 'center-fill' }, h('div', { class: 'spinner' }))));
  const el = h('div', { class: 'feed' }, scroller, h('div', { class: 'feed-top' }, backButton('#/'), h('span'), h('span')));
  fill(screenEl, el);
  let slide = null;
  let alive = true;
  api('/videos/' + id)
    .then(({ video }) => {
      if (!alive) return;
      slide = createSlide(video, {
        single: true,
        source: 'direct',
        onDeleted: () => (location.hash = '#/profile'),
      });
      fill(scroller, slide.el);
      slide.activate();
    })
    .catch((err) => {
      fill(scroller, h('div', { class: 'slide end-card' }, h('div', { class: 'empty' }, h('h3', {}, 'Video unavailable'), h('p', {}, err.message))));
    });
  return () => {
    alive = false;
    if (slide) slide.destroy();
  };
}

// ---------- algorithm control ----------
function rangeControl({ id, label, dot, min, max, step, value, format, bipolar, onInput, hiddenLabel }) {
  const fill = h('div', { class: 'fill' });
  const val = h('span', { class: 'val' });
  const input = h('input', { type: 'range', id, min, max, step });
  input.value = value;
  function paint(n) {
    const p = ((n - min) / (max - min)) * 100;
    const off = (0.5 - p / 100) * 20; // keeps the fill under the 20px thumb
    if (!bipolar) {
      fill.style.left = '0';
      fill.style.width = `calc(${p}% + ${off}px)`;
    } else if (p >= 50) {
      fill.style.left = '50%';
      fill.style.width = `calc(${p - 50}% + ${off}px)`;
    } else {
      fill.style.left = `calc(${p}% + ${off}px)`;
      fill.style.width = `calc(${50 - p}% - ${off}px)`;
    }
    val.textContent = format(n);
    input.setAttribute('aria-valuetext', format(n));
  }
  input.addEventListener('input', () => {
    const n = Number(input.value);
    paint(n);
    onInput(n);
  });
  paint(value);
  const labelEl = h('label', { for: id, class: hiddenLabel ? 'sr-only' : null }, dot ? h('span', { class: 'dot', style: { background: dot } }) : null, label);
  return {
    el: h(
      'div',
      { class: 'slider-row' },
      hiddenLabel ? labelEl : h('div', { class: 'top' }, labelEl, val),
      h('div', { class: 'range' }, h('div', { class: 'track' }), bipolar ? h('div', { class: 'center-tick' }) : null, fill, input),
    ),
    valueEl: val,
  };
}

function switchRow({ label, sub, checked, onChange, first }) {
  const subEl = h('span', { class: 'sub' }, sub || '');
  const btn = h(
    'button',
    { type: 'button', role: 'switch', class: 'switch-row' + (first ? ' first' : ''), 'aria-checked': String(!!checked) },
    h('span', { class: 'labels' }, h('span', { class: 'label' }, label), sub ? subEl : null),
    h('span', { class: 'sw', 'aria-hidden': 'true' }),
  );
  btn.addEventListener('click', () => {
    const next = btn.getAttribute('aria-checked') !== 'true';
    btn.setAttribute('aria-checked', String(next));
    onChange(next);
  });
  return btn;
}

function renderAlgorithm() {
  const statusText = h('span', {}, 'Changes apply instantly');
  const status = h('span', { class: 'subtle-status', role: 'status' }, h('span', { class: 'live', 'aria-hidden': 'true' }), statusText);
  const body = h('div', { class: 'algo' }, loadingBlock());
  const resetBtn = h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Reset to defaults' }, icon('reset', 19));
  fill(screenEl, 
    page(
      h(
        'header',
        { class: 'page-head' },
        backButton('#/'),
        h('div', { class: 'center' }, h('h1', {}, 'Algorithm Control'), status),
        resetBtn,
      ),
      body,
    ),
  );

  let settings = null;
  let pending = {};
  let timer = null;

  function setStatus(kind, text) {
    status.className = 'subtle-status' + (kind === 'saving' ? ' saving' : kind === 'error' ? ' error' : '');
    statusText.textContent = text;
  }

  async function flush() {
    timer = null;
    const patch = pending;
    pending = {};
    if (!Object.keys(patch).length) return;
    try {
      const res = await api('/me/settings', { method: 'PATCH', body: patch });
      state.me.settings = res.settings;
      state.feedDirty = true;
      if (!timer) setStatus('saved', 'Saved. Your feed is updated');
    } catch (err) {
      setStatus('error', err.message);
    }
  }
  function queue(patch) {
    Object.assign(settings, patch);
    Object.assign(pending, patch);
    setStatus('saving', 'Saving…');
    clearTimeout(timer);
    timer = setTimeout(flush, 350);
  }

  function build() {
    const s = settings;
    // --- content weighting ---
    const mixSpans = {
      w_following: h('span', { style: { background: 'var(--teal)' } }),
      w_interests: h('span', { style: { background: 'var(--mid)' } }),
      w_discovery: h('span', { style: { background: 'var(--purple)' } }),
    };
    const mixText = h('p', { class: 'hint' });
    const paintMix = () => {
      const total = s.w_following + s.w_interests + s.w_discovery || 1;
      const pct = (k) => Math.round((s[k] / total) * 100);
      for (const [k, span] of Object.entries(mixSpans)) span.style.flexGrow = String(s[k] || 0.0001);
      mixText.textContent = `Feed mix: ${pct('w_following')}% following · ${pct('w_interests')}% your interests · ${pct('w_discovery')}% new creators`;
    };
    paintMix();
    const weightSlider = (key, label, dot) =>
      rangeControl({
        id: 'algo-' + key,
        label,
        dot,
        min: 0,
        max: 100,
        step: 1,
        value: s[key],
        format: (n) => n + '%',
        onInput: (n) => {
          queue({ [key]: n });
          paintMix();
        },
      }).el;

    const weighting = h(
      'section',
      { class: 'card glass', 'aria-labelledby': 'h-weight' },
      h('div', { class: 'card-head' }, h('h2', { id: 'h-weight' }, 'Content weighting'), h('span', { class: 'chip teal' }, 'Your feed')),
      h('p', { class: 'card-desc' }, 'Choose where your For You videos come from.'),
      h('div', { class: 'mix-bar', 'aria-hidden': 'true' }, Object.values(mixSpans)),
      h('div', { class: 'slider-rows' }, [
        weightSlider('w_following', 'Following', 'var(--teal)'),
        weightSlider('w_interests', 'Your interests', 'var(--mid)'),
        weightSlider('w_discovery', 'New creators', 'var(--purple)'),
      ]),
      mixText,
    );

    // --- engagement priority ---
    const level = (n) => (n < 34 ? 'Low' : n < 67 ? 'Balanced' : 'High') + ' · ' + n + '%';
    const engagement = h(
      'section',
      { class: 'card glass', 'aria-labelledby': 'h-eng' },
      h('div', { class: 'card-head' }, h('h2', { id: 'h-eng' }, 'Engagement priority'), h('span', { class: 'chip teal' }, 'Your feed')),
      h('div', { class: 'slider-rows' }, [
        rangeControl({
          id: 'algo-engagement',
          label: 'Weight of likes, comments & shares',
          min: 0,
          max: 100,
          step: 1,
          value: s.engagement_weight,
          format: level,
          onInput: (n) => queue({ engagement_weight: n }),
        }).el,
      ]),
      h('div', { class: 'divider' }),
      switchRow({
        label: 'Prioritize people I interact with',
        sub: 'Creators you like, comment on, save or repost rank higher',
        checked: s.boost_interactions,
        first: true,
        onChange: (on) => queue({ boost_interactions: on }),
      }),
    );

    // --- reach adjustment ---
    const fmtReach = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n) + '%';
    const bigVal = h('span', { class: 'big-val' }, fmtReach(s.reach_adjust));
    const reachSlider = rangeControl({
      id: 'algo-reach',
      label: 'Reach adjustment percentage',
      hiddenLabel: true,
      min: -50,
      max: 50,
      step: 5,
      value: s.reach_adjust,
      bipolar: true,
      format: fmtReach,
      onInput: (n) => {
        bigVal.textContent = fmtReach(n);
        queue({ reach_adjust: n });
      },
    });
    const reach = h(
      'section',
      { class: 'card glass', 'aria-labelledby': 'h-reach' },
      h('div', { class: 'card-head' }, h('h2', { id: 'h-reach' }, 'Reach adjustment'), h('span', { class: 'chip purple' }, 'Your posts')),
      h('div', { class: 'reach-row' }, bigVal, h('span', { class: 'hint' }, 'vs. standard distribution')),
      reachSlider.el,
      h('div', { class: 'ticks', 'aria-hidden': 'true' }, h('span', {}, '−50%'), h('span', {}, '0'), h('span', {}, '+50%')),
    );

    // --- distribution rules ---
    const region = (state.me.region || '').trim();
    const rules = h(
      'section',
      { class: 'card glass', 'aria-labelledby': 'h-rules' },
      h('div', { class: 'card-head' }, h('h2', { id: 'h-rules' }, 'Distribution rules'), h('span', { class: 'chip purple' }, 'Your posts')),
      h('div', { style: { marginTop: '6px' } }, [
        switchRow({
          label: 'Show to followers first',
          sub: 'Non-followers see new posts after 15 minutes',
          checked: s.followers_first,
          first: true,
          onChange: (on) => queue({ followers_first: on }),
        }),
        switchRow({
          label: 'Recommend to non-followers',
          sub: 'Turn off and only your followers see your posts',
          checked: s.recommend_non_followers,
          onChange: (on) => queue({ recommend_non_followers: on }),
        }),
        switchRow({
          label: 'Nearby audience only',
          sub: region
            ? `Non-followers must also be in “${region}”`
            : 'Set “Your area” on your profile for this to work',
          checked: s.nearby_only,
          onChange: (on) => queue({ nearby_only: on }),
        }),
        switchRow({
          label: 'Allow reposts',
          sub: 'Let others share your videos with their followers',
          checked: s.allow_reposts,
          onChange: (on) => queue({ allow_reposts: on }),
        }),
      ]),
    );

    fill(body, 
      weighting,
      engagement,
      reach,
      rules,
      h('p', { class: 'hint', style: { textAlign: 'center', padding: '4px 12px 8px' } }, 'Tap “Why” on any video to see exactly how it was ranked.'),
    );
  }

  resetBtn.addEventListener('click', async () => {
    clearTimeout(timer);
    timer = null;
    pending = {};
    try {
      const { defaults } = await api('/me/settings');
      const res = await api('/me/settings', { method: 'PATCH', body: defaults });
      settings = { ...res.settings };
      state.me.settings = res.settings;
      state.feedDirty = true;
      build();
      setStatus('saved', 'Reset to defaults');
    } catch (err) {
      setStatus('error', err.message);
    }
  });

  api('/me/settings')
    .then((res) => {
      settings = { ...res.settings };
      build();
    })
    .catch((err) => fill(body, h('div', { class: 'empty' }, h('p', {}, err.message))));

  return () => {
    if (timer) {
      clearTimeout(timer);
      flush();
    }
  };
}

// ---------- discover ----------
function renderDiscover(params) {
  const initial = params.get('q') || '';
  const input = h('input', {
    type: 'search',
    value: initial,
    placeholder: 'Search videos, people, #hashtags',
    'aria-label': 'Search videos, people and hashtags',
    autocomplete: 'off',
    enterkeyhint: 'search',
  });
  const results = h('div', {}, loadingBlock());
  const form = h('form', { class: 'search glass', role: 'search' }, icon('search', 20), input);
  fill(screenEl, page(h('header', { class: 'page-head' }, h('h1', {}, 'Discover')), form, results));

  let token = 0;
  async function run(q) {
    const my = ++token;
    fill(results, loadingBlock());
    try {
      if (!q) {
        const res = await api('/trending');
        if (my !== token) return;
        fill(results, 
          res.tags.length ? h('h2', { class: 'section-title' }, 'Trending hashtags') : null,
          res.tags.length
            ? h(
                'div',
                { class: 'tags' },
                res.tags.map((t) =>
                  h('a', { class: 'tag-chip', href: '#/discover?q=' + encodeURIComponent('#' + t.tag) }, '#' + t.tag, h('small', {}, t.videos)),
                ),
              )
            : null,
          h('h2', { class: 'section-title' }, 'Popular videos'),
          res.videos.length ? videoGrid(res.videos) : h('div', { class: 'empty' }, h('p', {}, 'No videos yet.')),
        );
        return;
      }
      const res = await api('/search?q=' + encodeURIComponent(q));
      if (my !== token) return;
      const blocks = [];
      if (res.users.length) {
        blocks.push(
          h('h2', { class: 'section-title' }, 'People'),
          h(
            'div',
            { style: { marginBottom: '18px' } },
            res.users.map((u) =>
              h('a', { class: 'user-row', href: profileHash(u) }, avatar(u), h('span', { class: 'names' }, h('strong', {}, u.displayName), h('span', {}, '@' + u.username))),
            ),
          ),
        );
      }
      if (res.videos.length) blocks.push(h('h2', { class: 'section-title' }, 'Videos'), videoGrid(res.videos));
      if (!blocks.length) blocks.push(h('div', { class: 'empty' }, h('h3', {}, 'No results'), h('p', {}, `Nothing matches “${q}” yet.`)));
      fill(results, ...blocks);
    } catch (err) {
      if (my === token) fill(results, h('div', { class: 'empty' }, h('p', {}, err.message)));
    }
  }

  let debounce = null;
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      const q = input.value.trim();
      history.replaceState(null, '', q ? '#/discover?q=' + encodeURIComponent(q) : '#/discover');
      run(q);
    }, 300);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(debounce);
    run(input.value.trim());
    input.blur();
  });
  run(initial.trim());
  return () => clearTimeout(debounce);
}

// ---------- inbox ----------
function renderInbox() {
  const list = h('div', {}, loadingBlock());
  fill(screenEl, page(h('header', { class: 'page-head' }, h('h1', {}, 'Inbox')), list));
  const TYPES = {
    like: ['heart', '', 'liked your video'],
    comment: ['comment', 'purple', 'commented:'],
    repost: ['repost', '', 'reposted your video'],
    save: ['bookmark', 'purple', 'saved your video'],
    follow: ['userPlus', '', 'started following you'],
  };
  api('/inbox')
    .then(({ items }) => {
      if (!items.length) {
        fill(list, 
          h('div', { class: 'empty' }, h('h3', {}, 'No activity yet'), h('p', {}, 'When people like, comment on, save or repost your videos, or follow you, it shows up here.')),
        );
        return;
      }
      fill(list, 
        ...items.map((it) => {
          const [ic, tone, verb] = TYPES[it.type];
          const href = it.type === 'follow' ? profileHash(it.user) : '#/v/' + it.videoId;
          return h(
            'a',
            { class: 'activity', href },
            h('span', { class: 'badge-icon ' + tone }, icon(ic, 20)),
            h('span', { class: 'text' }, h('strong', {}, '@' + it.user.username), ' ', verb, it.body ? h('span', { class: 'quote' }, it.body) : null),
            h('time', { datetime: new Date(it.at).toISOString() }, timeAgo(it.at)),
          );
        }),
      );
    })
    .catch((err) => fill(list, h('div', { class: 'empty' }, h('p', {}, err.message))));
}

// ---------- profile ----------
function renderProfile(username) {
  const isMe = !username || username.toLowerCase() === state.me.username.toLowerCase();
  const name = isMe ? state.me.username : username;
  const content = h('div', {}, loadingBlock());
  const head = isMe
    ? h(
        'header',
        { class: 'page-head' },
        h('h1', {}, 'Profile'),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Sign out', onclick: signOut }, icon('logout', 19)),
      )
    : h('header', { class: 'page-head' }, backButton('#/'), h('div', { class: 'center' }, h('h1', {}, '@' + name)), h('span', { class: 'spacer' }));
  fill(screenEl, page(head, content));

  api('/users/' + encodeURIComponent(name))
    .then(({ user, videos }) => {
      const followers = h('strong', {}, fmtCount(user.followers));
      const stats = h(
        'div',
        { class: 'stats' },
        h('div', {}, h('strong', {}, fmtCount(user.following)), h('span', {}, 'Following')),
        h('div', {}, followers, h('span', {}, 'Followers')),
        h('div', {}, h('strong', {}, fmtCount(user.likes)), h('span', {}, 'Likes')),
      );

      const actions = h('div', { class: 'profile-actions' });
      const editCard = h('form', { class: 'edit-card glass', hidden: true });
      if (user.isMe) {
        const nameInput = h('input', { class: 'input', id: 'edit-name', maxlength: '40', value: state.me.displayName, autocomplete: 'name' });
        const areaInput = h('input', { class: 'input', id: 'edit-area', maxlength: '60', value: state.me.region || '', placeholder: 'e.g. Brooklyn, NY' });
        const saveBtn = h('button', { type: 'submit', class: 'btn' }, 'Save');
        editCard.append(
          h('div', { class: 'field' }, h('label', { for: 'edit-name' }, 'Display name'), nameInput),
          h('div', { class: 'field' }, h('label', { for: 'edit-area' }, 'Your area'), areaInput, h('p', { class: 'hint' }, 'Used by the “Nearby audience only” rule. People must type the same area to count as nearby.')),
          saveBtn,
        );
        editCard.addEventListener('submit', async (e) => {
          e.preventDefault();
          saveBtn.disabled = true;
          try {
            const res = await api('/me/profile', { method: 'PATCH', body: { displayName: nameInput.value, region: areaInput.value } });
            state.me = { ...state.me, ...res.user };
            toast('Profile saved');
            renderProfile(null);
          } catch (err) {
            toast(err.message, true);
          } finally {
            saveBtn.disabled = false;
          }
        });
        actions.append(
          h(
            'button',
            {
              type: 'button',
              class: 'btn secondary small',
              onclick: () => {
                editCard.hidden = !editCard.hidden;
                if (!editCard.hidden) nameInput.focus();
              },
            },
            icon('edit', 16),
            'Edit profile',
          ),
          h('a', { class: 'btn secondary small', href: '#/algorithm' }, icon('sliders', 16), 'Algorithm'),
        );
      } else {
        let following = user.isFollowing;
        const btn = h('button', { type: 'button', class: 'btn small' });
        const paint = () => {
          btn.className = following ? 'btn secondary small' : 'btn small';
          fill(btn, following ? 'Following' : 'Follow');
          btn.setAttribute('aria-pressed', String(following));
        };
        paint();
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            const res = await api(`/users/${encodeURIComponent(user.username)}/follow`, { method: following ? 'DELETE' : 'POST' });
            following = res.isFollowing;
            followers.textContent = fmtCount(res.followers);
            bus.emit('follow', { username: user.username, isFollowing: following });
            paint();
          } catch (err) {
            toast(err.message, true);
          } finally {
            btn.disabled = false;
          }
        });
        actions.append(btn);
      }

      const gridHolder = h('div');
      const showVideos = (list, emptyText) =>
        fill(gridHolder, list.length ? videoGrid(list) : h('div', { class: 'empty' }, h('p', {}, emptyText)));
      const myEmpty = 'No videos yet. Tap the + button to post your first one.';
      showVideos(videos, user.isMe ? myEmpty : 'No videos yet.');

      let tabs = null;
      if (user.isMe) {
        const vBtn = h('button', { type: 'button', role: 'tab', 'aria-selected': 'true' }, 'Videos');
        const sBtn = h('button', { type: 'button', role: 'tab', 'aria-selected': 'false' }, 'Saved');
        vBtn.addEventListener('click', () => {
          vBtn.setAttribute('aria-selected', 'true');
          sBtn.setAttribute('aria-selected', 'false');
          showVideos(videos, myEmpty);
        });
        sBtn.addEventListener('click', async () => {
          sBtn.setAttribute('aria-selected', 'true');
          vBtn.setAttribute('aria-selected', 'false');
          fill(gridHolder, loadingBlock());
          try {
            const res = await api('/me/saved');
            showVideos(res.videos, 'Videos you save show up here.');
          } catch (err) {
            toast(err.message, true);
          }
        });
        tabs = h('div', { class: 'seg glass', role: 'tablist', 'aria-label': 'Profile content' }, vBtn, sBtn);
      }

      fill(content, 
        h(
          'div',
          { class: 'profile-hero' },
          avatar(user, 'lg'),
          h('h1', {}, user.displayName, user.official ? h('span', { class: 'chip teal' }, 'Official') : null),
          h('span', { class: 'at' }, '@' + user.username),
          stats,
          actions,
        ),
        editCard,
        tabs,
        gridHolder,
      );
    })
    .catch((err) => fill(content, h('div', { class: 'empty' }, h('h3', {}, 'Profile unavailable'), h('p', {}, err.message))));
}

async function signOut() {
  try {
    await api('/auth/logout', { method: 'POST' });
  } catch {
    /* signing out locally anyway */
  }
  state.me = null;
  resetFeed();
  setDraft(null);
  location.hash = '#/login';
}

// ---------- auth ----------
function renderAuth() {
  let mode = 'login';
  const error = h('p', { class: 'form-error', role: 'alert' });
  const username = h('input', { class: 'input', id: 'auth-user', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true, maxlength: '24' });
  const displayName = h('input', { class: 'input', id: 'auth-name', autocomplete: 'name', maxlength: '40' });
  const password = h('input', { class: 'input', id: 'auth-pass', type: 'password', autocomplete: 'current-password', required: true, minlength: '8' });
  const nameField = h('div', { class: 'field', hidden: true }, h('label', { for: 'auth-name' }, 'Display name'), displayName);
  const submit = h('button', { type: 'submit', class: 'btn block' }, 'Sign in');
  const loginTab = h('button', { type: 'button', role: 'tab', 'aria-selected': 'true' }, 'Sign in');
  const signupTab = h('button', { type: 'button', role: 'tab', 'aria-selected': 'false' }, 'Create account');
  const passHint = h('p', { class: 'hint', hidden: true }, 'At least 8 characters.');
  const userHint = h('p', { class: 'hint', hidden: true }, '3 to 24 characters: letters, numbers, dots and underscores.');

  function setMode(next) {
    mode = next;
    const signup = mode === 'signup';
    loginTab.setAttribute('aria-selected', String(!signup));
    signupTab.setAttribute('aria-selected', String(signup));
    nameField.hidden = !signup;
    passHint.hidden = !signup;
    userHint.hidden = !signup;
    password.setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
    submit.textContent = signup ? 'Create account' : 'Sign in';
    error.textContent = '';
  }
  loginTab.addEventListener('click', () => setMode('login'));
  signupTab.addEventListener('click', () => setMode('signup'));

  const form = h(
    'form',
    { class: 'auth-card glass', novalidate: true },
    h('div', { class: 'seg', role: 'tablist', 'aria-label': 'Account' }, loginTab, signupTab),
    h('div', { class: 'field' }, h('label', { for: 'auth-user' }, 'Username'), username, userHint),
    nameField,
    h('div', { class: 'field' }, h('label', { for: 'auth-pass' }, 'Password'), password, passHint),
    error,
    submit,
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.textContent = '';
    submit.disabled = true;
    try {
      const body = { username: username.value.trim(), password: password.value };
      if (mode === 'signup') body.displayName = displayName.value.trim();
      const res = await api(mode === 'signup' ? '/auth/signup' : '/auth/login', { method: 'POST', body });
      state.me = res.user;
      resetFeed();
      location.hash = '#/';
    } catch (err) {
      error.textContent = err.message;
    } finally {
      submit.disabled = false;
    }
  });

  const logo = h('span', { class: 'logo', 'aria-hidden': 'true' });
  logo.innerHTML =
    '<svg viewBox="0 0 64 64" width="64" height="64"><rect width="64" height="64" rx="16" fill="url(#vela-grad)"/>' +
    '<path d="M18 18l14 30 14-30" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  fill(screenEl, 
    h(
      'div',
      { class: 'auth' },
      h(
        'div',
        { class: 'brand' },
        logo,
        h('h1', {}, 'Your feed. ', h('span', { class: 'grad' }, 'Your rules.')),
        h('p', {}, 'Vela is vertical video with an algorithm you can actually see, and steer.'),
      ),
      form,
      state.config.ephemeral
        ? h(
            'p',
            { class: 'notice' },
            icon('info', 18),
            h('span', {}, 'This is a demo server. Accounts and uploaded videos are erased whenever the server restarts or updates.'),
          )
        : null,
    ),
  );
  username.focus({ preventScroll: true });
}

// =============================================================
// Router
// =============================================================
let currentRouteName = null;
let cleanup = null;

const ROUTES = [
  { name: 'login', re: /^\/login$/, nav: null, render: () => renderAuth() },
  { name: 'feed', re: /^\/?$/, nav: 'home', render: () => showFeed() },
  { name: 'discover', re: /^\/discover$/, nav: 'discover', render: (m, q) => renderDiscover(q) },
  { name: 'inbox', re: /^\/inbox$/, nav: 'inbox', render: () => renderInbox() },
  { name: 'profile', re: /^\/profile$/, nav: 'profile', render: () => renderProfile(null) },
  { name: 'user', re: /^\/u\/([^/]+)$/, nav: 'profile', render: (m) => renderProfile(decodeURIComponent(m[1])) },
  { name: 'video', re: /^\/v\/(\d+)$/, nav: null, render: (m) => renderSingle(Number(m[1])) },
  { name: 'algorithm', re: /^\/algorithm$/, nav: null, render: () => renderAlgorithm() },
];

function showFeed() {
  if (!feed) feed = createFeed();
  fill(screenEl, feed.el);
  feed.show();
  return () => feed && feed.hide();
}

function route() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  if (!state.me && path !== '/login') return location.replace('#/login');
  if (state.me && path === '/login') return location.replace('#/');
  let match = null;
  const r = ROUTES.find((x) => (match = path.match(x.re)));
  if (!r) return location.replace('#/');

  closeAllSheets();
  if (cleanup) cleanup();
  cleanup = null;
  currentRouteName = r.name;
  screenEl.className = 'screen' + (r.nav ? ' with-nav' : '');
  renderTabbar(r.nav);
  cleanup = r.render(match, new URLSearchParams(qs || '')) || null;
  if (r.name !== 'feed') screenEl.focus({ preventScroll: true });
}

async function boot() {
  try {
    const [config, me] = await Promise.all([api('/config'), api('/me')]);
    state.config = config;
    state.me = me.user;
  } catch (err) {
    toast(err.message, true);
  }
  window.addEventListener('hashchange', route);
  route();
}

boot();
