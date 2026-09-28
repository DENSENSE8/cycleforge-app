import { z } from 'zod';
import { CLAIM_TYPE_LABEL, type ClaimType } from '@/lib/receiving-claim-type';

const CLAIM_TYPE_VALUES = Object.keys(CLAIM_TYPE_LABEL) as [ClaimType, ...ClaimType[]];

/** Positive integer id that may arrive as a string (JSON / query), number, null, "", or "null". */
const optionalPositiveId = z.preprocess((v) => {
  if (v === null || v === undefined || v === '' || v === 'null') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined;
}, z.number().int().positive().optional());

/** Required positive id — accepts string or number. */
const requiredPositiveId = z.preprocess((v) => {
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
  /**
   * The claim wizard's reason — recorded as the ticket's receiving exception.
   * Absent (a generic link surface) = the ticket carries no reason.
   */
  claimType: z.enum(CLAIM_TYPE_VALUES).optional(),
});

export const ClaimTicketUnlinkQuery = z.object({
  receivingId: requiredPositiveId,
  lineId: optionalPositiveId,
  ticketId: requiredPositiveId,
});

export function formatZodIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
}
