'use strict';

/**
 * Chooses what to show today and this week, then fetches the real text.
 *
 * Nothing here writes Torah. It only decides *which* passage to show and
 * asks lib/sefaria.js for the words.
 */

const sefaria = require('./sefaria');
const library = require('./library');
const { pickForDay, pickRunForDay, pickForWeek, pickRunForWeek, snippet, dayNumber } = require('./util');

/** A short, uniform "sorry" object so the app never shows invented text. */
/**
 * A piece of the day that did not arrive.
 *
 * `reason` is the real error and is meant for /api/diagnostics and the log,
 * never for the page. `hint` used to say "check the server's internet
 * connection", which is an instruction to whoever runs the server, given to
 * whoever is trying to say Tehillim. The website does not print either of
 * them now; it says what it could not load and offers to try again.
 */
function unavailable(what, err) {
  return {
    available: false,
    what,
    reason: err ? err.message : 'Text could not be loaded',
  };
}

/**
 * Is there an English translation here, or only the shape of one?
 *
 * Sefaria answers for a text it has not had translated with an array the
 * right length and empty at every position, so `english.length` is true for
 * an untranslated sefer and tells you nothing. Likutei Halachot is the case
 * this was written for: it is almost entirely untranslated, and the weekly
 * card landed on it and showed a block of Hebrew with no English under it and
 * no word about why.
 */
function hasEnglish(text) {
  return ((text && text.english) || []).some((line) => String(line || '').trim().length > 0);
}

/**
 * Load references in order and prefer one that carries English.
 *
 * Every picker in this file used to take the first reference that had any
 * Hebrew in it. That is the right rule for whether a piece exists and the
 * wrong one for whether it can be read: a reader with English turned on got
 * a Hebrew-only passage with nothing said about it. So: sweep the candidates,
 * return the first translated one, and if the whole sweep is untranslated,
 * fall back to the first that loaded at all -- marked, so the card can say so
 * rather than leave a gap where the English belongs.
 */
