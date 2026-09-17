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

## Getting it onto your phone

Your phone cannot open this yet, because it is only code — nothing is running
anywhere. There is one step in the middle: put it online. That gives you a web
address, and then the phone just opens that address.

**All of this happens in a web browser on your computer. Nothing to install,
no black terminal window, no commands to type.**

### Step 1 — put it online (about 5 minutes, free)

1. Go to **[render.com](https://render.com)** and click **Get Started** →
   **GitHub**. Let it connect to your GitHub account.
2. Click **New +** (top right) → **Web Service**.
3. Find this repository in the list and click **Connect**.
   If you do not see it, click *Configure account* and give Render permission
   to see it.
4. Now fill in the boxes. Most are already right; these four matter:

   | Box | What to put |
   |---|---|
   | **Branch** | `claude/daily-verses-app-widgets-promcg` |
   | **Root Directory** | `breslov` |
   | **Build Command** | `npm install` |
   | **Start Command** | `npm start` |

   Leave **Instance Type** on **Free**.
5. Click **Create Web Service** and wait. It takes 2–3 minutes. When the log
   stops and says **Live**, you are done.
6. At the top of the page is your address, something like
   **`https://breslov-daily.onrender.com`**. That is the app. Write it down —
   you need it twice more below.

Open that address in your computer's browser first, just to see it working.

### Step 2 — put it on your home screen

On your iPhone:

1. Open **Safari** (it has to be Safari, not Chrome) and go to your address.
2. Tap the **Share** button — the square with the arrow pointing up, at the
   bottom of the screen.
3. Scroll down the list and tap **Add to Home Screen**.
4. Tap **Add**.

You now have an icon on your home screen. Tapping it opens the app full
screen, with no browser bars. Learning you have already opened stays readable
even with no signal.

### Step 3 — the widget

Follow **[ios/README.md](ios/README.md)**. It takes about five minutes with a
free app called Scriptable, and you will need the same web address from
Step 1.

### One thing to know about the free plan

Render's free plan puts the server to sleep after about 15 minutes with nobody
using it. The next visit has to wake it, which takes 30 seconds or so — the
page just sits there and then loads normally. After that it is fast until it
goes quiet again.

The widget waits up to 35 seconds for this, and if the server is still waking
it shows the last saved copy marked *"saved copy — offline"* rather than
nothing.

If that bothers you, Render's **Starter** plan is $7/month and never sleeps.
Everything else is identical.

---

## Running it on your own computer instead

Only needed if you want to change the code. Skip this otherwise.

You need Node.js installed (nodejs.org, the green "LTS" button).

```bash
cd breslov
npm install
npm start
```

Then open **http://localhost:3000**.

To check everything is working:

```bash
npm run check
```

That prints `ok` or `FAIL` next to each part. The calendar and zmanim should
always pass. The last line tells you whether the computer can reach Sefaria
for the texts.

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
