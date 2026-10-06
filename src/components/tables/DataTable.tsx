'use client';

/**
 * `DataTable` — the ONE way a table reaches a screen.
 * ## Selection tabs are FILTERS (operator ruling 2026-08-30)
 */

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/design-system/primitives/radix-popover';
import { ChevronDown, Download, Filter } from '@/components/Icons';
import { Button, SearchField } from '@/design-system/primitives';
import { DeskRecordViewSwitch } from '@/design-system/components/DeskRecordViewSwitch';
import { DataTableZoomToggle } from '@/components/tables/DataTableZoomToggle';
import { DeskActionSlotRegistrar, DeskHeaderAction } from '@/design-system/components/DeskActionSlot';
import { useDeskStageOptional } from '@/design-system/components/DeskStageContext';
import { DESK_RECORD_ANCHOR_ATTR } from '@/design-system/components/DeskRecordPlane';
import { NonlinearTableHost } from '@/components/tables/NonlinearTableHost';
import {
  EXPORT_FORMATS,
  serializeRows,
} from '@/lib/tables/export/serialize';
import { exportSpecFromColumns } from '@/lib/tables/export/export-fields';
import { DataTableExportMenu } from '@/components/tables/DataTableExportMenu';
import { useExportFieldChoice } from '@/hooks/useExportFieldChoice';
import { LedgerGridColumnHeader } from '@/design-system/components/grid/LedgerGridColumnHeader';
import type { LedgerGridColumnModel } from '@/design-system/components/grid';
import type { GridSelectGutterChrome } from '@/components/ui/GridRowCheckbox';
import type { GridSortDir } from '@/design-system/components/grid/grid-sort-dir';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import { TableStatusBar, type DataTableTab } from '@/components/tables/TableStatusBar';
import { useTableSelection } from '@/hooks/useTableSelection';
import { flattenRenderOrder, type RowGroup } from '@/lib/group-rows';
import {
  DATA_TABLE_PAGE_SIZE,
  DATA_TABLE_PAGE_SIZES,
  isDataTablePageSize,
  pageGroupedRenderOrder,
  pageIndexForRowId,
  readDataTablePageSize,
  writeDataTablePageSize,
  type DataTablePageSize,
  type DataTableRowNoun,
} from '@/lib/tables/data-table-pagination';
import {
  clearDataTableVisibleIds,
  publishDataTableVisibleIds,
  type DataTableRowId,
} from '@/lib/tables/data-table-visible-rows';
import { emitSelectionTotal } from '@/lib/selection/table-selection';
import { MenuBrandIdentity } from '@/components/ui/grid-cells';
import { ToolbarListboxOption } from '@/design-system/primitives/ToolbarListbox';
import {
  DATA_TABLE_TOOLBAR_CORNER,
  DROPDOWN_ITEM_CORNER,
  DROPDOWN_SHELL_CORNER,
} from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { DESK_TABLE_SURFACE_CLASS } from '@/design-system/tokens/desk-stage';
import {
  DATA_TABLE_ACTION_ROW_ATTR,
  DATA_TABLE_OVERLAY_HOST_ATTR,
} from '@/components/tables/data-table-overlay-host';
import { cn } from '@/utils/_cn';

/** One option in the single filter control. Data — the caller owns the meaning. */
export interface DataTableFilterOption {
  id: string;
  label: string;
  /** How many rows carry it. Omit for honest absence — never print a fake 0. */
  count?: number;
  active: boolean;
  /** Which QUESTION this option answers, as a heading. */
  group?: string;
  /**
   * Platform / carrier paint — data, never a ReactNode. DataTable mounts
   * {@link MenuBrandIdentity} so Amazon is the same orange filled dot as the
   * Order column, USPS the same tracking ring.
   */
  identity?: DataTableBrandIdentity;
}

/** The one funnel beside search — options as DATA, never JSX. */
export type DataTableFilterChrome = {
  options: readonly DataTableFilterOption[];
  onToggle: (id: string) => void;
  onClearAll: () => void;
};

/** One job verb on the LEFT toolbar cluster — data, never a ReactNode slot. */
export type DataTableToolbarAction = {
  id: string;
  label: string;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  busy?: boolean;
  testId?: string;
  onClick?: () => void;
  paste?: {
    placeholder: string;
    onCommit: (value: string) => void | Promise<void>;
  };
};

