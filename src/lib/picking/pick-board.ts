/** Every order with open picks, with who each belongs to — the read the directed feed (`nextDirectedPick`) and the Unassigned board (`GET… */

import type { PoolClient } from 'pg';
import type { OrgId } from '@/lib/tenancy/constants';
import { productImageUrl } from '@/lib/photos/product-image-url';
import { resolveSkuIdentityTitle } from '@/lib/sku/sku-identity-law';
import { listStaffOutOnDate } from '@/lib/staff/staff-out-today';
import type { DirectedPickLocation, PickBoardRow, PickBoardScope } from './directed-pick';
import { resolvePickOwnership, toStaffRefs, type PickOwnership } from './pick-ownership';

/** How long another picker's open session holds its order. */
const HOLD_MINUTES = 60;

/** Ship-by inside this window paints the line as a rush. */
const RUSH_HOURS = 24;

/** Pick history older than this no longer makes someone a backup. */
const BACKUP_HISTORY_DAYS = 180;

interface CandidateDbRow {
  order_id: number;
  order_label: string | null;
  account_source: string | null;
  item_number: string | null;
  open_units: number;
  deadline_at: string | null;
  mine: boolean;
  rush: boolean;
  held_by_staff_id: number | null;
  assigned_staff_id: number | null;
  paired_staff_id: number | null;
  skus: string[] | null;
}

interface PickCandidate {
  orderId: number;
  orderLabel: string | null;
  accountSource: string | null;
  itemNumber: string | null;
  openUnits: number;
  deadlineAt: string | null;
  mine: boolean;
  rush: boolean;
  heldByStaffId: number | null;
  ownership: PickOwnership;
}

/**
 * Orders with open units, most urgent first. `$1` org, `$2` the asking picker
 * (for `mine` and for which holds are someone else's).
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
         COALESCE(dl.deadline_at <= NOW() + INTERVAL '${RUSH_HOURS} hours', false) AS rush,
         held.picker_staff_id     AS held_by_staff_id,
         pass.assigned_tech_id    AS assigned_staff_id,
         pair.staff_id            AS paired_staff_id,
         skus.skus
    FROM open_units ou
    JOIN orders o ON o.id = ou.order_id AND o.organization_id = $1
    -- The order's SLA, picked exactly as the orders feed picks it for the
    -- to-ship card (\`/api/orders\`): the TEST row (the order's deadline carrier), live status first.
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
    -- The picker slot: the live ORDER/PICK assignment's assignee (Pass / Take).
    LEFT JOIN LATERAL (
      SELECT wa.assigned_tech_id
        FROM work_assignments wa
       WHERE wa.entity_type = 'ORDER'
         AND wa.entity_id = o.id
         AND wa.work_type = 'PICK'
         AND wa.organization_id = o.organization_id
         AND wa.status IN ('ASSIGNED', 'IN_PROGRESS')
         AND wa.assigned_tech_id IS NOT NULL
       ORDER BY CASE wa.status WHEN 'ASSIGNED' THEN 1 ELSE 2 END,
                wa.id DESC
       LIMIT 1
    ) pass ON TRUE
    -- Another picker's fresh, open session: the claim.
    LEFT JOIN LATERAL (
      SELECT ps.picker_staff_id
        FROM picking_sessions ps
       WHERE ps.order_id = o.id
         AND ps.picker_staff_id <> $2
         AND ps.ended_at IS NULL
         AND ps.started_at > NOW() - INTERVAL '${HOLD_MINUTES} minutes'
       ORDER BY ps.started_at DESC
       LIMIT 1
    ) held ON TRUE
    -- The SKU owner holding the most of this order's open units.
    LEFT JOIN LATERAL (
      SELECT sp.staff_id
        FROM order_unit_allocations a
        JOIN serial_units su ON su.id = a.serial_unit_id AND su.organization_id = a.organization_id
        JOIN sku_staff_pairings sp ON sp.organization_id = a.organization_id AND sp.sku = su.sku
       WHERE a.order_id = o.id
         AND a.organization_id = $1
         AND a.state IN ('ALLOCATED', 'PICKING')
       GROUP BY sp.staff_id
       ORDER BY COUNT(*) DESC, sp.staff_id ASC
       LIMIT 1
    ) pair ON TRUE
    LEFT JOIN LATERAL (
      SELECT array_agg(DISTINCT su.sku) AS skus
        FROM order_unit_allocations a
        JOIN serial_units su ON su.id = a.serial_unit_id AND su.organization_id = a.organization_id
       WHERE a.order_id = o.id
         AND a.organization_id = $1
         AND a.state IN ('ALLOCATED', 'PICKING')
    ) skus ON TRUE
   ORDER BY rush DESC, dl.deadline_at ASC NULLS LAST, o.id ASC`;

/** Confirmed picks per (SKU, picker), newest-weighted. `$1` org, `$2` SKUs. */
const HISTORY_SQL = `
  SELECT ie.sku, ie.actor_staff_id AS staff_id, COUNT(*)::int AS picks, MAX(ie.occurred_at) AS last_at
    FROM inventory_events ie
   WHERE ie.organization_id = $1
     AND ie.sku = ANY($2::text[])
     AND ie.event_type = 'PICKED'
     AND ie.payload->>'source' = 'picking.confirm'
     AND ie.actor_staff_id IS NOT NULL
     AND ie.occurred_at > NOW() - INTERVAL '${BACKUP_HISTORY_DAYS} days'
   GROUP BY ie.sku, ie.actor_staff_id`;

