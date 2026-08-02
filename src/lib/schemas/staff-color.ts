import { z } from 'zod';

/** PATCH /api/staff/[id]/color — self OR admin.manage_staff. */
export const StaffColorBody = z.object({
  color_hex: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'color_hex must be a #RRGGBB hex string'),
});

export type StaffColorBody = z.infer<typeof StaffColorBody>;
