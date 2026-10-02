'use strict';

/**
 * The Ushpizin -- the seven guests of Sukkos.
 *
 * One for each day of Sukkos, 15 to 21 Tishrei. Shemini Atzeres is not
 * Sukkos and has none.
 *
 * There are two orders, and they are not a disagreement to be settled here.
 * The Zohar runs them by sefirah -- Avraham, Yitzchak, Yaakov, Moshe, Aharon,
 * Yosef, Dovid -- which is the order most siddurim print. The Arizal's order,
 * which Chabad and a good deal of Chassidus follow, puts Yosef fourth and
 * moves Moshe and Aharon back a day.
 *
 * They agree on days one, two, three and seven, and differ on four, five and
 * six. Rather than pick one and show it as though it were the only one, the
 * days they differ carry both, each under its own name. Someone who holds one
 * minhag can read past the other; someone shown only the wrong one has no way
 * to know it was a choice.
 *
 * The line about each guest is a plain description, not Torah put into
 * anyone's mouth. The Torah on the card is different: it is a named passage,
 * fetched from Sefaria and shown with its reference, the way the yahrzeit
 * passages are. Each one is a place the Torah speaks of that guest -- or, in
 * Dovid HaMelech's case, speaks in his own voice -- chosen by hand rather
 * than found by searching for a name, because a search returns the places a
 * name appears and not the places it matters.
 */

const GUESTS = {
  avraham: {
    id: 'avraham',
    name: 'Avraham Avinu',
    he: 'אַבְרָהָם אָבִינוּ',
    sefirah: 'Chesed',
    sefirahHe: 'חֶסֶד',
    about: 'The first of the fathers, whose tent stood open on every side.',
    // The three guests at the tent: the passage Ushpizin is named for.
    refs: ['Genesis 18:1-8', 'Genesis 12:1-5'],
  },
  yitzchak: {
    id: 'yitzchak',
    name: 'Yitzchak Avinu',
    he: 'יִצְחָק אָבִינוּ',
    sefirah: 'Gevurah',
    sefirahHe: 'גְּבוּרָה',
    about: 'Who was bound on the altar, and who dug again his father\'s wells.',
    // Digging his father's wells again, and the Akeidah.
    refs: ['Genesis 26:17-25', 'Genesis 22:1-14'],
  },
  yaakov: {
    id: 'yaakov',
    name: 'Yaakov Avinu',
    he: 'יַעֲקֹב אָבִינוּ',
    sefirah: 'Tiferes',
    sefirahHe: 'תִּפְאֶרֶת',
    about: 'Who dreamt of the ladder, and whose children became the nation.',
    // The ladder at Beis El, and the night he was given his second name.
    refs: ['Genesis 28:10-22', 'Genesis 32:25-31'],
  },
  moshe: {
    id: 'moshe',
    name: 'Moshe Rabbeinu',
    he: 'מֹשֶׁה רַבֵּינוּ',
    sefirah: 'Netzach',
    sefirahHe: 'נֶצַח',
    about: 'Who brought down the Torah, and who is called the faithful shepherd.',
    // The bush that burned, and the verse about his humility.
    refs: ['Exodus 3:1-10', 'Numbers 12:1-8'],
  },
  aharon: {
    id: 'aharon',
    name: 'Aharon HaKohen',
    he: 'אַהֲרֹן הַכֹּהֵן',
    sefirah: 'Hod',
    sefirahHe: 'הוֹד',
    about: 'Who loved peace and pursued it, and brought people back to one another.',
    // Hillel on being his talmid, and the month the whole house wept.
    refs: ['Pirkei Avot 1:12', 'Numbers 20:22-29'],
  },
  yosef: {
    id: 'yosef',
    name: 'Yosef HaTzaddik',
    he: 'יוֹסֵף הַצַּדִּיק',
    sefirah: 'Yesod',
    sefirahHe: 'יְסוֹד',
    about: 'Who kept himself in Mitzrayim, and fed his brothers who had sold him.',
    // Telling his brothers who he was, and the years in Potiphar's house.
    refs: ['Genesis 45:1-8', 'Genesis 39:1-6'],
  },
  dovid: {
    id: 'dovid',
    name: 'Dovid HaMelech',
    he: 'דָּוִד הַמֶּלֶךְ',
    sefirah: 'Malchus',
    sefirahHe: 'מַלְכוּת',
    about: 'Who wrote the Tehillim this app reads every day.',
    // His own words, which is what makes his different from the rest.
    refs: ['Psalms 23', 'Psalms 27:1-6'],
  },
};

/** The Zohar's order: by the sefiros, in sequence. */
const ZOHAR = ['avraham', 'yitzchak', 'yaakov', 'moshe', 'aharon', 'yosef', 'dovid'];

/** The Arizal's order: Yosef fourth, Moshe and Aharon a day later. */
const ARIZAL = ['avraham', 'yitzchak', 'yaakov', 'yosef', 'moshe', 'aharon', 'dovid'];

const FIRST_DAY = 15;
const LAST_DAY = 21;

/**
 * Which day of Sukkos a Hebrew date is, or 0 if it is not Sukkos.
 * Takes the same `hebrew` shape the yahrzeits do.
 */
function dayOfSukkos(hebrew) {
  if (!hebrew || hebrew.monthName !== 'Tishrei') return 0;
  const day = Number(hebrew.day);
  if (!(day >= FIRST_DAY && day <= LAST_DAY)) return 0;
  return day - FIRST_DAY + 1;
}

/**
 * The guests for a Hebrew date, or null when it is not Sukkos.
 *
 * `guests` is one entry on the four days the two orders agree and two on the
 * three days they do not, each saying which order it comes from.
 */
function ushpizinOn(hebrew) {
  const day = dayOfSukkos(hebrew);
  if (!day) return null;

  const zohar = GUESTS[ZOHAR[day - 1]];
  const arizal = GUESTS[ARIZAL[day - 1]];
  const agreed = zohar.id === arizal.id;

  return {
    day,
    of: LAST_DAY - FIRST_DAY + 1,
    agreed,
    guests: agreed
      ? [Object.assign({ minhag: null }, zohar)]
      : [
          Object.assign({ minhag: 'the Zohar' }, zohar),
          Object.assign({ minhag: 'the Arizal' }, arizal),
        ],
  };
}

/** Every guest, in both orders, for the diagnostics page and for tests. */
function all() {
  return {
    zohar: ZOHAR.map((id) => GUESTS[id]),
    arizal: ARIZAL.map((id) => GUESTS[id]),
  };
}

module.exports = { ushpizinOn, dayOfSukkos, all, GUESTS, ZOHAR, ARIZAL };
