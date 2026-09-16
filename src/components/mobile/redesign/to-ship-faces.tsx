'use client';

/**
 * The typographic faces a to-ship row and its sheet both paint.
 *
 * Extracted from {@link MobileToShipRow} when the ship-by corner landed
 * (operator 2026-09-15) — the row was carrying six exported faces plus a drag
 * surface, and `MobileToShipSheet` was importing a face out of a ROW module
 * to get them.
 *
 * The meta rule lives here: **qty · price · condition share one font**
 * (`text-role-caption font-semibold` via `ITEM_RECORD_MOBILE_META`) and differ
 * only in INK — green for money, grade tone for condition. Size is hierarchy;
 * colour is category. Do not give one of the three a preset of its own.
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
export function toShipExpectedQty(row: WorkOrderRow): number | null {
  const n = Number(String(row.quantity ?? '').trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/**
 * Plain qty — deliberately NOT `ItemRecordQtyBadge`. A to-ship line states an
 * expected quantity and counts nothing, so the badge's counted/expected
 * machinery has no state to show, and its `qtyProgress` preset is mono with
 * `leading-none` — which put the first of three facts in a different typeface
 * from the two beside it.
 *
 * Bare number, no `×` glyph (operator 2026-09-15): the column it sits in is
 * already the quantity, and a multiplication sign reads as arithmetic.
 */
export function ToShipQtyFace({ row }: { row: WorkOrderRow }) {
  const expected = toShipExpectedQty(row);
  return <span data-testid="to-ship-qty">{expected != null ? expected : EMPTY_META_DASH}</span>;
}

/**
 * Item number — the identity a picker matches against the listing and the
 * paperwork. Leads the meta row: it is the one value on the card that is
 * neither a quantity nor a state, and an identity that floats between facts
 * shifts position every time one of them is absent.
 */
export function ToShipItemNumberFace({ row }: { row: WorkOrderRow }) {
  const value = String(row.itemNumber || row.sku || '').trim();
  if (!value) return null;
  return <span data-testid="to-ship-item-number">{value}</span>;
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
export function ToShipSlotSubtitle({ row }: { row: WorkOrderRow }) {
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

/**
 * Ship-by, top-right corner of the card.
 *
 * Read-only on purpose: the row swipes to commit a ship, so a tappable date
 * field here would be a second commit target inside a drag surface. Editing a
 * ship-by belongs on the order. (`DateRangePickerField variant="compact"` is
 * the in-CELL editor for slot tables — a different job, a different surface.)
 */
export function ToShipByFace({ row }: { row: WorkOrderRow }) {
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
