/**
 * PO ↔ outbound order link — `receiving_order_link` relation `fulfills`
 * (migration 2026-09-27p): "this purchase order was bought for order 1125".
 *
 * The PO end is the internal PO header (`inbound_order`) plus its inbound
 * carton when it has one; the order end is the order NUMBER
 * (`orders.order_id` — one order may be several line rows) with the first
 * line row as `local_order_id`. One edge per (PO, order); a re-link is a no-op.
 *
 * Writer (inside the caller's tenant transaction, org stamped from ctx): the
 * `receiving.link_order` agent mutation (`link_po_to_order`) — link or
 * unlink an existing PO, each the other's inverse.
 * Readers: the order timeline payload (`poLinks`) and the carton payload
 * (`order_links`), which the order and carton records render as related links.
 */

import { z } from 'zod';
import type { OrgId } from '@/lib/tenancy/constants';

export interface LinkTx {
  query<T = Record<string, unknown>>(text: string, params?: ReadonlyArray<unknown>): Promise<{ rows: T[]; rowCount: number | null }>;
}

type Rows = Array<Record<string, unknown>>;
export type LinkQuery = (orgId: OrgId, text: string, params: ReadonlyArray<unknown>) => Promise<{ rows: Rows }>;

// ─── payload (the agent mutation's link list) ───────────────────────────────

export const linkedOrderSchema = z
  .object({
    orderNumber: z.string().trim().min(1).max(120),
    localOrderId: z.number().int().positive().nullable(),
    channel: z.string().trim().max(60).nullable(),
  })
  .strict();
export type LinkedOrder = z.infer<typeof linkedOrderSchema>;

export const poAnchorSchema = z
  .object({
    poNumber: z.string().trim().min(1).max(120),
    inboundOrderId: z.number().int().positive().nullable(),
    receivingId: z.number().int().positive().nullable(),
  })
  .strict()
  .refine((a) => a.inboundOrderId != null || a.receivingId != null, 'the PO needs an inbound order or a carton');
export type PoAnchor = z.infer<typeof poAnchorSchema>;

export const poOrderLinkPayloadSchema = z
  .object({
    op: z.enum(['link', 'unlink']),
    po: poAnchorSchema,
    orders: z.array(linkedOrderSchema).min(1).max(20),
    /** Who proposed it — stamped on a created edge. */
    staffId: z.number().int().positive().nullable().optional(),
  })
  .strict();
export type PoOrderLinkPayload = z.infer<typeof poOrderLinkPayloadSchema>;

export const PO_ORDER_LINK_KIND = 'receiving.link_order' as const;

type ApplyResult =
  | { ok: true; inverse: { kind: string; payload: Record<string, unknown> } | null; targetRef: string | null }
  | { ok: false; status: 400 | 404 | 409; error: string };

/**
 * The `receiving.link_order` agent mutation (review class: applied by the
 * operator's next-turn yes). Link and unlink are each other's inverse, over
 * exactly the edges this apply changed. `targetRef` is the PO number.
 */
