import type { ReceivingUnitStageFactView } from './receiving-line-row';

export interface ReceivingUnitStageLine {
  quantity: number | null | undefined;
  unitStageFacts?: readonly ReceivingUnitStageFactView[] | null;
}

export type ReceivingUnitNextAction =
  | 'Triage'
  | 'Print labels'
  | 'Test'
  | 'Retest'
  | 'Resolve failure'
  | 'Put away';

export interface ReceivingUnitStageSummary {
  units: number;
  triaged: number;
  labelsPrinted: number;
  pending: number;
  retest: number;
  passed: number;
  failed: number;
  tickets: number;
  strongestQc: ReceivingUnitStageFactView['qc_state'];
  nextAction: ReceivingUnitNextAction;
  compact: string;
}

const positiveInt = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

/**
 * Fold projected physical units into the one glanceable Receiving sentence.
 * Missing projection rows are deliberate virtual units: before labels mint a
 * durable unit identity, expected quantity still needs triage, a label and QC.
 */
export function summarizeReceivingUnitStages(
  lines: readonly ReceivingUnitStageLine[],
): ReceivingUnitStageSummary {
  let units = 0;
  let triaged = 0;
  let labelsPrinted = 0;
  let pending = 0;
  let retest = 0;
  let passed = 0;
  let failed = 0;
  const tickets = new Set<number>();

  for (const line of lines) {
    const facts = line.unitStageFacts ?? [];
    const lineUnits = Math.max(positiveInt(line.quantity), facts.length);
    units += lineUnits;
    for (const fact of facts) {
      if (fact.triage_state === 'TRIAGED') triaged += 1;
      if (fact.label_state === 'PRINTED') labelsPrinted += 1;
      if (fact.qc_state === 'FAILED') failed += 1;
      else if (fact.qc_state === 'TEST_AGAIN') retest += 1;
      else if (fact.qc_state === 'PASSED') passed += 1;
      else pending += 1;
      if (fact.primary_support_ticket_id != null) tickets.add(fact.primary_support_ticket_id);
    }
    // Expected units do not become invisible while their durable rows are
    // being established. They are pending by definition.
    pending += Math.max(0, lineUnits - facts.length);
  }

  const strongestQc: ReceivingUnitStageFactView['qc_state'] = failed > 0
    ? 'FAILED'
    : pending > 0
      ? 'PENDING'
      : retest > 0
        ? 'TEST_AGAIN'
        : 'PASSED';
  const nextAction: ReceivingUnitNextAction = triaged < units
    ? 'Triage'
    : labelsPrinted < units
      ? 'Print labels'
      : failed > 0
        ? 'Resolve failure'
        : pending > 0
          ? 'Test'
          : retest > 0
            ? 'Retest'
            : 'Put away';
  const parts = [`${units} ${units === 1 ? 'unit' : 'units'}`];
  if (passed > 0) parts.push(`${passed} passed`);
  if (failed > 0) parts.push(`${failed} failed`);
  if (pending > 0) parts.push(`${pending} pending`);
  if (retest > 0) parts.push(`${retest} retest`);

  return {
    units,
    triaged,
    labelsPrinted,
    pending,
    retest,
    passed,
    failed,
    tickets: tickets.size,
    strongestQc,
    nextAction,
    compact: parts.join(' · '),
  };
}
