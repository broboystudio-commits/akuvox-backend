import Foundation

/// Talks to the Breslov Daily server. Shared by the app and the widget.
enum BreslovAPI {

    /// Change this to your own address once the server is deployed.
    static let server = URL(string: "https://breslov-daily.onrender.com")!

    /// Where the widget saves the last good answer, so it can still draw
    /// something on the subway. Replace with your own App Group id.
    static let appGroup = "group.com.example.breslovdaily"

    struct Widget: Codable {
        let hebrewDate: String
        let hebrewDateEn: String
        let gregorian: String
        let parsha: String?
        let parshaHe: String?
        let candles: String?
        let havdalah: String?
        let next: Zman?
        let times: [Zman]
        let teaching: Teaching?
        let tehillim: String?
        let place: String

        struct Zman: Codable {
            let key: String?
            let en: String?
            let he: String?
            let time: String?
            let label: String?
            let minutesAway: Int?

            /// `next` uses `label`, the rows in `times` use `en`.
            var title: String { label ?? en ?? "" }
        }

        struct Teaching: Codable {
            let heading: String
            let he: String
            let en: String
            let url: String?
        }
    }

    static func widgetURL(latitude: Double, longitude: Double,
                          timeZone: String, name: String) -> URL {
        var components = URLComponents(url: server.appendingPathComponent("api/widget"),
                                       resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "lat", value: String(latitude)),
            URLQueryItem(name: "lng", value: String(longitude)),
            URLQueryItem(name: "tz", value: timeZone),
            URLQueryItem(name: "name", value: name),
        ]
        return components.url!
    }

    /// Fetch today's lines. On failure, hand back the last saved copy.
    static func load(latitude: Double, longitude: Double,
                     timeZone: String, name: String) async -> (data: Widget?, stale: Bool) {
        let url = widgetURL(latitude: latitude, longitude: longitude,
                            timeZone: timeZone, name: name)
        do {
            var request = URLRequest(url: url)
            // A free hosting plan sleeps when idle and takes up to about half
            // a minute to wake, so give it room before falling back.
            request.timeoutInterval = 35
            let (bytes, _) = try await URLSession.shared.data(for: request)
            let decoded = try JSONDecoder().decode(Widget.self, from: bytes)
            save(decoded)
            return (decoded, false)
        } catch {
            return (cached(), true)
        }
    }

    // MARK: - saving the last good copy

    private static var cacheURL: URL? {
        FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroup)?
            .appendingPathComponent("widget.json")
    }

    private static func save(_ value: Widget) {
        guard let url = cacheURL, let data = try? JSONEncoder().encode(value) else { return }
        try? data.write(to: url, options: .atomic)
    }

    private static func cached() -> Widget? {
        guard let url = cacheURL, let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Widget.self, from: data)
    }
}
