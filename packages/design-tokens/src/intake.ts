/**
 * Intake classes — what an arrived package IS, on every platform. The arrival
 * triage question ("is it a return? a repair? a ticket?", BRIEF §2) answered
 * as one code and one word.
 *
 *   code   3-letter mono code on the row (read aloud as `label`)
 *   label  the full word
 *
 * A class is a CATEGORY, not a state, so it carries no tone of its own: a
 * surface prints it in neutral ink, and colours it only with the OUTCOME of
 * the scan that produced it (success / warning / danger, `state.ts`). Owner
 * decision 2026-09-24 — a sibling of LIFECYCLE, not an extension of it:
 * LIFECYCLE is the outbound lifecycle, and inbound categories do not belong in
 * that registry.
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
