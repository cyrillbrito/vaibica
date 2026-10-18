# Assistant mode

Assistant mode is for a session you never close. Most sessions are a task: you start one, finish the work, and move on. Some are a companion instead, like a notes vault you talk to every day, ask to keep track of things, and come back to for months. Assistant mode lets that kind of session keep going without you thinking about context size, cost, or when to start over.

Assistant is a [profile](./profiles.md) you pick when you start a session, with the Assistant button next to the workspace. "Turn off assistant mode" in the context chip's menu makes it a coding session again. The chip then shows an infinity sign. The [hub](./hub.md) is kept small the same way.

## The idea

A long conversation has two problems. It gets expensive, because every message resends everything before it. And it gets forgetful, because the model works worse as the context grows, and summaries lose detail every time they are made.

Assistant mode answers both with one split. The conversation is short-term memory, and it gets trimmed regularly. Files in the project are long-term memory, and they keep what matters. The agent writes to them as it goes, and always before anything is summarized away. The files sync with the folder like any other note, so the memory follows you to another machine and doesn't depend on Bica.

## What happens

Bica looks after the session while it sits idle, so it never interrupts you in the middle of work.

- It clears old tool output once the session has been idle long enough that the prompt cache has expired. This is the cheap step: your messages and the agent's replies stay, and only the bulky output of past tool calls goes.
- When the session is still big after that, it asks the agent to save anything worth keeping to the memory files, and then compacts the older turns into a summary. It does this just before the cache expires, while rereading the conversation is still cheap.
- When a session gets very big during heavy use, it does the same at the first idle minute instead of waiting for a long pause.

Both sizes are constants in `upkeep.ts`, tuned by use.

Its instructions open like a coding session's, so turning assistant mode on keeps most of the prompt cache, and then add its role. They say it is a long-running helper for one project, there for notes, planning, research, answers, and quick fixes, and that a bigger coding task goes to a session of its own. It can coordinate a few sessions like that, with the same handoff rules as the [hub](./hub.md). Its instructions lean toward its own project, but nothing stops it from starting a session in another project when you ask.

It also gets the memory rules for long-lived sessions, which the [hub](./hub.md) shares. It writes decisions, preferences, and open tasks down in the same reply they come up in. It keeps only what will still be true and useful in a few months, and what the user said or it checked, not its guesses. It replaces a fact that changed instead of adding a second line, and splits a note that grows too long. It says so when memory holds nothing on a topic, rather than guess. And it says in its replies what it learned from tools, since that output will be cleared later.

## The memory index

Every session, assistant or not, starts with the memory index in its instructions, so the agent doesn't have to remember to read it. The index is `MEMORY.md` or, failing that, `PROFILE.md` in the session's folder. Bica takes a copy when the session starts and keeps it until the next compaction, even when the agent edits the file. Reloading it on every change would break the prompt cache each time. A long index is cut, and the agent is told it was cut, so it can read the rest and shorten the file. The context meter shows the index as its own line.

## Why it works this way

- Rereading from the prompt cache is cheap ([context-usage.md](./context-usage.md)), and every change to old context breaks the cache once. So Bica changes it rarely, in large steps, and only when the cache is expired or about to be.
- Clearing old tool output keeps nearly all the value of a summary at no cost, so it comes first, and compaction only follows when that isn't enough.
- A summary of a summary of a summary forgets more each time. Saving to files before each compaction means the summary never has to carry what matters most.
- Compacting costs as much as rereading what it removes many times over. Below the first size, a compaction during a pause you may not come back from is often wasted money.

## Sources

Each idea here is borrowed from people who built or measured it. Their numbers come from their own setups, so they are a reason to trust the direction, not proof for ours.

- [The Complexity Trap](https://arxiv.org/abs/2508.21433), a JetBrains study: hiding old tool output solved as many coding tasks as LLM summaries, at about half the cost.
- [Anthropic's context management](https://www.anthropic.com/news/context-management) and its [context editing docs](https://platform.claude.com/docs/en/build-with-claude/context-editing): clearing old tool results, in batches, because each clear breaks the cache.
- [The Compaction Cliff](https://arxiv.org/abs/2608.22752): instructions survive one compaction about half the time, and five in a row about a tenth of the time.
- OpenClaw's [memory flush](https://docs.openclaw.ai/reference/session-management-compaction/housekeeping): a silent turn that saves to memory files before compacting.
- Memory in markdown files: [Claude Code's memory](https://code.claude.com/docs/en/memory), [OpenClaw's memory](https://docs.openclaw.ai/concepts/memory), Letta's [context repositories](https://www.letta.com/blog/context-repositories/), the Pi packages [pi-memory-md](https://pi.dev/packages/pi-memory-md) and [pi-markdown-memory](https://pi.dev/packages/@abarisain/pi-markdown-memory), and Manus's [context engineering lessons](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus).
- [obsidian-mind](https://github.com/breferrari/obsidian-mind): load the memory up front instead of asking the agent to go read it (its README notes that "go consult" instructions get skipped, while writes that follow an event happen), say when a part was cut instead of dropping it, replace corrected facts, and split notes rather than trim them.
- Taelin's [OptChat](https://gist.github.com/VictorTaelin/91837951a5ce5b38f341ec1ba1df6449): the compaction rules (keep the user's words, copy names exactly, never overstate progress) and batching changes to keep the cache.

Left out on purpose: model-driven folding, as in [billion-context](https://pi.dev/packages/billion-context), where the model folds old ranges into summaries and unfolds them later, and OptChat's summary tree with a `zoom` tool. Both are more complex, and nobody has shown they work better.

## Where it lives

The behavior is in `src/server/profiles/upkeep.ts`, and the memory index in `loadMemory` in `src/server/profiles/common.ts`. Assistant mode needs a model with a known cache lifetime, which means Anthropic's, and works best with the 1-hour prompt cache that Bica uses by default. See [context-usage.md](./context-usage.md) for the cache, Clean up, and compaction themselves.
