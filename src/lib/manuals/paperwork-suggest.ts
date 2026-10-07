import 'server-only';

/**
 * Library documents an order line most likely ships with — the docs popover's
 * "Suggested from the library" (operator 2026-10-06: suggestions first, then
 * search, then upload). Library names are written for people ("Radio Only
 * 03773 — Manual Wave Radio IV"), not as listing titles, so a substring search
 * of the listing title finds nothing; this ranks instead:
 *
 *   1. the line's own keys — its SKU, its catalog SKU, its item number, a
 *      part number in its title — on the manual's SKU / item # / name
 *   2. title similarity (pg_trgm) of the manual's name to the listing title
 */

import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { titlePartNumbers } from '@/lib/orders/line-sku-suggest-contracts';
import type { PaperworkSuggestion } from './paperwork-suggest-contracts';

const LIMIT = 3;
const MIN_SIMILARITY = 0.15;

export async function suggestLinePaperwork(orgId: OrgId, lineId: number): Promise<PaperworkSuggestion[] | null> {
  const line = await tenantQuery<{ title: string; keys: string[] }>(
    orgId,
    `SELECT COALESCE(NULLIF(BTRIM(o.product_title), ''), '') AS title,
            ARRAY_REMOVE(ARRAY[UPPER(NULLIF(BTRIM(o.sku), '')), UPPER(NULLIF(BTRIM(sc.sku), '')), UPPER(NULLIF(BTRIM(o.item_number), ''))], NULL) AS keys
       FROM orders o
       LEFT JOIN sku_catalog sc ON sc.organization_id = o.organization_id AND sc.id = o.sku_catalog_id
      WHERE o.organization_id = $1 AND o.id = $2`,
    [orgId, lineId],
  );
  const facts = line.rows[0];
  if (!facts) return null;
  const keys = [...new Set([...facts.keys, ...titlePartNumbers(facts.title)])];

  const { rows } = await tenantQuery<{ id: number; name: string; type: string | null; key: string | null; sim: number }>(
    orgId,
    `WITH m AS (
       SELECT pm.id, COALESCE(NULLIF(pm.display_name, ''), NULLIF(pm.product_title, ''), 'Manual #' || pm.id) AS name, pm.type,
              (SELECT k FROM unnest($3::text[]) k
                WHERE UPPER(COALESCE(pm.sku, '')) = k OR UPPER(COALESCE(pm.item_number, '')) = k
                   OR UPPER(COALESCE(pm.display_name, '') || ' ' || COALESCE(pm.product_title, '')) LIKE '%' || k || '%'
                LIMIT 1) AS key,
              similarity(LOWER(COALESCE(pm.display_name, '') || ' ' || COALESCE(pm.product_title, '')), LOWER($2)) AS sim
         FROM product_manuals pm
        WHERE pm.organization_id = $1 AND pm.is_active = TRUE AND COALESCE(pm.status, '') <> 'archived'
     )
     SELECT * FROM m WHERE key IS NOT NULL OR ($2 <> '' AND sim >= $4)
      ORDER BY (key IS NOT NULL) DESC, sim DESC, id DESC
      LIMIT $5`,
    [orgId, facts.title, keys, MIN_SIMILARITY, LIMIT],
  );
  return rows.map((row) => ({
    manualId: Number(row.id),
    name: row.name,
    type: row.type,
    why: row.key ? `matches ${row.key}` : `name ${Math.round(Number(row.sim) * 100)}% alike`,
  }));
}
