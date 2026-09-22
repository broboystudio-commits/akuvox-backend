import WidgetKit
import SwiftUI

/// The home screen and lock screen widget.
///
/// It fetches for itself rather than reading anything the app saved. That is
/// deliberate: sharing storage between an app and its widget needs the App
/// Groups capability, which requires a paid Apple account. Fetching its own
/// copy means the whole thing can be built with a free Apple ID and run on
/// your own phone before you have paid Apple anything.
///
/// It reads the same settings the app writes, through the shared defaults iOS
/// gives every target in the same app, falling back to sensible values.

// MARK: - Where and how

private enum WidgetSettings {
    static var server: String {
        UserDefaults.standard.string(forKey: "server") ?? "https://akuvox-backend.onrender.com"
    }
    static var latitude: Double {
        let value = UserDefaults.standard.double(forKey: "latitude")
        return value == 0 ? 40.6501 : value
    }
    static var longitude: Double {
        let value = UserDefaults.standard.double(forKey: "longitude")
        return value == 0 ? -73.9496 : value
    }
    static var placeName: String {
        UserDefaults.standard.string(forKey: "placeName") ?? "Brooklyn, NY"
    }
    static var minhag: String {
        UserDefaults.standard.string(forKey: "minhag") ?? "standard"
    }

    static var url: URL? {
        guard var parts = URLComponents(string: server) else { return nil }
        parts.path = "/api/widget"
        parts.queryItems = [
            URLQueryItem(name: "lat", value: String(latitude)),
            URLQueryItem(name: "lng", value: String(longitude)),
            URLQueryItem(name: "tz", value: TimeZone.current.identifier),
            URLQueryItem(name: "name", value: placeName),
            URLQueryItem(name: "minhag", value: minhag),
        ]
        return parts.url
    }
}

/// Keeps the last good answer so a sleeping server does not empty the widget.
private enum WidgetCache {
    private static var file: URL? {
        FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?
            .appendingPathComponent("breslov-widget.json")
    }
    static func save(_ data: Data) {
        guard let file else { return }
        try? data.write(to: file, options: .atomic)
    }
    static func load() -> Api.WidgetPayload? {
        guard let file, let data = try? Data(contentsOf: file) else { return nil }
        return try? JSONDecoder().decode(Api.WidgetPayload.self, from: data)
    }
}

private func fetchWidgetPayload() async -> (Api.WidgetPayload?, Bool) {
    guard let url = WidgetSettings.url else { return (WidgetCache.load(), true) }
    var request = URLRequest(url: url)
    // A free hosting plan sleeps when idle and wakes in about half a minute.
    request.timeoutInterval = 35
    request.cachePolicy = .reloadIgnoringLocalCacheData
    do {
        let (data, _) = try await URLSession.shared.data(for: request)
        let decoded = try JSONDecoder().decode(Api.WidgetPayload.self, from: data)
        WidgetCache.save(data)
        return (decoded, false)
    } catch {
        return (WidgetCache.load(), true)
    }
}

// MARK: - Timeline

struct BreslovEntry: TimelineEntry {
    let date: Date
    let data: Api.WidgetPayload?
    let stale: Bool
}

struct BreslovProvider: TimelineProvider {
    func placeholder(in context: Context) -> BreslovEntry {
        BreslovEntry(date: Date(), data: nil, stale: false)
    }

    func getSnapshot(in context: Context, completion: @escaping (BreslovEntry) -> Void) {
        Task {
            let (data, stale) = await fetchWidgetPayload()
            completion(BreslovEntry(date: Date(), data: data, stale: stale))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<BreslovEntry>) -> Void) {
        Task {
            let (data, stale) = await fetchWidgetPayload()
            let entry = BreslovEntry(date: Date(), data: data, stale: stale)

            // Come back a minute after the next zman, so the countdown stays
            // honest, but never more often than every quarter hour.
            let minutes = data?.next?.minutesAway ?? 30
            let wait = max(15, min(60, minutes + 1))
            let next = Calendar.current.date(byAdding: .minute, value: wait, to: Date()) ?? Date().addingTimeInterval(1800)
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }
}

// MARK: - Colours

private extension Color {
    static let bdInk      = Color(red: 0.965, green: 0.945, blue: 0.976)
    static let bdInkSoft  = Color(red: 0.776, green: 0.729, blue: 0.824)
    static let bdInkFaint = Color(red: 0.604, green: 0.561, blue: 0.659)
    static let bdRose     = Color(red: 0.965, green: 0.800, blue: 0.831)
    static let bdGold     = Color(red: 0.973, green: 0.878, blue: 0.667)
    static let bdTop      = Color(red: 0.227, green: 0.184, blue: 0.298)
    static let bdBottom   = Color(red: 0.145, green: 0.114, blue: 0.192)
}

// MARK: - Views

struct BreslovWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: BreslovEntry

