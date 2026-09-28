/** SQL fragments for resolving a receiving line's filed support ticket label. */

import { CLAIM_EXCEPTION_CODES, INVESTIGATION_EXCEPTION_CODES } from '../exception-codes';

const TICKET_REASON_CODES_SQL = [...INVESTIGATION_EXCEPTION_CODES, ...CLAIM_EXCEPTION_CODES]
  .map((c) => `'${c}'`)
  .join(',');

/**
 * `ticket_reasons`: the OPEN investigation / claim exceptions (code + the
 * ticket that recorded it, oldest first) on `anchorSql`. A JSON array, `[]`
 * when none — what a filed ticket MEANS (owner 2026-09-28), beside
 * `claim_ticket`, which only says a ticket exists.
 */
function sqlTicketReasonsColumn(orgSql: string, anchorSql: string): string {
  return `COALESCE((
                  SELECT jsonb_agg(jsonb_build_object('code', rx_tr.exception_code, 'ticket', rx_tr.zendesk_ticket)
                                   ORDER BY rx_tr.created_at, rx_tr.id)
                    FROM receiving_exceptions rx_tr
                   WHERE rx_tr.organization_id = ${orgSql}
                     AND rx_tr.status = 'OPEN'
                     AND rx_tr.exception_code IN (${TICKET_REASON_CODES_SQL})
                     AND (${anchorSql})
                ), '[]'::jsonb) AS ticket_reasons`;
}

/** LATERAL join — requires `rl` + `r` (receiving_carton) aliases in scope. */
export function sqlLinkedSupportTicketLateralJoin(): string {
  return `LEFT JOIN LATERAL (
    SELECT
      CASE
        WHEN st.provider = 'zendesk' AND NULLIF(TRIM(st.external_ticket_id), '') IS NOT NULL
          THEN '#' || TRIM(LEADING '#' FROM st.external_ticket_id)
        WHEN st.id IS NOT NULL
          THEN '#' || st.id::text
        WHEN tl.zendesk_ticket_id IS NOT NULL
          THEN '#' || tl.zendesk_ticket_id::text
        ELSE NULL
      END AS ticket_label,
      tl.entity_type AS link_entity
    FROM ticket_links tl
    LEFT JOIN support_tickets st
      ON st.id = tl.support_ticket_id
     AND st.organization_id = tl.organization_id
    WHERE tl.organization_id = rl.organization_id
      AND (
        (tl.entity_type = 'RECEIVING_LINE' AND tl.entity_id = rl.id)
        -- CASE, not COALESCE: under forced RLS (app_tenant) only leakproof
        -- quals may become index conditions, and the planner treats
        -- COALESCE as leaky while CASE/IS NOT NULL are safe. With COALESCE
        -- this arm could not probe idx_ticket_links_org_entity, so the whole
        -- OR lost its BitmapOr and seq-scanned ticket_links once per row.
        OR (tl.entity_type = 'RECEIVING'
            AND tl.entity_id = CASE WHEN rl.receiving_id IS NOT NULL THEN rl.receiving_id ELSE r.id END)
        OR (r.shipment_id IS NOT NULL AND tl.entity_type = 'SHIPMENT' AND tl.entity_id = r.shipment_id)
      )
    ORDER BY
      CASE tl.entity_type
        WHEN 'RECEIVING_LINE' THEN 0
        WHEN 'RECEIVING' THEN 1
        WHEN 'SHIPMENT' THEN 2
        ELSE 3
      END,
      -- Within a tier, an ANCHORED ticket beats one that merely references the
      -- entity: ticket_links is many-per-ticket, so the SHIPMENT arm above can
      -- now match tickets that carry this STN as one of several references.
      tl.is_primary DESC,
      tl.created_at DESC
    LIMIT 1
  ) linked_ticket ON TRUE`;
}

