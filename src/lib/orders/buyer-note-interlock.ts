/**
 * Buyer-note interlock (owner 2026-09-24): a marketplace buyer note — "ship
 * white instead of black" — is an ACTIVE fulfillment exception, not metadata.
 * An order that carries one cannot start packing or buy a label until a staff
 * member has read it and acknowledged it.
 *
 * ## What counts as a buyer note
 *
 * `orders.buyer_note` (migration 2026-07-03p) — the raw marketplace checkout
 * note, mirrored by the channel sync. NOT `orders.notes`, which is the latest
 * face of the internal operator trail (`order_notes`); an operator remark like
 * "box slightly creased" must never hold a pack.
 *
 * ## Where the ack lives — no new table
 *
 * An acknowledgment is an `ops_events` row (`entity_type='order'`,
 * `event_type='buyer_note_acknowledged'`, actor + time, `payload.note_sha`).
 * The hold compares against the sha of the CURRENT note, so a note the sync
 * edits after the ack holds the pack again — the operator acknowledged the old
 * words, not the new ones. `client_event_id` makes a double tap a no-op while
 * a second staffer's ack still records (who, when) of their own.
 *
 * The sha is computed in SQL on both sides (`sha256(convert_to(btrim(note)))`)
 * so the writer and the gate can never disagree on the hash.
 *
 * Gates: `POST /api/packing-logs/draft` (phone pack), `POST /api/packing-logs`
 * (desk pack scan), `POST /api/pack/ship`, `POST /api/shipping/order-labels/purchase`.
 * Each returns {@link buyerNoteHoldBody} with HTTP 409; the clients read
 * {@link BUYER_NOTE_HOLD_CODE}, show the note, and acknowledge through
 * `POST /api/orders/[id]/buyer-note/ack` before retrying.
 *
 * Pure of server imports (types only) so the client helper can share the code
 * constant without pulling the pool into a bundle.
 */

/** The machine code a held route returns; clients branch on it, never on text. */
export const BUYER_NOTE_HOLD_CODE = 'BUYER_NOTE_UNACKNOWLEDGED' as const;

/** `ops_events.event_type` for one acknowledgment. */
export const BUYER_NOTE_ACK_EVENT = 'buyer_note_acknowledged' as const;

/** Anything with `pg`'s `query` shape — a tenant transaction client or a wrapper. */
export interface BuyerNoteQueryable {
  query: (text: string, params: unknown[]) => Promise<{ rows: unknown[] }>;
}

/** The note an operator must read before this order may pack; null = no hold. */
export interface BuyerNoteHold {
  orderRowId: number;
  buyerNote: string;
}

const NOTE_SHA_SQL = `left(encode(sha256(convert_to(btrim(o.buyer_note), 'UTF8')), 'hex'), 16)`;

/**
 * The unacknowledged buyer note on one order row, or null when the order has
 * no note or the current note is already acknowledged. Org-scoped.
 */
export async function readBuyerNoteHold(
  db: BuyerNoteQueryable,
  organizationId: string,
  orderRowId: number,
): Promise<BuyerNoteHold | null> {
  const res = await db.query(
    `SELECT o.id, btrim(o.buyer_note) AS buyer_note
       FROM orders o
      WHERE o.organization_id = $1::uuid
        AND o.id = $2
        AND o.buyer_note IS NOT NULL
        AND btrim(o.buyer_note) <> ''
        AND NOT EXISTS (
          SELECT 1
            FROM ops_events e
           WHERE e.organization_id = o.organization_id
             AND e.entity_type = 'order'
             AND e.entity_id = o.id
             AND e.event_type = $3
             AND e.payload->>'note_sha' = ${NOTE_SHA_SQL}
        )`,
    [organizationId, orderRowId, BUYER_NOTE_ACK_EVENT],
  );
  const row = res.rows[0] as { id: number; buyer_note: string } | undefined;
  return row ? { orderRowId: Number(row.id), buyerNote: row.buyer_note } : null;
}

/** 409 body every held route returns — the note travels so the client can show it. */
export function buyerNoteHoldBody(hold: BuyerNoteHold) {
  return {
    ok: false as const,
    error: 'This order has a buyer note. Read and acknowledge it before packing or buying a label.',
    code: BUYER_NOTE_HOLD_CODE,
    orderRowId: hold.orderRowId,
    buyerNote: hold.buyerNote,
  };
}

export type AcknowledgeBuyerNoteResult =
  | { ok: true; orderRowId: number; buyerNote: string; noteSha: string; duplicate: boolean }
  | { ok: false; reason: 'not_found' | 'no_note' };

/**
 * Record that `staffId` read the order's CURRENT buyer note. Idempotent per
 * (order, note, staff). Org-scoped; the sha is taken from the row, never from
 * the request, so a client cannot acknowledge words it was not shown.
 */
export async function acknowledgeBuyerNote(
  db: BuyerNoteQueryable,
  input: { organizationId: string; orderRowId: number; staffId: number | null },
): Promise<AcknowledgeBuyerNoteResult> {
  const found = await db.query(
    `SELECT o.id, btrim(COALESCE(o.buyer_note, '')) AS buyer_note, ${NOTE_SHA_SQL} AS note_sha
       FROM orders o
      WHERE o.organization_id = $1::uuid AND o.id = $2`,
    [input.organizationId, input.orderRowId],
  );
  const row = found.rows[0] as { id: number; buyer_note: string; note_sha: string | null } | undefined;
  if (!row) return { ok: false, reason: 'not_found' };
  if (!row.buyer_note || !row.note_sha) return { ok: false, reason: 'no_note' };

  const inserted = await db.query(
    `INSERT INTO ops_events (
       organization_id, occurred_at, event_type, entity_type, entity_id,
       actor_staff_id, client_event_id, workflow_node_id, payload
     ) VALUES (
       $1::uuid, NOW(), $2, 'order', $3::bigint,
       $4::int, $5, NULL, $6::jsonb
     )
     ON CONFLICT (client_event_id) DO NOTHING
     RETURNING id`,
    [
      input.organizationId,
      BUYER_NOTE_ACK_EVENT,
      row.id,
      input.staffId,
      `buyer-note-ack:${row.id}:${row.note_sha}:${input.staffId ?? 0}`,
      JSON.stringify({ note_sha: row.note_sha }),
    ],
  );
  return {
    ok: true,
    orderRowId: Number(row.id),
    buyerNote: row.buyer_note,
    noteSha: row.note_sha,
    duplicate: inserted.rows.length === 0,
  };
}
