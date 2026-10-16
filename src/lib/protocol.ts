// The wire format of the one WebSocket (docs/realtime-communication.md).
// Shared by src/server/socket.ts and src/lib/socket.ts; types only.
import type { Op } from '@earendil-works/chord/delta';
import type { ConversationView } from '@earendil-works/pi-durable';
import type { ProfileId } from './profiles';

export { SOCKET_PATH } from './socket-path';

// A run in progress (or backing off after a provider error), or none: failed,
// asked the user something (waiting), finished with an answer not yet opened
// (done), or read (idle).
export type SessionStatus =
  | 'running'
  | 'retrying'
  | 'error'
  | 'waiting'
  | 'done'
  | 'idle';

export interface SessionSummary {
  id: string;
  title: string;
  status: SessionStatus;
  createdAt: number;
  // The newest message, or creation if there is none.
  updatedAt: number;
  // While running or retrying: when the current run's prompt was sent, for
  // the live clock in the sidebar; null otherwise.
  runningSince: number | null;
  // null: made before projects existed.
  projectId: string | null;
  // The folder it runs in: a workspace path, or one that's gone since.
  cwd: string | null;
  // When it was archived (hidden from the list, kept); null: not archived.
  archivedAt: number | null;
  // The session it was forked from; null: started fresh.
  forkedFrom: string | null;
  // The last entry it took from there.
  forkedAt: number | null;
  // The session whose agent started it; null: started by the user.
  startedBy: string | null;
  // Its worktree was cleaned up: the branch and PR it had then; null: not.
  cleanedUp: { branch: string | null; pr: PullRequest | null } | null;
  // What kind of session it is: its tools, instructions, and panels
  // (docs/profiles.md).
  profile: ProfileId;
  // How its voice calls sound; null: the defaults.
  voice: VoiceSettings | null;
}

/** A session's voice calls (docs/voice.md). */
// A type, not an interface: session docs only take plain JSON shapes.
export type VoiceSettings = {
  // How fast the voice talks, 0.25 to 1.5; 1 is normal. Asked for in its
  // instructions: GPT-Live has no speed setting.
  speed: number;
  // Added to the voice's own instructions: language, pace, role.
  instructions: string;
};

/** How hard the model thinks; models support a subset (pi-ai's levels). */
export type ThinkingLevel =
  | 'off'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh'
  | 'max';

export interface ModelRef {
  provider: string;
  modelId: string;
}

export interface ModelChoice {
  model: ModelRef;
  thinkingLevel: ThinkingLevel;
}

/** What new sessions start with, which models the pickers offer, git habits. */
export interface ModelSettings extends ModelChoice {
  // `provider/modelId`s; empty: every available model.
  enabled: string[];
  // The small model for titles and commit messages; null: none.
  fastModel: ModelRef | null;
  // Opening a file's diff under Changes stages it: staged means reviewed.
  stageOnView: boolean;
  // Ask for the long prompt cache: 1 hour on Claude, 24 hours on some OpenAI
  // models. False: the 5-minute default.
  longCache: boolean;
  // The hub's folder (docs/hub.md); null: not picked yet.
  hubFolder: string | null;
  // The hub's model and effort; null: Tau's pick for it.
  hubModel: ModelChoice | null;
}

/** The providers with a key on the server, and the models they reach. */
export interface ModelCatalog {
  // `source`: where the key comes from, e.g. its env var.
  providers: { id: string; name: string; source: string | null }[];
  models: {
    provider: string;
    id: string;
    name: string;
    levels: ThinkingLevel[];
    contextWindow: number;
    // List price in dollars per million tokens; 0: unknown (proxy models).
    cost: { input: number; output: number; cacheRead: number };
    // Takes images in prompts.
    images: boolean;
    // Prompt cache lifetimes in seconds; absent: unknown or no cache.
    cacheTtl: { short?: number; long?: number };
  }[];
  settings: ModelSettings;
  // Which defaults still come from the server's env (PI_MODEL, PI_FAST_MODEL)
  // because nothing was picked in Settings.
  fromEnv: { model: boolean; fastModel: boolean };
  // Auto-compaction: blocks at contextWindow - reserveTokens, starts in the
  // background backgroundTokens before that.
  compaction: { reserveTokens: number; backgroundTokens: number };
}

