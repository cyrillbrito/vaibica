# Distribution

How colleagues could install Tau, start it, open it, and keep it updated. Today Tau runs from a clone of the repo with `bun run dev`, which only works for its author.

## The shape of the problem

Tau is a server that has to run on the machine that holds the code, because the agent reads files, runs git, and opens shells there. Whatever we ship, we ship that server. A desktop window is only a different way to open the UI the server already serves.

That makes updates simpler than they look. The server serves the UI, so replacing one binary updates both. Phones and browser tabs pick up the new UI when they reconnect. Pi Durable already recovers sessions after a restart, so restarting for an update doesn't lose an agent run.

## Direction

The author's needs, decided after the prototypes below:

- A client always loads its UI from the server it talks to. If a server is running, it already serves the client, so the files in the window always match what the server can do. No client ships its own copy of the UI, and there is no version check between them.
- The window is just a browser without the browser around it: no tabs, no address bar, no extensions. Tau needs nothing from a desktop framework, because everything that touches the machine runs in the server.
- The default is to open Tau in any browser. A desktop window is optional, through Chrome in app mode.
- Updates come from swapping the server binary, which updates the UI with it.

### Chrome app mode

`chrome --app=<url> --user-data-dir=~/.tau/chrome` opens Tau in its own Chrome instance with no tabs, address bar, or extensions. Closing the window closes only that Chrome, and the agents keep running. Installing the page as an app from that window gives it Tau's name and icon in the Dock. Opening it on this Mac looked the same as the Chrome app the author already installs by hand.

The problem is links. The separate profile means a clicked link, or Chrome's "Search Google for" menu, opens in that empty profile instead of the author's own. Chrome has no flag to send them elsewhere. Links must open in the author's own profile, however the window was opened.

The fix is to drop the separate profile. Install Tau as an app from the main profile, then block extensions on Tau's origins: in `chrome://extensions/sites`, add each origin (for example `http://localhost:3141` and the Tailscale URL) under "Not allowed to use extensions". Chrome then runs no extension on Tau, while links and the right-click search open in the main profile, and a Dock click works the same as any other launch. It takes no code. The setting is per origin, so each server address needs its own entry.

Only the launch can be scripted: `open -na "Google Chrome" --args --profile-directory=Default --app=<url>` opens the app window in the main profile. `--disable-extensions` can't be added per launch, because a running Chrome takes the request and ignores new flags, and two Chrome processes can't share a profile. The extension block can be scripted only as Chrome policy (`ExtensionSettings` with `runtime_blocked_hosts`), which on macOS needs an MDM profile the user approves, and marks Chrome as managed by an organization. A one-time manual entry is simpler.

A heavier fallback, if that ever falls short, is a small local launcher, `tau open <url>`. It starts Chrome with `--remote-debugging-pipe`, the same channel `Bun.WebView` uses to drive Chrome, watches for new tabs and windows, closes them, and passes their URL to the system's `open`. That catches every new window, the right-click menu included, the way Electron's window open handler does.

The launcher has to run on the machine with the screen, not with the server. When the server is on another machine, its own `open` would open the link over there. So `tau open https://other-machine:3141` runs locally, opens the remote server's UI, and opens links locally. The same binary is both the server (`tau`) and the launcher (`tau open`), and the launcher has no UI of its own, so the rule above still holds. A window opened from the Dock instead of the launcher doesn't get the link handling.

### The `tau` command

`tau` starts the server in the terminal and prints its addresses and a few keys, the way Vite does:

```
  Tau 0.4.0 running

  Local:     http://localhost:3141

  a  open as app (Chrome, profile Personal)
  o  open in browser
  p  pick Chrome profile
  q  quit
```

- The server listens on localhost only. Remote access stays the user's own setup, such as `tailscale serve` in `docs/deploy.md`, and `tau` doesn't touch it.
- The address is a plain URL, which terminals already make clickable.
- `a` runs `open -na "Google Chrome" --args --profile-directory=<dir> --app=<url>`. The profile list comes from `profile.info_cache` in Chrome's `Local State` file, and the chosen one is saved in `~/.tau/`.
- Keys come from `process.stdin` in raw mode, which works in a compiled binary. Without a terminal, as a background service, `tau` skips the keys and only logs.
- Ctrl-C and `q` stop the server the same way.

### Built

`tau` exists: `bun run build:tau` compiles it into `dist/tau/tau`, and [docs/deploy.md](../deploy.md) describes using it. Tested from `/tmp` on macOS arm64: the UI loads, the socket connects, a terminal opens, codemode runs a script, and all four keys work.

