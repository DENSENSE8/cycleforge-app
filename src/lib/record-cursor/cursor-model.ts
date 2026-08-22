/**
 * Record cursor — where the open record sits in the on-screen order, and what
 * ↑ / ↓ open next.
 *
 * WHY A MODULE AND NOT FIVE COPIES OF `findIndex → ±1 → open`
 * Seven window-event channels and five hand-typed copies of the same four lines
 * answer this one question today (`record-cursor-unification-PLAN.md` §1.1–1.2).
 * Because each copy re-derives the order it steps through, they disagree:
 *  • `receiving-navigate-detail-overlay` has **no listener at all** — the
 *    receiving stack's two chevrons render enabled and do nothing (§2.1),
 *    because nothing computes a bound.
 *  • the dashboard steps into rows the operator cannot see: `QueueGroupRow`
 *    renders a multi-line order as one collapsed summary while the queue's
 *    flatten walks every hidden child, so ↓ "moves" three times before anything
 *    on screen changes (§2.2).
 * One resolver, called by every surface, is what makes those the same answer.
 *
 * THE RULING THIS FILE ENCODES: prev/next walk the **fold-blind** order.
 * Stepping into a collapsed fold EXPANDS it and lands on its first child — it
 * never skips it (§3.3). Reveal-never-skip means every record is reachable, so
 * the fold-blind order IS the navigation domain; `folds` is consulted for one
 * purpose only, to fill in {@link CursorStep.revealFoldKey} so the surface can
 * open the fold as it opens the record. Two consequences worth naming:
 *  • `total` cannot jump under a fold toggle the operator did not make. A
 *    position readout that silently turns "3 of 47" into "3 of 44" is worse
 *    than no readout.
 *  • this AGREES with `grid-row-index.ts` rather than contradicting it. That
 *    module is fold-blind because WAI-ARIA wants stable `aria-rowindex` under
 *    collapse; this one is fold-blind because reveal makes hidden rows
 *    reachable. Same answer, two reasons — do not "unify" them into one
 *    function, and never feed a VISIBLE-only flatten
 *    (`flattenVisibleRenderOrder`) to either.
 *
 * Pure by design — the same contract as `right-rail/selection-occupancy.ts` and
 * `receiving/inspector/carton-inspector-model.ts`: no React, no fetch, and its
 * only import is the equally pure `group-rows`, so it runs under `node --test` /
 * `npx tsx --test` with zero setup.
 */

import { foldKey, isFoldOpen } from '../group-rows';
import type { FoldState, GroupedRenderOrder } from '../group-rows';

// ─── Identity ────────────────────────────────────────────────────────────────

export type RecordId = string | number;

/**
 * Canonical comparison key for a record id.
 *
 * **This is the whole reason deep links did not light the chevrons.** A URL
 * carries `?openOrderId=4821` as a **string** while `ShippedOrder.id` is a
 * **number**, so a bare `===` never matches and the cursor reports
 * `position: null` — chevrons permanently disabled on every deep link and every
 * reload. Today's code papers over exactly this with `Number(r.id) === cur`
 * (`useOutboundQueueKeyboard.ts:105`); doing it once, here, is why no call site
 * has to remember.
 *
 * Canonicalizes by **string**, not by `Number`, because not every record id is
 * numeric — a SKU panel key, a `manifest:<ref>`, a tracking number with a
 * leading zero. `Number()` would collapse `'04821'` onto `4821` and NaN every
 * non-numeric id into one bucket where they all compare equal.
 *
 * Returns `null` for a value that cannot identify a record (null / undefined /
 * blank). `0` is a **valid** id and returns `'0'` — `isDetailsReopen`'s own test
 * pins that distinction on the surface this replaces.
 */
export function recordIdKey(id: RecordId | null | undefined): string | null {
  if (id === null || id === undefined) return null;
  const key = typeof id === 'number' ? String(id) : id.trim();
  return key === '' ? null : key;
}

// ─── Intent + scope ──────────────────────────────────────────────────────────

