'use client';

import type { ReactNode, RefObject } from 'react';
import {
  LedgerGridSurface,
  type LedgerGridColumnHeaderApi,
  type LedgerGridColumnModel,
} from '@/design-system/components/grid';
import type { RowGroup } from '@/lib/group-rows';
import type { TableId } from '@/lib/tables/table-columns';
import type { TableSurfaceBinding } from './table-surface-binding';

/**
 * `NonlinearTableHost` — mount a Workbench spreadsheet from a **table
 * definition** instead of from a page-local wiring block.
 *
 * Plan: `docs/todo/nonlinear-data-table-engine-PLAN.md` (Phase 1, C1).
 *
 * The engine (`LedgerGridSurface` → `LedgerGrid`) is unchanged and remains the
 * undisputed shell SoT; this host is the thin seam that decides *which grid
 * this is* from the binding rather than from literals typed at the call site.
 * The shell recipe, the prefs bucket, the accessible name, the testid, the
 * day-band default and the column model all come from
 * {@link TableSurfaceBinding.definition}. The caller supplies what is genuinely
 * per-page: the feed, the intents, and the family's renderers.
 *
 * ## What this deliberately does NOT own
 *
 * - **Renderers.** Header / group / row stay render props, resolved by the
 *   family, because a cell is domain code. A host that rendered "any column of
 *   any row" would be the Airtable mega-row the plan kills (candidate 3).
 * - **Sort durability.** `?colsort=`/`?coldir=` vs controlled panes is a page
 *   concern and stays with the binding's view component.
 * - **Chrome.** Bands 1–3, KPI strips and portals belong to the page.
 *
 * ## Why `surface` is not overridable
 *
 * The shell recipe is the one literal that kept drifting per mount, and it is a
 * property of the *definition* (`receiving.browse` IS a flush Sheets plane), not
 * of the page that happens to be showing it. Every other override below exists
 * because a real second mount needs it today — Testing History re-uses this
 * definition under its own prefs bucket (`tableId`), its own testid, and with
 * day bands on.
 */
export interface NonlinearTableHostProps<Row, K extends string, C extends LedgerGridColumnModel> {
  /** Definition + typed columns + descriptor factory for this family. */
  binding: TableSurfaceBinding<Row, C>;

  // ── Definition overrides (a real second mount, never a preference) ──────────
  /**
   * Per-staff prefs identity. Defaults to the definition's `tableId`; Testing
   * History passes `testing` so its Fields selection stays independent of
   * Unbox / History.
   */
  tableId?: TableId;
  /** Outer shell testid. Defaults to the definition's. */
  testId?: string;
  /**
   * Accessible table name. Defaults to the definition's. A genuine per-mount
   * override for a SHARED parametric grid whose lanes name themselves (Orders:
   * "Packed orders" / "Labels queue" / …) — this is instance identity, not the
   * shell recipe, so unlike `surface` it is overridable.
   */
  ariaLabel?: string;
  /** Sticky day bands. Defaults to the definition's. */
  showDayHeaders?: boolean;
  /**
   * Narrowed column model (compare panes). Defaults to the binding's FULL
   * canonical list — never pre-narrow for visibility, which the surface
   * resolves itself.
   */
  columns?: readonly C[];

  // ── Feed ───────────────────────────────────────────────────────────────────
  orderGroupsByDate: [string, RowGroup<Row>[]][];
  rows: Row[];
  getRowId?: (row: Row) => string;
  loading: boolean;
  emptyMessage: string;
  searchEmptyMessage?: string;
  /** Override the dashed teaching box for settled-empty (typed first-run). */
  emptyState?: ReactNode;
  /** Override the dashed teaching box for no-matches. */
  searchEmptyState?: ReactNode;
  isSearching?: boolean;

  // ── Sort (caller owns durability) ──────────────────────────────────────────
  sort: K | null;
  dir: 'asc' | 'desc' | null;
  onSortChange: (key: K, dir: 'asc' | 'desc') => void;

  // ── Family renderers ───────────────────────────────────────────────────────
  renderColumnHeader: (api: LedgerGridColumnHeaderApi<K, C>) => ReactNode;
  renderGroup: (
    group: RowGroup<Row>,
    baseStripeIndex: number,
    api: { columns: readonly C[] },
  ) => ReactNode;
  renderRow: (
    row: Row,
    stripeIndex: number,
    api: { columns: readonly C[] },
    rowIndex?: number,
  ) => ReactNode;

  // ── Grid geometry passthrough (real LedgerGridSurface features) ─────────────
  /**
   * Ephemeral viewport priority-collapse, keyed by column key — never persisted,
   * always beats staff intent. Orders drives this via `useViewportForcedHidden`.
   * A grid feature, not a page leak: the surface's own docblock names Orders as
   * its consumer.
   */
  forceHidden?: ReadonlySet<string>;
  /** Outer-shell ref (Orders observes viewport force-hide against it). */
  shellRef?: RefObject<HTMLDivElement | null>;
  /** Page scroll ancestor — grid virtualizes against it (Pending / To-ship). */
  scrollParentRef?: RefObject<HTMLElement | null>;
  /** Scroll a row into view — deep-link / keyboard focus. */
  scrollToKey?: string | null;

  // ── Page chrome passthrough ────────────────────────────────────────────────
  scrollRef?: RefObject<HTMLDivElement | null>;
  className?: string;
  columnTriggerPortalTarget?: HTMLElement | null;
}

export function NonlinearTableHost<Row, K extends string, C extends LedgerGridColumnModel>({
  binding,
  tableId,
  testId,
  ariaLabel,
  showDayHeaders,
  columns,
  orderGroupsByDate,
  rows,
  getRowId,
  loading,
  emptyMessage,
  searchEmptyMessage,
  emptyState,
  searchEmptyState,
  isSearching,
  sort,
  dir,
  onSortChange,
  renderColumnHeader,
  renderGroup,
  renderRow,
  forceHidden,
  shellRef,
  scrollParentRef,
  scrollToKey,
  scrollRef,
  className,
  columnTriggerPortalTarget = null,
}: NonlinearTableHostProps<Row, K, C>) {
  const { definition } = binding;

  return (
    <LedgerGridSurface<Row, K, C>
      ariaLabel={ariaLabel ?? definition.ariaLabel}
      columns={columns ?? binding.columns}
      makeDescriptor={binding.makeDescriptor}
      orderGroupsByDate={orderGroupsByDate}
      rows={rows}
      getRowId={getRowId}
      sort={sort}
      dir={dir}
      onSortChange={onSortChange}
      loading={loading}
      emptyMessage={emptyMessage}
      searchEmptyMessage={searchEmptyMessage}
      emptyState={emptyState}
      searchEmptyState={searchEmptyState}
      isSearching={isSearching}
      showDayHeaders={showDayHeaders ?? definition.showDayHeaders}
      forceHidden={forceHidden}
      shellRef={shellRef}
      scrollParentRef={scrollParentRef}
      scrollToKey={scrollToKey}
      scrollRef={scrollRef}
      className={className}
      testId={testId ?? definition.testId}
      tableId={tableId ?? definition.tableId}
      surface={definition.surface}
      columnTriggerPortalTarget={columnTriggerPortalTarget}
      renderColumnHeader={renderColumnHeader}
      renderGroup={renderGroup}
      renderRow={renderRow}
    />
  );
}
