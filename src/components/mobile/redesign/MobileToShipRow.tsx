'use client';

/**
 * Phone to-ship card — two rows only. Photo stretches the card height.
 * Title; qty · price · condition + listing + Ship.
 */

import { useCallback, useRef } from 'react';
import { ExternalLink, Truck } from '@/components/Icons';
import { OrderIdChip, TrackingChip, getLast8 } from '@/components/ui/CopyChip';
import { Button, IconButton, Panel } from '@/design-system/primitives';
import { BUTTON_VARIANTS } from '@/design-system/primitives/button-variants';
import {
  ItemRecordQtyBadge,
  ItemRecordThumb,
  ItemRecordMobileMeta,
} from '@/design-system/components/item-record';
import {
  ITEM_RECORD_MOBILE_THUMB,
  ITEM_RECORD_MOBILE_TITLE,
} from '@/design-system/tokens/item-record-mobile';
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  type PanInfo,
} from '@/design-system/motion';
import { framerTransition } from '@/design-system/foundations/motion-framer';
import { cn } from '@/utils/_cn';
import type { WorkOrderRow } from '@/components/work-orders/types';
import {
  isToShipOutOfStock,
  toShipOrderId,
  toShipTrackingNumber,
} from '@/lib/work-orders/to-ship-assignment';
import { conditionGradeTableLabel, conditionTextColor, EMPTY_META_DASH } from '@/lib/conditions';
import { conditionGradeTextClass } from '@/lib/condition-tone';
import { formatSalePrice } from '@/lib/dashboard/orders-queue-helpers';
import { getExternalUrlByItemNumber } from '@/hooks/useExternalItemUrl';

const SWIPE_REVEAL_PX = 88;
const SWIPE_COMMIT_PX = 64;
const SWIPE_FLICK_VX = 500;

export function ToShipIdentityChips({ row }: { row: WorkOrderRow }) {
  const orderId = toShipOrderId(row);
  const tracking = toShipTrackingNumber(row);
  return (
    <div
      className="flex min-w-0 items-center gap-1"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <OrderIdChip
        value={orderId}
        display={getLast8(orderId)}
        displayWidth="last8"
        dense
        truncateDisplay={false}
      />
      {tracking ? <TrackingChip value={tracking} dense showIcon /> : null}
    </div>
  );
}

