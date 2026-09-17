'use strict';

/**
 * Downloads the texts the app uses most and saves them into data/cache,
 * so the first person to open the site does not have to wait, and so the
 * app keeps working if Sefaria is ever unreachable.
 *
 * Run it with:  npm run seed
 * It is safe to run again any time; anything already saved is skipped.
 */

const sefaria = require('../lib/sefaria');
const library = require('../lib/library');
const daily = require('../lib/daily');
const dates = require('../lib/dates');

const DAYS_AHEAD = Number(process.env.SEED_DAYS || 14);

let ok = 0;
let failed = 0;

async function step(label, work) {
  process.stdout.write(`  ${label} … `);
  try {
    await work();
    ok++;
    console.log('done');
  } catch (err) {
    failed++;
    console.log(`skipped (${err.message})`);
  }
}

async function main() {
  console.log(`\nDownloading texts from ${sefaria.API}\n`);

  console.log('Book structures:');
  for (const book of library.BOOKS) {
    await step(book.label, () => sefaria.getShape(book.title));
  }

  console.log('\nTikkun HaKlali:');
  for (const n of library.TIKKUN_HAKLALI) {
    await step(`Tehillim ${n}`, () => sefaria.getText(`Psalms ${n}`));
  }

  console.log('\nTehillim, the whole monthly cycle:');
  for (let day = 1; day <= 30; day++) {
    const portions = library.tehillimForDay(day, 30);
    for (const portion of portions) {
      await step(library.tehillimLabel(portion),
        () => sefaria.getText(library.tehillimRef(portion)));
    }
  }

  console.log(`\nThe next ${DAYS_AHEAD} days of teachings:`);
  const today = new Date();
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const date = new Date(today.getTime() + i * 86400000);
    await step(date.toISOString().slice(0, 10), async () => {
      const spark = await daily.dailySpark(date);
      if (!spark.available) throw new Error(spark.reason);
    });
  }

  console.log('\nThis week\'s Torah:');
  await step('weekly lesson', async () => {
    const calendar = dates.calendarFor(today, {});
    const weekly = await daily.weeklyTorah(today, calendar);
    if (!weekly.available) throw new Error(weekly.reason);
    console.log(`\n     -> ${weekly.ref} (${weekly.mode})`);
  });

  const stats = sefaria.cacheStats();
  console.log(`\nSaved ${stats.files} files in ${stats.dir}`);
  console.log(`${ok} downloaded, ${failed} skipped.\n`);

  if (ok === 0) {
    console.log('Nothing downloaded at all. This server cannot reach sefaria.org.');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('\nSeeding stopped:', err.message);
  process.exitCode = 1;
});
