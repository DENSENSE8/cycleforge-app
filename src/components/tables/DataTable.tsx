'use client';

/**
 * `DataTable` — the ONE way a table reaches a screen.
 *
 * ```text
 * ┌─────────────────────────────────────────────────────────┐
 * │ [ 🔍 search ]  [ ▽ filter ]  [ Paste ]  [ ↕ sort ]  [ views ] │  find · narrow · verbs · order
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
 *    rows, its columns, its tabs, its filter OPTIONS and its sort OPTIONS —
 *    data, never JSX. The column header is drawn here from `binding.columns`;
 *    there is no `renderColumnHeader` prop to fork it with.
 * 2. **No `ReactNode` chrome slots.** The shell this replaces offered `leading`,
 *    `right`, `trailing`, `views`, `extraControls`, `searchSlot` and a controls
 *    portal, which is how thirty desks each drew something different. A props
 *    object of *data* is the difference between one display and thirty.
 *    `renderRow` / `renderGroup` remain render props because a CELL is domain
 *    code (see `table-surface-binding.ts`) — a row is content, not chrome.
 * 3. **Search is session-local. Filters / tabs / sort may stay in the URL.**
 *    The find field is controlled by the caller as `{ value, onChange }` data.
 *    Parking it in `?search=` / `?q=` is a soft navigation per keystroke and
 *    remounts the table. Orders filter painted rows via
 *    `filterShippedOrdersByQuery`; other families filter in
 *    `useCompoundSpreadsheet`. Facets, stage, and `?sort=` remain URL state.
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
 * ## Selection tabs are FILTERS (operator ruling 2026-08-30)
 *
 * The operator overruled the old "a dropdown never replaces the strip" law in
 * writing: a bottom tab whose only job was narrowing the SAME row set
 * (To-ship's triage facets, Pickup's statuses, My Day's lanes, Tracking
 * Exceptions' states, Daily's Completed) is a filter wearing tab chrome, and
 * it now lives in the ONE filter control — and so do dataset-swapping mode
 * options where the operator ordered the strip gone entirely (To-ship's
 * `caged`, the FBA desk's Ready/Plan/Shipped): the URL contract is unchanged,
 * only the control moved. {@link DataTableProps.tabs} remains ONLY for the
 * strips not yet folded (Review's Packed/Shipped/History, Catalog's platform
 * sources, the station History bodies). Do not add a row-narrowing tab here
 * again.
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

import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
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
  SLOT_TABLE_OVERLAY_HOST_ATTR,
} from '@/components/tables/slot-table-overlay-host';
import { cn } from '@/utils/_cn';
import { HoverTooltip } from '@/components/ui/HoverTooltip';

/**
 * The QUICK DATE control — a peer of the filter, not a second toolbar.
 *
 * Period is the one refinement an operator changes without wanting to think
 * about anything else, so it sits beside the funnel as its own chip rather than
 * two clicks inside it (operator ruling 2026-08-31).
 *
 * The contract is a RANGE, not a list of presets. Presets alone could not
 * answer "the 14th to the 19th", and the house already owns the control that
 * does both — {@link DateRangePickerField} is a preset row over an inline
 * range calendar. The no-JSX-slots rule is intact: the caller passes a value
 * and a setter, and the table picks the component, so there is still one date
 * picker in the product rather than one per desk.
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
  /**
   * Which QUESTION this option answers, as a heading.
   *
   * The 2026-08-30 ruling folded the row-narrowing tab strips into this one
   * control, which was right — a tab that narrows rows is a filter. What it did
   * not settle is that some surfaces then handed the control more than one
   * axis: To-ship asks "why does this need attention" (exclusive facets that
   * reset each other) and "where is it in the pipeline" (stages that compose);
   * Amazon Prep adds "which body am I looking at" (three options that swap the
   * dataset). Rendered as one flat column those read as eight interchangeable
   * rows, so the operator has to remember which ones behave alike.
   *
   * Group them and the behaviour is legible before the click. Omit it and the
   * menu draws exactly as it did — a single ungrouped list.
   */
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

