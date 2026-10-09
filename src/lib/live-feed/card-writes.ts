/**
 * The ONE writer of `live_feed_flags` and `live_feed_dismissals`
 * (`2026-10-09_live_feed_flags_and_dismissals.sql`). Every call takes Live
 * feed card ids (`subjects.ts`) and runs in the caller's tenant transaction;
 * every statement names the org, and a card id the org does not hold writes
 * nothing. Returns the card ids that changed.
 */

import 'server-only';
import type { PoolClient } from 'pg';
import { cardSubject, unlinkedScanId } from '@/lib/live-feed/subjects';
import type { OrgId } from '@/lib/tenancy/constants';

type Tx = Pick<PoolClient, 'query'>;

/** The board's key for an unmatched dock scan: its text, upper-cased; `#<id>` when it carried none (`load.ts` groups the same way). */
export const SCAN_KEY_SQL = (sal: string) => `COALESCE(UPPER(NULLIF(BTRIM(${sal}.scan_ref), '')), '#' || ${sal}.id::text)`;

interface Subjects {
  orders: number[];
  shipments: number[];
  /** scan key → the card id that named it. */
  scans: Map<string, number>;
}

/** Split card ids by subject; scan ids resolve to their scan key (org-scoped, dock scan-outs only). */
async function resolveSubjects(tx: Tx, orgId: OrgId, cardIds: readonly number[]): Promise<Subjects> {
  const orders: number[] = [];
  const shipments: number[] = [];
  const scanIds: number[] = [];
  for (const id of new Set(cardIds)) {
    const subject = cardSubject(id);
    if (subject?.kind === 'order') orders.push(subject.orderId);
    else if (subject?.kind === 'package') shipments.push(subject.shipmentId);
    else if (subject?.kind === 'scan') scanIds.push(subject.scanId);
  }
  const scans = new Map<string, number>();
  if (scanIds.length > 0) {
    const { rows } = await tx.query<{ id: string | number; scan_key: string }>(
      `SELECT sal.id, ${SCAN_KEY_SQL('sal')} AS scan_key
         FROM station_activity_logs sal
        WHERE sal.organization_id = $1 AND sal.id = ANY($2::bigint[]) AND sal.activity_type = 'SHIP_CONFIRM'`,
      [orgId, scanIds],
    );
    for (const row of rows) scans.set(row.scan_key, unlinkedScanId(Number(row.id)));
  }
  return { orders, shipments, scans };
}

/** Card ids back from the subjects a statement returned. */
function changedCards(subjects: Subjects, rows: Array<{ order_id: number | null; shipment_id: string | number | null; scan_key: string | null }>): number[] {
  return rows.map((row) =>
    row.order_id != null
      ? Number(row.order_id)
      : row.shipment_id != null
        ? -Number(row.shipment_id)
        : (subjects.scans.get(row.scan_key ?? '') ?? 0),
  );
}

interface FlagArgs {
  orgId: OrgId;
  cardIds: readonly number[];
  reason: string;
  note: string | null;
  staffId: number | null;
}

/** Flag the cards with `reason`. A card already holding that reason keeps its first flag. */
export async function addLiveFeedFlags(tx: Tx, args: FlagArgs): Promise<number[]> {
  const subjects = await resolveSubjects(tx, args.orgId, args.cardIds);
  const common = [args.orgId, args.reason, args.note, args.staffId];
  const returning = 'RETURNING order_id, shipment_id, scan_key';
  const rows = [
    ...(subjects.orders.length === 0
      ? []
      : (
          await tx.query(
            `INSERT INTO live_feed_flags (organization_id, order_id, reason, note, flagged_by_staff_id)
             SELECT $1, o.id, $2, $3, $4 FROM orders o WHERE o.organization_id = $1 AND o.id = ANY($5::int[])
             ON CONFLICT (organization_id, order_id, reason) WHERE cleared_at IS NULL AND order_id IS NOT NULL DO NOTHING
             ${returning}`,
            [...common, subjects.orders],
          )
        ).rows),
    ...(subjects.shipments.length === 0
      ? []
      : (
          await tx.query(
            `INSERT INTO live_feed_flags (organization_id, shipment_id, reason, note, flagged_by_staff_id)
             SELECT $1, stn.id, $2, $3, $4 FROM shipping_tracking_numbers stn WHERE stn.organization_id = $1 AND stn.id = ANY($5::bigint[])
             ON CONFLICT (organization_id, shipment_id, reason) WHERE cleared_at IS NULL AND shipment_id IS NOT NULL DO NOTHING
             ${returning}`,
            [...common, subjects.shipments],
          )
        ).rows),
    ...(subjects.scans.size === 0
      ? []
      : (
          await tx.query(
            `INSERT INTO live_feed_flags (organization_id, scan_key, reason, note, flagged_by_staff_id)
             SELECT $1, k, $2, $3, $4 FROM unnest($5::text[]) k
             ON CONFLICT (organization_id, scan_key, reason) WHERE cleared_at IS NULL AND scan_key IS NOT NULL DO NOTHING
             ${returning}`,
            [...common, [...subjects.scans.keys()]],
          )
        ).rows),
  ];
  return changedCards(subjects, rows);
}

