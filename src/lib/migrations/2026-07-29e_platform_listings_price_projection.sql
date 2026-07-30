-- ============================================================================
-- 2026-07-29e — local priced, category-navigable catalog projection
--
-- Gives the counter a catalog it can total a mixed cart from without a live
-- vendor round trip. Today a cold repair-catalog read walks the Ecwid storefront
-- (~2.5k products; the module fights it with a two-tier L1 Map + Redis cache and
-- bounded-concurrency category fetches), and the repair form ships a hardcoded
-- `price: '130'` default because there is NO sell price anywhere in Postgres:
-- sku_catalog carries only last_known_cost_cents (acquisition) and
-- replenish_target_cents (reorder trigger) — neither is a sell price.
--
-- PRICE HOME = platform_listings, NOT sku_catalog (plan D3). Sell price is
-- per-CHANNEL; platform_listings already carries organization_id +
-- listing_price_cents + platform + external_ref_id and its schema comment
-- declares it the forward-prep home for exactly this. sku_catalog stays product
-- IDENTITY — putting a channel-specific sell price on the identity hub is the
-- fork this decision avoids.
--
-- FILENAME NOTE: the parallel index assigned phase 02 `2026-07-29b`, but that
-- suffix is already taken TWICE on main (_photos_client_captured_at and
-- _reason_codes_photo_policy_override_seed). Migrations apply in filename sort
-- order, so a duplicated suffix makes ordering ambiguous. Renamed to `-29e`.
--
-- ── THE CATEGORY TREE DECISION (doc 02 §1 asks for this, justified) ─────────
--
-- The projection must carry CATEGORIES, not just price: ProductSelector drills a
-- category hierarchy (breadcrumbs, parent/child, leaf detection), so a
-- price-only projection would leave the live Ecwid walk in place and this
-- migration would deliver nothing.
--
-- Categories land in TWO places, for two different reasons:
--
--   1. `platform_listings.category_external_ids TEXT[]` — per-listing MEMBERSHIP.
--      A real column (+ GIN), not jsonb: "which products are in category X" is
--      the drill query itself, so this is a queryable business fact, and
--      .claude/rules/polymorphic-tables.md reserves jsonb for true variant
--      config. An array with GIN answers `&&` / `@>` directly; a join table
--      would be a third relation for a bounded, always-fetched-together list.
--
--   2. `platform_catalog_categories` — the TREE ITSELF, as its own table.
--      A category node is a distinct entity with identity, a parent link, a name
--      and a path — not an attribute of a listing. The decisive argument is
--      EMPTY BRANCHES: resolveRepairCategoryLevel has to render a category that
--      currently holds zero products, and a listing-shaped store literally
--      cannot represent one (there is no listing row to hang it off). Storing
--      the tree on listings would also duplicate every node once per product in
--      it, and leave parent chains unwalkable.
--
-- `depth` and `full_path` are denormalized on write. They are pure functions of
-- the parent chain, and precomputing them turns every breadcrumb render from a
-- recursive walk into a column read. The writer owns keeping them true.
--
-- Deliberately NOT stored: which categories are repair ROOTS. Root resolution
-- reads ECWID_REPAIR_CATEGORY_IDS (or falls back to a name match) at read time,
-- so re-pointing the repair root stays a config change and never needs a
-- re-sync. Baking env config into projected data is how a flag and its data
-- drift apart.
--
-- ── STALENESS CONTRACT ──────────────────────────────────────────────────────
-- This projection is authoritative for DISPLAY. The terminal charge is
-- authoritative for MONEY: catalog lines are sent to the provider by
-- catalog_object_id and the provider re-prices them, so a drifted local price
-- can never overcharge a customer. A charge rejected on catalog drift triggers a
-- background refresh. Do NOT "fix" this into a live read — that reintroduces the
-- ~16s cold walk on a consumer-facing form.
--
-- Safe on current data: platform_listings has 0 rows / 0 writers by design, so
-- every column added here starts empty and nothing is backfilled.
--
-- Idempotent (IF NOT EXISTS / guarded DO-blocks) and roll-forward only.
-- ============================================================================

