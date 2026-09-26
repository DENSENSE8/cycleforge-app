/** The ONE status resolver for the label-intake ledger (desk and `/m` alike). */
import type { LabelIngestionState, LabelQuarantineReasonCode } from './types';

export type LedgerTone = 'danger' | 'warning' | 'info' | 'fulfillment' | 'success';
type LedgerAction = 'apply' | 'retry';

interface LedgerStatus {
  /** Written state — the meaning. */
  label: string;
  tone: LedgerTone;
  /** 0 = act now. Lower ranks sort first in the "Needs action" view. */
  rank: number;
  /** The single action the server lifecycle permits from this state. */
  action: LedgerAction | null;
}

const STATUS: Record<LabelIngestionState, LedgerStatus> = {
  QUARANTINED: { label: 'QUARANTINED', tone: 'danger', rank: 0, action: 'retry' },
  FAILED: { label: 'FAILED', tone: 'danger', rank: 0, action: 'retry' },
  MATCHED: { label: 'READY TO APPLY', tone: 'warning', rank: 1, action: 'apply' },
  RECEIVED: { label: 'RECEIVED', tone: 'info', rank: 2, action: null },
  STAGED: { label: 'STAGED', tone: 'info', rank: 2, action: null },
  PARSED: { label: 'PARSED', tone: 'info', rank: 2, action: null },
  APPLYING: { label: 'APPLYING', tone: 'fulfillment', rank: 2, action: null },
  APPLIED: { label: 'APPLIED', tone: 'success', rank: 3, action: null },
  // Paired to an order by an operator (Link label) — resolved, nothing to do.
  LINKED: { label: 'LINKED', tone: 'success', rank: 3, action: null },
};

export function ledgerStatus(state: LabelIngestionState): LedgerStatus {
  return STATUS[state];
}

export const LEDGER_ACTION_LABEL: Record<LedgerAction, string> = {
  apply: 'Apply to packed units',
  retry: 'Reprocess label',
};

/** Safe server reason code → the sentence an operator acts on. */
const QUARANTINE_COPY: Record<LabelQuarantineReasonCode, string> = {
  PARSE_FAILED: 'The PDF could not be read.',
  PDF_LIMIT_EXCEEDED: 'The PDF is over the page, size or time limit.',
  TRACKING_ONLY: 'Tracking found, but no order reference on the label.',
  MISSING_ACCOUNT_CONTEXT: 'Order reference found without its marketplace account.',
  CYCLEFORGE_REFERENCE_UNMAPPED: 'CycleForge reference does not map to an order.',
  ORDER_NOT_FOUND: 'No order has this exact reference.',
  AMBIGUOUS_ORDER_MATCH: 'More than one order has this reference.',
  UNSUPPORTED_CARRIER: 'The carrier on this label is not supported.',
  MULTI_PACKAGE_EVIDENCE: 'The label shows more than one package.',
  STAGING_FAILED: 'The PDF could not be stored. Reprocess to try again.',
};

/**
 * The server's resolver also files a label with NO readable tracking under
 * `TRACKING_ONLY`, so the sentence reads the record's own tracking field
 * rather than claiming tracking was found.
 */
export function quarantineCopy(code: string | null, trackingDetected: boolean): string | null {
  if (!code) return null;
  if (code === 'TRACKING_ONLY' && !trackingDetected) return 'No tracking number was read from the label.';
  return (QUARANTINE_COPY as Record<string, string | undefined>)[code] ?? code;
}

export const LEDGER_VIEWS = ['needs-action', 'all', 'applied'] as const;
export type LedgerView = (typeof LEDGER_VIEWS)[number];

export const LEDGER_VIEW_LABEL: Record<LedgerView, string> = {
  'needs-action': 'Needs action',
  all: 'All labels',
  applied: 'Applied',
};

/**
 * Which records a view shows, in what order. "Needs action" is every record
 * with a permitted action, worst first; the other views keep the server's
 * newest-first order.
 */
export function ledgerViewRows<T extends { state: LabelIngestionState; id: number }>(
  rows: readonly T[],
  view: LedgerView,
): T[] {
  if (view === 'applied') return rows.filter((row) => row.state === 'APPLIED');
  if (view === 'all') return [...rows];
  return rows
    .filter((row) => STATUS[row.state].action !== null)
    .sort((a, b) => STATUS[a.state].rank - STATUS[b.state].rank || b.id - a.id);
}
