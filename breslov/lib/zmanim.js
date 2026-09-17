'use strict';

/**
 * Zmanim (halachic times) calculated on this machine with kosher-zmanim,
 * the JavaScript port of the KosherJava library. No internet needed.
 */

const { ComplexZmanimCalendar, GeoLocation } = require('kosher-zmanim');
const { toHebcalLocation } = require('./dates');

/**
 * The times we show, in the order they happen during the day.
 * `method` is the kosher-zmanim function; if a method is ever missing from the
 * library we simply skip that row instead of crashing.
 */
const ZMANIM_TABLE = [
  { key: 'alos',            he: 'עֲלוֹת הַשַּׁחַר',      en: 'Alos HaShachar',        method: 'getAlos72',                  note: '72 minutes before sunrise' },
  { key: 'misheyakir',      he: 'מִשֶּׁיַּכִּיר',          en: 'Misheyakir',            method: 'getMisheyakir10Point2Degrees', note: 'Earliest tallis & tefillin' },
  { key: 'sunrise',         he: 'נֵץ הַחַמָּה',          en: 'Sunrise (Netz)',        method: 'getSunrise',                 note: 'Earliest Shacharis' },
  { key: 'sofZmanShmaMGA',  he: 'סוֹף זְמַן שְׁמַע (מ״א)',  en: 'Latest Shema (MGA)',    method: 'getSofZmanShmaMGA72Minutes', note: 'Magen Avraham' },
  { key: 'sofZmanShmaGRA',  he: 'סוֹף זְמַן שְׁמַע (גר״א)', en: 'Latest Shema (GRA)',    method: 'getSofZmanShmaGRA',          note: 'Vilna Gaon' },
  { key: 'sofZmanTfilaMGA', he: 'סוֹף זְמַן תְּפִלָּה (מ״א)', en: 'Latest Shacharis (MGA)', method: 'getSofZmanTfilaMGA72Minutes', note: 'Magen Avraham' },
  { key: 'sofZmanTfilaGRA', he: 'סוֹף זְמַן תְּפִלָּה (גר״א)', en: 'Latest Shacharis (GRA)', method: 'getSofZmanTfilaGRA',        note: 'Vilna Gaon' },
  { key: 'chatzos',         he: 'חֲצוֹת הַיּוֹם',        en: 'Midday (Chatzos)',      method: 'getChatzos',                 note: 'Halachic midday' },
  { key: 'minchaGedola',    he: 'מִנְחָה גְּדוֹלָה',      en: 'Mincha Gedola',         method: 'getMinchaGedola',            note: 'Earliest Mincha' },
  { key: 'minchaKetana',    he: 'מִנְחָה קְטַנָּה',       en: 'Mincha Ketana',         method: 'getMinchaKetana',            note: 'Preferred Mincha' },
  { key: 'plag',            he: 'פְּלַג הַמִּנְחָה',       en: 'Plag HaMincha',         method: 'getPlagHamincha',            note: 'Earliest Maariv (some)' },
  { key: 'sunset',          he: 'שְׁקִיעָה',            en: 'Sunset (Shkia)',        method: 'getSunset',                  note: 'End of the day' },
  { key: 'tzais',           he: 'צֵאת הַכּוֹכָבִים',      en: 'Nightfall (Tzais)',     method: 'getTzais',                   note: 'Three stars' },
  { key: 'tzais72',         he: 'צֵאת הַכּוֹכָבִים ע״ב',   en: 'Nightfall (72 min)',    method: 'getTzais72',                 note: 'Rabbeinu Tam (72 min)' },
];

/** kosher-zmanim hands back Luxon DateTime objects; normalise to a JS Date. */
function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toJSDate === 'function') return value.toJSDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "6:41 PM" in the location's own time zone. */
function formatTime(date, timeZone) {
  if (!date) return null;
  return new Intl.DateTimeFormat('en-US', {
    timeZone, hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(date).replace(/ /g, ' ');
}

/** Build the zmanim calendar object for one day at one place. */
function calendarFor(date, place) {
  const loc = toHebcalLocation(place);
  const geo = new GeoLocation(
    place.name,
    place.latitude,
    place.longitude,
    place.elevation || 0,
    place.timeZone
  );
  const cal = new ComplexZmanimCalendar(geo);
  cal.setDate(date);
  return cal;
}

/**
 * All the times for one day.
 * Returns { place, date, times: [...], next: {...} } where `next` is the
 * upcoming zman relative to `now` -- that is what the widget shows.
 */
function zmanimFor(date, place, now = new Date()) {
  const cal = calendarFor(date, place);
  const times = [];

  for (const row of ZMANIM_TABLE) {
    const fn = cal[row.method];
    if (typeof fn !== 'function') continue;
    let value = null;
    try {
      value = toDate(fn.call(cal));
    } catch {
      value = null;
    }
    if (!value) continue;
    times.push({
      key: row.key,
      he: row.he,
      en: row.en,
      note: row.note,
      iso: value.toISOString(),
      time: formatTime(value, place.timeZone),
    });
  }

  times.sort((a, b) => new Date(a.iso) - new Date(b.iso));

  const nowMs = now.getTime();
  const upcoming = times.find((t) => new Date(t.iso).getTime() > nowMs) || null;
  const next = upcoming
    ? { ...upcoming, minutesAway: Math.round((new Date(upcoming.iso) - nowMs) / 60000) }
    : null;

  return { place, date: date.toISOString().slice(0, 10), times, next };
}

module.exports = { ZMANIM_TABLE, zmanimFor, formatTime };
