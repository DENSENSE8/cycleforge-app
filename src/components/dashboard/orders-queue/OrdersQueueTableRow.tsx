'use client';

import { gridDataCellClass } from '@/design-system/components/grid';
import { isCompoundColumnModel } from '@/components/tables/compound/compound-columns';
import { renderCompoundGridCell } from '@/components/tables/compound/CompoundGridCell';
import { ordersCompoundView } from '@/lib/orders/orders-compound-view';
import type { GridColumnDisplayPref } from '@/design-system/components/grid/grid-column-display';
import { Fragment, memo, useCallback, useRef, useState, type ReactNode } from 'react';
import { motion } from '@/design-system/motion';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { ChevronDown, Plus } from '@/components/Icons';
import { useRouter } from 'next/navigation';
import { useOrderIdentityCellNodes, OrderIdentityChips } from '@/components/ui/OrderIdentityChips';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { LedgerCellEditor } from '@/design-system/components/grid';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { ConditionSelectPopover } from './cell-editors';
import {
  RowTitle,
  RowMetaColumns,
  RowConditionMeta,
  QUEUE_ROW,
  metaIndentFor,
} from '@/components/ui/RowMetaColumns';
import { ledgerRowFillClass } from '@/components/ui/queue-row-chrome';
import {
  GridRowCheckbox,
  isEmptyGutterChrome,
  type GridSelectGutterChrome,
} from '@/components/ui/GridRowCheckbox';
import type { GridSurfaceCapabilities } from '@/design-system/components/grid';
import { isFbaOrder, marketplaceOrderUrl } from '@/utils/order-platform';
import { useOrderChannelLabel } from '@/hooks/useCatalog';
import {
  formatDateWithOrdinal,
  formatLaneAgeCompact,
  getLaneAgeHours,
  toPSTDateKey,
} from '@/utils/date';
import { isSkuSourceRecord } from '@/utils/source-dot';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import {
  ORDERS_QUEUE_COLUMNS,
  ORDERS_QUEUE_FROZEN_CELL,
  ordersQueueFrozenLeft,
  ordersQueueGridCell,
  ordersQueueGridTemplateFor,
  ordersQueueRowShellClass,
  type OrdersQueueColumn,
} from '@/lib/dashboard-order-row-layout';
import { conditionGradeTextClass, orderRowQtyTone } from '@/lib/condition-tone';
import { resolveOrderRowFlag } from '@/lib/orders/order-row-flags';
import { conditionGradeTableLabel, isEmptyMetaDash } from '@/lib/conditions';
import {
  formatQueueRowDateCell,
  formatSalePrice,
  queueRowShipBySource,
  queueRowTestedAtRaw,
  type OrdersQueueMode,
  type QueueRowRecord,
  type RowStatusMeta,
} from './helpers';
import {
  GridAgeCellValue,
  GridCellDash,
  GridDateCellValue,
  GridMonthDayTimeCellValue,
  GridStaffCellValue,
  GridStatusCellValue,
} from '@/components/ui/grid-cells';
import {
  PACK_BENCH_CHIP_TONE,
  packBenchShortLabel,
} from '@/lib/packing/pack-bench-display';
import { useOrderAssignment, type OrderAssignPayload } from '@/hooks/useOrderAssignment';
import { useTableDensity } from '@/hooks/useTableDensity';
import type { TableDensityClasses } from '@/lib/tables/table-density';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

export interface OrdersQueueTableRowProps {
  record: QueueRowRecord;
  isSelected: boolean;
  /** Multi-select on — lead checkbox toggles; click selects instead of opening. */
  selectMode: boolean;
  isChecked: boolean;
  isMobile: boolean;
  useAlternateStripe: boolean;
  testerDisplay: string;
  packerDisplay: string;
  testerId: number | null;
  packerId: number | null;
  rowStatus: RowStatusMeta;
  trackingAction?: React.ReactNode;
  serialChip?: React.ReactNode;
  daysLate: number | null;
  disableEnterAnimation?: boolean;
  disableLayoutAnimation?: boolean;
  /**
   * Opaque zebra bg (default false = translucent `/40`). Flat h-scroll surfaces
   * (the Pending grid view / any {@link LedgerGrid} consumer) MUST pass true: the
   * frozen identity pane inherits the row bg (`bg-inherit`), so a translucent
   * stripe lets the scrolling fact columns bleed through the pinned cells. Opaque
   * kills the bleed. The vertical shelf-board keeps the translucent look.
   */
  opaqueStripe?: boolean;
  /**
   * Airtable grid-view skin. Always-visible row-select checkbox in the gutter
   * via {@link onToggleSelect} + {@link selectGutterChrome}. Sheets-style
   * in-cell editors for condition / qty. Zebra still applies (opaque canvas /
   * card — required for the frozen identity pane). Off → display-only cells.
   * Notes · OOS · listing-link · open-row hover controls live on the record
   * plane (inspector), not in this collection map.
   */
  gridSkin?: boolean;
  /** Sheets click-select: row click toggles bulk; double-click opens. Gutter
   * still mounts a real checkbox (`selectGutterChrome='always'` on To-ship).
   */
  clickSelect?: boolean;
  /** Select-gutter face chrome — `'always'` paints the 16px checklist square. */
  selectGutterChrome?: GridSelectGutterChrome;
  /** Persisted Sheets row paint hex (selection wash wins when checked). */
  rowFillHex?: string | null;
  /**
   * Absolute `aria-rowindex` when this row sits inside a `role="table"` grid.
   * Supplied by the virtualizer via `renderRow`; only a WINDOW of rows is ever
   * in the DOM, so without it AT announces the wrong position. Omitted outside
   * a table — `role="row"` there would be an orphaned role.
   */
  rowIndex?: number;
  /** Toggle this row's selection from the gutter checkbox (stops propagation, so
   *  it never opens the record). Supplying it makes the gutter INTERACTIVE —
   *  required on grid skin so the leftmost cell is a real checkbox even when
   *  {@link clickSelect} also lets the row body toggle membership. */
  onToggleSelect?: (record: ShippedOrder, event: { shiftKey: boolean }) => void;
  queueMode?: OrdersQueueMode;
  /** Ordered VISIBLE column models (already sanitized + visibility-resolved).
   *  Default = canonical order. Header + rows + group summaries must receive
   *  the SAME list. */
  columns?: readonly OrdersQueueColumn[];
  /**
   * Per-staff column display prefs, resolved once by the host. Orders had no
   * access to these, so `gridColumnTextEmphasisClass` — a shared SoT — had
   * exactly one consuming family and a staffer's column emphasis stopped at
   * the edge of Unbox History.
   */
  columnDisplay?: Readonly<Record<string, GridColumnDisplayPref>>;
  /**
   * The MOUNTING SURFACE's declared capabilities — required, never defaulted.
   *
   * This row is rendered by two surfaces with different feature sets: the
   * outbound Queue grid (`ORDERS_GRID_CAPABILITIES`) and the Tech / Packer
   * history benches (`STATION_HISTORY_GRID_CAPABILITIES`). It used to import the
   * Orders bag directly, which meant a bench row resolved its fill against the
   * outbound triage vocabulary — a capability leaking in through a shared
   * component rather than being declared by the surface that owns it.
   *
   * It has no default for the same reason a safety classification never does:
   * a default is a silent opt-in that every call site you did not visit takes
   * automatically, and the compiler stays quiet about exactly the ones you
   * missed. Required makes a new mount answer the question.
   */
  capabilities: Pick<GridSurfaceCapabilities, 'rowTriageFlags'>;
  onRowClick: (
    record: ShippedOrder,
    event?: { shiftKey: boolean; detail?: number; target?: EventTarget | null },
  ) => void;
  /** Sheets click-select open gesture (double-click / Enter). */
  onRowOpen?: (record: ShippedOrder) => void;
  /**
   * Filled-tracking menu → "Replace tracking". Host arms the inspector intent
   * and opens `detail:order` (selection plane or openRecord). Omit to hide the
   * menu row (non–fulfillment/labels modes).
   */
  onRequestReplaceTracking?: (record: ShippedOrder) => void;
}

