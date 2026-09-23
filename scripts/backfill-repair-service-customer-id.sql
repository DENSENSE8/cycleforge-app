-- ============================================================================
-- backfill-repair-service-customer-id.sql
--
-- Backfill historical repair_service.customer_id from identity the tenant
-- ALREADY holds locally. The forward leaks are closed in code:
--   • /api/ecwid/sync-exception-tracking now passes orgId, so the `contact` it
--     computes actually reaches attachRepairCustomer (it was being discarded);
--   • /api/receiving/add-unmatched-line now fetches the Ecwid buyer instead of
--     passing contactInfo: null;
--   • the Ecwid order mapper now emits `buyer`, so orders.customer_id resolves.
-- This script is for the rows those fixes cannot reach retroactively.
--
-- This is a STANDALONE OWNER-RUN SCRIPT, NOT a migration. No DDL, no constraint
-- changes — pure DATA. Idempotent and re-run-safe: every UPDATE is gated on
-- `customer_id IS NULL`, so a second run touches 0 rows, and the trailing
-- SELECT only reads.
--
-- ── NEVER MINTS A CUSTOMER ──────────────────────────────────────────────────
--   Every pass LINKS to a customers row that already exists. Minting belongs to
--   resolveProviderCustomerId / resolveBuyerCustomers at write time, which know
--   the full buyer record; a SQL pass knows only a fragment, and a row minted
--   from a fragment is a row nothing can ever match again.
--
-- ── NEVER MATCHES ON A BARE NAME ────────────────────────────────────────────
--   Ruled in docs/todo/kiosk-counter-transaction/04-unified-route.md: a name
--   match merges two different "John Smith"s, which at a counter is a
--   stranger's repair history on the wrong person. Phone and email only.
--
-- ── THE PHONE KEY ───────────────────────────────────────────────────────────
--   NANP last ten, spelled EXACTLY as idx_customers_phone_last10 indexes it and
--   as src/lib/orders/resolve-buyer-customers.ts (last10Sql) and
--   src/lib/voice/normalize-phone.ts spell it. A different spelling is a silent
--   miss AND a seq scan.
--
-- ── RUN ORDER ───────────────────────────────────────────────────────────────
--   Run AFTER a wide-window Ecwid sync (so orders.customer_id is populated and
--   Pass 1 has something to inherit). Passes 2 and 3 are useful immediately.
--
--   set -a; . ./.env; set +a
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/backfill-repair-service-customer-id.sql
-- ============================================================================

BEGIN;

-- ── Pass 1: inherit the linked ORDER's buyer ────────────────────────────────
-- The highest-confidence arm: the repair names its source order, and the order
-- now carries a buyer resolved by the canonical ingest (channel id → email →
-- phone). Provider-id-grade identity, no string matching at all.
UPDATE repair_service rs
   SET customer_id = o.customer_id,
       updated_at  = NOW()
  FROM orders o
 WHERE rs.customer_id IS NULL
   AND o.customer_id IS NOT NULL
   AND o.organization_id = rs.organization_id
   AND COALESCE(rs.source_order_id, '') <> ''
   AND o.order_id = rs.source_order_id
   AND o.account_source = rs.source_system;

-- ── Pass 2: match the legacy contact string's PHONE ─────────────────────────
-- `contact_info` is the pre-customers intake string. Read POSITION-FREE — the
-- writer joins `[name, phone, email].filter(Boolean)`, so slot 2 is the phone
-- only when a phone exists. Take the first segment that is not an email and
-- carries at least 7 digits, exactly as src/lib/repair/contact-info.ts does.
UPDATE repair_service rs
   SET customer_id = c.id,
       updated_at  = NOW()
  FROM customers c
 WHERE rs.customer_id IS NULL
   AND c.organization_id = rs.organization_id
   AND EXISTS (
     SELECT 1
       FROM unnest(string_to_array(COALESCE(rs.contact_info, ''), ',')) AS part
      WHERE POSITION('@' IN part) = 0
        AND length(regexp_replace(part, '\D', '', 'g')) >= 10
        AND (
          right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 10)
            = right(regexp_replace(part, '\D', '', 'g'), 10)
          OR right(regexp_replace(coalesce(c.mobile, ''), '\D', '', 'g'), 10)
            = right(regexp_replace(part, '\D', '', 'g'), 10)
        )
   );

-- ── Pass 3: match the legacy contact string's EMAIL ─────────────────────────
-- Lower-cased exact, the same tier resolveProviderCustomerId uses. The email is
-- whichever segment contains an `@` — never an index.
UPDATE repair_service rs
   SET customer_id = c.id,
       updated_at  = NOW()
  FROM customers c
 WHERE rs.customer_id IS NULL
   AND c.organization_id = rs.organization_id
   AND COALESCE(c.email, '') <> ''
   AND EXISTS (
     SELECT 1
       FROM unnest(string_to_array(COALESCE(rs.contact_info, ''), ',')) AS part
      WHERE POSITION('@' IN part) > 0
        AND lower(btrim(part)) = lower(c.email)
   );

COMMIT;

-- ── Verification ────────────────────────────────────────────────────────────
-- `unlinked` is REPORTED, not assumed zero: a repair whose buyer left neither a
-- phone nor an email has no resolvable identity and must stay NULL rather than
-- be given a stranger's.
SELECT count(*)                                            AS total,
       count(customer_id)                                  AS linked,
       count(*) FILTER (WHERE customer_id IS NULL)         AS unlinked,
       count(*) FILTER (WHERE customer_id IS NULL
                          AND COALESCE(contact_info, '') = '') AS unlinked_no_contact
  FROM repair_service;
