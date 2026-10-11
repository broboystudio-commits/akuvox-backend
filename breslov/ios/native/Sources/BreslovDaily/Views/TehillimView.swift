import SwiftUI

/// The day's Tehillim, one psalm after another, each with its own heading and
/// its verses numbered from its own first verse.
struct TehillimView: View {
    @Environment(\.colorScheme) private var scheme
    @EnvironmentObject private var settings: Settings
    @StateObject private var loader = Loader<Api.TehillimDay>(path: "/api/tehillim")

    var body: some View {
        let dark = scheme == .dark
        ScrollView {
            VStack(spacing: 14) {
                Card {
                    CardTitle(text: "Tehillim for today", trailing: loader.value?.label)
                    if let day = loader.value?.day, let cycle = loader.value?.cycle {
                        Text("Day \(day) of the Hebrew month — \(cycle).")
                            .font(.system(size: 14))
                            .foregroundStyle(Palette.inkSoft(dark))
                    }
                }
                ForEach(loader.value?.parts ?? []) { part in
                    Card { PassageView(passage: part) }
                }
                if (loader.value?.parts ?? []).isEmpty, loader.isLoading {
                    ProgressView().padding(30)
                }
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 24)
        }
        .breslovBackground(dark)
        .navigationTitle("Tehillim")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await reload() }
        .task { await reload() }
    }

    private func reload() async {
        await loader.load(using: API(server: settings.server, query: settings.query))
    }
}
