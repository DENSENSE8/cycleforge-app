/**
 * Intake classes — what an arrived package IS, on every platform.
 * triage question ("is it a return? a repair? a ticket?", BRIEF §2) answered
 */
export interface IntakeClassSpec {
  code: string;
  label: string;
}

export const INTAKE = {
  unclassified: { code: 'NEW', label: 'Not classified' },
  return: { code: 'RTN', label: 'Return' },
  repair: { code: 'REP', label: 'Repair' },
  ticket: { code: 'TKT', label: 'Ticket' },
} as const satisfies Record<string, IntakeClassSpec>;

export type IntakeClass = keyof typeof INTAKE;

export const INTAKE_CLASSES = Object.keys(INTAKE) as IntakeClass[];
