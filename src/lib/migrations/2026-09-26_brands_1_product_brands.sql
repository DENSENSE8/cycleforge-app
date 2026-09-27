-- ============================================================================
-- 2026-09-26_brands_1_product_brands.sql — product_brands + product_brand_aliases
-- ============================================================================
-- Contextual-sidebar backend, Phase 1 (docs/refactors/sidebar/BACKEND-HANDOFF.md
-- §Phase 1; evidence phase0-findings.md §"Brand / manufacturer data audit").
-- Operator requirement: search for and identify products by brand (Bose, Sony,
-- JBL; the Rock Band / Guitar Hero franchises). Brand is an ATTRIBUTE of the
-- catalog (sku_catalog.brand_id, next file), not a new polymorphic family.
--
-- product_brands — one row per brand / franchise / product line, per org.
--   • id SERIAL (integer): brand ids are int everywhere (identify, facets).
--   • kind TEXT + named CHECK (brand | franchise | product_line): Rock Band is
--     a franchise (publisher Harmonix / Mad Catz), not the same fact as Sony.
--   • parent_brand_id: same-org self FK via the composite
--     (organization_id, parent_brand_id) → (organization_id, id), so a line
--     can never hang under another org's brand. Deleting a parent orphans the
--     child (SET NULL on parent_brand_id only — PG15+ column list).
--   • normalized_name / slug unique PER ORG (normalizeBrandName / brandSlug in
--     src/lib/brands/normalize.ts write them).
-- product_brand_aliases — the matching vocabulary (misspellings "boser",
--   abbreviations "qc" → QuietComfort, model prefixes). An alias maps to
--   exactly ONE brand per org: UNIQUE (organization_id, normalized_alias); a
--   collision is an error, never a silent re-point. Every brand's own name is
--   also one of its aliases (the domain inserts it), so the unique also keeps
--   a brand name from colliding with another brand's alias.
--   • source TEXT + named CHECK (seed | zoho | listing | operator | agent).
--   • review_only: an ambiguous alias ("sl", "rc") whose hit is only ever a
--     review-queue proposal, never an auto-applied brand or a typeahead
--     classification.
--   Lookups are plain text equality on (organization_id, normalized_alias) —
--   texteq is leakproof, so the unique index is an Index Cond under forced RLS
--   as app_tenant (phase0-findings §Schema 0).
--
-- Safety gating: brand-new tables, no writers at author time. The only
-- writers — src/lib/brands/store.ts (routes, the review-queue apply path in
-- applyAgentMutation, scripts/brands-seed.ts, scripts/brands-backfill.ts) —
-- run inside withTenantTransaction (GUC set) AND stamp organization_id
-- explicitly → tenant-from-birth enforcement is safe.
--
-- ROLLBACK:
--   select relax_tenant_isolation('product_brand_aliases');
--   select relax_tenant_isolation('product_brands');
--   DROP TABLE IF EXISTS product_brand_aliases;
--   DROP TABLE IF EXISTS product_brands;   -- after 2026-09-26_brands_2 is rolled back
--
-- VERIFY (after apply):
--   npm run tenancy:coverage   -- both tables: organization_id NOT NULL, RLS + FORCE
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid IN ('product_brands'::regclass, 'product_brand_aliases'::regclass);
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS product_brands (
  id               SERIAL PRIMARY KEY,
  organization_id  UUID NOT NULL,                 -- no DEFAULT; enforce_tenant_isolation() installs it
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL,
  normalized_name  TEXT NOT NULL,
  kind             TEXT NOT NULL DEFAULT 'brand',
  parent_brand_id  INTEGER,
  publisher        TEXT,                          -- franchise publisher(s), e.g. 'Activision / RedOctane'
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT product_brands_org_id_unique UNIQUE (organization_id, id),
  CONSTRAINT product_brands_org_slug_unique UNIQUE (organization_id, slug),
  CONSTRAINT product_brands_org_normalized_name_unique UNIQUE (organization_id, normalized_name)
);

DO $$ BEGIN
  ALTER TABLE product_brands ADD CONSTRAINT product_brands_kind_chk
    CHECK (kind IN ('brand', 'franchise', 'product_line'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE product_brands ADD CONSTRAINT product_brands_not_own_parent_chk
    CHECK (parent_brand_id IS NULL OR parent_brand_id <> id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE product_brands ADD CONSTRAINT product_brands_parent_fk
    FOREIGN KEY (organization_id, parent_brand_id)
    REFERENCES product_brands (organization_id, id)
    ON DELETE SET NULL (parent_brand_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Children of a brand (detail panel, subtree roll-ups).
CREATE INDEX IF NOT EXISTS idx_product_brands_org_parent
  ON product_brands (organization_id, parent_brand_id)
  WHERE parent_brand_id IS NOT NULL;

COMMENT ON TABLE product_brands IS
  'Per-org brand / franchise / product_line vocabulary (sidebar Phase 1). sku_catalog.brand_id points here. Written only by src/lib/brands/store.ts under withTenantTransaction. Tenant-scoped from birth.';

CREATE TABLE IF NOT EXISTS product_brand_aliases (
  id                BIGSERIAL PRIMARY KEY,
  organization_id   UUID NOT NULL,                -- no DEFAULT; enforce_tenant_isolation() installs it
  brand_id          INTEGER NOT NULL,
  alias             TEXT NOT NULL,
  normalized_alias  TEXT NOT NULL,
  source            TEXT NOT NULL DEFAULT 'operator',
  review_only       BOOLEAN NOT NULL DEFAULT false,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT product_brand_aliases_org_alias_unique UNIQUE (organization_id, normalized_alias),
  CONSTRAINT product_brand_aliases_brand_fk
    FOREIGN KEY (organization_id, brand_id)
    REFERENCES product_brands (organization_id, id)
    ON DELETE CASCADE
);

DO $$ BEGIN
  ALTER TABLE product_brand_aliases ADD CONSTRAINT product_brand_aliases_source_chk
    CHECK (source IN ('seed', 'zoho', 'listing', 'operator', 'agent'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE product_brand_aliases ADD CONSTRAINT product_brand_aliases_normalized_chk
    CHECK (normalized_alias <> '');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A brand's aliases (detail panel, search-text builder).
CREATE INDEX IF NOT EXISTS idx_product_brand_aliases_org_brand
  ON product_brand_aliases (organization_id, brand_id);

COMMENT ON TABLE product_brand_aliases IS
  'Brand matching vocabulary: one normalized alias → exactly one brand per org (collision = error). review_only aliases only ever produce review-queue proposals. Tenant-scoped from birth.';

-- ── Tenant-from-birth enforcement (both tables) ──────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('product_brands');
    PERFORM enforce_tenant_isolation('product_brand_aliases');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — product_brands/product_brand_aliases left without FORCE RLS';
  END IF;
END $$;

COMMIT;
