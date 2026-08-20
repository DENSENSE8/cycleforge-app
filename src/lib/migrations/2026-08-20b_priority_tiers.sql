-- 2026-08-20b_priority_tiers.sql
--
-- priority_tiers — the org's presentation skin for the manual priority ladder.
--
-- THIS TABLE IS A SKIN, NOT A LADDER. Its sibling catalogs (platforms, types)
-- are open sets: a row IS the thing, an org adds and retires rows freely, and
-- the stored value is that row's slug. Priority is the opposite shape and the
-- difference is load-bearing:
--
--   * the four rungs are declared in src/lib/receiving/priority-override.ts
--   * their numeric tier (0..3) is what receiving.priority_tier STORES
--   * RECEIVING_PRIORITY_RANK_SQL sorts the whole receiving queue on
--     COALESCE(priority_tier, <platform CASE>)
--
-- So `tier` here is a foreign key into a compile-time constant, not a row an
-- operator owns. An org may RENAME a rung and REPAINT it. It may not add one,
-- delete one, or reorder them — every one of those changes the meaning of a
-- number already written to thousands of receiving rows.
--
-- WHAT IS DELIBERATELY ABSENT, and why each omission is the point:
--   no slug       — tier is the identity; a second identifier could disagree
--   no sort_order — tier IS the order (0 = most urgent), one source only
--   no is_active  — a hidden rung would strand every carton already on it
--   no insert API — the ladder's length is a code constant, not org data
-- Adding any of the above is how the receiving queue silently mis-sorts, so
-- widen this table only alongside a migration of receiving.priority_tier.
--
-- A MISSING ROW IS THE DEFAULT, not an error. An org that has never renamed a
-- rung has zero rows here and reads entirely from the built-in tiers; the
-- client merges rows over the constants by tier (see usePriorityCatalog). That
-- keeps this table empty for most orgs and makes "reset to default" a DELETE
-- rather than a second nullable column per field.
--
-- color_hex is the same optional accent as platforms.color_hex / types.color_hex:
-- set -> the pill dot derives ink + soft fill through src/lib/color-contrast.ts;
-- null -> the built-in tier tone. One resolver, three catalogs.

BEGIN;

CREATE TABLE IF NOT EXISTS priority_tiers (
  id              BIGSERIAL PRIMARY KEY,
  -- UUID, matching organizations.id and every other tenant table (the Drizzle
  -- model is orgIdCol(), i.e. uuid). No DEFAULT and no FK to organizations:
  -- enforce_tenant_isolation() below installs the loud-fail GUC default, FORCE
  -- RLS and the tenant_isolation policy — the same shape counter_sessions and
  -- receiving_listing_links use. (Was BIGINT REFERENCES organizations(id),
  -- which Postgres refused: "foreign key constraint cannot be implemented".)
  organization_id UUID NOT NULL,

  -- 0..3, matching PRIORITY_OVERRIDE_TIERS[].value. Identity AND display order.
  tier            INTEGER NOT NULL,

  -- Operator-facing name for the rung ("Medium" -> "Standard").
  label           TEXT NOT NULL,
  -- Dense carton-bookmark label, <= 4 chars preferred ("Med").
  short           TEXT NOT NULL,

  -- Optional org accent '#rrggbb'; null = the built-in tier tone.
  color_hex       VARCHAR(7),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- The ladder's length is a code constant. Reject a fifth rung at the door
  -- rather than discovering it as an unsortable receiving row.
  CONSTRAINT priority_tiers_tier_range CHECK (tier BETWEEN 0 AND 3),
  CONSTRAINT priority_tiers_label_len  CHECK (char_length(btrim(label)) BETWEEN 1 AND 40),
  CONSTRAINT priority_tiers_short_len  CHECK (char_length(btrim(short)) BETWEEN 1 AND 8),
  CONSTRAINT priority_tiers_color_hex  CHECK (color_hex IS NULL OR color_hex ~* '^#[0-9a-f]{6}$')
);

-- One override per rung per org. This is also what makes the write an upsert:
-- the client PATCHes a tier, not a row id, because the row may not exist yet.
CREATE UNIQUE INDEX IF NOT EXISTS uq_priority_tiers_org_tier
  ON priority_tiers (organization_id, tier);

CREATE INDEX IF NOT EXISTS idx_priority_tiers_org
  ON priority_tiers (organization_id);

-- ── Tenant-from-birth ───────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('priority_tiers');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — priority_tiers left without FORCE RLS';
  END IF;
END $$;

COMMIT;
