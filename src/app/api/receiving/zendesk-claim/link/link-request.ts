import { z } from 'zod';

/**
 * Positive integer id that may arrive as a string (JSON / query), number, null,
 * "", or "null". Non-positive shapes (incl. unfound stub ids `id = -receiving_id`)
 * become `undefined` so `.positive()` never rejects carton-level claims.
 *
 * Same contract as archive-only — `z.coerce.number()` alone turns ""/null into 0
 * which then fails `.positive()` and surfaces as opaque "Validation failed".
 */
export const optionalPositiveId = z.preprocess((v) => {
  if (v === null || v === undefined || v === '' || v === 'null') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined;
}, z.number().int().positive().optional());

/** Required positive id — accepts string or number. */
export const requiredPositiveId = z.preprocess((v) => {
  if (v === null || v === undefined || v === '' || v === 'null') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined;
}, z.number().int().positive());

export const ClaimTicketLinkSearchQuery = z.object({
  query: z.string().trim().optional(),
  receivingId: requiredPositiveId,
  lineId: optionalPositiveId,
});

export const ClaimTicketLinkBody = z.object({
  receivingId: requiredPositiveId,
  lineId: optionalPositiveId,
  ticketId: requiredPositiveId,
});

export const ClaimTicketUnlinkQuery = z.object({
  receivingId: requiredPositiveId,
  lineId: optionalPositiveId,
  ticketId: requiredPositiveId,
});

export function formatZodIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
}
