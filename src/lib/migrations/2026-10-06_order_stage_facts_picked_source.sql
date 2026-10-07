-- 2026-10-06_order_stage_facts_picked_source.sql
--
-- WHAT
--   ADD COLUMN order_stage_facts.picked_source — which source of the ONE
--   picked-by resolver (src/lib/picking/picked-by.ts) answered "who picked
--   this order line": 'inventory_event' | 'picking_session' | 'pick_scan' |
--   'serial_pull'; NULL = not picked. Then recompute picked_at / picked_by /
--   picked_source / has_pick_scan for every order from the resolver.
--
-- WHY
--   Phase 1 slice 4 (docs/refactors/records/PROMPT-records-sheet.md): one
--   resolver with a stated precedence and a source field, read by Allocate,
--   Fulfilled and the pasted-list locator. Before this, has_pick_scan read only
--   the desk scan and the serial (sqlOrderHasPickScan) while picked_by also
--   read inventory events and picking sessions, so a mobile pick showed a
--   picker but stayed in To pick. has_pick_scan is now "the resolver has a
--   record" (PICKED_BY_IS_PICKED_SQL). Measured on dev before apply: 5,404
--   facts rows, 3 become picked, 0 stop being picked, 2 change picker,
--   3 change picked_at.
--
-- WRITER
--   refreshOrderStageFacts (src/lib/orders/order-stage-facts.ts) writes the
--   column from PICKED_BY_LATERAL. The new refresh SQL names picked_source, so
--   this migration must be applied before that code runs.
--
-- BACKFILL
--   The UPDATE below is PICKED_BY_LATERAL as of this commit (the staff join
--   dropped). Idempotent: it rewrites only rows whose pick facts differ; the
--   feed-membership cron sweep (refreshAllOrderStageFacts) converges the same.
--
-- VERIFY
--   SELECT picked_source, count(*) FROM order_stage_facts GROUP BY 1;
--   SELECT count(*) FROM order_stage_facts
--    WHERE has_pick_scan <> (picked_source IS NOT NULL);   -- 0
--
-- ROLLBACK
--   ALTER TABLE order_stage_facts DROP COLUMN IF EXISTS picked_source;
--   (revert the resolver read first)

ALTER TABLE order_stage_facts ADD COLUMN IF NOT EXISTS picked_source TEXT;

UPDATE order_stage_facts f
   SET picked_at = r.picked_at,
       picked_by = r.picked_by,
       picked_source = r.picked_source,
       has_pick_scan = r.is_picked,
       updated_at = now()
  FROM (
    SELECT o.organization_id, o.id AS order_id,
           pick_fact.picked_at, pick_fact.picked_by, pick_fact.picked_source,
           (pick_fact.picked_source IS NOT NULL) AS is_picked
      FROM orders o
      LEFT JOIN LATERAL (
        SELECT pk_arm.picked_by, pk_arm.picked_at, pk_arm.picked_source
          FROM (
          (SELECT 0 AS rank, 'inventory_event'::text AS picked_source,
                  pk_ie.actor_staff_id AS picked_by, pk_ie.occurred_at AS picked_at
             FROM order_unit_allocations pk_oua
             JOIN inventory_events pk_ie
               ON pk_ie.serial_unit_id  = pk_oua.serial_unit_id
              AND pk_ie.organization_id = pk_oua.organization_id
              AND pk_ie.event_type IN ('PICKED', 'FORCE_PICK')
              AND pk_ie.occurred_at    >= pk_oua.allocated_at
            WHERE pk_oua.order_id        = o.id
              AND pk_oua.organization_id = o.organization_id
              AND pk_oua.state IN ('PICKED', 'PACKED', 'SHIPPED', 'RETURNED')
            ORDER BY pk_ie.occurred_at DESC NULLS LAST, pk_ie.id DESC
            LIMIT 1)
          UNION ALL
          (SELECT 1 AS rank, 'picking_session'::text AS picked_source,
                  pk_ps.picker_staff_id AS picked_by, pk_ps.ended_at AS picked_at
             FROM picking_sessions pk_ps
            WHERE pk_ps.order_id        = o.id
              AND pk_ps.organization_id = o.organization_id
              AND pk_ps.ended_at IS NOT NULL
              AND NOT pk_ps.abandoned
            ORDER BY pk_ps.ended_at DESC, pk_ps.id DESC
            LIMIT 1)
          UNION ALL
          (SELECT 2 AS rank, 'pick_scan'::text AS picked_source,
                  pk_sal.staff_id AS picked_by, pk_sal.created_at AS picked_at
             FROM station_activity_logs pk_sal
            WHERE pk_sal.activity_type IN ('PICK_SCANNED', 'FNSKU_SCANNED')
              AND pk_sal.organization_id = o.organization_id
              AND (
                pk_sal.order_row_id = o.id
                OR pk_sal.ext_order_id = o.order_id
                OR (
                  pk_sal.shipment_id IS NOT NULL
                  AND pk_sal.shipment_id = o.shipment_id
                  AND (pk_sal.metadata->>'order_row_id') IS NULL
                  AND o.shipment_id IS NOT NULL
                  AND NOT EXISTS (
                    SELECT 1 FROM orders o2
                     WHERE o2.shipment_id = o.shipment_id
                       AND o2.organization_id = o.organization_id
                       AND o2.id <> o.id
                  )
                )
              )
            ORDER BY pk_sal.created_at DESC, pk_sal.id DESC
            LIMIT 1)
          UNION ALL
          (SELECT 3 AS rank, 'serial_pull'::text AS picked_source,
                  pk_tsn.tested_by AS picked_by, pk_tsn.created_at AS picked_at
             FROM tech_serial_numbers pk_tsn
            WHERE pk_tsn.order_id        = o.id
              AND pk_tsn.organization_id = o.organization_id
            ORDER BY pk_tsn.created_at DESC, pk_tsn.id DESC
            LIMIT 1)
          ) pk_arm
         ORDER BY pk_arm.rank
         LIMIT 1
      ) pick_fact ON true
  ) r
 WHERE f.organization_id = r.organization_id
   AND f.order_id = r.order_id
   AND (f.picked_at, f.picked_by, f.picked_source, f.has_pick_scan)
       IS DISTINCT FROM (r.picked_at, r.picked_by, r.picked_source, r.is_picked);
