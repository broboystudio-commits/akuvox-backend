'use strict';

/**
 * Calls every endpoint and checks the answer.
 *
 * `node -e "require('./server.js')"` only proves the file parses. It does not
 * run a single line inside a handler, which is how a handler that used `req`
 * without being given it reached the live server: it loaded perfectly and
 * failed the moment it was called. This actually calls them.
 *
 * Run with:  npm run smoke
 */

/**
 * Sefaria is stubbed so that the branches which only run when it is reachable
 * are exercised too. Without this, anything behind `if (texts.ok)` is dead
 * code here and a fault in it reaches the live server untested -- which is
 * precisely what happened.
 */
const sefaria = require('../lib/sefaria');
sefaria.getShape = async (title) => [{ title, length: 12, chapters: [[2, 3]] }];
sefaria.getText = async (ref) => ({
  ref, heRef: ref, hebrew: ['שָׁלוֹם'], english: ['peace'],
  hebrewVersion: 'stub', englishVersion: 'stub', url: '',
});
sefaria.getLinks = async () => ([{ index_title: 'Likutei Moharan', ref: 'Likutei Moharan 19' }]);
sefaria.getCalendars = async () => ({ calendar_items: [{ title: { en: 'Parashat Hashavua' }, ref: 'Genesis 1:1-6:8' }] });
sefaria.search = async () => ({ hits: [{ ref: 'Likutei Moharan 24', snippet: 'x', lang: 'he' }], total: 1, via: 'stub' });
sefaria.suggest = async () => ([{ text: 'Likutei Moharan', kind: 'book' }]);
sefaria.catalogFor = async () => ['Likutei Moharan', 'Some Other Breslov Sefer'];

const app = require('../server');

const ROUTES = [
  { path: '/api/health',       expect: (b) => b.ok === true && b.build },
  { path: '/api/diagnostics',  expect: (b) => Array.isArray(b.checks) && b.checks.length >= 3 },
  { path: '/api/diagnostics?catalog=1', expect: (b) => Array.isArray(b.checks) },
  { path: '/api/calendar',     expect: (b) => b.hebrew && b.gregorian },
  { path: '/api/zmanim',       expect: (b) => Array.isArray(b.times) && b.times.length >= 12 },
  { path: '/api/zmanim?minhag=rabbeinu-tam', expect: (b) => b.prefs && b.prefs.tzais === '72' },
  { path: '/api/today',        expect: (b) => b.calendar && b.zmanim },
  { path: '/api/widget',       expect: (b) => b.hebrewDate && Array.isArray(b.times) },
  { path: '/api/daily',        expect: (b) => 'available' in b },
  { path: '/api/tehillim',     expect: (b) => 'available' in b },
  { path: '/api/tikkun',       expect: (b) => 'available' in b },
  { path: '/api/weekly',       expect: (b) => 'available' in b },
  { path: '/api/library',      expect: (b) => Array.isArray(b.books) },
  { path: '/api/search?q=',    expect: (b) => Array.isArray(b.hits) },
  { path: '/api/search?q=simcha', expect: (b) => Array.isArray(b.hits) },
  { path: '/api/suggest?q=lik',   expect: (b) => Array.isArray(b.suggestions) },
  { path: '/api/reminders.ics',   expect: (b) => typeof b === 'string' && b.indexOf('BEGIN:VCALENDAR') === 0 },
  { path: '/',                 expect: (b) => typeof b === 'string' && b.indexOf('<!DOCTYPE html>') === 0 },
  { path: '/app.js?v=1',       expect: (b) => typeof b === 'string' && b.length > 1000 },
  { path: '/styles.css?v=1',   expect: (b) => typeof b === 'string' && b.length > 1000 },
];

let failures = 0;

async function call(server, path, headers) {
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers: headers || {} });
  const text = await res.text();
  let body = text;
  if ((res.headers.get('content-type') || '').indexOf('json') !== -1) {
    body = JSON.parse(text);
  }
  return { status: res.status, body, setCookie: res.headers.get('set-cookie') || '' };
}

/**
 * The lock, checked from both sides.
 *
 * Checking only that the password works would pass on a lock that lets
 * everybody in, so every check here has a matching one for the door being
 * shut. The health check must stay open whatever happens: Render polls it,
 * and a locked-out health check fails every deploy.
 */
