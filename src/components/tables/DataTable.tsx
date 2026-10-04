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
import { ArrowUpDown, ChevronDown, Download, Filter } from '@/components/Icons';
import { Button, SearchField } from '@/design-system/primitives';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import type { DateRange } from 'react-day-picker';
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
} from '@/lib/tables/data-table-pagination';
import { dataTableFindHighlightId } from '@/lib/tables/data-table-find';
import {
  clearDataTableVisibleIds,
  publishDataTableVisibleIds,
  type DataTableRowId,
} from '@/lib/tables/data-table-visible-rows';
import { emitSelectionTotal } from '@/lib/selection/table-selection';
import { MenuBrandIdentity } from '@/components/ui/grid-cells';
import { WorkbenchViewsMenu } from '@/components/saved-views/WorkbenchViewsMenu';
import { sheetSavedViewConfigForTable } from '@/lib/saved-views/surfaces';
import {
  ToolbarListboxOption,
  toolbarListboxOptionKeyDown,
} from '@/design-system/primitives/ToolbarListbox';
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

/**
 * The QUICK DATE control — a peer of the filter, not a second toolbar.
 * two clicks inside it (operator ruling 2026-08-31).
 */
export interface DataTableDateMenu {
  /** The live range, or `undefined` for "any date". */
  range: DateRange | undefined;
  onRangeChange: (next: DateRange | undefined) => void;
}

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

/**
 * Idle funnel when a family has not wired facets yet. The icon still paints —
 * omit `filter` and DataTable mounts this, never hides the control.
 */
