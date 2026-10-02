'use strict';

/**
 * Today's נקודה: one teaching, chosen because it belongs to today.
 *
 * The order is relevance first and everything else afterwards:
 *
 *   1. Work out what today actually is -- yom tov, a fast, Rosh Chodesh, a
 *      special Shabbos, the parsha, or an ordinary Tuesday.
 *   2. Ask the approved teachers for Torah about it.
 *   3. Among what comes back, prefer the teacher who has been waiting longest
 *      -- but only among pieces that are equally relevant. A better teaching
 *      from a teacher who appeared last week beats a weaker one from a
 *      teacher who has not appeared since Pesach. Rotation is a tiebreak, not
 *      a quota.
 *   4. Skip anything shown recently.
 *   5. If no approved teacher has anything that genuinely fits, the Rambam.
 *   6. If he does not either, the day's own theme from the Breslov shelf.
 *   7. And only then a general teaching.
 *
 * Nothing is ever shown merely to fill the screen. Step 7 returning nothing
 * is a real answer, and the page says so plainly rather than printing
 * something that has nothing to do with today.
 */

const sefaria = require('./sefaria');
const library = require('./library');
const teachers = require('./teachers');
const history = require('./history');
const daily = require('./daily');
const { pickForDay, snippet } = require('./util');

/** Nothing shown twice inside this many days, teacher or teaching. */
const REPEAT_WINDOW = 180;

/** How many days a teacher has to wait before the rotation starts nudging. */
const ROTATION_FULL_CREDIT = 21;

// ─────────────────────────────────────────────────────── what today is

/**
 * Days that carry their own Torah, with what to look for them under.
 *
 * `is` matches what hebcal calls the day, which is the only name the app
 * actually sees. `terms` are Hebrew because the seforim are: searching
 * Sefaria for "Rosh Hashanah" finds English translations and commentary,
 * searching for ראש השנה finds the Torah.
 *
 * `weight` is how strongly the day claims the נקודה. A yom tov takes it; a
 * Rosh Chodesh only takes it if something genuinely good turns up.
 */
