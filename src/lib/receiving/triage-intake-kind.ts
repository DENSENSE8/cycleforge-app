/** Intake-kind fork for `TriagePanel` (docs/receiving-triage-redesign-plan.md §3.3) — PO vs Return template selection. */

import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { effectiveIntakeKind, isIntakeKind } from '@/lib/receiving/kinds/registry';

/** Composes off the effectiveIntakeKind SoT (line override wins unless it's the 'PO' default, else the carton default) rather than an… */
export function isReturnIntake(
  row: Pick<ReceivingLineRow, 'intake_type' | 'receiving_type' | 'carton_intake_type'>,
): boolean {
  return effectiveIntakeKind(row.intake_type || row.receiving_type, row.carton_intake_type) === 'RETURN';
}

/** Has a concrete intake kind been *deliberately assigned* to this carton? */
export function isIntakeClassified(
  row: Pick<ReceivingLineRow, 'intake_type' | 'carton_intake_type'>,
): boolean {
  const recognized = (v?: string | null): boolean => isIntakeKind((v ?? '').trim().toUpperCase());
  return recognized(row.intake_type) || recognized(row.carton_intake_type);
}
