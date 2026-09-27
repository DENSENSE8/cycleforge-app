/**
 * Identify's statements. ONE statement answers a whole paste: every exact
 * probe (all lines, all kinds) plus the free-text arms, each line's arms
 * joined laterally, then one enrichment pass that attaches title, stage,
 * workflow signals and brand. Pure string building — the domain runs it.
 *
 * Predicate rules (phase0-findings §Schema): under forced RLS as app_tenant
 * only leakproof operators can be index conditions, so every exact arm is a
 * plain `text/int = ANY(array)` on a btree column with an explicit
 * `organization_id` filter. The free-text arms (`LIKE`, `word_similarity`)
 * are non-leakproof by nature and run over the small title tables plus
 * `entity_search_docs`, capped per line.
 */

import { sqlOrderHasPackScan, sqlOrderHasShipConfirm, sqlOrderHasTechScan } from '@/lib/orders/order-grain-sql';
import {
  sqlOrderAwaitingPick,
  sqlOrderBlockedPending,
  sqlOrderHasPoPairedShortage,
  sqlOrderInWarehouseToShip,
} from '@/lib/orders/desk-view-sql';
import { sqlOrderInExceptionQueue } from '@/lib/orders/exception-membership';
import { DOCK_STAGING_LATERAL } from '@/lib/neon/orders-queries';
import { SHIPPED_BY_CARRIER_SQL } from '@/lib/sql-fragments';
import { SKU_BRAND_FACT_MIN_CONFIDENCE } from '@/lib/sku/sku-identity-law';
import type { ExactProbe, ProbeKind } from './classify';

/** Per-line candidate caps for each free-text arm. */
export const FREE_TEXT_ARM_LIMIT = 12;
/** `word_similarity` floor for the typo arm (pg_trgm default is 0.6; titles are long, queries short). */
export const FUZZY_TITLE_THRESHOLD = 0.45;

/** Probe kinds with an integer key column. */
const INT_PROBES: Partial<Record<ProbeKind, true>> = {
  receiving_id: true,
  receiving_line_id: true,
  unit_id: true,
  repair_id: true,
};

/** Probe arrays, in parameter order ($2…). `ticket` never reaches SQL (the handle IS the id). */
const PROBE_PARAM_ORDER = [
  'order_id',
  'order_item',
  'tracking',
  'serial',
  'sku',
  'gtin',
  'fnsku',
  'asin',
  'po',
  'receiving_id',
  'receiving_line_id',
  'unit_id',
  'unit_key',
  'repair_id',
  'location_code',
] as const satisfies readonly ProbeKind[];

type SqlProbeKind = (typeof PROBE_PARAM_ORDER)[number];

/**
 * A line's free-text search: its words, edit-distance-1 variants of each
 * (typo repair), and the normalised brand n-grams of the line.
 */
export interface FreeTextLine {
  line: number;
  words: string[];
  variants: Array<{ word: string; variant: string }>;
  brandNgrams: string[];
}

export interface IdentifyStatementInput {
  orgId: string;
  probes: ExactProbe[];
  freeText: FreeTextLine[];
  /** `sqlSkuBrandJson('sc')` from the brands module — a scalar jsonb subquery over the joined catalog row. */
  brandSql: string;
}

/**
 * Row shape every arm projects into (one enrichment pass fills the rest).
 * Two arms carry no entity and reuse columns:
 * - `correction`: probe = repaired word, value = typed word;
 * - `brand_alias`: probe = the n-gram that hit, value = alias source,
 *   entity_id = brand id, arm_rank = parent brand id (0 = none),
 *   doc_title = brand name, doc_subtitle = brand kind.
 */
export interface IdentifyRow {
  arm: 'exact' | 'keyword_sku' | 'keyword_doc' | 'fuzzy_sku' | 'brand_sku' | 'correction' | 'brand_alias';
  line: number | null;
  probe: string | null;
  value: string | null;
  kind: string;
  entity_id: string | number;
  arm_rank: number;
  score: number;
  doc_title: string | null;
  doc_subtitle: string | null;
  doc_condition: string | null;
  happened_at: string | Date | null;
  order_id: string | null;
  order_title: string | null;
  account_source: string | null;
  order_condition: string | null;
  shipment_id: string | number | null;
  desk_view: string | null;
  has_tech_scan: boolean | null;
  packed: boolean | null;
  staged: boolean | null;
  out_of_stock: boolean | null;
  sku: string | null;
  catalog_title: string | null;
  zoho_title: string | null;
  unit_serial: string | null;
  unit_status: string | null;
  unit_condition: string | null;
  receiving_po: string | null;
  receiving_tracking: string | null;
  repair_title: string | null;
  repair_ticket: string | null;
  location_label: string | null;
  brand: unknown;
}

