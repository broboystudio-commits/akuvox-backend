import SwiftUI

/// Search the seforim, with suggestions as you type.
struct SearchView: View {
    @Environment(\.colorScheme) private var scheme
    @EnvironmentObject private var settings: Settings

    @State private var query = ""
    @State private var results: Api.SearchResults?
    @State private var suggestions: [Api.Suggestion] = []
    @State private var scope = "breslov"
    @State private var searching = false
    @State private var suggestTask: Task<Void, Never>?

    var body: some View {
        let dark = scheme == .dark
        ScrollView {
            VStack(spacing: 14) {
                Card {
                    CardTitle(text: "Search",
                              trailing: results.map { "\(($0.hits ?? []).count) results" })

                    if !suggestions.isEmpty {
                        VStack(spacing: 0) {
                            ForEach(suggestions) { item in
                                Button {
                                    query = item.text ?? ""
                                    suggestions = []
                                    Task { await run() }
                                } label: {
                                    HStack {
                                        Text(item.text ?? "")
                                            .foregroundStyle(Palette.ink(dark))
                                        Spacer()
                                        Text(item.note ?? item.kind ?? "")
                                            .font(.system(size: 11))
                                            .foregroundStyle(Palette.inkFaint(dark))
                                            .lineLimit(1)
                                    }
                                    .padding(.vertical, 10)
                                }
                                .buttonStyle(.plain)
                                Divider().overlay(Palette.line(dark))
                            }
                        }
                    }

                    Picker("Where to look", selection: $scope) {
                        Text("Reb Nachman (\(results?.inBreslov ?? 0))").tag("breslov")
                        Text("Everywhere (\(results?.everywhere ?? 0))").tag("all")
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: scope) { _ in Task { await run() } }
                }

                if searching { ProgressView().padding(20) }

                if let results, !results.isAvailable {
                    Card {
                        Text("Search is not working.")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(Palette.rose(dark))
                        Text(results.reason ?? "The rest of the app is fine.")
                            .font(.system(size: 13))
                            .foregroundStyle(Palette.inkSoft(dark))
                    }
                }

                ForEach(results?.hits ?? []) { hit in
                    Card {
                        Text(hit.heRef ?? hit.ref ?? "")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Palette.rose(dark))
                        Text(hit.snippet ?? "")
                            .font(.system(size: hit.isHebrew ? 18 : 15,
                                          design: hit.isHebrew ? .default : .serif))
                            .environment(\.layoutDirection, hit.isHebrew ? .rightToLeft : .leftToRight)
                            .multilineTextAlignment(hit.isHebrew ? .trailing : .leading)
                            .frame(maxWidth: .infinity, alignment: hit.isHebrew ? .trailing : .leading)
                            .foregroundStyle(Palette.inkSoft(dark))
                        if let link = hit.url, let url = URL(string: link) {
                            Link("Open on Sefaria", destination: url)
                                .font(.system(size: 12))
                                .foregroundStyle(Palette.gold(dark))
                        }
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 24)
        }
        .breslovBackground(dark)
        .navigationTitle("Search")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, prompt: "A word, an idea, or a sefer")
        .onSubmit(of: .search) { Task { await run() } }
        .onChange(of: query) { _ in scheduleSuggest() }
    }

    /// Waits for a pause in typing rather than asking on every keystroke.
    private func scheduleSuggest() {
        suggestTask?.cancel()
        let text = query.trimmingCharacters(in: .whitespaces)
        guard text.count >= 2 else { suggestions = []; return }
        suggestTask = Task {
            try? await Task.sleep(nanoseconds: 220_000_000)
            if Task.isCancelled { return }
            let api = API(server: settings.server, query: settings.query)
            let found = try? await api.get("/api/suggest",
                                           extra: [URLQueryItem(name: "q", value: text)],
                                           as: Api.Suggestions.self)
            if Task.isCancelled { return }
            suggestions = Array((found?.suggestions ?? []).prefix(6))
        }
    }

    private func run() async {
        let text = query.trimmingCharacters(in: .whitespaces)
        guard !text.isEmpty else { results = nil; return }
        suggestions = []
        searching = true
        let api = API(server: settings.server, query: settings.query)
        results = try? await api.get("/api/search",
                                     extra: [URLQueryItem(name: "q", value: text),
                                             URLQueryItem(name: "scope", value: scope)],
                                     as: Api.SearchResults.self)
        searching = false
    }
}
