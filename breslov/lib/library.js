'use strict';

/**
 * Which seforim the app draws from, and how to build a valid Sefaria
 * reference for each one.
 *
 * The lesson counts below are only a safety net. On startup the app asks
 * Sefaria's /api/shape endpoint for the real structure of each book, so a
 * reference is never guessed.
 */

const { getShape } = require('./sefaria');

const BOOKS = [
  {
    key: 'likutei-moharan',
    title: 'Likutei Moharan',
    he: 'לִקּוּטֵי מוֹהֲרַ״ן',
    label: 'Likutei Moharan',
    unit: 'Torah',
    fallbackCount: 286,
    weight: 4,
    weekly: true,
  },
  {
    key: 'likutei-moharan-ii',
    title: 'Likutei Moharan, Part II',
    he: 'לִקּוּטֵי מוֹהֲרַ״ן תִּנְיָנָא',
    label: 'Likutei Moharan II',
    unit: 'Torah',
    fallbackCount: 125,
    weight: 2,
    weekly: true,
  },
  {
    key: 'sichot-haran',
    title: 'Sichot HaRan',
    he: 'שִׂיחוֹת הָרַ״ן',
    label: 'Sichot HaRan',
    unit: 'Sichah',
    fallbackCount: 308,
    weight: 3,
    weekly: false,
  },
  {
    key: 'sefer-hamiddot',
    title: 'Sefer HaMiddot',
    he: 'סֵפֶר הַמִּדּוֹת',
    label: 'Sefer HaMiddot',
    unit: 'Teaching',
    fallbackCount: 0, // organised by topic -- only used if Sefaria describes it
    weight: 2,
    weekly: false,
  },
  {
    key: 'likutei-etzot',
    title: 'Likutei Etzot',
    he: 'לִקּוּטֵי עֵצוֹת',
    label: 'Likutei Etzot',
    unit: 'Advice',
    fallbackCount: 0,
    weight: 2,
    weekly: false,
  },
];

const BY_KEY = new Map(BOOKS.map((b) => [b.key, b]));

/** The ten psalms of the Tikkun HaKlali, in the order Reb Nachman set. */
const TIKKUN_HAKLALI = [16, 32, 41, 42, 59, 77, 90, 105, 137, 150];

/**
 * The standard monthly division of Tehillim (חלוקה לפי ימי החודש).
 * Index 0 is unused so that day 1 reads naturally as TEHILLIM_BY_DAY[1].
 * In a 29-day month, day 29 and day 30 are both said on the 29th -- the
 * code in dailyTehillim() handles that.
 */
const TEHILLIM_BY_DAY = [
  null,
  { from: 1, to: 9 },     { from: 10, to: 17 },  { from: 18, to: 22 },
  { from: 23, to: 28 },   { from: 29, to: 34 },  { from: 35, to: 38 },
  { from: 39, to: 43 },   { from: 44, to: 48 },  { from: 49, to: 54 },
  { from: 55, to: 59 },   { from: 60, to: 65 },  { from: 66, to: 68 },
  { from: 69, to: 71 },   { from: 72, to: 76 },  { from: 77, to: 78 },
  { from: 79, to: 82 },   { from: 83, to: 87 },  { from: 88, to: 89 },
  { from: 90, to: 96 },   { from: 97, to: 103 }, { from: 104, to: 105 },
  { from: 106, to: 107 }, { from: 108, to: 112 }, { from: 113, to: 118 },
  { from: 119, to: 119, verses: [1, 96] },
  { from: 119, to: 119, verses: [97, 176] },
  { from: 120, to: 134 }, { from: 135, to: 139 },
  { from: 140, to: 144 }, { from: 145, to: 150 },
];

/** Cached ref lists, so we only ask Sefaria about each book once. */
const refCache = new Map();

/**
 * Turn Sefaria's /api/shape answer into a flat list of references.
 * Simple books give "Likutei Moharan 6"; books organised by topic give
 * "Sefer HaMiddot, Truth 3" -- the shape tells us which is which.
 */
function refsFromShape(shape, book) {
  const nodes = Array.isArray(shape) ? shape : [shape];
  const refs = [];

  for (const node of nodes) {
    if (!node) continue;
    const base = node.title || book.title;

    // Complex books: `chapters` is an array of sub-node objects.
    if (Array.isArray(node.chapters) && node.chapters.length &&
        typeof node.chapters[0] === 'object') {
      for (const child of node.chapters) {
        const childBase = child.title || base;
        const count = Number(child.length) || 0;
        for (let i = 1; i <= count; i++) refs.push(`${childBase} ${i}`);
      }
      continue;
    }

    // Simple books: `length` is the number of chapters / lessons.
    const count = Number(node.length) || 0;
    for (let i = 1; i <= count; i++) refs.push(`${base} ${i}`);
  }

  return refs;
}

/**
 * All the references in one book. Asks Sefaria first; if that fails we use
 * the documented count above so the app still works offline.
 */
async function refsFor(bookKey) {
  if (refCache.has(bookKey)) return refCache.get(bookKey);
  const book = BY_KEY.get(bookKey);
  if (!book) return [];

  let refs = [];
  try {
    const shape = await getShape(book.title);
    refs = refsFromShape(shape, book);
  } catch (err) {
    if (process.env.DEBUG) console.warn(`shape lookup failed for ${book.title}: ${err.message}`);
  }

  if (!refs.length && book.fallbackCount > 0) {
    refs = Array.from({ length: book.fallbackCount }, (_, i) => `${book.title} ${i + 1}`);
  }

  refCache.set(bookKey, refs);
  return refs;
}

/** Books that can supply the weekly Torah (the long lessons). */
function weeklyBooks() {
  return BOOKS.filter((b) => b.weekly);
}

/**
 * Books the daily spark rotates through, repeated by `weight` so that
 * Likutei Moharan comes up more often than the smaller seforim.
 */
function dailyBookPool() {
  return BOOKS.flatMap((b) => Array.from({ length: b.weight }, () => b.key));
}

/** Which Tehillim are said on a given day of the Hebrew month. */
function tehillimForDay(hebrewDay, daysInMonth) {
  const portions = [];
  const day = Math.min(Math.max(hebrewDay, 1), 30);
  portions.push({ day, ...TEHILLIM_BY_DAY[day] });
  // A 29-day month: the 30th day's portion is added to the 29th.
  if (day === 29 && daysInMonth === 29) {
    portions.push({ day: 30, ...TEHILLIM_BY_DAY[30] });
  }
  return portions;
}

/** Build the Sefaria reference for a Tehillim portion. */
function tehillimRef(portion) {
  if (portion.verses) {
    return `Psalms ${portion.from}:${portion.verses[0]}-${portion.verses[1]}`;
  }
  if (portion.from === portion.to) return `Psalms ${portion.from}`;
  return `Psalms ${portion.from}-${portion.to}`;
}

/** A human label like "Tehillim 90–96" or "Tehillim 119:1–96". */
function tehillimLabel(portion) {
  if (portion.verses) return `Tehillim ${portion.from}:${portion.verses[0]}–${portion.verses[1]}`;
  if (portion.from === portion.to) return `Tehillim ${portion.from}`;
  return `Tehillim ${portion.from}–${portion.to}`;
}

module.exports = {
  BOOKS, BY_KEY, TIKKUN_HAKLALI, TEHILLIM_BY_DAY,
  refsFor, refsFromShape, weeklyBooks, dailyBookPool,
  tehillimForDay, tehillimRef, tehillimLabel,
};