async function firstReadable(refs, note) {
  const say = (ref, why) => { if (typeof note === 'function') note(ref, why); };
  let fallback = null;
  for (const ref of refs) {
    let text = null;
    try {
      text = await sefaria.getText(ref);
    } catch (err) {
      say(ref, `fetch failed: ${err.message}`);
      continue;
    }
    if (!text || !(text.hebrew || []).length) { say(ref, 'no Hebrew in this piece'); continue; }
    if (hasEnglish(text)) { say(ref, 'ok'); return { text, ref, translated: true }; }
    say(ref, 'Hebrew only -- no translation on Sefaria');
    if (!fallback) fallback = { text, ref, translated: false };
  }
  return fallback;
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
    // Whether Sefaria has this piece in English at all. The page says so
    // plainly when it does not; see passage() in public/app.js.
    translated: hasEnglish(text),
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
 * Today's short piece of Reb Nachman, rotating through his seforim.
 *
 * Some books are only included if Sefaria recognises the title, so the book
 * the rotation lands on may turn out to have nothing in it. Rather than leave
 * the day blank, we move along the rotation to the next book that does.
 */
async function dailySpark(date) {
  try {
    const pool = library.dailyBookPool();
    const chosenBook = pickForDay(pool, date, 11);

    // The rotation order for today, starting at the chosen book, with each
    // book appearing once so we never try the same one twice.
    const seen = new Set();
    const order = [];
    const startAt = pool.indexOf(chosenBook);
    for (let i = 0; i < pool.length; i++) {
      const key = pool[(startAt + i) % pool.length];
      if (!seen.has(key)) { seen.add(key); order.push(key); }
    }

    let lastErr = null;
    for (const bookKey of order) {
      const book = library.BY_KEY.get(bookKey);
      let refs = [];
      try {
        refs = await library.refsFor(bookKey);
      } catch (err) {
        lastErr = err;
        continue;
      }
      if (!refs.length) continue;   // Sefaria does not know this book; try the next

      const chosen = pickForDay(refs, date, 11);
      const start = refs.indexOf(chosen);
      const ordered = refs.slice(start).concat(refs.slice(0, start));

      try {
        // The day's lesson, and the few after it in the same rotation, so a
        // piece Sefaria holds only in Hebrew does not become the whole day.
        const got = await firstReadable(ordered.slice(0, 4));
        if (!got) throw new Error(`No text available in ${book.label}`);
        const { text, ref } = got;
        return present(text, {
          book: { key: book.key, label: book.label, he: book.he, unit: book.unit },
          heading: `${book.label} ${ref.replace(`${book.title}, `, '').replace(`${book.title} `, '')}`,
        });
      } catch (err) {
        lastErr = err;   // this book would not load today; fall through to the next
      }
    }

    return unavailable('daily teaching', lastErr);
  } catch (err) {
    return unavailable('daily teaching', err);
  }
}

/** Today's Tehillim according to the day of the Hebrew month. */
async function dailyTehillim(hebrew) {
  try {
    const portions = library.tehillimForDay(hebrew.day, hebrew.daysInMonth);

    // One request per psalm, so each keeps its own heading and verse numbers.
    // They are fetched together rather than one after another, and every
    // answer is cached on disk, so this is only slow the very first time.
    const pieces = portions.flatMap(library.tehillimChapters);
    const fetched = await Promise.all(pieces.map(async (piece) => {
      try {
        const text = await sefaria.getText(piece.ref);
        return text ? present(text, {
          label: piece.label,
          chapter: piece.chapter,
          startVerse: piece.startVerse,
        }) : null;
      } catch {
        return null;
      }
    }));

    const parts = fetched.filter(Boolean);
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
      if (text) parts.push(present(text, { label: `Tehillim ${n}`, chapter: n, startVerse: 1 }));
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
 * The yomim tovim a week can be anchored to, and the word to look for each
 * one under in the seforim.
 *
 * Rosh Chodesh is deliberately not here. It comes round twelve times a year
 * and would displace the parsha every month, which is not what a yom tov
 * means to anybody saying it over.
 */
const YOM_TOV = [
  { is: /rosh hashana/i,            en: 'Rosh Hashanah',  he: 'רֹאשׁ הַשָּׁנָה',
    look: ['ראש השנה', 'שופר', 'Rosh Hashanah'] },
  { is: /yom kippur/i,              en: 'Yom Kippur',     he: 'יוֹם כִּפּוּר',
    look: ['יום כיפור', 'יום הכיפורים', 'תשובה', 'Yom Kippur'] },
  { is: /sukkot|hoshana/i,          en: 'Sukkos',         he: 'סֻכּוֹת',
    look: ['סוכות', 'סוכה', 'ארבעה מינים', 'אתרוג', 'Sukkot'] },
  { is: /shmini atzeret/i,          en: 'Shmini Atzeres', he: 'שְׁמִינִי עֲצֶרֶת',
    look: ['שמיני עצרת', 'שמחת תורה', 'סוכות', 'Shemini Atzeret'] },
  { is: /simchat torah/i,           en: 'Simchas Torah',  he: 'שִׂמְחַת תּוֹרָה',
    look: ['שמחת תורה', 'הקפות', 'שמחה של תורה', 'סוכות', 'Simchat Torah'] },
  { is: /chanukah/i,                en: 'Chanukah',       he: 'חֲנֻכָּה',
    look: ['חנוכה', 'נר חנוכה', 'Chanukah'] },
  { is: /purim/i,                   en: 'Purim',          he: 'פּוּרִים',
    look: ['פורים', 'מגילה', 'Purim'] },
  { is: /pesach|passover/i,         en: 'Pesach',         he: 'פֶּסַח',
    look: ['פסח', 'חמץ', 'מצה', 'יציאת מצרים', 'Pesach'] },
  { is: /shavuot/i,                 en: 'Shavuos',        he: 'שָׁבוּעוֹת',
    look: ['שבועות', 'מתן תורה', 'Shavuot'] },
  { is: /lag b.?omer/i,             en: 'Lag BaOmer',     he: 'ל״ג בָּעֹמֶר',
    look: ['לג בעומר', 'רבי שמעון בן יוחאי', 'Lag BaOmer'] },
  { is: /tu b.?shvat|tu bishvat/i,  en: 'Tu BiShvat',     he: 'ט״ו בִּשְׁבָט',
    look: ['טו בשבט', 'אילנות', 'Tu BiShvat'] },
  { is: /tish.?a b.?av/i,           en: "Tisha B'Av",     he: 'תִּשְׁעָה בְּאָב',
    look: ['תשעה באב', 'חורבן', 'בית המקדש', "Tisha B'Av"] },
];

/** The yom tov in the days ahead, if there is one. */
function yomTovAhead(calendar) {
  for (const holiday of (calendar && calendar.holidays) || []) {
    const match = YOM_TOV.find((y) => y.is.test(holiday.en || ''));
    if (match) return Object.assign({}, match, { on: holiday.date || null });
  }
  return null;
}

/**
 * A piece of Breslov Torah that actually talks about something.
 *
 * Sefaria's links tie a lesson to a verse, which is how the parsha lesson is
 * found. A yom tov has no verse, so this asks the other way: search the
 * seforim for the name of the chag and keep only what is answered from one
 * of the ten. A lesson that says "Sukkos" is about Sukkos; that is a weaker
 * claim than a recorded link and it is still a real one, and the card says
 * which of the two it is.
 */
async function breslovAbout(terms, date, salt, tried) {
  const words = (Array.isArray(terms) ? terms : [terms]).filter(Boolean);
  const note = (word, why) => { if (Array.isArray(tried)) tried.push({ word, why }); };

  // Several words for the same chag, because one of them may find nothing.
  // Sukkos is also the sukkah and the arba minim; Simchas Torah is also the
  // hakafos. A chag with one word to its name is a chag that can come up
  // empty on a quirk of how a lesson happens to be worded.
  for (const word of words) {
    let found;
    try {
      // Wide, because the ten seforim are a thin slice of Sefaria and a
      // search for a chag is mostly Shas and Shulchan Aruch.
      found = await sefaria.search(word, { size: 120 });
    } catch (err) {
      note(word, `search failed: ${err.message}`);
      continue;
    }
    // By the front of the reference, not by a book field Sefaria's search
    // does not reliably set. See library.belongsToUs.
    const ours = (found.hits || []).filter((h) => library.belongsToUs(h));
    const refs = [...new Set(ours.map((h) => h.ref).filter(Boolean))];
    if (!refs.length) { note(word, `${(found.hits || []).length} hits, none from the ten`); continue; }

    // The week's choice, and the next few in the same weekly order. A search
    // for a chag mostly lands in Likutei Halachot, which Sefaria carries in
    // Hebrew and barely in English; one candidate meant the card was Hebrew
    // only. The order is still fixed for the week, so everyone sees the same
    // piece -- it is just allowed to step past an untranslated one.
    const order = pickRunForWeek(refs, date, salt || 83, 6);
    const got = await firstReadable(order);
    if (!got) { note(word, `none of ${order.length} candidates loaded`); continue; }
    const meta = ours.find((h) => h.ref === got.ref);
    note(word, `${got.translated ? 'ok' : 'Hebrew only'}: ${got.ref} ` +
      `(${ours.length} of ${(found.hits || []).length} hits were ours)`);
    return { text: got.text, book: library.bookOfHit(meta) || null, word, translated: got.translated };
  }
  return null;
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
    // A yom tov in the days ahead takes the week. On Sukkos nobody wants a
    // lesson on next Shabbos's parsha, and that is what this card gave them.
    const chag = yomTovAhead(calendar);
    if (chag) {
      const got = await breslovAbout(chag.look, date, 83);
      if (got) {
        return present(got.text, {
          mode: 'yomtov',
          yomTov: chag.en,
          yomTovHe: chag.he,
          parsha: parshaName,
          parshaHe: calendar?.parsha?.he || null,
          says: library.saidBy(got.book) || null,
          why: `On ${chag.en}.`,
        });
      }
    }

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
          // Whose words these are, not whose sefer they are filed under. Ten
          // books can be linked to a parsha and three of them are Reb
          // Noson's; this line used to credit Rebbe Nachman with all of them.
          says: library.saidBy(meta?.title) || null,
          why: `${library.saidBy(meta?.title) || 'Rebbe Nachman'} on a verse from Parashas ${parshaName}.`,
          alternatives: linked.length,
        });
      }
    }

    // Nothing linked to the parsha this week. Search for it by name instead:
    // a lesson that says "Bereishis" is about Bereishis. Weaker than a
    // recorded link, still a real connection, and the card says which it is.
    const byName = parshaName
      ? await breslovAbout(calendar?.parsha?.he || parshaName, date, 91)
      : null;
    if (byName) {
      return present(byName.text, {
        mode: 'parsha-named',
        parsha: parshaName,
        parshaHe: calendar?.parsha?.he || null,
        says: library.saidBy(byName.book) || null,
        why: `Mentions Parashas ${parshaName}.`,
      });
    }

    // And if none of that finds anything, nothing is shown.
    //
    // There used to be a featured lesson here, picked for the week out of the
    // whole shelf and having nothing to do with either the parsha or the
    // chag. It filled the card, which is not the same as belonging on it --
    // the one thing this card promises is that it is about this week.
    return unavailable('weekly Torah',
      new Error(`No Breslov lesson found for ${parshaName || 'this week'}`));
  } catch (err) {
    return unavailable('weekly Torah', err);
  }
}

