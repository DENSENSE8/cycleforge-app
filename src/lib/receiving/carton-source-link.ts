/** Carton ⇄ source-order linkage derivation. */
import pool from '@/lib/db';

interface Queryable {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>>; rowCount: number | null }>;
}

export async function recomputeCartonSourceLink(
  receivingId: number,
  db: Queryable = pool,
): Promise<void> {
  if (!Number.isFinite(receivingId) || receivingId <= 0) return;

  // Lines on this carton that carry a per-line source order (ecwid returns /
  // repairs). Earliest line wins as the carton's display representative.
  const linked = await db.query(
    `SELECT source_order_id, source_system
       FROM receiving_line
      WHERE receiving_id = $1
        AND source_order_id IS NOT NULL
        AND btrim(source_order_id) <> ''
      ORDER BY id ASC`,
    [receivingId],
  );

  const cartonRes = await db.query(
    `SELECT source, source_platform, zoho_purchaseorder_id
       FROM receiving_carton WHERE id = $1 LIMIT 1`,
    [receivingId],
  );
  const carton = cartonRes.rows[0] as
    | { source: string | null; source_platform: string | null; zoho_purchaseorder_id: string | null }
    | undefined;
  if (!carton) return;

  // Ecwid-derived = the carton's zoho_po state came from a per-line ecwid link
  // (source_platform 'ecwid', no real Zoho PO id). Only these are ours to move.
  const isEcwidDerived = carton.source_platform === 'ecwid' && !carton.zoho_purchaseorder_id;
  const isUnmatched = carton.source === 'unmatched';

  // ── Zoho-PO promotion ────────────────────────────────────────────────────── A line carrying a REAL Zoho PO id means this carton is…
  if (isUnmatched && !carton.zoho_purchaseorder_id) {
    // Line-level Zoho identity lives in receiving_line_zoho (Wave-3 inversion —
    // receiving_line's own zoho_* columns are dropped).
    const zohoLinked = await db.query(
      `SELECT rz.zoho_purchaseorder_id, rz.zoho_purchaseorder_number
         FROM receiving_line rl
         JOIN receiving_line_zoho rz ON rz.receiving_line_id = rl.id
        WHERE rl.receiving_id = $1
          AND rz.zoho_purchaseorder_id IS NOT NULL
          AND btrim(rz.zoho_purchaseorder_id) <> ''
        ORDER BY rl.id ASC
        LIMIT 1`,
      [receivingId],
    );
    if (zohoLinked.rows.length > 0) {
      const poId = String(zohoLinked.rows[0].zoho_purchaseorder_id ?? '').trim();
      const rawNum = zohoLinked.rows[0].zoho_purchaseorder_number;
      const poNumber = rawNum == null ? null : String(rawNum).trim() || null;
      // Collision guard:
      const held = await db.query(
        `SELECT 1 FROM receiving_carton
          WHERE zoho_purchaseorder_id = $1 AND source = 'zoho_po' AND id <> $2
          LIMIT 1`,
        [poId, receivingId],
      );
      if (held.rows.length === 0) {
        await db.query(
          `UPDATE receiving_carton
              SET zoho_purchaseorder_id = $2,
                  zoho_purchaseorder_number = COALESCE($3, zoho_purchaseorder_number),
                  source = 'zoho_po',
                  updated_at = NOW()
            WHERE id = $1 AND source = 'unmatched'`,
          [receivingId, poId, poNumber],
        );
      }
      return;
    }
  }

  if (linked.rows.length > 0) {
    // ≥1 linked line — carton leaves the Unfound queue; representative = first.
    // Don't touch a carton matched to a real Zoho PO.
    if (!isUnmatched && !isEcwidDerived) return;
    const representative = String(linked.rows[0].source_order_id ?? '').trim();
    await db.query(
      `UPDATE receiving_carton
          SET zoho_purchaseorder_number = $2,
              source = 'zoho_po',
              source_platform = 'ecwid',
              updated_at = NOW()
        WHERE id = $1`,
      [receivingId, representative],
    );
  } else {
    // No linked lines remain — revert ONLY an ecwid-derived carton to unmatched
    // (clear PO# + pill). A real-PO carton is left untouched.
    if (!isEcwidDerived) return;
    await db.query(
      `UPDATE receiving_carton
          SET zoho_purchaseorder_number = NULL,
              source = 'unmatched',
              source_platform = NULL,
              updated_at = NOW()
        WHERE id = $1`,
      [receivingId],
    );
  }
}
