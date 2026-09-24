'use client';

/**
 * **The generic compound spreadsheet feed** — the engine half of a compound
 * {@link DataTable} mount, for any family.
 *
 * ## Why this exists (Phase 0 of the fork-port)
 *
 * `useOrdersSpreadsheet` was the only compound feed, and it is orders-shaped:
 * `ShippedOrder` rows, `OrdersQueueTableRow`, order assignment, a tracking
 * popover. So a family that wanted To-ship's two-line WMS row could not mount
 * it — the last port copied the ~150 lines around `DataTable` instead
 * (`DeadStockTable`, `SkuVelocityTable`, `SessionsReportTable`,
 * `InventoryEventsTable` are four copies of one file), and one of them wrote a
 * per-family cell map to get its faces back. Invariant 1 of
 * `table-engine-law.ts` forbids the cell map; this hook removes the reason
 * anybody wrote one.
 *
 * What a family supplies is exactly the five artifacts the acceptance test
 * allows — a row source, a field catalog, a resolver, a `row → CompoundRowView`
 * adapter, and its registry lines. Everything this hook does with them is an
 * {@link ENGINE_OWNED_SEAMS} concern: search over the MOUNTED facts, sort by
 * the sorted FACT, banding, row painting through the one {@link CompoundRow}.
 *
 * ## What it deliberately does NOT take
 *
 * No `renderRow`, no cell map, no comparator override, no per-family face hook.
 * Sorting compares the RESOLVED TEXT of the sorted fact, typed by the column's
 * own `slotDisplayType`; a family that needs a different order needs the fact
 * resolved differently, which is a resolver change every consumer of that fact
 * benefits from. That is invariant 3 in one sentence: if a mount needs
 * behaviour the engine lacks, the engine gains it for everyone or the mount
 * does without.
 *
 * ## Sort durability
 *
 * `sort` / `dir` / `onSortChange` are REQUIRED and owned by the caller, because
 * durability belongs in the URL (`?sort=`) and only the page knows the route it
 * writes to. Passing a frozen `sort` is the dead-header fork that made Shipped's
 * headers inert — pass a state setter, not a constant.
 */

import { useCallback, useMemo, useRef, type ReactNode } from 'react';
import { CompoundPlaneRow } from '@/components/tables/compound/CompoundPlaneRow';
import { compoundRowActivationProps } from '@/components/tables/compound/compound-row-activation';
import type { DataTableProps, DataTableSearch } from '@/components/tables/DataTable';
import type { TableSurfaceBinding } from '@/components/tables/table-surface-binding';
import type { SlotTableFieldsMenu } from '@/components/tables/useSlotTableLayout';
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
import type { SlotTrackFields } from '@/lib/tables/materialize-tracks';
import { slotSubtitlePartsFor, type LineQtyMeaning } from '@/lib/tables/slot-table-line-qty';
import { slotTableSearchFactIds } from '@/lib/tables/slot-table-search-vocabulary';

/**
 * Structural shape of a mounted compound column. Every family's column
 * interface already satisfies it — typing against a concrete family model is
 * what this hook exists to avoid.
 */
