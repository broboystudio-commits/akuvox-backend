# The iPhone app

A real app, not the website in a frame. Native screens, a native widget, and
Apple's own text rendering — which matters, because Apple rejects apps that are
just a website in a wrapper (their guideline 4.2, "minimum functionality").

**You can run this on your own phone without paying Apple anything.** The
$99/year Developer Program is only needed to put it in the App Store for other
people. See *Running it for free* below.

---

## What you need

- **A Mac.** Xcode is Mac-only. There is no way around this for building an
  iPhone app yourself.
- **Xcode**, free from the Mac App Store.
- **An Apple ID.** The free one you already have is enough to start.

---

## Setting it up in Xcode, step by step

You have never done this before, so every step is spelled out.

### 1. Make the project

1. Open Xcode → **File → New → Project**
2. Choose **iOS → App**, click **Next**
3. Fill in:
   - Product Name: `BreslovDaily`
   - Interface: **SwiftUI**
   - Language: **Swift**
   - Storage: **None**
   - Leave the test checkboxes unticked
4. Click **Next**, and save it somewhere you can find again

Xcode makes a project with two files, `BreslovDailyApp.swift` and
`ContentView.swift`. You are about to replace them.

### 2. Put this code in

1. In Xcode's left-hand list, select `ContentView.swift` and delete it
   (**Move to Trash**)
2. Drag these folders from `ios/native/BreslovDaily/` into the left-hand list,
   dropping them onto the blue `BreslovDaily` folder:
   - `Models`
   - `Services`
   - `Views`
3. When Xcode asks, tick **Copy items if needed** and **Create groups**
4. Drag `BreslovDailyApp.swift` in the same way, replacing the one Xcode made

### 3. Add the widget

1. **File → New → Target**
2. Choose **iOS → Widget Extension**, click **Next**
3. Product Name: `BreslovWidget`
4. **Untick "Include Live Activity"** and **untick "Include Configuration
   App Intent"**
5. Click **Finish**, then **Activate** when asked
6. Delete the `BreslovWidget.swift` Xcode made, and drag in
   `ios/native/BreslovWidget/BreslovWidget.swift`
7. Select `Models/Models.swift` in the list. On the right-hand panel, under
   **Target Membership**, tick **BreslovWidget** as well as **BreslovDaily**.
   The widget needs the same models the app uses.

### 4. Allow it to ask for your location

1. Select the blue `BreslovDaily` project at the top of the list
2. Choose the **BreslovDaily** target → **Info** tab
3. Hover a row, click **+**, and add:
   - Key: `Privacy - When In Use Usage Description`
   - Value: `Your location is used to work out your zmanim. It is not stored.`

### 5. Run it

1. Plug your iPhone in with a cable
2. At the top of the Xcode window, pick your iPhone from the device list
3. Press the **▶︎ play button**

The first time, your phone will refuse to open it. Go to
**Settings → General → VPN & Device Management** on the phone, tap your Apple
ID, and tap **Trust**.

---

## Running it for free

Signing in with an ordinary free Apple ID is enough to run this on your own
phone, widget and all. Two limits:

- **It expires after 7 days** and you have to press play again to reinstall.
- **Three apps at a time** signed this way.

That is enough to decide whether the app is worth the $99/year. When it is,
join the Apple Developer Program and the expiry goes away.

Everything here is deliberately built to work under those limits. In
particular the widget fetches its own copy of the day rather than reading one
the app saved, because sharing storage between an app and its widget needs the
App Groups capability, and that needs a paid account.

---

## Where its content comes from

Nothing is bundled. The app reads from the same server the website uses:

```
https://akuvox-backend.onrender.com
```

Change it under **Settings → Server** inside the app if it ever moves.

If the site is locked with a password, put it in the box underneath the address
on that same Settings screen. The widget reads the same one, so it only has to
be entered once.

A word of warning for when the app is real: the free hosting plan puts the
server to sleep after about fifteen quiet minutes, and waking it takes roughly
half a minute. The app and the widget both wait that out rather than showing an
error, but it makes a poor first impression. Render's paid plan at $7/month
removes it, and is worth doing before anyone else installs this.

---

## What is in here

| File | What it does |
|---|---|
| `BreslovDailyApp.swift` | The app's entry point |
| `Models/Models.swift` | The shapes the server sends. Shared with the widget |
| `Services/API.swift` | Fetching, caching, and keeping the last good copy on screen when the network fails |
| `Services/Settings.swift` | Everything the reader has chosen, and asking the phone for its location |
| `Views/Theme.swift` | The pastel rose and gold, in both light and dark |
| `Views/PassageView.swift` | Renders a passage: Hebrew, English, credits. Tells verses from paragraphs and numbers them |
| `Views/TodayView.swift` | The home screen |
| `Views/TehillimView.swift` | The day's Tehillim |
| `Views/TikkunView.swift` | The Tikkun HaKlali, as one continuous reading that remembers your place |
| `Views/WeeklyView.swift` | The week's Torah |
| `Views/ZmanimView.swift` | All the times, and which minhag you hold by |
| `Views/SearchView.swift` | Search, with suggestions as you type |
| `Views/AboutView.swift` | Settings, sources and privacy |
| `BreslovWidget/BreslovWidget.swift` | The widget, in five sizes |

---

## Honestly: expect to fix things on the first build

This Swift was written without a Swift compiler available, so it has never been
compiled. Its structure has been checked — brackets balance, every type is
defined, and every field name was verified against what the server actually
sends — but that is not the same as building.

Expect Xcode to complain about something the first time. Send the error text
and it can be fixed quickly; the logic and the layout are the hard part and
they are done.
