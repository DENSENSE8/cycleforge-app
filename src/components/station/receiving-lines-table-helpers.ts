/** Pure helpers, types, and event dispatchers shared by the receiving-lines table and its sub-hooks/components. */

import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { ReceivingActivityAxis } from '@/lib/receiving/receiving-stage-stamp';

/**
 * Passed to `/api/receiving-lines` as `view`. Re-exported from the shared
 * contract so the server route and this client agree on the supported set.
 */
export type { ReceivingView } from '@/lib/receiving/receiving-views';

export interface ApiResponse {
  success: boolean;
  receiving_lines: ReceivingLineRow[];
  total: number;
  limit: number;
  offset: number;
}

export function dispatchSelectLine(
  row: ReceivingLineRow | null,
  opts?: {
    /**
     * Whether this open stamps the operator's recents. Omitted = true, which
     * keeps every historical dispatcher (scan, recent rail, sibling PO line)
     * byte-identical. The browse FEED passes false — see `readSelectLineDetail`.
     */
    recordView?: boolean;
    /**
     * Preview stance open — the pane paints as a scan's would but stays inert,
     * and the open writes nothing. Implies `recordView: false`, resolved in
     * `readSelectLineDetail` so the two facts cannot drift apart.
     */
    preview?: boolean;
  },
) {
  // Bare row when there is nothing to add, so the ~15 existing dispatchers keep
  // emitting the exact payload shape their listeners have always received.
  const detail =
    opts?.preview === true
      ? { row, recordView: false, preview: true }
      : opts?.recordView === false
        ? { row, recordView: false }
        : row;
  window.dispatchEvent(new CustomEvent('receiving-select-line', { detail }));
}

export function dispatchLineUpdated(row: Partial<ReceivingLineRow> & { id: number }) {
  window.dispatchEvent(new CustomEvent('receiving-line-updated', { detail: row }));
}

/** Carton-level patch broadcast — listeners merge by `receiving_id`. */
export interface ReceivingPackageUpdatedDetail {
  receiving_id: number;
  zoho_purchaseorder_number?: string | null;
  zoho_purchaseorder_id?: string | null;
  receiving_source?: string | null;
  source_platform?: string | null;
  listing_url?: string | null;
  support_notes?: string | null;
  intake_type?: string | null;
  is_return?: boolean;
  /** Set with platform save on Return cartons — drives claim subject identity. */
  return_platform?: string | null;
  /** Manual priority override broadcast (receiving.priority_tier / is_priority). */
  priority_tier?: number | null;
  is_priority?: boolean;
}

/** Optimistic row shape after POST /api/receiving/:id/unpair. */
export const RECEIVING_UNPAIR_ROW_PATCH: Partial<ReceivingLineRow> = {
  zoho_purchaseorder_number: null,
  zoho_purchaseorder_id: null,
  receiving_source: 'unmatched',
  source_platform: null,
  source_platform_pill: null,
  receiving_listing_url: null,
  carton_intake_type: null,
  intake_type: null,
  receiving_type: 'PO',
};

export function mergeReceivingPackageMetaIntoRow(
  row: ReceivingLineRow,
  detail: ReceivingPackageUpdatedDetail,
): ReceivingLineRow | null {
  if (row.receiving_id !== detail.receiving_id) return null;
  const next: ReceivingLineRow = { ...row };
  if ('zoho_purchaseorder_number' in detail) {
    next.zoho_purchaseorder_number = detail.zoho_purchaseorder_number ?? null;
  }
  if ('zoho_purchaseorder_id' in detail) {
    next.zoho_purchaseorder_id = detail.zoho_purchaseorder_id ?? null;
  }
  if ('receiving_source' in detail) {
    next.receiving_source = detail.receiving_source ?? null;
  }
  if ('source_platform' in detail) {
    next.source_platform = detail.source_platform ?? null;
    next.source_platform_pill = detail.source_platform ?? null;
  }
  if ('listing_url' in detail) {
    next.receiving_listing_url = detail.listing_url ?? null;
  }
  if ('intake_type' in detail) {
    next.carton_intake_type = detail.intake_type ?? null;
    next.receiving_type = detail.intake_type ?? 'PO';
  }
  if ('support_notes' in detail) {
    next.receiving_support_notes = detail.support_notes ?? null;
  }
  if ('priority_tier' in detail) {
    next.priority_tier = detail.priority_tier ?? null;
  }
  if ('is_priority' in detail) {
    next.is_priority = !!detail.is_priority;
  }
  return next;
}

/** Broadcast a full unpair to every surface keyed on this carton. */
export function dispatchReceivingCartonUnlinkPatch(receivingId: number, lineId?: number) {
  const packageDetail: ReceivingPackageUpdatedDetail = {
    receiving_id: receivingId,
    zoho_purchaseorder_number: null,
    zoho_purchaseorder_id: null,
    receiving_source: 'unmatched',
    source_platform: null,
    listing_url: null,
    intake_type: null,
    is_return: false,
  };
  window.dispatchEvent(
    new CustomEvent('receiving-package-updated', { detail: packageDetail }),
  );
  if (lineId != null) {
    dispatchLineUpdated({
      id: lineId,
      receiving_id: receivingId,
      ...RECEIVING_UNPAIR_ROW_PATCH,
    });
  }
}

/** Selection scope shared by the table, its header Select toggle, and the
 *  SelectionActionBar (see useTableSelection / SelectionActionBar). */
export const RECEIVING_SELECTION_SCOPE = 'receiving' as const;

export function receivingRowActivityTs(
  row: {
    scanned_at?: string | null;
    received_at?: string | null;
    created_at?: string | null;
    unboxed_at?: string | null;
    unbox_opened_at?: string | null;
    received_done_at?: string | null;
  },
  axis: ReceivingActivityAxis = 'scanned',
): string | null {
  if (axis === 'unboxed') {
    // Prefer first Unbox-open (Unboxed sidebar axis), then unbox-complete.
    return row.unbox_opened_at ?? row.unboxed_at ?? row.created_at ?? null;
  }
  if (axis === 'received') {
    return row.received_done_at ?? row.unboxed_at ?? row.created_at ?? null;
  }
  return row.scanned_at ?? row.received_at ?? row.created_at ?? null;
}

export function receivingRowActivityMs(
  row: {
    scanned_at?: string | null;
    received_at?: string | null;
    created_at?: string | null;
    unboxed_at?: string | null;
    unbox_opened_at?: string | null;
    received_done_at?: string | null;
  },
  axis: ReceivingActivityAxis = 'scanned',
): number {
  const raw = receivingRowActivityTs(row, axis);
  const t = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

/** A purchase-order group: */
export interface ReceivingPoGroup {
  key: string;
  rows: ReceivingLineRow[];
  anchorTs: string | null;
}

export function poGroupAnchorMs(group: ReceivingPoGroup): number {
  const t = group.anchorTs ? new Date(group.anchorTs).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}
