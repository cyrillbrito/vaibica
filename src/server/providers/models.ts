import 'server-only';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { isAbsolute } from 'node:path';
import {
  clampThinkingLevel,
  getSupportedThinkingLevels,
} from '@earendil-works/pi-ai';
import { DEFAULT_COMPACTION_POLICY } from '@earendil-works/pi-durable';
import { env } from 'virtual:env/server';

import type {
  ModelCatalog,
  ModelChoice,
  ModelSettings,
  ThinkingLevel,
} from '#lib/protocol';
import { nameOf } from './account-info';
import { models } from './registry';
import { live } from '#server/live';
import { dataFile } from '#server/paths';

const FILE = dataFile('settings.json');

const LEVELS: readonly ThinkingLevel[] = [
  'off',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];

// The extension switches share the file, which only this module writes.
type Saved = Partial<ModelSettings> & { extensions?: Record<string, boolean> };

let stored: Promise<Saved> | undefined;

function load() {
  return (stored ??= readFile(FILE, 'utf8').then(
    (text) => JSON.parse(text) as Saved,
    (): Saved => ({}),
  ));
}

async function save(next: Saved) {
  stored = Promise.resolve(next);
  await writeFile(FILE, `${JSON.stringify(next, null, 2)}\n`);
}

const parseRef = (id: string | undefined) => {
  if (!id) return null;
  const [provider, ...rest] = id.split('/');
  return { provider: provider!, modelId: rest.join('/') };
};

// Read without waiting, by features that only ask whether a fast model is set.
let fast: ModelSettings['fastModel'] = parseRef(env.PI_FAST_MODEL);
// Long by default, like Claude Code on a subscription: pauses of 5 to 60
// minutes are rare, but each one rewrites the whole context.
let longCache = true;
let decision: ModelSettings['decisionModel'] = null;
void load().then((saved) => {
  if (saved.fastModel !== undefined) fast = saved.fastModel;
  if (saved.decisionModel !== undefined) decision = saved.decisionModel;
  if (saved.longCache !== undefined) longCache = saved.longCache;
});

export const fastModel = () => fast;
export const decisionModel = () => decision;

/** Read by the harness on every request, so a change applies at once. */
export const cacheRetention = () =>
  longCache ? ('long' as const) : ('short' as const);

const key = (provider: string, modelId: string) => `${provider}/${modelId}`;

/** A model the providers' keys reach, and an effort it supports. */
export function checkChoice({
  model,
  thinkingLevel,
}: ModelChoice): ModelChoice {
  const found = models.getModel(model.provider, model.modelId);
  if (!found)
    throw new Error(`Unknown model ${key(model.provider, model.modelId)}`);
  if (!LEVELS.includes(thinkingLevel))
    throw new Error(`Unknown effort ${thinkingLevel}`);
  return {
    model: { provider: found.provider, modelId: found.id },
    thinkingLevel: clampThinkingLevel(found, thinkingLevel),
  };
}

/** The saved settings, with the defaults filled in. */
export async function modelSettings(): Promise<ModelSettings> {
  const saved = await load();
  const [provider, ...rest] = env.PI_MODEL.split('/');
  const choice = saved.model
    ? { model: saved.model, thinkingLevel: saved.thinkingLevel ?? 'medium' }
    : {
        model: { provider: provider!, modelId: rest.join('/') },
        thinkingLevel: 'medium' as const,
      };
  let checked: ModelChoice = choice;
  try {
    checked = checkChoice(choice);
  } catch {
    // An unknown saved model stays visible; picking another fixes it.
  }
  return {
    ...checked,
    enabled: saved.enabled ?? [],
    fastModel: saved.fastModel === undefined ? fast : saved.fastModel,
    decisionModel: saved.decisionModel ?? null,
    stageOnView: saved.stageOnView ?? false,
    longCache: saved.longCache ?? true,
    hubFolder: saved.hubFolder ?? null,
    hubModel: saved.hubModel ?? null,
    nightStart: saved.nightStart ?? '01:00',
  };
}

