/**
 * `/api/qc/triage/{next,decisions}` — the triage tree contract. Client-safe: Zod only.
 * Envelope matches `src/lib/qc/contracts.ts`: `{ data }` on success, `{ error }` on failure.
 * Both routes gate on `tech.qc_pass` (bench writes: `next` stores every suggestion).
 */

import { z } from 'zod';

const id = z.number().int().positive();

export const TRIAGE_STEP_KINDS = ['CHECK', 'FIX', 'RETEST'] as const;
export const TRIAGE_DECISIONS = ['ACCEPTED', 'REJECTED'] as const;

export const triageNextBodySchema = z
  .object({
    serialUnitId: id,
    qcSessionId: id.nullable().optional().describe('Scopes readings to this session; must be on the same unit.'),
    ai: z.boolean().optional().describe('Default true. false → deterministic ranking only.'),
  })
  .strict();
export type TriageNextBody = z.input<typeof triageNextBodySchema>;

export const triageDecisionBodySchema = z
  .object({
    suggestionId: id.describe('`steps[].id` from /api/qc/triage/next.'),
    decision: z.enum(TRIAGE_DECISIONS),
    note: z.string().trim().max(1000).nullable().optional(),
  })
  .strict();
export type TriageDecisionBody = z.input<typeof triageDecisionBodySchema>;

const evidenceRefSchema = z.object({
  type: z.enum(['reading', 'code', 'failure_tag', 'checklist', 'repair', 'decision', 'verdict']),
  id: z.string(),
  label: z.string(),
});

export const triageSuggestionSchema = z.object({
  id: z.number().int().describe('qc_triage_decisions.id — post the decision against it.'),
  rank: z.number().int(),
  key: z.string().describe('Stable step identity; decisions on it feed the ranker.'),
  step: z.string(),
  kind: z.enum(TRIAGE_STEP_KINDS),
  why: z.string(),
  evidence: z.array(evidenceRefSchema),
  confidence: z.number().describe('Deterministic, 0..1 — the AI pass reorders and explains, never rescores.'),
  failureModeId: z.number().int().nullable(),
});
export type TriageSuggestion = z.infer<typeof triageSuggestionSchema>;

export const triageNextSchema = z.object({
  requestId: z.string(),
  rankedBy: z.enum(['DETERMINISTIC', 'AI']),
  model: z.string().nullable(),
  /** Set when the AI pass was asked for but not used; the deterministic order stands. */
  aiError: z.string().nullable(),
  unit: z.object({ id: z.number().int(), sku: z.string().nullable(), family: z.string().nullable() }),
  steps: z.array(triageSuggestionSchema),
});
export type TriageNext = z.infer<typeof triageNextSchema>;

export const triageDecisionWriteSchema = z.object({
  suggestionId: z.number().int(),
  decision: z.enum(TRIAGE_DECISIONS),
  decidedAt: z.string(),
  /** false when the same decision was already recorded. */
  changed: z.boolean(),
});
export type TriageDecisionWrite = z.infer<typeof triageDecisionWriteSchema>;
