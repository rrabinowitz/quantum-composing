import Cocoa
import WebKit
import UniformTypeIdentifiers

/// WKWebView shell. Loads Contents/Resources/www.
/// swiftc -O -parse-as-library OvertoneField.swift -o "Overtone Field"

@main
struct OvertoneFieldMain {
  static func main() {
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.delegate = delegate
    app.setActivationPolicy(.regular)
    app.run()
  }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate, WKScriptMessageHandler {
  var window: NSWindow!
  var webView: WKWebView!

  func applicationDidFinishLaunching(_ notification: Notification) {
    setupMainMenu()

    let screen = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1280, height: 900)
    let width = min(1280, screen.width * 0.92)
    let height = min(900, screen.height * 0.92)
    let rect = NSRect(
      x: screen.midX - width / 2,
      y: screen.midY - height / 2,
      width: width,
      height: height
    )

    window = NSWindow(
      contentRect: rect,
      styleMask: [.titled, .closable, .miniaturizable, .resizable],
      backing: .buffered,
      defer: false
    )
    window.title = "Overtone Field"
    window.minSize = NSSize(width: 880, height: 640)
    window.collectionBehavior = [.fullScreenPrimary]
    window.isReleasedWhenClosed = true

    let config = WKWebViewConfiguration()
    config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
    config.setValue(true, forKey: "allowUniversalAccessFromFileURLs")
    config.mediaTypesRequiringUserActionForPlayback = []
    if #available(macOS 11.3, *) {
      config.preferences.isTextInteractionEnabled = true
    }
    config.userContentController.add(self, name: "saveBlob")

    webView = WKWebView(frame: window.contentView!.bounds, configuration: config)
    webView.autoresizingMask = [.width, .height]
    webView.navigationDelegate = self
    webView.uiDelegate = self
    window.contentView = webView

    loadBundledApp()
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
    true
  }

  private func setupMainMenu() {
    let mainMenu = NSMenu()
    let appMenuItem = NSMenuItem()
    mainMenu.addItem(appMenuItem)
    let appMenu = NSMenu(title: "Overtone Field")
    appMenuItem.submenu = appMenu
    appMenu.addItem(withTitle: "About Overtone Field", action: #selector(showAbout), keyEquivalent: "")
    appMenu.addItem(NSMenuItem.separator())
    appMenu.addItem(withTitle: "Hide Overtone Field", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
    let hideOthers = NSMenuItem(title: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
    hideOthers.keyEquivalentModifierMask = [.command, .option]
    appMenu.addItem(hideOthers)
    appMenu.addItem(withTitle: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
    appMenu.addItem(NSMenuItem.separator())
    appMenu.addItem(withTitle: "Quit Overtone Field", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

    let fileMenuItem = NSMenuItem()
    mainMenu.addItem(fileMenuItem)
    let fileMenu = NSMenu(title: "File")
    fileMenuItem.submenu = fileMenu
    fileMenu.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
    NSApp.mainMenu = mainMenu
  }

  @objc private func showAbout() {
    let alert = NSAlert()
    alert.messageText = "Overtone Field"
    alert.informativeText = "Quantum composition on a just-intonation lattice.\nSound is waveguide and modal synthesis."
    alert.runModal()
  }

  private func loadBundledApp() {
    guard let resourceURL = Bundle.main.resourceURL else { return }
    let indexURL = resourceURL.appendingPathComponent("www").appendingPathComponent("index.html")
    guard FileManager.default.fileExists(atPath: indexURL.path) else {
      let alert = NSAlert()
      alert.messageText = "Overtone Field"
      alert.informativeText = "Missing bundled page at \(indexURL.path)"
      alert.runModal()
      NSApp.terminate(nil)
      return
    }
    webView.loadFileURL(indexURL, allowingReadAccessTo: indexURL.deletingLastPathComponent())
  }

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    guard message.name == "saveBlob",
          let body = message.body as? [String: Any],
          let filename = body["filename"] as? String,
          let base64 = body["base64"] as? String,
          let data = Data(base64Encoded: base64) else { return }

    let panel = NSSavePanel()
    panel.canCreateDirectories = true
    panel.nameFieldStringValue = filename
    panel.title = "Save export"
    if #available(macOS 11.0, *) {
      let lower = filename.lowercased()
      if lower.hasSuffix(".wav") {
        panel.allowedContentTypes = [.wav, .audio]
      } else if lower.hasSuffix(".mid") || lower.hasSuffix(".midi") {
        panel.allowedContentTypes = [UTType(filenameExtension: "mid") ?? .data, .data]
      } else {
        panel.allowedContentTypes = [.data]
      }
      panel.allowsOtherFileTypes = true
    }
    panel.beginSheetModal(for: window) { result in
      guard result == .OK, let url = panel.url else { return }
      try? data.write(to: url, options: .atomic)
    }
  }

  func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    if #available(macOS 11.3, *), navigationAction.shouldPerformDownload {
      decisionHandler(.download)
      return
    }
    decisionHandler(.allow)
  }

  func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
    if #available(macOS 11.3, *), !navigationResponse.canShowMIMEType {
      decisionHandler(.download)
      return
    }
    decisionHandler(.allow)
  }

  @available(macOS 11.3, *)
  func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
    download.delegate = self
  }

  @available(macOS 11.3, *)
  func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
    download.delegate = self
  }

  @available(macOS 11.3, *)
  func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
    let panel = NSSavePanel()
    panel.nameFieldStringValue = suggestedFilename
    panel.beginSheetModal(for: window) { result in
      completionHandler(result == .OK ? panel.url : nil)
    }
  }

  @available(macOS 11.3, *)
  func downloadDidFinish(_ download: WKDownload) {}

  @available(macOS 11.3, *)
  func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {}
}
