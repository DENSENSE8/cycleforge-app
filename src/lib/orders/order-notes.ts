import 'server-only';

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

/** Internal ops annotations on an order (`order_notes`) — the append-only trail of "box arrived damaged", "packer forgot the cable". */

interface OrderNote {
  id: string;
  noteText: string;
  authorStaffId: number | null;
  /** Resolved at read time — `null` when the author row was deleted. */
  authorName: string | null;
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

  return withTenantTransaction(organizationId, async (client) => {
    const owned = await client.query<{ id: number }>(
      'SELECT id FROM orders WHERE id = ANY($1::int[])',
      [ids],
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
  });
}