/** Active staff on the picker roster, stable order. `$1` org. */
const ROSTER_SQL = `
  SELECT s.id
    FROM staff s
    JOIN staff_functional_roles r ON r.staff_id = s.id AND r.organization_id = s.organization_id
   WHERE s.organization_id = $1
     AND s.active IS TRUE
     AND r.role_key = 'picker'
   ORDER BY s.id ASC`;

type Queryable = Pick<PoolClient, 'query'>;

/** Rank history pickers across an order's SKUs: most picks, then most recent. */
function rankHistory(
  skus: readonly string[],
  history: ReadonlyMap<string, ReadonlyArray<{ staffId: number; picks: number; lastAt: number }>>,
): number[] {
  const tally = new Map<number, { picks: number; lastAt: number }>();
  for (const sku of skus) {
    for (const row of history.get(sku) ?? []) {
      const prev = tally.get(row.staffId) ?? { picks: 0, lastAt: 0 };
      tally.set(row.staffId, { picks: prev.picks + row.picks, lastAt: Math.max(prev.lastAt, row.lastAt) });
    }
  }
  return [...tally.entries()]
    .sort((a, b) => b[1].picks - a[1].picks || b[1].lastAt - a[1].lastAt || a[0] - b[0])
    .map(([staffId]) => staffId);
}

export async function loadPickCandidates(
  client: Queryable,
  orgId: OrgId,
  staffId: number,
): Promise<PickCandidate[]> {
  const rows = (await client.query<CandidateDbRow>(CANDIDATES_SQL, [orgId, staffId])).rows;
  if (rows.length === 0) return [];

  const allSkus = [...new Set(rows.flatMap((row) => row.skus ?? []))];
  const [historyQ, rosterQ] = await Promise.all([
    allSkus.length
      ? client.query<{ sku: string; staff_id: number; picks: number; last_at: string }>(HISTORY_SQL, [orgId, allSkus])
      : Promise.resolve({ rows: [] as { sku: string; staff_id: number; picks: number; last_at: string }[] }),
    client.query<{ id: number }>(ROSTER_SQL, [orgId]),
  ]);
  const history = new Map<string, { staffId: number; picks: number; lastAt: number }[]>();
  for (const row of historyQ.rows) {
    const list = history.get(row.sku) ?? [];
    list.push({ staffId: Number(row.staff_id), picks: Number(row.picks), lastAt: Date.parse(row.last_at) || 0 });
    history.set(row.sku, list);
  }
  const roster = rosterQ.rows.map((row) => Number(row.id));

  const inputs = rows.map((row) => ({
    assignedStaffId: row.assigned_staff_id == null ? null : Number(row.assigned_staff_id),
    pairedStaffId: row.paired_staff_id == null ? null : Number(row.paired_staff_id),
    backupCandidates: [...rankHistory(row.skus ?? [], history), ...roster],
  }));
  const involved = inputs.flatMap((input) => [
    ...(input.assignedStaffId != null ? [input.assignedStaffId] : []),
    ...(input.pairedStaffId != null ? [input.pairedStaffId] : []),
    ...input.backupCandidates,
  ]);
  const outToday = await listStaffOutOnDate(orgId, involved, { client });

  return rows.map((row, i) => ({
    orderId: Number(row.order_id),
    orderLabel: row.order_label,
    accountSource: row.account_source?.trim() || null,
    itemNumber: row.item_number?.trim() || null,
    openUnits: Number(row.open_units),
    deadlineAt: row.deadline_at,
    mine: Boolean(row.mine),
    rush: Boolean(row.rush),
    heldByStaffId: row.held_by_staff_id == null ? null : Number(row.held_by_staff_id),
    ownership: resolvePickOwnership(inputs[i], outToday),
  }));
}