/** A model provider or a tool service (Exa) and how it's signed in. */
export interface Account {
  id: string;
  name: string;
  // What it's for and where a key comes from; null: no guide written.
  about: string | null;
  link: { label: string; url: string } | null;
  // The env vars it reads, as a hint.
  env: string | null;
  // null: not set up. saved: signed in or a key added in Settings (can be
  // removed here); otherwise where it comes from, e.g. its env var.
  status: { type: 'oauth' | 'api_key'; saved: boolean; source: string } | null;
  methods: { type: 'oauth' | 'api_key'; label: string }[];
}

/** A sign-in in progress: what the provider asked so far. */
export interface SignIn {
  id: string;
  account: string;
  // A page to open and sign in on.
  url: string | null;
  instructions: string | null;
  // Device code flows: the code to type at `uri`.
  device: { code: string; uri: string } | null;
  notes: { message: string; links: { label?: string; url: string }[] }[];
  progress: string | null;
  // Waiting for the user; answered with `account.answer`.
  prompt: {
    id: string;
    type: 'text' | 'secret' | 'select' | 'manual_code';
    message: string;
    placeholder: string | null;
    options: { id: string; label: string; description?: string }[];
  } | null;
  error: string | null;
}

export interface Accounts {
  accounts: Account[];
  // One at a time, shared by every tab; null: none running.
  signIn: SignIn | null;
  // The CLIProxyAPI server (docs/proxy.md); null: not set up.
  proxy: ProxyStatus | null;
}

export interface ProxyStatus {
  url: string;
  // A management key is saved, so its accounts show.
  managementKey: boolean;
  models: number;
  // The last model list or account read failed.
  error: string | null;
}

/** A folder sessions run in; git is optional. */
export interface Project {
  id: string;
  name: string;
  path: string;
  git: boolean;
  // Set by hand in projects.json: a link with `{key}`, so ticket tags in
  // branch names open the ticket.
  tickets?: string;
  // The project folder, or every worktree of its repo; never empty.
  workspaces: Workspace[];
}

/** A project's main folder or one of its git worktrees. */
export interface Workspace {
  path: string;
  // null: not git, or a detached HEAD.
  branch: string | null;
  // The repo's main worktree (or the folder of a non-git project).
  main: boolean;
  // The newest PR of mine from this branch, via gh; null: none, or not known yet.
  pr: PullRequest | null;
}

/** A GitHub pull request, as `gh` reports it. A type, so docs can store it. */
export type PullRequest = {
  number: number;
  title: string;
  url: string;
  state: 'open' | 'draft' | 'merged' | 'closed';
  // The commit it was opened or merged at.
  head: string;
};

export interface DirListing {
  path: string;
  parent: string | null;
  dirs: { name: string; path: string; git: boolean }[];
}

/** A project folder or worktree, as the browser names it. */
export interface WorkspaceRef {
  projectId: string;
  cwd: string;
}

/**
 * One changed file. M modified, A added, D deleted, R renamed,
 * U untracked, ! conflicted.
 */
export interface GitChange {
  path: string;
  // Renames: where it came from.
  oldPath?: string;
  status: 'M' | 'A' | 'D' | 'R' | 'U' | '!';
  // Changes whenever this side of the file does, so open views re-read.
  version: string;
  // Lines added and removed on this side; absent: binary or not counted.
  added?: number;
  removed?: number;
}

/** A commit on the current branch. */
export interface GitCommit {
  hash: string;
  subject: string;
  // Committer time, ms.
  time: number;
}

