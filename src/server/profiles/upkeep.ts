import 'server-only';
import type { ConversationId } from '@earendil-works/pi-durable';

import { MIN_CLEANUP, contextUsage } from '#lib/context-usage';
import { PROFILES } from '#lib/profiles';
import { context, getHarness } from '#server/agent';
import { getCatalog } from '#server/providers';
import {
  cleanUpContext,
  compact,
  listSessions,
  markSeen,
  submit,
} from '#server/sessions';

// Long-lived profiles, assistant (docs/assistant-mode.md) and hub
// (docs/hub.md): Bica keeps their sessions small while they sit idle. Clean up runs once the cache is cold, when it is
// free. Saving memories and compacting call the model, so they run just
// before the cache expires, while reading it is still cheap.

const MINUTE = 60_000;
const WARM_MARGIN = 5 * MINUTE;
// Above this even after Clean up, the session compacts before the cache
// expires. Below it, the compaction may cost more than it saves.
const COMPACT_AT = 120_000;
// Above this, it compacts at the first idle minute: reads cost enough, and
// quality drops, so waiting for a long pause isn't worth it.
const COMPACT_NOW_AT = 200_000;

const SAVE_NOTE = '[Note from Bica, not from the user] Memory save:';
const SAVE_PROMPT = `${SAVE_NOTE} this session is about to be compacted, and older turns will shrink to a summary. Save what should outlast it to the memory files, the way the project's instructions and skills say: decisions, preferences, open tasks, and facts you will need later. Look for what was said but never written down. Replace lines that are now wrong instead of adding next to them, and keep the files short. Then reply with one line. Start nothing else.`;

// Taelin's compaction rules (OptChat), trimmed.
const SUMMARY_RULES = `This is a long-lived session. Keep the user's words close to verbatim: orders, decisions, corrections, preferences, and their reasons. Then what has lasting effect, and what failed and why. Copy names, numbers, ids, paths, and errors exactly. Name a minor item in a few words rather than drop it. Never make work look further along than it was. The memory files hold the long-term record: name the ones that matter instead of repeating them.`;

const busy = new Set<string>();

/** Tends long-lived sessions every minute. */
export function startUpkeep() {
  setInterval(() => void tendAll(), MINUTE);
}

async function tendAll() {
  const sessions = await listSessions().catch(() => []);
  for (const s of sessions)
    if (PROFILES[s.profile].longLived && !s.archivedAt && !busy.has(s.id)) {
      busy.add(s.id);
      void tend(s.id, s.status === 'done')
        .catch((error) => console.error('[long-lived]', error))
        .finally(() => busy.delete(s.id));
    }
}

async function tend(id: string, unread: boolean) {
  const conversation = await (
    await getHarness()
  ).conversation(Number(id) as ConversationId, context);
  if (!conversation) return;
  const watch = await conversation.watch(context);
  const view = watch.value;
  void watch.stop();
  const usage = contextUsage(view, await getCatalog());
  // No cache lifetime known (not Anthropic): no clock to plan around.
  if (usage.running || usage.compacting || !usage.cache) return;
  const idle = Date.now() - usage.cache.at;

  // Decided on the size after Clean up: cleared often enough, it frees
  // nothing, and only compaction helps.
  const size = usage.used - usage.cleanable;
  if (size > COMPACT_AT) {
    if (size <= COMPACT_NOW_AT && idle < usage.cache.ttl - WARM_MARGIN) return;
    // Nothing new since the last save: compacting again would loop hourly.
    const prompts = view.entries.filter((e) => e.kind === 'pi.user');
    const last = JSON.stringify(prompts.at(-1)?.model ?? '');
    if (last.includes(SAVE_NOTE)) return;
    await submit(id, SAVE_PROMPT, [], `memory:${Date.now()}`, 'bica');
    await conversation.waitForIdle(context);
    await compact(id, SUMMARY_RULES);
    // The save is bookkeeping, not news: a read session stays read.
    if (!unread) await markSeen(id);
  } else if (idle >= usage.cache.ttl && usage.cleanable >= MIN_CLEANUP)
    await cleanUpContext(id);
}
