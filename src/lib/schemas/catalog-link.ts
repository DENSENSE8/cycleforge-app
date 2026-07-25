import { z } from 'zod';

export const CatalogLinkActionBody = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('link'),
    choreId: z.number().int().positive(),
    skuCatalogId: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('ignore'),
    choreId: z.number().int().positive(),
  }),
]);

export type CatalogLinkActionBody = z.infer<typeof CatalogLinkActionBody>;
