import 'server-only';
import type { Manifest } from '#extensions/contract';
import type { ExtensionState } from '#lib/protocol';
import { credentials } from '#server/providers/credentials';

// The settings an extension declares in its manifest (docs/extensions.md).
// The only kind so far is a secret, kept in auth.json under its key, so the
// Exa key saved before web search became an extension still counts.

type Key<M extends Manifest> = keyof NonNullable<M['settings']> & string;

const declared = (m: Manifest, key: string) => {
  const setting = m.settings?.[key];
  if (!setting) throw new Error(`${m.title} has no setting ${key}`);
  return setting;
};

/** A secret's value, read per use so a change applies at once. */
export async function readSetting<M extends Manifest>(m: M, key: Key<M>) {
  declared(m, key);
  const saved = await credentials.read(key);
  return saved?.type === 'api_key' ? saved.key : undefined;
}

/** Saves a setting, or removes it with null. */
export async function saveSetting(
  m: Manifest,
  key: string,
  value: string | null,
) {
  declared(m, key);
  if (value === null) return credentials.delete(key);
  const secret = value.trim();
  if (!secret) throw new Error('Expected a key');
  await credentials.modify(key, async () => ({ type: 'api_key', key: secret }));
}

/** What the browser may know of each setting. */
export async function settingStates(
  m: Manifest,
): Promise<ExtensionState['settings']> {
  const states = await Promise.all(
    Object.keys(m.settings ?? {}).map(async (key) => {
      const saved = await credentials.read(key);
      const value = saved?.type === 'api_key' ? (saved.key ?? '') : '';
      // A key's last characters tell which one it is, as Providers shows them.
      const hint = value.length > 12 ? value.slice(-4) : null;
      return [key, { saved: !!value, hint }] as const;
    }),
  );
  return Object.fromEntries(states);
}
