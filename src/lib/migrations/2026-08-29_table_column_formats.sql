-- ============================================================================
-- 2026-08-29 — table_column_formats (Sheets marks / colour / alignment)
--
-- WHAT
--   Per-column formatting for the Workbench spreadsheets: bold · italic ·
--   strike · text colour · fill colour · horizontal alignment. One row per
--   FORMATTED column of one table in one org. Plan:
--   docs/todo/one-sheet-table-sot-PLAN.md § 5.1.
--
-- WHY PER COLUMN AND NOT PER CELL (operator ruling 2026-08-29)
--   Rows on these surfaces are live orders and receiving lines — they arrive,
--   they ship, they are gone. A store keyed by (row_id, column_key) would grow
--   with the DATA rather than with the configuration, add a join to every
--   collection fetch on a 900-row queue, and accumulate formatting for rows that
--   no longer exist with nothing to garbage-collect it against. A column is
--   stable, there are tens of them per org, and the operator gesture is
--   identical: select cells, press B, the column bolds.
--
-- WHY ORG-SHARED AND NOT PER STAFF
--   Formatting is a claim about what the table MEANS ("late is red here"), not a
--   personal display preference like column width or zoom. A staff-scoped bucket
--   would make one operator's red invisible to the next one at the same bench,
--   which is the opposite of why someone paints a column. Per-staff prefs stay
--   in staff_preferences.tableColumns (hidden / order / widths / zoom).
--
-- WHY COLOURS ARE TOKEN NAMES, NOT HEX
--   text_color / fill_color hold a key of SHEET_TEXT_SWATCHES /
--   SHEET_FILL_SWATCHES (src/lib/tables/column-formats.ts), resolved to a
--   semantic Tailwind alias at render. A hex would pin one theme's literal into
--   the database and go wrong the moment the palette or dark mode moves — and
--   the house law is that no page-local hex exists at all. The CHECK below is
--   deliberately only a shape guard (no '#'); the VALUE vocabulary is enforced
--   by Zod at the API boundary, where a renamed swatch degrades to "no colour"
--   rather than to a 500.
--
-- TENANT-FROM-BIRTH / FORCE RLS
--   organization_id NOT NULL (no DDL default; the helper installs the loud-fail
--   GUC default) + enforce_tenant_isolation in the same migration. Safe to FORCE
--   now: ZERO writers at apply time — the API route lands second, per the
--   expand → code → contract ordering law.
--
-- ROLLBACK (dev only)
--   SELECT relax_tenant_isolation('table_column_formats');
--   DROP TABLE IF EXISTS table_column_formats CASCADE;
--
-- VERIFY
--   \d table_column_formats
--   SELECT relrowsecurity, relforcerowsecurity FROM pg_class
--    WHERE relname = 'table_column_formats';   -- both t after enforce
--
-- Ordering law: expand → code → contract. This lands + applies FIRST.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS table_column_formats (
  id               BIGSERIAL PRIMARY KEY,
  organization_id  UUID NOT NULL,   -- no DDL default; enforce_tenant_isolation installs the loud-fail GUC default
  -- The prefs-bucket id from src/lib/tables/table-columns.ts `TableId`.
  -- Deliberately TEXT with no CHECK: the union grows with every rebuilt surface
  -- (26 pending), and a CHECK here would need a DROP/re-ADD follow-up per wave —
  -- the exact constraint-drift trap polymorphic-tables.md records. A row for an
  -- unknown table_id is inert: nothing resolves it, and it costs one dead row.
  table_id         TEXT NOT NULL,
  column_key       TEXT NOT NULL,
  bold             BOOLEAN NOT NULL DEFAULT FALSE,
  italic           BOOLEAN NOT NULL DEFAULT FALSE,
  strike           BOOLEAN NOT NULL DEFAULT FALSE,
  -- Swatch KEYS (e.g. 'danger'), never hex. See the header.
  text_color       TEXT,
  fill_color       TEXT,
  align            TEXT,
  -- Who last painted it — an org-shared format needs an author when two people
  -- disagree about what a column should look like.
  updated_by       INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- One format per column per table per org. The API upserts on this.
  CONSTRAINT table_column_formats_unique UNIQUE (organization_id, table_id, column_key)
);

DO $$ BEGIN
  ALTER TABLE table_column_formats ADD CONSTRAINT table_column_formats_align_chk
    CHECK (align IS NULL OR align IN ('left', 'center', 'right'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Shape guard only — a literal colour must never reach this table. The value
-- vocabulary itself is Zod's job at the route (see the header).
DO $$ BEGIN
  ALTER TABLE table_column_formats ADD CONSTRAINT table_column_formats_text_color_chk
    CHECK (text_color IS NULL OR (text_color !~ '^#' AND length(text_color) <= 32));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE table_column_formats ADD CONSTRAINT table_column_formats_fill_color_chk
    CHECK (fill_color IS NULL OR (fill_color !~ '^#' AND length(fill_color) <= 32));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The only read shape: "every format for this table, in this org", fetched once
-- per sheet mount. The UNIQUE constraint's index already leads with
-- (organization_id, table_id), so it serves this query and no second index is
-- needed.

-- Flip on FORCE RLS + loud-fail org default + the canonical tenant_isolation
-- policy. Guarded so a fresh DB without the helper still gets the table.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('table_column_formats');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — table_column_formats left without FORCE RLS';
  END IF;
END $$;

COMMENT ON TABLE table_column_formats IS
  'Org-shared per-column spreadsheet formatting (bold/italic/strike/text+fill colour/align) for Workbench sheets. Colours are design-token keys, never hex. Per-staff display prefs stay in staff_preferences.tableColumns.';

COMMIT;
