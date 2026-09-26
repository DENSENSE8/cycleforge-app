'use client';

/**
 * The typographic faces a to-ship row and its sheet both paint.
 * (operator 2026-09-15) — the row was carrying six exported faces plus a drag
 */

import { CalendarClock } from '@/components/Icons';
import { OrderIdChip, TrackingChip, getLast8 } from '@/components/ui/CopyChip';
import { ItemRecordMobileMeta } from '@/design-system/components/item-record';
import { cn } from '@/utils/_cn';
import { conditionGradeTableLabel, conditionTextColor, EMPTY_META_DASH } from '@/lib/conditions';
import { conditionGradeTextClass } from '@/lib/condition-tone';
import { formatSalePrice } from '@/lib/dashboard/orders-queue-helpers';
import { classifyDeadlineBand, type DeadlineBand } from '@/lib/work-orders/deadline-bands';
import { formatDateKeyShort, toPSTDateKey } from '@/utils/date';
import { toShipOrderId, toShipTrackingNumber } from '@/lib/work-orders/to-ship-assignment';
import type { WorkOrderRow } from '@/components/work-orders/types';

/**
 * Only the bands that change what a picker does next earn loud ink — the same
 * two-band rule the pick queue row uses. A calm queue stays monochrome, so the
 * one card that is late is the only coloured thing on the screen.
 */
const SHIP_BY_TONE: Partial<Record<DeadlineBand, string>> = {
  overdue: 'text-text-danger',
  today: 'text-text-warning',
};

function ToShipIdentityChips({ row }: { row: WorkOrderRow }) {
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
export function toShipExpectedQty(row: WorkOrderRow): number | null {
  const n = Number(String(row.quantity ?? '').trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Plain qty — deliberately NOT `ItemRecordQtyBadge`.
 * Bare number, no `×` glyph (operator 2026-09-15): the column it sits in is
 */
function ToShipQtyFace({ row }: { row: WorkOrderRow }) {
  const expected = toShipExpectedQty(row);
  return <span data-testid="to-ship-qty">{expected != null ? expected : EMPTY_META_DASH}</span>;
}

/** Item number — the identity a picker matches against the listing and the paperwork. */
function ToShipItemNumberFace({ row }: { row: WorkOrderRow }) {
  const value = String(row.itemNumber || row.sku || '').trim();
  if (!value) return null;
  return <span data-testid="to-ship-item-number">{value}</span>;
}

function ToShipConditionFace({ row }: { row: WorkOrderRow }) {
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

function ToShipPriceFace({ row }: { row: WorkOrderRow }) {
  const face = formatSalePrice(row.saleAmount, row.currency);
  if (!face) return null;
  return <span data-testid="to-ship-price">{face}</span>;
}

/* Plain-value forms of the same faces — for {@link ItemCardRow}, which takes
 * data, not a row type, so both queues can paint the identical card. */

export function toShipPriceText(row: WorkOrderRow): string | null {
  return formatSalePrice(row.saleAmount, row.currency) || null;
}

export function toShipConditionParts(row: WorkOrderRow): { label: string; tone: string } | null {
  const label = conditionGradeTableLabel(row.condition);
  if (!label || label === EMPTY_META_DASH) return null;
  const raw = String(row.condition || '').toLowerCase();
  return {
    label,
    tone: raw.includes('new') ? conditionTextColor(row.condition) : conditionGradeTextClass(row.condition),
  };
}

/** Identity then facts: item number, qty, amount, condition — one font. */
function ToShipSlotSubtitle({ row }: { row: WorkOrderRow }) {
  return (
    <span data-testid="to-ship-slot-subtitle" className="min-w-0 flex-1">
      <ItemRecordMobileMeta
        itemNumber={<ToShipItemNumberFace row={row} />}
        qty={<ToShipQtyFace row={row} />}
        price={<ToShipPriceFace row={row} />}
        condition={<ToShipConditionFace row={row} />}
      />
    </span>
  );
}

/** Ship-by, top-right corner of the card. */
function ToShipByFace({ row }: { row: WorkOrderRow }) {
  const key = row.deadlineAt ? toPSTDateKey(row.deadlineAt) : null;
  if (!key) return null;
  const band = classifyDeadlineBand(row.deadlineAt);
  return (
    <span
      data-testid="to-ship-shipby"
      className={cn(
        'inline-flex shrink-0 items-center gap-1 text-role-caption font-semibold tabular-nums',
        SHIP_BY_TONE[band] ?? 'text-text-muted',
      )}
    >
      {/* Calendar-clock, not a bare calendar: this is a DUE day, not a date. */}
      <CalendarClock aria-hidden className="h-3.5 w-3.5 shrink-0" />
      {formatDateKeyShort(key)}
    </span>
  );
}
