'use client';

/**
 * `useGridColumnVisibility` — the ONE place a Workbench spreadsheet decides
 * which column tracks exist.
 *
 * Before this hook there were two visibility systems at two different
 * granularities, and they did not know about each other:
 *
 *   TanStack `columnVisibility`  → grid TRACK  → the column disappears
 *   `useIsColumnHidden()`        → chip/meta SLOT inside a cell → the track
 *                                  survives and renders an empty ruled stripe
 *
 * That is why hiding a column used to leave a dead vertical band, and why the
 * header, the body rows, and the group summary each re-derived "is this hidden?"
 * on their own (and drifted). Every grid family now resolves its columns HERE,
 * once, and passes the resolved list down — so geometry (`*GridTemplate`,
 * `contentMinWidthRem`), the sticky header, the rows, and the group summaries
 * are mathematically incapable of disagreeing.
 *
 * `useIsColumnHidden` is NOT retired globally — it still serves the legacy
 * `ChipColumns` / `RowMetaColumns` row primitives used by ~50 non-grid surfaces
 * (boards, station rows, rails). It is retired from the six grid families only.
 *
 * ## Resolution order (first match wins)
 *
 * 1. **Structural** — a column with no `hideKey` is never hideable.
 * 2. **Force-hide** — ephemeral viewport collapse (keyed by column KEY). Never
 *    persisted, always wins over staff intent: a track that cannot fit must go.
 * 3. **Staff delta** — `staff_preferences.tableColumns[tableId]` (keyed by
 *    `hideKey`): `optional` columns are OFF unless listed in `shown`; `core`
 *    columns are ON unless listed in `hidden`.
 *
 * Storing a DELTA (not an absolute list) is the point: shipping a new
 * `optional` column never widens anyone's grid unasked, and widening the lean
 * default later never re-shows a track a staffer deliberately curated away.
 */

import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { VisibilityState } from '@tanstack/react-table';
import { useStaffPreferences, STAFF_PREFERENCES_QUERY_KEY } from '@/hooks/useStaffPreferences';
import type { StaffPreferences } from '@/lib/neon/staff-preferences-queries';
import type { TableId } from '@/lib/tables/table-columns';
import type { LedgerGridColumnModel } from './grid-surface-descriptor';

/** Persisted opt-out / opt-in delta for one table, keyed by `hideKey`. */
interface GridColumnDelta {
  hidden?: readonly string[];
  shown?: readonly string[];
}

const EMPTY_DELTA: GridColumnDelta = {};
const EMPTY_FORCED: ReadonlySet<string> = new Set();

/**
 * Is this column visible? The single rule — pure, so the guard test and the
 * Fields menu can both ask without mounting React.
 */
export function isGridColumnVisible(
  column: LedgerGridColumnModel,
  delta: GridColumnDelta = EMPTY_DELTA,
  forceHidden: ReadonlySet<string> = EMPTY_FORCED,
): boolean {
  // 1. Structural tracks (select · title · anything without a pref key).
  if (!column.hideKey) return true;
  // 2. Ephemeral viewport collapse beats staff intent — it cannot fit.
  if (forceHidden.has(column.key)) return false;
  // 3. Staff delta against the descriptor's default tier.
  return column.tier === 'optional'
    ? (delta.shown ?? []).includes(column.hideKey)
    : !(delta.hidden ?? []).includes(column.hideKey);
}

/** Resolve a column list to the tracks that actually render, in canonical order. */
export function resolveGridColumns<C extends LedgerGridColumnModel>(
  columns: readonly C[],
  delta: GridColumnDelta = EMPTY_DELTA,
  forceHidden: ReadonlySet<string> = EMPTY_FORCED,
): C[] {
  return columns.filter((c) => isGridColumnVisible(c, delta, forceHidden));
}

