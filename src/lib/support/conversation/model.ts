/**
 * The local Support model — pure and client-safe. The vocabulary, the work
 * flags and the resolve guard every reader and writer of the closed loop
 * shares (server waist `ingestSupportMessage`, the Tasks → Support list, the
 * task record's Conversation tab, the crons).
 *
 * Storage (2026-10-04d_support_closed_loop.sql):
 *   support_tickets            the Support item (UI: "Support item" / "Conversation")
 *   entity_threads             (SUPPORT_TICKET, support_tickets.id) — the canonical chat
 *   thread_messages            every message, with direction / disposition / delivery
 *   support_drafts             stored AI drafts (never sent automatically)
 *   work_assignments (+ assignees, follow_ups)  the primary task, its owners, its chase log
 *   order_support_follow_ups   the per-order post-purchase check-in projection
 *
 * A provider ("Zendesk ticket #9942", an eBay conversation id) is optional
 * metadata on the item. CycleForge's own rows are the truth.
 */

/** Who the Support item is for. Staff own it; a suggestion never decides it. */
export const SUPPORT_PURPOSES = ['unclassified', 'customer_conversation', 'internal_record'] as const;
export type SupportPurpose = (typeof SUPPORT_PURPOSES)[number];

/** How the purpose was set: the column default, a staff acknowledgement, or a deterministic program (post-purchase check-in). */
export const SUPPORT_PURPOSE_SOURCES = ['default', 'staff', 'program'] as const;
export type SupportPurposeSource = (typeof SUPPORT_PURPOSE_SOURCES)[number];

export const SUPPORT_LIFECYCLES = ['open', 'waiting_customer', 'snoozed', 'resolved'] as const;
export type SupportLifecycle = (typeof SUPPORT_LIFECYCLES)[number];

export const SUPPORT_ITEM_KINDS = ['conversation', 'post_purchase_check_in'] as const;
export type SupportItemKind = (typeof SUPPORT_ITEM_KINDS)[number];

/**
 * The transport a Support item (and each message) came from or goes out on —
 * stored as `support_tickets.provider` / `thread_messages.provider`.
 * 'internal' = staff-only record; 'system' exists on messages only.
 */
export const SUPPORT_CHANNELS = [
  'zendesk',
  'internal',
  'ebay',
  'amazon',
  'ecwid',
  'email',
  'website',
  'phone',
  'walk_in',
  'manual',
] as const;
export type SupportChannel = (typeof SUPPORT_CHANNELS)[number];
export type SupportMessageProvider = SupportChannel | 'system';

export const SUPPORT_CHANNEL_LABEL: Readonly<Record<SupportChannel, string>> = {
  zendesk: 'Zendesk',
  internal: 'Internal',
  ebay: 'eBay',
  amazon: 'Amazon',
  ecwid: 'Ecwid',
  email: 'Email',
  website: 'Website',
  phone: 'Phone',
  walk_in: 'Walk-in',
  manual: 'Pasted',
};

export const SUPPORT_MESSAGE_DIRECTIONS = ['inbound', 'outbound', 'internal'] as const;
export type SupportMessageDirection = (typeof SUPPORT_MESSAGE_DIRECTIONS)[number];

/** Every inbound customer message ends in exactly one of these. */
export const REPLY_DISPOSITIONS = ['pending', 'answered', 'no_reply_required'] as const;
export type ReplyDisposition = (typeof REPLY_DISPOSITIONS)[number];

/**
 * Outbound delivery. `copied` = Copy & open was used and the staffer has not
 * yet confirmed it went out (Mark sent). `logged` = a reply sent elsewhere,
 * recorded here. Only `sent` and `logged` answer inbound messages.
 */
export const DELIVERY_STATES = ['pending', 'sent', 'failed', 'copied', 'logged'] as const;
export type DeliveryState = (typeof DELIVERY_STATES)[number];
export const ANSWERING_DELIVERY_STATES: readonly DeliveryState[] = ['sent', 'logged'];
export const OPEN_DELIVERY_STATES: readonly DeliveryState[] = ['pending', 'failed', 'copied'];

export const SUPPORT_DRAFT_KINDS = ['reply', 'check_in'] as const;
export type SupportDraftKind = (typeof SUPPORT_DRAFT_KINDS)[number];
export const SUPPORT_DRAFT_STATUSES = ['pending', 'ready', 'stale', 'used', 'discarded', 'failed'] as const;
export type SupportDraftStatus = (typeof SUPPORT_DRAFT_STATUSES)[number];
export type SupportDraftConfidence = 'high' | 'medium' | 'low';

