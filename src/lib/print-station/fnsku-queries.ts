import 'server-only';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import {
  PRINT_STATION_FNSKU_ROW_CAP,
  printStationConditionMissingOnly,
  printStationConditionWords,
  type PrintStationFnskuRow,
  type PrintStationFnskuView,
} from './fnsku';

interface FnskuSqlRow {
  fnsku: string;
  product_title: string | null;
  asin: string | null;
  sku: string | null;
  condition: string | null;
  label_mark: string | null;
}

/**
 * The org's FBA catalog for the Print station. `query` matches FNSKU, ASIN, SKU
 * or title (an FNSKU prefix ranks first); without one, the most recently
 * reprinted FNSKUs lead, then the most recently seen. `reprinted` keeps only
 * FNSKUs with a logged reprint.
 */
export async function listPrintStationFnskus(
  organizationId: OrgId,
  { query, view, condition }: { query: string | null; view: PrintStationFnskuView; condition?: string | null },
): Promise<{ rows: PrintStationFnskuRow[] }> {
  const q = query?.trim() || null;
  const conditionWords = printStationConditionWords(condition);
  const missingOnly = printStationConditionMissingOnly(condition);
  const { rows } = await tenantQuery<FnskuSqlRow>(
    organizationId,
    `WITH prints AS (
       SELECT upper(qr_payload) AS fnsku, MAX(created_at) AS last_printed_at
         FROM label_print_jobs
        WHERE organization_id = $1 AND template_id = 'fba_fnsku'
        GROUP BY upper(qr_payload)
     )
     SELECT f.fnsku, f.product_title, f.asin, f.sku, f.condition, f.label_mark
       FROM fba_fnskus f
       LEFT JOIN prints p ON p.fnsku = upper(f.fnsku)
      WHERE f.organization_id = $1
        AND ($2::text IS NULL OR f.fnsku ILIKE $2 OR f.asin ILIKE $2 OR f.sku ILIKE $2 OR f.product_title ILIKE $2)
        AND (NOT $5::boolean OR p.fnsku IS NOT NULL)
        AND (
          CASE
            WHEN $7::boolean THEN btrim(coalesce(f.condition, '')) = ''
            ELSE $6::text IS NULL
              OR lower(regexp_replace(btrim(coalesce(f.condition, '')), '^[A-C]\\+?\\s+', '')) = $6
          END
        )
      ORDER BY CASE WHEN $3::text IS NOT NULL AND f.fnsku ILIKE $3 THEN 0 ELSE 1 END,
               p.last_printed_at DESC NULLS LAST,
               f.last_seen_at DESC NULLS LAST,
               f.fnsku
      LIMIT $4`,
    [organizationId, q ? `%${q}%` : null, q ? `${q}%` : null, PRINT_STATION_FNSKU_ROW_CAP, view === 'reprinted', conditionWords, missingOnly],
  );
  return {
    rows: rows.map((row) => ({
      fnsku: row.fnsku.trim().toUpperCase(),
      title: row.product_title?.trim() || null,
      asin: row.asin?.trim() || null,
      sku: row.sku?.trim() || null,
      condition: row.condition?.trim() || null,
      mark: row.label_mark?.trim() || null,
    })),
  };
}
