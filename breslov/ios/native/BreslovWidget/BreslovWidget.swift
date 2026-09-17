import WidgetKit
import SwiftUI

// MARK: - Timeline

struct BreslovEntry: TimelineEntry {
    let date: Date
    let data: BreslovAPI.Widget?
    let stale: Bool
}

struct BreslovProvider: TimelineProvider {

    /// Change these to your own location, or wire up CoreLocation later.
    private let latitude = 40.6501
    private let longitude = -73.9496
    private let timeZone = "America/New_York"
    private let placeName = "Brooklyn, NY"

    /// Which zmanim you hold by: "standard", "rabbeinu-tam",
    /// "rabbeinu-tam-zmanis", "magen-avraham" or "geonim".
    private let minhag = "standard"

    func placeholder(in context: Context) -> BreslovEntry {
        BreslovEntry(date: Date(), data: nil, stale: false)
    }

    func getSnapshot(in context: Context, completion: @escaping (BreslovEntry) -> Void) {
        Task {
            let result = await BreslovAPI.load(latitude: latitude, longitude: longitude,
                                               timeZone: timeZone, name: placeName,
                                               minhag: minhag)
            completion(BreslovEntry(date: Date(), data: result.data, stale: result.stale))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<BreslovEntry>) -> Void) {
        Task {
            let result = await BreslovAPI.load(latitude: latitude, longitude: longitude,
                                               timeZone: timeZone, name: placeName,
                                               minhag: minhag)
            let entry = BreslovEntry(date: Date(), data: result.data, stale: result.stale)

            // Refresh sooner when the next zman is close, so the countdown stays honest.
            let minutes = result.data?.next?.minutesAway ?? 30
            let wait = max(15, min(60, minutes + 1))
            let next = Calendar.current.date(byAdding: .minute, value: wait, to: Date())!

            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }
}

// MARK: - Colours

private extension Color {
    static let bdInk = Color(red: 0.925, green: 0.910, blue: 0.957)
    static let bdInkSoft = Color(red: 0.663, green: 0.635, blue: 0.741)
    static let bdInkFaint = Color(red: 0.478, green: 0.451, blue: 0.569)
    static let bdGold = Color(red: 0.847, green: 0.659, blue: 0.357)
    static let bdTop = Color(red: 0.133, green: 0.114, blue: 0.200)
    static let bdBottom = Color(red: 0.063, green: 0.055, blue: 0.090)
}

// MARK: - Views

struct BreslovWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: BreslovEntry

    var body: some View {
        Group {
            if let data = entry.data {
                switch family {
                case .systemSmall:            small(data)
                case .systemLarge:            large(data)
                case .accessoryRectangular:   rectangular(data)
                case .accessoryInline:        Text(inlineText(data))
                default:                      medium(data)
                }
            } else {
                unavailable
            }
        }
        .containerBackground(for: .widget) {
            LinearGradient(colors: [.bdTop, .bdBottom], startPoint: .top, endPoint: .bottom)
        }
    }

    // ---------------------------------------------------------------- sizes

