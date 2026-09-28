-- 2026-09-28x_qc_triage_decisions.sql
-- qc_triage_decisions — every next step the QC triage tree suggested for a unit
-- (POST /api/qc/triage/next) and the tech's accept/reject on it
-- (POST /api/qc/triage/decisions). One row per suggested step; decision columns stay
-- NULL until a human answers. Decided rows feed back into the deterministic ranker
-- (src/lib/qc/triage/rank.ts): accepts count as hits, rejects as misses for the same
-- step_key on the same SKU (weight 1) or device family (weight ½).
--
-- sku / device_family are copied from the unit at suggestion time: feedback is about
-- the product the step was suggested for, not whatever the unit is re-SKU'd to later.
--
-- SAFETY: new table, tenant-scoped from birth (organization_id NOT NULL, every index
-- leads with it, enforce_tenant_isolation below). The only writer is
-- src/lib/qc/triage/decisions.ts, which runs inside withTenantTransaction and stamps
-- organization_id from the auth context. Depends on 2026-09-28t_qc_sessions.sql.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS qc_triage_decisions;
--
-- VERIFY:
--   \d qc_triage_decisions
--   select relrowsecurity, relforcerowsecurity from pg_class where relname = 'qc_triage_decisions';

CREATE TABLE IF NOT EXISTS qc_triage_decisions (
  id                    BIGSERIAL PRIMARY KEY,
  organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  serial_unit_id        INTEGER NOT NULL REFERENCES serial_units(id) ON DELETE CASCADE,
  qc_session_id         BIGINT REFERENCES qc_sessions(id) ON DELETE SET NULL,
  -- One /next call; its steps share it.
  request_id            UUID NOT NULL,
  sku                   TEXT,
  device_family         TEXT,
  failure_mode_id       INTEGER REFERENCES failure_modes(id) ON DELETE SET NULL,
  step_key              TEXT NOT NULL,
  step                  TEXT NOT NULL,
  kind                  TEXT NOT NULL CHECK (kind IN ('CHECK', 'FIX', 'RETEST')),
  why                   TEXT NOT NULL,
  evidence              JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence            NUMERIC(4, 3) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  rank                  SMALLINT NOT NULL CHECK (rank >= 1),
  ranked_by             TEXT NOT NULL CHECK (ranked_by IN ('DETERMINISTIC', 'AI')),
  model                 TEXT,
  suggested_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decision              TEXT CHECK (decision IN ('ACCEPTED', 'REJECTED')),
  decision_note         TEXT,
  decided_by_staff_id   INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  decided_at            TIMESTAMPTZ,
  CONSTRAINT qc_triage_decisions_decided_check CHECK ((decision IS NULL) = (decided_at IS NULL)),
  CONSTRAINT uq_qc_triage_decisions_request_step UNIQUE (organization_id, request_id, step_key)
);

-- A unit's suggestion history, newest first.
CREATE INDEX IF NOT EXISTS idx_qc_triage_decisions_org_unit
  ON qc_triage_decisions (organization_id, serial_unit_id, created_at DESC);

-- Ranker feedback: decided rows for a SKU / a family.
CREATE INDEX IF NOT EXISTS idx_qc_triage_decisions_org_sku_decided
  ON qc_triage_decisions (organization_id, sku)
  WHERE decision IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qc_triage_decisions_org_family_decided
  ON qc_triage_decisions (organization_id, device_family)
  WHERE decision IS NOT NULL;

COMMENT ON TABLE qc_triage_decisions IS
  'QC triage suggestions (POST /api/qc/triage/next) and the tech accept/reject on each (POST /api/qc/triage/decisions). Decided rows feed the deterministic ranker.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('qc_triage_decisions');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — qc_triage_decisions left without FORCE RLS';
  END IF;
END $$;
