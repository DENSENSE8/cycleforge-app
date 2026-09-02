/** Incoming desk add-walk — `?intake=po` | `?intake=return`. */

export const INCOMING_INTAKE_PARAM = 'intake';

export type IncomingIntakeKind = 'po' | 'return';

export function parseIncomingIntake(raw: string | null | undefined): IncomingIntakeKind | null {
  if (raw === 'po' || raw === 'return') return raw;
  return null;
}

export function writeIncomingIntake(
  params: URLSearchParams,
  kind: IncomingIntakeKind | null,
): void {
  if (!kind) params.delete(INCOMING_INTAKE_PARAM);
  else params.set(INCOMING_INTAKE_PARAM, kind);
}

