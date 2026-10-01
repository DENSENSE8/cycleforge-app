'use client';

/** **The generic compound spreadsheet feed** — the engine half of a compound {@link DataTable} mount, for any family. */

import { useCallback, useMemo, useRef, type ReactNode } from 'react';
import { CompoundPlaneRow } from '@/components/tables/compound/CompoundPlaneRow';
import { compoundRowActivationProps } from '@/components/tables/compound/compound-row-activation';
import type { DataTableProps, DataTableSearch } from '@/components/tables/DataTable';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { dataTableSubtitleFieldIds } from '@/components/tables/data-table-row-metadata';
import type {
  CompoundRowAction,
  CompoundRowAdapter,
  CompoundRowView,
  CompoundSlotValue,
} from '@/components/tables/compound/compound-row-model';
import type { GridSurfaceCapabilities } from '@/design-system/components/grid';
import { compareGridValues } from '@/design-system/components/grid';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import { singleBand, type RowGroup } from '@/lib/group-rows';
import type { DataTableColumnFields } from '@/lib/tables/materialize-tracks';
import { dataTableSubtitlePartsFor, type LineQtyMeaning } from '@/lib/tables/data-table-line-qty';
import { dataTableSearchFactIds } from '@/lib/tables/data-table-search-vocabulary';

/**
 * Structural shape of a mounted compound column. Every family's column
 * interface already satisfies it — typing against a concrete family model is
 * what this hook exists to avoid.
 */
export interface CompoundSpreadsheetColumn extends DataTableColumnFields {
  key: string;
  width: string;
  label?: string;
  frozen?: boolean;
  hideKey?: string;
  sortable?: boolean;
}

export interface UseCompoundSpreadsheetOptions<
  Row,
  K extends string,
  C extends CompoundSpreadsheetColumn,
> {
  /** Definition + descriptor factory — the family's registry line, by reference. */
  binding: TableSurfaceBinding<Row, C>;
  /** Mounted columns; direct bindings normally pass `binding.columns`. */
  columns: readonly C[];
  rows: readonly Row[];
  getRowId: (row: Row) => string;
  /** The family's pure `row → CompoundRowView` adapter. */
  adapter: CompoundRowAdapter<Row>;
  /**
   * What the line qty MEANS here, which decides its tone. Defaults to
   * `order-line` (2+ warns — the pick-and-pack risk every outbound peer
   * paints); an on-hand count passes `on-hand` and stays quiet at every value.
   */
  lineQtyMeaning?: LineQtyMeaning;
  /**
   * Facts the family's ADAPTER paints that no track names — see
   * {@link dataTableSearchFactIds}. The Id track's second line
   * (`identitySubFace`) is the case this exists for.
   */
  adapterPaintedFieldIds?: readonly string[];
  /** `(row, fieldId) → resolved fact`. */
  resolve: (row: Row, fieldId: string) => CompoundSlotValue | null;
  /**
   * The FACT a column sorts by, or `null` where it offers none (a transition is
   * two values and sorting it compares whichever end came first). The rule
   * lives on the fact, so a rebind carries it.
   */
  sortFactFor: (col: C) => string | null;
  capabilities: GridSurfaceCapabilities;
  /** Caller-owned, URL-durable. See the docblock — never pass a constant. */
  sort: K | null;
  dir: GridSortDir | null;
  onSortChange: (key: K, dir: 'asc' | 'desc') => void;
  search: DataTableSearch;
  /** Page-owned finds filter rows here but paint only in contextual navigation. */
  findOwner?: 'page' | 'sheet';
  loading: boolean;
  emptyMessage: string;
  ariaLabel?: string;
  className?: string;
  /** Present ⇒ the title hover carries "Open" and the row reports the click. */
  onOpenRow?: (row: Row) => void;
  /** The family's row VERBS, resolved per row. */
  rowActions?: (row: Row) => readonly CompoundRowAction[];
  selectionScope?: string;
  /** The row SELECTION, when the family's capabilities declare `multiSelect`. */
  selection?: {
    isSelected: (row: Row) => boolean;
    /** Receives the click's modifier state, so a family can offer a range walk. */
    onToggle: (row: Row, event: { shiftKey: boolean }) => void;
  };
  /** Which BAND a row belongs to — the key {@link sectionHeaders} captions. */
  bandBy?: (row: Row) => string;
  /** Band key → section caption, forwarded straight onto the feed so `<DataTable {...sheet} />` carries it with no call-site plumbing. */
  sectionHeaders?: Record<string, string>;
}

