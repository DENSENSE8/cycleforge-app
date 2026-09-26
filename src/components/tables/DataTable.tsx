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
import { ArrowUpDown, Check, ChevronDown, Download, Filter, SlidersHorizontal } from '@/components/Icons';
import type { SlotFieldOption } from '@/lib/tables/layout-edit';
import { Button, SearchField } from '@/design-system/primitives';
import { DateRangePickerField } from '@/design-system/components/DateRangePickerField';
import type { DateRange } from 'react-day-picker';
import { DataTableFullscreenToggle } from '@/components/tables/DataTableFullscreenToggle';
import { DataTableZoomToggle } from '@/components/tables/DataTableZoomToggle';
import { DeskActionSlotRegistrar, DeskHeaderAction } from '@/design-system/components/DeskActionSlot';
import { useDeskStageOptional } from '@/design-system/components/DeskStageContext';
import { DESK_RECORD_ANCHOR_ATTR, useDeskRecordPlaneOptional } from '@/design-system/components/DeskRecordPlane';
import { NonlinearTableHost } from '@/components/tables/NonlinearTableHost';
import { SlotLayoutReorderProvider } from '@/components/tables/SlotLayoutReorderContext';
import type { SlotLayout } from '@/lib/tables/slot-layout-core';
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
import { dropSlotColumns } from '@/lib/tables/slot-column-reorder';
import { PRIMARY_CHROME_ROW_FACE } from '@/components/layout/header-shell';
import { TableStatusBar, type DataTableTab } from '@/components/tables/TableStatusBar';
import { useTableSelection } from '@/hooks/useTableSelection';
import { flattenRenderOrder, type RowGroup } from '@/lib/group-rows';
import {
  SLOT_TABLE_PAGE_SIZE,
  SLOT_TABLE_PAGE_SIZES,
  isSlotTablePageSize,
  pageGroupedRenderOrder,
  pageIndexForRowId,
  readSlotTablePageSize,
  writeSlotTablePageSize,
  type SlotTablePageSize,
} from '@/lib/tables/slot-table-page';
import { slotTableFindHighlightId } from '@/lib/tables/slot-table-find';
import {
  clearSlotTableVisibleIds,
  publishSlotTableVisibleIds,
  type SlotTableRowId,
} from '@/lib/tables/slot-table-visible';
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
  SLOT_TABLE_ACTION_ROW_ATTR,
  SLOT_TABLE_OVERLAY_HOST_ATTR,
} from '@/components/tables/slot-table-overlay-host';
import { cn } from '@/utils/_cn';
import { HoverTooltip } from '@/components/ui/HoverTooltip';

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
export const DATA_TABLE_FILTER_IDLE: DataTableFilterChrome = {
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

/** The search box, as data. */
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

/** The Fields picker, as DATA — the slot-layout half of the toolbar. */
export interface DataTableFieldsMenuData {
  options: readonly SlotFieldOption[];
  /** Bind (unbound row) or unbind (bound row) — one gesture. */
  onToggle: (fieldId: string) => void;
  /**
   * Present ⇒ bound rows carry ↑/↓ arrows that rewrite the band's BINDING
   * order (display order = binding order). One click per step, inside the
   * already-open popover — no drag.
   */
  onMove?: (fieldId: string, direction: 'up' | 'down') => void;
  /**
   * Drop one bound field onto another in the same band. DataTable uses this
   * for header click-and-hold AND provides it to the compound subtitle line
   * so both gestures share one write. See `docs/todo/subtitle-band-reorder-PLAN.md`.
   */
  onReorderByDrop?: (dragFieldId: string, dropFieldId: string) => void;
  /** Locked identity row copy (e.g. "Order"). */
  identityLabel?: string;
  /**
   * Band headings. Defaults fit the compound morph ("Status columns" /
   * "Under the title"); a sheet mount, whose subtitle bindings open real
   * columns, names them for what they are.
   */
  bandLabels?: { status?: string; subtitle?: string };
  /** Present ⇒ admin: offers "Save as organization default" with confirm. */
  onSaveAsOrgDefault?: () => void;
  /** Present ⇒ a personal override exists; offers reset to the shared default. */
  onResetToDefault?: () => void;
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

  /** Compact surfaces can keep their own controls without forking the grid. */
  hideToolbar?: boolean;

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
  };

  /** Named saved views for this surface — data, never a ReactNode slot. */
  views?: {
    storageKey: string;
    paramKeys: readonly string[];
    emptyHint?: string;
    /** The mount's EFFECTIVE layout, so a saved view captures COLUMNS too. */
    layout?: SlotLayout | null;
  };

  // ── The Fields picker (data, not a node) — slot-layout surfaces only ───────
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
  /**
   * Drag a column header onto another to reorder. Omit and headers still drag
   * when {@link DataTableFieldsMenuData.onReorderByDrop} is present — DataTable
   * maps track keys to field ids. Pass this only to override that synthesis.
   */
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
                    'px-2 pb-0.5 text-role-micro font-semibold uppercase tracking-widest text-text-faint',
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
}: NonNullable<DataTableProps<unknown, string, LedgerGridColumnModel>['sortMenu']>) {
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
  const showFilter = options.length >= 8;
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
          data-testid="data-table-sort"
          aria-haspopup="listbox"
          aria-controls={open ? listId : undefined}
          aria-label={
            triggerLabel ? `Sort, ${triggerLabel}` : hot ? 'Sort, custom' : 'Sort'
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
        align="start"
        sideOffset={2}
        data-testid="data-table-sort-menu"
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
          aria-label="Sort"
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
                          'px-2.5 pb-0.5 text-role-micro font-semibold uppercase tracking-widest text-text-faint',
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
                          selected={option.id === active}
                          checkAlign="end"
                          leading={
                            option.identity ? (
                              <MenuBrandIdentity {...option.identity} />
                            ) : undefined
                          }
                          onClick={() => {
                            onSelect(option.id);
                            closeMenu();
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
                            ...(option.id === active ? { 'data-active': '' } : {}),
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

/** The **+** Fields picker — bind/unbind catalog facts into the surface's slot bands, via the house shadcn Popover… */
function DataTableFieldsMenu({
  options,
  onToggle,
  identityLabel,
  bandLabels,
  onSaveAsOrgDefault,
  onResetToDefault,
}: DataTableFieldsMenuData) {
  const [open, setOpen] = useState(false);
  const [confirmingOrgSave, setConfirmingOrgSave] = useState(false);
  const statusOptions = options.filter((o) => o.band === 'status');
  const subtitleOptions = options.filter((o) => o.band === 'subtitle');

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setConfirmingOrgSave(false);
  };

  // ↑/↓ on a bound row rewrites its band's BINDING order — display order IS binding order, so this is the reorder affordance the append-only…
  /* Bind / unbind only. */
  const renderOption = (option: SlotFieldOption) => {
    const toggle = (
      <HoverTooltip label={option.disabledReason} asChild><button
        type="button"
        disabled={Boolean(option.disabledReason)}
       
        onClick={() => onToggle(option.fieldId)}
        data-testid={`data-table-field-${option.fieldId}`}
        data-bound={option.bound ? '' : undefined}
        // A bind/unbind row is a TOGGLE — without pressed state a screen reader
        // announces six identical buttons and the check glyph says nothing.
        aria-pressed={option.bound}
        className={cn(
          'ds-raw-button flex w-full min-w-0 flex-1 items-center justify-between gap-2 px-2 py-1.5 text-left text-role-caption',
          DROPDOWN_ITEM_CORNER,
          focusRing('control'),
          option.bound
            ? 'bg-surface-sunken font-semibold text-text-default'
            : 'text-text-soft hover:bg-surface-hover hover:text-text-default',
          option.disabledReason && 'cursor-not-allowed opacity-50',
        )}
      >
        <span className="truncate">{option.label}</span>
        {option.bound ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
      </button></HoverTooltip>
    );
    return <Fragment key={option.fieldId}>{toggle}</Fragment>;
  };

  const bandHeading = (label: string) => (
    <p className="px-2 pb-0.5 pt-1.5 text-role-micro font-semibold uppercase tracking-widest text-text-faint">
      {label}
    </p>
  );

  const fullBand = options.find((o) => o.disabledReason)?.disabledReason;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="data-table-fields"
          aria-label="Add or remove columns"
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
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={2}
        data-testid="data-table-fields-menu"
        className={cn(DROPDOWN_SHELL_CORNER, 'w-64 overflow-hidden p-0.5')}
      >
          {identityLabel ? (
            <p className="px-2 py-1.5 text-role-caption text-text-faint">
              {identityLabel} — identity, always shown
            </p>
          ) : null}
          {/* ONE wrapper, and the subtitle band leads (operator ruling 2026-08-31). */}
          <div className="flex flex-col">
            {subtitleOptions.length > 0 ? (
              <>
                {bandHeading(bandLabels?.subtitle ?? 'Under the title')}
                {subtitleOptions.map(renderOption)}
              </>
            ) : null}
            {statusOptions.length > 0 ? (
              <>
                {bandHeading(bandLabels?.status ?? 'Status columns')}
                {statusOptions.map(renderOption)}
              </>
            ) : null}
          </div>
          {fullBand ? (
            <p
              data-testid="data-table-fields-limit"
              className="px-2 py-1.5 text-role-micro text-text-faint"
            >
              {fullBand}
            </p>
          ) : null}
          {onResetToDefault || onSaveAsOrgDefault ? (
            <div className="my-0.5 h-px bg-border-soft" aria-hidden />
          ) : null}
          {onResetToDefault ? (
            <button
              type="button"
              data-testid="data-table-fields-reset"
              onClick={() => {
                onResetToDefault();
                setOpen(false);
              }}
              className={cn(
                'ds-raw-button w-full px-2 py-1.5 text-left text-role-caption text-text-soft',
                DROPDOWN_ITEM_CORNER,
                focusRing('control'),
                'hover:bg-surface-hover hover:text-text-default',
              )}
            >
              Reset to shared default
            </button>
          ) : null}
          {onSaveAsOrgDefault ? (
            <button
              type="button"
              data-testid="data-table-fields-save-org"
              onClick={() => {
                if (!confirmingOrgSave) {
                  setConfirmingOrgSave(true);
                  return;
                }
                onSaveAsOrgDefault();
                setConfirmingOrgSave(false);
                setOpen(false);
              }}
              className={cn(
                'ds-raw-button w-full px-2 py-1.5 text-left text-role-caption',
                DROPDOWN_ITEM_CORNER,
                focusRing('control'),
                confirmingOrgSave
                  ? 'bg-blue-600 font-semibold text-white hover:bg-blue-600'
                  : 'text-text-soft hover:bg-surface-hover hover:text-text-default',
              )}
            >
              {confirmingOrgSave
                ? 'Confirm: set for the whole organization'
                : 'Save as organization default'}
            </button>
          ) : null}
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

/** Keyboard travel between the find field and the rows it narrowed. */
function useDataTableRowRoving({
  gridHostRef,
  searchInputRef,
}: {
  gridHostRef: RefObject<HTMLDivElement | null>;
  searchInputRef: RefObject<HTMLInputElement | null>;
}) {
  // While a DeskRecordPlane needs Escape (a record open, or the split view whose
  // next Esc exits fullscreen), the row's own Esc → find field stands down.
  const planeOwnsEscape = useDeskRecordPlaneOptional()?.ownsEscape ?? false;
  const focusRow = useCallback((row: HTMLElement) => {
    // `tabIndex` is only absent on surfaces with no activation gesture; setting
    // -1 keeps the Tab order exactly as it was.
    if (!row.hasAttribute('tabindex')) row.tabIndex = -1;
    row.focus();
    row.scrollIntoView({ block: 'nearest' });
  }, []);

  const focusSearch = useCallback(() => {
    searchInputRef.current?.focus();
  }, [searchInputRef]);

  /** ArrowDown out of the find field. */
  const focusFirstRow = useCallback(() => {
    const first = gridHostRef.current?.querySelector<HTMLElement>(DATA_TABLE_ROW_SELECTOR);
    if (first) focusRow(first);
  }, [gridHostRef, focusRow]);

  const onBodyKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Escape') return;
      if (event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      // A cell editor, an open row menu or a listbox owns its own arrows.
      if (target.closest(DATA_TABLE_TEXT_ENTRY_SELECTOR)) return;
      const row = target.closest<HTMLElement>(DATA_TABLE_ROW_SELECTOR);
      if (!row) return;

      if (event.key === 'Escape') {
        if (planeOwnsEscape) return;
        event.preventDefault();
        focusSearch();
        return;
      }

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
      // Off the TOP of the list:
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        focusSearch();
      }
    },
    [gridHostRef, focusRow, focusSearch, planeOwnsEscape],
  );

  return { focusFirstRow, onBodyKeyDown };
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
  search,
  filter,
  actions,
  sortMenu,
  views,
  fields,
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
}: DataTableProps<Row, K, C>) {
  const selectedRows = useTableSelection<Row>(selectionScope ?? '__idle__');
  const selectedCount = selectionScope ? selectedRows.length : 0;
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState<SlotTablePageSize>(SLOT_TABLE_PAGE_SIZE);
  useEffect(() => {
    setPageSize(readSlotTablePageSize());
  }, []);
  useEffect(() => {
    setPageIndex(0);
  }, [search.value, pageSize]);
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
      .map((row): SlotTableRowId | null => {
        const key = getRowId
          ? getRowId(row)
          : row && typeof row === 'object' && 'id' in row
            ? String(row.id)
            : '';
        if (!key) return null;
        const numeric = Number(key);
        return Number.isFinite(numeric) && numeric > 0 ? numeric : key;
      })
      .filter((id): id is SlotTableRowId => id !== null);
  }, [paged.order, getRowId]);
  useEffect(() => {
    if (!selectionScope) return;
    publishSlotTableVisibleIds(selectionScope, visibleIds);
    emitSelectionTotal(selectionScope, visibleIds.length);
    return () => clearSlotTableVisibleIds(selectionScope);
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
  const findScrollToKey = scrollToKey ?? slotTableFindHighlightId({
    query: search.value,
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
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const { focusFirstRow, onBodyKeyDown } = useDataTableRowRoving({
    gridHostRef,
    searchInputRef,
  });

  // Sortability is a property of the DESCRIPTOR, not of the page: TanStack's
  // `enableSorting` is already the surface's sort vocabulary, so reading it back
  // is what keeps a header from offering a sort the engine will not perform.
  const mounted = columns ?? binding.columns;
  const handleSlotHeaderReorder = useCallback(
    (dragKey: string, dropKey: string) => {
      // Slot tables always write the ORGANIZATION layout (ruling 2026-08-31).
      // `fields.onReorderByDrop` is that write; an explicit `onReorderColumn`
      // is only the fallback for a mount that is not on the slot engine.
      const byDrop = fields?.onReorderByDrop;
      if (byDrop) {
        const pair = dropSlotColumns(dragKey, dropKey, mounted);
        if (pair) byDrop(pair.dragFieldId, pair.dropFieldId);
        return;
      }
      onReorderColumn?.(dragKey, dropKey);
    },
    [onReorderColumn, fields, mounted],
  );
  const headerReorder =
    onReorderColumn || fields?.onReorderByDrop ? handleSlotHeaderReorder : undefined;
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
    ],
  );

  const filterChrome = filter ?? DATA_TABLE_FILTER_IDLE;
  const isNarrowed = Boolean(search.value) || Boolean(filterChrome.options.some((o) => o.active));
  /** The server is still answering the CURRENT query text. */
  const searchPending = search.answeredBy === 'server' && search.pending === true;

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
      ? { ...defaultViews, emptyHint: undefined, layout: undefined }
      : null
  );


  return (
    <SlotLayoutReorderProvider onReorderByDrop={fields?.onReorderByDrop ?? null}>
      <>
        {exportInHeader ? (
          <DeskActionSlotRegistrar role="overall">{exportControl}</DeskActionSlotRegistrar>
        ) : null}
        <div
          className={cn(DESK_TABLE_SURFACE_CLASS, className)}
          {...{ [SLOT_TABLE_OVERLAY_HOST_ATTR]: '' }}
        >
      {/* ── The list anchor: search row + record action strip. In place, the
          open record opens below it; both stay live over the record. ──────── */}
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
        <SearchField
          value={search.value}
          onChange={search.onChange}
          placeholder={search.placeholder ?? 'Search'}
          isSearching={searchPending}
          onNavigateResults={focusFirstRow}
          inputRef={(el) => {
            searchInputRef.current = el;
            if (!el) return;
            el.setAttribute('aria-label', search.placeholder ?? 'Search');
          }}
          className={cn(
            'min-w-0 max-w-[22rem] flex-1 overflow-hidden',
            DATA_TABLE_TOOLBAR_CORNER,
          )}
          tone="neutral"
          hideUnderline
          fillHost
        />
        <DataTableFilterMenu {...filterChrome} />
        {actions && actions.length > 0 ? <DataTableToolbarActions actions={actions} /> : null}
        {resolvedSortMenu ? <DataTableSortMenu {...resolvedSortMenu} /> : null}
        {resolvedViews ? (
          <div data-testid="data-table-views" className="inline-flex shrink-0 items-center">
            <WorkbenchViewsMenu
              storageKey={resolvedViews.storageKey}
              paramKeys={resolvedViews.paramKeys}
              emptyHint={resolvedViews.emptyHint}
              tableId={resolvedViews.layout ? binding.definition.tableId : undefined}
              layout={resolvedViews.layout}
            />
          </div>
        ) : null}
        {dateMenu ? <DataTableDateMenuControl {...dateMenu} /> : null}
        <DataTablePageSizeMenu
          pageSize={pageSize}
          pageSizes={SLOT_TABLE_PAGE_SIZES}
          onPageSizeChange={(size) => {
            if (!isSlotTablePageSize(size)) return;
            writeSlotTablePageSize(size);
            setPageSize(size);
          }}
        />
        {/* The order, left to right (operator ruling 2026-09-01, verbs 2026-09-04): */}
        <span className="ml-auto inline-flex shrink-0 items-center gap-1">
          {showExportGlyph ? exportControl : null}
          {fields && binding.definition.capabilities.fieldsMenu ? (
            <DataTableFieldsMenu {...fields} />
          ) : null}
          <DataTableZoomToggle />
          {/* Renders nothing at all off a desk stage — see the component. */}
          <DataTableFullscreenToggle />
        </span>
      </div> : null}
        <div
          {...{ [SLOT_TABLE_ACTION_ROW_ATTR]: '' }}
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
          loading={loading || searchPending}
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
    </SlotLayoutReorderProvider>
  );
}
