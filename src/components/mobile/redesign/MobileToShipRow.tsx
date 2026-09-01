'use client';

/**
 * Phone to-ship card — title (2-line clamp), slot-table qty + condition + note,
 * picker/packer, Out of stock + Ship. Identity numbers live on the sheet.
 */

import { useCallback, useRef } from 'react';
import { FileText, AlertTriangle, Truck } from '@/components/Icons';
import { StaffAvatar } from '@/components/identity/StaffAvatar';
import { OrderIdChip, TrackingChip, getLast8 } from '@/components/ui/CopyChip';
import { Button, Inset, Panel } from '@/design-system/primitives';
import { BUTTON_VARIANTS } from '@/design-system/primitives/button-variants';
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
  toShipGivenName,
  toShipOrderId,
  toShipPackerLabel,
  toShipPickerLabel,
  toShipTrackingNumber,
} from '@/lib/work-orders/to-ship-assignment';
import { ordersSubtitleParts } from '@/lib/tables/field-catalog/orders-resolve';
import type { ShippedOrder } from '@/types/orders';

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

const TO_SHIP_SUBTITLE_FIELDS = ['orders.qty', 'orders.condition', 'orders.notes'] as const;

function toShipSubtitleRecord(row: WorkOrderRow): ShippedOrder {
  return {
    quantity: row.quantity ?? '',
    condition: row.condition ?? '',
    notes: row.notes ?? '',
    item_number: row.itemNumber ?? '',
  } as ShippedOrder;
}

function subtitlePartTestId(key: string | undefined): string | undefined {
  if (key === 'orders.qty') return 'to-ship-qty';
  if (key === 'orders.condition') return 'to-ship-condition';
  return undefined;
}

/**
 * Same under-title face as CompoundItem: `ordersSubtitleParts` + the slot
 * span (qty reservation, condition grade text — never a status chip ring).
 */
export function ToShipSlotSubtitle({ row }: { row: WorkOrderRow }) {
  const parts = ordersSubtitleParts(toShipSubtitleRecord(row), TO_SHIP_SUBTITLE_FIELDS);
  const hasNote = parts.some((part) => part.key === 'orders.notes');

  return (
    <span
      data-testid="to-ship-slot-subtitle"
      className="flex h-3 min-w-0 items-center justify-start gap-1 whitespace-nowrap leading-none"
    >
      {parts.map((part, index) => (
        <span
          key={part.key ?? index}
          data-testid={subtitlePartTestId(part.key)}
          className={cn(
            'inline-flex h-3 items-center leading-none',
            part.toneClass,
            part.widthCh != null && 'tabular-nums',
            part.key === 'orders.notes' && 'min-w-0 truncate text-text-muted',
          )}
          style={part.widthCh != null ? { width: `${part.widthCh}ch` } : undefined}
        >
          {part.text}
        </span>
      ))}
      {hasNote ? null : <FileText className="h-3 w-3 shrink-0 text-text-faint" aria-hidden />}
    </span>
  );
}

function AssignmentMark({
  role,
  staffId,
  name,
}: {
  role: 'Pick' | 'Pack';
  staffId: number | null;
  name: string | null;
}) {
  const given = toShipGivenName(name);
  return (
    <span
      data-testid={role === 'Pick' ? 'to-ship-picker' : 'to-ship-packer'}
      className="flex min-w-0 items-center gap-1.5"
      aria-label={name ? `${role} ${name}` : `${role} unassigned`}
    >
      {staffId != null || name ? (
        <StaffAvatar staffId={staffId} name={name} size="sm" colorRing alt={name ?? undefined} />
      ) : (
        <span
          aria-hidden
          className="h-7 w-7 shrink-0 rounded-full border border-dashed border-border-default"
        />
      )}
      <span className="max-w-[4.5rem] truncate text-role-caption text-text-soft">
        {given ?? role}
      </span>
    </span>
  );
}

export function MobileToShipRow({
  row,
  resolveName,
  onOpen,
  onProcess,
  onOutOfStock,
}: {
  row: WorkOrderRow;
  resolveName: (id: number) => string;
  onOpen: (row: WorkOrderRow) => void;
  onProcess: (row: WorkOrderRow) => void;
  onOutOfStock: (row: WorkOrderRow) => void;
}) {
  const reduceMotion = useReducedMotion();
  const x = useMotionValue(0);
  const dragging = useRef(false);
  const picker = toShipPickerLabel(row, resolveName);
  const packer = toShipPackerLabel(row, resolveName);

  const process = useCallback(() => {
    onProcess(row);
  }, [onProcess, row]);

  const openSheet = useCallback(() => {
    if (dragging.current) return;
    onOpen(row);
  }, [onOpen, row]);

  const isNestedControl = (target: EventTarget | null) =>
    Boolean((target as HTMLElement | null)?.closest('button, a, input'));

  const onDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const commit = info.offset.x >= SWIPE_COMMIT_PX || info.velocity.x >= SWIPE_FLICK_VX;
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
    [process, x],
  );

  return (
    <Panel
      padding="none"
      radius="xl"
      elevation="raised"
      className="relative overflow-hidden bg-surface-card"
    >
      <div
        aria-hidden
        className={cn(
          BUTTON_VARIANTS.primary,
          'pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center text-role-eyebrow font-semibold',
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
        drag={reduceMotion ? false : 'x'}
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
        <Inset space="card" className="flex flex-col gap-2">
          <span className="line-clamp-2 text-role-title font-semibold leading-snug text-text-default">
            {row.title}
          </span>
          <ToShipSlotSubtitle row={row} />
          <div className="flex min-w-0 items-center gap-3">
            <AssignmentMark role="Pick" staffId={row.techId} name={picker} />
            <AssignmentMark role="Pack" staffId={row.packerId} name={packer} />
          </div>
          <div
            className="flex items-center gap-1.5"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <Button
              variant="warning"
              size="sm"
              radius="surface"
              icon={<AlertTriangle />}
              ariaLabel="Out of stock"
              className="ds-allow-control-size min-h-11 min-w-0 flex-1 px-3"
              onClick={() => onOutOfStock(row)}
            >
              Out of stock
            </Button>
            <Button
              variant="primary"
              size="sm"
              radius="surface"
              icon={<Truck />}
              ariaLabel="Ship"
              className="ds-allow-control-size min-h-11 min-w-0 flex-1 px-4"
              onClick={process}
            >
              Ship
            </Button>
          </div>
        </Inset>
      </motion.div>
    </Panel>
  );
}
