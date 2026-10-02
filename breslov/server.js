'use strict';

/**
 * Breslov Daily -- the server.
 *
 * It does two jobs:
 *   1. Serves the website (everything in the public/ folder).
 *   2. Answers the /api/... questions the website and the iPhone widgets ask.
 *
 * Start it with:  npm start
 */

const path = require('path');
const express = require('express');
const cors = require('cors');

const dates = require('./lib/dates');
const ics = require('./lib/ics');
const zmanimLib = require('./lib/zmanim');
const daily = require('./lib/daily');
const inspiration = require('./lib/inspiration');
const teachers = require('./lib/teachers');
const history = require('./lib/history');
const library = require('./lib/library');
const yahrzeits = require('./lib/yahrzeits');
const ushpizin = require('./lib/ushpizin');
const sefaria = require('./lib/sefaria');
const lock = require('./lib/lock');
const { isoDateInZone, dateFromIso } = require('./lib/util');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Bumped with every change to the page, the script or the stylesheet.
 * Open /api/health to see which build is actually running -- the quickest way
 * to tell a stale browser apart from a deploy that never happened.
 */
const BUILD = '71';

app.use(cors());

/**
 * The password lock, if one is set. Above everything else on purpose: nothing
 * -- no page, no picture, no /api/... answer -- is served past this line
 * without the password or the key. See lib/lock.js for the three ways in.
 */
app.use(lock.middleware);

app.use(express.json());
// The password box posts an ordinary form, which is what makes it work in
// every browser without a line of JavaScript.
app.use(express.urlencoded({ extended: false }));

/**
 * A small in-memory cache. Text for a given day never changes, so we work it
 * out once and hand the same answer to everyone until the day rolls over.
 */
const cache = new Map();
async function cached(key, ttlMs, build) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await build();
  // Don't cache failures for long -- the network may come back.
  const ttl = value && value.available === false ? 60 * 1000 : ttlMs;
  cache.set(key, { at: Date.now(), value, ttl });
  return value;
}
const DAY = 24 * 3600 * 1000;

/** Read the location out of the query string (?lat=&lng=&tz=&name=). */
function placeFromQuery(req) {
  return dates.normalisePlace({
    lat: req.query.lat,
    lng: req.query.lng,
    tz: req.query.tz,
    name: req.query.name,
    elevation: req.query.elevation,
    israel: req.query.israel,
  });
}

/** Which opinions to follow (?minhag=rabbeinu-tam, or per-line ?tzais=72). */
function zmanimPrefsFromQuery(req) {
  return req.query; // normalisePrefs() whitelists these, so nothing unsafe gets through
}

/** The day being asked about: ?date=YYYY-MM-DD, otherwise today where the user is. */
function dateFromQuery(req, place) {
  const asked = String(req.query.date || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(asked)) return dateFromIso(asked);
  return dateFromIso(isoDateInZone(new Date(), place.timeZone));
}

/** Wrap a handler so one failure returns clean JSON instead of an HTML error page. */
function route(handler) {
  return async (req, res) => {
    try {
      const payload = await handler(req, res);
      if (!res.headersSent) res.json(payload);
    } catch (err) {
      console.error(`${req.path} failed:`, err.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Something went wrong', detail: err.message });
      }
    }
  };
}

// ---------------------------------------------------------------- health

app.get('/api/health', route(async () => ({
  ok: true,
  build: BUILD,
  time: new Date().toISOString(),
  locked: lock.status().locked,
  cache: sefaria.cacheStats(),
  memoryKeys: cache.size,
})));

/**
 * Who runs this site, and how to reach them.
 *
 * A site that holds a policy saying "write to us about your data" has to say
 * where. These are set in Render's environment, never written into the code:
 * whoever puts this online decides what name and address go on it, and until
 * they do the page says plainly that it has not been filled in rather than
 * printing somebody's details because a file in a repository had them.
 */
app.get('/api/site', route(async () => {
  const text = (name) => String(process.env[name] || '').trim();
  return {
    owner: text('SITE_OWNER'),
    contact: text('SITE_CONTACT'),
    where: text('SITE_WHERE'),
  };
}));

/**
 * "Forget everything you hold about me."
 *
 * There is exactly one thing: the cookie that remembers you got past the
 * password. There are no accounts, no database and no logs of anybody's
 * doings, so this is the whole of it -- and the page says so rather than
 * implying some larger erasure is going on behind it.
 *
 * Settings live in the browser's own storage and are cleared by the page
 * itself; the server has never seen them and cannot clear them from here.
 */
app.post('/api/forget', (req, res) => {
  lock.forget(req, res);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ok: true,
    cleared: ['the access cookie'],
    note: 'Nothing else is held: no account, no database, no record of what anyone read.',
  });
});

/**
 * The password box posts here.
 *
 * Right password: the cookie is set and you are sent back to the page you
 * were trying to reach. Wrong one: the same page again, saying so. Either way
 * it is a plain form post and a redirect, so it behaves the same in Safari,
 * in the app on a home screen, and through the service worker -- which is
 * where the browser's own password dialog fell down.
 */
app.post('/api/unlock', (req, res) => {
  const next = lock.safeNext(req.body && req.body.next);
  if (!lock.isLocked() || lock.accepts(req.body && req.body.password)) {
    if (lock.isLocked()) lock.remember(req, res);
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(303, next);
  }
  res.status(401);
  res.setHeader('Cache-Control', 'no-store');
  return res.type('html').send(lock.page({ next, wrong: true }));
});