/** Clear the cards' active flags — one reason, or every reason when `reason` is null. */
export async function clearLiveFeedFlags(
  tx: Tx,
  args: { orgId: OrgId; cardIds: readonly number[]; reason: string | null; staffId: number | null },
): Promise<number[]> {
  const subjects = await resolveSubjects(tx, args.orgId, args.cardIds);
  const { rows } = await tx.query(
    `UPDATE live_feed_flags
        SET cleared_at = now(), cleared_by_staff_id = $2
      WHERE organization_id = $1
        AND cleared_at IS NULL
        AND ($3::text IS NULL OR reason = $3)
        AND (order_id = ANY($4::int[]) OR shipment_id = ANY($5::bigint[]) OR scan_key = ANY($6::text[]))
      RETURNING order_id, shipment_id, scan_key`,
    [args.orgId, args.staffId, args.reason, subjects.orders, subjects.shipments, [...subjects.scans.keys()]],
  );
  return [...new Set(changedCards(subjects, rows))];
}

/** Take unlinked cards off the board. Order cards are ignored (they leave through `order_list_removals`). */
export async function dismissUnlinkedCards(
  tx: Tx,
  args: { orgId: OrgId; cardIds: readonly number[]; reason: string; note: string | null; staffId: number | null },
): Promise<number[]> {
  const subjects = await resolveSubjects(tx, args.orgId, args.cardIds);
  const common = [args.orgId, args.reason, args.note, args.staffId];
  const rows = [
    ...(subjects.shipments.length === 0
      ? []
      : (
          await tx.query(
            `INSERT INTO live_feed_dismissals (organization_id, shipment_id, reason, note, dismissed_by_staff_id)
             SELECT $1, stn.id, $2, $3, $4 FROM shipping_tracking_numbers stn WHERE stn.organization_id = $1 AND stn.id = ANY($5::bigint[])
             ON CONFLICT (organization_id, shipment_id) WHERE restored_at IS NULL AND shipment_id IS NOT NULL DO NOTHING
             RETURNING NULL::int AS order_id, shipment_id, scan_key`,
            [...common, subjects.shipments],
          )
        ).rows),
    ...(subjects.scans.size === 0
      ? []
      : (
          await tx.query(
            `INSERT INTO live_feed_dismissals (organization_id, scan_key, reason, note, dismissed_by_staff_id)
             SELECT $1, k, $2, $3, $4 FROM unnest($5::text[]) k
             ON CONFLICT (organization_id, scan_key) WHERE restored_at IS NULL AND scan_key IS NOT NULL DO NOTHING
             RETURNING NULL::int AS order_id, shipment_id, scan_key`,
            [...common, [...subjects.scans.keys()]],
          )
        ).rows),
  ];
  return changedCards(subjects, rows);
}

/** Put dismissed unlinked cards back (undo). */
export async function restoreUnlinkedCards(
  tx: Tx,
  args: { orgId: OrgId; cardIds: readonly number[]; staffId: number | null },
): Promise<number[]> {
  const subjects = await resolveSubjects(tx, args.orgId, args.cardIds);
  const { rows } = await tx.query(
    `UPDATE live_feed_dismissals
        SET restored_at = now(), restored_by_staff_id = $2
      WHERE organization_id = $1
        AND restored_at IS NULL
        AND (shipment_id = ANY($3::bigint[]) OR scan_key = ANY($4::text[]))
      RETURNING NULL::int AS order_id, shipment_id, scan_key`,
    [args.orgId, args.staffId, subjects.shipments, [...subjects.scans.keys()]],
  );
  return changedCards(subjects, rows);
}

/** A pair moved a box or scan onto an order: its active flags follow it (a reason the order already holds stays on the order's own row). */
export async function moveLiveFeedFlagsToOrder(
  tx: Tx,
  args: { orgId: OrgId; shipmentId: number | null; scanKey: string | null; orderId: number },
): Promise<void> {
  await tx.query(
    `UPDATE live_feed_flags f
        SET order_id = $2, shipment_id = NULL, scan_key = NULL
      WHERE f.organization_id = $1
        AND f.cleared_at IS NULL
        AND (f.shipment_id = $3::bigint OR f.scan_key = $4::text)
        AND NOT EXISTS (
          SELECT 1 FROM live_feed_flags o
           WHERE o.organization_id = $1 AND o.order_id = $2 AND o.reason = f.reason AND o.cleared_at IS NULL
        )`,
    [args.orgId, args.orderId, args.shipmentId, args.scanKey],
  );
}
