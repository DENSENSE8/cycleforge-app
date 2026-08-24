-- 2026-08-23f_agent_mutations_governance_trace.sql
--
-- agent_mutations gains the two artefacts the 2026 governance frameworks ask
-- for and this table does not yet hold: WHY the agent proposed something, and
-- WHEN the request to approve it stops being valid.
--
-- Plan: docs/warehouse-os/05-data-model.md § Governance · LAWS.md A-section.
-- Parent: agent_mutations (2026-07-03o), widened by 2026-08-23a.
--
-- ── WHY THESE TWO AND NOT A GOVERNANCE TABLE ────────────────────────────────
--
-- EU AI Act, NIST AI RMF 1.1 (March 2026) and ISO/IEC 42001 converge on ONE
-- audit trail per agent action, carrying: the proposed action and parameters,
-- the reasoning behind it, the estimated impact, a rollback procedure, and an
-- expiry on the approval request. Checked against what this table already
-- holds:
--
--   proposed action + parameters   → payload                        ✓ 2026-07-03o
--   estimated impact / blast radius → agent_mutation_affects         ✓ 2026-07-03o
--   rollback procedure              → extra_audit.inverse            ✓ 2026-07-03o
--   who, and human-in-the-loop      → actor_kind, proposed_by_staff_id ✓ 2026-08-23a
--   reasoning trace                 → NOTHING
--   approval expiry                 → NOTHING
--
-- Two gaps, both column-shaped. A separate governance table would put the
-- compliance answer in a different row from the action it is about, and every
-- reader would have to join to find out whether the trail is complete — which
-- is the thirteen-spine problem (2026-08-23b) reinvented for audit.
--
-- ── reasoning ───────────────────────────────────────────────────────────────
--
-- TEXT, nullable. The agent's stated rationale, in the words it used at
-- proposal time.
--
-- NOT a key in `extra_audit`, and that is the whole point. `extra_audit` is a
-- grab-bag several code paths write (it already carries `inverse` and
-- `irreversibleReason`), so "is the reasoning present" would be a question about
-- whether some writer happened to set a key. An auditor asking *"show me every
-- high-risk action with no recorded rationale"* needs that to be `IS NULL` on a
-- column, not a jsonb probe that cannot tell absent from never-written.
--
-- NULL is honest and stays legal forever: every row written before this lands
-- genuinely has no recorded reasoning, and an operator action (actor_kind =
-- 'operator') has none by construction — a human doing a thing they hold the
-- permission for is not required to justify it to the ledger.
--
-- A full step-by-step trace does NOT go here. Multi-step chains are structured
-- and belong in `payload`; this column is the one-paragraph answer to "why",
-- which is the artefact the frameworks actually name.
--
-- ── expires_at ──────────────────────────────────────────────────────────────
--
-- TIMESTAMPTZ, nullable. After it passes, a proposal awaiting a human is stale
-- and must not be applied on the strength of a review nobody has revisited.
--
-- NULL means NO EXPIRY, not "expired". That is the correct reading for every
-- existing row and for kinds that are meant to sit in the queue indefinitely,
-- and it keeps this a pure expand — nothing changes meaning under an old
-- reader.
--
-- NO NEW `status` VALUE, deliberately. 'expired' would mean widening
-- agent_mutations_status_chk, and the house rule is that a widened CHECK is
-- redefined as a full UNION rather than appended — a migration, a code change
-- and a drift risk, to record a fact that is already derivable:
--
--     status IN ('proposed','under_review') AND expires_at < now()
--
-- Expiry is a function of the clock, so storing it as a state would need a
-- sweeper to keep true and would be wrong between sweeps. The index below is
-- what makes the derived read cheap.
--
-- ── SAFETY / GATING ─────────────────────────────────────────────────────────
--
-- Pure expand (D6): two nullable ADD COLUMNs and one partial index. No
-- defaults, no backfill, no rewrite, no constraint on existing rows. NOTHING
-- READS THESE YET — the code that writes and enforces them lands after this,
-- which is the required order and never the reverse.
--
-- TENANCY: agent_mutations is already tenant-from-birth with FORCE RLS and the
-- canonical policy (2026-07-03o). Adding columns does not change its policy,
-- and the new index leads with organization_id like every other index on this
-- table.
--
-- ── ROLLBACK ────────────────────────────────────────────────────────────────
--
--   DROP INDEX IF EXISTS idx_agent_mutations_org_pending_expiry;
--   ALTER TABLE agent_mutations
--     DROP COLUMN IF EXISTS reasoning,
--     DROP COLUMN IF EXISTS expires_at;
--
-- Safe at any point before a writer exists, which is the whole window this
-- migration is designed to sit in.
--
-- ── VERIFY ──────────────────────────────────────────────────────────────────
--
--   \d+ agent_mutations
--   -- both columns nullable, no default:
--   select column_name, is_nullable, column_default
--     from information_schema.columns
--    where table_name = 'agent_mutations'
--      and column_name in ('reasoning','expires_at');
--   -- the governance read, and it should use the partial index:
--   explain analyze
--   select id, mutation_kind, expires_at from agent_mutations
--    where organization_id = :org
--      and status in ('proposed','under_review')
--      and expires_at < now();

BEGIN;

ALTER TABLE agent_mutations
  ADD COLUMN IF NOT EXISTS reasoning  TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- THE GOVERNANCE READ, exactly: this org's still-pending proposals, oldest
-- expiry first. Partial, because a proposal that is already applied, rejected
-- or reverted can never expire — and the pending set is a rounding error
-- against the ledger's lifetime volume, which is what keeps this index small.
CREATE INDEX IF NOT EXISTS idx_agent_mutations_org_pending_expiry
  ON agent_mutations (organization_id, expires_at, id)
  WHERE status IN ('proposed', 'under_review') AND expires_at IS NOT NULL;

COMMENT ON COLUMN agent_mutations.reasoning IS
  'The agent''s stated rationale at proposal time, in its own words. NULL = none recorded, which is honest for every pre-2026-08-23f row and correct by construction for actor_kind=''operator''. A real column, not an extra_audit key, so "which high-risk actions have no recorded reasoning" is IS NULL rather than a jsonb probe that cannot tell absent from never-written. Structured multi-step traces belong in payload.';

COMMENT ON COLUMN agent_mutations.expires_at IS
  'When this approval request stops being valid. NULL = no expiry (the correct reading for every existing row, and for kinds meant to queue indefinitely) — never "expired". There is deliberately no ''expired'' status: expiry is a function of the clock, derived as status IN (''proposed'',''under_review'') AND expires_at < now(), so it cannot go stale between sweeps.';

COMMIT;
