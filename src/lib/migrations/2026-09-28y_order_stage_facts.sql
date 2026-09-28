-- 2026-09-28y_order_stage_facts.sql
--
-- WHAT
--   CREATE TABLE order_stage_facts — one row per order: its Pick · QC · Pack
--   facts (who / when / verdict), the ORDER/PICK and ORDER/PACK assignees, and
--   the order-grain pick / pack scan flags. Tenant-scoped from birth
--   (organization_id NOT NULL, PK (organization_id, order_id), FORCE RLS via
--   enforce_tenant_isolation). Backfilled here for every order of every org.
--
-- WHY
--   /api/orders evaluated eight per-order laterals (pick_alloc, pick_sess,
--   pick_scan, qc, wa_pick, wa_p, pl_latest, pack_activity) and two correlated
--   EXISTS (sqlOrderHasPickScan / sqlOrderHasPackScan) for every candidate row,
--   and /api/orders/queue-counts the two EXISTS for every To-ship order. The
--   feed and queue-counts now read this row by primary key.
--
-- WRITER
--   src/lib/orders/order-stage-facts.ts refreshOrderStageFacts — ONE statement
--   built from the same laterals the feed used, called by every stage writer
--   (Picker desk scan / delete, unit pick scan / unscan, picking sessions, pack
--   scans, recordTestVerdict, /api/orders/assign, upsertOrderAssignment) in the
--   writer's tenant transaction, plus the feed-membership cron sweep
--   (refreshAllOrderStageFacts per org). Every write runs under the org GUC and
--   stamps organization_id from orders, so FORCE RLS is safe now.
--
-- BACKFILL
--   The INSERT below is buildOrderStageFactsRefreshSql('TRUE') as of this
--   commit with the org bind replaced by "every org". Re-running it (or the
--   sweep) is idempotent: ON CONFLICT rewrites only rows whose facts changed.
--
-- VERIFY
--   SELECT count(*) FROM order_stage_facts;       -- = SELECT count(*) FROM orders
--   Feed diff: /api/orders (full + listShape=queue) and queue-counts before vs
--   after the read switch — 0 changed fields.
--
-- ROLLBACK
--   select relax_tenant_isolation('order_stage_facts'); DROP TABLE IF EXISTS order_stage_facts;
--   (and revert the feed / queue-counts read switch first)

CREATE TABLE IF NOT EXISTS order_stage_facts (
  organization_id  UUID NOT NULL,
  order_id         INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  qc_verdict       TEXT,
  qc_at            TIMESTAMPTZ,
  qc_by            INTEGER,
  qc_inherited     BOOLEAN NOT NULL DEFAULT false,
  picked_at        TIMESTAMPTZ,
  picked_by        INTEGER,
  packer_log_id    INTEGER,
  packed_at        TIMESTAMPTZ,
  packed_by        INTEGER,
  pack_activity_at TIMESTAMPTZ,
  pack_activity_by INTEGER,
  picker_id        INTEGER,
  packer_id        INTEGER,
  has_pick_scan    BOOLEAN NOT NULL DEFAULT false,
  has_pack_scan    BOOLEAN NOT NULL DEFAULT false,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT order_stage_facts_pkey PRIMARY KEY (organization_id, order_id)
);

COMMENT ON TABLE order_stage_facts IS
  'Per-order Pick/QC/Pack facts read by /api/orders and queue-counts. Only writer: refreshOrderStageFacts (src/lib/orders/order-stage-facts.ts).';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('order_stage_facts');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — order_stage_facts left without FORCE RLS';
  END IF;
END $$;

