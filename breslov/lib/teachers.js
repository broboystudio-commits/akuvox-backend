'use strict';

/**
 * The approved teachers for Daily Inspiration, and nobody else.
 *
 * This list is closed. A teacher is added only when somebody decides to add
 * one -- not because a search turned up something good, not because a sefer
 * happens to be on Sefaria, and not because the rotation looked thin that
 * week. `APPROVED` below is the whole of it, and `rambam` is a fallback that
 * sits outside the list on purpose: it is reached when no approved teacher
 * has anything genuinely relevant, and never instead of one that does.
 *
 * Which of their seforim Sefaria actually carries is a separate question from
 * which teachers are approved, and it is asked rather than assumed. That
 * distinction has already cost this project twice: six Breslov works were
 * once listed that Sefaria does not have at all, and a check reported the
 * Satmar Rebbe as "found" because a shape lookup did not throw -- while the
 * answer was {"error":"No index or category found to match Divrei Yoel"}.
 * `availability()` asks, and /api/diagnostics prints what it was told.
 */

const sefaria = require('./sefaria');
const library = require('./library');

/**
 * Seven teachers.
 *
 * `titles` are what SEFARIA calls the sefer, which is not always what anyone
 * else calls it: it spells Likutei Etzot with two k's and the Chofetz Chaim
 * "Chafetz Chaim". Where the spelling is in doubt, more than one is listed
 * and the first that answers is used.
 *
 * `he` is the name as it would be said, not a transliteration of the English.
 */
const APPROVED = [
  {
    id: 'nachman',
    name: 'Rebbe Nachman of Breslov',
    short: 'Rebbe Nachman',
    he: 'רַבִּי נַחְמָן מִבְּרֶסְלֶב',
    years: '1772–1810',
    // Already on the shelf in lib/library.js, which resolves them at startup.
    titles: ['Likutei Moharan', 'Likutei Moharan, Part II', 'Sichot HaRan',
             'Sefer HaMiddot', 'Likkutei Etzot', 'Sippurei Maasiyot'],
    aliases: { 'Likkutei Etzot': ['Likutei Etzot'] },
  },
  {
    id: 'noson',
    name: 'Reb Noson of Breslov',
    short: 'Reb Noson',
    he: 'רַבִּי נָתָן מִבְּרֶסְלֶב',
    years: '1780–1844',
    titles: ['Likutei Halakhot', 'Likutei Tefilot', 'Chayei Moharan', 'Shivchei HaRan'],
    aliases: { 'Likutei Halakhot': ['Likutei Halachot'] },
  },
  {
    id: 'ari',
    name: 'The Arizal',
    short: 'The Arizal',
    he: 'הָאֲרִ״י הַקָּדוֹשׁ',
    years: '1534–1572',
    // Almost everything under the Ari's name was written down by Rabbi Chaim
    // Vital. The two are kept apart below on the grounds of whose Torah it is
    // rather than whose hand wrote it, which is how they are spoken of.
    titles: ['Etz Chaim', 'Pri Etz Chaim', 'Shaar HaGilgulim', 'Likutei Torah'],
    aliases: { 'Shaar HaGilgulim': ["Sha'ar HaGilgulim"] },
  },
  {
    id: 'chaim-vital',
    name: 'Rabbi Chaim Vital',
    short: 'Rabbi Chaim Vital',
    he: 'רַבִּי חַיִּים וִיטָאל',
    years: '1542–1620',
    titles: ['Shaarei Kedusha', 'Sefer HaChezyonot'],
    aliases: { 'Shaarei Kedusha': ["Sha'arei Kedusha"] },
  },
  {
    id: 'besht',
    name: 'The Baal Shem Tov',
    short: 'The Baal Shem Tov',
    he: 'הַבַּעַל שֵׁם טוֹב',
    years: '1698–1760',
    // The Baal Shem Tov wrote nothing. These are his talmidim's records of
    // what he said, which is why anything from them is presented as "based
    // on" rather than as his own words -- see `quoting` below.
    titles: ['Keter Shem Tov', 'Tzavaat HaRivash', 'Baal Shem Tov Al HaTorah'],
    aliases: { 'Tzavaat HaRivash': ["Tzava'at HaRivash", 'Tzavaas HaRivash'] },
    recorded: true,
  },
  {
    id: 'maggid',
    name: 'The Maggid of Mezritch',
    short: 'The Maggid of Mezritch',
    he: 'הַמַּגִּיד מִמֶּזְרִיטְשׁ',
    years: '1704–1772',
    // Sefaria spells it with a SMALL l -- "leYaakov". This was written down
    // in yahrzeits.js, with a comment saying it had been guessed wrong twice
    // and was finally read off Sefaria's own catalogue -- and then it was
    // guessed a fourth time here, with a capital L, and the Maggid quietly
    // contributed nothing to the נקודה from the day he was added. Nothing
    // threw and nothing looked wrong: availability() faithfully reported "no
    // pieces", which is exactly what it is for, and "no pieces" reads the
    // same whether a sefer is not digitised or merely misspelt. The live
    // server's own diagnostics showed the same sefer answering with 134
    // pieces two sections further down the page, under the yahrzeit code
    // that spells it correctly.
    titles: ['Maggid Devarav leYaakov', 'Maggid Devarav LeYaakov', 'Or Torah'],
    recorded: true,
  },
  {
    id: 'satmar',
    name: 'Rabbi Yoel Teitelbaum',
    short: 'The Satmar Rav',
    he: 'רַבִּי יוֹאֵל טַייטֶלְבּוֹים',
    years: '1887–1979',
    titles: ['Divrei Yoel', 'Vayoel Moshe'],
    // Asked and answered, in this project, in writing: Sefaria does not carry
    // either. He stays on the approved list because the list is about who may
    // be quoted, not about who happens to be digitised -- and the day one of
    // these seforim arrives, nothing here has to change. Until then he
    // contributes nothing and the app says so rather than quoting him from
    // memory.
    expectMissing: true,
  },
];

