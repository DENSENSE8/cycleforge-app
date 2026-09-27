-- ============================================================================
-- 2026-09-27e: backfill inbound_order + receiving_line.(inbound_order_id,
--              line_key); swap the line identity index
-- ============================================================================
-- Two populations get a header:
--   1. every line with a PRIMARY inbound_purchase_order_links row
--      (eBay / Amazon / manual / linked Zoho) — identity = the link's
--      (source_type, source_order_id), line = source_line_item_id;
--   2. Zoho-synced lines that never got a link (the sync INSERTs the spine
--      directly) — identity = ('zoho', zoho_purchaseorder_id), line =
--      zoho_line_item_id, human number = zoho_purchaseorder_number.
-- Backfilled headers keep source_platform = 'none' so the old identity is
-- preserved exactly; new manual orders carry their platform.
--
-- Lines with no identity at all (unfound / door-added lines) stay
-- inbound_order_id NULL — they are physical arrivals, not ordered lines.
--
-- Line keys: the source line id, else L1; duplicates within one order (the
-- pre-fix desk path could merge, never split, so this is defensive) get #n.
--
-- Identity swap: ux_receiving_lines_inbound_identity keyed lines on
-- (org, inbound_source_type, source_order_id, line) — no platform, so two
-- platforms' order 1234 collided. It is replaced by
-- (org, inbound_order_id, line_key). Nothing ON CONFLICTs on the old index
-- (grep: only its own creating migration names it).
--
-- ROLLBACK:
--   CREATE UNIQUE INDEX ux_receiving_lines_inbound_identity ON receiving_line
--     (organization_id, inbound_source_type, source_order_id, COALESCE(source_line_item_id, ''))
--     WHERE inbound_source_type IS NOT NULL AND source_order_id IS NOT NULL;
--   DROP INDEX IF EXISTS ux_receiving_line_inbound_order_line;
--   UPDATE receiving_line SET inbound_order_id = NULL, line_key = NULL;
--   DELETE FROM inbound_order WHERE origin = 'backfill';
-- VERIFY: SELECT count(*) FROM receiving_line WHERE inbound_order_id IS NULL
--   AND (inbound_source_type IS NOT NULL OR EXISTS (SELECT 1 FROM receiving_line_zoho rz
--   WHERE rz.receiving_line_id = receiving_line.id AND rz.zoho_purchaseorder_id IS NOT NULL)); -- expect 0
-- ============================================================================

-- ── 1. Headers from primary purchase links ─────────────────────────────────
INSERT INTO inbound_order (
  organization_id, source_type, source_platform, external_order_id, external_order_id_norm,
  order_number, receiving_type, origin, status, platform_account_id, priority_tier, created_at, updated_at
)
SELECT DISTINCT ON (l.organization_id, l.source_type, inbound_order_number_norm(l.source_order_id))
       l.organization_id,
       l.source_type,
       'none',
       btrim(l.source_order_id),
       inbound_order_number_norm(l.source_order_id),
       COALESCE(NULLIF(btrim(rz.zoho_purchaseorder_number), ''), btrim(l.source_order_id)),
       CASE WHEN upper(rl.receiving_type) IN ('PO', 'RETURN', 'TRADE_IN', 'PICKUP', 'REPAIR')
            THEN upper(rl.receiving_type) ELSE 'PO' END,
       'backfill',
       'open',
       l.platform_account_id,
       CASE WHEN rc.priority_tier BETWEEN 0 AND 3 THEN rc.priority_tier END,
       rl.created_at,
       now()
  FROM inbound_purchase_order_links l
  JOIN receiving_line rl
    ON rl.id = l.receiving_line_id AND rl.organization_id = l.organization_id
  LEFT JOIN receiving_line_zoho rz
    ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
  LEFT JOIN receiving_carton rc
    ON rc.id = rl.receiving_id AND rc.organization_id = rl.organization_id
 WHERE l.is_primary
   AND l.source_type IN ('zoho', 'ebay', 'amazon', 'manual')
   AND inbound_order_number_norm(l.source_order_id) <> ''
 ORDER BY l.organization_id, l.source_type, inbound_order_number_norm(l.source_order_id), rl.id
ON CONFLICT (organization_id, source_type, source_platform, external_order_id_norm) DO NOTHING;

