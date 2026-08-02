'use client';

/**
 * The React seam of the record cursor — the only place a collection surface and
 * a right-rail panel touch each other.
 *
 * Three hooks, one direction of flow:
 *
 * ```
 *   collection grid ──usePublishRecordCursor──▶ record-cursor/store ──useRecordCursor──▶ panel
 *          ▲                                                                              │
 *          └────────────────── open(id, { intent, revealFoldKey }) ─────────────────────┘
 * ```
 *
 * WHY THE OPEN CALLBACK TRAVELS *WITH* THE CURSOR
 * Expanding a collapsed fold is the GRID's job — the panel has no fold state and
 * no group renderer. If the step target were just an id, stepping into a
 * collapsed order would open the record in the panel while the grid still showed
 * the fold shut and highlighted nothing: plan §2.2's defect wearing a new
 * mechanism. So the publisher hands the store a callback that reveals first and
 * opens second, and the consumer never learns that folds exist.
 *
 * WHY THE PUBLISHED CALLBACKS ARE IDENTITY-STABLE
 * `updateRecordCursor` compares `open` / `close` by identity as part of deciding
 * whether to emit. A callback re-allocated per render would make every keystroke
 * in the grid's filter box a real store emit, re-rendering every panel that
 * consumes it. Both are therefore `useCallback([])` over latest-refs — the same
 * discipline `SidebarRailShell` uses to keep its listener effect from tearing
 * down on each parent render.
 *
 * WHAT IS NOT HERE
 * The ambient keyboard (`useRecordCursorKeyboard`) reads the store directly
 * rather than subscribing through {@link useRecordCursor}, so a re-publishing
 * grid never re-runs its listener effect. Keep it that way.
 *
 * Plan: `docs/todo/record-cursor-unification-PLAN.md` §3.3, §3.5.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { foldKey, isFoldOpen } from '@/lib/group-rows';
import type { FoldState, GroupedRenderOrder, RowGroup } from '@/lib/group-rows';
import { recordIdKey, resolveRecordCursor } from './cursor-model';
import type { CursorIntent, CursorScope, RecordCursor, RecordId } from './cursor-model';
import {
  RECORD_CURSOR_PRIORITY,
  getRecordCursorTop,
  getServerRecordCursorTop,
  publishRecordCursor,
  subscribeRecordCursor,
  updateRecordCursor,
} from './store';
import type { RecordCursorOpen } from './store';

// ─── Fold state ──────────────────────────────────────────────────────────────

const EMPTY_FOLD_KEYS: ReadonlySet<string> = new Set<string>();

interface FoldStateHandle {
  /** Pass straight to `resolveRecordCursor` / `flattenVisibleRenderOrder`. */
  folds: FoldState;
  isOpen: (key: string) => boolean;
  /** `next` omitted → flip. Idempotent: setting the state it already has is a
   *  no-op, so a re-render cannot churn the set identity. */
  toggle: (key: string, next?: boolean) => void;
  /** Open this fold. What a step into a collapsed fold calls before opening. */
  reveal: (key: string) => void;
}

/**
 * Fold state, lifted out of `CollapsibleGroupRow`.
 *
 * **Ephemeral by design — never persisted to staff prefs.** Which orders a
 * staffer happened to expand five minutes ago is the same class of state as
 * `useViewportForcedHidden`, not the same class as their column layout. It also
 * must not survive a lane switch: the set is dropped when `surfaceKey` changes,
 * because a fold key from Pending names nothing in Packed and would otherwise
 * accumulate as dead entries.
 *
 * `mode` is **required**, and that is the whole point of {@link FoldState}. A
 * bare `Set<string>` has no polarity: `QueueGroupRow` is default-COLLAPSED so
 * its set names what is expanded, while `useSidebarRail` tracks
 * `collapsedGroups` and is default-EXPANDED. Both initialize to `new Set()`, so
 * an untagged set silently means "everything collapsed" on whichever surface
 * guessed wrong — and on the rail that would make every group's members vanish
 * from scroll and focus targets.
 *
 * Keys are always `foldKey(bandKey, group.key)` output — see
 * {@link useGroupFoldKeys}.
 */
export function useFoldState(surfaceKey: string, mode: FoldState['mode']): FoldStateHandle {
  const [keys, setKeys] = useState<ReadonlySet<string>>(EMPTY_FOLD_KEYS);
  const [owner, setOwner] = useState(surfaceKey);
  // Adjust-state-during-render (the documented React pattern) rather than an
  // effect: an effect would leave one commit where the new lane renders against
  // the previous lane's folds, which is a visible flash of the wrong open rows.
  if (owner !== surfaceKey) {
    setOwner(surfaceKey);
    setKeys(EMPTY_FOLD_KEYS);
  }

  const folds = useMemo<FoldState>(
    () => (mode === 'default-collapsed' ? { mode, expanded: keys } : { mode, collapsed: keys }),
    [mode, keys],
  );

  const isOpen = useCallback((key: string) => isFoldOpen(folds, key), [folds]);

  const toggle = useCallback(
    (key: string, next?: boolean) => {
      setKeys((prev) => {
        // Membership means "expanded" under default-collapsed and "collapsed"
        // under default-expanded — resolve the polarity once, here, so no caller
        // has to know which way the set reads.
        const openNow = mode === 'default-collapsed' ? prev.has(key) : !prev.has(key);
        const wantOpen = next ?? !openNow;
        if (wantOpen === openNow) return prev;
        const out = new Set(prev);
        if ((mode === 'default-collapsed') === wantOpen) out.add(key);
        else out.delete(key);
        return out;
      });
    },
    [mode],
  );

  const reveal = useCallback((key: string) => toggle(key, true), [toggle]);

  return useMemo(() => ({ folds, isOpen, toggle, reveal }), [folds, isOpen, toggle, reveal]);
}

