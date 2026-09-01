'use client';

import { gridDataCellClass } from '@/design-system/components/grid';
import { isCompoundColumnModel } from '@/components/tables/compound/compound-columns';
import { renderCompoundGridCell } from '@/components/tables/compound/CompoundGridCell';
import { ignoreRowSelectFromSubtitle } from '@/components/tables/compound/useSubtitlePointerReorder';
import type { CompoundRowAction } from '@/components/tables/compound/compound-row-model';
import { copyToClipboard } from '@/utils/_dom';
import {
  rowActionsContextMenu,
  rowActionsKeyDown,
} from '@/components/tables/compound/compound-row-actions';
import { ordersCompoundView } from '@/lib/orders/orders-compound-view';
import {
  ordersSlotValues,
  ordersSubtitleParts,
} from '@/lib/tables/field-catalog/orders-resolve';
import { Fragment, memo, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { motion } from '@/design-system/motion';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { Plus } from '@/components/Icons';
import { useRouter } from 'next/navigation';
import { useOrderIdentityCellNodes, OrderIdentityChips } from '@/components/ui/OrderIdentityChips';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { focusRing } from '@/design-system/tokens/focus-ring';
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
import { getExternalUrlByItemNumber } from '@/utils/external-item-url';
import { useOrderChannelLabel } from '@/hooks/useCatalog';
import {
  formatDateWithOrdinal,
  formatLaneAgeCompact,
  getLaneAgeHours,
  toPSTDateKey,
} from '@/utils/date';
import { isSkuSourceRecord } from '@/utils/source-dot';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import type { OrdersQueueColumn } from '@/lib/dashboard-order-row-layout';
import {
  LEDGER_GRID_FROZEN_CELL,
  ledgerGridCell,
  ledgerGridRowShellClass,
} from '@/design-system/components/grid';
import { gridFrozenLeft, gridTemplate } from '@/design-system/components/grid/grid-column-geometry';
import { conditionGradeTextClass, conditionGradeTone, orderRowQtyTone } from '@/lib/condition-tone';
import { resolveOrderRowFlag } from '@/lib/orders/order-row-flags';
import {
  conditionDescription,
  conditionGradeTableLabel,
  conditionOptions,
  isEmptyMetaDash,
  resolveConditionGrade,
} from '@/lib/conditions';
import type {
  CompoundSubtitleSelect,
  CompoundSubtitleEdit,
  CompoundSubtitleCopy,
} from '@/components/tables/compound/compound-row-model';
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
import { useOrderAssignment } from '@/hooks/useOrderAssignment';
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
  /** `null` on queues whose rows share one status — see `resolveRowStatus`. */
  rowStatus: RowStatusMeta | null;
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
   *  REQUIRED — there is no canonical fallback since the Wave-1 hand-model
   *  kill: the outbound desks pass the compound slot materialization, the
   *  station benches pass their own `STATION_HISTORY_COLUMNS`. Header + rows +
   *  group summaries must receive the SAME list. */
  columns: readonly OrdersQueueColumn[];
  /**
   * Bound subtitle field ids from the effective slot layout (compound morph
   * paints them inside the item cell's secondary line). Absent/empty keeps the
   * legacy note/identity fallback line.
   */
  subtitleFieldIds?: readonly string[];
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
  /**
   * Present ⇒ the compound item cell's bound CONDITION subtitle part edits in
   * place (grade menu over the condition SoT, `null` = clear). Absent ⇒ the
   * same part is read-only — the house capability law. A scalar PATCH through
   * the host's `useOrderAssignment`, never a lifecycle transition.
   */
  onCommitCondition?: (record: ShippedOrder, condition: string | null) => void;
  /**
   * Retype a subtitle fact in place — qty, item number, note.
   *
   * One handler keyed by catalog field id rather than three props: the bound
   * subtitle line is a LAYOUT choice, so which facts appear there changes per
   * org, and a prop per fact would need a new prop each time somebody binds a
   * different one.
   */
  onCommitSubtitleField?: (
    record: ShippedOrder,
    fieldId: string,
    value: string | null,
  ) => void;
  /**
   * Present ⇒ the STATUS delay line edits ship-by in place (civil `YYYY-MM-DD`,
   * `null` = clear). Same assign waist as condition / qty.
   */
  onCommitShipBy?: (record: ShippedOrder, dateKey: string | null) => void;
}

