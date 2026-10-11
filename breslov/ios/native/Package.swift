// swift-tools-version: 6.0

// The iPhone app, as a Swift package.
//
// Not an Xcode project. xtool builds an iOS app out of a plain SwiftPM
// package, which is why there is no .xcodeproj here and nothing to open in
// Xcode -- the whole point being that this can be built on Linux or Windows
// with no Mac in the room.
//
// The product is a LIBRARY and not an executable, which looks wrong and is
// not: xtool compiles the library and then packs it into the .app itself,
// supplying the entry point. `@main struct BreslovDailyApp: App` in
// Sources/BreslovDaily/BreslovDailyApp.swift is still what starts it.

import PackageDescription

let package = Package(
    name: "BreslovDaily",
    platforms: [
        // iOS 17 is what the SwiftUI in here already assumes, and it is what
        // xtool's own examples target.
        .iOS(.v17),
    ],
    products: [
        .library(
            name: "BreslovDaily",
            targets: ["BreslovDaily"]
        ),

        // ---- the widget, switched off on purpose ------------------------
        // Uncomment this, the target below, and the `extensions:` block in
        // xtool.yml to build the WidgetKit extension. Do not do it yet: see
        // WidgetKit-parked/WHY.md. The source is kept whole and ready.
        //
        // .library(
        //     name: "BreslovWidget",
        //     targets: ["BreslovWidget"]
        // ),
    ],
    targets: [
        .target(
            name: "BreslovDaily"
        ),

        // .target(name: "BreslovWidget"),
    ]
)
