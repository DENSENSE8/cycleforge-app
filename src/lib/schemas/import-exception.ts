import { z } from 'zod';

export const ImportExceptionActionBody = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('resolve'),
    id: z.number().int().positive(),
    itemNumber: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal('ignore'),
    id: z.number().int().positive(),
  }),
]);

export type ImportExceptionActionBody = z.infer<typeof ImportExceptionActionBody>;
