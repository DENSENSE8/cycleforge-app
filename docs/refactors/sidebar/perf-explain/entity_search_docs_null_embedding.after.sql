SELECT organization_id, entity_type, entity_id
       FROM entity_search_docs
       WHERE organization_id = '00000000-0000-0000-0000-000000000001'
         AND embedding IS NULL
         AND updated_at < now() - (30::int * INTERVAL '1 minute')
       ORDER BY updated_at ASC
       LIMIT 100