-- ── 2. Headers from unlinked Zoho-synced lines ─────────────────────────────
INSERT INTO inbound_order (
  organization_id, source_type, source_platform, external_order_id, external_order_id_norm,
  order_number, receiving_type, origin, status, created_at, updated_at
)
SELECT DISTINCT ON (rz.organization_id, inbound_order_number_norm(rz.zoho_purchaseorder_id))
       rz.organization_id,
       'zoho',
       'none',
       btrim(rz.zoho_purchaseorder_id),
       inbound_order_number_norm(rz.zoho_purchaseorder_id),
       NULLIF(btrim(rz.zoho_purchaseorder_number), ''),
       CASE WHEN upper(rl.receiving_type) IN ('PO', 'RETURN', 'TRADE_IN', 'PICKUP', 'REPAIR')
            THEN upper(rl.receiving_type) ELSE 'PO' END,
       'backfill',
       'open',
       rl.created_at,
       now()
  FROM receiving_line_zoho rz
  JOIN receiving_line rl
    ON rl.id = rz.receiving_line_id AND rl.organization_id = rz.organization_id
 WHERE inbound_order_number_norm(rz.zoho_purchaseorder_id) <> ''
   AND NOT EXISTS (
         SELECT 1 FROM inbound_purchase_order_links l
          WHERE l.organization_id = rl.organization_id AND l.receiving_line_id = rl.id AND l.is_primary)
 ORDER BY rz.organization_id, inbound_order_number_norm(rz.zoho_purchaseorder_id), rl.id
ON CONFLICT (organization_id, source_type, source_platform, external_order_id_norm) DO NOTHING;

-- ── 3. Attach lines + assign line keys ─────────────────────────────────────
WITH linked AS (
  SELECT rl.id AS line_id,
         io.id AS order_id,
         COALESCE(NULLIF(btrim(l.source_line_item_id), ''), 'L1') AS base_key
    FROM receiving_line rl
    JOIN inbound_purchase_order_links l
      ON l.receiving_line_id = rl.id AND l.organization_id = rl.organization_id AND l.is_primary
    JOIN inbound_order io
      ON io.organization_id = l.organization_id
     AND io.source_type = l.source_type
     AND io.source_platform = 'none'
     AND io.external_order_id_norm = inbound_order_number_norm(l.source_order_id)
   WHERE rl.inbound_order_id IS NULL
  UNION ALL
  SELECT rl.id,
         io.id,
         COALESCE(NULLIF(btrim(rz.zoho_line_item_id), ''), 'L1')
    FROM receiving_line rl
    JOIN receiving_line_zoho rz
      ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
    JOIN inbound_order io
      ON io.organization_id = rz.organization_id
     AND io.source_type = 'zoho'
     AND io.source_platform = 'none'
     AND io.external_order_id_norm = inbound_order_number_norm(rz.zoho_purchaseorder_id)
   WHERE rl.inbound_order_id IS NULL
     AND NOT EXISTS (
           SELECT 1 FROM inbound_purchase_order_links l
            WHERE l.organization_id = rl.organization_id AND l.receiving_line_id = rl.id AND l.is_primary)
),
keyed AS (
  SELECT line_id, order_id, base_key,
         row_number() OVER (PARTITION BY order_id, base_key ORDER BY line_id) AS n
    FROM linked
)
UPDATE receiving_line rl
   SET inbound_order_id = k.order_id,
       line_key = CASE WHEN k.n = 1 THEN k.base_key ELSE k.base_key || '#' || k.n END
  FROM keyed k
 WHERE rl.id = k.line_id;

-- ── 4. Typed line cost from the Zoho cluster ───────────────────────────────
UPDATE receiving_line rl
   SET unit_cost_cents = round(rz.unit_price * 100)::bigint,
       currency = COALESCE(rl.currency, 'USD')
  FROM receiving_line_zoho rz
 WHERE rz.receiving_line_id = rl.id
   AND rz.organization_id = rl.organization_id
   AND rz.unit_price IS NOT NULL
   AND rz.unit_price >= 0
   AND rl.unit_cost_cents IS NULL;

-- ── 5. Header status from its lines ────────────────────────────────────────
UPDATE inbound_order io
   SET status = CASE
         WHEN s.done = s.total THEN 'received'
         WHEN s.done > 0 OR s.any_received THEN 'partially_received'
         ELSE 'open'
       END
  FROM (
    SELECT inbound_order_id,
           count(*) AS total,
           count(*) FILTER (WHERE received_done_at IS NOT NULL) AS done,
           bool_or(COALESCE(quantity_received, 0) > 0) AS any_received
      FROM receiving_line
     WHERE inbound_order_id IS NOT NULL
     GROUP BY inbound_order_id
  ) s
 WHERE io.id = s.inbound_order_id
   AND io.origin = 'backfill';

-- ── 6. Identity swap ───────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS ux_receiving_line_inbound_order_line
  ON receiving_line (organization_id, inbound_order_id, line_key)
  WHERE inbound_order_id IS NOT NULL;

DROP INDEX IF EXISTS ux_receiving_lines_inbound_identity;
