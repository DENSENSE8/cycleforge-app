/**
 * Customer email → SupportMessageDraft (pure mapping). The repo has no
 * customer-support mailbox ingest yet; whatever transport later delivers a
 * parsed email (IMAP poll, provider webhook, forwarded mailbox) hands it here
 * and then to `ingestSupportMessage` — this module owns the mapping only.
 *
 * Thread = the RFC 5322 thread root (first References id, else In-Reply-To,
 * else the message's own id), so a reply lands on the Support item its first
 * message opened. Mail FROM one of our support mailboxes is outbound 'sent'.
 */
import type { OrgId } from '@/lib/tenancy/constants';
import type { SupportMessageDraft } from '@/lib/support/conversation/ingest-types';

export interface InboundSupportEmail {
  /** RFC 5322 Message-ID (angle brackets optional). */
  messageId: string;
  inReplyTo?: string | null;
  /** References header ids, oldest first. */
  references?: ReadonlyArray<string> | null;
  from: { email: string; name?: string | null };
  to: ReadonlyArray<string>;
  subject?: string | null;
  /** Plain-text body. */
  text: string;
  receivedAt: string;
}

/** `<Abc@Host>` → `abc@host`. */
export function normalizeEmailMessageId(id: string): string {
  return id.trim().replace(/^<|>$/g, '').trim().toLowerCase();
}

/**
 * Drop the quoted history a mail client appends below a reply: everything from
 * the first "On … wrote:" / "-----Original Message-----" line, and `>`-quoted
 * lines. The thread already holds the earlier messages.
 */
export function stripQuotedReply(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if (/^On .+wrote:\s*$/i.test(line.trim()) || /^-{2,}\s*Original Message\s*-{2,}$/i.test(line.trim())) break;
    if (/^\s*>/.test(line)) continue;
    out.push(line);
  }
  return out.join('\n').trim();
}

export function mapSupportEmail(input: {
  orgId: OrgId;
  email: InboundSupportEmail;
  /** Our support mailboxes (lower-case or not); mail from one of them is outbound. */
  mailboxes: ReadonlyArray<string>;
}): SupportMessageDraft | null {
  const { email } = input;
  const messageId = normalizeEmailMessageId(email.messageId);
  const body = stripQuotedReply(email.text);
  if (!messageId || !body) return null;

  const mailboxes = new Set(input.mailboxes.map((m) => m.trim().toLowerCase()));
  const from = email.from.email.trim().toLowerCase();
  const outbound = mailboxes.has(from);
  const root = email.references?.find((r) => normalizeEmailMessageId(r)) ?? email.inReplyTo ?? email.messageId;
  const customer = outbound ? (email.to.find((t) => !mailboxes.has(t.trim().toLowerCase())) ?? null) : from;
  const mailbox = outbound ? from : (email.to.map((t) => t.trim().toLowerCase()).find((t) => mailboxes.has(t)) ?? null);

  return {
    orgId: input.orgId,
    source: 'email',
    channel: 'email',
    externalConversationId: `email:${normalizeEmailMessageId(root)}`,
    externalMessageId: `email:${messageId}`,
    direction: outbound ? 'outbound' : 'inbound',
    body,
    occurredAt: email.receivedAt,
    authorLabel: outbound ? from : (email.from.name?.trim() || from),
    requester: customer
      ? { email: customer.trim().toLowerCase(), name: outbound ? null : (email.from.name?.trim() || null) }
      : null,
    subject: email.subject?.trim() || null,
    accountLabel: mailbox,
    ...(outbound ? { delivery: 'sent' as const } : {}),
  };
}
