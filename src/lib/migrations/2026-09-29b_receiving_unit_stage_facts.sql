-- 2026-09-29b_receiving_unit_stage_facts.sql
--
-- Rebuildable read projection for the Receiving fast surface. Authoritative
-- writes remain on receiving_triage, receiving_line_unit / serial_units,
-- testing_results, label_print_jobs, and ticket_links.

BEGIN;

CREATE TABLE IF NOT EXISTS receiving_unit_stage_facts (
  organization_id          UUID NOT NULL,
  receiving_line_unit_id   BIGINT NOT NULL
                             REFERENCES receiving_line_unit(id) ON DELETE CASCADE,
  receiving_line_id        INTEGER NOT NULL
                             REFERENCES receiving_line(id) ON DELETE CASCADE,
  receiving_id             INTEGER REFERENCES receiving_carton(id) ON DELETE CASCADE,
  serial_unit_id            INTEGER REFERENCES serial_units(id) ON DELETE SET NULL,
  unit_uid                  TEXT,
  triage_state              TEXT NOT NULL DEFAULT 'NOT_STARTED',
  label_state               TEXT NOT NULL DEFAULT 'MISSING',
  qc_state                  TEXT NOT NULL DEFAULT 'PENDING',
  latest_verdict            TEXT,
  tested_at                 TIMESTAMPTZ,
  tested_by                 INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  primary_support_ticket_id BIGINT REFERENCES support_tickets(id) ON DELETE SET NULL,
  projection_version        INTEGER NOT NULL DEFAULT 1,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT receiving_unit_stage_facts_pkey
    PRIMARY KEY (organization_id, receiving_line_unit_id),
  CONSTRAINT receiving_unit_stage_facts_triage_chk
    CHECK (triage_state IN ('NOT_STARTED', 'TRIAGED')),
  CONSTRAINT receiving_unit_stage_facts_label_chk
    CHECK (label_state IN ('MISSING', 'PRINTED')),
  CONSTRAINT receiving_unit_stage_facts_qc_chk
    CHECK (qc_state IN ('PENDING', 'TEST_AGAIN', 'PASSED', 'FAILED'))
);

COMMENT ON TABLE receiving_unit_stage_facts IS
  'Rebuildable per-physical-unit Receiving triage/label/QC/ticket projection. Only writer: refreshReceivingUnitStageFacts.';

CREATE INDEX IF NOT EXISTS idx_receiving_unit_stage_facts_qc
  ON receiving_unit_stage_facts (organization_id, qc_state, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_receiving_unit_stage_facts_line
  ON receiving_unit_stage_facts (organization_id, receiving_line_id);

CREATE INDEX IF NOT EXISTS idx_receiving_unit_stage_facts_label
  ON receiving_unit_stage_facts (organization_id, label_state, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_receiving_unit_stage_facts_unit_uid
  ON receiving_unit_stage_facts (organization_id, unit_uid)
  WHERE unit_uid IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('receiving_unit_stage_facts');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — receiving_unit_stage_facts left without FORCE RLS';
  END IF;
END $$;

-- Initial all-tenant backfill. Runtime refreshes use the same precedence:
-- unit ticket, then line ticket, then carton ticket.
INSERT INTO receiving_unit_stage_facts AS f (
  organization_id, receiving_line_unit_id, receiving_line_id, receiving_id,
  serial_unit_id, unit_uid, triage_state, label_state, qc_state,
  latest_verdict, tested_at, tested_by, primary_support_ticket_id,
  projection_version, updated_at
)
SELECT
  rlu.organization_id,
  rlu.id,
  rlu.receiving_line_id,
  rl.receiving_id,
  rlu.serial_unit_id,
  su.unit_uid,
  CASE WHEN COALESCE(rt.triage_complete, false) THEN 'TRIAGED' ELSE 'NOT_STARTED' END,
  CASE WHEN label_job.id IS NOT NULL THEN 'PRINTED' ELSE 'MISSING' END,
  CASE latest_test.verdict
    WHEN 'PASS' THEN 'PASSED'
    WHEN 'TEST_AGAIN' THEN 'TEST_AGAIN'
    WHEN 'TESTING_FAILED' THEN 'FAILED'
    ELSE 'PENDING'
  END,
  latest_test.verdict,
  latest_test.created_at,
  latest_test.tested_by,
  primary_ticket.support_ticket_id,
  1,
  now()
FROM receiving_line_unit rlu
JOIN receiving_line rl
  ON rl.id = rlu.receiving_line_id
 AND rl.organization_id = rlu.organization_id
LEFT JOIN receiving_triage rt
  ON rt.receiving_id = rl.receiving_id
 AND rt.organization_id = rl.organization_id
LEFT JOIN serial_units su
  ON su.id = rlu.serial_unit_id
 AND su.organization_id = rlu.organization_id
LEFT JOIN LATERAL (
  SELECT tr.verdict, tr.created_at, tr.tested_by
    FROM testing_results tr
   WHERE tr.organization_id = rlu.organization_id
     AND tr.serial_unit_id = rlu.serial_unit_id
   ORDER BY tr.created_at DESC, tr.id DESC
   LIMIT 1
) latest_test ON TRUE
LEFT JOIN LATERAL (
  SELECT lpj.id
    FROM label_print_jobs lpj
   WHERE lpj.organization_id = rlu.organization_id
     AND lpj.serial_unit_id = rlu.serial_unit_id
   ORDER BY lpj.created_at DESC, lpj.id DESC
   LIMIT 1
) label_job ON TRUE
LEFT JOIN LATERAL (
  SELECT tl.support_ticket_id
    FROM ticket_links tl
   WHERE tl.organization_id = rlu.organization_id
     AND (
       (rlu.serial_unit_id IS NOT NULL AND tl.entity_type = 'SERIAL_UNIT' AND tl.entity_id = rlu.serial_unit_id)
       OR (tl.entity_type = 'RECEIVING_LINE' AND tl.entity_id = rl.id)
       OR (rl.receiving_id IS NOT NULL AND tl.entity_type = 'RECEIVING' AND tl.entity_id = rl.receiving_id)
     )
   ORDER BY
     CASE tl.entity_type WHEN 'SERIAL_UNIT' THEN 0 WHEN 'RECEIVING_LINE' THEN 1 ELSE 2 END,
     tl.is_primary DESC,
     tl.created_at DESC,
     tl.id DESC
   LIMIT 1
) primary_ticket ON TRUE
ON CONFLICT (organization_id, receiving_line_unit_id) DO UPDATE SET
  receiving_line_id        = EXCLUDED.receiving_line_id,
  receiving_id             = EXCLUDED.receiving_id,
  serial_unit_id           = EXCLUDED.serial_unit_id,
  unit_uid                 = EXCLUDED.unit_uid,
  triage_state             = EXCLUDED.triage_state,
  label_state              = EXCLUDED.label_state,
  qc_state                 = EXCLUDED.qc_state,
  latest_verdict           = EXCLUDED.latest_verdict,
  tested_at                = EXCLUDED.tested_at,
  tested_by                = EXCLUDED.tested_by,
  primary_support_ticket_id = EXCLUDED.primary_support_ticket_id,
  projection_version       = EXCLUDED.projection_version,
  updated_at               = EXCLUDED.updated_at;

COMMIT;
