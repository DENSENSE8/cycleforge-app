/**
 * The Support record's decisions, pure — what the composer may do for this
 * item, what each message's chip says, which next step and resolve requests
 * are valid, and the check-in facts. The components only paint these answers;
 * the tests pin them (support-record-model.test.ts).
 */

import { stationComposerTicketCommitLabel } from '@/lib/composer/station-composer-mode';
import {
  ANSWERING_DELIVERY_STATES,
  supportCustomerActionsAllowed,
  type DeliveryState,
  type OrderCheckInState,
  type SupportItemView,
  type SupportMessageView,
  type SupportPurpose,
  type SupportResolveBlocker,
  type SupportTransportView,
  type SupportWorkFlag,
  type SupportWorkFlags,
} from '@/lib/support/conversation/model';

// ── Composer ────────────────────────────────────────────────────────────────

/**
 * Who the composer is talking to. Only an acknowledged customer conversation
 * can reach the customer; an internal record and an unclassified item take
 * internal notes only (the purpose question sits above the thread).
 */
export type SupportComposerMode = 'customer' | 'internal_record' | 'unclassified';

export function supportComposerMode(purpose: SupportPurpose): SupportComposerMode {
  if (supportCustomerActionsAllowed(purpose)) return 'customer';
  return purpose === 'internal_record' ? 'internal_record' : 'unclassified';
}

/** What the composer's labelled commit does. */
export type SupportCommitKind = 'send' | 'copy_open' | 'internal';

export interface SupportComposerCommit {
  kind: SupportCommitKind;
  label: string;
  testId: string;
}

/**
 * The commit for the current channel. Public on a connected transport sends
 * from here; public on any other transport copies the reply and opens the
 * place it must be pasted (Copy & open). Internal is a staff-only note — an
 * "update" on an internal record. Never "Update ticket".
 */
export function supportComposerCommit(args: {
  mode: SupportComposerMode;
  isPublic: boolean;
  transport: Pick<SupportTransportView, 'connected' | 'label'>;
}): SupportComposerCommit {
  if (args.mode === 'internal_record') {
    return { kind: 'internal', label: 'Add internal update', testId: 'support-add-internal' };
  }
  if (args.mode === 'unclassified' || !args.isPublic) {
    return { kind: 'internal', label: stationComposerTicketCommitLabel(true, false), testId: 'support-add-internal' };
  }
  if (args.transport.connected) {
    return { kind: 'send', label: stationComposerTicketCommitLabel(true, true), testId: 'support-send-public' };
  }
  return { kind: 'copy_open', label: `Copy & open ${args.transport.label}`, testId: 'support-copy-open' };
}

// ── Messages ────────────────────────────────────────────────────────────────

export type SupportChipTone = 'default' | 'secondary' | 'success' | 'warning' | 'destructive';

export interface SupportMessageChip {
  tone: SupportChipTone;
  label: string;
}

/**
 * The state chip under a message: an inbound customer message is pending,
 * answered by a named reply, or closed as needing none (by whom); an outbound
 * reply shows its delivery. Internal notes carry no chip (the lock says it).
 */
export function supportMessageChip(m: Pick<SupportMessageView, 'direction' | 'replyDisposition' | 'answeredByMessageId' | 'disposition' | 'deliveryState'>): SupportMessageChip | null {
  if (m.direction === 'inbound') {
    switch (m.replyDisposition) {
      case 'answered':
        return {
          tone: 'success',
          label: m.answeredByMessageId != null ? `Answered by #${m.answeredByMessageId}` : 'Answered',
        };
      case 'no_reply_required': {
        const by = m.disposition?.by?.name;
        return { tone: 'secondary', label: by ? `No reply required · ${by}` : 'No reply required' };
      }
      case 'pending':
        return { tone: 'warning', label: 'Waiting for our reply' };
      default:
        return null;
    }
  }
  if (m.direction === 'outbound') {
    switch (m.deliveryState) {
      case 'sent':
        return { tone: 'success', label: 'Sent' };
      case 'logged':
        return { tone: 'success', label: 'Logged as sent' };
      case 'copied':
        return { tone: 'warning', label: 'Copied — not confirmed sent' };
      case 'pending':
        return { tone: 'warning', label: 'Sending' };
      case 'failed':
        return { tone: 'destructive', label: 'Failed to send' };
      default:
        return null;
    }
  }
  return null;
}

