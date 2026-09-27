/**
 * In-process single-flight: concurrent callers asking for the same key share
 * ONE in-flight promise instead of each running the work. The entry is
 * dropped when the work settles (success or failure), so the next caller
 * after that starts fresh — this dedupes a cold-miss stampede, it is not a
 * cache.
 */
export interface SingleFlight<T> {
  run(key: string, work: () => Promise<T>): Promise<T>;
}

export function createSingleFlight<T>(): SingleFlight<T> {
  const inFlight = new Map<string, Promise<T>>();
  return {
    run(key, work) {
      const pending = inFlight.get(key);
      if (pending) return pending;
      // `work` starts on a microtask, so the entry is registered before it can
      // settle — a synchronous throw cannot leave a stale rejected entry behind.
      const started = Promise.resolve()
        .then(work)
        .finally(() => inFlight.delete(key));
      inFlight.set(key, started);
      return started;
    },
  };
}
