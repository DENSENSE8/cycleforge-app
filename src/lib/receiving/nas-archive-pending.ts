import { tenantQuery } from '@/lib/tenancy/db';

/** "This ticket has photos I took after it was filed, and they are not on the NAS yet." */
interface NasArchivePendingItem {
  receivingId: number;
  /** Ticket folder name, normalized (no leading `#`) — what the API expects. */
  ticketNumber: string;
  /** PO / order ref for the readout, so the prompt names a box the operator knows. */
  orderRef: string | null;
  /** Photos taken after the baseline and not yet copied. */
  pendingCount: number;
  /** Newest pending shutter instant — drives "just now" ordering. */
  latestAt: string;
  /** True when this carton has never been archived to its current ticket. */
  neverArchived: boolean;
}

/** The baseline a photo must be newer than to count as pending. */
const BASELINE_SQL = `
  CASE
    WHEN rc.nas_archived_at IS NOT NULL
     AND rc.nas_archived_ticket IS NOT NULL
     AND rc.nas_archived_ticket = NULLIF(regexp_replace(rc.zendesk_ticket, '\\D', '', 'g'), '')
    THEN rc.nas_archived_at
    ELSE ticket_linked_at
  END
`;

/** When the ticket was filed, as a SCALAR SUBQUERY rather than a join. */
const TICKET_LINKED_AT_SQL = `
  (SELECT MIN(tl.created_at)
     FROM ticket_links tl
    WHERE tl.organization_id = rc.organization_id
      AND tl.zendesk_ticket_id = NULLIF(regexp_replace(rc.zendesk_ticket, '\\D', '', 'g'), '')::bigint)
`;

interface PendingRow {
  receiving_id: number;
  ticket_number: string;
  order_ref: string | null;
  pending_count: number;
  latest_at: string;
  never_archived: boolean;
}

/**
 * @param receivingId - narrow to one carton (the ticket chip). Omit for the
 *   staffer's whole open set (the prompt).
 */
export async function listPendingNasArchives(
  organizationId: string,
  staffId: number,
  opts: { receivingId?: number | null; limit?: number } = {},
): Promise<NasArchivePendingItem[]> {
  if (!organizationId || !Number.isFinite(staffId) || staffId <= 0) return [];

  const receivingId =
    opts.receivingId != null && Number.isFinite(opts.receivingId) && opts.receivingId > 0
      ? Math.trunc(opts.receivingId)
      : null;
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);

  const res = await tenantQuery<PendingRow>(
    organizationId,
    `
    WITH base AS (
      SELECT
        rc.id                              AS receiving_id,
        NULLIF(regexp_replace(rc.zendesk_ticket, '^#', ''), '') AS ticket_number,
        COALESCE(rc.zoho_purchaseorder_number, rc.zoho_purchaseorder_id) AS order_ref,
        ${BASELINE_SQL} AS baseline,
        (rc.nas_archived_at IS NULL
          OR rc.nas_archived_ticket IS DISTINCT FROM
             NULLIF(regexp_replace(rc.zendesk_ticket, '\\D', '', 'g'), '')) AS never_archived
      FROM receiving_carton rc
      CROSS JOIN LATERAL (SELECT ${TICKET_LINKED_AT_SQL} AS ticket_linked_at) tlk
      WHERE rc.organization_id = $1
        AND rc.zendesk_ticket IS NOT NULL
        AND ($3::int IS NULL OR rc.id = $3::int)
    )
    SELECT
      base.receiving_id,
      base.ticket_number,
      base.order_ref,
      base.never_archived,
      ph.pending_count,
      ph.latest_at
    FROM base
    JOIN LATERAL (
      SELECT
        COUNT(*)::int AS pending_count,
        MAX(COALESCE(p.client_captured_at, p.created_at)) AS latest_at
      FROM photos p
      INNER JOIN photo_entity_links l
              ON l.photo_id = p.id AND l.organization_id = p.organization_id
      LEFT JOIN receiving_line rl
              ON l.entity_type = 'RECEIVING_LINE' AND rl.id = l.entity_id
      WHERE p.organization_id = $1
        -- The real column is taken_by_staff_id; 'uploaded_by' is only a read alias.
        AND p.taken_by_staff_id = $2
        AND CASE
              WHEN l.entity_type = 'RECEIVING'      THEN l.entity_id
              WHEN l.entity_type = 'RECEIVING_LINE' THEN rl.receiving_id
            END = base.receiving_id
        -- Shutter time, not server-insert time: a queued mobile upload drains
        -- long after the box was open, and comparing the drain instant would
        -- call a pre-ticket photo "taken after the ticket".
        AND COALESCE(p.client_captured_at, p.created_at) > base.baseline
    ) ph ON TRUE
    WHERE base.ticket_number IS NOT NULL
      AND base.baseline IS NOT NULL
      AND ph.pending_count > 0
    ORDER BY ph.latest_at DESC
    LIMIT ${limit}
    `,
    [organizationId, Math.trunc(staffId), receivingId],
  );

  return res.rows.map((r) => ({
    receivingId: Number(r.receiving_id),
    ticketNumber: String(r.ticket_number),
    orderRef: r.order_ref ?? null,
    pendingCount: Number(r.pending_count) || 0,
    latestAt: String(r.latest_at),
    neverArchived: Boolean(r.never_archived),
  }));
}
