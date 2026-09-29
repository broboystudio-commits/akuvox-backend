'use strict';

/**
 * Jewish calendar facts for a given day: Hebrew date, the week's parsha,
 * candle lighting / havdalah, and any yom tov.
 * Everything here is calculated on this machine by @hebcal/core -- no internet needed.
 */

const {
  HDate, HebrewCalendar, Location, Sedra, Zmanim, gematriya, months,
} = require('@hebcal/core');
const { isoDateInZone, dateFromIso } = require('./util');

/** Default location: Brooklyn, NY. Overridden by whatever the app sends. */
const DEFAULT_PLACE = {
  name: 'Brooklyn, NY',
  latitude: 40.6501,
  longitude: -73.9496,
  timeZone: 'America/New_York',
  elevation: 0,
  israel: false,
};

/** Build a hebcal Location from a plain place object. */
function toHebcalLocation(place) {
  return new Location(
    place.latitude,
    place.longitude,
    !!place.israel,
    place.timeZone,
    place.name,
    undefined,
    undefined,
    place.elevation || 0
  );
}

/**
 * Sanity-check and normalise a place coming from the browser or a widget.
 * Anything missing or out of range falls back to the default.
 */
function normalisePlace(input) {
  const p = input || {};
  const lat = Number(p.lat ?? p.latitude);
  const lng = Number(p.lng ?? p.lon ?? p.longitude);
  const hasCoords =
    Number.isFinite(lat) && Number.isFinite(lng) &&
    Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

  let timeZone = p.tz || p.timeZone || DEFAULT_PLACE.timeZone;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }); // throws on a bad zone name
  } catch {
    timeZone = DEFAULT_PLACE.timeZone;
  }

  if (!hasCoords) return { ...DEFAULT_PLACE, timeZone };

  return {
    name: p.name || p.city || `${lat.toFixed(3)}, ${lng.toFixed(3)}`,
    latitude: lat,
    longitude: lng,
    timeZone,
    elevation: Number.isFinite(Number(p.elevation)) ? Number(p.elevation) : 0,
    israel: p.israel === true || p.israel === 'true' || timeZone === 'Asia/Jerusalem',
  };
}

/** Hebrew month/day/year, both spelled out and in Hebrew letters. */
function hebrewDate(date) {
  const hd = new HDate(date);
  return {
    day: hd.getDate(),
    monthName: hd.getMonthName(),
    year: hd.getFullYear(),
    en: hd.render('en'),
    he: hd.render('he'),
    gematriya: hd.renderGematriya(),
    daysInMonth: HDate.daysInMonth(hd.getMonth(), hd.getFullYear()),
    isRoshChodesh: hd.getDate() === 1 || hd.getDate() === 30,
  };
}

/**
 * Has the sun set where this person is?
 *
 * The Jewish day turns at nightfall, not at midnight. Until this was here the
 * app used the civil date all evening: at eight o'clock on the 29th of
 * September it still said 17 Tishrei, when it had been 18 Tishrei since
 * sunset -- so the day's Tehillim were yesterday's, and a yahrzeit that
 * begins tonight would not have shown until tomorrow morning.
 *
 * Sunset rather than tzais on purpose: the day turns at shkia, and the
 * stretch between the two is bein hashmashos, which is doubtful. Showing the
 * new day from shkia keeps the app on the side of the day that has begun.
 */
function isAfterSunset(localDate, place, now) {
  if (!now) return false;
  try {
    const loc = toHebcalLocation(place);
    const set = new Zmanim(loc, localDate, false).sunset();
    return now.getTime() >= set.getTime();
  } catch (err) {
    // Somewhere the sun does not set that day, or a bad location: fall back on
    // the civil date rather than guessing.
    return false;
  }
}

/** The day after a given one, keeping the midday anchor. */
function dayAfter(date) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + 1);
  return next;
}

/**
 * The parsha for the coming Shabbos (or today's, if today is Shabbos).
 * On a yom tov that displaces the weekly reading, hebcal reports that instead,
 * so we also look ahead to the next regular sedra.
 */