/** A copied reply waits for the staffer to confirm it went out. */
export function supportMessageCanMarkSent(m: Pick<SupportMessageView, 'direction' | 'deliveryState'>): boolean {
  return m.direction === 'outbound' && m.deliveryState === 'copied';
}

/**
 * A reply that reached (or was confirmed to have reached) the customer — `sent` or `logged`, never
 * `copied` / `pending` / `failed`. Exactly these outcomes answer the waiting messages and open the
 * next-step choice (Waiting for customer · Follow up later · Resolve).
 */
export function supportReplyAnswers(deliveryState: DeliveryState | null): boolean {
  return deliveryState != null && ANSWERING_DELIVERY_STATES.includes(deliveryState);
}

/** Only a still-pending inbound message can be closed as needing no reply. */
export function supportMessageCanDismiss(m: Pick<SupportMessageView, 'direction' | 'replyDisposition'>): boolean {
  return m.direction === 'inbound' && m.replyDisposition === 'pending';
}

/** `PATCH …/messages/[id]` body for "No reply required" — the reason is required. */
export function supportDismissBody(reason: string): { ok: true; body: { disposition: 'no_reply_required'; reason: string } } | { ok: false; error: string } {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: 'Say why no reply is needed.' };
  return { ok: true, body: { disposition: 'no_reply_required', reason: trimmed } };
}

// ── After a reply: the next step ────────────────────────────────────────────

export type SupportNextStepChoice = 'waiting_customer' | 'follow_up_later' | 'resolve';

export type SupportNextStepPatch = { nextStep: 'waiting_customer' | 'follow_up_later'; nextFollowUpAt: string | null };

/**
 * `PATCH /api/support/items/[id]` for Waiting for customer / Follow up later.
 * Follow up later needs its date; Resolve is not a PATCH (it goes through the
 * guarded resolve flow).
 */
export function supportNextStepPatch(
  choice: Exclude<SupportNextStepChoice, 'resolve'>,
  followUpAtIso: string | null,
): { ok: true; body: SupportNextStepPatch } | { ok: false; error: string } {
  if (choice === 'waiting_customer') return { ok: true, body: { nextStep: 'waiting_customer', nextFollowUpAt: followUpAtIso } };
  if (!followUpAtIso) return { ok: false, error: 'Pick the day to follow up.' };
  return { ok: true, body: { nextStep: 'follow_up_later', nextFollowUpAt: followUpAtIso } };
}

// ── Resolve ─────────────────────────────────────────────────────────────────

export type SupportResolveBody = {
  reason?: string;
  override?: boolean;
  checkInDisposition?: 'resolved' | 'no_response_closed';
};

/**
 * The resolve request, or why it may not be sent. With blockers the staffer
 * must choose override AND type a reason; "Close — no response" always needs
 * its reason. The server re-checks every rule (409 `{ blockers }`).
 */
export function supportResolveRequest(args: {
  blockers: readonly SupportResolveBlocker[];
  override: boolean;
  reason: string;
  disposition?: 'resolved' | 'no_response_closed';
}): { ok: true; body: SupportResolveBody } | { ok: false; error: string } {
  const reason = args.reason.trim();
  const blocked = args.blockers.length > 0;
  if (blocked && !args.override) return { ok: false, error: 'Clear the blockers first, or override with a reason.' };
  if (blocked && !reason) return { ok: false, error: 'Type the reason for the override.' };
  if (args.disposition === 'no_response_closed' && !reason) return { ok: false, error: 'Say why it closes without a response.' };
  const body: SupportResolveBody = {};
  if (reason) body.reason = reason;
  if (blocked) body.override = true;
  if (args.disposition) body.checkInDisposition = args.disposition;
  return { ok: true, body };
}

const CLOSED_CHECK_IN_STATES: Readonly<Partial<Record<OrderCheckInState, true>>> = {
  resolved: true,
  no_response_closed: true,
  not_applicable: true,
};

/**
 * "Close — no response" exists on a live check-in once its chase happened (owner 2026-10-04: contact, one
 * chase 3 days later, then staff may close it with a reason).
 */
