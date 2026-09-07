import type { PoolClient } from 'pg';
import { withTenantConnection } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';

/**
 * Viewer-only provenance detail for one photo, resolved from its RECEIVING /
 * RECEIVING_LINE link: the paired serial numbers, the carton's carrier tracking,
 * and the carton/line claim ticket. Fetched lazily by the fullscreen viewer's
 * context panel (see `usePhotoReceivingContext`) so the hot media-library list
 * query never pays for data only shown when a photo is actually opened.
 *
 * Serials resolve through `serial_unit_provenance` (RECEIVING_LINE origin) — the
 * SAME verified join the production media-library `serial` finder uses
 * (`queries/library.ts`), NOT the `receiving_line_testing.serial_projection`
 * read-model (that migration is unapplied). Tracking reads
 * `receiving_carton.shipment_id → shipping_tracking_numbers.tracking_number_raw`.
 *
 * Tenant-scoped: callers may pass a GUC-bearing `client` (from
 * withTenantConnection) to join an existing tenant transaction; by default the
 * query runs inside its own `app.current_org` scope via withTenantConnection.
 * The explicit `organization_id = $2` conjuncts stay as defense-in-depth.
 */
export interface PhotoReceivingContext {
  cartonId: number | null;
  /** Raw carton/line claim ref, e.g. "#9518" (line-level wins over carton). */
  claim: string | null;
  /** Carrier tracking number for the carton, if a shipment is linked. */
  tracking: string | null;
  /** Serial numbers paired to this photo's line (or the whole carton). */
  serials: string[];
}

export async function getPhotoReceivingContext(
  photoId: number,
  organizationId: OrgId,
  client?: PoolClient,
): Promise<PhotoReceivingContext | null> {
  const query = async (c: PoolClient) =>
    c.query<{
      carton_id: number | string | null;
      claim: string | null;
      tracking: string | null;
      serials: string[] | null;
    }>(
      `
      WITH lnk AS (
        SELECT
          COALESCE(rl.receiving_id, CASE WHEN l.entity_type = 'RECEIVING' THEN l.entity_id END) AS carton_id,
          CASE WHEN l.entity_type = 'RECEIVING_LINE' THEN l.entity_id END AS line_id,
          CASE WHEN l.entity_type = 'RECEIVING_LINE' THEN rl.zendesk_ticket END AS line_ticket
        FROM photo_entity_links l
        LEFT JOIN receiving_line rl
               ON l.entity_type = 'RECEIVING_LINE'
              AND rl.id = l.entity_id
              AND rl.organization_id = l.organization_id
        WHERE l.photo_id = $1
          AND l.organization_id = $2
          AND l.entity_type IN ('RECEIVING', 'RECEIVING_LINE')
        -- Prefer the line-level link (more specific serials/claim) over a PO-level one.
        ORDER BY (l.entity_type = 'RECEIVING_LINE') DESC
        LIMIT 1
      )
      SELECT
        lnk.carton_id,
        COALESCE(NULLIF(TRIM(lnk.line_ticket), ''), NULLIF(TRIM(rc.zendesk_ticket), '')) AS claim,
        stn.tracking_number_raw AS tracking,
        COALESCE((
          SELECT array_agg(DISTINCT su.serial_number)
            FROM serial_units su
            JOIN serial_unit_provenance sup
              ON sup.serial_unit_id = su.id
             AND sup.origin_type = 'RECEIVING_LINE'
             AND sup.origin_id IS NOT NULL
             AND sup.organization_id = $2
            JOIN receiving_line rl2 ON rl2.id = sup.origin_id
           WHERE rl2.receiving_id = lnk.carton_id
             AND su.organization_id = $2
             AND su.serial_number IS NOT NULL
             AND su.serial_number <> ''
             AND (lnk.line_id IS NULL OR rl2.id = lnk.line_id)
        ), ARRAY[]::text[]) AS serials
      FROM lnk
      LEFT JOIN receiving_carton rc ON rc.id = lnk.carton_id AND rc.organization_id = $2
      LEFT JOIN shipping_tracking_numbers stn ON stn.id = rc.shipment_id
      `,
      [photoId, organizationId],
    );

  const res = await (client
    ? query(client)
    : withTenantConnection(organizationId, query));

  const row = res.rows[0];
  if (!row) return null;
  return {
    cartonId: row.carton_id != null ? Number(row.carton_id) : null,
    claim: row.claim?.trim() || null,
    tracking: row.tracking?.trim() || null,
    serials: Array.isArray(row.serials) ? row.serials.filter((s): s is string => !!s) : [],
  };
}
