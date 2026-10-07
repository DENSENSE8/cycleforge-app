import type { PoolClient } from 'pg';
import pool from '@/lib/db';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { registerShipmentPermissive } from '@/lib/shipping/sync-shipment';
import { linkShipment, setPrimaryShipmentLink, unlinkShipment } from '@/lib/shipping/shipment-links';
import type { OrgId } from '@/lib/tenancy/constants';
import { SHIPMENT_SCAN_MATCH_CONDITION } from '@/lib/receiving/delivered-unscanned';

/** Tenant-tx or pool — ingest threads the GUC client so carton writes aren't RLS-blind. */
type SqlClient = {
  query: <T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

/** Shared core for the multi-tracking → PO feature (docs/multi-tracking-po-plan.md). */

export interface AttachedBox {
  id: number;
  shipment_id: number;
  box_seq: number;
  is_primary: boolean;
  received_at: string | null;
  tracking_number: string | null;
  carrier: string | null;
  status_category: string | null;
  is_delivered: boolean | null;
}

export type AttachBoxResult =
  | { ok: false; error: string; status: number }
  | {
      ok: true;
      shipmentId: number;
      alreadyAttached: boolean;
      boxSeq: number | null;
      isPrimary: boolean | null;
      boxCount: number;
      boxes: AttachedBox[];
    };

/** Full box list for a carton — what both attach routes return after a POST. */
export async function listBoxesForReceiving(
  receivingId: number,
  db: Pick<PoolClient, 'query'> = pool,
): Promise<AttachedBox[]> {
  const boxesRes = await db.query<AttachedBox>(
    `SELECT rs.id, rs.shipment_id, rs.box_seq, rs.is_primary,
            to_char(rs.linked_at::timestamp, 'YYYY-MM-DD HH24:MI:SS') AS received_at,
            stn.tracking_number_raw                 AS tracking_number,
            NULLIF(stn.carrier, 'UNKNOWN')          AS carrier,
            stn.latest_status_category              AS status_category,
            stn.is_delivered                        AS is_delivered
       FROM shipment_links rs
       JOIN shipping_tracking_numbers stn ON stn.id = rs.shipment_id
      WHERE rs.owner_type = 'RECEIVING' AND rs.owner_id = $1
      ORDER BY rs.box_seq ASC, rs.id ASC`,
    [receivingId],
  );
  return boxesRes.rows;
}

/** Attach a tracking number to a receiving carton as a box. */
export async function attachBoxToReceiving(params: {
  receivingId: number;
  trackingNumber: string;
  staffId: number | null;
  /**
   * Tenant scope. The attach runs under the `app.current_org` GUC so RLS on
   * `receiving` / `receiving_shipments` (both FORCEd) isolates it; the
   * org-stamping subqueries align with the GUC's WITH CHECK. Required.
   */
  organizationId: string;
}): Promise<AttachBoxResult> {
  const tracking = params.trackingNumber.trim();
  if (!tracking) return { ok: false, error: 'trackingNumber is required', status: 400 };

  const { receivingId, staffId, organizationId } = params;

  return withTenantTransaction<AttachBoxResult>(organizationId, async (client) => {
    // Who received the carton lives on its triage row now (`receiving_triage.door_received_by`, 2026-07-11d).
    const cartonRes = await client.query<{ shipment_id: number | null; received_by: number | null }>(
      `SELECT r.shipment_id, rt.door_received_by AS received_by
         FROM receiving_carton r
         LEFT JOIN receiving_triage rt ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
        WHERE r.id = $1 AND r.organization_id = $2
        LIMIT 1`,
      [receivingId, organizationId],
    );
    const carton = cartonRes.rows[0];
    if (!carton) return { ok: false, error: 'Receiving carton not found', status: 404 };

    const shipment = await registerShipmentPermissive({
      trackingNumber: tracking,
      sourceSystem: 'receiving.attach-box',
    }, organizationId);
    if (!shipment?.id) {
      return { ok: false, error: 'Could not register that tracking number', status: 422 };
    }
    const shipmentId = Number(shipment.id);

    // Self-heal: ensure the carton's primary box (reference# anchor) exists in
    // shipment_links before we add an extra (covers cartons the backfill hasn't
    // reached). linkShipment upserts idempotently on (org, owner, shipment).
    if (carton.shipment_id) {
      await linkShipment(
        organizationId,
        {
          ownerType: 'RECEIVING', ownerId: receivingId, shipmentId: carton.shipment_id,
          direction: 'INBOUND', boxSeq: 1, isPrimary: true, role: 'PO_ANCHOR',
          linkedBy: carton.received_by ?? null, source: 'receiving.attach-box',
        },
        client,
      );
    }

    // Already attached? (an idempotent re-attach must not double-count.)
    const existingBox = await client.query(
      `SELECT 1 FROM shipment_links WHERE owner_type = 'RECEIVING' AND owner_id = $1 AND shipment_id = $2 LIMIT 1`,
      [receivingId, shipmentId],
    );
    const alreadyAttached = existingBox.rows.length > 0;

    // No primary yet (carton scanned/created with no reference# anchor) → the first
    // attached box becomes the primary so "exactly one primary per carton" holds.
    const primaryRes = await client.query(
      `SELECT 1 FROM shipment_links WHERE owner_type = 'RECEIVING' AND owner_id = $1 AND is_primary LIMIT 1`,
      [receivingId],
    );
    const makePrimary = primaryRes.rows.length === 0;

    let boxSeq: number | null = null;
    let boxIsPrimary: boolean | null = null;
    if (!alreadyAttached) {
      const box = await linkShipment(
        organizationId,
        {
          ownerType: 'RECEIVING', ownerId: receivingId, shipmentId,
          direction: 'INBOUND', isPrimary: makePrimary,
          role: makePrimary ? 'PO_ANCHOR' : 'EXTRA_BOX',
          linkedBy: staffId, source: 'receiving.attach-box',
        },
        client,
      );
      boxSeq = box.box_seq;
      boxIsPrimary = box.is_primary;

      // When this box became the carton's primary anchor, stamp receiving_carton.shipment_id
      // (only if empty — never overwrite the reference# anchor). A carton the dock already
      // scanned is never anchored to a box added afterwards: the scan match reads every scan
      // of an anchored carton as that shipment's scan (`SHIPMENT_SCAN_MATCH_CONDITION`), so the
      // new, unarrived tracking would read "scanned at dock".
      if (makePrimary && !carton.shipment_id) {
        await client.query(
          `UPDATE receiving_carton SET shipment_id = $2, updated_at = NOW()
           WHERE id = $1 AND shipment_id IS NULL
             AND NOT EXISTS (SELECT 1 FROM receiving_scans rs WHERE rs.receiving_id = $1)`,
          [receivingId, shipmentId],
        );
      }
    } else {
      const cur = await client.query<{ box_seq: number; is_primary: boolean }>(
        `SELECT box_seq, is_primary FROM shipment_links
          WHERE owner_type = 'RECEIVING' AND owner_id = $1 AND shipment_id = $2 LIMIT 1`,
        [receivingId, shipmentId],
      );
      boxSeq = cur.rows[0]?.box_seq ?? null;
      boxIsPrimary = cur.rows[0]?.is_primary ?? null;
    }

    // Read on the SAME tx client so it sees the just-inserted (uncommitted) box.
    const boxes = await listBoxesForReceiving(receivingId, client);

    return {
      ok: true,
      shipmentId,
      alreadyAttached,
      boxSeq,
      isPrimary: boxIsPrimary,
      boxCount: boxes.length,
      boxes,
    };
  });
}

export type DetachBoxResult =
  | { ok: false; error: string; status: number }
  | { ok: true; boxCount: number; boxes: AttachedBox[] };

/** How long after its attach a box may still be taken back (the toast's Undo, a stale tab). */
const DETACH_WINDOW = '15 minutes';

/**
 * Undo {@link attachBoxToReceiving}: drop one box link from a carton. Touches
 * links only — never a scan, a door receipt or an unbox, so nothing physical
 * is rewritten. Only a box this writer linked in the last
 * {@link DETACH_WINDOW} is detachable — never a reference# anchor or an
 * ingest-linked box — and never one the dock has scanned since (by the
 * Check's own scan match, `SHIPMENT_SCAN_MATCH_CONDITION`: it is evidence
 * now, not a typo). When the dropped box was the carton's primary, the next
 * box (lowest `box_seq`) becomes the primary anchor, else the carton is left
 * without one — exactly as before the attach.
 */
export async function detachBoxFromReceiving(params: {
  receivingId: number;
  shipmentId: number;
  organizationId: string;
}): Promise<DetachBoxResult> {
  const { receivingId, shipmentId, organizationId } = params;
  const orgId = organizationId as OrgId;
  return withTenantTransaction<DetachBoxResult>(organizationId, async (client) => {
    const carton = await client.query<{ shipment_id: number | null }>(
      `SELECT shipment_id FROM receiving_carton WHERE id = $1 AND organization_id = $2 LIMIT 1 FOR UPDATE`,
      [receivingId, organizationId],
    );
    if (!carton.rows[0]) return { ok: false, error: 'Receiving carton not found', status: 404 };
    const link = await client.query<{ is_primary: boolean; fresh: boolean }>(
      `SELECT is_primary,
              (source = 'receiving.attach-box' AND linked_at > NOW() - INTERVAL '${DETACH_WINDOW}') AS fresh
         FROM shipment_links
        WHERE organization_id = $1 AND owner_type = 'RECEIVING' AND owner_id = $2 AND shipment_id = $3 LIMIT 1`,
      [organizationId, receivingId, shipmentId],
    );
    if (!link.rows[0]) return { ok: false, error: 'That tracking number is not on this purchase', status: 404 };
    if (!link.rows[0].fresh) {
      return { ok: false, error: 'Only a tracking number added in the last 15 minutes can be undone', status: 409 };
    }
    const scanned = await client.query(
      `SELECT 1
         FROM shipping_tracking_numbers stn
         JOIN receiving_scans rs ON rs.organization_id = $1 AND rs.receiving_id = $2
         JOIN receiving_carton r2 ON r2.id = rs.receiving_id
        WHERE stn.id = $3 AND ${SHIPMENT_SCAN_MATCH_CONDITION}
        LIMIT 1`,
      [organizationId, receivingId, shipmentId],
    );
    if (scanned.rows.length > 0) {
      return { ok: false, error: 'That box was already scanned here — it can no longer be undone', status: 409 };
    }

    await unlinkShipment(orgId, 'RECEIVING', receivingId, shipmentId, client);
    const next = await client.query<{ shipment_id: number }>(
      `SELECT shipment_id FROM shipment_links
        WHERE organization_id = $1 AND owner_type = 'RECEIVING' AND owner_id = $2
        ORDER BY is_primary DESC, box_seq ASC, shipment_id ASC
        LIMIT 1`,
      [organizationId, receivingId],
    );
    // pg hands bigint ids over as strings — compare as numbers.
    const heir = next.rows[0]?.shipment_id != null ? Number(next.rows[0].shipment_id) : null;
    if (link.rows[0].is_primary && heir != null) {
      await setPrimaryShipmentLink(orgId, 'RECEIVING', receivingId, heir, client);
      // The new primary is the carton's anchor box now.
      await client.query(
        `UPDATE shipment_links SET role = 'PO_ANCHOR', updated_at = NOW()
          WHERE organization_id = $1 AND owner_type = 'RECEIVING' AND owner_id = $2 AND shipment_id = $3`,
        [organizationId, receivingId, heir],
      );
    }
    if (carton.rows[0].shipment_id != null && Number(carton.rows[0].shipment_id) === shipmentId) {
      await client.query(
        `UPDATE receiving_carton SET shipment_id = $2, updated_at = NOW() WHERE id = $1 AND organization_id = $3`,
        [receivingId, heir, organizationId],
      );
    }
    const boxes = await listBoxesForReceiving(receivingId, client);
    return { ok: true, boxCount: boxes.length, boxes };
  });
}

/** A marketplace / manual purchase (`inbound_order`, `receiving_type = 'PO'`) by its order number. */
interface InboundPurchaseHit {
  inboundOrderId: number;
  sourceType: 'ebay' | 'amazon' | 'manual';
  sourceOrderId: string;
}

/**
 * The ONE open marketplace / manual purchase whose order number matches
 * `orderNumber` (punctuation and case ignored — the number Purchasing lists),
 * or null when none or several (two platforms sharing a number) match.
 */
async function findInboundPurchase(db: SqlClient, organizationId: string, orderNumber: string): Promise<InboundPurchaseHit | null> {
  const { rows } = await db.query<{ id: number; source_type: InboundPurchaseHit['sourceType']; external_order_id: string }>(
    `SELECT id, source_type, btrim(external_order_id) AS external_order_id
       FROM inbound_order
      WHERE organization_id = $1::uuid
        AND source_type IN ('ebay', 'amazon', 'manual')
        AND receiving_type = 'PO'
        AND status <> 'cancelled'
        AND upper(regexp_replace(external_order_id, '[^A-Za-z0-9]', '', 'g')) = upper(regexp_replace($2, '[^A-Za-z0-9]', '', 'g'))
      LIMIT 2`,
    [organizationId, orderNumber],
  );
  if (rows.length !== 1) return null;
  return { inboundOrderId: Number(rows[0].id), sourceType: rows[0].source_type, sourceOrderId: rows[0].external_order_id };
}

/**
 * Read-only: the carton of a marketplace / manual purchase — its lines'
 * carton, else the pre-arrival carton by order number — or null.
 */
export async function findInboundPurchaseCarton(organizationId: string, orderNumber: string): Promise<number | null> {
  return withTenantTransaction<number | null>(organizationId, async (client) => {
    const db = client as unknown as SqlClient;
    const hit = await findInboundPurchase(db, organizationId, orderNumber);
    if (!hit) return null;
    const { rows } = await db.query<{ id: number }>(
      `SELECT receiving_id AS id FROM receiving_line
        WHERE organization_id = $1::uuid AND inbound_order_id = $2 AND receiving_id IS NOT NULL
       UNION ALL
       SELECT id FROM receiving_carton
        WHERE organization_id = $1::uuid AND source = $3 AND source_order_id = $4
       LIMIT 1`,
      [organizationId, hit.inboundOrderId, hit.sourceType, hit.sourceOrderId],
    );
    return rows[0] ? Number(rows[0].id) : null;
  });
}

/**
 * Get-or-create the carton of a marketplace / manual purchase by order number
 * (`ensureReceivingForInboundOrder`), its unlinked lines joined to it — the
 * same join the desk's identity edit makes. Creates no scan, receipt or unbox.
 */
export async function ensureReceivingForInboundPurchase(
  organizationId: string,
  orderNumber: string,
): Promise<(InboundPurchaseHit & { receivingId: number }) | null> {
  return withTenantTransaction(organizationId, async (client) => {
    const db = client as unknown as SqlClient;
    const hit = await findInboundPurchase(db, organizationId, orderNumber);
    if (!hit) return null;
    const receivingId = await ensureReceivingForInboundOrder({ ...hit, organizationId, db });
    await db.query(
      `UPDATE receiving_line SET receiving_id = $1, updated_at = NOW()
        WHERE organization_id = $2::uuid AND inbound_order_id = $3 AND receiving_id IS NULL`,
      [receivingId, organizationId, hit.inboundOrderId],
    );
    return { ...hit, receivingId };
  });
}

/** Get-or-create the receiving carton for a PO — local only, no Zoho round-trip — so a tracking can be attached BEFORE the box physically… */
export async function ensureReceivingForPo(params: {
  poId: string;
  poNumber?: string | null;
  organizationId: string;
}): Promise<number> {
  const result = await pool.query<{ id: number }>(
    // Base table (not the `receiving` compat view): ON CONFLICT is unsupported on
    // auto-updatable views. 2026-07-05d.
    `INSERT INTO receiving_carton
       (source, zoho_purchaseorder_id, zoho_purchaseorder_number, qa_status, needs_test, updated_at, organization_id)
     VALUES ('zoho_po', $1, $2, 'PENDING', true, NOW(), $3::uuid)
     ON CONFLICT (zoho_purchaseorder_id) WHERE source = 'zoho_po' AND zoho_purchaseorder_id IS NOT NULL
     DO UPDATE SET
       updated_at = NOW(),
       zoho_purchaseorder_number = COALESCE(receiving_carton.zoho_purchaseorder_number, EXCLUDED.zoho_purchaseorder_number),
       organization_id = COALESCE(receiving_carton.organization_id, EXCLUDED.organization_id)
     RETURNING id`,
    [params.poId, params.poNumber ?? null, params.organizationId],
  );
  return Number(result.rows[0].id);
}

/** Get-or-create the receiving carton for an eBay purchase order — local only — so a tracking can be registered BEFORE the box physically… */
async function ensureReceivingForEbayOrder(params: {
  sourceOrderId: string;
  shipmentId?: number | null;
  organizationId: string;
  db?: SqlClient;
}): Promise<number> {
  const sourceOrderId = String(params.sourceOrderId ?? '').trim();
  if (!sourceOrderId) throw new Error('ensureReceivingForEbayOrder: sourceOrderId is required');
  const db = params.db ?? (pool as unknown as SqlClient);

  const result = await db.query<{ id: number }>(
    // Base table (not the `receiving` compat view): ON CONFLICT is unsupported on
    // auto-updatable views. 2026-07-05d.
    `INSERT INTO receiving_carton
       (source, source_order_id, shipment_id, qa_status, needs_test, updated_at, organization_id)
     VALUES ('ebay', $1, $2, 'PENDING', true, NOW(), $3::uuid)
     ON CONFLICT (organization_id, source_order_id)
       WHERE source = 'ebay' AND source_order_id IS NOT NULL
     DO UPDATE SET
       updated_at = NOW(),
       shipment_id = COALESCE(receiving_carton.shipment_id, EXCLUDED.shipment_id),
       organization_id = COALESCE(receiving_carton.organization_id, EXCLUDED.organization_id)
     RETURNING id`,
    [sourceOrderId, params.shipmentId ?? null, params.organizationId],
  );
  return Number(result.rows[0].id);
}

/** Get-or-create a pre-arrival carton for an inbound marketplace / manual order so tracking can soft-join on Incoming before the door scan. */
export async function ensureReceivingForInboundOrder(params: {
  sourceType: 'ebay' | 'amazon' | 'manual';
  sourceOrderId: string;
  shipmentId?: number | null;
  organizationId: string;
  /** Tenant-tx client when called from ingest — carton writes must share the GUC. */
  db?: SqlClient;
  /**
   * The internal order the carton is for. When set, the carton is found by
   * the order's own lines — never by (source, order number), which two
   * platforms' identical order numbers would share.
   */
  inboundOrderId?: number | null;
}): Promise<number> {
  if (params.sourceType === 'ebay') {
    return ensureReceivingForEbayOrder(params);
  }

  const sourceOrderId = String(params.sourceOrderId ?? '').trim();
  if (!sourceOrderId) {
    throw new Error('ensureReceivingForInboundOrder: sourceOrderId is required');
  }
  const source = params.sourceType;
  const db = params.db ?? (pool as unknown as SqlClient);

  const existing = params.inboundOrderId != null
    ? await db.query<{ id: number }>(
        `SELECT rl.receiving_id AS id FROM receiving_line rl
          WHERE rl.organization_id = $1::uuid AND rl.inbound_order_id = $2 AND rl.receiving_id IS NOT NULL
          ORDER BY rl.id
          LIMIT 1`,
        [params.organizationId, params.inboundOrderId],
      )
    : await db.query<{ id: number }>(
        `SELECT id FROM receiving_carton
          WHERE organization_id = $1::uuid
            AND source = $2
            AND source_order_id = $3
          ORDER BY id
          LIMIT 1`,
        [params.organizationId, source, sourceOrderId],
      );
  if (existing.rows[0]) {
    const id = Number(existing.rows[0].id);
    if (params.shipmentId != null) {
      await db.query(
        `UPDATE receiving_carton
            SET shipment_id = COALESCE(shipment_id, $2),
                updated_at = NOW()
          WHERE id = $1 AND organization_id = $3::uuid`,
        [id, params.shipmentId, params.organizationId],
      );
    }
    return id;
  }

  const inserted = await db.query<{ id: number }>(
    `INSERT INTO receiving_carton
       (source, source_order_id, shipment_id, qa_status, needs_test, updated_at, organization_id)
     VALUES ($1, $2, $3, 'PENDING', true, NOW(), $4::uuid)
     RETURNING id`,
    [source, sourceOrderId, params.shipmentId ?? null, params.organizationId],
  );
  return Number(inserted.rows[0].id);
}
