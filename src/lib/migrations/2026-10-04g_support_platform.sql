-- ============================================================================
-- 2026-10-04g_support_platform.sql
--
-- Platform becomes first-class on the Support item (owner 2026-10-04: "It must
-- have first class platform … add your own platform if it's a different
-- platform that's not on the platform list").
--
--   support_tickets.platform_id → platforms.id   WHERE the customer bought /
--                                                 wrote (the org's catalog,
--                                                 org-created rows included).
--   support_tickets.provider                     stays the TRANSPORT (how a
--                                                 reply can be carried), derived
--                                                 from the platform when it has
--                                                 one (ebay / amazon / ecwid).
--
-- Backfill only where the answer is unambiguous, in this order:
--   1. the item's platform_account_id → its platform;
--   2. a marketplace transport (ebay / amazon / ecwid) → the org platform with
--      that slug;
--   3. the primary order's account_source → exactly ONE platform whose slug or
--      label equals it, or whose account (slug or label) equals it.
-- Everything else stays NULL (Zendesk mirrors without an order, internal
-- records, pasted items).
-- ============================================================================

ALTER TABLE support_tickets
  ADD COLUMN IF NOT EXISTS platform_id BIGINT REFERENCES platforms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_support_tickets_platform
  ON support_tickets (organization_id, platform_id)
  WHERE platform_id IS NOT NULL;

-- 1. The account names its platform.
UPDATE support_tickets st
   SET platform_id = pa.platform_id
  FROM platform_accounts pa
 WHERE st.platform_id IS NULL
   AND st.platform_account_id IS NOT NULL
   AND pa.organization_id = st.organization_id
   AND pa.id = st.platform_account_id;

-- 2. A marketplace transport names its platform.
UPDATE support_tickets st
   SET platform_id = p.id
  FROM platforms p
 WHERE st.platform_id IS NULL
   AND st.provider IN ('ebay', 'amazon', 'ecwid')
   AND p.organization_id = st.organization_id
   AND p.slug = st.provider;

-- 3. The primary order's account_source, only when exactly one platform answers.
WITH candidates AS (
  SELECT st.id AS support_id, p.id AS platform_id
    FROM support_tickets st
    JOIN orders o
      ON o.organization_id = st.organization_id
     AND o.id = st.primary_order_id
    JOIN platforms p
      ON p.organization_id = st.organization_id
   WHERE st.platform_id IS NULL
     AND NULLIF(BTRIM(o.account_source), '') IS NOT NULL
     AND (
          LOWER(p.slug) = LOWER(BTRIM(o.account_source))
       OR LOWER(p.label) = LOWER(BTRIM(o.account_source))
       OR EXISTS (
            SELECT 1
              FROM platform_accounts pa
             WHERE pa.organization_id = p.organization_id
               AND pa.platform_id = p.id
               AND (LOWER(pa.slug) = LOWER(BTRIM(o.account_source))
                 OR LOWER(pa.label) = LOWER(BTRIM(o.account_source))))
     )
   GROUP BY st.id, p.id
),
unique_candidates AS (
  SELECT support_id, MIN(platform_id) AS platform_id
    FROM candidates
   GROUP BY support_id
  HAVING COUNT(*) = 1
)
UPDATE support_tickets st
   SET platform_id = uc.platform_id
  FROM unique_candidates uc
 WHERE st.id = uc.support_id
   AND st.platform_id IS NULL;
