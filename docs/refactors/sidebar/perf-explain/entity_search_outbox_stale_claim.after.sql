SELECT id FROM entity_search_outbox
       WHERE processed_at IS NULL
         AND claimed_at < now() - INTERVAL '15 minutes'
