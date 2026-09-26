'use client';

import { gridDataCellClass } from '@/design-system/components/grid';
import { isCompoundColumnModel } from '@/components/tables/compound/compound-columns';
import { renderCompoundGridCell } from '@/components/tables/compound/CompoundGridCell';
import { CompoundRowDetailHost } from '@/components/tables/compound/CompoundRowDetailHost';
import { useCompoundRowDetail } from '@/components/tables/compound/useCompoundRowDetail';
import { ignoreRowSelectFromSubtitle } from '@/components/tables/compound/useSubtitlePointerReorder';
import { ordersCompoundView } from '@/lib/orders/orders-compound-view';
import { useOrderStatusTrail } from '@/components/orders/OrderStatusTrailOverlay';
import {
  ordersSlotValues,
  ordersSubtitleParts,
} from '@/lib/tables/field-catalog/orders-resolve';
import {
  Fragment,
  memo,
  useCallback,
  useMemo,
  useRef,
  type ComponentProps,
  type ReactNode,
  type Ref,
} from 'react';
import { motion } from '@/design-system/motion';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { OrderIdentityChips } from '@/components/ui/OrderIdentityChips';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  RowTitle,
  RowMetaColumns,
  RowConditionMeta,
  QUEUE_ROW,
  metaIndentFor,
} from '@/components/ui/RowMetaColumns';
import { ledgerRowFillClass } from '@/components/ui/queue-row-chrome';
import {
  isEmptyGutterChrome,
  type GridSelectGutterChrome,
} from '@/components/ui/GridRowCheckbox';
import {
  MorphingSelectGutter,
} from '@/components/outbound/orders/to-ship/MorphingRowActionMenu';
import { applyMorphingGutterClick } from '@/lib/outbound/morphing-row-action';
import type { GridSurfaceCapabilities } from '@/design-system/components/grid';
import { isFbaOrder, marketplaceOrderUrl } from '@/utils/order-platform';
import { useOrderChannel } from '@/hooks/useCatalog';
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
  conditionOptions,
  resolveConditionGrade,
} from '@/lib/conditions';
import type {
  CompoundSubtitleSelect,
  CompoundSubtitleEdit,
} from '@/components/tables/compound/compound-row-model';
import {
  formatQueueRowDateCell,
  formatSalePrice,
  queueRowShipBySource,
  type OrdersQueueMode,
  type QueueRowRecord,
  type RowStatusMeta,
} from './helpers';
import {
  GridAgeCellValue,
  GridDateCellValue,
} from '@/components/ui/grid-cells';
import { useOrderAssignment } from '@/hooks/useOrderAssignment';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

