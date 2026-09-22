import SwiftUI

/// All of today's times, following the minhag the reader holds by.
struct ZmanimView: View {
    @Environment(\.colorScheme) private var scheme
    @EnvironmentObject private var settings: Settings
    @StateObject private var loader = Loader<Api.Zmanim>(path: "/api/zmanim")

    var body: some View {
        let dark = scheme == .dark
        ScrollView {
            VStack(spacing: 14) {
                Card {
                    CardTitle(text: "Zmanim", trailing: loader.value?.place?.name)
                    ForEach(loader.value?.chosen ?? []) { zman in
                        let isNext = zman.key == loader.value?.next?.key
                        HStack(alignment: .firstTextBaseline) {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(zman.en ?? "")
                                    .font(.system(size: 15, weight: isNext ? .semibold : .regular))
                                    .foregroundStyle(isNext ? Palette.rose(dark) : Palette.ink(dark))
                                Text(zman.he ?? "")
                                    .font(.system(size: 13))
                                    .environment(\.layoutDirection, .rightToLeft)
                                    .foregroundStyle(Palette.inkFaint(dark))
                                if isNext, let note = zman.note {
                                    Text(note)
                                        .font(.system(size: 11))
                                        .foregroundStyle(Palette.inkFaint(dark))
                                }
                            }
                            Spacer(minLength: 10)
                            Text(zman.time ?? "")
                                .font(.system(size: 16, weight: .semibold))
                                .monospacedDigit()
                                .foregroundStyle(isNext ? Palette.gold(dark) : Palette.ink(dark))
                        }
                        .padding(.vertical, 8)
                        .padding(.horizontal, isNext ? 12 : 0)
                        .background(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .fill(isNext ? Palette.rose(dark).opacity(dark ? 0.16 : 0.12) : .clear)
                        )
                    }
                }

                minhagPicker(dark)

                Text("Calculated for your location using the KosherJava algorithms. Times are a guide — follow your rav and your shul's luach.")
                    .font(.system(size: 12))
                    .foregroundStyle(Palette.inkFaint(dark))
                    .padding(.horizontal, 6)
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 24)
        }
        .breslovBackground(dark)
        .navigationTitle("Zmanim")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await reload() }
        .task { await reload() }
    }

    private func minhagPicker(_ dark: Bool) -> some View {
        Card {
            CardTitle(text: "Which zmanim you hold by")
            Text("Everything follows your choice, including the countdown and the widget.")
                .font(.system(size: 14))
                .foregroundStyle(Palette.inkSoft(dark))

            ForEach(loader.value?.options?.presets ?? []) { preset in
                let chosen = settings.minhag == (preset.id ?? "")
                Button {
                    settings.minhag = preset.id ?? "standard"
                    Task { await reload() }
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(preset.label ?? "")
                                .font(.system(size: 15, weight: chosen ? .semibold : .regular))
                                .foregroundStyle(chosen ? Palette.rose(dark) : Palette.ink(dark))
                            if let about = preset.about {
                                Text(about)
                                    .font(.system(size: 12))
                                    .foregroundStyle(Palette.inkFaint(dark))
                            }
                        }
                        Spacer()
                        if chosen {
                            Image(systemName: "checkmark")
                                .foregroundStyle(Palette.gold(dark))
                        }
                    }
                    .padding(.vertical, 9)
                }
                .buttonStyle(.plain)
                Divider().overlay(Palette.line(dark))
            }
        }
    }

    private func reload() async {
        await loader.load(using: API(server: settings.server, query: settings.query))
    }
}
