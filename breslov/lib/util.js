'use strict';

/** Milliseconds in a day. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A tiny deterministic random number generator (mulberry32).
 * Same seed always gives the same sequence, so every person using the app
 * sees the same lesson on the same day.
 */
function seededRandom(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Shuffle a list into a fixed order using a seed.
 * We use this so the daily rotation visits every lesson once before repeating,
 * but does not simply march 1, 2, 3... through the book.
 */
function seededShuffle(items, seed) {
  const out = items.slice();
  const rand = seededRandom(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Whole days between the Unix epoch and a local calendar date (no time component). */
function dayNumber(date) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
}

/**
 * Pick one item for a given day, cycling through the whole list before repeating.
 * `salt` keeps different books on different rotations.
 */
function pickForDay(items, date, salt = 0) {
  if (!items || !items.length) return null;
  const order = seededShuffle(items, 0x5eed + salt);
  const cycle = Math.floor(dayNumber(date) / order.length);
  // Re-shuffle each full cycle so the order is not identical year after year.
  const rotated = cycle === 0 ? order : seededShuffle(order, 0x5eed + salt + cycle);
  return rotated[dayNumber(date) % order.length];
}

/** Same idea, but the choice only changes once a week (Sunday to Shabbos). */
function pickForWeek(items, date, salt = 0) {
  if (!items || !items.length) return null;
  const week = Math.floor((dayNumber(date) + 4) / 7); // +4 aligns the epoch to a Sunday
  const order = seededShuffle(items, 0xbee5 + salt);
  return order[week % order.length];
}

/** Strip Sefaria's inline HTML down to readable plain text. */
function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Flatten Sefaria's nested text arrays into one array of strings. */
function flattenText(value) {
  if (value == null) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(flattenText);
  return [];
}

/**
 * Cut text to roughly `max` characters, stopping at a sentence or word boundary
 * so a widget never ends mid-word.
 */
function snippet(text, max = 240) {
  const clean = stripHtml(text).replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const sentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (sentence > max * 0.5) return cut.slice(0, sentence + 1);
  const space = cut.lastIndexOf(' ');
  return (space > 0 ? cut.slice(0, space) : cut).trim() + '…';
}

/** YYYY-MM-DD for a Date, in the given IANA time zone. */
function isoDateInZone(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(date);
}

/** Build a Date representing midday of a YYYY-MM-DD string (avoids DST edge cases). */
function dateFromIso(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

module.exports = {
  DAY_MS,
  seededRandom,
  seededShuffle,
  dayNumber,
  pickForDay,
  pickForWeek,
  stripHtml,
  flattenText,
  snippet,
  isoDateInZone,
  dateFromIso,
};