- One file, nothing next to it. It is 102 MB on disk and 35 MB gzipped: 62 MB of Bun runtime, 18 MB of client assets, and the rest server bundle.
- The first page answers 0.7 s after launch.
- The client is embedded as files and served by `tau` itself, in front of Vite's handler, since Vite's static server looks for `../client` on disk.
- Codemode is bundled too. It takes a worker URL and a wasm path for compiled binaries, so the worker is a second entrypoint and the wasm an embedded file, passed in through `TAU_CODEMODE_WORKER` and `TAU_CODEMODE_WASM`.
- Skills are embedded and unpacked to `~/.tau/data/skills` on each start, because the agent reads them as real files.
- Vite's `node.js` starts a server on port 3000 when it is the main module, which it is inside a compiled binary. The build strips that line from its own copy and fails if the line changes.
- Like the prototype, it bundles with `NODE_ENV=production` so Solid's production build is picked.

Releases are built too: a `release` workflow, started by hand, builds `tau` for macOS arm64 and x64 and Linux x64 and arm64, tags the next `vX.Y.Z`, and creates a draft GitHub release with `.tar.gz` files and `SHA256SUMS`. The version comes from the tag and `tau --version` prints it. [docs/deploy.md](../deploy.md) describes making one.

What's left: updates (`tau upgrade`, verified against `SHA256SUMS`, and the in-app button), an install script, signing for downloads outside curl and Homebrew, first-run provider setup, and Windows, where terminals still need a pty.

## Option 1: one binary, opened in the browser

This is how OpenCode and Claude Code ship. It is the smallest step and covers most of the need.

- People install with `curl -fsSL …/install | bash` or a Homebrew tap. Both drop one file in `~/.local/bin`.
- `tau` starts the server and opens `http://localhost:3141` in the default browser. They can install it as an app from there, as `docs/deploy.md` describes.
- The server checks the latest release once a day. The UI shows "Update to 1.4" and, on click, the server downloads the new binary, swaps it in place, and restarts. `tau upgrade` does the same from the shell, as `opencode upgrade` does.
- A login item (launchd on macOS, a systemd user unit on Linux) keeps it running in the background, the way Ollama does.

Swapping the binary is safe on macOS and Linux if it is done with a rename. The running process holds the old file open, so replacing the path doesn't touch it. The steps:

1. Find the installed binary through `process.execPath`, so the updater never needs to know where the install script put it. If the path is inside Homebrew, tell the user to run `brew upgrade` instead.
2. Download the new binary next to it, check its SHA-256 against the release, and `chmod +x` it.
3. Rename it over the old path. A rename within one folder is atomic, so the path holds either the old binary or the new one, never half a file.
4. Tell connected clients the server is restarting, close the port, and start the new binary with the same arguments. Under launchd or systemd, exiting is enough, since the service manager starts it again.

Windows can't overwrite a running `.exe`, but it can rename it, so the updater moves the old one aside first and deletes it on the next start.

Running it looks like this. `tau` in a terminal prints the local URL and the tailnet URL, opens the browser, and keeps logging until Ctrl-C stops it, like `ollama serve`. `tau service install` registers a background service instead, so it starts at login with no terminal open, and `tau service stop` ends it, like `opencode service`. Vite stays a dev and build tool. The binary holds Vite's build output and no Vite at all.

Signing matters less here than for an app. Files downloaded with curl or installed by Homebrew don't get the quarantine flag, so Gatekeeper doesn't block an unsigned binary. On Windows, an unsigned binary gets a SmartScreen warning.

What already fits: SQLite goes through `node:sqlite`, which Bun 1.4 supports, and terminals use Bun's own pty with no native addon. So the compile has no native modules to fight. What still needs work:

- The production server is Vite's Node-style output plus `start.js`. It needs one entry file that bundles both, with the client assets embedded through `--asset`.
- Data lives in `.data/` relative to where the server starts, and skills are read from the repo. A shipped binary needs `~/.tau/` for data and embedded skills.
- Bun's pty is POSIX only, so terminals won't work on Windows without WSL.
- First run needs a setup screen for providers, since nobody has `.data/auth.json` yet.
- Reaching it from a phone still means Tailscale, or the login in [self-hosted-auth.md](self-hosted-auth.md).

## Option 2: a desktop app around the same binary

A desktop app adds a Dock icon, a clean window with no browser extensions, a menu bar item, and a "Restart to update" flow people already know. The cost is signing, notarization, and a second build pipeline.

