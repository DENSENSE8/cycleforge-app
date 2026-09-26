/** unit-id.ts ──────────────────────────────────────────────────────────────────── Generator for the per-unit identifier printed under the… */

import { queryOne } from '@/lib/neon-client';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { shortSku, isoWeekParts, parseUnitId, formatUnitId } from '@/lib/inventory/unit-id-format';

export { parseUnitId };

/** Allocate the next unit sequence for (sku_catalog_id, calendar_year) via the fn_next_unit_seq SQL function (Phase 0 migration). */
export async function allocateNextUnitId(
  skuCatalogId: number,
  skuText: string,
  yearOverride?: number,
  orgId?: OrgId,
): Promise<{
  unitId: string;
  seq: number;
  year: number;
  isoYear: number;
  isoWeek: number;
  skuShort: string;
}> {
  const now = new Date();
  const year = yearOverride ?? now.getUTCFullYear();
  const { isoYear, isoWeek } = isoWeekParts(now);
  const skuShortValue = shortSku(skuText);
  if (!skuShortValue) {
    throw new Error(`allocateNextUnitId: SKU "${skuText}" produced empty short form`);
  }

  const row = orgId
    ? (
        await tenantQuery<{ seq: number }>(
          orgId,
          'SELECT fn_next_unit_seq($1, $2) AS seq',
          [skuCatalogId, year],
        )
      ).rows[0] ?? null
    : await queryOne<{ seq: number }>`
        SELECT fn_next_unit_seq(${skuCatalogId}, ${year}) AS seq
      `;
  const seq = Number(row?.seq);
  if (!Number.isFinite(seq) || seq < 1) {
    throw new Error(`allocateNextUnitId: fn_next_unit_seq returned ${row?.seq}`);
  }

  return {
    unitId: formatUnitId(skuShortValue, isoYear, isoWeek, seq),
    seq,
    year,
    isoYear,
    isoWeek,
    skuShort: skuShortValue,
  };
}

/** Non-committing preview of the next unit id for (sku_catalog_id, calendar year) via fn_peek_unit_seq — does NOT advance the sequence. */
export async function peekNextUnitId(
  skuCatalogId: number,
  skuText: string,
  yearOverride?: number,
  orgId?: OrgId,
): Promise<{
  unitId: string;
  seq: number;
  year: number;
  isoYear: number;
  isoWeek: number;
  skuShort: string;
}> {
  const now = new Date();
  const year = yearOverride ?? now.getUTCFullYear();
  const { isoYear, isoWeek } = isoWeekParts(now);
  const skuShortValue = shortSku(skuText);
  if (!skuShortValue) {
    throw new Error(`peekNextUnitId: SKU "${skuText}" produced empty short form`);
  }

  const row = orgId
    ? (
        await tenantQuery<{ seq: number }>(
          orgId,
          'SELECT fn_peek_unit_seq($1, $2) AS seq',
          [skuCatalogId, year],
        )
      ).rows[0] ?? null
    : await queryOne<{ seq: number }>`
        SELECT fn_peek_unit_seq(${skuCatalogId}, ${year}) AS seq
      `;
  const seq = Number(row?.seq);
  if (!Number.isFinite(seq) || seq < 1) {
    throw new Error(`peekNextUnitId: fn_peek_unit_seq returned ${row?.seq}`);
  }

  return {
    unitId: formatUnitId(skuShortValue, isoYear, isoWeek, seq),
    seq,
    year,
    isoYear,
    isoWeek,
    skuShort: skuShortValue,
  };
}