/**
 * SELECT-list columns — pair with {@link sqlLinkedSupportTicketLateralJoin}.
 * `zendesk_ticket`: any ticket on the line, its carton, or its shipment.
 * `claim_ticket`: only a ticket FILED on the line or carton (the Claim verb's
 * anchor, or the legacy line / carton column) — a ticket that merely mentions
 * the shipment's tracking is not a claim.
 */
export function sqlReceivingZendeskTicketColumn(): string {
  return `NULLIF(TRIM(COALESCE(linked_ticket.ticket_label, rl.zendesk_ticket, r.zendesk_ticket)), '') AS zendesk_ticket,
                NULLIF(TRIM(CASE WHEN linked_ticket.link_entity = 'SHIPMENT'
                  THEN COALESCE(rl.zendesk_ticket, r.zendesk_ticket)
                  ELSE COALESCE(linked_ticket.ticket_label, rl.zendesk_ticket, r.zendesk_ticket) END), '') AS claim_ticket,
                ${sqlTicketReasonsColumn(
                  'rl.organization_id',
                  // The line's own rows, plus its carton's carton-level rows.
                  `rx_tr.receiving_line_id = rl.id
                     OR (rx_tr.receiving_line_id IS NULL
                         AND rx_tr.receiving_id = CASE WHEN rl.receiving_id IS NOT NULL THEN rl.receiving_id ELSE r.id END)`,
                )}`;
}

/**
 * LATERAL join for lineless `receiving_carton` placeholder feeds (unmatched /
 * unbox-opened rails). Requires `r` alias only — no `receiving_line` row exists
 * yet, but package-level claims write ticket_links on RECEIVING.
 */
export function sqlCartonLinkedSupportTicketLateralJoin(): string {
  return `LEFT JOIN LATERAL (
    SELECT
      CASE
        WHEN st.provider = 'zendesk' AND NULLIF(TRIM(st.external_ticket_id), '') IS NOT NULL
          THEN '#' || TRIM(LEADING '#' FROM st.external_ticket_id)
        WHEN st.id IS NOT NULL
          THEN '#' || st.id::text
        WHEN tl.zendesk_ticket_id IS NOT NULL
          THEN '#' || tl.zendesk_ticket_id::text
        ELSE NULL
      END AS ticket_label,
      tl.entity_type AS link_entity
    FROM ticket_links tl
    LEFT JOIN support_tickets st
      ON st.id = tl.support_ticket_id
     AND st.organization_id = tl.organization_id
    WHERE tl.organization_id = r.organization_id
      AND (
        (tl.entity_type = 'RECEIVING' AND tl.entity_id = r.id)
        OR (r.shipment_id IS NOT NULL AND tl.entity_type = 'SHIPMENT' AND tl.entity_id = r.shipment_id)
      )
    ORDER BY
      CASE tl.entity_type
        WHEN 'RECEIVING' THEN 0
        WHEN 'SHIPMENT' THEN 1
        ELSE 2
      END,
      -- See sqlLinkedSupportTicketLateralJoin: anchor beats passing reference.
      tl.is_primary DESC,
      tl.created_at DESC
    LIMIT 1
  ) linked_ticket ON TRUE`;
}

/** SELECT-list columns — pair with {@link sqlCartonLinkedSupportTicketLateralJoin}; see {@link sqlReceivingZendeskTicketColumn}. */
export function sqlReceivingCartonZendeskTicketColumn(): string {
  return `NULLIF(TRIM(COALESCE(linked_ticket.ticket_label, r.zendesk_ticket)), '') AS zendesk_ticket,
                NULLIF(TRIM(CASE WHEN linked_ticket.link_entity = 'SHIPMENT'
                  THEN r.zendesk_ticket
                  ELSE COALESCE(linked_ticket.ticket_label, r.zendesk_ticket) END), '') AS claim_ticket,
                ${sqlTicketReasonsColumn('r.organization_id', 'rx_tr.receiving_id = r.id')}`;
}
