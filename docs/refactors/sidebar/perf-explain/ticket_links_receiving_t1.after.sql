SELECT rl.id, linked_ticket.ticket_label
FROM (SELECT * FROM receiving_line ORDER BY id DESC LIMIT 200) rl
LEFT JOIN receiving_carton r ON r.id = rl.receiving_id AND r.organization_id = rl.organization_id
LEFT JOIN LATERAL (
    SELECT
      CASE
        WHEN st.provider = 'zendesk' AND NULLIF(TRIM(st.external_ticket_id), '') IS NOT NULL
          THEN '#' || TRIM(LEADING '#' FROM st.external_ticket_id)
        WHEN st.id IS NOT NULL
          THEN '#' || st.id::text
        WHEN tl.zendesk_ticket_id IS NOT NULL
          THEN '#' || tl.zendesk_ticket_id::text
        ELSE NULL
      END AS ticket_label
    FROM ticket_links tl
    LEFT JOIN support_tickets st
      ON st.id = tl.support_ticket_id
     AND st.organization_id = tl.organization_id
    WHERE tl.organization_id = rl.organization_id
      AND (
        (tl.entity_type = 'RECEIVING_LINE' AND tl.entity_id = rl.id)
        OR (tl.entity_type = 'RECEIVING' AND tl.entity_id = CASE WHEN rl.receiving_id IS NOT NULL THEN rl.receiving_id ELSE r.id END)
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
  ) linked_ticket ON TRUE
