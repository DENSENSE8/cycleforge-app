/** The ONE status resolver for a label-ingestion record (the Labels & documents desk). */
import type { LabelIngestionState, LabelQuarantineReasonCode } from './types';

type LedgerAction = 'apply' | 'retry';

interface LedgerStatus {
  /** Written state — the meaning. */
  label: string;
  /** The single action the server lifecycle permits from this state. */
  action: LedgerAction | null;
}

const STATUS: Record<LabelIngestionState, LedgerStatus> = {
  QUARANTINED: { label: 'Quarantined', action: 'retry' },
  FAILED: { label: 'Failed', action: 'retry' },
  MATCHED: { label: 'Ready to apply', action: 'apply' },
  RECEIVED: { label: 'Received', action: null },
  STAGED: { label: 'Staged', action: null },
  PARSED: { label: 'Parsed', action: null },
  APPLYING: { label: 'Applying', action: null },
  APPLIED: { label: 'Applied', action: null },
  // Paired to an order by an operator (Link label) — resolved, nothing to do.
  LINKED: { label: 'Linked', action: null },
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
  BUYER_NOT_FOUND: 'No open order has the buyer named on this label.',
  BUYER_AMBIGUOUS: 'This buyer has several open orders — confirm which one this label ships.',
  OPERATOR_UNPAIRED: 'Taken off its order — file it on an order again, or remove it.',
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
