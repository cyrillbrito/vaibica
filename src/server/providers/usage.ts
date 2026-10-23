import 'server-only';
import { readFile, writeFile } from 'node:fs/promises';

import type { PlanUsage } from '#lib/protocol';
import { live } from '#server/live';
import { dataFile } from '#server/paths';
import { emailOf, nameOf } from './account-info';
import {
  accountsOf,
  allLimits,
  baseOf,
  onLimits,
  pickOrder,
  restoreLimits,
} from './plans';
import { models } from './registry';

/*
 * The plans' limits for the sidebar's meters and night runs, from the
 * rate-limit headers of each account's last reply (plans.ts). Saved, so the
 * meters survive a restart; an account that hasn't answered yet has none.
 */
const FILE = dataFile('plan-usage.json');

const restored = readFile(FILE, 'utf8')
  .then((text) => {
    const saved = JSON.parse(text);
    if (Array.isArray(saved)) restoreLimits(saved);
  })
  .catch(() => {});

async function read(): Promise<PlanUsage> {
  await restored;
  // In the order you prefer the accounts.
  const place = (id: string) => accountsOf(models, baseOf(id)).indexOf(id);
  return allLimits()
    .filter(([id]) => models.getProvider(id))
    .sort(([a], [b]) => place(a) - place(b))
    .map(([id, { windows, updatedAt }]) => {
      const accounts = pickOrder(models, baseOf(id));
      return {
        id,
        provider: id,
        family: baseOf(id),
        // The meters only show one plan's accounts: the email tells them apart.
        name: emailOf(id) ?? nameOf(id),
        // With more than one account, which one the next request takes.
        plan: accounts.length > 1 && accounts[0] === id ? 'In use' : null,
        windows,
        updatedAt,
      };
    });
}

const feed = live(read);

let saving = Promise.resolve();
onLimits(() => {
  void feed.refresh();
  saving = saving
    .then(() => writeFile(FILE, JSON.stringify(allLimits())))
    .catch((error) => console.error('[usage]', error));
});

export const watchPlanUsage = feed.watch;
export const refreshPlanUsage = feed.refresh;

/** The plans' latest limits, for jobs nobody watches. */
export const planUsageNow = read;
