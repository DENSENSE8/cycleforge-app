/**
 * Kiosk Order Pickup — lookup + collect for a repaired device (RS# / ticket + phone).
 *
 * Customer-facing twin of staff `POST /api/repair-service/pickup`, gated by
 * two-key identity (order number + phone) so an unattended tablet cannot
 * browse the repair book. Staff Receiving LCPU (`local_pickup_orders`) is a
 * different domain and is not used here.
 */

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { formatPSTTimestamp } from '@/utils/date';

export interface KioskPickupSummary {
  repairId: number;
  ticketNumber: string | null;
  productTitle: string | null;
  status: string;
  /** True when status is not already Done. */
  collectible: boolean;
}

type KioskPickupLookupResult =
  | {
      ok: true;
      summary: KioskPickupSummary;
    }
  | {
      ok: false;
      reason: 'not_found' | 'phone_mismatch' | 'already_collected';
    };

function lastDigits(value: string, n = 10): string {
  const digits = value.replace(/\D/g, '');
  return digits.length <= n ? digits : digits.slice(-n);
}

/** Parse RS-125 / 125 / ticket text into candidates. */
export function parsePickupOrderRef(raw: string): {
  repairId: number | null;
  ticketCandidate: string | null;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { repairId: null, ticketCandidate: null };
  const compactUpper = trimmed.replace(/\s+/g, '').toUpperCase();
  let repairId: number | null = null;
  const rsMatch = compactUpper.match(/^RS(?:-|_|:|#)?0*(\d+)$/);
  if (rsMatch?.[1]) {
    const numeric = Number(rsMatch[1]);
    repairId = Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  } else if (/^\d+$/.test(compactUpper)) {
    const numeric = Number(compactUpper);
    repairId = Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  }
  const ticketCandidate = trimmed.replace(/^#/, '').trim() || null;
  return { repairId, ticketCandidate };
}

function phoneMatchesContact(contactInfo: string | null, phoneDigits: string): boolean {
  if (!phoneDigits || phoneDigits.length < 7) return false;
  const contactDigits = (contactInfo ?? '').replace(/\D/g, '');
  if (!contactDigits) return false;
  return contactDigits.endsWith(phoneDigits) || phoneDigits.endsWith(contactDigits.slice(-10));
}

interface RepairRow {
  id: number;
  ticket_number: string | null;
  product_title: string | null;
  status: string | null;
  contact_info: string | null;
  customer_phone: string | null;
}

async function loadRepairCandidates(
  orgId: OrgId,
  orderNumber: string,
): Promise<RepairRow[]> {
  const { repairId, ticketCandidate } = parsePickupOrderRef(orderNumber);
  return withTenantTransaction(orgId, async (client) => {
    if (repairId != null) {
      const byId = await client.query<RepairRow>(
        `SELECT rs.id, rs.ticket_number, rs.product_title, rs.status, rs.contact_info,
                c.phone AS customer_phone
           FROM repair_service rs
           LEFT JOIN customers c ON c.id = rs.customer_id
          WHERE rs.id = $1
          LIMIT 1`,
        [repairId],
      );
      if (byId.rows[0]) return byId.rows;
    }
    if (ticketCandidate) {
      const byTicket = await client.query<RepairRow>(
        `SELECT rs.id, rs.ticket_number, rs.product_title, rs.status, rs.contact_info,
                c.phone AS customer_phone
           FROM repair_service rs
           LEFT JOIN customers c ON c.id = rs.customer_id
          WHERE UPPER(TRIM(COALESCE(rs.ticket_number, ''))) = UPPER(TRIM($1))
          ORDER BY rs.id DESC
          LIMIT 5`,
        [ticketCandidate],
      );
      return byTicket.rows;
    }
    return [];
  });
}

function toSummary(row: RepairRow): KioskPickupSummary {
  const status = String(row.status || '').trim() || 'Unknown';
  return {
    repairId: Number(row.id),
    ticketNumber: row.ticket_number,
    productTitle: row.product_title,
    status,
    collectible: status.toLowerCase() !== 'done',
  };
}

/**
 * Two-key lookup: order ref (RS# / ticket) + phone trailing digits.
 * Miss and phone mismatch return the same caller-facing reason class upstream
 * (oracle-safe) — this helper distinguishes for logging/tests only.
 */
export async function lookupKioskOrderPickup(
  orgId: OrgId,
  orderNumber: string,
  phone: string,
): Promise<KioskPickupLookupResult> {
  const digits = lastDigits(phone);
  if (digits.length < 7) return { ok: false, reason: 'not_found' };

  const rows = await loadRepairCandidates(orgId, orderNumber);
  if (rows.length === 0) return { ok: false, reason: 'not_found' };

  const matched = rows.find(
    (row) =>
      phoneMatchesContact(row.contact_info, digits) ||
      phoneMatchesContact(row.customer_phone, digits),
  );
  if (!matched) return { ok: false, reason: 'phone_mismatch' };

  const summary = toSummary(matched);
  if (!summary.collectible) return { ok: false, reason: 'already_collected' };
  return { ok: true, summary };
}

interface CollectKioskOrderPickupArgs {
  repairId: number;
  phone: string;
  /** Device principal id (audit metadata). */
  deviceId: number;
  /** Optional stepped-up staff (pickup_sign attribution). */
  staffId?: number | null;
  signerName?: string | null;
  signatureDataUrl?: string | null;
  declinedReason?: string | null;
}

type CollectKioskOrderPickupResult =
  | { ok: true; summary: KioskPickupSummary }
  | { ok: false; reason: 'not_found' | 'phone_mismatch' | 'already_collected' };

export async function collectKioskOrderPickup(
  orgId: OrgId,
  args: CollectKioskOrderPickupArgs,
): Promise<CollectKioskOrderPickupResult> {
  const looked = await lookupKioskOrderPickup(
    orgId,
    String(args.repairId),
    args.phone,
  );
  if (!looked.ok) return looked;
  if (looked.summary.repairId !== args.repairId) {
    return { ok: false, reason: 'not_found' };
  }

  const staffId = args.staffId ?? null;
  const declinedReason = (args.declinedReason || '').trim() || null;
  const hasSignature =
    typeof args.signatureDataUrl === 'string' &&
    args.signatureDataUrl.startsWith('data:image/');
  const sourceTag = hasSignature
    ? 'kiosk.pickup-signed'
    : declinedReason
      ? 'kiosk.pickup-declined'
      : 'kiosk.pickup-collect';
  const actionTag = hasSignature
    ? 'picked_up_signed'
    : declinedReason
      ? 'picked_up_signature_declined'
      : 'picked_up_kiosk';

  return withTenantTransaction(orgId, async (client) => {
    const locked = await client.query<{ id: number; status: string | null; ticket_number: string | null; product_title: string | null }>(
      `SELECT id, status, ticket_number, product_title
         FROM repair_service
        WHERE id = $1
        FOR UPDATE`,
      [args.repairId],
    );
    const row = locked.rows[0];
    if (!row) return { ok: false as const, reason: 'not_found' as const };
    const prev = String(row.status || '').trim();
    if (prev.toLowerCase() === 'done') {
      return { ok: false as const, reason: 'already_collected' as const };
    }

    await client.query(
      `UPDATE repair_service
          SET status = 'Done',
              pickup_signed_at = COALESCE(pickup_signed_at, NOW()),
              pickup_staff_id = COALESCE(pickup_staff_id, $4),
              status_history = CASE
                WHEN COALESCE(status, '') IS DISTINCT FROM 'Done' THEN
                  COALESCE(status_history, '[]'::jsonb) || jsonb_build_array(
                    jsonb_strip_nulls(
                      jsonb_build_object(
                        'status', 'Done',
                        'timestamp', $2,
                        'previous_status', NULLIF(status, ''),
                        'source', $5,
                        'metadata', jsonb_build_object(
                          'action', $6,
                          'device_id', $3,
                          'staff_id', $4,
                          'has_signature', $7,
                          'declined_reason', $8
                        )
                      )
                    )
                  )
                ELSE COALESCE(status_history, '[]'::jsonb)
              END,
              updated_at = NOW()
        WHERE id = $1`,
      [
        args.repairId,
        formatPSTTimestamp(),
        args.deviceId,
        staffId,
        sourceTag,
        actionTag,
        hasSignature,
        declinedReason,
      ],
    );

    // Close open REPAIR work assignments when present (same statuses as staff pickup).
    await client.query(
      `UPDATE work_assignments
          SET status = 'DONE',
              started_at = COALESCE(started_at, NOW()),
              completed_at = COALESCE(completed_at, NOW()),
              updated_at = NOW()
        WHERE organization_id = $1
          AND entity_type = 'REPAIR'
          AND entity_id = $2
          AND work_type = 'REPAIR'
          AND status IN ('OPEN', 'ASSIGNED', 'IN_PROGRESS')`,
      [orgId, args.repairId],
    ).catch(() => { /* must not block collect */ });

    return {
      ok: true as const,
      summary: {
        repairId: args.repairId,
        ticketNumber: row.ticket_number,
        productTitle: row.product_title,
        status: 'Done',
        collectible: false,
      },
    };
  });
}
