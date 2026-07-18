'use client';

import { memo, useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import {
  Check,
  AlertTriangle,
  ChevronLeft,
  FileText,
  Truck,
  Trash2,
  X,
  Zap,
} from '@/components/Icons';
import { OrderIdentityChips } from '@/components/ui/OrderIdentityChips';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { RowInlineEditBubble } from './RowInlineEditBubble';
import { RowFieldPreview } from './RowFieldPreview';
import { StaffInitials } from '@/design-system/components/StaffBadge';
import {
  RowTitle,
  RowMetaColumns,
  META_COL,
  META_REST_COL,
  MetaFactSlot,
  RowConditionMeta,
} from '@/components/ui/RowMetaColumns';
import {
  getOrderPlatformColor,
  getOrderPlatformBorderColor,
  isFbaOrder,
  marketplaceOrderUrl,
} from '@/utils/order-platform';
import { useOrderChannelLabel } from '@/hooks/useCatalog';
import { getExternalUrlByItemNumber, skuScanPrefixBeforeColon } from '@/hooks/useExternalItemUrl';
import {
  formatLaneAgeCompact,
  formatOpsStageTime,
  getDaysLateTone,
  getLaneAgeHours,
  getLaneAgeTone,
} from '@/utils/date';
import { isSkuSourceRecord } from '@/utils/source-dot';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import { dashboardOrderRowShellClass } from '@/lib/dashboard-order-row-layout';
import { orderRowQtyTone } from '@/lib/condition-tone';
import { formatSalePrice, type OrdersQueueMode, type QueueRowRecord, type RowStatusMeta } from './helpers';
import { useDeleteOrderRow } from '@/hooks/useDeleteOrderRow';
import { useOrderAssignment } from '@/hooks/useOrderAssignment';
import { useAuth } from '@/contexts/AuthContext';
import { useTableDensity } from '@/hooks/useTableDensity';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

export interface OrdersQueueTableRowProps {
  record: QueueRowRecord;
  isSelected: boolean;
  /** Pencil multi-select on — render a leading checkbox; click toggles. */
  selectMode: boolean;
  /** Whether this row is checked (only meaningful when `selectMode`). */
  isChecked: boolean;
  isMobile: boolean;
  useAlternateStripe: boolean;
  testerDisplay: string;
  packerDisplay: string;
  testerId: number | null;
  packerId: number | null;
  rowStatus: RowStatusMeta;
  /** Optional trailing chip action (Outbound · Labels add-tracking popover). */
  trackingAction?: React.ReactNode;
  /** Optional serial chip column — station (Tech) rows; omitted on dashboard rows. */
  serialChip?: React.ReactNode;
  hasOutOfStock: boolean;
  outOfStockValue: string;
  notesValue: string;
  daysLate: number | null;
  /** Under virtualization the row remounts on every scroll-into-view; skip the
   *  opacity enter so scrolling stays flicker-free (hover/tap remain). Height is
   *  unaffected either way, so `measureElement` still measures cleanly. */
  disableEnterAnimation?: boolean;
  /** Skip Framer `layout` (virtualized remounts). Chip-column reflow + Show more
   *  sibling shift use layout; leave on for dense tables. */
  disableLayoutAnimation?: boolean;
  /** Surface mode — fulfillment enables the hover ops strip. */
  queueMode?: OrdersQueueMode;
  /** `event` carries `shiftKey` for range-select; structural so both mouse +
   *  keyboard events satisfy it. */
  onRowClick: (record: ShippedOrder, event?: { shiftKey: boolean }) => void;
}

/** Memoized row: when React Query merges one updated order, unrelated rows skip re-render. */
export const OrdersQueueTableRow = memo(function OrdersQueueTableRow({
  record,
  isSelected,
  selectMode,
  isChecked,
  useAlternateStripe,
  rowStatus,
  trackingAction,
  serialChip,
  hasOutOfStock,
  outOfStockValue,
  notesValue,
  daysLate,
  testerDisplay,
  packerDisplay,
  testerId,
  packerId,
  isMobile,
  disableEnterAnimation = false,
  disableLayoutAnimation = false,
  queueMode = 'fulfillment',
  onRowClick,
}: OrdersQueueTableRowProps) {
  const orderChannelLabel = useOrderChannelLabel();
  const { has } = useAuth();
  const deleteOrder = useDeleteOrderRow();
  const assignOrder = useOrderAssignment();
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Row-local "quick actions" expander: the chevron toggles the chip cluster out
  // and the Truck/OOS/Notes/Delete buttons in — in place, without opening the dock.
  const [actionsOpen, setActionsOpen] = useState(false);
  // A chip hover-menu (platform / order / tracking) is open — keep the row's
  // hover chrome (chevron + shifted chips) up even though the mouse is over the
  // menu's body portal (outside the row, so :hover/:focus-within don't hold).
  const [chipMenuOpen, setChipMenuOpen] = useState(false);
  // Notion-style inline editor: which field is open, anchored to its trigger button,
  // with a local draft. Notes + OOS both persist through `useOrderAssignment`.
  const [editorField, setEditorField] = useState<'oos' | 'notes' | null>(null);
  const [editorAnchor, setEditorAnchor] = useState<HTMLElement | null>(null);
  const [editorDraft, setEditorDraft] = useState('');
  const editorOpen = editorField !== null;
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
  const platformLabel = orderChannelLabel(record.order_id || '', record.account_source);
  const isFba = isFbaOrder(record.order_id, record.account_source);
  const platformColor = platformLabel ? getOrderPlatformColor(platformLabel) : '';
  const productPageUrl = getExternalUrlByItemNumber(
    String(record.item_number || '').trim() || skuScanPrefixBeforeColon(trackingRaw),
  );
  const orderMarketplaceUrl = marketplaceOrderUrl(record.order_id, record.account_source);
  const salePrice = formatSalePrice(record.sale_amount, record.currency);
  const isUrgent = Boolean((record as QueueRowRecord & { is_urgent?: unknown }).is_urgent);
  const showOpsStrip = queueMode === 'fulfillment' && !selectMode;
  const canShip = has('shipping.mark_shipped');
  const canOos = has('orders.create');
  const canDelete = has('orders.void');
  // Quick-actions expander is a desktop, hover-driven affordance — mobile has no
  // hover and keeps its untouched full-width chip layout.
  const showQuickActions = showOpsStrip && !isMobile && (canShip || canOos || canDelete);

  const toggleActions = useCallback((e: React.MouseEvent) => {
    // Not the row body: expanding actions must never open the detail dock.
    e.stopPropagation();
    setActionsOpen((v) => !v);
    setConfirmDelete(false);
  }, []);

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

  // Overwrite an existing tracking number (chip menu → "Replace tracking").
  const onReplaceTracking = useCallback(
    (value: string) => {
      const id = Number(record.id);
      if (!Number.isFinite(id)) return;
      const next = String(value || '').trim();
      if (!next) return;
      assignOrder.mutate(
        { orderId: id, shippingTrackingNumber: next },
        {
          onSuccess: () => toast.success('Tracking replaced'),
          onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed to replace tracking'),
        },
      );
    },
    [assignOrder, record.id],
  );

  const onMarkShipped = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      // Open detail dock — full mark-shipped form owns validation (no silent status write).
      onRowClick(record, e);
    },
    [onRowClick, record],
  );

  const onToggleUrgent = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const id = Number(record.id);
      if (!Number.isFinite(id)) return;
      const next = !isUrgent;
      assignOrder.mutate(
        { orderId: id, isUrgent: next },
        {
          onSuccess: () => toast.success(next ? 'Marked urgent' : 'Urgent cleared'),
          onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to update urgent'),
        },
      );
    },
    [assignOrder, isUrgent, record.id],
  );

  // Open the inline bubble for a field, anchored to the clicked button.
  const openEditor = useCallback(
    (field: 'oos' | 'notes', e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      // Anchor to the clicked trigger (a quick-action button OR a meta-row
      // preview icon). The strip buttons additionally keep the expander open;
      // the meta-row icon edits in place without opening the strip.
      setConfirmDelete(false);
      setEditorField(field);
      setEditorAnchor(e.currentTarget);
      setEditorDraft((field === 'oos' ? outOfStockValue : notesValue) || '');
    },
    [outOfStockValue, notesValue],
  );

  const closeEditor = useCallback(() => {
    setEditorField(null);
    setEditorAnchor(null);
    setActionsOpen(false);
  }, []);

  const saveEditor = useCallback(() => {
    const field = editorField;
    if (!field) return;
    const id = Number(record.id);
    const trimmed = editorDraft.trim();
    const current = ((field === 'oos' ? outOfStockValue : notesValue) || '').trim();
    // Empty string clears the field (route sets the column verbatim). Skip a no-op.
    if (Number.isFinite(id) && trimmed !== current) {
      assignOrder.mutate(
        field === 'oos' ? { orderId: id, outOfStock: trimmed } : { orderId: id, notes: trimmed },
        {
          onSuccess: () =>
            toast.success(
              field === 'oos'
                ? trimmed
                  ? 'Marked out of stock'
                  : 'Cleared out of stock'
                : trimmed
                  ? 'Notes saved'
                  : 'Notes cleared',
            ),
          onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to save'),
        },
      );
    }
    closeEditor();
  }, [assignOrder, closeEditor, editorDraft, editorField, notesValue, outOfStockValue, record.id]);

  const onDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!confirmDelete) {
        setConfirmDelete(true);
        return;
      }
      const id = Number(record.id);
      if (!Number.isFinite(id)) return;
      deleteOrder.mutate(
        { orderId: id },
        {
          onSuccess: () => {
            setConfirmDelete(false);
            toast.success('Order deleted');
          },
          onError: (err) => {
            setConfirmDelete(false);
            toast.error(err instanceof Error ? err.message : 'Failed to delete');
          },
        },
      );
    },
    [confirmDelete, deleteOrder, record.id],
  );

  const cancelDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmDelete(false);
  }, []);
  const hasTester = testerDisplay && testerDisplay !== '---';
  const hasPacker = packerDisplay && packerDisplay !== '---';
  // Packed (staged) rows always show tester + packer slots so initials stay
  // column-aligned; StaffInitials renders "--" when unassigned. Fulfillment
  // queues (Pending/Tested/Blocked) only render roles that are actually set —
  // Tested must not show a ghost packer "--".
  const showStaffCluster = queueMode === 'staged' || hasTester || hasPacker;
  const hasNotes = notesValue.trim().length > 0;
  // "done" dot, shown only once the timestamp is stamped.
  const labelPrintedAt = record.label_printed_at;
  // Stage time on meta row 2 — tested / packed / ship-out when stamped.
  const testedAt =
    record.test_date_time || record.test_activity_at || null;
  const packedAt = record.packed_at || record.pack_activity_at || null;
  const shippedAt = record.ship_confirmed_at || null;
  const stageTime = shippedAt || packedAt || (hasTester ? testedAt : null);
  const stageTimeLabel = shippedAt
    ? 'Shipped out'
    : packedAt
      ? 'Packed'
      : testedAt
        ? 'Tested'
        : null;
  const stageTimeDisplay = stageTime ? formatOpsStageTime(stageTime) : null;
  // Lane age for prioritization (hours in stage) — created_at / tested / packed.
  const laneAgeSource =
    packedAt || (hasTester ? testedAt : null) || record.created_at || record.deadline_at || null;
  const laneAgeLabel = formatLaneAgeCompact(laneAgeSource);
  const laneAgeHours = getLaneAgeHours(laneAgeSource);
  // Deadline lateness owns the urgency slot — omit lane age when days-late is
  // present so the meta subrow does not show two aging numbers (`38` + `37d`).
  const showLaneAge = Boolean(laneAgeLabel) && daysLate === null;
  const { classes: densityClasses } = useTableDensity();
  const isStagedRow = queueMode === 'staged';

  // Presence (enter/exit) and layout (chip reflow / sibling shift) are independent:
  // virtualized skips both; dense Show more uses parent AnimatePresence for
  // presence while this row still layouts so the left title tracks ChipColumns.
  const animatePresence = !disableEnterAnimation;
  const animateLayout = !disableLayoutAnimation;
  const rowPresence = useMotionPresence(framerPresence.tableRow);
  const mountTransition = useMotionTransition(framerTransition.tableRowMount);
  const layoutTransition = useMotionTransition(framerTransition.chipColumnLayout);
  // In-row focus-surface crossfade (chips ⇄ quick actions): reuse the sanctioned
  // right-pane preset so reduced motion collapses it to a pure opacity swap.
  const actionsPresence = useMotionPresence(framerPresence.workbenchPane);
  const swapTransition = useMotionTransition(framerTransition.workbenchPaneMount);

  const chipsNode = (
    <OrderIdentityChips
      platformLabel={platformLabel}
      platformIconClass={platformLabel && productPageUrl ? platformColor : 'text-text-soft'}
      platformBorderClass={getOrderPlatformBorderColor(platformLabel)}
      productPageUrl={productPageUrl}
      marketplaceOrderUrl={orderMarketplaceUrl}
      isFba={isFba}
      orderId={record.order_id || ''}
      hideOrderId={hideOrderIdChip}
      tracking={trackingRaw}
      trackingAction={trackingAction}
      onPasteTracking={queueMode === 'fulfillment' || queueMode === 'labels' ? onPasteTracking : undefined}
      onReplaceTracking={queueMode === 'fulfillment' || queueMode === 'labels' ? onReplaceTracking : undefined}
      serialChip={serialChip}
      isMobile={isMobile}
      onMenuOpenChange={showQuickActions ? setChipMenuOpen : undefined}
    />
  );

  const notesFlagsNode =
    hasNotes || hasOutOfStock ? (
      <span className="inline-flex items-center gap-0.5">
        {hasNotes ? (
          showQuickActions ? (
            <RowFieldPreview
              label="Notes"
              value={notesValue.trim()}
              editable
              onEdit={(e) => openEditor('notes', e)}
            >
              <span className="inline-flex items-center text-text-muted" aria-label="Order notes">
                <FileText className="h-3.5 w-3.5" />
              </span>
            </RowFieldPreview>
          ) : (
            <HoverTooltip label={notesValue.trim()} focusable={false}>
              <span className="inline-flex items-center text-text-muted" aria-label="Order notes">
                <FileText className="h-3.5 w-3.5" />
              </span>
            </HoverTooltip>
          )
        ) : null}
        {hasOutOfStock ? (
          showQuickActions ? (
            <RowFieldPreview
              label="Out of stock"
              value={outOfStockValue.trim()}
              tone="danger"
              editable
              onEdit={(e) => openEditor('oos', e)}
            >
              <span className="inline-flex items-center text-red-600" aria-label="Out of stock">
                <AlertTriangle className="h-3.5 w-3.5" />
              </span>
            </RowFieldPreview>
          ) : (
            <HoverTooltip label={outOfStockValue.trim()} focusable={false}>
              <span className="inline-flex items-center text-red-600" aria-label="Out of stock">
                <AlertTriangle className="h-3.5 w-3.5" />
              </span>
            </HoverTooltip>
          )
        ) : null}
      </span>
    ) : null;

  const hasStageTime = Boolean(
    stageTimeDisplay && stageTimeDisplay !== '--:--' && stageTimeLabel,
  );

  const stageTimeAndFlagsNode =
    isStagedRow || hasStageTime || notesFlagsNode ? (
      <span className="inline-flex shrink-0 items-center gap-0.5 normal-case tracking-normal">
        {isStagedRow ? (
          <MetaFactSlot width={META_REST_COL.stageTime} className="text-text-faint">
            {hasStageTime ? (
              <HoverTooltip
                label={`${stageTimeLabel} ${stageTimeDisplay}`}
                focusable={false}
              >
                <span className="truncate">{stageTimeDisplay}</span>
              </HoverTooltip>
            ) : null}
          </MetaFactSlot>
        ) : hasStageTime ? (
          <HoverTooltip
            label={`${stageTimeLabel} ${stageTimeDisplay}`}
            focusable={false}
          >
            <span className="tabular-nums text-text-faint">{stageTimeDisplay}</span>
          </HoverTooltip>
        ) : null}
        {notesFlagsNode}
      </span>
    ) : null;

  return (
    <motion.div
      layout={animateLayout}
      layoutScroll={animateLayout}
      {...(animatePresence ? rowPresence : {})}
      transition={
        animatePresence || animateLayout
          ? {
              ...(animateLayout ? { layout: layoutTransition } : {}),
              ...(animatePresence
                ? { opacity: mountTransition, y: mountTransition }
                : {}),
            }
          : undefined
      }
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.998 }}
      onClick={(event) => onRowClick(record, event)}
      // Shift-click in select mode otherwise starts a native text selection
      // across the range — suppress it so range-select reads cleanly.
      onMouseDown={(event) => { if (selectMode && event.shiftKey) event.preventDefault(); }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onRowClick(record, event);
        }
      }}
      role={selectMode ? 'checkbox' : 'button'}
      tabIndex={0}
      aria-checked={selectMode ? isChecked : undefined}
      aria-pressed={selectMode ? undefined : isSelected}
      aria-label={selectMode ? `Select order ${record.order_id || record.id}` : `Open order ${record.order_id || record.id}`}
      data-order-row-id={String(record.id)}
      className={cn(
        'group/row relative',
        dashboardOrderRowShellClass(isMobile),
        'border-b border-border-hairline cursor-pointer transition-colors',
        isStagedRow
          ? 'px-4 py-2 hover:bg-blue-50/50'
          : cn('px-3 hover:bg-surface-hover', densityClasses.rowPadding),
        isStagedRow
          ? (selectMode ? isChecked : isSelected)
            ? 'bg-blue-50/80'
            : useAlternateStripe
              ? 'bg-surface-canvas/40'
              : 'bg-surface-card'
          : (selectMode ? isChecked : isSelected)
            ? 'bg-blue-50 ring-1 ring-inset ring-blue-400'
            : useAlternateStripe
              ? 'bg-surface-card'
              : 'bg-surface-canvas/40',
      )}
    >
      <motion.div
        layout={animateLayout}
        className="flex min-w-0 flex-col"
        transition={animateLayout ? { layout: layoutTransition } : undefined}
      >
        <RowTitle
          leading={
            selectMode ? (
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                  isChecked ? 'border-accent-bg bg-accent-bg text-text-inverse' : 'border-border-default bg-surface-card'
                }`}
              >
                {isChecked && <Check className="h-3 w-3" />}
              </span>
            ) : undefined
          }
          dot={rowStatus.dot}
          dotTitle={`${rowStatus.label} — ${rowStatus.description}`}
          title={record.product_title || 'Unknown Product'}
        />
        <RowMetaColumns
          // Select mode adds a leading checkbox (w-4 + mr-2 = 1.5rem); shift the
          // meta indent by that same offset so qty stays under the title.
          indent={selectMode ? `calc(${META_COL.indent} + 1.5rem)` : undefined}
          qty={<span className={orderRowQtyTone(qty)}>{qty}</span>}
          condition={<RowConditionMeta condition={record.condition} />}
          // Meta `rest` = fact-only slots (never ghost "---" placeholders).
          // Order is stable so columns scan vertically across rows:
          //   price → daysLate → staff (assigned only) → flags (notes | OOS) → LBL
          // PENDING/BLOCKED have no tester yet → staff slot omitted entirely.
          // Notes + OOS share a "flags" cluster: both are exception icons, different
          // tone (muted doc vs red alert) so they read as related but not identical.
          rest={
            <>
              {/* Status word (Pending / Tested / Out of stock / …) is redundant in
                  the row — each queue mode is its own table. The status still reads
                  from the colored dot + its hover tooltip (dotTitle). Urgent is
                  toggled from the quick-actions ⚡ button, not shown as a row icon. */}
              {salePrice ? (
                <span className="normal-case tracking-normal text-text-success">{salePrice}</span>
              ) : null}
              {daysLate !== null ? (
                <HoverTooltip
                  label={`${daysLate} day${daysLate === 1 ? '' : 's'} late${
                    laneAgeLabel ? ` · in lane ${laneAgeLabel}` : ''
                  }`}
                  focusable={false}
                >
                  <span
                    className={cn(
                      'font-mono tabular-nums normal-case tracking-normal',
                      getDaysLateTone(daysLate),
                      densityClasses.metaText,
                    )}
                  >
                    {daysLate}
                  </span>
                </HoverTooltip>
              ) : null}
              {queueMode === 'staged' ? (
                <span className="inline-flex items-center gap-0.5 normal-case tracking-normal">
                  {showLaneAge ? (
                    <MetaFactSlot
                      width={META_REST_COL.laneAge}
                      className={cn('font-mono', densityClasses.metaText, getLaneAgeTone(laneAgeHours))}
                    >
                      <HoverTooltip
                        label={`In lane ${laneAgeLabel}${stageTimeLabel ? ` · last ${stageTimeLabel.toLowerCase()}` : ''}`}
                        focusable={false}
                      >
                        <span>{laneAgeLabel}</span>
                      </HoverTooltip>
                    </MetaFactSlot>
                  ) : null}
                  <MetaFactSlot width={META_REST_COL.staff}>
                    {hasTester ? (
                      <HoverTooltip label={`Tested by ${testerDisplay}`} focusable={false}>
                        <StaffInitials staffId={testerId} name={testerDisplay} />
                      </HoverTooltip>
                    ) : (
                      <StaffInitials staffId={testerId} name={testerDisplay} />
                    )}
                  </MetaFactSlot>
                  <MetaFactSlot width={META_REST_COL.staff}>
                    {hasPacker ? (
                      <HoverTooltip label={`Packed by ${packerDisplay}`} focusable={false}>
                        <StaffInitials staffId={packerId} name={packerDisplay} />
                      </HoverTooltip>
                    ) : (
                      <StaffInitials staffId={packerId} name={packerDisplay} />
                    )}
                  </MetaFactSlot>
                  {stageTimeAndFlagsNode}
                </span>
              ) : (
                <>
                  {showLaneAge ? (
                    <HoverTooltip
                      label={`In lane ${laneAgeLabel}${stageTimeLabel ? ` · last ${stageTimeLabel.toLowerCase()}` : ''}`}
                      focusable={false}
                    >
                      <span
                        className={cn(
                          'font-mono tabular-nums normal-case tracking-normal',
                          getLaneAgeTone(laneAgeHours),
                          densityClasses.metaText,
                        )}
                      >
                        {laneAgeLabel}
                      </span>
                    </HoverTooltip>
                  ) : null}
                  {showStaffCluster ? (
                    <span className="inline-flex items-center gap-1 normal-case tracking-normal">
                      {hasTester ? (
                        <HoverTooltip label={`Tested by ${testerDisplay}`} focusable={false}>
                          <StaffInitials staffId={testerId} name={testerDisplay} />
                        </HoverTooltip>
                      ) : null}
                      {hasPacker ? (
                        <HoverTooltip label={`Packed by ${packerDisplay}`} focusable={false}>
                          <StaffInitials staffId={packerId} name={packerDisplay} />
                        </HoverTooltip>
                      ) : null}
                    </span>
                  ) : null}
                  {stageTimeAndFlagsNode}
                </>
              )}
              {labelPrintedAt ? (
                <HoverTooltip label="Label printed" focusable={false}>
                  <span className="flex items-center gap-1 text-text-success">
                    <span className="h-2 w-2 rounded-full bg-fill-success" />
                    LBL
                  </span>
                </HoverTooltip>
              ) : null}
            </>
          }
        />
      </motion.div>

      {showQuickActions ? (
        <div className="relative flex min-w-0 items-center justify-end">
          {/* Chips sit flush-right by default; on row hover they slide left (transform
              only) to make room for the chevron, and fade out when actions open. */}
          <motion.div
            animate={{ opacity: actionsOpen ? 0 : 1 }}
            transition={swapTransition}
            aria-hidden={actionsOpen || undefined}
            className={cn(
              'min-w-0 transition-transform duration-150 ease-out',
              actionsOpen
                ? 'pointer-events-none'
                : chipMenuOpen
                  ? '-translate-x-8'
                  : 'group-hover/row:-translate-x-8 group-focus-within/row:-translate-x-8',
            )}
          >
            {chipsNode}
          </motion.div>

          {/* Quick actions crossfade in over the (hidden) chips, left of the chevron. */}
          <AnimatePresence>
            {actionsOpen ? (
              <motion.div
                key="row-quick-actions"
                initial={actionsPresence.initial}
                animate={actionsPresence.animate}
                exit={actionsPresence.exit}
                transition={swapTransition}
                className="absolute inset-y-0 right-8 flex items-center justify-end gap-0.5"
                onClick={(e) => e.stopPropagation()}
              >
                {canOos ? (
                  <motion.div layout="position" transition={layoutTransition} className="flex items-center">
                    <HoverTooltip label={hasNotes ? 'Edit notes' : 'Add notes'} asChild>
                      <button
                        type="button"
                        onClick={(e) => {
                          setActionsOpen(true);
                          openEditor('notes', e);
                        }}
                        aria-label={hasNotes ? 'Edit notes' : 'Add notes'}
                        aria-expanded={editorField === 'notes'}
                        className={cn(
                          'ds-raw-button inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-surface-hover',
                          hasNotes ? 'text-text-default' : 'text-text-muted',
                        )}
                      >
                        <FileText className="h-3.5 w-3.5" />
                      </button>
                    </HoverTooltip>
                  </motion.div>
                ) : null}
                {canOos ? (
                  <motion.div layout="position" transition={layoutTransition} className="flex items-center">
                    <HoverTooltip label={isUrgent ? 'Clear urgent' : 'Mark urgent'} asChild>
                      <button
                        type="button"
                        onClick={onToggleUrgent}
                        disabled={assignOrder.isPending}
                        aria-label={isUrgent ? 'Clear urgent' : 'Mark urgent'}
                        aria-pressed={isUrgent}
                        className={cn(
                          'ds-raw-button inline-flex h-7 w-7 items-center justify-center rounded-md text-amber-600 disabled:opacity-60',
                          isUrgent ? 'bg-amber-100' : 'hover:bg-amber-50',
                        )}
                      >
                        <Zap className={cn('h-3.5 w-3.5', isUrgent && 'fill-current')} />
                      </button>
                    </HoverTooltip>
                  </motion.div>
                ) : null}
                {canShip ? (
                  <motion.div layout="position" transition={layoutTransition} className="flex items-center">
                    <HoverTooltip label="Mark as shipped" asChild>
                      <button
                        type="button"
                        onClick={onMarkShipped}
                        className="ds-raw-button inline-flex h-7 w-7 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50"
                        aria-label="Mark as shipped"
                      >
                        <Truck className="h-3.5 w-3.5" />
                      </button>
                    </HoverTooltip>
                  </motion.div>
                ) : null}
                {canOos ? (
                  <motion.div layout="position" transition={layoutTransition} className="flex items-center">
                    <HoverTooltip label={hasOutOfStock ? 'Edit out of stock' : 'Mark out of stock'} asChild>
                      <button
                        type="button"
                        onClick={(e) => {
                          setActionsOpen(true);
                          openEditor('oos', e);
                        }}
                        aria-label={hasOutOfStock ? 'Edit out of stock' : 'Mark out of stock'}
                        aria-expanded={editorField === 'oos'}
                        className={cn(
                          'ds-raw-button inline-flex h-7 w-7 items-center justify-center rounded-md text-red-600',
                          hasOutOfStock ? 'bg-red-50' : 'hover:bg-red-50',
                        )}
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                      </button>
                    </HoverTooltip>
                  </motion.div>
                ) : null}
                {canDelete ? (
                  // `layout` animates this slot's width (and slides its siblings)
                  // as it swaps trash ⇄ confirm; the swap itself crossfades.
                  <motion.div layout transition={layoutTransition} className="flex items-center">
                    <AnimatePresence mode="wait" initial={false}>
                      {confirmDelete ? (
                        <motion.span
                          key="confirm"
                          initial={{ opacity: 0, scale: 0.85 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.85 }}
                          transition={swapTransition}
                          className="inline-flex items-center gap-0.5"
                        >
                          {/* Armed — a distinct confirm button (never a silent second-click).
                              Success fires a bottom-right toast (Toaster in Providers.tsx). */}
                          <button
                            type="button"
                            onClick={onDelete}
                            disabled={deleteOrder.isPending}
                            aria-label="Confirm delete order"
                            className="ds-raw-button inline-flex h-7 items-center gap-1 rounded-md bg-rose-600 px-2 text-white hover:bg-rose-700 disabled:opacity-60"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span className="text-role-eyebrow uppercase tracking-widest leading-none">
                              Confirm
                            </span>
                          </button>
                          <HoverTooltip label="Cancel" asChild>
                            <button
                              type="button"
                              onClick={cancelDelete}
                              aria-label="Cancel delete"
                              className="ds-raw-button inline-flex h-7 w-7 items-center justify-center rounded-md text-text-soft hover:bg-surface-hover hover:text-text-default"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </HoverTooltip>
                        </motion.span>
                      ) : (
                        <motion.span
                          key="trash"
                          initial={{ opacity: 0, scale: 0.85 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.85 }}
                          transition={swapTransition}
                          className="inline-flex items-center"
                        >
                          <HoverTooltip label="Delete order" asChild>
                            <button
                              type="button"
                              onClick={onDelete}
                              aria-label="Delete order"
                              className="ds-raw-button inline-flex h-7 w-7 items-center justify-center rounded-md text-rose-600 hover:bg-rose-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </HoverTooltip>
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Far-right chevron — slides in on row hover; click reveals quick actions
              in place (never opens the detail dock). Stays visible while open. */}
          <HoverTooltip label={actionsOpen ? 'Hide quick actions' : 'Quick actions'} asChild>
            <button
              type="button"
              onClick={toggleActions}
              aria-expanded={actionsOpen}
              aria-label={actionsOpen ? 'Hide quick actions' : 'Show quick actions'}
              className={cn(
                'ds-raw-button absolute right-0 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-md text-text-soft transition duration-150 hover:bg-surface-hover hover:text-text-default',
                actionsOpen || chipMenuOpen
                  ? 'opacity-100 translate-x-0 pointer-events-auto'
                  : 'opacity-0 translate-x-1 pointer-events-none group-hover/row:opacity-100 group-hover/row:translate-x-0 group-hover/row:pointer-events-auto group-focus-within/row:opacity-100 group-focus-within/row:translate-x-0 group-focus-within/row:pointer-events-auto',
              )}
            >
              <ChevronLeft
                className={cn('h-4 w-4 transition-transform duration-150', actionsOpen && 'rotate-180')}
              />
            </button>
          </HoverTooltip>
        </div>
      ) : (
        chipsNode
      )}

      {editorOpen ? (
        <RowInlineEditBubble
          anchor={editorAnchor}
          title={editorField === 'oos' ? 'Out of stock' : 'Notes'}
          tone={editorField === 'oos' ? 'danger' : 'default'}
          value={editorDraft}
          onChange={setEditorDraft}
          onSave={saveEditor}
          onClose={closeEditor}
          placeholder={editorField === 'oos' ? 'What needs to be ordered?' : 'Add a note…'}
          saving={assignOrder.isPending}
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
  if (prev.testerDisplay !== next.testerDisplay) return false;
  if (prev.packerDisplay !== next.packerDisplay) return false;
  if (prev.testerId !== next.testerId) return false;
  if (prev.packerId !== next.packerId) return false;
  if (prev.rowStatus.dot !== next.rowStatus.dot) return false;
  if (prev.rowStatus.label !== next.rowStatus.label) return false;
  if (prev.hasOutOfStock !== next.hasOutOfStock) return false;
  if (prev.outOfStockValue !== next.outOfStockValue) return false;
  if (prev.notesValue !== next.notesValue) return false;
  if (prev.daysLate !== next.daysLate) return false;
  if (prev.record.product_title !== next.record.product_title) return false;
  if (prev.record.condition !== next.record.condition) return false;
  if (prev.record.order_id !== next.record.order_id) return false;
  if (prev.record.quantity !== next.record.quantity) return false;
  // Station (Tech) rows carry a serial chip built from this value — compare the
  // value, not the freshly-created `serialChip` node (which would defeat memo).
  if (prev.record.serial_number !== next.record.serial_number) return false;
  if (prev.record.sale_amount !== next.record.sale_amount) return false;
  if (
    (prev.record as { is_urgent?: unknown }).is_urgent !==
    (next.record as { is_urgent?: unknown }).is_urgent
  )
    return false;
  if (prev.record.currency !== next.record.currency) return false;
  if (prev.record.label_printed_at !== next.record.label_printed_at) return false;
  return true;
});
