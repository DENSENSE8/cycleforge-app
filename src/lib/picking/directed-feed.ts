/**
 * Directed picking feed — `POST /api/picking/next`.
 *
 * Hands a picker the next line, one at a time, so the phone never shows a
 * list while picking. A line is every open unit of one order sharing a SKU
 * and a bin (`groupDirectedPickLines`).
 *
 * ## Which order
 *
 * Order-at-a-time, because a pick needs the order's tote (`pick.confirm`
 * refuses without one) and one tote carries one order:
 *
 *   1. an order this picker already has an open session on (finish it);
 *   2. else the most urgent unheld order — ship-by within 24h first, then the
 *      earliest ship-by, then the oldest order.
 *
 * An order is HELD when another picker opened a session on it in the last
 * {@link HOLD_MINUTES} minutes and has not closed it — the claim. The choice
 * and the session insert run under one advisory lock so two phones asking at
 * once cannot both claim the same order. A stale hold simply lapses; a race
 * that still slips through is refused per unit by `confirmPick`'s row lock
 * (409), and the phone re-asks.
 *
 * ## Closing
 *
 * Every call first closes this picker's sessions whose orders have nothing
 * left to pick (`completeSession` → the order's totes go STAGED for pack),
 * so a last pick, a last short, or an app killed mid-run all close the same
 * way on the next ask.
 *
 * ## Progress
 *
 * `done` = units this picker picked or shorted since `runStartedAt` (the
 * phone's run start); `total` = done + every unit still open in orders this
 * picker could be fed. Units, not lines: the bar moves on every scan.
 */

import { withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { productImageUrl } from '@/lib/photos/product-image-url';
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';
import { completeSession, openPickingSessionOn } from './sessions';
import {
  groupDirectedPickLines,
  type DirectedPickNext,
  type DirectedPickPlatformId,
  type DirectedPickUnitRow,
} from './directed-pick';

/** How long another picker's open session holds its order. */
export const HOLD_MINUTES = 60;

/** Ship-by inside this window paints the line as a rush. */
const RUSH_HOURS = 24;

interface CandidateRow {
  order_id: number;
  order_label: string | null;
  account_source: string | null;
  item_number: string | null;
  open_units: number;
  deadline_at: string | null;
  mine: boolean;
  rush: boolean;
}

interface UnitDbRow {
  allocation_id: number;
  serial_unit_id: number;
  serial_number: string | null;
  sku: string;
  condition_grade: string | null;
  zoho_item_title: string | null;
  catalog_product_title: string | null;
  zoho_item_id: string | null;
  zoho_image_document_id: string | null;
  catalog_image_url: string | null;
  location_name: string | null;
  location_barcode: string | null;
  location_room: string | null;
  raw_location: string | null;
  platforms: DirectedPickPlatformId[] | null;
}

/**
 * Orders with open units the picker may be fed, best first. `$1` org, `$2`
 * picker. Held orders (another picker, fresh open session) are excluded.
 */
const CANDIDATES_SQL = `
  WITH open_units AS (
    SELECT oua.order_id, COUNT(*)::int AS open_units
      FROM order_unit_allocations oua
     WHERE oua.organization_id = $1
       AND oua.state IN ('ALLOCATED', 'PICKING')
     GROUP BY oua.order_id
  )
  SELECT o.id                     AS order_id,
         o.order_id               AS order_label,
         o.account_source,
         o.item_number,
         ou.open_units,
         to_json(dl.deadline_at) #>> '{}' AS deadline_at,
         EXISTS (
           SELECT 1 FROM picking_sessions mine
            WHERE mine.order_id = o.id
              AND mine.picker_staff_id = $2
              AND mine.ended_at IS NULL
         )                        AS mine,
         COALESCE(dl.deadline_at <= NOW() + INTERVAL '${RUSH_HOURS} hours', false) AS rush
    FROM open_units ou
    JOIN orders o ON o.id = ou.order_id AND o.organization_id = $1
    -- The order's SLA, picked exactly as the orders feed picks it for the
    -- to-ship card (\`/api/orders\`): the TEST assignment, live status first.
    LEFT JOIN LATERAL (
      SELECT wa.deadline_at
        FROM work_assignments wa
       WHERE wa.entity_type = 'ORDER'
         AND wa.entity_id = o.id
         AND wa.work_type = 'TEST'
         AND wa.organization_id = o.organization_id
       ORDER BY CASE wa.status
                  WHEN 'IN_PROGRESS' THEN 1
                  WHEN 'ASSIGNED'    THEN 2
                  WHEN 'OPEN'        THEN 3
                  WHEN 'DONE'        THEN 4
                  ELSE 5
                END,
                wa.updated_at DESC,
                wa.id DESC
       LIMIT 1
    ) dl ON TRUE
   WHERE NOT EXISTS (
           SELECT 1 FROM picking_sessions held
            WHERE held.order_id = o.id
              AND held.picker_staff_id <> $2
              AND held.ended_at IS NULL
              AND held.started_at > NOW() - INTERVAL '${HOLD_MINUTES} minutes'
         )
   ORDER BY mine DESC, rush DESC, dl.deadline_at ASC NULLS LAST, o.id ASC`;

/** The chosen order's open units in walk order. `$1` org, `$2` order. */
const UNITS_SQL = `
  SELECT oua.id                   AS allocation_id,
         su.id                    AS serial_unit_id,
         su.serial_number,
         su.sku,
         su.condition_grade::text AS condition_grade,
         zi.name                  AS zoho_item_title,
         sc.product_title         AS catalog_product_title,
         zi.zoho_item_id,
         zi.image_document_id     AS zoho_image_document_id,
         sc.image_url             AS catalog_image_url,
         loc.name                 AS location_name,
         loc.barcode              AS location_barcode,
         loc.room                 AS location_room,
         CASE WHEN loc.id IS NULL THEN su.current_location END AS raw_location,
         COALESCE((
           SELECT json_agg(json_build_object(
                    'platformSku', spi.platform_sku,
                    'platformItemId', spi.platform_item_id
                  ) ORDER BY spi.platform)
             FROM sku_platform_ids spi
            WHERE spi.sku_catalog_id = sc.id
              AND spi.organization_id = sc.organization_id
              AND spi.is_active = true
              AND (spi.platform_sku IS NOT NULL OR spi.platform_item_id IS NOT NULL)
         ), '[]'::json)           AS platforms
    FROM order_unit_allocations oua
    JOIN serial_units su
      ON su.id = oua.serial_unit_id AND su.organization_id = oua.organization_id
    LEFT JOIN sku_catalog sc ON sc.sku = su.sku AND sc.organization_id = su.organization_id
    LEFT JOIN LATERAL (
      SELECT i.name, i.zoho_item_id, i.image_document_id
        FROM items i
       WHERE i.sku = su.sku AND i.organization_id = su.organization_id AND i.status = 'active'
       ORDER BY i.id
       LIMIT 1
    ) zi ON TRUE
    LEFT JOIN LATERAL (
      SELECT l.id, l.name, l.barcode, l.room, l.sort_order
        FROM locations l
       WHERE l.organization_id = su.organization_id
         AND (l.id::text = su.current_location OR l.name = su.current_location)
       ORDER BY (l.id::text = su.current_location) DESC
       LIMIT 1
    ) loc ON TRUE
   WHERE oua.organization_id = $1
     AND oua.order_id = $2
     AND oua.state IN ('ALLOCATED', 'PICKING')
   ORDER BY loc.sort_order ASC NULLS LAST,
            COALESCE(loc.name, su.current_location) ASC NULLS LAST,
            su.sku ASC,
            su.id ASC`;

function toUnitRow(row: UnitDbRow): DirectedPickUnitRow {
  return {
    allocationId: Number(row.allocation_id),
    serialUnitId: Number(row.serial_unit_id),
    serialNumber: row.serial_number?.trim() || null,
    sku: row.sku,
    title: resolveSkuIdentityTitle({
      zoho_item_title: row.zoho_item_title,
      catalog_product_title: row.catalog_product_title,
      sku: row.sku,
    }),
    imageUrl: productImageUrl({
      zohoItemId: row.zoho_item_id,
      zohoImageDocumentId: row.zoho_image_document_id,
      catalogImageUrl: row.catalog_image_url,
    }),
    conditionGrade: row.condition_grade,
    locationName: row.location_name,
    locationBarcode: row.location_barcode,
    locationRoom: row.location_room,
    rawLocation: row.raw_location,
    platforms: row.platforms ?? [],
  };
}

async function closeFinishedSessions(orgId: OrgId, staffId: number): Promise<string[]> {
  const finished = await withTenantTransaction(orgId, (client) =>
    client.query<{ id: string | number }>(
      `SELECT ps.id
         FROM picking_sessions ps
         JOIN orders o ON o.id = ps.order_id AND o.organization_id = $1
        WHERE ps.picker_staff_id = $2
          AND ps.ended_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM order_unit_allocations oua
             WHERE oua.order_id = ps.order_id
               AND oua.organization_id = $1
               AND oua.state IN ('ALLOCATED', 'PICKING')
          )`,
      [orgId, staffId],
    ),
  );
  const staged: string[] = [];
  for (const row of finished.rows) {
    const closed = await completeSession({ sessionId: Number(row.id), actorStaffId: staffId }, orgId);
    if (closed.ok) staged.push(...closed.stagedTotes);
  }
  return staged;
}

export async function nextDirectedPick(input: {
  orgId: OrgId;
  staffId: number;
  runStartedAt: string | null;
  deviceId: string | null;
}): Promise<DirectedPickNext> {
  const { orgId, staffId } = input;
  const stagedTotes = await closeFinishedSessions(orgId, staffId);

  return withTenantTransaction(orgId, async (client) => {
    // One claimer per org at a time: the candidate read and the session
    // insert below must not interleave with another phone's.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('picking.next:' || $1::text))`, [orgId]);

    const candidates = await client.query<CandidateRow>(CANDIDATES_SQL, [orgId, staffId]);
    const openTotal = candidates.rows.reduce((sum, row) => sum + Number(row.open_units), 0);

    const doneQ = input.runStartedAt
      ? await client.query<{ done: number }>(
          `SELECT COUNT(*)::int AS done
             FROM inventory_events
            WHERE organization_id = $1
              AND actor_staff_id = $2
              AND occurred_at >= $3::timestamptz
              AND payload->>'source' IN ('picking.confirm', 'picking.short_pick')`,
          [orgId, staffId, input.runStartedAt],
        )
      : null;
    const done = doneQ?.rows[0]?.done ?? 0;
    const progress = { done, total: done + openTotal };

    const pick = candidates.rows[0];
    if (!pick) return { sessionId: null, order: null, line: null, progress, stagedTotes };

    const session = await openPickingSessionOn(
      client,
      { orderId: pick.order_id, pickerStaffId: staffId, deviceId: input.deviceId },
      orgId,
    );
    if (!session.ok) throw new Error(session.error);

    const units = await client.query<UnitDbRow>(UNITS_SQL, [orgId, pick.order_id]);
    const lines = groupDirectedPickLines(pick.order_id, units.rows.map(toUnitRow));

    const tote = await client.query<{ code: string }>(
      `SELECT code FROM handling_units
        WHERE organization_id = $1 AND paired_order_id = $2 AND status = 'OPEN'
        ORDER BY paired_at DESC NULLS LAST, id DESC
        LIMIT 1`,
      [orgId, pick.order_id],
    );

    return {
      sessionId: session.sessionId,
      order: {
        orderId: pick.order_id,
        orderLabel: pick.order_label ? `#${pick.order_label}` : `#${pick.order_id}`,
        accountSource: pick.account_source?.trim() || null,
        itemNumber: pick.item_number?.trim() || null,
        deadlineAt: pick.deadline_at,
        rush: pick.rush,
        unitsRemaining: Number(pick.open_units),
        toteCode: tote.rows[0]?.code ?? null,
      },
      line: lines[0] ?? null,
      progress,
      stagedTotes,
    };
  });
}