/**
 * One job verb on the LEFT toolbar cluster — data, never a ReactNode slot.
 *
 * Filter HIDES rows; these RUN an in-sheet job on the queue in view (Review
 * catalog-link paste). They sit after the funnel. Page-level verbs (exceptions
 * Resolve, create, sync) stay {@link DeskHeaderAction} in the header.
 * Exceptions Paste item # is the row Morphing menu — never this cluster.
 *
 * `paste` morphs the button into {@link SearchField}: paste and Enter commit
 * (`onSearch`); Escape restores the button. A click-only verb uses `onClick`.
 */
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

/**
 * One option in the toolbar sort control. Data — the caller owns the meaning.
 *
 * Filter HIDES rows; sort REORDERS the rows that remain. They are different
 * jobs, so they are different controls, but they share this chrome: one
 * popover, grouped options, a hot trigger that names the active answer.
 */
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

/**
 * Export the CURRENT view to a CSV file.
 *
 * The rows it writes are the ones on screen — after the search, the filter and
 * the date range — because that is what an operator means by "export this".
 * Selection-scoped export already exists as a bulk action in the rail; this is
 * the whole narrowed set, which the rail cannot express without asking someone
 * to select 800 rows first.
 *
 * On a desk the control is a labeled {@link DeskHeaderAction} in the header
 * cluster (`role="overall"`), left of the primary CTA — unless the surface
 * sets {@link DataTableProps.copyExportPlacement} to `'menu'`, in which case
 * the header button is omitted (To-ship tucks Export into the Sync dropdown).
 * The toolbar glyph is only the fullscreen / off-desk face — the header is
 * unrendered in fullscreen (`DeskPageChrome`), so the glyph is how export
 * stays reachable.
 *
 * Reuses the surface's existing `copyExport` shape rather than a second column
 * contract: the clipboard and the file should not disagree about which fields
 * an order has.
 *
 * `getRows` / `getShape` are refs behind a stable callback so the header
 * registrar does not re-register on every row-array identity change (that
 * loops the slot provider).
 */
/*
 * `DataTableExportButton` was DELETED with the configurable export (2026-09-02).
 *
 * It was the whole export: one click, every column, every rendered row. The
 * trigger it drew survives as the `renderHeaderTrigger` this file hands to
 * {@link DataTableExportMenu} — the control did not change, what it opens did.
 */

