import { z } from 'zod';

/** PATCH /api/nav/child-order — persist desk tab order only. */
export const NavChildOrderBody = z
  .object({
    pageId: z.string().min(1).max(64),
    orderedIds: z.array(z.string().min(1).max(64)).min(2).max(40),
  })
  .strict();

export type NavChildOrderBody = z.infer<typeof NavChildOrderBody>;