-- Backfill: every order of every org.
    INSERT INTO order_stage_facts AS f (organization_id, order_id, qc_verdict, qc_at, qc_by, qc_inherited, picked_at, picked_by, packer_log_id, packed_at, packed_by, pack_activity_at, pack_activity_by, picker_id, packer_id, has_pick_scan, has_pack_scan, updated_at)
    SELECT
      o.organization_id,
      o.id,
      qc.verdict,
      qc.created_at,
      qc.tested_by,
      COALESCE(qc.created_at < o.created_at, false),
      COALESCE(pick_alloc.picked_at, pick_sess.picked_at, pick_scan.picked_at),
      COALESCE(pick_alloc.picked_by, pick_sess.picked_by, pick_scan.picked_by),
      pl_latest.packer_log_id,
      pl_latest.packed_at,
      COALESCE(pack_activity.staff_id, pl_latest.packed_by),
      pack_activity.created_at,
      pack_activity.staff_id,
      wa_pick.picker_id,
      wa_p.assigned_packer_id,
      (
    EXISTS (
      SELECT 1 FROM tech_serial_numbers tsn
      WHERE tsn.order_id = o.id
        AND tsn.organization_id = o.organization_id
    )
    OR EXISTS (
      SELECT 1 FROM station_activity_logs sal
      WHERE sal.organization_id = o.organization_id
        AND sal.activity_type IN ('PICK_SCANNED', 'FNSKU_SCANNED')
        AND (
          sal.order_row_id = o.id
          OR sal.ext_order_id = o.order_id
          OR (
            sal.shipment_id IS NOT NULL
            AND sal.shipment_id = o.shipment_id
            AND (sal.metadata->>'order_row_id') IS NULL
            AND (
  o.shipment_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM orders o2
    WHERE o2.shipment_id = o.shipment_id
      AND o2.organization_id = o.organization_id
      AND o2.id <> o.id
  )
)
          )
        )
    )
  ),
      (
    EXISTS (
      SELECT 1 FROM station_activity_logs sal
      WHERE sal.organization_id = o.organization_id
        AND sal.activity_type IN ('PACK_COMPLETED', 'PACK_SCAN')
        AND (
          sal.order_row_id = o.id
          OR sal.ext_order_id = o.order_id
          OR (
            sal.shipment_id IS NOT NULL
            AND sal.shipment_id = o.shipment_id
            AND (sal.metadata->>'order_row_id') IS NULL
            AND (
  o.shipment_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM orders o2
    WHERE o2.shipment_id = o.shipment_id
      AND o2.organization_id = o.organization_id
      AND o2.id <> o.id
  )
)
          )
        )
    )
  ),
      now()
    FROM orders o
    LEFT JOIN LATERAL (
      SELECT tr.tested_by, tr.verdict, tr.created_at
        FROM order_unit_allocations qc_oua
        JOIN testing_results tr
          ON tr.serial_unit_id  = qc_oua.serial_unit_id
         AND tr.organization_id = qc_oua.organization_id
       WHERE qc_oua.order_id        = o.id
         AND qc_oua.organization_id = o.organization_id
         AND qc_oua.state <> 'RELEASED'
       ORDER BY tr.created_at DESC, tr.id DESC
       LIMIT 1
    ) qc ON TRUE
  LEFT JOIN LATERAL (
    SELECT ie.actor_staff_id AS picked_by,
           ie.occurred_at    AS picked_at
    FROM order_unit_allocations oua
    JOIN inventory_events ie
      ON ie.serial_unit_id  = oua.serial_unit_id
     AND ie.organization_id = oua.organization_id
     AND ie.event_type IN ('PICKED', 'FORCE_PICK')
     AND ie.occurred_at    >= oua.allocated_at
    WHERE oua.order_id        = o.id
      AND oua.organization_id = o.organization_id
      AND oua.state IN ('PICKED', 'PACKED', 'SHIPPED', 'RETURNED')
    ORDER BY ie.occurred_at DESC NULLS LAST, ie.id DESC
    LIMIT 1
  ) pick_alloc ON true
  LEFT JOIN LATERAL (
    SELECT ps.picker_staff_id                   AS picked_by,
           COALESCE(ps.ended_at, ps.started_at) AS picked_at
    FROM picking_sessions ps
    WHERE ps.order_id        = o.id
      AND ps.organization_id = o.organization_id
      AND NOT ps.abandoned
    ORDER BY COALESCE(ps.ended_at, ps.started_at) DESC, ps.id DESC
    LIMIT 1
  ) pick_sess ON true
  /*
   * The Picker desk's scan, at ORDER grain: a scan attributed to this order
   * (`order_row_id`). The desk writes it on every order-found scan; legacy
   * sole-shipment rows were stamped by 2026-09-28w.
   */
  LEFT JOIN LATERAL (
    SELECT sal.staff_id  AS picked_by,
           sal.created_at AS picked_at
    FROM station_activity_logs sal
    WHERE sal.organization_id = o.organization_id
      AND sal.station         = 'PICK'
      AND sal.activity_type   = 'PICK_SCANNED'
      AND sal.order_row_id    = o.id
    ORDER BY sal.created_at DESC, sal.id DESC
    LIMIT 1
  ) pick_scan ON true
  LEFT JOIN staff s_picked
    ON s_picked.id = COALESCE(pick_alloc.picked_by, pick_sess.picked_by, pick_scan.picked_by)
    LEFT JOIN LATERAL (
      SELECT wa.assigned_tech_id AS picker_id
        FROM work_assignments wa
       WHERE wa.organization_id = o.organization_id
         AND wa.entity_type = 'ORDER'
         AND wa.entity_id = o.id
         AND wa.work_type = 'PICK'
         AND wa.assigned_tech_id IS NOT NULL
         AND wa.status <> 'CANCELED'
       ORDER BY wa.updated_at DESC, wa.id DESC
       LIMIT 1
    ) wa_pick ON TRUE
    LEFT JOIN staff staff_picker
      ON staff_picker.id = wa_pick.picker_id
     AND staff_picker.organization_id = o.organization_id
    LEFT JOIN LATERAL (
      SELECT wa.assigned_packer_id
        FROM work_assignments wa
       WHERE wa.organization_id = o.organization_id
         AND wa.entity_type = 'ORDER'
         AND wa.entity_id = o.id
         AND wa.work_type = 'PACK'
         AND wa.assigned_packer_id IS NOT NULL
         AND wa.status <> 'CANCELED'
       ORDER BY wa.updated_at DESC, wa.id DESC
       LIMIT 1
    ) wa_p ON TRUE
    LEFT JOIN LATERAL (
      SELECT pl.id AS packer_log_id, pl.created_at AS packed_at, pl.packed_by
      FROM packer_logs pl
      WHERE o.shipment_id IS NOT NULL
        AND pl.organization_id = o.organization_id
        AND pl.shipment_id = o.shipment_id
        AND pl.completion_state = 'COMPLETED'
      ORDER BY pl.created_at DESC NULLS LAST, pl.id DESC
      LIMIT 1
    ) pl_latest ON TRUE
    LEFT JOIN LATERAL (
      SELECT sal.created_at, sal.staff_id
      FROM station_activity_logs sal
      WHERE o.shipment_id IS NOT NULL
        AND sal.shipment_id = o.shipment_id
        AND sal.organization_id = o.organization_id
        AND sal.station = 'PACK'
        AND sal.activity_type IN ('PACK_COMPLETED', 'PACK_SCAN')
      ORDER BY sal.created_at DESC NULLS LAST, sal.id DESC
      LIMIT 1
    ) pack_activity ON TRUE
    WHERE o.organization_id IS NOT NULL
      AND TRUE
    ON CONFLICT (organization_id, order_id) DO UPDATE SET
      qc_verdict = EXCLUDED.qc_verdict,
      qc_at = EXCLUDED.qc_at,
      qc_by = EXCLUDED.qc_by,
      qc_inherited = EXCLUDED.qc_inherited,
      picked_at = EXCLUDED.picked_at,
      picked_by = EXCLUDED.picked_by,
      packer_log_id = EXCLUDED.packer_log_id,
      packed_at = EXCLUDED.packed_at,
      packed_by = EXCLUDED.packed_by,
      pack_activity_at = EXCLUDED.pack_activity_at,
      pack_activity_by = EXCLUDED.pack_activity_by,
      picker_id = EXCLUDED.picker_id,
      packer_id = EXCLUDED.packer_id,
      has_pick_scan = EXCLUDED.has_pick_scan,
      has_pack_scan = EXCLUDED.has_pack_scan,
      updated_at = EXCLUDED.updated_at
    WHERE (f.qc_verdict, f.qc_at, f.qc_by, f.qc_inherited, f.picked_at, f.picked_by, f.packer_log_id, f.packed_at, f.packed_by, f.pack_activity_at, f.pack_activity_by, f.picker_id, f.packer_id, f.has_pick_scan, f.has_pack_scan)
          IS DISTINCT FROM
          (EXCLUDED.qc_verdict, EXCLUDED.qc_at, EXCLUDED.qc_by, EXCLUDED.qc_inherited, EXCLUDED.picked_at, EXCLUDED.picked_by, EXCLUDED.packer_log_id, EXCLUDED.packed_at, EXCLUDED.packed_by, EXCLUDED.pack_activity_at, EXCLUDED.pack_activity_by, EXCLUDED.picker_id, EXCLUDED.packer_id, EXCLUDED.has_pick_scan, EXCLUDED.has_pack_scan)
;