export interface GitStatus {
  // null: detached HEAD.
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  staged: GitChange[];
  unstaged: GitChange[];
  // The newest few commits of HEAD; empty before the first commit.
  recent: GitCommit[];
  // Submodules with changes or commits to sync, each its own repo (nested
  // ones flattened). Their paths, and their changes', are from the workspace.
  submodules: (GitStatus & { path: string })[];
}

/** A file's text, its bytes when the browser can show it, or why neither. */
export type FileText =
  | { text: string }
  // An image, PDF, audio, or video file; data is base64.
  | { text: null; reason: 'media'; mimeType: string; data: string }
  | { text: null; reason: 'missing' | 'binary' | 'too large' };

/** One limit of a plan: the 5-hour session, the week, or a spend cap. */
export interface PlanWindow {
  key: string;
  label: string;
  // 0 to 1.
  utilization: number;
  // ms; null: no known reset, like Claude's monthly extra usage.
  resetsAt: number | null;
  // Blocked until it resets.
  limited: boolean;
  // Spend caps: dollars used of the limit.
  spent: { used: number; limit: number; currency: string } | null;
}

/** The limits of one of the proxy's signed-in plans. */
export interface ProviderUsage {
  // Unique: cliproxy:<account>.
  id: string;
  // pi-ai provider id: always cliproxy.
  provider: string;
  // Proxy accounts: the start of the model names they serve (claude, gpt).
  family: string | null;
  name: string;
  plan: string | null;
  windows: PlanWindow[];
  updatedAt: number;
}

export type PlanUsage = ProviderUsage[];

/** A shell in a workspace, maybe running a command (docs/terminals.md). */
export interface TerminalInfo {
  id: string;
  projectId: string;
  cwd: string;
  title: string;
  // The command it runs first, again on restart; null: none.
  command: string | null;
  // The shell itself.
  status: 'running' | 'exited';
  exitCode: number | null;
  // A command runs at its prompt; null: not known (no shell integration).
  busy: boolean | null;
  // The last finished command's exit code.
  lastExit: number | null;
  // The session whose agent started it; null: started by the user.
  startedBy: string | null;
  createdAt: number;
}

/** A terminal's output, raw (escape codes and all), capped at the front. */
export interface TerminalOutput {
  // Bumped on restart: start a clean screen.
  run: number;
  // Characters dropped from the front so far.
  start: number;
  output: string;
}

/** A pasted or picked image, sent with a prompt. data: base64, no prefix. */
export interface PromptImage {
  mimeType: string;
  data: string;
}

/** A prompt taken back out of the queue. */
export interface QueuedPrompt {
  prompt: string;
  images: PromptImage[];
}

