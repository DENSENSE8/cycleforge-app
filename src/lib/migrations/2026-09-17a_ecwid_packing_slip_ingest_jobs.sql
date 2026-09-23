-- Durable ECWID packing-slip acquisition lifecycle.
-- Order ingestion and provider document acquisition are independently retryable:
-- a PDF failure never rolls back the order, and a replay never duplicates work.

CREATE TABLE IF NOT EXISTS outbound_document_ingest_jobs (
  id                BIGSERIAL PRIMARY KEY,
  organization_id   UUID NOT NULL,
  order_id           INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider           TEXT NOT NULL,
  document_type      TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending',
  attempt_count      INTEGER NOT NULL DEFAULT 0,
  next_attempt_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at    TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  document_id        INTEGER REFERENCES documents(id) ON DELETE SET NULL,
  last_error         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_outbound_document_ingest_provider
    CHECK (provider IN ('ecwid')),
  CONSTRAINT chk_outbound_document_ingest_type
    CHECK (document_type IN ('packing_slip')),
  CONSTRAINT chk_outbound_document_ingest_status
    CHECK (status IN ('pending', 'processing', 'available', 'failed')),
  CONSTRAINT ux_outbound_document_ingest_job
    UNIQUE (organization_id, provider, order_id, document_type)
);

CREATE INDEX IF NOT EXISTS idx_outbound_document_ingest_due
  ON outbound_document_ingest_jobs (organization_id, status, next_attempt_at)
  WHERE status IN ('pending', 'failed');

-- Byte-level replay guard, independent of the provider semantic sourceHash.
CREATE UNIQUE INDEX IF NOT EXISTS ux_documents_outbound_order_content_hash
  ON documents (
    organization_id,
    document_type,
    entity_id,
    (document_data->>'sha256Hex')
  )
  WHERE entity_type = 'ORDER'
    AND document_type IN ('shipping_label', 'packing_slip')
    AND document_data->>'sha256Hex' IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('outbound_document_ingest_jobs');
  END IF;
END $$;

