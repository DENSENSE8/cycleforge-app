// Shared constants for all receiving-related components.
// Import from here instead of defining inline in each component.

import type { ComponentType } from 'react';
import { WORKFLOW_STAGES, workflowStageLabel } from '@/lib/receiving/workflow-stages';
import { PackageCheck, Clock, Truck, Package } from '@/components/Icons';
import { CONDITION_LABELS, conditionGradeTableLabel } from '@/lib/conditions';
import { LIFECYCLE_CLASSES } from '@/design-system/tokens/lifecycle';

// Condition-grade labels live in one place now — see src/lib/conditions.ts.
// Re-exported here so existing `from '@/lib/receiving/receiving-constants'`
// import sites keep working.
export { conditionGradeTableLabel };

// ─── Badge class maps ─────────────────────────────────────────────────────────

export const QA_BADGE: Record<string, string> = {
  PENDING:           'bg-surface-sunken text-text-soft',
  PASSED:            'bg-emerald-100 text-emerald-700',
  FAILED_DAMAGED:    'bg-red-100 text-red-600',
  FAILED_INCOMPLETE: 'bg-orange-100 text-orange-600',
  FAILED_FUNCTIONAL: 'bg-rose-100 text-rose-700',
  HOLD:              'bg-yellow-100 text-yellow-700',
};

// Badge tone per workflow status, derived from the single lifecycle registry
// (src/lib/receiving/workflow-stages.ts) so every surface — rails, tables,
// side panels — renders the same color for the same status. Kept as a
// Record<string,string> for the existing `WORKFLOW_BADGE[status]` callers.
export const WORKFLOW_BADGE: Record<string, string> = Object.fromEntries(
  Object.values(WORKFLOW_STAGES).map((s) => [s.status, s.badge]),
);

/** List-row / badge copy for inbound workflow; DB enums unchanged (`MATCHED`, `DONE`, …). */
export function workflowStatusTableLabel(status: string | null | undefined): string {
  const raw = String(status ?? '').trim().toUpperCase();
  if (!raw) return 'UNKNOWN';
  // Both early receiving stages read as "SCANNED" on list rows: ARRIVED is a
  // carton scanned at the dock but not matched to a PO (an Unfound PO), MATCHED
  // is a carton scanned and matched to a PO line. The matched/unmatched split is
  // carried by the row title + PO column, not this chip. ARRIVED's lifecycle
  // label is "Scanned" (see workflow-stages.ts), so this keeps the two in sync.
  if (raw === 'ARRIVED' || raw === 'MATCHED') return 'SCANNED';
  // Terminal DONE reads as Received — same SoT as workflowStageLabel / History chips.
  if (raw === 'DONE') return workflowStageLabel('DONE');
  return raw.replace(/_/g, ' ');
}

/** Compact grade→label map (New · Like New · Refurb · A · B · C · Parts). */
export const COND_LABEL: Record<string, string> = CONDITION_LABELS.compact;

/** Soft pill tone per condition grade. Shared by table rows and the scanned
 *  line/receipt detail headers so condition reads the same color everywhere. */
const CONDITION_BADGE: Record<string, string> = {
  BRAND_NEW:   'bg-yellow-100 text-yellow-700',
  LIKE_NEW:    'bg-emerald-100 text-emerald-700',
  REFURBISHED: 'bg-teal-100 text-teal-700',
  USED_A:      'bg-blue-100 text-blue-700',
  USED_B:      'bg-indigo-100 text-indigo-700',
  USED_C:      'bg-surface-sunken text-text-muted',
  PARTS:       'bg-orange-100 text-orange-900',
};

export function conditionBadgeTone(code: string | null | undefined): string {
  const c = String(code || '').trim().toUpperCase();
  return CONDITION_BADGE[c] || 'bg-surface-sunken text-text-muted';
}

/** Soft pill tone per serial-unit lifecycle status (RECEIVED → … → SHIPPED).
 *  This is the unit domain, distinct from receiving workflow_status. Shared by
 *  the desktop /serial/[id] page and the mobile /m/u/[id] page. */
