/**
 * The Support loop's transaction-bound store — the seam between the loop's
 * rules (ingest / reply / item actions / resolve) and Postgres. The real
 * binding (`pgSupportStore` in `./store-db`) runs every method on ONE
 * `withTenantTransaction` client; unit tests pass an in-memory fake.
 */
import type { TaskHold } from '@/design-system/tokens/task-status';
import type { TaskDeskStatus } from '@/lib/tasks/task-desk-row';
import type { TaskFollowUpChannel, TaskFollowUpDirection } from '@/lib/tasks/task-follow-ups-shared';
import type { OrgId } from '@/lib/tenancy/constants';
import type { SupportEntityLinkType, SupportOrderLinkInput } from './ingest-types';
import type {
  DeliveryState,
  ReplyDisposition,
  SupportChannel,
  SupportDraftKind,
  SupportItemKind,
  SupportLifecycle,
  SupportMessageDirection,
  SupportMessageProvider,
  SupportPurpose,
  SupportPurposeSource,
} from './model';

/** The `support_tickets` facts the rules read (locked FOR UPDATE inside the transaction). */
export interface SupportItemRow {
  id: number;
  kind: SupportItemKind;
  channel: SupportChannel;
  externalTicketId: string | null;
  subject: string | null;
  purpose: SupportPurpose;
  purposeSource: SupportPurposeSource;
  purposeAcknowledgedAt: string | null;
  lifecycle: SupportLifecycle;
  snoozedUntil: string | null;
  requesterEmail: string | null;
  accountLabel: string | null;
  primaryTaskId: number | null;
  pendingInboundCount: number;
  resolvedAt: string | null;
}

export interface SupportItemInsert {
  kind: SupportItemKind;
  channel: SupportChannel;
  externalTicketId: string | null;
  subject: string | null;
  purpose: SupportPurpose;
  purposeSource: SupportPurposeSource;
  purposeAcknowledgedByStaffId: number | null;
  requesterName: string | null;
  requesterEmail: string | null;
  requesterHandle: string | null;
  accountLabel: string | null;
  /** The org platform (`platforms.id`) the item is about. */
  platformId: number | null;
  platformAccountId: number | null;
  createdByStaffId: number | null;
}

/** Column writes on one item. `undefined` = leave alone. */
export interface SupportItemPatch {
  purpose?: SupportPurpose;
  purposeSource?: SupportPurposeSource;
  /** Stamps purpose_acknowledged_by_staff_id + purpose_acknowledged_at = now(). */
  purposeAcknowledgedByStaffId?: number | null;
  lifecycle?: SupportLifecycle;
  snoozedUntil?: string | null;
  primaryTaskId?: number;
  /** GREATEST(last_inbound_at, value). */
  lastInboundAt?: string;
  /** GREATEST(last_outbound_at, value). */
  lastOutboundAt?: string;
  /** Sets resolved_* (and resolution_override); `null` clears them all. */
  resolution?: { byStaffId: number | null; reason: string | null; override: boolean } | null;
  /** Fill-only: written where the stored value is NULL. */
  fill?: {
    subject?: string | null;
    requesterName?: string | null;
    requesterEmail?: string | null;
    requesterHandle?: string | null;
    accountLabel?: string | null;
    platformId?: number | null;
    platformAccountId?: number | null;
  };
}

/** One stored `thread_messages` row as the rules read it. */
export interface StoredSupportMessage {
  id: number;
  supportItemId: number;
  threadId: number;
  direction: SupportMessageDirection | null;
  provider: SupportMessageProvider;
  occurredAt: string;
  body: string;
  authorStaffId: number | null;
  replyDisposition: ReplyDisposition | null;
  deliveryState: DeliveryState | null;
  externalMessageId: string | null;
  clientEventId: string | null;
  meta: Record<string, unknown> | null;
}

export interface SupportMessageInsert {
  threadId: number;
  direction: SupportMessageDirection;
  provider: SupportMessageProvider;
  visibility: 'public' | 'internal';
  body: string;
  occurredAt: string;
  authorStaffId: number | null;
  authorLabel: string | null;
  externalMessageId: string | null;
  clientEventId: string | null;
  /** Inbound only ('pending'). */
  replyDisposition: ReplyDisposition | null;
  /** Outbound only. */
  deliveryState: DeliveryState | null;
  deliveryError: string | null;
  meta: Record<string, unknown>;
}

/** The primary task as the rules read it (`work_assignments`, FOLLOW_UP, SUPPORT_TICKET anchor). */
export interface SupportTaskRow {
  id: number;
  status: TaskDeskStatus;
  taskState: TaskHold | null;
  /** Primary assignee first, then the other members. */
  ownerIds: number[];
  nextFollowUpAt: string | null;
}

export interface SupportTaskInsert {
  supportItemId: number;
  assigneeStaffIds: number[];
  assignedByStaffId: number | null;
  priority: number;
  note: string | null;
  deadlineAt: string | null;
}

/** A status / hold / chase-instant write through the task desk's ONE patch path. */
export interface SupportTaskPatch {
  status?: TaskDeskStatus;
  taskState?: TaskHold | null;
  nextFollowUpAt?: string | null;
}

export interface SupportFollowUpInsert {
  taskId: number;
  staffId: number | null;
  channel: TaskFollowUpChannel;
  direction: TaskFollowUpDirection;
  occurredAt: string;
  body: string | null;
  threadMessageId: number;
  stampLastFollowUp: boolean;
}

