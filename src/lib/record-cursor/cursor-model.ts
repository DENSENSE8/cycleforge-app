/** Record cursor — where the open record sits in the on-screen order, and what ↑ / ↓ open next. */

import { foldKey, isFoldOpen } from '../group-rows';
import type { FoldState, GroupedRenderOrder } from '../group-rows';

// ─── Identity ────────────────────────────────────────────────────────────────

export type RecordId = string | number;

/** Canonical comparison key for a record id. */
export function recordIdKey(id: RecordId | null | undefined): string | null {
  if (id === null || id === undefined) return null;
  const key = typeof id === 'number' ? String(id) : id.trim();
  return key === '' ? null : key;
}

// ─── Intent + scope ──────────────────────────────────────────────────────────

/** Why a record is being opened. */
export type CursorIntent = 'click' | 'step' | 'scan' | 'deep-link' | 'auto';

/** Which list is being stepped. */
export type CursorScope = 'record' | 'sibling';

// ─── Fold identity ───────────────────────────────────────────────────────

// `foldKey` and `isFoldOpen` are imported, never re-derived.

// ─── The cursor ──────────────────────────────────────────────────────────────

/** A step target plus the fold that must be expanded to make it visible. */
export interface CursorStep {
  /** The raw id, in whatever type the row carries it — pass it straight back to
   *  `getId`'s owner. Compare with {@link recordIdKey}, never with `===`. */
  id: RecordId;
  /** Band-qualified fold key (`foldKey` from `group-rows`) when the target sits inside a **collapsed, multi-row** fold; `null` otherwise. */
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
  /** The first record in the order, or `null` when the order is empty. */
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

/** Resolve the cursor for a grouped collection. */
export function resolveRecordCursor<T>(args: {
  scope: CursorScope;
  order: GroupedRenderOrder<T>;
  folds?: FoldState;
  openId: RecordId | null;
  getId: (row: T) => RecordId;
  /** Deduped-rail fallback: */
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