/** One-off requests: args in, one reply out. */
export interface Calls {
  'session.create': {
    args: {
      projectId: string;
      // A workspace path of the project; absent: the project folder.
      cwd?: string;
      // May be empty when images are attached. Both empty: a session for a
      // voice call, named by its first hand-off.
      prompt: string;
      images?: PromptImage[];
      requestId: string;
      // Absent: the profile's default.
      choice?: ModelChoice;
      // Absent: coding.
      profile?: ProfileId;
      // Starts in a new worktree named after the session, instead of `cwd`.
      worktree?: boolean;
    };
    result: string;
  };
  'session.configure': { args: { id: string } & ModelChoice; result: null };
  'settings.update': { args: Partial<ModelSettings>; result: null };
  'project.add': { args: { path: string }; result: string };
  // Project ids in their new sidebar order; ids left out keep their place after.
  'project.reorder': { args: { ids: string[] }; result: null };
  // Removes a worktree and its local branch, archives its sessions, closes its
  // terminals. Returns what would be lost and removes nothing, unless force.
  'worktree.cleanUp': {
    args: WorkspaceRef & { force?: boolean };
    result: string | null;
  };
  // Absent path: the home folder.
  'fs.dirs': { args: { path?: string }; result: DirListing };
  'session.submit': {
    args: {
      id: string;
      // May be empty when images are attached.
      prompt: string;
      images?: PromptImage[];
      requestId: string;
      // While a run works: wait for it to answer (default), or join it after
      // the current step.
      whenBusy?: 'followUp' | 'steer';
    };
    result: null;
  };
  // Takes a queued prompt back; null: it was already sent.
  'session.withdraw': {
    args: { id: string; submission: number };
    result: QueuedPrompt | null;
  };
  // A queued follow-up joins the run after the current step; false: already sent.
  'session.push': { args: { id: string; submission: number }; result: boolean };
  // Stops the run; returns the queued prompts the stop dropped.
  'session.stop': { args: { id: string }; result: QueuedPrompt[] };
  'session.archive': {
    args: { id: string; archived: boolean };
    result: null;
  };
  'session.rename': { args: { id: string; title: string }; result: null };
  // Summarizes older context now; instructions: what the summary keeps.
  'session.compact': {
    args: { id: string; instructions?: string };
    result: null;
  };
  // Clears old tool output from the model context (src/lib/cleanup.ts).
  'session.cleanup': { args: { id: string }; result: null };
  // Changing it later breaks the prompt cache once.
  'session.profile': { args: { id: string; profile: ProfileId }; result: null };
  // The hub's session id, started first if there is none.
  'hub.open': { args: Record<string, never>; result: string };
  // Applies from the next call.
  'session.voice': { args: { id: string; voice: VoiceSettings }; result: null };
  // A new session with the history up to entry `at` (absent: all); its id.
  'session.fork': { args: { id: string; at?: number }; result: string };
  // Opened in a browser: its answers so far are read.
  'session.seen': { args: { id: string; seen?: boolean }; result: null };
  // An opened row's full contents: a tool call by id, a thought by step key.
  'session.detail': {
    args: { id: string; key: string };
    result: StepDetail | null;
  };
  // A voice call on a session: the browser's WebRTC offer in, the answer out.
  'voice.start': {
    args: { id: string; sdp: string };
    result: { sdp: string; callId: string };
  };
  'voice.stop': { args: { callId: string }; result: null };
  // Starts a sign-in (replacing one running); follow it on `accounts`.
  'account.signIn': {
    args: { id: string; type: 'oauth' | 'api_key' };
    result: null;
  };
  'account.answer': { args: { prompt: string; value: string }; result: null };
  'account.cancel': { args: Record<string, never>; result: null };
  // Forgets a saved sign-in or key; env vars stay.
  'account.signOut': { args: { id: string }; result: null };
  // Checks them against the proxy first. Empty keys keep the saved ones.
  'proxy.save': {
    args: { url: string; apiKey: string; managementKey: string };
    result: null;
  };
  'proxy.remove': { args: Record<string, never>; result: null };
  // Absent paths: everything.
  // repo, on every git call: a submodule's path; absent, the workspace's own
  // repo. Paths are from the workspace; without paths, everything in repo.
  'git.stage': {
    args: WorkspaceRef & { paths?: string[]; repo?: string };
    result: null;
  };
  'git.unstage': {
    args: WorkspaceRef & { paths?: string[]; repo?: string };
    result: null;
  };
  // all: stage everything first. amend: an empty message keeps the old one.
  'git.commit': {
    args: WorkspaceRef & {
      message: string;
      all?: boolean;
      amend?: boolean;
      repo?: string;
    };
    result: null;
  };
  // Throws away unstaged changes; untracked files are deleted.
  'git.discard': {
    args: WorkspaceRef & { paths: string[]; repo?: string };
    result: null;
  };
  // Sets the upstream on a branch's first push.
  'git.push': { args: WorkspaceRef & { repo?: string }; result: null };
  // Fast-forward only; anything else is for a terminal.
  'git.pull': { args: WorkspaceRef & { repo?: string }; result: null };
  // A commit message for the staged changes (all: every change), written by
  // the fast model. null: no fast model is set. fresh: skip the cache.
  'git.suggest': {
    args: WorkspaceRef & { all?: boolean; fresh?: boolean; repo?: string };
    result: string | null;
  };
  // Staged: HEAD → index. Unstaged: index → working tree.
  'git.diff': {
    args: WorkspaceRef & {
      path: string;
      staged: boolean;
      oldPath?: string;
      repo?: string;
    };
    result: { old: FileText; new: FileText };
  };
  'file.read': { args: WorkspaceRef & { path: string }; result: FileText };
  // Opens it in the editor on the dev machine (src/server/git/editor.ts); absent
  // path: the whole workspace.
  'editor.open': { args: WorkspaceRef & { path?: string }; result: null };
  // A path from a chat message, anywhere on the dev machine: files in the
  // editor, folders (or anything with reveal) in Finder. Relative to cwd.
  'path.open': {
    args: { path: string; cwd?: string; reveal?: boolean };
    result: null;
  };
  // Absent command: an interactive shell. Its id.
  'terminal.create': {
    args: WorkspaceRef & { command?: string; title?: string };
    result: string;
  };
  // Keystrokes, as the terminal encodes them.
  'terminal.input': { args: { id: string; data: string }; result: null };
  'terminal.resize': {
    args: { id: string; cols: number; rows: number };
    result: null;
  };
  'terminal.stop': { args: { id: string }; result: null };
  'terminal.restart': { args: { id: string }; result: null };
  // Stops it if needed and drops it from the list.
  'terminal.remove': { args: { id: string }; result: null };
}