/**
 * The feed bag for {@link DataTable}. The chrome half (tabs, filter facets,
 * totals, copy) stays with the page, which is the only place that knows the URL
 * those controls write to — the same split `useOrdersSpreadsheet` returns.
 */
export type CompoundSpreadsheetFeed<Row, K extends string, C extends CompoundSpreadsheetColumn> =
  Omit<
    DataTableProps<Row, K, C>,
    'filter' | 'tabs' | 'activeTab' | 'onTabChange' | 'totalCount' | 'copyExport'
  >;

/** Resolved display text for one fact, or `''` when the row has nothing to say. */
function factText<Row>(
  resolve: (row: Row, fieldId: string) => CompoundSlotValue | null,
  row: Row,
  fieldId: string,
): string {
  const value = resolve(row, fieldId);
  if (!value) return '';
  if (value.kind === 'value') return value.text ?? '';
  if (value.kind === 'person') return value.name ?? '';
  // A stage step's searchable text is who did it and where — the parts the
  // operator can actually read off the cell.
  return [value.who, value.at, value.station].filter(Boolean).join(' ');
}

/** Lift an already-sorted row list into the grouped render order, banded. */
export function bandCompoundRows<Row>(
  rows: readonly Row[],
  bandBy?: (row: Row) => string,
): [string, RowGroup<Row>[]][] {
  if (!bandBy) return singleBand(rows) as [string, RowGroup<Row>[]][];
  const order: string[] = [];
  const byBand = new Map<string, RowGroup<Row>[]>();
  rows.forEach((row, index) => {
    const bandKey = bandBy(row);
    let groups = byBand.get(bandKey);
    if (!groups) {
      groups = [];
      byBand.set(bandKey, groups);
      order.push(bandKey);
    }
    groups.push({ key: `#${index}`, rows: [row] });
  });
  return order.map((bandKey) => [bandKey, byBand.get(bandKey) as RowGroup<Row>[]]);
}

export function useCompoundSpreadsheet<
  Row,
  K extends string,
  C extends CompoundSpreadsheetColumn,
