import 'server-only';
import { Type } from '@earendil-works/pi-ai';
import { defineExtension, defineTool } from '@earendil-works/pi-durable';
import type {
  ConversationId,
  ToolRegistration,
} from '@earendil-works/pi-durable';
import type { SessionStatus } from '#lib/protocol';
import { withSummary } from '#server/agent/tools/summary';
import { CHATS_ID, getProject, listProjects } from '#server/projects';
import { allTerminals, terminalState } from '#server/terminals';
import { spawnSession } from './create';
import { archive, cleanUpWorktree } from './meta';
import { noteMessage, notifyWhenIdle } from './notes';
import { stop, submit } from './prompts';
import { prompters, readSession, recentMessages } from './read';
import { listSessions } from './store';

const text = (value: string) => ({
  output: [{ type: 'text' as const, text: value }],
});

const STATUS: Record<SessionStatus, string> = {
  running: 'running',
  retrying: 'running, retrying after an error',
  waiting: 'waiting for an answer',
  error: 'stopped with an error',
  // Unread: the agent should know the user hasn't seen this reply yet.
  done: "idle, with a reply the user hasn't opened",
  idle: 'idle',
};

/** Another session; acting on your own one would loop. */
function other(id: string, self: ConversationId) {
  if (id === String(self)) throw new Error('That is this session');
  return id;
}

