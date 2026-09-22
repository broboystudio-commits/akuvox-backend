import SwiftUI

/// Settings, and where everything comes from.
struct AboutView: View {
    @Environment(\.colorScheme) private var scheme
    @EnvironmentObject private var settings: Settings
    @StateObject private var finder = LocationFinder()

    var body: some View {
        let dark = scheme == .dark
        ScrollView {
            VStack(spacing: 14) {
                Card {
                    CardTitle(text: "Reading")
                    Toggle("English translation", isOn: $settings.showEnglish)
                        .tint(Palette.rose(dark))
                    HStack {
                        Text("Text size").foregroundStyle(Palette.inkSoft(dark))
                        Spacer()
                        Slider(value: $settings.textScale, in: 0.85...1.7, step: 0.05)
                            .frame(width: 170)
                            .tint(Palette.rose(dark))
                    }
                    Picker("Appearance", selection: $settings.theme) {
                        Text("Match phone").tag("system")
                        Text("Light").tag("light")
                        Text("Dark").tag("dark")
                    }
                    .pickerStyle(.segmented)
                }

                Card {
                    CardTitle(text: "Location", trailing: settings.placeName)
                    Text("Used to work out your zmanim. It is sent with each request and is not stored anywhere.")
                        .font(.system(size: 13))
                        .foregroundStyle(Palette.inkSoft(dark))
                    Button {
                        finder.find { here in
                            settings.latitude = (here.latitude * 10000).rounded() / 10000
                            settings.longitude = (here.longitude * 10000).rounded() / 10000
                            settings.placeName = "My location"
                        }
                    } label: {
                        Text(finder.isAsking ? "Asking…" : "Use my current location")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(SoftButton())
                    if finder.refused {
                        Text("Location was not shared, so zmanim stay set to \(settings.placeName).")
                            .font(.system(size: 12))
                            .foregroundStyle(Palette.inkFaint(dark))
                    }
                }

                Card {
                    CardTitle(text: "Sources")
                    Text("Every word of Torah here is fetched from Sefaria as you read it. Nothing is typed in by hand and nothing is paraphrased; the edition and translator are shown under each passage. If a text cannot be reached, the app says so rather than showing something that might be wrong.")
                        .font(.system(size: 14))
                        .foregroundStyle(Palette.inkSoft(dark))
                    Link("Sefaria — the texts", destination: URL(string: "https://www.sefaria.org")!)
                    Link("KosherJava — the zmanim", destination: URL(string: "https://kosherjava.com")!)
                    Link("Hebcal — the Jewish calendar", destination: URL(string: "https://www.hebcal.com")!)
                }
                .tint(Palette.gold(dark))

                Card {
                    CardTitle(text: "Privacy")
                    Text("No accounts, no analytics, no advertising, no tracking. Your settings stay on this phone. Coordinates are sent to work out zmanim and are not stored. Sefaria is contacted by the server rather than by your phone, so it never sees who is reading.")
                        .font(.system(size: 14))
                        .foregroundStyle(Palette.inkSoft(dark))
                }

                Card {
                    CardTitle(text: "Server")
                    TextField("Web address", text: $settings.server)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .font(.system(size: 14, design: .monospaced))
                    Text("Only change this if the app moves to a different address.")
                        .font(.system(size: 12))
                        .foregroundStyle(Palette.inkFaint(dark))

                    SecureField("Password (only if the site is locked)", text: $settings.accessKey)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .font(.system(size: 14, design: .monospaced))
                    Text("Leave this empty unless the site asks for a password. The widget uses the same one.")
                        .font(.system(size: 12))
                        .foregroundStyle(Palette.inkFaint(dark))
                }
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 24)
        }
        .breslovBackground(dark)
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
    }
}
