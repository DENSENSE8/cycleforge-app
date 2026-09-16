-- 2026-09-14a_daily_check_kind_owner_glyph.sql
--
-- The daily checklist learns CADENCE, OWNERSHIP and a GLYPH.
--
-- WHY A `kind` COLUMN AND NOT JUST A ONE-DAY WINDOW: a `once` item CAN be
-- expressed as `effective_from = D, retired_at = D + 1` — and it still SHOULD
-- be, so past reports stay honest for free. `kind` exists because the REPORT
-- QUESTION differs: a recurring item missed is a compliance gap, a once item
-- missed is either rolled forward or expired, and a date window cannot express
-- that intent. Writers set BOTH: `kind = 'once'` AND the one-day window.
-- Column name is `kind` (values `recurring` / `once`), not "daily type":
-- the surface is already called Daily and "daily type" inside Daily reads as
-- a tautology on the floor (operator ruling 2026-09-15).
--
-- `assigned_staff_id` IS NULLABLE AND ONLY MEANINGFUL FOR `once`. The mark
-- grain is (item, staff, day), so an unowned one-off reads "1 of 5 done"
-- forever — the report therefore computes a PER-STAFF denominator (an item
-- counts for staffer S when `kind = 'recurring' OR assigned_staff_id IS NULL
-- OR assigned_staff_id = S`). Null = the whole shift, which stays correct for
-- every recurring item. No CHECK ties the owner to `once`: the API writes the
-- pair atomically, and a constraint would forbid the honest intermediate
-- state where an org converts a recurring item by setting an owner first.
--
-- `glyph` IS THE EMOJI CHARACTER ITSELF, not a lucide icon name: zero render
-- path, works on every face. Ceiling is 8 CHARACTERS because one emoji can be
-- several code units (ZWJ sequences, skin-tone modifiers).
--
-- TRACKING JOINS THE LINK VOCABULARY (same window, one review). A tracking
-- number is a STRING, not an integer entity id, so TRACKING rows carry the
-- value in `label` with `entity_id` NULL — the same convention
-- `resolve-thread-connections.ts` already paints for derived tracking
-- connections. `entity_id` drops NOT NULL for that one shape; the replaced
-- named CHECK keeps the other two types integral (entity_id present) and
-- tracking honest (label present). The natural-key index cannot police
-- tracking rows (NULLs are distinct), so a partial unique index does.
--
-- NO BACKFILL. Every existing row is `recurring` by default, which is what it
-- was. Existing links are all ticket/work-order shaped and stay legal under
-- the replaced CHECK.
--
-- ROLLBACK:
--   ALTER TABLE daily_check_items
--     DROP COLUMN IF EXISTS kind,
--     DROP COLUMN IF EXISTS assigned_staff_id,
--     DROP COLUMN IF EXISTS glyph;
--   DROP INDEX IF EXISTS ux_daily_check_item_links_tracking;
--   ALTER TABLE daily_check_item_links
--     DROP CONSTRAINT IF EXISTS daily_check_item_links_entity_type_chk;
--   DO $$ BEGIN
--     ALTER TABLE daily_check_item_links
--       ADD CONSTRAINT daily_check_item_links_entity_type_chk
--       CHECK (entity_type IN ('ZENDESK_TICKET', 'WORK_ORDER'));
--   EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--   ALTER TABLE daily_check_item_links ALTER COLUMN entity_id SET NOT NULL;
--
-- VERIFY:
--   \d daily_check_items            -- kind/assigned_staff_id/glyph present
--   \d daily_check_item_links       -- entity_id nullable, new CHECK, new index
--   npm run tenancy:audit

BEGIN;

ALTER TABLE daily_check_items
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'recurring',
  ADD COLUMN IF NOT EXISTS assigned_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  -- The emoji itself, not a lucide name: zero render path, works on every face.
  ADD COLUMN IF NOT EXISTS glyph TEXT;

-- Named CHECKs, added the house way: `ADD CONSTRAINT` has no IF NOT EXISTS, so
-- a re-run would abort the whole migration. Guard pattern is verbatim
-- `2026-08-19d_daily_check_item_links.sql` lines 40-44.
DO $$ BEGIN
  ALTER TABLE daily_check_items
    ADD CONSTRAINT daily_check_items_kind_chk CHECK (kind IN ('recurring','once'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE daily_check_items
    ADD CONSTRAINT daily_check_items_glyph_chk
    CHECK (glyph IS NULL OR char_length(glyph) BETWEEN 1 AND 8);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── TRACKING on the link table ────────────────────────────────────────────
-- entity_id goes nullable for the TRACKING shape only; the replaced CHECK
-- (same name, dropped-then-re-added so a re-run stays a no-op) keeps every
-- shape honest.
ALTER TABLE daily_check_item_links ALTER COLUMN entity_id DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE daily_check_item_links
    DROP CONSTRAINT IF EXISTS daily_check_item_links_entity_type_chk;
  ALTER TABLE daily_check_item_links
    ADD CONSTRAINT daily_check_item_links_entity_type_chk
    CHECK (
      (entity_type IN ('ZENDESK_TICKET', 'WORK_ORDER') AND entity_id IS NOT NULL)
      OR (entity_type = 'TRACKING' AND entity_id IS NULL AND label IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Dedupe key for the shape the natural index cannot see (NULL entity_id is
-- distinct in a unique index). One item may carry several DISTINCT tracking
-- numbers; the same number twice is the duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS ux_daily_check_item_links_tracking
  ON daily_check_item_links (organization_id, item_id, label)
  WHERE entity_type = 'TRACKING';

COMMIT;
