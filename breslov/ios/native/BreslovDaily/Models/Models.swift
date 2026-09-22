import Foundation

/// The shapes the server sends back.
///
/// Almost every property is optional on purpose. Swift's decoding is strict:
/// one missing field throws, and a thrown error here means a blank screen
/// rather than a missing line. The server already omits fields legitimately --
/// there is no parsha on some days, no candle lighting midweek, no teaching if
/// Sefaria cannot be reached -- so optional is also simply the truth.
enum Api {

    // MARK: - Shared pieces

    struct Place: Codable, Hashable {
        var name: String?
        var latitude: Double?
        var longitude: Double?
        var timeZone: String?
        var israel: Bool?
    }

    struct Gregorian: Codable, Hashable {
        var iso: String?
        var display: String?
        var long: String?
    }

    struct HebrewDate: Codable, Hashable {
        var day: Int?
        var monthName: String?
        var year: Int?
        var en: String?
        var he: String?
        var gematriya: String?
        var daysInMonth: Int?
        var isRoshChodesh: Bool?

        /// What to show as the headline date.
        var display: String { gematriya ?? en ?? "" }
    }

    struct Parsha: Codable, Hashable {
        var en: String?
        var he: String?
        var isDouble: Bool?
        var shabbosDate: String?
        var daysUntil: Int?
    }

    struct CalendarEvent: Codable, Hashable {
        var en: String?
        var he: String?
        var time: String?
        var date: String?
        var iso: String?
    }

    struct DayCalendar: Codable, Hashable {
        var place: Place?
        var gregorian: Gregorian?
        var hebrew: HebrewDate?
        var parsha: Parsha?
        var candles: CalendarEvent?
        var havdalah: CalendarEvent?
        var holidays: [CalendarEvent]?
    }

    // MARK: - Zmanim

    struct Zman: Codable, Hashable, Identifiable {
        var key: String?
        var choiceId: String?
        var en: String?
        var he: String?
        var opinion: String?
        var note: String?
        var iso: String?
        var time: String?
        var isChosen: Bool?
        var minutesAway: Int?

        /// Identifiable needs something stable; a key plus the chosen opinion
        /// is unique within a day, and "show every opinion" lists several
        /// rows sharing a key.
        var id: String { (key ?? "") + "-" + (choiceId ?? "") }
    }

    struct MinhagChoice: Codable, Hashable, Identifiable {
        var id: String?
        var label: String?
        var about: String?
    }

    struct SlotChoice: Codable, Hashable, Identifiable {
        var id: String?
        var name: String?
    }

    struct Slot: Codable, Hashable, Identifiable {
        var key: String?
        var en: String?
        var he: String?
        var choices: [SlotChoice]?
        var id: String { key ?? UUID().uuidString }
    }

    struct ZmanimOptions: Codable, Hashable {
        var presets: [MinhagChoice]?
        var slots: [Slot]?
    }

    struct Zmanim: Codable, Hashable {
        var place: Place?
        var date: String?
        var times: [Zman]?
        var next: Zman?
        var options: ZmanimOptions?

        /// Only the lines the reader actually holds by, in time order.
        var chosen: [Zman] { (times ?? []).filter { $0.isChosen ?? true } }
    }

    // MARK: - Texts

    struct Credit: Codable, Hashable {
        var hebrew: String?
        var english: String?
        var license: String?
        var source: String?
    }

    /// One passage: the Hebrew, the English, and where it came from.
    struct Passage: Codable, Hashable, Identifiable {
        var available: Bool?
        var ref: String?
        var heRef: String?
        var url: String?
        var hebrew: [String]?
        var english: [String]?
        var snippetHe: String?
        var snippetEn: String?
        var credit: Credit?

        // Set on some passages only.
        var heading: String?
        var label: String?
        var chapter: Int?
        var startVerse: Int?
        var mode: String?
        var parsha: String?
        var parshaHe: String?
        var why: String?

        // Present instead of the text when it could not be loaded.
        var reason: String?
        var hint: String?

        var id: String { ref ?? label ?? heading ?? UUID().uuidString }
        var isAvailable: Bool { available ?? false }
        var title: String { heading ?? label ?? ref ?? "" }
    }

    struct TehillimDay: Codable, Hashable {
        var available: Bool?
        var cycle: String?
        var day: Int?
        var label: String?
        var parts: [Passage]?
        var reason: String?
        var hint: String?
        var isAvailable: Bool { available ?? false }
    }

    struct Tikkun: Codable, Hashable {
        var available: Bool?
        var name: String?
        var he: String?
        var chapters: [Int]?
        var description: String?
        var parts: [Passage]?
        var reason: String?
        var hint: String?
        var isAvailable: Bool { available ?? false }
    }

    // MARK: - The whole day, in one request

    struct Today: Codable, Hashable {
        var calendar: DayCalendar?
        var zmanim: Zmanim?
        var spark: Passage?
        var tehillim: TehillimDay?
        var weekly: Passage?
    }

    // MARK: - Search

    struct SearchHit: Codable, Hashable, Identifiable {
        var ref: String?
        var heRef: String?
        var book: String?
        var lang: String?
        var snippet: String?
        var url: String?
        var id: String { ref ?? UUID().uuidString }
        var isHebrew: Bool {
            guard let text = snippet else { return false }
            return text.unicodeScalars.contains { $0.value >= 0x0590 && $0.value <= 0x05FF }
        }
    }

    struct SearchResults: Codable, Hashable {
        var query: String?
        var scope: String?
        var available: Bool?
        var hits: [SearchHit]?
        var total: Int?
        var inBreslov: Int?
        var everywhere: Int?
        var reason: String?
        var isAvailable: Bool { available ?? false }
    }

    struct Suggestion: Codable, Hashable, Identifiable {
        var text: String?
        var kind: String?
        var note: String?
        var id: String { (text ?? "") + (kind ?? "") }
    }

    struct Suggestions: Codable, Hashable {
        var suggestions: [Suggestion]?
    }

    // MARK: - The widget's smaller answer

    struct WidgetZman: Codable, Hashable {
        var key: String?
        var label: String?
        var en: String?
        var he: String?
        var time: String?
        var opinion: String?
        var minutesAway: Int?

        /// `next` carries `label`; the rows in `times` carry `en`.
        var title: String { label ?? en ?? "" }
    }

    struct WidgetTeaching: Codable, Hashable {
        var heading: String?
        var he: String?
        var en: String?
        var url: String?
    }

    struct WidgetPayload: Codable, Hashable {
        var hebrewDate: String?
        var hebrewDateEn: String?
        var gregorian: String?
        var parsha: String?
        var parshaHe: String?
        var candles: String?
        var candlesDate: String?
        var havdalah: String?
        var next: WidgetZman?
        var minhag: String?
        var times: [WidgetZman]?
        var teaching: WidgetTeaching?
        var tehillim: String?
        var place: String?
    }
}
