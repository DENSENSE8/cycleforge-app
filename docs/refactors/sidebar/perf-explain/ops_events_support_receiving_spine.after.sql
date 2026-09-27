SELECT id, occurred_at, event_type, entity_type, entity_id
             FROM ops_events
            WHERE organization_id = '00000000-0000-0000-0000-000000000001'
              AND entity_type = 'receiving'
              AND entity_id = 4148
            ORDER BY occurred_at DESC
            LIMIT 100
