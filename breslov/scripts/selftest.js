'use strict';

/**
 * A quick "is everything working?" check.
 * Run it with:  npm run check
 *
 * The calendar and zmanim are worked out on this machine, so they should
 * always pass. The texts need the internet, so that part tells you whether
 * this server can reach Sefaria.
 */

const dates = require('../lib/dates');
const zmanim = require('../lib/zmanim');
const library = require('../lib/library');
const ushpizin = require('../lib/ushpizin');
const daily = require('../lib/daily');
const inspiration = require('../lib/inspiration');
const teachers = require('../lib/teachers');
const { dateFromIso, pickForDay, pickRunForDay } = require('../lib/util');
const sefaria = require('../lib/sefaria');

let failures = 0;

function check(label, condition, detail) {
  const mark = condition ? 'ok  ' : 'FAIL';
  if (!condition) failures++;
  console.log(`  [${mark}] ${label}${detail ? '  — ' + detail : ''}`);
}

async function main() {
  const place = dates.normalisePlace({});
  const today = new Date();

  console.log('\nCalendar (no internet needed)');
  const calendar = dates.calendarFor(today, place);
  check('Hebrew date', !!calendar.hebrew.gematriya, calendar.hebrew.gematriya);
  check('Gregorian date', !!calendar.gregorian.display, calendar.gregorian.display);
  check('Parsha of the week', !!calendar.parsha,
    calendar.parsha ? calendar.parsha.en : 'none found');
  check('Candle lighting', !!calendar.candles,
    calendar.candles ? calendar.candles.en : 'none in range');

  // The Omer and the fast times. Both are facts about a day that the app
  // shows and nothing else on the screen says, and both arrive from hebcal
  // categories that have to be asked for by name -- the Omer is not counted
  // unless `omer: true`, and the fast times come in as `zmanim+fast`, which
  // the occasion filter deliberately throws away. Either is silently absent
  // if the asking is dropped, and nothing else would notice.
  {
    const noon = (y, m, d) => new Date(y, m, d, 12, 0, 0);
    const omerDay = dates.calendarFor(noon(2026, 3, 20), place);
    check('The Omer is counted', !!omerDay.omer && omerDay.omer.day === 18,
      omerDay.omer ? `${omerDay.omer.day} — ${omerDay.omer.en}` : 'not counted');
    check('And broken into weeks and days',
      !!omerDay.omer && omerDay.omer.weeks === 2 && omerDay.omer.days === 4,
      omerDay.omer ? `${omerDay.omer.weeks}w ${omerDay.omer.days}d` : '-');

    const plainDay = dates.calendarFor(noon(2026, 0, 1), place);
    check('And only when it is being counted', plainDay.omer === null,
      plainDay.omer ? 'counted on a day in Teves' : 'nothing in Teves');

    const fastDay = dates.calendarFor(noon(2026, 6, 2), place);
    check('A fast says when it begins and ends',
      !!fastDay.fast && !!fastDay.fast.begins && !!fastDay.fast.ends,
      fastDay.fast ? `${fastDay.fast.begins} to ${fastDay.fast.ends}` : 'no times');
    check('And an ordinary day has no fast times', plainDay.fast === null,
      plainDay.fast ? 'times on a day with no fast' : 'none');
  }

  console.log('\nZmanim (no internet needed)');
  const z = zmanim.zmanimFor(today, place);
  check('All times calculated', z.times.length >= 12, `${z.times.length} times`);
  check('Times are in order',
    z.times.every((t, i) => i === 0 || new Date(z.times[i - 1].iso) <= new Date(t.iso)));
  check('Sunrise before sunset',
    new Date(z.times.find((t) => t.key === 'sunrise').iso) <
    new Date(z.times.find((t) => t.key === 'sunset').iso));

  console.log('\nTehillim division (no internet needed)');
  const covered = new Set();
  for (let d = 1; d <= 30; d++) {
    const p = library.TEHILLIM_BY_DAY[d];
    for (let n = p.from; n <= p.to; n++) covered.add(n);
  }
  check('All 150 chapters covered', covered.size === 150, `${covered.size} chapters`);
  check('Tikkun HaKlali has ten psalms', library.TIKKUN_HAKLALI.length === 10,
    library.TIKKUN_HAKLALI.join(', '));

  console.log('\nYahrzeits');

  // Every entry has to land on exactly one day of the year. A month spelled
  // the way hebcal does not spell it -- "Shevat" for "Sh'vat", "Tevet" for
  // "Teves" -- fails no test on its own: it simply never matches, and the
  // yahrzeit silently never appears. So the year is walked day by day and
  // every name must be found.
  const yahrzeits = require('../lib/yahrzeits');
  const { HDate } = require('@hebcal/core');

  for (const year of [5787, 5788]) {
    const found = new Map();
    const start = new HDate(1, 7, year).abs();
    const end = new HDate(1, 7, year + 1).abs();
    for (let abs = start; abs < end; abs++) {
      const hd = new HDate(abs);
      const on = yahrzeits.yahrzeitsOn({ day: hd.getDate(), monthName: hd.getMonthName(), year });
      for (const who of on) found.set(who.id, (found.get(who.id) || 0) + 1);
    }
    const all = yahrzeits.all();
    const missing = all.filter((y) => !found.has(y.id)).map((y) => y.name);
    const twice = all.filter((y) => (found.get(y.id) || 0) > 1).map((y) => y.name);
    check(`Every yahrzeit falls once in ${year}${HDate.isLeapYear(year) ? ' (leap)' : ''}`,
      missing.length === 0 && twice.length === 0,
      missing.length ? `never: ${missing.join(', ')}`
        : twice.length ? `twice: ${twice.join(', ')}`
        : `all ${all.length}`);
  }

  check('No two entries share an id',
    new Set(yahrzeits.all().map((y) => y.id)).size === yahrzeits.all().length);

  // Two tzaddikim pointing at one sefer means one of them is being credited
  // with the other's words. "Likutei Amarim" was in the Maggid's list as a
  // spelling of his sefer; it is the Tanya's own name, and it resolved.
  // Across entries, not within one. An entry's own list is spellings of the
  // same sefer -- "leYaakov" and "LeYaakov" are one sefer, and counting them
  // as two tzaddikim claiming it is the check misreading its own list.
  const claimedBy = new Map();
  for (const y of yahrzeits.all()) {
    const mine = new Set([y.book].concat(y.aliases || [])
      .filter(Boolean).map((t) => t.toLowerCase()));
    for (const t of mine) {
      if (!claimedBy.has(t)) claimedBy.set(t, new Set());
      claimedBy.get(t).add(y.name);
    }
  }
  const shared = [...claimedBy.entries()].filter(([, who]) => who.size > 1);
  check('No sefer is claimed by two tzaddikim', shared.length === 0,
    shared.length
      ? shared.map(([t, who]) => `${t}: ${[...who].join(' and ')}`).join('; ')
      : `${claimedBy.size} seforim, each to one name`);

  // The guard itself, on the case that got through.
  const answers = require('../lib/daily').answersTo;
  check('A sefer under another name is refused',
    answers([{ title: 'Tanya' }], 'Likutei Amarim') === false);
  check('The right sefer is accepted',
    answers([{ title: 'Tanya' }], 'Tanya') === true);
  check('A spelling that differs is still accepted',
    answers([{ title: 'Keter Shem Tov' }], 'keter shem tov') === true);
  check('And a section of the right sefer counts',
    answers([{ title: 'Noam Elimelech, Bereshit' }], 'Noam Elimelech') === true);
  // Several shapes carry no title at all. Refusing those dropped the passage
  // from five of the eight -- the Tanya among them -- on a missing field.
  check('A shape with no name is not treated as the wrong sefer',
    answers([{ length: 124, chapters: [] }], 'Tanya') === true);
  check('A book field counts as its name',
    answers([{ book: 'Tanya' }], 'Likutei Amarim') === false);
  // Both of these were being refused on their own yahrzeits, by their own
  // titles, because the match was anchored at the start of the name.
  check('A sefer filed with a word in front of its name is still itself',
    answers([{ title: 'Sefer Noam Elimelech' }], 'Noam Elimelech') === true);
  check('And one filed under two names at once',
    answers([{ title: 'Likutei Amarim Tanya' }], 'Tanya') === true);
  // The substitution this guard exists for still has to be caught: neither
  // name contains the other, so widening the match did not let it through.
  check('But the Tanya still does not answer to the Maggid\'s sefer',
    answers([{ title: 'Tanya' }], 'Likutei Amarim') === false);
  // The two that were refused their own Torah on their own yahrzeits, by one
  // letter each. Sefaria's spellings, taken from its own answer.
  check('A sefer spelled with kh instead of ch is the same sefer',
    answers([{ title: 'Noam Elimelekh' }], 'Noam Elimelech') === true);
  check('And one spelled with a different vowel',
    answers([{ title: 'Chafetz Chaim' }], 'Chofetz Chaim') === true);
  check('A section of it under that spelling counts too',
    answers([{ title: 'Noam Elimelekh, Bereshit' }], 'Noam Elimelech') === true);
  // Loosening it to consonants must not loosen it to a different sefer.
  check('Two different seforim are still two different seforim',
    answers([{ title: 'Kedushat Levi' }], 'Sefer HaMiddot') === false);
  check('And a near neighbour is not swallowed',
    answers([{ title: 'Likutei Halakhot' }], 'Likutei Moharan') === false);

  // Every sefer this app names, against every other one. Written by hand the
  // cases above all passed while Likkutei Etzot -- which is how Sefaria
  // actually files Likutei Etzot, with the doubled letter -- was being
  // refused. Nothing was broken by it, because that sefer is not in the
  // yahrzeit list; it would have been the next time one was added.
  const SHELF = [
    'Likutei Moharan', 'Sichot HaRan', 'Sefer HaMiddot', 'Likutei Etzot',
    'Likutei Tefilot', 'Sippurei Maasiyot', 'Chayei Moharan', 'Shivchei HaRan',
    'Likutei Halachot', 'Keter Shem Tov', 'Maggid Devarav leYaakov', 'Tanya',
    'Noam Elimelech', 'Kedushat Levi', 'Chofetz Chaim',
  ];
  // How Sefaria spells the ones it spells differently, read off its answers.
  const AS_FILED = {
    'Likutei Etzot': 'Likkutei Etzot',
    'Likutei Halachot': 'Likutei Halakhot',
    'Noam Elimelech': 'Noam Elimelekh',
    'Chofetz Chaim': 'Chafetz Chaim',
  };
  const missed = SHELF.filter((title) => !answers([{ title: AS_FILED[title] || title }], title));
  check('Every sefer on the shelf answers to itself', missed.length === 0,
    missed.length ? missed.join(', ') : `all ${SHELF.length}`);

  const confused = [];
  SHELF.forEach((a) => SHELF.forEach((b) => {
    if (a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0) return;
    if (answers([{ title: AS_FILED[a] || a }], b)) confused.push(`${a} → ${b}`);
  }));
  check('And to no other sefer on it', confused.length === 0,
    confused.length ? confused.join('; ') : `${SHELF.length * (SHELF.length - 1)} pairs`);

  // And the count of years is right, not off by one.
  const nachman = yahrzeits.yahrzeitsOn({ day: 18, monthName: 'Tishrei', year: 5787 })[0];
  check('It counts the years since', nachman && nachman.years === 5787 - 5571,
    nachman ? `${nachman.name}, ${nachman.years} years` : 'not found');

  // A sefer is not lost because one of its pieces is a heading with no text
  // under it. The run has somewhere to fall through to, and the first of it
  // is still exactly the piece the old single pick returned, so no sefer
  // that already worked moves to a different passage today.
  const pieces = Array.from({ length: 30 }, (_, i) => `Piece ${i + 1}`);
  const someIso = dateFromIso('2026-09-29');
  const run = pickRunForDay(pieces, someIso, 29, 8);
  check('The day\'s piece is unchanged', run[0] === pickForDay(pieces, someIso, 29), run[0]);
  check('And there are others to fall through to', run.length === 8, `${run.length} deep`);
  check('None of them repeats', new Set(run).size === run.length);
  // A book with fewer pieces than the run is asked for must not loop forever
  // or hand back the same piece eight times.
  const tiny = pickRunForDay(['Only one'], someIso, 29, 8);
  check('A one-piece sefer gives one piece, not eight', tiny.length === 1, tiny.join(', '));
  const three = pickRunForDay(['a', 'b', 'c'], someIso, 29, 8);
  check('A three-piece sefer gives three', three.length === 3 && new Set(three).size === 3,
    three.join(', '));

  console.log('\nThe Ushpizin');

  // Seven guests, 15 to 21 Tishrei, and nothing on either side of them.
  // Shemini Atzeres is not Sukkos and has no guest.
  const onDay = (d) => ushpizin.ushpizinOn({ monthName: 'Tishrei', day: d });
  check('Nothing the day before Sukkos', onDay(14) === null);
  check('Nothing on Shemini Atzeres', onDay(22) === null);
  check('Nothing in another month',
    ushpizin.ushpizinOn({ monthName: 'Cheshvan', day: 16 }) === null);
  const week = [15, 16, 17, 18, 19, 20, 21].map(onDay);
  check('A guest on each of the seven days', week.every((d) => d && d.guests.length), 
    week.filter(Boolean).length + ' of 7');
  check('And they are numbered one to seven',
    week.map((d) => d.day).join(',') === '1,2,3,4,5,6,7',
    week.map((d) => d.day).join(','));

  // The two orders agree on four days and differ on three. Both are given on
  // the days they differ, and never silently one of them.
  const differ = week.filter((d) => !d.agreed).map((d) => d.day);
  check('The two orders differ on days four, five and six',
    differ.join(',') === '4,5,6', differ.join(',') || 'none');
  check('Both are shown on those days, each named',
    week.filter((d) => !d.agreed).every((d) =>
      d.guests.length === 2 && d.guests.every((g) => g.minhag)),
    'the Zohar and the Arizal');
  check('And one on the days they agree',
    week.filter((d) => d.agreed).every((d) => d.guests.length === 1));

  // Each order holds all seven, once each, and the two famous ones are where
  // they belong: Yosef is fourth for the Arizal and sixth for the Zohar.
  const both = ushpizin.all();
  check('Each order holds all seven guests, once each',
    new Set(both.zohar.map((g) => g.id)).size === 7 &&
    new Set(both.arizal.map((g) => g.id)).size === 7);
  check('The Zohar has Moshe fourth and Yosef sixth',
    both.zohar[3].id === 'moshe' && both.zohar[5].id === 'yosef',
    both.zohar[3].name + ' then ' + both.zohar[5].name);
  check('The Arizal has Yosef fourth and Aharon sixth',
    both.arizal[3].id === 'yosef' && both.arizal[5].id === 'aharon',
    both.arizal[3].name + ' then ' + both.arizal[5].name);
  check('Both begin with the avos and end with Dovid HaMelech',
    ['zohar', 'arizal'].every((o) =>
      both[o].slice(0, 3).map((g) => g.id).join(',') === 'avraham,yitzchak,yaakov' &&
      both[o][6].id === 'dovid'));

  // Whose words a sefer carries is not the same as whose sefer it is. The
  // weekly lesson announced every one of the ten as Rebbe Nachman's, and
  // three of them are Reb Noson's.
  check('Likutei Moharan is Rebbe Nachman', library.saidBy('Likutei Moharan') === 'Rebbe Nachman');
  check('Likutei Halachot is Reb Noson', library.saidBy('Likutei Halakhot') === 'Reb Noson');
  check('So is Likutei Tefilot', library.saidBy('Likutei Tefilot') === 'Reb Noson');
  check('Chayei Moharan says it is Reb Noson telling of him',
    /Reb Noson/.test(library.saidBy('Chayei Moharan') || '') &&
    /Rebbe Nachman/.test(library.saidBy('Chayei Moharan') || ''),
    library.saidBy('Chayei Moharan'));
  const unattributed = library.BOOKS.filter((b) => !b.says);
  check('Every sefer on the shelf says whose words it carries',
    unattributed.length === 0,
    unattributed.length ? unattributed.map((b) => b.title).join(', ') : `all ${library.BOOKS.length}`);

  // An answer from Sefaria that carries nothing is not a sefer. All three of
  // the Satmar Rebbe's titles came back without throwing, and the check
  // written then called that "found" -- so the diagnostics announced that
  // Sefaria had all three when every one of them was empty.
  const nothing = [[], {}, [{}], [{ title: 'Divrei Yoel', length: 0, chapters: [] }]];
  check('An empty answer describes no pieces',
    nothing.every((shape) => library.refsFromShape(shape, { title: 'Divrei Yoel' }).length === 0),
    `${nothing.length} shapes, none of them a sefer`);
  check('A real one does',
    library.refsFromShape([{ title: 'Likutei Moharan', length: 286 }],
      { title: 'Likutei Moharan' }).length === 286);

  console.log('\nA search hit is ours, or it is not');

  // Sefaria's search does not reliably name the book a hit came from. The
  // search page learned that and read it off the reference; the weekly card's
  // chag search was then written against the book field anyway, and every
  // word came back "40 hits, none from the ten" -- so the card showed a
  // parsha lesson through the whole of Sukkos. One copy of the test now, and
  // this is it.
  const HITS = [
    [{ ref: 'Likutei Halakhot, Yoreh Deah, Laws of Shaving 3:13:1' }, 'Likutei Halakhot'],
    [{ ref: 'Likutei Moharan, Part II 27' }, 'Likutei Moharan, Part II'],
    [{ ref: 'Likutei Moharan 24:3' }, 'Likutei Moharan'],
    [{ ref: 'Sefer HaMiddot, Truth 5' }, 'Sefer HaMiddot'],
    [{ ref: 'Likkutei Etzot, Joy 1' }, 'Likkutei Etzot'],
    [{ book: 'Likutei Tefilot', ref: 'Likutei Tefilot, Volume II 6' }, 'Likutei Tefilot'],
    // Not ours, however much they look like Torah.
    [{ ref: 'Shulchan Arukh, Orach Chayim 625' }, null],
    [{ ref: 'Ohr Chadash 9:18:2' }, null],
    [{ ref: 'Berakhot 2a' }, null],
    [{ ref: 'Likutei Moharan Commentary 3' }, null],
    [{}, null],
  ];
  const misread = HITS.filter(([hit, want]) => library.bookOfHit(hit) !== want);
  check('A hit is placed by its reference, not by a book field',
    misread.length === 0,
    misread.length ? misread.map(([h, w]) => `${h.ref || '(none)'} wanted ${w}`).join('; ')
                   : `${HITS.length} hits`);
  check('And one that is not ours is not claimed',
    HITS.filter(([, want]) => want === null).every(([hit]) => !library.belongsToUs(hit)));

  console.log('\nThe weekly Torah is about this week');

  // Exactly the strings hebcal produces, which is the only thing the picker
  // ever sees. A regex that is nearly right here shows up as a lesson on
  // next Shabbos's parsha in the middle of Pesach.
  const weekOf = (...names) => daily.yomTovAhead({ holidays: names.map((en) => ({ en })) });
  const cases = [
    [['Sukkot VII (Hoshana Raba)', 'Shmini Atzeret'], 'Sukkos'],
    [['Shmini Atzeret', 'Simchat Torah'], 'Shmini Atzeres'],
    [['Simchat Torah'], 'Simchas Torah'],
    [['Rosh Hashana 5787'], 'Rosh Hashanah'],
    [['Yom Kippur'], 'Yom Kippur'],
    [['Chanukah: 1 Candle'], 'Chanukah'],
    [['Purim'], 'Purim'],
    [['Erev Pesach', 'Pesach I'], 'Pesach'],
    [['Shavuot I'], 'Shavuos'],
    [['Lag BaOmer'], 'Lag BaOmer'],
    [['Tu BiShvat'], 'Tu BiShvat'],
    [["Tish'a B'Av"], "Tisha B'Av"],
    // Not a yom tov for this purpose: it comes round every month and would
    // take the parsha's week twelve times a year.
    [['Rosh Chodesh Cheshvan'], null],
    [['Shabbat Shekalim'], null],
    [[], null],
  ];
  const wrong = cases.filter(([names, want]) => {
    const got = weekOf(...names);
    return (got ? got.en : null) !== want;
  });
  check('Every yom tov is recognised from what hebcal calls it',
    wrong.length === 0,
    wrong.length ? wrong.map(([n, w]) => `${n.join('/')} wanted ${w}`).join('; ')
                 : `${cases.length} weeks`);
  check('And each one knows what to look for it under',
    daily.YOM_TOV.every((y) => y.look && y.en && y.he),
    `${daily.YOM_TOV.length} yomim tovim`);

  console.log('\nThe Jewish day turns at nightfall');

  // Until this was here the app used the civil date all evening: at eight
  // o'clock it still showed yesterday's Hebrew date, so the day's Tehillim
  // were yesterday's too, and anything that begins at nightfall -- a
  // yahrzeit, a yom tov -- would not have shown until the next morning.
  const nightPlace = dates.normalisePlace({});
  const someDay = dateFromIso('2026-09-29');
  const { Zmanim, Location } = require('@hebcal/core');
  const shkia = new Zmanim(dates.toHebcalLocation(nightPlace), someDay, false).sunset();

  const dayBefore = dates.calendarFor(someDay, nightPlace, new Date(shkia.getTime() - 60 * 60 * 1000));
  const dayAfter = dates.calendarFor(someDay, nightPlace, new Date(shkia.getTime() + 60 * 1000));

  check('Before shkia it is still today', dayBefore.hebrew.afterSunset === false, dayBefore.hebrew.en);
  check('A minute after shkia it is tomorrow', dayAfter.hebrew.afterSunset === true, dayAfter.hebrew.en);
  check('And that is one day on, not two',
    dayAfter.hebrew.day === (dayBefore.hebrew.day % dayBefore.hebrew.daysInMonth) + 1,
    `${dayBefore.hebrew.day} then ${dayAfter.hebrew.day}`);

  // The day's Tehillim follow the Hebrew date, so they have to turn with it.
  const before = library.tehillimForDay(dayBefore.hebrew.day, dayBefore.hebrew.daysInMonth);
  const after = library.tehillimForDay(dayAfter.hebrew.day, dayAfter.hebrew.daysInMonth);
  // Compared by label, not by joining the array: these are objects, and
  // joining them gives "[object Object]" on both sides, which is equal
  // however different the psalms are. The check passed nothing at all.
  const said = (list) => list.map(library.tehillimLabel).join(', ');
  check('The day\'s Tehillim turn with it', said(before) !== said(after),
    `${said(before)} then ${said(after)}`);

  // But a date you asked for by name is that date, whatever the hour here.
  const nextWeek = dates.calendarFor(dateFromIso('2026-10-05'), nightPlace,
    new Date(shkia.getTime() + 60 * 60 * 1000));
  check('A date you asked for does not move', nextWeek.hebrew.afterSunset === false, nextWeek.hebrew.en);

  console.log("\nThe day's נקודה knows what day it is");

  // Every day hebcal can name, swept past the occasion table. A day that
  // carries real Torah and is not recognised is a day the נקודה will be
  // about the wrong thing -- and the way that happens is silent: hebcal
  // renders a curly apostrophe, U+2019, where these patterns were written
  // with a typed one, so "Tish'a B'Av" and every fast in the year matched
  // nothing at all and fell through to the parsha. Nothing failed. The app
  // was simply never told it was Tisha B'Av.
  {
    const { HebrewCalendar, Location: Where } = require('@hebcal/core');
    const spot = new Where(40.6782, -73.9442, false, 'America/New_York');
    const year = HebrewCalendar.calendar({
      start: new Date(2026, 0, 1), end: new Date(2027, 0, 1), location: spot, il: false,
    });
    const names = new Map();
    for (const ev of year) {
      const cats = ev.getCategories();
      if (!(cats.includes('holiday') || cats.includes('roshchodesh'))) continue;
      if (cats.includes('zmanim')) continue;
      const name = ev.render('en');
      if (!names.has(name)) names.set(name, cats);
    }
    const unmatched = [...names].filter(([name]) =>
      !inspiration.OCCASIONS.find((o) => o.is.test(inspiration.plain(name))));
    const fasts = unmatched.filter(([, c]) => c.includes('fast'));
    const majors = unmatched.filter(([, c]) => c.includes('major'));
    check('Every fast in the year is recognised', fasts.length === 0,
      fasts.length ? fasts.map(([n]) => n).join(', ') : `${names.size} day names swept`);
    check('And every major yom tov', majors.length === 0,
      majors.length ? majors.map(([n]) => n).join(', ') : 'none missed');
    check('The ones left are left on purpose', unmatched.length <= 9,
      unmatched.map(([n]) => n).join(', ') + ' — no approved teacher has Torah for these');
  }

  // Today means today. The first version read the nine-day forward window
  // the weekly card uses, so an ordinary Tuesday in Adar called itself Purim
  // and did so every day for a week and a half.
  {
    const ordinary = dates.calendarFor(new Date(2026, 1, 24, 12), place, null);
    const onPurim = dates.calendarFor(new Date(2026, 2, 3, 12), place, null);
    const a = inspiration.contextFor(ordinary);
    const b = inspiration.contextFor(onPurim);
    check('An ordinary day is about its parsha, not a yom tov next week',
      a.kind === 'parsha' && /Tetzaveh/.test(a.label || ''), a.label);
    check('And Purim is about Purim', b.kind === 'yomtov' && b.label === 'Purim', b.label);
  }

  // The pool is closed and the Rambam sits outside it.
  check('Seven approved teachers, and no eighth',
    teachers.APPROVED.length === 7,
    teachers.APPROVED.map((t) => t.short).join(', '));
  check('The Rambam is the fallback, not one of them',
    teachers.FALLBACK.id === 'rambam'
      && !teachers.APPROVED.some((t) => t.id === 'rambam'),
    'reached when no approved teacher fits, never instead of one that does');
  check('A rebbe whose talmidim wrote it down is quoted as "based on"',
    teachers.quoting(teachers.BY_ID.get('besht')) === 'based-on'
      && teachers.quoting(teachers.BY_ID.get('nachman')) === 'quotation',
    'the Baal Shem Tov wrote nothing; Rebbe Nachman did');

  console.log('\nAn untranslated sefer does not become the whole card');

  // Sefaria answers for a sefer it has not had translated with an English
  // array the right length and empty at every position -- so english.length
  // is true for Likutei Halachot and tells you nothing. That is the trap the
  // weekly card fell into: it showed a block of Hebrew with no English under
  // it and no word about why.
  //
  // The real text client is swapped out here and put back afterwards, because
  // the whole point is to hand the picker the exact shape Sefaria returns for
  // an untranslated piece, which no live call would reliably produce.
  const realGetText = sefaria.getText;
  const untranslated = /Likutei Halakhot/;
  sefaria.getText = async (ref) => ({
    ref, heRef: ref,
    hebrew: ['דַּע כִּי צָרִיךְ לָדוּן אֶת כָּל אָדָם לְכַף זְכוּת'],
    english: untranslated.test(ref) ? ['', '', ''] : ['Know that one must judge every person favourably.'],
    hebrewVersion: 'test', englishVersion: untranslated.test(ref) ? null : 'test',
    license: 'CC0', url: 'https://www.sefaria.org/',
  });
  try {
    check('An array of empty strings is not a translation',
      daily.hasEnglish({ english: ['', '', ''] }) === false, "Likutei Halachot's actual shape");
    check('And real English is', daily.hasEnglish({ english: ['', 'Know that...'] }) === true);

    const choices = [
      'Likutei Halakhot, Choshen Mishpat, Laws of Artisans 3:20:1',
      'Likutei Halakhot, Orach Chaim, Laws of Sukkah 4:1',
      'Likutei Moharan 48:1',
    ];
    const stepped = await daily.firstReadable(choices);
    check('It steps past the untranslated ones to one that can be read',
      !!stepped && stepped.ref === 'Likutei Moharan 48:1' && stepped.translated === true,
      stepped ? stepped.ref : 'nothing came back');

    const noneTranslated = await daily.firstReadable(choices.slice(0, 2));
    check('With nothing translated it still shows the Hebrew, marked',
      !!noneTranslated && noneTranslated.translated === false,
      noneTranslated ? noneTranslated.ref : 'nothing came back');

    const shown = daily.present(await sefaria.getText(choices[0]), {});
    check('And the page is told, so it can say so',
      shown.translated === false && shown.snippetEn === '',
      `translated=${shown.translated}, snippetEn="${shown.snippetEn}"`);
  } finally {
    sefaria.getText = realGetText;
  }

  console.log('\nThe widget always has something to show');

  // The widget used to say "No more zmanim today" every evening, and on the
  // lock screen -- where that line is only drawn when there is one -- it
  // showed nothing at all.
  //
  // The moments are taken from the day's own zmanim rather than from the
  // clock. Setting "midday" by hand meant midday UTC, which is breakfast in
  // Brooklyn, and the check passed while testing the wrong hour entirely.
  const server = require('../server');
  const widgetPlace = dates.normalisePlace({});
  const theDay = new Date();
  const dayTimes = zmanim.zmanimFor(theDay, widgetPlace, new Date())
    .times.filter((t) => t.isChosen);
  const firstOf = new Date(dayTimes[0].iso);
  const lastOf = new Date(dayTimes[dayTimes.length - 1].iso);

  const moments = [
    ['before the first zman', new Date(firstOf.getTime() - 60000)],
    ['in the middle of the day', new Date((firstOf.getTime() + lastOf.getTime()) / 2)],
    ['one minute after the last', new Date(lastOf.getTime() + 60000)],
    ['at two in the morning', new Date(lastOf.getTime() + 5 * 3600 * 1000)],
  ];

  for (const [when, at] of moments) {
    const found = server.nextZmanOrTomorrow(widgetPlace, theDay, at, {});
    check(`A next zman ${when}`, !!(found && found.time),
      found ? `${found.en} ${found.time}${found.tomorrow ? ' (tomorrow)' : ''}` : 'nothing');
  }

  // And the two after dark have to be tomorrow's, not a stale one from today.
  const afterDark = server.nextZmanOrTomorrow(widgetPlace, theDay, new Date(lastOf.getTime() + 60000), {});
  check('After the last zman it rolls over to tomorrow',
    !!(afterDark && afterDark.tomorrow === true && afterDark.minutesAway > 0),
    afterDark ? `${afterDark.en}, ${afterDark.minutesAway} minutes away` : 'nothing');

  console.log('\nTexts (needs the internet)');
  try {
    const text = await sefaria.getText('Psalms 16');
    check('Sefaria reachable', !!text && text.hebrew.length > 0,
      text ? `${text.hebrew.length} Hebrew lines` : 'no text');
  } catch (err) {
    check('Sefaria reachable', false, err.message);
    console.log('\n  The app will show times and dates, but not the texts,');
    console.log('  until this server can reach sefaria.org.');
  }

  console.log(`\n${failures === 0 ? 'Everything passed.' : failures + ' check(s) failed.'}\n`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main();
