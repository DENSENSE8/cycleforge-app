import { z } from 'zod';

/** PATCH /api/staff/[id]/name — self OR admin.manage_staff. */
export const StaffNameBody = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
});

export type StaffNameBody = z.infer<typeof StaffNameBody>;
