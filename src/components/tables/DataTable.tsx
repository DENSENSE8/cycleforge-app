'use client';

/**
 * `DataTable` — the ONE way a table reaches a screen.
 *
 * ```text
 * ┌─────────────────────────────────────────────────────────┐
 * │ [ 🔍 search ]  [ ▽ filter ]                             │  one row, two controls
 * ├──┬──────────────────────────────────────────────────────┤
 * │☑ │ Order      Item              Status      Amount      │  header + select-all
 * ├──┼──────────────────────────────────────────────────────┤
 * │☑ │ 09-69683   Bose Wave …       TESTED      $0.00       │  two-row compound
 * │  │ 76755777   Pack Tuan · Jul 7  64d late               │
 * ├──┴──────────────────────────────────────────────────────┤
 * │ Must ship 99+ · Urgent · Out of stock          82 of 922│  tabs + counts
 * └─────────────────────────────────────────────────────────┘
 * ```
 *
 * It replaces the display layer torn down on 2026-08-29
 * (`docs/todo/one-table-sot-teardown-HANDOFF.md`): `src/components/sheet/`, the
 * `workbench-shell` bands, thirty-odd per-desk `*WorkspaceHeader` forks, the
 * column rail, the formatting toolbar, zoom, fullscreen and the in-cell editors.
 * Those were thirty surfaces that agreed on a data waist and then each drew
 * their own chrome on top of it.
 *
 * ## The rules that keep it one component
 *
 * 1. **One header, drawn once.** No page supplies chrome. A surface supplies its
 *    rows, its columns, its tabs and its filter OPTIONS — data, never JSX. The
 *    column header is drawn here from `binding.columns`; there is no
 *    `renderColumnHeader` prop to fork it with.
 * 2. **No `ReactNode` chrome slots.** The shell this replaces offered `leading`,
 *    `right`, `trailing`, `views`, `extraControls`, `searchSlot` and a controls
 *    portal, which is how thirty desks each drew something different. A props
 *    object of *data* is the difference between one display and thirty.
 *    `renderRow` / `renderGroup` remain render props because a CELL is domain
 *    code (see `table-surface-binding.ts`) — a row is content, not chrome.
 * 3. **The URL stays the state.** Search, filters, the active tab and sort are
 *    controlled by the caller, which parks them in the URL. That is the
 *    deep-link contract every existing bookmark depends on.
 * 4. **Selection is the only interaction.** A checkbox gutter, a select-all and
 *    a count. Copy acts on the selection (below); row-open comes back when it
 *    is asked for.
 * 5. **Borders do not change.** Bottom-only rules through header and body, no
 *    vertical column cage — the grid below is untouched.
 *
 * ## The search field holds text and nothing else
 *
 * No funnel, no chips, no paste button, no inline content. The desk this was
 * rebuilt from had a funnel INSIDE the field and another one beside it — two
 * controls, one job. There is exactly one filter control and it lives outside
 * the field.
 *
 * ## "All" is not a tab
 *
 * `all` is the absence of a filter, not a filter: the unfiltered list is what
 * the table shows when no tab is selected, so a tab for it is a control that
 * means "stop". Pass `activeTab: undefined` for the unfiltered view — do not
 * add an `all` entry to {@link DataTableProps.tabs}.
 *
 * ## Copy acts on a selection
 *
 * Copying every row is something you do TO a selection, so the copy control
 * appears beside the selected count and only once rows are picked — select all
 * in the header gutter, then copy. It is not a permanent toolbar button acting
 * on rows nobody chose. Two clicks from an open table, which keeps it inside
 * the interaction budget (`AGENTS.md`).
 */

import { useCallback, useMemo, useState, type ReactNode, type RefObject } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Filter } from '@/components/Icons';
import { SearchField } from '@/design-system/primitives/SearchField';
import { NonlinearTableHost } from '@/components/tables/NonlinearTableHost';
import type { LedgerGridColumnModel } from '@/design-system/components/grid';
import type { GridSelectGutterChrome } from '@/components/ui/GridRowCheckbox';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import {
  TableStatusBar,
  type DataTableTab,
  type DataTableTabStrip,
} from '@/components/tables/TableStatusBar';
import { useTableSelection } from '@/hooks/useTableSelection';
import type { RowGroup } from '@/lib/group-rows';
import { cornerClass } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