/**
 * The key a calendar subscription needs, handed only to somebody who is
 * already past the lock. A calendar app cannot be shown a password box, so the
 * .ics address has to carry the key on the end of it -- and this is where the
 * page gets the key to put there. Nothing is given away: whoever can read this
 * answer can already read every page on the site.
 */
app.get('/api/access', route(async () => {
  const state = lock.status();
  return { locked: state.locked, key: state.locked ? lock.key() : '' };
}));

/**
 * A single page that answers "is this thing actually working?".
 *
 * The calendar and the zmanim are worked out on this machine, so they should
 * always pass. The texts need to reach sefaria.org, and that is the part worth
 * checking from outside -- it is the difference between a server that is
 * broken and one that simply cannot get out to the internet.
 *
 * Deliberately separate from /api/health, which Render polls: this one makes
 * an outside request and must never be able to fail a health check.
 */
app.get('/api/diagnostics', route(async (req) => {
  const wantsCatalog = String(req.query.catalog || '') === '1';
  const place = dates.normalisePlace({});
  const today = new Date();
  const checks = [];

  function record(name, ok, detail) {
    checks.push({ name, ok, detail });
  }

  // --- things that need no internet
  try {
    const calendar = dates.calendarFor(today, place, new Date());
    record('Hebrew date', !!calendar.hebrew.gematriya, calendar.hebrew.gematriya);
    record('Parsha', !!calendar.parsha, calendar.parsha ? calendar.parsha.en : 'none found');
    const z = zmanimLib.zmanimFor(today, place);
    record('Zmanim', z.times.length >= 12, `${z.times.length} times calculated`);
  } catch (err) {
    record('Calendar and zmanim', false, err.message);
  }

  // --- the part that needs the internet
  // Which of the yahrzeit seforim Sefaria actually carries. Those titles are
  // a guess at how Sefaria files them, and six Breslov works were once added
  // to this app that it does not have at all -- so this asks rather than
  // assumes, and says plainly which will show a passage and which will not.
  const withBooks = yahrzeits.all().filter((y) => y.book);
  const yahrzeitBooks = await Promise.all(withBooks.map(async (y) => {
    try {
      for (const title of [y.book].concat(y.aliases || [])) {
        const shape = await sefaria.getShape(title);
        // What Sefaria calls it, not what we asked for -- the two coming
        // apart is how the Tanya nearly ended up under the Maggid's name.
        const nodes = Array.isArray(shape) ? shape : [shape];
        const sefariaCalls = (nodes[0] && nodes[0].title) || null;
        const refs = library.refsFromShape(shape, { title });
        if (refs.length) {
          // End to end, not inferred. A shape resolving is not the same as a
          // passage arriving: the title guard once refused five of these on a
          // missing field and nothing here would have shown it.
          const tried = [];
          const got = await daily.yahrzeitPassage([y.book].concat(y.aliases || []), today, tried);
          return {
            name: y.name, book: y.book, foundAs: title,
            sefariaCalls, ok: true, pieces: refs.length,
            passage: got ? got.ref : null,
            // Only when it failed. On a good book this is noise; on a bad one
            // it is the only thing that says why.
            tried: got ? undefined : tried,
          };
        }
      }
      // Nothing matched. Ask Sefaria what it does have by that name, so the
      // next spelling is read off its own catalogue rather than guessed.
      let suggestions = [];
      try {
        suggestions = (await sefaria.suggest(y.book)).slice(0, 5).map((x) => x.text);
      } catch (err) { /* the suggestion service is a nicety, not a requirement */ }
      return { name: y.name, book: y.book, ok: false, pieces: 0, sefariaSuggests: suggestions };
    } catch (err) {
      return { name: y.name, book: y.book, ok: false, detail: err.message };
    }
  }));
  // One calendar for the rest of this page, rather than a fresh one per line.
  const calendarNow = dates.calendarFor(today, place, new Date());
  const guests = ushpizin.ushpizinOn(calendarNow.hebrew);
  record('Ushpizin', true, guests
    ? `day ${guests.day} of ${guests.of}: ` +
      guests.guests.map((g) => g.name + (g.minhag ? ` (${g.minhag})` : '')).join(' / ')
    : 'not Sukkos today');

  // Every reference, not only the ones today happens to need: a passage that
  // has stopped resolving should show up on a Tuesday in Shevat, not on the
  // morning of the day it is wanted.
  const everyGuest = ushpizin.all().zohar;
  const guestRefs = await Promise.all(everyGuest.map(async (g) => {
    const tried = [];
    const got = await daily.ushpizinPassage(g.refs, today, tried);
    return { name: g.name, refs: g.refs, passage: got ? got.ref : null, tried: got ? undefined : tried };
  }));
  // Asked for, and I do not know the answer from here: Sefaria answers 403 to
  // anything not already cached in this sandbox. The Satmar Rebbe's seforim
  // are twentieth century and most likely still in copyright, which is the
  // usual reason Sefaria does not carry something. Rather than assert that,
  // this asks -- and if the answer is yes, his Torah can go in beside the
  // others. Nothing is quoted from a sefer this app has not been handed.
  const satmar = await Promise.all(
    ['Divrei Yoel', 'Divrei Yoel al HaTorah', 'VaYoel Moshe'].map(async (title) => {
      try {
        const shape = await sefaria.getShape(title);
        const nodes = Array.isArray(shape) ? shape : [shape];
        const pieces = library.refsFromShape(shape, { title }).length;
        return {
          title,
          // "The request did not throw" is not "Sefaria has the sefer".
          // Asked the first time, all three came back found, with no name
          // and nothing in them -- which is what an empty answer looks like,
          // and the headline then read as though it had all three.
          hasText: pieces > 0,
          sefariaCalls: (nodes[0] && nodes[0].title) || null,
          pieces,
          // What actually came back, so the next reading settles it rather
          // than needing another round.
          answered: JSON.stringify(shape).slice(0, 240),
        };
      } catch (err) {
        let suggests = [];
        try { suggests = (await sefaria.suggest(title)).slice(0, 4).map((x) => x.text); }
        catch (e) { /* the suggestion service is a nicety */ }
        return { title, hasText: false, why: err.message, sefariaSuggests: suggests };
      }
    }));
  const haveSatmar = satmar.filter((b) => b.hasText);
  // Not a pass or a fail: Sefaria's catalogue is not this app's doing, and a
  // sefer it does not carry is not a fault to turn the page red.
  record('Does Sefaria carry the Satmar Rebbe', true,
    haveSatmar.length
      ? `yes: ${haveSatmar.map((b) => `${b.title} (${b.pieces} pieces)`).join(', ')}`
      : `no -- ${satmar.map((b) => `${b.title}: ${b.pieces === 0 ? 'empty' : b.why}`).join('; ')}` +
        ' -- so nothing is quoted from him');

  // What the weekly card will actually show, right now, and why. Asked for
  // because the whole point of that card is that it is about this week, and
  // from this sandbox I cannot reach Sefaria's search to find out whether it
  // is. The chag's words are tried in order and each says what it found.
  const weeklyNow = await daily.weeklyTorah(today, calendarNow);
  const chagNow = daily.yomTovAhead(calendarNow);
  let chagWords = null;
  if (chagNow) {
    chagWords = [];
    await daily.breslovAbout(chagNow.look, today, 83, chagWords);
  }
  record("This week's Torah", weeklyNow && weeklyNow.available,
    weeklyNow && weeklyNow.available
      ? `${weeklyNow.mode}: ${weeklyNow.ref}` +
        (weeklyNow.yomTov ? ` -- on ${weeklyNow.yomTov}` : '') +
        (weeklyNow.parsha && !weeklyNow.yomTov ? ` -- on Parashas ${weeklyNow.parsha}` : '') +
        (weeklyNow.says ? ` (${weeklyNow.says})` : '')
      : `nothing found${chagNow ? ' for ' + chagNow.en : ''}`);

  // Whether the two policy pages can say who runs this site. Reported from
  // here because the alternative is opening the page and squinting at it, and
  // because getting an environment variable's name slightly wrong in Render
  // looks exactly like not having set it at all.
  const siteSet = ['SITE_OWNER', 'SITE_CONTACT', 'SITE_WHERE']
    .map((name) => ({ name, set: !!String(process.env[name] || '').trim() }));
  record('Who runs this site', true,
    siteSet.some((v) => v.set)
      ? siteSet.filter((v) => v.set).map((v) => v.name).join(', ') + ' set' +
        (siteSet.some((v) => !v.set)
          ? ' (not set: ' + siteSet.filter((v) => !v.set).map((v) => v.name).join(', ') + ')'
          : '')
      : 'none set yet -- the privacy and terms pages say so plainly, which is ' +
        'true but not what you want on a site other people use');

  // The נקודה: which rung of the ladder it came off, and what each teacher
  // was asked. From this sandbox Sefaria cannot be reached at all, so this
  // trail is the only way to see whether the chooser is behaving on the real
  // server -- the same reason the chag words are reported below.
  let nekudaTried = null;
  let nekudaNow = null;
  try {
    nekudaTried = [];
    nekudaNow = await inspiration.chooseFor(today, calendarNow, nekudaTried);
    record("Today's נקודה", !!(nekudaNow && nekudaNow.available),
      nekudaNow && nekudaNow.available
        ? `${nekudaNow.route}: ${nekudaNow.ref}` +
          (nekudaNow.teacher ? ` — ${nekudaNow.teacher.short}` : '') +
          ` (${nekudaNow.context.label || 'ordinary day'})`
        : (nekudaNow && nekudaNow.reason) || 'nothing came back');
  } catch (err) {
    record("Today's נקודה", false, err.message);
  }

  // Which of the approved teachers Sefaria actually carries. Asked, never
  // assumed: a shape lookup that does not throw is not an answer, which is
  // how the Satmar Rav was once reported as present while Sefaria was saying
  // "No index or category found to match Divrei Yoel".
  let teacherShelf = null;
  try {
    teacherShelf = await teachers.availability({ refresh: true });
    // The seven and the Rambam are counted apart. Counting them together
    // printed "6 of 8 carried", which reads as though the approved pool were
    // eight -- and the whole design rests on it being seven with the Rambam
    // outside, reached only when none of them fits.
    const pool = teacherShelf.filter((t) => !t.fallback);
    const fallback = teacherShelf.find((t) => t.fallback);
    const carried = pool.filter((t) => t.available.length);
    // A teacher nobody has digitised is not a fault in this app, and the
    // list says in advance who that is expected to be. One who is absent
    // WITHOUT being expected to be is worth a red line: that is what a
    // misspelt title looks like from here, and it is how the Maggid went
    // missing for weeks while this line said "nothing for" and nobody read
    // it as a bug.
    const expected = pool.filter((t) => !t.available.length && t.expectMissing);
    const unexpected = pool.filter((t) => !t.available.length && !t.expectMissing);
    record('The approved teachers on Sefaria',
      unexpected.length === 0,
      `${carried.length} of ${pool.length} carried` +
      (expected.length ? ` — not digitised, as expected: ${expected.map((t) => t.name).join(', ')}` : '') +
      (unexpected.length ? ` — MISSING and not expected to be: ${unexpected.map((t) => t.name).join(', ')}` +
        ' (usually a title spelt differently from Sefaria\'s own catalogue)' : ''));
    record('The Rambam is there to fall back on',
      !!fallback && fallback.available.length > 0,
      fallback && fallback.available.length
        ? fallback.available.join(', ') + ' — outside the seven, reached only when none of them fits'
        : 'the fallback has nothing, so a day no approved teacher fits has nothing to show');
  } catch (err) {
    record('The approved teachers on Sefaria', false, err.message);
  }

  record('Ushpizin passages arrive',
    guestRefs.every((g) => g.passage),
    `${guestRefs.filter((g) => g.passage).length} of ${guestRefs.length} guests have their Torah`);


  record('Yahrzeit seforim on Sefaria',
    yahrzeitBooks.some((b) => b.ok),
    `${yahrzeitBooks.filter((b) => b.ok).length} of ${yahrzeitBooks.length} found`);
  record('Yahrzeit passages actually arrive',
    yahrzeitBooks.filter((b) => b.passage).length === yahrzeitBooks.filter((b) => b.ok).length,
    `${yahrzeitBooks.filter((b) => b.passage).length} of ${yahrzeitBooks.filter((b) => b.ok).length} resolved books gave a passage`);

  const startedAt = Date.now();
  let texts = { ok: false, detail: '' };
  try {
    const sample = await sefaria.getText('Psalms 16');
    texts = {
      ok: !!(sample && sample.hebrew.length),
      detail: sample
        ? `Tehillim 16 loaded, ${sample.hebrew.length} Hebrew lines, ${Date.now() - startedAt}ms`
        : 'no text came back',
    };
  } catch (err) {
    texts = { ok: false, detail: err.message };
  }
  record('Sefaria reachable', texts.ok, texts.detail);

  // Which seforim Sefaria actually recognises. A book it does not know is
  // left out of the rotation rather than guessed at, so this is the only
  // place that would show it.
  let books = [];
  if (texts.ok) {
    try {
      books = await library.bookStatus();
      const missing = books.filter((b) => !b.ok);
      record('Seforim resolved', missing.length === 0,
        missing.length === 0
          ? `all ${books.length} books found`
          : `${books.length - missing.length} of ${books.length} found; not recognised: ${missing.map((b) => b.title).join(', ')}`);
    } catch (err) {
      record('Seforim resolved', false, err.message);
    }
  }

  /**
   * For any sefer Sefaria did not recognise, ask it what it does have under
   * that name. The answers are reported, never adopted: a loose match for
   * "Kitzur Likutei Moharan" could easily come back "Likutei Moharan", and
   * silently filing one book under another's name would be worse than leaving
   * it out. A person reads these and picks the right one.
   */
  let titleHelp = null;
  const missing = books.filter((b) => !b.ok);
  if (missing.length) {
    titleHelp = [];
    for (const book of missing) {
      let options = [];
      try {
        options = (await sefaria.suggest(book.title, { limit: 6 })).map((s) => s.text);
      } catch { /* the hint is a bonus, not a requirement */ }
      // Also try just the distinctive first word, which matches more loosely.
      if (!options.length) {
        const firstWord = String(book.title).split(' ')[0];
        try {
          options = (await sefaria.suggest(firstWord, { limit: 6 })).map((s) => s.text);
        } catch { /* ignore */ }
      }
      titleHelp.push({ wanted: book.title, sefariaSuggests: options });
    }
  }

  // Search goes through a different endpoint from the texts, so it can fail on
  // its own. Each form it tries is reported, since the reason is the fix.
  let searchAttempts = null;
  let searchSample = null;
  if (texts.ok) {
    try {
      const found = await sefaria.search('שמחה', { size: 3 });
      searchSample = found.sample || null;
      record('Search', found.hits.length > 0,
        found.hits.length
          ? `${found.hits.length} results via ${found.via}, first: ${found.hits[0].ref}`
          : `answered via ${found.via} but no result survived reading — see searchSample`);
    } catch (err) {
      searchAttempts = err.attempts || null;
      record('Search', false, err.message);
    }
  }

  // Does the day's teaching actually load? The books resolving is not the same
  // as a reference in them being real.
  let teaching = null;
  let sparkNow = null;
  if (texts.ok) {
    try {
      const spark = await daily.dailySpark(today);
      sparkNow = spark;
      teaching = spark.available
        ? { ref: spark.ref, book: spark.book && spark.book.label }
        : null;
      record("Today's teaching", !!spark.available,
        spark.available ? `${spark.heading} (${spark.ref})` : spark.reason);
    } catch (err) {
      record("Today's teaching", false, err.message);
    }
  }

// Which of today's pieces Sefaria has in English.
  //
  // Asked because the weekly card came out in Hebrew only and nothing on the
  // page or in here said why. A chag search lands most often in Likutei
  // Halachot, which Sefaria carries in Hebrew and barely at all in English,
  // and the picker took the first piece with Hebrew in it. It now steps past
  // an untranslated piece where there is a translated one to step to -- so
  // this line is how you tell whether it had anywhere to step.
  //
  // It is reported, never failed: a sefer nobody has translated is not a
  // fault in this app, and the page says so plainly under the Hebrew.
  const todayPieces = [
    ['The day\'s teaching', sparkNow],
    ["This week's Torah", weeklyNow],
  ].filter(([, piece]) => piece && piece.available);
  const translated = todayPieces.filter(([, piece]) => piece.translated);
  record('English translations', true,
    `${translated.length} of ${todayPieces.length} of today's pieces have English` +
    (todayPieces.length
      ? ' -- ' + todayPieces.map(([what, piece]) =>
          `${what}: ${piece.translated ? 'yes' : 'Hebrew only'} (${piece.ref})`).join('; ')
      : ''));

  // How many references each book yields, against what it should hold. A book
  // reporting far more pieces than it has lessons means the references being
  // built from its structure are going past the end of it.
  let shapeSample = null;
  if (texts.ok) {
    try {
      const raw = await sefaria.getShape('Likutei Moharan');
      const nodes = Array.isArray(raw) ? raw : [raw];
      shapeSample = nodes.slice(0, 3).map((n) => ({
        title: n && n.title,
        length: n && n.length,
        chaptersIsArray: Array.isArray(n && n.chapters),
        chaptersCount: Array.isArray(n && n.chapters) ? n.chapters.length : null,
        firstChapterType: Array.isArray(n && n.chapters) ? typeof n.chapters[0] : null,
        firstChapter: Array.isArray(n && n.chapters) ? JSON.stringify(n.chapters[0]).slice(0, 60) : null,
      }));
    } catch (err) {
      shapeSample = { error: err.message };
    }
  }

  /**
   * What Sefaria itself files under Breslov. Guessing titles one at a time is
   * how six works were added that it does not carry; its own catalogue is the
   * way to know what is really there and what is still missing here.
   */
  let breslovCatalog = null;
  if (texts.ok && wantsCatalog) {
    try {
      const have = new Set(library.BOOKS.map((b) => b.title));
      const titles = await sefaria.catalogFor('Breslov');
      breslovCatalog = {
        onSefaria: titles,
        notYetInThisApp: titles.filter((t) => !have.has(t)),
      };
    } catch (err) {
      breslovCatalog = { error: err.message };
    }
  }

  const failed = checks.filter((c) => !c.ok);

  return {
    build: BUILD,
    ok: failed.length === 0,
    summary: failed.length === 0
      ? 'Everything is working.'
      : `${failed.length} check(s) failing: ${failed.map((c) => c.name).join(', ')}`,
    advice: texts.ok ? undefined
      : 'The dates and times work, but this server cannot fetch the texts from sefaria.org. ' +
        'Nothing is shown in place of a text it cannot load.',
    checks,
    ushpizinRefs: guestRefs,
    satmar,
    weekly: weeklyNow && weeklyNow.available
      ? { mode: weeklyNow.mode, ref: weeklyNow.ref, yomTov: weeklyNow.yomTov || null,
          parsha: weeklyNow.parsha || null, says: weeklyNow.says || null }
      : { mode: null, reason: weeklyNow && weeklyNow.reason },
    chagWords,
    nekuda: nekudaNow && nekudaNow.available
      ? { route: nekudaNow.route, ref: nekudaNow.ref,
          teacher: nekudaNow.teacher && nekudaNow.teacher.id,
          quoting: nekudaNow.quoting,
          context: nekudaNow.context && nekudaNow.context.label }
      : { route: null, reason: nekudaNow && nekudaNow.reason },
    nekudaTried,
    teacherShelf,
    contentHistory: history.stats(),
    translations: todayPieces.map(([what, piece]) => ({
      what, ref: piece.ref, english: !!piece.translated,
    })),
    yahrzeits: {
      total: yahrzeits.all().length,
      today: yahrzeits.yahrzeitsOn(dates.calendarFor(today, place, new Date()).hebrew).map((y) => y.name),
      books: yahrzeitBooks,
    },
    searchAttempts,
    searchSample,
    titleHelp,
    breslovCatalog,
    teaching,
    shapeSample,
    books,
    cache: sefaria.cacheStats(),
    note: 'On a free hosting plan the disk is wiped on every deploy, so the ' +
          'text cache starting empty is normal, not a fault.',
  };
}));