function weeklyParsha(date, israel = false) {
  const hd = new HDate(date);
  // Saturday === 6 in hebcal's getDay()
  const daysToShabbos = (6 - hd.getDay() + 7) % 7;
  let shabbos = hd.onOrAfter(6);

  const sedra = new Sedra(shabbos.getFullYear(), israel);
  let info = sedra.lookup(shabbos);

  // If that Shabbos is a chag, walk forward to the next Shabbos with a real parsha.
  let guard = 0;
  while (info && info.chag && guard < 8) {
    shabbos = new HDate(shabbos.abs() + 7);
    const s2 = new Sedra(shabbos.getFullYear(), israel);
    info = s2.lookup(shabbos);
    guard++;
  }

  if (!info || !info.parsha || !info.parsha.length) return null;

  const names = info.parsha;
  const hebNames = names.map((n) => parshaHebrew(n)).filter(Boolean);

  return {
    en: names.join('-'),
    he: hebNames.length === names.length ? hebNames.join('־') : null,
    isDouble: names.length > 1,
    shabbosDate: shabbos.greg().toISOString().slice(0, 10),
    daysUntil: daysToShabbos,
    // Sefaria refs like "Genesis 1:1-6:8" come from the book index, see library.js
    sefariaName: names[0],
  };
}

/** Hebrew spelling for a parsha name, taken from hebcal's own translation table. */
function parshaHebrew(name) {
  try {
    const { Locale } = require('@hebcal/core');
    const s = Locale.lookupTranslation(`Parashat ${name}`, 'he');
    if (s) return s.replace(/^פָּרָשַׁת\s*/, '');
    const bare = Locale.lookupTranslation(name, 'he');
    return bare || null;
  } catch {
    return null;
  }
}

/**
 * Candle lighting, havdalah and holidays in a window around `date`.
 * Returns the next candle lighting and the matching havdalah.
 */
function shabbosTimes(date, place) {
  const location = toHebcalLocation(place);
  const start = new Date(date.getTime() - 2 * 86400000);
  const end = new Date(date.getTime() + 9 * 86400000);

  const events = HebrewCalendar.calendar({
    start, end,
    location,
    candlelighting: true,
    sedrot: false,
    il: !!place.israel,
    havdalahMins: undefined,
  });

  const now = date.getTime();
  let candles = null;
  let havdalah = null;
  const holidays = [];

  for (const ev of events) {
    const cats = ev.getCategories();
    const when = ev.eventTime ? ev.eventTime.getTime() : ev.getDate().greg().getTime();
    const entry = {
      en: ev.render('en'),
      he: ev.render('he'),
      time: ev.eventTimeStr || null,
      date: ev.getDate().greg().toISOString().slice(0, 10),
      iso: ev.eventTime ? ev.eventTime.toISOString() : null,
    };
    if (cats.includes('candles') && !candles && when >= now) candles = entry;
    if (cats.includes('havdalah') && candles && !havdalah && when >= now) havdalah = entry;
    if (cats.includes('holiday') && when >= now - 86400000) holidays.push(entry);
  }

  return { candles, havdalah, holidays: holidays.slice(0, 4) };
}

/** Everything calendar-related for one day, in one object. */
function calendarFor(date, place, now) {
  const p = normalisePlace(place);
  const iso = isoDateInZone(date, p.timeZone);
  const localDate = dateFromIso(iso);

  // The civil date is what the calendar on the wall says and does not move.
  // Everything on the Jewish side of the day turns at nightfall.
  //
  // Only for the day actually being lived through. Ask for a date next week
  // and you want that day's Hebrew date, not the one after it because the sun
  // happens to have set while you were asking.
  const isToday = now && isoDateInZone(now, p.timeZone) === iso;
  const turned = isToday && isAfterSunset(localDate, p, now);
  const jewishDate = turned ? dayAfter(localDate) : localDate;

  return {
    place: p,
    gregorian: {
      iso,
      display: localDate.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
      }),
      long: localDate.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      }),
    },
    hebrew: Object.assign(hebrewDate(jewishDate), { afterSunset: turned }),
    parsha: weeklyParsha(jewishDate, p.israel),
    ...shabbosTimes(jewishDate, p),
  };
}

module.exports = {
  DEFAULT_PLACE,
  isAfterSunset,
  normalisePlace,
  toHebcalLocation,
  hebrewDate,
  weeklyParsha,
  shabbosTimes,
  calendarFor,
};
