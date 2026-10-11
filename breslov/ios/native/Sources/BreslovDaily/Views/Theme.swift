import SwiftUI

/// The same pastel the website uses: warm paper, soft rose, gold.
/// Each colour is given for both themes so nothing has to be redefined twice
/// at the point of use.
enum Palette {
    static func paper(_ dark: Bool) -> Color {
        dark ? Color(red: 0.145, green: 0.114, blue: 0.192)   // deep plum
             : Color(red: 0.984, green: 0.945, blue: 0.925)   // rose cream
    }
    static func card(_ dark: Bool) -> Color {
        dark ? Color(red: 0.227, green: 0.184, blue: 0.298)
             : Color(red: 1.000, green: 0.980, blue: 0.969)
    }
    static func ink(_ dark: Bool) -> Color {
        dark ? Color(red: 0.965, green: 0.945, blue: 0.976)
             : Color(red: 0.169, green: 0.145, blue: 0.188)
    }
    static func inkSoft(_ dark: Bool) -> Color {
        dark ? Color(red: 0.776, green: 0.729, blue: 0.824)
             : Color(red: 0.388, green: 0.357, blue: 0.427)
    }
    static func inkFaint(_ dark: Bool) -> Color {
        dark ? Color(red: 0.604, green: 0.561, blue: 0.659)
             : Color(red: 0.576, green: 0.541, blue: 0.616)
    }
    static func rose(_ dark: Bool) -> Color {
        dark ? Color(red: 0.965, green: 0.800, blue: 0.831)
             : Color(red: 0.541, green: 0.329, blue: 0.361)
    }
    static func gold(_ dark: Bool) -> Color {
        dark ? Color(red: 0.973, green: 0.878, blue: 0.667)
             : Color(red: 0.490, green: 0.380, blue: 0.122)
    }
    static func line(_ dark: Bool) -> Color {
        dark ? Color.white.opacity(0.10) : Color.black.opacity(0.08)
    }

    /// The rose-to-gold sweep used on the date and on anything chosen.
    static func sweep(_ dark: Bool) -> LinearGradient {
        LinearGradient(
            colors: [rose(dark), gold(dark)],
            startPoint: .leading,
            endPoint: .trailing
        )
    }

    static func wash(_ dark: Bool) -> LinearGradient {
        LinearGradient(
            colors: dark
                ? [Color(red: 0.27, green: 0.19, blue: 0.29), paper(true)]
                : [Color(red: 0.98, green: 0.89, blue: 0.89), paper(false)],
            startPoint: .top,
            endPoint: .bottom
        )
    }
}

/// Reads the current colour scheme once, so views can ask `theme.dark`.
struct ThemeReader: ViewModifier {
    func body(content: Content) -> some View { content }
}

/// A card, matching the website's: soft, rounded, lifted a little off the page.
struct Card<Content: View>: View {
    @Environment(\.colorScheme) private var scheme
    var content: () -> Content

    init(@ViewBuilder content: @escaping () -> Content) {
        self.content = content
    }

    var body: some View {
        let dark = scheme == .dark
        VStack(alignment: .leading, spacing: 12, content: content)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(18)
            .background(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .fill(Palette.card(dark))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .strokeBorder(Palette.line(dark), lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(dark ? 0.35 : 0.06), radius: 14, x: 0, y: 6)
    }
}

/// The small uppercase label at the top of every card.
struct CardTitle: View {
    @Environment(\.colorScheme) private var scheme
    var text: String
    var trailing: String?

    var body: some View {
        let dark = scheme == .dark
        HStack(alignment: .firstTextBaseline) {
            Text(text)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Palette.inkSoft(dark))
            Spacer(minLength: 8)
            if let trailing, !trailing.isEmpty {
                Text(trailing)
                    .font(.system(size: 13))
                    .foregroundStyle(Palette.rose(dark))
                    .multilineTextAlignment(.trailing)
            }
        }
    }
}

extension View {
    /// The page background, behind everything.
    func breslovBackground(_ dark: Bool) -> some View {
        background(Palette.wash(dark).ignoresSafeArea())
    }
}