    var body: some View {
        Group {
            if let data = entry.data {
                switch family {
                case .systemSmall:          small(data)
                case .systemLarge:          large(data)
                case .accessoryRectangular: rectangular(data)
                case .accessoryInline:      Text(inlineText(data))
                default:                    medium(data)
                }
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Breslov Daily")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color.bdGold)
                    Text("Could not reach the server.")
                        .font(.system(size: 11))
                        .foregroundStyle(Color.bdInk)
                }
            }
        }
        .containerBackground(for: .widget) {
            LinearGradient(colors: [.bdTop, .bdBottom], startPoint: .top, endPoint: .bottom)
        }
    }

    private func small(_ d: Api.WidgetPayload) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(d.hebrewDate ?? "")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Color.bdGold)
                .environment(\.layoutDirection, .rightToLeft)
                .lineLimit(1)
            if let parsha = d.parsha {
                Text(parsha).font(.system(size: 10)).foregroundStyle(Color.bdInkFaint).lineLimit(1)
            }
            Spacer(minLength: 4)
            if let next = d.next {
                Text(next.title).font(.system(size: 11, weight: .medium))
                    .foregroundStyle(Color.bdInkSoft).lineLimit(1)
                Text(next.time ?? "").font(.system(size: 21, weight: .bold))
                    .foregroundStyle(Color.bdInk).lineLimit(1)
            }
            Spacer(minLength: 2)
            if let teaching = d.teaching {
                Text(teaching.heading ?? "").font(.system(size: 9, weight: .semibold))
                    .foregroundStyle(Color.bdRose).lineLimit(1)
                Text(teaching.en ?? "").font(.system(size: 10))
                    .foregroundStyle(Color.bdInkSoft).lineLimit(3)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func medium(_ d: Api.WidgetPayload) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(d.gregorian ?? "").font(.system(size: 10)).foregroundStyle(Color.bdInkFaint)
                    if let parsha = d.parsha {
                        Text(parsha).font(.system(size: 12, weight: .semibold)).foregroundStyle(Color.bdInk)
                    }
                }
                Spacer()
                Text(d.hebrewDate ?? "")
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
                Text(teaching.heading ?? "").font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Color.bdRose).lineLimit(1)
                Text(teaching.en ?? "").font(.system(size: 11))
                    .foregroundStyle(Color.bdInkSoft).lineLimit(3)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func large(_ d: Api.WidgetPayload) -> some View {
        let wanted = ["sunrise", "sofZmanShmaGRA", "chatzos", "minchaKetana", "sunset", "tzais"]
        let rows = (d.times ?? []).filter { wanted.contains($0.key ?? "") }

        return VStack(alignment: .leading, spacing: 5) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(d.gregorian ?? "").font(.system(size: 10)).foregroundStyle(Color.bdInkFaint)
                    if let parsha = d.parsha {
                        Text("Parshas \(parsha)").font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Color.bdInk)
                    }
                }
                Spacer()
                Text(d.hebrewDate ?? "").font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(Color.bdGold)
                    .environment(\.layoutDirection, .rightToLeft)
            }

            ForEach(rows, id: \.key) { row in
                let isNext = d.next?.title == row.title
                HStack {
                    Text(row.title).font(.system(size: 11))
                        .foregroundStyle(isNext ? Color.bdRose : Color.bdInkSoft)
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
                Text(teaching.heading ?? "").font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Color.bdRose)
                Text(teaching.he ?? "").font(.system(size: 13))
                    .foregroundStyle(Color.bdInk)
                    .environment(\.layoutDirection, .rightToLeft)
                    .lineLimit(3)
                Text(teaching.en ?? "").font(.system(size: 11))
                    .foregroundStyle(Color.bdInkSoft).lineLimit(4)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func rectangular(_ d: Api.WidgetPayload) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(d.hebrewDate ?? "").font(.system(size: 13, weight: .semibold)).lineLimit(1)
            if let next = d.next {
                Text("\(next.title) \(next.time ?? "")").font(.system(size: 12)).lineLimit(1)
            }
            if let parsha = d.parsha {
                Text(parsha).font(.system(size: 11)).lineLimit(1)
            }
        }
    }

    private func inlineText(_ d: Api.WidgetPayload) -> String {
        if let next = d.next { return "\(next.title) \(next.time ?? "")" }
        return d.hebrewDateEn ?? ""
    }
}

// MARK: - Declaration

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
    var body: some Widget { BreslovWidget() }
}
