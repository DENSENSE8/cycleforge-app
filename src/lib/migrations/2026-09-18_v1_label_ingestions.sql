-- ============================================================================
-- CycleForge V1 outbound — immutable label-ingestion data core
--
-- Adds:
--   desktop_devices         enrolled Tauri device principals
--   label_ingestions        tenant-scoped, byte-idempotent ingestion ledger
--   label_ingestion_orders  complete logical marketplace-order row set
--
-- Safety properties:
--   * tenant from birth; enforce_tenant_isolation() is REQUIRED and unguarded
--   * all cross-table references carry organization_id
--   * no fulfillment lifecycle state is stored on orders.status
--   * exact-match vocabulary only; no fuzzy match discriminator exists
--   * APPLIED is terminal at the database boundary
--
-- Rollback (development only, after proving no dependent rows exist):
--   SELECT relax_tenant_isolation('label_ingestion_orders');
--   SELECT relax_tenant_isolation('label_ingestions');
--   SELECT relax_tenant_isolation('desktop_devices');
--   DROP TABLE label_ingestion_orders;
--   DROP TABLE label_ingestions;
--   DROP TABLE desktop_devices;
--   DROP FUNCTION guard_label_ingestion_transition();
--   DROP FUNCTION touch_v1_label_ingestion_updated_at();
-- The supporting (organization_id, id) indexes are intentionally retained:
-- they are generally useful tenant-scoped lookup indexes on existing tables.
-- ============================================================================

BEGIN;

