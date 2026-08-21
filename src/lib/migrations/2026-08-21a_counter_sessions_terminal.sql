-- 2026-08-21a_counter_sessions_terminal.sql
--
-- Card-present payment state on the counter session (SQ2).
--
-- Plan: docs/todo/counter-square-enterprise-PLAN.md
--
-- WHY THIS LIVES ON THE SESSION, NOT ONLY ON counter_transactions.
-- "Present your card" is something BOTH screens must show at the same moment —
-- the operator's desk and the customer's tablet — and the session is the only
-- row both of them already subscribe to. The transaction header records what
-- was ultimately paid; the session records what is happening right now. Putting
-- the live state on the header would mean the tablet subscribing to a financial
-- record to learn when to say "insert card".
--
-- The kiosk store has carried `awaitingCardSinceMs` client-side since v2 with
-- nothing driving it. This is what drives it.
--
-- STATES. idle → awaiting_card → approved | declined | canceled.
--   idle          nothing asked of the customer
--   awaiting_card a Terminal checkout is live; both faces show the prompt
--   approved      the Terminal captured a payment (settlement still arrives via
--                 the payment webhook — see SQ1; this is the DEVICE's answer,
--                 not the money's)
--   declined      the card was refused; the cart is intact and can retry
--   canceled      staff or the customer backed out at the Terminal
--
-- `approved` is deliberately NOT `paid`. A Terminal approval and a settled
-- payment are two different facts arriving on two different webhooks, and
-- collapsing them would let a visit read as paid before Square says it is.
-- `counter_transactions.status` remains the money's answer (SQ1).
--
-- SQUARE SPELLS IT "CANCELED". One L, their vocabulary — kept verbatim so the
-- webhook's status maps across without a translation table nobody remembers.
--
-- terminal_checkout_id is the join key for the inbound `terminal.checkout.updated`
-- webhook, which knows the checkout and nothing else. Indexed per-org for it.
--
-- TENANCY: both columns land on an already tenant-isolated table
-- (2026-08-20a installed FORCE RLS + the canonical policy), so nothing further
-- is needed here — an ADD COLUMN inherits the table's policy.
--
-- EXPAND-FIRST: nullable/defaulted adds, landing before any reader.
--
-- ROLLBACK:
--   alter table counter_sessions drop column if exists payment_state;
--   alter table counter_sessions drop column if exists terminal_checkout_id;
--   alter table counter_sessions drop column if exists awaiting_card_since;
--
-- VERIFY:
--   \d+ counter_sessions

BEGIN;

ALTER TABLE counter_sessions
  ADD COLUMN IF NOT EXISTS payment_state        TEXT NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS terminal_checkout_id TEXT,
  ADD COLUMN IF NOT EXISTS awaiting_card_since  TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE counter_sessions ADD CONSTRAINT counter_sessions_payment_state_chk
    CHECK (payment_state IN ('idle', 'awaiting_card', 'approved', 'declined', 'canceled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The webhook arrives knowing only the checkout id.
CREATE INDEX IF NOT EXISTS idx_counter_sessions_terminal_checkout
  ON counter_sessions (organization_id, terminal_checkout_id)
  WHERE terminal_checkout_id IS NOT NULL;

COMMIT;