export async function applyPoOrderLinkInTx(client: LinkTx, orgId: OrgId, payload: Record<string, unknown>): Promise<ApplyResult> {
  const parsed = poOrderLinkPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.map(String).join('.') || '(payload)'}: ${i.message}`).join('; ');
    return { ok: false, status: 400, error: `invalid ${PO_ORDER_LINK_KIND} payload — ${detail}` };
  }
  const p = parsed.data;
  const r =
    p.op === 'link'
      ? await linkPoToOrdersInTx(client, orgId, p.po, p.orders, 'assistant', p.staffId ?? null)
      : await unlinkPoFromOrdersInTx(client, orgId, p.po, p.orders);
  return {
    ok: true,
    inverse:
      r.changed.length > 0
        ? { kind: PO_ORDER_LINK_KIND, payload: { op: p.op === 'link' ? 'unlink' : 'link', po: p.po, orders: r.changed, staffId: p.staffId ?? null } }
        : null,
    targetRef: p.po.poNumber,
  };
}

// ─── resolve: a PO number / tracking → its anchor ────────────────────────────

/**
 * The PO a number names: its PO number (manual / marketplace link, Zoho PO
 * number, or the inbound order header), or a tracking number linked to its
 * carton. A number match beats a tracking match, and a line with a carton
 * beats one without. A PO matched by its number keeps the number as typed.
 */
const PO_NUMBER_MATCH = `(
       EXISTS (SELECT 1 FROM inbound_purchase_order_links l
                WHERE l.organization_id = rl.organization_id AND l.receiving_line_id = rl.id
                  AND UPPER(TRIM(l.source_order_id)) = UPPER(TRIM($2::text)))
       OR EXISTS (SELECT 1 FROM receiving_line_zoho rz
                   WHERE rz.organization_id = rl.organization_id AND rz.receiving_line_id = rl.id
                     AND UPPER(TRIM(rz.zoho_purchaseorder_number)) = UPPER(TRIM($2::text)))
       OR EXISTS (SELECT 1 FROM inbound_order io
                   WHERE io.organization_id = rl.organization_id AND io.id = rl.inbound_order_id
                     AND (io.external_order_id_norm = inbound_order_number_norm($2)
                          OR inbound_order_number_norm(io.order_number) = inbound_order_number_norm($2))))`;

const PO_ANCHOR_SQL = `WITH hit AS (
  SELECT rl.id, rl.receiving_id, rl.inbound_order_id, ${PO_NUMBER_MATCH} AS by_number
    FROM receiving_line rl
   WHERE rl.organization_id = $1
     AND (
       ${PO_NUMBER_MATCH}
       OR rl.receiving_id IN (
            SELECT sl.owner_id FROM shipping_tracking_numbers stn
              JOIN shipment_links sl ON sl.organization_id = stn.organization_id AND sl.shipment_id = stn.id
                                    AND sl.owner_type = 'RECEIVING'
             WHERE stn.organization_id = $1 AND stn.tracking_number_normalized = $3)
     )
)
SELECT h.receiving_id, h.inbound_order_id,
       CASE WHEN h.by_number THEN UPPER(TRIM($2::text)) ELSE
       COALESCE(NULLIF(io.order_number, ''), io.external_order_id,
                (SELECT l.source_order_id FROM inbound_purchase_order_links l
                  WHERE l.organization_id = $1 AND l.receiving_line_id = h.id LIMIT 1),
                (SELECT rz.zoho_purchaseorder_number FROM receiving_line_zoho rz
                  WHERE rz.organization_id = $1 AND rz.receiving_line_id = h.id LIMIT 1)) END AS po_number,
       io.vendor_name
  FROM hit h
  LEFT JOIN inbound_order io ON io.id = h.inbound_order_id AND io.organization_id = $1
 ORDER BY h.by_number DESC, (h.receiving_id IS NULL), h.receiving_id, h.id
 LIMIT 1`;

export interface ResolvedPo extends PoAnchor {
  vendor: string | null;
}

/** `ref` as typed; `trackingKey` its canonical tracking form (the caller's `extractCanonicalTracking`). */
export async function resolvePoAnchor(query: LinkQuery, orgId: OrgId, ref: string, trackingKey: string): Promise<ResolvedPo | null> {
  const row = (await query(orgId, PO_ANCHOR_SQL, [orgId, ref.trim(), trackingKey || ref.trim()])).rows[0];
  if (!row) return null;
  const receivingId = row.receiving_id == null ? null : Number(row.receiving_id);
  const inboundOrderId = row.inbound_order_id == null ? null : Number(row.inbound_order_id);
  if (receivingId == null && inboundOrderId == null) return null;
  return {
    poNumber: String(row.po_number ?? '').trim() || ref.trim(),
    inboundOrderId,
    receivingId,
    vendor: typeof row.vendor_name === 'string' && row.vendor_name.trim() ? row.vendor_name.trim() : null,
  };
}

/** Order numbers → one link target each (first line row, its channel). */
const ORDER_TARGETS_SQL = `SELECT o.order_id, MIN(o.id) AS id, MIN(o.account_source) AS account_source
  FROM orders o
 WHERE o.organization_id = $1 AND o.order_id = ANY($2::text[])
 GROUP BY o.order_id`;

export async function orderLinkTargets(query: LinkQuery, orgId: OrgId, orderNumbers: readonly string[]): Promise<LinkedOrder[]> {
  if (orderNumbers.length === 0) return [];
  const rows = (await query(orgId, ORDER_TARGETS_SQL, [orgId, [...new Set(orderNumbers)]])).rows;
  const byNumber = new Map(rows.map((r) => [String(r.order_id), r]));
  return orderNumbers.flatMap((n) => {
    const r = byNumber.get(n);
    return r ? [{ orderNumber: n, localOrderId: Number(r.id), channel: (r.account_source as string | null) ?? null }] : [];
  });
}

// ─── write ───────────────────────────────────────────────────────────────────

const INSERT_SQL = `INSERT INTO receiving_order_link (
     organization_id, relation, receiving_id, inbound_order_id, po_number,
     external_order_id, channel, local_order_id, source, created_by_staff_id
   ) VALUES ($1, 'fulfills', $2, $3, $4, $5, $6, $7, $8, $9)
   ON CONFLICT DO NOTHING
   RETURNING id`;

const PO_MATCH = `(($2::bigint IS NOT NULL AND inbound_order_id = $2) OR ($3::int IS NOT NULL AND receiving_id = $3))`;

const DELETE_SQL = `DELETE FROM receiving_order_link
 WHERE organization_id = $1 AND relation = 'fulfills' AND ${PO_MATCH}
   AND UPPER(external_order_id) = UPPER($4)
 RETURNING external_order_id, local_order_id, channel`;

export interface LinkWriteResult {
  /** The orders whose edge this call created (link) or removed (unlink). */
  changed: LinkedOrder[];
}

/** Create one `fulfills` edge per order (existing ones are left as they are). */
export async function linkPoToOrdersInTx(
  client: LinkTx,
  orgId: OrgId,
  po: PoAnchor,
  orders: readonly LinkedOrder[],
  source: string,
  staffId: number | null,
): Promise<LinkWriteResult> {
  const changed: LinkedOrder[] = [];
  for (const o of orders) {
    const r = await client.query(INSERT_SQL, [
      orgId,
      po.receivingId,
      po.inboundOrderId,
      po.poNumber,
      o.orderNumber,
      o.channel,
      o.localOrderId,
      source,
      staffId,
    ]);
    if (r.rows.length > 0) changed.push(o);
  }
  return { changed };
}

/** Remove the PO's edge to each order (a missing edge is not an error). */
export async function unlinkPoFromOrdersInTx(
  client: LinkTx,
  orgId: OrgId,
  po: PoAnchor,
  orders: readonly LinkedOrder[],
): Promise<LinkWriteResult> {
  const changed: LinkedOrder[] = [];
  for (const o of orders) {
    const r = await client.query<{ external_order_id: string; local_order_id: number | null; channel: string | null }>(DELETE_SQL, [
      orgId,
      po.inboundOrderId,
      po.receivingId,
      o.orderNumber,
    ]);
    const gone = r.rows[0];
    if (gone) {
      changed.push({
        orderNumber: gone.external_order_id,
        localOrderId: gone.local_order_id == null ? null : Number(gone.local_order_id),
        channel: gone.channel ?? null,
      });
    }
  }
  return { changed };
}

/** The orders this PO is already linked to. */
const PO_LINKS_SQL = `SELECT external_order_id, local_order_id, channel
  FROM receiving_order_link
 WHERE organization_id = $1 AND relation = 'fulfills' AND ${PO_MATCH}
 ORDER BY id`;

export async function readPoOrderLinks(query: LinkQuery, orgId: OrgId, po: Pick<PoAnchor, 'inboundOrderId' | 'receivingId'>): Promise<LinkedOrder[]> {
  const rows = (await query(orgId, PO_LINKS_SQL, [orgId, po.inboundOrderId, po.receivingId])).rows;
  return rows.map((r) => ({
    orderNumber: String(r.external_order_id),
    localOrderId: r.local_order_id == null ? null : Number(r.local_order_id),
    channel: (r.channel as string | null) ?? null,
  }));
}

// ─── read: each record names the other ───────────────────────────────────────

/** A purchase order an outbound order is waiting on (the order record's side). */
export interface OrderPoLink {
  poNumber: string;
  receivingId: number | null;
  vendor: string | null;
}

/** The order's links — by any of its line rows or by its order number. */
export const ORDER_PO_LINKS_SQL = `SELECT DISTINCT ON (COALESCE(l.inbound_order_id, 0), COALESCE(l.receiving_id, 0))
       l.po_number, l.receiving_id, io.vendor_name
  FROM receiving_order_link l
  LEFT JOIN inbound_order io ON io.id = l.inbound_order_id AND io.organization_id = l.organization_id
 WHERE l.organization_id = $1 AND l.relation = 'fulfills'
   AND (l.local_order_id = $2
        OR UPPER(l.external_order_id) = (SELECT UPPER(o.order_id) FROM orders o WHERE o.id = $2 AND o.organization_id = $1))
 ORDER BY COALESCE(l.inbound_order_id, 0), COALESCE(l.receiving_id, 0), l.id
 LIMIT 20`;

export function toOrderPoLinks(rows: Rows): OrderPoLink[] {
  return rows.map((r) => ({
    poNumber: String(r.po_number ?? '').trim() || 'PO',
    receivingId: r.receiving_id == null ? null : Number(r.receiving_id),
    vendor: typeof r.vendor_name === 'string' && r.vendor_name.trim() ? r.vendor_name.trim() : null,
  }));
}

/** An outbound order a carton's PO was bought for (the carton record's side). */
export interface CartonOrderLink {
  orderNumber: string;
  orderId: number | null;
  channel: string | null;
  poNumber: string | null;
}

/** The carton's links — its own, and its lines' PO headers'. */
export const CARTON_ORDER_LINKS_SQL = `SELECT DISTINCT ON (UPPER(l.external_order_id))
       l.external_order_id, l.local_order_id, l.channel, l.po_number
  FROM receiving_order_link l
 WHERE l.organization_id = $1 AND l.relation = 'fulfills'
   AND (l.receiving_id = $2
        OR l.inbound_order_id IN (SELECT rl.inbound_order_id FROM receiving_line rl
                                   WHERE rl.organization_id = $1 AND rl.receiving_id = $2
                                     AND rl.inbound_order_id IS NOT NULL))
 ORDER BY UPPER(l.external_order_id), l.id
 LIMIT 20`;

export function toCartonOrderLinks(rows: Rows): CartonOrderLink[] {
  return rows.map((r) => ({
    orderNumber: String(r.external_order_id),
    orderId: r.local_order_id == null ? null : Number(r.local_order_id),
    channel: (r.channel as string | null) ?? null,
    poNumber: (r.po_number as string | null) ?? null,
  }));
}
