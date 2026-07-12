-- Drop the moved receiving spine columns (§8 step 13 — the interim triage/unbox
-- carton cluster + the line testing/zoho clusters).
--
-- What / why (Wave-4, applied after 2026-07-11d retired the dual-write triggers):
--   Readers (Wave 2) and writers (Wave 3) are fully on the street/facts tables:
--   receiving_triage / receiving_unbox own the carton triage+unbox facts;
--   receiving_line_testing / receiving_line_zoho own the line testing+zoho facts.
--   The spine copies are dead weight. This migration:
--     1. re-points v_unfound_queue's one moved-column read (r.unboxed_at IS NULL →
--        NOT EXISTS receiving_unbox unboxed) BEFORE the drop (pg blocks dropping a
--        column a view depends on), keeping security_invoker=true;
--     2. drops 14 carton columns and 19 line columns.
--
-- Safety gating:
--   - Grep-verified zero code reads/writes of these spine columns outside
--     immutable migrations.
--   - Dual-write triggers already dropped (…d_); coarse-status / received_done_at /
--     updated_at / delete-family / outbox triggers touch only surviving columns.
--   - Dependent indexes (incl. the spine zoho uniques and the old global
--     triage_client_event_id unique) drop automatically with their columns.
--   - Street-table parity was 0-drift at cutover; data lives on in the street
--     tables — nothing is lost.
--
-- Rollback: restore columns from the street tables (reverse of the 2026-06-29d /
--   2026-07-05c backfills) — a new migration, never an edit here.
--
-- Verify after apply:
--   SELECT count(*) FROM information_schema.columns WHERE table_name='receiving_carton';
--   SELECT count(*) FROM information_schema.columns WHERE table_name='receiving_line';
--   SELECT count(*) FROM v_unfound_queue;  -- same count as before the drop

BEGIN;

-- ── 1. v_unfound_queue: re-point the unboxed gate at receiving_unbox ─────────
CREATE OR REPLACE VIEW v_unfound_queue AS
 SELECT 'unmatched_receiving'::text AS kind,
    r.id::text AS source_id,
    r.organization_id,
    NULLIF(string_agg(rl.item_name, ' | '::text), ''::text) AS product_title,
    NULLIF(string_agg(su.serial_number, ', '::text), ''::text) AS serial_numbers,
    stn.tracking_number_raw AS context,
    r.receiving_date_time AS created_at,
    ov.zendesk_ticket_id,
    ov.zendesk_synced_at,
    ov.usa_team_note,
    ov.vietnam_team_note,
    ov.follow_up_at,
    COALESCE(ov.checked, false) AS checked,
    ov.checked_at
   FROM receiving_carton r
     LEFT JOIN receiving_line rl ON rl.receiving_id = r.id
     LEFT JOIN serial_unit_provenance sup ON sup.origin_type = 'RECEIVING_LINE'::text AND sup.origin_id = rl.id AND sup.organization_id = r.organization_id
     LEFT JOIN serial_units su ON su.id = sup.serial_unit_id
     LEFT JOIN unfound_overlay ov ON ov.source_kind = 'unmatched_receiving'::text AND ov.source_id = r.id::text AND ov.organization_id = r.organization_id
     LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
  WHERE r.source = 'unmatched'::text
    AND NOT (EXISTS ( SELECT 1 FROM receiving_line rl2 WHERE rl2.receiving_id = r.id))
    AND NOT (EXISTS ( SELECT 1 FROM receiving_unbox ru
                       WHERE ru.receiving_id = r.id AND ru.unboxed_at IS NOT NULL))
  GROUP BY r.id, r.organization_id, stn.tracking_number_raw, r.receiving_date_time, ov.zendesk_ticket_id, ov.zendesk_synced_at, ov.usa_team_note, ov.vietnam_team_note, ov.follow_up_at, ov.checked, ov.checked_at
UNION ALL
 SELECT 'email_po'::text AS kind,
    empo.id::text AS source_id,
    empo.organization_id,
    NULL::text AS product_title,
    NULL::text AS serial_numbers,
        CASE
            WHEN COALESCE(array_length(empo.po_numbers, 1), 0) > 0 THEN (COALESCE(empo.email_subject, '(no subject)'::text) || ' · PO: '::text) || array_to_string(empo.po_numbers, ', '::text)
            ELSE COALESCE(empo.email_subject, '(no subject)'::text)
        END AS context,
    empo.scanned_at AS created_at,
    ov.zendesk_ticket_id,
    ov.zendesk_synced_at,
    ov.usa_team_note,
    ov.vietnam_team_note,
    ov.follow_up_at,
    COALESCE(ov.checked, false) AS checked,
    ov.checked_at
   FROM email_missing_purchase_orders empo
     LEFT JOIN unfound_overlay ov ON ov.source_kind = 'email_po'::text AND ov.source_id = empo.id::text AND ov.organization_id = empo.organization_id
  WHERE empo.pile <> 'done'::text;

ALTER VIEW v_unfound_queue SET (security_invoker = true);

-- ── 2. Carton: drop the interim triage/unbox cluster (→ receiving_triage/_unbox)
ALTER TABLE receiving_carton
  DROP COLUMN IF EXISTS received_at,
  DROP COLUMN IF EXISTS received_by,
  DROP COLUMN IF EXISTS unbox_opened_at,
  DROP COLUMN IF EXISTS unbox_opened_by,
  DROP COLUMN IF EXISTS unboxed_at,
  DROP COLUMN IF EXISTS unboxed_by,
  DROP COLUMN IF EXISTS unbox_only_intake,
  DROP COLUMN IF EXISTS staging_location_id,
  DROP COLUMN IF EXISTS priority_lane,
  DROP COLUMN IF EXISTS pairing_state,
  DROP COLUMN IF EXISTS triage_complete,
  DROP COLUMN IF EXISTS triage_completed_at,
  DROP COLUMN IF EXISTS triage_completed_by,
  DROP COLUMN IF EXISTS triage_client_event_id;

-- ── 3. Line: drop the testing + zoho clusters (→ receiving_line_testing/_zoho)
ALTER TABLE receiving_line
  DROP COLUMN IF EXISTS needs_test,
  DROP COLUMN IF EXISTS assigned_tech_id,
  DROP COLUMN IF EXISTS qa_status,
  DROP COLUMN IF EXISTS disposition_code,
  DROP COLUMN IF EXISTS disposition_final,
  DROP COLUMN IF EXISTS condition_grade,
  DROP COLUMN IF EXISTS disposition_audit,
  DROP COLUMN IF EXISTS condition_set_at,
  DROP COLUMN IF EXISTS zoho_item_id,
  DROP COLUMN IF EXISTS zoho_line_item_id,
  DROP COLUMN IF EXISTS zoho_purchase_receive_id,
  DROP COLUMN IF EXISTS zoho_purchaseorder_id,
  -- number_norm is GENERATED ALWAYS from zoho_purchaseorder_number on the spine —
  -- the dependent generated column must drop BEFORE its source column.
  DROP COLUMN IF EXISTS zoho_purchaseorder_number_norm,
  DROP COLUMN IF EXISTS zoho_purchaseorder_number,
  DROP COLUMN IF EXISTS zoho_sync_source,
  DROP COLUMN IF EXISTS zoho_last_modified_time,
  DROP COLUMN IF EXISTS zoho_synced_at,
  DROP COLUMN IF EXISTS zoho_notes,
  DROP COLUMN IF EXISTS unit_price;

COMMIT;
