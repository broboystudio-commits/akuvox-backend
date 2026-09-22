import Foundation

/// Talks to the Breslov Daily server, and remembers the last good answer.
///
/// Everything is cached to the app's own folder rather than to a shared
/// container, so the app needs no App Groups capability. That matters: App
/// Groups requires a paid Apple account, and without it the app can still be
/// built with a free Apple ID and run on your own phone.
struct API {

    enum Failure: LocalizedError {
        case badAddress
        case server(Int)
        case unreadable(String)

        var errorDescription: String? {
            switch self {
            case .badAddress:          return "That web address does not look right."
            case .server(let code):    return "The server answered \(code)."
            case .unreadable(let why): return "The answer could not be read: \(why)"
            }
        }
    }

    var server: String
    var query: [URLQueryItem]

    private func url(_ path: String, extra: [URLQueryItem] = []) throws -> URL {
        guard var parts = URLComponents(string: server.trimmingCharacters(in: .whitespaces)) else {
            throw Failure.badAddress
        }
        parts.path = path
        parts.queryItems = query + extra
        guard let built = parts.url else { throw Failure.badAddress }
        return built
    }

    /// Fetch and decode, saving a copy that `cached` can hand back later.
    func get<T: Decodable>(_ path: String, extra: [URLQueryItem] = [], as type: T.Type) async throws -> T {
        let address = try url(path, extra: extra)
        var request = URLRequest(url: address)
        // A free hosting plan sleeps when idle and takes about half a minute
        // to wake, so this waits rather than giving up on a cold server.
        request.timeoutInterval = 40
        request.cachePolicy = .reloadIgnoringLocalCacheData

        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, http.statusCode != 200 {
            throw Failure.server(http.statusCode)
        }
        do {
            let decoded = try JSONDecoder().decode(T.self, from: data)
            Cache.save(data, as: path)
            return decoded
        } catch {
            throw Failure.unreadable(String(describing: error).prefix(140).description)
        }
    }

    /// The last good answer for a path, if there is one.
    static func cached<T: Decodable>(_ path: String, as type: T.Type) -> T? {
        guard let data = Cache.load(path) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }
}

/// Saves answers in the app's own Caches folder.
enum Cache {
    private static func file(for path: String) -> URL? {
        let safe = path.replacingOccurrences(of: "/", with: "_")
        return FileManager.default
            .urls(for: .cachesDirectory, in: .userDomainMask).first?
            .appendingPathComponent("breslov\(safe).json")
    }

    static func save(_ data: Data, as path: String) {
        guard let url = file(for: path) else { return }
        try? data.write(to: url, options: .atomic)
    }

    static func load(_ path: String) -> Data? {
        guard let url = file(for: path) else { return nil }
        return try? Data(contentsOf: url)
    }
}

/// What a screen is currently showing: loading, loaded, or failed with the
/// last good copy still on screen.
@MainActor
final class Loader<T: Decodable>: ObservableObject {
    @Published var value: T?
    @Published var isLoading = false
    @Published var problem: String?
    @Published var isStale = false

    private let path: String
    private let extra: [URLQueryItem]

    init(path: String, extra: [URLQueryItem] = []) {
        self.path = path
        self.extra = extra
        self.value = API.cached(path, as: T.self)
        self.isStale = self.value != nil
    }

    func load(using api: API) async {
        isLoading = true
        problem = nil
        do {
            value = try await api.get(path, extra: extra, as: T.self)
            isStale = false
        } catch {
            // Keep whatever is already on screen; say so rather than blanking it.
            problem = error.localizedDescription
            isStale = value != nil
        }
        isLoading = false
    }
}