/**
 * Map every fold in a render order to its band-qualified {@link foldKey}, keyed
 * by the **group object**.
 *
 * Keyed by identity, not by `group.key`, because `group.key` is band-local: a
 * multi-line order whose lines straddle two date bands produces two groups with
 * the same key, so a `Map<string, string>` would collide on exactly the case
 * band-qualification exists to disambiguate.
 *
 * This exists because `renderGroup(group, baseStripeIndex, rowIndex)` is handed
 * **no band key** — and widening that signature is a public API change to
 * `LedgerGrid` / `VirtualGroupedSections`, which is *Ask first*
 * (`pattern-evolution.md`). The group object a renderer receives is the same one
 * that sits in the order (`VirtualGroupedSections` passes `item.group` straight
 * through), so identity is a free, non-invasive join.
 */
export function useGroupFoldKeys<T>(order: GroupedRenderOrder<T>): ReadonlyMap<RowGroup<T>, string> {
  return useMemo(() => {
    const map = new Map<RowGroup<T>, string>();
    for (const [bandKey, groups] of order) {
      for (const group of groups) map.set(group, foldKey(bandKey, group.key));
    }
    return map;
  }, [order]);
}

// ─── Publish ─────────────────────────────────────────────────────────────────

interface PublishRecordCursorArgs<T> {
  /** Stable identity of this surface. Two mounts of the same grid on one route
   *  MUST differ here, or they overwrite each other's claim. */
  surfaceId: string;
  scope: CursorScope;
  /**
   * The visibility / ownership claim. **Required — never inferred.**
   *
   * Not from mount order: StrictMode double-invokes effects and a route swap
   * mounts the incoming surface before the outgoing one unmounts. And not from
   * `display` either: `ReceivingRightPane` keeps `ReceivingLinesTable` mounted
   * at `display:none` under the focused workspace, and that hidden table must
   * REMAIN the publisher — stepping carton→carton with the workspace open is
   * exactly what today's `receiving-navigate-table` does.
   */
  enabled: boolean;
  /** Defaults to the grid tier; a rail passes `RECORD_CURSOR_PRIORITY.rail`. */
  priority?: number;
  order: GroupedRenderOrder<T>;
  folds?: FoldState;
  openId: RecordId | null;
  getId: (row: T) => RecordId;
  getGroupKey?: (row: T) => string | number | null;
  openGroupKey?: string | number | null;
  /**
   * Open a record on this surface. **Must honour `ctx.revealFoldKey`** (expand
   * that fold) and **must branch on `ctx.intent`** wherever the surface has a
   * row-click side effect a step should not fire — that difference is the whole
   * reason `receiving-highlight-line` exists as a second event name today.
   */
  onOpen: (row: T, ctx: { intent: CursorIntent; revealFoldKey: string | null }) => void;
  /** Dismiss the open record. Omit when dismissal is owned elsewhere; the panel
   *  then falls back to its own close path rather than rendering a dead ✕. */
  onClose?: () => void;
}

/**
 * Publish this surface's on-screen order as the cursor for its scope, and return
 * the resolved cursor for local use (reveal-on-deep-link, a position readout in
 * the grid's own chrome).
 *
 * Two effects, deliberately: the first CLAIMS the scope and only re-runs when
 * the claim itself changes, the second REFRESHES the content. Folding them into
 * one would withdraw-and-republish on every cursor change, minting a new `seq`
 * and churning the snapshot for what is really an in-place update.
 */