export async function getCatalog(): Promise<ModelCatalog> {
  const providers = (
    await Promise.all(
      models.getProviders().map(async (p) => {
        const auth = await models.checkAuth(p.id).catch(() => undefined);
        return (
          auth && { id: p.id, name: nameOf(p.id), source: auth.source ?? null }
        );
      }),
    )
  ).filter((p) => !!p);
  const available = await models.getAvailable();
  const classifiers = await models
    .getAvailableOfType('classifier')
    .catch(() => []);
  return {
    providers,
    models: available.map((m) => ({
      provider: m.provider,
      id: m.id,
      name: m.name,
      levels: getSupportedThinkingLevels(m) as ThinkingLevel[],
      contextWindow: m.contextWindow,
      cost: { input: m.cost.input, output: m.cost.output },
      cacheTtl: { ...m.promptCache },
    })),
    classifiers: classifiers.map((m) => ({
      provider: m.provider,
      id: m.id,
      name: m.name,
      contextWindow: m.contextWindow,
      cost: { input: m.cost.input },
    })),
    settings: await modelSettings(),
    fromEnv: {
      model: !(await load()).model,
      fastModel: (await load()).fastModel === undefined && !!env.PI_FAST_MODEL,
    },
    // The harness doesn't override the policy (src/server/agent/harness.ts).
    compaction: {
      reserveTokens: DEFAULT_COMPACTION_POLICY.reserveTokens,
      backgroundTokens: DEFAULT_COMPACTION_POLICY.backgroundTokens,
    },
  };
}

const catalog = live(getCatalog);

export const watchModels = catalog.watch;
export const refreshModels = catalog.refresh;

export async function updateSettings(change: Partial<ModelSettings>) {
  const next = { ...(await load()) };
  if (change.model || change.thinkingLevel) {
    const current = await modelSettings();
    const choice = checkChoice({
      model: change.model ?? current.model,
      thinkingLevel: change.thinkingLevel ?? current.thinkingLevel,
    });
    next.model = choice.model;
    next.thinkingLevel = choice.thinkingLevel;
  }
  if (change.enabled) next.enabled = [...new Set(change.enabled)];
  if (change.fastModel !== undefined) {
    const ref = change.fastModel;
    if (ref && !models.getModel(ref.provider, ref.modelId))
      throw new Error(`Unknown model ${key(ref.provider, ref.modelId)}`);
    next.fastModel = ref;
    fast = ref;
  }
  if (change.decisionModel !== undefined) {
    const ref = change.decisionModel;
    if (
      ref &&
      !models.getModelOfType('classifier', ref.provider, ref.modelId) &&
      !models.getModel(ref.provider, ref.modelId)
    )
      throw new Error(`Unknown model ${key(ref.provider, ref.modelId)}`);
    next.decisionModel = ref;
    decision = ref;
  }
  if (change.stageOnView !== undefined) next.stageOnView = !!change.stageOnView;
  if (change.longCache !== undefined) {
    next.longCache = !!change.longCache;
    longCache = next.longCache;
  }
  if (change.hubFolder !== undefined) {
    const path = (change.hubFolder ?? '')
      .trim()
      .replace(/^~(?=\/|$)/, homedir())
      .replace(/(.)\/+$/, '$1');
    if (path && !isAbsolute(path))
      throw new Error('The hub folder needs an absolute path');
    next.hubFolder = path || null;
  }
  if (change.hubModel !== undefined)
    next.hubModel = change.hubModel && checkChoice(change.hubModel);
  if (change.nightStart !== undefined) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(change.nightStart))
      throw new Error('Pick a time like 01:00');
    next.nightStart = change.nightStart;
  }
  await save(next);
  await catalog.refresh();
}

/** Extensions switched on or off by id; absent: the manifest's default. */
export const extensionSwitches = async () => (await load()).extensions ?? {};

export async function saveExtensionSwitch(id: string, on: boolean) {
  const next = { ...(await load()) };
  next.extensions = { ...next.extensions, [id]: on };
  await save(next);
}

export async function defaultChoice(): Promise<ModelChoice> {
  const { model, thinkingLevel } = await modelSettings();
  return { model, thinkingLevel };
}
