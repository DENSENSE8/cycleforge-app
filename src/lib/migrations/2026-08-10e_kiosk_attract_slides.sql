-- ============================================================================
-- 2026-08-10e — kiosk_attract_slides (front-desk attract / screensaver reel)
--
-- WHAT
--   An ORDERED, curated set of media an org plays on the idle customer tablet
--   (`/kiosk/v2` → AttractLoop). Supersedes the single-URL scalar
--   `organizations.settings.brand.attractMediaUrl`, which stays readable as the
--   legacy pointer until the carousel UI ships (expand → code → contract).
--
-- WHY A COMPOSITION TABLE
--   Same job as `listing_photos` / `photo_share_pack_items`: an ordered set with
--   per-membership facts (sort_order, dwell, enablement, a date window). Those
--   facts belong to the MEMBERSHIP, not to the media, which is exactly why
--   `listing_photos` exists rather than growing sort_order onto the generic
--   `photo_entity_links` hub.
--
-- WHY IT IS *NOT* A photos(id) FK  ← read before "unifying" this later
--   Three independent blockers, any one of which is fatal:
--     1. `photo_entity_links.entity_id` is BIGINT; `organizations.id` is UUID.
--        An org-scoped asset has no legal link row, and widening the hub's key
--        for one feature is exactly the polymorphic-hub growth that table's own
--        contract forbids.
--     2. `uploadPhoto()` (lib/photos/service.ts) REQUIRES (entityType, entityId)
--        and asserts the (entity × photo_type) write matrix. With no entity to
--        name, attract media would need a fake one or a circular insert
--        (slide row → upload → backfill photo_id).
--     3. Delivery. The kiosk host reaches bytes with a DEVICE token, not a staff
--        session, so the session-gated `/api/photos/{id}/content` is unusable
--        there. Signed GCS reads (`resolvePhotoAccessUrl`) would work but expire,
--        adding a refresh loop to a screen whose whole job is running unattended.
--   So: brand chrome served publicly, with its own pointer. Bytes stay on public
--   Vercel Blob under `orgs/{orgId}/kiosk-attract/` — the prefix
--   `isOrgAttractBlobUrl()` already gates best-effort `del()` on replace/clear.
--   This is deliberately NOT the evidence platform: nothing here is a customer
--   photo, and nothing here should ever become one.
--
-- media_kind IS the discriminator, content_type is data
--   The renderer picks <img> vs <video> off `media_kind`, so it gets a named
--   CHECK. `content_type` is NOT constrained: the allowlist lives in
--   `src/lib/kiosk/attract-media.ts` (ATTRACT_ALLOWED_MIME) and a CHECK
--   duplicating it would be a second copy to keep in lockstep — the
--   `reason_codes_flow_context_chk` failure mode, where five migrations fought
--   over one constraint's union.
--
-- TENANT-FROM-BIRTH / FORCE RLS
--   organization_id NOT NULL (no DDL default; the helper installs the loud-fail
--   GUC default) + enforce_tenant_isolation() in this same migration. SAFE to
--   FORCE now: the table has ZERO writers at apply time (the carousel API is not
--   built), so no code path can loud-fail. Writers MUST run under
--   withTenantTransaction or stamp organization_id explicitly.
--
-- BACKFILL
--   One enabled slide per org that already set brand.attractMediaUrl, so the
--   table is live-equivalent to the scalar the day it lands. media_kind is
--   derived from the URL extension — the only signal a bare URL carries; the
--   upload path stamps it from the real MIME going forward.
--
-- ROLLBACK (dev only)
--   SELECT relax_tenant_isolation('kiosk_attract_slides');
--   DROP TABLE IF EXISTS kiosk_attract_slides CASCADE;
--
-- VERIFY
--   SELECT organization_id, sort_order, media_kind, is_enabled
--     FROM kiosk_attract_slides ORDER BY organization_id, sort_order;
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS kiosk_attract_slides (
  id               BIGSERIAL PRIMARY KEY,
  organization_id  UUID NOT NULL,          -- no DDL default; helper installs the loud-fail GUC default
  -- Media pointer (public Vercel Blob).
  media_url        TEXT NOT NULL,
  blob_object_key  TEXT,                   -- retained so replace/clear can del() the exact object
  media_kind       TEXT NOT NULL,          -- CHECK below; drives <img> vs <video>
  content_type     TEXT,                   -- informational; allowlist lives in lib/kiosk/attract-media.ts
  file_size_bytes  INTEGER,
  -- Membership facts (the reason this is a table, not a scalar).
  sort_order       SMALLINT NOT NULL DEFAULT 0,
  duration_ms      INTEGER,                -- NULL = org default for images / natural length for video
  is_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at        TIMESTAMPTZ,            -- NULL = always; a seasonal slide is disabled, never deleted
  ends_at          TIMESTAMPTZ,
  caption          TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE kiosk_attract_slides
    ADD CONSTRAINT kiosk_attract_slides_media_kind_chk
      CHECK (media_kind IN ('image', 'video'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE kiosk_attract_slides
    ADD CONSTRAINT kiosk_attract_slides_window_chk
      CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE kiosk_attract_slides
    ADD CONSTRAINT kiosk_attract_slides_duration_chk
      CHECK (duration_ms IS NULL OR duration_ms > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The kiosk's only read: this org's enabled reel, in play order.
CREATE INDEX IF NOT EXISTS idx_kiosk_attract_slides_org_order
  ON kiosk_attract_slides (organization_id, sort_order)
  WHERE is_enabled = TRUE;

-- One membership per object — re-uploading the same Blob must not double it.
CREATE UNIQUE INDEX IF NOT EXISTS ux_kiosk_attract_slides_org_media
  ON kiosk_attract_slides (organization_id, media_url);

-- ─── Backfill the existing single-URL scalar as slide 0 ──────────────────────
INSERT INTO kiosk_attract_slides (organization_id, media_url, media_kind, sort_order)
SELECT
  o.id,
  BTRIM(o.settings -> 'brand' ->> 'attractMediaUrl'),
  CASE
    WHEN BTRIM(o.settings -> 'brand' ->> 'attractMediaUrl') ~* '\.(mp4|webm)(\?|#|$)'
      THEN 'video'
    ELSE 'image'
  END,
  0
FROM organizations o
WHERE COALESCE(BTRIM(o.settings -> 'brand' ->> 'attractMediaUrl'), '') <> ''
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('kiosk_attract_slides');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — kiosk_attract_slides left without FORCE RLS';
  END IF;
END $$;

COMMIT;
