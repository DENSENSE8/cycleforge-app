/**
 * Receiving sidebar-rail status-dot logic — the single source of truth for the
 * left status dot + its hover label across every receiving rail (Unboxed /
 * Queue / Viewed / Triage / Prioritize / Unfound).
 *
 * Pure, DB-free, display-agnostic: every function maps a {@link ReceivingLineRow}
 * to a Tailwind dot class or a tooltip string. Colors come from the shared
 * lifecycle registry (workflow-stages.ts) so the dot, the badge, and every other
 * surface agree. Lifted out of `ReceivingRecentRail.tsx` so the sibling rails no
 * longer import status logic from a component (the coupling that forced the
 * `unfound-stub` circular-import workaround) and so the logic is unit-testable.
 *
 * Scope: the receiving page only. Testing (TestingRecentRail) and the mobile
 * scan feeds keep their own scope-appropriate dot logic.
 */

import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import {
  receivingCoarseUnboxedSyncTooltip,
  receivingProviderPendingTooltip,
} from '@/lib/receiving/unboxed-sync-tooltip';
import {
  deriveReceivingLineStatus,
  type ReceivingLineStatus,
} from '@/lib/receiving/workflow-stages';
import { isZohoReceivedLikeStatus } from '@/lib/receiving/zoho-received-status';

/**
 * Operator-facing 3-state model (Scanned → Unboxed → Received), the single
 * coarse status every rail dot + label reads. Derived from the SoT
 * (`deriveReceivingLineStatus`, workflow-stages.ts) so the rail, the table chip,
 * and the Overview can never drift, with two row-level special cases the bare
 * workflow_status can't express:
 *   - Unmatched cartons have no PO/receive step → unboxed locally reads Received.
 *   - Vendor-side already-received (Zoho) reads Received even if the local
 *     line has not yet been promoted (provider can lead).
 *   - Local DONE / coarse RECEIVED always reads Received. A still-open
 *     provider PO is a *pending confirmation* tip, never a badge demotion —
 *     staff floor work is the staff face (PO 06-14980-30824, 2026-08-21).
 */
function providerReceiveStillOpen(row: ReceivingLineRow): boolean {
  return (
    Boolean(String(row.zoho_purchaseorder_id ?? '').trim()) &&
    Boolean(String(row.zoho_status ?? '').trim()) &&
    !isZohoReceivedLikeStatus(row.zoho_status)
  );
}

function railCoarseStatus(row: ReceivingLineRow): ReceivingLineStatus {
  if (row.receiving_source === 'unmatched') {
    return row.unboxed_at || (row.quantity_received ?? 0) > 0 ? 'RECEIVED' : 'SCANNED';
  }
  if (isZohoReceivedLikeStatus(row.zoho_status)) return 'RECEIVED';
  return deriveReceivingLineStatus(row.workflow_status);
}

/** @deprecated A row at/after the RECEIVED coarse stage. Prefer {@link railCoarseStatus}. */
export function isOperatorReceived(row: ReceivingLineRow): boolean {
  return railCoarseStatus(row) === 'RECEIVED';
}

/** Coarse status → dot color. Matches `getStatusDotBg` (receiving-constants.ts). */
const COARSE_DOT: Record<ReceivingLineStatus, string> = {
  INCOMING: 'bg-amber-400',
  SCANNED: 'bg-blue-500',
  UNBOXED: 'bg-indigo-500',
  RECEIVED: 'bg-emerald-500',
};

/**
 * Coarse status → carton-identity status pill tone (border · wash · ink).
 * Same 3-state map as {@link COARSE_DOT}; carton chrome composes the
 * tone onto a content-width cell after tracking.
 */
