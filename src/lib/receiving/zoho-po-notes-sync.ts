import { getPurchaseOrderById, updatePurchaseOrder } from '@/lib/zoho';
import {
  isZohoPoStampStale,
  readZohoPoLastModified,
} from '@/lib/receiving/zoho-po-stamp';

type PoHeaderNotesZohoSkip = 'no_zoho_link' | 'po_not_editable' | 'stale';

interface SyncPoHeaderNotesResult {
  ok: boolean;
  skipped?: PoHeaderNotesZohoSkip;
  patched?: boolean;
  error?: string;
  /** Live Zoho stamp after the GET (and after a successful PUT when re-read). */
  live_last_modified_zoho?: string | null;
}

/** Push carton-level Zoho PO header notes (`receiving.zoho_notes`) to the linked Zoho PO `notes` field. */
export async function syncPoHeaderNotesToZoho(params: {
  zohoPoId: string | null | undefined;
  notes: string | null;
  /** Stamp from the last trusted Inventory pull; omit to skip the stale check. */
  baseLastModifiedZoho?: string | null;
}): Promise<SyncPoHeaderNotesResult> {
  const zohoPoId = String(params.zohoPoId ?? '').trim();
  if (!zohoPoId) return { ok: true, skipped: 'no_zoho_link' };

  let existing: Awaited<ReturnType<typeof getPurchaseOrderById>>;
  try {
    existing = await getPurchaseOrderById(zohoPoId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'fetch_failed';
    console.warn('[zoho-po-notes-sync] fetch failed', zohoPoId, message);
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

  const raw = String(po.status ?? '').trim();
  const normalized = raw.toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'cancelled' || normalized === 'void') {
    return { ok: true, skipped: 'po_not_editable', live_last_modified_zoho: liveStamp };
  }

  const nextNotes = params.notes == null ? '' : params.notes.trim();
  try {
    await updatePurchaseOrder(zohoPoId, { notes: nextNotes });
    // PUT bumps Zoho last_modified — re-read so the client can adopt the new base.
    let afterStamp = liveStamp;
    try {
      const after = await getPurchaseOrderById(zohoPoId);
      afterStamp = readZohoPoLastModified(
        after.purchaseorder as { last_modified_time?: string | null } | undefined,
      );
    } catch {
      /* keep pre-PUT stamp — next Refresh will correct */
    }
    return { ok: true, patched: true, live_last_modified_zoho: afterStamp };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'update_failed';
    console.warn('[zoho-po-notes-sync] updatePurchaseOrder failed', zohoPoId, message);
    return { ok: false, error: message, live_last_modified_zoho: liveStamp };
  }
}