// ---------------------------------------------------------------- calendar & zmanim

app.get('/api/zmanim', route(async (req) => {
  const place = placeFromQuery(req);
  const date = dateFromQuery(req, place);
  const calendar = dates.calendarFor(date, place, new Date());
  return {
    ...zmanimLib.zmanimFor(date, place, new Date(), zmanimPrefsFromQuery(req)),
    hebrew: calendar.hebrew,
    gregorian: calendar.gregorian,
    candles: calendar.candles,
    havdalah: calendar.havdalah,
  };
}));

/**
 * Whoever's yahrzeit it is today, with a passage where there is one to be had.
 *
 * The Jewish day turns at nightfall, and so does this: from shkia the app is
 * already on the next day, so a yahrzeit shows from the evening it begins
 * rather than the morning after.
 */
async function yahrzeitsFor(calendar, date) {
  const today = yahrzeits.yahrzeitsOn(calendar.hebrew);
  if (!today.length) return [];

  return Promise.all(today.map(async (who) => {
    const passage = who.book
      ? await cached(`yahrzeit:${who.id}:${daily.dayKey(date)}`, DAY,
          () => daily.yahrzeitPassage([who.book].concat(who.aliases || []), date))
      : null;
    return Object.assign({}, who, { passage: passage || null });
  }));
}

