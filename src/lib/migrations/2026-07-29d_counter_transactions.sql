-- ============================================================================
-- 2026-07-29d — counter_transactions (the join model) + ticket_work_outbox
--
-- Birth migration for the counter-visit header, per
-- docs/todo/kiosk-counter-transaction-PLAN.md §3, and the helpdesk outbox that
-- stops a Zendesk outage from silently losing tickets
-- (submit-repair-intake.ts wraps its ticket call in a log-and-continue catch,
-- which produces a repair with ticket_number = NULL and no retry surface).
--
-- FILENAME NOTE: the parallel index assigned phase 03 `2026-07-29c`, but that
-- suffix was already taken on main by 2026-07-29c_receiving_line_unit.sql (and
-- `-29b` is taken TWICE). Renamed to `-29d` — migrations apply in filename sort
-- order, so a duplicated suffix makes ordering ambiguous.
--
-- WHY TWO RECORDS, NOT ONE ORDER (plan D1): a counter visit joins a
-- square_transactions receipt (a financial snapshot) to a repair_service work
-- record (a long-lived state machine — 5-business-day SLA, work assignment,
-- tech verdicts, a signed agreement). Overloading one financial line with a
-- 10-day hardware lifecycle fights transition().
--
-- Verified against the live DB before writing (FK target PK types):
--   customers.id       integer   → customer_id INTEGER
--   support_tickets.id bigint    → support_ticket_id BIGINT
--   kiosk_devices.id   bigint    (applied — resolves plan §7's open item)
--   repair_service.id  integer, square_transactions.id uuid  (both get a
--                                BIGINT child column pointing back at us)
--
-- Contract: .claude/rules/polymorphic-tables.md — named CHECK discriminator,
-- org-led indexes, organization_id UUID NOT NULL with NO default,
-- enforce_tenant_isolation() in this same migration, Drizzle model same PR.
--
-- Idempotent (IF NOT EXISTS / guarded DO-blocks) and roll-forward only.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS counter_transactions (
  id                 BIGSERIAL PRIMARY KEY,
  organization_id    UUID NOT NULL,                 -- NO default; enforce_tenant_isolation installs it
  customer_id        INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  -- The `via` principal, for audit. Deliberately NOT a foreign key: kiosk
  -- devices get revoked (/api/kiosk/revoke), and an ON DELETE SET NULL would
  -- erase which device took the money — the one fact an audit column exists to
  -- keep. Attribution must outlive the device.
  kiosk_device_id    BIGINT,
  prior_order_ref    TEXT,                          -- resolved public order number, nullable
  support_ticket_id  BIGINT REFERENCES support_tickets(id) ON DELETE SET NULL,
  -- The STAGED provider order id, recorded at stage time.
  --
  -- NOT in the parent plan's §3 DDL — added because §3 has no way to correlate a
  -- staged order back to this header. The kiosk stages an order and never
  -- charges; the square_transactions row is created LATER by the payment webhook,
  -- which knows only the provider order id. Without this column that webhook
  -- cannot find the header, so square_transactions.counter_transaction_id could
  -- never be filled and a paid visit would never reconcile.
  --
  -- A real column, not jsonb: it is a queryable business fact and the join key
  -- for reconciliation (.claude/rules/polymorphic-tables.md).
  staged_square_order_id TEXT,
  subtotal_cents     INTEGER NOT NULL DEFAULT 0,
  total_cents        INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'staged',
  client_event_id    UUID,                          -- idempotency anchor for the WHOLE transaction
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE counter_transactions ADD CONSTRAINT counter_transactions_status_chk
    CHECK (status IN ('staged','paid','partially_paid','abandoned','voided'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Idempotency: one header per (org, client_event_id). The kiosk already mints a
-- safeRandomUUID() per submission and re-sends it on retry, so a replayed submit
-- must not double-charge, double-ticket, or double-repair. House precedent is
-- UNIQUE(client_event_id) on inventory_events; org-led here per the polymorphic
-- contract. Partial, so rows without a key are still insertable.
CREATE UNIQUE INDEX IF NOT EXISTS ux_counter_transactions_client_event
  ON counter_transactions (organization_id, client_event_id)
  WHERE client_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_counter_transactions_org_created
  ON counter_transactions (organization_id, created_at DESC);

-- Reconciliation lookup: the payment webhook arrives knowing only the provider
-- order id and has to find this header. Unique per org so two headers can never
-- claim one staged order.
CREATE UNIQUE INDEX IF NOT EXISTS ux_counter_transactions_staged_order
  ON counter_transactions (organization_id, staged_square_order_id)
  WHERE staged_square_order_id IS NOT NULL;

-- Child links back to the header. ON DELETE SET NULL, never CASCADE: a signed
-- intake agreement must survive deletion of its transaction header. Deleting a
-- header must never delete the legal record of what the customer signed.
ALTER TABLE repair_service
  ADD COLUMN IF NOT EXISTS counter_transaction_id BIGINT
    REFERENCES counter_transactions(id) ON DELETE SET NULL;
ALTER TABLE square_transactions
  ADD COLUMN IF NOT EXISTS counter_transaction_id BIGINT
    REFERENCES counter_transactions(id) ON DELETE SET NULL;

-- Reverse lookups (header → its child records) are org-led like everything else.
CREATE INDEX IF NOT EXISTS idx_repair_service_counter_transaction
  ON repair_service (organization_id, counter_transaction_id)
  WHERE counter_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_square_transactions_counter_transaction
  ON square_transactions (organization_id, counter_transaction_id)
  WHERE counter_transaction_id IS NOT NULL;

-- ── Helpdesk work outbox ────────────────────────────────────────────────────
--
-- Shape follows entity_search_outbox (2026-07-03d) and its worker: claim with
-- FOR UPDATE SKIP LOCKED, count attempts, dead-letter past a cap, release stale
-- claims for crash recovery. Not a message bus, not a new service.
--
-- Why an outbox at all: not blocking the counter on a helpdesk outage is
-- correct; having NO compensating mechanism is not. Today a Zendesk failure
-- during intake leaves a repair with ticket_number = NULL, no retry, and no
-- reconciliation surface.

CREATE TABLE IF NOT EXISTS ticket_work_outbox (
  id                     BIGSERIAL PRIMARY KEY,
  organization_id        UUID NOT NULL,             -- NO default; enforce_tenant_isolation installs it
  work_type              TEXT NOT NULL,             -- named CHECK below
  -- What the work is about. entity_type mirrors ticket_links' vocabulary so the
  -- outbox and the link table speak one language.
  entity_type            TEXT NOT NULL,
  entity_id              BIGINT NOT NULL,
  counter_transaction_id BIGINT REFERENCES counter_transactions(id) ON DELETE SET NULL,
  -- Provider ticket id for an ATTACH / REPLY; NULL for a CREATE (that is what
  -- the work is going to produce).
  provider_ticket_id     BIGINT,
  -- Variant config only: the create-ticket field bag or the reply body. Queryable
  -- business facts are real columns above, per the polymorphic contract.
  payload                JSONB NOT NULL DEFAULT '{}'::jsonb,
  enqueued_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts               INTEGER NOT NULL DEFAULT 0,
  last_error             TEXT,
  claimed_at             TIMESTAMPTZ,
  processed_at           TIMESTAMPTZ
);

DO $$ BEGIN
  ALTER TABLE ticket_work_outbox ADD CONSTRAINT ticket_work_outbox_work_type_chk
    CHECK (work_type IN ('CREATE_TICKET','ATTACH_TICKET','POST_REPLY'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ticket_work_outbox ADD CONSTRAINT ticket_work_outbox_entity_type_chk
    CHECK (entity_type IN ('REPAIR','RECEIVING','RECEIVING_LINE','SHIPMENT','ORDER'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A REPLY/ATTACH needs a provider ticket to act on; a CREATE must not carry one.
DO $$ BEGIN
  ALTER TABLE ticket_work_outbox ADD CONSTRAINT ticket_work_outbox_provider_ticket_chk
    CHECK (
      (work_type = 'CREATE_TICKET' AND provider_ticket_id IS NULL)
      OR (work_type <> 'CREATE_TICKET' AND provider_ticket_id IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Dedupe: at most ONE unclaimed pending row per (org, work, entity, provider
-- ticket). Claimed rows fall out of the partial index, so a write DURING a drain
-- enqueues a FRESH row instead of being deduped against the in-flight snapshot.
-- COALESCE on provider_ticket_id because NULLs never collide in a unique index,
-- which would let duplicate CREATE_TICKET rows through.
CREATE UNIQUE INDEX IF NOT EXISTS ux_ticket_work_outbox_pending
  ON ticket_work_outbox (
    organization_id, work_type, entity_type, entity_id,
    COALESCE(provider_ticket_id, -1)
  )
  WHERE processed_at IS NULL AND claimed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_work_outbox_pending
  ON ticket_work_outbox (id)
  WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_work_outbox_processed
  ON ticket_work_outbox (processed_at);

-- ── Tenant-from-birth ───────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('counter_transactions');
    PERFORM enforce_tenant_isolation('ticket_work_outbox');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — counter_transactions / ticket_work_outbox left without FORCE RLS';
  END IF;
END $$;

COMMIT;
