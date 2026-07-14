/**
 * Client-safe wire types + vocab for entity threads (no DB imports — safe from
 * hooks/components). The server domain layer (`./threads.ts`) re-exports these;
 * the DB CHECKs (migration 2026-07-14_entity_threads.sql) mirror the vocab.
 */

export const THREAD_STATUSES = ['open', 'snoozed', 'resolved'] as const;
export type ThreadStatus = (typeof THREAD_STATUSES)[number];

export const THREAD_MESSAGE_PROVIDERS = ['internal', 'zendesk', 'system'] as const;
export type ThreadMessageProvider = (typeof THREAD_MESSAGE_PROVIDERS)[number];

export const THREAD_MESSAGE_VISIBILITIES = ['internal', 'public'] as const;
export type ThreadMessageVisibility = (typeof THREAD_MESSAGE_VISIBILITIES)[number];

export interface EntityThread {
  id: number;
  entityType: string;
  entityId: number;
  status: ThreadStatus;
  supportTicketId: number | null;
  lastMessageAt: string | null;
  createdBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadMessage {
  id: number;
  threadId: number;
  authorStaffId: number | null;
  /** Resolved staff display name (list reads join it; absent on fresh inserts). */
  authorName?: string | null;
  provider: ThreadMessageProvider;
  visibility: ThreadMessageVisibility;
  body: string;
  clientEventId: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}