/** What the staffer chooses after a customer reply goes out. */
export const SUPPORT_NEXT_STEPS = ['waiting_customer', 'follow_up_later', 'resolve'] as const;
export type SupportNextStep = (typeof SUPPORT_NEXT_STEPS)[number];

export const ORDER_CHECK_IN_STATES = [
  'not_due',
  'due',
  'contacted',
  'customer_replied',
  'staff_reply_due',
  'waiting_customer',
  'follow_up_due',
  'resolved',
  'no_response_closed',
  'not_applicable',
] as const;
export type OrderCheckInState = (typeof ORDER_CHECK_IN_STATES)[number];
export type OrderCheckInTrigger = 'delivered' | 'picked_up' | 'shipped_fallback';

// ── Work flags ─────────────────────────────────────────────────────────────

export const SUPPORT_WORK_FLAGS = [
  'unclassified',
  'needs_reply',
  'customer_followed_up',
  'draft_ready',
  'follow_up_due',
  'unassigned',
  'sync_failed',
] as const;
export type SupportWorkFlag = (typeof SUPPORT_WORK_FLAGS)[number];
export type SupportWorkFlags = Readonly<Record<SupportWorkFlag, boolean>>;

/** The stored facts the flags are computed from (list row and bundle both carry them). */
export interface SupportFlagFacts {
  purpose: SupportPurpose;
  lifecycle: SupportLifecycle;
  /** Inbound customer messages still `pending`. */
  pendingInboundCount: number;
  /** A `ready` draft exists for the newest inbound boundary. */
  draftReady: boolean;
  /** The primary task's next_follow_up_at (epoch ms), if any. */
  nextFollowUpAtMs: number | null;
  /** Owners on the primary task (assignee + shared members). */
  assigneeCount: number;
  syncState: 'ok' | 'failed' | null;
}

export function supportWorkFlags(f: SupportFlagFacts, nowMs: number): SupportWorkFlags {
  const live = f.lifecycle !== 'resolved';
  const customer = f.purpose !== 'internal_record';
  const needsReply = live && customer && f.pendingInboundCount > 0;
  return {
    unclassified: f.purpose === 'unclassified',
    needs_reply: needsReply,
    customer_followed_up: needsReply && f.pendingInboundCount > 1,
    draft_ready: live && f.purpose === 'customer_conversation' && f.draftReady,
    follow_up_due: live && f.nextFollowUpAtMs != null && f.nextFollowUpAtMs <= nowMs,
    unassigned: live && f.assigneeCount === 0,
    sync_failed: f.syncState === 'failed',
  };
}

// ── Local status (the /support status pills) ──────────────────────────────

/**
 * The six statuses every Support item wears on /support (owner 2026-10-04) —
 * LOCAL, computed from the item's own facts; Zendesk's status stays metadata.
 *   new      never answered: live, not an internal record, no outbound message
 *            ever went out (sent | logged stamps last_outbound_at)
 *   open     live work: the customer is owed a reply, or staff answered and
 *            the item stays open (internal records live here too)
 *   pending  waiting on the customer, nothing unanswered
 *   on_hold  snoozed / internal hold
 *   solved   resolved less than SUPPORT_CLOSED_AFTER_DAYS ago
 *   closed   resolved at least SUPPORT_CLOSED_AFTER_DAYS ago (auto-archived)
 */
export const SUPPORT_LOCAL_STATUSES = ['new', 'open', 'pending', 'on_hold', 'solved', 'closed'] as const;
export type SupportLocalStatus = (typeof SUPPORT_LOCAL_STATUSES)[number];

export const SUPPORT_LOCAL_STATUS_LABEL: Readonly<Record<SupportLocalStatus, string>> = {
  new: 'New',
  open: 'Open',
  pending: 'Pending',
  on_hold: 'On-hold',
  solved: 'Solved',
  closed: 'Closed',
};

/** A solved item closes (archives) this many days after it was resolved — Zendesk's default close automation. */
export const SUPPORT_CLOSED_AFTER_DAYS = 4;
const CLOSED_AFTER_MS = SUPPORT_CLOSED_AFTER_DAYS * 24 * 60 * 60 * 1000;

