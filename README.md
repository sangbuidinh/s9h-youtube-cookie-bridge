# s9h YouTube Cookie Bridge

This bridge is intended for YouTube Downloaderbs v1.1.0 pre-release only.

s9h YouTube Cookie Bridge is an optional companion tool. It is only needed when YouTube or yt-dlp requires browser cookies, or when YouTube/yt-dlp reports session or bot-check related errors. Normal downloads do not require Cookie Bridge.

## Security Notes

- No localhost server.
- No WebSocket.
- No fetch/XMLHttpRequest network upload.
- Cookies are exported locally only to `data/runtime/youtube_cookies.txt`.
- Never share `youtube_cookies.txt`.
- `data/runtime/youtube_cookies.txt` is runtime output and must not be committed.

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
native/
  native_host.py
  install_bridge.cmd
  uninstall_bridge.cmd
data/runtime/
  .gitkeep
README.md
.gitignore
LICENSE
```

## Install

1. Download or clone this repository.
2. Run `native/install_bridge.cmd`.
3. Load the `extension` folder in Chrome or Edge Developer Mode.
4. Export cookies or let auto-export update the runtime file.
5. In YouTube Downloaderbs v1.1.0-pre, select Local Cookie Bridge.
6. Set the bridge path to `data/runtime/youtube_cookies.txt` if needed.

## Uninstall

1. Run `native/uninstall_bridge.cmd`.
2. Remove the browser extension.
3. Delete `data/runtime/youtube_cookies.txt` if desired.

## Notes

The browser extension reads cookies only through Chrome extension APIs and sends them to the local Native Messaging host. The native host writes a Netscape-format cookie file under `data/runtime/` for the downloader to use when explicitly selected.
