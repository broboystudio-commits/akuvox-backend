'use strict';

/**
 * Yahrzeits of tzaddikim.
 *
 * Hand-kept, and deliberately short. Every date here is one I can stand
 * behind; the ones I was not certain of were left out rather than guessed at,
 * because a wrong yahrzeit in an app people daven by is worse than a missing
 * one. Adding to it is a matter of copying a date out of a luach into the
 * list below -- nothing else has to change.
 *
 * What is NOT here, on purpose:
 *
 *   - Stories. The `about` line of each entry is the kind of thing printed on
 *     a title page -- years, place, the sefer, who they learned from. Not
 *     ma'asiyos, which I have no way to check.
 *   - Quotations. Where a tzaddik's sefer is on Sefaria, the app fetches a
 *     real passage from it, the same way it does everywhere else. Where it is
 *     not -- which is most of the Chabad rebbes after the Alter Rebbe, and the
 *     Satmar Rov -- the yahrzeit is shown without one. Nothing in this app is
 *     ever put into a tzaddik's mouth.
 */

/**
 * `month` is spelled as hebcal spells it: Tishrei, Cheshvan, Kislev, Tevet,
 * Sh'vat, Adar I, Adar II, Nisan, Iyyar, Sivan, Tamuz, Av, Elul.
 *
 * `book` is a title to look for on Sefaria. It may well not be there; the app
 * asks, and shows the yahrzeit without a passage if the answer is no. It is
 * never taken on trust.
 */
