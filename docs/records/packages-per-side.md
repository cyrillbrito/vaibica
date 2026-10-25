# Packages per side

October 2026. Decision: the repo is three workspace packages, `client`, `server`, and `shared`, instead of one source tree whose feature folders mix server and browser code.

## What it replaced

The first source-layout plan put each feature's server and browser code in one folder. To keep server code out of the browser, every server file started with `import 'server-only'`, Solid's Vite plugin failed when the browser reached one, and a lint rule spread the marker up the import chain. Bun didn't know the marker, so the server needed a shim at runtime, in tests, and in the binary build.

## Why it changed

Dropping server-side rendering left nothing that runs on both sides except a few modules of pure TypeScript: the message types, the agents' names, and the transcript projection. No browser file imported the server, and the server imported only those modules from the browser's tree. The two sides were already two programs, built by different tools: Vite builds the app, and Bun runs the server.

Packages make that separation the structure instead of a check:

- The client can't import the server, because its `package.json` doesn't list it. The markers, the shim, and the lint rule went away.
- Each package type-checks with its own types, so the server can't use `document` and the client can't use `Bun` or `node:fs`.
- The dev server became two processes. Vite only serves pages and forwards the socket, so restarting it no longer touches running agents.

The cost is that a feature spans folders again: terminals are `client/src/terminals`, `server/src/terminals`, and their types in `shared`. [Feature folders](./feature-folders.md) covers how the folders inside each package are cut. With the same names on every side and agents doing most edits, that's cheap. opencode and T3 Code, the apps the plan compared against, are laid out this way.

## Sources

- [opencode](https://github.com/anomalyco/opencode) and [T3 Code](https://github.com/pingdotgg/t3code): an app package, a server package, and a protocol package.
- [Bun workspaces](https://bun.sh/docs/install/workspaces) and Vite's [`server.proxy`](https://vite.dev/config/server-options#server-proxy).
