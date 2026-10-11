import SwiftUI

/// The home screen: the date, a short piece of Reb Nachman, the next few
/// zmanim, and the way in to everything else.
struct TodayView: View {
    @Environment(\.colorScheme) private var scheme
    @EnvironmentObject private var settings: Settings
    @StateObject private var loader = Loader<Api.Today>(path: "/api/today")
    @State private var showingFullLesson = false

    var body: some View {
        let dark = scheme == .dark

        ScrollView {
            VStack(spacing: 14) {
                if loader.isStale, loader.problem != nil {
                    staleNotice(dark)
                }

                hero(dark)

                if let spark = loader.value?.spark {
                    Card {
                        CardTitle(text: "A word for today", trailing: spark.title)
                        if spark.isAvailable {
                            if let he = spark.snippetHe, !he.isEmpty {
                                Text(he)
                                    .font(.system(size: 21 * settings.textScale))
                                    .lineSpacing(11)
                                    .multilineTextAlignment(.trailing)
                                    .frame(maxWidth: .infinity, alignment: .trailing)
                                    .environment(\.layoutDirection, .rightToLeft)
                                    .foregroundStyle(Palette.ink(dark))
                            }
                            if settings.showEnglish, let en = spark.snippetEn, !en.isEmpty {
                                Text(en)
                                    .font(.system(size: 16 * settings.textScale, design: .serif))
                                    .lineSpacing(5)
                                    .foregroundStyle(Palette.inkSoft(dark))
                            }
                            Button {
                                withAnimation(.spring(response: 0.34, dampingFraction: 0.78)) {
                                    showingFullLesson.toggle()
                                }
                            } label: {
                                Text(showingFullLesson ? "Hide the lesson" : "Read the whole lesson")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(SoftButton())

                            if showingFullLesson {
                                Divider().overlay(Palette.line(dark))
                                PassageView(passage: spark, showLabel: false)
                            }
                        } else {
                            PassageView(passage: spark, showLabel: false)
                        }
                    }
                }

                comingUp(dark)
                quickLinks(dark)
                shabbos(dark)
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 24)
        }
        .breslovBackground(dark)
        .navigationTitle("Today")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await reload() }
        .task { await reload() }
    }

    private func reload() async {
        await loader.load(using: API(server: settings.server, query: settings.query))
    }

    // MARK: - Pieces

    private func hero(_ dark: Bool) -> some View {
        let calendar = loader.value?.calendar
        return Card {
            VStack(spacing: 8) {
                Text(calendar?.gregorian?.long ?? calendar?.gregorian?.display ?? " ")
                    .font(.system(size: 12, weight: .medium))
                    .textCase(.uppercase)
                    .kerning(1.1)
                    .foregroundStyle(Palette.inkFaint(dark))

                Text(calendar?.hebrew?.display ?? " ")
                    .font(.system(size: 34, weight: .medium))
                    .environment(\.layoutDirection, .rightToLeft)
                    .foregroundStyle(Palette.sweep(dark))
                    .multilineTextAlignment(.center)

                HStack(spacing: 6) {
                    if let parsha = calendar?.parsha?.he ?? calendar?.parsha?.en {
                        Chip(text: parsha)
                    }
                    if calendar?.hebrew?.isRoshChodesh == true {
                        Chip(text: "Rosh Chodesh", gold: true)
                    }
                    ForEach(todaysHolidays(), id: \.self) { name in
                        Chip(text: name, gold: true)
                    }
                }
            }
            .frame(maxWidth: .infinity)
        }
    }

    /// Only what is true of today; the rest belong on the Shabbos card.
    private func todaysHolidays() -> [String] {
        guard let calendar = loader.value?.calendar,
              let today = calendar.gregorian?.iso else { return [] }
        return (calendar.holidays ?? [])
            .filter { $0.date == today }
            .compactMap { $0.en }
            .filter { !$0.hasPrefix("Candle") && !$0.hasPrefix("Havdalah") }
            .prefix(2)
            .map { $0 }
    }

