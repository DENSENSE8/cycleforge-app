/**
 * Live fixtures for the assistant eval — picked from the dev DB inside a
 * `BEGIN READ ONLY` transaction (Neon's pooler refuses the
 * `default_transaction_read_only` startup option), so the goldens assert
 * against today's stock instead of hard-coded bins that rot.
 *
 * Every pick is deterministic (ORDER BY the natural key) and constrained so a
 * text check is unambiguous: bin faces match the `A-00-00-0` shape the
 * invented-bin guard knows, quantities differ, and SKUs are plain tokens.
 */

import { Pool } from 'pg';

export interface BinQty {
  bin: string;
  qty: number;
}

export interface EvalFixtures {
  orgId: string;
  /** A SKU stocked in exactly two bins with different quantities (fullest first). */
  multiBin: { sku: string; bins: [BinQty, BinQty] };
  /** A second two-bin SKU — asked together with its second bin's contents. */
  twoTool: { sku: string; bins: [BinQty, BinQty] };
  /** Single-SKU bins: one for "what's in", one for "show me a table of". */
  binContents: { bin: string; sku: string; qty: number };
  tableBin: { bin: string; sku: string; qty: number };
  /** An FNSKU mapped to exactly one SKU that has no stock in any bin. */
  fnskuNoStock: { fnsku: string; sku: string };
  /** A GTIN/UPC unique to one SKU that is stocked in exactly one bin. */
  upcStocked: { upc: string; sku: string; bin: string; qty: number };
  /** Verified absent from every identifier table. */
  unknownSku: string;
  /** A one-row order with a shipping label AND a packing slip linked (newest first). */
  orderWithLabel: { orderNumber: string };
  /** A one-row order with no label, slip or paired paperwork on file. */
  orderNoDocs: { orderNumber: string };
}

/** The bin-face shape the invented-bin guard recognises. */
export const BIN_FACE_RE = /\b[A-Z]-\d{2}-\d{2}-\d\b/g;
const BIN_FACE_SQL = `'^[A-Z]-\\d{2}-\\d{2}-\\d$'`;
const FACE = `COALESCE(NULLIF(btrim(l.display_name), ''), l.name)`;

const STOCK_ROWS = `
  SELECT bc.location_id, ${FACE} AS face, bc.sku, bc.qty
    FROM bin_contents bc
    JOIN locations l ON l.id = bc.location_id AND l.organization_id = bc.organization_id AND l.is_active
   WHERE bc.organization_id = $1 AND bc.qty > 0`;

const TWO_BIN_SKUS = `
WITH b AS (${STOCK_ROWS})
SELECT sku, array_agg(face ORDER BY qty DESC) AS bins, array_agg(qty ORDER BY qty DESC) AS qtys
  FROM b
 GROUP BY sku
HAVING count(*) = 2 AND count(DISTINCT qty) = 2
   AND bool_and(face ~ ${BIN_FACE_SQL}) AND sku ~ '^[A-Za-z0-9-]+$'
 ORDER BY sku
 LIMIT 2`;

const SINGLE_SKU_BINS = `
WITH b AS (${STOCK_ROWS})
SELECT face AS bin, min(sku) AS sku, min(qty)::int AS qty
  FROM b
 GROUP BY location_id, face
HAVING count(*) = 1 AND face ~ ${BIN_FACE_SQL} AND min(sku) ~ '^[A-Za-z0-9-]+$'
   AND NOT EXISTS (SELECT 1 FROM handling_units hu WHERE hu.organization_id = $1 AND hu.location_id = b.location_id)
 ORDER BY face
 LIMIT 2`;

const FNSKU_NO_STOCK = `
SELECT f.fnsku, f.sku
  FROM fba_fnskus f
 WHERE f.organization_id = $1 AND f.sku IS NOT NULL AND f.fnsku ~ '^X00[A-Z0-9]{7}$'
   AND (SELECT count(DISTINCT f2.sku) FROM fba_fnskus f2
         WHERE f2.organization_id = $1 AND upper(btrim(f2.fnsku)) = upper(btrim(f.fnsku))) = 1
   AND NOT EXISTS (SELECT 1 FROM bin_contents bc WHERE bc.organization_id = $1 AND bc.sku = f.sku AND bc.qty > 0)
 ORDER BY f.fnsku
 LIMIT 1`;

