import { z } from 'zod';

/** Validation for the Packer Review Station verification endpoints (docs/todo/packer-review-station-plan.md Phase 3c). */

const trimmed = z.string().trim();

/** Packer submit — floor-capture outcomes only (POST /api/packing/verification,
 *  permission `packing.complete_order`). Maps the sketch's tracking cross-check:
 *  found → VERIFIED, not found → ERROR_MISSING_TRACKING, OCR fail → ERROR_OCR_FAILED. */
export const PackVerificationSubmitBody = z.object({
  packerLogId: z.coerce.number().int().positive(),
  outcome: z.enum(['VERIFIED', 'ERROR_MISSING_TRACKING', 'ERROR_OCR_FAILED']),
  detectedTracking: trimmed.min(1).max(200).nullish(),
  detectedOrderId: trimmed.min(1).max(200).nullish(),
  ocrConfidence: z.number().min(0).max(1).nullish(),
  clientEventId: z.string().uuid().nullish(),
  meta: z.record(z.string(), z.unknown()).nullish(),
});

/** Manager decision — review outcomes only (POST /api/packing/verification/decide,
 *  permission `packing.review`). A flag requires a note (also enforced in the helper). */
export const PackVerificationDecideBody = z
  .object({
    packerLogId: z.coerce.number().int().positive(),
    outcome: z.enum(['REVIEW_APPROVED', 'REVIEW_FLAGGED']),
    note: trimmed.max(2000).nullish(),
    clientEventId: z.string().uuid().nullish(),
  })
  .refine((b) => b.outcome !== 'REVIEW_FLAGGED' || (typeof b.note === 'string' && b.note.trim().length > 0), {
    message: 'A note is required when flagging',
    path: ['note'],
  });
