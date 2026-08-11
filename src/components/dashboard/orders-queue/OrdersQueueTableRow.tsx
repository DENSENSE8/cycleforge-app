'use client';

import { Fragment, memo, useCallback, useRef, useState, type ReactNode } from 'react';
import { motion } from '@/design-system/motion';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { ChevronDown, Plus } from '@/components/Icons';
import { useRouter } from 'next/navigation';
import { useOrderIdentityCellNodes, OrderIdentityChips } from '@/components/ui/OrderIdentityChips';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { gridCellAlignClass, LedgerCellEditor } from '@/design-system/components/grid';
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
  capabilities,
  onRowClick,
  onRowOpen,
  onRequestReplaceTracking,
}: OrdersQueueTableRowProps) {
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
  const scanRefFromRecord = (record as QueueRowRecord & { scan_ref?: unknown }).scan_ref;
  const scanRefForSku =
    (typeof scanRefFromRecord === 'string' && scanRefFromRecord ? scanRefFromRecord : null) ?? trackingRaw;
  const hideOrderIdChip = isSkuSourceRecord({
    orderId: record.order_id,
    accountSource: record.account_source,
    trackingType: record.tracking_type,
    scanRef: scanRefForSku,
  });
  // Platform label feeds OrderIdChip tooltip only (`Platform full-id` SoT) —
  // this surface never paints a PlatformChip / PlatformMark or color-maps.
  const platformLabel = orderChannelLabel(record.order_id || '', record.account_source);
  const isFba = isFbaOrder(record.order_id, record.account_source);
  const orderMarketplaceUrl = marketplaceOrderUrl(record.order_id, record.account_source);
  const salePrice = formatSalePrice(record.sale_amount, record.currency);

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

  const { classes: densityClasses } = useTableDensity();
  const isStagedRow = queueMode === 'staged' || queueMode === 'shipped';

  // In-cell editing is a Pending-grid affordance: board/Packed/station rows
  // stay display-only. Selection no longer competes with editing — the grid's
  // left gutter is always-on (checkbox toggles; row body opens), so editors
  // stay armed regardless of `selectMode`.
  const gridEditable = gridSkin && !isMobile;

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
  const rowPresence = useMotionPresence(framerPresence.tableRow);
  const mountTransition = useMotionTransition(framerTransition.tableRowMount);
  const layoutTransition = useMotionTransition(framerTransition.chipColumnLayout);

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

  const conditionValue = String(record.condition || '').trim();
  const conditionLabel = conditionGradeTableLabel(conditionValue);
  const conditionEmpty = isEmptyMetaDash(conditionLabel);

  const identityChipProps = {
    platformLabel,
    productPageUrl: null as string | null,
    marketplaceOrderUrl: orderMarketplaceUrl,
    isFba,
    orderId: record.order_id || '',
    hideOrderId: hideOrderIdChip,
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
    // SoT identity: Hash / MapPin tone glyphs on Order + Tracking chips.
    variant: 'icons' as const,
    // No platform column on this surface — order + tracking only.
    showPlatform: false,
  };

  // Chip nodes built once per row; the registry places each in its own cell so
  // order / tracking survive any column order.
  const identityNodes = useOrderIdentityCellNodes(identityChipProps);

  const gridTemplate = isMobile ? undefined : ordersQueueGridTemplateFor(columns);
  const cellInset = gridSkin ? ('grid' as const) : ('cell' as const);
  const dataCell = (col: OrdersQueueColumn, rule = true) =>
    cn(ordersQueueGridCell({ rule, inset: cellInset }), gridCellAlignClass(col));

  // Mobile keeps the right-packed icon cluster (order + tracking; no platform).
  const chipsNode = <OrderIdentityChips {...identityChipProps} isMobile={isMobile} />;

  const deadlineKey = toPSTDateKey(record.deadline_at);
  const deadlineLabel = deadlineKey ? formatDateWithOrdinal(deadlineKey) : null;
  const dateCellData = formatQueueRowDateCell(queueRowShipBySource(record));
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

  const dateNode = (
    <GridDateCellValue
      label={dateCellData?.label}
      tooltip={dateCellData?.tooltip}
      className={densityClasses.metaText}
    />
  );

  // Mobile meta: days-late + lane-age fallback. Desktop Late column is
  // days-late only (ship-by civil date stays in the tooltip).
  const ageNode = (
    <GridAgeCellValue
      daysLate={daysLate}
      laneAgeLabel={showLaneAge ? laneAgeLabel : null}
      laneAgeHours={laneAgeHours}
      tooltip={ageTooltip}
      className={densityClasses.metaText}
    />
  );

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
        // Structural slack track — empty header/body; never a fact column.
        return (
          <div
            data-col="_fill"
            role="presentation"
            aria-hidden
            className={cn(dataCell(col, false), 'min-h-0')}
          />
        );
      default:
        return <span className={dataCell(col, rule)} />;
    }
  };

  const inTable = rowIndex != null;

  return (
    <motion.div
      aria-rowindex={rowIndex}
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
      whileHover={gridSkin ? undefined : { x: 2 }}
      whileTap={gridSkin ? undefined : { scale: 0.998 }}
      onClick={(event) =>
        onRowClick(record, {
          shiftKey: event.shiftKey,
          detail: event.detail,
          target: event.target,
        })
      }
      onDoubleClick={() => {
        if (clickSelect) onRowOpen?.(record);
      }}
      onMouseDown={(event) => {
        if ((selectMode || clickSelect) && event.shiftKey) event.preventDefault();
      }}
      onKeyDown={(event) => {
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
      }}
      // Inside a `role="table"` grid this element IS the row — an element has
      // exactly one role, and a table whose rows claim `button`/`checkbox` has
      // no rows at all. Selection moves to `aria-selected` (valid on `row`);
      // under clickSelect the gutter checkbox + wash both show membership.
      // Outside a table the original interactive roles stand.
      role={inTable ? 'row' : clickSelect || selectMode ? 'checkbox' : 'button'}
      tabIndex={0}
      aria-selected={inTable ? isChecked : undefined}
      aria-checked={!inTable && (clickSelect || selectMode) ? isChecked : undefined}
      aria-pressed={inTable || clickSelect || selectMode ? undefined : isSelected}
      aria-label={
        clickSelect || selectMode
          ? `Select order ${record.order_id || record.id}`
          : `Open order ${record.order_id || record.id}`
      }
      data-order-row-id={String(record.id)}
      className={cn(
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
      )}
      style={
        gridTemplate || rowFillHex
          ? {
              ...(gridTemplate ? { gridTemplateColumns: gridTemplate } : undefined),
              // Selection wash wins; custom paint only when not checked.
              ...((clickSelect || selectMode || gridSkin ? isChecked : isSelected) || !rowFillHex
                ? undefined
                : { backgroundColor: rowFillHex }),
            }
          : undefined
      }
    >
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
    </motion.div>
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
  const prevR = prev.record as Record<string, unknown>;
  const nextR = next.record as Record<string, unknown>;
  if (prevR.replenishment_request_id !== nextR.replenishment_request_id) return false;
  if (prevR.replenishment_status !== nextR.replenishment_status) return false;
  if (prevR.replenishment_quantity_to_order !== nextR.replenishment_quantity_to_order) return false;
  if (prevR.replenishment_po_number !== nextR.replenishment_po_number) return false;
  if (prevR.replenishment_notes !== nextR.replenishment_notes) return false;
  return true;
});