const COARSE_PILL: Record<ReceivingLineStatus, string> = {
  INCOMING: 'border-amber-200 bg-amber-50 text-amber-700',
  SCANNED: 'border-blue-200 bg-blue-50 text-blue-700',
  UNBOXED: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  RECEIVED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

const COARSE_LABEL: Record<ReceivingLineStatus, string> = {
  INCOMING: 'Incoming',
  SCANNED: 'Scanned',
  UNBOXED: 'Unboxed',
  RECEIVED: 'Received',
};

/**
 * Coarse status → grid status-chip tone (wash + ink, no border).
 * Matches `workflowStageBadge` / `GridStatusCellValue` — the chip owns its own
 * ring. Distinct from {@link COARSE_PILL} (carton-identity locked pill).
 */
const COARSE_BADGE: Record<ReceivingLineStatus, string> = {
  INCOMING: 'bg-amber-50 text-amber-700',
  SCANNED: 'bg-blue-50 text-blue-700',
  UNBOXED: 'bg-indigo-50 text-indigo-700',
  RECEIVED: 'bg-emerald-50 text-emerald-700',
};

export function getReceivingStatusDot(row: ReceivingLineRow): string {
  return COARSE_DOT[railCoarseStatus(row)];
}

/**
 * Locked carton-identity status pill tone for row 2 — same coarse stage as
 * {@link getReceivingStatusDot}. Compose onto the carton chrome status cell.
 */
export function getReceivingStatusPillClass(row: ReceivingLineRow): string {
  return COARSE_PILL[railCoarseStatus(row)];
}

/**
 * Grid status-chip tone for coarse lifecycle paint (Unbox / Receiving History).
 * Same stage as {@link getReceivingStatusDot}; no border (chip ring is inset).
 */
export function getReceivingStatusBadgeClass(row: ReceivingLineRow): string {
  return COARSE_BADGE[railCoarseStatus(row)];
}

/**
 * Short chip / aria label for the rail status dot (Scanned / Unboxed / Received).
 * Unboxed / Queue / Viewed are view filters only — the label reflects the line's
 * physical 3-state status, not which tab you're on.
 */
export function getReceivingStatusDotLabel(row: ReceivingLineRow): string {
  return COARSE_LABEL[railCoarseStatus(row)];
}

/**
 * Richer hover tip for the rail status dot. Coarse UNBOXED → inventory sync
 * pending (`Awaiting confirmation in {provider}`); otherwise null so callers
 * fall back to {@link getReceivingStatusDotLabel}.
 */
export function getReceivingStatusDotTip(
  row: ReceivingLineRow,
  inventoryProviderLabel: string,
): string | null {
  const coarse = railCoarseStatus(row);
  const unboxedTip = receivingCoarseUnboxedSyncTooltip({
    coarse,
    inventoryProviderLabel,
  });
  if (unboxedTip) return unboxedTip;
  if (coarse === 'RECEIVED' && providerReceiveStillOpen(row)) {
    return receivingProviderPendingTooltip(inventoryProviderLabel);
  }
  return null;
}

/** One-shot coarse paint for Unbox / Receiving History status cells. */
export function receivingCoarseStatusPaint(
  row: ReceivingLineRow,
  inventoryProviderLabel: string,
): { label: string; badge: string; dot: string; tip: string | null } {
  return {
    label: getReceivingStatusDotLabel(row),
    badge: getReceivingStatusBadgeClass(row),
    dot: getReceivingStatusDot(row),
    tip: getReceivingStatusDotTip(row, inventoryProviderLabel),
  };
}

/**
 * Status dot for the Unboxed rail (`unboxRecent` feed). Rows here were opened on
 * the Unbox workspace, so they read at least Unboxed; once the receive button
 * finalizes the carton they read Received. Same 3-state SoT as every other rail.
 */
export function getUnboxRecentStatusDot(row: ReceivingLineRow): string {
  return COARSE_DOT[railCoarseStatus(row)];
}

/** Dot tooltip for the Unboxed rail — mirrors {@link getUnboxRecentStatusDot}. */
export function getUnboxRecentStatusDotLabel(row: ReceivingLineRow): string {
  return COARSE_LABEL[railCoarseStatus(row)];
}

/**
 * Time label for the "Received" rail's rows (formerly "Unboxed") — now a
 * recency-merged feed of unboxed ∪ new-scanned ∪ unfound cartons. MUST mirror
 * the merge sort in `buildUnboxReceivedFetcher` so relative times read
 * monotonically down the rail. Prefers the unbox stamp, then the door-scan /
 * received time, then the line's own activity, then arrival — every received
 * carton (matched or unfound) carries at least one, so a row never drops to the
 * NULLS-last bottom. Module-scope for stable identity (the rail shell wires it
 * into a listener effect).
 */
export function getReceivedActivityAt(r: ReceivingLineRow): string | null {
  return (
    r.unboxed_at ??
    r.received_at ??
    r.last_activity_at ??
    r.scanned_at ??
    r.created_at ??
    null
  );
}

/**
 * Time label for the "Viewed" rail = when YOU opened each line. The server folds
 * the viewer's own `viewed_at` into `last_activity_at` for view=viewed, so the
 * rail reads "you opened this 3m ago" rather than the unrelated scan/line time.
 */
export function getViewedAt(r: ReceivingLineRow): string | null {
  return r.last_activity_at ?? r.updated_at ?? r.created_at ?? null;
}

/**
 * Status-dot strategy registry. A rail feed selects one by id; the dot + tooltip
 * are resolved here so feeds stay declarative.
 *   - `receiving`    → shared lifecycle dot (Queue / Viewed / Triage / Unfound).
 *   - `unbox-recent` → Unboxed rail (all rows read Received; Scanned is Queue-only).
 */
export const RAIL_STATUS = {
  receiving: {
    getStatusDot: getReceivingStatusDot,
    getStatusDotLabel: getReceivingStatusDotLabel,
  },
  'unbox-recent': {
    getStatusDot: getUnboxRecentStatusDot,
    getStatusDotLabel: getUnboxRecentStatusDotLabel,
  },
} as const;

export type RailStatusId = keyof typeof RAIL_STATUS;
