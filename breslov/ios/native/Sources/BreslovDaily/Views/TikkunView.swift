import SwiftUI

/// The Tikkun HaKlali as one continuous reading.
///
/// It is said from beginning to end, so all ten are on one scroll with the
/// numbers along the top to move between them. Where the reader stopped is
/// remembered, because being interrupted partway is the ordinary case.
struct TikkunView: View {
    @Environment(\.colorScheme) private var scheme
    @EnvironmentObject private var settings: Settings
    @StateObject private var loader = Loader<Api.Tikkun>(path: "/api/tikkun")
    @State private var showResume = false

    private var parts: [Api.Passage] { loader.value?.parts ?? [] }

    var body: some View {
        let dark = scheme == .dark
        ScrollViewReader { scroller in
            ScrollView {
                VStack(spacing: 14) {
                    Card {
                        CardTitle(text: "Tikkun HaKlali",
                                  trailing: "\(min(settings.tikkunIndex + 1, max(parts.count, 1))) of \(parts.count)")
                        Text("The ten psalms Rebbe Nachman designated as the general remedy, said in order.")
                            .font(.system(size: 14))
                            .foregroundStyle(Palette.inkSoft(dark))

                        if showResume, settings.tikkunIndex > 0, settings.tikkunIndex < parts.count {
                            resumeBar(scroller, dark: dark)
                        }

                        numbers(scroller, dark: dark)
                    }

                    ForEach(Array(parts.enumerated()), id: \.offset) { index, part in
                        Card {
                            HStack(alignment: .firstTextBaseline) {
                                Text("Tehillim \(part.chapter ?? 0)")
                                    .font(.system(size: 17, weight: .semibold))
                                    .foregroundStyle(Palette.rose(dark))
                                Spacer()
                                Text("\(index + 1) of \(parts.count)")
                                    .font(.system(size: 12))
                                    .foregroundStyle(Palette.inkFaint(dark))
                            }
                            PassageView(passage: part, showLabel: false)
                        }
                        .id(index)
                        .onAppear { remember(index) }
                    }
                }
                .padding(.horizontal, 14)
                .padding(.bottom, 24)
            }
        }
        .breslovBackground(dark)
        .navigationTitle("Tikkun HaKlali")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            await reload()
            // Offer to carry on only if the reading was left partway today.
            let hoursSince = (Date().timeIntervalSince1970 - settings.tikkunAt) / 3600
            showResume = settings.tikkunIndex > 0 && hoursSince < 24
        }
    }

    private func numbers(_ scroller: ScrollViewProxy, dark: Bool) -> some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 5), spacing: 6) {
            ForEach(Array(parts.enumerated()), id: \.offset) { index, part in
                let active = index == settings.tikkunIndex
                Button {
                    withAnimation { scroller.scrollTo(index, anchor: .top) }
                    remember(index)
                } label: {
                    Text("\(part.chapter ?? 0)")
                        .font(.system(size: 14, weight: active ? .semibold : .regular))
                        .monospacedDigit()
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 9)
                        .background(
                            Capsule().fill(active
                                ? Palette.rose(dark).opacity(dark ? 0.30 : 0.20)
                                : Palette.rose(dark).opacity(dark ? 0.10 : 0.06))
                        )
                        .foregroundStyle(active ? Palette.rose(dark) : Palette.inkSoft(dark))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func resumeBar(_ scroller: ScrollViewProxy, dark: Bool) -> some View {
        let chapter = parts.indices.contains(settings.tikkunIndex)
            ? (parts[settings.tikkunIndex].chapter ?? 0) : 0
        return VStack(alignment: .leading, spacing: 10) {
            Text("You stopped at Tehillim \(chapter).")
                .font(.system(size: 14))
                .foregroundStyle(Palette.inkSoft(dark))
            HStack(spacing: 8) {
                Button("Carry on") {
                    withAnimation { scroller.scrollTo(settings.tikkunIndex, anchor: .top) }
                    showResume = false
                }
                .buttonStyle(SoftButton())
                Button("Start again") {
                    withAnimation { scroller.scrollTo(0, anchor: .top) }
                    remember(0)
                    showResume = false
                }
                .buttonStyle(SoftButton())
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Palette.gold(dark).opacity(dark ? 0.14 : 0.10))
        )
    }

    private func remember(_ index: Int) {
        settings.tikkunIndex = index
        settings.tikkunAt = Date().timeIntervalSince1970
    }

    private func reload() async {
        await loader.load(using: API(server: settings.server, query: settings.query))
    }
}