/** One task-Timeline audit row on the primary task (entity work_assignment). */
export interface SupportTimelineEventInsert {
  taskId: number;
  action: string;
  actorStaffId: number | null;
  before?: Record<string, unknown> | null;
  after: Record<string, unknown>;
  extra?: Record<string, unknown>;
  /** For AUDIT_REASON_REQUIRED verbs (override resolve, no reply required). */
  reasonCode?: string;
}

export interface SupportDeliveryCounts {
  /** Outbound `pending` | `copied`. */
  open: number;
  /** Outbound `failed`. */
  failed: number;
}

export interface SupportStore {
  readonly orgId: OrgId;

  // ── Idempotency ──
  findMessageByClientEvent(clientEventId: string): Promise<StoredSupportMessage | null>;
  findMessageByExternal(provider: SupportMessageProvider, externalMessageId: string): Promise<StoredSupportMessage | null>;
  findMessage(supportItemId: number, messageId: number, opts?: { lock?: boolean }): Promise<StoredSupportMessage | null>;

  // ── Item ──
  lockItem(supportItemId: number): Promise<SupportItemRow | null>;
  lockItemByExternal(channel: SupportChannel, externalTicketId: string): Promise<SupportItemRow | null>;
  /** Null when (channel, externalTicketId) already exists (a racing writer won). */
  insertItem(args: SupportItemInsert): Promise<SupportItemRow | null>;
  patchItem(supportItemId: number, patch: SupportItemPatch): Promise<void>;

  // ── Thread + messages ──
  /** The item's SUPPORT_TICKET thread (created on first use; support_ticket_id stamped). */
  ensureThread(supportItemId: number, createdByStaffId: number | null): Promise<number>;
  /** Null on an idempotency-key conflict (client_event_id / external message id). */
  insertMessage(args: SupportMessageInsert): Promise<StoredSupportMessage | null>;
  /** Re-own a message a racing writer stored under the same provider id (outbound only). */
  adoptOutbound(messageId: number, args: { authorStaffId: number | null; clientEventId: string | null; deliveryState: DeliveryState; meta: Record<string, unknown> }): Promise<StoredSupportMessage>;
  setDelivery(messageId: number, deliveryState: DeliveryState, deliveryError: string | null): Promise<void>;
  /** Pending inbound on the item's thread, oldest first. */
  listPendingInbound(supportItemId: number): Promise<Array<{ id: number; occurredAt: string }>>;
  markAnswered(messageIds: number[], answeredByMessageId: number): Promise<void>;
  markNoReplyRequired(messageId: number, staffId: number, reason: string): Promise<void>;
  /** Recount pending inbound into support_tickets.pending_inbound_count; returns it. */
  recountPending(supportItemId: number): Promise<number>;
  deliveryCounts(supportItemId: number): Promise<SupportDeliveryCounts>;

  // ── Task ──
  readTask(taskId: number): Promise<SupportTaskRow | null>;
  /** Null when an assignee is not staff of this org. */
  insertTask(args: SupportTaskInsert): Promise<SupportTaskRow | null>;
  /** Add owners (existing ones are kept); unknown staff ids are ignored. Returns the ids added. */
  addTaskOwners(taskId: number, staffIds: number[]): Promise<number[]>;
  /** Through `patchTaskDeskRowInTx`; writes the work_task.update Timeline row. Null when nothing changed. */
  patchTask(taskId: number, patch: SupportTaskPatch, actorStaffId: number | null): Promise<SupportTaskRow | null>;
  /** Through `logTaskFollowUpInTx`; null when the message was already logged. */
  logFollowUp(args: SupportFollowUpInsert): Promise<number | null>;

  // ── Links ──
  linkOrders(supportItemId: number, links: SupportOrderLinkInput[], staffId: number | null): Promise<void>;
  linkEntities(supportItemId: number, links: Array<{ entityType: SupportEntityLinkType; entityId: number }>, staffId: number | null): Promise<void>;
  /** Only photos of this org are kept; returns the kept ids. */
  linkPhotos(supportItemId: number, photoIds: number[]): Promise<number[]>;

  // ── Drafts ──
  staleDrafts(supportItemId: number, reason: string, kind?: SupportDraftKind): Promise<number>;
  enqueueDraft(supportItemId: number, kind: SupportDraftKind, sourceMessageId: number | null, requestedByStaffId: number | null): Promise<number | null>;
  markDraftUsed(draftId: number, messageId: number): Promise<void>;

  // ── Check-in projection ──
  refreshCheckIn(supportItemId: number, staffId: number | null, nowMs: number): Promise<void>;
  closeCheckIn(supportItemId: number, args: { staffId: number | null; disposition: 'resolved' | 'no_response_closed'; reason: string | null; nowMs: number }): Promise<void>;

  // ── Timeline ──
  recordEvent(event: SupportTimelineEventInsert): Promise<void>;
}

/** Run `fn` on ONE tenant transaction's store. */
export type SupportTransaction = <T>(orgId: OrgId, fn: (store: SupportStore) => Promise<T>) => Promise<T>;

/**
 * A refusal raised mid-transaction (a link to a record that is not this org's,
 * an unknown assignee): the transaction rolls back and the caller maps
 * `status` / `message` to its `{ ok: false }` result.
 */
export class SupportInputError extends Error {
  constructor(
    readonly status: 400 | 404 | 409 | 422,
    message: string,
  ) {
    super(message);
    this.name = 'SupportInputError';
  }
}
