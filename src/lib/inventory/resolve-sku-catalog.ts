import { queryOne, queryRaw } from '@/lib/neon-client';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { queuePendingSku } from '@/lib/inventory/pending-skus';
import { skuColorVariant, type SkuColorVariant } from '@/lib/inventory/sku-variant';

export interface ResolvedSkuCatalog {
  id: number;
  sku: string;
  product_title: string;
  gtin: string | null;
}

/**
 * Canonical SKU key match for label/unit resolution — PostgreSQL
 * `fn_normalize_sku` (src/lib/migrations/2026-06-06b_pending_skus.sql): trim,
 * upper, left-pad a short leading numeric base to 5, every suffix kept. So
 * `89-P-1` ≡ `00089-P-1` and `1103:B95` ≡ `01103:B95`, but `189-P-1` is
 * `00189-P-1` and a `-P-N` part never meets its parent. Every exact
 * `UPPER(TRIM(sku))` hit shares the key, so this one predicate (indexed on
 * `(organization_id, fn_normalize_sku(sku))`) finds both; the exact flag ranks
 * them. `$1` is the SKU input. Record surfaces stay exact (`SKU_CATALOG_JOIN_ON_SQL`).
 */
export const SKU_CANONICAL_KEY_MATCH_SQL = 'fn_normalize_sku(sku) = fn_normalize_sku($1)';
export const SKU_EXACT_MATCH_FLAG_SQL = '(UPPER(TRIM(sku)) = UPPER(TRIM($1)))';

export type SkuCatalogMatch<T> =
  | { kind: 'match'; row: T }
  | { kind: 'ambiguous'; skus: string[] }
  | { kind: 'none' };

/**
 * Decide a canonical-key query's rows (ordered exact first, `LIMIT 2`). An
 * exact hit wins; otherwise exactly one padding twin wins; two or more is
 * ambiguous — `036` against `00036` (Guitar Hero III) and `36` (a marker
 * pack) names no product, so nothing is picked.
 */
export function pickSkuCatalogMatch<T extends { sku: string; exact: boolean }>(
  rows: readonly T[],
): SkuCatalogMatch<T> {
  if (rows.length === 0) return { kind: 'none' };
  const exact = rows.find((r) => r.exact);
  if (exact) return { kind: 'match', row: exact };
  if (rows.length === 1) return { kind: 'match', row: rows[0] };
  return { kind: 'ambiguous', skus: rows.map((r) => r.sku) };
}

type SkuCatalogCandidate = ResolvedSkuCatalog & { exact: boolean };

/**
 * A resolved catalog row PLUS the optional COLOR variant decoded from the input
 * SKU string (sku-reconciliation plan, Step B — color axis). Additive: the
 * resolution itself is unchanged; this just attaches a read-only variant view.
 */
interface ResolvedSkuCatalogWithColor extends ResolvedSkuCatalog {
  /** Decoded color variant (`-B` → Black) or null when no confirmed color. */
  colorVariant: SkuColorVariant | null;
}

/** Guarded variant-suffix strip (sku-reconciliation plan §6, step 4). */
const VARIANT_COUNTER_SUFFIX = /^[0-9]{4,}-[0-9]+$/;
const PROTECTED_PART_INDEX = /^[0-9]+-P-[0-9]+$/i;

export function strippableVariantBase(input: string): string | null {
  const s = String(input ?? '').trim();
  if (!s) return null;
  // Never collapse a protected -P-N part index, even defensively.
  if (PROTECTED_PART_INDEX.test(s)) return null;
  if (!VARIANT_COUNTER_SUFFIX.test(s)) return null;
  const base = s.replace(/-[0-9]+$/, '');
  return base && base !== s ? base : null;
}

/**
 * Injectable collaborators so the guard logic is unit-testable DB-free.
 * Defaults wire the real catalog reads + the pending-skus queue.
 */
export interface ResolveSkuCatalogDeps {
  /** Explicit catalog id (org-scoped when an org is given). */
  byId: (id: number, orgId?: OrgId) => Promise<ResolvedSkuCatalog | null>;
  /** Up to two catalog rows sharing the SKU's canonical key, exact first. */
  candidates: (sku: string, orgId?: OrgId) => Promise<SkuCatalogCandidate[]>;
  /** Platform-sku crosswalk (`sku_platform_ids`). */
  crosswalk: (sku: string, orgId?: OrgId) => Promise<ResolvedSkuCatalog | null>;
  /** Best-effort enqueue of an unresolved SKU (the "create in Zoho" to-do). */
  queue: (rawSku: string, orgId?: OrgId) => Promise<void>;
}

const defaultDeps: ResolveSkuCatalogDeps = {
  byId: catalogRowById,
  candidates: catalogCandidates,
  crosswalk: crosswalkRow,
  queue: async (rawSku) => {
    // Best-effort: a queue failure must never break a label/print/scan flow.
    try {
      await queuePendingSku({ rawSku, source: 'scan' });
    } catch (err) {
      console.warn('resolveSkuCatalogRow: queuePendingSku failed (non-fatal)', err);
    }
  },
};

/**
 * Resolve a sku_catalog row for a label/unit operation:
 *   1. explicit catalog id short-circuits;
 *   2. canonical key — exact first, else the one padding twin;
 *   3. platform crosswalk;
 *   4. guarded variant-counter strip (`00010-2` → `00010`, never `-P-N`);
 *   5. queue-on-miss.
 * An ambiguous key resolves to null and is NOT queued: the products exist,
 * the input just fails to name one of them.
 */
