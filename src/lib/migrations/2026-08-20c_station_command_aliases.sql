-- 2026-08-20c_station_command_aliases.sql
--
-- station_command_aliases — tenant-authored scan strings that resolve to a
-- BUILT-IN command.
--
-- Plan: docs/todo/universal-scan-router-PLAN.md §8.
--
-- WHY A TABLE AND NOT A reason_codes COLUMN. Commands are already seeded into
-- reason_codes (flow_context = 'station_command') so Admin can see, relabel and
-- print them. An alias is a different shape: it carries a TARGET — the built-in
-- code it resolves to — and reason_codes has no such column and no row that
-- would ever use one. Adding `alias_target` there would put a NULL on every
-- other vocabulary in the table to serve one flow_context, which is a
-- discriminator-shaped column with no discriminator. The vocabulary stays in
-- reason_codes; the MAPPING lives here.
--
-- WHY AN ALIAS CANNOT INVENT BEHAVIOUR. The command registries
-- (src/lib/stations/*-command-codes.ts) are code, PR-reviewed, and that is
-- deliberate: a scan that moves an operator or writes a verdict must not be
-- creatable from an admin form. So an alias is exactly one thing — a second
-- NAME for a command that already exists. `target_code` is validated in the app
-- against the registries on every write; the DB cannot know a code-owned list,
-- so it constrains SHAPE here and the route constrains MEMBERSHIP.
--
-- THE NAMESPACE CHECK IS A SAFETY CONTROL, NOT TIDINESS. `code` must match
-- ^CMD-[A-Z0-9][A-Z0-9-]*$. The scan classifier claims the `CMD-` namespace
-- wholesale precisely so a command can never be mistaken for a serial
-- (detectStationScanType — an unregistered CMD-* answers COMMAND, never
-- SERIAL). An alias outside that namespace would break the guarantee in both
-- directions: `BENCH-3` would classify as a serial fragment and be looked up
-- against tech_serial_numbers, and a real serial shaped like the alias would
-- silently trigger a station jump. Uppercase is forced for the same reason the
-- parser squashes: one row must answer for every casing of its own string.
--
-- TENANCY: tenant-from-birth. organization_id UUID NOT NULL with no DEFAULT in
-- the raw DDL; enforce_tenant_isolation() installs the loud-fail GUC default,
-- FORCE RLS and the canonical policy. Safe immediately — zero existing writers.
--
-- EXPAND-FIRST: this migration lands BEFORE any code reads it
-- (.claude/rules/backend-patterns.md). The Drizzle model ships in this same PR.
--
-- ROLLBACK:
--   select relax_tenant_isolation('station_command_aliases');
--   drop table if exists station_command_aliases;
--
-- VERIFY:
--   \d+ station_command_aliases
--   npm run tenancy:coverage

BEGIN;

CREATE TABLE IF NOT EXISTS station_command_aliases (
  id                  BIGSERIAL PRIMARY KEY,
  organization_id     UUID NOT NULL,          -- NO default; enforce_tenant_isolation installs it

  -- The custom scan string an operator's sticker carries.
  code                TEXT NOT NULL,
  -- The BUILT-IN command code it resolves to. Not an FK: the target lives in a
  -- code registry, not a table. Membership is enforced by the write route
  -- against NAV_COMMAND_CODES / ACTION_COMMAND_CODES / STATION_COMMAND_CODES.
  target_code         TEXT NOT NULL,
  -- Human name on the book row and the 2x1" sticker face.
  label               TEXT NOT NULL,

  sort_order          INTEGER NOT NULL DEFAULT 100,
  is_active           BOOLEAN NOT NULL DEFAULT true,

  created_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Shape + namespace. See the header note: this is what keeps a custom code from
-- colliding with a serial in either direction.
DO $$ BEGIN
  ALTER TABLE station_command_aliases ADD CONSTRAINT station_command_aliases_code_chk
    CHECK (code ~ '^CMD-[A-Z0-9][A-Z0-9-]*$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE station_command_aliases ADD CONSTRAINT station_command_aliases_target_chk
    CHECK (target_code ~ '^CMD-[A-Z0-9][A-Z0-9-]*$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- An alias pointing at itself is an infinite name for nothing.
DO $$ BEGIN
  ALTER TABLE station_command_aliases ADD CONSTRAINT station_command_aliases_not_self
    CHECK (code <> target_code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One meaning per scanned string, per tenant. Without this a single sticker
-- could resolve two ways depending on row order — the one failure an operator
-- can never diagnose from the floor.
CREATE UNIQUE INDEX IF NOT EXISTS ux_station_command_aliases_org_code
  ON station_command_aliases (organization_id, code);

-- The hydration read: every active alias for a tenant, in book order.
CREATE INDEX IF NOT EXISTS idx_station_command_aliases_org_sort
  ON station_command_aliases (organization_id, sort_order);

-- ── Tenant-from-birth ───────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('station_command_aliases');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — station_command_aliases left without FORCE RLS';
  END IF;
END $$;

COMMIT;