/**
 * The classical fallback, and the only one.
 *
 * Rambam is reached when no approved teacher has anything genuinely relevant
 * to the day. He is not in APPROVED because he is not in the rotation: he
 * does not take a turn, he fills a gap.
 */
const FALLBACK = {
  id: 'rambam',
  name: 'The Rambam',
  short: 'The Rambam',
  he: 'הָרַמְבַּ״ם',
  years: '1138–1204',
  titles: ['Mishneh Torah, Repentance', 'Mishneh Torah, Human Dispositions',
           'Mishneh Torah, Foundations of the Torah', 'Shemonah Perakim',
           'Guide for the Perplexed'],
  classical: true,
};

const BY_ID = new Map(APPROVED.concat([FALLBACK]).map((t) => [t.id, t]));

/** Every title an approved teacher might be filed under, spelling variants included. */
function titlesOf(teacher) {
  const out = [];
  for (const title of teacher.titles || []) {
    out.push(title);
    for (const alias of (teacher.aliases && teacher.aliases[title]) || []) out.push(alias);
  }
  return out;
}

/** Who said this, given a reference like "Keter Shem Tov 84:2". */
function teacherOfRef(ref) {
  if (!ref) return null;
  const front = String(ref);
  for (const teacher of APPROVED.concat([FALLBACK])) {
    for (const title of titlesOf(teacher)) {
      if (library.refStartsWith(front, title)) return teacher;
    }
  }
  return null;
}

/**
 * How a piece from this teacher may be presented.
 *
 * The Baal Shem Tov and the Maggid wrote nothing down; what exists is their
 * talmidim's record of what they said. Printing that as a quotation puts
 * words in their mouths that nobody can show they used, so it is given as
 * "Based on", and the sefer is named either way.
 *
 * Everyone else wrote, or dictated, the sefer the words come from, so a
 * passage from it is a quotation and is presented as one.
 */
function quoting(teacher) {
  if (!teacher) return 'paraphrase';
  return teacher.recorded ? 'based-on' : 'quotation';
}

/** The line under a teaching: "Likutei Moharan · Torah 24". */
function reference(ref, teacher) {
  if (!ref) return null;
  const title = (teacher ? titlesOf(teacher) : [])
    .filter((t) => library.refStartsWith(ref, t))
    .sort((a, b) => b.length - a.length)[0];
  if (!title) return { sefer: null, place: String(ref), full: String(ref) };
  const place = String(ref).slice(title.length).replace(/^[,\s]+/, '');
  return { sefer: title, place: place || null, full: String(ref) };
}

/**
 * Which seforim Sefaria actually has, asked once and remembered.
 *
 * Not cached for a time: cached for the life of the process, because a
 * library's catalogue does not change while a server is running, and asking
 * Sefaria eleven times on every request would be rude as well as slow.
 */
let known = null;

async function availability({ refresh = false } = {}) {
  if (known && !refresh) return known;

  const out = [];
  for (const teacher of APPROVED.concat([FALLBACK])) {
    const seforim = [];
    for (const title of titlesOf(teacher)) {
      let has = false;
      let pieces = 0;
      let why = '';
      try {
        const shape = await sefaria.getShape(title);
        const refs = library.refsFromShape(shape, { title });
        pieces = refs.length;
        // A shape lookup that does not throw is not an answer. Sefaria
        // returns a perfectly well-formed nothing for a sefer it has never
        // heard of, and reading that as "found" is how the Satmar Rebbe was
        // once reported as present.
        has = pieces > 0;
        if (!has) why = 'the shape described no pieces';
      } catch (err) {
        why = err.message;
      }
      seforim.push({ title, has, pieces, why: has ? '' : why });
      // The first spelling that answers is the one used; the rest are only
      // there in case it does not.
      if (has) break;
    }
    out.push({
      id: teacher.id,
      name: teacher.name,
      expectMissing: !!teacher.expectMissing,
      // Whether this row is one of the seven or the Rambam. The diagnostics
      // counted the whole shelf and reported "6 of 8 carried", which reads as
      // though the approved pool were eight -- the one thing this module's
      // first paragraph says it is not. He is reported, and reported apart.
      fallback: teacher.id === FALLBACK.id,
      seforim,
      available: seforim.filter((s) => s.has).map((s) => s.title),
    });
  }

  known = out;
  return out;
}

/** The titles of one teacher that Sefaria answered for. */
async function readableTitles(teacher) {
  const all = await availability();
  const row = all.find((r) => r.id === teacher.id);
  return row ? row.available : [];
}

function forget() { known = null; }

module.exports = {
  APPROVED, FALLBACK, BY_ID,
  titlesOf, teacherOfRef, quoting, reference,
  availability, readableTitles, forget,
};