    private func small(_ d: BreslovAPI.Widget) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(d.hebrewDate)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Color.bdGold)
                .environment(\.layoutDirection, .rightToLeft)
                .lineLimit(1)

            if let parsha = d.parsha {
                Text(parsha).font(.system(size: 10)).foregroundStyle(Color.bdInkFaint).lineLimit(1)
            }

            Spacer(minLength: 6)

            if let next = d.next {
                Text(next.title).font(.system(size: 11, weight: .medium))
                    .foregroundStyle(Color.bdInkSoft).lineLimit(1)
                Text(next.time ?? "").font(.system(size: 21, weight: .bold))
                    .foregroundStyle(Color.bdInk).lineLimit(1)
            }

            Spacer(minLength: 4)

            if let teaching = d.teaching {
                Text(teaching.heading).font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(Color.bdGold).lineLimit(1)
                Text(teaching.en).font(.system(size: 10))
                    .foregroundStyle(Color.bdInkSoft).lineLimit(3)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func medium(_ d: BreslovAPI.Widget) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(d.gregorian).font(.system(size: 10)).foregroundStyle(Color.bdInkFaint)
                    if let parsha = d.parsha {
                        Text(parsha).font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Color.bdInk)
                    }
                }
                Spacer()
                Text(d.hebrewDate)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(Color.bdGold)
                    .environment(\.layoutDirection, .rightToLeft)
            }

            if let next = d.next {
                Text("\(next.title) · \(next.time ?? "")")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Color.bdInkSoft).lineLimit(1)
            }

            if let teaching = d.teaching {
                Text(teaching.heading).font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Color.bdGold).lineLimit(1)
                Text(teaching.en).font(.system(size: 11))
                    .foregroundStyle(Color.bdInkSoft).lineLimit(3)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func large(_ d: BreslovAPI.Widget) -> some View {
        let wanted = ["sunrise", "sofZmanShmaGRA", "chatzos", "minchaKetana", "sunset", "tzais"]
        let rows = d.times.filter { wanted.contains($0.key ?? "") }

        return VStack(alignment: .leading, spacing: 5) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(d.gregorian).font(.system(size: 10)).foregroundStyle(Color.bdInkFaint)
                    if let parsha = d.parsha {
                        Text("Parshas \(parsha)").font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Color.bdInk)
                    }
                }
                Spacer()
                Text(d.hebrewDate).font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Color.bdGold)
                    .environment(\.layoutDirection, .rightToLeft)
            }

            ForEach(rows, id: \.key) { row in
                let isNext = d.next?.title == row.title
                HStack {
                    Text(row.title).font(.system(size: 11))
                        .foregroundStyle(isNext ? Color.bdGold : Color.bdInkSoft)
                    Spacer()
                    Text(row.time ?? "")
                        .font(.system(size: 11, weight: isNext ? .bold : .medium))
                        .foregroundStyle(isNext ? Color.bdGold : Color.bdInk)
                }
            }

            if let tehillim = d.tehillim {
                Text("Tehillim today: \(tehillim)").font(.system(size: 10))
                    .foregroundStyle(Color.bdInkFaint)
            }

            if let teaching = d.teaching {
                Text(teaching.heading).font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Color.bdGold)
                Text(teaching.he).font(.system(size: 13))
                    .foregroundStyle(Color.bdInk)
                    .environment(\.layoutDirection, .rightToLeft)
                    .lineLimit(3)
                Text(teaching.en).font(.system(size: 11))
                    .foregroundStyle(Color.bdInkSoft).lineLimit(5)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func rectangular(_ d: BreslovAPI.Widget) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(d.hebrewDate).font(.system(size: 13, weight: .semibold)).lineLimit(1)
            if let next = d.next {
                Text("\(next.title) \(next.time ?? "")").font(.system(size: 12)).lineLimit(1)
            }
            if let parsha = d.parsha {
                Text(parsha).font(.system(size: 11)).lineLimit(1)
            }
        }
    }

    private func inlineText(_ d: BreslovAPI.Widget) -> String {
        if let next = d.next { return "\(next.title) \(next.time ?? "")" }
        return d.hebrewDateEn
    }

    private var unavailable: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Breslov Daily").font(.system(size: 12, weight: .semibold))
                .foregroundStyle(Color.bdGold)
            Text("Could not reach the server.").font(.system(size: 11))
                .foregroundStyle(Color.bdInk)
        }
    }
}

// MARK: - Widget declarations

struct BreslovWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "BreslovWidget", provider: BreslovProvider()) { entry in
            BreslovWidgetView(entry: entry)
        }
        .configurationDisplayName("Breslov Daily")
        .description("The Hebrew date, the next zman and today's teaching from Rebbe Nachman.")
        .supportedFamilies([
            .systemSmall, .systemMedium, .systemLarge,
            .accessoryRectangular, .accessoryInline,
        ])
    }
}

@main
struct BreslovWidgetBundle: WidgetBundle {
    var body: some Widget {
        BreslovWidget()
    }
}
