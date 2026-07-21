'use client';

import { memo, useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import { useMotionPresence, useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { AlertTriangle, Check, FileText } from '@/components/Icons';
import { OrderIdentityChips } from '@/components/ui/OrderIdentityChips';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { RowInlineEditBubble } from './RowInlineEditBubble';
import { RowFieldPreview } from './RowFieldPreview';
import {
  RowTitle,
  RowMetaColumns,
  RowConditionMeta,
  QUEUE_ROW,
  metaIndentFor,
} from '@/components/ui/RowMetaColumns';
import { useIsColumnHidden } from '@/components/ui/table-column-config/TableColumnConfig';
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
  getDaysLateTone,
  getLaneAgeHours,
  getLaneAgeTone,
} from '@/utils/date';
import { isSkuSourceRecord } from '@/utils/source-dot';
import type { ShippedOrder } from '@/lib/neon/orders-queries';
import {
  ORDERS_QUEUE_FROZEN_CELL,
  ordersQueueFrozenLeft,
  ordersQueueGridCell,
  ordersQueueGridTemplate,
  ordersQueueRowShellClass,
} from '@/lib/dashboard-order-row-layout';
import { orderRowQtyTone } from '@/lib/condition-tone';
import { formatSalePrice, type OrdersQueueMode, type QueueRowRecord, type RowStatusMeta } from './helpers';
import { useOrderAssignment } from '@/hooks/useOrderAssignment';
import { useAuth } from '@/contexts/AuthContext';
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
  hasOutOfStock: boolean;
  outOfStockValue: string;
  notesValue: string;
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
  queueMode?: OrdersQueueMode;
  onRowClick: (record: ShippedOrder, event?: { shiftKey: boolean }) => void;
}

