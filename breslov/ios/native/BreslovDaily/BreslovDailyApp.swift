import SwiftUI

@main
struct BreslovDailyApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .preferredColorScheme(.dark)
                .ignoresSafeArea(.container, edges: .bottom)
        }
    }
}