/** The session tools; the hub's descriptions drop the "leave others alone" limits. */
const sessionTools = (hub: boolean): ToolRegistration[] => {
  const sessionStart = defineTool({
    name: 'session_start',
    description: hub
      ? "Start a session for one thread of work, when the user asked for it: a normal session in the user's session list, which he can watch and steer too. Pass `folder`, a project folder or worktree from your projects list; with `worktree`, it gets a new worktree of that folder's project. It runs on the user's default model. You get a note whenever it finishes a turn, unless `notify` is false. Its prompt must stand alone, like a ticket: it sees nothing of this conversation. Sessions in one folder share its files, so code work gets its own worktree."
      : "Start a new, separate session in the user's session list: same model as you, in your folder unless you pass `folder` or `worktree`. Use it when the user asks to split work across sessions, e.g. one session per bug. The user watches and steers it too. You get a note whenever it finishes a turn, unless `notify` is false, and can talk to it with session_send. Its prompt must stand alone: it sees nothing of this conversation. Sessions in one folder share its files, so give each its own part of the code, or its own worktree.",
    parameters: Type.Object({
      prompt: Type.String({
        description:
          'The full task for the new session, with every detail it needs: files, findings, what done looks like',
      }),
      folder: Type.Optional(
        Type.String({
          description: hub
            ? 'Absolute path of a project folder or git worktree to start in. Required'
            : 'Absolute path of an existing project folder or git worktree to start in, e.g. one you just made with `git worktree add`; absent: your folder',
        }),
      ),
      worktree: Type.Optional(
        Type.Boolean({
          description: hub
            ? "true: start in a new git worktree of `folder`'s project, on a new branch from the default branch, named after the session"
            : 'true: start in a new git worktree of your project, on a new branch from the default branch, named after the session. Ignores `folder`',
        }),
      ),
      notify: Type.Optional(
        Type.Boolean({
          description: 'false: no note when it finishes a turn. Default: true',
        }),
      ),
    }),
    execute: async ({ prompt, folder, worktree, notify }, api) => {
      if (!prompt.trim()) throw new Error('The prompt is empty');
      const id = await spawnSession(
        api.conversationId,
        `${prompt}\n\n(Session ${api.conversationId} started this session. To report back or ask it something, use session_send.)`,
        `start_session:${api.callId}`,
        folder,
        worktree,
        notify === false,
      );
      return {
        ...text(`Started session ${id}.`),
        details: { sessionId: id },
      };
    },
  });

  const sessionRead = defineTool({
    name: 'session_read',
    description:
      "Read another session's title, folder, status (running, idle, waiting for an answer, error), the questions it waits on, and its last messages. `list` shows all sessions.",
    parameters: Type.Object({
      id: Type.String({ description: 'The session id' }),
      messages: Type.Optional(
        Type.Number({
          description:
            'How many recent messages to read, prompts and its replies, oldest first, without tool calls (default 1: its last reply)',
        }),
      ),
    }),
    execute: async ({ id, messages }, api) => {
      const s = await readSession(other(id, api.conversationId));
      const count = Math.min(Math.max(Math.round(messages ?? 1), 1), 50);
      const [recent, from] = await Promise.all([
        recentMessages(s.id, count),
        prompters(s.id),
      ]);
      const me = String(api.conversationId);
      const by = !s.startedBy
        ? ''
        : s.startedBy === me
          ? ' You started it.'
          : ` Session ${s.startedBy} started it.`;
      const last =
        from.last === undefined
          ? ''
          : ` Last prompt from: ${from.last === 'user' ? 'the user' : from.last === 'bica' ? 'a Bica note' : from.last === me ? 'you' : `session ${from.last}`}.`;
      const whose = from.user
        ? ' The user prompts it himself, so it is his.'
        : '';
      const parts = [
        `Session ${s.id} "${s.title}" in ${s.cwd}: ${s.archivedAt ? 'archived' : STATUS[s.status]}.${by}${last}${whose}`,
      ];
      if (s.status === 'waiting' && recent.questions.length)
        parts.push(
          `It asks the user:\n${recent.questions
            .map(
              (q, i) =>
                `${i + 1}. ${q.question}\n${q.options
                  .map(
                    (o) =>
                      `   - ${o.label}${o.description ? `: ${o.description}` : ''}`,
                  )
                  .join('\n')}`,
            )
            .join(
              '\n',
            )}\nAnswer for the user with session_send only if they told you the answer.`,
        );
      parts.push(
        count === 1
          ? `Last reply:\n${s.reply || '(none yet)'}`
          : recent.messages
              .map(
                (m) =>
                  `${m.from === 'prompt' ? 'Prompt' : 'Reply'}:\n${m.text}`,
              )
              .join('\n\n') || '(no messages yet)',
      );
      return {
        ...text(parts.join('\n\n')),
        details: { sessionId: s.id },
      };
    },
  });

  const sessionArchive = defineTool({
    name: 'session_archive',
    description: `Archive another session once its work is done: it leaves the session list (the user can bring it back), and the terminals it started close. With \`remove_worktree\`, its worktree folder and local branch go too, unless another open session works there, or it has uncommitted files or commits no other branch has.${hub ? ' Only when the user asked for it.' : ' Only archive sessions you started or the user named.'}`,
    parameters: Type.Object({
      id: Type.String({ description: 'The session id' }),
      remove_worktree: Type.Optional(
        Type.Boolean({
          description:
            "true: also remove the session's worktree, if it is merged and clean",
        }),
      ),
    }),
    execute: async ({ id, remove_worktree }, api) => {
      other(id, api.conversationId);
      const s = await readSession(id);
      if (s.status === 'running' || s.status === 'retrying')
        throw new Error(
          `Session ${id} is still running. Wait for it, or stop it first.`,
        );
      await archive(id, true);
      const done = `Archived session ${id} "${s.title}".`;
      if (!remove_worktree || !s.cwd || !s.projectId) return text(done);
      const project = await getProject(s.projectId);
      if (!project.workspaces.some((w) => w.path === s.cwd && !w.main))
        return text(
          `${done} Its folder ${s.cwd} isn't a worktree, so it stays.`,
        );
      const others = (await listSessions()).filter(
        (o) => o.cwd === s.cwd && !o.archivedAt,
      );
      if (others.length)
        return text(
          `${done} Kept the worktree: session ${others.map((o) => o.id).join(', ')} still works there.`,
        );
      const risk = await cleanUpWorktree(s.projectId, s.cwd, false);
      return text(
        risk
          ? `${done} Kept the worktree ${s.cwd}: it has ${risk}.`
          : `${done} Removed its worktree ${s.cwd} and its branch.`,
      );
    },
  });

  const sessionSend = defineTool({
    name: 'session_send',
    description: `Send a message to another session, signed with your session id so it can answer with session_send. It waits for that session's current turn to end, or with \`steer\` lands at its next step; an idle session starts a turn.${hub ? ' New work, decisions, and steering only when the user asked for it.' : ' Only message sessions you started, the one that started you, or ones the user named.'}`,
    parameters: Type.Object({
      id: Type.String({ description: 'The session id' }),
      message: Type.String({ description: 'What to tell or ask it' }),
      steer: Type.Optional(
        Type.Boolean({
          description:
            'true: deliver it at its next step instead of after its current turn, to correct work in progress',
        }),
      ),
      notify: Type.Optional(
        Type.Boolean({
          description: hub
            ? 'false: no note with its reply when it finishes the turn. Default: true'
            : 'true: get a note with its reply when it finishes the turn. Sessions you started notify you anyway',
        }),
      ),
    }),
    execute: async ({ id, message, steer, notify }, api) => {
      other(id, api.conversationId);
      const [me, target] = await Promise.all([
        readSession(String(api.conversationId)),
        readSession(id),
      ]);
      if (target.archivedAt)
        throw new Error(
          `Session ${id} is archived. Ask the user before bringing it back.`,
        );
      noteMessage(api.conversationId, id);
      await submit(
        id,
        `[Message from session ${me.id} "${me.title}"] ${message}`,
        [],
        `session_send:${api.callId}`,
        me.id,
        steer ? 'steer' : 'followUp',
      );
      // The hub hears back from what it messages, unless told not to.
      if (notify ?? hub) await notifyWhenIdle(id, api.conversationId);
      return text(`Sent to session ${id}.`);
    },
  });

  const sessionStop = defineTool({
    name: 'session_stop',
    description: `Stop the turn another session is running, and drop its queued messages. The session stays, and a later session_send starts it again.${hub ? ' Only when the user asked for it.' : ' Only stop sessions you started or the user named.'}`,
    parameters: Type.Object({
      id: Type.String({ description: 'The session id' }),
    }),
    execute: async ({ id }, api) => {
      await stop(other(id, api.conversationId));
      return text(`Stopped session ${id}.`);
    },
  });

  const list = defineTool({
    name: 'list',
    description: `List every project, folder or worktree, open session, and terminal in Bica, as a tree, with each one's status, which one is you, and what you started. With \`archived\`, the archived sessions instead, newest first.${hub ? '' : " Leave others' sessions and terminals alone unless the user names them."}`,
    parameters: Type.Object({
      archived: Type.Optional(
        Type.Boolean({
          description:
            'true: list the last 50 archived sessions, newest first, instead of the tree. session_read reads them too',
        }),
      ),
    }),
    execute: async ({ archived }, api) => {
      const me = String(api.conversationId);
      const mine = (by: string | null) => (by === me ? ', started by you' : '');
      const [projects, all] = await Promise.all([
        listProjects(),
        listSessions(),
      ]);
      if (archived) {
        const gone = all
          .filter((s) => s.archivedAt)
          .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0))
          .slice(0, 50);
        return text(
          gone
            .map(
              (s) =>
                `session ${s.id} "${s.title}" in ${s.cwd}, archived ${new Date(s.archivedAt ?? 0).toISOString().slice(0, 10)}${mine(s.startedBy)}`,
            )
            .join('\n') || 'No archived sessions.',
        );
      }
      const open = all.filter((s) => !s.archivedAt);
      const terminals = allTerminals();
      const lines: string[] = [];
      const self = open.find((s) => s.id === me);
      if (self) lines.push(`You are session ${me}, in ${self.cwd}.`, '');
      for (const p of projects) {
        if (p.id === CHATS_ID) continue;
        lines.push(p.name);
        for (const w of p.workspaces) {
          const here = open.filter((s) => s.cwd === w.path);
          const shells = terminals.filter((t) => t.cwd === w.path);
          if (!w.main && !here.length && !shells.length) continue;
          lines.push(
            `  ${w.main ? 'main' : `worktree ${w.branch ?? '(detached)'}`}  ${w.path}`,
          );
          for (const s of here)
            lines.push(
              `    session ${s.id} "${s.title}": ${STATUS[s.status]}${s.id === me ? ' (you)' : mine(s.startedBy)}`,
            );
          for (const t of shells)
            lines.push(
              `    terminal ${t.id} "${t.title}": ${terminalState(t)}${mine(t.startedBy)}`,
            );
        }
      }
      return text(lines.join('\n'));
    },
  });

  return [
    sessionStart,
    sessionRead,
    sessionSend,
    sessionStop,
    sessionArchive,
    list,
  ].map((tool) => ({
    ...withSummary(tool as unknown as ToolRegistration),
    // Orchestration stays with the model: codemode scripts can't reach it.
    callers: ['model' as const],
  }));
};

export const SessionTools = defineExtension({
  name: 'session-tools',
  tools: sessionTools(false),
});

// Only the hub profile selects it (src/server/profiles/definitions.ts).
export const HubSessionTools = defineExtension({
  name: 'hub-session-tools',
  tools: sessionTools(true),
});