interface UseGridColumnVisibilityOptions<C extends LedgerGridColumnModel> {
  /** The descriptor's FULL canonical column list (never pre-filtered). */
  columns: readonly C[];
  /**
   * Staff-prefs identity. Omit for a grid with no per-staff config yet — the
   * hook then resolves descriptor defaults only and stays a pure function of
   * `columns` + `forceHidden`.
   */
  tableId?: TableId;
  /** Ephemeral viewport collapse, keyed by column KEY. Never persisted. */
  forceHidden?: ReadonlySet<string>;
}

interface GridColumnVisibility<C extends LedgerGridColumnModel> {
  /** Visible tracks in canonical order — feed geometry, header, rows, summaries. */
  columns: C[];
  /**
   * Mirror for `useGridSurface` so TanStack still holds the state of record.
   * Only false entries appear; unknown ids default to visible in TanStack.
   */
  columnVisibility: VisibilityState;
}

/**
 * Resolve one grid's visible column tracks from descriptor defaults + staff
 * prefs + ephemeral viewport collapse.
 *
 * Standalone (no provider) — reads `staff_preferences` directly by `tableId`.
 * That is deliberate: the Dashboard grid never had a `TableColumnConfigProvider`
 * mounted, so a provider-based API would have silently no-op'd there.
 */
export function useGridColumnVisibility<C extends LedgerGridColumnModel>({
  columns,
  tableId,
  forceHidden,
}: UseGridColumnVisibilityOptions<C>): GridColumnVisibility<C> {
  const { prefs } = useStaffPreferences();
  const stored = tableId ? prefs?.tableColumns?.[tableId] : undefined;

  // Memo by CONTENT, not array identity — the prefs bag is rebuilt on every
  // cache write, and an identity-keyed memo would re-render every row of a
  // virtualized grid on unrelated preference changes.
  const hiddenKey = [...(stored?.hidden ?? [])].sort().join('\0');
  const shownKey = [...(stored?.shown ?? [])].sort().join('\0');
  const forcedKey = [...(forceHidden ?? EMPTY_FORCED)].sort().join('\0');
  const columnsKey = columns.map((c) => c.key).join('\0');

  return useMemo(() => {
    const delta: GridColumnDelta = {
      hidden: hiddenKey ? hiddenKey.split('\0') : [],
      shown: shownKey ? shownKey.split('\0') : [],
    };
    const forced = forcedKey ? new Set(forcedKey.split('\0')) : EMPTY_FORCED;
    const visible = resolveGridColumns(columns, delta, forced);

    const visibleKeys = new Set(visible.map((c) => c.key));
    const columnVisibility: VisibilityState = {};
    for (const c of columns) {
      if (!visibleKeys.has(c.key)) columnVisibility[c.key] = false;
    }
    return { columns: visible, columnVisibility };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on content, not identity
  }, [columnsKey, hiddenKey, shownKey, forcedKey]);
}

/** One toggleable row in the Fields menu. */
interface GridField {
  /** Pref key (`hideKey`) — the unit a staffer toggles. */
  key: string;
  label: string;
  visible: boolean;
  /** `optional` fields are off by default (opt-in); `core` are on (opt-out). */
  tier: 'core' | 'optional';
}

interface GridFields {
  fields: GridField[];
  /** Toggle one field on/off; writes the delta optimistically, then persists. */
  setFieldVisible: (key: string, visible: boolean) => void;
  /** Clear this table's delta back to the descriptor default. */
  reset: () => void;
  /** How many fields differ from the descriptor default (0 = pristine). */
  dirtyCount: number;
}

/**
 * The Fields menu's data source — generated from the descriptor, never from a
 * hand-maintained per-surface list. A column is offered iff it carries a
 * `hideKey`; `select` / `title` have none and so can never be turned off.
 *
 * Writes follow the house optimistic pattern (cache write once → background
 * PUT → roll back on failure) and preserve sibling `order` / `widths`, because
 * the JSONB merge is shallow at `tableColumns`.
 */
