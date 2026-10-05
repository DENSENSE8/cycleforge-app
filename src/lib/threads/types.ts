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

/**
 * Thread-only anchors — entity_threads accepts these beyond SURFACE_ENTITY_TYPES
 * (they are not feed/signal anchors, so they stay out of that registry and its
 * pinned CHECKs). Mirrors `entity_threads_entity_type_chk`
 * (2026-10-03_entity_threads_task_document_anchor.sql, 2026-10-04d_support_closed_loop.sql).
 * `opsEventEntityType` is the spine vocab the THREAD_MESSAGE ops_events row is stamped with.
 */
export const THREAD_ANCHOR_EXTRA = {
  /** One thread per task document; each message's meta carries the quoted passage. */
  TASK_DOCUMENT: { parentTable: 'work_assignment_documents', opsEventEntityType: 'other' },
  /** The canonical conversation of a Support item (support_tickets.id); writer waist ingestSupportMessage. */
  SUPPORT_TICKET: { parentTable: 'support_tickets', opsEventEntityType: 'other' },
} as const;
export type ThreadAnchorExtraType = keyof typeof THREAD_ANCHOR_EXTRA;

/** thread_links discriminator — the 7 anchors + SKU (entity_id = sku_catalog.id). */
export const THREAD_LINK_ENTITY_TYPES = [
  'RECEIVING', 'RECEIVING_LINE', 'SERIAL_UNIT', 'ORDER',
  'FBA_SHIPMENT', 'REPAIR', 'WARRANTY_CLAIM', 'SKU',
] as const;
export type ThreadLinkEntityType = (typeof THREAD_LINK_ENTITY_TYPES)[number];

export const THREAD_LINK_ROLES = [
  'related', 'tracking', 'order', 'sku', 'serial', 'duplicate', 'follow_up',
] as const;
export type ThreadLinkRole = (typeof THREAD_LINK_ROLES)[number];

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
  /** Set once the message is soft-deleted (kept for the audit/ops_events trail). */
  editedAt?: string | null;
}

export interface ThreadAssignment {
  threadId: number;
  assignedStaffId: number;
  assignedStaffName?: string | null;
  assignedBy: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ThreadLink {
  id: number;
  threadId: number;
  entityType: ThreadLinkEntityType;
  entityId: number;
  linkRole: ThreadLinkRole;
  createdBy: number | null;
  createdAt: string;
  /** Best-effort display label resolved server-side (e.g. order #, serial, SKU). */
  label?: string | null;
}

/** One resolved "dot" — a related entity a thread connects to. */
export interface ThreadConnection {
  entityType: string;
  entityId: number | null;
  /** Human label (order number, serial, tracking, SKU). */
  label: string;
  /** Where the connection came from: 'derived' (read-side) or 'link' (curated). */
  origin: 'derived' | 'link';
  /** Deep-link href when resolvable. */
  href?: string | null;
  /** For derived tracking rows with no entity id. */
  hint?: string | null;
}