Every agent app with a UI is built the same way. The app starts the same local server the CLI runs, on a random loopback port with a random password, and its window loads the same web UI. OpenCode, T3 Code, Codex, and Claude Desktop all do this. T3 Code ships both forms side by side: a `t3` CLI with `t3 service install` and `t3 update`, and an Electron app. The apps differ only in which engine draws the window and where the server runs.

The choice that matters is the engine: bundled Chromium, or the system webview (WebKit on macOS and Linux, WebView2 on Windows). OpenCode started on Tauri with the system webview and moved to Electron in 2026. WebKit drew their Solid UI slower than Chromium and with small style differences, and starting the bundled CLI as a sidecar was slow and sometimes failed on Windows. Tau would hit the same walls, since it is also a TypeScript server with a Solid UI.

The options, from heaviest to lightest:

- Electron bundles Chromium, so Tau looks the same everywhere, but each app is around 150 MB. OpenCode, T3 Code, Codex, and Claude Desktop use it. Its server runs in Electron's Node. OpenCode builds its CLI with Bun but made the server code run on both runtimes, replacing `Bun.serve` with Hono's Node adapter, so the desktop app runs it in a Node utility process. Their reason was stability: Node holds up better across millions of user machines. Tau is close to runtime-neutral already. Only the terminal pty (`Bun.spawn` with a terminal) and `Bun.Image` would need Node replacements, such as `node-pty`. electron-builder handles updates on macOS, Windows, and Linux AppImage, and update.electronjs.org is free for public GitHub repos. Auto-update on macOS needs a signed and notarized app, so an Apple Developer ID at $99 a year.
- Electrobun runs its main process on Bun, so Tau's server could run inside the app as it is, with no sidecar and no port to Node. It uses the system webview by default and can bundle Chromium (CEF) instead, which answers the WebKit problem. Updates ship as binary diffs. It is the best fit for the stack. It reached a stable v1 in February 2026 and is now on v2 betas, with about 13k stars and one main author. Its open issues include a memory leak in a Windows tray app, Intel Macs dropped in v2, and no native Wayland.
- Tauri is a small Rust shell around the system webview, with the Bun binary as a sidecar. Its updater checks a signed manifest. This is the setup OpenCode left, and Chromium support through CEF isn't stable yet.
- A plain webview inside the Bun binary itself. The webview C library, which Ollama's app uses from Go, has Bun bindings in `webview-bun`. `tau` would open its own window, with no app framework at all. It's WebKit, with no updater and few native menus, and it still needs a `.app` bundle to get its own Dock icon.
- The browser the user already has, in app mode. `chrome --app=http://localhost:3141 --user-data-dir=~/.tau/chrome` opens a window with no tabs or address bar, in a fresh profile with no extensions. This takes no native code and gives full Chromium. Google's Carlo and Go's Lorca were built on this trick. The Dock icon is Chrome's, and it needs Chrome or another Chromium browser installed.

Electrobun 2.0 (August 2026) changed course. Bun was acquired by Anthropic and rewritten from Zig to Rust, and Electrobun's author didn't want to follow that. So 2.0 makes Cottontail, his own JavaScript runtime written with AI agents against Bun's and Node's test suites, the default main process, and adds Hutch, a new build tool with its own npm resolver. Bun stays as an option, pinned to Bun 1.4.0 by default. The build config has a `bunVersion` override that downloads another Bun release, documented for 1.x and not yet tried on 2.0. The window code is a Zig core shared by SDKs for Rust, Zig, Go, and Odin. For an app that only wants Bun and a window, that is a lot of new, one-person stack underneath.

Simpler shells that keep Tau's own Bun binary as the server:

- Electron with the Bun binary as a child process. The Electron side is small: start the binary on a free port, wait for it to answer, open a `BrowserWindow` on its URL. It is the most proven option, with Chromium and electron-builder's updater, at the cost of size, since both Chromium and Bun ship.
- `webview-bun`, Bun bindings for the webview C library that Ollama uses from Go. The Tau binary opens its own window, in one process, with no framework. It has one main maintainer and its last release was in April 2025, it is WebKit on macOS, and it has no updater, so the binary's own updater does the job.
- Chrome in app mode, described above. Neutralino's `chrome` mode is the same trick with a list of flags worth copying.
- WebviewJS, a newer system-webview library for Node, Bun, and Deno, with windows, menus, tray, IPC, and a build that wraps `bun build --compile`. It is WebKit on macOS, like `webview-bun`.
- Tauri as the shell with the Bun binary as a sidecar. Tauri's Chromium runtime, `tauri-runtime-cef`, is in alpha (3.0.0-alpha, autumn 2026), so today it means WebKit.

