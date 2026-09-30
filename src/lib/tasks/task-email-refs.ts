/**
 * Task email references — the pure half, client-safe:
 *
 *   normalizeTaskEmailRef    — body → the row the writer stores, or a refusal
 *   taskEmailMailboxes       — the org's inbound-mailbox vocabulary
 *   ingestEmailReference     — a pasted From/To header block (or a forwarded
 *                              email's headers) → customer address + mailbox
 *                              + subject + order number, never the body
 *   emailRefFromPaste        — what the Links input makes of a paste: a whole
 *                              reference, or null when it names no customer
 *   emailRefNumberPatch      — the row's inline `Order 123` / `Ref X` edit
 */

import {
  TASK_EMAIL_ADDRESS_MAX,
  TASK_EMAIL_DEFAULT_MAILBOXES,
  TASK_EMAIL_NUMBER_MAX,
  TASK_EMAIL_SUBJECT_MAX,
  mailboxLocalPart,
  type TaskEmailRef,
  type TaskEmailRefCreateBody,
  type TaskEmailRefRefusal,
} from './task-email-refs-shared';

const ADDRESS = /^[a-z0-9._%+'-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/;
const ADDRESS_IN_TEXT = /[a-z0-9._%+'-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
const LOCAL_PART = /^[a-z0-9._%+-]{1,64}$/;

export function isEmailAddress(value: string): boolean {
  return value.length <= TASK_EMAIL_ADDRESS_MAX && ADDRESS.test(value);
}

/** `<Sales@X.com>` / `sales@` / ` SALES ` → `sales@x.com` / `sales`; null when it is neither an address nor a local part. */
export function normalizeMailbox(raw: string): string | null {
  const value = raw.trim().toLowerCase().replace(/^<|>$/g, '').replace(/@$/, '');
  if (!value) return null;
  if (value.includes('@')) return isEmailAddress(value) ? value : null;
  return LOCAL_PART.test(value) ? value : null;
}

function optionalText(raw: string | null | undefined, max: number): string | null {
  const value = (raw ?? '').trim();
  return value ? value.slice(0, max) : null;
}

export interface NormalizedTaskEmailRef {
  customerEmail: string;
  mailbox: string;
  orderNumber: string | null;
  referenceNumber: string | null;
  subject: string | null;
}

export function normalizeTaskEmailRef(
  body: TaskEmailRefCreateBody,
): { ok: true; value: NormalizedTaskEmailRef } | { ok: false; reason: TaskEmailRefRefusal } {
  const customerEmail = body.customerEmail.trim().toLowerCase().replace(/^<|>$/g, '');
  if (!isEmailAddress(customerEmail)) return { ok: false, reason: 'invalid_customer_email' };
  const mailbox = normalizeMailbox(body.mailbox);
  if (!mailbox) return { ok: false, reason: 'invalid_mailbox' };
  const orderNumber = optionalText(body.orderNumber, TASK_EMAIL_NUMBER_MAX);
  const referenceNumber = optionalText(body.referenceNumber, TASK_EMAIL_NUMBER_MAX);
  if (orderNumber && referenceNumber) return { ok: false, reason: 'both_numbers' };
  return {
    ok: true,
    value: {
      customerEmail,
      mailbox,
      orderNumber,
      referenceNumber,
      subject: optionalText(body.subject, TASK_EMAIL_SUBJECT_MAX),
    },
  };
}

/** A PATCH lands on the stored row: omitted keys keep their value, `null` clears an optional one. */
export function mergeTaskEmailRefPatch(
  before: Pick<TaskEmailRef, 'customerEmail' | 'mailbox' | 'orderNumber' | 'referenceNumber' | 'subject'>,
  patch: Partial<TaskEmailRefCreateBody>,
): TaskEmailRefCreateBody {
  return {
    customerEmail: patch.customerEmail ?? before.customerEmail,
    mailbox: patch.mailbox ?? before.mailbox,
    orderNumber: patch.orderNumber !== undefined ? patch.orderNumber : before.orderNumber,
    referenceNumber: patch.referenceNumber !== undefined ? patch.referenceNumber : before.referenceNumber,
    subject: patch.subject !== undefined ? patch.subject : before.subject,
  };
}

/**
 * The org's mailbox vocabulary: the four house channels on the org's
 * letterhead domain (bare local parts when it has none), then every other
 * mailbox the org has already recorded, in the order given (most used first).
 */
export function taskEmailMailboxes(letterheadEmail: string | null | undefined, used: readonly string[]): string[] {
  const domain = (letterheadEmail ?? '').trim().toLowerCase().split('@')[1] ?? '';
  const defaults = TASK_EMAIL_DEFAULT_MAILBOXES.map((local) => (domain ? `${local}@${domain}` : local));
  const out: string[] = [];
  for (const raw of [...defaults, ...used]) {
    const mailbox = normalizeMailbox(raw);
    if (!mailbox || out.includes(mailbox)) continue;
    // A bare `sales` is the same channel as `sales@<domain>` once the domain is known.
    if (!mailbox.includes('@') && out.some((known) => mailboxLocalPart(known) === mailbox)) continue;
    out.push(mailbox);
  }
  return out;
}

// ── the Links input + the row's inline number (rail + phone sheet) ─────────

/**
 * A paste into the task's Links input → the email reference it creates (owner
 * 2026-09-30: "within the links I should be able to add an email reference").
 * The customer is required; the mailbox is the one the headers name, else the
 * org's first channel (changeable on the row); the order number comes from
 * the subject when it carries one. Null = no customer address in the paste.
 */
export function emailRefFromPaste(raw: string, mailboxes: readonly string[]): TaskEmailRefCreateBody | null {
  const got = ingestEmailReference(raw, mailboxes);
  const mailbox = got.mailbox ?? mailboxes[0];
  if (!got.customerEmail || !mailbox) return null;
  return { customerEmail: got.customerEmail, mailbox, orderNumber: got.orderNumber, referenceNumber: null, subject: got.subject };
}

const REFERENCE_LEAD = /^ref(?:erence)?\b\.?\s*(?:#|no\.?|number)?\s*:?\s*/i;
const ORDER_LEAD = /^order\b\.?\s*(?:#|no\.?|number)?\s*:?\s*|^#\s*/i;

/**
 * The row's one inline number field → the PATCH that stores it: `Ref X` /
 * `Reference: X` is a reference number, anything else (`12345`, `Order #12345`)
 * an order number; the other number is cleared (never both). Blank clears both.
 */
export function emailRefNumberPatch(raw: string): { orderNumber: string | null; referenceNumber: string | null } {
  const value = raw.trim();
  if (REFERENCE_LEAD.test(value)) {
    return { orderNumber: null, referenceNumber: value.replace(REFERENCE_LEAD, '').trim().slice(0, TASK_EMAIL_NUMBER_MAX) || null };
  }
  return { orderNumber: value.replace(ORDER_LEAD, '').trim().slice(0, TASK_EMAIL_NUMBER_MAX) || null, referenceNumber: null };
}

/** `Order 12345` / `Ref X` — the row's face of that number, and the inline field's text. */
export function emailRefNumberFace(ref: Pick<TaskEmailRef, 'orderNumber' | 'referenceNumber'>): string {
  return ref.orderNumber ? `Order ${ref.orderNumber}` : ref.referenceNumber ? `Ref ${ref.referenceNumber}` : '';
}

// ── ingest ──────────────────────────────────────────────────────────────────

export interface EmailRefIngest {
  customerEmail: string | null;
  mailbox: string | null;
  subject: string | null;
  orderNumber: string | null;
}

/** Header names a paste can carry, forwarded blocks (Gmail / Outlook / Apple Mail) included. */
const HEADER_LINE =
  /^\s*(?:>\s*)*\**\s*(from|to|cc|reply-to|delivered-to|x-original-to|envelope-to|x-forwarded-to|subject|sent|date)\s*\**\s*:\s*\**\s*(.*)$/i;
const RECIPIENT_HEADERS: Readonly<Record<string, true>> = {
  'delivered-to': true,
  'x-original-to': true,
  'envelope-to': true,
  'x-forwarded-to': true,
  to: true,
  cc: true,
};
const SUBJECT_PREFIX = /^(?:\s*(?:re|fwd?|fw|aw|sv|tr)\s*(?:\[\d+\])?\s*:\s*)+/i;
/** `Order #113-2839-44`, `order no. 5521`, `Order Number: A-1020` — at least one digit. */
const ORDER_IN_SUBJECT = /\border\s*(?:#|no\.?|number|num\.?)?\s*:?\s*#?\s*([a-z0-9][a-z0-9-]{2,})/i;

interface Header {
  name: string;
  value: string;
}

function readHeaders(raw: string): Header[] {
  const headers: Header[] = [];
  let last: Header | null = null;
  for (const line of raw.split(/\r?\n/)) {
    const match = HEADER_LINE.exec(line);
    if (match) {
      last = { name: match[1].toLowerCase(), value: match[2].replace(/\*+$/, '').trim() };
      headers.push(last);
    } else if (last && /^[ \t]+\S/.test(line)) {
      // RFC 5322 folding: a continuation line belongs to the header above it.
      last.value = `${last.value} ${line.trim()}`;
    } else {
      last = null;
    }
  }
  return headers;
}

function addressesIn(text: string): string[] {
  return (text.match(ADDRESS_IN_TEXT) ?? []).map((address) => address.toLowerCase());
}

function domainOf(address: string): string {
  return address.split('@')[1] ?? '';
}

/**
 * A pasted email's headers → the reference's facts. `mailboxes` is the org's
 * vocabulary (`taskEmailMailboxes`): its full addresses name the org's own
 * domains, so staff addresses are never mistaken for the customer and a
 * forwarded email's inner `To:` (the real inbound mailbox) wins over the
 * outer forward target. Unknown facts come back null for the operator to fill.
 */
export function ingestEmailReference(raw: string, mailboxes: readonly string[]): EmailRefIngest {
  const known = mailboxes.map((mailbox) => mailbox.toLowerCase());
  const knownAddresses = new Set(known.filter((mailbox) => mailbox.includes('@')));
  const knownLocals = new Set(known.map(mailboxLocalPart));
  const internalDomains = new Set([...knownAddresses].map(domainOf));
  const isInternal = (address: string) => knownAddresses.has(address) || internalDomains.has(domainOf(address));
  const asMailbox = (address: string): string | null => {
    if (knownAddresses.has(address)) return address;
    const ownDomain = internalDomains.size === 0 || internalDomains.has(domainOf(address));
    return ownDomain && knownLocals.has(mailboxLocalPart(address)) ? address : null;
  };

  const headers = readHeaders(raw);
  if (headers.length === 0) {
    // A bare paste: the first outside address is the customer, the first mailbox the channel.
    const all = addressesIn(raw);
    return {
      customerEmail: all.find((address) => !isInternal(address) && !asMailbox(address)) ?? null,
      mailbox: all.map(asMailbox).find((mailbox): mailbox is string => mailbox !== null) ?? null,
      subject: null,
      orderNumber: null,
    };
  }

  // Customer: the first sender from outside the org; Reply-To only when no From qualifies.
  let customerEmail: string | null = null;
  let customerAt = -1;
  for (const name of ['from', 'reply-to']) {
    for (let index = 0; index < headers.length && !customerEmail; index += 1) {
      if (headers[index].name !== name) continue;
      const outside = addressesIn(headers[index].value).find((address) => !isInternal(address) && !asMailbox(address));
      if (outside) {
        customerEmail = outside;
        customerAt = index;
      }
    }
    if (customerEmail) break;
  }

  // Mailbox: a recipient the vocabulary knows, anywhere; else the first org
  // address the customer wrote to (their own header block), else anywhere.
  const recipients = headers
    .map((header, index) => ({ index, addresses: RECIPIENT_HEADERS[header.name] ? addressesIn(header.value) : [] }))
    .filter((entry) => entry.addresses.length > 0);
  const firstWhere = (entries: typeof recipients, pick: (address: string) => boolean) => {
    for (const entry of entries) {
      const hit = entry.addresses.find(pick);
      if (hit) return hit;
    }
    return null;
  };
  const afterCustomer = recipients.filter((entry) => entry.index > customerAt);
  const notCustomer = (address: string) => address !== customerEmail;
  const mailbox =
    firstWhere(recipients, (address) => asMailbox(address) !== null) ??
    (internalDomains.size > 0
      ? firstWhere(afterCustomer, isInternal) ?? firstWhere(recipients, isInternal)
      : firstWhere(afterCustomer, notCustomer) ?? firstWhere(recipients, notCustomer));

  const subjectHeader = headers.find((header) => header.name === 'subject' && header.value.replace(SUBJECT_PREFIX, '').trim());
  const subject = subjectHeader ? subjectHeader.value.replace(SUBJECT_PREFIX, '').trim().slice(0, TASK_EMAIL_SUBJECT_MAX) : null;
  const order = subject ? ORDER_IN_SUBJECT.exec(subject) : null;

  return {
    customerEmail,
    mailbox,
    subject,
    orderNumber: order && /\d/.test(order[1]) ? order[1].toUpperCase() : null,
  };
}
