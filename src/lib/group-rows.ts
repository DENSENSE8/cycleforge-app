/** Grouped render order — the one description of "what order does this collection paint in", and the one place fold identity is minted. */

export interface RowGroup<T> {
  key: string;
  rows: T[];
}

/** Group a flat list of rows by a derived key, preserving first-seen order of both the groups and the rows within each group. */
export function groupRowsBy<T>(rows: T[], keyFn: (row: T) => string): RowGroup<T>[] {
  const order: string[] = [];
  const byKey = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = [];
      byKey.set(key, bucket);
      order.push(key);
    }
    bucket.push(row);
  }
  return order.map((key) => ({ key, rows: byKey.get(key)! }));
}

/** Canonical on-screen order of a grouped collection: */
export type GroupedRenderOrder<T> = ReadonlyArray<readonly [string, ReadonlyArray<RowGroup<T>>]>;

/**
 * The band key {@link singleBand} stamps on its one band.
 *
 * Exported because a caller that builds a {@link foldKey} for a `singleBand` order
 * needs the same band key the flattens used; reading `order[0]?.[0]` works too.
 */
export const SINGLE_BAND_KEY = '';

/** Band-qualified fold identity — **the only way to spell a fold**. */
export function foldKey(bandKey: string, groupKey: string): string {
  return `${bandKey.length}:${bandKey}:${groupKey}`;
}

/** Lift a flat list into the one input shape, as a single band. */
export function singleBand<T>(
  rows: readonly T[],
  groupKeyOf?: (row: T) => string,
): GroupedRenderOrder<T> {
  const groups = groupKeyOf
    ? groupRowsBy([...rows], groupKeyOf)
    : rows.map((row, index) => ({ key: `#${index}`, rows: [row] }));
  return [[SINGLE_BAND_KEY, groups]];
}

/** Fold state, with its polarity carried in the value. */
export type FoldState =
  | { readonly mode: 'default-collapsed'; readonly expanded: ReadonlySet<string> }
  | { readonly mode: 'default-expanded'; readonly collapsed: ReadonlySet<string> };

/** Is this fold open? */
export function isFoldOpen(folds: FoldState | undefined, key: string): boolean {
  if (!folds) return true;
  return folds.mode === 'default-collapsed' ? folds.expanded.has(key) : !folds.collapsed.has(key);
}

/** Fold-BLIND leaf order — every fold treated as open. */
export function flattenRenderOrder<T>(order: GroupedRenderOrder<T>): T[] {
  const out: T[] = [];
  for (const [, groups] of order) {
    for (const group of groups) {
      for (const row of group.rows) out.push(row);
    }
  }
  return out;
}

/** What a **collapsed, multi-row** fold leaves on screen. */
export type CollapsedFoldRendering = 'leading-row' | 'summary-only';

/** Visible-only leaf order — for scroll-into-view and roving focus, and for nothing else. */
export function flattenVisibleRenderOrder<T>(
  order: GroupedRenderOrder<T>,
  folds: FoldState,
  collapsedFold: CollapsedFoldRendering,
): T[] {
  const out: T[] = [];
  for (const [bandKey, groups] of order) {
    for (const group of groups) {
      if (group.rows.length <= 1) {
        // Singleton (or empty) — a plain leaf with no chevron; no fold to close.
        // The loop, rather than `push(rows[0]!)`, is what keeps an empty group
        // from contributing an `undefined` hole to the visible order.
        for (const row of group.rows) out.push(row);
        continue;
      }
      if (isFoldOpen(folds, foldKey(bandKey, group.key))) {
        for (const row of group.rows) out.push(row);
        continue;
      }
      // Collapsed. `'summary-only'` contributes nothing: the summary row is
      // derived chrome with no record id, so there is nothing to scroll to.
      if (collapsedFold === 'leading-row') out.push(group.rows[0]!);
    }
  }
  return out;
}

// ─── Group aggregates ────────────────────────────────────────────────────────

/** A group's rolled-up numbers — what a WMS group header has to say. */
export interface RowGroupTotals {
  /** Rows in the group. Always present; never a measure the caller names. */
  count: number;
  /** Caller-named sums, in declaration order. */
  measures: Readonly<Record<string, number>>;
}

/** One named measure: how to read a number off a row. */
export type RowGroupMeasure<T> = (row: T) => number;

/**
 * Roll a group up. Non-finite reads contribute NOTHING rather than poisoning
 * the sum to `NaN` — a blank qty on one line must not erase the other eleven,
 * which is the same reasoning that sends blanks last in `compareGridValues`.
 */
export function rowGroupTotals<T>(
  group: RowGroup<T>,
  measures: Readonly<Record<string, RowGroupMeasure<T>>> = {},
): RowGroupTotals {
  const out: Record<string, number> = {};
  for (const name of Object.keys(measures)) {
    const read = measures[name];
    let sum = 0;
    for (const row of group.rows) {
      const n = read(row);
      if (Number.isFinite(n)) sum += n;
    }
    out[name] = sum;
  }
  return { count: group.rows.length, measures: out };
}

/**
 * `rowGroupTotals` across every group, keyed by group key — one pass for a
 * whole band, so a header row never triggers its own scan.
 */
export function rowGroupTotalsByKey<T>(
  groups: readonly RowGroup<T>[],
  measures: Readonly<Record<string, RowGroupMeasure<T>>> = {},
): ReadonlyMap<string, RowGroupTotals> {
  return new Map(groups.map((g) => [g.key, rowGroupTotals(g, measures)]));
}
