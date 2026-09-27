SELECT oe.id, oe.occurred_at, oe.event_type, oe.payload,
            s.name AS actor_name
       FROM ops_events oe
       LEFT JOIN staff s ON s.id = oe.actor_staff_id
      WHERE oe.organization_id = '00000000-0000-0000-0000-000000000001'
        AND oe.entity_type = 'shipment'
        AND oe.entity_id = ANY('{180354,180352}'::bigint[])
        AND oe.event_type IN ('TICKET_LINKED', 'TICKET_UNLINKED')
      ORDER BY oe.occurred_at DESC
      LIMIT 20
