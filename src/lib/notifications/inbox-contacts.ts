/**
 * The contacts a follow-up alert carries (`staff_inbox_items.payload.contacts`)
 * — read back from the payload, and painted as one compact, clickable phrase
 * each (`customer@x.com · sales@ · Order 12345`, `Ticket #10022`). Client-safe.
 */

import { emailRefNumberFace } from '@/lib/tasks/task-email-refs';
import { mailboxFace } from '@/lib/tasks/task-email-refs-shared';
import { taskLinkRepairHref } from '@/lib/tasks/task-links-shared';
import { getTrackingUrl } from '@/lib/tracking-format';
import type { InboxContact } from './types';

function text(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function positiveInt(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** One stored contact → the typed wire value; null for anything malformed (never guessed). */
function readContact(raw: unknown): InboxContact | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  switch (c.kind) {
    case 'email': {
      const address = text(c.address);
      const mailbox = text(c.mailbox);
      return address && mailbox
        ? { kind: 'email', address, mailbox, orderNumber: text(c.orderNumber), referenceNumber: text(c.referenceNumber) }
        : null;
    }
    case 'ticket': {
      const number = positiveInt(c.number);
      return number ? { kind: 'ticket', number } : null;
    }
    case 'order': {
      const orderNumber = text(c.orderNumber);
      return orderNumber ? { kind: 'order', orderNumber, orderId: positiveInt(c.orderId) } : null;
    }
    case 'repair': {
      const label = text(c.label);
      return label ? { kind: 'repair', label, repairId: positiveInt(c.repairId) } : null;
    }
    case 'tracking': {
      const trackingNumber = text(c.trackingNumber);
      return trackingNumber ? { kind: 'tracking', trackingNumber } : null;
    }
    default:
      return null;
  }
}

/** `payload.contacts` → typed contacts; absent / malformed entries drop out. */
export function readInboxContacts(payload: unknown): InboxContact[] {
  const raw = (payload as { contacts?: unknown } | null)?.contacts;
  if (!Array.isArray(raw)) return [];
  const out: InboxContact[] = [];
  for (const entry of raw) {
    const contact = readContact(entry);
    if (contact) out.push(contact);
  }
  return out;
}

export interface InboxContactFace {
  /** Stable React key. */
  key: string;
  text: string;
  /** The house door (`mailto:` for an email); null when the contact has none. */
  href: string | null;
  /** Leaves the app (tracking carrier page, the mail client). */
  external: boolean;
}

/** One contact as the inbox row / header line / alert composer reads it. */
export function inboxContactFace(contact: InboxContact, surface: 'desk' | 'phone'): InboxContactFace {
  switch (contact.kind) {
    case 'email':
      return {
        key: `email:${contact.address}:${contact.mailbox}`,
        text: [contact.address, mailboxFace(contact.mailbox), emailRefNumberFace(contact)].filter(Boolean).join(' · '),
        href: `mailto:${contact.address}`,
        external: true,
      };
    case 'ticket':
      return {
        key: `ticket:${contact.number}`,
        text: `Ticket #${contact.number}`,
        href: surface === 'phone' ? `/m/t/${contact.number}` : `/support?ticket=${contact.number}`,
        external: false,
      };
    case 'order':
      return {
        key: `order:${contact.orderId ?? contact.orderNumber}`,
        text: `Order ${contact.orderNumber}`,
        href: contact.orderId != null ? `/dashboard?order=${contact.orderId}` : null,
        external: false,
      };
    case 'repair':
      return {
        key: `repair:${contact.repairId ?? contact.label}`,
        text: contact.label,
        href: contact.repairId != null ? taskLinkRepairHref(contact.repairId, surface) : null,
        external: false,
      };
    case 'tracking':
      return {
        key: `tracking:${contact.trackingNumber}`,
        text: `Tracking ${contact.trackingNumber}`,
        href: getTrackingUrl(contact.trackingNumber),
        external: true,
      };
  }
}

/** The contacts as one plain line (the header's rolling hint): each contact's face, comma-separated (an email's face has its own ` · `). */
export function inboxContactsLine(contacts: readonly InboxContact[]): string | null {
  return contacts.length > 0 ? contacts.map((contact) => inboxContactFace(contact, 'desk').text).join(', ') : null;
}