/**
 * Why a record is being opened. **Required and undefaulted everywhere** it is
 * threaded (*A safety classification is a
 * REQUIRED parameter*): it decides whether the open clears `scanMatchedRows`,
 * steals scroll, or pushes history, and a default is a silent opt-out that
 * every call site nobody visited takes automatically.
 *
 * | intent | raised by | must NOT |
 * |---|---|---|
 * | `click` | operator clicked the row | — (full row-click semantics) |
 * | `step` | ↑ / ↓ / `j` / `k` / a header chevron | clear `scanMatchedRows` |
 * | `scan` | a barcode resolved to this record | steal focus from the scan bar |
 * | `deep-link` | URL / restore on mount | push a history entry |
 * | `auto` | the surface opened it unasked | clear scan rows, scroll-steal, or push history |
 *
 * `'step'` exists because the codebase already needed it and expressed it as a
 * *second event name*: `receiving-highlight-line` was minted purely to dodge
 * `receiving-select-line`'s row-click side effect (§2.4). `'auto'` exists
 * because `useSidebarRail`'s `autoSelectFirstWhenEmpty` opens a record the
 * operator never asked for — classified `'click'` it wipes scan rows on every
 * rail refetch, classified `'step'` it steals scroll and reads as navigation.
 */
export type CursorIntent = 'click' | 'step' | 'scan' | 'deep-link' | 'auto';

/**
 * Which list is being stepped. **Receiving runs two cursors at once and they
 * have different totals**, so one global cursor is not merely imprecise — it
 * makes the carton header read "3 of 47" where it must read "2 of 5".
 *
 * | scope | the list | today's channel |
 * |---|---|---|
 * | `record` | the grouped collection on screen (cartons, orders, claims) | `receiving-navigate-table`, `navigate-shipped-details` |
 * | `sibling` | the PO-scoped lines inside the OPEN carton | `useReceivingLineNavigation` `navRows` → `dispatchReceivingWorkspaceNavState` |
 *
 * The sibling scope already renders a position readout ("Line N of M"), so the
 * plan's "0 position readouts anywhere" (§1.4) is wrong about it — that readout
 * is the one thing this unification must not regress.
 */
export type CursorScope = 'record' | 'sibling';

// ─── Fold identity ───────────────────────────────────────────────────────

// `foldKey` and `isFoldOpen` are imported, never re-derived. `RowGroup.key` is
// BAND-LOCAL — `groupRowsBy` runs once per date band, so a multi-line order whose
// lines carry different `deadline_at` lands one group per band under the SAME
// key. Composing the band-qualified key here with a second encoding would mean a
// reveal aimed at one band silently opens the other. `group-rows.ts` owns the
// encoding (length-prefixed, injective) precisely so there is one of it.

// ─── The cursor ──────────────────────────────────────────────────────────────

/**
 * A step target plus the fold that must be expanded to make it visible.
 *
 * **Per direction, deliberately.** A single `revealGroupKey` on the cursor
 * cannot describe prev and next when they sit in two *different* collapsed
 * folds — whichever direction the field happened to be computed for works and
 * the other reveals the wrong fold, or none.
 */
export interface CursorStep {
  /** The raw id, in whatever type the row carries it — pass it straight back to
   *  `getId`'s owner. Compare with {@link recordIdKey}, never with `===`. */
  id: RecordId;
  /**
   * Band-qualified fold key (`foldKey` from `group-rows`) when the target sits
   * inside a **collapsed, multi-row** fold; `null` otherwise.
   *
   * Always `null` for a group of one: `QueueGroupRow` renders a singleton's leaf
   * directly with no summary row and no chevron (`groupRowSpan`), so a singleton
   * can never *be* collapsed. Emitting a key for one would write a fold id
   * nothing renders, move no chevron, and leave dead entries accumulating in the
   * fold set.
   */
  revealFoldKey: string | null;
}