export function useGridFields<C extends LedgerGridColumnModel>(
  tableId: TableId,
  columns: readonly C[],
): GridFields {
  const { prefs } = useStaffPreferences();
  const queryClient = useQueryClient();
  const stored = prefs?.tableColumns?.[tableId];

  const hiddenKey = [...(stored?.hidden ?? [])].sort().join('\0');
  const shownKey = [...(stored?.shown ?? [])].sort().join('\0');
  const columnsKey = columns.map((c) => `${c.key}:${c.hideKey ?? ''}:${c.tier ?? 'core'}`).join('\0');

  const fields = useMemo<GridField[]>(() => {
    const delta: GridColumnDelta = {
      hidden: hiddenKey ? hiddenKey.split('\0') : [],
      shown: shownKey ? shownKey.split('\0') : [],
    };
    const seen = new Set<string>();
    const out: GridField[] = [];
    for (const c of columns) {
      // Several tracks may answer to one pref key (e.g. `rest`) — offer it once.
      if (!c.hideKey || seen.has(c.hideKey)) continue;
      seen.add(c.hideKey);
      out.push({
        key: c.hideKey,
        label: c.label ?? c.gridLabel ?? c.key,
        // Force-hide is deliberately NOT applied here: the menu shows staff
        // INTENT, not the current viewport. A narrow window must not read back
        // as "the staffer turned this off".
        visible: isGridColumnVisible(c, delta),
        tier: c.tier ?? 'core',
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on content, not identity
  }, [columnsKey, hiddenKey, shownKey]);

  const writeDelta = useCallback(
    async (next: { hidden: string[]; shown: string[] }) => {
      const prev = queryClient.getQueryData<StaffPreferences>(STAFF_PREFERENCES_QUERY_KEY) ?? {};
      // Canonical (sorted) so membership is order-independent and two rapid
      // toggles can never produce a different value for the same set.
      const nextTableColumns = {
        ...(prev.tableColumns ?? {}),
        [tableId]: {
          ...prev.tableColumns?.[tableId],
          hidden: [...next.hidden].sort(),
          shown: [...next.shown].sort(),
        },
      };
      const optimistic: StaffPreferences = { ...prev, tableColumns: nextTableColumns };
      queryClient.setQueryData(STAFF_PREFERENCES_QUERY_KEY, optimistic);
      try {
        const res = await fetch('/api/staff-preferences', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tableColumns: nextTableColumns }),
        });
        if (!res.ok) throw new Error(`staff-preferences PUT ${res.status}`);
        // Consume but do NOT echo into the cache — the optimistic value is
        // already what the server accepted, and echoing can regress a rapid
        // follow-up toggle to an older snapshot.
        await res.json().catch(() => null);
      } catch {
        queryClient.setQueryData(STAFF_PREFERENCES_QUERY_KEY, prev); // rollback
      }
    },
    [queryClient, tableId],
  );

  const setFieldVisible = useCallback(
    (key: string, visible: boolean) => {
      const cur = queryClient.getQueryData<StaffPreferences>(STAFF_PREFERENCES_QUERY_KEY) ?? {};
      const curEntry = cur.tableColumns?.[tableId];
      const hidden = new Set(curEntry?.hidden ?? []);
      const shown = new Set(curEntry?.shown ?? []);
      // A key is only ever in ONE list — whichever expresses "differs from the
      // default". Keeping both would make the delta ambiguous if the column's
      // tier is later changed in the descriptor.
      const tier = columns.find((c) => c.hideKey === key)?.tier ?? 'core';
      if (tier === 'optional') {
        hidden.delete(key);
        if (visible) shown.add(key);
        else shown.delete(key);
      } else {
        shown.delete(key);
        if (visible) hidden.delete(key);
        else hidden.add(key);
      }
      void writeDelta({ hidden: [...hidden], shown: [...shown] });
    },
    [queryClient, tableId, columns, writeDelta],
  );

  const reset = useCallback(() => void writeDelta({ hidden: [], shown: [] }), [writeDelta]);

  const dirtyCount = useMemo(
    () => fields.filter((f) => f.visible !== (f.tier === 'core')).length,
    [fields],
  );

  return { fields, setFieldVisible, reset, dirtyCount };
}