const UPC_STOCKED = `
WITH u AS (
  SELECT COALESCE(sc.gtin, sc.upc, sc.ean) AS upc, sc.sku
    FROM sku_catalog sc
   WHERE sc.organization_id = $1 AND COALESCE(sc.gtin, sc.upc, sc.ean) ~ '^\\d{11,14}$'
     AND (SELECT count(*) FROM sku_catalog s2
           WHERE s2.organization_id = $1 AND COALESCE(sc.gtin, sc.upc, sc.ean) IN (s2.gtin, s2.upc, s2.ean)) = 1
)
SELECT u.upc, u.sku, min(b.face) AS bin, min(b.qty)::int AS qty
  FROM u JOIN (${STOCK_ROWS}) b ON b.sku = u.sku
 GROUP BY u.upc, u.sku
HAVING count(*) = 1 AND min(b.face) ~ ${BIN_FACE_SQL}
 ORDER BY u.upc
 LIMIT 1`;

const IDENTIFIER_EXISTS = `
SELECT EXISTS (SELECT 1 FROM sku_catalog WHERE organization_id = $1 AND upper(sku) = upper($2))
    OR EXISTS (SELECT 1 FROM bin_contents WHERE organization_id = $1 AND upper(sku) = upper($2))
    OR EXISTS (SELECT 1 FROM fba_fnskus WHERE organization_id = $1 AND upper(btrim(fnsku)) = upper($2)) AS found`;

/** Documents linked to an order row: the link hub plus legacy SHIPPING_LABEL rows (listDocumentsForOrder). */
const ORDER_DOC_TYPES = `
  SELECT d.document_type
    FROM documents d
    LEFT JOIN document_entity_links l
      ON l.document_id = d.id AND l.organization_id = $1 AND l.entity_type = 'ORDER' AND l.entity_id = o.id
   WHERE d.organization_id = $1 AND (l.document_id IS NOT NULL OR (d.entity_type = 'SHIPPING_LABEL' AND d.entity_id = o.id))`;

const ONE_ROW_ORDERS = `
  SELECT o.id, o.order_id, o.sku, o.item_number
    FROM orders o
   WHERE o.organization_id = $1 AND o.order_id ~ '^[0-9A-Za-z-]{3,40}$'
     AND (SELECT count(*) FROM orders o2 WHERE o2.organization_id = $1 AND upper(btrim(o2.order_id)) = upper(btrim(o.order_id))) = 1`;

const ORDER_WITH_LABEL = `
WITH o AS (${ONE_ROW_ORDERS})
SELECT o.order_id AS "orderNumber"
  FROM o
 WHERE EXISTS (${ORDER_DOC_TYPES} AND d.document_type = 'shipping_label')
   AND EXISTS (${ORDER_DOC_TYPES} AND d.document_type = 'packing_slip')
 ORDER BY o.id DESC
 LIMIT 1`;

const ORDER_NO_DOCS = `
WITH o AS (${ONE_ROW_ORDERS})
SELECT o.order_id AS "orderNumber"
  FROM o
 WHERE NOT EXISTS (${ORDER_DOC_TYPES})
   AND NOT EXISTS (
     SELECT 1 FROM product_manuals pm
      WHERE pm.organization_id = $1 AND pm.is_active
        AND (pm.order_id = o.id
          OR (o.item_number IS NOT NULL AND upper(btrim(pm.item_number)) = upper(btrim(o.item_number)))
          OR (o.sku IS NOT NULL AND upper(btrim(pm.sku)) = upper(btrim(o.sku)))))
 ORDER BY o.id DESC
 LIMIT 1`;

function need<T>(row: T | undefined, what: string): T {
  if (!row) throw new Error(`ai-eval fixtures: no live ${what} in this org — the golden cannot be built`);
  return row;
}