export interface RecordCursor {
  /** Echoed from the caller so a consumer that reads both scopes cannot mix
   *  them up. */
  scope: CursorScope;
  /** 1-based position in the FOLD-BLIND order; `null` when nothing resolvable
   *  is open. */
  position: number | null;
  /** Length of the FOLD-BLIND order. Does not move when a fold toggles. */
  total: number;
  /** `null` at the first record — that is the disabled state for ↑. */
  prev: CursorStep | null;
  /** `null` at the last record — that is the disabled state for ↓. */
  next: CursorStep | null;
  /**
   * The first record in the order, or `null` when the order is empty.
   * **Independent of `openId`** — it is the answer to "what does ↓ open when
   * there is no current position", which is what both
   * `useOutboundQueueKeyboard.ts:88` and `useSidebarRail.ts:427` do today. A
   * cursor with only prev/next regresses both surfaces to a dead chevron on a
   * freshly loaded queue.
   *
   * Consumer rule: `position === null` → open `first`; otherwise use
   * `prev`/`next` and disable when they are `null`.
   */
  first: CursorStep | null;
  /**
   * Set when the ALREADY-OPEN record sits inside a collapsed fold — a deep link
   * into a folded order. The surface reveals this on mount so the grid
   * highlights the row the panel is showing.
   */
  openRevealFoldKey: string | null;
}

interface CursorLeaf {
  id: RecordId;
  idKey: string | null;
  groupIdKey: string | null;
  foldKey: string;
  foldSize: number;
}

/**
 * Resolve the cursor for a grouped collection.
 *
 * `folds` is consulted **only** to fill `revealFoldKey` / `openRevealFoldKey` —
 * see the module docblock. Omit it and every fold is treated as open.
 *
 * Safe to call on every render: one pass over the leaves, no I/O, no allocation
 * per row beyond the flat index.
 */
export function resolveRecordCursor<T>(args: {
  scope: CursorScope;
  order: GroupedRenderOrder<T>;
  folds?: FoldState;
  openId: RecordId | null;
  getId: (row: T) => RecordId;
  /**
   * Deduped-rail fallback: when `openId` names a **sibling** that is absent from
   * the order — the unbox Unboxed rail keeps one row per `receiving_id`, so the
   * selected *line* is not itself a row — match on the group instead, and step
   * from the first row of that group.
   *
   * Reproduces `useSidebarRail.ts:423–427`, which the plan names as the
   * behavioural reference. Both must be supplied or neither; one alone is
   * ignored, since a group predicate with nothing to match is not a fallback.
   */
  getGroupKey?: (row: T) => string | number | null;
  openGroupKey?: string | number | null;
}): RecordCursor {
  const { scope, order, folds, openId, getId, getGroupKey, openGroupKey } = args;

  const wantsGroupFallback = typeof getGroupKey === 'function';
  const leaves: CursorLeaf[] = [];

  for (const entry of order) {
    const bandKey = entry[0];
    const groups = entry[1];
    for (const group of groups) {
      const foldKeyForGroup = foldKey(bandKey, group.key);
      const foldSize = group.rows.length;
      for (const row of group.rows) {
        const id = getId(row);
        leaves.push({
          id,
          idKey: recordIdKey(id),
          groupIdKey: wantsGroupFallback ? recordIdKey(getGroupKey(row)) : null,
          foldKey: foldKeyForGroup,
          foldSize,
        });
      }
    }
  }

  const total = leaves.length;

  const stepAt = (index: number): CursorStep | null => {
    const leaf = leaves[index];
    if (!leaf) return null;
    // A singleton fold has no chevron and cannot be collapsed — never emit a
    // reveal key for it.
    const collapsed = leaf.foldSize > 1 && !isFoldOpen(folds, leaf.foldKey);
    return { id: leaf.id, revealFoldKey: collapsed ? leaf.foldKey : null };
  };

  const first = stepAt(0);

  const openKey = recordIdKey(openId);
  let index = openKey === null ? -1 : leaves.findIndex((leaf) => leaf.idKey === openKey);

  if (index < 0 && wantsGroupFallback) {
    const groupKey = recordIdKey(openGroupKey ?? null);
    if (groupKey !== null) {
      index = leaves.findIndex((leaf) => leaf.groupIdKey === groupKey);
    }
  }

  if (index < 0) {
    // Nothing open, or an id this order does not contain. The order still has a
    // length and a first row, so ↓ stays live via `first` — that is the rail's
    // "curPos < 0 → open the first rendered row" branch.
    return { scope, position: null, total, prev: null, next: null, first, openRevealFoldKey: null };
  }

  return {
    scope,
    position: index + 1,
    total,
    prev: stepAt(index - 1),
    next: stepAt(index + 1),
    first,
    openRevealFoldKey: stepAt(index)?.revealFoldKey ?? null,
  };
}