const UNIT_STATUS_BADGE: Record<string, string> = {
  UNKNOWN:  'bg-surface-sunken text-text-muted',
  LABELED:  'bg-amber-100 text-amber-700',
  RECEIVED: 'bg-amber-100 text-amber-800',
  IN_TEST:  'bg-blue-100 text-blue-700',
  TESTED:   'bg-blue-100 text-blue-700',
  STOCKED:  'bg-emerald-100 text-emerald-700',
  PICKED:   'bg-indigo-100 text-indigo-700',
  SHIPPED:  LIFECYCLE_CLASSES.shipped.pill,
  RETURNED: 'bg-rose-100 text-rose-700',
  RMA:      'bg-rose-100 text-rose-700',
  SCRAPPED: 'bg-red-100 text-red-700',
};

export function unitStatusBadgeTone(status: string | null | undefined): string {
  const s = String(status || '').trim().toUpperCase();
  return UNIT_STATUS_BADGE[s] || 'bg-surface-sunken text-text-muted';
}

/**
 * Inline status-dot color for a receiving line. Quantity-complete emerald wins
 * for **non-terminal** stages (the finer “dot moves first” vocabulary). Terminal
 * dispositions (FAILED / SCRAP / RTV) keep their failure tones even when qty is
 * complete — a failed line must never read as success. Unlike the registry
 * `workflowStageDot`, this folds in qty for in-flight stages.
 */
/**
 * Lifecycle status-dot color. Emerald means terminal Received / Passed —
 * never qty-complete alone (UNBOXED stays indigo; DONE / PASSED are emerald).
 *
 * `qtyReceived` / `qtyExpected` are accepted for call-site compatibility but do
 * not drive emerald; stage vocabulary owns the tone.
 */
export function getStatusDotBg(
  status: string | null | undefined,
  _qtyReceived?: number,
  _qtyExpected?: number | null,
): string {
  const value = String(status || '').trim().toUpperCase();
  // Terminal dispositions first — never overridden by qty.
  if (value.startsWith('FAILED')) return 'bg-rose-500';
  if (value === 'SCRAP') return 'bg-surface-inverse';
  if (value === 'RTV') return 'bg-purple-500';
  if (value === 'EXPECTED') return 'bg-amber-400';
  if (value === 'ARRIVED' || value === 'MATCHED') return 'bg-blue-500';
  if (value === 'UNBOXED') return 'bg-indigo-500';
  if (value === 'AWAITING_TEST' || value === 'IN_TEST') return 'bg-violet-500';
  if (value === 'PASSED' || value === 'DONE') return 'bg-emerald-500';
  return 'bg-border-emphasis';
}

// ─── Shared row-display contract (desktop ⇄ mobile) ──────────────────────────
// One source of truth for the receiving ROW display decisions that both the
// desktop table (ReceivingLinesTable) and the mobile feed (MobileReceivingRow)
// make, so they can't drift. Pass the same `ReceivingRowDisplay` to both.

/** Per-surface display flags for a receiving row. */
export interface ReceivingRowDisplay {
  /** History/recent surface: "received" is implied, so the workflow status
   *  icon is suppressed (desktop history mode + the mobile recent/receiving feed). */
  isHistory?: boolean;
  /** Incoming/expected surface: workflow status doesn't apply yet → also hidden. */
  isIncoming?: boolean;
}

/**
 * Workflow status → its compact glyph + tone. Single source for the icon
 * mapping that desktop (ReceivingLinesTable) and mobile (MobileReceivingRow)
 * previously copy-pasted. `label` is the value from {@link workflowStatusTableLabel}.
 */
export function getWorkflowIconMeta(label: string): {
  Icon: ComponentType<{ className?: string }>;
  tone: string;
} {
  const key = String(label ?? '').trim().toUpperCase();
  if (key === 'RECEIVED') return { Icon: PackageCheck, tone: 'text-emerald-600' };
  if (key === 'EXPECTED') return { Icon: Clock, tone: 'text-amber-500' };
  if (key === 'SCANNED') return { Icon: Truck, tone: 'text-blue-600' };
  return { Icon: Package, tone: 'text-text-faint' };
}

/**
 * Whether the workflow status icon should render for this row. History and
 * incoming surfaces suppress it (received is implied / status N/A). The mobile
 * receiving feed is a history surface, so it passes `{ isHistory: true }` and
 * gets the same suppression the desktop history table does — for free.
 */
export function shouldShowWorkflowStatusIcon(display: ReceivingRowDisplay = {}): boolean {
  return !(display.isHistory || display.isIncoming);
}