/** Brand swatch for a menu row — resolved by {@link MenuBrandIdentity}. */
export interface DataTableBrandIdentity {
  kind: 'platform' | 'carrier';
  label: string;
  value?: string;
}

/** Export the CURRENT view to a CSV file. */
/* `DataTableExportButton` was DELETED with the configurable export (2026-09-02). */


/**
 * How a surface's rows copy out. Declared as DATA so the copy control can act
 * on the selection without the surface handing over a click handler.
 */
export interface DataTableExport<Row> {
  columns: readonly string[];
  toRow: (row: Row) => readonly (string | number | null | undefined)[];
}

/** @deprecated Field menus were removed; retained only while callers drain the prop. */
export type DataTableFieldsMenuData = unknown;

export interface DataTableProps<Row, K extends string, C extends LedgerGridColumnModel> {
  /** Definition + typed columns + descriptor factory. The data waist. */
  binding: TableSurfaceBinding<Row, C>;

  /** Compact surfaces can keep their own controls without forking the grid. */
  hideToolbar?: boolean;

  // ── Feed ───────────────────────────────────────────────────────────────────
  /** Mounted column model. Defaults to the binding's canonical list. */
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

  /**
   * True while page chrome (the contextual sidebar's find / facets — ruling
   * A1: record selection never lives in this toolbar) narrows `rows`, so an
   * empty settle reads {@link searchEmptyMessage} instead of "empty".
   */
  isNarrowed?: boolean;

  /**
   * Job verbs in the LEFT cluster after filter. Omit when the desk has none —
   * the funnel still paints. Never a ReactNode; DataTable draws the buttons
   * (and the paste morph) from this list.
   */
  actions?: readonly DataTableToolbarAction[];

  /** @deprecated Configurable field menus were deleted; this prop is ignored. */
  fields?: DataTableFieldsMenuData;


  // ── Bottom strip ───────────────────────────────────────────────────────────
  tabs?: readonly DataTableTab[];
  /** `undefined` = the unfiltered list. There is no `all` tab. */
  activeTab?: string;
  onTabChange?: (id: string) => void;
  /**
   * Rows behind the CURRENT narrowing — prints "shown of total". Omit when no
   * single number honestly describes the filtered set, and the bar prints the
   * row count alone rather than a denominator for a different question.
   */
  totalCount?: number;
  /**
   * The next page, drawn inside the status bar's count sentence. A surface that
   * pages passes this instead of stacking its own "Showing N of M" band under
   * the table — see {@link TableStatusBarProps.onLoadMore}.
   */
  onLoadMore?: () => void;
  // Selection VERBS are not a table prop.
  /** Drag a column header onto another to reorder. */
  onReorderColumn?: (dragKey: string, dropKey: string) => void;
  /** Commit a drag-resized column width in px. Omit and headers do not resize. */
  onResizeColumn?: (key: string, widthPx: number) => void;
  /** Freeze through a column from its header (see `useSheetColumns`). Omit and headers carry no pin. */
  onFreezeColumn?: (key: string) => void;
  /**
   * A sheet that scrolls every row instead of paging (the Pasted list —
   * owner 2026-10-04). The grid virtualizes, so a few hundred rows cost the
   * same as a page.
   */
  unpaged?: boolean;
  /** What the footer calls the rows ("purchases"); default "rows". */
  rowNoun?: DataTableRowNoun;
  /** Filename for the CSV export button. Defaults to `export.csv`. */
  exportFilename?: string;

  // ── Selection ──────────────────────────────────────────────────────────────
  /**
   * Selection scope shared by the rows and the select-all. Omit on a surface
   * whose binding declares `multiSelect: false` — the gutter then paints an
   * inert spacer rather than a checkbox that does nothing.
   */
  selectionScope?: string;
  /** Copy/export shape. */
  copyExport?: DataTableExport<Row>;
  /** Where the view-export control paints. */
  copyExportPlacement?: 'header' | 'menu';
  /** Select-gutter face. Defaults to the flat `'always'` checklist square. */
  selectGutterChrome?: GridSelectGutterChrome;

