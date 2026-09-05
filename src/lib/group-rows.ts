/**
 * Grouped render order — the one description of "what order does this collection
 * paint in", and the one place fold identity is minted.
 *
 * `groupRowsBy` has always answered the small half of that question: fold a flat
 * list into one group per PO / shipment / order for ordering. Sheet list bodies
 * render those groups as **flat leaves**; parent rollups live on the drill
 * parent map. This module now also names the *whole* shape a
 * grouped ops surface renders — **bands → groups → rows** — because two separate
 * concerns kept re-deriving it by hand and drifting:
 *
 *  - `useOrdersQueueRows` and `useReceivingGrouping` each hand-rolled a nested
 *    `flatMap` to get the flat leaf order (the "what is row N" question), and
 *  - the record cursor (`src/lib/record-cursor/`) needs that same order to answer
 *    prev/next, plus a *second*, visible-only order for scroll-into-view.
 *
 * Three things here exist to prevent specific, observed bugs:
 *
 * **1. Fold keys are BAND-QUALIFIED ({@link foldKey}).** `groupRowsBy` keys are
 * band-local (`order_id`, or `id:<n>` for a row with no order). A multi-line order
 * whose lines carry different `deadline_at` values lands one group per date band
 * with the *same* key. A single `Set<string>` of raw group keys therefore toggles
 * both folds at once, and "reveal this fold" is ambiguous. Every fold key in this
 * system is minted here — `record-cursor/cursor-model.ts` *imports* {@link foldKey}
 * rather than composing its own band/group join, so the cursor, the fold state, and
 * the group renderer all spell the same fold the same way. A second encoding is not
 * a style nit: a `revealFoldKey` produced by one and `.has()`-tested against a set
 * built by the other is never equal, so the reveal silently no-ops and the record
 * opens behind a still-closed fold.
 *
 * **2. Fold polarity is EXPLICIT ({@link FoldState}).** Orders `QueueGroupRow`
 * is always-expanded (parent chrome when the fold has more than one line; no
 * chevron). `useSidebarRail` tracks `collapsedGroups`, i.e. default-EXPANDED.
 * A bare `expandedKeys?: ReadonlySet<string>` has no polarity, so the rail
 * passing its freshly-initialized `new Set()` would read as "every group
 * collapsed" and its scroll/focus targets would silently vanish.
 *
 * **3. The two flattens are NAME-DISTINCT.** {@link flattenRenderOrder} is
 * fold-BLIND — it is the navigation domain (reveal-never-skip means every record
 * is reachable, so folds cannot change what prev/next walks or `total` would jump
 * under a fold the operator never touched). {@link flattenVisibleRenderOrder} is
 * the presentation domain (scroll-into-view, roving focus) and must **never**
 * reach `aria-rowindex` / `countGridRows` — see `grid-row-index.ts`, which stays
 * fold-blind per WAI-ARIA so collapsing a fold cannot renumber the grid under a
 * screen-reader user.
 *
 * **4. A collapsed fold does not render the same thing everywhere
 * ({@link CollapsedFoldRendering}).** The two surfaces this module serves disagree,
 * so "what is visible" cannot be answered from the data alone — see that type.
 * The discriminator is a required argument for the reason `backend-patterns.md`
 * gives: a default is a silent opt-out taken by every call site nobody visited.
 *
 * Pure and dependency-free by design (same contract as
 * `right-rail/selection-occupancy.ts`): no React, no fetch, no imports, so it runs
 * under `node --test` with zero setup.
 *
 * Plan: `docs/todo/record-cursor-unification-PLAN.md` §3.1.
 */

export interface RowGroup<T> {
  key: string;
  rows: T[];
}

/**
 * Group a flat list of rows by a derived key, preserving first-seen order of both
 * the groups and the rows within each group.
 *
 * Rows that should never merge (no PO yet, unmatched placeholders) just get a
 * unique key from the caller's keyFn so they land in their own singleton group and
 * render as a plain row.
 */
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

/**
 * Canonical on-screen order of a grouped collection: **bands → folds → rows**.
 *
 * A band is a day band / date header (`showDayHeaders`, `DateGroupHeader`); a fold
 * is one {@link RowGroup}. A surface with no bands publishes one band — see
 * {@link singleBand}.
 */
export type GroupedRenderOrder<T> = ReadonlyArray<readonly [string, ReadonlyArray<RowGroup<T>>]>;

/**
 * The band key {@link singleBand} stamps on its one band.
 *
 * Exported because a caller that builds a {@link foldKey} for a `singleBand` order
 * needs the same band key the flattens used; reading `order[0]?.[0]` works too.
 */
export const SINGLE_BAND_KEY = '';

/**
 * Band-qualified fold identity — **the only way to spell a fold**.
 *
 * `groupRowsBy` keys are band-local, so the same key can name two different folds
 * in two different bands (a multi-line order whose lines have different
 * `deadline_at`). Keying fold state or a reveal target on the raw group key
 * expands both, and highlights the wrong one.
 *
 * The encoding is length-prefixed rather than a plain `${band}:${group}` join so
 * that a band or group key which itself contains the separator cannot collide with
 * a different pair. Nothing parses the result — it is an opaque identity — but it
 * is injective, which is the property that matters.
 */
export function foldKey(bandKey: string, groupKey: string): string {
  return `${bandKey.length}:${bandKey}:${groupKey}`;
}

/**
 * Lift a flat list into the one input shape, as a single band.
 *
 * Required, not sugar: `useSidebarRail` has no grouped render order at all (a flat
 * `rows` array plus a parallel `grouped[i]` carrying a numeric `groupId`), and
 * receiving's sibling navigation domain is `filterLinesByPoGroup(...)` — a filtered
 * flat array. Without this, neither surface could publish a cursor and both would
 * have to keep their bespoke event channel.
 *
 * With no `groupKeyOf`, every row becomes its own singleton group: a singleton
 * never renders a chevron, so its fold key is inert by construction and the flat
 * list stays flat in both flattens.
 */
