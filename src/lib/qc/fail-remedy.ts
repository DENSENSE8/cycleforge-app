/**
 * What to ask the seller for when a unit fails QC: send it back (return for a
 * full refund) or keep it at a discount (partial refund). The suggestion is a
 * starting point the tech overrides — the ticket records what they chose.
 */

export type QcFailRemedy = 'return' | 'partial_refund';

export const QC_FAIL_REMEDY_LABEL: Readonly<Record<QcFailRemedy, string>> = {
  return: 'Return for refund',
  partial_refund: 'Partial refund',
};

interface QcFailRemedySuggestion {
  remedy: QcFailRemedy;
  /** Why, in the tech's words — shown under the choice and filed on the ticket. */
  why: string;
}

/**
 * A minority of failed checks (at most one in three) means the unit mostly
 * works — keep it, ask for money back. Anything worse, a parts grade, or a
 * fail with no failing check on record means it does not work — send it back.
 */
export function suggestQcFailRemedy(input: {
  failed: number;
  total: number;
  conditionGrade: string | null;
}): QcFailRemedySuggestion {
  if ((input.conditionGrade ?? '').trim().toUpperCase() === 'PARTS') {
    return { remedy: 'return', why: 'Graded for parts' };
  }
  if (input.failed <= 0 || input.total <= 0) {
    return { remedy: 'return', why: 'Failed test with no single failing check recorded' };
  }
  const tally = `${input.failed} of ${input.total} checks failed`;
  if (input.failed * 3 <= input.total) {
    return { remedy: 'partial_refund', why: `${tally} — the rest work` };
  }
  return { remedy: 'return', why: tally };
}

/** The claim reason a failed-QC ticket files (`/api/receiving/zendesk-claim` → "Claim reason:"). */
export function qcFailClaimReason(input: {
  remedy: QcFailRemedy;
  why: string;
  title: string | null;
  serialNumber: string;
  sku: string | null;
  note: string;
}): string {
  const unit = [input.title, input.sku ? `SKU ${input.sku}` : null, `SN ${input.serialNumber}`]
    .filter(Boolean)
    .join(' · ');
  return [
    `Failed QC: ${unit}`,
    `Requested resolution: ${QC_FAIL_REMEDY_LABEL[input.remedy]}`,
    `Basis: ${input.why}`,
    ...(input.note.trim() ? [`Tech note: ${input.note.trim()}`] : []),
  ].join('\n');
}
