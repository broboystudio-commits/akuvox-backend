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
 * Nothing here is a quotation. The line about each guest is a plain
 * description, not Torah put into anyone's mouth.
 */

const GUESTS = {
  avraham: {
    id: 'avraham',
    name: 'Avraham Avinu',
    he: 'אַבְרָהָם אָבִינוּ',
    sefirah: 'Chesed',
    sefirahHe: 'חֶסֶד',
    about: 'The first of the fathers, whose tent stood open on every side.',
  },
  yitzchak: {
    id: 'yitzchak',
    name: 'Yitzchak Avinu',
    he: 'יִצְחָק אָבִינוּ',
    sefirah: 'Gevurah',
    sefirahHe: 'גְּבוּרָה',
    about: 'Who was bound on the altar, and who dug again his father\'s wells.',
  },
  yaakov: {
    id: 'yaakov',
    name: 'Yaakov Avinu',
    he: 'יַעֲקֹב אָבִינוּ',
    sefirah: 'Tiferes',
    sefirahHe: 'תִּפְאֶרֶת',
    about: 'Who dreamt of the ladder, and whose children became the nation.',
  },
  moshe: {
    id: 'moshe',
    name: 'Moshe Rabbeinu',
    he: 'מֹשֶׁה רַבֵּינוּ',
    sefirah: 'Netzach',
    sefirahHe: 'נֶצַח',
    about: 'Who brought down the Torah, and who is called the faithful shepherd.',
  },
  aharon: {
    id: 'aharon',
    name: 'Aharon HaKohen',
    he: 'אַהֲרֹן הַכֹּהֵן',
    sefirah: 'Hod',
    sefirahHe: 'הוֹד',
    about: 'Who loved peace and pursued it, and brought people back to one another.',
  },
  yosef: {
    id: 'yosef',
    name: 'Yosef HaTzaddik',
    he: 'יוֹסֵף הַצַּדִּיק',
    sefirah: 'Yesod',
    sefirahHe: 'יְסוֹד',
    about: 'Who kept himself in Mitzrayim, and fed his brothers who had sold him.',
  },
  dovid: {
    id: 'dovid',
    name: 'Dovid HaMelech',
    he: 'דָּוִד הַמֶּלֶךְ',
    sefirah: 'Malchus',
    sefirahHe: 'מַלְכוּת',
    about: 'Who wrote the Tehillim this app reads every day.',
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
