import 'server-only';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { PRINT_STATION_FNSKU_ROW_CAP, type PrintStationFnskuRow, type PrintStationFnskuView } from './fnsku';

interface FnskuSqlRow {
  fnsku: string;
  product_title: string | null;
  asin: string | null;
  sku: string | null;
  condition: string | null;
  print_jobs: number | null;
  copies_printed: number | null;
  last_printed_at: Date | string | null;
  last_copies: number | null;
  last_printed_by: string | null;
  total: number;
}

const iso = (value: Date | string | null): string | null => (value == null ? null : new Date(value).toISOString());

/**
 * The org's FBA catalog for the Print station. `query` matches FNSKU, ASIN, SKU
 * or title (an FNSKU prefix ranks first); without one, the most recently
 * reprinted FNSKUs lead, then the most recently seen. `reprinted` keeps only
 * FNSKUs with a logged reprint. `total` counts every match.
 */
export async function listPrintStationFnskus(
  organizationId: OrgId,
  { query, view }: { query: string | null; view: PrintStationFnskuView },
): Promise<{ rows: PrintStationFnskuRow[]; total: number }> {
  const q = query?.trim() || null;
  const { rows } = await tenantQuery<FnskuSqlRow>(
    organizationId,
    `WITH prints AS (
       SELECT upper(qr_payload) AS fnsku, COUNT(*)::int AS print_jobs, COALESCE(SUM(copies), 0)::int AS copies_printed, MAX(created_at) AS last_printed_at
         FROM label_print_jobs
        WHERE organization_id = $1 AND template_id = 'fba_fnsku'
        GROUP BY upper(qr_payload)
     ), last_job AS (
       SELECT DISTINCT ON (upper(j.qr_payload)) upper(j.qr_payload) AS fnsku, j.copies::int AS last_copies, s.name AS last_printed_by
         FROM label_print_jobs j
         LEFT JOIN staff s ON s.organization_id = j.organization_id AND s.id = j.actor_staff_id
        WHERE j.organization_id = $1 AND j.template_id = 'fba_fnsku'
        ORDER BY upper(j.qr_payload), j.created_at DESC, j.id DESC
     )
     SELECT f.fnsku, f.product_title, f.asin, f.sku, f.condition,
            p.print_jobs, p.copies_printed, p.last_printed_at, l.last_copies, l.last_printed_by,
            COUNT(*) OVER ()::int AS total
       FROM fba_fnskus f
       LEFT JOIN prints p ON p.fnsku = upper(f.fnsku)
       LEFT JOIN last_job l ON l.fnsku = upper(f.fnsku)
      WHERE f.organization_id = $1
        AND ($2::text IS NULL OR f.fnsku ILIKE $2 OR f.asin ILIKE $2 OR f.sku ILIKE $2 OR f.product_title ILIKE $2)
        AND (NOT $5::boolean OR p.print_jobs > 0)
      ORDER BY CASE WHEN $3::text IS NOT NULL AND f.fnsku ILIKE $3 THEN 0 ELSE 1 END,
               p.last_printed_at DESC NULLS LAST,
               f.last_seen_at DESC NULLS LAST,
               f.fnsku
      LIMIT $4`,
    [organizationId, q ? `%${q}%` : null, q ? `${q}%` : null, PRINT_STATION_FNSKU_ROW_CAP, view === 'reprinted'],
  );
  return {
    total: rows[0]?.total ?? 0,
    rows: rows.map((row) => ({
      fnsku: row.fnsku.trim().toUpperCase(),
      title: row.product_title?.trim() || null,
      asin: row.asin?.trim() || null,
      sku: row.sku?.trim() || null,
      condition: row.condition?.trim() || null,
      printJobs: row.print_jobs ?? 0,
      copiesPrinted: row.copies_printed ?? 0,
      lastPrintedAt: iso(row.last_printed_at),
      lastCopies: row.last_copies,
      lastPrintedBy: row.last_printed_by,
    })),
  };
}