/**
 * The day's guests, each with his passage.
 *
 * Cached per guest per day like the yahrzeit passages, so a page of Sukkos
 * costs Sefaria one request per guest per day and not one per visitor.
 */
async function ushpizinFor(calendar, date) {
  const today = ushpizin.ushpizinOn(calendar.hebrew);
  if (!today) return null;

  const guests = await Promise.all(today.guests.map(async (g) => {
    const [passage, dvar] = await Promise.all([
      cached(`ushpizin:${g.id}:${daily.dayKey(date)}`, DAY,
        () => daily.ushpizinPassage(g.refs, date)),
      // A word on the passage from Rebbe Nachman or Reb Noson, where Sefaria
      // records one. Null where it does not, rather than something adjacent.
      cached(`ushpizin-dvar:${g.id}:${daily.dayKey(date)}`, DAY,
        () => daily.dvarOnPassage(g.refs, date, 53)),
    ]);
    return Object.assign({}, g, { passage: passage || null, dvar: dvar || null });
  }));
  return Object.assign({}, today, { guests });
}

app.get('/api/calendar', route(async (req) => {
  const place = placeFromQuery(req);
  const date = dateFromQuery(req, place);
  const calendar = dates.calendarFor(date, place, new Date());
  return Object.assign({}, calendar, {
    yahrzeits: await yahrzeitsFor(calendar, date),
    ushpizin: await ushpizinFor(calendar, date),
  });
}));

