SELECT i.id, i.entity_type, i.entity_id, i.event_key, i.reason, i.state,
            i.collapse_count, i.snoozed_until, i.occurred_at, i.last_event_at,
            i.actor_staff_id, i.subscription_id, i.payload,
            sub.state AS subscription_state
       FROM staff_inbox_items i
       LEFT JOIN staff_subscriptions sub
              ON sub.organization_id = i.organization_id
             AND sub.staff_id = i.staff_id
             AND sub.subscription_kind = 'entity'
             AND sub.entity_type = i.entity_type
             AND sub.entity_id = i.entity_id
      WHERE i.organization_id = '00000000-0000-0000-0000-000000000001'
        AND i.staff_id = 1
        AND i.entity_type = ANY('{receiving,receiving_line,serial_unit,order,fba_shipment,repair,warranty_claim,support_ticket,task}'::text[])
        AND (
          ('active' = 'active' AND (
             i.state IN ('unread','read')
             OR (i.state = 'snoozed' AND i.snoozed_until <= '2026-09-26T19:40:12.340Z'::timestamptz)
           ))
          OR ('active' <> 'active' AND i.state = 'active')
        )
      ORDER BY i.last_event_at DESC, i.id DESC
      LIMIT 50