export function usePublishRecordCursor<T>(args: PublishRecordCursorArgs<T>): RecordCursor {
  const {
    surfaceId,
    scope,
    enabled,
    priority = RECORD_CURSOR_PRIORITY.grid,
    order,
    folds,
    openId,
    getId,
    getGroupKey,
    openGroupKey,
    onOpen,
    onClose,
  } = args;

  const cursor = useMemo(
    () => resolveRecordCursor({ scope, order, folds, openId, getId, getGroupKey, openGroupKey }),
    [scope, order, folds, openId, getId, getGroupKey, openGroupKey],
  );

  // The store speaks ids; the surface's `onOpen` speaks rows. Resolve here so no
  // consumer ever holds a row object it would have to keep fresh.
  const rowsById = useMemo(() => {
    const map = new Map<string, T>();
    for (const [, groups] of order) {
      for (const group of groups) {
        for (const row of group.rows) {
          const key = recordIdKey(getId(row));
          // First wins: a duplicated id is a data bug, and stepping to the row
          // the cursor's index actually names is the less surprising answer.
          if (key !== null && !map.has(key)) map.set(key, row);
        }
      }
    }
    return map;
  }, [order, getId]);

  // Latest-refs so the two published callbacks below can be `useCallback([])`.
  // See the module docblock: their identity is part of the store's emit gate.
  const rowsByIdRef = useRef(rowsById);
  rowsByIdRef.current = rowsById;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  const open = useCallback<RecordCursorOpen>((id, ctx) => {
    const key = recordIdKey(id);
    if (key === null) return;
    const row = rowsByIdRef.current.get(key);
    // The order moved under an in-flight step (a refetch landed between the
    // panel's click and this call). Dropping it is right: opening a record this
    // surface no longer lists is how a queue ends up highlighting nothing.
    if (row === undefined) return;
    onOpenRef.current(row, ctx);
  }, []);

  const closeStable = useCallback(() => {
    onCloseRef.current?.();
  }, []);
  // Flips only between one stable function and `undefined`, so the claim effect
  // below does not re-publish on an unrelated render.
  const close = onClose ? closeStable : undefined;

  // 1. Claim the scope. Reads the cursor off the ref so a content change does
  //    not withdraw-and-republish.
  useEffect(() => {
    if (!enabled) return;
    return publishRecordCursor({
      surfaceId,
      scope,
      priority,
      cursor: cursorRef.current,
      open,
      close,
    });
  }, [enabled, surfaceId, scope, priority, open, close]);

  // 2. Refresh the content. `updateRecordCursor` no-ops when every field is
  //    equal and emits when any is, so this is safe to run on every render.
  useEffect(() => {
    if (!enabled) return;
    updateRecordCursor({ surfaceId, scope, priority, cursor, open, close });
  }, [enabled, surfaceId, scope, priority, cursor, open, close]);

  return cursor;
}

// ─── Consume ─────────────────────────────────────────────────────────────────

interface RecordCursorControls {
  /**
   * Is any surface publishing this scope? **`false` means render no chevrons and
   * no `n / m` at all** — honest absence. A panel opened from search has no
   * queue behind it, and enabled-looking buttons that step a list nobody owns is
   * precisely how the dead `receiving-navigate-detail-overlay` chevrons survived
   * for months (plan §2.1).
   */
  available: boolean;
  /** 1-based, in the fold-blind order; null when nothing resolvable is open. */
  position: number | null;
  total: number;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  prevDisabled: boolean;
  nextDisabled: boolean;
  /** Null when the publisher owns dismissal elsewhere. */
  onClose: (() => void) | null;
}

const NO_CURSOR: RecordCursorControls = {
  available: false,
  position: null,
  total: 0,
  onPrev: null,
  onNext: null,
  prevDisabled: true,
  nextDisabled: true,
  onClose: null,
};

/**
 * Read the cursor for a scope. Panels wire nothing else: no `orderedRecords`, no
 * `selectedId`, no context string.
 *
 * When `position === null` (nothing open) **both** directions target the FIRST
 * record — that is what `useOutboundQueueKeyboard:88` and `useSidebarRail:427`
 * already did, and dropping it would leave ↓ dead on a freshly loaded queue.
 *
 * `scope` is REQUIRED and undefaulted, matching the publisher. It decides WHICH
 * list these controls step, and receiving publishes two at once — a `'sibling'`
 * panel that inherited a `'record'` default would read "3 of 47 cartons" where it
 * must read "2 of 5 lines", silently, on the surface nobody re-checked. Same law
 * as `intent` below (`.claude/rules/backend-patterns.md` — a classification takes
 * no default).
 */
export function useRecordCursor(scope: CursorScope): RecordCursorControls {
  const getSnapshot = useCallback(() => getRecordCursorTop(scope), [scope]);
  const top = useSyncExternalStore(subscribeRecordCursor, getSnapshot, getServerRecordCursorTop);

  return useMemo(() => {
    if (!top) return NO_CURSOR;
    const { cursor, open, close } = top;
    const prevTarget = cursor.position === null ? cursor.first : cursor.prev;
    const nextTarget = cursor.position === null ? cursor.first : cursor.next;
    return {
      available: true,
      position: cursor.position,
      total: cursor.total,
      onPrev: prevTarget
        ? () => open(prevTarget.id, { intent: 'step', revealFoldKey: prevTarget.revealFoldKey })
        : null,
      onNext: nextTarget
        ? () => open(nextTarget.id, { intent: 'step', revealFoldKey: nextTarget.revealFoldKey })
        : null,
      prevDisabled: !prevTarget,
      nextDisabled: !nextTarget,
      onClose: close ?? null,
    };
  }, [top]);
}
