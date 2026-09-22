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

/**
 * The named HTML entities Sefaria actually uses. Anything not listed is still
 * handled, because numeric entities are decoded separately below.
 *
 * &thinsp; in particular appears throughout Tanach, between a word and what
 * follows it. Leaving it undecoded put the literal text "&thinsp;" into the
 * middle of the Hebrew, which in a right-to-left line is reordered by the
 * browser and looks like the words have been shuffled.
 */
const ENTITIES = {
  nbsp: '\u00a0', thinsp: '\u2009', ensp: '\u2002', emsp: '\u2003',
  hairsp: '\u200a', zwj: '\u200d', zwnj: '\u200c', shy: '',
  hellip: '…', mdash: '—', ndash: '–', minus: '−',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d',
  sbquo: '\u201a', bdquo: '\u201e', prime: '\u2032', Prime: '\u2033',
  bull: '•', middot: '·', deg: '°', times: '×', divide: '÷',
  laquo: '«', raquo: '»', sect: '§', para: '¶',
  dagger: '†', Dagger: '‡', permil: '‰', trade: '™', copy: '©', reg: '®',
  quot: '"', apos: "'", lt: '<', gt: '>',
};

/** Turn every HTML entity into the character it stands for. */
function decodeEntities(text) {
  return String(text)
    // &#8201; and &#x2009;
    .replace(/&#(\d+);/g, (m, code) => codePoint(Number(code), m))
    .replace(/&#x([0-9a-fA-F]+);/g, (m, code) => codePoint(parseInt(code, 16), m))
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (m, name) =>
      Object.prototype.hasOwnProperty.call(ENTITIES, name) ? ENTITIES[name] : m)
    // &amp; goes last, so "&amp;thinsp;" ends up as the literal text "&thinsp;"
    // rather than being decoded twice into a space.
    .replace(/&amp;/g, '&');
}

function codePoint(code, original) {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return original;
  try {
    return String.fromCodePoint(code);
  } catch {
    return original;
  }
}

/** Strip Sefaria's inline HTML down to readable plain text. */
function stripHtml(html) {
  if (!html) return '';
  const withoutTags = String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    // Footnote markers and their bodies are noise in a reading view.
    .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, '')
    .replace(/<i\s+class="footnote"[^>]*>[\s\S]*?<\/i>/gi, '')
    .replace(/<[^>]+>/g, '');

  return decodeEntities(withoutTags)
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
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
  decodeEntities,
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
