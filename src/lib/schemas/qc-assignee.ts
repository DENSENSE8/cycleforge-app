import { z } from 'zod';

/**
 * PATCH /api/receiving-lines/qc-assignee — assign (or clear) the QC tech on the
 * origin receiving line of every unit live-allocated to an order.
 */
export const OrderQcAssigneeBody = z
  .object({
    order_id: z.number().int().positive(),
    /** Staff id to assign; `null` clears the assignment. */
    assigned_tech_id: z.number().int().positive().nullable(),
  })
  .strict();

export type OrderQcAssigneeBody = z.infer<typeof OrderQcAssigneeBody>;