const DATA_TABLE_FILTER_IDLE: DataTableFilterChrome = {
  options: [],
  onToggle: () => {},
  onClearAll: () => {},
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

/** One option in the toolbar sort control. */
export interface DataTableSortOption {
  id: string;
  label: string;
  /** Trigger face when this option is active. Defaults to {@link label}. */
  shortLabel?: string;
  /** Heading in the menu when the list answers more than one question. */
  group?: string;
  identity?: DataTableBrandIdentity;
}

/** Brand swatch for a menu row — resolved by {@link MenuBrandIdentity}. */
export interface DataTableBrandIdentity {
  kind: 'platform' | 'carrier';
  label: string;
  value?: string;
}

/** Legacy in-table search. Page-level lists migrate to NAV_PAGE_DECLS.search. */
export interface DataTableSearch {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /**
   * `'server'` ⇒ `rows` are ALREADY the answer for `value`; the engine's
   * client-side substring filter is bypassed rather than run a second time
   * over a set the server has narrowed. Omitted / `'client'` ⇒ unchanged.
   */
  answeredBy?: 'client' | 'server';
  /** `'server'` only: */
  pending?: boolean;
}


/**
 * The quick-date chip — the same popover primitive as the filter and the fields
 * menu, so all three open one component rather than three lookalikes.
 */
function DataTableDateMenuControl({ range, onRangeChange }: DataTableDateMenu) {
  const active = Boolean(range?.from);
  return (
    <DateRangePickerField
      value={range}
      onChange={onRangeChange}
      placeholder=""
      // Restyled from a full-width field into a chrome-row chip: same control,
      // same calendar, same presets — it just has to sit on a 28px band beside
      // the funnel instead of in a form. `cn` is tailwind-merge, so these win.
      className={cn(
        'h-6 w-auto shrink-0 gap-1 border-0 bg-transparent px-1.5 text-role-caption',
        DATA_TABLE_TOOLBAR_CORNER,
        'hover:border-0 hover:bg-surface-hover',
        // No `focus:ring-0` here: overriding the picker's focus ring away would
        // strip the only thing telling a keyboard operator where they are.
        active ? 'text-text-default' : 'text-text-muted',
      )}
    />
  );
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
   * In-job sub-ledger Find. Page-level lists MUST use NAV_PAGE_DECLS.search;
   * this is only for rows subordinate to the current job (for example CSV
   * staging).
   */
  sheetFind?: DataTableSearch;

  // ── The one filter control (data, not a node) ──────────────────────────────
  /** Facets for the always-mounted funnel. Omit → {@link DATA_TABLE_FILTER_IDLE}. */
  filter?: DataTableFilterChrome;

  /**
   * Job verbs in the LEFT cluster after filter. Omit when the desk has none —
   * the funnel still paints. Never a ReactNode; DataTable draws the buttons
   * (and the paste morph) from this list.
   */
  actions?: readonly DataTableToolbarAction[];

  /** The one sort control (data, not a node). */
  sortMenu?: {
    options: readonly DataTableSortOption[];
    /** Currently selected option id. `null` = surface default (unlit). */
    active: string | null;
    /**
     * Lights the trigger. Omit and the trigger lights whenever `active` is
     * set — pass `false` when the active id IS the surface default
     * (To-ship's `deadline`).
     */
    hot?: boolean;
    onSelect: (id: string) => void;
    /**
     * Trigger face when `active` is not in {@link options} (legacy pins /
     * retired aliases). DATA column facts belong in `options` so the open
     * list can check Pick / Status — never only name them on the trigger.
     */
    activeFace?: Pick<DataTableSortOption, 'label' | 'shortLabel' | 'identity'>;
    /** Trigger test id — two sort menus on one page (the bar and a section header) need their own. */
    testId?: string;
    /** Menu alignment to the trigger; `end` for a trigger at a row's right edge. */
    align?: 'start' | 'end';
    /**
     * One check per band when the menu answers more than one question — a
     * Display menu: Group by and Order by, each a `group` band. Defaults to
     * `[active]`. Set, the menu stays open across picks (one pick per band).
     */
    selected?: readonly string[];
    /** The control's accessible name (trigger + list). Default `Sort`. */
    label?: string;
  };

  /** Named saved views for this surface — data, never a ReactNode slot. */
  views?: {
    storageKey: string;
    paramKeys: readonly string[];
    emptyHint?: string;
    /** @deprecated Saved views no longer persist a configurable field layout. */
    layout?: unknown;
  };

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
  /** Quick date refinement — drawn beside the filter. See {@link DataTableDateMenu}. */
  dateMenu?: DataTableDateMenu;
  /** Drag a column header onto another to reorder. */
  onReorderColumn?: (dragKey: string, dropKey: string) => void;
  /** Commit a drag-resized column width in px. Omit and headers do not resize. */
  onResizeColumn?: (key: string, widthPx: number) => void;
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

/** The one SORT control — a peer of the filter, not a second toolbar. */
export function DataTableSortMenu({
  options,
  active,
  hot: hotProp,
  onSelect,
  activeFace,
  testId = 'data-table-sort',
  align = 'start',
  selected,
  label,
}: NonNullable<DataTableProps<unknown, string, LedgerGridColumnModel>['sortMenu']>) {
  const name = label ?? 'Sort';
  const checked = selected ?? (active ? [active] : []);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const listRef = useRef<HTMLUListElement | null>(null);
  const listId = useId();
  const menuOption = options.find((o) => o.id === active) ?? null;
  const activeOption =
    menuOption ??
    (active && activeFace ? { id: active, ...activeFace } : null);
  const hot = hotProp ?? Boolean(active);
  const triggerLabel = hot && activeOption ? (activeOption.shortLabel ?? activeOption.label) : null;

  const bands = useMemo(() => {
    const next: { key: string; options: DataTableSortOption[] }[] = [];
    for (const option of options) {
      const key = option.group ?? '';
      const band = next.find((b) => b.key === key);
      if (band) band.options.push(option);
      else next.push({ key, options: [option] });
    }
    return next;
  }, [options]);

  const grouped = bands.length > 1 && bands.some((b) => b.key !== '');
  // A multi-question menu (Group by · Order by) is a few short settings, never a list to search.
  const showFilter = !selected && options.length >= 8;
  const filteredBands = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return bands;
    return bands
      .map((band) => ({
        ...band,
        options: band.options.filter(
          (option) =>
            option.label.toLowerCase().includes(q) ||
            (option.shortLabel ?? '').toLowerCase().includes(q),
        ),
      }))
      .filter((band) => band.options.length > 0);
  }, [bands, query]);
  const filteredOptions = useMemo(
    () => filteredBands.flatMap((band) => band.options),
    [filteredBands],
  );

  const closeMenu = () => setOpen(false);

  const revealActive = () => {
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLElement>('[aria-selected="true"]')
        ?.scrollIntoView({ block: 'nearest' });
    });
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setQuery('');
          revealActive();
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={testId}
          aria-haspopup="listbox"
          aria-controls={open ? listId : undefined}
          aria-label={
            triggerLabel ? `${name}, ${triggerLabel}` : hot ? `${name}, custom` : name
          }
          aria-pressed={hot}
          aria-expanded={open}
          className={cn(
            'ds-raw-button inline-flex shrink-0 items-center justify-center gap-1 px-1.5 text-role-caption',
            'transition-colors duration-100 ease-out',
            PRIMARY_CHROME_ROW_FACE,
            DATA_TABLE_TOOLBAR_CORNER,
            focusRing('control'),
            hot
              ? 'bg-blue-600 text-white hover:bg-blue-600'
              : 'text-text-muted hover:bg-surface-hover hover:text-text-default',
          )}
        >
          <ArrowUpDown className="h-3.5 w-3.5 shrink-0" />
          {triggerLabel ? (
            <span className="inline-flex max-w-[9rem] items-center gap-1">
              {activeOption?.identity ? (
                <MenuBrandIdentity compact {...activeOption.identity} />
              ) : null}
              <span className="truncate">{triggerLabel}</span>
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        sideOffset={2}
        data-testid={`${testId}-menu`}
        className={cn(
          DROPDOWN_SHELL_CORNER,
          'flex w-64 flex-col overflow-hidden p-0',
          'max-h-[var(--radix-popover-content-available-height)]',
          focusRing('field', 'accent'),
        )}
      >
        {showFilter ? (
          <div
            role="search"
            data-testid="data-table-sort-filter"
            className="border-b border-border-soft px-1.5 py-1"
            onKeyDown={(event) => {
              if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
              if (filteredOptions.length === 0) return;
              event.preventDefault();
              const next = event.key === 'ArrowDown' ? 0 : filteredOptions.length - 1;
              listRef.current
                ?.querySelector<HTMLButtonElement>(`[data-option-index="${next}"]`)
                ?.focus();
            }}
          >
            <SearchField
              value={query}
              onChange={setQuery}
              onSearch={() => {
                if (filteredOptions.length !== 1) return;
                onSelect(filteredOptions[0].id);
                closeMenu();
              }}
              inputRef={(el) => {
                if (!el) return;
                el.setAttribute('role', 'combobox');
                el.setAttribute('aria-expanded', 'true');
                el.setAttribute('aria-controls', listId);
                el.setAttribute('aria-autocomplete', 'list');
                el.setAttribute('aria-label', 'Filter');
              }}
              placeholder="Filter…"
              tone="neutral"
              size="compact"
              hideUnderline
              debounceMs={0}
              autoFocus
              className="min-w-0"
            />
          </div>
        ) : null}
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={name}
          aria-multiselectable={selected ? true : undefined}
          className="min-h-0 flex-1 overflow-y-auto py-0.5"
        >
          {filteredOptions.length === 0 ? (
            <li className="px-2.5 py-1.5 text-role-caption text-text-faint">No matches</li>
          ) : (
            filteredBands.map((band, bandIndex) => {
              const headingId = band.key
                ? `${listId}-${band.key.replace(/\s+/g, '-')}`
                : undefined;
              let optionIndex = 0;
              for (let i = 0; i < bandIndex; i += 1) {
                optionIndex += filteredBands[i].options.length;
              }
              return (
                <Fragment key={band.key || `band-${bandIndex}`}>
                  {grouped && band.key ? (
                    <li role="presentation">
                      <p
                        id={headingId}
                        data-testid={`data-table-sort-group-${band.key.replace(/\s+/g, '-')}`}
                        className={cn(
                          'px-2.5 pb-0.5 text-role-micro font-semibold text-text-faint',
                          bandIndex === 0 ? 'pt-1' : 'pt-2',
                        )}
                      >
                        {band.key}
                      </p>
                    </li>
                  ) : null}
                  {band.options.map((option, withinBand) => {
                    const index = optionIndex + withinBand;
                    return (
                      <li key={option.id}>
                        <ToolbarListboxOption
                          index={index}
                          selected={checked.includes(option.id)}
                          checkAlign="end"
                          leading={
                            option.identity ? (
                              <MenuBrandIdentity {...option.identity} />
                            ) : undefined
                          }
                          onClick={() => {
                            onSelect(option.id);
                            if (!selected) closeMenu();
                          }}
                          onKeyDown={(event) =>
                            toolbarListboxOptionKeyDown(
                              event,
                              index,
                              filteredOptions.length,
                              listRef,
                              closeMenu,
                            )
                          }
                          dataAttrs={{
                            'data-testid': `data-table-sort-${option.id.replace(/:/g, '-')}`,
                            ...(checked.includes(option.id) ? { 'data-active': '' } : {}),
                          }}
                        >
                          {option.label}
                        </ToolbarListboxOption>
                      </li>
                    );
                  })}
                </Fragment>
              );
            })
          )}
        </ul>
      </PopoverContent>
    </Popover>
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
  sheetFind,
  filter,
  actions,
  sortMenu,
  views,
  tabs,
  activeTab,
  onTabChange,
  totalCount,
  dateMenu,
  onReorderColumn,
  onResizeColumn,
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
}: DataTableProps<Row, K, C>) {
  const selectedRows = useTableSelection<Row>(selectionScope ?? '__idle__');
  const selectedCount = selectionScope ? selectedRows.length : 0;
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState<DataTablePageSize>(DATA_TABLE_PAGE_SIZE);
  useEffect(() => {
    setPageSize(readDataTablePageSize());
  }, []);
  const sheetFindValue = sheetFind?.value ?? '';
  useEffect(() => {
    setPageIndex(0);
  }, [pageSize, sheetFindValue]);
  const paged = useMemo(
    () => pageGroupedRenderOrder(orderGroupsByDate, pageIndex, pageSize),
    [orderGroupsByDate, pageIndex, pageSize],
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
  const paintedRowIds = useMemo(
    () =>
      flattenRenderOrder(orderGroupsByDate).map((row) => {
        if (getRowId) return getRowId(row);
        if (row && typeof row === 'object' && 'id' in row) return String(row.id);
        return '';
      }).filter(Boolean),
    [orderGroupsByDate, getRowId],
  );
  const findScrollToKey = scrollToKey ?? dataTableFindHighlightId({
    query: sheetFindValue,
    paintedRowIds,
  });
  useEffect(() => {
    if (!findScrollToKey || !getRowId) return;
    const next = pageIndexForRowId(
      orderGroupsByDate,
      pageSize,
      findScrollToKey,
      getRowId,
    );
    if (next != null && next !== pageIndex) setPageIndex(next);
  }, [findScrollToKey, getRowId, orderGroupsByDate, pageIndex, pageSize]);
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

  const resolvedSortMenu = useMemo(() => {
    if (sortMenu && sortMenu.options.length > 0) return sortMenu;
    const derived: DataTableSortOption[] = [];
    for (const col of mounted) {
      if (!headerLayout.isSortable(col.key)) continue;
      const label = col.gridLabel || col.label;
      if (!label) continue;
      derived.push({ id: col.key, label, shortLabel: label });
    }
    if (derived.length === 0) return null;
    return {
      options: derived,
      active: sort,
      onSelect: (id: string) => {
        const col = mounted.find((c) => c.key === id);
        const type = col?.type;
        const defaultDir: GridSortDir =
          type === 'date' || type === 'price' || type === 'number' ? 'desc' : 'asc';
        if (sort === id && dir) {
          onSortChange(id as K, dir === 'asc' ? 'desc' : 'asc');
        } else {
          onSortChange(id as K, defaultDir);
        }
      },
    };
  }, [sortMenu, mounted, headerLayout, sort, dir, onSortChange]);

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
      bulkBar,
    ],
  );

  const filterChrome = filter ?? DATA_TABLE_FILTER_IDLE;
  const isNarrowed = Boolean(sheetFindValue) || Boolean(filterChrome.options.some((o) => o.active));
  const sheetFindPending = sheetFind?.answeredBy === 'server' && sheetFind.pending === true;

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
  const defaultViews = sheetSavedViewConfigForTable(binding.definition.tableId);
  const resolvedViews = views ?? (
    defaultViews
      ? { ...defaultViews, emptyHint: undefined }
      : null
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
        {sheetFind ? (
          <SearchField
            value={sheetFind.value}
            onChange={sheetFind.onChange}
            placeholder={sheetFind.placeholder ?? 'Find in this sheet…'}
            isSearching={sheetFindPending}
            inputRef={(el) => el?.setAttribute('aria-label', sheetFind.placeholder ?? 'Find in this sheet')}
            className={cn('min-w-0 max-w-[22rem] flex-1 overflow-hidden', DATA_TABLE_TOOLBAR_CORNER)}
            tone="neutral"
            hideUnderline
            fillHost
          />
        ) : null}
        <DataTableFilterMenu {...filterChrome} />
        {actions && actions.length > 0 ? <DataTableToolbarActions actions={actions} /> : null}
        {resolvedSortMenu ? <DataTableSortMenu {...resolvedSortMenu} /> : null}
        {resolvedViews ? (
          <div data-testid="data-table-views" className="inline-flex shrink-0 items-center">
            <WorkbenchViewsMenu
              storageKey={resolvedViews.storageKey}
              paramKeys={resolvedViews.paramKeys}
              emptyHint={resolvedViews.emptyHint}
            />
          </div>
        ) : null}
        {dateMenu ? <DataTableDateMenuControl {...dateMenu} /> : null}
        <DataTablePageSizeMenu
          pageSize={pageSize}
          pageSizes={DATA_TABLE_PAGE_SIZES}
          onPageSizeChange={(size) => {
            if (!isDataTablePageSize(size)) return;
            writeDataTablePageSize(size);
            setPageSize(size);
          }}
        />
        {/* The order, left to right (operator ruling 2026-09-01, verbs 2026-09-04): */}
        <span className="ml-auto inline-flex shrink-0 items-center gap-1">
          {showExportGlyph ? exportControl : null}
          <DataTableZoomToggle />
          {/* Renders nothing at all off a desk stage — see the component. */}
          <DeskRecordViewSwitch />
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
          loading={loading || sheetFindPending}
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
          scrollToKey={findScrollToKey}
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