// ---------------------------------------------------------------- the learning

app.get('/api/daily', route(async (req) => {
  const place = placeFromQuery(req);
  const date = dateFromQuery(req, place);
  return cached(`spark:${daily.dayKey(date)}`, DAY, () => daily.dailySpark(date));
}));

/** Today's נקודה on its own, for a widget or a watch face. */
app.get('/api/inspiration', route(async (req) => {
  const place = placeFromQuery(req);
  const date = dateFromQuery(req, place);
  const calendar = dates.calendarFor(date, place, new Date());
  return cached(`nekuda:${daily.dayKey(date)}`, DAY, () => inspiration.forDay(date, calendar));
}));

/** Whoever's yahrzeit falls this Hebrew month, today's marked. */
app.get('/api/yahrzeits', route(async (req) => {
  const place = placeFromQuery(req);
  const date = dateFromQuery(req, place);
  const calendar = dates.calendarFor(date, place, new Date());
  return {
    month: calendar.hebrew.monthName,
    monthHe: calendar.hebrew.monthHe || null,
    day: calendar.hebrew.day,
    people: yahrzeits.yahrzeitsIn(calendar.hebrew),
  };
}));

app.get('/api/tehillim', route(async (req) => {
  const place = placeFromQuery(req);
  const date = dateFromQuery(req, place);
  const { hebrew } = dates.calendarFor(date, place, new Date());
  return cached(`tehillim:${hebrew.year}-${hebrew.monthName}-${hebrew.day}`, DAY,
    () => daily.dailyTehillim(hebrew));
}));

