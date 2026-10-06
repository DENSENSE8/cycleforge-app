/** search-outbox-worker — drains entity_search_outbox into entity_search_docs. */

import pool from '@/lib/db';
import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { embedText } from '@/lib/ai/embed';
import { EMBEDDING_DIMS } from '@/lib/ai/provider';
import { resolveOrgAiConfig, type OrgAiConfig } from '@/lib/ai/org-provider';
import { recordAiUsage, type RecordAiUsage } from '@/lib/ai/usage';
import { sqlSkuBrandSearchText } from '@/lib/brands/lookup';
import { SKU_BRAND_JOIN_ON_SQL, SKU_CATALOG_JOIN_ON_SQL } from '@/lib/sku/sku-identity-law';
import { ALLOCATE_STAGE_FACTS_JOIN, sqlAllocateSearchStatus } from '@/lib/search/allocate-search-status';
import {
  buildSearchText,
  isSearchEntityType,
  type BuiltSearchDoc,
  type SearchEntityType,
  type SearchSourceRow,
} from '@/lib/search/build-search-text';

export interface OutboxClaim {
  id: number;
  organizationId: OrgId;
  entityType: SearchEntityType;
  entityId: number;
}

export interface SearchDocUpsert extends BuiltSearchDoc {
  entityType: SearchEntityType;
  entityId: number;
  /** NULL when the embed call failed or embeddings are unconfigured. */
  embedding: number[] | null;
  /** Model that produced `embedding` (per-org embedding-space integrity). */
  embeddedModel: string | null;
}

export interface SearchOutboxDeps {
  claimPending(limit: number): Promise<OutboxClaim[]>;
  loadEntityRows(
    orgId: OrgId,
    entityType: SearchEntityType,
    ids: number[],
  ): Promise<Array<SearchSourceRow & { id: number }>>;
  /** Per-org provider resolution: BYOK vault → platform default → null. */
  resolveEmbedConfig(orgId: OrgId): Promise<OrgAiConfig | null>;
  /** Throws on failure — the worker maps a throw to embedding-NULL upserts. */
  embed(texts: string[], config: OrgAiConfig): Promise<{ vectors: number[][]; promptTokens: number }>;
  recordUsage: RecordAiUsage;
  upsertDocs(orgId: OrgId, docs: SearchDocUpsert[]): Promise<void>;
  deleteDocs(orgId: OrgId, refs: Array<{ entityType: SearchEntityType; entityId: number }>): Promise<void>;
  markProcessed(outboxIds: number[]): Promise<void>;
  markFailed(outboxIds: number[], error: string): Promise<void>;
}

export interface DrainResult {
  claimed: number;
  upserted: number;
  embedded: number;
  deleted: number;
  failed: number;
}

// ── Real implementations ────────────────────────────────────────────────────

/**
 * The FACT brand (id + searchable text) of the catalog row a carrier doc holds
 * by sku string, matched inside the org — the identity-law key, and the exact
 * key the migration's carrier fan-out (2026-09-26_brands_4) enqueues on. A
 * LATERAL body: at most one row (sku_catalog_org_sku_key). Its `sc` is local
 * to the subquery, so it shadows an outer `sc` rather than colliding.
 */
function carriedSkuBrandSql(skuExpr: string, orgExpr: string): string {
  return `SELECT pb.id AS brand_id, ${sqlSkuBrandSearchText('sc')} AS brand_text
      FROM sku_catalog sc
      JOIN product_brands pb ON ${SKU_BRAND_JOIN_ON_SQL}
     WHERE sc.sku = ${skuExpr} AND sc.organization_id = ${orgExpr}`;
}

