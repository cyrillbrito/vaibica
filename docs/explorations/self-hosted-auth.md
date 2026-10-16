# Self-hosted auth

This is exploration work. Nothing here is built. It looks at how other self-hosted tools protect themselves with one shared secret, and proposes the smallest version of that for Tau.

## The problem

Tau runs agents, terminals, and git on the machine it runs on, so anyone who reaches its socket has a shell there. Today the network is the lock: the server listens on localhost, and the phone reaches it through `tailscale serve` (see [deploy.md](../deploy.md)).

If Tau becomes public software that people host themselves, some of them will put it behind a reverse proxy, a Cloudflare tunnel, or `0.0.0.0` on a LAN. It then needs a lock of its own. The decisions so far:

- The server keeps serving its own frontend.
- Users decide how to expose it.
- There are no user accounts, only one global secret.

There is also a hole today, even without exposure. The socket accepts a handshake when the `Origin` host equals the `Host` header (`handleUpgrade` in `src/server/socket.ts`). A DNS rebinding attack passes that check: a page on `evil.example` re-points its own name to `127.0.0.1`, so both headers say `evil.example:3142`, and the page drives the agent. Vite's `allowedHosts` doesn't help in dev, because Tau answers the upgrade on Vite's HTTP server before Vite's host check runs. The fix is the same as for the rest of this doc: a secret the attacker's page doesn't have, or a `Host` allowlist.

## How other tools do it

| Tool | How the secret is set | How the browser keeps it | Default bind |
| --- | --- | --- | --- |
| Jupyter | Random token per start, printed in a URL; or `JUPYTER_TOKEN`; or a hashed password from `jupyter server password` | Cookie after the first visit | localhost |
| code-server | Random password written to `~/.config/code-server/config.yaml` on first run; or `PASSWORD` / `HASHED_PASSWORD` | Cookie holding the hashed password | `127.0.0.1:8080` |
| openvscode-server | `--connection-token` or `--connection-token-file`, printed as a URL | Cookie after the first visit | localhost |
| OpenCode | `OPENCODE_SERVER_PASSWORD`, opt-in | HTTP basic auth (user `opencode`) | `127.0.0.1` |
| T3 Code | One-time pairing token printed with a QR code by `t3 serve` or `t3 pair` | A session per device, revocable | Bind to a private address, by the docs' advice |
| Pi-hole v6 | Random password at install, `pihole setpassword` to change | `sid` cookie plus a CSRF token, 30-minute sliding session | LAN |
| Syncthing | Username and password set in the GUI, none by default | Session cookie, "stay logged in" option, CSRF header | `127.0.0.1:8384` |
| AdGuard Home | Setup wizard on first visit (port 3000), bcrypt hash in the YAML | `agh_session` cookie, HttpOnly, SameSite Lax, about a year | `0.0.0.0` |
| Portainer | Admin password set on first visit | Session | `0.0.0.0` |
| Home Assistant | Owner account created on first visit | Tokens in localStorage | `0.0.0.0` |
| Transmission | `rpc-username` and `rpc-password` in `settings.json` | HTTP basic auth | IP allowlist, `127.0.0.1` |
| ttyd | `-c user:pass` | Basic auth for the page, then a token fetched from `/token` for the socket | all interfaces |

What each one teaches:

- Jupyter is the closest match to Tau: it runs code, it has no accounts, and it has had token auth on by default for years. The token is generated on each start and printed as a clickable URL, and visiting it once sets a cookie. Setting the token to an empty string turns auth off, and the docs say not to. A separate `Host` check refuses names that don't look local (`allow_remote_access`, `local_hostnames`), which is its DNS rebinding defense.
- code-server writes a random password to a config file on first run, so it is never unprotected and the user can still change it. It rate-limits failed logins in-process (about 2 a minute and 12 an hour) and logs each failure with the forwarded IP. Its cookie holds a hash of the password, so changing the password logs everyone out. `--auth none` is the opt-out for people behind a proxy. It also shipped CVE-2023-26114: the socket didn't check `Origin`, and the fix broke reverse proxies that didn't forward `Host`.
- openvscode-server shows the opposite default. Since 1.64 its Docker image runs `--without-connection-token`, on the theory that a proxy does auth. That's convenient, and it's how people end up with open IDEs on the internet.
- OpenCode is the simplest: one env var turns on basic auth, and with no password it serves openly with a warning. A recent change that generated a password on every start was reverted because it broke people already behind Cloudflare Access. That's the opt-out lesson: a forced, rotating secret hurts proxy users.
- T3 Code is closest in spirit to a coding agent UI. `t3 serve` prints a connection string, a one-time pairing token, a URL, and a QR code. The phone trades the token for its own session, and `t3 auth` lists and revokes sessions and links. The token sits in the URL hash, so it isn't sent to servers or logged by proxies. Its docs treat pairing links as passwords and say to bind to a Tailnet IP.
- Pi-hole caps concurrent sessions (16) and returns 429 when logins come too fast. Its `sid` cookie once collided with other apps on the same IP, because cookies ignore the port. Tau's cookie needs a name nobody else uses.
- Syncthing ships with no password, but shows a warning banner whenever the GUI is reachable from outside without one. When it is bound to localhost, it refuses any `Host` that isn't localhost, which breaks proxies until the user sets `insecureSkipHostcheck`. A failed login sleeps before answering. The reset path is a CLI command run while the server is stopped.
- Portainer, Home Assistant, and AdGuard Home create the secret on the first visit. That has a race: whoever loads the page first owns the install. Portainer closes it by shutting setup down if nobody finishes it within 5 minutes of start. This is the main reason to avoid first-visit setup for Tau.
- Transmission learned DNS rebinding the hard way. Its CSRF header (`X-Transmission-Session-Id`, handed out with a 409) didn't stop a rebinding attack that led to code execution in 2018. The fix was a `Host` allowlist on by default.
- ttyd hits the WebSocket problem directly: browsers can't set headers on a WebSocket, so it exchanges basic auth for a token the socket carries. It also has `-H`, which trusts a header set by an auth proxy.
- Claude Code Remote Control isn't self-hosted. The local session connects outward to Anthropic and the phone signs in with a claude.ai account, so no port is opened. Its QR code is just a link to the session. The useful part for Tau is the habit: show a QR code, don't make anyone type.

