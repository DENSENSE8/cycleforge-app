-- ============================================================================
-- 2026-08-10f: receiving_listing_links — a labeled listing link per carton
-- ============================================================================
-- A purchase order can carry SEVERAL listing links (a Goodwill lot: four
-- auctions won, one box), and the buyer names each one so the unboxer can tell
-- which physical item is which. Neither fact fits the scalar columns we have:
--
--   • `receiving_carton.listing_url` — ONE url, no name. A four-auction PO has
--     nowhere to put links two through four.
--   • `receiving_line.listing_url`   — per line, still one url, still no name;
--     and a lot/bundle LINE can legitimately cover several listings.
--
-- Today those extra links survive only as free text in `receiving_carton.
-- zoho_notes` ("<title>: https://..."), parsed at read time by
-- parseListingLinksFromSyncNotes. That is why the carton read surface could
-- show links it can never let anyone EDIT, reorder, or bind to a line.
--
-- WHY TWO FKs AND NOT A POLYMORPHIC entity_type/entity_id:
-- there are exactly two parents and both are known at write time, so each gets
-- a real foreign key with real delete integrity. The polymorphic contract
-- (.claude/rules/polymorphic-tables.md) is for a discriminator that can name
-- parents a single FK cannot — that is not this table, and adopting it here
-- would trade two enforced references for a trigger family that enforces the
-- same thing more weakly.
--
-- WHY INBOUND ONLY (no `direction`, no ORDER owner):
-- inbound is "where I BOUGHT this" — an arbitrary auction URL somebody pasted,
-- pointing at another seller's listing. Outbound is "where I SELL this", which
-- already lives in `sku_platform_ids` (with listing_status / confidence /
-- paired_by) and is derived from the order's item_number. NO outbound table has
-- a listing_url column at all. One shared table would leave `label`,
-- `sort_order`, `bound_by` and `bound_at` permanently NULL on every sell-side
-- row. When an operator-authored link on an ORDER genuinely appears, the shape
-- to copy is `shipment_links` (owner_type + direction) — not this table.
--
-- `receiving_line_id` NULL is the load-bearing state: the buyer's links arrive
-- carton-level, and an unboxer BINDING one to a line is a real recorded act
-- (bound_by / bound_at), never an inference.
--
-- `source` deliberately stores only the two DURABLE tiers. `catalog` and
-- `derived` stay computed at read time in collectCartonListingLinks —
-- materializing a fallback would freeze a guess into a fact.
--
-- EXPAND ONLY. Nothing reads this table yet and the two scalar columns keep
-- working unchanged; the backfill, the resolver flip, the writers and the
-- eventual DROP are later steps (.claude/rules/backend-patterns.md → expand →
-- code → contract).
--
-- NOTE the FK targets: `receiving` and `receiving_lines` are compat VIEWS in
-- this database. The real tables — and the only legal FK targets — are
-- `receiving_carton` and `receiving_line`.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS receiving_listing_links;
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS receiving_listing_links (
  id                BIGSERIAL PRIMARY KEY,
  -- No DEFAULT here: enforce_tenant_isolation() installs the loud-fail GUC
  -- default, FORCE RLS and the tenant_isolation policy below.
  organization_id   UUID    NOT NULL,
  receiving_id      INTEGER NOT NULL REFERENCES receiving_carton(id) ON DELETE CASCADE,
  -- NULL until an operator binds this link to a line.
  receiving_line_id INTEGER          REFERENCES receiving_line(id)   ON DELETE SET NULL,
  -- Absolute http(s), already through normalizeListingHref at write time.
  href              TEXT    NOT NULL,
  -- The buyer's own name for this link. NULL = nobody named it; the reader
  -- falls back to the sync-note title, then the platform label.
  label             TEXT,
  source            TEXT    NOT NULL,
  -- The buyer's ordering IS the triage order the unboxer works down.
  sort_order        INTEGER NOT NULL DEFAULT 0,
  bound_by          INTEGER,
  bound_at          TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE receiving_listing_links ADD CONSTRAINT receiving_listing_links_source_chk
    CHECK (source IN ('manual','sync_notes'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE receiving_listing_links ADD CONSTRAINT receiving_listing_links_href_chk
    CHECK (href ~* '^https?://');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One row per (carton, url). Case-insensitive to match the resolver's own
-- dedupe, which keys on the lowercased href.
CREATE UNIQUE INDEX IF NOT EXISTS ux_receiving_listing_links_carton_href
  ON receiving_listing_links (organization_id, receiving_id, lower(href));

-- The carton read: every link for this box, in the buyer's order.
CREATE INDEX IF NOT EXISTS idx_receiving_listing_links_carton
  ON receiving_listing_links (organization_id, receiving_id, sort_order);

-- The line read, and the "still unbound" triage worklist.
CREATE INDEX IF NOT EXISTS idx_receiving_listing_links_line
  ON receiving_listing_links (organization_id, receiving_line_id)
  WHERE receiving_line_id IS NOT NULL;

COMMENT ON TABLE receiving_listing_links IS
  'Labeled listing links for an inbound carton (buyer-authored name + url). N per carton; receiving_line_id NULL until an unboxer binds one to a line. Sell-side listings live in sku_platform_ids, not here.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('receiving_listing_links');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — receiving_listing_links left without FORCE RLS';
  END IF;
END $$;

COMMIT;