BEGIN;

-- ── 1. Per-listing projection columns ───────────────────────────────────────

-- Category MEMBERSHIP. Empty array (not NULL) as the default so `&&` and array
-- length work without a NULL branch at every call site.
ALTER TABLE platform_listings
  ADD COLUMN IF NOT EXISTS category_external_ids TEXT[] NOT NULL DEFAULT '{}';

-- The picker renders a thumbnail per row; without it the projected read would
-- still need the vendor for an image and the walk would survive.
ALTER TABLE platform_listings
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Availability as the provider reports it. Distinct from `listing_quantity`
-- (a count we do not get for these rows) and from `is_active` (whether WE
-- consider the listing live) — a product can be enabled but out of stock.
ALTER TABLE platform_listings
  ADD COLUMN IF NOT EXISTS in_stock BOOLEAN NOT NULL DEFAULT true;

-- The drill query: every listing in category X, org-scoped. GIN over the array.
CREATE INDEX IF NOT EXISTS idx_platform_listings_category_ids
  ON platform_listings USING GIN (category_external_ids);

-- The projected-read scan: one org's listings on one platform, priced.
CREATE INDEX IF NOT EXISTS idx_platform_listings_org_platform_active
  ON platform_listings (organization_id, platform)
  WHERE is_active;

-- NOTE: the upsert arbiter this projection writes through already exists —
-- ux_platform_listings_org_platform_ref UNIQUE (organization_id, platform,
-- external_ref_id) WHERE external_ref_id IS NOT NULL. No new unique needed.

-- ── 2. The category tree ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform_catalog_categories (
  id                 BIGSERIAL PRIMARY KEY,
  organization_id    UUID NOT NULL,             -- NO default; enforce_tenant_isolation installs it
  platform           TEXT NOT NULL,             -- discriminator; named CHECK below
  /** The provider's own category id. TEXT because provider id types vary. */
  external_id        TEXT NOT NULL,
  /** NULL = a provider-root category (no parent). */
  parent_external_id TEXT,
  name               TEXT NOT NULL,
  /** Denormalized 'A > B > C'. Pure function of the parent chain; writer owns it. */
  full_path          TEXT NOT NULL DEFAULT '',
  /** Denormalized depth from the provider root. Same rationale as full_path. */
  depth              INTEGER NOT NULL DEFAULT 0,
  sort_order         INTEGER NOT NULL DEFAULT 0,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  synced_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Keep the discriminator vocabulary in step with platform_listings.platform.
DO $$ BEGIN
  ALTER TABLE platform_catalog_categories
    ADD CONSTRAINT platform_catalog_categories_platform_chk
    CHECK (platform IN ('ecwid','square','ebay','amazon','shopify'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A node cannot be its own parent. Deeper cycles are the writer's problem (its
-- path walk is cycle-guarded); this catches the trivial case in the schema.
DO $$ BEGIN
  ALTER TABLE platform_catalog_categories
    ADD CONSTRAINT platform_catalog_categories_no_self_parent_chk
    CHECK (parent_external_id IS NULL OR parent_external_id <> external_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Natural key + upsert arbiter, org-led.
CREATE UNIQUE INDEX IF NOT EXISTS ux_platform_catalog_categories_natural
  ON platform_catalog_categories (organization_id, platform, external_id);

-- The level query: children of one parent (or the provider roots when NULL).
-- Two indexes because NULLs are not usefully searchable in the composite.
CREATE INDEX IF NOT EXISTS idx_platform_catalog_categories_parent
  ON platform_catalog_categories (organization_id, platform, parent_external_id);
CREATE INDEX IF NOT EXISTS idx_platform_catalog_categories_roots
  ON platform_catalog_categories (organization_id, platform)
  WHERE parent_external_id IS NULL;

-- ── 3. Tenant-from-birth ────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('platform_catalog_categories');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — platform_catalog_categories left without FORCE RLS';
  END IF;
END $$;

COMMIT;
