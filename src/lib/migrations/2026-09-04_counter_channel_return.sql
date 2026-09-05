-- ============================================================================
-- 2026-09-04 — counter_transactions.channel_return / counter_sessions.channel_return
--
-- In-store channel exchange (docs/todo/counter-channel-exchange-PLAN.md §6):
-- a customer who bought on the online store walks in, returns that product,
-- and buys a replacement at the counter.
--
-- WHY JSONB AND NOT A TABLE (plan X3)
--   The channel return is visit METADATA, not a cart line. A fourth line type
--   in KIOSK_LINE_TYPES becomes a Square line — i.e. we would charge the
--   customer's card for the thing we are giving back — or a silent total bug.
--   A whole table is the other overshoot: there is at most one channel return
--   per visit and nothing joins to it.
--
-- SHAPE (validated in TS by ChannelReturnRecord in counter-transaction-types.ts,
-- not by a dozen columns):
--   { provider: 'ecwid',            -- discriminator; a later shopify maps in here
--     ecwidOrderId: string,         -- channel internal id
--     publicOrderNumber: string,    -- what the customer reads off their receipt
--     itemIds: string[],            -- returned line ids
--     amountCents: number,
--     reason: string,
--     status: 'none'|'pending'|'refunded'|'failed'|'manual_required',
--     refundIds?: string[],
--     error?: string,
--     updatedAt: string }           -- ISO
--
--   `'{}'` (the default) means NO channel return — a retail-only or repair
--   visit. That is why the column is NOT NULL DEFAULT '{}' rather than
--   nullable: "no return" is a real, readable state, and a receipt renderer
--   that has to distinguish NULL from {} from {status:'none'} has three ways
--   to spell one fact.
--
-- WHY THE SESSION CARRIES ONE TOO
--   The desk and the tablet share a draft the same way they already share
--   customer phone/name/email (2026-08-20a) — a column on counter_sessions,
--   mirrored onto the header at submit. Plan §6 offers a versioned
--   session event as the alternative and says PICK ONE; this is the column.
--
-- STATUS IS NEVER OPTIMISTIC
--   Nothing in this migration lets the product claim a card was refunded.
--   Whether a channel PUT actually returns money to the original tender is
--   unproven (plan §4, Slice 0) — until that is recorded, writers may only
--   reach 'pending' / 'manual_required', and the receipt must say so.
--
-- SAFETY
--   ADD COLUMN IF NOT EXISTS with a constant default — Postgres 11+ does this
--   without a table rewrite. No backfill: existing visits read as '{}',
--   which is exactly "no channel return".
--
-- TENANCY
--   Both tables are already org-scoped and already carry FORCE RLS from their
--   birth migrations (2026-07-29d, 2026-08-20a). enforce_tenant_isolation() is
--   re-asserted below because it is idempotent and because a column added
--   outside the birth migration is exactly where an isolation gap hides.
--
-- ROLLBACK
--   ALTER TABLE counter_transactions DROP COLUMN IF EXISTS channel_return;
--   ALTER TABLE counter_sessions     DROP COLUMN IF EXISTS channel_return;
-- ============================================================================

BEGIN;

ALTER TABLE counter_transactions
  ADD COLUMN IF NOT EXISTS channel_return jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE counter_sessions
  ADD COLUMN IF NOT EXISTS channel_return jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Reconciliation lookup: "which visits have an unfinished channel return?" is
-- the question a manual_required outbox item makes someone ask. Partial, so it
-- indexes only the visits that HAVE a return rather than every retail sale.
CREATE INDEX IF NOT EXISTS idx_counter_transactions_channel_return_status
  ON counter_transactions (organization_id, (channel_return ->> 'status'))
  WHERE channel_return <> '{}'::jsonb;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'enforce_tenant_isolation') THEN
    PERFORM enforce_tenant_isolation('counter_transactions');
    PERFORM enforce_tenant_isolation('counter_sessions');
  ELSE
    RAISE NOTICE 'enforce_tenant_isolation absent — counter_transactions / counter_sessions left as-is';
  END IF;
END $$;

COMMIT;