interface OrdersQueueTableRowProps {
  record: QueueRowRecord;
  isSelected: boolean;
  /** Multi-select on — lead checkbox toggles; click selects instead of opening. */
  selectMode: boolean;
  isChecked: boolean;
  /**
   * Multi-line order parent already painted the ids. Leaf fulfillment stays
   * quiet so the same order # is not reprinted per SKU.
   */
  quietIdentity?: boolean;
  /**
   * Bundle / kit face from batch composition map (sku_catalog_id).
   * Null / omitted ⇒ flat listing title only.
   */
  kitFace?: import('@/lib/orders/order-kit-composition').KitFace | null;
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
  /** Opaque zebra bg (default false = translucent `/40`). */
  opaqueStripe?: boolean;
  /** Airtable grid-view skin. */
  gridSkin?: boolean;
  /** Sheets click-select: row click toggles bulk; double-click opens. Gutter
   * still mounts a real checkbox (`selectGutterChrome='hover'` on To-ship).
   */
  clickSelect?: boolean;
  /** Select-gutter face chrome — `'always'` paints the 16px checklist square. */
  selectGutterChrome?: GridSelectGutterChrome;
  /** Persisted Sheets row paint hex (selection wash wins when checked). */
  rowFillHex?: string | null;
  /** Absolute `aria-rowindex` when this row sits inside a `role="table"` grid. */
  rowIndex?: number;
  /** Toggle this row's selection from the gutter checkbox (stops propagation, so it never opens the record). */
  onToggleSelect?: (record: ShippedOrder, event: { shiftKey: boolean }) => void;
  queueMode?: OrdersQueueMode;
  /** Ordered VISIBLE column models (already sanitized + visibility-resolved). */
  columns: readonly OrdersQueueColumn[];
  /**
   * Bound subtitle field ids from the effective slot layout (compound morph
   * paints them inside the item cell's secondary line). Absent/empty keeps the
   * legacy note/identity fallback line.
   */
  subtitleFieldIds?: readonly string[];
  /** The MOUNTING SURFACE's declared capabilities — required, never defaulted. */
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
   * To-ship tracking hover Label — paperwork walk (table XOR). Omit on
   * packed/shipped/history.
   */
  onOpenLabels?: (record: ShippedOrder) => void;
  /** Present ⇒ the compound item cell's bound CONDITION subtitle part edits in place (grade menu over the condition SoT, `null` = clear). */
  onCommitCondition?: (record: ShippedOrder, condition: string | null) => void;
  /** Retype a subtitle fact in place — qty, item number, note. */
  onCommitSubtitleField?: (
    record: ShippedOrder,
    fieldId: string,
    value: string | null,
  ) => void;
  /**
   * Present ⇒ the DATES cell's deadline line edits ship-by in place (civil
   * `YYYY-MM-DD`, `null` = clear). Same assign waist as condition / qty.
   */
  onCommitShipBy?: (record: ShippedOrder, dateKey: string | null) => void;
  /**
   * Present ⇒ the DATES cell's ORDER-DATE line is editable, for the row whose
   * imported date is wrong (operator 2026-09-04). Same waist again — it writes
   * `orders.order_date` through `/api/orders/assign`, never a second endpoint.
   */
  onCommitOrderedAt?: (record: ShippedOrder, dateKey: string | null) => void;
  /**
   * Present ⇒ pending Pick / Packed stage marks open a searchable staff
   * combobox (full roster, one lane per column). Done stages stay read-only.
   * Same `useOrderAssignment` waist as condition / qty — never a lifecycle stamp.
   */
  onCommitStageAssign?: (
    record: ShippedOrder,
    fieldId: 'orders.picked' | 'orders.packed',
    staffId: number | null,
    staffName: string | null,
  ) => void;
}

/** In-cell editors this row can host (one open at a time). */

/** Identity chips payload for the mobile stack. */
type OrderIdentityCellProps = Omit<ComponentProps<typeof OrderIdentityChips>, 'isMobile'>;

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
 * Shared slack / unclaimed-key face for the compound map.
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

/** `grid-template-columns` for a mounted column model, cached ON that model. */
const ROW_GRID_TEMPLATE_CACHE = new WeakMap<readonly OrdersQueueColumn[], string>();

function rowGridTemplate(columns: readonly OrdersQueueColumn[]): string {
  const cached = ROW_GRID_TEMPLATE_CACHE.get(columns);
  if (cached !== undefined) return cached;
  const template = gridTemplate(columns);
  ROW_GRID_TEMPLATE_CACHE.set(columns, template);
  return template;
}

/** The row shell's DOM contract — the chrome half of a row (box, roles, paint, gestures), declared explicitly rather than as… */
interface OrdersQueueRowShellProps {
  'aria-rowindex'?: number;
  'aria-selected'?: boolean;
  'aria-checked'?: boolean;
  'aria-pressed'?: boolean;
  'aria-label': string;
  'data-order-row-id': string;
  /** `DeskRecordPlane` hands focus back to this row when its record closes. */
  'data-desk-record-key': string;
  'data-marketplace-order-id'?: string;
  'data-group-child'?: string;
  role: React.AriaRole;
  tabIndex: number;
  className: string;
  style?: React.CSSProperties;
  onClick: React.MouseEventHandler<HTMLDivElement>;
  onDoubleClick: React.MouseEventHandler<HTMLDivElement>;
  onMouseDown: React.MouseEventHandler<HTMLDivElement>;
  onContextMenu?: React.MouseEventHandler<HTMLDivElement>;
  onKeyDown: React.KeyboardEventHandler<HTMLDivElement>;
  children: ReactNode;
}

/** The row shell WITH motion attached — mount presence, layout animation, and the board/list hover lift. */
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
  /** The row element — the CYC-82 assign menu anchors to its gutter cell. */
  ref?: Ref<HTMLDivElement>;
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
 * Mobile stacked identity (chips + meta). Not a second table: desktop always
 * paints through {@link renderCompoundGridCell}.
 */
interface OrdersQueueMobileStackProps {
  record: QueueRowRecord;
  columns: readonly OrdersQueueColumn[];
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
  trackingAction?: React.ReactNode;
  serialChip?: React.ReactNode;
  onToggleSelect?: (record: ShippedOrder, event: { shiftKey: boolean }) => void;
  onRequestReplaceTracking?: (record: ShippedOrder) => void;
}

