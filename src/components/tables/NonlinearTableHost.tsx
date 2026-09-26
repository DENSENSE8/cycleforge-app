'use client';

import type { ReactNode, RefObject } from 'react';
import {
  LedgerGridSurface,
  type LedgerGridColumnHeaderApi,
  type LedgerGridColumnModel,
} from '@/design-system/components/grid';
import type { RowGroup } from '@/lib/group-rows';
import { compoundRowEstimateFor } from './compound/compound-columns';
import type { TableSurfaceBinding } from './table-surface-binding';

/** `NonlinearTableHost` — mount a Workbench spreadsheet from a **table definition** instead of from a page-local wiring block. */
export interface NonlinearTableHostProps<Row, K extends string, C extends LedgerGridColumnModel> {
  /** Definition + typed columns + descriptor factory for this family. */
  binding: TableSurfaceBinding<Row, C>;

  // ── Definition overrides (a real second mount, never a preference) ──────────
  /** Outer shell testid. Defaults to the definition's. */
  testId?: string;
  /** Accessible table name. */
  ariaLabel?: string;
  /** Sticky day bands. Defaults to the definition's. */
  showDayHeaders?: boolean;
  /** Band key → SECTION label (sticky caption + outline). See {@link LedgerGrid}. */
  sectionHeaders?: Record<string, string>;
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
  /** Outer-shell ref (Orders observes viewport force-hide against it). */
  shellRef?: RefObject<HTMLDivElement | null>;
  /** Page scroll ancestor — grid virtualizes against it (Pending / To-ship). */
  scrollParentRef?: RefObject<HTMLElement | null>;
  /** Scroll a row into view — deep-link / keyboard focus. */
  scrollToKey?: string | null;

  // ── Page chrome passthrough ────────────────────────────────────────────────
  scrollRef?: RefObject<HTMLDivElement | null>;
  className?: string;
  bodyPrefix?: ReactNode;
}

export function NonlinearTableHost<Row, K extends string, C extends LedgerGridColumnModel>({
  binding,
  testId,
  ariaLabel,
  showDayHeaders,
  sectionHeaders,
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
  shellRef,
  scrollParentRef,
  scrollToKey,
  scrollRef,
  className,
  bodyPrefix,
}: NonlinearTableHostProps<Row, K, C>) {
  const { definition } = binding;
  const mounted = columns ?? binding.columns;

  return (
    <LedgerGridSurface<Row, K, C>
      ariaLabel={ariaLabel ?? definition.ariaLabel}
      columns={mounted}
      // The row box is a property of the MODEL, not of the mount.
      rowEstimate={compoundRowEstimateFor(mounted)}
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
      sectionHeaders={sectionHeaders}
      shellRef={shellRef}
      scrollParentRef={scrollParentRef}
      scrollToKey={scrollToKey}
      scrollRef={scrollRef}
      className={className}
      testId={testId ?? definition.testId}
      surface={definition.surface}
      renderColumnHeader={renderColumnHeader}
      renderGroup={renderGroup}
      renderRow={renderRow}
      bodyPrefix={bodyPrefix}
    />
  );
}
