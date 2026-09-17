'use strict';

/**
 * Zmanim, calculated on this machine with kosher-zmanim (the JavaScript port
 * of KosherJava). No internet needed.
 *
 * People hold by different opinions, so the times that actually differ --
 * alos, misheyakir and tzais -- are choices rather than fixed. Someone who
 * holds Rabbeinu Tam picks the 72 minute tzais and the whole app follows,
 * including the "next zman" in the widget.
 */

const { ComplexZmanimCalendar, GeoLocation } = require('kosher-zmanim');

/**
 * Each slot is one line in the zmanim list. Slots with more than one choice
 * are the ones people differ on; the rest have a single agreed calculation.
 */
const ZMANIM_SLOTS = [
  {
    key: 'alos',
    en: 'Alos HaShachar',
    he: 'עֲלוֹת הַשַּׁחַר',
    about: 'Dawn',
    fallback: '72',
    choices: [
      { id: '72',   name: '72 minutes',        method: 'getAlos72',              note: '72 minutes before sunrise' },
      { id: '72z',  name: '72 zmaniyos',       method: 'getAlos72Zmanis',        note: '72 proportional minutes' },
      { id: '16.1', name: '16.1 degrees',      method: 'getAlos16Point1Degrees', note: 'Sun 16.1° below the horizon' },
      { id: '18',   name: '18 degrees',        method: 'getAlos18Degrees',       note: 'Sun 18° below the horizon' },
      { id: '90',   name: '90 minutes',        method: 'getAlos90',              note: '90 minutes before sunrise' },
      { id: '120',  name: '120 minutes',       method: 'getAlos120',             note: '120 minutes before sunrise' },
    ],
  },
  {
    key: 'misheyakir',
    en: 'Misheyakir',
    he: 'מִשֶּׁיַּכִּיר',
    about: 'Earliest tallis & tefillin',
    fallback: '10.2',
    choices: [
      { id: '10.2', name: '10.2 degrees', method: 'getMisheyakir10Point2Degrees' },
      { id: '11',   name: '11 degrees',   method: 'getMisheyakir11Degrees' },
      { id: '11.5', name: '11.5 degrees', method: 'getMisheyakir11Point5Degrees' },
      { id: '7.65', name: '7.65 degrees', method: 'getMisheyakir7Point65Degrees' },
    ],
  },
  {
    key: 'sunrise',
    en: 'Sunrise (Netz)',
    he: 'נֵץ הַחַמָּה',
    about: 'Earliest Shacharis',
    fallback: 'standard',
    choices: [{ id: 'standard', name: 'Sunrise', method: 'getSunrise' }],
  },
  {
    key: 'sofZmanShmaMGA',
    en: 'Latest Shema (MGA)',
    he: 'סוֹף זְמַן שְׁמַע (מ״א)',
    about: 'Magen Avraham',
    fallback: '72',
    choices: [
      { id: '72',   name: 'From alos 72 minutes', method: 'getSofZmanShmaMGA72Minutes' },
      { id: '16.1', name: 'From alos 16.1°',      method: 'getSofZmanShmaMGA16Point1Degrees' },
      { id: '90',   name: 'From alos 90 minutes', method: 'getSofZmanShmaMGA90Minutes' },
    ],
  },
  {
    key: 'sofZmanShmaGRA',
    en: 'Latest Shema (GRA)',
    he: 'סוֹף זְמַן שְׁמַע (גר״א)',
    about: 'Vilna Gaon',
    fallback: 'standard',
    choices: [{ id: 'standard', name: 'Sunrise to sunset', method: 'getSofZmanShmaGRA' }],
  },
  {
    key: 'sofZmanTfilaMGA',
    en: 'Latest Shacharis (MGA)',
    he: 'סוֹף זְמַן תְּפִלָּה (מ״א)',
    about: 'Magen Avraham',
    fallback: '72',
    choices: [
      { id: '72',   name: 'From alos 72 minutes', method: 'getSofZmanTfilaMGA72Minutes' },
      { id: '16.1', name: 'From alos 16.1°',      method: 'getSofZmanTfilaMGA16Point1Degrees' },
      { id: '90',   name: 'From alos 90 minutes', method: 'getSofZmanTfilaMGA90Minutes' },
    ],
  },
  {
    key: 'sofZmanTfilaGRA',
    en: 'Latest Shacharis (GRA)',
    he: 'סוֹף זְמַן תְּפִלָּה (גר״א)',
    about: 'Vilna Gaon',
    fallback: 'standard',
    choices: [{ id: 'standard', name: 'Sunrise to sunset', method: 'getSofZmanTfilaGRA' }],
  },
  {
    key: 'chatzos',
    en: 'Midday (Chatzos)',
    he: 'חֲצוֹת הַיּוֹם',
    about: 'Halachic midday',
    fallback: 'standard',
    choices: [{ id: 'standard', name: 'Midday', method: 'getChatzos' }],
  },
  {
    key: 'minchaGedola',
    en: 'Mincha Gedola',
    he: 'מִנְחָה גְּדוֹלָה',
    about: 'Earliest Mincha',
    fallback: 'standard',
    choices: [
      { id: 'standard', name: 'Half a zmanis hour after chatzos', method: 'getMinchaGedola' },
      { id: '30',       name: 'At least 30 minutes after chatzos', method: 'getMinchaGedolaGreaterThan30' },
    ],
  },
  {
    key: 'minchaKetana',
    en: 'Mincha Ketana',
    he: 'מִנְחָה קְטַנָּה',
    about: 'Preferred Mincha',
    fallback: 'standard',
    choices: [{ id: 'standard', name: 'Nine and a half hours', method: 'getMinchaKetana' }],
  },
  {
    key: 'plag',
    en: 'Plag HaMincha',
    he: 'פְּלַג הַמִּנְחָה',
    about: 'Earliest Maariv for some',
    fallback: 'standard',
    choices: [
      { id: 'standard', name: 'GRA', method: 'getPlagHamincha' },
      { id: '72',       name: 'From alos 72 to tzais 72', method: 'getPlagHamincha72Minutes' },
    ],
  },
  {
    key: 'sunset',
    en: 'Sunset (Shkia)',
    he: 'שְׁקִיעָה',
    about: 'End of the day',
    fallback: 'standard',
    choices: [{ id: 'standard', name: 'Sunset', method: 'getSunset' }],
  },
  {
    key: 'tzais',
    en: 'Nightfall (Tzais)',
    he: 'צֵאת הַכּוֹכָבִים',
    about: 'Three stars',
    fallback: '8.5',
    choices: [
      { id: '8.5',   name: 'Three stars (8.5°)',            method: 'getTzaisGeonim8Point5Degrees', note: 'Geonim, three medium stars' },
      { id: '7.083', name: 'Geonim (7.083°)',               method: 'getTzaisGeonim7Point083Degrees' },
      { id: '50',    name: '50 minutes',                    method: 'getTzais50' },
      { id: '60',    name: '60 minutes',                    method: 'getTzais60' },
      { id: '72',    name: 'Rabbeinu Tam (72 minutes)',     method: 'getTzais72',        note: '72 minutes after sunset' },
      { id: '72z',   name: 'Rabbeinu Tam (72 zmaniyos)',    method: 'getTzais72Zmanis',  note: '72 proportional minutes' },
      { id: '16.1',  name: '16.1 degrees',                  method: 'getTzais16Point1Degrees' },
      { id: '18',    name: '18 degrees',                    method: 'getTzais18Degrees' },
    ],
  },
];

