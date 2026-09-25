-- 2026-09-24h_shipstation_order_refs.sql
-- ShipStation is the sole outbound-order importer. `orders` stays the
-- operator-facing record; this migration adds the provider-side records it
-- needs, and nothing else:
--
--   shipstation_order_refs     one row per (ShipStation order, orders row it
--                              landed on). ShipStation order id / key / number,
--                              store id + marketplace, the platform
--                              account_source it resolved to, how it matched
--                              (inserted / same / adopted / claimed),
--                              provenance, first/last seen. A ShipStation
--                              order may enrich several rows (a number
--                              already under two spellings of one platform),
--                              hence the (org, ss order, orders row) key.
--   shipstation_shipment_refs  one row per ShipStation v1 shipment (label made
--                              in ShipStation): shipment id, tracking, carrier,
--                              service, voided/return flags, the orders row
--                              it was attached to and the attach outcome.
--                              Label ids are NOT duplicated here: v1 shipments
--                              carry none; the v2 label id lives on
--                              label_ingestions.shipstation_label_id (joined by
--                              label_ingestions.shipstation_shipment_id =
--                              shipstation_shipment_refs.shipstation_shipment_id)
--                              and shipping_label_purchases.label_id.
--   shipstation_sync_runs      the run ledger + resumable checkpoint for the
--                              connector: mode (incremental / backfill), window,
--                              phase + page checkpoint, imported / enriched /
--                              skipped / quarantined counts and reasons. The
--                              incremental watermark stays in sync_cursors.
--
-- It also widens order_import_exceptions.reason so the connector can
-- quarantine an order it cannot attribute or match unambiguously
-- ('shipstation_unknown_store', 'shipstation_ambiguous_match') into the
-- existing exception queue instead of guessing.
--
-- Safety gating: all three tables are new; their only writer
-- (src/lib/integrations/connectors/shipstation*.ts) runs through
-- tenantQuery / withTenantTransaction (sets app.current_org) AND stamps
-- organization_id explicitly, so they are tenant-enforced from birth.
-- The CHECK widening only adds values.
--
-- ROLLBACK: select relax_tenant_isolation('shipstation_order_refs');
--           select relax_tenant_isolation('shipstation_shipment_refs');
--           select relax_tenant_isolation('shipstation_sync_runs');
--           DROP TABLE IF EXISTS shipstation_order_refs, shipstation_shipment_refs, shipstation_sync_runs;
--           (and restore order_import_exceptions_reason_chk to ('no_item_number')
--            once no ShipStation exception rows remain)

CREATE TABLE IF NOT EXISTS shipstation_order_refs (
  id                      BIGSERIAL PRIMARY KEY,
  organization_id         UUID NOT NULL,
  shipstation_order_id    BIGINT NOT NULL,
  order_key               TEXT,
  order_number            TEXT NOT NULL,
  store_id                BIGINT,
  marketplace             TEXT,
  account_source          TEXT,
  order_row_id            INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  match_kind              TEXT NOT NULL,
  shipstation_status      TEXT,
  modify_date             TEXT,
  provenance              TEXT NOT NULL DEFAULT 'shipstation_v1',
  first_seen_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shipstation_order_refs_match_kind_chk
    CHECK (match_kind IN ('inserted', 'same', 'adopted', 'claimed')),
  CONSTRAINT shipstation_order_refs_org_order_row_unique
    UNIQUE (organization_id, shipstation_order_id, order_row_id)
);

CREATE INDEX IF NOT EXISTS idx_shipstation_order_refs_org_row
  ON shipstation_order_refs (organization_id, order_row_id);
CREATE INDEX IF NOT EXISTS idx_shipstation_order_refs_org_number
  ON shipstation_order_refs (organization_id, order_number);
CREATE INDEX IF NOT EXISTS idx_shipstation_order_refs_org_store
  ON shipstation_order_refs (organization_id, store_id);

CREATE TABLE IF NOT EXISTS shipstation_shipment_refs (
  id                        BIGSERIAL PRIMARY KEY,
  organization_id           UUID NOT NULL,
  shipstation_shipment_id   BIGINT NOT NULL,
  shipstation_order_id      BIGINT,
  order_number              TEXT,
  order_row_id              INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  tracking_number           TEXT,
  carrier_code              TEXT,
  service_code              TEXT,
  ship_date                 TEXT,
  create_date               TEXT,
  voided                    BOOLEAN NOT NULL DEFAULT false,
  is_return_label           BOOLEAN NOT NULL DEFAULT false,
  attach_status             TEXT NOT NULL,
  provenance                TEXT NOT NULL DEFAULT 'shipstation_v1',
  first_seen_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT shipstation_shipment_refs_attach_status_chk
    CHECK (attach_status IN ('attached', 'already_current', 'unmatched', 'failed', 'not_primary', 'voided', 'skipped')),
  CONSTRAINT shipstation_shipment_refs_org_shipment_unique
    UNIQUE (organization_id, shipstation_shipment_id)
);

CREATE INDEX IF NOT EXISTS idx_shipstation_shipment_refs_org_row
  ON shipstation_shipment_refs (organization_id, order_row_id);
CREATE INDEX IF NOT EXISTS idx_shipstation_shipment_refs_org_number
  ON shipstation_shipment_refs (organization_id, order_number);

CREATE TABLE IF NOT EXISTS shipstation_sync_runs (
  id                BIGSERIAL PRIMARY KEY,
  organization_id   UUID NOT NULL,
  mode              TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'running',
  window_start      TIMESTAMPTZ,
  window_end        TIMESTAMPTZ,
  phase             TEXT NOT NULL DEFAULT 'orders',
  checkpoint_at     TIMESTAMPTZ,
  checkpoint_page   INTEGER NOT NULL DEFAULT 1,
  counts            JSONB NOT NULL DEFAULT '{}'::jsonb,
  reasons           JSONB NOT NULL DEFAULT '{}'::jsonb,
  error             TEXT,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at       TIMESTAMPTZ,
  CONSTRAINT shipstation_sync_runs_mode_chk CHECK (mode IN ('incremental', 'backfill')),
  CONSTRAINT shipstation_sync_runs_status_chk CHECK (status IN ('running', 'done', 'failed')),
  CONSTRAINT shipstation_sync_runs_phase_chk CHECK (phase IN ('orders', 'shipments', 'done'))
);

CREATE INDEX IF NOT EXISTS idx_shipstation_sync_runs_org_started
  ON shipstation_sync_runs (organization_id, started_at DESC);

ALTER TABLE order_import_exceptions DROP CONSTRAINT IF EXISTS order_import_exceptions_reason_chk;
ALTER TABLE order_import_exceptions ADD CONSTRAINT order_import_exceptions_reason_chk
  CHECK (reason IN ('no_item_number', 'shipstation_unknown_store', 'shipstation_ambiguous_match'));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('shipstation_order_refs');
    PERFORM enforce_tenant_isolation('shipstation_shipment_refs');
    PERFORM enforce_tenant_isolation('shipstation_sync_runs');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — shipstation ref tables left without FORCE RLS';
  END IF;
END $$;
