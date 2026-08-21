import pool from '@/lib/db';
import type { PhotoEntityType } from './types';

/** The minimum a caller-supplied executor must provide. */
interface PoRefQueryable {
  query<R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: R[]; rowCount: number | null }>;
}

/**
 * Resolve po_ref denorm from the primary linked entity at upload time.
 *
 * `db` follows the house executor pattern: default to the pool, but let a
 * caller that already owns a transaction pass its client so the read joins
 * that transaction instead of taking a second connection. The AI mutation
 * chokepoint needs this — its photo move and the `agent_mutations` row have to
 * commit together.
 */
export async function resolvePoRef(
  entityType: PhotoEntityType,
  entityId: number,
  db: PoRefQueryable = pool,
): Promise<string | null> {
  switch (entityType) {
    // Wave-2 reader cutover: the line's zoho PO id reads from receiving_line_zoho
    // (rz, 1:1 on the line PK). The carton-level zoho_purchase_receive_id fallback
    // stays on the spine (out of scope this wave).
    case 'RECEIVING': {
      const r = await db.query<{ po: string | null }>(
        `SELECT COALESCE(
           NULLIF(TRIM(rz.zoho_purchaseorder_id), ''),
           NULLIF(TRIM(r.zoho_purchase_receive_id), ''),
           'PO_' || r.id::text
         ) AS po
         FROM receiving_carton r
         LEFT JOIN receiving_line rl ON rl.receiving_id = r.id
         LEFT JOIN receiving_line_zoho rz
                ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
        WHERE r.id = $1
        ORDER BY rl.id ASC NULLS LAST
        LIMIT 1`,
        [entityId],
      );
      return r.rows[0]?.po ?? null;
    }
    case 'RECEIVING_LINE': {
      const r = await db.query<{ po: string | null }>(
        `SELECT COALESCE(
           NULLIF(TRIM(rz.zoho_purchaseorder_id), ''),
           NULLIF(TRIM(r.zoho_purchase_receive_id), ''),
           'PO_' || r.id::text
         ) AS po
         FROM receiving_line rl
         LEFT JOIN receiving_line_zoho rz
                ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
         JOIN receiving_carton r ON r.id = rl.receiving_id
        WHERE rl.id = $1 LIMIT 1`,
        [entityId],
      );
      return r.rows[0]?.po ?? null;
    }
    case 'PACKER_LOG': {
      const r = await pool.query<{ ref: string | null }>(
        `SELECT COALESCE(
           NULLIF(TRIM(order_id), ''),
           NULLIF(TRIM(scan_ref), ''),
           'PACK_' || id::text
         ) AS ref
         FROM packer_logs WHERE id = $1 LIMIT 1`,
        [entityId],
      );
      return r.rows[0]?.ref ?? null;
    }
    case 'SERIAL_UNIT': {
      const r = await pool.query<{ ref: string | null }>(
        `SELECT COALESCE(
           NULLIF(TRIM(unit_uid), ''),
           NULLIF(TRIM(sku), ''),
           'UNIT_' || id::text
         ) AS ref
         FROM serial_units WHERE id = $1 LIMIT 1`,
        [entityId],
      );
      return r.rows[0]?.ref ?? null;
    }
    default:
      return null;
  }
}
