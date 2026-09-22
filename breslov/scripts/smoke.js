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

async function call(server, path) {
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  const text = await res.text();
  let body = text;
  if ((res.headers.get('content-type') || '').indexOf('json') !== -1) {
    body = JSON.parse(text);
  }
  return { status: res.status, body };
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

  server.close();
  console.log(`\n${failures === 0 ? 'Every endpoint answered.' : failures + ' endpoint(s) failed.'}\n`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main();