/** In-cell editors this row can host (one open at a time).
 *  `title` is deliberately absent — the product title is a read-only identity
 *  anchor in the collection map; correction lives at the record plane.
 *  Notes · listing link · OOS are record-plane only. */
type RowEditField = 'qty' | 'condition';

/** The identity payload {@link useOrderIdentityCellNodes} consumes. */
type OrderIdentityCellProps = Parameters<typeof useOrderIdentityCellNodes>[0];

/** Station rows carry a `scan_ref`; outbound rows do not. */
function rowScanRef(record: QueueRowRecord): string | null {
  const raw = (record as QueueRowRecord & { scan_ref?: unknown }).scan_ref;
  return typeof raw === 'string' && raw ? raw : null;
}

/**
 * The tracks that carry no fact — the structural slack column, and any key a
 * mounted model declares that its cell registry does not claim.
 *
 * Shared by BOTH column models (the compound map below and the flat switch in
 * {@link OrdersQueueFlatRowCells}) so the sheet's leftover width cannot be
 * painted two ways depending on which model happens to be mounted.
 */
function renderStructuralCell(
  col: OrdersQueueColumn,
  rule: boolean,
  cellClass: (col: OrdersQueueColumn, rule?: boolean) => string,
): ReactNode {
  if (col.key === '_fill') {
    // Structural slack track — empty header/body; never a fact column.
    return (
      <div
        data-col="_fill"
        role="presentation"
        aria-hidden
        className={cn(cellClass(col, false), 'min-h-0')}
      />
    );
  }
  return <span className={cellClass(col, rule)} />;
}

/**
 * `grid-template-columns` for a mounted column model, cached ON that model.
 *
 * The template is a pure function of the resolved column array — same tracks,
 * same widths, same string — but it was rebuilt per ROW per render: seven
 * `gridColumnTrackRem` + `densityScaledRem` calls and a join, 62 times over,
 * for one string every row in the window shares. The host already hands every
 * row the SAME array instance (`renderRow`'s `visible`), so the array itself is
 * the cache key and a resize (which mints a new model) misses by construction.
 */
const ROW_GRID_TEMPLATE_CACHE = new WeakMap<readonly OrdersQueueColumn[], string>();

function rowGridTemplate(columns: readonly OrdersQueueColumn[]): string {
  const cached = ROW_GRID_TEMPLATE_CACHE.get(columns);
  if (cached !== undefined) return cached;
  const template = ordersQueueGridTemplateFor(columns);
  ROW_GRID_TEMPLATE_CACHE.set(columns, template);
  return template;
}

/**
 * The row shell's DOM contract — the chrome half of a row (box, roles, paint,
 * gestures), declared explicitly rather than as `ComponentPropsWithoutRef`.
 *
 * Explicit because it is spread into BOTH a plain `div` and `motion.div`, and
 * the full div prop bag carries keys (`onAnimationStart`, `onDrag`, `style`)
 * whose motion counterparts have incompatible signatures. Naming only what the
 * row actually sets keeps one object valid for both hosts.
 */
interface OrdersQueueRowShellProps {
  'aria-rowindex'?: number;
  'aria-selected'?: boolean;
  'aria-checked'?: boolean;
  'aria-pressed'?: boolean;
  'aria-label': string;
  'data-order-row-id': string;
  role: React.AriaRole;
  tabIndex: number;
  className: string;
  style?: React.CSSProperties;
  onClick: React.MouseEventHandler<HTMLDivElement>;
  onDoubleClick: React.MouseEventHandler<HTMLDivElement>;
  onMouseDown: React.MouseEventHandler<HTMLDivElement>;
  onKeyDown: React.KeyboardEventHandler<HTMLDivElement>;
  children: ReactNode;
}

/**
 * The row shell WITH motion attached — mount presence, layout animation, and
 * the board/list hover lift.
 *
 * It is a component rather than a branch inside the row because the three
 * `useReducedMotion` bridges are HOOKS: a row that animates nothing still paid
 * for them, and still mounted a `motion.div` whose eleven context subscriptions
 * (layout group, presence, config, …) exist to drive animation that is turned
 * off. The Sheets grid disables presence AND layout AND the hover lift, so on
 * the To-ship desk every one of those was overhead for movement that cannot
 * happen — 62 rows' worth on first paint.
 *
 * This is a BRANCH, not a retirement: the station history benches keep layout
 * animation, the board keeps the hover lift, and both land here unchanged.
 */
function AnimatedOrdersQueueRowShell({
  animatePresence,
  animateLayout,
  hoverLift,
  ...shell
}: OrdersQueueRowShellProps & {
  animatePresence: boolean;
  animateLayout: boolean;
  /** Board / list rows nudge on hover; the grid skin never does. */
  hoverLift: boolean;
}) {
  const rowPresence = useMotionPresence(framerPresence.tableRow);
  const mountTransition = useMotionTransition(framerTransition.tableRowMount);
  const layoutTransition = useMotionTransition(framerTransition.chipColumnLayout);
  return (
    <motion.div
      layout={animateLayout}
      layoutScroll={animateLayout}
      {...(animatePresence ? rowPresence : {})}
      transition={
        animatePresence || animateLayout
          ? {
              ...(animateLayout ? { layout: layoutTransition } : {}),
              ...(animatePresence ? { opacity: mountTransition, y: mountTransition } : {}),
            }
          : undefined
      }
      whileHover={hoverLift ? { x: 2 } : undefined}
      whileTap={hoverLift ? { scale: 0.998 } : undefined}
      {...shell}
    />
  );
}

