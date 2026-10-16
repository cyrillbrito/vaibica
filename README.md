<div align="center">

# Bica

**A fast, polished web UI for [Pi](https://github.com/earendil-works/pi) agents, built on Pi Durable.**
Run it on your dev machine. Use it from any browser, desktop or phone.

</div>

> A dev tool for one person, not a product. If a daily dev task forces a switch to another app, that's a gap worth closing.

## Features

- Many live sessions at once: streaming transcripts, queue or steer while the agent works, forks, voice calls.
- Projects and worktrees, so parallel agents never collide.
- Review in full-size files and diffs, with a Git panel to stage, commit, push, and pull.
- Terminals shared by you and the agents.
- Context window, prompt cache, spend, and plan limits at a glance.
- Remote first: use it from a phone, and reconnect or join late without losing anything.

## Quick start

Requires Bun 1.4.2 or newer, which is also the package manager.

```bash
bun install
cp .env.example .env   # optional: provider keys, or add them in Settings
bun run dev            # http://localhost:3142
```

| Command             | What it does                                            |
| ------------------- | ------------------------------------------------------- |
| `bun run dev`       | Dev server                                              |
| `bun run build`     | Production build to `dist/`                             |
| `bun run start`     | Run the build (loads `.env`)                            |
| `bun run lint`      | Lint `src` with Oxlint                                  |
| `bun run fmt:check` | Check formatting with Oxfmt                             |
| `bun run check`     | Type-check the app and scripts                          |
| `bun run test:bun`  | Disposable Durable, recovery, codemode and image checks |

Environment variables are validated at boot in [`env.ts`](env.ts). There is no login, so use it on localhost or a private network, see [docs/deploy.md](docs/deploy.md).

## Docs

[AGENTS.md](AGENTS.md) has the goals, stack, what comes next, and the index of the docs. Start with [docs/architecture.md](docs/architecture.md).