/** One option in the single filter control. Data — the caller owns the meaning. */
export interface DataTableFilterOption {
  id: string;
  label: string;
  /** How many rows carry it. Omit for honest absence — never print a fake 0. */
  count?: number;
  active: boolean;
}

/**
 * The search box, as data. A surface whose search lives on a parent (a table
 * embedded in a workspace that owns the URL) takes this as a prop and forwards
 * it — the field is still drawn once, here.
 */
export interface DataTableSearch {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}


/**
 * How a surface's rows copy out. Declared as DATA so the copy control can act
 * on the selection without the surface handing over a click handler.
 */
export interface DataTableExport<Row> {
  columns: readonly string[];
  toRow: (row: Row) => readonly (string | number | null | undefined)[];
}

export interface DataTableProps<Row, K extends string, C extends LedgerGridColumnModel> {
  /** Definition + typed columns + descriptor factory. The data waist. */
  binding: TableSurfaceBinding<Row, C>;

  // ── Feed ───────────────────────────────────────────────────────────────────
  /**
   * Mounted column model. Defaults to the binding's canonical list; pass the
   * family's COMPOUND (two-row) model to mount that presentation instead — the
   * definition (testid, shell recipe) is untouched, only the model moves.
   */
  columns?: readonly C[];
  rows: Row[];
  /** House grouping / day bands (grouping stays outside TanStack). */
  orderGroupsByDate: [string, RowGroup<Row>[]][];
  getRowId?: (row: Row) => string;
  loading: boolean;
  /** Settled-with-no-rows: teach the next action, do not just say "empty". */
  emptyMessage: string;
  /** Settled-with-no-MATCHES, when search or a filter is narrowing the list. */
  searchEmptyMessage?: string;
  /**
   * Typed first-run empty (`OrdersFirstRunEmptyState`) instead of the dashed
   * teaching box. A settled-state TEACHING surface, not chrome — it answers
   * "what do I do now", which is content the domain owns.
   */
  emptyState?: ReactNode;
  /** Typed no-matches empty (`OrderSearchEmptyState`). */
  searchEmptyState?: ReactNode;

  // ── The one search box (data, not a node) ──────────────────────────────────
  search: DataTableSearch;

  // ── The one filter control (data, not a node) ──────────────────────────────
  filter?: {
    options: readonly DataTableFilterOption[];
    onToggle: (id: string) => void;
    onClearAll: () => void;
  };

  // ── Bottom strip ───────────────────────────────────────────────────────────
  tabs?: readonly DataTableTab[];
  /** `undefined` = the unfiltered list. There is no `all` tab. */
  activeTab?: string;
  onTabChange?: (id: string) => void;
  /**
   * Rows the collection holds before this view's narrowing — prints
   * "shown of total". Omit when the surface only knows what it rendered.
   */
  totalCount?: number;

  // ── Selection ──────────────────────────────────────────────────────────────
  /**
   * Selection scope shared by the rows and the select-all. Omit on a surface
   * whose binding declares `multiSelect: false` — the gutter then paints an
   * inert spacer rather than a checkbox that does nothing.
   */
  selectionScope?: string;
  /** Copy shape for the selection. Omit and no copy control is offered. */
  copyExport?: DataTableExport<Row>;
  /** Select-gutter face. Defaults to the flat `'always'` checklist square. */
  selectGutterChrome?: GridSelectGutterChrome;

  // ── Sort (caller owns durability — it belongs in the URL) ──────────────────
  /**
   * Which header keys offer click-to-sort. Defaults to the descriptor's own
   * `enableSorting` — reading it back is what keeps a header from offering a
   * sort the engine will not perform.
   *
   * A surface overrides it only when its header keys and its sort vocabulary
   * are different alphabets: the compound Orders row is keyed by TRACK while
   * the sort is written in FACTS, and `queueSortForColumnKey` bridges them.
   */
  isSortable?: (key: string) => boolean;
  sort: K | null;
  dir: GridSortDir | null;
  onSortChange: (key: K, dir: 'asc' | 'desc') => void;

  // ── Row rendering (domain code — a cell is not chrome) ─────────────────────
  renderRow: (
    row: Row,
    stripeIndex: number,
    api: { columns: readonly C[] },
    rowIndex?: number,
  ) => ReactNode;
  renderGroup: (
    group: RowGroup<Row>,
    baseStripeIndex: number,
    api: { columns: readonly C[] },
  ) => ReactNode;