const SLOT_BY_KEY = new Map(ZMANIM_SLOTS.map((s) => [s.key, s]));

/**
 * Ready-made sets for people who do not want to pick line by line.
 * "Show all" is handled separately, by a flag.
 */
const PRESETS = {
  standard: {
    label: 'Standard',
    about: 'Alos 72 minutes, tzais at three stars',
    prefs: { alos: '72', misheyakir: '10.2', tzais: '8.5' },
  },
  'rabbeinu-tam': {
    label: 'Rabbeinu Tam',
    about: 'Tzais 72 minutes after sunset',
    prefs: { alos: '72', misheyakir: '10.2', tzais: '72' },
  },
  'rabbeinu-tam-zmanis': {
    label: 'Rabbeinu Tam (zmaniyos)',
    about: 'Tzais 72 proportional minutes',
    prefs: { alos: '72z', misheyakir: '10.2', tzais: '72z' },
  },
  'magen-avraham': {
    label: 'Magen Avraham',
    about: 'Degree-based alos and tzais (16.1°)',
    prefs: { alos: '16.1', misheyakir: '11', tzais: '16.1', sofZmanShmaMGA: '16.1', sofZmanTfilaMGA: '16.1' },
  },
  geonim: {
    label: 'Geonim',
    about: 'Tzais 7.083° after sunset',
    prefs: { alos: '72', misheyakir: '10.2', tzais: '7.083' },
  },
};

