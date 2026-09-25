-- 2026-09-25d_support_interactions.sql
-- "The record remembers the call" (docs/todo/support-call-desk-PLAN.md, Phase 2).
--
-- support_interactions       one customer contact: WHEN it happened, on which
--                            channel, who took it, what the customer reported
--                            (issue_code / issue_text) and what was done
--                            (outcome). A Nextiva call row (`call_events`) is
--                            optional context, never required: a walk-in or an
--                            unmatched call still gets a record.
-- support_interaction_links  what the contact is ABOUT, many per contact:
--                              ORDER     orders.id
--                              SHIPMENT  shipping_tracking_numbers.id
--                              LABEL     shipping_label_purchases.id
--                              TICKET    support_tickets.id
--                            Polymorphic like ticket_links (no FK on entity_id);
--                            labels stay in shipping_label_purchases and tickets
--                            in support_tickets / ticket_links — this table only
--                            points at them. `role` says why (e.g. 'return',
--                            'replacement' on a LABEL).
--
-- Idempotency: a retried "Log call" carries the same client_event_id; the
-- partial UNIQUE (organization_id, client_event_id) collapses it to one row.
-- A link is unique per (org, interaction, entity_type, entity_id).
--
-- Tenant-from-birth: organization_id NOT NULL, every key leads with it, and
-- enforce_tenant_isolation() installs the loud-fail GUC default + FORCE RLS +
-- the canonical policy. Safe now: the only writer (src/lib/support/interactions.ts)
-- runs inside withTenantTransaction AND stamps organization_id explicitly.
--
-- ROLLBACK:
--   select relax_tenant_isolation('support_interaction_links');
--   select relax_tenant_isolation('support_interactions');
--   DROP TABLE IF EXISTS support_interaction_links;
--   DROP TABLE IF EXISTS support_interactions;
--
-- VERIFY: npm run tenancy:coverage → both tables org_id NOT NULL, RLS + FORCE.

CREATE TABLE IF NOT EXISTS support_interactions (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  channel         TEXT NOT NULL,
  call_event_id   BIGINT REFERENCES call_events(id) ON DELETE SET NULL,
  staff_id        INTEGER REFERENCES staff(id) ON DELETE SET NULL,
  customer_id     INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  issue_code      TEXT,
  issue_text      TEXT,
  outcome         TEXT,
  client_event_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT support_interactions_channel_check
    CHECK (channel IN ('call', 'voicemail', 'email', 'chat', 'walk_in'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_support_interactions_org_client_event
  ON support_interactions (organization_id, client_event_id)
  WHERE client_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_support_interactions_org_occurred
  ON support_interactions (organization_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_interactions_org_call_event
  ON support_interactions (organization_id, call_event_id)
  WHERE call_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_support_interactions_org_customer
  ON support_interactions (organization_id, customer_id)
  WHERE customer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS support_interaction_links (
  id              BIGSERIAL PRIMARY KEY,
  organization_id UUID NOT NULL,
  interaction_id  BIGINT NOT NULL REFERENCES support_interactions(id) ON DELETE CASCADE,
  entity_type     TEXT NOT NULL,
  entity_id       BIGINT NOT NULL,
  role            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT support_interaction_links_entity_type_check
    CHECK (entity_type IN ('ORDER', 'SHIPMENT', 'LABEL', 'TICKET')),
  CONSTRAINT support_interaction_links_org_unique
    UNIQUE (organization_id, interaction_id, entity_type, entity_id)
);

-- "Every contact about this order / label / ticket" — the History read.
CREATE INDEX IF NOT EXISTS idx_support_interaction_links_org_entity
  ON support_interaction_links (organization_id, entity_type, entity_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('support_interactions');
    PERFORM enforce_tenant_isolation('support_interaction_links');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — support_interactions / support_interaction_links left without FORCE RLS';
  END IF;
END $$;