  /** Runtime label override (Unbox `stage` → Unboxed / Scanned / Tested). */
  labelFor?: (column: C) => string | undefined;

  // ── Grid geometry passthrough ──────────────────────────────────────────────
  /** Sticky day bands. Defaults to the definition's. */
  showDayHeaders?: boolean;
  /** Outer shell testid; the scroll body gets `${testId}-scroll`. */
  testId?: string;
  shellRef?: RefObject<HTMLDivElement | null>;
  scrollRef?: RefObject<HTMLDivElement | null>;
  scrollParentRef?: RefObject<HTMLElement | null>;
  scrollToKey?: string | null;
  /** Accessible name override for a shared parametric grid. */
  ariaLabel?: string;
  className?: string;
}

/** Serialize a selection as TSV — what a spreadsheet expects off the clipboard. */
function toTsv(
  columns: readonly string[],
  rows: readonly (readonly (string | number | null | undefined)[])[],
): string {
  const cell = (v: string | number | null | undefined) =>
    v == null ? '' : String(v).replace(/[\t\r\n]+/g, ' ');
  return [columns.join('\t'), ...rows.map((r) => r.map(cell).join('\t'))].join('\n');
}

/** The single filter control. Lit and counted — never a bare dot (WCAG 1.4.1). */
function DataTableFilterMenu({
  options,
  onToggle,
  onClearAll,
}: NonNullable<DataTableProps<unknown, string, LedgerGridColumnModel>['filter']>) {
  const [open, setOpen] = useState(false);
  const activeCount = options.filter((o) => o.active).length;
  const hot = activeCount > 0;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          data-testid="data-table-filter"
          aria-label={hot ? `Filters, ${activeCount} active` : 'Filters'}
          aria-pressed={hot}
          aria-expanded={open}
          className={cn(
            'ds-raw-button inline-flex shrink-0 items-center justify-center gap-1 px-1.5 text-role-caption',
            // Colour only. Ops chrome never tweens anything that moves a
            // neighbour (AGENTS.md — no layout animations).
            'transition-colors duration-100 ease-out',
            PRIMARY_CHROME_ROW_FACE,
            cornerClass('flush'),
            focusRing('control'),
            hot
              ? 'bg-blue-600 text-white hover:bg-blue-600'
              : 'text-text-muted hover:bg-surface-hover hover:text-text-default',
          )}
        >
          <Filter className="h-3.5 w-3.5 shrink-0" />
          {hot ? <span className="tabular-nums">{activeCount}</span> : null}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={2}
          data-testid="data-table-filter-menu"
          className={cn(
            'z-dropdown w-60 overflow-hidden rounded-lg border border-border-soft bg-surface-card p-0.5 shadow-md ring-1 ring-black/5',
            focusRing('field', 'accent'),
          )}
        >
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onToggle(option.id)}
              data-testid={`data-table-filter-${option.id}`}
              data-active={option.active ? '' : undefined}
              className={cn(
                'ds-raw-button flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-role-caption',
                focusRing('control'),
                option.active
                  ? 'bg-surface-sunken font-semibold text-text-default'
                  : 'text-text-soft hover:bg-surface-hover hover:text-text-default',
              )}
            >
              <span className="truncate">{option.label}</span>
              {typeof option.count === 'number' ? (
                <span className="shrink-0 tabular-nums text-role-micro text-text-faint">
                  {option.count}
                </span>
              ) : null}
            </button>
          ))}
          {hot ? (
            <>
              <div className="my-0.5 h-px bg-border-soft" aria-hidden />
              <button
                type="button"
                onClick={() => {
                  onClearAll();
                  setOpen(false);
                }}
                data-testid="data-table-filter-clear"
                className={cn(
                  'ds-raw-button w-full rounded px-2 py-1.5 text-left text-role-caption text-text-soft',
                  focusRing('control'),
                  'hover:bg-surface-hover hover:text-text-default',
                )}
              >
                Clear all filters
              </button>
            </>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export type { DataTableTab, DataTableTabStrip };

export function DataTable<Row, K extends string, C extends LedgerGridColumnModel>({
  binding,
  columns,
  rows,
  orderGroupsByDate,
  getRowId,
  loading,
  emptyMessage,
  searchEmptyMessage,
  emptyState,
  searchEmptyState,
  search,
  filter,
  tabs,
  activeTab,
  onTabChange,
  totalCount,
  selectionScope,
  copyExport,
  selectGutterChrome = 'always',
  isSortable,
  sort,
  dir,
  onSortChange,
  labelFor,
  renderRow,
  renderGroup,
  showDayHeaders,
  testId,
  shellRef,
  scrollRef,
  scrollParentRef,
  scrollToKey,
  ariaLabel,
  className,
}: DataTableProps<Row, K, C>) {
  const selectedRows = useTableSelection<Row>(selectionScope ?? '__idle__');
  const selectedCount = selectionScope ? selectedRows.length : 0;

  // Sortability is a property of the DESCRIPTOR, not of the page: TanStack's
  // `enableSorting` is already the surface's sort vocabulary, so reading it back
  // is what keeps a header from offering a sort the engine will not perform.
  const mounted = columns ?? binding.columns;
  const headerLayout = useMemo(() => {
    if (isSortable) return { isSortable };
    const sortable = new Set(
      binding
        .makeDescriptor(mounted)
        .columnDefs.filter((def) => def.enableSorting)
        .map((def) => def.id)
        .filter((id): id is string => typeof id === 'string'),
    );
    return { isSortable: (key: string) => sortable.has(key) };
  }, [binding, mounted, isSortable]);

  const multiSelect = Boolean(selectionScope);

  const renderColumnHeader = useCallback(
    (api: { toggleColumnSort: (key: K) => void; columns: readonly C[] }) => (
      <LedgerGridColumnHeader<C>
        columns={api.columns}
        layout={headerLayout}
        selectMode={multiSelect}
        selectionScope={selectionScope}
        selectGutterChrome={selectGutterChrome}
        activeSort={sort}
        sortDir={dir}
        onSortColumn={(key) => api.toggleColumnSort(key as K)}
        labelFor={labelFor}
      />
    ),
    [headerLayout, multiSelect, selectionScope, selectGutterChrome, sort, dir, labelFor],
  );

  const onCopySelection = useCallback(() => {
    if (!copyExport || selectedCount === 0) return;
    const tsv = toTsv(copyExport.columns, selectedRows.map((row) => copyExport.toRow(row)));
    void navigator.clipboard?.writeText(tsv);
  }, [copyExport, selectedRows, selectedCount]);

  const isNarrowed = Boolean(search.value) || Boolean(filter?.options.some((o) => o.active));

  return (
    <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col', className)}>
      {/* ── One row, two controls ──────────────────────────────────────────── */}
      <div
        data-testid="data-table-toolbar"
        className={cn(
          'flex min-w-0 items-center gap-2 border-b border-border-soft bg-surface-card px-2',
          PRIMARY_CHROME_ROW_FACE,
        )}
      >
        <SearchField
          value={search.value}
          onChange={search.onChange}
          placeholder={search.placeholder ?? 'Search'}
          className="min-w-0 max-w-[22rem] flex-1"
          tone="neutral"
          hideUnderline
          fillHost
        />
        {filter ? <DataTableFilterMenu {...filter} /> : null}
      </div>

      {/* ── The grid ───────────────────────────────────────────────────────── */}
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <NonlinearTableHost<Row, K, C>
          binding={binding}
          ariaLabel={ariaLabel}
          columns={mounted}
          testId={testId}
          showDayHeaders={showDayHeaders}
          shellRef={shellRef}
          rows={rows}
          orderGroupsByDate={orderGroupsByDate}
          getRowId={getRowId}
          loading={loading}
          emptyMessage={emptyMessage}
          searchEmptyMessage={searchEmptyMessage}
          emptyState={emptyState}
          searchEmptyState={searchEmptyState}
          isSearching={isNarrowed}
          sort={sort}
          dir={dir}
          onSortChange={onSortChange}
          renderColumnHeader={renderColumnHeader}
          renderGroup={renderGroup}
          renderRow={renderRow}
          scrollRef={scrollRef}
          scrollParentRef={scrollParentRef}
          scrollToKey={scrollToKey}
        />
      </div>

      <TableStatusBar
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={onTabChange}
        shown={rows.length}
        total={totalCount}
        selected={selectedCount}
        onCopySelection={copyExport ? onCopySelection : undefined}
      />
    </div>
  );
}
