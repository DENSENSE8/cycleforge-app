-- 2026-08-22c_tool_forge.sql
--
-- The self-evolving tool pipeline: a staff member asks for a capability, the
-- request is triaged against the tools that already exist, and only a request
-- that survives triage is allowed to become code.
--
-- THREE TABLES, because they answer three different questions:
--   tool_registry     — WHAT capabilities this org already has (the corpus the
--                       dedupe search embeds and matches against)
--   build_requests    — WHO asked for WHAT, and where that request now stands
--   approval_reviews  — WHY each decision was made (append-only ledger)
--
-- ─── THE RULE THIS MIGRATION EXISTS TO ENFORCE ──────────────────────────────
-- "A request whose prompt semantically matches an existing tool above the
-- duplicate threshold is DENIED, and the model may not overrule that."
--
-- That rule is written HERE, in Postgres, and not only in TypeScript —
-- deliberately. A threshold that lives in a tool's return value is a
-- suggestion: the model reads it and decides what to do about it. Two CHECK
-- constraints make the same rule an outcome the model cannot argue with,
-- because they reject the INSERT itself:
--
--   build_requests_duplicate_is_denied
--     a request row that names a duplicate_tool_id MUST have status='denied'.
--     So "found a duplicate but approved it anyway" is not a bad decision the
--     reviewer has to catch later — it is an unwritable row.
--
--   approval_reviews_duplicate_must_deny
--     a review whose reason_code is 'duplicate_tool' MUST carry
--     decision='denied' AND a non-null duplicate_tool_id. So the denial can
--     never be logged without the pointer the operator needs to follow, and
--     the reason can never be recycled onto an approval.
--
-- The TypeScript half (src/lib/tool-forge/triage.ts) computes the decision;
-- this half guarantees no other code path — an agent tool, a hand-written
-- route, a psql session, a future refactor — can record a contradictory one.
-- Two doors for one rule.
--
-- ─── WHY similarity IS NULLABLE, AND WHY NULL MEANS "DENY" ──────────────────
-- similarity NUMERIC(6,5) holds the measured cosine, NOT a rank score. NULL
-- means the dedupe search could not be measured at all (embedding provider
-- down, timeout, empty corpus). It does NOT mean zero.
--
-- This distinction is the whole safety property. The repo's hybridSearch
-- deliberately degrades to keyword-only when embedText throws — correct for a
-- search box, catastrophic for a gate: every duplicate request would sail
-- through approval for the duration of any provider blip. So the reason-code
-- vocabulary carries 'could_not_measure' as a DENIAL reason, and the triage
-- helper fails closed onto it. Absence of a measurement is not a measurement
-- of absence.
--
-- ─── WHY NO OUTBOX (unlike entity_search_docs) ──────────────────────────────
-- entity_search_docs needs a trigger→outbox→worker pipeline because its
-- parents (orders, receiving, …) are written thousands of times a day by sync
-- jobs that must not block on an embedding call. tool_registry is written when
-- a capability is created or retired — a handful of rows per org, ever. The
-- writer embeds inline and stores embedded_at; a NULL embedding means "not yet
-- embedded", which the triage path treats as unmeasurable (deny), never as
-- "no match" (approve). Adding an outbox here would be machinery guarding a
-- write that happens monthly.
--
-- ─── VOCABULARY ────────────────────────────────────────────────────────────
-- Both status sets are small, stable lifecycles → named CHECKs, per
-- docs/rules/polymorphic-tables.md. A CHECK is REDEFINED with the full union
-- when the vocabulary grows; it is never appended to.
--
-- TENANCY: tenant-from-birth. organization_id UUID NOT NULL with no DEFAULT in
-- the raw DDL; enforce_tenant_isolation() installs the loud-fail GUC default,
-- FORCE RLS and the canonical policy. Safe immediately — all three tables have
-- zero existing writers, and every writer lands behind
-- withTenantTransaction(orgId, …) with an explicit organization_id predicate.
-- Note the org NEVER comes from a model-supplied argument: the MCP tools take
-- it from the authenticated ctx (src/lib/assistant/tools/index.ts).
--
-- ROLLBACK:
--   select relax_tenant_isolation('approval_reviews');
--   select relax_tenant_isolation('build_requests');
--   select relax_tenant_isolation('tool_registry');
--   drop table if exists approval_reviews;
--   drop table if exists build_requests;
--   drop table if exists tool_registry;
--
-- VERIFY:
--   \d+ tool_registry
--   \d+ build_requests
--   \d+ approval_reviews
--   -- the law, proven from psql (both must ERROR):
--   insert into build_requests (organization_id, target_scope, prompt, status, duplicate_tool_id)
--     values ('<org>', '/triage', 'x', 'approved', 1);
--   insert into approval_reviews (organization_id, build_request_id, decision, reason_code, exact_reason)
--     values ('<org>', 1, 'approved', 'duplicate_tool', 'x');
--   npm run tenancy:coverage

BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── tool_registry: the corpus a new request is deduped against ─────────────
CREATE TABLE IF NOT EXISTS tool_registry (
  id                  BIGSERIAL PRIMARY KEY,
  organization_id     UUID NOT NULL,        -- NO default; enforce_tenant_isolation() installs it
  -- Stable machine name (matches AssistantToolDef.name when the tool is a
  -- registered assistant tool). Org-led unique so two tenants may both own a
  -- tool called 'lookup_serial' without colliding.
  tool_key            TEXT NOT NULL,
  name                TEXT NOT NULL,
  -- THE MATCH TEXT. This is what gets embedded and what a new request's prompt
  -- is compared against, so it must read like a description of a capability
  -- ("look up a serial number and return its unit history"), not like an
  -- implementation note. Kept separate from `name` so renaming a tool does not
  -- silently change what it matches.
  description         TEXT NOT NULL,
  -- Where the tool's code lives, so a denial can deep-link the requester to
  -- the thing that already does this. NULL for capabilities registered before
  -- their source path is known.
  source_path         TEXT,
  status              TEXT NOT NULL DEFAULT 'active',   -- named CHECK below
  -- 768 dims — the entity_search_docs space (openai/text-embedding-3-small @
  -- 768 prod, nomic-embed-text dev), NOT the 1536-dim rag_document_chunks
  -- space. Two disjoint vector spaces exist in this repo; mixing them silently
  -- returns garbage similarities rather than erroring.
  embedding           vector(768),
  embedded_at         TIMESTAMPTZ,
  created_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tool_registry_org_key_unique UNIQUE (organization_id, tool_key)
);

