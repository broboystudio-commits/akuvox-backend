# Widgets on your iPhone

**Before you start:** the app has to be online first, and you need its web
address (something like `https://breslov-daily.onrender.com`). If you do not
have one yet, do **Step 1** in the [main README](../README.md#getting-it-onto-your-phone)
first — it takes about five minutes in a browser.

There are two ways to get this on your home screen. They are very different
amounts of work, so start with the first one.

---

## 1. The easy way — works today, no Mac, no App Store (about 5 minutes)

This uses a free app called **Scriptable**. It is a normal App Store app that
lets a small script draw a widget. This is the path to use.

1. Install **Scriptable** from the App Store (free).
2. Open `scriptable/BreslovDaily.js` in this folder and copy the whole thing.
3. In Scriptable tap **+** (top right), paste it in.
4. The address is already filled in:

   ```js
   const SERVER = 'https://akuvox-backend.onrender.com';
   ```

   Only change it if you rename the service in Render, which changes the URL.

   Just below it is a password line:

   ```js
   const ACCESS_KEY = '';
   ```

   Leave it empty unless the site is locked with a password. If it is, put the
   same password between the quotes — the widget has nobody to ask, so it has
   to carry it.

5. Tap the settings icon, name it **Breslov Daily**, tap **Done**.
6. Go to your home screen, long-press an empty spot, tap **+**,
   search for **Scriptable**, pick a widget size, and tap **Add Widget**.
7. Long-press the widget you just added → **Edit Widget** →
   set **Script** to **Breslov Daily**.

That's it. Tapping the widget opens the full site.

### Sizes you can add

| Size | What it shows |
|---|---|
| Small | Hebrew date, the next zman, a line of the day's teaching |
| Medium | Date, parsha, candle lighting, next zman, the teaching |
| Large | Six key zmanim, today's Tehillim, the teaching in Hebrew and English |
| Lock screen (rectangular) | Hebrew date, next zman, parsha |
| Lock screen (inline) | The next zman, above the clock |

### The Parameter box

On the same **Edit Widget** screen there is a **Parameter** field. It is
optional:

- leave it **empty** — uses the location set inside the script
- type `here` — uses your phone's current location
- type `40.65,-73.95` — uses those exact coordinates

### If the widget says it cannot reach the server

Check the `SERVER` line. It must be the full address including `https://`,
with no slash on the end. You can test it in Safari first — open
`https://your-address/api/widget` and you should see a page of text.

---

## 2. The real app — no Mac needed any more

`native/` holds the Swift for a proper app. It used to say you needed a Mac
with Xcode. You do not: [xtool](https://github.com/xtool-org/xtool) builds and
signs iOS apps from a Swift package on Linux or Windows, and `native/` is laid
out as an xtool project.

**Everything about it is in [`native/README.md`](native/README.md)** — what to
install, what it costs, and two warnings worth reading before you start:

- the **native widget is switched off**, because xtool cannot currently build
  a WidgetKit extension that runs ([issue #313](https://github.com/xtool-org/xtool/issues/313),
  opened 10 October 2026, still open). The Scriptable widget above is
  unaffected and keeps working;
- Apple's licence agreement says their SDK belongs on Apple hardware, and
  xtool takes it out of a copy of Xcode you download. That is a real grey
  area and it is Apple's agreement to interpret.

**The Swift in there has never been compiled** — there is no Swift compiler on
the machine it was written on. The project layout has been checked against
xtool's own schema and SwiftPM's rules; the code has not been built. Expect
the first build to stop on something.

You still need an Apple Developer account ($99/year) to put anything on the
App Store. Running it on your own phone is free.
