/**
 * Read a mirrored helpdesk thread the way the reply drafter needs it: is this a
 * CUSTOMER conversation, what did the customer last say, and what was said
 * before. Pure — no DB, no network — so the gate unit-tests on plain objects.
 *
 * Two shapes of customer ticket exist in the tree (read from the mirror
 * 2026-10-03): the customer wrote in (an end-user public comment), or staff
 * opened the case on the customer's behalf after a call / walk-in / marketplace
 * message and logged it as public comments under a support tag. Receiving
 * claims, vendor defects and trade-ins are operations tickets, never drafted.
 */

/** Who spoke, from the customer's side of the counter. Internal notes never appear. */
export type SupportThreadRole = 'customer' | 'agent';

export interface SupportThreadMessage {
  role: SupportThreadRole;
  text: string;
  /** `YYYY-MM-DD` the turn was posted, when known — a log line's date is often the whole fact. */
  on?: string;
}

/** The subset of a mirrored comment this reader trusts. */
export interface SupportThreadComment {
  author_id: number;
  body: string;
  plain_body?: string | null;
  public: boolean;
  created_at?: string;
  /** Read-time enrichment: the helpdesk user is an agent/admin. */
  author_is_agent?: boolean;
  /** Read-time enrichment: a CycleForge staffer posted this. */
  author_staff_id?: number | null;
}

export type SupportThreadRead =
  | {
      supportOriented: true;
      /**
       * `customer` — the customer wrote in; `customerMessage` is their latest.
       * `staff_log` — staff logged the case for the customer; there is no
       * customer text, and the thread IS the case log.
       */
      source: 'customer' | 'staff_log';
      /** The latest thing the customer said; empty for a staff-logged case. */
      customerMessage: string;
      /** Recent PUBLIC conversation, oldest first. */
      thread: SupportThreadMessage[];
    }
  | {
      supportOriented: false;
      reason: 'automated_sender' | 'operations_ticket' | 'no_customer_message';
      /** Operator-facing sentence: why there is nothing to draft. */
      message: string;
    };

/** Recent turns the model sees; older context costs tokens and drifts the reply. */
const THREAD_TURNS = 10;
/** One pasted email chain must not crowd out the rest of the conversation. */
const MESSAGE_CHARS = 1500;

/** A mailbox no human reads — drafting a reply to it answers nobody. */
const AUTOMATED_SENDER =
  /^(?:no-?reply|do-?not-?reply|mailer-daemon|postmaster|notifications?|alerts?|bounces?)(?:[@+._-]|$)/i;

/** Tags that mark a ticket as customer-facing work, whoever typed its comments. */
const SUPPORT_TAGS: Record<string, true> = {
  customer_support: true,
  support: true,
  technical_support: true,
  shipping_issue: true,
  shipping_delay: true,
  refund_request: true,
  refund_followup: true,
  return: true,
  walk_in: true,
  walkin: true,
  repair_service: true,
  wholesale_inquiry: true,
};

/** Tags that mark seller/vendor/warehouse work — a draft "to the customer" would go to nobody. */
const OPERATIONS_TAGS: Record<string, true> = {
  receiving_claim: true,
  trade_in: true,
  api_test: true,
};

function messageText(c: SupportThreadComment): string {
  const text = (c.plain_body ?? '').trim() || (c.body ?? '').trim();
  return text.length > MESSAGE_CHARS ? `${text.slice(0, MESSAGE_CHARS)}…` : text;
}

export function readSupportThread(input: {
  /** The whole mirrored thread, oldest first. */
  comments: ReadonlyArray<SupportThreadComment>;
  /** Helpdesk users who answer tickets (the mirror's agent roster). */
  agentIds: Iterable<number>;
  requesterEmail: string | null | undefined;
  tags: ReadonlyArray<string> | null | undefined;
}): SupportThreadRead {
  const email = (input.requesterEmail ?? '').trim();
  if (email && AUTOMATED_SENDER.test(email)) {
    return {
      supportOriented: false,
      reason: 'automated_sender',
      message: `This ticket came from an automated sender (${email}) — there is no customer to reply to.`,
    };
  }

  const tags = (input.tags ?? []).map((t) => t.trim().toLowerCase());
  if (tags.some((t) => OPERATIONS_TAGS[t] === true || t.startsWith('claim_'))) {
    return {
      supportOriented: false,
      reason: 'operations_ticket',
      message: 'This is an operations ticket (receiving claim, vendor or trade-in) — not a customer conversation.',
    };
  }

  const agentIds = new Set(Array.from(input.agentIds, Number));
  const turns: SupportThreadMessage[] = [];
  let customerMessage = '';
  for (const c of input.comments) {
    if (!c.public) continue;
    const text = messageText(c);
    if (!text) continue;
    // The CUSTOMER's when nobody on our side wrote it: not a helpdesk agent
    // (role or roster) and not a CycleForge staffer.
    const fromCustomer =
      c.author_is_agent !== true && c.author_staff_id == null && !agentIds.has(Number(c.author_id));
    const role: SupportThreadRole = fromCustomer ? 'customer' : 'agent';
    const on = typeof c.created_at === 'string' ? c.created_at.slice(0, 10) : '';
    turns.push(on ? { role, text, on } : { role, text });
    if (role === 'customer') customerMessage = text;
  }
  const thread = turns.slice(-THREAD_TURNS);

  if (customerMessage) return { supportOriented: true, source: 'customer', customerMessage, thread };
  if (thread.length && tags.some((t) => SUPPORT_TAGS[t] === true)) {
    return { supportOriented: true, source: 'staff_log', customerMessage: '', thread };
  }
  return {
    supportOriented: false,
    reason: 'no_customer_message',
    message: 'No customer message on this ticket and it is not tagged as customer support — there is nothing to answer.',
  };
}