/**
 * The Fields picker, as DATA — the slot-layout half of the toolbar.
 *
 * A surface whose columns are materialized from a `SlotLayout`
 * (`src/lib/tables/`) passes its catalog options + a toggle; the menu itself
 * is drawn once, here, like the filter control beside it. No `ReactNode`
 * slots: what the picker lists and what a click does are both data, so thirty
 * desks cannot each draw a different picker.
 */
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

  /**
   * The one sort control (data, not a node). Omit and the table derives a
   * menu from sortable mounted columns so every desk gets the same chrome;
   * pass it when the surface adds named modes that are not column keys
   * (To-ship's Newest / Platform pin / USPS) — still include every DATA
   * column fact in `options` (see `queueColumnSortOptions`).
   */
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

  /**
   * Named saved views for this surface — data, never a ReactNode slot.
   * DataTable mounts {@link WorkbenchViewsMenu} immediately right of Sort.
   * Pass the existing `useSavedViews` storage key so stored rows import;
   * do not invent a second store.
   */
  views?: {
    storageKey: string;
    paramKeys: readonly string[];
    emptyHint?: string;
    /**
     * The mount's EFFECTIVE layout, so a saved view captures COLUMNS too.
     *
     * Params already round-trip through the URL; a slot layout cannot ride
     * there, so it is captured into the view record and republished to
     * `useSlotTableLayout` through `saved-view-layout-store`. Omit it and views
     * behave exactly as they did — params only.
     */
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
  //
  // This engine used to take `selectionActions` / `selectionActionLayout` /
  // `selectionActionCount` and paint them twice: a column-aligned foot
  // (`DataTableColumnActionRow`) under the grid, and a legacy Copy pill in the
  // status bar. Both were a second place to run a verb the ROW already owns —
  // CYC-82 put Assign on the first checkbox (`MorphingSelectGutter`), where
  // staff already are. One engine, so the strip comes off EVERY data table, not
  // off To-ship behind an opt-out flag: an opt-out is a fork with a prop for a
  // name. The status bar keeps the COUNT (`selected`), which is a fact, not a
  // verb; the rail still owns the long form at 3+.
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
  /**
   * Copy/export shape. On a desk the view-export control is a labeled
   * **Export** header action (`role="overall"`), left of the primary CTA —
   * unless {@link copyExportPlacement} is `'menu'`. The toolbar glyph remains
   * in fullscreen (header unrendered) and off a desk stage. Omit and neither
   * control is offered. Selection copy still uses this shape in the status bar.
   */
  copyExport?: DataTableExport<Row>;
  /**
   * Where the view-export control paints. `'header'` (default) is the labeled
   * desk-header button. `'menu'` hides that button so a desk (To-ship) can tuck
   * Export into its Sync dropdown via {@link downloadDataTableCsv} +
   * {@link DeskExportMenuRegistrar}. Fullscreen still gets the toolbar glyph.
   */
  copyExportPlacement?: 'header' | 'menu';
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
   *
   * Law (`SLOT_TABLE_PAINT_LAW.headerSort`): every painted DATA header must
   * return true here. Chrome (`select` / `actions` / `_fill` / `thumb`) stays
   * false. A labeled Status/Amount header that is not sortable is a fail.
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
    /**
     * Absolute ARIA index of the group's first leaf — the same stream
     * `renderRow` gets. Grouped bodies must forward it: a leaf row reads
     * `rowIndex != null` to know it is inside a table, so dropping it makes
     * every grouped row claim `role="checkbox"` instead of `role="row"`.
     */
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
}

/**
 * Serialize rows as CSV — what a FILE download expects.
 *
 * Separate from {@link toTsv} on purpose: the clipboard wants tabs (a paste
 * into a spreadsheet splits on them without an import dialog), a saved file
 * wants commas and RFC-4180 quoting. One function trying to be both would have
 * to pick a delimiter that is wrong in one of the two places.
 */
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
/**
 * EXPORTED for the one sanctioned off-table use: a desk body that is not yet
 * binding-backed (FBA's Shipped list) still owes its operators the same mode
 * filter the sibling bodies carry — one control, drawn from one
 * implementation, never a desk-local funnel fork.
 */
