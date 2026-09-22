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
const library = require('./lib/library');
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
const BUILD = '24';

app.use(cors());

/**
 * The password lock, if one is set. Above everything else on purpose: nothing
 * -- no page, no picture, no /api/... answer -- is served past this line
 * without the password or the key. See lib/lock.js for the three ways in.
 */
app.use(lock.middleware);

app.use(express.json());

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
    const calendar = dates.calendarFor(today, place);
    record('Hebrew date', !!calendar.hebrew.gematriya, calendar.hebrew.gematriya);
    record('Parsha', !!calendar.parsha, calendar.parsha ? calendar.parsha.en : 'none found');
    const z = zmanimLib.zmanimFor(today, place);
    record('Zmanim', z.times.length >= 12, `${z.times.length} times calculated`);
  } catch (err) {
    record('Calendar and zmanim', false, err.message);
  }

  // --- the part that needs the internet
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
  if (texts.ok) {
    try {
      const spark = await daily.dailySpark(today);
      teaching = spark.available
        ? { ref: spark.ref, book: spark.book && spark.book.label }
        : null;
      record("Today's teaching", !!spark.available,
        spark.available ? `${spark.heading} (${spark.ref})` : spark.reason);
    } catch (err) {
      record("Today's teaching", false, err.message);
    }
  }

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
  const calendar = dates.calendarFor(date, place);
  return {
    ...zmanimLib.zmanimFor(date, place, new Date(), zmanimPrefsFromQuery(req)),
    hebrew: calendar.hebrew,
    gregorian: calendar.gregorian,
    candles: calendar.candles,
    havdalah: calendar.havdalah,
  };
}));

app.get('/api/calendar', route(async (req) => {
  const place = placeFromQuery(req);
  return dates.calendarFor(dateFromQuery(req, place), place);
}));

// ---------------------------------------------------------------- the learning

app.get('/api/daily', route(async (req) => {
  const place = placeFromQuery(req);
  const date = dateFromQuery(req, place);
  return cached(`spark:${daily.dayKey(date)}`, DAY, () => daily.dailySpark(date));
}));

app.get('/api/tehillim', route(async (req) => {
  const place = placeFromQuery(req);
  const date = dateFromQuery(req, place);
  const { hebrew } = dates.calendarFor(date, place);
  return cached(`tehillim:${hebrew.year}-${hebrew.monthName}-${hebrew.day}`, DAY,
    () => daily.dailyTehillim(hebrew));
}));

app.get('/api/tikkun', route(async () =>
  cached('tikkun', 30 * DAY, () => daily.tikkunHaklali())));

app.get('/api/weekly', route(async (req) => {
  const place = placeFromQuery(req);
  const date = dateFromQuery(req, place);
  const calendar = dates.calendarFor(date, place);
  const week = Math.floor(daily.dayKey(date) / 7);
  return cached(`weekly:${week}:${place.israel ? 'il' : 'chu'}`, DAY,
    () => daily.weeklyTorah(date, calendar));
}));

// ---------------------------------------------------------------- everything at once

/** One call the home screen uses, so the page loads in a single request. */
app.get('/api/today', route(async (req) => {
  const place = placeFromQuery(req);
  const date = dateFromQuery(req, place);
  const calendar = dates.calendarFor(date, place);
  const zmanim = zmanimLib.zmanimFor(date, place, new Date(), zmanimPrefsFromQuery(req));
  const week = Math.floor(daily.dayKey(date) / 7);

  const [spark, tehillim, weekly] = await Promise.all([
    cached(`spark:${daily.dayKey(date)}`, DAY, () => daily.dailySpark(date)),
    cached(`tehillim:${calendar.hebrew.year}-${calendar.hebrew.monthName}-${calendar.hebrew.day}`,
      DAY, () => daily.dailyTehillim(calendar.hebrew)),
    cached(`weekly:${week}:${place.israel ? 'il' : 'chu'}`, DAY,
      () => daily.weeklyTorah(date, calendar)),
  ]);

  return { calendar, zmanim, spark, tehillim, weekly };
}));

/**
 * A deliberately small answer for the iPhone widgets -- just the few lines a
 * widget can actually fit, so it loads fast and uses little battery.
 */
app.get('/api/widget', route(async (req) => {
  const place = placeFromQuery(req);
  const date = dateFromQuery(req, place);
  const calendar = dates.calendarFor(date, place);
  const zmanim = zmanimLib.zmanimFor(date, place, new Date(), zmanimPrefsFromQuery(req));
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
    next: zmanim.next
      ? {
          label: zmanim.next.en,
          he: zmanim.next.he,
          time: zmanim.next.time,
          opinion: zmanim.next.opinion,
          minutesAway: zmanim.next.minutesAway,
        }
      : null,
    minhag: zmanim.prefs.minhag,
    times: zmanim.times
      .filter((t) => t.isChosen)
      .map((t) => ({ key: t.key, en: t.en, he: t.he, time: t.time, opinion: t.opinion })),
    teaching: spark.available
      ? { heading: spark.heading, he: spark.snippetHe, en: spark.snippetEn, url: spark.url }
      : null,
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
      const ourTitles = library.BOOKS.map((b) => b.title);
      const belongsToUs = (hit) => {
        if (hit.book && ourTitles.indexOf(hit.book) !== -1) return true;
        if (!hit.ref) return false;
        return ourTitles.some((title) =>
          hit.ref === title ||
          hit.ref.indexOf(title + ' ') === 0 ||
          hit.ref.indexOf(title + ',') === 0);
      };

      const ours = found.hits.filter(belongsToUs);
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

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Breslov Daily is running -> http://localhost:${PORT}`);
  });
}

module.exports = app;
