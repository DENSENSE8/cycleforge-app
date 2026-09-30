/**
 * A repair ticket's SLA (owner 2026-09-29): due {@link REPAIR_SLA_BUSINESS_DAYS}
 * business days (Mon–Fri, no holidays — `addBusinessDays`' rule) after it was
 * received, or after it was opened when it never was. A shipped-in box still
 * on Incoming Shipment is not in hand, so it has no due date.
 *
 * The days are counted on the PT civil calendar and the PT wall-clock time is
 * kept — the same math that backfilled `repair_service.due_at`
 * (`2026-09-29i_repair_service_due_at.sql`). Every writer of `due_at` calls
 * this; the cards only read the column.
 */

import { normalizePSTTimestamp } from '@/utils/date';

export const REPAIR_SLA_BUSINESS_DAYS = 3;

const INCOMING_SHIPMENT = 'Incoming Shipment';

/**
 * The ticket's due instant as a PT wall-clock timestamp (`YYYY-MM-DD HH:MM:SS`,
 * the stamp every repair writer hands Postgres), or null when it has none.
 */
export function repairDueAt(
  receivedAt: string | Date | null | undefined,
  createdAt: string | Date | null | undefined,
  status: string | null | undefined,
): string | null {
  if ((status ?? '').trim() === INCOMING_SHIPMENT) return null;
  const start = normalizePSTTimestamp(receivedAt) ?? normalizePSTTimestamp(createdAt);
  if (!start) return null;
  const [datePart, timePart = '00:00:00'] = start.split(' ');
  const [year, month, day] = datePart!.split('-').map(Number);
  const due = new Date(Date.UTC(year!, month! - 1, day!));
  if (Number.isNaN(due.getTime())) return null;
  for (let added = 0; added < REPAIR_SLA_BUSINESS_DAYS; ) {
    due.setUTCDate(due.getUTCDate() + 1);
    const weekday = due.getUTCDay();
    if (weekday !== 0 && weekday !== 6) added += 1;
  }
  return `${due.toISOString().slice(0, 10)} ${timePart}`;
}
