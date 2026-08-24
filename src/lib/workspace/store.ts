'use client';

/**
 * Workspace store — the single owner of "what is open right now".
 *
 * Module-level singleton + `subscribe`/`emit` + a cached immutable snapshot for
 * `useSyncExternalStore`. Same shape as `src/lib/right-rail/store.ts`, which is
 * the house pattern for a globally-owned slot; this one owns the window
 * manager's tab list instead of the right edge's occupant.
 *
 * ## Tab suspension is in from v1
 *
 * **Exactly one tab is LIVE — the focused one.** Every other open tab is
 * suspended: the host unmounts its subtree and keeps only the serialized state
 * it handed over. That is not an optimization to add later. Splitting the
 * sidebar panels into per-route chunks was measured as the single largest
 * bundle lever (~1MB gz), and react-query's `gcTime` was cut 30min → 5min for
 * "massive memory retention" — four live tabs re-opens both. Retrofitting
 * suspension after tabs ship means rewriting every session's state ownership,
 * so the store's API says it now:
 *
 * ```
 * isTabLive(id)              // may this tab's subtree be mounted?
 * saveTabState(id, state)    // subtree hands its state over before unmounting
 * readTabState(id)           // subtree seeds itself from it on re-mount
 * ```
 *
 * Saved state is IN-MEMORY and deliberately not persisted: what survives a
 * reload is the tab's `params` (see `persistence.ts`), which is what makes a
 * restored tab reopen on the same sort/filter rather than the same scroll
 * offset.
 *
 * ## What this store is NOT
 *
 * It is not a router (the URL names at most the focused tile), not a history
 * (recents are a separate, device-local store — `useRecentPages`), and it holds
 * no React nodes, so it stays serializable and DB-free.
 */

import {
  MAX_OPEN_TABS,
  type TabDescriptor,
  type TabKind,
  type TabParamValue,
  type TabParams,
  type TabParamsPatch,
  type WorkspaceSnapshot,
} from '@/lib/workspace/types';

const EMPTY_PARAMS: TabParams = Object.freeze({});

let openTabs: readonly TabDescriptor[] = [];
let pinnedTabs: readonly string[] = [];
let focusedTabId: string | null = null;

/** Serialized subtree state of suspended tabs. Never persisted. */
const suspendedState = new Map<string, unknown>();

const listeners = new Set<() => void>();

let snapshot: WorkspaceSnapshot = {
  openTabs,
  pinnedTabs,
  focusedTabId,
};

/** Monotonic per-process counter behind generated tab ids — deterministic in tests. */
let instanceSeq = 0;

function commit(): void {
  snapshot = { openTabs, pinnedTabs, focusedTabId };
  for (const listener of listeners) listener();
}

export function subscribeWorkspace(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getWorkspaceSnapshot(): WorkspaceSnapshot {
  return snapshot;
}

/**
 * Server snapshot: the workspace is client-owned chrome, so SSR renders the
 * empty shell and the real tabs arrive on hydrate. A frozen constant, not a
 * fresh object — `useSyncExternalStore` re-invokes this on every server render
 * and a new identity each time is an infinite loop.
 */
const SERVER_SNAPSHOT: WorkspaceSnapshot = Object.freeze({
  openTabs: Object.freeze([]) as readonly TabDescriptor[],
  pinnedTabs: Object.freeze([]) as readonly string[],
  focusedTabId: null,
});

export function getServerWorkspaceSnapshot(): WorkspaceSnapshot {
  return SERVER_SNAPSHOT;
}

export function getTab(id: string): TabDescriptor | undefined {
  return openTabs.find((t) => t.id === id);
}

function normalizeParams(params: TabParams | undefined): TabParams {
  return params && Object.keys(params).length > 0 ? { ...params } : EMPTY_PARAMS;
}

/**
 * Evict down to {@link MAX_OPEN_TABS} - 1 so a new tab fits. Victims are
 * leftmost-first among tabs that are neither pinned nor focused, matching the
 * strip's own left-to-right age order. A workspace whose every tab is pinned
 * refuses to grow rather than dropping a pin.
 */
function evictForRoom(next: TabDescriptor[]): void {
  while (next.length >= MAX_OPEN_TABS) {
    const victim = next.find((t) => !pinnedTabs.includes(t.id) && t.id !== focusedTabId);
    if (!victim) return;
    suspendedState.delete(victim.id);
    next.splice(next.indexOf(victim), 1);
  }
}

/**
 * Open a tab and focus it. Returns the tab id, or `null` when the workspace is
 * full of pinned tabs and refused to grow (a pin is a promise; dropping one to
 * make room would break it).
 *
 * Passing an explicit `id` makes the tab a SINGLETON: re-opening that id
 * focuses the existing tab and leaves its params alone, which is what a
 * "Settings" or "Photo library" tab wants. Omitting `id` mints a fresh instance
 * every call — that is how two tabs of one table come to exist, each with its
 * own `params`.
 */
export function openTab(input: {
  id?: string;
  kind: TabKind;
  ref: string;
  params?: TabParams;
}): string | null {
  const existing = input.id ? getTab(input.id) : undefined;
  if (existing) {
    focusTab(existing.id);
    return existing.id;
  }

  const next = [...openTabs];
  evictForRoom(next);
  if (next.length >= MAX_OPEN_TABS) return null;

  instanceSeq += 1;
  const id = input.id ?? `${input.kind}:${input.ref}#${instanceSeq}`;
  next.push({ id, kind: input.kind, ref: input.ref, params: normalizeParams(input.params) });

  openTabs = next;
  focusedTabId = id;
  commit();
  return id;
}

/**
 * Close a tab, drop its suspended state, and unpin it. Focus falls to the
 * neighbour on the right, then the left, then nothing — Chrome's rule, and the
 * one that keeps an operator's eye where their hand already was.
 */
export function closeTab(id: string): void {
  const index = openTabs.findIndex((t) => t.id === id);
  if (index === -1) return;

  const next = openTabs.filter((t) => t.id !== id);
  if (focusedTabId === id) {
    focusedTabId = next[index]?.id ?? next[index - 1]?.id ?? null;
  }
  openTabs = next;
  if (pinnedTabs.includes(id)) pinnedTabs = pinnedTabs.filter((p) => p !== id);
  suspendedState.delete(id);
  commit();
}

/** Focus an open tab — i.e. make it the one live subtree. Unknown ids no-op. */
export function focusTab(id: string | null): void {
  if (id !== null && !getTab(id)) return;
  if (focusedTabId === id) return;
  focusedTabId = id;
  commit();
}

/**
 * Shallow-merge a patch into ONE tab's params. `undefined` removes a key.
 * Sibling tabs of the same `ref` are untouched — that isolation is the whole
 * reason params live on the tab instead of on the URL.
 */
export function setTabParams(id: string, patch: TabParamsPatch): void {
  const tab = getTab(id);
  if (!tab) return;

  const merged: Record<string, TabParamValue> = { ...tab.params };
  let changed = false;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      if (key in merged) {
        delete merged[key];
        changed = true;
      }
      continue;
    }
    if (merged[key] !== value) {
      merged[key] = value;
      changed = true;
    }
  }
  if (!changed) return;

  openTabs = openTabs.map((t) => (t.id === id ? { ...t, params: merged } : t));
  commit();
}

