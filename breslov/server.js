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
const zmanimLib = require('./lib/zmanim');
const daily = require('./lib/daily');
const library = require('./lib/library');
const sefaria = require('./lib/sefaria');
const { isoDateInZone, dateFromIso } = require('./lib/util');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Bumped with every change to the page, the script or the stylesheet.
 * Open /api/health to see which build is actually running -- the quickest way
 * to tell a stale browser apart from a deploy that never happened.
 */
const BUILD = '7';

app.use(cors());
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
  cache: sefaria.cacheStats(),
  memoryKeys: cache.size,
})));

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
app.get('/api/diagnostics', route(async () => {
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
