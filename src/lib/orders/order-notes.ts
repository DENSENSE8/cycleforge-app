import 'server-only';

import type { PoolClient } from 'pg';
import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { MENTION_INBOX_ITEM_SQL, mentionInboxItemParams } from '@/lib/notifications/assign-inbox-item';
import { ORDER_NOTE_MENTIONED } from '@/lib/notifications/event-vocabulary';
import { publishInboxItem } from '@/lib/realtime/publish';
import { noteMentionsToPlain, parseNoteMentions } from './note-mentions';

/** Internal ops annotations on an order (`order_notes`) — the append-only trail of "box arrived damaged", "packer forgot the cable". */

interface OrderNote {
  id: string;
  noteText: string;
  authorStaffId: number | null;
  /** Resolved at read time — `null` when the author row was deleted. */
  authorName: string | null;
  /** Validated staff ids this note @mentions (token format: note-mentions.ts). */
  mentionedStaffIds: number[];
  createdAt: string;
}

/** This order's notes, newest first. */
export async function listOrderNotes(
  orderId: number,
  organizationId: OrgId,
): Promise<OrderNote[]> {
  return withTenantTransaction(organizationId, async (client) => {
    const { rows } = await client.query<{
      id: string;
      note_text: string;
      author_staff_id: number | null;
      author_name: string | null;
      mentioned_staff_ids: number[] | null;
      created_at: string;
    }>(
      `SELECT n.id,
              n.note_text,
              n.author_staff_id,
              s.name AS author_name,
              n.mentioned_staff_ids,
              n.created_at
         FROM order_notes n
         LEFT JOIN staff s ON s.id = n.author_staff_id
        WHERE n.order_id = $1
        ORDER BY n.created_at DESC, n.id DESC`,
      [orderId],
    );
    return rows.map((r) => ({
      id: String(r.id),
      noteText: r.note_text,
      authorStaffId: r.author_staff_id === null ? null : Number(r.author_staff_id),
      authorName: r.author_name?.trim() || null,
      mentionedStaffIds: (r.mentioned_staff_ids ?? []).map(Number),
      createdAt: new Date(r.created_at).toISOString(),
    }));
  });
}

type CreateOrderNoteResult =
  | { ok: true; note: OrderNote }
  | { ok: false; reason: 'not_found' | 'empty' };

/**
 * Append one note. The order's existence is checked first so a bad id is a 404
 * the operator can act on rather than a raw FK violation surfaced as a 500.
 */
