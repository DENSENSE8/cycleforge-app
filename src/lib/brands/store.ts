/**
 * The ONLY writer (and the main reader) of product_brands /
 * product_brand_aliases / sku_catalog.brand_*. Every statement filters
 * `organization_id = $1` explicitly on top of the RLS GUC, and every
 * predicate that should hit an index is plain int/text/uuid equality
 * (leakproof under forced RLS as app_tenant — phase0-findings §Schema 0).
 *
 * A store is bound to ONE org and ONE client: routes build it inside
 * withTenantTransaction, the review-queue apply path builds it on the
 * applyAgentMutation transaction client.
 */

import type { QueryResultRow } from 'pg';
import { SHIPPED_BY_CARRIER_SQL } from '@/lib/sql-fragments';
import { sqlOrderHasShipConfirm } from '@/lib/orders/order-grain-sql';
import { resolveSkuIdentityTitle, skuBrandJoinOnSql, SKU_BRAND_FACT_MIN_CONFIDENCE } from '@/lib/sku/sku-identity-law';
import type { OrgId } from '@/lib/tenancy/constants';
import type { BrandAliasSource, BrandKind } from './normalize';
import { loadBrandTree, type BrandNode } from './tree';
import { SKU_BRAND_SOURCE_AUTHORITY, type BackfillApplyRow } from './backfill';

export interface Queryable {
  query: <R extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]) => Promise<{ rows: R[]; rowCount?: number | null }>;
}

