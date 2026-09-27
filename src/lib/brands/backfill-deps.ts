/**
 * The real IO behind runBrandBackfill: one statement per load, one
 * authority-guarded batch UPDATE for the writes, and proposals through the
 * agent-mutation chokepoint (review class → status 'proposed', audited).
 */

import { applyAgentMutation } from '@/lib/assistant/mutations/apply-agent-mutation';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { BackfillSku, BrandAliasEntry, BrandBackfillDeps } from './backfill';
import type { BrandKind } from './normalize';
import { BRAND_REVIEW_KINDS, sqlBrandStore, type Queryable } from './store';

export const sqlBrandBackfillDeps: BrandBackfillDeps = {
  async loadAliases(orgId) {
    const { rows } = await tenantQuery<{
      normalized_alias: string;
      review_only: boolean;
      id: number;
      name: string;
      kind: BrandKind;
      root_id: number;
    }>(
      orgId,
      `SELECT a.normalized_alias, a.review_only, b.id, b.name, b.kind,
              COALESCE(p3.id, p2.id, p1.id, b.id) AS root_id
         FROM product_brand_aliases a
         JOIN product_brands b ON b.id = a.brand_id AND b.organization_id = a.organization_id
         LEFT JOIN product_brands p1 ON p1.id = b.parent_brand_id AND p1.organization_id = b.organization_id
         LEFT JOIN product_brands p2 ON p2.id = p1.parent_brand_id AND p2.organization_id = b.organization_id
         LEFT JOIN product_brands p3 ON p3.id = p2.parent_brand_id AND p3.organization_id = b.organization_id
        WHERE a.organization_id = $1 AND b.is_active = true`,
      [orgId],
    );
    return rows.map(
      (r): BrandAliasEntry => ({
        normalizedAlias: r.normalized_alias,
        brandId: Number(r.id),
        brandName: r.name,
        kind: r.kind,
        rootBrandId: Number(r.root_id),
        reviewOnly: r.review_only,
      }),
    );
  },

  async loadSkus(orgId) {
    const { rows } = await tenantQuery<{
      id: number;
      sku: string;
      is_active: boolean;
      product_title: string | null;
      brand_id: number | null;
      brand_confidence: string | null;
      brand_source: string | null;
      zoho_item_title: string | null;
      zoho_brand: string | null;
      zoho_manufacturer: string | null;
      listing_titles: string[] | null;
    }>(
      orgId,
      `SELECT sc.id, sc.sku, sc.is_active, sc.product_title,
              sc.brand_id, sc.brand_confidence::text AS brand_confidence, sc.brand_source,
              zi.name AS zoho_item_title, zi.brand AS zoho_brand, zi.manufacturer AS zoho_manufacturer,
              (SELECT array_agg(DISTINCT t.title)
                 FROM sku_platform_ids spi
                 CROSS JOIN LATERAL (VALUES (spi.listing_title), (spi.display_name)) AS t(title)
                WHERE spi.organization_id = sc.organization_id
                  AND spi.sku_catalog_id = sc.id
                  AND t.title IS NOT NULL AND t.title <> '') AS listing_titles
         FROM sku_catalog sc
         LEFT JOIN LATERAL (
           SELECT i.name, i.brand, i.manufacturer
             FROM items i
            WHERE i.sku = sc.sku AND i.organization_id = sc.organization_id AND i.status = 'active'
            ORDER BY i.updated_at DESC
            LIMIT 1
         ) zi ON true
        WHERE sc.organization_id = $1
        ORDER BY sc.id`,
      [orgId],
    );
    return rows.map(
      (r): BackfillSku => ({
        skuCatalogId: Number(r.id),
        sku: r.sku,
        isActive: r.is_active,
        zohoItemTitle: r.zoho_item_title,
        catalogProductTitle: r.product_title,
        zohoBrand: r.zoho_brand,
        zohoManufacturer: r.zoho_manufacturer,
        listingTitles: r.listing_titles ?? [],
        current: {
          brandId: r.brand_id == null ? null : Number(r.brand_id),
          confidence: r.brand_confidence == null ? null : Number(r.brand_confidence),
          source: r.brand_source,
        },
      }),
    );
  },

  async loadProposalKeys(orgId) {
    // Any prior proposal with the key — pending, rejected, applied or
    // reverted — blocks a re-proposal: a human already saw it.
    const { rows } = await tenantQuery<{ k: string }>(
      orgId,
      `SELECT DISTINCT payload->>'dedupeKey' AS k
         FROM agent_mutations
        WHERE organization_id = $1
          AND mutation_kind = ANY($2::text[])
          AND payload ? 'dedupeKey'`,
      [orgId, [...BRAND_REVIEW_KINDS]],
    );
    return new Set(rows.map((r) => r.k));
  },

  writeBrands: (orgId, rows) =>
    withTenantTransaction(orgId, (client) => sqlBrandStore(client as unknown as Queryable, orgId).writeDerivedBrands(rows)),

  async propose(orgId, kind, payload) {
    const r = await applyAgentMutation({ organizationId: orgId, mutationKind: kind, payload, proposedByStaffId: null });
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  },
};