/** A stable id for "which day is it", used for cache keys. */
function dayKey(date) {
  return dayNumber(date);
}

/**
 * Did Sefaria hand back the sefer we asked for, or a different one?
 *
 * Asking for "Likutei Amarim" returns the Tanya -- which is correct, that is
 * the Tanya's own name, but it was in the list as a possible spelling of the
 * Maggid of Mezritch's sefer. Something resolved, 124 pieces came back, and
 * the check passed: the Alter Rebbe's sefer would have appeared under the
 * Maggid's name on his yahrzeit.
 *
 * So a title is only accepted when Sefaria's own name for what came back is
 * the title we asked for. A spelling may differ; a sefer may not.
 */
function answersTo(shape, asked) {
  const nodes = Array.isArray(shape) ? shape : [shape];
  const plain = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const wanted = plain(asked);
  if (!wanted) return false;

  // What Sefaria calls each part of what it sent back. Some shapes carry a
  // title and some carry only a book name, and several carry neither.
  const names = nodes
    .map((node) => plain(node && (node.title || node.book)))
    .filter(Boolean);

  // Nothing to compare against. Sefaria answered to the title it was asked
  // for and said nothing to contradict it, so this is not evidence of a
  // different sefer -- and refusing here would have silently dropped the
  // passage from five of the eight, the Tanya among them, on the strength of
  // a missing field.
  if (!names.length) return true;

  // The asked-for name has to appear in what came back, or the other way
  // round. "Tanya" answers to "Tanya"; "Noam Elimelech, Bereshit" answers to
  // "Noam Elimelech"; "Tanya" never answers to "Likutei Amarim", which is
  // the whole reason this function exists.
  //
  // Anchored at the start once, which was too strict: a sefer filed with a
  // word in front of its name -- "Sefer Noam Elimelech", "Likutei Amarim
  // Tanya" -- failed. Containment keeps the substitution this guards against
  // out (neither name contains the other there) and lets a prefix in.
  if (names.some((got) => got.indexOf(wanted) >= 0 || wanted.indexOf(got) >= 0)) return true;

  // And then, only if that failed, the same comparison on consonants alone.
  //
  // Transliterating Hebrew has no right answer, and two spellings of one
  // sefer differ by a vowel or by which letter got the h. Noam Elimelech is
  // filed as Noam Elimelekh; the Chofetz Chaim as the Chafetz Chaim. Both
  // were refused their own Torah on their own yahrzeits, by one letter each.
  //
  // Vowels carry almost none of the meaning in a transliteration and almost
  // all of the disagreement, so they come out; ch, kh and h are one Hebrew
  // letter argued over, so they become one; so do tz and ts. What is left is
  // the skeleton of the name, and two different seforim do not share one.
  // Checked: Tanya is "tny" and Likutei Amarim is "lktmrm" -- the one
  // substitution this exists to stop still cannot get through.
  const bones = (text) => plain(text)
    .replace(/tz|ts/g, 'z')
    .replace(/kh|ch/g, 'h')
    .replace(/[aeiou]/g, '')
    // And a doubled letter is one letter. Sefaria files Likutei Etzot as
    // Likkutei Etzot; running the whole shelf through this found that one,
    // which the hand-written tests had not. It is not in the yahrzeit list
    // today, so nothing was broken by it -- yet.
    .replace(/(.)\1+/g, '$1');
  const skeleton = bones(asked);
  if (skeleton.length < 3) return false;
  return names.some((got) => {
    const other = bones(got);
    return other.length >= 3 &&
      (other.indexOf(skeleton) >= 0 || skeleton.indexOf(other) >= 0);
  });
}