>({
  binding,
  columns,
  rows,
  getRowId,
  adapter,
  lineQtyMeaning,
  adapterPaintedFieldIds,
  resolve,
  sortFactFor,
  capabilities,
  sort,
  dir,
  onSortChange,
  search,
  findOwner = 'sheet',
  loading,
  emptyMessage,
  ariaLabel,
  className,
  onOpenRow,
  rowActions,
  selectionScope,
  selection,
  bandBy,
  sectionHeaders,
}: UseCompoundSpreadsheetOptions<Row, K, C>): CompoundSpreadsheetFeed<Row, K, C> {
  const shellRef = useRef<HTMLDivElement>(null);
  const subtitleFieldIds = binding.definition
    ? dataTableSubtitleFieldIds(binding.definition.tableId)
    : [];

  /** The gutter control, or `null`. */
  const rowSelect =
    capabilities.multiSelect === true && selection ? selection : null;

  const sortFactByKey = useMemo(
    () => new Map<string, string | null>(columns.map((c) => [c.key, sortFactFor(c)])),
    [columns, sortFactFor],
  );

  /** Every fact the operator can READ off a row — bound tracks ∪ the structural facts the chrome tracks paint ∪ the under-title band. */
  const searchFactIds = useMemo(
    () =>
      dataTableSearchFactIds({
        columns,
        sortFactFor,
        subtitleFieldIds,
        adapterPaintedFieldIds,
      }),
    [columns, sortFactFor, subtitleFieldIds, adapterPaintedFieldIds],
  );

  /** The one search box: */
  const filtered = useMemo(() => {
    if (search.answeredBy === 'server') return [...rows];
    const q = search.value.trim().toLowerCase();
    if (!q) return [...rows];
    return rows.filter((row) =>
      searchFactIds.some((fact) => factText(resolve, row, fact).toLowerCase().includes(q)),
    );
  }, [rows, search.answeredBy, search.value, searchFactIds, resolve]);

  /** Order by the SORTED FACT, never by the column key: */
  const sorted = useMemo(() => {
    const fact = sort ? (sortFactByKey.get(sort) ?? null) : null;
    if (!fact || !dir) return filtered;
    const type = columns.find((c) => c.key === sort)?.slotDisplayType;
    return [...filtered].sort((a, b) =>
      compareGridValues(factText(resolve, a, fact), factText(resolve, b, fact), {
        type,
        dir,
      }),
    );
  }, [filtered, sort, dir, sortFactByKey, columns, resolve]);

  const groups = useMemo(() => bandCompoundRows(sorted, bandBy), [sorted, bandBy]);

  /** One row, on the shared {@link CompoundRow}. */
  const paintRow = useCallback(
    (row: Row, visible: readonly C[]): ReactNode => {
      const activate = onOpenRow ? () => onOpenRow(row) : undefined;
      const adapted = adapter(row);
      const subtitleParts =
        adapted.subtitleParts ??
        (subtitleFieldIds && subtitleFieldIds.length > 0
          ? dataTableSubtitlePartsFor(
              subtitleFieldIds,
              (fieldId) => resolve(row, fieldId),
              lineQtyMeaning,
            )
          : undefined);
      const view: CompoundRowView = {
        ...adapted,
        ...(subtitleParts ? { subtitleParts } : null),
        slots: Object.fromEntries(
          visible
            .filter((c) => Boolean(c.fieldId))
            .map((c) => [c.key, resolve(row, c.fieldId as string) ?? { kind: 'value', text: null }]),
        ),
      };
      return (
        <CompoundPlaneRow<Row, C>
          key={getRowId(row)}
          row={row}
          // The ENTITY's plane, straight off its registration. A page cannot
          // introduce one and two lanes of the same entity cannot disagree
          // about what picking a row opens.
          rowPlane={binding.rowPlane}
          columns={visible}
          capabilities={capabilities}
          selected={rowSelect ? rowSelect.isSelected(row) : false}
          view={view}
          onOpen={activate}
          {...compoundRowActivationProps({
            onActivate: activate,
            multiSelect: capabilities.multiSelect === true,
          })}
          select={
            rowSelect
              ? {
                  checked: rowSelect.isSelected(row),
                  onToggle: (event) => rowSelect.onToggle(row, event),
                  label: rowSelect.isSelected(row) ? 'Deselect row' : 'Select row',
                }
              : undefined
          }
          actions={rowActions?.(row)}
        />
      );
    },
    [
      adapter,
      subtitleFieldIds,
      lineQtyMeaning,
      resolve,
      getRowId,
      capabilities,
      rowSelect,
      onOpenRow,
      rowActions,
      binding.rowPlane,
    ],
  );

  return {
    binding,
    columns,
    rows: sorted,
    getRowId,
    orderGroupsByDate: groups,
    sectionHeaders,
    loading,
    emptyMessage,
    sheetFind: findOwner === 'sheet' ? search : undefined,
    sort,
    dir,
    onSortChange,
    // Every painted data header sorts by the fact declared by its column.
    isSortable: (key: string) => (sortFactByKey.get(key) ?? null) !== null,
    ariaLabel,
    className,
    shellRef,
    selectionScope,
    renderGroup: (group, _stripe, { columns: visible }) => (
      <>{group.rows.map((row) => paintRow(row, visible))}</>
    ),
    renderRow: (row, _stripe, { columns: visible }) => paintRow(row, visible),
  };
}