/**
 * The FLAT (one-line spreadsheet) cells + the mobile stacked row.
 *
 * ## Why this is a component and not a block inside the row
 *
 * Every hook this row owned served this half of it — the channel resolver, the
 * identity chip nodes, the clipboard history behind the paste chip, the assign
 * mutation behind the in-cell editors, the editor state, the router behind the
 * "no label yet" jump. Eighteen of the row's twenty-two hooks, and NONE of them
 * can reach a cell under the compound model, which is what To-ship mounts. A
 * hook cannot be skipped by an `if`, so the only way to stop paying for it is
 * for the code that needs it to be a child that the compound path never
 * renders.
 *
 * It is not a fork of the row: the shell (box, roles, paint, gestures) stays in
 * {@link OrdersQueueTableRow} and both models render THROUGH it. What differs
 * here is only which cells fill it.
 */
interface OrdersQueueFlatRowCellsProps {
  record: QueueRowRecord;
  columns: readonly OrdersQueueColumn[];
  /** The row's resolved cell-class waist (rule + inset + per-staff display). */
  cellClass: (col: OrdersQueueColumn, rule?: boolean) => string;
  isMobile: boolean;
  gridSkin: boolean;
  selectMode: boolean;
  clickSelect: boolean;
  selectGutterChrome: GridSelectGutterChrome;
  isChecked: boolean;
  queueMode: OrdersQueueMode;
  rowStatus: RowStatusMeta;
  /** Already capability-gated by the row — `null` means "surface says no". */
  rowFlag: ReturnType<typeof resolveOrderRowFlag>;
  daysLate: number | null;
  testerDisplay: string;
  trackingAction?: React.ReactNode;
  serialChip?: React.ReactNode;
  densityClasses: TableDensityClasses;
  onToggleSelect?: (record: ShippedOrder, event: { shiftKey: boolean }) => void;
  onRequestReplaceTracking?: (record: ShippedOrder) => void;
}