app.get('/api/tikkun', route(async () =>
  cached('tikkun', 30 * DAY, () => daily.tikkunHaklali())));

app.get('/api/weekly', route(async (req) => {
  const place = placeFromQuery(req);
  const date = dateFromQuery(req, place);
  const calendar = dates.calendarFor(date, place, new Date());
  const week = Math.floor(daily.dayKey(date) / 7);
  return cached(`weekly:${week}:${place.israel ? 'il' : 'chu'}`, DAY,
    () => daily.weeklyTorah(date, calendar));
}));

// ---------------------------------------------------------------- everything at once

/** One call the home screen uses, so the page loads in a single request. */
app.get('/api/today', route(async (req) => {
  const place = placeFromQuery(req);
  const date = dateFromQuery(req, place);
  const calendar = dates.calendarFor(date, place, new Date());
  const zmanim = zmanimLib.zmanimFor(date, place, new Date(), zmanimPrefsFromQuery(req));
  const week = Math.floor(daily.dayKey(date) / 7);

  const [nekuda, spark, tehillim, weekly, yahrzeitsToday] = await Promise.all([
    // The day's נקודה. Cached in memory for the process AND written to the
    // history file, which is what makes it the same teaching all day even
    // across a restart -- the memory cache alone would choose again.
    cached(`nekuda:${daily.dayKey(date)}`, DAY, () => inspiration.forDay(date, calendar)),
    cached(`spark:${daily.dayKey(date)}`, DAY, () => daily.dailySpark(date)),
    cached(`tehillim:${calendar.hebrew.year}-${calendar.hebrew.monthName}-${calendar.hebrew.day}`,
      DAY, () => daily.dailyTehillim(calendar.hebrew)),
    cached(`weekly:${week}:${place.israel ? 'il' : 'chu'}`, DAY,
      () => daily.weeklyTorah(date, calendar)),
    yahrzeitsFor(calendar, date),
  ]);

  return {
    calendar, zmanim,
    // The heart of the day. `spark` stays beside it under its own name --
    // it is the Quick Torah now, a short piece from the shelf, and it is a
    // different thing from the נקודה rather than a replaced version of it.
    inspiration: nekuda,
    spark, tehillim, weekly,
    yahrzeits: yahrzeitsToday,
    // Null on every day but the seven of Sukkos.
    ushpizin: await ushpizinFor(calendar, date),
  };
}));

/**
 * A deliberately small answer for the iPhone widgets -- just the few lines a
 * widget can actually fit, so it loads fast and uses little battery.
 */
/**
 * The next zman -- and when today has none left, tomorrow's first.
 *
 * After the last zman of the day the widget used to say "No more zmanim
 * today", and on the lock screen, where that line is only drawn if there is
 * one, it showed nothing at all. Every evening the widget looked broken.
 * There is always a next zman; it is just not today's.
 *
 * Anchored at midday, so adding a day never lands on the wrong side of a
 * clock change.
 */
function nextZmanOrTomorrow(place, date, now, prefs) {
  const today = zmanimLib.zmanimFor(date, place, now, prefs);
  if (today.next) return Object.assign({}, today.next, { tomorrow: false });

  const nextDay = new Date(date.getTime());
  nextDay.setDate(nextDay.getDate() + 1);
  const tomorrow = zmanimLib.zmanimFor(nextDay, place, now, prefs);
  const first = tomorrow.times.find((t) => t.isChosen && new Date(t.iso).getTime() > now.getTime());
  if (!first) return null;

  return Object.assign({}, first, {
    minutesAway: Math.round((new Date(first.iso).getTime() - now.getTime()) / 60000),
    tomorrow: true,
  });
}

