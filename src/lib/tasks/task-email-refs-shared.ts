/** Task **email references** — which customer email, on which inbound mailbox, a task came from (`work_assignment_email_refs`). Client-safe. */

/**
 * The inbound mailboxes every org starts with (owner 2026-09-29: "was it
 * sales, was it technical, was it info, was it hi@"). The route completes
 * them with the org's letterhead domain and appends any other mailbox the
 * org has already recorded — the org-scoped vocabulary.
 */
export const TASK_EMAIL_DEFAULT_MAILBOXES = ['sales', 'technical', 'info', 'hi'] as const;

/** Field caps — the route's Zod schema, the SQL CHECKs and the normaliser share them. */
export const TASK_EMAIL_ADDRESS_MAX = 320;
export const TASK_EMAIL_NUMBER_MAX = 100;
export const TASK_EMAIL_SUBJECT_MAX = 300;

/** One email reference on a task, oldest first on the wire. */
export interface TaskEmailRef {
  id: number;
  taskId: number;
  /** The customer's address, lower-cased. */
  customerEmail: string;
  /** Full inbound address (`sales@usavsolutions.com`) or a bare local part (`sales`). */
  mailbox: string;
  /** The order it is about, when the customer has ordered… */
  orderNumber: string | null;
  /** …or a reference number when there is no order yet. Never both. */
  referenceNumber: string | null;
  subject: string | null;
  createdByStaffId: number | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `POST /api/tasks/[id]/email-refs` body. */
export interface TaskEmailRefCreateBody {
  customerEmail: string;
  mailbox: string;
  orderNumber?: string | null;
  referenceNumber?: string | null;
  subject?: string | null;
}

/** `PATCH /api/tasks/[id]/email-refs?refId=` body — any subset; `null` clears an optional fact. */
export type TaskEmailRefPatchBody = Partial<TaskEmailRefCreateBody>;

/** `GET /api/tasks/[id]/email-refs`. `ready: false` = the table is not migrated yet. */
export interface TaskEmailRefsPayload {
  ok: true;
  ready: boolean;
  refs: TaskEmailRef[];
  /** The org's inbound-mailbox vocabulary, most expected first. */
  mailboxes: string[];
}

export type TaskEmailRefRefusal =
  | 'task_not_found'
  | 'ref_not_found'
  | 'invalid_customer_email'
  | 'invalid_mailbox'
  | 'both_numbers'
  | 'not_set_up';

export const TASK_EMAIL_REF_REFUSAL_COPY: Readonly<Record<TaskEmailRefRefusal, string>> = {
  task_not_found: 'That task no longer exists.',
  ref_not_found: 'That email reference was already removed.',
  invalid_customer_email: 'The customer email is not a valid address.',
  invalid_mailbox: 'Pick the mailbox the email came in on (sales@, info@ …).',
  both_numbers: 'Record an order number or a reference number, not both.',
  not_set_up: 'Email references are not set up yet.',
};

/** `sales@usavsolutions.com` / `sales` → `sales` — the mailbox's channel name. */
export function mailboxLocalPart(mailbox: string): string {
  const at = mailbox.indexOf('@');
  return at >= 0 ? mailbox.slice(0, at) : mailbox;
}

/** The chip a mailbox wears: `sales@`. */
export function mailboxFace(mailbox: string): string {
  return `${mailboxLocalPart(mailbox)}@`;
}
