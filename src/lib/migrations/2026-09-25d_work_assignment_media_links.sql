-- 2026-09-25d_work_assignment_media_links.sql
--
-- MEDIA LINKS on a thrown task: a photo or video that lives somewhere else —
-- an unlisted YouTube walkthrough, a Vimeo, a Loom, a Google Drive clip, or a
-- direct https image / video file — attached by URL and painted beside the
-- uploaded photos and videos. One row per link.
--
--   kind  | provider
--   ------+-----------------------------------------------
--   video | youtube | vimeo | loom | drive | video_file
--   photo | image
--
-- `kind`, `provider`, the canonical `url`, `embed_url` and `thumbnail_url`
-- are ALWAYS `parseMediaLink`'s answer (src/lib/tasks/media-links.ts), never
-- the request's: the server re-parses on every create and URL edit. Because
-- `url` is canonical, UNIQUE (org, task, url) makes pasting the same clip
-- twice (youtu.be vs watch?v=) a no-op. Runs after
-- 2026-09-25c_work_assignment_documents.sql (same task-evidence family).
--
-- SAFETY: new table, tenant-from-birth. The only writer
-- (src/lib/tasks/task-media-links-db.ts via /api/tasks/[id]/media/links) runs
-- through the GUC wrappers in @/lib/tenancy/db and stamps organization_id
-- from the auth context, so the loud-fail org default and FORCE RLS are safe
-- from day one.
--
-- ROLLBACK:
--   SELECT relax_tenant_isolation('work_assignment_media_links');
--   DROP TABLE IF EXISTS work_assignment_media_links;
--
-- VERIFY:
--   \d+ work_assignment_media_links
--   SELECT conname FROM pg_constraint
--    WHERE conrelid = 'work_assignment_media_links'::regclass;
--   npm run tenancy:coverage

CREATE TABLE IF NOT EXISTS work_assignment_media_links (
  id                  BIGSERIAL PRIMARY KEY,
  organization_id     UUID NOT NULL,
  assignment_id       INTEGER NOT NULL REFERENCES work_assignments(id) ON DELETE CASCADE,
  kind                TEXT NOT NULL,
  provider            TEXT NOT NULL,
  url                 TEXT NOT NULL,
  embed_url           TEXT NOT NULL,
  thumbnail_url       TEXT,
  title               TEXT,
  created_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT work_assignment_media_links_kind_chk
    CHECK (kind IN ('video', 'photo')),
  CONSTRAINT work_assignment_media_links_provider_chk
    CHECK (provider IN ('youtube', 'vimeo', 'loom', 'drive', 'image', 'video_file')),
  CONSTRAINT work_assignment_media_links_url_len
    CHECK (char_length(url) BETWEEN 1 AND 2000),
  CONSTRAINT work_assignment_media_links_title_len
    CHECK (title IS NULL OR char_length(title) BETWEEN 1 AND 200)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_work_assignment_media_links_url
  ON work_assignment_media_links (organization_id, assignment_id, url);

CREATE INDEX IF NOT EXISTS idx_work_assignment_media_links_assignment
  ON work_assignment_media_links (organization_id, assignment_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('work_assignment_media_links');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — work_assignment_media_links left without FORCE RLS';
  END IF;
END $$;
