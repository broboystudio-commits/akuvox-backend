'use strict';

/**
 * What your uncle saw, and whether it can happen again.
 *
 * He opened the site minutes after a deploy. The disk is wiped on every
 * deploy, so the cache was empty, every panel went to Sefaria live on a
 * server that was still warming up, and one timed-out request was enough to
 * turn the whole page into "this could not be loaded".
 *
 * Two things were meant to fix that: a request that fails is asked once more,
 * and the server fetches the day's learning itself before anyone visits. This
 * checks both by making Sefaria fail on purpose.
 *
 * Run with:  npm run resilience
 */

// A cache of its own, before anything is loaded.
//
// Two checks here passed with nothing behind them until this was added: the
// text was already sitting in data/cache from an earlier run, so no request
// was made at all and "it was not asked for twice" was true because it was
// never asked for once. A test that reads the real cache is not testing the
// network path it claims to be.
const os = require('os');
const path = require('path');
const fs = require('fs');
process.env.CACHE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'breslov-test-'));

const sefaria = require('../lib/sefaria');

const HE = 'דַּע כִּי צָרִיךְ לָדוּן אֶת כָּל אָדָם לְכַף זְכוּת.';
const EN = 'Know that you must judge every person favourably.';

let bad = 0;
function check(name, ok, detail) {
  console.log(`  ${name.padEnd(52)} ${ok ? 'ok' : 'FAIL'}${detail ? '  ' + detail : ''}`);
  if (!ok) bad++;
}

/** A Sefaria that fails the first `failures` calls, then behaves. */
function flaky(failures, kind) {
  let seen = 0;
  return async (ref) => {
    seen += 1;
    if (seen <= failures) {
      const err = new Error(kind === 'timeout' ? 'The operation was aborted' : 'Sefaria responded 503');
      if (kind !== 'timeout') err.status = 503;
      throw err;
    }
    return {
      ref, heRef: ref, hebrew: [HE, HE], english: [EN, EN],
      hebrewVersion: 'Test', englishVersion: 'Test', license: 'CC0', url: '',
      calls: seen,
    };
  };
}

async function main() {
  process.env.SEFARIA_RETRY_MS = '10';   // no need to actually wait in a test
  process.env.SITE_PASSWORD = 'a-test-password-only';

  console.log('\nWhen Sefaria has a bad moment\n');

  // --- the retry, at the level it actually lives: one HTTP call.
  //
  // Counting calls alone will not do. getText asks Sefaria's current endpoint
  // and falls back to the old one when that fails, so two calls can mean two
  // different addresses tried once each -- which is the fallback working, not
  // a retry. What a retry looks like is the *same* address asked twice.
  const realFetch = global.fetch;
  let asked = [];
  const countUrls = () => {
    const seen = new Map();
    for (const u of asked) seen.set(u, (seen.get(u) || 0) + 1);
    return seen;
  };

  // A dropped connection, which is the kind that is often gone a second later.
  asked = [];
  let first = true;
  global.fetch = async (url) => {
    asked.push(String(url));
    if (first) { first = false; throw new Error('fetch failed'); }
    return { ok: true, status: 200, json: async () => ({ ref: 'x', versions: [], text: [EN], he: [HE] }) };
  };
  sefaria.clearMemory();
  let recovered = null;
  try { recovered = await sefaria.getText('Psalms 16'); } catch (e) { recovered = null; }
  const retried = asked.length > 0 && [...countUrls().values()].some((n) => n >= 2);
  check('a dropped request is asked again', retried, `${asked.length} calls, ${countUrls().size} addresses`);
  check('and the text arrives anyway', !!(recovered && recovered.hebrew && recovered.hebrew.length));

  // A missing text is not a blip. Asking twice wastes a second and changes
  // nothing -- though trying the older endpoint once is fair, and expected.
  asked = [];
  global.fetch = async (url) => { asked.push(String(url)); return { ok: false, status: 404, json: async () => ({}) }; };
  // A psalm of its own. The check above succeeded, which cached Psalms 16 --
  // ask for it again and nothing goes to the network at all.
  sefaria.clearMemory();
  try { await sefaria.getText('Psalms 19'); } catch (e) { /* expected */ }
  check('a missing text is never asked for twice',
    asked.length > 0 && [...countUrls().values()].every((n) => n === 1),
    `${asked.length} calls, ${countUrls().size} addresses`);

  // Nor is a refusal. If we are not welcome, we are not welcome.
  asked = [];
  global.fetch = async (url) => { asked.push(String(url)); return { ok: false, status: 403, json: async () => ({}) }; };
  sefaria.clearMemory();
  try { await sefaria.getText('Psalms 17'); } catch (e) { /* expected */ }
  check('a refusal is never argued with',
    asked.length > 0 && [...countUrls().values()].every((n) => n === 1),
    `${asked.length} calls, ${countUrls().size} addresses`);

  // But a 503 is exactly the kind worth asking again.
  asked = [];
  let shaky = 2;
  global.fetch = async (url) => {
    asked.push(String(url));
    if (shaky-- > 0) return { ok: false, status: 503, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => ({ ref: 'x', versions: [], text: [EN], he: [HE] }) };
  };
  sefaria.clearMemory();
  let afterWobble = null;
  try { afterWobble = await sefaria.getText('Psalms 18'); } catch (e) { afterWobble = null; }
  check('a server having trouble is asked again',
    asked.length > 1 && !!(afterWobble && afterWobble.hebrew), `${asked.length} calls`);

  global.fetch = realFetch;

  // --- the warm-up: is the day's learning there before anyone asks?
  console.log('\nBefore anyone has visited\n');

  sefaria.getShape = async (title) => [{ title, length: 100 }];
  sefaria.getText = flaky(0);
  sefaria.getLinks = async () => ([{ index_title: 'Likutei Moharan', ref: 'Likutei Moharan 19' }]);
  sefaria.getCalendars = async () => ({ calendar_items: [{ title: { en: 'Parashat Hashavua' }, ref: 'Genesis 1:1-6:8' }] });
  sefaria.clearMemory();

  const app = require('../server');
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const port = server.address().port;

  const warmed = await app.warmUp(port);
  check('the server fetches the day itself', warmed.every((r) => r.ok),
    warmed.filter((r) => !r.ok).map((r) => r.path).join(', ') || 'all of it');

  // And now the first visitor -- the one who used to get the empty page --
  // is answered without Sefaria being touched at all.
  let touched = 0;
  const realGetText = sefaria.getText;
  sefaria.getText = async (ref) => { touched += 1; return realGetText(ref); };

  const res = await fetch(`http://127.0.0.1:${port}/api/today`, {
    headers: { Accept: 'application/json', 'X-Access-Key': 'a-test-password-only' },
  });
  const body = await res.json();
  check('the first visitor gets the teaching', !!(body.spark && body.spark.available !== false));
  check('the first visitor gets the Tehillim', !!(body.tehillim && body.tehillim.available !== false));
  check('and none of it went to Sefaria', touched === 0, `${touched} calls`);

  server.close();
  console.log(bad === 0
    ? '\nA bad minute at Sefaria no longer empties the page.\n'
    : `\n${bad} check(s) failed.\n`);
  process.exitCode = bad ? 1 : 0;
}

main();
