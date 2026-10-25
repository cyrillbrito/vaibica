/**
 * A value that browsers watch and the server re-reads when it may have
 * changed. Watchers share one read; they hear only real changes. `start`
 * runs while anyone watches and calls `refresh` when to look again
 * (a timer, harness commits); it returns how to stop.
 */
export function live<T>(
  read: () => Promise<T>,
  start?: (refresh: () => void) => () => void,
) {
  const listeners = new Set<(value: T) => void>();
  let last: string | undefined;
  let stop: (() => void) | undefined;
  // One read at a time, so an older value never lands after a newer one.
  let reading = Promise.resolve();

  const refresh = () =>
    (reading = reading.then(async () => {
      if (!listeners.size) return;
      try {
        const value = await read();
        const json = JSON.stringify(value);
        if (json === last) return;
        last = json;
        for (const listener of listeners) listener(value);
      } catch (error) {
        console.error('[live]', error);
      }
    }));

  async function watch(listener: (value: T) => void) {
    // Read first: a failure leaves nothing behind to clean up.
    const value = await read();
    listeners.add(listener);
    if (!stop) {
      last = JSON.stringify(value);
      stop = start?.(() => void refresh()) ?? (() => {});
    }
    listener(value);
    return () => {
      listeners.delete(listener);
      if (listeners.size) return;
      stop?.();
      stop = undefined;
    };
  }

  return { watch, refresh };
}

export type Live<T> = ReturnType<typeof live<T>>;
