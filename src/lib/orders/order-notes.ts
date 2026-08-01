import 'server-only';

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

/**
 * Internal ops annotations on an order (`order_notes`) — the append-only trail
 * of "box arrived damaged", "packer forgot the cable".
 *
 * The table shipped ahead of its API in `2026-07-28_order_notes.sql` and had no
 * writers until now. This module is that first writer, and it is deliberately
 * the ONLY one: the migration's scope boundary says `order_notes` is internal
 * ops annotations while the customer/support CONVERSATION stays in Entity
 * Threads (`ThreadPanel entityType="ORDER"`). Do not make the same note
 * writable in both.
 *
 * **Append-only, with an author.** The queue's legacy `orders.notes` is a single
 * overwritable string: the second person to touch a row destroys what the first
 * one wrote, and nobody can tell who said it or when. That is the whole reason
 * this table exists — every entry keeps `author_staff_id` and `created_at`, so
 * a note is a statement someone made at a time, not an anonymous field value.
 */

interface OrderNote {
  id: string;
  noteText: string;
  authorStaffId: number | null;
  /** Resolved at read time — `null` when the author row was deleted. */
  authorName: string | null;
  createdAt: string;
}

/**
 * This order's notes, newest first.
 *
 * Author name is joined rather than denormalized onto the note so a staff
 * rename corrects the whole history; `LEFT JOIN` keeps a note whose author was
 * deleted (the FK is `ON DELETE SET NULL`) instead of dropping the note with
 * the person — the annotation is still true.
 */
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
      created_at: string;
    }>(
      `SELECT n.id,
              n.note_text,
              n.author_staff_id,
              s.name AS author_name,
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

  return withTenantTransaction<CreateOrderNoteResult>(organizationId, async (client) => {
    const exists = await client.query('SELECT 1 FROM orders WHERE id = $1 LIMIT 1', [orderId]);
    if (exists.rowCount === 0) return { ok: false, reason: 'not_found' };

    const { rows } = await client.query<{
      id: string;
      note_text: string;
      author_staff_id: number | null;
      created_at: string;
    }>(
      `INSERT INTO order_notes (order_id, note_text, author_staff_id)
       VALUES ($1, $2, $3)
       RETURNING id, note_text, author_staff_id, created_at`,
      [orderId, body, staffId],
    );
    const row = rows[0];

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

    return {
      ok: true,
      note: {
        id: String(row.id),
        noteText: row.note_text,
        authorStaffId: row.author_staff_id === null ? null : Number(row.author_staff_id),
        authorName,
        createdAt: new Date(row.created_at).toISOString(),
      },
    };
  });
}
