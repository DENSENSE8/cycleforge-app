/**
 * The post-purchase check-in state of an opened order, derived from the
 * Support item's local truth — pure, so the table of states is pinned by
 * tests rather than by whichever writer ran last.
 *
 * Contact proof: an order counts as contacted ONLY from a real outbound
 * message (delivery `sent` or `logged`) or a logged contact follow-up on the
 * primary task (call / email / message / ticket — not a private note).
 * Time passing never contacts anyone; a copied-but-unconfirmed or failed
 * reply is not contact.
 *
 * Precedence (first match wins):
 *   resolved / no_response_closed  the item is resolved (disposition + outcome kept, default `resolved`, no outcome)
 *   staff_reply_due                a customer message is still pending a reply
 *   customer_replied               the customer had the last word and nothing is owed
 *   follow_up_due                  contacted, silent customer, chase instant passed
 *   waiting_customer               contacted and the item waits on the customer
 *   contacted                      contacted, chase not yet due
 *   due                            not contacted, due instant passed
 *   not_due                        not contacted, not yet due
 */
import { CHECK_IN_OUTCOMES, type CheckInOutcome, type DeliveryState, type OrderCheckInState, type SupportLifecycle } from '@/lib/support/conversation/model';
import { SUPPORT_CHECK_IN_DELAYS_MS } from './config';

/** Follow-up channels that reach the customer (a `note` is staff-only). */
const CONTACT_FOLLOW_UP_CHANNELS: Readonly<Record<string, true>> = {
  call: true,
  email: true,
  message: true,
  ticket: true,
};

const CONTACT_DELIVERY_STATES: Readonly<Partial<Record<DeliveryState, true>>> = { sent: true, logged: true };

export interface CheckInMessageFact {
  id: number;
  direction: 'inbound' | 'outbound' | 'internal';
  deliveryState: DeliveryState | null;
  replyDisposition: 'pending' | 'answered' | 'no_reply_required' | null;
  atMs: number;
}

export interface CheckInFollowUpFact {
  id: number;
  direction: 'outbound' | 'inbound';
  channel: string;
  /** The message this follow-up row records (a reply logs itself once). */
  threadMessageId: number | null;
  atMs: number;
}

/** One proven contact with the customer. */
export interface CheckInContact {
  atMs: number;
  messageId: number | null;
  followUpId: number | null;
}

/** Proven contacts, oldest first; a follow-up row that records a message merges into it. */
export function collectCheckInContacts(
  messages: readonly CheckInMessageFact[],
  followUps: readonly CheckInFollowUpFact[],
): CheckInContact[] {
  const byMessage = new Map<number, CheckInContact>();
  for (const m of messages) {
    if (m.direction !== 'outbound' || !m.deliveryState || !CONTACT_DELIVERY_STATES[m.deliveryState]) continue;
    byMessage.set(m.id, { atMs: m.atMs, messageId: m.id, followUpId: null });
  }
  const loose: CheckInContact[] = [];
  for (const f of followUps) {
    if (f.direction !== 'outbound' || CONTACT_FOLLOW_UP_CHANNELS[f.channel] !== true) continue;
    const recorded = f.threadMessageId != null ? byMessage.get(f.threadMessageId) : undefined;
    if (recorded) {
      recorded.followUpId ??= f.id;
      continue;
    }
    // A follow-up for a message that is not proof (copied / failed) proves nothing either.
    if (f.threadMessageId != null) continue;
    loose.push({ atMs: f.atMs, messageId: null, followUpId: f.id });
  }
  return [...byMessage.values(), ...loose].sort((a, b) => a.atMs - b.atMs);
}

export interface CheckInClosure {
  disposition: 'resolved' | 'no_response_closed';
  /** How a `resolved` close ended (staff choose it); always null for `no_response_closed` and the default closure. */
  outcome: CheckInOutcome | null;
  reason: string | null;
  closedAtMs: number;
  closedByStaffId: number | null;
}

/**
 * The closure a projection row stores: null unless a disposition AND its close
 * instant stand (a reopen cleared both); the outcome rides only on `resolved`.
 */
export function storedCheckInClosure(row: {
  disposition: string | null;
  outcome: string | null;
  reason: string | null;
  closedAtMs: number | null;
  closedByStaffId: number | null;
}): CheckInClosure | null {
  if ((row.disposition !== 'resolved' && row.disposition !== 'no_response_closed') || row.closedAtMs == null) return null;
  const known = (CHECK_IN_OUTCOMES as readonly string[]).includes(row.outcome ?? '');
  return {
    disposition: row.disposition,
    outcome: row.disposition === 'resolved' && known ? (row.outcome as CheckInOutcome) : null,
    reason: row.reason,
    closedAtMs: row.closedAtMs,
    closedByStaffId: row.closedByStaffId,
  };
}

