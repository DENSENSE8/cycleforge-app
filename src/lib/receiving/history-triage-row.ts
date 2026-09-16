/**
 * Unbox History triage helpers — unfound vs matched row state for the
 * History context menu + {@link HistoryCartonTriagePanel}.
 */

import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';
import type { ReceivingGridColumnKey } from '@/lib/receiving/receiving-grid-layout';

/** Intake carton with no linked PO (ORDER: —, QTY: 0/?, …). */
export function isHistoryUnfoundRow(row: ReceivingLineRow): boolean {
  const source = (row.receiving_source || '').trim().toLowerCase();
  if (source === 'unmatched') return true;
  const pairing = (row.pairing_state || '').trim().toUpperCase();
  if (pairing === 'UNFOUND') return true;
  const po = (row.zoho_purchaseorder_number || row.zoho_purchaseorder_id || '').trim();
  return !po && source !== 'zoho_po' && source !== 'local_pickup';
}

/** Resolve the LedgerGrid column from a context-menu event target. */
export function resolveReceivingColFromTarget(
  target: EventTarget | null,
): ReceivingGridColumnKey | null {
  if (target == null || typeof target !== 'object') return null;
  const el = target as {
    closest?: (sel: string) => { getAttribute: (name: string) => string | null } | null;
  };
  if (typeof el.closest !== 'function') return null;
  const hit = el.closest('[data-col]');
  if (!hit) return null;
  const key = hit.getAttribute('data-col');
  if (!key || key === 'select' || key === '_fill') return null;
  return key as ReceivingGridColumnKey;
}

export type HistoryTriageTarget = {
  receivingId: number;
  receivingLineId: number | null;
  poNumber: string | null;
  title: string | null;
  tracking: string | null;
  status: string | null;
};

export function historyTriageTargetFromRow(row: ReceivingLineRow): HistoryTriageTarget | null {
  const receivingId = Number(row.receiving_id);
  if (!Number.isFinite(receivingId) || receivingId <= 0) return null;
  // SKU IDENTITY LAW (src/lib/sku/sku-identity-law.ts): Zoho item title governs.
  const title = resolveSkuIdentityTitle({
    zoho_item_title: row.zoho_item_title,
    catalog_product_title: row.catalog_product_title,
    item_name: row.item_name,
  });
  return {
    receivingId,
    receivingLineId: typeof row.id === 'number' && row.id > 0 ? row.id : null,
    poNumber: (row.zoho_purchaseorder_number || '').trim() || null,
    title: title || null,
    tracking: (row.tracking_number || '').trim() || null,
    status: (row.workflow_status || '').trim() || null,
  };
}
