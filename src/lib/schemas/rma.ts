import { z } from 'zod';

const trimmed = z.string().trim();

// ─── PATCH /api/rma/[id] ────────────────────────────────────────────────────

export const RmaUpdateBody = z
  .object({
    expected_carrier: trimmed.min(1).optional(),
    expires_at: trimmed.min(1).optional(),
    notes: trimmed.min(1).optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, {
    message: 'At least one field must be provided',
  });
