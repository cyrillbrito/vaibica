# Running and remote access

Tau runs as one Bun process on the dev machine, usually the dev server (`bun run dev`, port 3142). Phones and other machines reach it through `tailscale serve` on the same port:

- local: `http://localhost:3142`
- tailnet: `https://mini.boa-carob.ts.net:3142`

```sh
tailscale serve --bg --https=3142 http://localhost:3142
tailscale serve status
```

The serve config survives reboots, so only the dev server has to be running. The port is pinned, so the mapping never points at the wrong process.

## Why tailscale serve

It gives HTTPS with a real certificate, which the installed app and the microphone need, proxies WebSockets, and stays inside the tailnet. Never use `funnel`: there is no login, and the tailnet is the only protection.

## Installing as an app

`public/manifest.webmanifest` makes Tau installable, so it opens in its own window with its own Dock icon, away from browser tabs. In Chromium browsers such as Helium, use the install icon in the address bar. In Safari, use File → Add to Dock. The title bar takes the color from the `theme-color` meta tags, which follow the theme.

An installed app runs in the browser profile it was installed from, with that profile's extensions. To run Tau without them, install it from a separate profile that has no extensions.

## A built copy

`bun run build` and `bun run start` run a built copy on port 3141, localhost only. `TAU_PORT` and `PORT` pick other ports for a second dev or built server.

Data lives in `.data/`, relative to where the server starts. Never run two servers against the same `.data/`, since only one process may own the harness.

## The `tau` binary

`bun run build:tau` compiles the same production server into one file, `dist/tau/tau`, that runs from any folder with no repo or `node_modules`. The client, the shipped skills, and codemode's worker and wasm are embedded. `tau` listens on `localhost:3141` (`--port` picks another) and keeps its data in `~/.tau/data`, or in `TAU_DATA_DIR`, so it never shares the repo's `.data/`.

In a terminal it prints its address and a few keys, the way Vite does:

- `a` opens Tau as a Chrome app window (`--app`) in your own Chrome profile, so links open there too. Block extensions on Tau's address once in `chrome://extensions/sites`. Without Chrome it opens the default browser.
- `o` opens the default browser.
- `p` picks the Chrome profile from Chrome's `Local State`, saved in `chrome.json` in the data folder.
- `q` and Ctrl-C stop it, which ends its shells. Pi Durable resumes agent runs on the next start.

Without a terminal, as a background service, it only logs. Skills are unpacked to `skills/` in the data folder on every start, since the agent reads them as files. See [cli/tau.ts](../cli/tau.ts) and [cli/build.ts](../cli/build.ts).

`tau --version` prints the version, which comes from `TAU_VERSION` at build time. A local build without it says `0.0.0-dev`. `bun run build:tau --target bun-linux-x64` cross-compiles, into `dist/tau/linux-x64/tau`, and takes several `--target` flags at once.

## Releases

A release is a draft GitHub release with `tau` for macOS arm64 and x64 and Linux x64 and arm64, plus a `SHA256SUMS` file. The version lives only in its `vX.Y.Z` tag, never in `package.json`.

1. Start the `release` workflow: on GitHub, Actions → release → Run workflow, pick `patch`, `minor`, or `major`. From a terminal: `gh workflow run release -f bump=minor`.
2. The workflow raises the latest tag's version by that part, starting from `v0.0.0`, builds, pushes the tag, and creates the draft. A failed build leaves no tag.
3. Review the draft under Releases. Its notes list the commit subjects since the previous tag and a compare link. Edit them there or with `gh release edit`, then publish.

It runs on macOS so `codesign --sign -` can sign the macOS binaries, which Apple Silicon needs to run them. See [release.yml](../.github/workflows/release.yml).

## Slow links

The phone loads the unbundled dev server, so first-load size matters. The dev server compresses its responses, and icons are imported one by one so the whole icon set never ships.