/** kosher-zmanim returns Luxon DateTime objects; normalise to a JS Date. */
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

function calendarFor(date, place) {
  const geo = new GeoLocation(
    place.name, place.latitude, place.longitude, place.elevation || 0, place.timeZone
  );
  const cal = new ComplexZmanimCalendar(geo);
  cal.setDate(date);
  return cal;
}

/**
 * Turn whatever arrived in the query string into a clean set of choices.
 * Anything unrecognised falls back to that slot's default, so a bad link
 * can never produce a wrong time -- only a default one.
 */
function normalisePrefs(input) {
  const raw = input || {};
  const prefs = {};

  const presetName = String(raw.minhag || raw.preset || '').trim();
  const preset = PRESETS[presetName];
  if (preset) Object.assign(prefs, preset.prefs);

  for (const slot of ZMANIM_SLOTS) {
    const asked = raw[slot.key];
    if (asked != null && slot.choices.some((c) => c.id === String(asked))) {
      prefs[slot.key] = String(asked);
    } else if (!prefs[slot.key]) {
      prefs[slot.key] = slot.fallback;
    }
  }

  return {
    minhag: preset ? presetName : (presetName ? 'standard' : 'custom'),
    showAll: raw.showAll === true || raw.showAll === 'true' || raw.showAll === '1',
    ...prefs,
  };
}

/** Run one choice, returning null rather than throwing if it cannot be computed. */
function computeChoice(cal, slot, choice, place) {
  const fn = cal[choice.method];
  if (typeof fn !== 'function') return null;
  let value = null;
  try {
    value = toDate(fn.call(cal));
  } catch {
    return null;
  }
  if (!value) return null;
  return {
    key: slot.key,
    choiceId: choice.id,
    en: slot.en,
    he: slot.he,
    opinion: choice.name,
    note: choice.note || slot.about,
    iso: value.toISOString(),
    time: formatTime(value, place.timeZone),
  };
}

/**
 * All of today's times at one place, following the reader's chosen opinions.
 *
 * Returns:
 *   times    the list to show, in the order they happen
 *   next     the upcoming one (what the widget puts on the home screen)
 *   options  the full catalogue, so the app can build the minhag picker
 *   prefs    what was actually used, echoed back
 */
function zmanimFor(date, place, now = new Date(), prefsInput = {}) {
  const prefs = normalisePrefs(prefsInput);
  const cal = calendarFor(date, place);
  const times = [];

  for (const slot of ZMANIM_SLOTS) {
    if (prefs.showAll && slot.choices.length > 1) {
      // Show every opinion for the lines people differ on.
      for (const choice of slot.choices) {
        const row = computeChoice(cal, slot, choice, place);
        if (row) times.push({ ...row, isChosen: choice.id === prefs[slot.key] });
      }
      continue;
    }
    const choice = slot.choices.find((c) => c.id === prefs[slot.key]) || slot.choices[0];
    const row = computeChoice(cal, slot, choice, place);
    if (row) times.push({ ...row, isChosen: true });
  }

  times.sort((a, b) => new Date(a.iso) - new Date(b.iso));

  // The countdown follows the reader's own opinions, never someone else's.
  const nowMs = now.getTime();
  const upcoming = times.find((t) => t.isChosen && new Date(t.iso).getTime() > nowMs) || null;
  const next = upcoming
    ? { ...upcoming, minutesAway: Math.round((new Date(upcoming.iso) - nowMs) / 60000) }
    : null;

  return {
    place,
    date: date.toISOString().slice(0, 10),
    prefs,
    times,
    next,
    options: {
      presets: Object.entries(PRESETS).map(([id, p]) => ({ id, label: p.label, about: p.about })),
      slots: ZMANIM_SLOTS
        .filter((s) => s.choices.length > 1)
        .map((s) => ({
          key: s.key,
          en: s.en,
          he: s.he,
          choices: s.choices.map((c) => ({ id: c.id, name: c.name })),
        })),
    },
  };
}

module.exports = { ZMANIM_SLOTS, SLOT_BY_KEY, PRESETS, zmanimFor, normalisePrefs, formatTime };
