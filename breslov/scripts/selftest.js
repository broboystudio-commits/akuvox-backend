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