app.get('/api/widget', route(async (req) => {
  const place = placeFromQuery(req);
  const date = dateFromQuery(req, place);
  const calendar = dates.calendarFor(date, place, new Date());
  const now = new Date();
  const prefs = zmanimPrefsFromQuery(req);
  const zmanim = zmanimLib.zmanimFor(date, place, now, prefs);
  const upNext = nextZmanOrTomorrow(place, date, now, prefs);
  const spark = await cached(`spark:${daily.dayKey(date)}`, DAY, () => daily.dailySpark(date));

  return {
    hebrewDate: calendar.hebrew.gematriya,
    hebrewDateEn: calendar.hebrew.en,
    gregorian: calendar.gregorian.display,
    parsha: calendar.parsha ? calendar.parsha.en : null,
    parshaHe: calendar.parsha ? calendar.parsha.he : null,
    candles: calendar.candles ? calendar.candles.time : null,
    candlesDate: calendar.candles ? calendar.candles.date : null,
    havdalah: calendar.havdalah ? calendar.havdalah.time : null,
    next: upNext
      ? {
          label: upNext.en,
          he: upNext.he,
          time: upNext.time,
          opinion: upNext.opinion,
          minutesAway: upNext.minutesAway,
          tomorrow: upNext.tomorrow,
        }
      : null,
    minhag: zmanim.prefs.minhag,
    times: zmanim.times
      .filter((t) => t.isChosen)
      .map((t) => ({ key: t.key, en: t.en, he: t.he, time: t.time, opinion: t.opinion })),
    teaching: spark.available
      ? { heading: spark.heading, he: spark.snippetHe, en: spark.snippetEn, url: spark.url }
      : null,
    // Just the name and how many years. A widget has no room for a passage,
    // and the app is one tap away.
    yahrzeits: yahrzeits.yahrzeitsOn(calendar.hebrew)
      .map((y) => ({ name: y.name, he: y.he, years: y.years })),
    // The day's guest, on the seven days of Sukkos and no others. A widget
    // has no room to explain two orders, so on the three days they differ it
    // carries both names and says whose each is.
    ushpizin: ushpizin.ushpizinOn(calendar.hebrew),
    tehillim: library.tehillimForDay(calendar.hebrew.day, calendar.hebrew.daysInMonth)
      .map(library.tehillimLabel).join(' • '),
    place: place.name,
  };
}));

// ---------------------------------------------------------------- search

/**
 * Search the seforim.
 *
 * Sefaria can narrow a search by category, but that means sending the exact
 * category path it files each book under, and a path that is even slightly
 * wrong returns nothing at all -- indistinguishable from "no results". So we
 * search everything and keep the hits whose book is one of ours, which cannot
 * silently fail. `scope=all` returns the rest as well.
 */
app.get('/api/search', route(async (req) => {
  const query = String(req.query.q || '').trim();
  const scope = req.query.scope === 'all' ? 'all' : 'breslov';
  if (!query) return { query: '', scope, available: true, hits: [], total: 0 };

  const key = `search:${scope}:${query.toLowerCase()}`;
  return cached(key, 6 * 3600 * 1000, async () => {
    try {
      const found = await sefaria.search(query, { size: 60 });

      // This app reads Hebrew and English. Sefaria carries translations in many
      // more, and a search that does not say which it wants gets all of them --
      // which is how a search came back in Portuguese. A hit with no language
      // tag at all is kept, on the grounds that a missing label is a worse
      // reason to discard a good result than a stray one is to show it.
      const READABLE = ['he', 'en'];
      const readable = found.hits.filter((h) => !h.lang || READABLE.indexOf(h.lang) !== -1);

      // The same passage often comes back once per language. Keep the
      // best-scoring of each, which is the first, since they arrive in order.
      const byRef = new Map();
      for (const hit of readable) {
        if (!byRef.has(hit.ref)) byRef.set(hit.ref, hit);
      }
      found.hits = [...byRef.values()];

      // Sefaria's search does not name the book a hit came from, so it is read
      // off the front of the reference instead: "Likutei Moharan 24:3" belongs
      // to "Likutei Moharan". Relying on a book field is what made the Reb
      // Nachman count come out as zero.
      const ours = found.hits.filter(library.belongsToUs);
      const hits = scope === 'all' ? found.hits : ours;

      return {
        query,
        scope,
        available: true,
        hits: hits.slice(0, 25),
        total: found.total,
        inBreslov: ours.length,
        everywhere: found.hits.length,
      };
    } catch (err) {
      return {
        query,
        scope,
        available: false,
        reason: err.message,
        attempts: err.attempts || null,
        hint: 'Search is done by sefaria.org. Everything else in the app still works.',
        hits: [],
      };
    }
  });
}));

/**
 * Suggestions for the search box.
 *
 * The seforim in this app are matched locally, so the box is useful the moment
 * you type "lik" whether or not Sefaria answers. Its own suggestions -- topics
 * and references across the whole library -- are added underneath when they
 * arrive. A failure there costs the extra suggestions and nothing else.
 */
