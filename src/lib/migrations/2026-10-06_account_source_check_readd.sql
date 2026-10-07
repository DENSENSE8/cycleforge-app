-- 2026-10-06_account_source_check_readd.sql
-- Re-add orders_account_source_canonical_chk (operator 2026-10-06: apply now).
--
-- Every orders.account_source is canonical (lower-case, trimmed, single-spaced)
-- — measured 0 non-canonical rows before apply. Writers in this repo store
-- canonicalAccountSource() (src/lib/orders/account-source.ts).
--
-- RISK (accepted by the operator): a deployed build older than commit
-- de5ba71eb writes a store-linked account as its catalog slug (MEKONG / USAV /
-- DRAGON); those inserts fail until the canonical writers deploy.
--
-- ROLLBACK: ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_account_source_canonical_chk;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_account_source_canonical_chk') THEN
    ALTER TABLE orders ADD CONSTRAINT orders_account_source_canonical_chk
      CHECK (account_source IS NULL OR account_source = lower(regexp_replace(btrim(account_source), '\s+', ' ', 'g')))
      NOT VALID;
    ALTER TABLE orders VALIDATE CONSTRAINT orders_account_source_canonical_chk;
  END IF;
END $$;
