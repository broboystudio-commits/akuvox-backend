import SwiftUI
import CoreLocation

/// Everything the reader has chosen. Stored by iOS itself, so it survives
/// the app being closed, and shared with the widget through a suite name when
/// one is configured.
final class Settings: ObservableObject {

    /// Change this to your own address if it ever moves.
    static let defaultServer = "https://akuvox-backend.onrender.com"

    @AppStorage("server")     var server: String = Settings.defaultServer
    @AppStorage("minhag")     var minhag: String = "standard"
    /// The password, if the site is locked. Empty means it is open to everyone.
    /// The widget reads the same stored value, so setting it once covers both.
    @AppStorage("accessKey")  var accessKey: String = ""
    @AppStorage("theme")      var theme: String = "system"      // system | light | dark
    @AppStorage("showEnglish") var showEnglish: Bool = true
    @AppStorage("textScale")  var textScale: Double = 1.0
    @AppStorage("useDeviceLocation") var useDeviceLocation: Bool = false

    // Brooklyn, until the reader says otherwise.
    @AppStorage("latitude")   var latitude: Double = 40.6501
    @AppStorage("longitude")  var longitude: Double = -73.9496
    @AppStorage("placeName")  var placeName: String = "Brooklyn, NY"

    /// Where the reader stopped in the Tikkun HaKlali, and when.
    @AppStorage("tikkunIndex") var tikkunIndex: Int = 0
    @AppStorage("tikkunAt")    var tikkunAt: Double = 0

    var timeZoneId: String { TimeZone.current.identifier }

    var colorScheme: ColorScheme? {
        switch theme {
        case "light": return .light
        case "dark":  return .dark
        default:      return nil     // follow the phone
        }
    }

    /// The query every request carries: where you are and how you hold.
    var query: [URLQueryItem] {
        [
            URLQueryItem(name: "lat", value: String(latitude)),
            URLQueryItem(name: "lng", value: String(longitude)),
            URLQueryItem(name: "tz", value: timeZoneId),
            URLQueryItem(name: "name", value: placeName),
            URLQueryItem(name: "minhag", value: minhag),
        ] + (accessKey.isEmpty ? [] : [URLQueryItem(name: "key", value: accessKey)])
    }
}

/// Asks the phone where it is, once, when the reader taps to allow it.
final class LocationFinder: NSObject, ObservableObject, CLLocationManagerDelegate {
    private let manager = CLLocationManager()
    private var onFound: ((CLLocationCoordinate2D) -> Void)?

    @Published var isAsking = false
    @Published var refused = false

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    func find(_ completion: @escaping (CLLocationCoordinate2D) -> Void) {
        onFound = completion
        isAsking = true
        refused = false
        manager.requestWhenInUseAuthorization()
        manager.requestLocation()
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        isAsking = false
        guard let here = locations.last else { return }
        onFound?(here.coordinate)
        onFound = nil
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        isAsking = false
        refused = true
        onFound = nil
    }
}