-- Composite tenant foreign keys below require matching unique keys. The primary
-- key still owns global row identity; these keys make tenant ownership part of
-- every new relationship instead of trusting an application-side pre-check.
CREATE UNIQUE INDEX IF NOT EXISTS ux_staff_org_id
  ON staff (organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_org_id
  ON orders (organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_documents_org_id
  ON documents (organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_serial_units_org_id
  ON serial_units (organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_shipping_tracking_numbers_org_id
  ON shipping_tracking_numbers (organization_id, id);

CREATE TABLE IF NOT EXISTS desktop_devices (
  id                         BIGSERIAL PRIMARY KEY,
  organization_id            UUID NOT NULL,
  public_id                   UUID NOT NULL DEFAULT gen_random_uuid(),
  label                       TEXT NOT NULL,
  status                      TEXT NOT NULL DEFAULT 'ENROLLED',
  platform                    TEXT NOT NULL,
  app_version                 VARCHAR(64),
  enroll_code_hash            VARCHAR(64),
  enroll_code_expires_at      TIMESTAMPTZ,
  device_token_hash           VARCHAR(64),
  enrolled_by_staff_id        INTEGER,
  last_seen_at                TIMESTAMPTZ,
  revoked_at                  TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT desktop_devices_org_public_uniq
    UNIQUE (organization_id, public_id),
  CONSTRAINT desktop_devices_org_id_uniq
    UNIQUE (organization_id, id),
  CONSTRAINT desktop_devices_staff_org_fk
    FOREIGN KEY (organization_id, enrolled_by_staff_id)
    REFERENCES staff (organization_id, id) ON DELETE SET NULL (enrolled_by_staff_id),
  CONSTRAINT desktop_devices_label_chk
    CHECK (char_length(btrim(label)) BETWEEN 1 AND 120),
  CONSTRAINT desktop_devices_status_chk
    CHECK (status IN ('ENROLLED', 'ACTIVE', 'REVOKED')),
  CONSTRAINT desktop_devices_platform_chk
    CHECK (platform IN ('LINUX', 'MACOS', 'WINDOWS')),
  CONSTRAINT desktop_devices_enroll_hash_chk
    CHECK (enroll_code_hash IS NULL OR enroll_code_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT desktop_devices_token_hash_chk
    CHECK (device_token_hash IS NULL OR device_token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT desktop_devices_status_fields_chk
    CHECK (
      (status = 'ENROLLED' AND revoked_at IS NULL)
      OR (status = 'ACTIVE' AND device_token_hash IS NOT NULL AND revoked_at IS NULL)
      OR (status = 'REVOKED' AND revoked_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_desktop_devices_org_enroll_hash
  ON desktop_devices (organization_id, enroll_code_hash)
  WHERE enroll_code_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_desktop_devices_org_token_hash
  ON desktop_devices (organization_id, device_token_hash)
  WHERE device_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_desktop_devices_org_status
  ON desktop_devices (organization_id, status, id);
CREATE INDEX IF NOT EXISTS idx_desktop_devices_org_seen
  ON desktop_devices (organization_id, last_seen_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS label_ingestions (
  id                              BIGSERIAL PRIMARY KEY,
  organization_id                 UUID NOT NULL,
  device_id                       BIGINT,
  actor_staff_id                  INTEGER,
  client_event_id                 UUID NOT NULL,
  sha256                          VARCHAR(64) NOT NULL,
  file_basename                   TEXT NOT NULL,
  byte_size                       BIGINT NOT NULL,
  observed_at                     TIMESTAMPTZ NOT NULL,
  source                          TEXT NOT NULL,
  state                           TEXT NOT NULL DEFAULT 'RECEIVED',
  parser_version                  TEXT,
  match_method                    TEXT,
  detected_cycleforge_reference   TEXT,
  matched_account_source          TEXT,
  matched_marketplace_order_id    TEXT,
  tracking_number_raw             TEXT,
  tracking_number_normalized      TEXT,
  carrier                         TEXT,
  staged_storage_provider         TEXT,
  staged_object_key               TEXT,
  mime_type                       TEXT NOT NULL DEFAULT 'application/pdf',
  matched_order_id                INTEGER,
  shipment_id                     BIGINT,
  document_id                     INTEGER,
  quarantine_reason_code          TEXT,
  attempt_count                   INTEGER NOT NULL DEFAULT 0,
  row_version                     INTEGER NOT NULL DEFAULT 0,
  error_code                      TEXT,
  error_detail                    TEXT,
  applied_at                      TIMESTAMPTZ,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT label_ingestions_org_id_uniq
    UNIQUE (organization_id, id),
  CONSTRAINT label_ingestions_org_device_fk
    FOREIGN KEY (organization_id, device_id)
    REFERENCES desktop_devices (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT label_ingestions_org_actor_fk
    FOREIGN KEY (organization_id, actor_staff_id)
    REFERENCES staff (organization_id, id) ON DELETE SET NULL (actor_staff_id),
  CONSTRAINT label_ingestions_org_order_fk
    FOREIGN KEY (organization_id, matched_order_id)
    REFERENCES orders (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT label_ingestions_org_shipment_fk
    FOREIGN KEY (organization_id, shipment_id)
    REFERENCES shipping_tracking_numbers (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT label_ingestions_org_document_fk
    FOREIGN KEY (organization_id, document_id)
    REFERENCES documents (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT label_ingestions_sha256_chk
    CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT label_ingestions_basename_chk
    CHECK (
      char_length(file_basename) BETWEEN 1 AND 255
      AND file_basename = btrim(file_basename)
      AND position('/' IN file_basename) = 0
      AND position(chr(92) IN file_basename) = 0
    ),
  CONSTRAINT label_ingestions_byte_size_chk
    CHECK (byte_size > 0),
  CONSTRAINT label_ingestions_source_chk
    CHECK (source IN ('WATCHED_FOLDER', 'BROWSER_FIXTURE', 'MANUAL_UPLOAD')),
  CONSTRAINT label_ingestions_state_chk
    CHECK (state IN ('RECEIVED', 'STAGED', 'PARSED', 'MATCHED', 'QUARANTINED', 'APPLYING', 'APPLIED', 'FAILED')),
  CONSTRAINT label_ingestions_match_method_chk
    CHECK (match_method IS NULL OR match_method IN ('CYCLEFORGE_REFERENCE', 'MARKETPLACE_ORDER_ID')),
  CONSTRAINT label_ingestions_attempt_chk
    CHECK (attempt_count >= 0),
  CONSTRAINT label_ingestions_row_version_chk
    CHECK (row_version >= 0),
  CONSTRAINT label_ingestions_mime_chk
    CHECK (mime_type = 'application/pdf'),
  CONSTRAINT label_ingestions_error_detail_chk
    CHECK (error_detail IS NULL OR char_length(error_detail) <= 1000),
  CONSTRAINT label_ingestions_quarantine_chk
    CHECK (state <> 'QUARANTINED' OR quarantine_reason_code IS NOT NULL),
  CONSTRAINT label_ingestions_matched_chk
    CHECK (
      state NOT IN ('MATCHED', 'APPLYING', 'APPLIED')
      OR (
        match_method IS NOT NULL
        AND matched_account_source IS NOT NULL
        AND matched_marketplace_order_id IS NOT NULL
        AND tracking_number_normalized IS NOT NULL
        AND staged_storage_provider IS NOT NULL
        AND staged_object_key IS NOT NULL
      )
    ),
  CONSTRAINT label_ingestions_applied_chk
    CHECK (
      (
        state = 'APPLIED'
        AND applied_at IS NOT NULL
        AND matched_order_id IS NOT NULL
        AND shipment_id IS NOT NULL
        AND document_id IS NOT NULL
      )
      OR (
        state <> 'APPLIED'
        AND applied_at IS NULL
        AND shipment_id IS NULL
        AND document_id IS NULL
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_label_ingestions_org_sha256
  ON label_ingestions (organization_id, sha256);
CREATE UNIQUE INDEX IF NOT EXISTS ux_label_ingestions_org_client_event
  ON label_ingestions (organization_id, client_event_id);
CREATE INDEX IF NOT EXISTS idx_label_ingestions_org_state_observed
  ON label_ingestions (organization_id, state, observed_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_label_ingestions_org_order_identity
  ON label_ingestions (
    organization_id,
    matched_account_source,
    matched_marketplace_order_id,
    id DESC
  )
  WHERE matched_account_source IS NOT NULL
    AND matched_marketplace_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_label_ingestions_org_device_observed
  ON label_ingestions (organization_id, device_id, observed_at DESC, id DESC)
  WHERE device_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS label_ingestion_orders (
  organization_id   UUID NOT NULL,
  ingestion_id      BIGINT NOT NULL,
  order_id          INTEGER NOT NULL,
  ordinal           INTEGER NOT NULL,
  link_role         TEXT NOT NULL DEFAULT 'MATCHED_LINE',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT label_ingestion_orders_pk
    PRIMARY KEY (ingestion_id, order_id),
  CONSTRAINT label_ingestion_orders_org_ingestion_fk
    FOREIGN KEY (organization_id, ingestion_id)
    REFERENCES label_ingestions (organization_id, id) ON DELETE CASCADE,
  CONSTRAINT label_ingestion_orders_org_order_fk
    FOREIGN KEY (organization_id, order_id)
    REFERENCES orders (organization_id, id) ON DELETE RESTRICT,
  CONSTRAINT label_ingestion_orders_ordinal_chk
    CHECK (ordinal >= 0),
  CONSTRAINT label_ingestion_orders_role_chk
    CHECK (link_role = 'MATCHED_LINE'),
  CONSTRAINT label_ingestion_orders_ingestion_ordinal_uniq
    UNIQUE (ingestion_id, ordinal)
);

CREATE INDEX IF NOT EXISTS idx_label_ingestion_orders_org_order
  ON label_ingestion_orders (organization_id, order_id, ingestion_id);
CREATE INDEX IF NOT EXISTS idx_label_ingestion_orders_org_ingestion
  ON label_ingestion_orders (organization_id, ingestion_id, ordinal);

CREATE OR REPLACE FUNCTION touch_v1_label_ingestion_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_desktop_devices_updated_at ON desktop_devices;
CREATE TRIGGER trg_desktop_devices_updated_at
BEFORE UPDATE ON desktop_devices
FOR EACH ROW EXECUTE FUNCTION touch_v1_label_ingestion_updated_at();

DROP TRIGGER IF EXISTS trg_label_ingestions_updated_at ON label_ingestions;
CREATE TRIGGER trg_label_ingestions_updated_at
BEFORE UPDATE ON label_ingestions
FOR EACH ROW EXECUTE FUNCTION touch_v1_label_ingestion_updated_at();

CREATE OR REPLACE FUNCTION guard_label_ingestion_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.state = 'APPLIED' AND NEW.state IS DISTINCT FROM OLD.state THEN
    RAISE EXCEPTION 'label_ingestions APPLIED state is terminal'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.organization_id IS DISTINCT FROM NEW.organization_id THEN
    RAISE EXCEPTION 'label_ingestions organization_id is immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.sha256 IS DISTINCT FROM NEW.sha256 THEN
    RAISE EXCEPTION 'label_ingestions sha256 is immutable'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.row_version < OLD.row_version THEN
    RAISE EXCEPTION 'label_ingestions row_version cannot decrease'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_label_ingestions_transition_guard ON label_ingestions;
CREATE TRIGGER trg_label_ingestions_transition_guard
BEFORE UPDATE ON label_ingestions
FOR EACH ROW EXECUTE FUNCTION guard_label_ingestion_transition();

-- Fail the migration if the canonical tenancy helper is absent. A new table
-- without FORCE RLS is not a degraded mode; it is a tenant-data incident.
SELECT enforce_tenant_isolation('desktop_devices');
SELECT enforce_tenant_isolation('label_ingestions');
SELECT enforce_tenant_isolation('label_ingestion_orders');

COMMENT ON TABLE desktop_devices IS
  'Enrolled CycleForge Tauri desktop principal. Separate from kiosk_devices; only hashes are stored.';
COMMENT ON TABLE label_ingestions IS
  'Immutable tenant-scoped shipping-label ingestion ledger. Exact match only; APPLIED is terminal.';
COMMENT ON TABLE label_ingestion_orders IS
  'Complete orders-row set for one exactly resolved logical marketplace order.';

COMMIT;