const YAHRZEITS = [
  {
    id: 'baal-shem-tov',
    name: 'The Baal Shem Tov',
    he: 'רַבִּי יִשְׂרָאֵל בַּעַל שֵׁם טוֹב',
    month: 'Sivan', day: 6, year: 5520,
    about: 'Rabbi Yisrael ben Eliezer, who founded the Chassidic movement. His yahrzeit falls on Shavuos.',
    book: 'Keter Shem Tov',
  },
  {
    id: 'maggid-mezritch',
    name: 'The Maggid of Mezritch',
    he: 'רַבִּי דֹּב בֶּער מִמֶּזְרִיטְשׁ',
    month: 'Kislev', day: 19, year: 5533,
    about: 'Rabbi Dov Ber, successor to the Baal Shem Tov, whose talmidim carried Chassidus across Europe.',
    // Sefaria does not have it under this spelling -- the diagnostics said so
    // plainly, 0 pieces -- so these are tried too. Transliteration from
    // Hebrew has no single right answer and the app must not assume one.
    book: 'Maggid Devarav LeYaakov',
    aliases: ['Magid Devarav LeYaakov', 'Or Torah', 'Likutei Amarim'],
  },
  {
    id: 'alter-rebbe',
    name: 'The Alter Rebbe',
    he: 'רַבִּי שְׁנֵיאוּר זַלְמַן מִלִּיאַדִי',
    month: 'Tevet', day: 24, year: 5573,
    about: 'Rabbi Shneur Zalman of Liadi, author of the Tanya and the Shulchan Aruch HaRav, first Rebbe of Chabad.',
    book: 'Tanya',
  },
  {
    id: 'mitteler-rebbe',
    name: 'The Mitteler Rebbe',
    he: 'רַבִּי דֹּב בֶּער מִלּוּבַּאוִיטְשׁ',
    month: 'Kislev', day: 9, year: 5588,
    about: 'Rabbi Dovber Schneuri, second Rebbe of Chabad. Born and passed away on the same date.',
  },
  {
    id: 'tzemach-tzedek',
    name: 'The Tzemach Tzedek',
    he: 'רַבִּי מְנַחֵם מֶענְדְּל מִלּוּבַּאוִיטְשׁ',
    month: 'Nisan', day: 13, year: 5626,
    about: 'Rabbi Menachem Mendel Schneersohn, third Rebbe of Chabad, known by the name of his halachic works.',
  },
  {
    id: 'rebbe-maharash',
    name: 'The Rebbe Maharash',
    he: 'רַבִּי שְׁמוּאֵל מִלּוּבַּאוִיטְשׁ',
    month: 'Tishrei', day: 13, year: 5643,
    about: 'Rabbi Shmuel Schneersohn, fourth Rebbe of Chabad.',
  },
  {
    id: 'rebbe-rashab',
    name: 'The Rebbe Rashab',
    he: 'רַבִּי שָׁלוֹם דֹּב בֶּער מִלּוּבַּאוִיטְשׁ',
    month: 'Nisan', day: 2, year: 5680,
    about: 'Rabbi Sholom Dovber Schneersohn, fifth Rebbe of Chabad, who founded the Tomchei Temimim yeshivos.',
  },
  {
    id: 'frierdiker-rebbe',
    name: 'The Frierdiker Rebbe',
    he: 'רַבִּי יוֹסֵף יִצְחָק מִלּוּבַּאוִיטְשׁ',
    month: 'Sh\'vat', day: 10, year: 5710,
    about: 'Rabbi Yosef Yitzchak Schneersohn, sixth Rebbe of Chabad, imprisoned in Russia for spreading Torah and later rebuilding it in America.',
  },
  {
    id: 'the-rebbe',
    name: 'The Lubavitcher Rebbe',
    he: 'רַבִּי מְנַחֵם מֶענְדְּל שְׁנֵיאוּרְסָאהן',
    month: 'Tamuz', day: 3, year: 5754,
    about: 'Rabbi Menachem Mendel Schneerson, seventh Rebbe of Chabad.',
  },
  {
    id: 'satmar-rov',
    name: 'The Satmar Rov',
    he: 'רַבִּי יוֹאֵל טײטלבױם',
    month: 'Av', day: 26, year: 5739,
    about: 'Rabbi Yoel Teitelbaum, author of Vayoel Moshe and Divrei Yoel, who rebuilt Satmar in America after the war.',
  },
  {
    id: 'rebbe-nachman',
    name: 'Rebbe Nachman of Breslov',
    he: 'רַבֵּנוּ נַחְמָן מִבְּרֶסְלֶב',
    month: 'Tishrei', day: 18, year: 5571,
    about: 'Great-grandson of the Baal Shem Tov. Passed away in Uman on the second day of Chol HaMoed Sukkos, aged thirty-eight.',
    book: 'Likutei Moharan',
  },
  {
    id: 'reb-noson',
    name: 'Reb Noson of Breslov',
    he: 'רַבִּי נָתָן מִבְּרֶסְלֶב',
    month: 'Tevet', day: 10, year: 5605,
    about: 'Rabbi Noson Sternhartz, Rebbe Nachman\'s foremost talmid, who wrote down his teachings and without whom almost none of them would have survived.',
    book: 'Likutei Tefilot',
  },
  {
    id: 'rashbi',
    name: 'Rabbi Shimon bar Yochai',
    he: 'רַבִּי שִׁמְעוֹן בַּר יוֹחַאי',
    month: 'Iyyar', day: 18,
    about: 'The Tanna to whom the Zohar is attributed. His yahrzeit is Lag BaOmer.',
  },
  {
    id: 'arizal',
    name: 'The Arizal',
    he: 'רַבִּי יִצְחָק לוּרְיָא',
    month: 'Av', day: 5, year: 5332,
    about: 'Rabbi Yitzchak Luria of Tzfas, whose teachings shape almost all later Kabbalah.',
  },
  {
    id: 'reb-elimelech',
    name: 'Rebbe Elimelech of Lizhensk',
    he: 'רַבִּי אֱלִימֶלֶךְ מִלִּיזֶ\'ענְסְק',
    month: 'Adar', day: 21, year: 5547,
    about: 'Author of Noam Elimelech, a talmid of the Maggid of Mezritch and a teacher of much of Polish Chassidus.',
    book: 'Noam Elimelech',
  },
  {
    id: 'berditchever',
    name: 'Rebbe Levi Yitzchak of Berditchev',
    he: 'רַבִּי לֵוִי יִצְחָק מִבַּארְדִּיטְשׁוֹב',
    month: 'Tishrei', day: 25, year: 5570,
    about: 'Author of Kedushas Levi, known for judging every Jew favourably.',
    book: 'Kedushat Levi',
  },
  {
    id: 'chofetz-chaim',
    name: 'The Chofetz Chaim',
    he: 'רַבִּי יִשְׂרָאֵל מֵאִיר הַכֹּהֵן',
    month: 'Elul', day: 24, year: 5693,
    about: 'Rabbi Yisrael Meir Kagan of Radin, author of the Chofetz Chaim on the laws of speech and the Mishnah Berurah.',
    book: 'Chofetz Chaim',
  },
];

/**
 * An Adar yahrzeit in a leap year.
 *
 * A year with two Adars has to put it in one of them, and the custom is not
 * uniform -- many mark it in Adar II, some in Adar I, and some in both. This
 * follows the more common practice and puts it in Adar II, and says so in the
 * app rather than quietly choosing for anyone.
 */
function monthsMatching(month, hebrewMonthName) {
  if (month === hebrewMonthName) return true;
  if (month === 'Adar' && (hebrewMonthName === 'Adar II' || hebrewMonthName === 'Adar')) return true;
  return false;
}

/** Whoever's yahrzeit falls on a given Hebrew date. */
function yahrzeitsOn(hebrew) {
  if (!hebrew || !hebrew.monthName) return [];
  return YAHRZEITS
    .filter((y) => y.day === hebrew.day && monthsMatching(y.month, hebrew.monthName))
    .map((y) => ({
      id: y.id,
      name: y.name,
      he: y.he,
      about: y.about,
      year: y.year || null,
      book: y.book || null,
      aliases: y.aliases || [],
      // How many years, when we know the year they passed away.
      years: y.year ? hebrew.year - y.year : null,
      inSecondAdar: y.month === 'Adar' && hebrew.monthName === 'Adar II',
    }));
}

/** Everything in the list, for the diagnostics page. */
function all() {
  return YAHRZEITS.map((y) => Object.assign({}, y));
}

module.exports = { YAHRZEITS, yahrzeitsOn, all };