/**
 * Pending / fulfillment queue row — Sheets-like 10-column WMS grid:
 *   select(☐) · status · product · qty · cond · age · notes · platform · order · tracking
 * Every fact owns a track; platform/order/tracking render as quiet, icon-less
 * cells so the sticky {@link OrdersQueueColumnHeader} label locks to each column.
 * The drag grip lives only in the header. Matches the header track-for-track.
 */
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
  isMobile,
  disableEnterAnimation = false,
  disableLayoutAnimation = false,
  opaqueStripe = false,
  queueMode = 'fulfillment',
  onRowClick,
}: OrdersQueueTableRowProps) {
  const orderChannelLabel = useOrderChannelLabel();
  const { has } = useAuth();
  const assignOrder = useOrderAssignment();
  const canOos = has('orders.create');
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
  const isStagedRow = queueMode === 'staged';
  const isHidden = useIsColumnHidden();
  const showQtyCol = !isHidden('qty');
  const showConditionCol = !isHidden('condition');

  const animatePresence = !disableEnterAnimation;
  const animateLayout = !disableLayoutAnimation;
  const rowPresence = useMotionPresence(framerPresence.tableRow);
  const mountTransition = useMotionTransition(framerTransition.tableRowMount);
  const layoutTransition = useMotionTransition(framerTransition.chipColumnLayout);

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

  const openEditor = useCallback(
    (field: 'oos' | 'notes', e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      setEditorField(field);
      setEditorAnchor(e.currentTarget);
      setEditorDraft((field === 'oos' ? outOfStockValue : notesValue) || '');
    },
    [outOfStockValue, notesValue],
  );

  const closeEditor = useCallback(() => {
    setEditorField(null);
    setEditorAnchor(null);
  }, []);

  const saveEditor = useCallback(() => {
    const field = editorField;
    if (!field) return;
    const id = Number(record.id);
    const trimmed = editorDraft.trim();
    const current = ((field === 'oos' ? outOfStockValue : notesValue) || '').trim();
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

  const hasNotes = notesValue.trim().length > 0;

  const identityChipProps = {
    platformLabel,
    platformIconClass: platformLabel && productPageUrl ? platformColor : 'text-text-soft',
    platformBorderClass: getOrderPlatformBorderColor(platformLabel),
    productPageUrl,
    marketplaceOrderUrl: orderMarketplaceUrl,
    isFba,
    orderId: record.order_id || '',
    hideOrderId: hideOrderIdChip,
    tracking: trackingRaw,
    trackingAction,
    onPasteTracking: queueMode === 'fulfillment' || queueMode === 'labels' ? onPasteTracking : undefined,
    onReplaceTracking: queueMode === 'fulfillment' || queueMode === 'labels' ? onReplaceTracking : undefined,
    serialChip,
  } as const;

  // Mobile keeps the right-packed icon cluster; desktop splits into quiet,
  // icon-less Platform / Order / Tracking grid cells that lock to the header.
  const chipsNode = <OrderIdentityChips {...identityChipProps} isMobile={isMobile} />;
  const chipsCells = (
    <OrderIdentityChips
      {...identityChipProps}
      isMobile={false}
      variant="plain"
      layout="cells"
      // Shared grid chrome so platform/order/tracking cells carry the same
      // vertical rule + inset as the rest of the row; tracking is the last
      // column (no trailing rule).
      gridCellClass={(col) => ordersQueueGridCell({ rule: col !== 'tracking' })}
    />
  );

  const notesFlagsNode =
    hasNotes || hasOutOfStock ? (
      <span className="inline-flex shrink-0 items-center gap-0.5">
        {hasNotes ? (
          canOos ? (
            <RowFieldPreview label="Notes" value={notesValue.trim()} editable onEdit={(e) => openEditor('notes', e)}>
              <span className="inline-flex min-w-0 max-w-[5.5rem] items-center gap-0.5 text-text-muted" aria-label="Order notes">
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 truncate text-role-caption font-normal normal-case tracking-normal">
                  {notesValue.trim()}
                </span>
              </span>
            </RowFieldPreview>
          ) : (
            <HoverTooltip label={notesValue.trim()} focusable={false}>
              <span className="inline-flex min-w-0 max-w-[5.5rem] items-center gap-0.5 text-text-muted" aria-label="Order notes">
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 truncate text-role-caption font-normal normal-case tracking-normal">
                  {notesValue.trim()}
                </span>
              </span>
            </HoverTooltip>
          )
        ) : null}
        {hasOutOfStock ? (
          canOos ? (
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

  const ageNode =
    daysLate !== null ? (
      <HoverTooltip
        label={`${daysLate} day${daysLate === 1 ? '' : 's'} late${laneAgeLabel ? ` · in lane ${laneAgeLabel}` : ''}`}
        focusable={false}
      >
        <span
          className={cn(
            'inline-flex rounded-md bg-surface-sunken px-1.5 py-0.5 font-mono tabular-nums normal-case tracking-normal ring-1 ring-inset ring-border-soft',
            getDaysLateTone(daysLate),
            densityClasses.metaText,
          )}
        >
          {daysLate}d
        </span>
      </HoverTooltip>
    ) : showLaneAge ? (
      <HoverTooltip label={`In lane ${laneAgeLabel}`} focusable={false}>
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
    ) : (
      <span className="text-text-faint" aria-hidden>
        —
      </span>
    );

  // Select cell — checkbox only. The drag grip lives solely in the sticky header
  // (select-all context); per-row grips clutter the vertical scan line.
  const leadControls = (
    <div
      className={cn(ordersQueueGridCell({ inset: 'none', rule: false }), ORDERS_QUEUE_FROZEN_CELL)}
      style={{ left: ordersQueueFrozenLeft('select') }}
      onClick={(e) => selectMode && e.stopPropagation()}
    >
      {selectMode ? (
        <span
          className={cn(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
            isChecked
              ? 'border-accent-bg bg-accent-bg text-text-inverse'
              : 'border-border-default bg-surface-card',
          )}
        >
          {isChecked ? <Check className="h-3 w-3" /> : null}
        </span>
      ) : (
        <span className="h-4 w-4 shrink-0" aria-hidden />
      )}
    </div>
  );

  // Pipeline status dot — its own grid cell so every row's dot shares one x.
  const statusDotNode = (
    <HoverTooltip label={`${rowStatus.label} — ${rowStatus.description}`} focusable={false}>
      <span className={cn('h-2 w-2 shrink-0 rounded-full', rowStatus.dot)} />
    </HoverTooltip>
  );

  // Desktop Notes cell — truncated notes text + OOS exception flag (both are
  // "attention" signals; distinct tones). Empty → quiet em-dash.
  const desktopNotesCell = (
    <>
      {hasOutOfStock ? (
        canOos ? (
          <RowFieldPreview
            label="Out of stock"
            value={outOfStockValue.trim()}
            tone="danger"
            editable
            onEdit={(e) => openEditor('oos', e)}
          >
            <span className="inline-flex shrink-0 items-center text-red-600" aria-label="Out of stock">
              <AlertTriangle className="h-3.5 w-3.5" />
            </span>
          </RowFieldPreview>
        ) : (
          <HoverTooltip label={outOfStockValue.trim()} focusable={false}>
            <span className="inline-flex shrink-0 items-center text-red-600" aria-label="Out of stock">
              <AlertTriangle className="h-3.5 w-3.5" />
            </span>
          </HoverTooltip>
        )
      ) : null}
      {hasNotes ? (
        canOos ? (
          <RowFieldPreview
            label="Notes"
            value={notesValue.trim()}
            editable
            onEdit={(e) => openEditor('notes', e)}
            className="min-w-0 max-w-full"
          >
            <span className="block min-w-0 flex-1 truncate text-role-caption font-normal normal-case tracking-normal text-text-muted" aria-label="Order notes">
              {notesValue.trim()}
            </span>
          </RowFieldPreview>
        ) : (
          <HoverTooltip label={notesValue.trim()} focusable={false} className="min-w-0 max-w-full">
            <span className="block min-w-0 flex-1 truncate text-role-caption font-normal normal-case tracking-normal text-text-muted" aria-label="Order notes">
              {notesValue.trim()}
            </span>
          </HoverTooltip>
        )
      ) : !hasOutOfStock ? (
        <span className="text-text-faint" aria-hidden>—</span>
      ) : null}
    </>
  );

  const gridTemplate = isMobile ? undefined : ordersQueueGridTemplate();

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
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.998 }}
      onClick={(event) => onRowClick(record, event)}
      onMouseDown={(event) => {
        if (selectMode && event.shiftKey) event.preventDefault();
      }}
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
      aria-label={
        selectMode
          ? `Select order ${record.order_id || record.id}`
          : `Open order ${record.order_id || record.id}`
      }
      data-order-row-id={String(record.id)}
      className={cn(
        'group/row relative',
        ordersQueueRowShellClass(isMobile),
        'cursor-pointer border-b border-border-hairline transition-colors',
        QUEUE_ROW.px,
        isStagedRow
          ? 'py-2.5 hover:bg-blue-50/50'
          : cn('hover:bg-surface-hover', densityClasses.rowPadding),
        isStagedRow
          ? (selectMode ? isChecked : isSelected)
            ? 'bg-blue-50/80'
            : useAlternateStripe
              ? opaqueStripe ? 'bg-surface-canvas' : 'bg-surface-canvas/40'
              : 'bg-surface-card'
          : (selectMode ? isChecked : isSelected)
            ? QUEUE_ROW.selectedClass
            : useAlternateStripe
              ? 'bg-surface-card'
              : opaqueStripe ? 'bg-surface-canvas' : 'bg-surface-canvas/40',
      )}
      style={gridTemplate ? { gridTemplateColumns: gridTemplate } : undefined}
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
                  {ageNode}
                  {notesFlagsNode}
                </>
              }
            />
          </div>
          {chipsNode}
        </>
      ) : (
        <>
          {leadControls}
          <div
            className={cn(ordersQueueGridCell({ inset: 'none' }), 'justify-center', ORDERS_QUEUE_FROZEN_CELL)}
            style={{ left: ordersQueueFrozenLeft('status') }}
          >
            {statusDotNode}
          </div>
          <div
            className={cn(ordersQueueGridCell(), ORDERS_QUEUE_FROZEN_CELL)}
            style={{ left: ordersQueueFrozenLeft('title') }}
            data-frozen-edge
          >
            <span className="min-w-0 truncate text-role-data text-text-default">
              {record.product_title || 'Unknown Product'}
            </span>
          </div>
          {showQtyCol ? (
            <div data-col="qty" className={ordersQueueGridCell()}>
              <span className={cn('min-w-0 truncate font-mono tabular-nums text-role-eyebrow', orderRowQtyTone(qty))}>
                {qty}
              </span>
            </div>
          ) : (
            <span className={ordersQueueGridCell()} />
          )}
          {showConditionCol ? (
            <div data-col="condition" className={cn(ordersQueueGridCell(), 'text-role-eyebrow uppercase text-text-muted')}>
              <span className="min-w-0 truncate">
                <RowConditionMeta condition={record.condition} />
              </span>
            </div>
          ) : (
            <span className={ordersQueueGridCell()} />
          )}
          <div data-col="age" className={ordersQueueGridCell()}>
            {ageNode}
          </div>
          <div data-col="notes" className={cn(ordersQueueGridCell(), 'gap-1')}>
            {desktopNotesCell}
          </div>
          {chipsCells}
        </>
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
  if (prev.opaqueStripe !== next.opaqueStripe) return false;
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
  if (prev.record.serial_number !== next.record.serial_number) return false;
  if (prev.record.sale_amount !== next.record.sale_amount) return false;
  if (prev.record.currency !== next.record.currency) return false;
  if (prev.record.label_printed_at !== next.record.label_printed_at) return false;
  return true;
});
