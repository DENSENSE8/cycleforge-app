-- 2026-10-06_account_source_check_until_deploy.sql
-- Drop orders_account_source_canonical_chk (added by
-- 2026-10-06_account_source_canonical.sql) until the canonical writers deploy.
--
-- Why: the `.env` DSN is the PRIMARY Neon branch, which the deployed app also
-- writes. The deployed (pre-canonical) ShipStation connector writes a bound
-- store's account as its catalog slug verbatim (`MEKONG`, `USAV`, `DRAGON`),
-- which the CHECK refuses — every ShipStation import batch holding such an
-- order would fail until the new code ships. The backfilled data stays
-- canonical; the deployed connector's matching is case-insensitive through the
-- catalog, so it adopts the existing lower-case rows instead of duplicating them.
--
-- After the deploy: re-run the spelling UPDATE of
-- 2026-10-06_account_source_canonical.sql (idempotent) and re-add the CHECK in a
-- new migration.
--
-- ROLLBACK: re-add the constraint (see 2026-10-06_account_source_canonical.sql step 4).

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_account_source_canonical_chk;