function toShipExpectedQty(row: WorkOrderRow): number | null {
  const n = Number(String(row.quantity ?? '').trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function ToShipQtyFace({ row }: { row: WorkOrderRow }) {
  const expected = toShipExpectedQty(row);
  return (
    <span data-testid="to-ship-qty">
      <ItemRecordQtyBadge quantity={expected != null ? { expected } : null} />
    </span>
  );
}

export function ToShipConditionFace({ row }: { row: WorkOrderRow }) {
  const label = conditionGradeTableLabel(row.condition);
  if (!label || label === EMPTY_META_DASH) return null;
  const raw = String(row.condition || '').toLowerCase();
  const tone = raw.includes('new')
    ? conditionTextColor(row.condition)
    : conditionGradeTextClass(row.condition);
  return (
    <span data-testid="to-ship-condition" className={tone}>
      {label}
    </span>
  );
}

export function ToShipPriceFace({ row }: { row: WorkOrderRow }) {
  const face = formatSalePrice(row.saleAmount, row.currency);
  if (!face) return null;
  return <span data-testid="to-ship-price">{face}</span>;
}

/** Desk order: qty · amount · condition. */
export function ToShipSlotSubtitle({ row }: { row: WorkOrderRow }) {
  return (
    <span data-testid="to-ship-slot-subtitle" className="min-w-0 flex-1">
      <ItemRecordMobileMeta
        qty={<ToShipQtyFace row={row} />}
        price={<ToShipPriceFace row={row} />}
        condition={<ToShipConditionFace row={row} />}
      />
    </span>
  );
}

export function MobileToShipRow({
  row,
  blocked = false,
  onOpen,
  onProcess,
}: {
  row: WorkOrderRow;
  resolveName: (id: number) => string;
  blocked?: boolean;
  onOpen: (row: WorkOrderRow) => void;
  onProcess: (row: WorkOrderRow) => void;
}) {
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);
  const dragging = useRef(false);
  const isBlocked = blocked || isToShipOutOfStock(row);
  const listingHref = getExternalUrlByItemNumber(row.itemNumber || row.sku);

  const process = useCallback(() => {
    if (isBlocked) return;
    onProcess(row);
  }, [isBlocked, onProcess, row]);

  const openSheet = useCallback(() => {
    if (dragging.current) return;
    onOpen(row);
  }, [onOpen, row]);

  const isNestedControl = (target: EventTarget | null) =>
    Boolean((target as HTMLElement | null)?.closest('button, a, input'));

  const onDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const commit =
        !isBlocked && (info.offset.x >= SWIPE_COMMIT_PX || info.velocity.x >= SWIPE_FLICK_VX);
      if (commit) {
        void animate(x, SWIPE_REVEAL_PX, framerTransition.cardExpansion);
        process();
        return;
      }
      void animate(x, 0, framerTransition.cardExpansion);
      window.setTimeout(() => {
        dragging.current = false;
      }, 80);
    },
    [isBlocked, process, x],
  );

  return (
    <Panel
      padding="none"
      radius="xl"
      elevation="raised"
      className="relative overflow-hidden rounded-2xl bg-surface-card"
    >
      <div
        aria-hidden
        className={cn(
          BUTTON_VARIANTS.primary,
          'pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center text-base font-semibold',
          isBlocked && 'opacity-50',
        )}
        style={{ width: SWIPE_REVEAL_PX }}
      >
        Ship
      </div>
      <motion.div
        role="button"
        tabIndex={0}
        aria-label={row.title}
        className="relative z-base bg-surface-card"
        style={{ x }}
        drag={reduceMotion || isBlocked ? false : 'x'}
        dragConstraints={{ left: 0, right: SWIPE_REVEAL_PX }}
        dragElastic={{ left: 0, right: 0.12 }}
        dragDirectionLock
        dragMomentum={false}
        onDrag={(_, info) => {
          if (info.offset.x > 10) dragging.current = true;
        }}
        onDragEnd={onDragEnd}
        onClick={(event) => {
          if (isNestedControl(event.target)) return;
          openSheet();
        }}
        onTap={(event) => {
          if (dragging.current) return;
          if (isNestedControl(event.target)) return;
          openSheet();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openSheet();
          }
        }}
      >
        <div className={cn('grid min-w-0 items-stretch', ITEM_RECORD_MOBILE_THUMB.grid)}>
          <div className={ITEM_RECORD_MOBILE_THUMB.column}>
            <ItemRecordThumb
              imageUrl={row.imageUrl}
              className={cn(
                ITEM_RECORD_MOBILE_THUMB.face,
                ITEM_RECORD_MOBILE_THUMB.corner,
                '!bg-surface-card bg-none text-text-muted shadow-none',
              )}
            />
          </div>
          <div className={ITEM_RECORD_MOBILE_TITLE.band}>
            <span className={cn(ITEM_RECORD_MOBILE_TITLE.face, 'min-w-0')}>
              {row.title}
            </span>
            <div className={ITEM_RECORD_MOBILE_TITLE.foot}>
              <ToShipSlotSubtitle row={row} />
              <div
                className="ml-auto flex shrink-0 items-center gap-1"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <IconButton
                  size="xs"
                  radius="pill"
                  tone="accent"
                  ariaLabel="Listing"
                  data-testid="to-ship-listing"
                  disabled={!listingHref}
                  icon={<ExternalLink className="h-3.5 w-3.5" />}
                  onClick={() => {
                    if (!listingHref) return;
                    window.open(listingHref, '_blank', 'noopener,noreferrer');
                  }}
                />
                <Button
                  variant="primary"
                  size="sm"
                  radius="pill"
                  icon={<Truck />}
                  ariaLabel="Ship"
                  disabled={isBlocked}
                  className="min-w-16 px-3"
                  onClick={process}
                >
                  Ship
                </Button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </Panel>
  );
}