/** What Sefaria calls the thing it sent back, for saying so in a diagnostic. */
function shapeNames(shape) {
  const nodes = Array.isArray(shape) ? shape : [shape];
  return nodes.map((node) => node && (node.title || node.book)).filter(Boolean);
}

/**
 * A passage from a tzaddik whose yahrzeit it is.
 *
 * Only from a sefer Sefaria actually carries. The title in the yahrzeit list
 * is a guess at how they file it, not a promise -- six Breslov works were once
 * added to this app that Sefaria does not have at all, which is why nothing
 * here trusts a title without asking. If the answer is no, the yahrzeit is
 * shown on its own. Nothing is ever put into a tzaddik's mouth.
 */
/**
 * A piece of a tzaddik's own sefer for his yahrzeit.
 *
 * `tried` is an optional array; every reference this reaches for is pushed
 * onto it with what came back. Nothing here reads it -- it exists so the
 * diagnostics can say WHICH reference came back empty instead of reporting
 * that a book "gave no passage", which is true and useless. That was the
 * whole difficulty with the two seforim this was written for.
 */
async function yahrzeitPassage(titles, date, tried) {
  const candidates = (Array.isArray(titles) ? titles : [titles])
    .filter((t, i, all) => t && all.indexOf(t) === i);
  const note = (ref, why) => { if (Array.isArray(tried)) tried.push({ ref, why }); };

  for (const title of candidates) {
    try {
      const shape = await sefaria.getShape(title);
      if (!answersTo(shape, title)) {
        // Say which sefer, not just that it was the wrong one. "A different
        // sefer answers to this name" is exactly as useful as silence when
        // the question is whether the guard or the title is at fault.
        var answers = shapeNames(shape);
        note(title, 'a different sefer answers to this name: Sefaria calls it ' +
          (answers.slice(0, 4).join(' / ') || 'nothing at all'));
        continue;
      }
      const refs = library.refsFromShape(shape, { title });
      if (!refs.length) { note(title, 'the shape described no pieces'); continue; }

      // The same piece all day, and a different one next year -- and, if that
      // piece turns out to be a heading with no text under it, or one Sefaria
      // holds only in Hebrew, the next few in the same rotation rather than
      // nothing at all.
      const got = await firstReadable(pickRunForDay(refs, date, 29, 8), note);
      if (got) {
        // An excerpt, not the whole piece.
        //
        // Keter Shem Tov resolves to two references -- its two parts -- so
        // "a passage" from it is an entire half of the sefer. A yahrzeit card
        // is not the place for that, whichever sefer it is, and the link goes
        // to the whole thing on Sefaria.
        const full = present(got.text, { book: title });
        return {
          available: true,
          ref: full.ref,
          heRef: full.heRef,
          url: full.url,
          he: full.snippetHe,
          en: full.snippetEn,
          translated: full.translated,
          credit: full.credit,
        };
      }
    } catch (err) {
      note(title, `shape lookup failed: ${err.message}`);
    }
  }
  return null;
}

