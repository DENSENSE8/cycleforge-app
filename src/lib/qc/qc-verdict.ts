/**
 * The three QC verdicts every surface offers — the desk record's Actions panel verbs
 * (keys P / T / F) and the phone's verdict buttons — and their one writer,
 * `POST /api/serial-units/{id}/test` (`recordTestVerdict`).
 */

import type { TestVerdict } from '@/lib/tech/recordTestVerdict';
import type { QcUnitStage } from './unit-qc-stage';

export interface QcVerdictSpec {
  verdict: TestVerdict;
  label: string;
  /** The desk record's key for it. */
  hotkey: string;
  /** What the tech reads once it is recorded. */
  ack: string;
  /** The stage it moves the unit to — the verb that reads pressed. */
  stage: QcUnitStage;
}

export const QC_VERDICTS = [
  { verdict: 'PASS', label: 'Pass', hotkey: 'p', ack: 'Passed', stage: 'passed' },
  { verdict: 'TEST_AGAIN', label: 'Test again', hotkey: 't', ack: 'Back in test', stage: 'testing' },
  { verdict: 'TESTING_FAILED', label: 'Failed', hotkey: 'f', ack: 'Failed', stage: 'failed' },
] as const satisfies readonly QcVerdictSpec[];

/** Record a verdict; resolves to the unit's status after it. Throws with the server's reason. */
export async function postQcVerdict(
  unitId: number,
  verdict: TestVerdict,
  { notes, clientEventId }: { notes: string | null; clientEventId: string },
): Promise<{ status: string | null }> {
  const res = await fetch(`/api/serial-units/${unitId}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ verdict, notes, client_event_id: clientEventId }),
  });
  const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; unit?: { current_status?: string } } | null;
  if (!res.ok || !json?.ok) throw new Error(json?.error || (res.status === 403 ? 'No permission for this verdict' : `HTTP ${res.status}`));
  return { status: json.unit?.current_status ?? null };
}