function OrdersQueueMobileStack({
  record,
  columns,
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
  trackingAction,
  serialChip,
  onToggleSelect,
  onRequestReplaceTracking,
}: OrdersQueueMobileStackProps) {
  const resolveOrderChannel = useOrderChannel();
  const assignOrder = useOrderAssignment();

  const qty = parseInt(String(record.quantity || '1'), 10) || 1;
  const trackingRaw =
    (record.tracking_number as string | undefined) ||
    record.shipping_tracking_number ||
    '';

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

  /**
   * The identity payload — the mobile chip cluster. Desktop identity rides the
   * compound `fulfillment` track.
   */
  const identityChipProps: OrderIdentityCellProps = {
    // The channel is carried by the ORDER cell's brand dot (the identity
    // language: dot, never a type glyph) and named in full on the chip's hover
    // label. One fact, one place — the row needs no channel track of its own.
    platformLabel: resolveOrderChannel(record.order_id || '', record.account_source).label,
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
    // **There is no glyph face in the table engine.** The leading mark on a grid identity cell is the brand DOT — the house identity law — so…
    variant: 'plain',
    // No platform column on this surface — order + tracking only.
    showPlatform: false,
  };

  const chipsNode = isMobile ? (
    <OrderIdentityChips {...identityChipProps} isMobile={isMobile} />
  ) : null;

  // ── Lateness / ship-by — the FLAT `age` cell and the mobile meta row ────── `toPSTDateKey` → `formatDateWithOrdinal` and…
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

  /** The flag's dot — the tint's non-colour carrier. */
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

  // Select cell — full-track hit plane + centered checklist face via GridRowCheckbox.
  const leadControls = (
    <div
      data-select-gutter
      // Cell role for the same reason the header gutter carries `columnheader` (see `LedgerGridColumnHeader`):
      role="cell"
      className={cn(
        ledgerGridCell({ inset: 'none', rule: true }),
        isEmptyGutterChrome(selectGutterChrome) ? 'items-stretch p-0' : 'justify-center',
        LEDGER_GRID_FROZEN_CELL,
      )}
      // Offset from the MOUNTED model.
      style={{ left: gridFrozenLeft(columns, 'select') }}
      onClick={(e) => (selectMode || gridSkin || clickSelect) && e.stopPropagation()}
    >
      {gridSkin || selectMode || clickSelect ? (
        onToggleSelect ? (
          <MorphingSelectGutter
            record={record}
            isChecked={isChecked}
            chrome={selectGutterChrome}
            onToggleSelect={onToggleSelect}
            enabled
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

  return (
    <>
      {isMobile ? (
        <>
          <div className="flex min-w-0 flex-col">
            <div className="flex min-w-0 items-center gap-1.5">
              {flagIndicator}
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
            </div>
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
      ) : null}

    </>
  );
}

/** Pending / fulfillment queue row — Sheets-like WMS grid: */
export const OrdersQueueTableRow = memo(function OrdersQueueTableRow({
  record,
  isSelected,
  selectMode,
  isChecked,
  quietIdentity = false,
  kitFace = null,
  useAlternateStripe,
  testerDisplay,
  packerDisplay,
  testerId,
  packerId,
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
  selectGutterChrome = 'hover',
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
  onOpenLabels,
  onCommitCondition,
  onCommitSubtitleField,
  onCommitShipBy,
  onCommitOrderedAt,
  onCommitStageAssign,
}: OrdersQueueTableRowProps) {
  const statusTrail = useOrderStatusTrail();
  /**
   * WHICH COLUMN MODEL is mounted — this row's one layout discriminant.
   *
   * `columns` is the compound slot materialization (`ordersCompoundColumnsFor`).
   * Mobile never maps `columns` — it paints the chip cluster + meta row.
   */
  const compoundLayout = !isMobile && isCompoundColumnModel(columns);

  const isStagedRow = queueMode === 'staged' || queueMode === 'shipped';

  // CYC-82 — the row action manifold opens off the leading checkbox.
  // The bar itself lives on {@link OrdersMorphingHost} in the spreadsheet
  // prefix so virtualizing this row out of the window cannot unmount it.
  const rowRef = useRef<HTMLDivElement>(null);
  const morphingEnabled = compoundLayout && Boolean(onToggleSelect);
  const detailState = useCompoundRowDetail(String(record.id));

  // Zebra is OFF under the airtable skin.
  const stripeRow = useAlternateStripe && !gridSkin;

  const animatePresence = !disableEnterAnimation;
  const animateLayout = !disableLayoutAnimation;
  // Board / list rows nudge on hover; the grid skin never does — which, with
  // presence and layout both off, is what makes a row's shell pure DOM.
  const hoverLift = !gridSkin;

  /** Operator-set triage flag — an org-wide shared tag that washes the row. */
  const rowFlag = capabilities.rowTriageFlags
    ? resolveOrderRowFlag(record.row_flag?.flag)
    : null;

  const gridTemplate = isMobile ? undefined : rowGridTemplate(columns);
  const cellInset = gridSkin ? ('grid' as const) : ('cell' as const);
  const dataCell = (col: OrdersQueueColumn, rule = true) =>
    gridDataCellClass(col, { rule, inset: cellInset });

  const itemNumberValue = String(record.item_number ?? '').trim();

  // The condition subtitle part edits in place only when the surface passed the commit capability AND the layout actually binds the fact.
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
            // NO clear row (operator 2026-09-04:
            // NO clear row (operator 2026-09-04: "it must always be a
            onCommit: (value) => onCommitCondition(record, value),
          },
        ]
      : undefined;

  /* The rest of the under-title line, editable in place (operator ruling 2026-08-31): */
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
          ...(subtitleFieldIds?.includes('orders.item_number')
            ? [{
                partKey: 'orders.item_number',
                label: 'Item number',
                value: itemNumberValue,
                onCommit: (value: string | null) =>
                  onCommitSubtitleField(record, 'orders.item_number', value),
              }]
            : []),
          ...(subtitleFieldIds?.includes('orders.amount')
            ? [{
                partKey: 'orders.amount',
                label: 'Amount',
                // The RAW figure, not the formatted face: an operator edits
                // `49.99`, not `$49.99`, and the cell re-formats on commit.
                value: record.sale_amount == null ? '' : String(record.sale_amount),
                kind: 'numeric' as const,
                // Figma width-field: drag X by $1 (Shift $10, Control $0.01 damped).
                // Control-up grace before dollars — the pointer is still displaced.
                scrub: {
                  step: 1,
                  coarseStep: 10,
                  fineStep: 0.01,
                  min: 0,
                  decimals: 2,
                  money: true,
                },
                onCommit: (value: string | null) =>
                  onCommitSubtitleField(record, 'orders.amount', value),
              }]
            : []),
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

  // The item number is a title-hover action, not an under-title glyph.

  // One adapter call per row — the compound cells all read this.
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
        quietIdentity,
        kitFace: kitFace ?? null,
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

  const orderedAtEdit =
    compoundView && onCommitOrderedAt
      ? {
          value: compoundView.orderedAt?.dateKey ?? '',
          onCommit: (dateKey: string | null) => onCommitOrderedAt(record, dateKey),
        }
      : undefined;

  const stageAssigns = useMemo(() => {
    if (!compoundView || !onCommitStageAssign) return undefined;
    return {
      'orders.picked': {
        selectedStaffId: testerId,
        label: 'Pick',
        role: 'technician' as const,
        onCommit: (staffId: number | null, staffName: string | null) =>
          onCommitStageAssign(record, 'orders.picked', staffId, staffName),
      },
      'orders.packed': {
        selectedStaffId: packerId,
        label: 'Packer',
        role: 'packer' as const,
        onCommit: (staffId: number | null, staffName: string | null) =>
          onCommitStageAssign(record, 'orders.packed', staffId, staffName),
      },
    };
  }, [compoundView, onCommitStageAssign, testerId, packerId, record]);

  // ── The cells — one shell, two column models ───────────────────────────── Fragments (no DOM) keep every cell a DIRECT grid child — the…
  const cells = isMobile ? (
    <OrdersQueueMobileStack
      record={record}
      columns={columns}
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
      trackingAction={trackingAction}
      serialChip={serialChip}
      onToggleSelect={onToggleSelect}
      onRequestReplaceTracking={onRequestReplaceTracking}
    />
  ) : (
    columns.map((col, i) => {
      const rule = i !== columns.length - 1;
      const compoundCell = compoundView
        ? renderCompoundGridCell({
            col,
            columns,
            rule,
            view: compoundView,
            subtitleSelects,
            subtitleEdits,
            subtitleNoteKey: 'orders.notes',
            noteText: record.notes ?? null,
            shipByEdit,
            orderedAtEdit,
            stageAssigns,
            onOpenLabels: onOpenLabels ? () => onOpenLabels(record) : undefined,
            onStateOpen: statusTrail
              ? () =>
                  statusTrail.open({
                    orderPk: record.id,
                    orderId: record.order_id || '',
                    tracking: compoundView.tracking,
                    stateLabel: rowStatus?.label ?? compoundView.stateLabel ?? 'Status',
                  })
              : undefined,
            select: {
              checked: isChecked,
              // CYC-82 — the checkbox ALWAYS toggles (including unselect).
              // Opening the assign menu is a side-effect of becoming selected,
              // never a substitute for the toggle. Shift stays the range walk.
              onToggle: onToggleSelect
                ? (event: { shiftKey: boolean }) => {
                    if (!morphingEnabled) {
                      onToggleSelect(record, event);
                      return;
                    }
                    applyMorphingGutterClick({
                      isChecked,
                      shiftKey: event.shiftKey,
                      onToggle: (next) => onToggleSelect(record, next),
                      onOpenMenu: () => {},
                      onCloseMenu: () => {},
                    });
                  }
                : undefined,
              label: morphingEnabled
                ? isChecked
                  ? 'Deselect row'
                  : 'Select row and assign'
                : isChecked
                  ? 'Deselect row'
                  : 'Select row',
              detail: compoundView.detail
                ? {
                    open: detailState.open,
                    onToggle: detailState.toggle,
                    label: compoundView.title.trim() || 'this line',
                  }
                : undefined,
            },
          })
        : null;
      return (
        <Fragment key={col.key}>
          {compoundCell || renderStructuralCell(col, rule, dataCell)}
        </Fragment>
      );
    })
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
    // Inside a `role="table"` grid this element IS the row — an element has exactly one role, and a table whose rows claim `button`/`checkbox`…
    role: inTable ? 'row' : clickSelect ? 'checkbox' : 'button',
    tabIndex: 0,
    'aria-selected': inTable ? isChecked : undefined,
    'aria-checked': !inTable && clickSelect ? isChecked : undefined,
    'aria-pressed': inTable || clickSelect || selectMode ? undefined : isSelected,
    'aria-label':
      clickSelect
        ? `Select order ${record.order_id || record.id}`
        : `Open order ${record.order_id || record.id}`,
    'data-order-row-id': String(record.id),
    'data-desk-record-key': String(record.id),
    'data-marketplace-order-id': String(record.order_id || ''),
    'data-group-child': quietIdentity ? '' : undefined,
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
              ? 'py-2.5 hover:bg-surface-info/50'
              : 'hover:bg-surface-hover py-1.5',
            // Idle zebra (off-grid only — see `stripeRow`): opaque canvas
            // where the caller asks, translucent otherwise. Selection
            // overrides stripe; triage flag beats zebra.
            isStagedRow
              ? (selectMode ? isChecked : isSelected)
                ? 'bg-surface-info/80'
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

  // A row that animates NOTHING is a plain box:
  const leaf =
    !animatePresence && !animateLayout && !hoverLift ? (
      <div ref={rowRef} {...shell} />
    ) : (
      <AnimatedOrdersQueueRowShell
        ref={rowRef}
        animatePresence={animatePresence}
        animateLayout={animateLayout}
        hoverLift={hoverLift}
        {...shell}
      />
    );

  if (!compoundView?.detail || isMobile) return leaf;

  return (
    <CompoundRowDetailHost
      rowId={String(record.id)}
      detail={compoundView.detail}
      title={compoundView.title}
      columns={columns}
      detailOpen={detailState.open}
      onCloseDetail={detailState.close}
    >
      {leaf}
    </CompoundRowDetailHost>
  );
}, (prev, next) => {
  if (prev.isMobile !== next.isMobile) return false;
  if (prev.record.id !== next.record.id) return false;
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.selectMode !== next.selectMode) return false;
  if (prev.isChecked !== next.isChecked) return false;
  if (prev.quietIdentity !== next.quietIdentity) return false;
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
  // PICK-lane cells.
  if (prev.record.picked_at !== next.record.picked_at) return false;
  if (prev.record.picked_by !== next.record.picked_by) return false;
  if (prev.record.picked_by_name !== next.record.picked_by_name) return false;
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
  if (prev.onCommitStageAssign !== next.onCommitStageAssign) return false;
  if (prev.testerId !== next.testerId) return false;
  if (prev.packerId !== next.packerId) return false;
  // Live fields the COMPOUND `fulfillment` / `item` tracks paint.
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