app.get('/api/suggest', route(async (req) => {
  const query = String(req.query.q || '').trim();
  if (query.length < 2) return { query, suggestions: [] };

  return cached(`suggest:${query.toLowerCase()}`, 12 * 3600 * 1000, async () => {
    const lower = query.toLowerCase();
    const suggestions = [];
    const seen = new Set();

    const add = (text, kind, ref, note) => {
      const key = String(text).toLowerCase();
      if (!text || seen.has(key)) return;
      seen.add(key);
      suggestions.push({ text, kind, ref: ref || null, note: note || null });
    };

    // Our own seforim first: a name that starts with what you typed beats one
    // that merely contains it.
    const books = library.BOOKS.slice();
    const starts = books.filter((b) => b.label.toLowerCase().indexOf(lower) === 0);
    const contains = books.filter((b) =>
      b.label.toLowerCase().indexOf(lower) > 0 && starts.indexOf(b) === -1);
    for (const book of starts.concat(contains).slice(0, 5)) {
      add(book.label, 'book', null, book.by || null);
    }

    try {
      for (const item of await sefaria.suggest(query, { limit: 8 })) {
        add(item.text, item.kind, item.ref, null);
      }
    } catch {
      // Sefaria's suggestions are a bonus; ours are already in the list.
    }

    return { query, suggestions: suggestions.slice(0, 10) };
  });
}));

/**
 * The seforim the app draws on, so the About page is never kept in step by
 * hand. Only the ones Sefaria actually carries are listed: naming a sefer as a
 * source when no word of it can be read would be a claim the app cannot meet.
 * If the check itself cannot run, everything is listed rather than nothing.
 */
app.get('/api/library', route(async () => {
  let available = null;
  try {
    available = new Set(
      (await library.bookStatus()).filter((b) => b.ok).map((b) => b.title)
    );
  } catch {
    available = null;
  }

  const books = library.BOOKS
    .filter((b) => !available || available.has(b.title))
    .map((b) => ({ label: b.label, he: b.he, by: b.by || null }));

  return { books, verified: available !== null };
}));

// ---------------------------------------------------------------- reminders

/** The address this server is reached on, for links inside the calendar. */
function siteUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return host ? `${proto}://${host}` : '';
}

/**
 * A calendar of daily reminders, for subscribing to in the phone's Calendar
 * app. Served as a file rather than as JSON, so opening it in a browser or a
 * calendar client does the right thing.
 */
app.get('/api/reminders.ics', (req, res) => {
  try {
    const feed = ics.buildFeed({
      hour: req.query.hour,
      minute: req.query.minute,
      timeZone: dates.normalisePlace({ tz: req.query.tz }).timeZone,
      days: req.query.days,
      site: siteUrl(req),
    });
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="breslov-daily.ics"');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(feed);
  } catch (err) {
    console.error('reminders.ics failed:', err.message);
    res.status(500).type('text/plain').send('Could not build the calendar.');
  }
});

// ---------------------------------------------------------------- the website

/**
 * Caching rules.
 *
 * The page, the script and the stylesheet are served `no-cache`, which does
 * not mean "never store" -- it means "ask me before reusing it". The browser
 * still keeps a copy and still gets a cheap 304 when nothing changed.
 *
 * This matters because they have to move together. They were previously
 * served with an hour of `max-age`, and a deploy then left the browser with a
 * fresh index.html (a navigation revalidates) next to an hour-old app.js and
 * styles.css from its own HTTP cache. That cache is not something the service
 * worker or the page can clear, so the mismatch survived a refresh, a restart,
 * and the app's own self-heal, and the site stayed half-drawn until the hour
 * was up.
 *
 * Pictures do not have that problem, so they keep a long cache.
 */
const NEVER_STALE = /\.(?:html|js|css|webmanifest|json)$/;

app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  lastModified: true,
  maxAge: 0,
  setHeaders(res, filePath) {
    if (NEVER_STALE.test(filePath)) {
      res.setHeader('Cache-Control', 'no-cache');
    } else {
      // Icons and images are safe to hold on to.
      res.setHeader('Cache-Control', 'public, max-age=604800');
    }
  },
}));

// Anything else that is not an API call goes to the app shell.
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * Fetch the day's learning once, as soon as the server is up.
 *
 * The disk is wiped on every deploy, so the cache starts empty and whoever
 * opens the site first goes to Sefaria live, on a server that is still
 * warming up. That person -- and only that person -- got a page of "this
 * could not be loaded" while everybody after them got it from the cache.
 *
 * So the server is that person now. It asks for the same four things the home
 * screen asks for, before anyone has visited. Failures are ignored on purpose:
 * this is a head start, not a requirement, and a visitor would have retried
 * anyway.
 */
function warmUp(port) {
  const key = lock.isLocked() ? lock.key() : '';
  const paths = ['/api/today', '/api/tikkun', '/api/weekly'];

  return Promise.all(paths.map((path) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      headers: Object.assign({ Accept: 'application/json' },
        key ? { 'X-Access-Key': key } : {}),
    })
      .then((res) => res.json())
      .then((body) => ({ path, ok: !body || body.error === undefined }))
      .catch((err) => ({ path, ok: false, why: err.message }))
  )).then((results) => {
    const failed = results.filter((r) => !r.ok);
    console.log(failed.length
      ? `Warmed the cache; ${failed.length} of ${results.length} did not answer yet.`
      : 'Warmed the cache: today\'s learning is ready before anyone asks.');
    return results;
  });
}

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`Breslov Daily is running -> http://localhost:${PORT}`);
    // A moment after the port opens, so the health check Render is waiting on
    // is answered before we start pulling text.
    setTimeout(() => warmUp(server.address().port), 1500);
  });
}

module.exports = app;
module.exports.warmUp = warmUp;
module.exports.nextZmanOrTomorrow = nextZmanOrTomorrow;
