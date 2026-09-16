/**
 * Pure helpers, types, and event dispatchers shared by the receiving-lines
 * table and its sub-hooks/components. Extracted from the 1,400-line
 * `ReceivingLinesTable.tsx` so the data/selection/grouping hooks can import the
 * shape + utilities without pulling in the heavy component (avoiding cycles).
 *
 * No JSX — render surfaces live next to their consumers.
 */

import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';

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

/**
 * Lifecycle timestamp the receiving table day-bands + within-day order by.
 * These are the same event times the Overview card and row tooltips show —
 * NOT `last_activity_at` (which folds in MAX(receiving_scans), line writes via
 * updated_at, and other later touches). A re-scan or qty edit must not bump a
 * row into today's band when the carton was actually scanned/unboxed days ago.
 *
 * Default ('scanned') axis = first tracking scan (`scanned_at`), then door-scan
 * (`received_at`), then line `created_at`. The 'unboxed' axis bands by
 * `unboxed_at`; 'received' by `received_done_at` (terminal DONE). Each falls
 * back to `created_at` so rows not yet at that stage still land in a real day
 * band. History keys day-bands on the active sort axis (unboxed or scanned);
 * Receive uses 'scanned'. History is client-sorted (serverSorted=false).
 */
export type ReceivingActivityAxis = 'scanned' | 'unboxed' | 'received' | 'tested';

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

/**
 * A purchase-order group: every receiving line that shares a PO, collapsed into
 * a single expandable row. `anchorTs` is the timestamp the group is placed by in
 * the day-banded feed — the PO's most-recent activity (or its Zoho PO date for
 * Incoming) — so a PO whose lines were scanned across several days lands in the
 * band of its latest scan instead of fragmenting. Singleton groups (a one-line
 * PO, or an unmatched carton with no PO) render as a plain row.
 */
export interface ReceivingPoGroup {
  key: string;
  rows: ReceivingLineRow[];
  anchorTs: string | null;
}

export function poGroupAnchorMs(group: ReceivingPoGroup): number {
  const t = group.anchorTs ? new Date(group.anchorTs).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

/** Stage stamp shown in the receiving history meta subrow (Unbox / Triage / Done / Testing). */
type ReceivingRowStageStamp = {
  instant: string;
  label: 'Scanned' | 'Unboxed' | 'Received' | 'Tested';
  staffName: string | null;
};

type ReceivingStageStampRow = {
  scanned_at?: string | null;
  received_at?: string | null;
  unboxed_at?: string | null;
  unbox_opened_at?: string | null;
  received_done_at?: string | null;
  tested_at?: string | null;
  scanned_by_name?: string | null;
  received_by_name?: string | null;
  unboxed_by_name?: string | null;
};

/**
 * Which lifecycle instant owns the dense row clock for the active history axis.
 * Does **not** fall back to `created_at` — that is for day-banding only.
 * On the unboxed axis, prefer first Unbox-open (`unbox_opened_at` — same stamp
 * the Unboxed sidebar ages/sorts on), then unbox-complete (`unboxed_at`). When
 * both are missing (e.g. Unfound PO that was door-scanned but never opened),
 * fall back to the scan clock so the meta column stays populated and vertically
 * aligned with sibling rows.
 */
export function resolveReceivingRowStageStamp(
  row: ReceivingStageStampRow,
  axis: ReceivingActivityAxis,
): ReceivingRowStageStamp | null {
  if (axis === 'tested') {
    const tested = (row.tested_at || '').trim();
    if (tested) {
      return { instant: tested, label: 'Tested', staffName: null };
    }
    // Pending / not-yet-tested: fall through to unboxed clock.
    const unboxed = (row.unboxed_at || '').trim();
    if (unboxed) {
      return {
        instant: unboxed,
        label: 'Unboxed',
        staffName: (row.unboxed_by_name || '').trim() || null,
      };
    }
    return null;
  }
  if (axis === 'unboxed') {
    const opened = (row.unbox_opened_at || '').trim();
    if (opened) {
      return {
        instant: opened,
        label: 'Unboxed',
        staffName: (row.unboxed_by_name || '').trim() || null,
      };
    }
    const instant = (row.unboxed_at || '').trim();
    if (instant) {
      return {
        instant,
        label: 'Unboxed',
        staffName: (row.unboxed_by_name || '').trim() || null,
      };
    }
    const scanned = (row.scanned_at || '').trim();
    if (scanned) {
      return {
        instant: scanned,
        label: 'Scanned',
        staffName: (row.scanned_by_name || '').trim() || null,
      };
    }
    const received = (row.received_at || '').trim();
    if (!received) return null;
    return {
      instant: received,
      label: 'Scanned',
      staffName:
        (row.scanned_by_name || '').trim() ||
        (row.received_by_name || '').trim() ||
        null,
    };
  }
  if (axis === 'received') {
    const done = String(row.received_done_at ?? '').trim();
    if (done) {
      return { instant: done, label: 'Received', staffName: null };
    }
    const unboxed = (row.unboxed_at || '').trim();
    if (!unboxed) return null;
    return {
      instant: unboxed,
      label: 'Unboxed',
      staffName: (row.unboxed_by_name || '').trim() || null,
    };
  }
  const scanned = (row.scanned_at || '').trim();
  if (scanned) {
    return {
      instant: scanned,
      label: 'Scanned',
      staffName: (row.scanned_by_name || '').trim() || null,
    };
  }
  const received = (row.received_at || '').trim();
  if (!received) return null;
  return {
    instant: received,
    label: 'Scanned',
    staffName:
      (row.scanned_by_name || '').trim() ||
      (row.received_by_name || '').trim() ||
      null,
  };
}
