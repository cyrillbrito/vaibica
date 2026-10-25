import type { SettingsChange } from '@bica/shared/protocol';
import { request, useTopic } from './socket/socket';

/** Bica's settings, the same on every device. */
export const useSettings = () => useTopic('settings', () => ({}));

export const updateSettings = (change: SettingsChange) =>
  request('settings.update', change);