export interface BrandRow {
  id: number;
  name: string;
  slug: string;
  normalizedName: string;
  kind: BrandKind;
  parentBrandId: number | null;
  publisher: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BrandAliasRow {
  id: number;
  brandId: number;
  alias: string;
  normalizedAlias: string;
  source: BrandAliasSource;
  reviewOnly: boolean;
}

export interface BrandListItem {
  id: number;
  name: string;
  slug: string;
  kind: BrandKind;
  parentBrandId: number | null;
  publisher: string | null;
  /** The alias the query hit (null when listing without a query). */
  matchedAlias: string | null;
  /** 0 exact alias, 1 alias prefix, 2 alias contains; null without a query. */
  aliasRank: number | null;
  /** Active catalog SKUs with a brand fact on this brand or any descendant. */
  activeSkuCount: number;
}

export interface BrandCounts {
  skuCount: number;
  activeSkuCount: number;
  openOrderCount: number;
  onHandUnits: number;
}

export interface BrandDetail {
  brand: BrandRow;
  aliases: BrandAliasRow[];
  parent: { id: number; name: string; kind: BrandKind } | null;
  children: Array<{ id: number; name: string; kind: BrandKind; isActive: boolean }>;
  /** Roll-up over the brand and its descendants. */
  counts: BrandCounts;
}

export type BrandProductStatus = 'active' | 'inactive' | 'all';

export interface BrandProduct {
  skuCatalogId: number;
  sku: string;
  /** Identity title (Zoho item name governs — resolveSkuIdentityTitle). */
  title: string;
  isActive: boolean;
  imageUrl: string | null;
  brand: { id: number; name: string; kind: BrandKind };
  brandConfidence: number;
  brandSource: string;
  onHandUnits: number;
}

export interface BrandInsert {
  name: string;
  slug: string;
  normalizedName: string;
  kind: BrandKind;
  parentBrandId: number | null;
  publisher: string | null;
}

export interface BrandPatch {
  name?: string;
  slug?: string;
  normalizedName?: string;
  kind?: BrandKind;
  parentBrandId?: number | null;
  publisher?: string | null;
  isActive?: boolean;
}

export interface AliasInsert {
  alias: string;
  normalizedAlias: string;
  source: BrandAliasSource;
  reviewOnly: boolean;
}

export interface SkuBrandTriple {
  brandId: number | null;
  confidence: number | null;
  source: string | null;
}

/** The brand kinds of the approval-first review queue (agent_mutations, LAWS T28). */
export const BRAND_REVIEW_KINDS = ['sku_brand.assign', 'brand.create', 'brand.update'] as const;

export interface BrandProposal {
  mutationId: number;
  kind: (typeof BRAND_REVIEW_KINDS)[number];
  status: string;
  createdAt: string;
  proposedByStaffId: number | null;
  reviewNotes: string | null;
  payload: Record<string, unknown>;
  /** The SKU a `sku_brand.assign` proposal is about (identity title). */
  sku: { id: number; sku: string; title: string; isActive: boolean } | null;
  /** Current brand fact on that SKU. */
  currentBrand: { id: number; name: string; confidence: number; source: string } | null;
}

export interface BrandStore {
  readonly orgId: OrgId;
  loadTree(): Promise<BrandNode[]>;
  listBrands(args: { q: string; kind: BrandKind | null; limit: number }): Promise<BrandListItem[]>;
  getBrand(id: number): Promise<BrandRow | null>;
  getBrandDetail(id: number): Promise<BrandDetail | null>;
  listBrandProducts(
    id: number,
    args: { status: BrandProductStatus; limit: number; after: { sku: string; id: number } | null },
  ): Promise<BrandProduct[]>;
  listAliases(brandId: number): Promise<BrandAliasRow[]>;
  /** Owners of the given normalized aliases in this org (any brand). */
  findAliasOwners(normalized: string[]): Promise<Array<{ normalizedAlias: string; brandId: number; brandName: string }>>;
  findSlugOwner(slug: string): Promise<{ id: number; name: string } | null>;
  insertBrand(row: BrandInsert): Promise<BrandRow>;
  updateBrand(id: number, patch: BrandPatch): Promise<BrandRow>;
  insertAliases(brandId: number, aliases: AliasInsert[]): Promise<void>;
  deleteAliases(brandId: number, normalized: string[]): Promise<number>;
  /** Write one SKU's brand triple; returns the previous triple, or null when the SKU is not in this org. */
  setSkuBrand(skuCatalogId: number, next: SkuBrandTriple): Promise<SkuBrandTriple | null>;
  /**
   * Batch-write derived brands (backfill, approved Zoho brand) in one
   * statement. A row never overwrites a higher-authority source
   * (SKU_BRAND_SOURCE_AUTHORITY) and unchanged rows are skipped; returns rows written.
   */
  writeDerivedBrands(rows: BackfillApplyRow[]): Promise<number>;
  /** Re-index the search docs of every SKU under these brands (fn from 2026-09-26_brands_4). */
  enqueueSearchRefresh(brandIds: number[]): Promise<void>;
  /** The brand review queue, newest first; `beforeId` pages. */
  listProposals(args: { statuses: string[]; limit: number; beforeId: number | null }): Promise<BrandProposal[]>;
}

const BRAND_COLUMNS = `b.id, b.name, b.slug, b.normalized_name, b.kind, b.parent_brand_id, b.publisher, b.is_active,
       b.created_at::text AS created_at, b.updated_at::text AS updated_at`;

interface BrandDbRow {
  id: number;
  name: string;
  slug: string;
  normalized_name: string;
  kind: BrandKind;
  parent_brand_id: number | null;
  publisher: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

function toBrandRow(r: BrandDbRow): BrandRow {
  return {
    id: Number(r.id),
    name: r.name,
    slug: r.slug,
    normalizedName: r.normalized_name,
    kind: r.kind,
    parentBrandId: r.parent_brand_id == null ? null : Number(r.parent_brand_id),
    publisher: r.publisher,
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

interface AliasDbRow {
  id: number;
  brand_id: number;
  alias: string;
  normalized_alias: string;
  source: BrandAliasSource;
  review_only: boolean;
}

function toAliasRow(r: AliasDbRow): BrandAliasRow {
  return {
    id: Number(r.id),
    brandId: Number(r.brand_id),
    alias: r.alias,
    normalizedAlias: r.normalized_alias,
    source: r.source,
    reviewOnly: r.review_only,
  };
}

/**
 * `tree(root_id, id)` — every brand paired with itself and each descendant,
 * org-scoped. Shared by the typeahead roll-up and the detail counts.
 */
const BRAND_TREE_CTE = `tree AS (
    SELECT b.id AS root_id, b.id, 1 AS depth
      FROM product_brands b
     WHERE b.organization_id = $1
    UNION ALL
    SELECT t.root_id, c.id, t.depth + 1
      FROM tree t
      JOIN product_brands c ON c.parent_brand_id = t.id AND c.organization_id = $1
     WHERE t.depth < 8
  )`;

const FACT_MIN = SKU_BRAND_FACT_MIN_CONFIDENCE.toFixed(2);

/** SQL CASE mirroring SKU_BRAND_SOURCE_AUTHORITY (unknown / NULL source ranks lowest). */
function authorityRankSql(expr: string): string {
  const arms = Object.entries(SKU_BRAND_SOURCE_AUTHORITY)
    .map(([source, rank]) => `WHEN '${source}' THEN ${rank}`)
    .join(' ');
  return `(CASE ${expr} ${arms} ELSE -1 END)`;
}

export function sqlBrandStore(client: Queryable, orgId: OrgId): BrandStore {
  const q = client.query.bind(client) as Queryable['query'];

  return {
    orgId,

    loadTree: () =>
      loadBrandTree(orgId, {
        query: (_org, sql, params) => q(sql, params),
      }),

    async listBrands({ q: needle, kind, limit }) {
      const { rows } = await q<{
        id: number;
        name: string;
        slug: string;
        kind: BrandKind;
        parent_brand_id: number | null;
        publisher: string | null;
        matched_alias: string | null;
        alias_rank: number | null;
        active_sku_count: number;
      }>(
        `WITH RECURSIVE ${BRAND_TREE_CTE},
         sku_counts AS (
           SELECT sc.brand_id, COUNT(*)::int AS n
             FROM sku_catalog sc
            WHERE sc.organization_id = $1
              AND sc.brand_id IS NOT NULL
              AND sc.is_active = true
              AND sc.brand_confidence >= ${FACT_MIN}
            GROUP BY sc.brand_id
         ),
         rollup AS (
           SELECT t.root_id, COALESCE(SUM(s.n), 0)::int AS n
             FROM tree t
             LEFT JOIN sku_counts s ON s.brand_id = t.id
            GROUP BY t.root_id
         ),
         hits AS (
           SELECT DISTINCT ON (a.brand_id)
                  a.brand_id, a.alias,
                  CASE WHEN a.normalized_alias = $2 THEN 0
                       WHEN left(a.normalized_alias, length($2)) = $2 THEN 1
                       ELSE 2 END AS rank
             FROM product_brand_aliases a
            WHERE a.organization_id = $1
              AND $2 <> ''
              AND strpos(a.normalized_alias, $2) > 0
            ORDER BY a.brand_id,
                     CASE WHEN a.normalized_alias = $2 THEN 0
                          WHEN left(a.normalized_alias, length($2)) = $2 THEN 1
                          ELSE 2 END,
                     length(a.normalized_alias)
         )
         SELECT b.id, b.name, b.slug, b.kind, b.parent_brand_id, b.publisher,
                h.alias AS matched_alias, h.rank AS alias_rank,
                COALESCE(r.n, 0) AS active_sku_count
           FROM product_brands b
           LEFT JOIN rollup r ON r.root_id = b.id
           LEFT JOIN hits h ON h.brand_id = b.id
          WHERE b.organization_id = $1
            AND b.is_active = true
            AND ($2 = '' OR h.brand_id IS NOT NULL)
            AND ($3::text IS NULL OR b.kind = $3)
          ORDER BY h.rank ASC NULLS LAST, active_sku_count DESC, b.name ASC, b.id ASC
          LIMIT $4`,
        [orgId, needle, kind, limit],
      );
      return rows.map((r) => ({
        id: Number(r.id),
        name: r.name,
        slug: r.slug,
        kind: r.kind,
        parentBrandId: r.parent_brand_id == null ? null : Number(r.parent_brand_id),
        publisher: r.publisher,
        matchedAlias: r.matched_alias,
        aliasRank: r.alias_rank == null ? null : Number(r.alias_rank),
        activeSkuCount: Number(r.active_sku_count),
      }));
    },

    async getBrand(id) {
      const { rows } = await q<BrandDbRow>(
        `SELECT ${BRAND_COLUMNS} FROM product_brands b WHERE b.organization_id = $1 AND b.id = $2`,
        [orgId, id],
      );
      return rows[0] ? toBrandRow(rows[0]) : null;
    },

    async getBrandDetail(id) {
      // One round trip: the brand, its aliases, parent, children and the
      // subtree roll-up counts as json columns.
      const { rows } = await q<
        BrandDbRow & {
          aliases: AliasDbRow[] | null;
          parent: { id: number; name: string; kind: BrandKind } | null;
          children: Array<{ id: number; name: string; kind: BrandKind; is_active: boolean }> | null;
          sku_count: number;
          active_sku_count: number;
          open_order_count: number;
          on_hand_units: number;
        }
      >(
        `WITH RECURSIVE sub AS (
           SELECT b.id, 1 AS depth FROM product_brands b WHERE b.organization_id = $1 AND b.id = $2
           UNION ALL
           SELECT c.id, s.depth + 1
             FROM sub s
             JOIN product_brands c ON c.parent_brand_id = s.id AND c.organization_id = $1
            WHERE s.depth < 8
         ),
         skus AS (
           SELECT sc.id, sc.sku, sc.is_active
             FROM sku_catalog sc
            WHERE sc.organization_id = $1
              AND sc.brand_id IN (SELECT id FROM sub)
              AND sc.brand_confidence >= ${FACT_MIN}
         )
         SELECT ${BRAND_COLUMNS},
           (SELECT json_agg(json_build_object(
                     'id', a.id, 'brand_id', a.brand_id, 'alias', a.alias,
                     'normalized_alias', a.normalized_alias, 'source', a.source,
                     'review_only', a.review_only) ORDER BY a.alias)
              FROM product_brand_aliases a
             WHERE a.organization_id = $1 AND a.brand_id = b.id) AS aliases,
           (SELECT json_build_object('id', p.id, 'name', p.name, 'kind', p.kind)
              FROM product_brands p
             WHERE p.organization_id = $1 AND p.id = b.parent_brand_id) AS parent,
           (SELECT json_agg(json_build_object('id', c.id, 'name', c.name, 'kind', c.kind, 'is_active', c.is_active)
                            ORDER BY c.name)
              FROM product_brands c
             WHERE c.organization_id = $1 AND c.parent_brand_id = b.id) AS children,
           (SELECT COUNT(*)::int FROM skus) AS sku_count,
           (SELECT COUNT(*)::int FROM skus WHERE skus.is_active) AS active_sku_count,
           (SELECT COUNT(*)::int
              FROM orders o
              LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
             WHERE o.organization_id = $1
               AND (o.sku_catalog_id IN (SELECT id FROM skus)
                    OR (o.sku_catalog_id IS NULL AND o.sku IN (SELECT sku FROM skus)))
               AND NOT ${SHIPPED_BY_CARRIER_SQL}
               AND NOT ${sqlOrderHasShipConfirm('o')}
               AND COALESCE(o.fulfillment_channel, '') <> 'AFN') AS open_order_count,
           (SELECT COALESCE(SUM(bc.qty), 0)::int
              FROM bin_contents bc
             WHERE bc.organization_id = $1
               AND bc.sku IN (SELECT sku FROM skus)) AS on_hand_units
          FROM product_brands b
         WHERE b.organization_id = $1 AND b.id = $2`,
        [orgId, id],
      );
      const r = rows[0];
      if (!r) return null;
      return {
        brand: toBrandRow(r),
        aliases: (r.aliases ?? []).map(toAliasRow),
        parent: r.parent ? { id: Number(r.parent.id), name: r.parent.name, kind: r.parent.kind } : null,
        children: (r.children ?? []).map((c) => ({ id: Number(c.id), name: c.name, kind: c.kind, isActive: c.is_active })),
        counts: {
          skuCount: Number(r.sku_count),
          activeSkuCount: Number(r.active_sku_count),
          openOrderCount: Number(r.open_order_count),
          onHandUnits: Number(r.on_hand_units),
        },
      };
    },

    async listBrandProducts(id, { status, limit, after }) {
      const { rows } = await q<{
        id: number;
        sku: string;
        zoho_item_title: string | null;
        product_title: string | null;
        is_active: boolean;
        image_url: string | null;
        brand_id: number;
        brand_name: string;
        brand_kind: BrandKind;
        brand_confidence: string;
        brand_source: string;
        on_hand_units: number;
      }>(
        `WITH RECURSIVE sub AS (
           SELECT b.id, 1 AS depth FROM product_brands b WHERE b.organization_id = $1 AND b.id = $2
           UNION ALL
           SELECT c.id, s.depth + 1
             FROM sub s
             JOIN product_brands c ON c.parent_brand_id = s.id AND c.organization_id = $1
            WHERE s.depth < 8
         )
         SELECT sc.id, sc.sku, sc.product_title, sc.is_active, sc.image_url,
                sc.brand_confidence::text AS brand_confidence, sc.brand_source,
                pb.id AS brand_id, pb.name AS brand_name, pb.kind AS brand_kind,
                (SELECT i.name FROM items i
                  WHERE i.sku = sc.sku AND i.organization_id = sc.organization_id AND i.status = 'active'
                  LIMIT 1) AS zoho_item_title,
                (SELECT COALESCE(SUM(bc.qty), 0)::int FROM bin_contents bc
                  WHERE bc.organization_id = sc.organization_id AND bc.sku = sc.sku) AS on_hand_units
           FROM sku_catalog sc
           JOIN product_brands pb ON ${skuBrandJoinOnSql('sc', 'pb')}
          WHERE sc.organization_id = $1
            AND sc.brand_id IN (SELECT id FROM sub)
            AND ($3::text = 'all' OR sc.is_active = ($3::text = 'active'))
            AND ($4::text IS NULL OR (sc.sku, sc.id) > ($4::text, $5::int))
          ORDER BY sc.sku ASC, sc.id ASC
          LIMIT $6`,
        [orgId, id, status, after?.sku ?? null, after?.id ?? null, limit],
      );
      return rows.map((r) => ({
        skuCatalogId: Number(r.id),
        sku: r.sku,
        title: resolveSkuIdentityTitle({ zoho_item_title: r.zoho_item_title, catalog_product_title: r.product_title, sku: r.sku }),
        isActive: r.is_active,
        imageUrl: r.image_url,
        brand: { id: Number(r.brand_id), name: r.brand_name, kind: r.brand_kind },
        brandConfidence: Number(r.brand_confidence),
        brandSource: r.brand_source,
        onHandUnits: Number(r.on_hand_units),
      }));
    },

    async listAliases(brandId) {
      const { rows } = await q<AliasDbRow>(
        `SELECT id, brand_id, alias, normalized_alias, source, review_only
           FROM product_brand_aliases
          WHERE organization_id = $1 AND brand_id = $2
          ORDER BY alias`,
        [orgId, brandId],
      );
      return rows.map(toAliasRow);
    },

    async findAliasOwners(normalized) {
      if (normalized.length === 0) return [];
      const { rows } = await q<{ normalized_alias: string; brand_id: number; name: string }>(
        `SELECT a.normalized_alias, a.brand_id, b.name
           FROM product_brand_aliases a
           JOIN product_brands b ON b.id = a.brand_id AND b.organization_id = a.organization_id
          WHERE a.organization_id = $1 AND a.normalized_alias = ANY($2::text[])`,
        [orgId, normalized],
      );
      return rows.map((r) => ({ normalizedAlias: r.normalized_alias, brandId: Number(r.brand_id), brandName: r.name }));
    },

    async findSlugOwner(slug) {
      const { rows } = await q<{ id: number; name: string }>(
        `SELECT id, name FROM product_brands WHERE organization_id = $1 AND slug = $2`,
        [orgId, slug],
      );
      return rows[0] ? { id: Number(rows[0].id), name: rows[0].name } : null;
    },

    async insertBrand(row) {
      const { rows } = await q<BrandDbRow>(
        `INSERT INTO product_brands AS b
           (organization_id, name, slug, normalized_name, kind, parent_brand_id, publisher)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING ${BRAND_COLUMNS}`,
        [orgId, row.name, row.slug, row.normalizedName, row.kind, row.parentBrandId, row.publisher],
      );
      return toBrandRow(rows[0]!);
    },

    async updateBrand(id, patch) {
      const { rows } = await q<BrandDbRow>(
        `UPDATE product_brands AS b
            SET name            = CASE WHEN $3::boolean THEN $4 ELSE b.name END,
                slug            = CASE WHEN $3::boolean THEN $5 ELSE b.slug END,
                normalized_name = CASE WHEN $3::boolean THEN $6 ELSE b.normalized_name END,
                kind            = COALESCE($7, b.kind),
                parent_brand_id = CASE WHEN $8::boolean THEN $9::int ELSE b.parent_brand_id END,
                publisher       = CASE WHEN $10::boolean THEN $11 ELSE b.publisher END,
                is_active       = COALESCE($12::boolean, b.is_active),
                updated_at      = now()
          WHERE b.organization_id = $1 AND b.id = $2
          RETURNING ${BRAND_COLUMNS}`,
        [
          orgId,
          id,
          patch.name !== undefined,
          patch.name ?? null,
          patch.slug ?? null,
          patch.normalizedName ?? null,
          patch.kind ?? null,
          patch.parentBrandId !== undefined,
          patch.parentBrandId ?? null,
          patch.publisher !== undefined,
          patch.publisher ?? null,
          patch.isActive ?? null,
        ],
      );
      return toBrandRow(rows[0]!);
    },

    async insertAliases(brandId, aliases) {
      if (aliases.length === 0) return;
      await q(
        `INSERT INTO product_brand_aliases (organization_id, brand_id, alias, normalized_alias, source, review_only)
         SELECT $1, $2, x.alias, x.normalized_alias, x.source, x.review_only
           FROM unnest($3::text[], $4::text[], $5::text[], $6::boolean[])
                AS x(alias, normalized_alias, source, review_only)`,
        [
          orgId,
          brandId,
          aliases.map((a) => a.alias),
          aliases.map((a) => a.normalizedAlias),
          aliases.map((a) => a.source),
          aliases.map((a) => a.reviewOnly),
        ],
      );
    },

    async deleteAliases(brandId, normalized) {
      if (normalized.length === 0) return 0;
      const res = await q(
        `DELETE FROM product_brand_aliases
          WHERE organization_id = $1 AND brand_id = $2 AND normalized_alias = ANY($3::text[])`,
        [orgId, brandId, normalized],
      );
      return res.rowCount ?? 0;
    },

    async setSkuBrand(skuCatalogId, next) {
      const { rows } = await q<{ brand_id: number | null; brand_confidence: string | null; brand_source: string | null }>(
        `WITH prev AS (
           SELECT id, brand_id, brand_confidence, brand_source
             FROM sku_catalog
            WHERE organization_id = $1 AND id = $2
            FOR UPDATE
         )
         UPDATE sku_catalog sc
            SET brand_id = $3, brand_confidence = $4, brand_source = $5
           FROM prev
          WHERE sc.organization_id = $1 AND sc.id = prev.id
          RETURNING prev.brand_id, prev.brand_confidence::text AS brand_confidence, prev.brand_source`,
        [orgId, skuCatalogId, next.brandId, next.confidence, next.source],
      );
      const r = rows[0];
      if (!r) return null;
      return {
        brandId: r.brand_id == null ? null : Number(r.brand_id),
        confidence: r.brand_confidence == null ? null : Number(r.brand_confidence),
        source: r.brand_source,
      };
    },

    async writeDerivedBrands(rows) {
      if (rows.length === 0) return 0;
      const res = await q(
        `UPDATE sku_catalog sc
            SET brand_id = v.brand_id, brand_confidence = v.confidence, brand_source = v.source
           FROM unnest($2::int[], $3::int[], $4::numeric[], $5::text[]) AS v(id, brand_id, confidence, source)
          WHERE sc.organization_id = $1
            AND sc.id = v.id
            AND (sc.brand_id IS NULL OR ${authorityRankSql('sc.brand_source')} <= ${authorityRankSql('v.source')})
            AND (sc.brand_id IS DISTINCT FROM v.brand_id
                 OR sc.brand_confidence IS DISTINCT FROM v.confidence
                 OR sc.brand_source IS DISTINCT FROM v.source)`,
        [
          orgId,
          rows.map((r) => r.skuCatalogId),
          rows.map((r) => r.brandId),
          rows.map((r) => r.confidence),
          rows.map((r) => r.source),
        ],
      );
      return res.rowCount ?? 0;
    },

    async enqueueSearchRefresh(brandIds) {
      if (brandIds.length === 0) return;
      await q(`SELECT fn_search_outbox_enqueue_brand($1::uuid, $2::int[])`, [orgId, brandIds]);
    },

    async listProposals({ statuses, limit, beforeId }) {
      const { rows } = await q<{
        id: number;
        mutation_kind: BrandProposal['kind'];
        status: string;
        created_at: string;
        proposed_by_staff_id: number | null;
        review_notes: string | null;
        payload: Record<string, unknown> | null;
        sc_id: number | null;
        sku: string | null;
        product_title: string | null;
        zoho_item_title: string | null;
        sc_is_active: boolean | null;
        brand_id: number | null;
        brand_name: string | null;
        brand_confidence: string | null;
        brand_source: string | null;
      }>(
        `SELECT m.id, m.mutation_kind, m.status, m.created_at::text AS created_at,
                m.proposed_by_staff_id, m.review_notes, m.payload,
                sc.id AS sc_id, sc.sku, sc.product_title, sc.is_active AS sc_is_active,
                (SELECT i.name FROM items i
                  WHERE i.sku = sc.sku AND i.organization_id = sc.organization_id AND i.status = 'active'
                  LIMIT 1) AS zoho_item_title,
                pb.id AS brand_id, pb.name AS brand_name,
                sc.brand_confidence::text AS brand_confidence, sc.brand_source
           FROM agent_mutations m
           LEFT JOIN sku_catalog sc
             ON m.mutation_kind = 'sku_brand.assign'
            AND sc.organization_id = m.organization_id
            AND sc.id = (m.payload->>'skuCatalogId')::int
           LEFT JOIN product_brands pb ON ${skuBrandJoinOnSql('sc', 'pb')}
          WHERE m.organization_id = $1
            AND m.mutation_kind = ANY($2::text[])
            AND m.status = ANY($3::text[])
            AND ($4::bigint IS NULL OR m.id < $4::bigint)
          ORDER BY m.id DESC
          LIMIT $5`,
        [orgId, [...BRAND_REVIEW_KINDS], statuses, beforeId, limit],
      );
      return rows.map((r) => ({
        mutationId: Number(r.id),
        kind: r.mutation_kind,
        status: r.status,
        createdAt: r.created_at,
        proposedByStaffId: r.proposed_by_staff_id == null ? null : Number(r.proposed_by_staff_id),
        reviewNotes: r.review_notes,
        payload: r.payload ?? {},
        sku:
          r.sc_id == null
            ? null
            : {
                id: Number(r.sc_id),
                sku: r.sku ?? '',
                title: resolveSkuIdentityTitle({ zoho_item_title: r.zoho_item_title, catalog_product_title: r.product_title, sku: r.sku }),
                isActive: Boolean(r.sc_is_active),
              },
        currentBrand:
          r.brand_id == null
            ? null
            : { id: Number(r.brand_id), name: r.brand_name ?? '', confidence: Number(r.brand_confidence), source: r.brand_source ?? '' },
      }));
    },
  };
}
