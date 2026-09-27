SELECT id, occurred_at::text AS occurred_at, signal_kind, entity_type, entity_id,
            reason_code, notes, severity
       FROM entity_signals
      WHERE organization_id = '00000000-0000-0000-0000-000000000001' AND occurred_at >= NOW() - make_interval(days => 7)
      ORDER BY entity_signals.occurred_at DESC, entity_signals.id DESC
      LIMIT 200