  // ── Sort (caller owns durability — it belongs in the URL) ──────────────────
  /** Which header keys offer click-to-sort. */
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
    /** Absolute ARIA index of the group's first leaf — the same stream `renderRow` gets. */
    rowIndex?: number,
  ) => ReactNode;

  /** Runtime label override (Unbox `stage` → Unboxed / Scanned / Tested). */
  labelFor?: (column: C) => string | undefined;

  // ── Grid geometry passthrough ──────────────────────────────────────────────
  /** Sticky day bands. Defaults to the definition's. */
  showDayHeaders?: boolean;
  /** Band key → SECTION label (sticky caption + outline). See {@link LedgerGrid}. */
  sectionHeaders?: Record<string, string>;
  /** Outer shell testid; the scroll body gets `${testId}-scroll`. */
  testId?: string;
  shellRef?: RefObject<HTMLDivElement | null>;
  scrollRef?: RefObject<HTMLDivElement | null>;
  scrollParentRef?: RefObject<HTMLElement | null>;
  scrollToKey?: string | null;
  /** Accessible name override for a shared parametric grid. */
  ariaLabel?: string;
  className?: string;
  /**
   * Domain content painted under the column header, inside the scroll body
   * (Incoming PO intake). Not chrome — never search/filter/sort.
   */
  bodyPrefix?: ReactNode;
  /** The record action strip (`RecordActionStrip`) — painted in the in-flow action row under the search toolbar, inside the list anchor… */
  actionStrip?: ReactNode;
  /**
   * The check-set's verbs (Shopify index). While ≥1 row is checked the sticky
   * column header BECOMES the bulk bar — select-all check, "N selected", these
   * verbs, Clear. Needs `selectionScope`. The header lives outside the
   * virtualized body, so the bar never unmounts with a row.
   */
  bulkBar?: ReactNode;
}

/** Serialize rows as CSV — what a FILE download expects. */
/** Download the current view as a CSV file. Used by the header button and by desks that tuck Export into a dropdown. */
export function downloadDataTableCsv<Row>(
  shape: DataTableExport<Row>,
  rows: readonly Row[],
  filename: string,
): void {
  if (rows.length === 0) return;
  const csv = serializeRows(shape.columns, rows.map((row) => shape.toRow(row)), 'csv');
  const url = URL.createObjectURL(new Blob([csv], { type: EXPORT_FORMATS.csv.mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}


/** The single filter control. Lit and counted — never a bare dot (WCAG 1.4.1). */
/** EXPORTED for the one sanctioned off-table use: */
export function DataTableFilterMenu({
  options,
  onToggle,
  onClearAll,
}: DataTableFilterChrome) {
  const [open, setOpen] = useState(false);
  const activeOptions = options.filter((o) => o.active);
  const activeCount = activeOptions.length;
  const hot = activeCount > 0;
  // One active filter names itself on the trigger.
  const triggerLabel = activeCount === 1 ? activeOptions[0].label : null;

  // Grouped in the caller's order, headings only when a caller asked for them.
  const bands: { key: string; options: DataTableFilterOption[] }[] = [];
  for (const option of options) {
    const key = option.group ?? '';
    const band = bands.find((b) => b.key === key);
    if (band) band.options.push(option);
    else bands.push({ key, options: [option] });
  }
  const grouped = bands.some((b) => b.key !== '');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="data-table-filter"
          aria-label={
            triggerLabel
              ? `Filters, ${triggerLabel}`
              : hot
                ? `Filters, ${activeCount} active`
                : 'Filters'
          }
          aria-pressed={hot}
          aria-expanded={open}
          className={cn(
            'ds-raw-button inline-flex shrink-0 items-center justify-center gap-1 px-1.5 text-role-caption',
            // Colour only. Ops chrome never tweens anything that moves a
            // neighbour (AGENTS.md — no layout animations).
            'transition-colors duration-100 ease-out',
            PRIMARY_CHROME_ROW_FACE,
            DATA_TABLE_TOOLBAR_CORNER,
            focusRing('control'),
            hot
              ? 'bg-blue-600 text-white hover:bg-blue-600'
              : 'text-text-muted hover:bg-surface-hover hover:text-text-default',
          )}
        >
          <Filter className="h-3.5 w-3.5 shrink-0" />
          {triggerLabel ? (
            <span className="max-w-[9rem] truncate">{triggerLabel}</span>
          ) : hot ? (
            <span className="tabular-nums">{activeCount}</span>
          ) : null}
        </button>
      </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={2}
          data-testid="data-table-filter-menu"
          className={cn(
            // The SHARED popover face, not a second one.
            DROPDOWN_SHELL_CORNER,
            'w-60 overflow-hidden p-0.5',
            focusRing('field', 'accent'),
          )}
        >
          {bands.map((band, bandIndex) => (
            <Fragment key={band.key || `band-${bandIndex}`}>
              {grouped && band.key ? (
                <p
                  className={cn(
                    'px-2 pb-0.5 text-role-micro font-semibold text-text-faint',
                    // Same heading treatment the fields menu next door already
                    // uses — one banded-popover grammar, not two.
                    bandIndex === 0 ? 'pt-1' : 'pt-2',
                  )}
                >
                  {band.key}
                </p>
              ) : null}
              {band.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onToggle(option.id)}
                  data-testid={`data-table-filter-${option.id}`}
                  data-active={option.active ? '' : undefined}
                  className={cn(
                    'ds-raw-button flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-role-caption',
                    DROPDOWN_ITEM_CORNER,
                    focusRing('control'),
                    option.active
                      ? 'bg-surface-sunken font-semibold text-text-default'
                      : 'text-text-soft hover:bg-surface-hover hover:text-text-default',
                  )}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    {option.identity ? <MenuBrandIdentity {...option.identity} /> : null}
                    <span className="truncate">{option.label}</span>
                  </span>
                  {typeof option.count === 'number' ? (
                    <span className="shrink-0 tabular-nums text-role-micro text-text-faint">
                      {option.count}
                    </span>
                  ) : null}
                </button>
              ))}
            </Fragment>
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
                  'ds-raw-button w-full px-2 py-1.5 text-left text-role-caption text-text-soft',
                  DROPDOWN_ITEM_CORNER,
                  focusRing('control'),
                  'hover:bg-surface-hover hover:text-text-default',
                )}
              >
                Clear all filters
              </button>
            </>
          ) : null}
        </PopoverContent>
    </Popover>
  );
}