const LOADER_SQL: Record<SearchEntityType, string> = {
  ORDER: `
    SELECT o.id, o.order_id, o.product_title, o.sku, o.account_source,
           MAX(${sqlAllocateSearchStatus()}) AS status, o.condition, o.notes, o.order_date, o.created_at,
           -- Buyer identity. An operator answering a "where is my order" call
           -- holds a NAME, not an order number, and until this join existed the
           -- console could not turn one into the other. COALESCE order follows
           -- the customers table's own precedence: display_name is the Zoho
           -- contact's canonical label, customer_name the raw imported string.
           COALESCE(c.display_name, c.customer_name)         AS customer_name,
           c.email                                           AS customer_email,
           COALESCE(NULLIF(c.phone, ''), NULLIF(c.mobile, '')) AS customer_phone,
           COALESCE(STRING_AGG(DISTINCT tsn.serial_number, ' '), '') AS serials,
           alloc.allocated_serials,
           COALESCE(MAX(stn.tracking_number_raw), MAX(stn_link.tracking_number_raw)) AS tracking_number,
           COALESCE(STRING_AGG(DISTINCT stn_link.tracking_number_raw, ' ')
             FILTER (WHERE stn_link.tracking_number_raw IS NOT NULL
               AND stn_link.id IS DISTINCT FROM o.shipment_id), '') AS linked_trackings,
           COALESCE(MAX(NULLIF(stn.carrier, 'UNKNOWN')), MAX(NULLIF(stn_link.carrier, 'UNKNOWN'))) AS carrier,
           notes_trail.note_trail,
           brand.brand_id, brand.brand_text
    FROM orders o
    LEFT JOIN tech_serial_numbers tsn       ON (
      tsn.organization_id = o.organization_id
      AND (
        tsn.order_id = o.id
        OR (
          tsn.order_id IS NULL
          AND o.shipment_id IS NOT NULL
          AND tsn.shipment_id = o.shipment_id
          AND NOT EXISTS (
            SELECT 1 FROM orders o2
            WHERE o2.shipment_id = o.shipment_id
              AND o2.organization_id = o.organization_id
              AND o2.id <> o.id
          )
        )
      )
    )
    LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
    ${ALLOCATE_STAGE_FACTS_JOIN}
    LEFT JOIN shipment_links sl
      ON sl.owner_type = 'ORDER'
     AND sl.owner_id = o.id
     AND sl.organization_id = o.organization_id
    LEFT JOIN shipping_tracking_numbers stn_link ON stn_link.id = sl.shipment_id
    LEFT JOIN customers c
      ON c.id = o.customer_id
     AND c.organization_id = o.organization_id
    -- Note trail. orders.notes is the single free-text COLUMN; everything
    -- staff write through the notes UI lands in the order_notes TABLE
    -- (2026-07-28_order_notes.sql: order_id + organization_id + note_text),
    -- which was entirely unsearchable. Bounded to the 5 newest notes / 600
    -- chars so a chatty order cannot consume the MAX_SEARCH_TEXT budget and
    -- truncate the identifiers ahead of it.
    LEFT JOIN LATERAL (
      SELECT LEFT(COALESCE(STRING_AGG(n.note_text, ' ' ORDER BY n.created_at DESC), ''), 600)
               AS note_trail
      FROM (
        SELECT note_text, created_at
        FROM order_notes
        WHERE order_id = o.id AND organization_id = o.organization_id
        ORDER BY created_at DESC
        LIMIT 5
      ) n
    ) notes_trail ON TRUE
    -- Allocated serials. tech_serial_numbers is the LEGACY scan ledger; the
    -- modern path binds a unit to an order through order_unit_allocations
    -- (2026-05-17_inventory_v2_phase0.sql). An order whose units arrived that
    -- way carried NO serial in its doc at all — the serial was on the order in
    -- the database and unfindable by typing it. RELEASED allocations are
    -- excluded: a released unit is no longer this order's, and keeping its
    -- serial searchable here would point an operator at the wrong order.
    -- LATERAL, not a join, so the 1:many edge cannot fan out the GROUP BY.
    LEFT JOIN LATERAL (
      SELECT COALESCE(STRING_AGG(DISTINCT su_a.serial_number, ' '), '') AS allocated_serials
      FROM order_unit_allocations oua
      JOIN serial_units su_a
        ON su_a.id = oua.serial_unit_id
       AND su_a.organization_id = o.organization_id
      WHERE oua.order_id = o.id
        AND oua.organization_id = o.organization_id
        AND COALESCE(oua.state, '') <> 'RELEASED'
    ) alloc ON TRUE
    LEFT JOIN LATERAL (${carriedSkuBrandSql('o.sku', 'o.organization_id')}) brand ON TRUE
    WHERE o.organization_id = $1 AND o.id = ANY($2::bigint[])
    GROUP BY o.id, c.display_name, c.customer_name, c.email, c.phone, c.mobile,
             notes_trail.note_trail, alloc.allocated_serials,
             brand.brand_id, brand.brand_text`,
  SERIAL_UNIT: `
    SELECT su.id, su.serial_number, su.unit_uid, su.sku,
           su.current_status::text  AS current_status,
           su.condition_grade::text AS condition_grade,
           su.current_location, su.notes, su.received_at, su.created_at,
           su.shipping_tracking_number,
           COALESCE(NULLIF(BTRIM(sc.product_title), ''), i.name) AS product_title,
           -- The tote a unit is physically in. Staff hold the H- code off the
           -- label (handling_units.code, 2026-06-08_handling_units_lpn.sql)
           -- and had no way to turn it into the units inside.
           hu.code AS handling_unit_code,
           brand.brand_id, brand.brand_text
    FROM serial_units su
    LEFT JOIN sku_catalog sc ON sc.id = su.sku_catalog_id
    LEFT JOIN items i        ON i.zoho_item_id = su.zoho_item_id
    LEFT JOIN handling_units hu
           ON hu.id = su.handling_unit_id AND hu.organization_id = su.organization_id
    LEFT JOIN LATERAL (${carriedSkuBrandSql('su.sku', 'su.organization_id')}) brand ON TRUE
    WHERE su.organization_id = $1 AND su.id = ANY($2::bigint[])`,
  // Aggregate the only 1:many join (receiving_line) in a LATERAL so the outer SELECT needs no GROUP BY at all; stn is 1:1 on shipment_id.
  // `receiving` was a security_invoker compat view — and stays because it
  RECEIVING: `
    SELECT r.id,
           stn.tracking_number_raw                                AS tracking_number,
           COALESCE(NULLIF(stn.carrier, 'UNKNOWN'), r.carrier)    AS carrier,
           r.zoho_purchaseorder_number                            AS po_number,
           r.source_order_id,
           r.source_platform, r.intake_type, r.exception_code,
           r.support_notes, r.zoho_notes,
           r.condition_grade::text AS condition_grade,
           r.qa_status::text       AS qa_status,
           rt.door_received_at AS received_at, r.created_at,
           lines.line_item_names, lines.line_skus,
           lines.line_count, lines.distinct_sku_count, lines.first_item_name,
           lines.brand_id, lines.brand_text
    FROM receiving_carton r
    LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
    LEFT JOIN receiving_triage rt
           ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
    -- Every line's catalog row (at most one per line: sku_catalog_org_sku_key)
    -- and its fact brand join inside the same aggregate, so neither can fan
    -- out the counts. brand_id is the FIRST branded line's (deterministic by
    -- rl.id); brand_text folds in every line's brand.
    LEFT JOIN LATERAL (
      SELECT COALESCE(STRING_AGG(DISTINCT rl.item_name, ' '), '') AS line_item_names,
             COALESCE(STRING_AGG(DISTINCT rl.sku, ' '), '')       AS line_skus,
             COUNT(*)::int AS line_count,
             COUNT(DISTINCT COALESCE(NULLIF(TRIM(rl.sku), ''), NULLIF(TRIM(rl.item_name), ''), rl.id::text))::int
               AS distinct_sku_count,
             (ARRAY_AGG(rl.item_name ORDER BY rl.id)
               FILTER (WHERE NULLIF(TRIM(rl.item_name), '') IS NOT NULL))[1] AS first_item_name,
             (ARRAY_AGG(pb.id ORDER BY rl.id) FILTER (WHERE pb.id IS NOT NULL))[1] AS brand_id,
             STRING_AGG(DISTINCT ${sqlSkuBrandSearchText('sc')}, ' ')
               FILTER (WHERE pb.id IS NOT NULL) AS brand_text
      FROM receiving_line rl
      LEFT JOIN sku_catalog sc ON ${SKU_CATALOG_JOIN_ON_SQL}
      LEFT JOIN product_brands pb ON ${SKU_BRAND_JOIN_ON_SQL}
      WHERE rl.receiving_id = r.id
    ) lines ON TRUE
    WHERE r.organization_id = $1 AND r.id = ANY($2::bigint[])`,
  // Platform crosswalk + BOM folded in as LATERAL aggregates so the outer SELECT stays GROUP-BY-free.
  // The Zoho twin: the ACTIVE items row with the same sku in the same org.
  // Its name is the title FALLBACK (resolveSkuIdentityTitle in buildSkuDoc —
  // the catalog title governs) and its brand / manufacturer the brand fallback. LATERAL + LIMIT 1 because
  // items carries no (organization_id, sku) unique.
  SKU: `
    SELECT sc.id, sc.sku, sc.product_title, sc.category, sc.upc, sc.ean, sc.gtin, sc.notes,
           sc.lifecycle_status, sc.is_active, sc.created_at, sc.updated_at,
           sc.provider_item_id,
           zi.name         AS zoho_item_title,
           zi.zoho_item_id AS zoho_item_id,
           zi.upc          AS item_upc,
           zi.ean          AS item_ean,
           COALESCE(NULLIF(btrim(zi.brand), ''), NULLIF(btrim(zi.manufacturer), '')) AS zoho_item_brand,
           pb.id AS brand_id,
           ${sqlSkuBrandSearchText('sc')} AS brand_text,
           plat.platform_skus, plat.platform_item_ids, plat.platform_accounts,
           kit.kit_part_names, kit.kit_document_titles
    FROM sku_catalog sc
    LEFT JOIN LATERAL (
      SELECT i.name, i.zoho_item_id, i.upc, i.ean, i.brand, i.manufacturer
      FROM items i
      WHERE i.sku = sc.sku
        AND i.organization_id = sc.organization_id
        AND i.status = 'active'
      ORDER BY i.zoho_item_id
      LIMIT 1
    ) zi ON TRUE
    LEFT JOIN product_brands pb ON ${SKU_BRAND_JOIN_ON_SQL}
    LEFT JOIN LATERAL (
      SELECT LEFT(COALESCE(STRING_AGG(DISTINCT sp.platform_sku, ' '), ''), 300)     AS platform_skus,
             LEFT(COALESCE(STRING_AGG(DISTINCT sp.platform_item_id, ' '), ''), 300) AS platform_item_ids,
             LEFT(COALESCE(STRING_AGG(DISTINCT sp.account_name, ' '), ''), 120)     AS platform_accounts
      FROM sku_platform_ids sp
      WHERE sp.sku_catalog_id = sc.id AND sp.organization_id = sc.organization_id
    ) plat ON TRUE
    LEFT JOIN LATERAL (
      SELECT LEFT(COALESCE(STRING_AGG(DISTINCT kp.component_name, ' '), ''), 300)  AS kit_part_names,
             LEFT(COALESCE(STRING_AGG(DISTINCT kp.document_title, ' '), ''), 200)  AS kit_document_titles
      FROM sku_kit_parts kp
      WHERE kp.sku_catalog_id = sc.id AND kp.organization_id = sc.organization_id
    ) kit ON TRUE
    WHERE sc.organization_id = $1 AND sc.id = ANY($2::bigint[])`,
  REPAIR: `
    SELECT id, ticket_number, product_title, serial_number, issue, notes,
           status, source_system, source_order_id, source_tracking_number,
           source_sku, received_at, created_at
    FROM repair_service
    WHERE organization_id = $1 AND id = ANY($2::bigint[])`,
  FBA_SHIPMENT: `
    SELECT f.id, f.shipment_ref, f.amazon_shipment_id, f.destination_fc,
           f.status, f.notes, f.due_date, f.shipped_at, f.created_at,
           COALESCE(STRING_AGG(DISTINCT fsi.product_title, ' '), '') AS item_titles,
           COALESCE(STRING_AGG(DISTINCT fsi.sku, ' '), '')           AS item_skus,
           COALESCE(STRING_AGG(DISTINCT fsi.fnsku, ' '), '')         AS item_fnskus,
           COALESCE(STRING_AGG(DISTINCT fsi.asin, ' '), '')          AS item_asins
    FROM fba_shipments f
    LEFT JOIN fba_shipment_items fsi ON fsi.shipment_id = f.id
    WHERE f.organization_id = $1 AND f.id = ANY($2::bigint[])
    GROUP BY f.id`,
  // Every join is 1:1, so the outer SELECT needs no GROUP BY and no LATERAL.
  WARRANTY_CLAIM: `
    SELECT wc.id, wc.claim_number, wc.serial_number, wc.sku, wc.product_title,
           wc.source_system, wc.source_order_id, wc.source_tracking_number,
           wc.zendesk_ticket_id, wc.status, wc.denial_reason_code,
           LEFT(wc.denial_notes, 400) AS denial_notes,
           LEFT(wc.notes, 600)        AS notes,
           wc.created_at,
           COALESCE(c.display_name, c.customer_name)           AS customer_name,
           c.email                                             AS customer_email,
           COALESCE(NULLIF(c.phone, ''), NULLIF(c.mobile, '')) AS customer_phone
    FROM warranty_claims wc
    LEFT JOIN customers c
      ON c.id = wc.customer_id
     AND c.organization_id = wc.organization_id
    WHERE wc.organization_id = $1 AND wc.id = ANY($2::bigint[])
      AND wc.deleted_at IS NULL`,
  // A Support item is found by whatever the customer quoted: their email or
  // handle, the provider ticket number, a linked order's number / id /
  // tracking / SKU, a linked repair (RS-<id> or its ticket number), a pasted
  // external reference. Every 1:many edge is an aggregating LATERAL, so the
  // outer SELECT stays GROUP-BY-free. ticket_links rows written before the
  // support_ticket_id seam match by the Zendesk number.
  SUPPORT_TICKET: `
    SELECT st.id, st.provider, st.external_ticket_id,
           LEFT(st.subject_cache, 400) AS subject_cache,
           st.status_cache, st.lifecycle, st.created_at, st.updated_at,
           st.requester_name, st.requester_email, st.requester_handle, st.account_label,
           links.external_refs,
           ord.order_numbers, ord.order_ids, ord.order_skus, ord.order_trackings,
           rep.repair_ids, rep.repair_numbers, rep.repair_order_numbers,
           rep.repair_skus, rep.repair_trackings,
           ship.shipment_trackings,
           items.item_skus
    FROM support_tickets st
    LEFT JOIN LATERAL (
      SELECT ARRAY_AGG(tl.entity_id) FILTER (WHERE tl.entity_type = 'ORDER')    AS order_ids,
             ARRAY_AGG(tl.entity_id) FILTER (WHERE tl.entity_type = 'REPAIR')   AS repair_ids,
             ARRAY_AGG(tl.entity_id) FILTER (WHERE tl.entity_type = 'SHIPMENT') AS shipment_ids,
             LEFT(COALESCE(STRING_AGG(DISTINCT tl.external_reference, ' '), ''), 300) AS external_refs
      FROM ticket_links tl
      WHERE tl.organization_id = st.organization_id
        AND (tl.support_ticket_id = st.id
             OR (tl.support_ticket_id IS NULL
                 AND st.provider = 'zendesk'
                 AND tl.zendesk_ticket_id::text = st.external_ticket_id))
    ) links ON TRUE
    LEFT JOIN LATERAL (
      SELECT LEFT(COALESCE(STRING_AGG(DISTINCT o.order_id, ' '), ''), 300)             AS order_numbers,
             COALESCE(STRING_AGG(DISTINCT o.id::text, ' '), '')                         AS order_ids,
             LEFT(COALESCE(STRING_AGG(DISTINCT o.sku, ' '), ''), 300)                  AS order_skus,
             LEFT(COALESCE(STRING_AGG(DISTINCT stn.tracking_number_raw, ' '), ''), 300) AS order_trackings
      FROM orders o
      LEFT JOIN shipping_tracking_numbers stn
        ON stn.id = o.shipment_id
       AND stn.organization_id = o.organization_id
      WHERE o.organization_id = st.organization_id
        AND (o.id = st.primary_order_id OR o.id = ANY(links.order_ids))
    ) ord ON TRUE
    LEFT JOIN LATERAL (
      SELECT COALESCE(STRING_AGG(DISTINCT rs.id::text, ' '), '')                        AS repair_ids,
             COALESCE(STRING_AGG(DISTINCT rs.ticket_number, ' '), '')                  AS repair_numbers,
             COALESCE(STRING_AGG(DISTINCT rs.source_order_id, ' '), '')                AS repair_order_numbers,
             COALESCE(STRING_AGG(DISTINCT rs.source_sku, ' '), '')                     AS repair_skus,
             COALESCE(STRING_AGG(DISTINCT rs.source_tracking_number, ' '), '')         AS repair_trackings
      FROM repair_service rs
      WHERE rs.organization_id = st.organization_id
        AND rs.id = ANY(links.repair_ids)
    ) rep ON TRUE
    LEFT JOIN LATERAL (
      SELECT COALESCE(STRING_AGG(DISTINCT stn.tracking_number_raw, ' '), '') AS shipment_trackings
      FROM shipping_tracking_numbers stn
      WHERE stn.organization_id = st.organization_id
        AND stn.id = ANY(links.shipment_ids)
    ) ship ON TRUE
    LEFT JOIN LATERAL (
      SELECT COALESCE(STRING_AGG(DISTINCT sc.sku, ' '), '') AS item_skus
      FROM support_ticket_items sti
      JOIN sku_catalog sc
        ON sc.id = sti.sku_catalog_id
       AND sc.organization_id = sti.organization_id
      WHERE sti.organization_id = st.organization_id
        AND sti.support_ticket_id = st.id
    ) items ON TRUE
    WHERE st.organization_id = $1 AND st.id = ANY($2::bigint[])`,
  // `bin_contents` is the only 1:many edge, so it is a LEFT-bounded LATERAL and the outer SELECT stays GROUP-BY-free.
  LOCATION: `
    SELECT l.id, l.barcode, l.name, l.display_name, l.room,
           l.row_label, l.col_label, l.zone_letter, l.bin_type,
           l.bin_role::text      AS bin_role,
           l.location_kind, l.is_active, l.locked_for_count,
           LEFT(l.description, 400) AS description,
           l.created_at, l.updated_at,
           contents.content_skus
    FROM locations l
    LEFT JOIN LATERAL (
      SELECT LEFT(COALESCE(STRING_AGG(DISTINCT bc.sku, ' '), ''), 300) AS content_skus
      FROM bin_contents bc
      WHERE bc.location_id = l.id
        AND bc.organization_id = l.organization_id
        AND bc.qty > 0
    ) contents ON TRUE
    WHERE l.organization_id = $1 AND l.id = ANY($2::bigint[])`,
};