/** In-cell editors this row can host (one open at a time).
 *  `title` is deliberately absent — the product title is a read-only identity
 *  anchor in the collection map; correction lives at the record plane.
 *  Notes · listing link · OOS are record-plane only. */

/** The identity payload {@link useOrderIdentityCellNodes} consumes. */
type OrderIdentityCellProps = Parameters<typeof useOrderIdentityCellNodes>[0];

/** Station rows carry a `scan_ref`; outbound rows do not. */
function rowScanRef(record: QueueRowRecord): string | null {
  const raw = (record as QueueRowRecord & { scan_ref?: unknown }).scan_ref;
  return typeof raw === 'string' && raw ? raw : null;
}

/**
 * The 7 grade rows of the condition subtitle editor, resolved ONCE from the
 * condition SoTs (labels, tones, descriptions) — only the `current` flag is
 * per-row. Table-variant labels: the same face the flat Cond column painted.
 */
const CONDITION_SELECT_BASE = conditionOptions('table').map((opt) => ({
  value: opt.value as string,
  label: opt.label,
  toneClass: conditionGradeTextClass(opt.value),
  currentClass: conditionGradeTone(opt.value).badge,
  description: conditionDescription(opt.value),
}));

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
  const template = gridTemplate(columns);
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
  'data-marketplace-order-id'?: string;
  role: React.AriaRole;
  tabIndex: number;
  className: string;
  style?: React.CSSProperties;
  onClick: React.MouseEventHandler<HTMLDivElement>;
  onDoubleClick: React.MouseEventHandler<HTMLDivElement>;
  onMouseDown: React.MouseEventHandler<HTMLDivElement>;
  onContextMenu: React.MouseEventHandler<HTMLDivElement>;
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
  /** `null` on queues whose rows share one status — see `resolveRowStatus`. */
  rowStatus: RowStatusMeta | null;
  /** Already capability-gated by the row — `null` means "surface says no". */
  rowFlag: ReturnType<typeof resolveOrderRowFlag>;
  daysLate: number | null;
  testerDisplay: string;
  trackingAction?: React.ReactNode;
  serialChip?: React.ReactNode;
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
  onToggleSelect,
  onRequestReplaceTracking,
}: OrdersQueueFlatRowCellsProps) {
  const orderChannelLabel = useOrderChannelLabel();
  const router = useRouter();
  const assignOrder = useOrderAssignment();
  const conditionCellRef = useRef<HTMLDivElement | null>(null);

  const qty = parseInt(String(record.quantity || '1'), 10) || 1;
  const trackingRaw =
    (record.tracking_number as string | undefined) ||
    record.shipping_tracking_number ||
    '';

  // In-cell editing was deleted with the display layer on 2026-08-29
  // (`docs/todo/one-table-sot-teardown-HANDOFF.md` § 4.2). `gridSkin` still
  // decides the airtable CELL PAINT; it no longer arms an editor.
  const gridEditable = gridSkin && !isMobile;

  const onPasteTracking = useCallback(
    (value: string) => {
      const id = Number(record.id);
      if (!Number.isFinite(id)) return;
      assignOrder.mutate(
        { orderId: id, shippingTrackingNumber: value },
        {
          onSuccess: () => toast.success('Tracking pasted from clipboard'),
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
  // Intl work, once per row per render. COMPOUND paints the civil ship-by on
  // the `state` track (same `daysLate` source, date from deadline / ship_by).
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
    />
  ) : null;

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
      // Cell role for the same reason the header gutter carries `columnheader`
      // (see `LedgerGridColumnHeader`): a `role="row"` may only own cell-family
      // roles, so without this the `role="checkbox"` below is owned by the row
      // and axe `aria-required-children` fails. `cell` — not `gridcell` — because
      // the container is `role="table"`, not `role="grid"`.
      role="cell"
      className={cn(
        ledgerGridCell({ inset: 'none', rule: true }),
        isEmptyGutterChrome(selectGutterChrome) ? 'items-stretch p-0' : 'justify-center',
        LEDGER_GRID_FROZEN_CELL,
      )}
      // Offset from the MOUNTED model, never a static list — the bench mounts
      // its own flat array now (`STATION_HISTORY_COLUMNS`).
      style={{ left: gridFrozenLeft(columns, 'select') }}
      onClick={(e) => (selectMode || gridSkin || clickSelect) && e.stopPropagation()}
    >
      {gridSkin || selectMode || clickSelect ? (
        onToggleSelect ? (
          <GridRowCheckbox
            checked={isChecked}
            // Shift-click extends from the anchor. This was `{ shiftKey: false }`
            // — the range walk existed in `useTableSelectMode` the whole time
            // and no caller could ever reach it.
            onToggle={(event) => onToggleSelect(record, event)}
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
            // (`GRID_IDENTITY_COLUMN_KEYS`). The
            // product title is a catalog fact + this row's identity anchor; a
            // text caret (click / Enter / F2 / printable) put a destructive
            // typo one keystroke away. Correction happens at the record plane.
            // No focus ring on the title itself: the ring is the tell that a
            // cell edits, and clicks must fall through to the row (open record).
            className={cn(dataCell(col, rule), LEDGER_GRID_FROZEN_CELL, 'gap-1.5')}
            style={{ left: gridFrozenLeft(columns, 'title') }}
            data-frozen-edge
          >
            {flagIndicator}
            {/* Status chip lives in the Status column on gridSkin; board/mobile keep the title-dot.
                No dot at all when the queue has no per-row status (Labels). */}
            {!gridSkin && rowStatus ? (
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
            className={dataCell(col, rule)}
          >
            {gradeFace}
          </div>
        );
      }
      case 'age':
        // Display-only derived days late — ship-by correction lives on the
        // record plane, not as an in-cell edit on this urgency track.
        return (
          <div
            data-col="age"
            className={cn(dataCell(col, rule), LEDGER_GRID_FROZEN_CELL)}
            style={{ left: gridFrozenLeft(columns, 'age') }}
          >
            <GridAgeCellValue
              daysLate={daysLate}
              tooltip={ageTooltip}
                    />
          </div>
        );
      case 'tester':
        // TESTED lane (plan §9): scan actor → assignee → staff-id lookup, all
        // normalized upstream into `testerDisplay` ('---' when truly missing).
        return (
          <div data-col="tester" className={dataCell(col, rule)}>
            <GridStaffCellValue name={testerDisplay} />
          </div>
        );
      case 'testedAt': {
        const testedAtRaw = queueRowTestedAtRaw(record);
        return (
          <div data-col="testedAt" className={dataCell(col, rule)}>
            {testedAtRaw ? (
              <GridMonthDayTimeCellValue
                raw={testedAtRaw}
                className="text-text-muted"
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
          >
            {/* Same type scale as the Date / Age cells — numerals must not
                read a step smaller than their neighbor facts. */}
            <span
              className={cn(
                'min-w-0 truncate tabular-nums normal-case tracking-normal',
                orderRowQtyTone(qty),
              )}
            >
              {qty}
            </span>
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
            className={cn(dataCell(col, rule), LEDGER_GRID_FROZEN_CELL)}
            style={{ left: gridFrozenLeft(columns, 'order') }}
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
              // Empty dot keeps the leading track (so titles stay aligned down
              // the list) while saying nothing, which is the point.
              dot={rowStatus?.dot ?? ''}
              dotTitle={
                rowStatus ? `${rowStatus.label} — ${rowStatus.description}` : undefined
              }
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
  packerDisplay,
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
  columns,
  subtitleFieldIds,
  capabilities,
  onRowClick,
  onRowOpen,
  onRequestReplaceTracking,
  onCommitCondition,
  onCommitSubtitleField,
  onCommitShipBy,
}: OrdersQueueTableRowProps) {
  /**
   * WHICH COLUMN MODEL is mounted — this row's one layout discriminant.
   *
   * `columns` arrives as either the COMPOUND slot materialization
   * (`ordersCompoundColumnsFor` — every outbound desk) or the station benches'
   * FLAT legacy model (`STATION_HISTORY_COLUMNS` — the last flat mount,
   * pending the station-history kill item). They are sibling ARRAYS, never a
   * mix, so one `isCompoundColumnModel` probe answers it. Mobile never maps
   * `columns` at all — it paints the chip cluster + meta row — so it is FLAT
   * by definition whatever model the host happened to pass.
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
    gridDataCellClass(col, { rule, inset: cellInset });

  // The condition subtitle part edits in place only when the surface passed
  // the commit capability AND the layout actually binds the fact. Editors are
  // matched to parts by key, so an org that unbinds condition sheds the
  // affordance with the part.
  const conditionEditable = Boolean(
    onCommitCondition && subtitleFieldIds?.includes('orders.condition'),
  );
  const subtitleSelects: readonly CompoundSubtitleSelect[] | undefined =
    compoundLayout && conditionEditable && onCommitCondition
      ? [
          {
            partKey: 'orders.condition',
            label: 'Condition',
            options: CONDITION_SELECT_BASE.map((opt) => ({
              ...opt,
              // Alias-aware ("NEW" → BRAND_NEW) so a marketplace-string row
              // highlights its grade as current — the deleted flat editor's rule.
              current: resolveConditionGrade(record.condition) === opt.value,
            })),
            clearLabel: 'Clear condition',
            onCommit: (value) => onCommitCondition(record, value),
          },
        ]
      : undefined;

  /*
   * The rest of the under-title line, editable in place (operator ruling
   * 2026-08-31): everything down there is a fact the desk owns, so everything
   * down there can be retyped — EXCEPT the order number, the tracking number
   * and the lifecycle statuses. Those three are identity and history: an order
   * number is what the marketplace calls this row, a tracking number is what
   * the carrier calls the parcel, and a status is a record of something that
   * already happened. A queue may not rewrite any of them from a list view.
   */
  const editableSubtitle = Boolean(compoundLayout && onCommitSubtitleField);
  const subtitleEdits: readonly CompoundSubtitleEdit[] | undefined =
    editableSubtitle && onCommitSubtitleField
      ? [
          ...(subtitleFieldIds?.includes('orders.qty')
            ? [{
                partKey: 'orders.qty',
                label: 'Quantity',
                value: String(record.quantity ?? ''),
                kind: 'numeric' as const,
                onCommit: (value: string | null) =>
                  onCommitSubtitleField(record, 'orders.qty', value),
              }]
            : []),
          // Item number is the Listing control (open on click, copy on hover).
          ...(subtitleFieldIds?.includes('orders.notes')
            ? [{
                partKey: 'orders.notes',
                label: 'Note',
                value: String(record.notes ?? ''),
                onCommit: (value: string | null) =>
                  onCommitSubtitleField(record, 'orders.notes', value),
              }]
            : []),
        ]
      : undefined;

  // Item number is never painted as digits. Bound ⇒ listing glyph in the
  // trailing cluster (info when a URL exists, faint when missing).
  const itemNumberValue = String(record.item_number ?? '').trim();
  const listingHref = getExternalUrlByItemNumber(itemNumberValue);
  const subtitleCopies: readonly CompoundSubtitleCopy[] | undefined =
    compoundLayout && subtitleFieldIds?.includes('orders.item_number')
      ? [{
          partKey: 'orders.item_number',
          value: itemNumberValue,
          openHref: listingHref,
        }]
      : undefined;

  // One adapter call per row — the compound cells all read this. Built here
  // (not per cell) so a five-column row maps once, and from the SAME resolved
  // display strings the flat layout uses rather than re-deriving them.
  // `null` under FLAT: no compound track is mounted there, so the adapter would
  // map a row nothing can paint.
  const compoundView = compoundLayout
    ? ordersCompoundView(record, {
        stateLabel: rowStatus?.label ?? null,
        // `daysLate` is already the resolved lateness for this lane's deadline —
        // the same number the flat Late column shows, so the two layouts can never
        // disagree about whether a row is behind.
        delayDays: daysLate,
        delayTip: rowStatus?.description,
        testerDisplay,
        packerDisplay,
        // One resolve per row for every mounted slot track — the compound
        // cells read these by TRACK key, so the row never re-resolves per cell.
        slots: ordersSlotValues(record, columns, { testerDisplay, packerDisplay }),
        subtitleParts:
          subtitleFieldIds && subtitleFieldIds.length > 0
            ? ordersSubtitleParts(record, subtitleFieldIds, {
                testerDisplay,
                packerDisplay,
                // A blank editable condition keeps a faint `--` click target.
                // Blank editable facts keep a faint `--` click target.
                editableFieldIds: [
                  ...(conditionEditable ? ['orders.condition'] : []),
                  ...(subtitleEdits ? subtitleEdits.map((e) => e.partKey) : []),
                ],
              })
            : undefined,
        flagMark: rowFlag
          ? {
              label: rowFlag.label,
              tip: [
                `${rowFlag.label} — ${rowFlag.hint}`,
                record.row_flag?.by ? `Set by ${record.row_flag.by}` : null,
              ]
                .filter(Boolean)
                .join(' · '),
              dotClass: rowFlag.dotClass,
            }
          : null,
      })
    : null;

  const inTable = rowIndex != null;

  const shipByEdit =
    compoundView && onCommitShipBy
      ? {
          value: compoundView.delay?.dateKey ?? '',
          onCommit: (dateKey: string | null) => onCommitShipBy(record, dateKey),
        }
      : undefined;

  /*
   * The row's ⋮ verbs.
   *
   * The menu used to hold "Open" alone — a duplicate of clicking the row, in a
   * permanent 2.5rem track. Now that the row opens the menu from the keyboard
   * and from a right-click, the track had to be worth reaching: these are the
   * two identifiers an operator retypes into a marketplace or a carrier site,
   * and until now they were only obtainable by hovering the exact chip that
   * carries them. Reads, not writes — a row menu is not where a queue should
   * offer to mutate an order it is not showing the consequences of.
   */
  const orderNumber = String(record.order_id || '').trim();
  const trackingNumber = String(
    record.shipping_tracking_number || record.tracking_number || '',
  ).trim();
  const rowMenuActions = useMemo(() => {
    const items: CompoundRowAction[] = [];
    if (orderNumber) {
      items.push({
        key: 'copy-order',
        label: 'Copy order number',
        onSelect: () => {
          void copyToClipboard(orderNumber, { historyKind: 'order', historyDisplay: orderNumber });
        },
      });
    }
    if (trackingNumber) {
      items.push({
        key: 'copy-tracking',
        label: 'Copy tracking number',
        onSelect: () => {
          void copyToClipboard(trackingNumber, {
            historyKind: 'tracking',
            historyDisplay: trackingNumber,
          });
        },
      });
    }
    return items;
  }, [orderNumber, trackingNumber]);

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
  // The note line is read-only, here and everywhere: the compound cell's inline
  // note editor came down with the display layer. `order_notes` was never going
  // to edit in place anyway — it is an append-only trail, and rewriting
  // someone's statement is the failure that ruling exists to prevent.
  const cells = compoundView ? (
    columns.map((col, i) => {
      const rule = i !== columns.length - 1;
      const compoundCell = renderCompoundGridCell({
        col,
        columns,
        rule,
        view: compoundView,
        subtitleSelects,
        subtitleEdits,
        subtitleCopies,
        subtitleNoteKey: 'orders.notes',
        noteText: record.notes ?? null,
        shipByEdit,
        onOpen: onRowOpen ? () => onRowOpen(record) : undefined,
        actions: rowMenuActions,
        // Bulk membership. The mobile stacked row keeps its own leading slot.
        select: {
          checked: isChecked,
          onToggle: onToggleSelect
            ? (event: { shiftKey: boolean }) => onToggleSelect(record, event)
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
      onToggleSelect={onToggleSelect}
      onRequestReplaceTracking={onRequestReplaceTracking}
    />
  );

  const shell: OrdersQueueRowShellProps = {
    'aria-rowindex': rowIndex,
    onClick: (event) => {
      if (ignoreRowSelectFromSubtitle(event)) return;
      onRowClick(record, {
        shiftKey: event.shiftKey,
        detail: event.detail,
        target: event.target,
      });
    },
    onDoubleClick: () => {
      if (clickSelect) onRowOpen?.(record);
    },
    onMouseDown: (event) => {
      if ((selectMode || clickSelect) && event.shiftKey) event.preventDefault();
    },
    onContextMenu: (event) => {
      rowActionsContextMenu(event);
    },
    onKeyDown: (event) => {
      // Shift+F10 / Menu key → the row's ⋮ verbs. Checked before the grid's own
      // chords so the platform gesture is never shadowed; a row whose family
      // passes no verbs falls straight through to them.
      if (rowActionsKeyDown(event)) return;
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
    'data-marketplace-order-id': String(record.order_id || ''),
    className: cn(
      'group/row relative',
      ledgerGridRowShellClass(isMobile, { scrollMinContent: gridSkin }),
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
              : 'hover:bg-surface-hover py-1.5',
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
            // Sheets paint precedence: selection wash → org triage flag → personal
            // paint hex. Selection and flag both suppress the inline fill so the
            // shared tint stays readable (and selection always wins the class).
            ...((clickSelect || selectMode || gridSkin ? isChecked : isSelected) ||
            rowFlag?.rowClass ||
            !rowFillHex
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
  if (prev.rowStatus?.dot !== next.rowStatus?.dot) return false;
  if (prev.rowStatus?.label !== next.rowStatus?.label) return false;
  if (prev.rowStatus?.pill !== next.rowStatus?.pill) return false;
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
  if (prev.record.ship_by_date !== next.record.ship_by_date) return false;
  if (prev.record.created_at !== next.record.created_at) return false;
  if (prev.record.item_number !== next.record.item_number) return false;
  // TESTED-lane cells (tester + tested-at) render these — compare or go stale.
  if (prev.testerDisplay !== next.testerDisplay) return false;
  if (prev.packerDisplay !== next.packerDisplay) return false;
  if (prev.record.test_date_time !== next.record.test_date_time) return false;
  if (prev.record.test_activity_at !== next.record.test_activity_at) return false;
  if (prev.record.packed_at !== next.record.packed_at) return false;
  if (prev.record.pack_activity_at !== next.record.pack_activity_at) return false;
  if (prev.record.pack_location_name !== next.record.pack_location_name) return false;
  if (prev.record.pack_location_kind !== next.record.pack_location_kind) return false;
  // A bound Scanned-out slot paints these (dash today — the To-ship feed does
  // not project them yet); compared now so the column goes live the moment the
  // projection does, instead of going stale.
  if (prev.record.ship_confirmed_at !== next.record.ship_confirmed_at) return false;
  if (prev.record.shipped_out_by_name !== next.record.shipped_out_by_name) return false;
  // Bound subtitle ids arrive as a memoized array from the layout hook.
  if (prev.subtitleFieldIds !== next.subtitleFieldIds) return false;
  // The condition-edit capability arming/disarming changes what the item cell
  // renders; the host's callback is a stable useCallback, so this only fires
  // on a real capability change (record.condition is compared above).
  if (prev.onCommitCondition !== next.onCommitCondition) return false;
  if (prev.onCommitShipBy !== next.onCommitShipBy) return false;
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