function DataTableToolbarActions({ actions }: { actions: readonly DataTableToolbarAction[] }) {
  const [armedId, setArmedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const armed = actions.find((action) => action.id === armedId && action.paste) ?? null;

  const closePaste = useCallback(() => {
    setArmedId(null);
    setDraft('');
  }, []);

  const commitPaste = useCallback(
    (value: string) => {
      const next = value.trim();
      if (!next || !armed?.paste) return;
      closePaste();
      void armed.paste.onCommit(next);
    },
    [armed, closePaste],
  );

  if (actions.length === 0) return null;

  return (
    <span
      data-testid="data-table-actions"
      className="inline-flex shrink-0 items-center gap-1"
    >
      {actions.map((action) => {
        if (armed && action.id === armed.id && action.paste) {
          return (
            <div
              key={action.id}
              className="min-w-[14rem] max-w-[22rem]"
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();
                closePaste();
              }}
            >
              <SearchField
                value={draft}
                onChange={setDraft}
                onSearch={commitPaste}
                placeholder={action.paste.placeholder}
                autoFocus
                hideLeadingIcon
                hideUnderline
                fillHost
                tone="neutral"
                isSearching={action.busy}
                debounceMs={0}
              />
            </div>
          );
        }

        const run = () => {
          if (action.disabled || action.busy) return;
          if (action.paste) {
            setArmedId(action.id);
            setDraft('');
            return;
          }
          action.onClick?.();
        };

        return (
          <Button
            key={action.id}
            type="button"
            size="sm"
            variant={action.variant === 'primary' ? 'primary' : 'secondary'}
            disabled={action.disabled}
            loading={action.busy}
            onClick={run}
            data-testid={action.testId ?? `data-table-action-${action.id}`}
          >
            {action.label}
          </Button>
        );
      })}
    </span>
  );
}

