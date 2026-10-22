/**
 * The real server, with Sefaria answered locally.
 *
 * The browser checks need pages with text on them, and the machine they run
 * on usually cannot reach Sefaria. So the Sefaria client is replaced -- in
 * memory, nothing written into the project -- with one that answers every
 * question with marked placeholder text, and the real server is started on
 * top of it. Every passage it serves says [STUB] so a screenshot can never be
 * mistaken for real content.
 *
 *   PORT=3222 node scripts/browser/stub-server.js
 */
const path = require('path');
process.chdir(path.join(__dirname, '..', '..'));
const sefaria = require('../../lib/sefaria');

const HE = 'דַּע כִּי צָרִיךְ לָדוּן אֶת כָּל אָדָם לְכַף זְכוּת. [STUB]';
const EN = 'Placeholder paragraph, used only to look at the layout while offline. Long enough to wrap onto several lines so spacing and line height can be judged. [STUB]';
const BOOKS = ['Likutei Moharan', 'Likutei Moharan, Part II', 'Sichot HaRan', 'Sefer HaMiddot',
               'Likkutei Etzot', 'Likutei Tefilot', 'Sippurei Maasiyot', 'Chayei Moharan',
               'Likutei Halakhot', 'Shivchei HaRan'];

sefaria.getShape = async (title) => {
  if (/Likutei Moharan, Part II/.test(title)) return [{ title, length: 125 }];
  if (/Likutei Moharan/.test(title)) return [{ title, length: 286 }];
  if (/Sichot HaRan/.test(title)) return [{ title, length: 308 }];
  throw new Error('no shape (stub)');
};
sefaria.getText = async (ref) => ({
  ref, heRef: ref, hebrew: [HE, HE], english: [EN, EN],
  hebrewVersion: 'Stub Hebrew Edition', englishVersion: 'Stub Translation', license: 'CC0',
  url: 'https://www.sefaria.org/' + String(ref).replace(/ /g, '_'),
});
sefaria.getLinks = async () => ([{ index_title: 'Likutei Moharan', ref: 'Likutei Moharan 19', anchorRef: 'Deuteronomy 32:2' }]);
sefaria.getCalendars = async () => ({ calendar_items: [{ title: { en: 'Parashat Hashavua' }, ref: 'Deuteronomy 32:1-52' }] });
sefaria.search = async () => ({
  hits: Array.from({ length: 18 }, (_, i) => ({
    ref: `${BOOKS[i % BOOKS.length]} ${7 + i * 3}`,
    snippet: i % 3 === 0 ? 'מִצְוָה גְּדוֹלָה לִהְיוֹת בְּשִׂמְחָה תָּמִיד [STUB]'
      : 'It is a great mitzvah to be always in joy. [STUB SNIPPET]',
    lang: i % 3 === 0 ? 'he' : 'en',
    book: BOOKS[i % BOOKS.length],
  })),
  total: 184,
  via: 'stub',
});
sefaria.suggest = async () => ([
  { text: 'Likutei Moharan', kind: 'book' },
  { text: 'Likutei Tefilot', kind: 'book' },
  { text: 'simcha', kind: 'topic' },
]);

// server.js only listens when it is the program being run, so listen here.
const app = require('../../server.js');
const port = Number(process.env.PORT || 3222);
app.listen(port, '127.0.0.1', () => console.log('stub server on ' + port));