export interface SupportLocalStatusFacts {
  purpose: SupportPurpose;
  lifecycle: SupportLifecycle;
  pendingInboundCount: number;
  /** support_tickets.last_outbound_at — stamped only when an outbound message is `sent` or `logged`. */
  lastOutboundAt: string | null;
  /** support_tickets.resolved_at. */
  resolvedAt: string | null;
}

export function supportLocalStatus(f: SupportLocalStatusFacts, nowMs: number): SupportLocalStatus {
  if (f.lifecycle === 'resolved') {
    const resolvedMs = f.resolvedAt ? Date.parse(f.resolvedAt) : Number.NaN;
    return Number.isFinite(resolvedMs) && nowMs - resolvedMs >= CLOSED_AFTER_MS ? 'closed' : 'solved';
  }
  if (f.lifecycle === 'snoozed') return 'on_hold';
  if (f.lifecycle === 'waiting_customer' && f.pendingInboundCount === 0) return 'pending';
  if (f.purpose !== 'internal_record' && f.lastOutboundAt == null) return 'new';
  return 'open';
}

// ── Resolve guard ──────────────────────────────────────────────────────────

export const SUPPORT_RESOLVE_BLOCKERS = [
  'purpose_unacknowledged',
  'unanswered_inbound',
  'follow_up_overdue',
  'send_pending',
  'send_failed',
] as const;
export type SupportResolveBlocker = (typeof SUPPORT_RESOLVE_BLOCKERS)[number];

export const SUPPORT_RESOLVE_BLOCKER_LABEL: Readonly<Record<SupportResolveBlocker, string>> = {
  purpose_unacknowledged: 'Say whether this is for a customer first.',
  unanswered_inbound: 'A customer message is still unanswered.',
  follow_up_overdue: 'A follow-up is overdue.',
  send_pending: 'A reply is copied or sending but not confirmed sent.',
  send_failed: 'A reply failed to send.',
};

export interface SupportResolveFacts {
  purpose: SupportPurpose;
  purposeAcknowledgedAt: string | null;
  pendingInboundCount: number;
  nextFollowUpAtMs: number | null;
  /** Outbound messages in `pending` or `copied`. */
  openDeliveryCount: number;
  /** Outbound messages in `failed`. */
  failedDeliveryCount: number;
}

/** Empty = the item may resolve. Anything else needs an override with a reason. */
export function supportResolveBlockers(f: SupportResolveFacts, nowMs: number): SupportResolveBlocker[] {
  const out: SupportResolveBlocker[] = [];
  if (f.purpose === 'unclassified' || f.purposeAcknowledgedAt == null) out.push('purpose_unacknowledged');
  if (f.pendingInboundCount > 0) out.push('unanswered_inbound');
  if (f.nextFollowUpAtMs != null && f.nextFollowUpAtMs <= nowMs) out.push('follow_up_overdue');
  if (f.openDeliveryCount > 0) out.push('send_pending');
  if (f.failedDeliveryCount > 0) out.push('send_failed');
  return out;
}

/** Customer-send and customer-draft controls exist only on an acknowledged customer conversation. */
export function supportCustomerActionsAllowed(purpose: SupportPurpose): boolean {
  return purpose === 'customer_conversation';
}

// ── Wire shapes (GET /api/support/items/[id]) ──────────────────────────────

export interface SupportStaffRef {
  id: number;
  name: string;
}

export interface SupportOrderProduct {
  /** orders.id of the line. */
  orderLineId: number;
  sku: string | null;
  /** resolveSkuIdentityTitle — never a raw Zoho title. */
  title: string;
  quantity: number;
}

/** One exact local order a Support item points at. `orderId` is orders.id — the key; the rest is display/search. */
export interface SupportOrderRef {
  orderId: number;
  /** orders.order_id — the human-facing/marketplace order number. */
  orderNumber: string | null;
  /** orders.account_source. */
  platform: string | null;
  accountLabel: string | null;
  primary: boolean;
  /** The pasted text it was resolved from, kept as metadata. */
  externalReference: string | null;
  customerName: string | null;
  customerEmail: string | null;
  products: SupportOrderProduct[];
  fulfillment: { kind: OrderCheckInTrigger | 'shipped' | 'pending'; at: string | null; trackingNumber: string | null } | null;
}