const OCCASIONS = [
  { key: 'rosh-hashanah', is: /Rosh Hashana/i,          en: 'Rosh Hashanah',   he: 'רֹאשׁ הַשָּׁנָה',    terms: ['ראש השנה', 'מלכויות', 'תקיעת שופר'], weight: 10 },
  { key: 'yom-kippur',    is: /Yom Kippur/i,            en: 'Yom Kippur',      he: 'יוֹם כִּפּוּר',      terms: ['יום הכפורים', 'תשובה', 'וידוי'],     weight: 10 },
  { key: 'sukkos',        is: /Sukkot|Sukkos/i,         en: 'Sukkos',          he: 'סֻכּוֹת',           terms: ['סוכות', 'סוכה', 'ארבעה מינים'],      weight: 10 },
  { key: 'shmini',        is: /Shmini Atzeret/i,        en: 'Shmini Atzeres',  he: 'שְׁמִינִי עֲצֶרֶת',  terms: ['שמיני עצרת', 'גשם'],                weight: 10 },
  { key: 'simchas-torah', is: /Simchat Torah/i,         en: 'Simchas Torah',   he: 'שִׂמְחַת תּוֹרָה',    terms: ['שמחת תורה', 'הקפות', 'שמחה של תורה'], weight: 10 },
  { key: 'chanukah',      is: /Chanukah/i,              en: 'Chanukah',        he: 'חֲנֻכָּה',          terms: ['חנוכה', 'נר חנוכה', 'הלל והודאה'],   weight: 10 },
  { key: 'tu-bishvat',    is: /Tu BiShvat|Tu B'Shvat/i, en: 'Tu BiShvat',      he: 'ט״וּ בִּשְׁבָט',      terms: ['ט"ו בשבט', 'אילן'],                 weight: 6 },
  { key: 'purim',         is: /^Purim|Shushan Purim/i,  en: 'Purim',           he: 'פּוּרִים',          terms: ['פורים', 'מגילת אסתר', 'משתה ושמחה'], weight: 10 },
  { key: 'pesach',        is: /Pesach|Passover/i,       en: 'Pesach',          he: 'פֶּסַח',            terms: ['פסח', 'יציאת מצרים', 'חירות'],       weight: 10 },
  { key: 'sefirah',       is: /Omer/i,                  en: 'Sefiras HaOmer',  he: 'סְפִירַת הָעֹמֶר',   terms: ['ספירת העומר', 'עומר'],              weight: 4 },
  { key: 'lag-baomer',    is: /Lag BaOmer|Lag B'Omer/i, en: 'Lag BaOmer',      he: 'ל״ג בָּעֹמֶר',       terms: ['ל"ג בעומר', 'רבי שמעון בר יוחאי'],   weight: 8 },
  { key: 'shavuos',       is: /Shavuot|Shavuos/i,       en: 'Shavuos',         he: 'שָׁבוּעוֹת',         terms: ['שבועות', 'מתן תורה', 'קבלת התורה'],  weight: 10 },
  { key: 'tisha-bav',     is: /Tish'a B'Av|Tisha B'Av/i, en: "Tisha B'Av",     he: 'תִּשְׁעָה בְּאָב',    terms: ['תשעה באב', 'חורבן', 'גלות'],         weight: 10 },
  { key: 'taanis-esther', is: /Ta'anit Esther|Taanit Esther/i, en: 'Taanis Esther', he: 'תַּעֲנִית אֶסְתֵּר', terms: ['תענית אסתר', 'תענית', 'תשובה'], weight: 8 },
  { key: 'fast',          is: /Fast of|Tzom|Ta'anit|Taanit/i, en: 'a fast day', he: 'תַּעֲנִית',        terms: ['תענית', 'תשובה'],                   weight: 7 },
  { key: 'rosh-chodesh',  is: /Rosh Chodesh/i,          en: 'Rosh Chodesh',    he: 'רֹאשׁ חֹדֶשׁ',       terms: ['ראש חודש', 'חידוש הלבנה'],          weight: 5 },
  // The special Shabbosos. Each claims the day only if there is real Torah
  // for it; otherwise the parsha has it, which is what `weight` decides.
  { key: 'shekalim',  is: /Shabbat Shekalim/i,  en: 'Shabbos Shekalim',  he: 'שַׁבָּת שְׁקָלִים',  terms: ['פרשת שקלים', 'מחצית השקל'], weight: 6 },
  { key: 'zachor',    is: /Shabbat Zachor/i,    en: 'Shabbos Zachor',    he: 'שַׁבָּת זָכוֹר',    terms: ['פרשת זכור', 'עמלק'],         weight: 7 },
  { key: 'parah',     is: /Shabbat Parah/i,     en: 'Shabbos Parah',     he: 'שַׁבָּת פָּרָה',     terms: ['פרה אדומה', 'טהרה'],         weight: 6 },
  { key: 'hachodesh', is: /Shabbat HaChodesh/i, en: 'Shabbos HaChodesh', he: 'שַׁבָּת הַחֹדֶשׁ',   terms: ['החודש הזה לכם', 'ניסן'],     weight: 6 },
  { key: 'hagadol',   is: /Shabbat HaGadol/i,   en: 'Shabbos HaGadol',   he: 'שַׁבָּת הַגָּדוֹל',   terms: ['שבת הגדול', 'גאולה'],        weight: 7 },
  { key: 'shira',     is: /Shabbat Shirah/i,    en: 'Shabbos Shira',     he: 'שַׁבָּת שִׁירָה',    terms: ['שירת הים', 'אז ישיר'],       weight: 6 },
  { key: 'shuva',     is: /Shabbat Shuva/i,     en: 'Shabbos Shuva',     he: 'שַׁבָּת שׁוּבָה',    terms: ['שבת שובה', 'תשובה'],         weight: 7 },
  { key: 'nachamu',   is: /Shabbat Nachamu/i,   en: 'Shabbos Nachamu',   he: 'שַׁבָּת נַחֲמוּ',    terms: ['נחמו נחמו עמי', 'נחמה'],     weight: 6 },
  { key: 'chazon',    is: /Shabbat Chazon/i,    en: 'Shabbos Chazon',    he: 'שַׁבָּת חֲזוֹן',     terms: ['שבת חזון', 'חורבן'],         weight: 6 },
  { key: 'asara',     is: /Asara B'Tevet/i,     en: "Asara B'Teves",     he: 'עֲשָׂרָה בְּטֵבֵת',   terms: ['עשרה בטבת', 'תענית'],        weight: 7 },
  { key: 'tu-bav',    is: /Tu B'Av/i,           en: "Tu B'Av",           he: 'ט״וּ בְּאָב',        terms: ['ט"ו באב', 'אהבה'],           weight: 5 },
  { key: 'selichos',  is: /Leil Selichot|Selichot/i, en: 'Selichos',     he: 'סְלִיחוֹת',         terms: ['סליחות', 'תשובה', 'אלול'],   weight: 6 },
];

/**
 * What is deliberately not in that list.
 *
 * Sweeping a full year of hebcal's day names past these patterns leaves
 * twelve unmatched, and most of them are left unmatched on purpose rather
 * than by oversight -- which is worth writing down, because an unmatched day
 * looks identical to a forgotten one:
 *
 *   Yom HaShoah, Yom HaZikaron, Yom HaAtzma'ut, Yom Yerushalayim, Yom
 *   HaAliyah, Sigd. Every approved teacher but one lived and died before the
 *   State; the Satmar Rav wrote at length about it and is not on Sefaria.
 *   There is no approved Torah to show for these days, and the rule is that a
 *   date only takes the נקודה when there is genuinely relevant Torah for it.
 *   So they fall through to the parsha, which is the honest answer.
 *
 *   Erev Purim and Chag HaBanot. Erev Purim is already covered -- by Taanis
 *   Esther, which falls on the same day, and by the erev rule below.
 *
 * The check in scripts/selftest.js sweeps the year and insists that every
 * FAST and every MAJOR yom tov is matched, so the four above cannot be lost
 * again without something going red.
 */

/**
 * What kind of day this is, in the order the day itself would be described.
 *
 * Returns the strongest claim only. A Rosh Chodesh that falls on Chanukah is
 * Chanukah; the app does not try to be about both at once, because a teaching
 * about two things is usually about neither.
 */
/**
 * The name hebcal gives a day, with its typography taken off.
 *
 * hebcal renders a right single quotation mark, U+2019, where a keyboard
 * would type an apostrophe: "Tish’a B’Av", "Ta’anit Esther". Every pattern
 * above was written with a typed apostrophe, so none of them matched, and
 * every fast day in the year -- Tisha B'Av included -- was quietly reported
 * as an ordinary day of its parsha. Nothing failed; the app was simply never
 * told. Matching on a rendered string without normalising it is the same
 * mistake this project has now made with a book field, a CSS text-transform
 * and a composited colour.
 */
function plain(text) {
  return String(text || '')
    .replace(/[\u2018\u2019\u02bc\u0060\u00b4]/g, "'")
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function contextFor(calendar) {
  const named = [];
  const add = (holiday, when) => {
    const text = plain(holiday.en);
    const match = OCCASIONS.find((o) => o.is.test(text));
    if (!match || named.some((n) => n.key === match.key)) return;
    named.push(Object.assign({}, match, { on: holiday.date || null, said: text, when }));
  };

  // TODAY first, and today is nearly all of it.
  //
  // The first version of this read `calendar.holidays`, which is a window
  // reaching nine days forward because the weekly card needs it to. The
  // effect was that an ordinary Tuesday in Adar announced itself as Purim --
  // the נקודה was about a yom tov a week and a half away, every day, for a
  // week and a half. Today's teaching is about today.
  for (const holiday of (calendar && calendar.today) || []) add(holiday, 'today');

  // And tonight, because a yom tov begins in the evening and the day before
  // one is genuinely about it. Only the days that carry real weight: nobody
  // needs Tu BiShvat Torah the afternoon before.
  if (!named.length) {
    const tomorrow = new Date(Date.parse(
      (calendar && calendar.gregorian && calendar.gregorian.iso) || '') + 86400000);
    const tomorrowIso = Number.isNaN(tomorrow.getTime())
      ? null : tomorrow.toISOString().slice(0, 10);
    for (const holiday of (calendar && calendar.holidays) || []) {
      if (!tomorrowIso || holiday.date !== tomorrowIso) continue;
      const match = OCCASIONS.find((o) => o.is.test(plain(holiday.en)));
      if (match && match.weight >= 8) add(holiday, 'tonight');
    }
  }

  named.sort((a, b) => b.weight - a.weight);

  const parsha = calendar && calendar.parsha ? calendar.parsha : null;
  const top = named[0] || null;

  return {
    kind: top ? (top.weight >= 8 ? 'yomtov' : 'occasion') : (parsha ? 'parsha' : 'ordinary'),
    occasion: top,
    all: named,
    parsha,
    // What to search for, strongest first, with the parsha behind it so an
    // ordinary week still has something to be about.
    terms: (top ? top.terms : []).concat(parsha ? [parsha.he || parsha.en] : []),
    // What to call the day on screen.
    label: top
      ? (top.when === 'tonight' ? `Erev ${top.en}` : top.en)
      : (parsha ? `Parashas ${parsha.en}` : null),
    labelHe: top ? top.he : (parsha ? parsha.he : null),
  };
}

// ─────────────────────────────────────────────────── finding the Torah

/** Does this reference belong to one of these titles? */
function belongsTo(ref, titles) {
  return titles.some((t) => library.refStartsWith(ref, t));
}

/**
 * Ask Sefaria for one term and keep only what the given titles answer for.
 *
 * By the front of the reference and never by a `book` field: Sefaria's search
 * does not reliably set one, and trusting it is what once made a count of
 * Rebbe Nachman's lessons come out as zero.
 */
async function hitsFor(term, titles, size = 120) {
  let found;
  try {
    found = await sefaria.search(term, { size });
  } catch (err) {
    return { refs: [], total: 0, why: `search failed: ${err.message}` };
  }
  const all = found.hits || [];
  const refs = [...new Set(all.map((h) => h.ref).filter((r) => r && belongsTo(r, titles)))];
  return { refs, total: all.length, why: '' };
}

/**
 * How strongly a teacher speaks to today.
 *
 * Deliberately crude, and crude in a direction: it counts how much of what
 * the search returned was this teacher's, which is a poor measure of depth
 * and a fair measure of whether they wrote about the subject at all. The
 * refinement that matters is not a better number but the floor below it --
 * `MIN_RELEVANT` -- under which the answer is "no", and the chooser moves on
 * to the Rambam rather than printing the best of a bad set.
 */
const MIN_RELEVANT = 1;

function relevance(refs, total) {
  if (!refs.length) return 0;
  // Three of the first hundred is a real presence; forty is not four times
  // better, so it flattens off.
  return Math.min(10, Math.round(Math.sqrt(refs.length) * 2.2));
}

/** Days since this teacher last had the נקודה; never-used is most overdue. */
function overdue(teacherId, lastSeen) {
  const ago = lastSeen.get(teacherId);
  if (ago === undefined) return ROTATION_FULL_CREDIT;
  return Math.min(ROTATION_FULL_CREDIT, ago);
}

// ──────────────────────────────────────────────────────── the choosing

/**
 * One day's נקודה.
 *
 * `tried` collects what was looked at and why it was or was not taken, so
 * /api/diagnostics can show the working. From this sandbox Sefaria cannot be
 * reached, and that trail is the only way to see whether the chooser is
 * behaving on the real server.
 */
async function chooseFor(date, calendar, tried) {
  const note = (stage, detail) => { if (Array.isArray(tried)) tried.push({ stage, detail }); };
  const dateIso = date.toISOString().slice(0, 10);
  const context = contextFor(calendar);

  // Already settled today? Then that is the answer, whatever a search would
  // say now. Two people opening the app an hour apart get the same נקודה, and
  // so does the same person twice.
  const already = history.chosenOn(dateIso, 'inspiration');
  if (already && already.exactReference) {
    try {
      const text = await sefaria.getText(already.exactReference);
      if (text && (text.hebrew || []).length) {
        note('kept', `today was already set to ${already.exactReference}`);
        return dress(text, teachers.BY_ID.get(already.teacher) || null, context, dateIso, already.route);
      }
    } catch (err) {
      note('kept', `today's piece would not reload (${err.message}), choosing again`);
    }
  }

  const lastSeen = history.lastUsed('inspiration', REPEAT_WINDOW);

  // ---- 1 & 2 & 3: the approved teachers, on today's subject
  if (context.terms.length) {
    const runners = [];
    for (const teacher of teachers.APPROVED) {
      const titles = await teachers.readableTitles(teacher);
      if (!titles.length) {
        note('teacher', `${teacher.short}: nothing of his is on Sefaria`);
        continue;
      }
      let best = null;
      for (const term of context.terms) {
        const { refs, total, why } = await hitsFor(term, titles);
        if (why) { note('search', `${teacher.short} / ${term}: ${why}`); continue; }
        const score = relevance(refs, total);
        if (score >= MIN_RELEVANT && (!best || score > best.score)) {
          best = { score, refs, term, total };
        }
      }
      if (!best) { note('teacher', `${teacher.short}: nothing on ${context.label || 'today'}`); continue; }
      runners.push({
        teacher,
        score: best.score,
        refs: best.refs,
        term: best.term,
        // The nudge, and it is a nudge: three weeks of waiting is worth less
        // than one step of relevance, which is ten times bigger.
        waited: overdue(teacher.id, lastSeen),
      });
    }

    runners.sort((a, b) => (b.score - a.score) || (b.waited - a.waited));
    for (const runner of runners) {
      const fresh = runner.refs.filter((r) => !history.seen('inspiration', r, REPEAT_WINDOW));
      const order = fresh.length ? fresh : [];
      if (!order.length) {
        note('teacher', `${runner.teacher.short}: every match has been shown lately`);
        continue;
      }
      const start = pickForDay(order, date, 101);
      const rotated = order.slice(order.indexOf(start)).concat(order.slice(0, order.indexOf(start)));
      const got = await daily.firstReadable(rotated.slice(0, 5));
      if (!got) { note('teacher', `${runner.teacher.short}: nothing loaded`); continue; }
      note('chose', `${runner.teacher.short} on "${runner.term}" (${runner.score}/10, ` +
        `waited ${runner.waited}d): ${got.ref}`);
      return dress(got.text, runner.teacher, context, dateIso, 'approved');
    }
  }

  // ---- 5: the Rambam
  {
    const titles = await teachers.readableTitles(teachers.FALLBACK);
    if (titles.length && context.terms.length) {
      for (const term of context.terms) {
        const { refs } = await hitsFor(term, titles);
        const fresh = refs.filter((r) => !history.seen('inspiration', r, REPEAT_WINDOW));
        if (!fresh.length) continue;
        const got = await daily.firstReadable(fresh.slice(0, 5));
        if (got) {
          note('chose', `the Rambam on "${term}": ${got.ref}`);
          return dress(got.text, teachers.FALLBACK, context, dateIso, 'rambam');
        }
      }
      note('rambam', `nothing of the Rambam's on ${context.label || 'today'}`);
    } else if (!titles.length) {
      note('rambam', 'nothing of the Rambam is on Sefaria');
    }
  }

  // ---- 6: the day's own theme, from the Breslov shelf
  //
  // This is the search the weekly card already uses, pointed at today instead
  // of at the week. It reaches further than the approved-teacher pass because
  // it does not insist on one teacher having written about the subject -- it
  // takes whatever on the shelf is about it.
  if (context.terms.length) {
    const about = await daily.breslovAbout(context.terms, date, 137);
    if (about && about.text) {
      const who = teachers.teacherOfRef(about.text.ref);
      note('chose', `the shelf on "${about.word}": ${about.text.ref}`);
      return dress(about.text, who, context, dateIso, 'theme');
    }
    note('theme', `the shelf had nothing on ${context.label || 'today'}`);
  }

  // ---- 7: a general teaching, and only now
  const general = await daily.dailySpark(date);
  if (general && general.available) {
    const who = teachers.teacherOfRef(general.ref);
    note('chose', `a general teaching: ${general.ref}`);
    return dress({
      ref: general.ref, heRef: general.heRef, url: general.url,
      hebrew: general.hebrew, english: general.english,
      hebrewVersion: general.credit && general.credit.hebrew,
      englishVersion: general.credit && general.credit.english,
      license: general.credit && general.credit.license,
    }, who, context, dateIso, 'general');
  }

  note('nothing', 'no teaching could be loaded at all');
  return {
    available: false,
    what: 'today\'s teaching',
    reason: 'No teaching could be reached just now',
    context: publicContext(context),
  };
}

/** Only the parts of the context the page is allowed to see. */
function publicContext(context) {
  return {
    kind: context.kind,
    label: context.label,
    labelHe: context.labelHe,
    parsha: context.parsha ? { en: context.parsha.en, he: context.parsha.he } : null,
  };
}

/**
 * Wrap a loaded text as the shape the page and the widgets read.
 *
 * `route` says which step of the ladder produced it. It is reported in
 * diagnostics and never shown on the page: a reader does not need to know
 * that the Rambam is a fallback, only that this is today's Torah and where
 * it is from.
 */
function dress(text, teacher, context, dateIso, route) {
  const full = daily.present(text, {});
  const where = teachers.reference(full.ref, teacher);
  return {
    available: true,
    contentType: 'inspiration',
    contentId: history.idFor('inspiration', full.ref),

    ref: full.ref,
    heRef: full.heRef,
    url: full.url,
    hebrew: full.hebrew,
    english: full.english,
    translated: full.translated,
    snippetHe: full.snippetHe,
    snippetEn: full.snippetEn,
    credit: full.credit,

    teacher: teacher ? {
      id: teacher.id, name: teacher.name, short: teacher.short,
      he: teacher.he, years: teacher.years,
    } : null,
    // "Likutei Moharan · Torah 24"
    source: where ? { sefer: where.sefer, place: where.place, full: where.full } : null,
    // A quotation is presented as one; a talmid's record of what a rebbe said
    // is presented as "Based on".
    quoting: teachers.quoting(teacher),

    context: publicContext(context),
    route,
    dateShown: dateIso,
  };
}

/**
 * The day's נקודה, chosen once and written down.
 *
 * The write is what makes it the day's: the next request finds the record and
 * returns the same piece without searching again.
 */
async function forDay(date, calendar, tried) {
  const chosen = await chooseFor(date, calendar, tried);
  if (!chosen.available) return chosen;

  history.record({
    contentId: chosen.contentId,
    contentType: 'inspiration',
    text: { he: chosen.snippetHe, en: chosen.snippetEn },
    language: 'he',
    teacher: chosen.teacher ? chosen.teacher.id : null,
    source: chosen.source ? chosen.source.sefer : null,
    exactReference: chosen.ref,
    dateShown: chosen.dateShown,
    calendarContext: chosen.context.label || 'ordinary day',
    quoting: chosen.quoting,
    route: chosen.route,
  });

  return chosen;
}

module.exports = {
  forDay, chooseFor, contextFor, OCCASIONS, plain,
  REPEAT_WINDOW, MIN_RELEVANT,
};