export function supportCanCloseNoResponse(checkIn: SupportItemView['checkIn']): boolean {
  if (!checkIn || CLOSED_CHECK_IN_STATES[checkIn.state]) return false;
  return checkIn.chaseCount > 0;
}

/** The resolve verb names what is being closed. */
export function supportResolveLabel(item: Pick<SupportItemView, 'purpose'>): string {
  return item.purpose === 'internal_record' ? 'Resolve internal record' : 'Resolve';
}

// ── Header + facts ──────────────────────────────────────────────────────────

export const SUPPORT_PURPOSE_LABEL: Readonly<Record<SupportPurpose, string>> = {
  customer_conversation: 'Customer',
  internal_record: 'Internal',
  unclassified: 'Unclassified',
};

/** The flags the header paints, in reading order, with their words and tone. */
export const SUPPORT_HEADER_FLAGS: ReadonlyArray<{ flag: SupportWorkFlag; label: string; tone: SupportChipTone }> = [
  { flag: 'customer_followed_up', label: 'Customer followed up', tone: 'warning' },
  { flag: 'needs_reply', label: 'Needs reply', tone: 'warning' },
  { flag: 'follow_up_due', label: 'Follow-up due', tone: 'destructive' },
  { flag: 'draft_ready', label: 'Draft ready', tone: 'success' },
  { flag: 'sync_failed', label: 'Sync failed', tone: 'destructive' },
];

/** Header chips: "Customer followed up" already says it needs a reply, so it replaces Needs reply. */
export function supportHeaderFlags(flags: SupportWorkFlags): Array<{ flag: SupportWorkFlag; label: string; tone: SupportChipTone }> {
  return SUPPORT_HEADER_FLAGS.filter(({ flag }) => flags[flag] && !(flag === 'needs_reply' && flags.customer_followed_up));
}

export const ORDER_CHECK_IN_STATE_LABEL: Readonly<Record<OrderCheckInState, string>> = {
  not_due: 'Not due yet',
  due: 'Check-in due',
  contacted: 'Contacted',
  customer_replied: 'Customer replied',
  staff_reply_due: 'Our reply due',
  waiting_customer: 'Waiting for customer',
  follow_up_due: 'Follow-up due',
  resolved: 'Resolved',
  no_response_closed: 'Closed — no response',
  not_applicable: 'Not applicable',
};

const TRIGGER_LABEL: Readonly<Record<string, string>> = {
  delivered: 'Delivered',
  picked_up: 'Picked up',
  shipped_fallback: 'Shipped',
  shipped: 'Shipped',
  pending: 'Not shipped yet',
};

export interface SupportFact {
  id: string;
  label: string;
  value: string;
}

/**
 * A check-in's own facts, one line each — the ones nothing else on the record
 * says: products, delivery/pickup date, check-in due, state. (Order, platform,
 * customer and owners are the table's and header's; contact and replies are
 * the thread.) `formatAt` is injected so the model stays free of time-zone
 * formatting.
 */
export function supportCheckInFacts(
  item: Pick<SupportItemView, 'checkIn' | 'primaryOrder'>,
  formatAt: (iso: string) => string,
): SupportFact[] {
  const checkIn = item.checkIn;
  if (!checkIn) return [];
  const order = item.primaryOrder;
  const facts: SupportFact[] = [];
  if (order && order.products.length > 0) {
    facts.push({
      id: 'products',
      label: 'Products',
      value: order.products.map((p) => (p.quantity > 1 ? `${p.quantity} × ${p.title}` : p.title)).join(', '),
    });
  }
  if (checkIn.triggerAt) {
    const kind = checkIn.triggerKind ?? order?.fulfillment?.kind ?? null;
    facts.push({ id: 'trigger', label: kind ? (TRIGGER_LABEL[kind] ?? 'Fulfilled') : 'Fulfilled', value: formatAt(checkIn.triggerAt) });
  }
  if (checkIn.dueAt) facts.push({ id: 'due', label: 'Check-in due', value: formatAt(checkIn.dueAt) });
  facts.push({ id: 'state', label: 'State', value: ORDER_CHECK_IN_STATE_LABEL[checkIn.state] });
  return facts;
}