    private func comingUp(_ dark: Bool) -> some View {
        let zmanim = loader.value?.zmanim
        let chosen = zmanim?.chosen ?? []
        let nextKey = zmanim?.next?.key
        let start = chosen.firstIndex { $0.key == nextKey } ?? max(0, chosen.count - 4)
        let soon = Array(chosen[start..<min(start + 4, chosen.count)])

        return Card {
            CardTitle(text: "Coming up", trailing: loader.value?.calendar?.place?.name)
            ForEach(soon) { zman in
                let isNext = zman.key == nextKey
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(zman.en ?? "")
                            .font(.system(size: 15, weight: isNext ? .semibold : .regular))
                            .foregroundStyle(isNext ? Palette.rose(dark) : Palette.ink(dark))
                        Text(zman.he ?? "")
                            .font(.system(size: 13))
                            .environment(\.layoutDirection, .rightToLeft)
                            .foregroundStyle(Palette.inkFaint(dark))
                    }
                    Spacer(minLength: 10)
                    VStack(alignment: .trailing, spacing: 1) {
                        Text(zman.time ?? "")
                            .font(.system(size: 16, weight: .semibold))
                            .monospacedDigit()
                            .foregroundStyle(isNext ? Palette.gold(dark) : Palette.ink(dark))
                        if isNext, let mins = zmanim?.next?.minutesAway {
                            Text(friendly(mins))
                                .font(.system(size: 11))
                                .foregroundStyle(Palette.inkFaint(dark))
                        }
                    }
                }
                .padding(.vertical, 7)
                .padding(.horizontal, isNext ? 12 : 0)
                .background(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(isNext ? Palette.rose(dark).opacity(dark ? 0.16 : 0.12) : .clear)
                )
            }
        }
    }

    private func quickLinks(_ dark: Bool) -> some View {
        HStack(spacing: 10) {
            NavigationLink { TehillimView() } label: {
                QuickCard(title: "Tehillim",
                          subtitle: loader.value?.tehillim?.label ?? "today's portion")
            }
            NavigationLink { TikkunView() } label: {
                QuickCard(title: "Tikkun HaKlali", subtitle: "ten psalms")
            }
        }
        .buttonStyle(.plain)
    }

    private func shabbos(_ dark: Bool) -> some View {
        let calendar = loader.value?.calendar
        return Card {
            CardTitle(text: "Shabbos", trailing: calendar?.parsha?.he ?? calendar?.parsha?.en)
            if let parsha = calendar?.parsha?.en {
                Row(name: "Parsha", value: parsha + ((calendar?.parsha?.isDouble ?? false) ? " (double)" : ""))
            }
            if let candles = calendar?.candles {
                Row(name: "Candle lighting", value: [candles.time, candles.date].compactMap { $0 }.joined(separator: " · "))
            }
            if let havdalah = calendar?.havdalah {
                Row(name: "Havdalah", value: [havdalah.time, havdalah.date].compactMap { $0 }.joined(separator: " · "))
            }
        }
    }

    private func staleNotice(_ dark: Bool) -> some View {
        Text("Showing saved learning — could not reach the server.")
            .font(.system(size: 13))
            .foregroundStyle(Palette.inkSoft(dark))
            .frame(maxWidth: .infinity)
            .padding(10)
            .background(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(Palette.card(dark).opacity(0.8))
            )
    }

    private func friendly(_ minutes: Int) -> String {
        if minutes < 1 { return "now" }
        if minutes < 60 { return "in \(minutes) min" }
        let h = minutes / 60, m = minutes % 60
        return m == 0 ? "in \(h)h" : "in \(h)h \(m)m"
    }
}

// MARK: - Small shared pieces

struct Chip: View {
    @Environment(\.colorScheme) private var scheme
    var text: String
    var gold: Bool = false

    var body: some View {
        let dark = scheme == .dark
        Text(text)
            .font(.system(size: 12))
            .foregroundStyle(gold ? Palette.gold(dark) : Palette.rose(dark))
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Capsule().fill(Palette.rose(dark).opacity(dark ? 0.18 : 0.12)))
    }
}

struct Row: View {
    @Environment(\.colorScheme) private var scheme
    var name: String
    var value: String

    var body: some View {
        let dark = scheme == .dark
        HStack(alignment: .firstTextBaseline) {
            Text(name).font(.system(size: 15)).foregroundStyle(Palette.inkSoft(dark))
            Spacer(minLength: 10)
            Text(value)
                .font(.system(size: 15, weight: .semibold))
                .multilineTextAlignment(.trailing)
                .foregroundStyle(Palette.ink(dark))
        }
        .padding(.vertical, 3)
    }
}

struct QuickCard: View {
    @Environment(\.colorScheme) private var scheme
    var title: String
    var subtitle: String

    var body: some View {
        let dark = scheme == .dark
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Palette.ink(dark))
            Text(subtitle)
                .font(.system(size: 12))
                .foregroundStyle(Palette.inkFaint(dark))
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .fill(Palette.card(dark))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .strokeBorder(Palette.line(dark), lineWidth: 1)
        )
    }
}

/// Buttons that squash slightly when pressed, like the website's.
struct SoftButton: ButtonStyle {
    @Environment(\.colorScheme) private var scheme

    func makeBody(configuration: Configuration) -> some View {
        let dark = scheme == .dark
        configuration.label
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(Palette.rose(dark))
            .padding(.vertical, 13)
            .padding(.horizontal, 18)
            .background(
                Capsule().fill(
                    LinearGradient(
                        colors: [
                            Palette.rose(dark).opacity(dark ? 0.22 : 0.16),
                            Palette.gold(dark).opacity(dark ? 0.20 : 0.14),
                        ],
                        startPoint: .leading, endPoint: .trailing
                    )
                )
            )
            .scaleEffect(configuration.isPressed ? 0.95 : 1)
            .animation(.spring(response: 0.3, dampingFraction: 0.6), value: configuration.isPressed)
    }
}
