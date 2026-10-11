import SwiftUI

/// The five tabs, matching the website.
struct RootView: View {
    @EnvironmentObject private var settings: Settings

    var body: some View {
        TabView {
            NavigationStack { TodayView() }
                .tabItem { Label("Today", systemImage: "sun.max") }

            NavigationStack { TehillimView() }
                .tabItem { Label("Tehillim", systemImage: "book") }

            NavigationStack { TikkunView() }
                .tabItem { Label("Tikkun", systemImage: "circle.circle") }

            NavigationStack { WeeklyView() }
                .tabItem { Label("Weekly", systemImage: "scroll") }

            NavigationStack { ZmanimView() }
                .tabItem { Label("Zmanim", systemImage: "clock") }

            NavigationStack { SearchView() }
                .tabItem { Label("Search", systemImage: "magnifyingglass") }

            NavigationStack { AboutView() }
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
        .tint(Palette.rose(settings.colorScheme == .dark))
    }
}