/**
 * A short piece of Breslov Torah on a passage.
 *
 * The same link data the weekly lesson uses, pointed at a verse instead of a
 * parsha: Sefaria is asked what in Rebbe Nachman's and Reb Noson's seforim it
 * connects to this passage, and one of them is shown. It is a real
 * connection recorded by Sefaria, not a guess made here, and whoever actually
 * said it is named.
 *
 * Nothing is shown when nothing is linked. A guest with no dvar Torah under
 * him is better than one with a lesson that has nothing to do with him.
 */
async function dvarOnPassage(refs, date, salt) {
  const list = (Array.isArray(refs) ? refs : [refs]).filter(Boolean);
  for (const ref of list) {
    let linked = [];
    try {
      linked = await lessonsLinkedToParsha(ref);
    } catch (err) {
      continue;
    }
    if (!linked.length) continue;

    // The day's pick and the few behind it, so a dvar Torah that exists only
    // in Hebrew gives way to one that can also be said over in English.
    const order = pickRunForDay(linked.map((l) => l.ref), date, salt || 53, 5);
    const got = await firstReadable(order);
    if (!got) continue;
    const text = got.text;
    const meta = linked.find((l) => l.ref === got.ref);

    const full = present(text, {});
    return {
      available: true,
      ref: full.ref,
      heRef: full.heRef,
      url: full.url,
      // Shorter than the passage it is about. On a day the two orders differ
      // the card carries two guests, each with a passage and a word on it,
      // and four full excerpts is a page rather than something you say over.
      // The link is there for whoever wants the rest.
      he: snippet((text.hebrew || []).join(' '), 150),
      en: snippet((text.english || []).join(' '), 200),
      translated: full.translated,
      credit: full.credit,
      says: library.saidBy(meta && meta.title) || null,
      book: (meta && meta.title) || null,
      on: ref,
    };
  }
  return null;
}