Common patterns across all of them:

- The good defaults bind to localhost and generate a secret nobody has to choose.
- Browsers remember a cookie. Basic auth is used only by the simplest tools.
- The socket is checked with the same cookie, plus an `Origin` check.
- Rate limiting matters only when users pick their own passwords. A random 128-bit token can't be guessed.
- Reset is either "change the file and restart" or a CLI command. Changing the secret logs out every device.

## Phones and installed apps

The phone is the hard case.

- Basic auth and installed apps don't mix well. iOS home screen apps prompt badly or not at all, Android tends to forget the credentials when the app closes, and there is no way to log out. The web manifest is fetched without credentials unless the link has `crossorigin="use-credentials"`, so a manifest behind basic auth breaks install.
- Redirecting to a login page breaks iOS standalone apps. A navigation to another URL can leave the app shell and open Safari, and the app is stuck. Showing the login inside the app, without leaving the page, avoids it.
- Cookies set by the server last. Chrome caps them at 400 days. Safari's 7-day cap applies only to storage written by script (`document.cookie`, localStorage), not to `HttpOnly` cookies from a response, and home screen apps have their own counter anyway. A cookie refreshed on each visit effectively never expires for someone who uses the app.
- On iOS, a home screen app has its own cookie jar, separate from Safari. Since iOS 17, Safari copies the site's cookies into the app at the moment it's added to the home screen. Nothing else is copied, localStorage included. So the clean iOS flow is: open the pairing link in Safari, which sets the cookie, then add to home screen. A link tapped later opens in Safari, not in the app, so the app also needs a way to paste the token.
- There are reports of iOS 17 home screen apps losing cookies at random. A paste box in the app is the fallback for that too.

## Pairing instead of typing

Typing a 30-character token on a phone is miserable. Every tool that cares about phones prints a link or a QR code instead.

- The server prints `https://<host>/#token=...` at startup, and a QR code of it. The token goes in the hash so it never reaches a proxy log or the server's request line. The page reads it, trades it for a cookie, and clears the hash with `history.replaceState`.
- The server doesn't know its public address, because the user's proxy decides it. It can print the localhost link, and the user swaps the host. Or the desktop, already signed in, shows a "Pair a phone" QR code in Settings built from `location.origin`, which is already the right address. That second flow is simpler for the user and needs no guessing on the server.
- T3 makes each link one-time and gives each device its own revocable session. That's better security, but it needs a session store and a page to manage it. With one shared token, rotating it logs everyone out, which is a fine revoke for one person.

## Opting out

People behind Tailscale, Cloudflare Access, or an auth proxy already have a login, and a second one is friction. The author is one of them.