export async function resolveSkuCatalogRow(
  skuInput: string,
  explicitId?: number | null,
  orgId?: OrgId,
  deps: ResolveSkuCatalogDeps = defaultDeps,
): Promise<ResolvedSkuCatalog | null> {
  const trimmed = String(skuInput ?? '').trim();

  if (explicitId != null && Number.isFinite(explicitId) && explicitId > 0) {
    const byId = await deps.byId(Math.floor(explicitId), orgId);
    if (byId) return byId;
  } else if (trimmed) {
    const direct = await matchBySku(trimmed, orgId, deps);
    if (direct.kind === 'match') return direct.row;
    if (direct.kind === 'ambiguous') return ambiguous(trimmed, direct.skus);

    const base = strippableVariantBase(trimmed);
    if (base) {
      const stripped = await matchBySku(base, orgId, deps);
      if (stripped.kind === 'match') return stripped.row;
      if (stripped.kind === 'ambiguous') return ambiguous(trimmed, stripped.skus);
    }
  }

  if (trimmed) await deps.queue(trimmed, orgId);
  return null;
}

function ambiguous(input: string, skus: readonly string[]): null {
  console.warn(`resolveSkuCatalogRow: "${input}" matches several catalog SKUs (${skus.join(', ')}); not guessing`);
  return null;
}

async function matchBySku(
  sku: string,
  orgId: OrgId | undefined,
  deps: ResolveSkuCatalogDeps,
): Promise<SkuCatalogMatch<ResolvedSkuCatalog>> {
  const picked = pickSkuCatalogMatch(await deps.candidates(sku, orgId));
  if (picked.kind === 'match') {
    const { id, sku: rowSku, product_title, gtin } = picked.row;
    return { kind: 'match', row: { id, sku: rowSku, product_title, gtin } };
  }
  if (picked.kind === 'ambiguous') return picked;
  const crosswalked = await deps.crosswalk(sku, orgId);
  return crosswalked ? { kind: 'match', row: crosswalked } : { kind: 'none' };
}

/** Additive variant-aware resolver (sku-reconciliation plan, Step B — color axis). */
export async function resolveSkuCatalogRowWithColor(
  skuInput: string,
  explicitId?: number | null,
  orgId?: OrgId,
  deps: ResolveSkuCatalogDeps = defaultDeps,
): Promise<ResolvedSkuCatalogWithColor | null> {
  const resolved = await resolveSkuCatalogRow(skuInput, explicitId, orgId, deps);
  if (!resolved) return null;
  return { ...resolved, colorVariant: skuColorVariant(skuInput) };
}

async function catalogRowById(id: number, orgId?: OrgId): Promise<ResolvedSkuCatalog | null> {
  if (orgId) {
    const { rows } = await tenantQuery<ResolvedSkuCatalog>(
      orgId,
      `SELECT id, sku, product_title, gtin FROM sku_catalog
        WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [id, orgId],
    );
    return rows[0] ?? null;
  }
  return await queryOne<ResolvedSkuCatalog>`
    SELECT id, sku, product_title, gtin FROM sku_catalog WHERE id = ${id} LIMIT 1`;
}

async function catalogCandidates(sku: string, orgId?: OrgId): Promise<SkuCatalogCandidate[]> {
  const select = `SELECT id, sku, product_title, gtin, ${SKU_EXACT_MATCH_FLAG_SQL} AS exact FROM sku_catalog`;
  const order = 'ORDER BY exact DESC, id LIMIT 2';
  if (orgId) {
    const { rows } = await tenantQuery<SkuCatalogCandidate>(
      orgId,
      `${select} WHERE organization_id = $2 AND ${SKU_CANONICAL_KEY_MATCH_SQL} ${order}`,
      [sku, orgId],
    );
    return rows;
  }
  return await queryRaw<SkuCatalogCandidate>(`${select} WHERE ${SKU_CANONICAL_KEY_MATCH_SQL} ${order}`, [sku]);
}

async function crosswalkRow(sku: string, orgId?: OrgId): Promise<ResolvedSkuCatalog | null> {
  if (orgId) {
    // Org-scoped on both junction + catalog.
    const { rows } = await tenantQuery<ResolvedSkuCatalog>(
      orgId,
      `SELECT sc.id, sc.sku, sc.product_title, sc.gtin
         FROM sku_platform_ids sp
         JOIN sku_catalog sc
           ON sc.id = sp.sku_catalog_id
          AND sc.organization_id = sp.organization_id
        WHERE sp.is_active = true
          AND sp.organization_id = $2
          AND (
            UPPER(TRIM(sp.platform_sku)) = UPPER(TRIM($1))
            OR regexp_replace(UPPER(TRIM(COALESCE(sp.platform_sku,''))), '^0+', '') = regexp_replace(UPPER(TRIM($1)), '^0+', '')
          )
        LIMIT 1`,
      [sku, orgId],
    );
    return rows[0] ?? null;
  }
  return await queryOne<ResolvedSkuCatalog>`
    SELECT sc.id, sc.sku, sc.product_title, sc.gtin
      FROM sku_platform_ids sp
      JOIN sku_catalog sc ON sc.id = sp.sku_catalog_id
     WHERE sp.is_active = true
       AND (
         UPPER(TRIM(sp.platform_sku)) = UPPER(TRIM(${sku}))
         OR regexp_replace(UPPER(TRIM(COALESCE(sp.platform_sku,''))), '^0+', '') = regexp_replace(UPPER(TRIM(${sku})), '^0+', '')
       )
     LIMIT 1`;
}
