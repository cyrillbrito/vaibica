import { dataFile } from '#server/paths';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import type { Credential, CredentialStore } from '@earendil-works/pi-ai';

/*
 * Sign-ins and keys added in Settings (docs/models.md), one per provider
 * id, in pi's auth.json shape. Only this process writes the file, so one
 * promise chain is the lock. A saved credential wins over the env var.
 */
const FILE = dataFile('auth.json');

type All = Record<string, Credential | undefined>;

const readAll = async (): Promise<All> =>
  JSON.parse(await readFile(FILE, 'utf8').catch(() => '{}'));

let writes: Promise<unknown> = Promise.resolve();

function write<T>(change: (all: All) => Promise<T>) {
  const next = writes.then(async () => {
    const all = await readAll();
    const result = await change(all);
    await writeFile(FILE, JSON.stringify(all, null, 2), { mode: 0o600 });
    return result;
  });
  writes = next.catch(() => {});
  return next;
}

export const credentials: CredentialStore = {
  read: async (id) => (await readAll())[id],
  list: async () =>
    Object.entries(await readAll()).flatMap(([providerId, c]) =>
      c ? [{ providerId, type: c.type }] : [],
    ),
  modify: (id, fn) =>
    write(async (all) => {
      const next = await fn(all[id]);
      if (next) all[id] = next;
      return all[id];
    }),
  delete: async (id) => {
    await write(async (all) => void delete all[id]);
  },
};

/** Exa isn't a model provider, but its key lives here too, under `exa`. */
export async function exaKey() {
  const saved = await credentials.read('exa');
  return saved?.type === 'api_key' ? saved.key : undefined;
}

// Sign in with ChatGPT names this installation with a stable UUID.
const DEVICE_FILE = dataFile('device-id');

export async function deviceId() {
  const saved = (await readFile(DEVICE_FILE, 'utf8').catch(() => '')).trim();
  if (saved) return saved;
  const id = randomUUID();
  await writeFile(DEVICE_FILE, id);
  return id;
}