export function singleBand<T>(
  rows: readonly T[],
  groupKeyOf?: (row: T) => string,
): GroupedRenderOrder<T> {
  const groups = groupKeyOf
    ? groupRowsBy([...rows], groupKeyOf)
    : rows.map((row, index) => ({ key: `#${index}`, rows: [row] }));
  return [[SINGLE_BAND_KEY, groups]];
}

/**
 * Fold state, with its polarity carried in the value.
 *
 * `useOrdersQueueRows` / `QueueGroupRow` are **default-collapsed**
 * (`defaultExpanded = false`), so their set names what is *expanded*.
 * `useSidebarRail` is **default-expanded** — it tracks `collapsedGroups` — so its
 * set names what is *collapsed*. A single untagged `Set<string>` means opposite
 * things on those two surfaces, and an empty one (the initial state on both) reads
 * as "everything collapsed" on whichever surface guessed wrong. Silently.
 *
 * Keys are always {@link foldKey} output.
 */
export type FoldState =
  | { readonly mode: 'default-collapsed'; readonly expanded: ReadonlySet<string> }
  | { readonly mode: 'default-expanded'; readonly collapsed: ReadonlySet<string> };

/**
 * Is this fold open?
 *
 * `undefined` fold state means **every fold is open** — the pre-fold-state
 * behaviour, unchanged, which is what makes adopting this module a no-op for a
 * caller that does not track folds yet.
 */
export function isFoldOpen(folds: FoldState | undefined, key: string): boolean {
  if (!folds) return true;
  return folds.mode === 'default-collapsed' ? folds.expanded.has(key) : !folds.collapsed.has(key);
}

/**
 * Fold-BLIND leaf order — every fold treated as open.
 *
 * **This is the navigation domain.** Under the reveal-never-skip rule a step into a
 * collapsed fold expands it and lands on its first child, so every record is
 * reachable and the fold-blind order *is* what prev/next walks. Gating the walk on
 * fold state would also make the cursor's `total` jump ("3 of 47" → "3 of 44")
 * under a fold toggle the operator did not make.
 *
 * Replaces the hand-rolled flattens in `useOrdersQueueRows` and
 * `useReceivingGrouping`, and agrees with `grid-row-index.ts` — both are fold-blind,
 * for the same reason.
 */
export function flattenRenderOrder<T>(order: GroupedRenderOrder<T>): T[] {
  const out: T[] = [];
  for (const [, groups] of order) {
    for (const group of groups) {
      for (const row of group.rows) out.push(row);
    }
  }
  return out;
}

/**
 * What a **collapsed, multi-row** fold leaves on screen. There is no universal
 * answer, which is why this is a required argument rather than a constant.
 *
 * - `'leading-row'` — the fold's first member keeps its DOM node and acts as the
 *   header. `useSidebarRail` works this way: it hides members with
 *   `groupId != null && collapsedGroups.has(groupId) && groupIndex > 0`, so index
 *   `0` is still a rendered, id-keyed row.
 * - `'summary-only'` — **every** member is unmounted and a *derived* summary takes
 *   their place. Historically `QueueGroupRow` did this with `CollapsibleGroupRow`
 *   + an order summary row; sheet grids are now flat leaves and parent rollups
 *   live only on the drill parent map. The mode remains for
 *   `flattenVisibleRenderOrder` consumers that still model collapsed chrome
 *   with no record id.
 *
 * Getting this wrong is not cosmetic. The two consumers this function exists for —
 * scroll-into-view and roving focus — look a row up **by id**. Returning a
 * `'leading-row'` answer on a `'summary-only'` surface hands them an id whose
 * element was unmounted: the scroll silently does nothing and focus lands nowhere,
 * on exactly the collapsed folds where the operator most needs to be moved.
 */
export type CollapsedFoldRendering = 'leading-row' | 'summary-only';

/**
 * Visible-only leaf order — for scroll-into-view and roving focus, and for nothing
 * else.
 *
 * **Never feed this to `countGridRows` / `aria-rowindex`** (they stay fold-blind —
 * collapsing a fold must not renumber the grid under a screen-reader user) and
 * **never to the cursor** (see {@link flattenRenderOrder}). The name is
 * deliberately distinct from its fold-blind sibling so a call site cannot mix them
 * up by autocomplete.
 *
 * A group with exactly one row is **always** visible, in both renderings: a
 * singleton has always rendered its leaf directly with no summary row and no
 * chevron, so it can never *be* collapsed — a fold key naming one is
 * dead state. Dropping a singleton because its inert key sits in the set would make
 * a record unreachable with no affordance to bring it back.
 *
 * What a collapsed multi-row fold contributes is the caller's declaration — see
 * {@link CollapsedFoldRendering}.
 */
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

/**
 * A group's rolled-up numbers — what a WMS group header has to say.
 *
 * `RowGroup` carried `{ key, rows }` and nothing else, so every surface that
 * wanted "12 lines · 340 units · 3 short" counted it outside the engine, in the
 * view, per render. That is the wrong place twice over: the count is a FACT
 * about the group (kinetic-ledger law 4 — views assemble resolved facts, they
 * do not compute them), and two surfaces counting the same thing separately is
 * how two surfaces come to disagree about it.
 *
 * `count` is always the row total. `measures` is caller-named because what a
 * group sums is domain knowledge — units on a pick list, dollars on a PO,
 * people on a checklist — while the folding is not.
 */
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
