/**
 * The table tile's **params codec** — how a grid's view state survives in a
 * `TabParams` bag, and why it is shaped the way it is.
 *
 * ## Why a codec exists at all
 *
 * A table's view state is not scalar. Sort is a (key, direction) pair, column
 * visibility is a SET, and a filter is free text. `TabParams` is flat
 * (`string | number | boolean | null`) and deliberately so: the prefs merge
 * that persists a tab is SHALLOW, and a nested params bag is exactly the shape
 * that loses half of itself when two panes write at once
 * (`@/lib/workspace/types`). So the non-scalar halves get an explicit,
 * documented encoding here rather than a JSON blob squeezed into a string —
 * a JSON blob would round-trip fine and be unreadable in a URL, unreadable in
 * the persisted prefs bag, and impossible to hand-fix when one tab is wedged.
 *
 * ## Why this is NOT a second copy of the URL param vocabulary
 *
 * The route-shaped mounts read `?colsort=` / `?coldir=` / `?sort=` / `?q=` and
 * friends, and those keys had to be globally unique because every surface on a
 * page shares ONE query string — that is the entire reason
 * `useUrlColumnSort` had to pick `?colsort=` over `?sort=` (the station routes
 * already spent `?sort=` on the server ORDER BY). A tab's params bag is scoped
 * to one tab, so the collision problem does not exist and the keys can be the
 * short obvious ones. Two tabs of Orders holding different sorts is precisely
 * the thing a query string cannot express.
 *
 * ## The keys
 *
 * | key      | type              | meaning                                       |
 * |----------|-------------------|-----------------------------------------------|
 * | `view`   | string            | which named view of the table this tab holds  |
 * | `sort`   | string            | active column-sort key; absent = family order |
 * | `dir`    | `'asc' \| 'desc'` | direction; absent = the column's default      |
 * | `q`      | string            | free-text filter                              |
 * | `hide`   | string            | per-tab column hide delta (see below)         |
 * | `record` | string \| number  | the picked record (the record plane)          |
 * | `date`   | string            | civil date key, for date-scoped tables        |
 * | `week`   | number            | week offset back from this week (0 = current) |
 *
 * Absent always means "the family default", never `''` — a key written as an
 * empty string would persist a meaningless entry into `staff_preferences` on
 * every tab, so every writer below removes rather than blanks.
 */

import type { TabParams, TabParamsPatch } from '@/lib/workspace/types';
import type { LedgerGridColumnModel } from '@/lib/grid/grid-surface-descriptor';

/**
 * The COMPLETE tab-param vocabulary for table tiles — shared keys first, then
 * the per-family ones.
 *
 * Complete is the point. Half of these used to be bare string literals spelled
 * inside the tiles, which meant the vocabulary was neither greppable in one
 * place nor collision-checked: two families landing on the same key would have
 * had no compile-time signal and no obvious symptom, just one tab's filter
 * quietly reading another's value. Everything a tile reads or writes is
 * declared here, so a new key is a one-line diff in a file whose whole job is
 * to be read before you pick a name.
 *
 * Family keys are namespaced by MEANING, not by prefix: `isort` and `hsort` are
 * distinct because Incoming's server sort and Receiving history's sort are
 * different vocabularies, while `staff` is deliberately shared — it is the same
 * question ("whose rows?") on every family, and a tab that carries it across a
 * view switch should keep answering the same way.
 */
export const TABLE_TAB_PARAM = {
  // ── shared across every family ──
  view: 'view',
  sort: 'sort',
  dir: 'dir',
  query: 'q',
  hide: 'hide',
  record: 'record',
  date: 'date',
  week: 'week',
  /** Staff filter — the same question on every family, so one key. */
  staff: 'staff',
  // ── Incoming ──
  /** Delivery lifecycle state (`DELIVERED_UNOPENED`, `CARRIER_MISMATCH`, …). */
  state: 'state',
  /** Feed source facet. */
  source: 'source',
  /** Server-side sort for the Incoming feed (distinct vocabulary from `sort`). */
  incomingSort: 'isort',
  /** PO date window. */
  poFrom: 'pofrom',
  poTo: 'poto',
  /** 1-based server page into the Incoming feed. */
  page: 'page',
  // ── Receiving (browse / history) ──
  /** History sort (distinct vocabulary from `sort`). */
  historySort: 'hsort',
  /** Queue stage facet. */
  stage: 'stage',
  /** Queue lane facet. */
  lane: 'lane',
  /** Priority-only toggle. */
  urgent: 'urgent',
} as const;

export type TableTabSortDir = 'asc' | 'desc';