function pairOf(row: { sku: string; bins: string[]; qtys: number[] }): { sku: string; bins: [BinQty, BinQty] } {
  return {
    sku: row.sku,
    bins: [
      { bin: row.bins[0], qty: Number(row.qtys[0]) },
      { bin: row.bins[1], qty: Number(row.qtys[1]) },
    ],
  };
}

/** Run `fn` on one connection inside a READ ONLY transaction, always rolled back. */
async function readOnly<T>(fn: (q: <R>(sql: string, params: unknown[]) => Promise<R[]>) => Promise<T>): Promise<T> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set (run through `pnpm ai:eval`, which loads .env)');
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 1 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    return await fn(async (sql, params) => (await client.query(sql, params)).rows);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    await pool.end();
  }
}

export function loadFixtures(tenantSlug: string): Promise<EvalFixtures> {
  return readOnly(async (q) => {
    const [org] = await q<{ id: string }>('SELECT id FROM organizations WHERE slug = $1', [tenantSlug]);
    const orgId = need(org, `organization "${tenantSlug}"`).id;
    const pairs = await q<{ sku: string; bins: string[]; qtys: number[] }>(TWO_BIN_SKUS, [orgId]);
    const singles = await q<{ bin: string; sku: string; qty: number }>(SINGLE_SKU_BINS, [orgId]);
    const [fnsku] = await q<{ fnsku: string; sku: string }>(FNSKU_NO_STOCK, [orgId]);
    const [upc] = await q<{ upc: string; sku: string; bin: string; qty: number }>(UPC_STOCKED, [orgId]);
    const unknownSku = 'ZZ-NOPE-000';
    const [probe] = await q<{ found: boolean }>(IDENTIFIER_EXISTS, [orgId, unknownSku]);
    if (probe?.found) throw new Error(`ai-eval fixtures: "${unknownSku}" exists now — pick another unknown SKU`);
    const [withLabel] = await q<{ orderNumber: string }>(ORDER_WITH_LABEL, [orgId]);
    const [noDocs] = await q<{ orderNumber: string }>(ORDER_NO_DOCS, [orgId]);
    return {
      orgId,
      multiBin: pairOf(need(pairs[0], 'SKU stocked in two bins')),
      twoTool: pairOf(need(pairs[1], 'second SKU stocked in two bins')),
      binContents: need(singles[0], 'single-SKU bin'),
      tableBin: need(singles[1], 'second single-SKU bin'),
      fnskuNoStock: need(fnsku, 'FNSKU with no stock'),
      upcStocked: need(upc, 'UPC stocked in one bin'),
      unknownSku,
      orderWithLabel: need(withLabel, 'order with a shipping label and packing slip'),
      orderNoDocs: need(noDocs, 'order with no documents'),
    };
  });
}

/** 👎 turns (plan §B.6) — golden candidates for `--harvest`. Read-only. */
export function loadThumbsDown(
  tenantSlug: string,
  limit = 50,
): Promise<Array<{ sessionId: string; question: string | null; answer: string; note: string | null; at: string }>> {
  return readOnly(async (q) => {
    const rows = await q<Record<string, unknown>>(
      `SELECT m.session_id, m.content AS answer, m.feedback_note AS note, m.feedback_at AS at,
              (SELECT u.content FROM ai_chat_messages u
                WHERE u.organization_id = m.organization_id AND u.session_id = m.session_id
                  AND u.role = 'user' AND u.id < m.id AND u.superseded_at IS NULL
                ORDER BY u.id DESC LIMIT 1) AS question
         FROM ai_chat_messages m
        WHERE m.organization_id = (SELECT id FROM organizations WHERE slug = $1)
          AND m.feedback = -1
        ORDER BY m.feedback_at DESC
        LIMIT $2`,
      [tenantSlug, limit],
    );
    return rows.map((row) => ({
      sessionId: String(row.session_id),
      question: typeof row.question === 'string' ? row.question : null,
      answer: String(row.answer ?? ''),
      note: typeof row.note === 'string' ? row.note : null,
      at: new Date(String(row.at)).toISOString(),
    }));
  });
}