/** Live state: a snapshot, then numbered changes. */
export interface Topics {
  sessions: { params: Record<string, never>; value: SessionSummary[] };
  projects: { params: Record<string, never>; value: Project[] };
  models: { params: Record<string, never>; value: ModelCatalog };
  accounts: { params: Record<string, never>; value: Accounts };
  // null: no such conversation.
  conversation: { params: { id: string }; value: ConversationView | null };
  // null: not a git repository.
  'git.status': { params: WorkspaceRef; value: GitStatus | null };
  'plan.usage': { params: Record<string, never>; value: PlanUsage };
  // Every file path in the workspace, minus what git ignores.
  files: { params: WorkspaceRef; value: string[] };
  terminals: { params: Record<string, never>; value: TerminalInfo[] };
  // null: no such terminal (closed, or the server restarted).
  terminal: { params: { id: string }; value: TerminalOutput | null };
}

/** A tool call's input and output, or a thought's text; the transcript leaves them out. */
export type StepDetail =
  | { args: Record<string, unknown>; output?: string; details?: unknown }
  | { text: string };

/** The ids of the first and last entries a browser holds, and how many. */
export interface EntriesHeld {
  first: number;
  last: number;
  count: number;
}

export type Call = keyof Calls;
export type Topic = keyof Topics;

export type ClientMessage =
  | { type: 'request'; id: string; call: Call; args: unknown }
  | {
      type: 'subscribe';
      sub: number;
      topic: Topic;
      params: unknown;
      // A conversation the browser already holds, so the snapshot can skip it.
      have?: EntriesHeld;
    }
  | { type: 'unsubscribe'; sub: number };

export type ServerMessage =
  | { type: 'reply'; id: string; ok: true; value: unknown }
  | { type: 'reply'; id: string; ok: false; error: string }
  // A snapshot replaces the copy and restarts the numbering at n = 0.
  // `kept`: a conversation whose first `kept` entries are the browser's own,
  // left out of `value.entries`.
  | { type: 'snapshot'; sub: number; n: number; value: unknown; kept?: number }
  | { type: 'changes'; sub: number; n: number; ops: readonly Op[] }
  | { type: 'error'; sub: number; error: string };
