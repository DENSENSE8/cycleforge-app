/**
 * Workspace tab model — the data half of the Warehouse OS window manager.
 *
 * A **tab** is a handle on something OPEN: a session (a unit of human work), a
 * table (a data grid instance), or a tool (a utility). It is deliberately NOT a
 * route: the URL names at most the focused tile, and a tab survives navigation
 * because the shell that owns it never unmounts.
 *
 * Two properties carry the whole design:
 *
 * 1. **Each tab owns its own `params`.** That is what lets two tabs of the same
 *    table hold different sort / filter / column state — the thing a
 *    route-shaped model can never express, because a route has exactly one
 *    query string.
 * 2. **Tabs are descriptors, not live nodes.** Nothing here holds a React
 *    element, so the store stays serializable, DB-free and testable, and the
 *    host is free to mount (or not mount) a tab's subtree — see
 *    `store.ts` → tab suspension.
 *
 * Recents (`useRecentPages`) are a different job and stay separate: recents are
 * "where have I been", a history of dead references; tabs are "what is open",
 * live objects with a lifecycle. Neither reads the other.
 */

/**
 * What a tab points at.
 *
 * - `session` — a unit of human work (`work_sessions` row). Kind `scan` vs
 *   `task` is the SESSION's discriminator, not the tab's: the tab only needs to
 *   know it is holding one.
 * - `table` — a data grid instance, route-independent.
 * - `tool` — a utility usable from anywhere (photos, manuals, label printer).
 */
export type TabKind = 'session' | 'table' | 'tool';

/**
 * Params are JSON scalars so a tab round-trips through `staff_preferences`
 * (JSONB) and the address bar without a codec. Nested objects are deliberately
 * not allowed: the prefs merge is SHALLOW, and a nested params bag is exactly
 * the shape that loses half of itself when two panes write at once.
 */
export type TabParamValue = string | number | boolean | null;

export type TabParams = Readonly<Record<string, TabParamValue>>;

/** A patch for {@link TabParams}: `undefined` removes the key. */
export type TabParamsPatch = Readonly<Record<string, TabParamValue | undefined>>;

export interface TabDescriptor {
  /**
   * Instance identity — unique per OPEN tab, not per thing-being-shown. Two
   * tabs of one table have the same `ref` and different `id`s.
   */
  readonly id: string;
  readonly kind: TabKind;
  /**
   * What this tab is a handle on: a session id, a `TableId`, a tool key. The
   * meaning is the kind's business; the store never interprets it.
   */
  readonly ref: string;
  /** This tab's own view state. Never shared with a sibling of the same `ref`. */
  readonly params: TabParams;
}

/**
 * The immutable snapshot `useSyncExternalStore` hands React. Recomputed on
 * every mutation, so a stale render is impossible and `Object.is` detects the
 * change.
 */
export interface WorkspaceSnapshot {
  readonly openTabs: readonly TabDescriptor[];
  /** Ids of open tabs the operator pinned. Closing a tab unpins it. */
  readonly pinnedTabs: readonly string[];
  /**
   * The one LIVE tab. Every other open tab is suspended — its subtree is
   * unmounted and only its serialized state is kept. See `store.ts`.
   */
  readonly focusedTabId: string | null;
}

/**
 * Hard cap on open tabs. Not a UI nicety: every live feature graph is ~1MB gz
 * and react-query `gcTime` was already cut 30min → 5min for "massive memory
 * retention", so an unbounded strip re-opens both problems. Opening past the
 * cap evicts the leftmost unpinned, unfocused tab.
 */
export const MAX_OPEN_TABS = 24;