/** Replace a tab's params wholesale (a saved view applied to this tab only). */
export function replaceTabParams(id: string, params: TabParams): void {
  if (!getTab(id)) return;
  openTabs = openTabs.map((t) => (t.id === id ? { ...t, params: normalizeParams(params) } : t));
  commit();
}

export function pinTab(id: string): void {
  if (!getTab(id) || pinnedTabs.includes(id)) return;
  pinnedTabs = [...pinnedTabs, id];
  commit();
}

export function unpinTab(id: string): void {
  if (!pinnedTabs.includes(id)) return;
  pinnedTabs = pinnedTabs.filter((p) => p !== id);
  commit();
}

/* ── Suspension ─────────────────────────────────────────────────────────── */

/**
 * May this tab's subtree be mounted? Exactly one tab answers true. A host that
 * ignores this and mounts every tab is the memory regression this store was
 * shaped to prevent.
 */
export function isTabLive(id: string): boolean {
  return focusedTabId === id;
}

/**
 * Hand a tab's serialized state to the store, typically from the subtree's
 * unmount cleanup as it suspends.
 *
 * Deliberately does NOT emit: this is a cache read back at mount time, not a
 * render input, and emitting here would re-render every strip consumer on every
 * keystroke a tab wants to preserve.
 */
export function saveTabState(id: string, state: unknown): void {
  if (!getTab(id)) return;
  suspendedState.set(id, state);
}

/** Read back what {@link saveTabState} preserved, to seed a restoring subtree. */
export function readTabState(id: string): unknown {
  return suspendedState.get(id);
}

/** Forget a tab's preserved state without closing the tab (an explicit reset). */
export function clearTabState(id: string): void {
  suspendedState.delete(id);
}

/* ── Bulk state ─────────────────────────────────────────────────────────── */

/**
 * Replace the whole workspace — the hydrate path from persisted prefs. Drops
 * every suspended-state entry, because those describe subtrees that no longer
 * exist. Pins and focus that name a missing tab are dropped rather than
 * resurrecting one, so a truncated or hostile bag is harmless.
 */
export function hydrateWorkspace(next: {
  openTabs: readonly TabDescriptor[];
  pinnedTabs?: readonly string[];
  focusedTabId?: string | null;
}): void {
  const tabs: TabDescriptor[] = [];
  const seen = new Set<string>();
  for (const tab of next.openTabs) {
    if (seen.has(tab.id) || tabs.length >= MAX_OPEN_TABS) continue;
    seen.add(tab.id);
    tabs.push({
      id: tab.id,
      kind: tab.kind,
      ref: tab.ref,
      params: normalizeParams(tab.params),
    });
  }

  openTabs = tabs;
  pinnedTabs = (next.pinnedTabs ?? []).filter((id) => seen.has(id));
  focusedTabId = next.focusedTabId && seen.has(next.focusedTabId) ? next.focusedTabId : null;
  suspendedState.clear();
  commit();
}

/** Empty the workspace (sign-out, and the per-test reset). */
export function resetWorkspace(): void {
  openTabs = [];
  pinnedTabs = [];
  focusedTabId = null;
  suspendedState.clear();
  instanceSeq = 0;
  commit();
}
