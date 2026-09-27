SELECT m.entity_type, m.entity_id, m.state, m.priority_tier, m.title,
              m.subtitle, m.tone, m.node_id, m.occurred_at::text AS occurred_at
         FROM feed_memberships m
         
      LEFT JOIN staff_rail_exclusions x
        ON x.organization_id = m.organization_id
       AND x.feed_key = m.feed_key
       AND x.entity_type = m.entity_type
       AND x.entity_id = m.entity_id
       AND x.staff_id = 1 AND x.station = 'RECEIVING'
        WHERE m.organization_id = '00000000-0000-0000-0000-000000000001' AND m.feed_key = 'receiving_triage'
          AND m.state <> 'done'
          AND x.id IS NULL
        ORDER BY m.occurred_at DESC
        LIMIT 20
