import {
  assertPurchaseOrderLineItemsEditable,
  buildPurchaseOrderLineItemsForItemDescriptionPut,
  getPurchaseOrderById,
  updatePurchaseOrder,
} from '@/lib/zoho';
import {
  isZohoPoStampStale,
  readZohoPoLastModified,
} from '@/lib/receiving/zoho-po-stamp';

export type ItemDescriptionZohoSkip =
  | 'no_zoho_link'
  | 'no_line_item_id'
  | 'po_not_editable'
  | 'stale';

export interface SyncItemDescriptionResult {
  ok: boolean;
  skipped?: ItemDescriptionZohoSkip;
  patched?: boolean;
  resolved_line_item_id?: string;
  error?: string;
  live_last_modified_zoho?: string | null;
}

function normalizeSkuKey(s: string | null | undefined): string {
  return String(s ?? '').trim().toLowerCase();
}

function findZohoLineItemIdFromPoLines(
  lineItems: unknown[],
  sku: string | null | undefined,
  itemName: string | null | undefined,
): string | null {
  const wantSku = normalizeSkuKey(sku);
  const wantName = String(itemName ?? '').trim().toLowerCase();
  for (const raw of lineItems) {
    if (!raw || typeof raw !== 'object') continue;
    const li = raw as Record<string, unknown>;
    const id = String(li.line_item_id ?? li.id ?? '').trim();
    if (!id) continue;
    const liSku = normalizeSkuKey(String(li.sku ?? ''));
    if (wantSku && liSku === wantSku) return id;
    const liName = String(li.name ?? li.item_name ?? '').trim().toLowerCase();
    if (!wantSku && wantName && liName === wantName) return id;
  }
  return null;
}

/** Push a per-line item description edit to the linked Zoho PO line item. */
export async function syncItemDescriptionToZohoPo(params: {
  zohoPoId: string | null | undefined;
  zohoLineItemId: string | null | undefined;
  sku?: string | null;
  itemName?: string | null;
  description: string | null;
  /** Stamp from the last trusted Inventory pull; omit to skip the stale check. */
  baseLastModifiedZoho?: string | null;
}): Promise<SyncItemDescriptionResult> {
  const zohoPoId = String(params.zohoPoId ?? '').trim();
  if (!zohoPoId) return { ok: true, skipped: 'no_zoho_link' };

  let lineItemId = String(params.zohoLineItemId ?? '').trim();
  let existing: Awaited<ReturnType<typeof getPurchaseOrderById>>;
  try {
    existing = await getPurchaseOrderById(zohoPoId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'fetch_failed';
    console.warn('[zoho-item-description-sync] fetch failed', zohoPoId, message);
    return { ok: false, error: message };
  }

  const po = existing.purchaseorder;
  if (!po) return { ok: true, skipped: 'no_zoho_link' };

  const liveStamp = readZohoPoLastModified(
    po as { last_modified_time?: string | null },
  );
  if (isZohoPoStampStale(params.baseLastModifiedZoho, liveStamp)) {
    return {
      ok: false,
      skipped: 'stale',
      error: 'Inventory changed — Refresh',
      live_last_modified_zoho: liveStamp,
    };
  }

  if (!lineItemId) {
    const items = Array.isArray(po.line_items) ? po.line_items : [];
    lineItemId = findZohoLineItemIdFromPoLines(items, params.sku, params.itemName) ?? '';
  }
  if (!lineItemId) {
    return { ok: true, skipped: 'no_line_item_id', live_last_modified_zoho: liveStamp };
  }

  try {
    assertPurchaseOrderLineItemsEditable(existing);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'po_not_editable';
    console.warn('[zoho-item-description-sync] PO not editable', zohoPoId, message);
    return { ok: true, skipped: 'po_not_editable', live_last_modified_zoho: liveStamp };
  }

  const nextDescription = params.description == null ? '' : params.description.trim();
  const lineItemsPatch = buildPurchaseOrderLineItemsForItemDescriptionPut(po, {
    [lineItemId]: nextDescription,
  });
  if (lineItemsPatch.length === 0) {
    return { ok: true, skipped: 'no_zoho_link', live_last_modified_zoho: liveStamp };
  }

  try {
    await updatePurchaseOrder(zohoPoId, { line_items: lineItemsPatch });
    let afterStamp = liveStamp;
    try {
      const after = await getPurchaseOrderById(zohoPoId);
      afterStamp = readZohoPoLastModified(
        after.purchaseorder as { last_modified_time?: string | null } | undefined,
      );
    } catch {
      /* keep pre-PUT stamp */
    }
    return {
      ok: true,
      patched: true,
      resolved_line_item_id: lineItemId,
      live_last_modified_zoho: afterStamp,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'update_failed';
    console.warn('[zoho-item-description-sync] updatePurchaseOrder failed', zohoPoId, message);
    return { ok: false, error: message, live_last_modified_zoho: liveStamp };
  }
}
