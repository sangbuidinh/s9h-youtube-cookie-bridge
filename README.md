# s9h YouTube Cookie Bridge

This bridge is intended for YouTube Downloaderbs v1.1.0 pre-release only.

This project is an optional local-only Cookie Bridge for YouTube Downloaderbs v1.1.0-pre. It is only needed when YouTube or yt-dlp requires browser cookies, or when YouTube/yt-dlp reports session or bot-check related errors. Normal downloads do not require Cookie Bridge.

## Compatibility

- Intended for YouTube Downloaderbs v1.1.0-pre.
- Optional companion tool only.
- Not required for normal downloads.
- Use it only when YouTube/yt-dlp requires browser cookies or reports session/bot-check related errors.

## Security Notes

- No localhost server.
- No WebSocket.
- No fetch/XMLHttpRequest network upload.
- No `<all_urls>` permission.
- Cookies are exported locally only.
- Runtime cookie output: `data/runtime/youtube_cookies.txt`.
- Diagnostic log output: `data/runtime/bridge_diagnostics.log`.
- Never share `youtube_cookies.txt`.
- Never commit `youtube_cookies.txt` or `bridge_diagnostics.log`.
- Auto-export is optional. Turn off auto-export when you are not downloading.

## Repository Layout

```text
extension/
  manifest.json
  background.js
  popup.html
  popup.js
  cookie_export.js
  native_bridge.js
  styles.css
native-host/
  cookie_bridge_host.py
  install_native_host.ps1
  verify_native_host.ps1
  build_native_host.cmd
  dist/
    cookie_bridge_host.exe
native/
  native_host.py
  install_bridge.cmd
  install_bridge_dev.cmd
data/runtime/
  .gitkeep
install_bridge.cmd
verify_bridge.cmd
README.md
.gitignore
LICENSE
```

## Install

Normal users should use the release installer at the repository root. It registers Chrome/Edge Native Messaging to the packaged EXE:

```text
native-host/dist/cookie_bridge_host.exe
```

Do not use `native\install_bridge_dev.cmd` for normal installation. It is for development script-mode testing only and can register a Python-based native host. `native\install_bridge.cmd` redirects to the root release installer.

1. Load the `extension/` folder in Chrome or Edge Developer Mode.
2. Copy the extension ID from the extension popup or from `chrome://extensions`.
3. Run `install_bridge.cmd <EXTENSION_ID>`, or run `install_bridge.cmd` and paste the ID when prompted.
4. Run `verify_bridge.cmd`.
5. Open the extension popup and click the Native Host test button.
6. Export cookies manually once.
7. Confirm `data/runtime/youtube_cookies.txt` exists.
8. In YouTube Downloaderbs v1.1.0-pre:
   - enable Cookies
   - choose `Local Cookie Bridge`
   - set the bridge cookie path to `data/runtime/youtube_cookies.txt` if needed

The Native Messaging manifest should point to `native-host\dist\cookie_bridge_host.exe`, not to a Python script, `py -3`, or a `.cmd` wrapper.

## Uninstall

1. Run `uninstall_bridge.cmd`.
2. Remove the browser extension.
3. Delete `data/runtime/youtube_cookies.txt` if desired.

## Developer Notes

The canonical native host source is `native-host\cookie_bridge_host.py`. The release EXE is `native-host\dist\cookie_bridge_host.exe` and must be built from that canonical source.

The `native/` folder is developer-only. `native\native_host.py` is a compatibility shim that runs the canonical source, and `native\install_bridge.cmd` delegates to the root release installer so normal installs do not register `py -3 native_host.py`.

To rebuild the release native host EXE:

```cmd
native-host\build_native_host.cmd
```

The release installer uses the compiled EXE. Python script mode is for development only. If a developer intentionally needs script mode, use `native\install_bridge_dev.cmd`; normal users should not run it.

## Troubleshooting

- If Downloader says the Bridge file is missing, export cookies once from the extension popup.
- If the bridge folder is moved, run `install_bridge.cmd <EXTENSION_ID>` again.
- If YouTube still requires login or bot-check, sign in again in the same browser profile and export again.
- If Native Host is not connected, run `verify_bridge.cmd` and confirm the manifest path points to `native-host\dist\cookie_bridge_host.exe`.

## Notes

The browser extension reads cookies only through Chrome extension APIs and sends them to the local Native Messaging host. The native host writes a Netscape-format cookie file under `data/runtime/` for the downloader to use when explicitly selected.