DO $$ BEGIN
  ALTER TABLE tool_registry ADD CONSTRAINT tool_registry_status_chk
    CHECK (status IN ('active','deprecated','retired'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE tool_registry IS
  'The capabilities an org already has. Its description column is the corpus a new build_request is semantically deduped against (src/lib/tool-forge/dedupe.ts). Written by registerTool; embedded inline (no outbox — writes are rare).';

-- Dedupe scan: only 'active' rows are candidates, org-led.
CREATE INDEX IF NOT EXISTS idx_tool_registry_org_status
  ON tool_registry (organization_id, status);

-- Semantic arm: HNSW cosine, same operator class as entity_search_docs.
-- NULL embeddings are simply absent from the index — and the triage path
-- refuses rather than approving when the corpus is unembedded.
CREATE INDEX IF NOT EXISTS idx_tool_registry_embedding_hnsw
  ON tool_registry USING hnsw (embedding vector_cosine_ops);

-- Keyword fallback for the operator-facing registry browser (NOT for the gate
-- — a trigram score is not a similarity and must never feed the threshold).
CREATE INDEX IF NOT EXISTS idx_tool_registry_description_trgm
  ON tool_registry USING gin (lower(description) gin_trgm_ops);

-- ─── build_requests: one staff ask, and where it stands ─────────────────────
CREATE TABLE IF NOT EXISTS build_requests (
  id                    BIGSERIAL PRIMARY KEY,
  organization_id       UUID NOT NULL,      -- NO default; enforce_tenant_isolation() installs it
  requested_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  -- The panel's scope combo box: which surface the capability is for.
  target_scope          TEXT NOT NULL,
  prompt                TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending_triage',  -- named CHECK below
  -- ─ triage outcome, denormalized so the denial card is one read ─
  -- The tool this request duplicates. Its presence FORCES status='denied'
  -- (see build_requests_duplicate_is_denied) — this column is the pointer the
  -- panel deep-links to.
  duplicate_tool_id     BIGINT REFERENCES tool_registry(id) ON DELETE SET NULL,
  -- Operator-facing sentence explaining the outcome. Populated for denials AND
  -- approvals so the panel never has to render "denied" with no reason.
  exact_reason          TEXT,
  -- The MEASURED cosine in [0,1]. NULL = could not measure (see header) and is
  -- never interchangeable with 0.
  similarity            NUMERIC(6,5),
  -- Double-submit protection for the panel's optimistic insert.
  idempotency_key       TEXT,
  -- The generated file manifest, once a build has produced one.
  code_payload          JSONB,
  branch_name           TEXT,
  -- Wherever the change went to be reviewed (issue / PR url).
  external_ref          TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT build_requests_prompt_len CHECK (char_length(prompt) BETWEEN 1 AND 4000),
  CONSTRAINT build_requests_similarity_range
    CHECK (similarity IS NULL OR (similarity >= 0 AND similarity <= 1))
);

DO $$ BEGIN
  ALTER TABLE build_requests ADD CONSTRAINT build_requests_status_chk
    CHECK (status IN (
      'pending_triage',   -- submitted, not yet triaged (the panel's optimistic row)
      'denied',           -- triage refused it; exact_reason is populated
      'approved',         -- triage cleared it; may proceed to build
      'building',         -- sandbox validation in flight
      'build_failed',     -- sandbox rejected the generated code
      'committed',        -- change handed to review (issue/PR filed)
      'deployed',         -- the deploy job reported success
      'failed'            -- anything else terminal
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══ THE LAW, DOOR TWO ═════════════════════════════════════════════════════
-- A request that names a duplicate CANNOT be in any state except denied.
-- This is what makes ">90% match is denied" non-bypassable: an agent that
-- decides to approve a duplicate anyway does not write a wrong row, it writes
-- no row.
DO $$ BEGIN
  ALTER TABLE build_requests ADD CONSTRAINT build_requests_duplicate_is_denied
    CHECK (duplicate_tool_id IS NULL OR status = 'denied');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A denial must always be able to explain itself to the operator.
DO $$ BEGIN
  ALTER TABLE build_requests ADD CONSTRAINT build_requests_denied_has_reason
    CHECK (status <> 'denied' OR exact_reason IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE build_requests IS
  'One staff request for a new capability, and its lifecycle. duplicate_tool_id is only writable on a denied row (build_requests_duplicate_is_denied) — the >90% dedupe rule enforced in Postgres, not only in src/lib/tool-forge/triage.ts.';

-- The panel's queue read: newest first within a status.
CREATE INDEX IF NOT EXISTS idx_build_requests_org_status_time
  ON build_requests (organization_id, status, created_at DESC, id DESC);

-- "What has this staffer asked for?"
CREATE INDEX IF NOT EXISTS idx_build_requests_org_requester
  ON build_requests (organization_id, requested_by_staff_id, created_at DESC);

-- Idempotent submit: org-led so two tenants' keys cannot collide (the flaw
-- called out in src/lib/api-idempotency.ts, not repeated here).
CREATE UNIQUE INDEX IF NOT EXISTS ux_build_requests_org_idempotency
  ON build_requests (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ─── approval_reviews: append-only decision ledger ──────────────────────────
CREATE TABLE IF NOT EXISTS approval_reviews (
  id                  BIGSERIAL PRIMARY KEY,
  organization_id     UUID NOT NULL,        -- NO default; enforce_tenant_isolation() installs it
  build_request_id    BIGINT NOT NULL REFERENCES build_requests(id) ON DELETE CASCADE,
  decision            TEXT NOT NULL,        -- named CHECK below
  reason_code         TEXT NOT NULL,        -- named CHECK below
  -- NOT NULL in BOTH directions. An approval with no stated reason is how a
  -- review queue becomes a rubber stamp.
  exact_reason        TEXT NOT NULL,
  duplicate_tool_id   BIGINT REFERENCES tool_registry(id) ON DELETE SET NULL,
  similarity          NUMERIC(6,5),
  -- WHO decided. 'system' = the deterministic threshold gate, 'agent' = a
  -- model-authored decision, 'human' = an operator. Kept distinct so a later
  -- audit can ask "how many of these did a model decide on its own?"
  decided_by          TEXT NOT NULL,        -- named CHECK below
  decided_by_staff_id INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  decided_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT approval_reviews_reason_len CHECK (char_length(exact_reason) BETWEEN 1 AND 2000),
  CONSTRAINT approval_reviews_similarity_range
    CHECK (similarity IS NULL OR (similarity >= 0 AND similarity <= 1))
);

DO $$ BEGIN
  ALTER TABLE approval_reviews ADD CONSTRAINT approval_reviews_decision_chk
    CHECK (decision IN ('approved','denied'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE approval_reviews ADD CONSTRAINT approval_reviews_reason_code_chk
    CHECK (reason_code IN (
      'duplicate_tool',       -- matched an existing tool above threshold (always denied)
      'could_not_measure',    -- dedupe could not run; fail closed (always denied)
      'out_of_scope',
      'unsafe',
      'insufficient_detail',
      'approved_novel',       -- cleared: nothing close enough in the registry
      'manual_override'       -- a human overrode; requires decided_by='human'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE approval_reviews ADD CONSTRAINT approval_reviews_decided_by_chk
    CHECK (decided_by IN ('system','agent','human'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ═══ THE LAW, DOOR TWO (ledger side) ═══════════════════════════════════════
-- 'duplicate_tool' can only ever be a DENIAL, and it must carry the pointer.
-- Without the second clause a denial could be logged with no duplicate_tool_id
-- and the panel's deep link would render as a dead end.
DO $$ BEGIN
  ALTER TABLE approval_reviews ADD CONSTRAINT approval_reviews_duplicate_must_deny
    CHECK (reason_code <> 'duplicate_tool' OR (decision = 'denied' AND duplicate_tool_id IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Fail-closed is a denial too — never an approval.
DO $$ BEGIN
  ALTER TABLE approval_reviews ADD CONSTRAINT approval_reviews_unmeasured_must_deny
    CHECK (reason_code <> 'could_not_measure' OR decision = 'denied');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Only a human may claim a manual override. A model asserting decided_by
-- 'human' is the bypass this whole table exists to make impossible.
DO $$ BEGIN
  ALTER TABLE approval_reviews ADD CONSTRAINT approval_reviews_override_is_human
    CHECK (reason_code <> 'manual_override' OR (decided_by = 'human' AND decided_by_staff_id IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE approval_reviews IS
  'Append-only triage ledger, one row per decision on a build_request. reason_code=duplicate_tool is structurally forced to be a denial carrying its duplicate pointer (approval_reviews_duplicate_must_deny); could_not_measure likewise (fail closed).';

-- The review queue / audit read.
CREATE INDEX IF NOT EXISTS idx_approval_reviews_org_request
  ON approval_reviews (organization_id, build_request_id, decided_at DESC);

CREATE INDEX IF NOT EXISTS idx_approval_reviews_org_decision_time
  ON approval_reviews (organization_id, decision, decided_at DESC);

-- ─── Tenant-from-birth: loud-fail GUC default + FORCE RLS + policy ──────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('tool_registry');
    PERFORM enforce_tenant_isolation('build_requests');
    PERFORM enforce_tenant_isolation('approval_reviews');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — tool_forge tables left without FORCE RLS';
  END IF;
END $$;

COMMIT;
