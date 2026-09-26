/** Pending flag for global find — `/search` browse (identifier resolve / retrieve) publishes here so {@link GlobalHeaderSearch} can paint… */

type Listener = (pending: boolean) => void;

let pending = false;
const listeners = new Set<Listener>();

export function setGlobalSearchPending(next: boolean): void {
  if (pending === next) return;
  pending = next;
  for (const listener of listeners) listener(pending);
}

export function subscribeGlobalSearchPending(listener: Listener): () => void {
  listeners.add(listener);
  listener(pending);
  return () => {
    listeners.delete(listener);
  };
}

export function clearGlobalSearchPending(): void {
  setGlobalSearchPending(false);
}
