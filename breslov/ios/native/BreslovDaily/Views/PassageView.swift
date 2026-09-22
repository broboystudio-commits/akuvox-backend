import SwiftUI

/// One passage of Torah: the Hebrew, the English underneath, and the credit.
///
/// Tehillim arrives one verse per line while a lesson arrives one paragraph
/// per line, and rendering a psalm as a column of separate paragraphs looks
/// broken. The two are told apart the same way the website does it -- by
/// average line length -- and verses are run together with small numbers.
struct PassageView: View {
    @Environment(\.colorScheme) private var scheme
    @EnvironmentObject private var settings: Settings

    var passage: Api.Passage
    var showLabel: Bool = true

    private var hebrew: [String] { (passage.hebrew ?? []).filter { !$0.isEmpty } }
    private var english: [String] { (passage.english ?? []).filter { !$0.isEmpty } }

    private func looksLikeVerses(_ lines: [String]) -> Bool {
        guard lines.count >= 4 else { return false }
        let total = lines.reduce(0) { $0 + $1.count }
        return Double(total) / Double(lines.count) < 190
    }

    private var hebrewSize: CGFloat { 21 * settings.textScale }
    private var englishSize: CGFloat { 16 * settings.textScale }

    var body: some View {
        let dark = scheme == .dark

        VStack(alignment: .leading, spacing: 14) {
            if showLabel, !passage.title.isEmpty {
                Text(passage.title)
                    .font(.system(size: 12, weight: .semibold))
                    .textCase(.uppercase)
                    .kerning(0.6)
                    .foregroundStyle(Palette.rose(dark))
            }

            if !passage.isAvailable {
                unavailable(dark)
            } else {
                if !hebrew.isEmpty {
                    if looksLikeVerses(hebrew) {
                        verses(hebrew, size: hebrewSize, rightToLeft: true, dark: dark)
                    } else {
                        ForEach(Array(hebrew.enumerated()), id: \.offset) { _, line in
                            Text(line)
                                .font(.system(size: hebrewSize))
                                .lineSpacing(hebrewSize * 0.55)
                                .multilineTextAlignment(.trailing)
                                .frame(maxWidth: .infinity, alignment: .trailing)
                                .environment(\.layoutDirection, .rightToLeft)
                                .foregroundStyle(Palette.ink(dark))
                        }
                    }
                }

                if settings.showEnglish, !english.isEmpty {
                    if looksLikeVerses(english) {
                        verses(english, size: englishSize, rightToLeft: false, dark: dark)
                    } else {
                        ForEach(Array(english.enumerated()), id: \.offset) { _, line in
                            Text(line)
                                .font(.system(size: englishSize, design: .serif))
                                .lineSpacing(englishSize * 0.42)
                                .foregroundStyle(Palette.inkSoft(dark))
                        }
                    }
                }

                credit(dark)
            }
        }
    }

    /// Verses run together as flowing text, each preceded by its number.
    private func verses(_ lines: [String], size: CGFloat, rightToLeft: Bool, dark: Bool) -> some View {
        let first = passage.startVerse ?? 1
        var joined = Text("")
        for (offset, line) in lines.enumerated() {
            let number = Text("\(first + offset) ")
                .font(.system(size: size * 0.62, weight: .semibold))
                .foregroundColor(Palette.rose(dark))
            let body = Text(line + "  ")
                .font(.system(size: size, design: rightToLeft ? .default : .serif))
                .foregroundColor(rightToLeft ? Palette.ink(dark) : Palette.inkSoft(dark))
            joined = joined + number + body
        }
        return joined
            .lineSpacing(size * (rightToLeft ? 0.55 : 0.42))
            .multilineTextAlignment(rightToLeft ? .trailing : .leading)
            .frame(maxWidth: .infinity, alignment: rightToLeft ? .trailing : .leading)
            .environment(\.layoutDirection, rightToLeft ? .rightToLeft : .leftToRight)
    }

    private func credit(_ dark: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Divider().overlay(Palette.line(dark))
            let bits = [
                passage.credit?.hebrew.map { "Hebrew: \($0)" },
                passage.credit?.english.map { "Translation: \($0)" },
                passage.credit?.license.map { "Licence: \($0)" },
            ].compactMap { $0 }
            if !bits.isEmpty {
                Text(bits.joined(separator: " · "))
                    .font(.system(size: 11))
                    .foregroundStyle(Palette.inkFaint(dark))
            }
            if let link = passage.url, let url = URL(string: link) {
                Link("Read the full text on Sefaria", destination: url)
                    .font(.system(size: 11))
                    .foregroundStyle(Palette.gold(dark))
            }
        }
        .padding(.top, 4)
    }

    /// Nothing is ever shown in place of a text that would not load.
    private func unavailable(_ dark: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("This could not be loaded.")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(Palette.rose(dark))
            Text(passage.hint ?? "Every word here comes from Sefaria, and nothing is shown unless it arrives from there.")
                .font(.system(size: 14))
                .foregroundStyle(Palette.inkSoft(dark))
            if let reason = passage.reason {
                Text(reason)
                    .font(.system(size: 11))
                    .foregroundStyle(Palette.inkFaint(dark))
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Palette.rose(dark).opacity(dark ? 0.14 : 0.10))
        )
    }
}