async function checkTheLock(server, report) {
  const PASSWORD = 'a-test-password-only';
  process.env.SITE_PASSWORD = PASSWORD;
  process.env.SITE_USER = 'breslov';

  const basic = 'Basic ' + Buffer.from('breslov:' + PASSWORD).toString('base64');
  const wrong = 'Basic ' + Buffer.from('breslov:not-the-password').toString('base64');

  // Get a cookie the way a real visit to ?key=... would.
  const keyed = await call(server, '/api/today?key=' + encodeURIComponent(PASSWORD));
  const cookie = (keyed.setCookie || '').split(';')[0];

  // The password box itself, which is the only way in that a phone has.
  const form = async (body, headers) => {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/unlock`, {
      method: 'POST',
      redirect: 'manual',
      headers: Object.assign({ 'Content-Type': 'application/x-www-form-urlencoded' }, headers || {}),
      body: new URLSearchParams(body).toString(),
    });
    return { status: res.status, location: res.headers.get('location') || '', cookie: res.headers.get('set-cookie') || '' };
  };

  const good = await form({ password: PASSWORD, next: '/tikkun' });
  const badTry = await form({ password: 'not-it', next: '/tikkun' });
  const offSite = await form({ password: PASSWORD, next: '//example.com/steal' });

  const cases = [
    ['health stays open when locked', '/api/health', {}, 200],
    ['a page is shut',                '/',           {}, 401],
    ['an api answer is shut',         '/api/today',  {}, 401],
    ['the script is shut',            '/app.js',     {}, 401],
    ['the calendar feed is shut',     '/api/reminders.ics', {}, 401],
    ['the wrong password is refused', '/api/today',  { Authorization: wrong }, 401],
    ['a made-up key is refused',      '/api/today?key=guess', {}, 401],
    ['the password lets you in',      '/api/today',  { Authorization: basic }, 200],
    ['the key lets a widget in',      '/api/widget?key=' + encodeURIComponent(PASSWORD), {}, 200],
    ['the key header works too',      '/api/today',  { 'X-Access-Key': PASSWORD }, 200],
    ['the calendar feed opens with the key', '/api/reminders.ics?key=' + encodeURIComponent(PASSWORD), {}, 200],
    ['the cookie is remembered',      '/api/today',  { Cookie: cookie }, 200],
  ];

  console.log('\nWith a password set\n');
  for (const [name, path, headers, want] of cases) {
    const line = `  ${name}`.padEnd(42);
    try {
      const { status } = await call(server, path, headers);
      if (status !== want) {
        console.log(`${line} FAIL  answered ${status}, expected ${want}`);
        report();
        continue;
      }
      console.log(`${line} ok`);
    } catch (err) {
      console.log(`${line} FAIL  ${err.message}`);
      report();
    }
  }

  const box = [
    ['the password box lets you in',        good.status === 303],
    ['and sends you where you were going',  good.location === '/tikkun'],
    ['and hands back the cookie',           good.cookie.indexOf('bd_access=') === 0],
    ['a wrong password is refused',         badTry.status === 401],
    ['and hands back no cookie',            badTry.cookie === ''],
    // `next` comes off the address bar, so it is somewhere on this site or
    // it is the front page -- never a jump to somebody else's.
    ['it cannot be used to send you away',  offSite.status === 303 && offSite.location === '/'],
  ];
  for (const [name, ok] of box) {
    const line = `  ${name}`.padEnd(42);
    if (ok) console.log(`${line} ok`);
    else { console.log(`${line} FAIL`); report(); }
  }

  // ?key= should have handed back a cookie, or the key would have to be on
  // every address for the rest of the visit.
  const line = '  ?key= sets a cookie'.padEnd(42);
  if (cookie.indexOf('bd_access=') === 0) console.log(`${line} ok`);
  else { console.log(`${line} FAIL  no cookie came back`); report(); }

  // And the health check must still say so.
  const health = await call(server, '/api/health');
  const locked = '  health reports the lock is on'.padEnd(42);
  if (health.body && health.body.locked === true) console.log(`${locked} ok`);
  else { console.log(`${locked} FAIL  health says locked=${health.body && health.body.locked}`); report(); }

  delete process.env.SITE_PASSWORD;
  delete process.env.SITE_USER;

  // Back to open: proves the lock really is off when no password is set,
  // rather than leaving the site shut for anybody running it at home.
  const open = await call(server, '/api/today');
  const back = '  no password means no lock'.padEnd(42);
  if (open.status === 200) console.log(`${back} ok`);
  else { console.log(`${back} FAIL  still answering ${open.status}`); report(); }
}

async function main() {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  console.log('\nCalling every endpoint\n');

  for (const route of ROUTES) {
    let line = `  ${route.path}`.padEnd(42);
    try {
      const { status, body } = await call(server, route.path);

      // A handler that threw is reported as JSON with an `error`, not as a
      // crash, so the status alone is not enough to trust.
      if (body && typeof body === 'object' && body.error) {
        console.log(`${line} FAIL  ${status} ${body.error}: ${body.detail || ''}`);
        failures++;
        continue;
      }
      if (status !== 200) {
        console.log(`${line} FAIL  status ${status}`);
        failures++;
        continue;
      }
      if (!route.expect(body)) {
        console.log(`${line} FAIL  answered 200 but not in the expected shape`);
        failures++;
        continue;
      }
      console.log(`${line} ok`);
    } catch (err) {
      console.log(`${line} FAIL  ${err.message}`);
      failures++;
    }
  }

  await checkTheLock(server, () => { failures++; });

  server.close();
  console.log(`\n${failures === 0 ? 'Every endpoint answered.' : failures + ' check(s) failed.'}\n`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main();