export interface CheckInDerivationInput {
  nowMs: number;
  /** The projection's due instant (null for a row with no milestone, e.g. staff-made). */
  dueAtMs: number | null;
  item: {
    lifecycle: SupportLifecycle;
    resolvedAtMs: number | null;
    resolvedByStaffId: number | null;
  };
  messages: readonly CheckInMessageFact[];
  followUps: readonly CheckInFollowUpFact[];
  /** The primary task's next_follow_up_at — a staff/loop-set date wins over the default chase. */
  taskNextFollowUpAtMs: number | null;
  /** The disposition stored when the item was resolved through the check-in close. */
  storedClosure: CheckInClosure | null;
}

export interface DerivedCheckIn {
  state: OrderCheckInState;
  contactedAtMs: number | null;
  contactMessageId: number | null;
  contactFollowUpId: number | null;
  latestInboundMessageId: number | null;
  nextFollowUpAtMs: number | null;
  /** The chase instant came from the default cadence (not a task date) — the task may be stamped with it. */
  nextFollowUpFromChase: boolean;
  chaseCount: number;
  closure: CheckInClosure | null;
}

export function deriveOrderCheckInState(input: CheckInDerivationInput): DerivedCheckIn {
  const contacts = collectCheckInContacts(input.messages, input.followUps);
  const inbound = input.messages
    .filter((m) => m.direction === 'inbound')
    .sort((a, b) => a.atMs - b.atMs || a.id - b.id);
  const latestInbound = inbound[inbound.length - 1] ?? null;
  const first = contacts[0] ?? null;
  const last = contacts[contacts.length - 1] ?? null;

  // A chase = a contact made while the customer stayed silent since the previous one.
  let chaseCount = 0;
  for (let i = 1; i < contacts.length; i++) {
    const prev = contacts[i - 1].atMs;
    const at = contacts[i].atMs;
    if (!inbound.some((m) => m.atMs > prev && m.atMs <= at)) chaseCount++;
  }

  const pending = inbound.some((m) => m.replyDisposition === 'pending');
  const customerHadLastWord = latestInbound != null && (last == null || latestInbound.atMs > last.atMs);
  const waitingOnCustomer = last != null && !customerHadLastWord && !pending;
  const nextFollowUpFromChase = waitingOnCustomer && input.taskNextFollowUpAtMs == null;
  const nextFollowUpAtMs = waitingOnCustomer
    ? (input.taskNextFollowUpAtMs ?? last.atMs + SUPPORT_CHECK_IN_DELAYS_MS.chase)
    : null;

  const base = {
    contactedAtMs: first?.atMs ?? null,
    contactMessageId: first?.messageId ?? null,
    contactFollowUpId: first?.followUpId ?? null,
    latestInboundMessageId: latestInbound?.id ?? null,
    chaseCount,
  };

  if (input.item.lifecycle === 'resolved') {
    const closure: CheckInClosure = input.storedClosure ?? {
      disposition: 'resolved',
      outcome: null,
      reason: null,
      closedAtMs: input.item.resolvedAtMs ?? input.nowMs,
      closedByStaffId: input.item.resolvedByStaffId,
    };
    return { ...base, state: closure.disposition, nextFollowUpAtMs: null, nextFollowUpFromChase: false, closure };
  }

  const open = { ...base, nextFollowUpAtMs, nextFollowUpFromChase, closure: null };
  if (pending) return { ...open, state: 'staff_reply_due' };
  if (customerHadLastWord && last != null) return { ...open, state: 'customer_replied' };
  if (last != null) {
    if (nextFollowUpAtMs != null && nextFollowUpAtMs <= input.nowMs) return { ...open, state: 'follow_up_due' };
    if (input.item.lifecycle === 'waiting_customer') return { ...open, state: 'waiting_customer' };
    return { ...open, state: 'contacted' };
  }
  // Never contacted: a customer who wrote in unprompted and was dispositioned
  // (no_reply_required) still leaves the check-in itself owed. A row with no
  // milestone (opened by hand) is owed now.
  const owed = input.dueAtMs == null || input.dueAtMs <= input.nowMs;
  return { ...open, state: owed ? 'due' : 'not_due' };
}
