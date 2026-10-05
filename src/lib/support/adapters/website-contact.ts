/**
 * Website contact-form submission → SupportMessageDraft (pure mapping). The
 * repo has no customer contact-form endpoint yet; a future one validates the
 * submission and hands it here, then to `ingestSupportMessage`. Each
 * submission opens (or, re-delivered, finds) its own Support item.
 */
import type { OrgId } from '@/lib/tenancy/constants';
import type { SupportMessageDraft } from '@/lib/support/conversation/ingest-types';

export interface WebsiteContactSubmission {
  /** The form backend's id for this submission — the idempotency key. */
  submissionId: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  subject?: string | null;
  message: string;
  /** Order number the customer typed, kept as text (the staffer links the exact order). */
  orderNumber?: string | null;
  pageUrl?: string | null;
  submittedAt: string;
}

export function mapWebsiteContact(input: {
  orgId: OrgId;
  submission: WebsiteContactSubmission;
  /** Which storefront / site the form belongs to. */
  accountLabel?: string | null;
}): SupportMessageDraft | null {
  const s = input.submission;
  const id = s.submissionId.trim();
  const message = s.message.trim();
  if (!id || !message) return null;

  // Facts the customer typed into their own fields stay with the message.
  const facts = [
    s.orderNumber?.trim() ? `Order number: ${s.orderNumber.trim()}` : null,
    s.phone?.trim() ? `Phone: ${s.phone.trim()}` : null,
    s.pageUrl?.trim() ? `Sent from: ${s.pageUrl.trim()}` : null,
  ].filter((line): line is string => line != null);
  const email = s.email?.trim().toLowerCase() || null;
  const name = s.name?.trim() || null;

  return {
    orgId: input.orgId,
    source: 'website',
    channel: 'website',
    externalConversationId: `website:${id}`,
    externalMessageId: `website:${id}`,
    direction: 'inbound',
    body: facts.length ? `${message}\n\n${facts.join('\n')}` : message,
    occurredAt: s.submittedAt,
    authorLabel: name ?? email,
    requester: name || email ? { name, email } : null,
    subject: s.subject?.trim() || null,
    accountLabel: input.accountLabel?.trim() || null,
  };
}
