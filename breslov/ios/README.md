# Widgets on your iPhone

There are two ways to get this on your home screen. They are very different
amounts of work, so start with the first one.

---

## 1. The easy way — works today, no Mac, no App Store (about 5 minutes)

This uses a free app called **Scriptable**. It is a normal App Store app that
lets a small script draw a widget. This is the path to use.

1. Install **Scriptable** from the App Store (free).
2. Open `scriptable/BreslovDaily.js` in this folder and copy the whole thing.
3. In Scriptable tap **+** (top right), paste it in.
4. Near the top of the script, change this line to your own web address:

   ```js
   const SERVER = 'https://breslov-daily.onrender.com';
   ```

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

## 2. The real App Store app — needs a Mac with Xcode

`native/` holds the Swift source for a proper app and a real WidgetKit widget.

**Be aware:** these files were written here but **have not been compiled**,
because building Swift requires Xcode on a Mac. Treat them as a working
starting point, not a finished app. Expect to fix small things the first time
you build.

You also need an Apple Developer account ($99/year) to put anything on the
App Store.

### Setting it up in Xcode

1. Xcode → **File → New → Project → iOS → App**.
   Name it `BreslovDaily`, interface **SwiftUI**, language **Swift**.
2. Drag these into the app target:
   - `native/BreslovDaily/BreslovDailyApp.swift`
   - `native/BreslovDaily/ContentView.swift`
3. **File → New → Target → Widget Extension**, name it `BreslovWidget`.
   Untick "Include Live Activity". Replace the file Xcode generates with
   `native/BreslovWidget/BreslovWidget.swift`.
4. Add `native/Shared/BreslovAPI.swift` to **both** targets — tick both boxes
   in the file inspector on the right.
5. Select the project → **Signing & Capabilities** → **+ Capability** →
   **App Groups**, on both targets. Make a group such as
   `group.com.yourname.breslovdaily`.
6. In `BreslovAPI.swift` change two lines:
   ```swift
   static let server = URL(string: "https://your-address")!
   static let appGroup = "group.com.yourname.breslovdaily"
   ```
7. In `BreslovWidget.swift`, set the latitude, longitude and time zone near
   the top of `BreslovProvider` to where you live.
8. Build and run.

### What each file does

| File | Purpose |
|---|---|
| `Shared/BreslovAPI.swift` | Fetches `/api/widget`, decodes it, and saves the last good copy so the widget still works offline |
| `BreslovDaily/BreslovDailyApp.swift` | The app entry point |
| `BreslovDaily/ContentView.swift` | Shows the website inside the app |
| `BreslovWidget/BreslovWidget.swift` | The widget itself — timeline, refresh schedule, and a view for each size |

The widget asks iOS to refresh a minute after the next zman, so the countdown
stays honest without draining the battery. iOS decides the final timing.
