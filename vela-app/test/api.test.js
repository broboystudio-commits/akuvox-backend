'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { once } = require('events');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'vela-test-'));
const { createApp } = require('../server/index.js');
const { seed } = require('../server/seed.js');
const { db } = require('../server/db.js');

const SAMPLE = path.join(__dirname, '..', 'seed', 'welcome.mp4');
let server;
let base;

before(async () => {
  seed();
  server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  db.close();
  fs.rmSync(process.env.DATA_DIR, { recursive: true, force: true });
});

function client() {
  let cookie = '';
  return async function call(method, url, body, headers = {}) {
    const h = { ...headers };
    if (cookie) h.cookie = cookie;
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      h['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(base + url, { method, headers: h, body: payload });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* not json */
    }
    return { status: res.status, data };
  };
}

async function signup(name) {
  const c = client();
  const r = await c('POST', '/api/auth/signup', { username: name, password: 'password123', displayName: name.toUpperCase() });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return c;
}

async function uploadAs(c, caption) {
  const form = new FormData();
  form.append('caption', caption);
  form.append('video', new Blob([fs.readFileSync(SAMPLE)], { type: 'video/mp4' }), 'clip.mp4');
  const r = await c('POST', '/api/videos', form);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.video;
}

test('signup validates input and logs in', async () => {
  const c = client();
  assert.equal((await c('POST', '/api/auth/signup', { username: 'a', password: 'password123' })).status, 400);
  assert.equal((await c('POST', '/api/auth/signup', { username: 'okname', password: 'short' })).status, 400);
  const r = await c('POST', '/api/auth/signup', { username: 'maria', password: 'password123', displayName: 'Maria' });
  assert.equal(r.status, 201);
  assert.equal(r.data.user.username, 'maria');
  assert.equal((await c('POST', '/api/auth/signup', { username: 'MARIA', password: 'password123' })).status, 409);
  const me = await c('GET', '/api/me');
  assert.equal(me.data.user.displayName, 'Maria');
});

test('login rejects a wrong password and the system account', async () => {
  const c = client();
  assert.equal((await c('POST', '/api/auth/login', { username: 'maria', password: 'nope-nope' })).status, 401);
  assert.equal((await c('POST', '/api/auth/login', { username: 'vela', password: 'anything1' })).status, 401);
  assert.equal((await c('POST', '/api/auth/login', { username: 'maria', password: 'password123' })).status, 200);
});

test('signed-out requests are refused', async () => {
  const c = client();
  assert.equal((await c('GET', '/api/feed')).status, 401);
});

test('new accounts see the seeded intro videos with ranking reasons', async () => {
  const c = await signup('newbie');
  const r = await c('GET', '/api/feed?tab=foryou');
  assert.equal(r.status, 200);
  assert.equal(r.data.videos.length, 3);
  assert.ok(r.data.videos[0].why.reasons.length > 0);
  const following = await c('GET', '/api/feed?tab=following');
  assert.equal(following.data.videos.length, 3, 'new users follow @vela');
});

test('upload accepts real video and rejects disguised files', async () => {
  const c = await signup('creator1');
  const video = await uploadAs(c, 'Sunset run #Running #goldenhour');
  assert.match(video.url, /^\/media\/[0-9a-f]+\.mp4$/);
  const media = await fetch(base + video.url, { headers: { range: 'bytes=0-99' } });
  assert.equal(media.status, 206);

  const bad = new FormData();
  bad.append('video', new Blob(['not really a video'], { type: 'video/mp4' }), 'fake.mp4');
  assert.equal((await c('POST', '/api/videos', bad)).status, 400);

  const wrongType = new FormData();
  wrongType.append('video', new Blob(['hello'], { type: 'text/plain' }), 'notes.txt');
  assert.equal((await c('POST', '/api/videos', wrongType)).status, 400);

  const tags = await c('GET', '/api/search?q=%23running');
  assert.equal(tags.data.videos.length, 1);
});

