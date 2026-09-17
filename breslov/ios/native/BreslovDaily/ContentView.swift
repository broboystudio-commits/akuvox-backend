import SwiftUI
import WebKit

/// The app shows the same site the browser does, wrapped so it feels native.
/// Once the widget and the site are working, individual screens can be
/// rebuilt in SwiftUI without changing the server at all.
struct ContentView: View {
    var body: some View {
        WebView(url: BreslovAPI.server)
            .background(Color(red: 0.08, green: 0.07, blue: 0.11))
    }
}

struct WebView: UIViewRepresentable {
    let url: URL

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true

        let view = WKWebView(frame: .zero, configuration: config)
        view.isOpaque = false
        view.backgroundColor = UIColor(red: 0.08, green: 0.07, blue: 0.11, alpha: 1)
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.load(URLRequest(url: url))
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) { }
}
