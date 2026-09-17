# Breslov Daily

A website, a phone app and iPhone widgets for a daily piece of Rebbe Nachman,
the day's Tehillim, the Tikkun HaKlali, your zmanim, and a Torah for the week.

Written to be run by someone who is not a programmer. Everything below is
copy-and-paste.

---

## What it gives you

| | |
|---|---|
| **Today's teaching** | A piece of Reb Nachman every day, rotating through Likutei Moharan, Likutei Moharan II, Sichot HaRan, Sefer HaMiddot and Likutei Etzot |
| **Today's Tehillim** | The standard monthly cycle, by the day of the Hebrew month |
| **Tikkun HaKlali** | All ten psalms — 16, 32, 41, 42, 59, 77, 90, 105, 137, 150 — in order, with a tab for each |
| **Zmanim** | Fourteen times for wherever you are: alos, misheyakir, netz, sof zman shema and tefilla (GRA and MGA), chatzos, mincha gedola and ketana, plag, shkia, tzais |
| **Shabbos** | The parsha, candle lighting and havdalah for your location |
| **Torah of the week** | One lesson, the same all week. It looks for a lesson where Reb Nachman darshans a verse from that week's parsha, and if there isn't one it gives a featured lesson instead |

Hebrew and English side by side. You can turn English off and make the text
bigger, and it remembers what you chose.

### Where the words come from

Every word of Torah in this app is fetched live from
**[Sefaria](https://www.sefaria.org)**, with the edition and translator shown
under each passage. Nothing is typed in by hand and nothing is paraphrased.
If the server cannot reach Sefaria, the app says so plainly rather than showing
you something that might be wrong.

Zmanim are calculated on the server with **kosher-zmanim** (the JavaScript
version of KosherJava, the library most zmanim apps use). The Hebrew calendar,
the parsha and candle lighting come from **@hebcal/core**. Both run locally —
no internet needed for times and dates.

> Times are a guide. Follow your rav and your shul's luach.

---

## Getting it running

### On your own computer, to try it

You need Node.js installed (nodejs.org, the "LTS" button).

```bash
cd breslov
npm install
npm start
```

Then open **http://localhost:3000** in your browser.

To check everything is working:

```bash
npm run check
```

That prints a list with `ok` or `FAIL` next to each part. The calendar and
zmanim should always pass. The last line tells you whether the computer can
reach Sefaria for the texts.

### Putting it on the internet (Render, free)

1. Push this repo to GitHub.
2. Go to [render.com](https://render.com), sign in with GitHub.
3. **New → Blueprint**, pick this repo. Render reads `breslov/render.yaml`
   and sets everything up.
4. Wait for it to build. You get an address like
   `https://breslov-daily.onrender.com`.
5. Optional but worth it — in Render's **Shell** tab run:
   ```bash
   npm run seed
   ```
   That downloads the texts ahead of time so the site loads instantly.

On Render's free plan the server goes to sleep when nobody uses it, so the
first visit after a quiet spell takes 30 seconds or so. Any paid plan removes
that.

### Putting it on your iPhone

**As an app icon:** open the site in Safari, tap the Share button, then
**Add to Home Screen**. It opens full screen with no browser bars, and the
learning you have already opened still works with no signal.

**As a widget:** see **[ios/README.md](ios/README.md)**. The quick way takes
about five minutes with the free Scriptable app and needs no Mac. There is
also Swift source for a real App Store app in `ios/native/`, for later.

---

## How the pieces fit together

```
breslov/
├── server.js              the web server — start here
├── lib/
│   ├── dates.js           Hebrew date, parsha, candle lighting
│   ├── zmanim.js          the fourteen halachic times
│   ├── sefaria.js         downloads the texts, and saves them
│   ├── library.js         which seforim, and the Tehillim divisions
│   ├── daily.js           decides what today and this week get
│   └── util.js            the rotation maths, text tidying
├── public/                the website itself
│   ├── index.html  styles.css  app.js
│   ├── sw.js              makes it work offline
│   └── manifest.webmanifest   makes it installable
├── scripts/
│   ├── seed.js            downloads texts ahead of time
│   ├── selftest.js        the `npm run check` report
│   └── make-icons.js      draws the app icons
├── ios/
│   ├── scriptable/        the widget that works today
│   └── native/            Swift source for an App Store app
└── data/cache/            downloaded texts live here
```

### How "today's teaching" is chosen

It is not random each time you open it — everyone sees the same thing on the
same day, and it does not repeat. The day number is used to pick a spot in a
fixed shuffled order of all the lessons, so every lesson comes up exactly once
before any comes up again. The weekly Torah works the same way but changes
only on Sunday.

---

## The web addresses the app uses

Handy if you want to build something else on top of it.

| Address | What comes back |
|---|---|
| `/api/today` | Everything the home screen needs, in one go |
| `/api/widget` | A small version for the iPhone widgets |
| `/api/zmanim` | The times, with the next one marked |
| `/api/calendar` | Hebrew date, parsha, candles, yomim tovim |
| `/api/daily` | Today's teaching |
| `/api/tehillim` | Today's Tehillim |
| `/api/tikkun` | All ten psalms of the Tikkun HaKlali |
| `/api/weekly` | This week's Torah |
| `/api/health` | Is the server alive |

All of them take an optional location:

```
?lat=40.65&lng=-73.95&tz=America/New_York&name=Brooklyn
```

Leave it off and it uses Brooklyn, NY. Add `&date=2026-09-17` to look at a
different day.

---

## Changing things

| To change | Edit |
|---|---|
| The default location | `lib/dates.js`, the `DEFAULT_PLACE` block at the top |
| Which zmanim are shown, or which opinion | `lib/zmanim.js`, the `ZMANIM_TABLE` list |
| Which seforim are in the rotation, or how often each comes up | `lib/library.js`, the `BOOKS` list — `weight` is how often |
| The Tehillim division | `lib/library.js`, `TEHILLIM_BY_DAY` |
| Colours and fonts | `public/styles.css`, the `:root` block at the top |
| The app icon | `scripts/make-icons.js`, then run `node scripts/make-icons.js` |

---

## Credits

Texts from [Sefaria](https://www.sefaria.org) — each passage shows its edition
and translator, and links back to the source.
Zmanim by [kosher-zmanim](https://github.com/BehindTheMath/KosherZmanim) /
KosherJava. Calendar by [Hebcal](https://www.hebcal.com).