// ── scalar readers ──────────────────────────────────────────────────────────
// Readers, not a parser class: a tile reads three or four keys and every one of
// them has a different fallback, so a schema object would be more ceremony than
// the four call sites it served.

/** A trimmed string param, or `''` when absent / not a string. */
export function readTabString(params: TabParams, key: string): string {
  const raw = params[key];
  return typeof raw === 'string' ? raw.trim() : '';
}

/** A finite integer param, or `fallback`. Accepts a numeric string. */
export function readTabInt(params: TabParams, key: string, fallback: number): number {
  const raw = params[key];
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/**
 * A param constrained to a closed set of literals.
 *
 * Takes the allowed values rather than a type predicate so the fallback and the
 * vocabulary are declared together at the call site — a tab restored from a
 * `staff_preferences` bag written by an older build can name a view that no
 * longer exists, and it must land on the family default rather than mount
 * nothing.
 */
export function readTabEnum<T extends string>(
  params: TabParams,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = readTabString(params, key);
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

/**
 * A param constrained to a closed set, where ABSENT is a legitimate value.
 *
 * Separate from {@link readTabEnum} rather than a nullable overload of it: a
 * facet that is off ("all lanes") and a facet whose stored value was retired
 * are the same answer here, and a caller that wants a default instead should
 * be reading the other function so the difference stays visible at the call.
 */
export function readTabEnumOrNull<T extends string>(
  params: TabParams,
  key: string,
  allowed: readonly T[],
): T | null {
  const raw = readTabString(params, key);
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

/** A boolean flag. Accepts a real boolean or the `'true'` / `'1'` wire forms. */
export function readTabBool(params: TabParams, key: string): boolean {
  const raw = params[key];
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw === 1;
  return raw === 'true' || raw === '1';
}

/**
 * A record id, or `null` when absent.
 *
 * **Non-zero, not positive.** Receiving and Incoming both carry SYNTHETIC rows
 * with a negative `id` — an "Unfound receiving" placeholder is a scanned
 * package that resolved to no line, and `useReceivingGrouping` identifies them
 * by exactly that (`row.id < 0`). A `> 0` guard silently refused to hold those
 * picks, so clicking one dispatched the open but left the grid painting no
 * selected row. `0` stays the sentinel because it is what {@link readTabInt}
 * returns for an absent or unparseable key.
 */
export function readTabRecordId(params: TabParams): number | null {
  const n = readTabInt(params, TABLE_TAB_PARAM.record, 0);
  return n !== 0 ? n : null;
}

// ── sort ────────────────────────────────────────────────────────────────────

export interface TableTabSort<K extends string> {
  /** Active column sort, or `null` for the family's own default order. */
  readonly sort: K | null;
  /** Resolved direction — never null while `sort` is set. */
  readonly dir: TableTabSortDir | null;
}

/**
 * Read this tab's column sort, validated against the family's own sortability
 * predicate.
 *
 * `isColumn` is the family's exported guard (`isOrdersQueueSortable`,
 * `isReceivingGridSortable`, …), so a stored key that the family retired
 * resolves to "no sort" instead of a comparator that reads `undefined` on every
 * row. The direction defaults to the COLUMN's default (Date opens newest-first,
 * text opens A→Z) rather than to a global `'asc'`, because that default is a
 * property of the column and every family already declares it.
 */
export function readTabSort<K extends string>(
  params: TabParams,
  isColumn: (raw: string) => boolean,
  defaultDir: (key: K) => TableTabSortDir,
): TableTabSort<K> {
  const raw = readTabString(params, TABLE_TAB_PARAM.sort);
  if (!raw || !isColumn(raw)) return { sort: null, dir: null };
  const key = raw as K;
  const dir = readTabString(params, TABLE_TAB_PARAM.dir);
  return { sort: key, dir: dir === 'asc' || dir === 'desc' ? dir : defaultDir(key) };
}

/**
 * Header-click semantics, as a patch: the active column flips direction, a new
 * column activates at its own default, and flipping the active column back off
 * its default and round again CLEARS the sort.
 *
 * The three-state cycle (default → flipped → none) is the spreadsheet gesture
 * every family's `toggleColumnSort` already implements against the URL; this is
 * the same state machine over `params`, and it is here rather than in each tile
 * so the four families cannot drift into three different answers for what the
 * third click does.
 */
export function toggleTabSortPatch<K extends string>(
  current: TableTabSort<K>,
  key: K,
  defaultDir: (k: K) => TableTabSortDir,
): TabParamsPatch {
  const initial = defaultDir(key);
  if (current.sort !== key) {
    return {
      [TABLE_TAB_PARAM.sort]: key,
      [TABLE_TAB_PARAM.dir]: undefined,
    };
  }
  if (current.dir === initial) {
    return {
      [TABLE_TAB_PARAM.sort]: key,
      [TABLE_TAB_PARAM.dir]: initial === 'asc' ? 'desc' : 'asc',
    };
  }
  return { [TABLE_TAB_PARAM.sort]: undefined, [TABLE_TAB_PARAM.dir]: undefined };
}

/** Set an explicit (key, dir) — the `onSortChange` arm, which never cycles. */
export function setTabSortPatch<K extends string>(
  key: K,
  dir: TableTabSortDir,
  defaultDir: (k: K) => TableTabSortDir,
): TabParamsPatch {
  return {
    [TABLE_TAB_PARAM.sort]: key,
    // Only persist a direction that differs from the column's own default, so
    // the common case leaves one key in the bag instead of two and a later
    // change to the column's default is inherited rather than pinned.
    [TABLE_TAB_PARAM.dir]: dir === defaultDir(key) ? undefined : dir,
  };
}

// ── column visibility ───────────────────────────────────────────────────────

/**
 * Separator for the hide delta. `~` cannot appear in a `hideKey` (they are
 * lowercase identifiers — `qty`, `orderid`, `rest`), it needs no escaping in a
 * query string, and unlike `,` it does not read as a list a human might try to
 * paste from a spreadsheet.
 */
const HIDE_SEPARATOR = '~';

/**
 * Per-tab column visibility is a **hide-only DELTA against the staffer's own
 * `staff_preferences` selection**, not an absolute column list.
 *
 * A delta for the same reason `useGridColumnVisibility` stores one: shipping a
 * new column must not widen a tab that was curated months ago, and widening the
 * lean default later must not re-show a track this tab deliberately dropped.
 *
 * **Hide-only, and that is a real limit rather than a simplification.** A tile
 * narrows the column model it mounts, and `LedgerGridSurface` then applies the
 * staffer's `tableColumns[tableId]` delta on top of whatever it was handed. So
 * this tab can REMOVE a track the staff prefs show, and it cannot ADD a track
 * the staff prefs hide — that direction needs the per-instance prefs key
 * (`${TableId}:${instanceId}`) the roadmap describes and the grid stack does not
 * yet type. Offering a `+key` arm here would encode an intent nothing honours.
 */
export function parseTabHiddenColumns(params: TabParams): ReadonlySet<string> {
  const raw = readTabString(params, TABLE_TAB_PARAM.hide);
  if (!raw) return EMPTY_HIDDEN;
  const out = new Set<string>();
  for (const token of raw.split(HIDE_SEPARATOR)) {
    const key = token.trim();
    if (key) out.add(key);
  }
  return out.size > 0 ? out : EMPTY_HIDDEN;
}

const EMPTY_HIDDEN: ReadonlySet<string> = new Set<string>();

/**
 * Encode a hide set back to its param, canonically SORTED so two tabs that hid
 * the same two columns in a different order produce the same string — the same
 * reason `useGridFields` sorts before it persists.
 */
export function formatTabHiddenColumns(hidden: ReadonlySet<string>): TabParamsPatch {
  const keys = [...hidden].filter(Boolean).sort();
  return {
    [TABLE_TAB_PARAM.hide]: keys.length > 0 ? keys.join(HIDE_SEPARATOR) : undefined,
  };
}

/** Flip one `hideKey` on this tab, returning the patch to write. */
export function toggleTabHiddenColumnPatch(
  hidden: ReadonlySet<string>,
  hideKey: string,
): TabParamsPatch {
  const next = new Set(hidden);
  if (next.has(hideKey)) next.delete(hideKey);
  else next.add(hideKey);
  return formatTabHiddenColumns(next);
}

/**
 * Narrow a family's FULL canonical column model by this tab's hide delta.
 *
 * Structural tracks (no `hideKey` — `select`, `title`) are never removable, the
 * same first rule `isGridColumnVisible` applies: a grid with no identity column
 * is not a narrower grid, it is a broken one.
 */
export function applyTabHiddenColumns<C extends LedgerGridColumnModel>(
  columns: readonly C[],
  hidden: ReadonlySet<string>,
): readonly C[] {
  if (hidden.size === 0) return columns;
  const next = columns.filter((c) => !c.hideKey || !hidden.has(c.hideKey));
  // A delta that would empty the grid is a delta from a build where these
  // columns meant something else. Ignore it rather than paint zero tracks.
  return next.length > 0 ? next : columns;
}
