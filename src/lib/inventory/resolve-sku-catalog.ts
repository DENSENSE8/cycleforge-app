import { queryOne } from '@/lib/neon-client';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { queuePendingSku } from '@/lib/inventory/pending-skus';
import { skuColorVariant, type SkuColorVariant } from '@/lib/inventory/sku-variant';
import { skuCatalogNoZohoTwinPredicateSql } from '@/lib/sku/sku-identity-law';

/** Rule 4 of the SKU identity law, for the unaliased `sku_catalog` reads below. */
const NO_ZOHO_TWIN_SQL = skuCatalogNoZohoTwinPredicateSql('sku_catalog');

export interface ResolvedSkuCatalog {
  id: number;
  sku: string;
  product_title: string;
  gtin: string | null;
}

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
 * Defaults wire the real catalog lookup + the pending-skus queue.
 */
export interface ResolveSkuCatalogDeps {
  /** The base catalog lookup (explicit id → exact → leading-zero → crosswalk). */
  lookup: (
    skuInput: string,
    explicitId: number | null | undefined,
    orgId?: OrgId,
  ) => Promise<ResolvedSkuCatalog | null>;
  /** Best-effort enqueue of an unresolved SKU (the "create in Zoho" to-do). */
  queue: (rawSku: string, orgId?: OrgId) => Promise<void>;
}

const defaultDeps: ResolveSkuCatalogDeps = {
  lookup: lookupSkuCatalogRow,
  queue: async (rawSku) => {
    // Best-effort: a queue failure must never break a label/print/scan flow.
    try {
      await queuePendingSku({ rawSku, source: 'scan' });
    } catch (err) {
      console.warn('resolveSkuCatalogRow: queuePendingSku failed (non-fatal)', err);
    }
  },
};

/** Resolve a sku_catalog row for a label/unit operation. */
export async function resolveSkuCatalogRow(
  skuInput: string,
  explicitId?: number | null,
  orgId?: OrgId,
  deps: ResolveSkuCatalogDeps = defaultDeps,
): Promise<ResolvedSkuCatalog | null> {
  // 1–4. Existing resolution chain (behavior unchanged).
  const direct = await deps.lookup(skuInput, explicitId, orgId);
  if (direct) return direct;

  const trimmed = String(skuInput ?? '').trim();
  const hasExplicitId =
    explicitId != null && Number.isFinite(explicitId) && explicitId > 0;

  // 5. Guarded variant-suffix strip — only when resolving by SKU string (an
  //    explicit id short-circuits the base chain, so we don't second-guess it).
  if (!hasExplicitId) {
    const base = strippableVariantBase(trimmed);
    if (base) {
      const stripped = await deps.lookup(base, null, orgId);
      if (stripped) return stripped;
    }
  }

  // 6. Queue-on-miss (never guess; route the unresolved SKU to the to-do queue).
  if (trimmed) await deps.queue(trimmed, orgId);
  return null;
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

/**
 * The base catalog lookup (steps 1–4). Extracted verbatim from the original
 * `resolveSkuCatalogRow` body so behavior — including the explicit-id
 * short-circuit and org scoping — is byte-for-byte preserved.
 */
async function lookupSkuCatalogRow(
  skuInput: string,
  explicitId?: number | null,
  orgId?: OrgId,
): Promise<ResolvedSkuCatalog | null> {
  if (explicitId != null && Number.isFinite(explicitId) && explicitId > 0) {
    if (orgId) {
      const { rows } = await tenantQuery<ResolvedSkuCatalog>(
        orgId,
        `SELECT id, sku, product_title, gtin FROM sku_catalog
          WHERE id = $1 AND organization_id = $2 LIMIT 1`,
        [Math.floor(explicitId), orgId],
      );
      return rows[0] ?? null;
    }
    return await queryOne<ResolvedSkuCatalog>`
      SELECT id, sku, product_title, gtin FROM sku_catalog WHERE id = ${Math.floor(explicitId)} LIMIT 1`;
  }

  const trimmed = String(skuInput ?? '').trim();
  if (!trimmed) return null;

  // SKU IDENTITY LAW (src/lib/sku/sku-identity-law.ts):
  if (orgId) {
    const { rows } = await tenantQuery<ResolvedSkuCatalog>(
      orgId,
      `SELECT id, sku, product_title, gtin FROM sku_catalog
        WHERE organization_id = $2
          AND (
            UPPER(TRIM(sku)) = UPPER(TRIM($1))
            OR (
              regexp_replace(UPPER(TRIM(sku)), '^0+', '') = regexp_replace(UPPER(TRIM($1)), '^0+', '')
              AND ${NO_ZOHO_TWIN_SQL}
            )
          )
        ORDER BY (UPPER(TRIM(sku)) = UPPER(TRIM($1))) DESC
        LIMIT 1`,
      [trimmed, orgId],
    );
    if (rows[0]) return rows[0];

    // Platform-sku crosswalk fallback (org-scoped on both junction + catalog).
    const { rows: xrows } = await tenantQuery<ResolvedSkuCatalog>(
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
      [trimmed, orgId],
    );
    return xrows[0] ?? null;
  }

  const row = await queryOne<ResolvedSkuCatalog>`
    SELECT id, sku, product_title, gtin FROM sku_catalog
     WHERE UPPER(TRIM(sku)) = UPPER(TRIM(${trimmed}))
        OR (
          regexp_replace(UPPER(TRIM(sku)), '^0+', '') = regexp_replace(UPPER(TRIM(${trimmed})), '^0+', '')
          AND NOT EXISTS (SELECT 1 FROM items i
                           WHERE i.sku = sku_catalog.sku
                             AND i.organization_id = sku_catalog.organization_id
                             AND i.status = 'active')
        )
     ORDER BY (UPPER(TRIM(sku)) = UPPER(TRIM(${trimmed}))) DESC
     LIMIT 1`;
  if (row) return row;

  // Platform-sku crosswalk fallback.
  return await queryOne<ResolvedSkuCatalog>`
    SELECT sc.id, sc.sku, sc.product_title, sc.gtin
      FROM sku_platform_ids sp
      JOIN sku_catalog sc ON sc.id = sp.sku_catalog_id
     WHERE sp.is_active = true
       AND (
         UPPER(TRIM(sp.platform_sku)) = UPPER(TRIM(${trimmed}))
         OR regexp_replace(UPPER(TRIM(COALESCE(sp.platform_sku,''))), '^0+', '') = regexp_replace(UPPER(TRIM(${trimmed})), '^0+', '')
       )
     LIMIT 1`;
}
