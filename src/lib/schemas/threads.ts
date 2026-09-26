import { z } from 'zod';
import { SURFACE_ENTITY_TYPE_LIST } from '@/lib/surfaces/registry';
import {
  THREAD_MESSAGE_VISIBILITIES,
  THREAD_STATUSES,
  THREAD_LINK_ENTITY_TYPES,
  THREAD_LINK_ROLES,
} from '@/lib/threads/types';

/** POST /api/threads — get-or-create the entity's thread. */
export const ThreadCreateBody = z.object({
  entityType: z.enum(SURFACE_ENTITY_TYPE_LIST as [string, ...string[]]),
  entityId: z.number().int().positive(),
});
type ThreadCreateBodyT = z.infer<typeof ThreadCreateBody>;

/** POST /api/threads/[id]/messages */
export const ThreadMessagePostBody = z.object({
  body: z.string().trim().min(1).max(20_000),
  visibility: z.enum(THREAD_MESSAGE_VISIBILITIES).default('internal'),
  /** Client-minted idempotency key — a retried POST is a no-op. */
  clientEventId: z.string().min(1).max(200).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});
type ThreadMessagePostBodyT = z.infer<typeof ThreadMessagePostBody>;

/** POST /api/threads/[id]/attach-ticket */
export const ThreadAttachTicketBody = z.object({
  supportTicketId: z.number().int().positive(),
});
type ThreadAttachTicketBodyT = z.infer<typeof ThreadAttachTicketBody>;

/** POST /api/threads/[id]/escalate — create + attach a ticket (D6). */
export const ThreadEscalateBody = z.object({
  mode: z.enum(['internal', 'zendesk']),
  subject: z.string().trim().min(1).max(300).optional(),
  note: z.string().trim().max(20_000).optional(),
});
type ThreadEscalateBodyT = z.infer<typeof ThreadEscalateBody>;

/** PATCH /api/threads/[id] — update thread status. */
export const ThreadStatusPatchBody = z.object({
  status: z.enum(THREAD_STATUSES),
});
type ThreadStatusPatchBodyT = z.infer<typeof ThreadStatusPatchBody>;

/** PATCH /api/threads/[id]/messages/[messageId] — edit a message body. */
export const ThreadMessageEditBody = z.object({
  body: z.string().trim().min(1).max(20_000),
});
type ThreadMessageEditBodyT = z.infer<typeof ThreadMessageEditBody>;

/** POST /api/threads/[id]/assign — set/replace the thread owner. */
export const ThreadAssignBody = z.object({
  assignedStaffId: z.number().int().positive(),
});
type ThreadAssignBodyT = z.infer<typeof ThreadAssignBody>;

/** POST /api/threads/[id]/links — curate a cross-entity connection. */
export const ThreadLinkBody = z.object({
  entityType: z.enum(THREAD_LINK_ENTITY_TYPES),
  entityId: z.number().int().positive(),
  linkRole: z.enum(THREAD_LINK_ROLES).default('related'),
});
type ThreadLinkBodyT = z.infer<typeof ThreadLinkBody>;
