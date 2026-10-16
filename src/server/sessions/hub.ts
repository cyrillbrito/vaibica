import 'server-only';
import { mkdir } from 'node:fs/promises';

import { context, getHarness } from '#server/agent';
import {
  serverProfile,
  loadMemory,
  hubChoice,
  hubFolder,
} from '#server/profiles';
import { SessionDoc, getConversation, listSessions, sessions } from './store';

/** The hub (docs/hub.md): the newest open hub session outside any project. */
async function findHub() {
  return (await listSessions()).find(
    (s) => s.profile === 'hub' && !s.archivedAt && !s.projectId,
  );
}

/** The hub's id, started in the hub folder first if there is none. */
export async function openHub() {
  const open = await findHub();
  if (open) return open.id;
  const folder = await hubFolder();
  if (!folder) throw new Error('Pick a folder for the hub in Settings first');
  await mkdir(folder, { recursive: true });
  const hub = serverProfile('hub');
  const [choice, memory, projects] = await Promise.all([
    hub.choice(),
    loadMemory(folder),
    hub.projects(),
  ]);
  const conversation = await (
    await getHarness()
  ).createConversation(
    {
      ownership: { kind: 'ownerless' },
      agent: {
        ...choice,
        cwd: folder,
        extensions: hub.extensions,
        instructions: await hub.instructions({
          cwd: folder,
          memory,
          projects,
        }),
      },
      init: async (tx, id) => {
        const doc = await tx.doc(SessionDoc, id);
        doc.title = 'Hub';
        doc.createdAt = Date.now();
        doc.seenEntry = 0;
        doc.profile = 'hub';
        doc.memory = memory;
        doc.projects = projects;
      },
    },
    context,
  );
  await sessions.refresh();
  return String(conversation.id);
}

/** After the hub settings change: the hub moves to its folder and model. */
export async function updateHub() {
  const hub = await findHub();
  if (!hub) return;
  const conversation = await getConversation(hub.id);
  const folder = await hubFolder();
  const moved = !!folder && folder !== hub.cwd;
  if (moved) await mkdir(folder, { recursive: true });
  await conversation.configure(
    { ...(await hubChoice()), ...(moved && { cwd: folder }) },
    context,
  );
  // A new folder holds other memory files.
  if (moved)
    await (
      await getHarness()
    ).commit(async (tx) => {
      const doc = await tx.doc(SessionDoc, conversation.id);
      delete doc.memory;
      delete doc.projects;
    }, context);
}
