'use strict';

/**
 * Chooses what to show today and this week, then fetches the real text.
 *
 * Nothing here writes Torah. It only decides *which* passage to show and
 * asks lib/sefaria.js for the words.
 */

const sefaria = require('./sefaria');
const library = require('./library');
const { pickForDay, pickForWeek, snippet, dayNumber } = require('./util');

/** A short, uniform "sorry" object so the app never shows invented text. */
function unavailable(what, err) {
  return {
    available: false,
    what,
    reason: err ? err.message : 'Text could not be loaded',
    hint: 'The text comes from sefaria.org. Check the server\'s internet connection.',
  };
}

/** Wrap a fetched passage in the shape the website and widgets expect. */
function present(text, extra = {}) {
  const hebrew = text.hebrew || [];
  const english = text.english || [];
  return {
    available: true,
    ref: text.ref,
    heRef: text.heRef,
    url: text.url,
    hebrew,
    english,
    snippetHe: snippet(hebrew.join(' '), 200),
    snippetEn: snippet(english.join(' '), 260),
    credit: {
      hebrew: text.hebrewVersion,
      english: text.englishVersion,
      license: text.license,
      source: 'Sefaria (sefaria.org)',
    },
    ...extra,
  };
}

/**
 * Try a few references in rotation order until one actually loads.
 * Protects against a single missing chapter breaking the whole day.
 */
async function firstThatLoads(refs, attempts = 3) {
  let lastErr = null;
  for (let i = 0; i < Math.min(attempts, refs.length); i++) {
    try {
      const text = await sefaria.getText(refs[i]);
      if (text) return { text, ref: refs[i] };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('No text available');
}

/** Today's short piece of Reb Nachman, rotating through his seforim. */
async function dailySpark(date) {
  try {
    const pool = library.dailyBookPool();
    const bookKey = pickForDay(pool, date, 11);
    const book = library.BY_KEY.get(bookKey);
    const refs = await library.refsFor(bookKey);
    if (!refs.length) return unavailable('daily teaching');

    // Rotate the whole book, then try the next few if one fails to load.
    const chosen = pickForDay(refs, date, 11);
    const start = refs.indexOf(chosen);
    const ordered = refs.slice(start).concat(refs.slice(0, start));

    const { text, ref } = await firstThatLoads(ordered);
    return present(text, {
      book: { key: book.key, label: book.label, he: book.he, unit: book.unit },
      heading: `${book.label} ${ref.replace(`${book.title} `, '').replace(`${book.title}, `, '')}`,
    });
  } catch (err) {
    return unavailable('daily teaching', err);
  }
}

/** Today's Tehillim according to the day of the Hebrew month. */
async function dailyTehillim(hebrew) {
  try {
    const portions = library.tehillimForDay(hebrew.day, hebrew.daysInMonth);
    const parts = [];
    for (const portion of portions) {
      const ref = library.tehillimRef(portion);
      const text = await sefaria.getText(ref);
      if (text) parts.push(present(text, { label: library.tehillimLabel(portion) }));
    }
    if (!parts.length) return unavailable('daily Tehillim');
    return {
      available: true,
      cycle: 'Monthly cycle (by day of the Hebrew month)',
      day: hebrew.day,
      label: portions.map(library.tehillimLabel).join('  •  '),
      parts,
    };
  } catch (err) {
    return unavailable('daily Tehillim', err);
  }
}

/** The complete Tikkun HaKlali -- the ten psalms, in order. */
async function tikkunHaklali() {
  try {
    const parts = [];
    for (const n of library.TIKKUN_HAKLALI) {
      const text = await sefaria.getText(`Psalms ${n}`);
      if (text) parts.push(present(text, { label: `Tehillim ${n}`, chapter: n }));
    }
    if (parts.length !== library.TIKKUN_HAKLALI.length) {
      return unavailable('Tikkun HaKlali');
    }
    return {
      available: true,
      name: 'Tikkun HaKlali',
      he: 'תִּקּוּן הַכְּלָלִי',
      chapters: library.TIKKUN_HAKLALI,
      description: 'The ten psalms Rebbe Nachman designated as the general remedy.',
      parts,
    };
  } catch (err) {
    return unavailable('Tikkun HaKlali', err);
  }
}

/** Titles of Reb Nachman's seforim, for spotting them in Sefaria's link data. */
const BRESLOV_TITLES = new Set(library.BOOKS.map((b) => b.title));

/**
 * References in Reb Nachman's works that Sefaria links to this week's parsha.
 * This is real connection data from Sefaria, not a guess on our part.
 */
async function lessonsLinkedToParsha(parshaRef) {
  if (!parshaRef) return [];
  const links = await sefaria.getLinks(parshaRef);
  const found = new Map();
  for (const link of links) {
    const title = link.index_title || link.collectiveTitle?.en;
    if (!title || !BRESLOV_TITLES.has(title)) continue;
    const ref = link.ref;
    if (ref && !found.has(ref)) found.set(ref, { ref, title, anchor: link.anchorRef || null });
  }
  return [...found.values()];
}

/** Sefaria's own calendar tells us the exact verse range of this week's parsha. */
async function parshaRefFromSefaria(israel) {
  try {
    const cal = await sefaria.getCalendars(!israel);
    const items = cal?.calendar_items || [];
    const parsha = items.find((i) => (i.title?.en || '').startsWith('Parashat'));
    return parsha?.ref || null;
  } catch {
    return null;
  }
}

/**
 * This week's Torah from Reb Nachman.
 *
 * First choice: a lesson Sefaria links to a verse in this week's parsha.
 * Otherwise: a featured lesson from Likutei Moharan, chosen for the week.
 * Either way the same lesson shows all week, for everyone.
 */
async function weeklyTorah(date, calendar) {
  const parshaName = calendar?.parsha?.en || null;
  try {
    const parshaRef = await parshaRefFromSefaria(calendar?.place?.israel);
    const linked = parshaRef ? await lessonsLinkedToParsha(parshaRef) : [];

    if (linked.length) {
      const choice = pickForWeek(linked.map((l) => l.ref), date, 77);
      const text = await sefaria.getText(choice);
      if (text) {
        const meta = linked.find((l) => l.ref === choice);
        return present(text, {
          mode: 'parsha',
          parsha: parshaName,
          parshaHe: calendar?.parsha?.he || null,
          parshaRef,
          anchor: meta?.anchor || null,
          why: `Rebbe Nachman darshans a verse from Parashas ${parshaName} in this lesson.`,
          alternatives: linked.length,
        });
      }
    }

    // Nothing linked to the parsha this week -- give a featured lesson instead.
    const refs = [];
    for (const book of library.weeklyBooks()) {
      refs.push(...(await library.refsFor(book.key)));
    }
    if (!refs.length) return unavailable('weekly Torah');

    const chosen = pickForWeek(refs, date, 77);
    const start = refs.indexOf(chosen);
    const ordered = refs.slice(start).concat(refs.slice(0, start));
    const { text } = await firstThatLoads(ordered);

    return present(text, {
      mode: 'featured',
      parsha: parshaName,
      parshaHe: calendar?.parsha?.he || null,
      why: 'A featured lesson for this week.',
    });
  } catch (err) {
    return unavailable('weekly Torah', err);
  }
}

/** A stable id for "which day is it", used for cache keys. */
function dayKey(date) {
  return dayNumber(date);
}

module.exports = {
  dailySpark, dailyTehillim, tikkunHaklali, weeklyTorah,
  lessonsLinkedToParsha, present, unavailable, dayKey,
};