export interface CompoundSpreadsheetColumn extends SlotTrackFields {
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
  /** The MOUNTED model, materialized from the effective slot layout. */
  columns: readonly C[];
  /** Fields-picker data from `useSlotTableLayout`. */
  fields?: SlotTableFieldsMenu;
  rows: readonly Row[];
  getRowId: (row: Row) => string;
  /** The family's pure `row → CompoundRowView` adapter. */
  adapter: CompoundRowAdapter<Row>;
  /**
   * Bound under-title field ids from `useSlotTableLayout`. Compound morph
   * paints these inside the item cell — they are not tracks. When the adapter
   * already supplies `subtitleParts`, those win (family face: qty/money).
   */
  subtitleFieldIds?: readonly string[];
  /**
   * What the line qty MEANS here, which decides its tone. Defaults to
   * `order-line` (2+ warns — the pick-and-pack risk every outbound peer
   * paints); an on-hand count passes `on-hand` and stays quiet at every value.
   */
  lineQtyMeaning?: LineQtyMeaning;
  /**
   * Facts the family's ADAPTER paints that no track names — see
   * {@link slotTableSearchFactIds}. The Id track's second line
   * (`identitySubFace`) is the case this exists for.
   */
  adapterPaintedFieldIds?: readonly string[];
  /**
   * `(row, fieldId) → resolved fact`. The family's pure resolver, and the ONE
   * source for both the search index and the sort comparator — a search that
   * read different text than the sort would order a list by facts the operator
   * cannot see.
   */
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
  loading: boolean;
  emptyMessage: string;
  ariaLabel?: string;
  className?: string;
  /** Present ⇒ the title hover carries "Open" and the row reports the click. */
  onOpenRow?: (row: Row) => void;
  /**
   * The family's row VERBS, resolved per row.
   *
   * This is how a family stops needing an `actions` COLUMN. Every table that
   * arrived from `AdminTable` had one — a trailing cell of bespoke buttons
   * ("Revoke", "Unpair") — which is a per-family cell by another name, and the
   * reason those tables could never mount the shared row.
   *
   * Law §4 (`VERBS_BIND_TO_FIELDS`): a verb is declared once by the family and
   * its DIRECTION comes from row STATE, never from the route — which is exactly
   * what a per-row resolver expresses. Entries are label + callback, never JSX
   * (`CompoundRowAction`), so a bespoke control cannot reappear inside the
   * shared row wearing an action's name. Bulk is a cardinality, not a mode: this
   * is the same catalog at n=1.
   */
  rowActions?: (row: Row) => readonly CompoundRowAction[];
  selectionScope?: string;
  /**
   * The row SELECTION, when the family's capabilities declare `multiSelect`.
   *
   * Until this existed, a compound family could declare `multiSelect: true`,
   * pass a `selectionScope` (which reaches the column HEADER's select-all) and
   * still paint an inert gutter: the engine owns the row, so a family had
   * nowhere to hand it a checked state. That is the last reason a family
   * would have written its own row.
   *
   * It stays DATA + callbacks, never JSX
   * (`TABLE_ENGINE_LAW.descriptorCarriesDataNotBehavior`), and the gutter's
   * contextual face — triage marks at rest, the checklist square on hover, the
   * leading edge rail — remains the CELL's
   * (`SLOT_TABLE_PAINT_LAW.selectGutterStatus`). The family says which rows
   * are ticked; it never says how a tick looks.
   *
   * Omitted, or omitted while `multiSelect` is false, every row paints exactly
   * as it did.
   */
  selection?: {
    isSelected: (row: Row) => boolean;
    /** Receives the click's modifier state, so a family can offer a range walk. */
    onToggle: (row: Row, event: { shiftKey: boolean }) => void;
  };
  /**
   * Which BAND a row belongs to — the key {@link sectionHeaders} captions.
   *
   * Omitted ⇒ `singleBand`, exactly as before. That default is the whole point:
   * ~40 mounts already pass through this hook, and a banding rule the engine
   * invented for them would re-shape every one of those tables at once — a
   * silent behaviour change across the product is the failure mode, so banding
   * is something a family OPTS INTO.
   *
   * Band ORDER is the order band keys are first encountered in the ALREADY
   * SORTED row list, so a family controls it through its own sort (and the
   * operator's header click keeps meaning what it says) rather than through a
   * second ordering knob here that could disagree with the visible sort.
   *
   * The group model does not change: inside a band every row is still its own
   * singleton group, so no band grows a chevron it cannot fold.
   */
  bandBy?: (row: Row) => string;
  /**
   * Band key → section caption, forwarded straight onto the feed so
   * `<DataTable {...sheet} />` carries it with no call-site plumbing. A band
   * with no entry renders unlabelled — the caption is optional per band, not
   * all-or-nothing.
   */
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

/**
 * Lift an already-sorted row list into the grouped render order, banded.
 *
 * Pure and exported so the banding rule is testable without mounting React —
 * the hook around it is only memoization.
 *
 * With no `bandBy` this IS {@link singleBand}, by call and not by imitation:
 * the ~40 tables that never asked for bands must keep byte-identical order.
 * With one, bands come out in the order their keys are FIRST ENCOUNTERED in
 * `rows`, so the visible sort decides band order and nothing here can disagree
 * with the header the operator clicked. Row indices stay global, so a fold key
 * is unique across bands as well as within one, and a single band reduces to
 * `singleBand`'s own `#index` keys.
 */
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
  fields,
  rows,
  getRowId,
  adapter,
  subtitleFieldIds,
  lineQtyMeaning,
  adapterPaintedFieldIds,
  resolve,
  sortFactFor,
  capabilities,
  sort,
  dir,
  onSortChange,
  search,
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

