import { z } from 'zod';

/** One paste is a handful of images, not an album. */
export const MAX_STAGED_DRAFT_PHOTOS = 6;

/** POST /api/support/items/[id]/drafts — "Draft with AI" now. */
export const SupportDraftNowBody = z.object({
  /** Photos staged in the composer (ids, never URLs); their OCR / matches ground the draft. */
  stagedPhotoIds: z.array(z.number().int().positive()).max(MAX_STAGED_DRAFT_PHOTOS).optional(),
});
