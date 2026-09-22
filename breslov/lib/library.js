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
  // The three below carry no fallback count on purpose. If Sefaria does not
  // recognise the title, refsFor() returns nothing and the book is simply left
  // out of the rotation -- far better than guessing at a reference and asking
  // for a text that does not exist. /api/diagnostics reports which resolved.
  {
    key: 'likutei-tefilot',
    title: 'Likutei Tefilot',
    he: 'לִקּוּטֵי תְּפִלּוֹת',
    label: 'Likutei Tefilot',
    unit: 'Tefillah',
    fallbackCount: 0,
    weight: 2,
    weekly: false,
  },
  {
    key: 'sippurei-maasiyot',
    title: 'Sippurei Maasiyot',
    he: 'סִפּוּרֵי מַעֲשִׂיּוֹת',
    label: 'Sippurei Maasiyot',
    unit: 'Story',
    fallbackCount: 0,
    weight: 1,   // the stories are long, so they come up less often
    weekly: false,
  },
  {
    key: 'chayei-moharan',
    title: 'Chayei Moharan',
    he: 'חַיֵּי מוֹהֲרַ״ן',
    label: 'Chayei Moharan',
    unit: 'Passage',
    fallbackCount: 0,
    weight: 1,
    weekly: false,
    by: 'Recorded by Reb Noson',
  },

  // ---- Everything below is a candidate rather than a certainty.
  //
  // These are the other works of the Breslov canon. Sefaria's exact title for
  // each could not be checked from where this was written, so none carries a
  // fallback count: a title Sefaria does not recognise resolves to nothing and
  // is quietly left out of the rotation, and /api/diagnostics lists which ones
  // were found. Nothing here can make the app ask for a text that is not real.
  {
    key: 'shivchei-haran',
    title: 'Shivchei HaRan',
    he: 'שִׁבְחֵי הָרַ״ן',
    label: 'Shivchei HaRan',
    unit: 'Passage',
    fallbackCount: 0,
    weight: 2,
    weekly: false,
    by: 'Recorded by Reb Noson',
  },
  {
    key: 'likutei-halachot',
    title: 'Likutei Halachot',
    he: 'לִקּוּטֵי הֲלָכוֹת',
    label: 'Likutei Halachot',
    unit: 'Halachah',
    fallbackCount: 0,
    weight: 1,
    weekly: true,
    by: 'Reb Noson, built on Likutei Moharan',
  },
  {
    key: 'kitzur-likutei-moharan',
    aliases: ['Kitzur Likutei Moharan', 'Kitzur Likkutei Moharan', 'Kitzur Likutey Moharan'],
    title: 'Kitzur Likutei Moharan',
    he: 'קִצּוּר לִקּוּטֵי מוֹהֲרַ״ן',
    label: 'Kitzur Likutei Moharan',
    unit: 'Torah',
    fallbackCount: 0,
    weight: 1,
    weekly: false,
    by: 'An abridgement of Likutei Moharan',
  },
  {
    key: 'meshivat-nefesh',
    aliases: ['Meshivat Nefesh', 'Meshivas Nefesh', 'Meshivat Nefesh (Restore My Soul)'],
    title: 'Meshivat Nefesh',
    he: 'מְשִׁיבַת נֶפֶשׁ',
    label: 'Meshivat Nefesh',
    unit: 'Passage',
    fallbackCount: 0,
    weight: 2,
    weekly: false,
    by: 'Compiled from Rebbe Nachman\u2019s teachings',
  },
  {
    key: 'alim-literufah',
    aliases: ['Alim LiTerufah', 'Alim Literufah', 'Alim LiTerufah (Letters of Reb Noson)'],
    title: 'Alim LiTerufah',
    he: 'עֲלִים לִתְרוּפָה',
    label: 'Alim LiTerufah',
    unit: 'Letter',
    fallbackCount: 0,
    weight: 1,
    weekly: false,
    by: 'The letters of Reb Noson',
  },
  {
    key: 'yemei-moharnat',
    aliases: ['Yemei Moharnat', 'Yemey Moharnat', 'Yemei Maharnat', 'Yemei Moharnat (Days of Reb Noson)'],
    title: 'Yemei Moharnat',
    he: 'יְמֵי מוֹהֲרְנַ״ת',
    label: 'Yemei Moharnat',
    unit: 'Passage',
    fallbackCount: 0,
    weight: 1,
    weekly: false,
    by: 'Reb Noson\u2019s own account',
  },
  {
    key: 'kochvei-or',
    aliases: ['Kochvei Or', 'Kochavei Or', 'Kokhvei Or'],
    title: 'Kochvei Or',
    he: 'כּוֹכְבֵי אוֹר',
    label: 'Kochvei Or',
    unit: 'Passage',
    fallbackCount: 0,
    weight: 1,
    weekly: false,
    by: 'Reb Avraham b\u2019Reb Nachman',
  },
  {
    key: 'siach-sarfei-kodesh',
    aliases: ['Siach Sarfei Kodesh', 'Siach Sarfey Kodesh', 'Sichat Sarfei Kodesh'],
    title: 'Siach Sarfei Kodesh',
    he: 'שִׂיחַ שַׂרְפֵי קֹדֶשׁ',
    label: 'Siach Sarfei Kodesh',
    unit: 'Passage',
    fallbackCount: 0,
    weight: 1,
    weekly: false,
    by: 'Collected Breslov traditions',
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

    // Complex books -- Sefer HaMiddot and the like -- describe themselves with
    // `chapters` holding sub-node objects, each with its own title.
    //
    // A simple book uses the same field for something quite different: a map
    // of how many segments each chapter holds, as numbers or as nested arrays
    // of numbers. Because `typeof [] === 'object'`, those were being mistaken
    // for sub-nodes, and each chapter's array length was read as a count. That
    // turned Likutei Moharan's 286 lessons into 964 references, nearly all of
    // them duplicates of the first handful, so the daily rotation could only
    // ever reach the opening lessons of the book. Requiring a plain object
    // with a title is what tells the two apart.
    const first = node.chapters && node.chapters[0];
    const hasSubNodes = Array.isArray(node.chapters) && node.chapters.length &&
      first !== null && typeof first === 'object' && !Array.isArray(first) &&
      typeof first.title === 'string';

    if (hasSubNodes) {
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

  // Transliteration from Hebrew has no single right answer, so a book may be
  // filed under a spelling other than the one written here. Each is tried in
  // turn. The references themselves are built from the title Sefaria returns,
  // not the one asked for, so whichever spelling matched, the refs are right.
  const candidates = [book.title].concat(book.aliases || [])
    .filter((t, i, all) => t && all.indexOf(t) === i);

  let refs = [];
  for (const title of candidates) {
    try {
      const shape = await getShape(title);
      refs = refsFromShape(shape, book);
      if (refs.length) {
        book.resolvedTitle = title;
        break;
      }
    } catch (err) {
      if (process.env.DEBUG) console.warn(`shape lookup failed for ${title}: ${err.message}`);
    }
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

/**
 * One reference per chapter, rather than a single range.
 *
 * Asking Sefaria for "Psalms 60-65" returns the six psalms nested inside one
 * another, and flattening that loses where each psalm begins. The verses then
 * run 1, 2, 3 ... 25 straight through the six psalms instead of restarting,
 * and the headings disappear. Fetching each chapter on its own keeps every
 * psalm labelled and numbered from its own first verse.
 */
function tehillimChapters(portion) {
  // A verse range inside a single chapter stays one piece, but remembers
  // which verse it starts at so day 26 numbers from 97 rather than from 1.
  if (portion.verses) {
    return [{
      ref: `Psalms ${portion.from}:${portion.verses[0]}-${portion.verses[1]}`,
      chapter: portion.from,
      startVerse: portion.verses[0],
      label: `Tehillim ${portion.from}:${portion.verses[0]}\u2013${portion.verses[1]}`,
    }];
  }

  const out = [];
  for (let n = portion.from; n <= portion.to; n++) {
    out.push({
      ref: `Psalms ${n}`,
      chapter: n,
      startVerse: 1,
      label: `Tehillim ${n}`,
    });
  }
  return out;
}

/** A human label like "Tehillim 90–96" or "Tehillim 119:1–96". */
function tehillimLabel(portion) {
  if (portion.verses) return `Tehillim ${portion.from}:${portion.verses[0]}–${portion.verses[1]}`;
  if (portion.from === portion.to) return `Tehillim ${portion.from}`;
  return `Tehillim ${portion.from}–${portion.to}`;
}

/**
 * Which books resolved against Sefaria and how many pieces each has.
 * Used by /api/diagnostics so a title that Sefaria does not recognise shows up
 * as a plain "not found" rather than a book that quietly never appears.
 */
async function bookStatus() {
  const out = [];
  for (const book of BOOKS) {
    let refs = [];
    let error = null;
    try {
      refs = await refsFor(book.key);
    } catch (err) {
      error = err.message;
    }
    out.push({
      label: book.label,
      title: book.title,
      foundAs: book.resolvedTitle && book.resolvedTitle !== book.title ? book.resolvedTitle : null,
      by: book.by || null,
      ok: refs.length > 0,
      pieces: refs.length,
      detail: error || (refs.length ? `${refs.length} pieces` : 'Sefaria did not recognise this title'),
    });
  }
  return out;
}

module.exports = {
  BOOKS, BY_KEY, TIKKUN_HAKLALI, TEHILLIM_BY_DAY, bookStatus,
  refsFor, refsFromShape, weeklyBooks, dailyBookPool,
  tehillimForDay, tehillimRef, tehillimLabel, tehillimChapters,
};