/**
 * The Torah on an Ushpizin card.
 *
 * Unlike the yahrzeit passages, nothing is searched for and no shape is
 * asked about: these are named references, written down by hand, so the only
 * question is whether Sefaria hands back that exact passage. Two per guest,
 * so the same day of Sukkos is not the same page every year, and the second
 * is tried if the first comes back empty.
 */
async function ushpizinPassage(refs, date, tried) {
  const list = (Array.isArray(refs) ? refs : [refs]).filter(Boolean);
  const note = (ref, why) => { if (Array.isArray(tried)) tried.push({ ref, why }); };
  if (!list.length) return null;

  // Each reference, and then the chapter it sits in. A range is the part of
  // a reference most easily got wrong -- a verse that does not exist, a
  // chapter that ends sooner than I thought -- and the chapter on its own is
  // still the right passage about the right guest, only longer. The card
  // shows an excerpt either way.
  const chapterOf = (ref) => {
    const cut = ref.indexOf(':');
    return cut > 0 ? ref.slice(0, cut) : null;
  };
  const order = pickRunForDay(list, date, 41, list.length);
  const attempts = [];
  order.forEach((ref) => {
    attempts.push(ref);
    const chapter = chapterOf(ref);
    if (chapter && !list.includes(chapter)) attempts.push(chapter);
  });

  const got = await firstReadable(attempts, note);
  if (!got) return null;

  const full = present(got.text, {});
  return {
    available: true,
    ref: full.ref,
    heRef: full.heRef,
    url: full.url,
    he: full.snippetHe,
    en: full.snippetEn,
    translated: full.translated,
    credit: full.credit,
  };
}

module.exports = {
  yahrzeitPassage, ushpizinPassage, dvarOnPassage, answersTo, shapeNames,
  yomTovAhead, YOM_TOV, breslovAbout,
  dailySpark, dailyTehillim, tikkunHaklali, weeklyTorah,
  lessonsLinkedToParsha, present, unavailable, dayKey, hasEnglish, firstReadable,
};
