# The widget is here, and it is switched off

`BreslovWidget.swift` is whole and unchanged. It is parked outside
`Sources/` so that SwiftPM does not try to build it, and the lines that would
build it are commented out in `Package.swift` and `xtool.yml` rather than
deleted.

## Why

xtool cannot currently build a working WidgetKit extension.

[xtool issue #313](https://github.com/xtool-org/xtool/issues/313), opened
10 October 2026 and still open with no maintainer reply, reports two faults
in the same breath:

- the built `.appex` has **no `__text` section** — an empty binary — because
  the packer passes `-e _NSExtensionMain` and the linker then drops the widget
  code as unreachable;
- with that flag removed by hand, the extension launches and immediately traps
  with `EXC_BREAKPOINT` inside Apple's own ExtensionFoundation, before any
  widget has registered.

The same issue notes that `SignerImpl.sign` forwards only the root app's
entitlements to nested bundles, so even a widget that built would be signed
wrong.

None of that is a fault in the code in this folder. It is the toolchain, and
it is a week old.

## What you lose by leaving it off

Nothing you have today. The widget on the home screen is the Scriptable one
(`ios/scriptable/BreslovDaily.js`) and it keeps working exactly as it does
now, because it has nothing to do with this app. This parked file is the
*native* widget, which has never run.

## Switching it back on

Three edits, when issue #313 closes:

1. `Package.swift` — uncomment the `BreslovWidget` library product and the
   `.target(name: "BreslovWidget")`.
2. `xtool.yml` — uncomment the `extensions:` block.
3. Move this file's neighbour into the package:
   `git mv WidgetKit-parked/BreslovWidget.swift Sources/BreslovWidget/BreslovWidget.swift`

`Support/BreslovWidget-Info.plist` is already written and already carries the
`com.apple.widgetkit-extension` identifier, so there is nothing to work out.

One thing to check when you do: a widget and its app can only share saved
settings through an App Group, and App Groups need a paid Apple Developer
account. `Services/API.swift` deliberately caches to the app's own folder for
exactly this reason, so the app needs no App Group — but the widget will want
one if it is to read anything the app saved. xtool
[PR #284](https://github.com/xtool-org/xtool/pull/284) proposes allowing one
App Group on free teams; until that lands, the widget should fetch from the
server itself rather than read the app's cache.
