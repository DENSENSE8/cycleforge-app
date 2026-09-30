/** loadKioskRepairHeader — the header for a repair that was never a counter visit. */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { normalizePSTTimestamp } from '@/utils/date';
import { resolveRepairContact } from '@/lib/repair/contact-info';

export interface KioskRepairCustomer {
  name: string | null;
  phone: string | null;
  email: string | null;
}

export interface KioskRepairHeader {
  repairId: number;
  /** The RS-#### the customer quotes. Falls back to the id when unticketed. */
  ticketNumber: string;
  /** The repair book's status — `Pending Repair`, `Awaiting Parts`, … */
  status: string;
  createdAt: string | null;
  /**
   * Quoted price in minor units. NULL when the ticket has not been quoted —
   * `$0.00` would claim the shop agreed to do it for nothing.
   */
  priceCents: number | null;
  customer: KioskRepairCustomer | null;
  /** How it arrived — `pickup` (dropped off) | `shipment` (shipped in); see `@/lib/repair/repair-channel`. */
  intakeChannel: string | null;
  sourceSystem: string | null;
  sourceOrderId: string | null;
  sourceTrackingNumber: string | null;
  /** The `-RS` service SKU — the way back to the Ecwid listing. */
  sourceSku: string | null;
}

interface RepairHeaderSqlRow {
  id: string | number;
  ticket_number: string | null;
  status: string | null;
  created_at: string | null;
  price_cents: string | number | null;
  contact_info: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  intake_channel: string | null;
  source_system: string | null;
  source_order_id: string | null;
  source_tracking_number: string | null;
  source_sku: string | null;
}

export async function loadKioskRepairHeader(
  orgId: OrgId,
  repairId: number,
): Promise<KioskRepairHeader | null> {
  const res = await tenantQuery<RepairHeaderSqlRow>(
    orgId,
    `SELECT rs.id,
            NULLIF(TRIM(COALESCE(rs.ticket_number, '')), '') AS ticket_number,
            NULLIF(TRIM(COALESCE(rs.status, '')), '')        AS status,
            rs.created_at,
            ROUND(
              (substring(COALESCE(rs.price, '') from '[0-9]+(?:\\.[0-9]+)?'))::numeric * 100
            )::bigint                                        AS price_cents,
            NULLIF(TRIM(COALESCE(rs.contact_info, '')), '')  AS contact_info,
            COALESCE(
              NULLIF(c.display_name, ''),
              NULLIF(c.customer_name, ''),
              NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), '')
            )                                                AS customer_name,
            COALESCE(c.phone, c.mobile)                      AS customer_phone,
            c.email                                          AS customer_email,
            NULLIF(TRIM(COALESCE(rs.intake_channel, '')), '') AS intake_channel,
            NULLIF(TRIM(COALESCE(rs.source_system, '')), '')  AS source_system,
            NULLIF(TRIM(COALESCE(rs.source_order_id, '')), '') AS source_order_id,
            NULLIF(TRIM(COALESCE(rs.source_tracking_number, '')), '') AS source_tracking_number,
            NULLIF(TRIM(COALESCE(rs.source_sku, '')), '')     AS source_sku
       FROM repair_service rs
       LEFT JOIN customers c
         ON c.id = rs.customer_id AND c.organization_id = rs.organization_id
      WHERE rs.organization_id = $1
        AND rs.id = $2::int
      LIMIT 1`,
    [orgId, repairId],
  );

  const row = res.rows[0];
  if (!row) return null;

  // `contact_info` is the pre-`customers` intake string ("Name, 714-555-0100") that every Ecwid-sourced ticket still carries.
  const contact = resolveRepairContact(row);

  return {
    repairId: Number(row.id),
    ticketNumber: row.ticket_number ?? `RS-${Number(row.id)}`,
    status: row.status ?? 'Pending Repair',
    createdAt: normalizePSTTimestamp(row.created_at as string | null),
    priceCents: row.price_cents == null ? null : Number(row.price_cents),
    customer:
      contact.name || contact.phone || contact.email
        ? { name: contact.name, phone: contact.phone, email: contact.email }
        : null,
    intakeChannel: row.intake_channel,
    sourceSystem: row.source_system,
    sourceOrderId: row.source_order_id,
    sourceTrackingNumber: row.source_tracking_number,
    sourceSku: row.source_sku,
  };
}