export async function createOrderNote({
  orderId,
  organizationId,
  noteText,
  staffId,
}: {
  orderId: number;
  organizationId: OrgId;
  noteText: string;
  staffId: number | null;
}): Promise<CreateOrderNoteResult> {
  const body = noteText.trim();
  if (!body) return { ok: false, reason: 'empty' };

  const requested = parseNoteMentions(body);
  let inboxRows: Array<{ itemId: number; staffId: number }> = [];

  const result = await withTenantTransaction<CreateOrderNoteResult>(organizationId, async (client) => {
    const exists = await client.query('SELECT 1 FROM orders WHERE id = $1 LIMIT 1', [orderId]);
    if (exists.rowCount === 0) return { ok: false, reason: 'not_found' };

    // Mentions are only honoured for active staff in THIS org (RLS scopes staff).
    let mentioned: number[] = [];
    if (requested.length > 0) {
      const valid = await client.query<{ id: number }>(
        `SELECT id FROM staff
          WHERE id = ANY($1::int[])
            AND COALESCE(status, 'active') IN ('active', 'invited')
            AND COALESCE(active, true) = true`,
        [requested],
      );
      const ok = new Set(valid.rows.map((r) => Number(r.id)));
      mentioned = requested.filter((id) => ok.has(id));
    }

    const { rows } = await client.query<{
      id: string;
      note_text: string;
      author_staff_id: number | null;
      mentioned_staff_ids: number[];
      created_at: string;
    }>(
      `INSERT INTO order_notes (order_id, note_text, author_staff_id, mentioned_staff_ids)
       VALUES ($1, $2, $3, $4::int[])
       RETURNING id, note_text, author_staff_id, mentioned_staff_ids, created_at`,
      [orderId, body, staffId, mentioned],
    );
    const row = rows[0];

    /* Keep the denormalized latest-note column in step, in the SAME write. */
    await client.query('UPDATE orders SET notes = $1 WHERE id = $2', [body, orderId]);

    // Resolve the author's name from the same transaction rather than trusting
    // the caller's session label — the list read joins `staff`, and the
    // optimistic row the client renders must match what a refetch will return.
    let authorName: string | null = null;
    if (row.author_staff_id !== null) {
      const staffRow = await client.query<{ name: string | null }>(
        'SELECT name FROM staff WHERE id = $1',
        [row.author_staff_id],
      );
      authorName = staffRow.rows[0]?.name?.trim() || null;
    }

    const preview = noteMentionsToPlain(body).slice(0, 280);
    inboxRows = [];
    for (const recipient of mentioned) {
      if (recipient === staffId) continue; // never notify the author of their own note
      const inserted = await client.query<{ id: number }>(
        MENTION_INBOX_ITEM_SQL,
        mentionInboxItemParams(organizationId, {
          staffId: recipient,
          entityType: 'order',
          entityId: orderId,
          eventKey: ORDER_NOTE_MENTIONED,
          sourceKey: `order_note:${row.id}`,
          actorStaffId: staffId,
          note: preview,
        }),
      );
      const itemId = inserted.rows[0]?.id;
      if (itemId != null) inboxRows.push({ itemId: Number(itemId), staffId: recipient });
    }

    return {
      ok: true,
      note: {
        id: String(row.id),
        noteText: row.note_text,
        authorStaffId: row.author_staff_id === null ? null : Number(row.author_staff_id),
        authorName,
        mentionedStaffIds: (row.mentioned_staff_ids ?? []).map(Number),
        createdAt: new Date(row.created_at).toISOString(),
      },
    };
  });

  // Push only after commit — a rolled-back note must not ring anyone's inbox.
  if (result.ok && inboxRows.length > 0) {
    const preview = noteMentionsToPlain(result.note.noteText).slice(0, 280);
    await Promise.all(
      inboxRows.map(({ itemId, staffId: recipientId }) =>
        publishInboxItem({
          organizationId,
          recipientId,
          itemId,
          entityType: 'order',
          entityId: orderId,
          eventKey: ORDER_NOTE_MENTIONED,
          actorStaffId: staffId,
          actorName: result.note.authorName,
          note: preview,
        }).catch((err) => console.error('[order-notes] mention push failed', err)),
      ),
    );
  }
  return result;
}

/** Append the SAME note onto many orders in one tenant transaction. */
export async function createOrderNotesBulk({
  orderIds,
  organizationId,
  noteText,
  staffId,
}: {
  orderIds: readonly number[];
  organizationId: OrgId;
  noteText: string;
  staffId: number | null;
}): Promise<{ updatedIds: number[] }> {
  const body = noteText.trim();
  if (!body) return { updatedIds: [] };

  const ids = [...new Set(orderIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (ids.length === 0) return { updatedIds: [] };

  return withTenantTransaction(organizationId, (client) => createOrderNotesInTx(client, ids, body, staffId));
}

/**
 * {@link createOrderNotesBulk} on the caller's tenant transaction: one
 * `order_notes` row per order the org owns, plus the denormalized latest note.
 */
export async function createOrderNotesInTx(
  client: Pick<PoolClient, 'query'>,
  orderIds: readonly number[],
  noteText: string,
  staffId: number | null,
): Promise<{ updatedIds: number[] }> {
  const body = noteText.trim();
  if (!body || orderIds.length === 0) return { updatedIds: [] };
  const owned = await client.query<{ id: number }>(
    'SELECT id FROM orders WHERE id = ANY($1::int[])',
    [[...orderIds]],
  );
  const updatedIds = owned.rows.map((r) => Number(r.id));
  if (updatedIds.length === 0) return { updatedIds };

  await client.query(
    `INSERT INTO order_notes (order_id, note_text, author_staff_id)
     SELECT unnest($1::int[]), $2, $3`,
    [updatedIds, body, staffId],
  );
  await client.query('UPDATE orders SET notes = $1 WHERE id = ANY($2::int[])', [
    body,
    updatedIds,
  ]);
  return { updatedIds };
}
