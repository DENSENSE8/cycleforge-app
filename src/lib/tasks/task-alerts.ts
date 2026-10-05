/** "Alert <people> to follow up" on a task — the pure core; real bindings in `task-alerts-db.ts`. */

import type { InboxContact } from '@/lib/notifications/types';
import type { TaskEmailRef } from './task-email-refs-shared';
import type { TaskLink } from './task-links-shared';

export const TASK_ALERT_NOTE_MAX = 2000;
export const TASK_ALERT_RECIPIENTS_MAX = 25;
/** An alert names the chase, not the whole file: the first dozen contacts ride along. */
export const TASK_ALERT_CONTACTS_MAX = 12;

export type TaskAlertRefusal = 'task_not_found' | 'no_recipients' | 'cannot_alert_self' | 'invalid_staff' | 'invalid_due';

/**
 * The body `POST /api/tasks/[id]/alerts` takes; omitted `staffIds` means the
 * task's owners minus the sender (owner 2026-09-30: "I should not be able to
 * alert myself"). A named list that includes the sender is refused.
 */
export interface TaskAlertBody {
  staffIds?: number[];
  note?: string | null;
  dueAt?: string | null;
  /** One id per Alert press; a retried request with the same id is a no-op. */
  clientEventId?: string;
}

export interface TaskAlertTask {
  id: number;
  /** `taskDeskTitle` — the face the recipient reads. */
  title: string;
  /** Primary assignee first, then the other members. */
  ownerIds: number[];
  /** The task's linked contacts at send time (`taskAlertContacts`), stamped on every recipient's row. */
  contacts: InboxContact[];
}

/** What a task links, as `taskAlertContacts` reads it — the server's rows and the composer's cache alike. */
export interface TaskAlertContactSources {
  /** The PROVIDER number of the ticket the task is about, when it is about one. */
  anchorTicketNumber: number | null;
  links: readonly Pick<TaskLink, 'kind' | 'entityId' | 'label' | 'order' | 'ticket' | 'repair'>[];
  emailRefs: readonly Pick<TaskEmailRef, 'customerEmail' | 'mailbox' | 'orderNumber' | 'referenceNumber'>[];
  /**
   * The local Support item the task is the primary task of (server only — the
   * composer's caches do not carry it): the requester's exact address on the
   * item's account, and the exact `orders.id` links (`ticket_links` ORDER rows).
   */
  supportItem?: {
    id: number;
    requesterEmail: string | null;
    /** The account / transport the customer wrote to (account label, else the channel label). */
    mailbox: string;
    orders: readonly { orderId: number; orderNumber: string }[];
  } | null;
}

const CONTACT_RANK: Readonly<Record<InboxContact['kind'], number>> = { email: 0, ticket: 1, order: 2, repair: 3, tracking: 4 };

/**
 * The contacts an alert carries (owner 2026-09-30: "alert them … with the
 * exact contacts linked"): the customer emails first (who to write back, on
 * which mailbox, about which order), then the ticket(s), orders, repairs and
 * tracking numbers — each once, in link order within its kind, capped at
 * {@link TASK_ALERT_CONTACTS_MAX}. The composer previews exactly this list.
 */
