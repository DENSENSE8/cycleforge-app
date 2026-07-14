import { z } from 'zod';
import { SURFACE_ENTITY_TYPE_LIST } from '@/lib/surfaces/registry';
import { THREAD_MESSAGE_VISIBILITIES } from '@/lib/threads/types';

/** POST /api/threads — get-or-create the entity's thread. */
export const ThreadCreateBody = z.object({
  entityType: z.enum(SURFACE_ENTITY_TYPE_LIST as [string, ...string[]]),
  entityId: z.number().int().positive(),
});
export type ThreadCreateBodyT = z.infer<typeof ThreadCreateBody>;

/** POST /api/threads/[id]/messages */
export const ThreadMessagePostBody = z.object({
  body: z.string().trim().min(1).max(20_000),
  visibility: z.enum(THREAD_MESSAGE_VISIBILITIES).default('internal'),
  /** Client-minted idempotency key — a retried POST is a no-op. */
  clientEventId: z.string().min(1).max(200).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type ThreadMessagePostBodyT = z.infer<typeof ThreadMessagePostBody>;

/** POST /api/threads/[id]/attach-ticket */
export const ThreadAttachTicketBody = z.object({
  supportTicketId: z.number().int().positive(),
});
export type ThreadAttachTicketBodyT = z.infer<typeof ThreadAttachTicketBody>;