export function DataTableFilterMenu({
  options,
  onToggle,
  onClearAll,
}: DataTableFilterChrome) {
  const [open, setOpen] = useState(false);
  const activeOptions = options.filter((o) => o.active);
  const activeCount = activeOptions.length;
  const hot = activeCount > 0;
  // One active filter names itself on the trigger. A bare `1` is the count of
  // an answer, not the answer — it told the operator that they had filtered
  // without telling them what to, so recalling their own narrowing cost
  // reopening the menu. Two or more fall back to the count: there is no room
  // for a list, and by then the operator is holding a compound state anyway.
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
            // The SHARED popover face, not a second one. This used to add
            // `rounded-lg` + its own border/shadow/ring on top of the
            // primitive's flush chrome, so the filter menu and the fields menu
            // — two controls a thumb-width apart — disagreed about whether a
            // menu in this product has corners.
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

/**
 * The one SORT control — a peer of the filter, not a second toolbar.
 *
 * Groups (View · Columns · Platform · Carriers) are CATEGORY HEADINGS in one
 * list, the same banded-popover grammar as the filter next door. A pick here
 * reorders every row; a pick in the funnel hides some. Every click-sortable
 * DATA header is also a Columns row — header click and this menu share facts.
 *
 * The list is a combobox listbox ({@link ToolbarListboxOption}): dense rows,
 * trailing check on the selected value, full-width hover, arrow-key roving.
 * Eight or more options get a sticky filter. Platform / carrier rows paint
 * the same {@link MenuBrandIdentity} dots as the Order column (left) and
 * keep the check on the right. View rows have no identity.
 */
function DataTableSortMenu({
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

function DataTablePageSizeMenu({
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

/**
 * The **+** Fields picker — bind/unbind catalog facts into the surface's slot
 * bands, via the house shadcn Popover (`@/design-system/primitives/radix-popover`).
 *
 * One click binds or unbinds (open + → click → done, inside the interaction
 * budget); binding ORDER is click order — the layout stores an ordered array,
 * so an org that wants `qty · condition · note` under the title binds them in
 * that order. The org capture is deliberately TWO clicks (button → confirm):
 * it changes what every staffer in the org sees, which earns the one extra
 * confirmation the budget allows for the primary action.
 */
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

  // ↑/↓ on a bound row rewrites its band's BINDING order — display order IS
  // binding order, so this is the reorder affordance the append-only bind
  // gesture lacked (unbind/rebind is not a reorder). Rendered as siblings of
  // the toggle, never inside it: nested buttons are invalid DOM.
  /*
   * Bind / unbind only. The up-down arrow pair was removed 2026-08-31: ORDER is
   * now edited by dragging the column header itself, where the operator can see
   * what they are moving and what it lands between. Two arrows on a menu row
   * asked them to reorder a list by reading it, then verify by looking
   * somewhere else — and they cost two controls per row in a popover that is
   * already the densest thing on the desk.
   */
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
          {/*
            ONE wrapper, and the subtitle band leads (operator ruling
            2026-08-31). The bands used to be two sibling fragments with status
            first, which read as two lists that happened to share a popover —
            and it put the STATUS columns above the line that describes what
            sits under the title, inverting the row an operator is actually
            looking at. Order now mirrors the row: what is under the title
            first, the status columns after it.
          */}
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
  /**
   * The page's row ids, in render order — what Select-all may tick and what
   * the foot's "N selected" counts against.
   *
   * A numeric-looking key stays a NUMBER, because every selection hook that
   * predates junction families keys on one (`useTableSelectMode`,
   * `useReceivingRowSelection`). A key that is not a number (Stock's
   * `(location, sku, source)` triple) rides through as its string: coercing it
   * produced `NaN`, the filter dropped it, and the scope published an empty
   * page while rows were on screen — a select-all that ticked nothing and a
   * header checkbox that read "all" at one tick.
   */
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

  /**
   * The field registry, lifted from the legacy positional shape.
   *
   * Every desk passes `copyExport` — labels and values by position, no ids — so
   * bridging here is what lets the configurable panel work on all of them at
   * once instead of waiting on twenty per-desk migrations. A surface that wants
   * export-only facts graduates to a real registry later; the panel cannot tell
   * the difference.
   */
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
        <div className={cn(DESK_TABLE_SURFACE_CLASS, className)}>
      {/* ── One row, two controls ──────────────────────────────────────────── */}
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
          inputRef={(el) => {
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
        {/*
          The order, left to right (operator ruling 2026-09-01, verbs 2026-09-04):
          search · filter · actions · sort · views · date · page size — gap — columns · zoom · fullscreen.
          Job verbs that belong to the PAGE (exceptions Paste / Resolve) register
          DeskHeaderAction. DataTable `actions` is for in-sheet jobs that are not
          the desk primary (Review catalog-link paste). Export is a page-level
          overall action: labeled header button on a desk, toolbar glyph only in
          fullscreen or off-stage.

          Reading, NARROWING, ORDERING and named views live together on the left,
          next to the field they change. The right cluster changes how the
          sheet is DRAWN rather than what it holds or in what order, so the
          `ml-auto` gap is the seam between "what am I looking at" and "how am
          I looking at it" — the operator reaches to one side or the other,
          never scans the row.
        */}
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

      {/* ── The grid ───────────────────────────────────────────────────────── */}
      <div
        ref={gridHostRef}
        {...{ [SLOT_TABLE_OVERLAY_HOST_ATTR]: '' }}
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
          scrollToKey={findScrollToKey}
          bodyPrefix={bodyPrefix}
        />
      </div>

      <TableStatusBar
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={onTabChange}
        shown={paged.shown}
        total={paged.total}
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
