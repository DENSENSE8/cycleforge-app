import { z } from 'zod';

/** Floor functional roles — independent of RBAC access roles. */
export const STAFF_FUNCTIONAL_ROLE_KEYS = ['picker', 'packer'] as const;
export type StaffFunctionalRoleKey = (typeof STAFF_FUNCTIONAL_ROLE_KEYS)[number];

/** PUT /api/staff/[id]/functional-roles — grant or revoke one functional role. */
export const StaffFunctionalRoleBody = z
  .object({
    role: z.enum(STAFF_FUNCTIONAL_ROLE_KEYS),
    enabled: z.boolean(),
  })
  .strict();

export type StaffFunctionalRoleBody = z.infer<typeof StaffFunctionalRoleBody>;