export function DataTablePageSizeMenu({
  pageSize,
  pageSizes,
  onPageSizeChange,
}: {
  pageSize: number;
  pageSizes: readonly number[];
  onPageSizeChange: (size: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="data-table-page-size"
          aria-haspopup="listbox"
          aria-controls={open ? listId : undefined}
          aria-label={`Rows per page, ${pageSize}`}
          aria-expanded={open}
          className={cn(
            'ds-raw-button inline-flex shrink-0 items-center justify-center gap-1 px-1.5 text-role-caption',
            'transition-colors duration-100 ease-out',
            PRIMARY_CHROME_ROW_FACE,
            DATA_TABLE_TOOLBAR_CORNER,
            focusRing('control'),
            'text-text-muted hover:bg-surface-hover hover:text-text-default',
          )}
        >
          <span className="tabular-nums">{pageSize}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={2}
        data-testid="data-table-page-size-menu"
        className={cn(DROPDOWN_SHELL_CORNER, 'w-36 overflow-hidden p-0.5', focusRing('field', 'accent'))}
      >
        <ul id={listId} role="listbox" aria-label="Rows per page" className="flex flex-col">
          {pageSizes.map((size, index) => (
            <li key={size}>
              <ToolbarListboxOption
                index={index}
                selected={size === pageSize}
                checkAlign="end"
                onClick={() => {
                  onPageSizeChange(size);
                  setOpen(false);
                }}
              >
                <span className="tabular-nums">{size}</span>
              </ToolbarListboxOption>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}


/** Rows this grid may hand keyboard focus to. */
const DATA_TABLE_ROW_SELECTOR =
  '[data-grid-row],[role="row"][tabindex],[role="button"][tabindex="0"]';

/** Editors inside a cell own their own arrows; the roving walk must not steal them. */
const DATA_TABLE_TEXT_ENTRY_SELECTOR =
  'input,textarea,select,[contenteditable="true"],[role="textbox"],[role="spinbutton"],[role="listbox"],[role="menu"]';

/** Keyboard travel between rows. Page Find lives in the shell, outside this component. */
function useDataTableRowRoving({
  gridHostRef,
}: {
  gridHostRef: RefObject<HTMLDivElement | null>;
}) {
  const focusRow = useCallback((row: HTMLElement) => {
    // `tabIndex` is only absent on surfaces with no activation gesture; setting
    // -1 keeps the Tab order exactly as it was.
    if (!row.hasAttribute('tabindex')) row.tabIndex = -1;
    row.focus();
    row.scrollIntoView({ block: 'nearest' });
  }, []);


  const onBodyKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      // A cell editor, an open row menu or a listbox owns its own arrows.
      if (target.closest(DATA_TABLE_TEXT_ENTRY_SELECTOR)) return;
      const row = target.closest<HTMLElement>(DATA_TABLE_ROW_SELECTOR);
      if (!row) return;

      const host = gridHostRef.current;
      if (!host) return;
      const rows = Array.from(host.querySelectorAll<HTMLElement>(DATA_TABLE_ROW_SELECTOR));
      const index = rows.indexOf(row);
      if (index < 0) return;
      const next = event.key === 'ArrowDown' ? rows[index + 1] : rows[index - 1];
      if (next) {
        event.preventDefault();
        focusRow(next);
        return;
      }
      // The header Find is outside this component; at the top, leave focus on
      // the first row rather than inventing a second in-table focus target.
    },
    [gridHostRef, focusRow],
  );

  return { onBodyKeyDown };
}

export type { DataTableTab };

export function DataTable<Row, K extends string, C extends LedgerGridColumnModel>({
  binding,
  hideToolbar = false,
  columns,
  rows,
  orderGroupsByDate,
  getRowId,
  loading,
  emptyMessage,
  searchEmptyMessage,
  emptyState,
  searchEmptyState,
  isNarrowed = false,
  actions,
  tabs,
  activeTab,
  onTabChange,
  totalCount,
  onReorderColumn,
  onResizeColumn,
  onFreezeColumn,
  exportFilename,
  onLoadMore,
  selectionScope,
  copyExport,
  copyExportPlacement = 'header',
  selectGutterChrome = 'always',
  isSortable,
  sort,
  dir,
  onSortChange,
  labelFor,
  renderRow,
  renderGroup,
  showDayHeaders,
  sectionHeaders,
  testId,
  shellRef,
  scrollRef,
  scrollParentRef,
  scrollToKey,
  ariaLabel,
  className,
  bodyPrefix,
  actionStrip,
  bulkBar,
  unpaged = false,
  rowNoun,
}: DataTableProps<Row, K, C>) {
  const selectedRows = useTableSelection<Row>(selectionScope ?? '__idle__');
  const selectedCount = selectionScope ? selectedRows.length : 0;
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState<DataTablePageSize>(DATA_TABLE_PAGE_SIZE);
  useEffect(() => {
    setPageSize(readDataTablePageSize());
  }, []);
  useEffect(() => {
    setPageIndex(0);
  }, [pageSize]);
  // An unpaged sheet is one page of every row (the grid virtualizes); the pager never shows.
  const effectivePageSize = unpaged ? Number.MAX_SAFE_INTEGER : pageSize;
  const paged = useMemo(
    () => pageGroupedRenderOrder(orderGroupsByDate, pageIndex, effectivePageSize),
    [orderGroupsByDate, pageIndex, effectivePageSize],
  );
  useEffect(() => {
    if (pageIndex > paged.pageCount - 1) setPageIndex(Math.max(0, paged.pageCount - 1));
  }, [pageIndex, paged.pageCount]);
  /** The page's row ids, in render order — what Select-all may tick and what the foot's "N selected" counts against. */
  const visibleIds = useMemo(() => {
    return flattenRenderOrder(paged.order)
      .map((row): DataTableRowId | null => {
        const key = getRowId
          ? getRowId(row)
          : row && typeof row === 'object' && 'id' in row
            ? String(row.id)
            : '';
        if (!key) return null;
        const numeric = Number(key);
        return Number.isFinite(numeric) && numeric > 0 ? numeric : key;
      })
      .filter((id): id is DataTableRowId => id !== null);
  }, [paged.order, getRowId]);
  useEffect(() => {
    if (!selectionScope) return;
    publishDataTableVisibleIds(selectionScope, visibleIds);
    emitSelectionTotal(selectionScope, visibleIds.length);
    return () => clearDataTableVisibleIds(selectionScope);
  }, [selectionScope, visibleIds]);
  useEffect(() => {
    if (!scrollToKey || !getRowId) return;
    const next = pageIndexForRowId(
      orderGroupsByDate,
      pageSize,
      scrollToKey,
      getRowId,
    );
    if (next != null && next !== pageIndex) setPageIndex(next);
  }, [scrollToKey, getRowId, orderGroupsByDate, pageIndex, pageSize]);
  const gridHostRef = useRef<HTMLDivElement>(null);
  const { onBodyKeyDown } = useDataTableRowRoving({
    gridHostRef,
  });

  // Sortability is a property of the DESCRIPTOR, not of the page: TanStack's
  // `enableSorting` is already the surface's sort vocabulary, so reading it back
  // is what keeps a header from offering a sort the engine will not perform.
  const mounted = columns ?? binding.columns;
  const headerReorder = onReorderColumn;
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
        onReorderColumn={headerReorder}
        onResizeColumn={onResizeColumn}
        onFreezeColumn={onFreezeColumn}
        labelFor={labelFor}
        bulkBar={bulkBar}
      />
    ),
    [
      headerLayout,
      multiSelect,
      selectionScope,
      selectGutterChrome,
      sort,
      dir,
      labelFor,
      headerReorder,
      onResizeColumn,
      onFreezeColumn,
      bulkBar,
    ],
  );

  const stage = useDeskStageOptional();
  const exportInHeader = Boolean(
    copyExport && stage && !stage.fullscreen && copyExportPlacement !== 'menu',
  );
  const showExportGlyph = Boolean(
    copyExport &&
      !exportInHeader &&
      (copyExportPlacement !== 'menu' || Boolean(stage?.fullscreen)),
  );
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const copyExportRef = useRef(copyExport);
  copyExportRef.current = copyExport;
  const getExportRows = useCallback(() => rowsRef.current, []);
  const _getExportShape = useCallback(() => copyExportRef.current!, []);
  // The org-wide column choice. Keyed by tableId, so two lanes on one family
  // (To-ship / Shipped) share what an operator picked once.
  const { chosenFieldIds, setChosenFieldIds } = useExportFieldChoice(
    copyExport ? binding.definition.tableId : null,
  );

  const selectedRowsRef = useRef(selectedRows);
  selectedRowsRef.current = selectedRows;
  const getSelectedExportRows = useCallback(() => selectedRowsRef.current, []);

  /** The field registry, lifted from the legacy positional shape. */
  const exportSpec = useMemo(
    () =>
      copyExport
        ? exportSpecFromColumns<Row>(copyExport, (exportFilename ?? 'export.csv'))
        : null,
    [copyExport, exportFilename],
  );

  const exportControl = useMemo(
    () =>
      exportSpec ? (
        <DataTableExportMenu<Row>
          fields={exportSpec.fields}
          toRow={exportSpec.toRow}
          filename={exportSpec.filename}
          getViewRows={getExportRows}
          getSelectedRows={getSelectedExportRows}
          viewCount={rows.length}
          selectedCount={selectedCount}
          chosenFieldIds={chosenFieldIds}
          onChangeFields={setChosenFieldIds}
          face={exportInHeader ? 'header' : 'glyph'}
          renderHeaderTrigger={({ disabled, ariaLabel, children }) => (
            <DeskHeaderAction
              type="button"
              variant="secondary"
              size="sm"
              icon={<Download aria-hidden />}
              disabled={disabled}
              data-testid="data-table-export"
              ariaLabel={ariaLabel}
              title="Export"
            >
              {children}
            </DeskHeaderAction>
          )}
        />
      ) : null,
    [
      exportSpec,
      exportInHeader,
      getExportRows,
      getSelectedExportRows,
      rows.length,
      selectedCount,
      chosenFieldIds,
      setChosenFieldIds,
    ],
  );
  return (
    <>
        {exportInHeader ? (
          <DeskActionSlotRegistrar role="overall">{exportControl}</DeskActionSlotRegistrar>
        ) : null}
        <div
          className={cn(DESK_TABLE_SURFACE_CLASS, className)}
          {...{ [DATA_TABLE_OVERLAY_HOST_ATTR]: '' }}
        >
      {/* ── The list anchor: table controls + record action strip. In place,
          the open record opens below it; both stay live over the record. ──── */}
      <div {...{ [DESK_RECORD_ANCHOR_ATTR]: '' }} className="flex min-w-0 shrink-0 flex-col">
      {!hideToolbar ? <div
        data-testid="data-table-toolbar"
        className={cn(
          // `pr-0`: the trailing control sits ON the card's edge (operator
          // ruling 2026-08-31) — a gap there reads as the row stopping short of
          // the table it belongs to.
          'flex min-w-0 items-center gap-2 border-b border-border-soft bg-surface-card pl-2 pr-0',
          PRIMARY_CHROME_ROW_FACE,
        )}
      >
        {actions && actions.length > 0 ? <DataTableToolbarActions actions={actions} /> : null}
        <DataTablePageSizeMenu
          pageSize={pageSize}
          pageSizes={DATA_TABLE_PAGE_SIZES}
          onPageSizeChange={(size) => {
            if (!isDataTablePageSize(size)) return;
            writeDataTablePageSize(size);
            setPageSize(size);
          }}
        />
        {/* Right side, left to right (operator 2026-10-05): actions · layout toggles · zoom last. */}
        <span className="ml-auto inline-flex shrink-0 items-center gap-1">
          {showExportGlyph ? exportControl : null}
          {/* Renders nothing at all off a desk stage — see the component. */}
          <DeskRecordViewSwitch />
          <DataTableZoomToggle />
        </span>
      </div> : null}
        <div
          {...{ [DATA_TABLE_ACTION_ROW_ATTR]: '' }}
          data-testid="data-table-action-row"
          className="min-w-0 w-full empty:hidden"
        >
          {actionStrip}
        </div>
      </div>

      {/* ── The grid ───────────────────────────────────────────────────────── */}
      <div
        ref={gridHostRef}
        onKeyDown={onBodyKeyDown}
        className="relative isolate flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <NonlinearTableHost<Row, K, C>
          binding={binding}
          ariaLabel={ariaLabel}
          columns={mounted}
          testId={testId}
          showDayHeaders={showDayHeaders}
          sectionHeaders={sectionHeaders}
          shellRef={shellRef}
          rows={rows}
          orderGroupsByDate={paged.order}
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
          bodyPrefix={bodyPrefix}
        />
      </div>

      <TableStatusBar
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={onTabChange}
        shown={paged.shown}
        // `totalCount` was DECLARED and then dropped on the floor:
        total={totalCount ?? paged.total}
        rowNoun={rowNoun}
        selected={selectedCount}
        pager={{
          pageIndex: paged.pageIndex,
          pageCount: paged.pageCount,
          onPrev: () => setPageIndex((i) => Math.max(0, i - 1)),
          onNext: () => {
            if (paged.pageIndex < paged.pageCount - 1) {
              setPageIndex(paged.pageIndex + 1);
              return;
            }
            onLoadMore?.();
            setPageIndex(paged.pageIndex + 1);
          },
          nextDisabled: paged.pageIndex >= paged.pageCount - 1 && !onLoadMore,
        }}
        onLoadMore={onLoadMore}
      />
    </div>
    </>
  );
}