function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`;
}

/** After this many claim attempts a row dead-letters (processed_at stamped,
 *  last_error kept) — poison rows must never starve the queue head. */
const ATTEMPTS_CAP = 5;

const defaultDeps: SearchOutboxDeps = {
  async claimPending(limit) {
    // Crash recovery: a drain that died between claim and mark leaves
    // claimed_at set with processed_at NULL — release those claims so the
    // rows become claimable again (attempts already counted the try).
    await pool.query(
      `UPDATE entity_search_outbox
       SET claimed_at = NULL
       WHERE processed_at IS NULL
         AND claimed_at < now() - INTERVAL '15 minutes'`,
    );
    // Claim = stamp claimed_at.
    const res = await pool.query(
      `UPDATE entity_search_outbox
       SET attempts = attempts + 1, claimed_at = now()
       WHERE id IN (
         SELECT id FROM entity_search_outbox
         WHERE processed_at IS NULL AND claimed_at IS NULL AND attempts < ${ATTEMPTS_CAP}
         ORDER BY id
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, organization_id, entity_type, entity_id`,
      [limit],
    );
    // NOTE: unknown entity_type rows are NOT filtered here — the drain
    // dead-letters them via markFailed so they can't be re-claimed forever.
    return res.rows.map((r: any) => ({
      id: Number(r.id),
      organizationId: String(r.organization_id) as OrgId,
      entityType: String(r.entity_type) as SearchEntityType,
      entityId: Number(r.entity_id),
    }));
  },

  async loadEntityRows(orgId, entityType, ids) {
    const res = await tenantQuery(orgId, LOADER_SQL[entityType], [orgId, ids]);
    return res.rows.map((r: any) => ({ ...r, id: Number(r.id) }));
  },

  resolveEmbedConfig: (orgId) => resolveOrgAiConfig(orgId, 'embed'),
  async embed(texts, config) {
    let promptTokens = 0;
    const vectors = await embedText(texts, {
      config,
      onUsage: ({ promptTokens: t }) => {
        promptTokens += t;
      },
    });
    return { vectors, promptTokens };
  },
  recordUsage: recordAiUsage,

  async upsertDocs(orgId, docs) {
    if (docs.length === 0) return;
    // One UNNEST-batched statement per org per drain — N sequential
    // single-row transactions would multiply round trips (each tenantQuery
    // opens BEGIN/set_config/COMMIT), the exact CU-hour pattern to avoid.
    await tenantQuery(
      orgId,
      `INSERT INTO entity_search_docs
         (organization_id, entity_type, entity_id, title, subtitle,
          search_text, embedding, embedded_at, embedded_model, status,
          condition_grade, source_platform, tracking_number, carrier,
          serial_number, happened_at, brand_id, updated_at)
       SELECT $1,
              t.entity_type, t.entity_id, t.title, t.subtitle, t.search_text,
              t.embedding_text::vector(${EMBEDDING_DIMS}),
              CASE WHEN t.embedding_text IS NULL THEN NULL ELSE now() END,
              t.embedded_model,
              t.status, t.condition_grade, t.source_platform,
              t.tracking_number, t.carrier, t.serial_number, t.happened_at,
              t.brand_id,
              now()
       FROM UNNEST(
         $2::text[], $3::bigint[], $4::text[], $5::text[], $6::text[],
         $7::text[], $8::text[], $9::text[], $10::text[], $11::timestamptz[],
         $12::text[], $13::text[], $14::text[], $15::text[], $16::int[]
       ) AS t(entity_type, entity_id, title, subtitle, search_text,
              embedding_text, status, condition_grade, source_platform, happened_at,
              embedded_model, tracking_number, carrier, serial_number, brand_id)
       ON CONFLICT (organization_id, entity_type, entity_id)
       DO UPDATE SET
         title           = EXCLUDED.title,
         subtitle        = EXCLUDED.subtitle,
         search_text     = EXCLUDED.search_text,
         -- Keep an existing embedding when this pass couldn't embed —
         -- stale-but-present beats NULL for the semantic arm; the text
         -- columns above are always freshest.
         embedding       = COALESCE(EXCLUDED.embedding, entity_search_docs.embedding),
         embedded_at     = COALESCE(EXCLUDED.embedded_at, entity_search_docs.embedded_at),
         embedded_model  = COALESCE(EXCLUDED.embedded_model, entity_search_docs.embedded_model),
         status          = EXCLUDED.status,
         condition_grade = EXCLUDED.condition_grade,
         source_platform = EXCLUDED.source_platform,
         tracking_number = EXCLUDED.tracking_number,
         carrier         = EXCLUDED.carrier,
         serial_number   = EXCLUDED.serial_number,
         happened_at     = EXCLUDED.happened_at,
         brand_id        = EXCLUDED.brand_id,
         updated_at      = now()`,
      [
        orgId,
        docs.map((d) => d.entityType),
        docs.map((d) => d.entityId),
        docs.map((d) => d.title),
        docs.map((d) => d.subtitle),
        docs.map((d) => d.searchText),
        docs.map((d) => (d.embedding ? toVectorLiteral(d.embedding) : null)),
        docs.map((d) => d.facets.status),
        docs.map((d) => d.facets.conditionGrade),
        docs.map((d) => d.facets.sourcePlatform),
        docs.map((d) => d.facets.happenedAt),
        docs.map((d) => d.embeddedModel),
        docs.map((d) => d.facets.trackingNumber),
        docs.map((d) => d.facets.carrier),
        docs.map((d) => d.facets.serialNumber),
        docs.map((d) => d.facets.brandId),
      ],
    );
  },

  async deleteDocs(orgId, refs) {
    if (refs.length === 0) return;
    await tenantQuery(
      orgId,
      `DELETE FROM entity_search_docs
       WHERE organization_id = $1
         AND (entity_type, entity_id) IN (
           SELECT * FROM UNNEST($2::text[], $3::bigint[])
         )`,
      [orgId, refs.map((r) => r.entityType), refs.map((r) => r.entityId)],
    );
  },

  async markProcessed(outboxIds) {
    if (outboxIds.length === 0) return;
    await pool.query(
      `UPDATE entity_search_outbox SET processed_at = now(), last_error = NULL
       WHERE id = ANY($1::bigint[])`,
      [outboxIds],
    );
  },

  async markFailed(outboxIds, error) {
    if (outboxIds.length === 0) return;
    // Release the claim so the row is retryable; once attempts hits the cap
    // it dead-letters (processed_at stamped, last_error kept) instead of
    // starving the queue head forever.
    await pool.query(
      `UPDATE entity_search_outbox
       SET last_error = $2,
           claimed_at = NULL,
           processed_at = CASE WHEN attempts >= ${ATTEMPTS_CAP} THEN now() ELSE processed_at END
       WHERE id = ANY($1::bigint[])`,
      [outboxIds, error.slice(0, 500)],
    );
  },
};

// ── Embedding retry sweep (Phase 3, org-aware) ──────────────────────────────

interface EmbedRetryDeps {
  /** Orgs that currently have stale NULL-embedding docs. */
  listOrgsWithNullEmbeddings(olderThanMinutes: number, maxOrgs: number): Promise<OrgId[]>;
  /** Per-org provider resolution (cached) — null = org can't embed, skip. */
  resolveEmbedConfig(orgId: OrgId): Promise<OrgAiConfig | null>;
  /** Re-enqueue one org's stale NULL-embedding docs. */
  enqueueNullEmbeddingDocs(orgId: OrgId, limit: number, olderThanMinutes: number): Promise<number>;
}

const defaultRetryDeps: EmbedRetryDeps = {
  async listOrgsWithNullEmbeddings(olderThanMinutes, maxOrgs) {
    const res = await pool.query(
      `SELECT organization_id
       FROM entity_search_docs
       WHERE embedding IS NULL
         AND updated_at < now() - ($1::int * INTERVAL '1 minute')
       GROUP BY organization_id
       ORDER BY COUNT(*) DESC
       LIMIT $2`,
      [olderThanMinutes, maxOrgs],
    );
    return res.rows.map((r: any) => String(r.organization_id) as OrgId);
  },
  resolveEmbedConfig: (orgId) => resolveOrgAiConfig(orgId, 'embed'),
  async enqueueNullEmbeddingDocs(orgId, limit, olderThanMinutes) {
    const res = await pool.query(
      `INSERT INTO entity_search_outbox (organization_id, entity_type, entity_id)
       SELECT organization_id, entity_type, entity_id
       FROM entity_search_docs
       WHERE organization_id = $1
         AND embedding IS NULL
         AND updated_at < now() - ($3::int * INTERVAL '1 minute')
       ORDER BY updated_at ASC
       LIMIT $2
       ON CONFLICT (organization_id, entity_type, entity_id)
       WHERE processed_at IS NULL AND claimed_at IS NULL
       DO NOTHING`,
      [orgId, limit, olderThanMinutes],
    );
    return res.rowCount ?? 0;
  },
};

export async function sweepEmbeddingRetries(
  opts: { limit?: number; olderThanMinutes?: number } = {},
  deps: EmbedRetryDeps = defaultRetryDeps,
): Promise<number> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const olderThanMinutes = Math.max(opts.olderThanMinutes ?? 30, 1);
  const orgs = await deps.listOrgsWithNullEmbeddings(olderThanMinutes, 20);
  let total = 0;
  for (const orgId of orgs) {
    if (total >= limit) break;
    const config = await deps.resolveEmbedConfig(orgId);
    if (!config) continue; // unlinked tenant — NULL is steady state
    total += await deps.enqueueNullEmbeddingDocs(orgId, limit - total, olderThanMinutes);
  }
  return total;
}

/** Re-enqueue EVERY doc for one org — called when the org connects, switches, or disconnects an AI provider, so its whole corpus re-embeds… */
export async function enqueueOrgReembed(orgId: OrgId): Promise<number> {
  const res = await pool.query(
    `INSERT INTO entity_search_outbox (organization_id, entity_type, entity_id)
     SELECT organization_id, entity_type, entity_id
     FROM entity_search_docs
     WHERE organization_id = $1
     ON CONFLICT (organization_id, entity_type, entity_id)
     WHERE processed_at IS NULL AND claimed_at IS NULL
     DO NOTHING`,
    [orgId],
  );
  return res.rowCount ?? 0;
}

// ── Orchestration ───────────────────────────────────────────────────────────

export async function drainSearchOutbox(
  opts: { batchSize?: number } = {},
  deps: SearchOutboxDeps = defaultDeps,
): Promise<DrainResult> {
  const batchSize = Math.min(Math.max(opts.batchSize ?? 50, 1), 200);
  const result: DrainResult = { claimed: 0, upserted: 0, embedded: 0, deleted: 0, failed: 0 };

  const claims = await deps.claimPending(batchSize);
  result.claimed = claims.length;
  if (claims.length === 0) return result;

  // Unknown discriminator values (e.g. a 7th entity type whose migration
  // landed before the code deploy) dead-letter via markFailed — silently
  // re-claiming them forever would stall the queue and skew the drain loop.
  const known = claims.filter((c) => isSearchEntityType(String(c.entityType)));
  const unknown = claims.filter((c) => !isSearchEntityType(String(c.entityType)));
  if (unknown.length > 0) {
    await deps.markFailed(
      unknown.map((c) => c.id),
      `unsupported entity_type (worker predates it): ${[...new Set(unknown.map((c) => c.entityType))].join(', ')}`,
    );
    result.failed += unknown.length;
  }

  const byOrg = new Map<OrgId, OutboxClaim[]>();
  for (const claim of known) {
    const list = byOrg.get(claim.organizationId) ?? [];
    list.push(claim);
    byOrg.set(claim.organizationId, list);
  }

  for (const [orgId, orgClaims] of byOrg) {
    try {
      const byType = new Map<SearchEntityType, OutboxClaim[]>();
      for (const claim of orgClaims) {
        const list = byType.get(claim.entityType) ?? [];
        list.push(claim);
        byType.set(claim.entityType, list);
      }

      const docs: SearchDocUpsert[] = [];
      const gone: Array<{ entityType: SearchEntityType; entityId: number }> = [];

      for (const [entityType, typeClaims] of byType) {
        const ids = typeClaims.map((c) => c.entityId);
        const rows = await deps.loadEntityRows(orgId, entityType, ids);
        const found = new Set(rows.map((r) => r.id));
        for (const row of rows) {
          docs.push({
            entityType,
            entityId: row.id,
            embedding: null,
            embeddedModel: null,
            ...buildSearchText(entityType, row),
          });
        }
        for (const id of ids) {
          // Parent vanished between enqueue and drain → remove any stale doc
          // (the delete trigger normally handles this; self-heal regardless).
          if (!found.has(id)) gone.push({ entityType, entityId: id });
        }
      }

      // Best-effort embed with the ORG's provider (BYOK vault → platform
      // default → none). A failure or an unlinked tenant NEVER blocks the
      // doc upsert — keyword search stays fresh, embedding stays NULL.
      const embedConfig = docs.length > 0 ? await deps.resolveEmbedConfig(orgId) : null;
      if (docs.length > 0 && embedConfig) {
        try {
          const { vectors, promptTokens } = await deps.embed(
            docs.map((d) => d.searchText),
            embedConfig,
          );
          if (vectors.length === docs.length) {
            docs.forEach((doc, i) => {
              doc.embedding = vectors[i];
              doc.embeddedModel = embedConfig.model;
            });
            result.embedded += vectors.length;
            if (promptTokens > 0) {
              deps.recordUsage({
                orgId,
                capability: 'embed',
                source: embedConfig.source,
                model: embedConfig.model,
                context: 'doc_embed',
                inputTokens: promptTokens,
              });
            }
          }
        } catch {
          // leave embeddings NULL; retried on next enqueue/backfill
        }
      }

      if (docs.length > 0) await deps.upsertDocs(orgId, docs);
      if (gone.length > 0) await deps.deleteDocs(orgId, gone);
      await deps.markProcessed(orgClaims.map((c) => c.id));
      result.upserted += docs.length;
      result.deleted += gone.length;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      await deps.markFailed(
        orgClaims.map((c) => c.id),
        message,
      );
      result.failed += orgClaims.length;
    }
  }

  return result;
}