- An env var turns auth off: `TAU_AUTH=off`, like code-server's `--auth none` or Jupyter's empty token. Off should be a choice, not the default.
- Don't skip auth for "local" requests by looking at the client address. Every reverse proxy on the same machine, `tailscale serve` included, connects from `127.0.0.1`, so every remote request would look local.
- Don't skip it by looking at the `Host` header either. nginx rewrites `Host` to the upstream (`localhost:3142`) unless told otherwise, so remote requests would look local again.
- Trusting `Tailscale-User-Login` is tempting, since `tailscale serve` strips and sets it. But any other path to the port, such as another proxy, can send the header too. It's only safe if the user says so, which is the same as `TAU_AUTH=off`.
- With auth off, the DNS rebinding hole is still there, so the `Host` allowlist must stay on: localhost, IP addresses, and names the user adds (Vite's `allowedHosts` already uses `.ts.net` in dev).
- When auth is off and the server binds to something other than loopback, print a loud warning, as Syncthing and OpenCode do.

## Pitfalls

- Cross-site WebSocket hijacking. Browsers send cookies on cross-site WebSocket handshakes, and the same-origin policy doesn't cover WebSockets. The `Origin` check that exists today stays. `SameSite=Lax` on the cookie helps but isn't a defense on its own.
- CSRF. Tau has no HTTP routes that change state, because all work goes over the socket. That keeps CSRF out of scope, as long as any new HTTP route (a login endpoint, for example) also checks `Origin`.
- DNS rebinding. A cookie or token defeats it, because the attacker's page sits on another site and has neither. Without auth, only a `Host` allowlist does.
- Plain HTTP. The token and cookie cross the network in clear text, and installed apps and secure-context APIs need HTTPS anyway, except on localhost. Tau can't fix this, since the user's proxy owns TLS. The docs should say "use Tailscale or an HTTPS proxy", and the cookie gets `Secure` whenever the request came over HTTPS.
- Cookies ignore ports. The dev server (3142) and the built server (3141) on one host share cookies, as do other tools on the same host. A specific name like `tau_token` avoids collisions with other apps, and both Tau servers read the same `.data/` anyway.
- Comparing secrets. Use `crypto.timingSafeEqual`, not `===`.
- XSS. Tau renders agent output as markdown, so a rendering bug could run script. An `HttpOnly` cookie keeps the token itself out of reach, even though such a script could still use the open socket while it runs.

## Candidate designs

### A: one generated token, a pairing link, and a cookie on the socket

On first start, the server writes a random token to `.data/token` with owner-only permissions, unless `TAU_TOKEN` is set. It prints a link with the token in the hash, and later a QR code. Only the WebSocket handshake is checked. The app shell, icons, and manifest stay public, since they hold no data and Tau is open source.

- The page reads the token from the hash or from a paste box, and the server sets a long-lived `HttpOnly` cookie named `tau_token`. Each handshake checks the cookie with `timingSafeEqual` and refreshes it.
- To keep everything in `handleUpgrade`, which dev and built already share, the client can send the token once as a WebSocket subprotocol, and the server can put `Set-Cookie` on the 101 response. Whether iOS Safari stores a cookie from a 101 response needs a test. If it doesn't, a small `POST /auth` route does the same job, at the cost of adding it to both the Vite middleware and `start.js`.
- When the socket is refused, the app shows a "Paste your token" screen in place, with no redirect, so installed apps never leave their shell.
- Reset: delete `.data/token` and restart. Every device is logged out. `TAU_AUTH=off` turns it off, and the `Host` allowlist stays on.
- Trade-offs: very little code, nothing to guess, no rate limiter, no first-visit race, and it works on localhost the same as anywhere. The cost is pairing each browser once, the localhost one included, as in Jupyter. Revoking one device means revoking all of them.

### B: a password the user chooses

`TAU_PASSWORD` or a password set in Settings, a login form, and the same cookie on the socket.

- Trade-offs: it's familiar, and it's easy to type on a new device. But users choose weak passwords, so it needs a rate limiter and failure logs, as code-server and AdGuard have. Setting it on first visit brings the Portainer race back, so it must come from an env var or a file, not the browser. On a phone it is still more typing than a QR code.

### C: pairing codes with one session per device

Like T3. One-time pairing links, each device gets its own session token, and Settings lists the devices with a revoke button.

- Trade-offs: the best security and the nicest management. It also adds a session store, expiry, and a management page, which is a lot of machinery for one person with two or three devices.

HTTP basic auth on everything, as OpenCode does, was left out. It's the least code, but it breaks installed apps on the phone, needs `crossorigin="use-credentials"` on the manifest, has no logout, and isn't reliably sent on WebSocket handshakes.

## Recommendation

Design A. It's the Jupyter model, which has protected a code-running server without accounts for years, with T3's link in the hash and a paste box for iOS home screen apps. It needs no rate limiter, because nobody chooses the secret, and no session store, because rotating the one token is the revoke. Its only server change is in `handleUpgrade`, which also closes today's DNS rebinding hole.

Build it in this order, and stop as soon as it's enough:

1. The token file, the cookie check in `handleUpgrade`, the paste screen, the startup link, `TAU_AUTH=off`, and a `Host` allowlist for when auth is off.
2. A "Pair a phone" QR code in Settings, built from `location.origin`.
3. A QR code in the terminal, if people run it headless.

Skip a user-chosen password, per-device sessions, and rate limiting until someone needs them. `TAU_TOKEN` already lets anyone pick their own token.
