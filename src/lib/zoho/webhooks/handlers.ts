import {
  importZohoPurchaseOrderToReceiving,
  importZohoPurchaseReceiveToReceiving,
} from '@/lib/zoho-receiving-sync';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
// Wave-3 writer inversion: line-level zoho facts (sync_source / synced_at) live
// on receiving_line_zoho; only the operator-owned notes append stays spine-side.
import { upsertReceivingLineZoho } from '@/lib/receiving/facts/narrow';
import type { FactsDeps } from '@/lib/receiving/facts/store';
import { formatPSTTimestamp } from '@/utils/date';
import type { NormalizedZohoEvent } from './types';

export interface HandlerResult {
  /** Short label for logs / debugging. */
  action: string;
  /** Extra context (counts, ids) — included verbatim in the response body. */
  detail?: Record<string, unknown>;
  /** When the handler didn't actually do anything (e.g., unknown event). */
  skipped?: boolean;
}

/**
 * Webhook dispatch table. Each handler runs *after* signature verification
 * and dedupe — so handlers can assume the event is real, in-order enough
 * for our purposes, and being processed exactly once.
 *
 * Handlers should be idempotent: Zoho may re-deliver the same event after
 * a non-2xx retry. Our dedupe table catches most of those, but a handler
 * that runs partially and then fails must be safe to re-run.
 */
export async function dispatchWebhookEvent(
  event: NormalizedZohoEvent,
  orgId: OrgId,
): Promise<HandlerResult> {
  switch (event.eventType) {
    case 'purchaseorder.created':
    case 'purchaseorder.updated':
      return handlePurchaseOrderUpsert(event, orgId);
    case 'purchaseorder.deleted':
      return handlePurchaseOrderDeleted(event, orgId);
    case 'purchasereceive.created':
      return handlePurchaseReceiveCreated(event, orgId);
    case 'purchasereceive.deleted':
      return handlePurchaseReceiveDeleted(event, orgId);
    case 'unknown':
    default:
      return {
        action: 'noop',
        skipped: true,
        detail: { rawEventType: event.rawEventType },
      };
  }
}

async function handlePurchaseOrderUpsert(
  event: NormalizedZohoEvent,
  orgId: OrgId,
): Promise<HandlerResult> {
  if (!event.objectId) {
    return { action: 'po.upsert.skipped', skipped: true, detail: { reason: 'no object id' } };
  }
  // The existing helper fetches the full PO from Zoho and writes
  // receiving_carton/receiving_line rows. Webhook → 1 Zoho call (the fetch) instead
  // of repeated `searchPurchaseOrdersByTracking` polls per scan.
  const result = await importZohoPurchaseOrderToReceiving(orgId, event.objectId);
  return {
    action: 'po.upserted',
    detail: { purchaseorder_id: event.objectId, result },
  };
}

async function handlePurchaseOrderDeleted(
  event: NormalizedZohoEvent,
  orgId: OrgId,
): Promise<HandlerResult> {
  if (!event.objectId) {
    return { action: 'po.delete.skipped', skipped: true, detail: { reason: 'no object id' } };
  }
  // Soft-detach: mark every line that referenced this PO so we don't keep
  // matching scans against a deleted Zoho record. We don't drop the local row
  // because warehouse scans / serials may still live there. The zoho facts
  // (sync_source / synced_at) now live on receiving_line_zoho — which is also
  // where the PO identity is keyed — while the operator-owned notes append stays
  // on the spine. One transaction so the detach + note commit atomically;
  // org-scoped so a deletion in one tenant's Zoho never touches another's lines.
  const rowsDetached = await withTenantTransaction(orgId, async (client) => {
    const rows = await client.query<{ receiving_line_id: number }>(
      `SELECT receiving_line_id
         FROM receiving_line_zoho
        WHERE zoho_purchaseorder_id = $1
          AND organization_id = $2
        ORDER BY receiving_line_id
        FOR UPDATE`,
      [event.objectId, orgId],
    );
    const ids = rows.rows.map((r) => Number(r.receiving_line_id));
    if (ids.length === 0) return 0;

    const txDeps: FactsDeps = {
      query: ((_org: OrgId, sql: string, p?: unknown[]) =>
        client.query(sql, p)) as FactsDeps['query'],
    };
    const detachedAt = formatPSTTimestamp();
    for (const id of ids) {
      await upsertReceivingLineZoho(orgId, id, {
        zohoSyncSource: 'deleted',
        zohoSyncedAt: detachedAt,
      }, txDeps);
    }

    await client.query(
      `UPDATE receiving_line
          SET notes = COALESCE(notes, '') ||
                      CASE WHEN COALESCE(notes,'') = '' THEN '' ELSE E'\\n' END ||
                      '[zoho] PO ' || $1 || ' deleted in Zoho on ' || NOW()
        WHERE id = ANY($2::int[])
          AND organization_id = $3`,
      [event.objectId, ids, orgId],
    );
    return ids.length;
  });
  return {
    action: 'po.deleted',
    detail: { purchaseorder_id: event.objectId, rows_detached: rowsDetached },
  };
}

async function handlePurchaseReceiveCreated(
  event: NormalizedZohoEvent,
  orgId: OrgId,
): Promise<HandlerResult> {
  if (!event.objectId) {
    return { action: 'pr.create.skipped', skipped: true, detail: { reason: 'no object id' } };
  }
  // Mirror the new receive into our schema. The helper handles fetching the
  // full record from Zoho and writing the receiving_carton / receiving_line rows.
  const result = await importZohoPurchaseReceiveToReceiving({
    orgId,
    purchaseReceiveId: event.objectId,
  });
  return {
    action: 'pr.imported',
    detail: { purchase_receive_id: event.objectId, result },
  };
}

async function handlePurchaseReceiveDeleted(
  event: NormalizedZohoEvent,
  orgId: OrgId,
): Promise<HandlerResult> {
  if (!event.objectId) {
    return { action: 'pr.delete.skipped', skipped: true, detail: { reason: 'no object id' } };
  }
  // Detach local receiving row so it doesn't keep pretending it's tied to
  // a record Zoho no longer has. Same soft-delete shape as PO; org-scoped.
  const res = await tenantQuery(
    orgId,
    `UPDATE receiving_carton
        SET zoho_purchase_receive_id = NULL,
            notes = COALESCE(notes, '') ||
                    CASE WHEN COALESCE(notes,'') = '' THEN '' ELSE E'\\n' END ||
                    '[zoho] Purchase receive ' || $1 || ' deleted in Zoho on ' || NOW()
      WHERE zoho_purchase_receive_id = $1
        AND organization_id = $2`,
    [event.objectId, orgId],
  );
  return {
    action: 'pr.deleted',
    detail: { purchase_receive_id: event.objectId, rows_detached: res.rowCount ?? 0 },
  };
}