export interface OrderCheckInView {
  orderId: number;
  orderNumber: string | null;
  state: OrderCheckInState;
  triggerKind: OrderCheckInTrigger | null;
  triggerAt: string | null;
  dueAt: string | null;
  supportItemId: number | null;
  taskId: number | null;
  contactedAt: string | null;
  contactMessageId: number | null;
  contactFollowUpId: number | null;
  latestInboundMessageId: number | null;
  nextFollowUpAt: string | null;
  chaseCount: number;
  disposition: string | null;
  dispositionReason: string | null;
  closedAt: string | null;
  closedBy: SupportStaffRef | null;
}

export interface SupportTransportView {
  /** A connected transport sends from CycleForge (Zendesk-bound item today). */
  connected: boolean;
  channel: SupportChannel;
  /** "Zendesk", "eBay", … — used in "Copy & open <label>". */
  label: string;
  /** Where Copy & open lands (marketplace message page, mailto:, order admin URL); null = copy only. */
  openUrl: string | null;
  /** Deterministic marketplace policy applies (eBay / Amazon). */
  marketplacePolicy: boolean;
  maxLength: number | null;
}

export interface SupportItemView {
  id: number;
  kind: SupportItemKind;
  channel: SupportChannel;
  /** Optional provider metadata (Zendesk ticket number, marketplace conversation id). */
  externalTicketId: string | null;
  subject: string | null;
  purpose: SupportPurpose;
  purposeSource: SupportPurposeSource;
  purposeSuggestion: Exclude<SupportPurpose, 'unclassified'> | null;
  purposeSuggestionReason: string | null;
  purposeAcknowledgedBy: SupportStaffRef | null;
  purposeAcknowledgedAt: string | null;
  lifecycle: SupportLifecycle;
  snoozedUntil: string | null;
  requester: { name: string | null; email: string | null; handle: string | null };
  accountLabel: string | null;
  platformAccountId: number | null;
  /** The org platform the item is about (`support_tickets.platform_id` → `platforms`); null when unset. */
  platform: { id: number; label: string } | null;
  primaryOrder: SupportOrderRef | null;
  orders: SupportOrderRef[];
  task: {
    id: number;
    status: string;
    taskState: string | null;
    assignees: SupportStaffRef[];
    nextFollowUpAt: string | null;
    lastFollowUpAt: string | null;
    deadlineAt: string | null;
  } | null;
  flags: SupportWorkFlags;
  pendingInboundCount: number;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  sync: { state: 'ok' | 'failed' | null; error: string | null; failedAt: string | null };
  transport: SupportTransportView;
  resolution: { resolvedAt: string; resolvedBy: SupportStaffRef | null; reason: string | null; override: boolean } | null;
  resolveBlockers: SupportResolveBlocker[];
  checkIn: OrderCheckInView | null;
  createdAt: string;
}

export interface SupportMessageView {
  id: number;
  direction: SupportMessageDirection;
  visibility: 'public' | 'internal';
  provider: SupportMessageProvider;
  body: string;
  /** Customer/provider time when known, else the local store time. */
  occurredAt: string;
  createdAt: string;
  author: { staff: SupportStaffRef | null; label: string | null };
  replyDisposition: ReplyDisposition | null;
  answeredByMessageId: number | null;
  disposition: { by: SupportStaffRef | null; at: string | null; reason: string | null } | null;
  deliveryState: DeliveryState | null;
  deliveryError: string | null;
  externalMessageId: string | null;
  photoIds: number[];
}

export interface SupportDraftCitation {
  type: 'thread' | 'order' | 'repair' | 'receiving' | 'serial' | 'sku' | 'manual' | 'rag' | 'past_reply' | 'photo';
  label: string;
  /** Local record reference, e.g. "orders:123", "thread_messages:456". */
  ref: string | null;
}

export interface SupportDraftView {
  id: number;
  kind: SupportDraftKind;
  status: SupportDraftStatus;
  body: string | null;
  confidence: SupportDraftConfidence | null;
  citations: SupportDraftCitation[];
  warnings: string[];
  missingFacts: string[];
  model: string | null;
  sourceMessageId: number | null;
  staleReason: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface SupportTimelineEvent {
  id: string;
  at: string;
  kind: string;
  label: string;
  actor: SupportStaffRef | null;
  messageId: number | null;
}

export interface SupportItemBundle {
  item: SupportItemView;
  messages: SupportMessageView[];
  /** The newest live (pending | ready) draft per kind, then recent stale/failed ones. */
  drafts: SupportDraftView[];
}

