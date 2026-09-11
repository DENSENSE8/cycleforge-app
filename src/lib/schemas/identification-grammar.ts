import { z } from 'zod';

/** Tenant job ids — not house `scan_out` / `pick`. */
export const IDENTIFICATION_JOB_ID_RE = /^[a-z][a-z0-9_]{1,62}$/;

export const IdentificationGrammarPattern = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('prefix'),
      prefix: z.string().trim().min(1).max(32),
    })
    .strict(),
  z
    .object({
      kind: z.literal('regex'),
      source: z.string().min(1).max(200),
      entityGroup: z.number().int().min(1).max(8).optional(),
    })
    .strict(),
]);

export const IdentificationGrammarBody = z
  .object({
    jobId: z.string().regex(IDENTIFICATION_JOB_ID_RE),
    entityKind: z.literal('order'),
    mutate: z.enum(['SHIP_CONFIRM', 'PICK_CONFIRM']).nullable(),
    claimPath: z.string().trim().min(1).max(200),
    sessionPath: z.string().trim().min(1).max(200),
    patterns: z.array(IdentificationGrammarPattern).min(1).max(8),
  })
  .strict();

export type IdentificationGrammarBody = z.infer<typeof IdentificationGrammarBody>;
export type IdentificationGrammarPattern = z.infer<typeof IdentificationGrammarPattern>;

export const IdentificationClassifyHit = z
  .object({
    jobId: z.string().regex(IDENTIFICATION_JOB_ID_RE),
    entityId: z.string().trim().min(1).max(120),
  })
  .strict();

export type IdentificationClassifyHit = z.infer<typeof IdentificationClassifyHit>;

export const IdentificationAuthorBrief = z
  .object({
    brief: z.string().trim().min(8).max(2000),
  })
  .strict();

export type IdentificationAuthorBrief = z.infer<typeof IdentificationAuthorBrief>;