export async function loadStaffNames(client: Queryable, orgId: OrgId, ids: readonly number[]): Promise<Map<number, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const q = await client.query<{ id: number; name: string | null }>(
    `SELECT id, name FROM staff WHERE organization_id = $1 AND id = ANY($2::int[])`,
    [orgId, unique],
  );
  return new Map(q.rows.map((row) => [Number(row.id), row.name?.trim() || `Staff #${row.id}`]));
}

export function orderLabelOf(candidate: Pick<PickCandidate, 'orderId' | 'orderLabel'>): string {
  return candidate.orderLabel ? `#${candidate.orderLabel}` : `#${candidate.orderId}`;
}

/** First open unit per order in walk order — the board row's product and bin. */
const FIRST_UNITS_SQL = `
  SELECT DISTINCT ON (oua.order_id)
         oua.order_id,
         su.sku,
         zi.name                  AS zoho_item_title,
         sc.product_title         AS catalog_product_title,
         zi.zoho_item_id,
         zi.image_document_id     AS zoho_image_document_id,
         sc.image_url             AS catalog_image_url,
         loc.name                 AS location_name,
         loc.barcode              AS location_barcode,
         loc.room                 AS location_room,
         CASE WHEN loc.id IS NULL THEN su.current_location END AS raw_location
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
     AND oua.order_id = ANY($2::int[])
     AND oua.state IN ('ALLOCATED', 'PICKING')
   ORDER BY oua.order_id,
            loc.sort_order ASC NULLS LAST,
            COALESCE(loc.name, su.current_location) ASC NULLS LAST,
            su.sku ASC,
            su.id ASC`;

interface FirstUnitRow {
  order_id: number;
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
}

/**
 * The Unassigned board. `unassigned` = orders nobody owns (and nobody else is
 * holding); `all` = every order with open picks, owner and holder named.
 */
export async function loadPickBoard(
  client: Queryable,
  orgId: OrgId,
  staffId: number,
  scope: PickBoardScope,
): Promise<PickBoardRow[]> {
  const candidates = (await loadPickCandidates(client, orgId, staffId)).filter(
    (c) => scope === 'all' || (c.ownership.owner == null && c.heldByStaffId == null),
  );
  if (candidates.length === 0) return [];

  const firstQ = await client.query<FirstUnitRow>(FIRST_UNITS_SQL, [orgId, candidates.map((c) => c.orderId)]);
  const first = new Map(firstQ.rows.map((row) => [Number(row.order_id), row]));
  const names = await loadStaffNames(
    client,
    orgId,
    candidates.flatMap((c) => [
      ...(c.ownership.owner ? [c.ownership.owner.staffId] : []),
      ...c.ownership.backups,
      ...(c.heldByStaffId != null ? [c.heldByStaffId] : []),
    ]),
  );

  return candidates.map((c) => {
    const unit = first.get(c.orderId);
    const location: DirectedPickLocation | null =
      unit && (unit.location_barcode || unit.location_name || unit.raw_location)
        ? {
            name: unit.location_name ?? (unit.location_barcode ? null : unit.raw_location),
            barcode: unit.location_barcode,
            room: unit.location_room,
          }
        : null;
    const owner = c.ownership.owner;
    return {
      orderId: c.orderId,
      orderLabel: orderLabelOf(c),
      accountSource: c.accountSource,
      deadlineAt: c.deadlineAt,
      rush: c.rush,
      openUnits: c.openUnits,
      title: unit
        ? resolveSkuIdentityTitle({
            zoho_item_title: unit.zoho_item_title,
            catalog_product_title: unit.catalog_product_title,
            sku: unit.sku,
          })
        : 'Unknown product',
      imageUrl: unit
        ? productImageUrl({
            zohoItemId: unit.zoho_item_id,
            zohoImageDocumentId: unit.zoho_image_document_id,
            catalogImageUrl: unit.catalog_image_url,
          })
        : null,
      location,
      owner: owner ? { staffId: owner.staffId, name: names.get(owner.staffId) ?? null, via: owner.via } : null,
      backups: toStaffRefs(c.ownership.backups, names),
      heldBy: c.heldByStaffId != null ? { staffId: c.heldByStaffId, name: names.get(c.heldByStaffId) ?? null } : null,
    };
  });
}
