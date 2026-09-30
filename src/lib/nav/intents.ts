/**
 * Nav intents — the seam between a `NavContext.actions[].intent` (a sidebar
 * verb) and the page body that owns the behaviour.
 *
 * The contextual sidebar only knows intent ids; the mounted desk registers a
 * handler for each verb it can run. An action whose intent has no handler is
 * painted disabled, never hidden (the contract decides visibility, the page
 * decides readiness). Module-level, not React context: the sidebar and the
 * page body live in different subtrees of the shell.
 */

/**
 * Optional data a caller hands the verb — ⌘K's create-on-miss passes the typed
 * query (`daily:compose` → `{ note }`). Strings only: the same verb must be
 * reachable off-page as URL params.
 */
export type NavIntentPayload = Readonly<Record<string, string>>;

type NavIntentHandler = (payload?: NavIntentPayload) => void;

const handlers = new Map<string, NavIntentHandler>();
const listeners = new Set<() => void>();
let version = 0;

function emit(): void {
  version += 1;
  for (const listener of listeners) listener();
}

/** Register `handler` for `intent`; returns the unregister. Last writer wins. */
export function registerNavIntent(intent: string, handler: NavIntentHandler): () => void {
  handlers.set(intent, handler);
  emit();
  return () => {
    if (handlers.get(intent) !== handler) return;
    handlers.delete(intent);
    emit();
  };
}

/** Run the registered handler; `false` when no page body owns the intent. */
export function runNavIntent(intent: string, payload?: NavIntentPayload): boolean {
  const handler = handlers.get(intent);
  if (!handler) return false;
  handler(payload);
  return true;
}

export function hasNavIntent(intent: string): boolean {
  return handlers.has(intent);
}

export function subscribeNavIntents(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Changes whenever the registered set changes — a `useSyncExternalStore` snapshot. */
export function getNavIntentsVersion(): number {
  return version;
}
