import { z } from 'zod';

/**
 * PATCH /api/staff/[id]/name — self OR admin.manage_staff.
 *
 * Bounds mirror `/api/admin/staff/update`'s `name` field (1–120, trimmed) so the
 * two writers cannot disagree about what a legal staff name is — a self-service
 * rename that the admin form would reject is a rename nobody can undo from the
 * admin surface.
 */
export const StaffNameBody = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
});

export type StaffNameBody = z.infer<typeof StaffNameBody>;
