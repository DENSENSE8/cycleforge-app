import 'server-only';

import type { PoolClient } from 'pg';

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { MENTION_INBOX_ITEM_SQL, mentionInboxItemParams } from '@/lib/notifications/assign-inbox-item';
import { SUPPORT_TICKET_MENTIONED } from '@/lib/notifications/event-vocabulary';
import { publishInboxItem } from '@/lib/realtime/publish';
import { noteMentionsToPlain, parseNoteMentions } from '@/lib/orders/note-mentions';

interface MentionRecipient {
  staffId: number;
  name: string;
}

/** Mentioned staff who would be rung — active staff of this org, never the author — in the body's order, plus the author's name. */
async function readMentionRecipients(
  client: Pick<PoolClient, 'query'>,
  requested: readonly number[],
  actorStaffId: number | null,
): Promise<{ recipients: MentionRecipient[]; actorName: string | null }> {
  const staff = await client.query<{ id: number; name: string | null }>(
    `SELECT id, name FROM staff
      WHERE (id = ANY($1::int[])
             AND COALESCE(status, 'active') IN ('active', 'invited')
             AND COALESCE(active, true) = true)
         OR id = $2`,
    [requested, actorStaffId],
  );
  const nameById = new Map(staff.rows.map((r) => [Number(r.id), r.name?.trim() || `Staff ${r.id}`]));
  const recipients = requested
    .filter((id) => id !== actorStaffId && nameById.has(id))
    .map((staffId) => ({ staffId, name: nameById.get(staffId) ?? '' }));
  const actorName = actorStaffId != null ? (nameById.get(actorStaffId) ?? null) : null;
  return { recipients, actorName };
}

/** Test mode: who a live create of this body would ring — read-only, rings nobody. */
export async function resolveTicketMentionRecipients({
  orgId,
  note,
  actorStaffId,
}: {
  orgId: OrgId;
  note: string;
  actorStaffId: number | null;
}): Promise<MentionRecipient[]> {
  const requested = parseNoteMentions(note).filter((id) => id !== actorStaffId);
  if (requested.length === 0) return [];
  const { recipients } = await withTenantTransaction(orgId, (client) => readMentionRecipients(client, requested, actorStaffId));
  return recipients;
}

/**
 * Ring the inbox of every staffer a NEW ticket's body `@[Name](staff:ID)`
 * mentions — the order-note mention grammar and inbox row, anchored on the
 * local `support_tickets.id` and carrying the provider `#number` the floor
 * quotes. Only active staff of this org count; the author is never rung.
 * Returns the staff ids actually notified.
 */
export async function notifyTicketMentions({
  orgId,
  supportTicketId,
  providerTicketId,
  note,
  actorStaffId,
}: {
  orgId: OrgId;
  supportTicketId: number;
  providerTicketId: number;
  /** The stored body, tokens intact. */
  note: string;
  actorStaffId: number | null;
}): Promise<number[]> {
  const requested = parseNoteMentions(note).filter((id) => id !== actorStaffId);
  if (requested.length === 0) return [];
  const preview = noteMentionsToPlain(note).slice(0, 280);

  const { rows: inbox, actorName } = await withTenantTransaction(orgId, async (client) => {
    const { recipients, actorName: author } = await readMentionRecipients(client, requested, actorStaffId);
    const out: Array<{ itemId: number; staffId: number }> = [];
    for (const { staffId: recipient } of recipients) {
      const inserted = await client.query<{ id: number }>(
        MENTION_INBOX_ITEM_SQL,
        mentionInboxItemParams(orgId, {
          staffId: recipient,
          entityType: 'support_ticket',
          entityId: supportTicketId,
          eventKey: SUPPORT_TICKET_MENTIONED,
          sourceKey: `support_ticket:${supportTicketId}`,
          actorStaffId,
          note: preview,
          ticketNumber: providerTicketId,
        }),
      );
      const itemId = inserted.rows[0]?.id;
      if (itemId != null) out.push({ itemId: Number(itemId), staffId: recipient });
    }
    return { rows: out, actorName: author };
  });

  // Push only after commit — a rolled-back row must not ring anyone.
  await Promise.all(
    inbox.map(({ itemId, staffId }) =>
      publishInboxItem({
        organizationId: orgId,
        recipientId: staffId,
        itemId,
        entityType: 'support_ticket',
        entityId: supportTicketId,
        eventKey: SUPPORT_TICKET_MENTIONED,
        actorStaffId,
        actorName,
        note: preview,
      }).catch((err) => console.error('[ticket-mentions] mention push failed', err)),
    ),
  );
  return inbox.map((r) => r.staffId);
}
