/** `SkuLedgerTableRow → CompoundRowView` — pure, strings and enums, no JSX. */

import { format } from 'date-fns';
import type {
  CompoundRowView,
  CompoundStateTone,
} from '@/components/tables/compound/compound-row-model';
import type { SkuLedgerTableRow } from '@/lib/inventory/sku-ledger-row';
import {
  skuLedgerDeltaText,
  skuLedgerReasonText,
} from '@/lib/tables/field-catalog/sku-ledger-resolve';

/**
 * A ledger entry is a record of stock that already moved. Nothing on this desk
 * can act on it, and neither quantity bucket is an exception waiting for a
 * human — so the pill carries the word and no urgency.
 */
const LEDGER_TONE: CompoundStateTone = 'neutral';

/** What the pill says when a row names no dimension (defended, not expected). */
const UNKNOWN_DIMENSION_LABEL = 'Unknown bucket';

function str(value: string | number | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

function parseInstant(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The Calendar (secondary) line of the DATES cell — time of day to the second. */
export function skuLedgerClockFace(iso: string | null | undefined): string | null {
  const d = parseInstant(iso);
  return d ? format(d, 'h:mm:ss a') : null;
}

export function skuLedgerCompoundView(row: SkuLedgerTableRow): CompoundRowView {
  const reason = skuLedgerReasonText(row.reason);
  const dimension = str(row.dimension);
  const instant = parseInstant(row.created_at);
  const day = instant
    ? { label: format(instant, 'MMM d'), dateKey: format(instant, 'yyyy-MM-dd') }
    : null;
  const clock = skuLedgerClockFace(row.created_at);
  const stamp = day && clock ? `${day.label} · ${clock}` : (day?.label ?? clock);

  return {
    id: String(row.id),
    thumbUrl: null,
    // A row with no reason is a malformed write (the column is NOT NULL); name
    // it by its own id rather than painting "Untitled" over the one fact it
    // definitely has.
    title: reason ?? `Ledger #${row.id}`,
    note: str(row.notes) ?? skuLedgerDeltaText(row.delta),
    orderId: str(row.ref_order_id),
    tracking: null,
    // No marketplace and no carrier behind a stock movement: the identity chip
    // must not borrow a brand dot from another family's vocabulary.
    platformValue: null,
    carrier: null,
    stateLabel: dimension ?? UNKNOWN_DIMENSION_LABEL,
    stateTone: LEDGER_TONE,
    orderedAt: day ? { label: day.label, tip: stamp ?? day.label, dateKey: day.dateKey } : null,
    // Explicit Hash hover SoT — this family names the chip, so the engine must
    // not prefix "Start date" onto a line that is a write stamp.
    ...(stamp ? { startedHover: stamp } : null),
    // Calendar line = the clock face. Not a deadline: `days: 0` / not overdue
    // is the honest answer for a desk with no due dates at all.
    delay: clock ? { days: 0, overdue: false, faceLabel: clock } : null,
    delayTip: stamp ?? undefined,
    amount: null,
  };
}