`Bun.WebView` is built into Bun but is headless only for now (`headless: false` throws). If Bun ever adds visible windows, it would be the simplest shell of all.

Bundling a prebuilt WebKit isn't a real option. Apple ships WebKit as part of macOS, so the only engine an app can bring along is Chromium, through Electron or CEF.

## Why Electron can't run on Bun

Electron is not a Node app that any compatible runtime could run. Its main process is Node compiled into Chromium, sharing Chromium's V8 engine, and Electron's native code calls V8 directly. Bun runs on JavaScriptCore, Safari's engine, so it can't take Node's place there, however complete its Node APIs are. Electron's team declined a Bun runtime for this reason, and Bun's team closed a desktop framework request as not planned. Bun can still install and launch Electron, and run as a sidecar process next to it.

The closest thing to "Electron with its own runtime" is `deno desktop`, in Deno 2.9 (June 2026). It compiles a Deno server and a webview into one binary, with bundled Chromium as an option, built-in binary-diff updates with rollback, and cross-compiling for all three platforms. It's marked experimental, and Tau would have to move from Bun to Deno: `Bun.serve`, `Bun.spawn` with a terminal, and `Bun.Image` would all need replacements.

## Not worth it

- React Native would mean rewriting the UI and losing the phone browser, which is the main point of Tau.
- GPUI, Zed's Rust UI framework, would mean rewriting everything in Rust. Tau's slow parts are streaming and diffs, not the browser's paint speed, so a native renderer wouldn't help where it counts.
- Docker suits servers, not a dev machine tool. The agent needs the host's git, editors, and shells, and a container hides them.

## Suggested path

1. Make the server portable: data in `~/.tau/`, skills embedded, one compile entry.
2. Ship option 1 with an install script and an in-app update button, on top of the GitHub releases.
3. Add a first-run setup screen.
4. Document installing Tau as a Chrome app from the main profile, with extensions blocked on its origins. Build `tau open` only if that falls short.
5. Keep Electrobun or Electron in reserve, only if a real app turns out to be needed.

Tau is built for one person (see `AGENTS.md`), so each step should stay useful to its author too. A portable server with `~/.tau/` and one-click updates is useful to the author as well.

## Sources

- Electron issue declining a Bun runtime: https://github.com/electron/electron/issues/34876
- Bun's team on desktop apps, closed as not planned: https://github.com/oven-sh/bun/issues/8205
- `deno desktop` docs: https://docs.deno.com/runtime/desktop/ and the Deno 2.9 post: https://deno.com/blog/v2.9
- Electrobun 2.x changelog, on runtimes and the Bun pin: https://framework.blackboard.sh/electrobun/guides/changelog/v2-x/
- An Electron app with a compiled Bun sidecar: https://github.com/andresmarpz/sandcastle/pull/152

- Bun single-file executables, including full-stack apps and embedded assets: https://bun.com/docs/bundler/executables
- OpenCode install script, `upgrade` command, and Tauri desktop app: https://opencode.ai/download, https://github.com/anomalyco/opencode
- Why OpenCode moved its desktop app from Tauri to Electron: https://dev.to/brendonovich/moving-opencode-desktop-to-electron-4hip, and a teardown of the result: https://github.com/OpenAgentsInc/openagents/blob/main/docs/teardowns/2026-07-10-opencode-desktop-app-teardown.md
- T3 Code, with both a CLI service and an Electron app: https://github.com/pingdotgg/t3code
- Ollama's app, a Go server with a plain webview window: https://github.com/ollama/ollama/tree/main/app
- Ollama's background app and "Restart to update": https://docs.ollama.com/faq
- Electron updates and signing: https://www.electron.build/docs/features/auto-update, https://www.electron.build/docs/features/code-signing/
- Tauri updater and Node.js sidecar: https://v2.tauri.app/plugin/updater/, https://v2.tauri.app/learn/sidecar-nodejs/
- Electrobun 2.0, Cottontail, and Hutch: https://blackboard.sh/blog/electrobun-2-0/
- webview-bun: https://github.com/tr1ckydev/webview-bun, and Bun.WebView: https://bun.com/docs/runtime/webview
- Electrobun's `bunVersion` override: https://docs.electrobunny.ai/electrobun/apis/cli/build-configuration/
- WebviewJS: https://webview.js.org/
- Neutralino's Chrome mode: https://neutralino.js.org/docs/configuration/modes/
- tauri-runtime-cef: https://crates.io/crates/tauri-runtime-cef
- Electrobun: https://blackboard.sh/electrobun/, and one developer's review: https://jfay.dev/blog/going-native-with-electrobun/
