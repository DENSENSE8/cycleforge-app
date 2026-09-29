/**
 * Buyer-note interlock (owner 2026-09-24):
 * Buyer-note interlock (owner 2026-09-24): a marketplace buyer note — "ship
 */

/** The machine code a held route returns; clients branch on it, never on text. */
export const BUYER_NOTE_HOLD_CODE = 'BUYER_NOTE_UNACKNOWLEDGED' as const;

/** `ops_events.event_type` for one acknowledgment. */
const BUYER_NOTE_ACK_EVENT = 'buyer_note_acknowledged' as const;

/** Anything with `pg`'s `query` shape — a tenant transaction client or a wrapper. */
interface BuyerNoteQueryable {
  query: (text: string, params: unknown[]) => Promise<{ rows: unknown[] }>;
}

/** The note an operator must read before this order may pack; null = no hold. */
export interface BuyerNoteHold {
  orderRowId: number;
  buyerNote: string;
}

/** The note's fingerprint an acknowledgment is recorded against — a changed note needs a new read. */
function noteShaSql(alias: string): string {
  return `left(encode(sha256(convert_to(btrim(${alias}.buyer_note), 'UTF8')), 'hex'), 16)`;
}
const NOTE_SHA_SQL = noteShaSql('o');

/**
 * THE unacknowledged-buyer-note predicate (owner 2026-09-29): the order has a
 * buyer note and nobody has acknowledged THIS note. The pack / label hold, the
 * exception queue's membership and its "Buyer Request" category all read it,
 * so acknowledging the note clears the exception everywhere at once.
 * `alias` = the orders alias in the surrounding query.
 */
export function buyerNoteUnacknowledgedSql(alias = 'o'): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) throw new Error(`buyer-note-interlock: invalid SQL alias ${JSON.stringify(alias)}`);
  return `(NULLIF(btrim(COALESCE(${alias}.buyer_note, '')), '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
          FROM ops_events e
         WHERE e.organization_id = ${alias}.organization_id
           AND e.entity_type = 'order'
           AND e.entity_id = ${alias}.id
           AND e.event_type = '${BUYER_NOTE_ACK_EVENT}'
           AND e.payload->>'note_sha' = ${noteShaSql(alias)}
      ))`;
}

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
        AND ${buyerNoteUnacknowledgedSql('o')}`,
    [organizationId, orderRowId],
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

type AcknowledgeBuyerNoteResult =
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