export function taskAlertContacts(src: TaskAlertContactSources): InboxContact[] {
  const out: InboxContact[] = [];
  const seen = new Set<string>();
  const push = (key: string, contact: InboxContact) => {
    if (seen.has(key)) return;
    seen.add(key);
    out.push(contact);
  };

  for (const ref of src.emailRefs) {
    push(`email:${ref.customerEmail.toLowerCase()}:${ref.mailbox.toLowerCase()}`, {
      kind: 'email',
      address: ref.customerEmail,
      mailbox: ref.mailbox,
      orderNumber: ref.orderNumber,
      referenceNumber: ref.referenceNumber,
    });
  }
  const support = src.supportItem;
  if (support?.requesterEmail) {
    push(`email:${support.requesterEmail.toLowerCase()}:${support.mailbox.toLowerCase()}`, {
      kind: 'email',
      address: support.requesterEmail,
      mailbox: support.mailbox,
      orderNumber: support.orders[0]?.orderNumber ?? null,
      referenceNumber: `Support #${support.id}`,
    });
  }
  if (src.anchorTicketNumber != null) push(`ticket:${src.anchorTicketNumber}`, { kind: 'ticket', number: src.anchorTicketNumber });
  for (const order of support?.orders ?? []) {
    push(`order:${order.orderNumber.toLowerCase()}`, { kind: 'order', orderNumber: order.orderNumber, orderId: order.orderId });
  }
  for (const link of src.links) {
    switch (link.kind) {
      case 'ticket': {
        const number = link.ticket?.providerTicketId ?? Number(link.label.replace(/\D/g, ''));
        if (Number.isInteger(number) && number > 0) push(`ticket:${number}`, { kind: 'ticket', number });
        break;
      }
      case 'order': {
        const orderNumber = link.order?.orderNumber ?? link.label;
        push(`order:${orderNumber.toLowerCase()}`, { kind: 'order', orderNumber, orderId: link.order?.id ?? link.entityId });
        break;
      }
      case 'repair':
        push(`repair:${link.label.toUpperCase()}`, { kind: 'repair', label: link.label, repairId: link.repair?.id ?? link.entityId });
        break;
      case 'tracking':
        push(`tracking:${link.label.toUpperCase()}`, { kind: 'tracking', trackingNumber: link.label });
        break;
    }
  }
  // Stable: within a kind, the order the task linked them.
  return out
    .map((contact, index) => ({ contact, index }))
    .sort((a, b) => CONTACT_RANK[a.contact.kind] - CONTACT_RANK[b.contact.kind] || a.index - b.index)
    .map(({ contact }) => contact)
    .slice(0, TASK_ALERT_CONTACTS_MAX);
}

export interface TaskAlertDelivery {
  staffId: number;
  /** `staff_inbox_items.id`. */
  itemId: number;
}

export interface TaskAlertDeps {
  readTask(taskId: number): Promise<TaskAlertTask | null>;
  /** The subset of `staffIds` that are staff of THIS org. */
  staffInOrg(staffIds: number[]): Promise<number[]>;
  /** One inbox row per recipient; a recipient already holding this alert key gets none. */
  insertInboxItems(args: {
    task: TaskAlertTask;
    staffIds: number[];
    alertKey: string;
    actorStaffId: number | null;
    note: string | null;
    dueAt: string | null;
  }): Promise<TaskAlertDelivery[]>;
}

export type SendTaskAlertResult =
  | {
      ok: true;
      task: TaskAlertTask;
      staffIds: number[];
      note: string | null;
      dueAt: string | null;
      /** Empty on a replay of the same alert key. */
      deliveries: TaskAlertDelivery[];
    }
  | { ok: false; reason: TaskAlertRefusal };

export async function sendTaskAlert(
  input: {
    taskId: number;
    actorStaffId: number | null;
    alertKey: string;
    body: TaskAlertBody;
  },
  deps: TaskAlertDeps,
): Promise<SendTaskAlertResult> {
  const note = input.body.note?.trim() || null;

  let dueAt: string | null = null;
  if (input.body.dueAt != null && input.body.dueAt.trim() !== '') {
    const ms = Date.parse(input.body.dueAt);
    if (!Number.isFinite(ms)) return { ok: false, reason: 'invalid_due' };
    dueAt = new Date(ms).toISOString();
  }

  const task = await deps.readTask(input.taskId);
  if (!task) return { ok: false, reason: 'task_not_found' };

  const named = input.body.staffIds;
  if (named && input.actorStaffId != null && named.includes(input.actorStaffId)) {
    return { ok: false, reason: 'cannot_alert_self' };
  }
  const staffIds = [...new Set(named ?? task.ownerIds.filter((id) => id !== input.actorStaffId))];
  if (staffIds.length === 0) return { ok: false, reason: 'no_recipients' };

  const known = new Set(await deps.staffInOrg(staffIds));
  if (staffIds.some((id) => !known.has(id))) return { ok: false, reason: 'invalid_staff' };

  const deliveries = await deps.insertInboxItems({
    task,
    staffIds,
    alertKey: input.alertKey,
    actorStaffId: input.actorStaffId,
    note,
    dueAt,
  });
  return { ok: true, task, staffIds, note, dueAt, deliveries };
}
