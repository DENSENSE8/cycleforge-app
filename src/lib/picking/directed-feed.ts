/** Directed picking feed — `POST /api/picking/next`. */

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
import { loadPickCandidates, loadStaffNames, orderLabelOf } from './pick-board';
import { pickEligibleFor, pickFeedTier, toStaffRefs } from './pick-ownership';

interface UnitDbRow {
  allocation_id: number;
  serial_unit_id: number;
  serial_number: string | null;
  sku: string;
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

/** The chosen order's open units in walk order. `$1` org, `$2` order. */
const UNITS_SQL = `
  SELECT oua.id                   AS allocation_id,
         su.id                    AS serial_unit_id,
         su.serial_number,
         su.sku,
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
  /** Orders the picker skipped this run — never fed back to them. */
  skipOrderIds?: readonly number[];
}): Promise<DirectedPickNext> {
  const { orgId, staffId } = input;
  const skipped = new Set(input.skipOrderIds ?? []);
  const stagedTotes = await closeFinishedSessions(orgId, staffId);

  return withTenantTransaction(orgId, async (client) => {
    // One claimer per org at a time: the candidate read and the session
    // insert below must not interleave with another phone's.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('picking.next:' || $1::text))`, [orgId]);

    const candidates = await loadPickCandidates(client, orgId, staffId);
    const unassignedCount = candidates.filter((c) => c.ownership.owner == null && c.heldByStaffId == null).length;
    const eligible = candidates
      .filter((c) => !skipped.has(c.orderId) && pickEligibleFor(staffId, { ...c, heldByOther: c.heldByStaffId != null }))
      .map((c, index) => ({ c, index, tier: pickFeedTier(staffId, c) }))
      .sort((a, b) => a.tier - b.tier || a.index - b.index)
      .map(({ c }) => c);
    const openTotal = eligible.reduce((sum, c) => sum + c.openUnits, 0);

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

    const pick = eligible[0];
    if (!pick) return { sessionId: null, order: null, line: null, progress, stagedTotes, unassignedCount };

    const session = await openPickingSessionOn(
      client,
      { orderId: pick.orderId, pickerStaffId: staffId, deviceId: input.deviceId },
      orgId,
    );
    if (!session.ok) throw new Error(session.error);

    const units = await client.query<UnitDbRow>(UNITS_SQL, [orgId, pick.orderId]);
    const lines = groupDirectedPickLines(pick.orderId, units.rows.map(toUnitRow));

    const tote = await client.query<{ code: string }>(
      `SELECT code FROM handling_units
        WHERE organization_id = $1 AND paired_order_id = $2 AND status = 'OPEN'
        ORDER BY paired_at DESC NULLS LAST, id DESC
        LIMIT 1`,
      [orgId, pick.orderId],
    );

    const owner = pick.ownership.owner;
    const names = await loadStaffNames(client, orgId, [...(owner ? [owner.staffId] : []), ...pick.ownership.backups]);

    return {
      sessionId: session.sessionId,
      order: {
        orderId: pick.orderId,
        orderLabel: orderLabelOf(pick),
        accountSource: pick.accountSource,
        itemNumber: pick.itemNumber,
        deadlineAt: pick.deadlineAt,
        rush: pick.rush,
        unitsRemaining: pick.openUnits,
        toteCode: tote.rows[0]?.code ?? null,
        owner: owner ? { staffId: owner.staffId, name: names.get(owner.staffId) ?? null, via: owner.via } : null,
        backups: toStaffRefs(pick.ownership.backups, names),
      },
      line: lines[0] ?? null,
      progress,
      stagedTotes,
      unassignedCount,
    };
  });
}
