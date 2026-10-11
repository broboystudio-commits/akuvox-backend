# The iPhone app

A real app, not the website in a frame. Native screens and Apple's own text
rendering — which matters, because Apple rejects apps that are just a website
in a wrapper (their guideline 4.2, "minimum functionality").

**You no longer need a Mac to build it.** That changed with
[xtool](https://github.com/xtool-org/xtool), which builds and signs iOS apps
from a plain Swift package on Linux or Windows. This folder is laid out as an
xtool project. The old instructions in this file told you to buy a Mac; they
were right when they were written and they are not right now.

**Read the two warnings below before you spend an evening on this.**

---

## Warning 1: the widget is switched off

The native widget does not build. Not because of anything here —
[xtool issue #313](https://github.com/xtool-org/xtool/issues/313), opened
10 October 2026 and still open, reports that a WidgetKit extension comes out
with an empty binary and then crashes on launch.

So `BreslovWidget.swift` sits in `WidgetKit-parked/`, whole and unchanged,
with the three lines needed to switch it back on written down in
[`WidgetKit-parked/WHY.md`](WidgetKit-parked/WHY.md).

**You lose nothing by this.** The widget on your home screen today is the
Scriptable one (`../scriptable/BreslovDaily.js`) and it carries on exactly as
it is — it has nothing to do with this app. The parked file is the *native*
widget, which has never run anywhere.

## Warning 2: the licence question

Apple's Developer Program License Agreement says the SDK may only be installed
on Apple-branded hardware, and xtool works by extracting that SDK from a copy
of Xcode you download. Whether that matters is argued about —
[OSNews](https://www.osnews.com/story/142331/xtool-cross-platform-xcode-replacement-for-linux-windows-and-macos/)
reads it as a clear conflict. Nobody has been penalised for it that anyone
knows of, and it is Apple's agreement to interpret, not mine.

For putting this on your own phone, it is between you and that agreement. If
you ever submit it to the App Store, know that you did it this way.

---

## What you need

- **A PC running Linux, or Windows with WSL.** Not a Mac. (A Mac works too.)
- **An Apple ID.** A free one is enough to run it on your own phone.
- **About 8GB of download** — Xcode, from Apple, which xtool takes the SDK out
  of. You never install or open it.
- **Your iPhone and a cable.**
- **$99/year** only if you want it in the App Store for other people.

---

## Setting it up, once

These are xtool's own steps, not mine. If anything here disagrees with
[their installation guide](https://xtool.sh/documentation/xtooldocs/installation-linux),
believe theirs.

### 1. Swift

Install the Swift 6.4 toolchain from <https://swift.org/install/linux>, then:

```bash
swift --version
```

### 2. usbmuxd — how Linux talks to an iPhone

```bash
sudo apt-get install usbmuxd libimobiledevice-utils
ideviceinfo          # with the phone plugged in, this should print its name
```

On Windows you also need USB passthrough into WSL — Microsoft's
[USBIPD instructions](https://learn.microsoft.com/en-us/windows/wsl/connect-usb).

### 3. Xcode

Download **Xcode 27** from
<https://developer.apple.com/download/all/?q=Xcode>. Use a browser, not
`curl` — it asks you to log in. Note where the `.xip` file lands.

### 4. xtool

```bash
curl -fL \
  "https://github.com/xtool-org/xtool/releases/latest/download/xtool-$(uname -m).AppImage" \
  -o xtool
chmod +x xtool
sudo mv xtool /usr/local/bin/
xtool --help
```

### 5. Log in and hand over the SDK

```bash
xtool setup
```

It asks how you want to log in. Without a paid developer account, choose
**Password** — it uses private Apple APIs, so if that makes you uneasy, make a
throwaway Apple ID for it. Then it asks for the path to the `Xcode.xip` you
downloaded, and extracts the SDK itself. That part is slow.

```bash
swift sdk list          # should print: darwin
```

---

## Building and running it

Plug the phone in, then from **this folder**:

```bash
cd ios/native
xtool dev
```

That builds the app, signs it, installs it on the phone and launches it. The
first build is slow — it is compiling the iOS SDK's Swift modules — and later
ones are much faster.

The first time, the phone refuses to open it. Go to **Settings → General →
VPN & Device Management**, tap your Apple ID, tap **Trust**.

### Before you build, change one line

`xtool.yml` says:

```yaml
bundleID: com.example.BreslovDaily
```

Make that yours — `com.yourname.breslovdaily` or anything nobody else would
pick. For your own phone it only has to be unique to you.

---

## Running it for free

A free Apple ID is enough to run this on your own phone. Two limits:

- **It expires after seven days.** Run `xtool dev` again to reinstall.
- **Three apps at a time** signed this way.

Everything here is built to live inside those limits. In particular
`Services/API.swift` caches to the app's own folder rather than a shared
container, so the app needs no App Groups capability — which needs a paid
account.

---

## Where its content comes from

Nothing is bundled. The app reads the same server the website uses:

```
https://akuvox-backend.onrender.com
```

Change it under **Settings → Server** inside the app if it ever moves. If the
site is password-locked, the box underneath takes it.

A word of warning for when the app is real: the free hosting plan puts the
server to sleep after about fifteen quiet minutes and waking it takes roughly
half a minute. The app waits that out rather than showing an error, but it
makes a poor first impression. Render's $7/month plan removes it, and is worth
doing before anyone else installs this.

---

## What is in here

| File | What it does |
|---|---|
| `Package.swift` | The Swift package. A library, not an executable — xtool supplies the app's entry point when it packs it |
| `xtool.yml` | Bundle ID, which product is the app, where the Info.plist is |
| `Support/Info.plist` | The sentence iOS shows when the app asks for your location. Without it the system kills the app the moment it asks |
| `Sources/BreslovDaily/BreslovDailyApp.swift` | The app's entry point |
| `Sources/BreslovDaily/Models/Models.swift` | The shapes the server sends |
| `Sources/BreslovDaily/Services/API.swift` | Fetching, caching, keeping the last good copy on screen when the network fails |
| `Sources/BreslovDaily/Services/Settings.swift` | Everything the reader has chosen, and asking the phone for its location |
| `Sources/BreslovDaily/Views/Theme.swift` | The colours, in both light and dark |
| `Sources/BreslovDaily/Views/PassageView.swift` | Renders a passage: Hebrew, English, credits |
| `Sources/BreslovDaily/Views/TodayView.swift` | The home screen |
| `Sources/BreslovDaily/Views/TehillimView.swift` | The day's Tehillim |
| `Sources/BreslovDaily/Views/TikkunView.swift` | The Tikkun HaKlali, remembering your place |
| `Sources/BreslovDaily/Views/WeeklyView.swift` | The week's Torah |
| `Sources/BreslovDaily/Views/ZmanimView.swift` | All the times, and which minhag you hold by |
| `Sources/BreslovDaily/Views/SearchView.swift` | Search, with suggestions as you type |
| `Sources/BreslovDaily/Views/AboutView.swift` | Settings, sources and privacy |
| `WidgetKit-parked/BreslovWidget.swift` | The native widget. Switched off — see `WHY.md` beside it |
| `Support/BreslovWidget-Info.plist` | Written and waiting for the day it is switched on |

---

## Honestly: expect to fix things on the first build

**This Swift has never been compiled.** There is no Swift compiler on the
machine it was written on, and there is not one there now.

What *has* been checked, and can be checked without one: `xtool.yml` parses,
every key in it is a key xtool's own `PackSchemaBase` decodes, both plists
parse, the product named in the manifest matches a library and a target in
`Package.swift`, `Sources/BreslovDaily/` holds the fourteen Swift files,
`@main` is inside the target, nothing is loose in `Sources/` for SwiftPM to
trip over, and the location permission the code asks for has its sentence in
the Info.plist.

That is the layout being right. It is not the code compiling.

Expect the first `xtool dev` to stop on something. Send the error text and it
can be fixed quickly — the logic and the screens are the hard part and they
are written.