test('likes, saves, reposts and comments update counts and inbox', async () => {
  const owner = await signup('owner1');
  const fan = await signup('fan1');
  const video = await uploadAs(owner, 'Hello #test');

  let r = await fan('POST', `/api/videos/${video.id}/like`);
  assert.equal(r.data.video.counts.likes, 1);
  assert.equal(r.data.video.liked, true);
  r = await fan('POST', `/api/videos/${video.id}/like`);
  assert.equal(r.data.video.counts.likes, 1, 'liking twice is idempotent');
  r = await fan('POST', `/api/videos/${video.id}/save`);
  assert.equal(r.data.video.counts.saves, 1);
  r = await fan('POST', `/api/videos/${video.id}/repost`);
  assert.equal(r.data.video.counts.reposts, 1);
  r = await fan('POST', `/api/videos/${video.id}/comments`, { body: 'Great clip' });
  assert.equal(r.status, 201);
  assert.equal(r.data.video.counts.comments, 1);
  assert.equal((await fan('POST', `/api/videos/${video.id}/comments`, { body: '   ' })).status, 400);

  assert.equal((await owner('POST', `/api/videos/${video.id}/repost`)).status, 400, 'no reposting yourself');

  const inbox = await owner('GET', '/api/inbox');
  const types = inbox.data.items.map((i) => i.type).sort();
  assert.deepEqual(types, ['comment', 'like', 'repost', 'save']);

  r = await fan('DELETE', `/api/videos/${video.id}/like`);
  assert.equal(r.data.video.counts.likes, 0);

  assert.equal((await fan('DELETE', `/api/videos/${video.id}`)).status, 403);
  assert.equal((await owner('DELETE', `/api/videos/${video.id}`)).status, 200);
});

test('settings are validated and saved', async () => {
  const c = await signup('tuner');
  assert.equal((await c('PATCH', '/api/me/settings', { reach_adjust: 80 })).status, 400);
  assert.equal((await c('PATCH', '/api/me/settings', { w_following: -1 })).status, 400);
  const r = await c('PATCH', '/api/me/settings', { reach_adjust: 25, nearby_only: true, w_discovery: 90 });
  assert.equal(r.status, 200);
  assert.equal(r.data.settings.reach_adjust, 25);
  assert.equal(r.data.settings.nearby_only, true);
  assert.equal(r.data.settings.w_discovery, 90);
  assert.equal(r.data.defaults.reach_adjust, 0);
});

test('distribution rules control who can see a post', async () => {
  const author = await signup('author1');
  const viewer = await signup('viewer1');
  const video = await uploadAs(author, 'Rules test #rules');
  const sees = async () => (await viewer('GET', '/api/feed?tab=foryou&limit=20')).data.videos.some((v) => v.id === video.id);

  assert.equal(await sees(), true, 'visible by default');

  await author('PATCH', '/api/me/settings', { recommend_non_followers: false });
  assert.equal(await sees(), false, 'hidden from non-followers');
  await viewer('POST', '/api/users/author1/follow');
  assert.equal(await sees(), true, 'followers still see it');
  await viewer('DELETE', '/api/users/author1/follow');

  await author('PATCH', '/api/me/settings', { recommend_non_followers: true, nearby_only: true });
  await author('PATCH', '/api/me/profile', { region: 'Brooklyn' });
  assert.equal(await sees(), false, 'viewer has no area');
  await viewer('PATCH', '/api/me/profile', { region: 'brooklyn ' });
  assert.equal(await sees(), true, 'same area matches case-insensitively');

  await author('PATCH', '/api/me/settings', { nearby_only: false, followers_first: true });
  assert.equal(await sees(), false, 'new post is held back for non-followers');

  await author('PATCH', '/api/me/settings', { followers_first: false, allow_reposts: false });
  assert.equal((await viewer('POST', `/api/videos/${video.id}/repost`)).status, 403);
});

test('reach adjustment changes ranking order', async () => {
  const a = await signup('reacha');
  const b = await signup('reachb');
  const viewer = await signup('reachviewer');
  const va = await uploadAs(a, 'A');
  const vb = await uploadAs(b, 'B');
  await a('PATCH', '/api/me/settings', { reach_adjust: 50 });
  await b('PATCH', '/api/me/settings', { reach_adjust: -50 });
  const ids = (await viewer('GET', '/api/feed?tab=foryou&limit=20')).data.videos.map((v) => v.id);
  assert.ok(ids.indexOf(va.id) < ids.indexOf(vb.id));
});

test('following feed includes reposts by people you follow', async () => {
  const creator = await signup('origcreator');
  const friend = await signup('friend1');
  const me = await signup('watcher1');
  const video = await uploadAs(creator, 'Original');
  await friend('POST', `/api/videos/${video.id}/repost`);
  await me('POST', '/api/users/friend1/follow');
  const r = await me('GET', '/api/feed?tab=following');
  const item = r.data.videos.find((v) => v.id === video.id);
  assert.ok(item, 'repost shows up');
  assert.equal(item.repostedBy, 'friend1');
});

test('cross-site writes are blocked', async () => {
  const c = await signup('csrfuser');
  const r = await c('PATCH', '/api/me/settings', { reach_adjust: 10 }, { origin: 'https://evil.example' });
  assert.equal(r.status, 403);
});