function probeArrays(probes: ExactProbe[]): Record<SqlProbeKind, Array<string | number>> {
  const out = Object.fromEntries(PROBE_PARAM_ORDER.map((k) => [k, [] as Array<string | number>])) as Record<
    SqlProbeKind,
    Array<string | number>
  >;
  const seen = new Set<string>();
  for (const p of probes) {
    if (p.kind === 'ticket') continue;
    const key = `${p.kind}:${p.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (INT_PROBES[p.kind]) {
      const n = Number(p.value);
      if (Number.isSafeInteger(n) && n > 0 && n <= 2_147_483_647) out[p.kind as SqlProbeKind].push(n);
    } else {
      out[p.kind as SqlProbeKind].push(p.value);
    }
  }
  return out;
}

/** `sku_catalog` kind→entity arms emit this projection. */
const EXACT_COLS = `NULL::int AS line, 0 AS arm_rank, 1::float8 AS score,
         NULL::text AS doc_title, NULL::text AS doc_subtitle, NULL::text AS doc_condition, NULL::timestamptz AS happened_at`;

/**
 * The exact arms, `$2`… in {@link PROBE_PARAM_ORDER}. Arms whose probe array
 * is empty are left out of the text (they would cost planning time only).
 */
function exactArmsSql(arrays: Record<SqlProbeKind, Array<string | number>>): string {
  const p = (kind: SqlProbeKind) => `$${PROBE_PARAM_ORDER.indexOf(kind) + 2}`;
  const text = (kind: SqlProbeKind) => `${p(kind)}::text[]`;
  const ints = (kind: SqlProbeKind) => `${p(kind)}::int[]`;
  const stn = `shipping_tracking_numbers stn_p`;
  const all = `
    SELECT 'exact'::text AS arm, 'order_id'::text AS probe, o.order_id AS value, 'order'::text AS kind, o.id::bigint AS entity_id, ${EXACT_COLS}
      FROM orders o WHERE o.organization_id = $1 AND o.order_id = ANY(${text('order_id')})
    UNION ALL
    SELECT 'exact', 'order_item', o.item_number, 'order', o.id, ${EXACT_COLS}
      FROM orders o WHERE o.organization_id = $1 AND o.item_number = ANY(${text('order_item')})
    UNION ALL
    SELECT 'exact', 'tracking', stn_p.tracking_number_normalized, 'order', o.id, ${EXACT_COLS}
      FROM ${stn}
      JOIN orders o ON o.organization_id = $1 AND o.shipment_id = stn_p.id
     WHERE stn_p.organization_id = $1 AND stn_p.tracking_number_normalized = ANY(${text('tracking')})
    UNION ALL
    SELECT 'exact', 'tracking', stn_p.tracking_number_normalized, 'order', sl.owner_id::bigint, ${EXACT_COLS}
      FROM ${stn}
      JOIN shipment_links sl ON sl.organization_id = $1 AND sl.shipment_id = stn_p.id AND sl.owner_type = 'ORDER'
     WHERE stn_p.organization_id = $1 AND stn_p.tracking_number_normalized = ANY(${text('tracking')})
    UNION ALL
    SELECT 'exact', 'tracking', stn_p.tracking_number_normalized, 'receiving', r.id, ${EXACT_COLS}
      FROM ${stn}
      JOIN receiving_carton r ON r.organization_id = $1 AND r.shipment_id = stn_p.id
     WHERE stn_p.organization_id = $1 AND stn_p.tracking_number_normalized = ANY(${text('tracking')})
    UNION ALL
    SELECT 'exact', 'serial', tsn.serial_number, 'order', tsn.order_id::bigint, ${EXACT_COLS}
      FROM tech_serial_numbers tsn
     WHERE tsn.organization_id = $1 AND tsn.order_id IS NOT NULL AND tsn.serial_number = ANY(${text('serial')})
    UNION ALL
    SELECT 'exact', 'serial', su.normalized_serial, 'unit', su.id, ${EXACT_COLS}
      FROM serial_units su WHERE su.organization_id = $1 AND su.normalized_serial = ANY(${text('serial')})
    UNION ALL
    SELECT 'exact', 'sku', sc.sku, 'sku', sc.id, ${EXACT_COLS}
      FROM sku_catalog sc WHERE sc.organization_id = $1 AND sc.sku = ANY(${text('sku')})
    UNION ALL
    SELECT 'exact', 'gtin', sc.gtin, 'sku', sc.id, ${EXACT_COLS}
      FROM sku_catalog sc WHERE sc.organization_id = $1 AND sc.gtin = ANY(${text('gtin')})
    UNION ALL
    SELECT 'exact', 'gtin', sc.upc, 'sku', sc.id, ${EXACT_COLS}
      FROM sku_catalog sc WHERE sc.organization_id = $1 AND sc.upc = ANY(${text('gtin')})
    UNION ALL
    SELECT 'exact', 'gtin', sc.ean, 'sku', sc.id, ${EXACT_COLS}
      FROM sku_catalog sc WHERE sc.organization_id = $1 AND sc.ean = ANY(${text('gtin')})
    UNION ALL
    SELECT 'exact', 'gtin', CASE WHEN i.upc = ANY(${text('gtin')}) THEN i.upc ELSE i.ean END, 'sku', sc.id, ${EXACT_COLS}
      FROM items i
      JOIN sku_catalog sc ON sc.sku = i.sku AND sc.organization_id = i.organization_id
     WHERE i.organization_id = $1 AND (i.upc = ANY(${text('gtin')}) OR i.ean = ANY(${text('gtin')}))
    UNION ALL
    SELECT 'exact', 'fnsku', f.fnsku, 'sku', sc.id, ${EXACT_COLS}
      FROM fba_fnskus f
      JOIN sku_catalog sc ON sc.organization_id = f.organization_id AND sc.id = f.sku_catalog_id
     WHERE f.organization_id = $1 AND f.fnsku = ANY(${text('fnsku')})
    UNION ALL
    SELECT 'exact', 'fnsku', f.fnsku, 'sku', sc.id, ${EXACT_COLS}
      FROM fba_fnskus f
      JOIN sku_catalog sc ON sc.sku = f.sku AND sc.organization_id = f.organization_id
     WHERE f.organization_id = $1 AND f.sku_catalog_id IS NULL AND f.fnsku = ANY(${text('fnsku')})
    UNION ALL
    SELECT 'exact', 'asin', f.asin, 'sku', sc.id, ${EXACT_COLS}
      FROM fba_fnskus f
      JOIN sku_catalog sc ON sc.organization_id = f.organization_id AND sc.id = f.sku_catalog_id
     WHERE f.organization_id = $1 AND f.asin = ANY(${text('asin')})
    UNION ALL
    SELECT 'exact', 'po', r.zoho_purchaseorder_number, 'receiving', r.id, ${EXACT_COLS}
      FROM receiving_carton r WHERE r.organization_id = $1 AND r.zoho_purchaseorder_number = ANY(${text('po')})
    UNION ALL
    SELECT 'exact', 'po', r.zoho_purchaseorder_id, 'receiving', r.id, ${EXACT_COLS}
      FROM receiving_carton r WHERE r.organization_id = $1 AND r.zoho_purchaseorder_id = ANY(${text('po')})
    UNION ALL
    SELECT 'exact', 'po', r.source_order_id, 'receiving', r.id, ${EXACT_COLS}
      FROM receiving_carton r WHERE r.organization_id = $1 AND r.source_order_id = ANY(${text('po')})
    UNION ALL
    SELECT 'exact', 'receiving_id', r.id::text, 'receiving', r.id, ${EXACT_COLS}
      FROM receiving_carton r WHERE r.organization_id = $1 AND r.id = ANY(${ints('receiving_id')})
    UNION ALL
    SELECT 'exact', 'receiving_line_id', rl.id::text, 'receiving', rl.receiving_id::bigint, ${EXACT_COLS}
      FROM receiving_line rl
     WHERE rl.organization_id = $1 AND rl.receiving_id IS NOT NULL AND rl.id = ANY(${ints('receiving_line_id')})
    UNION ALL
    SELECT 'exact', 'unit_id', su.id::text, 'unit', su.id, ${EXACT_COLS}
      FROM serial_units su WHERE su.organization_id = $1 AND su.id = ANY(${ints('unit_id')})
    UNION ALL
    SELECT 'exact', 'unit_key', su.normalized_serial, 'unit', su.id, ${EXACT_COLS}
      FROM serial_units su WHERE su.organization_id = $1 AND su.normalized_serial = ANY(${text('unit_key')})
    UNION ALL
    SELECT 'exact', 'unit_key', su.unit_uid, 'unit', su.id, ${EXACT_COLS}
      FROM serial_units su WHERE su.organization_id = $1 AND su.unit_uid = ANY(${text('unit_key')})
    UNION ALL
    SELECT 'exact', 'repair_id', rs.id::text, 'repair', rs.id, ${EXACT_COLS}
      FROM repair_service rs WHERE rs.organization_id = $1 AND rs.id = ANY(${ints('repair_id')})
    UNION ALL
    SELECT 'exact', 'location_code', loc.barcode, 'location', loc.id, ${EXACT_COLS}
      FROM locations loc WHERE loc.organization_id = $1 AND loc.barcode = ANY(${text('location_code')})`;
  const kept = all.split(/\n\s*UNION ALL\n/).filter((arm) =>
    [...arm.matchAll(/\$(\d+)/g)]
      .map((m) => Number(m[1]))
      .filter((n) => n >= 2)
      .every((n) => arrays[PROBE_PARAM_ORDER[n - 2]].length > 0),
  );
  return kept.length > 0
    ? kept.join('\n    UNION ALL\n')
    : `SELECT NULL::text, NULL::text, NULL::text, NULL::text, NULL::bigint, ${EXACT_COLS} WHERE false`;
}

/** `entity_search_docs.entity_type` → identify kind. */
const DOC_KIND_SQL = `CASE d.entity_type
      WHEN 'ORDER' THEN 'order' WHEN 'SERIAL_UNIT' THEN 'unit' WHEN 'RECEIVING' THEN 'receiving'
      WHEN 'SKU' THEN 'sku' WHEN 'REPAIR' THEN 'repair' WHEN 'FBA_SHIPMENT' THEN 'fba'
      WHEN 'WARRANTY_CLAIM' THEN 'warranty' WHEN 'SUPPORT_TICKET' THEN 'ticket' WHEN 'LOCATION' THEN 'location'
    END`;

/**
 * Free-text arms. `$first…$first+6`: word lines, words, variant lines,
 * variant words, variant values, brand n-gram lines, brand n-grams.
 *
 * - Typo repair: a word found in no catalog title (and only then — the
 *   vocabulary scan is gated on it) is repaired to any edit-distance-1
 *   variant that is a title word (`bsoe` → `bose`); a term matches when the
 *   text contains the word OR one of its repairs.
 * - Brand: the line's n-grams (and its repairs) hit `product_brand_aliases`
 *   in this same statement; the brand arm then lists the SKUs whose FACT
 *   brand sits in the hit brand's subtree (`sku_catalog (organization_id,
 *   brand_id)`), narrowed by the words the alias did not consume.
 * - The trigram arm runs only for lines the SKU keyword arm found nothing for.
 */
function freeTextSql(first: number): string {
  const [wl, ww, vl, vw, vv, bl, bg] = Array.from({ length: 7 }, (_, i) => `$${first + i}`);
  const lim = FREE_TEXT_ARM_LIMIT;
  return `
  fw AS (SELECT * FROM unnest(${wl}::int[], ${ww}::text[]) AS w(line, word)),
  fv AS (SELECT * FROM unnest(${vl}::int[], ${vw}::text[], ${vv}::text[]) AS v(line, word, variant)),
  missing AS MATERIALIZED (
    SELECT w.line, w.word FROM (SELECT DISTINCT fv.line, fv.word FROM fv) w
     WHERE NOT EXISTS (
             SELECT 1 FROM sku_catalog sc
              WHERE sc.organization_id = $1 AND lower(COALESCE(sc.product_title, '')) LIKE '%' || w.word || '%'
           )
  ),
  vocab AS (
    SELECT DISTINCT tok
      FROM sku_catalog sc, regexp_split_to_table(lower(COALESCE(sc.product_title, '')), '[^a-z0-9]+') AS tok
     WHERE sc.organization_id = $1 AND tok <> '' AND EXISTS (SELECT 1 FROM missing)
  ),
  repairs AS (
    SELECT fv.line, fv.word, fv.variant
      FROM fv
      JOIN missing m ON m.line = fv.line AND m.word = fv.word
      JOIN vocab ON vocab.tok = fv.variant
  ),
  terms AS (
    SELECT fw.line, fw.word,
           ARRAY['%' || fw.word || '%']
             || COALESCE((SELECT array_agg('%' || r.variant || '%' ORDER BY r.variant)
                            FROM repairs r WHERE r.line = fw.line AND r.word = fw.word), '{}'::text[]) AS patterns
      FROM fw
  ),
  ft_lines AS (
    SELECT fw.line, string_agg(fw.word, ' ' ORDER BY fw.word) AS q FROM fw GROUP BY fw.line
  ),
  bn AS (
    SELECT * FROM unnest(${bl}::int[], ${bg}::text[]) AS n(line, ngram)
    UNION
    SELECT r.line, r.variant FROM repairs r
  ),
  alias_hits AS (
    SELECT bn.line, bn.ngram, a.source, b.id AS brand_id, b.name, b.kind, b.parent_brand_id
      FROM bn
      JOIN product_brand_aliases a
        ON a.organization_id = $1 AND a.normalized_alias = bn.ngram AND NOT a.review_only
      JOIN product_brands b ON b.id = a.brand_id AND b.organization_id = $1 AND b.is_active
  ),
  brand_tree (line, id) AS (
    SELECT DISTINCT h.line, h.brand_id FROM alias_hits h
    UNION
    SELECT t.line, c.id FROM brand_tree t
      JOIN product_brands c ON c.parent_brand_id = t.id AND c.organization_id = $1
  ),
  brand_words AS (
    SELECT fw.line, fw.word FROM fw
     WHERE NOT EXISTS (
             SELECT 1 FROM alias_hits h
              WHERE h.line = fw.line
                AND (fw.word = ANY (string_to_array(h.ngram, ' '))
                     OR EXISTS (SELECT 1 FROM repairs r
                                 WHERE r.line = fw.line AND r.word = fw.word AND r.variant = h.ngram))
           )
  ),
  kw_sku AS (
    SELECT l.line, 'keyword_sku'::text AS arm, 'sku'::text AS kind, s.id::bigint AS entity_id,
           (row_number() OVER (PARTITION BY l.line ORDER BY s.title_hit DESC, s.id DESC))::int AS arm_rank,
           s.title_hit::float8 AS score, NULL::text AS doc_title, NULL::text AS doc_subtitle,
           NULL::text AS doc_condition, s.updated_at AS happened_at
      FROM ft_lines l
      CROSS JOIN LATERAL (
        SELECT sc.id, sc.updated_at,
               CASE WHEN NOT EXISTS (
                      SELECT 1 FROM terms t
                       WHERE t.line = l.line AND NOT (lower(COALESCE(sc.product_title, '')) LIKE ANY (t.patterns))
                    ) THEN 2 ELSE 1 END AS title_hit
          FROM sku_catalog sc
         WHERE sc.organization_id = $1
           AND NOT EXISTS (
                 SELECT 1 FROM terms t
                  WHERE t.line = l.line
                    AND NOT (lower(COALESCE(sc.product_title, '') || ' ' || sc.sku) LIKE ANY (t.patterns))
               )
         ORDER BY title_hit DESC, sc.id DESC
         LIMIT ${lim}
      ) s
  ),
  ft_hits AS (
    SELECT * FROM kw_sku
    UNION ALL
    SELECT l.line, 'keyword_doc', ${DOC_KIND_SQL.replace(/\bd\./g, 'dd.')}, dd.entity_id::bigint,
           (row_number() OVER (PARTITION BY l.line ORDER BY dd.title_hit DESC, dd.happened_at DESC NULLS LAST, dd.entity_type, dd.entity_id))::int,
           dd.title_hit::float8, dd.title, dd.subtitle, dd.condition_grade, dd.happened_at
      FROM ft_lines l
      CROSS JOIN LATERAL (
        SELECT d.entity_type, d.entity_id, d.title, d.subtitle, d.condition_grade, d.happened_at,
               CASE WHEN NOT EXISTS (
                      SELECT 1 FROM terms t
                       WHERE t.line = l.line AND NOT (lower(COALESCE(d.title, '')) LIKE ANY (t.patterns))
                    ) THEN 2 ELSE 1 END AS title_hit
          FROM entity_search_docs d
         WHERE d.organization_id = $1
           AND NOT EXISTS (
                 SELECT 1 FROM terms t
                  WHERE t.line = l.line AND NOT (lower(d.search_text) LIKE ANY (t.patterns))
               )
         ORDER BY title_hit DESC, d.happened_at DESC NULLS LAST, d.entity_type, d.entity_id
         LIMIT ${lim}
      ) dd
    UNION ALL
    SELECT l.line, 'fuzzy_sku', 'sku', f.id::bigint,
           (row_number() OVER (PARTITION BY l.line ORDER BY f.sim DESC, f.id DESC))::int,
           f.sim::float8, NULL, NULL, NULL, f.updated_at
      FROM ft_lines l
      CROSS JOIN LATERAL (
        SELECT sc.id, sc.updated_at, word_similarity(l.q, lower(COALESCE(sc.product_title, ''))) AS sim
          FROM sku_catalog sc
         WHERE sc.organization_id = $1
           AND word_similarity(l.q, lower(COALESCE(sc.product_title, ''))) >= ${FUZZY_TITLE_THRESHOLD}
         ORDER BY sim DESC, sc.id DESC
         LIMIT ${lim}
      ) f
     WHERE NOT EXISTS (SELECT 1 FROM kw_sku k WHERE k.line = l.line)
    UNION ALL
    SELECT l.line, 'brand_sku', 'sku', b.id::bigint,
           (row_number() OVER (PARTITION BY l.line ORDER BY b.updated_at DESC NULLS LAST, b.id DESC))::int,
           1::float8, NULL, NULL, NULL, b.updated_at
      FROM (SELECT DISTINCT line FROM alias_hits) l
      CROSS JOIN LATERAL (
        SELECT sc.id, sc.updated_at FROM sku_catalog sc
         WHERE sc.organization_id = $1
           AND sc.brand_id IN (SELECT t.id FROM brand_tree t WHERE t.line = l.line)
           AND sc.brand_confidence >= ${SKU_BRAND_FACT_MIN_CONFIDENCE}
           AND NOT EXISTS (
                 SELECT 1 FROM brand_words bw
                  WHERE bw.line = l.line
                    AND lower(COALESCE(sc.product_title, '') || ' ' || sc.sku) NOT LIKE '%' || bw.word || '%'
               )
         ORDER BY sc.updated_at DESC NULLS LAST, sc.id DESC
         LIMIT ${lim}
      ) b
  ),`;
}

/** Enrichment: title faces, desk view, workflow signals, brand — once per distinct hit. */
function enrichSql(brandSql: string): string {
  const stage = `CASE
          WHEN ${sqlOrderInExceptionQueue('o', 'stn')} THEN 'exceptions'
          WHEN ${SHIPPED_BY_CARRIER_SQL} OR ${sqlOrderHasShipConfirm('o')} THEN 'shipped'
          WHEN ${sqlOrderBlockedPending('o')} AND ${sqlOrderHasPoPairedShortage('o')} THEN 'po'
          WHEN ${sqlOrderInWarehouseToShip('o')} AND ${sqlOrderAwaitingPick('o')} THEN 'pick'
          WHEN ${sqlOrderInWarehouseToShip('o')} THEN 'triage'
        END`;
  return `
  SELECT h.arm, h.line, h.probe, h.value, h.kind, h.entity_id, h.arm_rank, h.score,
         h.doc_title, h.doc_subtitle, h.doc_condition, h.happened_at,
         o.order_id, o.product_title AS order_title, o.account_source, o.condition AS order_condition,
         o.shipment_id, sig.desk_view, sig.has_tech_scan, sig.packed, (dock_stage.dock_staged_at IS NOT NULL) AS staged,
         o.is_out_of_stock AS out_of_stock,
         sc.sku, sc.product_title AS catalog_title, zi.name AS zoho_title,
         su.serial_number AS unit_serial, su.current_status::text AS unit_status, su.condition_grade::text AS unit_condition,
         r.zoho_purchaseorder_number AS receiving_po, stn_r.tracking_number_raw AS receiving_tracking,
         rs.product_title AS repair_title, rs.ticket_number AS repair_ticket,
         COALESCE(loc.display_name, loc.name, loc.barcode) AS location_label,
         ${brandSql} AS brand
    FROM hits h
    LEFT JOIN orders o ON h.kind = 'order' AND o.organization_id = $1 AND o.id = h.entity_id
    LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id AND stn.organization_id = $1
    LEFT JOIN serial_units su ON h.kind = 'unit' AND su.organization_id = $1 AND su.id = h.entity_id
    LEFT JOIN receiving_carton r ON h.kind = 'receiving' AND r.organization_id = $1 AND r.id = h.entity_id
    LEFT JOIN shipping_tracking_numbers stn_r ON stn_r.id = r.shipment_id AND stn_r.organization_id = $1
    LEFT JOIN repair_service rs ON h.kind = 'repair' AND rs.organization_id = $1 AND rs.id = h.entity_id
    LEFT JOIN locations loc ON h.kind = 'location' AND loc.organization_id = $1 AND loc.id = h.entity_id
    LEFT JOIN sku_catalog sc ON sc.organization_id = $1 AND sc.id = CASE h.kind WHEN 'sku' THEN h.entity_id::int WHEN 'order' THEN o.sku_catalog_id WHEN 'unit' THEN su.sku_catalog_id END
    LEFT JOIN LATERAL (
      SELECT i.name FROM items i
       WHERE i.sku = sc.sku AND i.organization_id = sc.organization_id AND i.status = 'active'
       ORDER BY i.id LIMIT 1
    ) zi ON true
    LEFT JOIN LATERAL (
      SELECT ${stage} AS desk_view,
             ${sqlOrderHasTechScan('o')} AS has_tech_scan,
             ${sqlOrderHasPackScan('o')} AS packed
       WHERE h.kind = 'order' AND o.id IS NOT NULL
    ) sig ON true
    ${DOCK_STAGING_LATERAL}`;
}

/** The whole-paste statement: exact probes + free-text and brand arms + enrichment, one round trip. */
export function buildIdentifyStatement(input: IdentifyStatementInput): { text: string; values: unknown[] } {
  const arrays = probeArrays(input.probes);
  const values: unknown[] = [input.orgId, ...PROBE_PARAM_ORDER.map((k) => arrays[k])];
  const hasFreeText = input.freeText.some((l) => l.words.length > 0);

  let ctes = `WITH RECURSIVE exact_hits (arm, probe, value, kind, entity_id, line, arm_rank, score,
                           doc_title, doc_subtitle, doc_condition, happened_at) AS (${exactArmsSql(arrays)}
  ),`;
  let hitsUnion = `SELECT DISTINCT * FROM exact_hits`;
  if (hasFreeText) {
    const first = values.length + 1;
    const lines = input.freeText.filter((l) => l.words.length > 0);
    const ngrams = lines.flatMap((l) => l.brandNgrams.map((ngram) => ({ line: l.line, ngram })));
    values.push(
      lines.flatMap((l) => l.words.map(() => l.line)),
      lines.flatMap((l) => l.words),
      lines.flatMap((l) => l.variants.map(() => l.line)),
      lines.flatMap((l) => l.variants.map((v) => v.word)),
      lines.flatMap((l) => l.variants.map((v) => v.variant)),
      ngrams.map((n) => n.line),
      ngrams.map((n) => n.ngram),
    );
    ctes += freeTextSql(first);
    hitsUnion += `
    UNION ALL
    SELECT ft.arm, NULL::text, NULL::text, ft.kind, ft.entity_id, ft.line, ft.arm_rank, ft.score,
           ft.doc_title, ft.doc_subtitle, ft.doc_condition, ft.happened_at
      FROM ft_hits ft WHERE ft.kind IS NOT NULL
    UNION ALL
    SELECT 'correction', r.variant, r.word, 'sku', 0::bigint, r.line, 0, 0::float8, NULL, NULL, NULL, NULL::timestamptz
      FROM repairs r
    UNION ALL
    SELECT 'brand_alias', h.ngram, h.source, 'brand', h.brand_id::bigint, h.line, COALESCE(h.parent_brand_id, 0),
           0::float8, h.name, h.kind, NULL, NULL::timestamptz
      FROM alias_hits h`;
  }
  ctes += `
  hits AS (${hitsUnion})`;
  const text = `${ctes}
  ${enrichSql(input.brandSql)}`;
  return { text, values };
}