function OrdersQueueFlatRowCells({
  record,
  columns,
  cellClass: dataCell,
  isMobile,
  gridSkin,
  selectMode,
  clickSelect,
  selectGutterChrome,
  isChecked,
  queueMode,
  rowStatus,
  rowFlag,
  daysLate,
  testerDisplay,
  trackingAction,
  serialChip,
  densityClasses,
  onToggleSelect,
  onRequestReplaceTracking,
}: OrdersQueueFlatRowCellsProps) {
  const orderChannelLabel = useOrderChannelLabel();
  const router = useRouter();
  const assignOrder = useOrderAssignment();
  const [editing, setEditing] = useState<RowEditField | null>(null);
  const [editSeed, setEditSeed] = useState<string | null>(null);
  const conditionCellRef = useRef<HTMLDivElement | null>(null);

  const qty = parseInt(String(record.quantity || '1'), 10) || 1;
  const trackingRaw =
    (record.tracking_number as string | undefined) ||
    record.shipping_tracking_number ||
    '';

  // In-cell editing is a Pending-grid affordance: board/Packed/station rows
  // stay display-only. Selection no longer competes with editing — the grid's
  // left gutter is always-on (checkbox toggles; row body opens), so editors
  // stay armed regardless of `selectMode`.
  const gridEditable = gridSkin && !isMobile;

  const closeEditor = useCallback(() => {
    setEditing(null);
    setEditSeed(null);
  }, []);

  const openEditor = useCallback((field: RowEditField, seed: string | null = null) => {
    setEditSeed(seed);
    setEditing(field);
  }, []);

  // One mutation waist for every editor — optimistic patch + rollback live in
  // useOrderAssignment; editors never add their own mutation hooks.
  const commitAssign = useCallback(
    (payload: Omit<OrderAssignPayload, 'orderId'>, okMessage: string, failMessage: string) => {
      const id = Number(record.id);
      if (!Number.isFinite(id)) return;
      assignOrder.mutate(
        { orderId: id, ...payload },
        {
          onSuccess: () => toast.success(okMessage),
          onError: (e) => toast.error(e instanceof Error ? e.message : failMessage),
        },
      );
    },
    [assignOrder, record.id],
  );

  const onPasteTracking = useCallback(
    (value: string) => {
      const id = Number(record.id);
      if (!Number.isFinite(id)) return;
      assignOrder.mutate(
        { orderId: id, shippingTrackingNumber: value },
        {
          onSuccess: () => toast.success('Tracking pasted from clipboard'),
          onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to save tracking'),
        },
      );
    },
    [assignOrder, record.id],
  );

  const conditionValue = String(record.condition || '').trim();
  const conditionLabel = conditionGradeTableLabel(conditionValue);
  const conditionEmpty = isEmptyMetaDash(conditionLabel);

  /**
   * The identity payload — the `order` / `tracking` cells and the mobile chip
   * cluster. Under COMPOUND the identity rides the `fulfillment` track, which
   * reads the compound view instead, and this component is never rendered.
   */
  const identityChipProps: OrderIdentityCellProps = {
    // The channel is carried by the ORDER cell's brand dot (the identity
    // language: dot, never a type glyph) and named in full on the chip's hover
    // label. One fact, one place — the row needs no channel track of its own.
    platformLabel: orderChannelLabel(record.order_id || '', record.account_source),
    productPageUrl: null,
    marketplaceOrderUrl: marketplaceOrderUrl(record.order_id, record.account_source),
    isFba: isFbaOrder(record.order_id, record.account_source),
    orderId: record.order_id || '',
    hideOrderId: isSkuSourceRecord({
      orderId: record.order_id,
      accountSource: record.account_source,
      trackingType: record.tracking_type,
      scanRef: rowScanRef(record) ?? trackingRaw,
    }),
    tracking: trackingRaw,
    carrierHint: record.carrier ?? null,
    trackingAction,
    onPasteTracking:
      queueMode === 'fulfillment' || queueMode === 'labels' ? onPasteTracking : undefined,
    onEditTracking:
      queueMode === 'fulfillment' || queueMode === 'labels'
        ? onRequestReplaceTracking
          ? () => onRequestReplaceTracking(record)
          : undefined
        : undefined,
    serialChip,
    // **There is no glyph face in the table engine.** The leading mark on a grid
    // identity cell is the brand DOT — the house identity law — so this is not a
    // choice a column gets to make any more.
    //
    // It used to be derived from `omitCellIcon`, which read as principled but
    // was a fork with a trapdoor: a column model that simply did not declare
    // `order`/`tracking` keys (the compound layout does not) fell through to the
    // `'icons'` default and silently painted the `#` hash and the MapPin next to
    // Unbox History's dots. A default that decides identity language is not a
    // default, it is a second answer waiting for a caller who forgets to ask.
    variant: 'plain',
    // No platform column on this surface — order + tracking only.
    showPlatform: false,
  };

  // Chip nodes built once per row; the registry places each in its own cell so
  // order / tracking survive any column order.
  const identityNodes = useOrderIdentityCellNodes(identityChipProps);

  // Mobile keeps the right-packed icon cluster (order + tracking; no platform).
  const chipsNode = isMobile ? (
    <OrderIdentityChips {...identityChipProps} isMobile={isMobile} />
  ) : null;

  // ── Lateness / ship-by — the FLAT `age` cell and the mobile meta row ──────
  // `toPSTDateKey` → `formatDateWithOrdinal` and `formatQueueRowDateCell` are
  // Intl work, once per row per render. COMPOUND carries lateness on its own
  // `state` track (from the same `daysLate` prop) and has no ship-by cell at
  // all, which is why none of this is reachable from there any more; the date
  // node is mobile-only in either model.
  const hasTester = Boolean(
    (record.test_date_time || record.test_activity_at) &&
      String(record.test_date_time || record.test_activity_at).trim(),
  );
  const testedAt = record.test_date_time || record.test_activity_at || null;
  const packedAt = record.packed_at || record.pack_activity_at || null;
  const laneAgeSource =
    packedAt || (hasTester ? testedAt : null) || record.created_at || record.deadline_at || null;
  const laneAgeLabel = formatLaneAgeCompact(laneAgeSource);
  const laneAgeHours = getLaneAgeHours(laneAgeSource);
  const showLaneAge = Boolean(laneAgeLabel) && daysLate === null;

  const deadlineKey = toPSTDateKey(record.deadline_at);
  const deadlineLabel = deadlineKey ? formatDateWithOrdinal(deadlineKey) : null;
  const dateCellData = isMobile ? formatQueueRowDateCell(queueRowShipBySource(record)) : null;
  const ageTooltip =
    daysLate !== null
      ? [
          `${daysLate} day${daysLate === 1 ? '' : 's'} past ship-by`,
          deadlineLabel ? deadlineLabel : null,
          laneAgeLabel ? `in lane ${laneAgeLabel}` : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : laneAgeLabel
        ? `In lane ${laneAgeLabel}`
        : '';

  const salePrice = isMobile ? formatSalePrice(record.sale_amount, record.currency) : null;

  const dateNode = isMobile ? (
    <GridDateCellValue
      label={dateCellData?.label}
      tooltip={dateCellData?.tooltip}
      className={densityClasses.metaText}
    />
  ) : null;

  // Mobile meta: days-late + lane-age fallback. Desktop Late column is
  // days-late only (ship-by civil date stays in the tooltip).
  const ageNode = isMobile ? (
    <GridAgeCellValue
      daysLate={daysLate}
      laneAgeLabel={showLaneAge ? laneAgeLabel : null}
      laneAgeHours={laneAgeHours}
      tooltip={ageTooltip}
      className={densityClasses.metaText}
    />
  ) : null;

  // ── Navigate-mode cell trigger (the adopted Sheets keyboard contract) ────
  // Click → edit (stopPropagation so the row doesn't open); Enter/F2 → edit
  // preserving content; a printable char → edit REPLACING content; Esc clears
  // cell focus. Absent when the surface isn't grid-editable, so clicks fall
  // through to the row (open / select-toggle).
  const cellTriggerProps = (field: RowEditField, opts: { typing?: boolean; label: string }) =>
    gridEditable
      ? {
          tabIndex: 0,
          'aria-label': opts.label,
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            openEditor(field);
          },
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === 'F2') {
              e.preventDefault();
              e.stopPropagation();
              openEditor(field);
            } else if (
              opts.typing &&
              e.key.length === 1 &&
              !e.ctrlKey &&
              !e.metaKey &&
              !e.altKey
            ) {
              e.preventDefault();
              e.stopPropagation();
              openEditor(field, e.key);
            } else if (e.key === 'Escape') {
              e.stopPropagation();
              (e.currentTarget as HTMLElement).blur();
            }
          },
        }
      : {};

  /**
   * The flag's dot — the tint's non-colour carrier.
   *
   * A row wash alone fails anyone with a colour-vision deficiency and fails
   * everyone on a washed-out warehouse monitor, and it cannot say WHICH tag it
   * is or who set it. The dot carries the tone, the tooltip carries the word,
   * the author, and what the tag means, so the shared vocabulary stays shared.
   */
  const flagIndicator = rowFlag ? (
    <HoverTooltip
      label={[
        `${rowFlag.label} — ${rowFlag.hint}`,
        record.row_flag?.by ? `Set by ${record.row_flag.by}` : null,
      ]
        .filter(Boolean)
        .join(' · ')}
      focusable={false}
    >
      <span className={cn('h-2 w-2 shrink-0 rounded-full', rowFlag.dotClass)}>
        <span className="sr-only">{`Flagged ${rowFlag.label}`}</span>
      </span>
    </HoverTooltip>
  ) : null;

  // Select cell — full-track hit plane + centered checklist face via
  // GridRowCheckbox (To-ship keeps clickSelect row gestures; any click in this
  // column toggles — operators need not aim at the 16px square).
  const leadControls = (
    <div
      data-select-gutter
      className={cn(
        ordersQueueGridCell({ inset: 'none', rule: true }),
        isEmptyGutterChrome(selectGutterChrome) ? 'items-stretch p-0' : 'justify-center',
        ORDERS_QUEUE_FROZEN_CELL,
      )}
      style={{ left: ordersQueueFrozenLeft('select') }}
      onClick={(e) => (selectMode || gridSkin || clickSelect) && e.stopPropagation()}
    >
      {gridSkin || selectMode || clickSelect ? (
        onToggleSelect ? (
          <GridRowCheckbox
            checked={isChecked}
            onToggle={() => onToggleSelect(record, { shiftKey: false })}
            label={isChecked ? 'Deselect row' : 'Select row'}
            chrome={selectGutterChrome}
          />
        ) : (
          <span
            className={cn(
              'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
              isChecked
                ? 'border-accent-bg bg-accent-bg text-text-inverse'
                : 'border-border-default bg-surface-card',
            )}
            aria-hidden
          />
        )
      ) : (
        <span className="h-4 w-4 shrink-0" aria-hidden />
      )}
    </div>
  );

  // ── Per-column cell registry (desktop) ───────────────────────────────────
  // The ONLY desktop cell render path: header, rows, and group summaries map
  // over the same ordered list, so reorder is a list change — not a CSS trick.
  const renderDesktopCell = (col: OrdersQueueColumn, last: boolean): ReactNode => {
    const rule = !last;
    switch (col.key) {
      case 'select':
        return leadControls;
      case 'title':
        return (
          <div
            data-col="title"
            // Identity column — collection-map read-only
            // (`isGridColumnInCellEditable` / GRID_IDENTITY_COLUMN_KEYS). The
            // product title is a catalog fact + this row's identity anchor; a
            // text caret (click / Enter / F2 / printable) put a destructive
            // typo one keystroke away. Correction happens at the record plane.
            // No focus ring on the title itself: the ring is the tell that a
            // cell edits, and clicks must fall through to the row (open record).
            className={cn(dataCell(col, rule), ORDERS_QUEUE_FROZEN_CELL, 'gap-1.5')}
            style={{ left: ordersQueueFrozenLeft('title') }}
            data-frozen-edge
          >
            {flagIndicator}
            {/* Status chip lives in the Status column on gridSkin; board/mobile keep the title-dot. */}
            {!gridSkin ? (
              <HoverTooltip label={`${rowStatus.label} — ${rowStatus.description}`} focusable={false}>
                <span className={cn('h-2 w-2 shrink-0 rounded-full', rowStatus.dot)} />
              </HoverTooltip>
            ) : null}
            <span className="min-w-0 flex-1 truncate text-role-data text-text-default">
              {record.product_title || 'Unknown Product'}
            </span>
          </div>
        );
      case 'condition': {
        // Unbox flush grade face — uppercase table label + conditionGradeTextClass.
        // Editable → ConditionSelectPopover (same editor as the old Product chip).
        const gradeFace = conditionEmpty ? (
          <GridCellDash />
        ) : (
          <span
            className={cn(
              'min-w-0 truncate text-role-eyebrow uppercase',
              conditionGradeTextClass(conditionValue),
            )}
          >
            {conditionLabel}
          </span>
        );
        return (
          <div
            data-col="condition"
            ref={conditionCellRef}
            className={cn(dataCell(col, rule), gridEditable && 'group/cond')}
          >
            {gridEditable ? (
              <button
                type="button"
                aria-label={
                  conditionEmpty
                    ? 'Set condition'
                    : `Change condition — ${conditionLabel}`
                }
                aria-haspopup="listbox"
                aria-expanded={editing === 'condition'}
                onClick={(e) => {
                  e.stopPropagation();
                  openEditor('condition');
                }}
                className={cn(
                  'ds-raw-button inline-flex min-w-0 max-w-full items-center gap-0.5 rounded transition-colors',
                  focusRing('cell'),
                )}
              >
                {gradeFace}
                <ChevronDown
                  className="h-3 w-3 shrink-0 text-text-faint opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-visible/cond:opacity-100 group-hover/cond:opacity-100"
                  aria-hidden
                />
              </button>
            ) : (
              gradeFace
            )}
          </div>
        );
      }
      case 'age':
        // Display-only derived days late — ship-by correction lives on the
        // record plane, not as an in-cell edit on this urgency track.
        return (
          <div
            data-col="age"
            className={cn(dataCell(col, rule), ORDERS_QUEUE_FROZEN_CELL)}
            style={{ left: ordersQueueFrozenLeft('age') }}
          >
            <GridAgeCellValue
              daysLate={daysLate}
              tooltip={ageTooltip}
              className={densityClasses.metaText}
            />
          </div>
        );
      case 'tester':
        // TESTED lane (plan §9): scan actor → assignee → staff-id lookup, all
        // normalized upstream into `testerDisplay` ('---' when truly missing).
        return (
          <div data-col="tester" className={dataCell(col, rule)}>
            <GridStaffCellValue name={testerDisplay} className={densityClasses.metaText} />
          </div>
        );
      case 'testedAt': {
        const testedAtRaw = queueRowTestedAtRaw(record);
        return (
          <div data-col="testedAt" className={dataCell(col, rule)}>
            {testedAtRaw ? (
              <GridMonthDayTimeCellValue
                raw={testedAtRaw}
                className={cn('text-text-muted', densityClasses.metaText)}
              />
            ) : (
              <GridCellDash />
            )}
          </div>
        );
      }
      case 'packStation': {
        // Bench label resolves from the SoT (`Station 2` / `Staging`), never a
        // cell-local regex — this hand-rolled its own `QA ` strip until
        // 2026-08-10, so it drifted from the chip row showing the same benches.
        // `GridStatusCellValue` falls back to `GridCellDash` on an empty value,
        // so an unstaged order needs no branch of its own.
        const benchName = record.pack_location_name;
        return (
          <div data-col="packStation" className={dataCell(col, rule)}>
            <GridStatusCellValue
              label={
                benchName
                  ? packBenchShortLabel({
                      locationName: String(benchName),
                      locationKind: String(record.pack_location_kind || ''),
                    })
                  : null
              }
              toneClass={PACK_BENCH_CHIP_TONE}
              tooltip={benchName ? `Staged at ${benchName}` : null}
            />
          </div>
        );
      }
      case 'qty':
        return (
          <div
            data-col="qty"
            className={cn(dataCell(col, rule), gridEditable && cn('relative', focusRing('cell')))}
            {...cellTriggerProps('qty', { typing: true, label: `Edit quantity (${qty})` })}
          >
            {/* Same type scale as the Date / Age cells — numerals must not
                read a step smaller than their neighbor facts. */}
            <span
              className={cn(
                'min-w-0 truncate tabular-nums normal-case tracking-normal',
                orderRowQtyTone(qty),
                densityClasses.metaText,
              )}
            >
              {qty}
            </span>
            {editing === 'qty' && gridEditable ? (
              <LedgerCellEditor
                variant="number"
                min={1}
                initialValue={String(qty)}
                replaceWith={editSeed}
                ariaLabel="Edit quantity"
                onCommit={(next) =>
                  commitAssign({ quantity: next }, 'Quantity updated', 'Failed to update quantity')
                }
                onClose={closeEditor}
              />
            ) : null}
          </div>
        );
      case 'order':
        // Identity pane — order stays pinned with ship-by + product while
        // qty…tracking scroll. Read-only in the collection map for the same
        // reason `title` is: correction happens at the record plane. No focus
        // ring — clicks fall through to open the row.
        return (
          <div
            data-col="order"
            className={cn(dataCell(col, rule), ORDERS_QUEUE_FROZEN_CELL)}
            style={{ left: ordersQueueFrozenLeft('order') }}
          >
            {identityNodes.order}
          </div>
        );
      case 'tracking':
        // Pending grid: a row with no tracking has no label yet — that's a
        // different status, surfaced as a compact soft-accent + icon that
        // jumps to the outbound label station (`/shipping?open=`) to print.
        // Icon-only keeps the tracking track as narrow as last-8 chips.
        // The paste-from-clipboard chip stays a Labels/board-only tool.
        return (
          <div data-col="tracking" className={dataCell(col, rule)}>
            {gridSkin && !trackingRaw ? (
              <HoverTooltip label="No label yet — create it at the shipping station" focusable={false}>
                <button
                  type="button"
                  data-add-label
                  aria-label={`Create shipping label — order ${record.order_id || record.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    router.push(`/shipping?open=${record.id}`);
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                  className={cn(
                    'ds-raw-button inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1 ring-inset transition-colors',
                    'bg-surface-accent text-text-accent ring-border-accent hover:bg-surface-accent/80',
                    focusRing('cell'),
                  )}
                >
                  <Plus className="h-3 w-3" aria-hidden />
                </button>
              </HoverTooltip>
            ) : (
              identityNodes.tracking
            )}
          </div>
        );
      case '_fill':
      default:
        // Slack track / unclaimed key — one face, shared with the compound map.
        return renderStructuralCell(col, rule, dataCell);
    }
  };

  return (
    <>
      {isMobile ? (
        <>
          <div className="flex min-w-0 flex-col">
            <RowTitle
              leading={selectMode ? leadControls : undefined}
              dot={rowStatus.dot}
              dotTitle={`${rowStatus.label} — ${rowStatus.description}`}
              title={record.product_title || 'Unknown Product'}
            />
            <RowMetaColumns
              indent={metaIndentFor('default', selectMode)}
              qty={<span className={orderRowQtyTone(qty)}>{qty}</span>}
              condition={<RowConditionMeta condition={record.condition} />}
              rest={
                <>
                  {salePrice ? (
                    <span className="normal-case tracking-normal text-text-success">{salePrice}</span>
                  ) : null}
                  {dateNode}
                  {ageNode}
                </>
              }
            />
          </div>
          {chipsNode}
        </>
      ) : (
        // Fragments (no DOM) keep every cell a DIRECT grid child — the airtable
        // skin's `[data-order-row-id] > *` border rules depend on it.
        columns.map((col, i) => (
          <Fragment key={col.key}>{renderDesktopCell(col, i === columns.length - 1)}</Fragment>
        ))
      )}

      {/* Cell-anchored editor popovers (body-portaled — never clipped). */}
      {editing === 'condition' && gridEditable ? (
        <ConditionSelectPopover
          anchorRef={conditionCellRef}
          current={conditionValue || null}
          onSelect={(value) =>
            commitAssign(
              { condition: value },
              value ? 'Condition updated' : 'Condition cleared',
              'Failed to update condition',
            )
          }
          onDone={closeEditor}
        />
      ) : null}
    </>
  );
}

/**
 * Pending / fulfillment queue row — Sheets-like WMS grid:
 *   select(☐) · order · age · product · cond · qty · tracking
 * Every fact owns a track; cells render through a per-column registry mapped
 * over ONE ordered column list, so drag-reorder is a list change — header,
 * rows, and group summaries can never disagree (`columns` prop).
 *
 * That list arrives already RESOLVED to the visible tracks
 * (`LedgerGridSurface` visibility resolution), so a hidden column loses its
 * TRACK — this row never re-tests hidden-ness per cell (the old cell-granular
 * `useIsColumnHidden` path left a dead empty ruled band where the column was).
 *
 * Grid skin keeps condition / qty in-cell editing. Notes · OOS · listing link
 * · open-row affordances are record-plane only (inspector). Identity uses
 * SoT `OrderIdChip` / `TrackingChip` (Hash / MapPin icons); no platform chip.
 */
export const OrdersQueueTableRow = memo(function OrdersQueueTableRow({
  record,
  isSelected,
  selectMode,
  isChecked,
  useAlternateStripe,
  testerDisplay,
  packerDisplay: _packerDisplay,
  testerId: _testerId,
  packerId: _packerId,
  rowStatus,
  trackingAction,
  serialChip,
  daysLate,
  isMobile,
  disableEnterAnimation = false,
  disableLayoutAnimation = false,
  opaqueStripe = false,
  gridSkin = false,
  clickSelect = false,
  selectGutterChrome = 'always',
  rowFillHex = null,
  rowIndex,
  onToggleSelect,
  queueMode = 'fulfillment',
  columns = ORDERS_QUEUE_COLUMNS,
  columnDisplay,
  capabilities,
  onRowClick,
  onRowOpen,
  onRequestReplaceTracking,
}: OrdersQueueTableRowProps) {
  /**
   * WHICH COLUMN MODEL is mounted — this row's one layout discriminant.
   *
   * `columns` arrives as either the FLAT spreadsheet model
   * (`ORDERS_QUEUE_COLUMNS` / `…_TESTED_COLUMNS`) or its COMPOUND two-row
   * sibling (`ORDERS_COMPOUND_COLUMNS`). They are sibling ARRAYS, never a mix,
   * so one `isCompoundColumnModel` probe answers it. Mobile never maps `columns` at
   * all — it paints the chip cluster + meta row — so it is FLAT by definition
   * whatever model the host happened to pass.
   *
   * The two models paint DISJOINT payloads, and everything below is derived per
   * row per render. To-ship mounts COMPOUND, so the whole flat identity payload
   * (chip props, marketplace URL, FBA test, carrier brand dot, the Intl
   * ship-by / lateness formatting) was being built for every row in the window
   * to feed cells that do not exist there — and, mounted flat,
   * `ordersCompoundView` is the same waste pointed the other way.
   *
   * This gates the DERIVATION only. What each model renders is unchanged.
   */
  const compoundLayout = !isMobile && isCompoundColumnModel(columns);

  const { classes: densityClasses } = useTableDensity();
  const isStagedRow = queueMode === 'staged' || queueMode === 'shipped';

  // Zebra is OFF under the airtable skin. That skin already draws a full cell
  // rule grid (right + bottom on every cell) inside a raised card frame, so a
  // stripe is a THIRD separation system — and its fill (`surface-canvas`) is a
  // page-canvas value tuned as a ground plane for floating cards, not a row
  // tint, so at that luminance step the shaded rows read as a different
  // surface rather than the same one alternately banded. Rules + hover carry
  // row tracking here. Board / Packed / mobile keep the stripe: they have no
  // cell rules, which is the condition zebra actually exists for.
  const stripeRow = useAlternateStripe && !gridSkin;

  const animatePresence = !disableEnterAnimation;
  const animateLayout = !disableLayoutAnimation;
  // Board / list rows nudge on hover; the grid skin never does — which, with
  // presence and layout both off, is what makes a row's shell pure DOM.
  const hoverLift = !gridSkin;

  /**
   * Operator-set triage flag — an org-wide shared tag that washes the row.
   * Resolved through the SoT so an id this build does not know renders as
   * unflagged rather than as some arbitrary colour.
   *
   * Gated ONCE, here, on the mounting surface's declared capability rather than
   * at each of the three places the flag paints (grid fill, list fill, dot
   * indicator). Triage is outbound dispatch vocabulary; a surface that did not
   * declare it must not show any of the three, and gating at the derivation is
   * what makes that one decision instead of three that can drift apart.
   */
  const rowFlag = capabilities.rowTriageFlags
    ? resolveOrderRowFlag(record.row_flag?.flag)
    : null;

  const gridTemplate = isMobile ? undefined : rowGridTemplate(columns);
  const cellInset = gridSkin ? ('grid' as const) : ('cell' as const);
  const dataCell = (col: OrdersQueueColumn, rule = true) =>
    gridDataCellClass(col, { rule, inset: cellInset, columnDisplay });

  // One adapter call per row — the compound cells all read this. Built here
  // (not per cell) so a five-column row maps once, and from the SAME resolved
  // display strings the flat layout uses rather than re-deriving them.
  // `null` under FLAT: no compound track is mounted there, so the adapter would
  // map a row nothing can paint.
  const compoundView = compoundLayout
    ? ordersCompoundView(record, {
        stateLabel: rowStatus.label,
        // `daysLate` is already the resolved lateness for this lane's deadline —
        // the same number the flat Late column shows, so the two layouts can never
        // disagree about whether a row is behind.
        delayDays: daysLate,
        delayTip: rowStatus.description,
      })
    : null;

  const inTable = rowIndex != null;

  // ── The cells — one shell, two column models ─────────────────────────────
  // Fragments (no DOM) keep every cell a DIRECT grid child — the airtable
  // skin's `[data-order-row-id] > *` border rules depend on it.
  //
  // The SHARED renderer paints the compound tracks, wrapper and all. This
  // family used to supply its own wrappers; that is where it silently lost the
  // frozen photo track (`thumb` is declared `frozen: true` and never got the
  // sticky class), which is why the box around a compound cell is no longer a
  // family's job.
  //
  // No `onCommitNote`: `order_notes` is an append-only trail, so the note line
  // is read-only here — the capability is the ABSENCE of the prop, never a
  // second component with the editor deleted.
  const cells = compoundView ? (
    columns.map((col, i) => {
      const rule = i !== columns.length - 1;
      const compoundCell = renderCompoundGridCell({
        col,
        columns,
        rule,
        view: compoundView,
        columnDisplay,
        onOpen: onRowOpen ? () => onRowOpen(record) : undefined,
        // Bulk membership. The mobile stacked row keeps its own leading slot.
        select: {
          checked: isChecked,
          onToggle: onToggleSelect
            ? () => onToggleSelect(record, { shiftKey: false })
            : undefined,
          label: isChecked ? 'Deselect row' : 'Select row',
        },
      });
      // The renderer owns six tracks (the five view cells plus `select`);
      // `_fill` is structural and lands on the shared face below.
      return (
        <Fragment key={col.key}>
          {compoundCell || renderStructuralCell(col, rule, dataCell)}
        </Fragment>
      );
    })
  ) : (
    <OrdersQueueFlatRowCells
      record={record}
      columns={columns}
      cellClass={dataCell}
      isMobile={isMobile}
      gridSkin={gridSkin}
      selectMode={selectMode}
      clickSelect={clickSelect}
      selectGutterChrome={selectGutterChrome}
      isChecked={isChecked}
      queueMode={queueMode}
      rowStatus={rowStatus}
      rowFlag={rowFlag}
      daysLate={daysLate}
      testerDisplay={testerDisplay}
      trackingAction={trackingAction}
      serialChip={serialChip}
      densityClasses={densityClasses}
      onToggleSelect={onToggleSelect}
      onRequestReplaceTracking={onRequestReplaceTracking}
    />
  );

  const shell: OrdersQueueRowShellProps = {
    'aria-rowindex': rowIndex,
    onClick: (event) =>
      onRowClick(record, {
        shiftKey: event.shiftKey,
        detail: event.detail,
        target: event.target,
      }),
    onDoubleClick: () => {
      if (clickSelect) onRowOpen?.(record);
    },
    onMouseDown: (event) => {
      if ((selectMode || clickSelect) && event.shiftKey) event.preventDefault();
    },
    onKeyDown: (event) => {
      if (clickSelect) {
        if (event.key === ' ') {
          event.preventDefault();
          onRowClick(record, { shiftKey: event.shiftKey, detail: 1, target: event.target });
          return;
        }
        if (event.key === 'Enter') {
          event.preventDefault();
          onRowOpen?.(record);
          return;
        }
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onRowClick(record, { shiftKey: event.shiftKey, target: event.target });
      }
    },
    // Inside a `role="table"` grid this element IS the row — an element has
    // exactly one role, and a table whose rows claim `button`/`checkbox` has
    // no rows at all. Selection moves to `aria-selected` (valid on `row`);
    // under clickSelect the gutter checkbox + wash both show membership.
    // Outside a table the original interactive roles stand.
    role: inTable ? 'row' : clickSelect || selectMode ? 'checkbox' : 'button',
    tabIndex: 0,
    'aria-selected': inTable ? isChecked : undefined,
    'aria-checked': !inTable && (clickSelect || selectMode) ? isChecked : undefined,
    'aria-pressed': inTable || clickSelect || selectMode ? undefined : isSelected,
    'aria-label':
      clickSelect || selectMode
        ? `Select order ${record.order_id || record.id}`
        : `Open order ${record.order_id || record.id}`,
    'data-order-row-id': String(record.id),
    className: cn(
      'group/row relative',
      ordersQueueRowShellClass(isMobile, { scrollMinContent: gridSkin }),
      // Airtable LedgerGrid: capability-gated fill SoT (selection → triage
      // flag → card). List/board keeps zebra + inset-ring selected chrome.
      gridSkin
        ? ledgerRowFillClass({
            selected: clickSelect || selectMode || gridSkin ? isChecked : isSelected,
            flagClass: rowFlag?.rowClass,
            capabilities,
          })
        : cn(
            'cursor-pointer border-b border-border-hairline transition-colors',
            QUEUE_ROW.px,
            isStagedRow
              ? 'py-2.5 hover:bg-blue-50/50'
              : cn('hover:bg-surface-hover', densityClasses.rowPadding),
            // Idle zebra (off-grid only — see `stripeRow`): opaque canvas
            // where the caller asks, translucent otherwise. Selection
            // overrides stripe; triage flag beats zebra.
            isStagedRow
              ? (selectMode ? isChecked : isSelected)
                ? 'bg-blue-50/80'
                : stripeRow
                  ? opaqueStripe
                    ? 'bg-surface-canvas'
                    : 'bg-surface-canvas/40'
                  : 'bg-surface-card'
              : (selectMode ? isChecked : isSelected)
                ? QUEUE_ROW.selectedClass
                : (rowFlag?.rowClass ??
                  (stripeRow
                    ? opaqueStripe
                      ? 'bg-surface-canvas'
                      : 'bg-surface-canvas/40'
                    : 'bg-surface-card')),
          ),
    ),
    style:
      gridTemplate || rowFillHex
        ? {
            ...(gridTemplate ? { gridTemplateColumns: gridTemplate } : undefined),
            // Selection wash wins; custom paint only when not checked.
            ...((clickSelect || selectMode || gridSkin ? isChecked : isSelected) || !rowFillHex
              ? undefined
              : { backgroundColor: rowFillHex }),
          }
        : undefined,
    children: cells,
  };

  // A row that animates NOTHING is a plain box: no motion component, no
  // presence/layout context subscriptions, no reduced-motion bridges. The
  // moment any of the three is live, the shell above is handed to the motion
  // host unchanged.
  if (!animatePresence && !animateLayout && !hoverLift) {
    return <div {...shell} />;
  }
  return (
    <AnimatedOrdersQueueRowShell
      animatePresence={animatePresence}
      animateLayout={animateLayout}
      hoverLift={hoverLift}
      {...shell}
    />
  );
}, (prev, next) => {
  if (prev.isMobile !== next.isMobile) return false;
  if (prev.record.id !== next.record.id) return false;
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.selectMode !== next.selectMode) return false;
  if (prev.isChecked !== next.isChecked) return false;
  if (prev.useAlternateStripe !== next.useAlternateStripe) return false;
  if (prev.opaqueStripe !== next.opaqueStripe) return false;
  if (prev.gridSkin !== next.gridSkin) return false;
  if (prev.clickSelect !== next.clickSelect) return false;
  if (prev.selectGutterChrome !== next.selectGutterChrome) return false;
  if (prev.rowFillHex !== next.rowFillHex) return false;
  if (prev.columns !== next.columns) return false;
  // Per-staff column display prefs paint through `dataCell` on every cell. The
  // host memoizes `displayByKey` on its CONTENT, so this compares as a stable
  // reference — omitting it meant a staffer's emphasis change reached the row
  // as a new prop and was then discarded here, one step after the host's
  // `renderLeaf` had already dropped it from its dependency list.
  if (prev.columnDisplay !== next.columnDisplay) return false;
  if (prev.rowStatus.dot !== next.rowStatus.dot) return false;
  if (prev.rowStatus.label !== next.rowStatus.label) return false;
  if (prev.rowStatus.pill !== next.rowStatus.pill) return false;
  if (prev.daysLate !== next.daysLate) return false;
  if (prev.record.product_title !== next.record.product_title) return false;
  if (prev.record.condition !== next.record.condition) return false;
  if (prev.record.order_id !== next.record.order_id) return false;
  if (prev.record.quantity !== next.record.quantity) return false;
  if (prev.record.serial_number !== next.record.serial_number) return false;
  if (prev.record.sale_amount !== next.record.sale_amount) return false;
  if (prev.record.currency !== next.record.currency) return false;
  if (prev.record.label_printed_at !== next.record.label_printed_at) return false;
  if (prev.record.deadline_at !== next.record.deadline_at) return false;
  if (prev.record.created_at !== next.record.created_at) return false;
  if (prev.record.item_number !== next.record.item_number) return false;
  // TESTED-lane cells (tester + tested-at) render these — compare or go stale.
  if (prev.testerDisplay !== next.testerDisplay) return false;
  if (prev.record.test_date_time !== next.record.test_date_time) return false;
  if (prev.record.test_activity_at !== next.record.test_activity_at) return false;
  // Live fields the COMPOUND `fulfillment` / `item` tracks paint. A label
  // landing on an open To-ship desk changes `shipping_tracking_number` and
  // nothing else on this list — compared nowhere, the row kept the empty
  // tracking line until something unrelated forced it to repaint.
  if (prev.record.shipping_tracking_number !== next.record.shipping_tracking_number) return false;
  if (prev.record.notes !== next.record.notes) return false;
  if (prev.record.account_source !== next.record.account_source) return false;
  if (prev.record.carrier !== next.record.carrier) return false;
  // The triage flag washes the whole row through `ledgerRowFillClass`.
  if (prev.record.row_flag?.flag !== next.record.row_flag?.flag) return false;
  // `aria-rowindex` is this row's announced position in the table; a sort or an
  // insert moves it without touching any fact on the record.
  if (prev.rowIndex !== next.rowIndex) return false;
  // The mounting surface's capability bag decides the fill vocabulary.
  if (prev.capabilities !== next.capabilities) return false;
  const prevR = prev.record as Record<string, unknown>;
  const nextR = next.record as Record<string, unknown>;
  if (prevR.replenishment_request_id !== nextR.replenishment_request_id) return false;
  if (prevR.replenishment_status !== nextR.replenishment_status) return false;
  if (prevR.replenishment_quantity_to_order !== nextR.replenishment_quantity_to_order) return false;
  if (prevR.replenishment_po_number !== nextR.replenishment_po_number) return false;
  if (prevR.replenishment_notes !== nextR.replenishment_notes) return false;
  // Legacy alias for the tracking column — station-mapped rows carry it instead.
  if (prevR.tracking_number !== nextR.tracking_number) return false;
  return true;
});