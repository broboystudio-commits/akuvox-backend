import SwiftUI

/// One lesson for the whole week, tied to the parsha where Sefaria links one.
struct WeeklyView: View {
    @Environment(\.colorScheme) private var scheme
    @EnvironmentObject private var settings: Settings
    @StateObject private var loader = Loader<Api.Passage>(path: "/api/weekly")

    var body: some View {
        let dark = scheme == .dark
        ScrollView {
            VStack(spacing: 14) {
                Card {
                    CardTitle(text: "Torah of the week",
                              trailing: loader.value?.parshaHe ?? loader.value?.parsha)
                    if let why = loader.value?.why {
                        Text(why + " It stays the same all week.")
                            .font(.system(size: 14))
                            .foregroundStyle(Palette.inkSoft(dark))
                    }
                    if let weekly = loader.value {
                        PassageView(passage: weekly, showLabel: false)
                    } else if loader.isLoading {
                        ProgressView().frame(maxWidth: .infinity).padding(20)
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 24)
        }
        .breslovBackground(dark)
        .navigationTitle("This week")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await reload() }
        .task { await reload() }
    }

    private func reload() async {
        await loader.load(using: API(server: settings.server, query: settings.query))
    }
}
