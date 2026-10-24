import type { Command, CommandContext } from '#extensions/contract';

// Extensions' commands by id (docs/command-palette.md). ⌘K lists them, and
// any code can run one by id. Core's own entries are still ⌘K's own list.

// Set by ⌘K, which is always mounted inside the router: the commands of the
// extensions that are on, and what they run with.
let source:
  | { commands: () => readonly Command[]; context: () => CommandContext }
  | undefined;

export function provideCommands(from: NonNullable<typeof source>) {
  source = from;
}

/** Runs a command by id; false when none is on or it doesn't apply now. */
export function runCommand(id: string) {
  const command = source?.commands().find((c) => c.id === id);
  const context = source?.context();
  if (!command || !context || (command.when && !command.when(context)))
    return false;
  void command.run(context);
  return true;
}