  /**
   * The gutter control, or `null`. Gated on the CAPABILITY as well as the
   * callbacks: a family that passes a selection while its binding says
   * `multiSelect: false` would paint a checkbox the header's select-all cannot
   * reach, which is the "control with no verb behind it" the capability flag
   * exists to refuse.
   */
  const rowSelect =
    capabilities.multiSelect === true && selection ? selection : null;

  const sortFactByKey = useMemo(
    () => new Map<string, string | null>(columns.map((c) => [c.key, sortFactFor(c)])),
    [columns, sortFactFor],
  );

  /**
   * Every fact the operator can READ off a row — bound tracks ∪ the structural
   * facts the chrome tracks paint ∪ the under-title band. The law and its
   * reasoning live in {@link slotTableSearchFactIds}, which is a pure function
   * precisely so a test can pin it for all 47 peers at once.
   */
  const searchFactIds = useMemo(
    () =>
      slotTableSearchFactIds({
        columns,
        sortFactFor,
        subtitleFieldIds,
        adapterPaintedFieldIds,
      }),
    [columns, sortFactFor, subtitleFieldIds, adapterPaintedFieldIds],
  );

  /**
   * The one search box: a row matches when any readable fact's resolved text
   * contains the query. One resolver feeds this and the comparator, so the
   * search can never read different text than the sort orders by.
   *
   * ## Why `answeredBy: 'server'` skips it entirely
   *
   * This pass can only see the rows React is holding. On a surface whose rows
   * arrive WINDOWED — `/api/packerlogs?limit=1000`, `LIMIT 200` on To-ship,
   * a cursor page — a query that matches a record on an unloaded page finds
   * nothing here, and the table renders its no-results state for a record that
   * exists. That is the engine asserting an absence it has no standing to
   * assert.
   *
   * Such a surface declares {@link DataTableSearch.answeredBy} `'server'` and
   * spends `search.value` on its fetch key instead. `rows` are then ALREADY
   * the answer, and re-filtering them here would be a second, narrower pass
   * over a set that was matched by different (and better) rules — the server's
   * `ILIKE` over columns no track mounts. So the engine stands down.
   */
  const filtered = useMemo(() => {
    if (search.answeredBy === 'server') return [...rows];
    const q = search.value.trim().toLowerCase();
    if (!q) return [...rows];
    return rows.filter((row) =>
      searchFactIds.some((fact) => factText(resolve, row, fact).toLowerCase().includes(q)),
    );
  }, [rows, search.answeredBy, search.value, searchFactIds, resolve]);

  /**
   * Order by the SORTED FACT, never by the column key: track keys are slot
   * indices, so a comparator keyed to `status:3` would break the moment an org
   * rebinds it. Typing comes from the column's own `slotDisplayType`, so a date
   * fact orders as an instant and a number as a number, through the same
   * `compareGridValues` every other grid uses.
   */
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

  /**
   * One row, on the shared {@link CompoundRow}. There is no family row
   * component and no `renderRow` option: the adapter's view IS the family's
   * contribution, and everything else about the row is the same on every table.
   *
   * `onOpenRow` reaches the row TWICE, on purpose: as the hover menu's "Open"
   * item (`onOpen`) and as the row's own activation gesture
   * ({@link compoundRowActivationProps} — click on a single-select surface,
   * double-click where selection owns the click). The menu item alone left a
   * binding whose declared record plane was `navigate` unreachable by clicking
   * the row, which is the one gesture every operator tries first.
   */
  const paintRow = useCallback(
    (row: Row, visible: readonly C[]): ReactNode => {
      const activate = onOpenRow ? () => onOpenRow(row) : undefined;
      const adapted = adapter(row);
      const subtitleParts =
        adapted.subtitleParts ??
        (subtitleFieldIds && subtitleFieldIds.length > 0
          ? slotSubtitlePartsFor(
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
    fields,
    rows: sorted,
    getRowId,
    orderGroupsByDate: groups,
    sectionHeaders,
    loading,
    emptyMessage,
    search,
    sort,
    dir,
    onSortChange,
    // Law (`SLOT_TABLE_PAINT_LAW.headerSort`): every painted DATA header
    // click-sorts. A track with no sortable fact is exactly the transition case
    // the family's `sortFactFor` refuses, and chrome tracks carry no fieldId.
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
