/**
 * The Live feed's reads — the outbound package board.
 *
 * Membership is Allocate's, verbatim: the To-ship scope
 * (`sqlOrderInWarehouseToShip`) split by `sqlOrderDeskStage` over the
 * `order_stage_facts` signals — pending → To pick, picked, packed — minus the
 * in-person orders (counter pickups and Square sales: no box leaves the dock).
 * Scanned out = EVERY package whose FIRST dock SHIP_CONFIRM falls today (the
 * warehouse day), linked or not (operator 2026-10-06: the board shows what the
 * database holds, however ugly): one card per order that owns the box (its
 * `shipment_id` or a `shipment_links` ORDER row), else ONE card for the box
 * itself (`link = 'package'`), else — a scan that never resolved to a package
 * — one card for the scan (`link = 'scan'`). Unlinked cards carry a negative
 * synthetic id ({@link unlinkedPackageId} / {@link unlinkedScanId}).
 *
 * The board is counts for every stage plus the first page of each; a column's
 * later pages come one at a time (`loadLiveFeedLane`). Cards carry their
 * comment count, tags, box mates and stall flag (`order_notes`, `order_tags`,
 * shared `shipment_id`, `PACKAGE_STALL_HOURS`). The sidebar's carrier /
 * channel facets and staff filter narrow every read through ONE member set
 * (`MEMBERS_SQL`), which also counts the facets (`loadLiveFeedFacets`).
 * `loadLiveFeedPackages` / `findLiveFeedPackages` open what a deep link or a
 * scan names, inside the board's scope.
 */

import 'server-only';
import { lineCondition, linePrice } from '@/lib/orders/order-card-model';
import {
  sqlDeskAgingBucket,
  sqlOrderAssignedToStaff,
  sqlOrderDeskStage,
  sqlOrderInWarehouseToShip,
  sqlOrderTestDeadlineAt,
} from '@/lib/orders/desk-view-sql';
import { ORDER_STAGE_FACTS_JOIN, ORDER_STAGE_FACTS_SIGNALS } from '@/lib/orders/order-stage-facts';
import { PACK_ACTIVITY_TYPES, sqlInList } from '@/lib/station-activity';
import { G3_LABEL_EXISTS_SQL } from '@/lib/orders/caged-orders';
import {
  G2_LINKED_DOCUMENT_EXISTS_SQL,
  G2_PRODUCT_PAPERWORK_EXISTS_SQL,
  G2_SKU_PAPERWORK_NOT_REQUIRED_SQL,
} from '@/lib/orders/g2-paperwork-sql';
import { PICKUP_FULFILLMENT_CHANNEL } from '@/lib/orders/release-gates';
import { orderLineImageSql } from '@/lib/photos/order-line-image-sql';
import { sqlIdentifierEqualsQuery } from '@/lib/search/order-number-match';
import { sqlTrackingNumberMatches } from '@/lib/search/order-tracking-match-sql';
import { resolveSkuIdentityTitle, skuCatalogJoinOnSql } from '@/lib/sku/sku-identity-law';
import { sourcePlatformMeta, UNKNOWN_PLATFORM } from '@/lib/source-platform';
import { tenantQueryOneTrip } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { orderTrackingMatchKeys } from '@/lib/tracking-format';
import { addDaysToDateKey, getCurrentPSTDateKey, WAREHOUSE_TIME_ZONE, warehouseDayUtcBounds } from '@/utils/date';
import { loadPickupCutoffsForDay } from '@/lib/live-feed/pickup-cutoffs';
import { LIVE_FEED_PAGE_SIZE, type LiveFeedFilters } from '@/lib/live-feed/route';
import {
  PACKAGE_STAGES,
  PACKAGE_STALL_HOURS,
  resolvePackageSorts,
  type PackageSort,
  type PackageSorts,
  type PackageStage,
} from '@/lib/live-feed/stages';
import type {
  CarrierLoad,
  LiveFeedFacets,
  PackageBoard,
  PackageCard,
  PackageColumn,
  PackageLanePage,
  PackageLink,
  PackagePaperwork,
  PackageUrgency,
  PickupCountdown,
} from '@/lib/live-feed/types';
import { placedElseImportedSql } from '@/lib/orders/order-dates';

/**
 * The statements' binds — ONE list for every read (an unreferenced bind is
 * fine): `$1` org; `$2`/`$3` today `[from, to)`; `$4` yesterday's start;
 * `$5` page size + 1; `$6` page offset; `$7` carrier keys / `$8` channel
 * keys (text[], NULL = all); `$9` staff id (NULL = everyone); `$10` order
 * row ids (int[], NULL = the whole board).
 */
const ORG = '$1';
const FROM = '$2';
const TO = '$3';
const PREV_FROM = '$4';
const LIMIT = '$5';
const OFFSET = '$6';
const CARRIERS = '$7';
const CHANNELS = '$8';
const STAFF = '$9';
const IDS = '$10';

/** A counter pickup or a Square walk-in sale — handed over in person, never scanned out. Null-safe, so `NOT` of it keeps a NULL channel. */
const IN_PERSON_SQL = `(COALESCE(o.fulfillment_channel, '') = '${PICKUP_FULFILLMENT_CHANNEL}' OR LOWER(BTRIM(COALESCE(o.account_source, ''))) = 'square')`;

/** Allocate's stage partition, read off the joined `osf` facts. */
const OPEN_STAGE_SQL = `CASE
          WHEN ${sqlOrderDeskStage('packed', 'o', ORDER_STAGE_FACTS_SIGNALS)} THEN 'packed'
          WHEN ${sqlOrderDeskStage('picked', 'o', ORDER_STAGE_FACTS_SIGNALS)} THEN 'picked'
          ELSE 'to_pick'
        END`;

const ORDERED_AT_SQL = placedElseImportedSql('o');
const PACKED_AT_SQL = 'COALESCE(osf.pack_activity_at, osf.packed_at)';

/** Facet keys — the sidebar's `carrier` / `channel` values (`readLiveFeedFilters` normalizes the URL the same way). */
const CARRIER_KEY_SQL = `NULLIF(UPPER(BTRIM(stn.carrier)), '')`;
const CHANNEL_KEY_SQL = `NULLIF(LOWER(BTRIM(o.account_source)), '')`;

/**
 * The staff filter: the staffer holds a live pick / pack assignment on the
 * order, picked it or packed it (`extra` adds the stage's own hand).
 */
function staffOkSql(extra = ''): string {
  return `(${STAFF}::int IS NULL
           OR osf.picked_by = ${STAFF}::int
           OR COALESCE(osf.pack_activity_by, osf.packed_by) = ${STAFF}::int${extra}
           OR ${sqlOrderAssignedToStaff(STAFF)})`;
}

const IDS_OK_SQL = `(${IDS}::int[] IS NULL OR o.id = ANY(${IDS}::int[]))`;

/**
 * The card's order has a shipping label — what the print popover's label slot
 * counts (Labels & docs packets): a linked label document (G3,
 * `G3_LABEL_EXISTS_SQL`) or a stored label file matched to it and not held, on
 * ANY line of the order number. The inner `o` shadows the card's row on purpose
 * (G3 is written over alias `o`); `cur` carries the card's own keys in.
 */
const CARD_LABEL_LINKED_SQL = `(o.id IS NOT NULL AND EXISTS (
      SELECT 1
        FROM (SELECT o.id AS id, o.order_id AS ref, o.organization_id AS org) cur
        JOIN orders o
          ON o.organization_id = cur.org
         AND (o.id = cur.id OR (NULLIF(cur.ref, '') IS NOT NULL AND o.order_id = cur.ref))
       WHERE ${G3_LABEL_EXISTS_SQL}
          OR EXISTS (
            SELECT 1 FROM label_ingestions li
             WHERE li.organization_id = o.organization_id AND li.matched_order_id = o.id
               AND li.staged_object_key IS NOT NULL
               AND COALESCE(li.state, '') NOT IN ('QUARANTINED', 'FAILED')
          )
    ))`;


/**
 * Every carrier order still in the building, with its stage, the instant it
 * entered that stage, its ship-by and its facet keys. A stage fact with no
 * instant falls back to the step before it. A box a pack scan touched but no
 * order carries (an import that never matched) is still in the building, so
 * its pack is a card too — `link='package'`, keyed by the negative shipment id
 * (the unlinked scan-out convention), held to a 30-day pack window so the
 * historical tail cannot drown the lane.
 */
const OPEN_MEMBERS_CTE = `m_open AS MATERIALIZED (
    SELECT o.id AS order_row_id,
           s.stage,
           CASE s.stage
             WHEN 'packed' THEN COALESCE(${PACKED_AT_SQL}, osf.picked_at, ${ORDERED_AT_SQL})
             WHEN 'picked' THEN COALESCE(osf.picked_at, ${ORDERED_AT_SQL})
             ELSE ${ORDERED_AT_SQL}
           END AS entered_at,
           dl.deadline_at,
           NULL::timestamptz AS scanned_out_at,
           NULL::int AS scanned_out_by,
           ${CARRIER_KEY_SQL} AS carrier_key,
           ${CHANNEL_KEY_SQL} AS channel_key,
           ${staffOkSql()} AS staff_ok,
           o.shipment_id::bigint AS shipment_id,
           NULL::text AS scan_ref,
           'order'::text AS link
      FROM orders o
      LEFT JOIN shipping_tracking_numbers stn ON stn.id = o.shipment_id
      ${ORDER_STAGE_FACTS_JOIN}
      CROSS JOIN LATERAL (SELECT ${OPEN_STAGE_SQL} AS stage) s
      LEFT JOIN LATERAL (SELECT ${sqlOrderTestDeadlineAt('o')} AS deadline_at) dl ON TRUE
     WHERE o.organization_id = ${ORG}
       AND ${sqlOrderInWarehouseToShip('o')}
       AND NOT ${IN_PERSON_SQL}
       AND ${IDS_OK_SQL}
    UNION ALL
    SELECT (-ps.shipment_id)::bigint AS order_row_id,
           'packed'::text AS stage,
           ps.packed_at AS entered_at,
           NULL::timestamptz AS deadline_at,
           NULL::timestamptz AS scanned_out_at,
           NULL::int AS scanned_out_by,
           NULLIF(UPPER(BTRIM(stn.carrier)), '') AS carrier_key,
           NULL::text AS channel_key,
           (${STAFF}::int IS NULL OR ps.packed_by = ${STAFF}::int) AS staff_ok,
           ps.shipment_id::bigint AS shipment_id,
           NULL::text AS scan_ref,
           'package'::text AS link
      FROM (
        SELECT sal.shipment_id::bigint AS shipment_id,
               MIN(sal.created_at) AS packed_at,
               (array_agg(sal.staff_id ORDER BY sal.created_at, sal.id) FILTER (WHERE sal.staff_id > 0))[1]::int AS packed_by
          FROM station_activity_logs sal
         WHERE sal.organization_id = ${ORG}
           AND sal.activity_type IN (${sqlInList(PACK_ACTIVITY_TYPES)})
           AND sal.shipment_id IS NOT NULL
           AND sal.created_at >= now() - interval '30 days'
         GROUP BY 1
      ) ps
      JOIN shipping_tracking_numbers stn ON stn.id = ps.shipment_id AND stn.organization_id = ${ORG}
     WHERE NOT EXISTS (SELECT 1 FROM orders o0 WHERE o0.organization_id = ${ORG} AND o0.shipment_id = ps.shipment_id)
       AND NOT EXISTS (
         SELECT 1 FROM shipment_links sl
          WHERE sl.organization_id = ${ORG} AND sl.owner_type = 'ORDER' AND sl.shipment_id = ps.shipment_id
       )
       AND NOT EXISTS (
         SELECT 1 FROM station_activity_logs sout
          WHERE sout.organization_id = ${ORG}
            AND sout.activity_type = 'SHIP_CONFIRM'
            AND sout.shipment_id = ps.shipment_id
       )
       AND (${IDS}::int[] IS NULL OR -ps.shipment_id = ANY(${IDS}::int[]))
  )`;

/** Synthetic card ids for a scan-out no order owns — negative, so they never collide with `orders.id`. */
const UNLINKED_SCAN_ID_BASE = 1_000_000_000;
export const unlinkedPackageId = (shipmentId: number): number => -shipmentId;
export const unlinkedScanId = (scanId: number): number => -(UNLINKED_SCAN_ID_BASE + scanId);

/**
 * Packages whose FIRST dock scan-out falls in `[fromRef, toRef)` — a re-scan
 * of a box that already left does not bring it back. The scan-out's staffer is
 * the first staffed scan.
 */
function scannedOutShipmentsCte(name: string, fromRef: string, toRef: string): string {
  return `${name} AS MATERIALIZED (
    SELECT sal.shipment_id::bigint AS shipment_id,
           NULL::bigint AS scan_id,
           NULL::text AS scan_ref,
           MIN(sal.created_at) AS scanned_out_at,
           (array_agg(sal.staff_id ORDER BY sal.created_at, sal.id) FILTER (WHERE sal.staff_id > 0))[1]::int AS scanned_out_by
      FROM station_activity_logs sal
     WHERE sal.organization_id = ${ORG}
       AND sal.activity_type = 'SHIP_CONFIRM'
       AND sal.shipment_id IS NOT NULL
       AND sal.created_at >= ${fromRef}::timestamptz
       AND sal.created_at < ${toRef}::timestamptz
       AND NOT EXISTS (
         SELECT 1 FROM station_activity_logs sal_prior
          WHERE sal_prior.organization_id = ${ORG}
            AND sal_prior.activity_type = 'SHIP_CONFIRM'
            AND sal_prior.shipment_id = sal.shipment_id
            AND sal_prior.created_at < ${fromRef}::timestamptz
       )
     GROUP BY 1
    UNION ALL
    -- A scan-out that never resolved to a package: one row per scanned text, its first scan in the window.
    SELECT NULL::bigint,
           MIN(sal.id)::bigint,
           MIN(NULLIF(BTRIM(sal.scan_ref), '')),
           MIN(sal.created_at),
           (array_agg(sal.staff_id ORDER BY sal.created_at, sal.id) FILTER (WHERE sal.staff_id > 0))[1]::int
      FROM station_activity_logs sal
     WHERE sal.organization_id = ${ORG}
       AND sal.activity_type = 'SHIP_CONFIRM'
       AND sal.shipment_id IS NULL
       AND sal.created_at >= ${fromRef}::timestamptz
       AND sal.created_at < ${toRef}::timestamptz
     GROUP BY COALESCE(UPPER(NULLIF(BTRIM(sal.scan_ref), '')), sal.id::text)
  )`;
}

/**
 * Every scan-out in `shipmentsCte`, member-shaped: one row per order that owns
 * the box (`orders.shipment_id` or a `shipment_links` ORDER row — never
 * filtered by channel: a box that left is shown), else one row for the box,
 * else one row for the unresolved scan.
 */
function scannedOutMembersSql(shipmentsCte: string): string {
  const scanStaffOk = `(${STAFF}::int IS NULL OR so.scanned_out_by = ${STAFF}::int)`;
  return `SELECT o.id::bigint AS order_row_id,
           'scanned_out'::text AS stage,
           so.scanned_out_at AS entered_at,
           NULL::timestamptz AS deadline_at,
           so.scanned_out_at,
           so.scanned_out_by,
           ${CARRIER_KEY_SQL} AS carrier_key,
           ${CHANNEL_KEY_SQL} AS channel_key,
           ${staffOkSql(` OR so.scanned_out_by = ${STAFF}::int`)} AS staff_ok,
           so.shipment_id,
           NULL::text AS scan_ref,
           'order'::text AS link
      FROM ${shipmentsCte} so
      JOIN LATERAL (
        SELECT o0.id FROM orders o0 WHERE o0.organization_id = ${ORG} AND o0.shipment_id = so.shipment_id
        UNION
        SELECT sl.owner_id FROM shipment_links sl
         WHERE sl.organization_id = ${ORG} AND sl.owner_type = 'ORDER' AND sl.shipment_id = so.shipment_id
      ) own ON TRUE
      JOIN orders o ON o.id = own.id AND o.organization_id = ${ORG}
      LEFT JOIN shipping_tracking_numbers stn ON stn.id = so.shipment_id
      ${ORDER_STAGE_FACTS_JOIN}
     WHERE so.shipment_id IS NOT NULL
       AND ${IDS_OK_SQL}
    UNION ALL
    SELECT (-so.shipment_id)::bigint,
           'scanned_out'::text,
           so.scanned_out_at,
           NULL::timestamptz,
           so.scanned_out_at,
           so.scanned_out_by,
           ${CARRIER_KEY_SQL},
           NULL::text,
           ${scanStaffOk},
           so.shipment_id,
           NULL::text,
           'package'::text
      FROM ${shipmentsCte} so
      LEFT JOIN shipping_tracking_numbers stn ON stn.id = so.shipment_id AND stn.organization_id = ${ORG}
     WHERE so.shipment_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM orders o0 WHERE o0.organization_id = ${ORG} AND o0.shipment_id = so.shipment_id)
       AND NOT EXISTS (
         SELECT 1 FROM shipment_links sl
          WHERE sl.organization_id = ${ORG} AND sl.owner_type = 'ORDER' AND sl.shipment_id = so.shipment_id
       )
       AND (${IDS}::int[] IS NULL OR -so.shipment_id = ANY(${IDS}::int[]))
    UNION ALL
    SELECT (-(${UNLINKED_SCAN_ID_BASE} + so.scan_id))::bigint,
           'scanned_out'::text,
           so.scanned_out_at,
           NULL::timestamptz,
           so.scanned_out_at,
           so.scanned_out_by,
           NULL::text,
           NULL::text,
           ${scanStaffOk},
           NULL::bigint,
           so.scan_ref,
           'scan'::text
      FROM ${shipmentsCte} so
     WHERE so.shipment_id IS NULL
       AND (${IDS}::int[] IS NULL OR -(${UNLINKED_SCAN_ID_BASE} + so.scan_id) = ANY(${IDS}::int[]))`;
}

/** The sidebar filters over member alias `m`; a facet's own dimension is left out of its counts. */
function filterSql(m: string, skip?: 'carrier' | 'channel'): string {
  return [
    skip === 'carrier' ? null : `(${CARRIERS}::text[] IS NULL OR ${m}.carrier_key = ANY(${CARRIERS}::text[]))`,
    skip === 'channel' ? null : `(${CHANNELS}::text[] IS NULL OR ${m}.channel_key = ANY(${CHANNELS}::text[]))`,
    `${m}.staff_ok`,
  ]
    .filter(Boolean)
    .join(' AND ');
}

const URGENCY_SQL = (deadline: string) =>
  `CASE ${sqlDeskAgingBucket(deadline)} WHEN 'overdue' THEN 'late' WHEN 'today' THEN 'due_today' END`;

/** Member alias `a` sat in its stage past `PACKAGE_STALL_HOURS`. */
function stalledSql(a: string): string {
  const arms = Object.entries(PACKAGE_STALL_HOURS)
    .map(([stage, hours]) => `WHEN '${stage}' THEN ${a}.entered_at < now() - interval '${Number(hours)} hours'`)
    .join(' ');
  return `COALESCE(CASE ${a}.stage ${arms} ELSE false END, false)`;
}

/** The warehouse hour (0–23) of instant `at`. */
const warehouseHourSql = (at: string) => `extract(hour FROM timezone('${WAREHOUSE_TIME_ZONE}', ${at}))::int`;

/**
 * Lane order over alias `a`, one ordering valid across stages so a single
 * window function pages every column. Each column orders by its own choice
 * (`PackageSorts`): `urgent` = late, due today, then oldest in stage; `latest`
 * = newest arrival in the stage first (Scanned out: the latest scan-out, its
 * `entered_at`); `oldest` = the reverse. The modes are a closed enum, written
 * into the SQL as literals — never a caller's text.
 */
function laneOrderSql(a: string, sorts: PackageSorts = DEFAULT_SORTS): string {
  const byStage = (arm: (sort: PackageSort) => string) =>
    `CASE ${a}.stage ${PACKAGE_STAGES.map((stage) => `WHEN '${stage}' THEN ${arm(sorts[stage])}`).join(' ')} END`;
  const rank = `CASE ${URGENCY_SQL(`${a}.deadline_at`)} WHEN 'late' THEN 0 WHEN 'due_today' THEN 1 ELSE 2 END`;
  return `${byStage((sort) => (sort === 'urgent' ? rank : '0'))},
           ${byStage((sort) => `${sort === 'latest' ? '-' : ''}extract(epoch FROM ${a}.entered_at)`)} NULLS LAST,
           ${byStage((sort) => `${sort === 'latest' ? '-' : ''}${a}.order_row_id`)}`;
}

const DEFAULT_SORTS = resolvePackageSorts(null);

/** Today's members: everything in the building plus what left today (`m_all`), and yesterday's scan-outs (`m_prev`). */
const MEMBERS_SQL = `
  WITH ${OPEN_MEMBERS_CTE},
  ${scannedOutShipmentsCte('so_now', FROM, TO)},
  ${scannedOutShipmentsCte('so_prev', PREV_FROM, FROM)},
  m_all AS (
    SELECT * FROM m_open
    UNION ALL
    ${scannedOutMembersSql('so_now')}
  ),
  m_prev AS (${scannedOutMembersSql('so_prev')}),
  m AS (SELECT * FROM m_all WHERE ${filterSql('m_all')})`;

/** The sidebar's facet counts over `m_all`, each with every other filter applied — the same members as the board. */
const FACETS_SELECT_SQL = `
    (SELECT COALESCE(json_agg(t ORDER BY t.count DESC, t.value), '[]'::json) FROM (
       SELECT carrier_key AS value, count(*)::int AS count
         FROM m_all WHERE carrier_key IS NOT NULL AND ${filterSql('m_all', 'carrier')}
        GROUP BY carrier_key
    ) t) AS facet_carrier,
    (SELECT COALESCE(json_agg(t ORDER BY t.count DESC, t.value), '[]'::json) FROM (
       SELECT channel_key AS value, count(*)::int AS count
         FROM m_all WHERE channel_key IS NOT NULL AND ${filterSql('m_all', 'channel')}
        GROUP BY channel_key
    ) t) AS facet_channel`;

/**
 * The board in ONE statement, so the backlog is scanned once: every stage's
 * counts and its first `$5` cards (page size + 1 — the extra row says
 * "more") in that column's order, the hourly pace, each carrier's load and the facet counts.
 */
const boardSql = (sorts: PackageSorts) => `${MEMBERS_SQL},
  pg AS (
    SELECT * FROM (
      SELECT m.*, row_number() OVER (PARTITION BY m.stage ORDER BY ${laneOrderSql('m', sorts)}) AS ord
        FROM m
    ) ranked
     WHERE ranked.ord <= ${LIMIT}::int
  ),
  cards AS (${dressedCardsSql('pg')})
  SELECT
    (SELECT COALESCE(json_agg(t), '[]'::json) FROM (
       SELECT stage,
              count(*)::int AS count,
              count(*) FILTER (WHERE entered_at < ${FROM}::timestamptz)::int AS earlier,
              count(*) FILTER (WHERE ${URGENCY_SQL('deadline_at')} = 'late')::int AS late,
              count(*) FILTER (WHERE ${stalledSql('m')})::int AS stalled
         FROM m
        WHERE stage <> 'scanned_out'
        GROUP BY stage
    ) t) AS open,
    (SELECT count(*)::int FROM m WHERE stage = 'scanned_out') AS scanned_out,
    (SELECT count(*)::int FROM m_prev WHERE ${filterSql('m_prev')}) AS previous,
    (SELECT COALESCE(json_object_agg(h, n), '{}'::json) FROM (
       SELECT ${warehouseHourSql('scanned_out_at')} AS h, count(*)::int AS n FROM m WHERE stage = 'scanned_out' GROUP BY 1
    ) t) AS pace_today,
    (SELECT COALESCE(json_object_agg(h, n), '{}'::json) FROM (
       SELECT ${warehouseHourSql('scanned_out_at')} AS h, count(*)::int AS n FROM m_prev WHERE ${filterSql('m_prev')} GROUP BY 1
    ) t) AS pace_yesterday,
    (SELECT COALESCE(json_agg(t ORDER BY t.carrier), '[]'::json) FROM (
       SELECT carrier_key AS carrier,
              count(*) FILTER (WHERE stage = 'to_pick')::int AS to_pick,
              count(*) FILTER (WHERE stage = 'picked')::int AS picked,
              count(*) FILTER (WHERE stage = 'packed')::int AS packed,
              count(*) FILTER (WHERE stage = 'scanned_out')::int AS scanned_out
         FROM m_all
        WHERE carrier_key IS NOT NULL
        GROUP BY carrier_key
    ) t) AS carriers,
    ${FACETS_SELECT_SQL},
    (SELECT COALESCE(json_agg(cards ORDER BY cards.stage, cards.ord), '[]'::json) FROM cards) AS cards`;

/** Facet counts alone (the sidebar's own read). */
const FACETS_SQL = `${MEMBERS_SQL}
  SELECT ${FACETS_SELECT_SQL}`;

/** One page of `stage`: cards `$6 + 1 … $6 + $5`, in the column's order, filters applied. */
function lanePageSql(stage: PackageStage, sorts: PackageSorts): string {
  return `${MEMBERS_SQL},
  pg AS (
    SELECT * FROM (
      SELECT m.*, row_number() OVER (ORDER BY ${laneOrderSql('m', sorts)}) AS ord FROM m WHERE m.stage = '${stage}'
    ) ranked
     WHERE ranked.ord > ${OFFSET}::int AND ranked.ord <= ${OFFSET}::int + ${LIMIT}::int
  )
  SELECT * FROM (${dressedCardsSql('pg')}) cards ORDER BY cards.ord`;
}

/** Packages `$10` inside the board's scope (in the building, or scanned out today) — filters NOT applied: find and deep links open what they name. */
const PACKAGES_SQL = `${MEMBERS_SQL},
  pg AS (SELECT m_all.*, row_number() OVER (ORDER BY ${laneOrderSql('m_all')}) AS ord FROM m_all)
  SELECT * FROM (${dressedCardsSql('pg')}) cards ORDER BY cards.ord`;

/** Every member row of `src` (alias `pg`) dressed as a card row. */
function dressedCardsSql(src: string): string {
  return `
  SELECT pg.ord,
         pg.stage,
         pg.entered_at,
         pg.deadline_at,
         ${URGENCY_SQL('pg.deadline_at')} AS urgency,
         ${stalledSql('pg')} AS stalled,
         pg.order_row_id,
         pg.link,
         pg.scan_ref,
         o.order_id AS order_number,
         o.sku,
         o.product_title,
         sc.product_title AS catalog_product_title,
         cxi.external_name AS zoho_item_title,
         ${orderLineImageSql('o')} AS image_url,
         o.quantity,
         o.condition,
         o.sale_amount,
         o.currency,
         NULLIF(BTRIM(o.account_source), '') AS platform,
         COALESCE(NULLIF(BTRIM(c.display_name), ''), NULLIF(BTRIM(c.customer_name), '')) AS customer,
         COALESCE(pg.shipment_id, o.shipment_id) AS shipment_id,
         COALESCE(NULLIF(BTRIM(stn.tracking_number_raw), ''), pg.scan_ref) AS tracking,
         NULLIF(BTRIM(stn.carrier), '') AS carrier,
         COALESCE(o.is_out_of_stock, false) AS blocked,
         NULLIF(BTRIM(stn.latest_status_label), '') AS carrier_status,
         ${ORDERED_AT_SQL} AS ordered_at,
         osf.picked_at,
         osf.picked_by,
         s_pick.name AS picked_by_name,
         ${PACKED_AT_SQL} AS packed_at,
         COALESCE(osf.pack_activity_by, osf.packed_by) AS packed_by,
         s_pack.name AS packed_by_name,
         pg.scanned_out_at,
         pg.scanned_out_by,
         s_out.name AS scanned_out_by_name,
         COALESCE(nt.n, 0) AS note_count,
         nt.latest AS latest_note,
         COALESCE(tg.tags, ARRAY[]::text[]) AS tags,
         COALESCE(bx.ids, ARRAY[]::int[]) AS box_mates,
         ${CARD_LABEL_LINKED_SQL} AS label_linked,
         CASE
           WHEN o.id IS NULL THEN NULL
           WHEN ${G2_LINKED_DOCUMENT_EXISTS_SQL} THEN 'linked'
           WHEN COALESCE(o.docs_not_required, false) THEN 'not_required'
           ELSE 'missing'
         END AS slip,
         CASE
           WHEN o.id IS NULL THEN NULL
           WHEN ${G2_PRODUCT_PAPERWORK_EXISTS_SQL} THEN 'linked'
           WHEN COALESCE(o.docs_not_required, false) OR ${G2_SKU_PAPERWORK_NOT_REQUIRED_SQL} THEN 'not_required'
           ELSE 'missing'
         END AS paperwork
    FROM ${src} pg
    LEFT JOIN orders o ON pg.link = 'order' AND o.id = pg.order_row_id AND o.organization_id = ${ORG}
    LEFT JOIN shipping_tracking_numbers stn ON stn.id = COALESCE(pg.shipment_id, o.shipment_id)
    ${ORDER_STAGE_FACTS_JOIN}
    LEFT JOIN sku_catalog sc ON ${skuCatalogJoinOnSql('o', 'sc')}
    LEFT JOIN LATERAL (
      SELECT x.external_name
        FROM catalog_external_ids x
       WHERE x.sku_catalog_id = sc.id
         AND x.organization_id = o.organization_id
         AND x.provider = 'zoho'
       ORDER BY x.id
       LIMIT 1
    ) cxi ON TRUE
    LEFT JOIN customers c ON c.id = o.customer_id AND c.organization_id = o.organization_id
    LEFT JOIN staff s_pick ON s_pick.id = osf.picked_by
    LEFT JOIN staff s_pack ON s_pack.id = COALESCE(osf.pack_activity_by, osf.packed_by)
    LEFT JOIN staff s_out ON s_out.id = pg.scanned_out_by
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS n, (array_agg(n0.note_text ORDER BY n0.created_at DESC, n0.id DESC))[1] AS latest
        FROM order_notes n0
       WHERE n0.organization_id = o.organization_id AND n0.order_id = o.id
    ) nt ON TRUE
    LEFT JOIN LATERAL (
      SELECT array_agg(t0.tag ORDER BY t0.created_at, t0.id) AS tags
        FROM order_tags t0
       WHERE t0.organization_id = o.organization_id AND t0.order_id = o.id
    ) tg ON TRUE
    LEFT JOIN LATERAL (
      SELECT array_agg(o2.id::int ORDER BY o2.id) AS ids
        FROM orders o2
       WHERE o.shipment_id IS NOT NULL
         AND o2.organization_id = o.organization_id
         AND o2.shipment_id = o.shipment_id
         AND o2.id <> o.id
    ) bx ON TRUE`;
}

/**
 * Shipments whose tracking matches the Find keys (`$12`–`$15`), whatever day
 * they left — the integrity fallback: a tracking search always resolves its
 * box, even after the board's today-window stopped carrying it.
 */
function trackedShipmentsCte(name: string): string {
  return `${name} AS MATERIALIZED (
    SELECT sal.shipment_id::bigint AS shipment_id,
           NULL::bigint AS scan_id,
           NULL::text AS scan_ref,
           MIN(sal.created_at) AS scanned_out_at,
           (array_agg(sal.staff_id ORDER BY sal.created_at, sal.id) FILTER (WHERE sal.staff_id > 0))[1]::int AS scanned_out_by
      FROM station_activity_logs sal
      JOIN shipping_tracking_numbers stn
        ON stn.id = sal.shipment_id AND stn.organization_id = ${ORG}
     WHERE sal.organization_id = ${ORG}
       AND sal.activity_type = 'SHIP_CONFIRM'
       AND sal.shipment_id IS NOT NULL
       AND ${sqlTrackingNumberMatches({ stnAlias: 'stn', likeParam: '$12', canonicalParam: '$13', key18Param: '$14', last8Param: '$15' })}
     GROUP BY 1
  )`;
}

/**
 * Find: the board's members whose order number, SKU or tracking (the box's
 * own shipment) matches — matched over the ~board-sized member set only, never
 * the org's whole order history; plus one integrity fallback: a tracking that
 * names a box an earlier day carried (it already left) resolves to that box's
 * member row, so nothing a scan touched is ever unfindable. Binds `$11` text,
 * `$12` ILIKE pattern, `$13` canonical tracking, `$14` key-18, `$15` digits
 * last-8 ('' = off).
 */
const FIND_SQL = `${MEMBERS_SQL},
  ${trackedShipmentsCte('so_tracked')},
  m_extra AS (
    SELECT x.* FROM (${scannedOutMembersSql('so_tracked')}) x
     WHERE NOT EXISTS (SELECT 1 FROM m_all m2 WHERE m2.order_row_id = x.order_row_id)
  ),
  m_find AS (SELECT * FROM m_all UNION ALL SELECT * FROM m_extra),
  hit AS (
    SELECT m_find.order_row_id
      FROM m_find
      LEFT JOIN orders o ON m_find.link = 'order' AND o.id = m_find.order_row_id AND o.organization_id = ${ORG}
      LEFT JOIN shipping_tracking_numbers stn ON stn.id = COALESCE(m_find.shipment_id, o.shipment_id)
     WHERE ${sqlIdentifierEqualsQuery('o.order_id', '$11')}
        OR UPPER(BTRIM(COALESCE(o.sku, ''))) = UPPER(BTRIM($11))
        OR (stn.id IS NOT NULL AND ${sqlTrackingNumberMatches({ stnAlias: 'stn', likeParam: '$12', canonicalParam: '$13', key18Param: '$14', last8Param: '$15' })})
        OR UPPER(m_find.scan_ref) LIKE '%' || UPPER(BTRIM($11)) || '%'
  ),
  pg AS (
    SELECT m_find.*, row_number() OVER (ORDER BY ${laneOrderSql('m_find')}) AS ord
      FROM m_find
     WHERE m_find.order_row_id IN (SELECT order_row_id FROM hit)
  )
  SELECT * FROM (${dressedCardsSql('pg')}) cards WHERE cards.ord <= ${LIMIT}::int ORDER BY cards.ord`;

interface FacetRows {
  facet_carrier: Array<{ value: string; count: number }>;
  facet_channel: Array<{ value: string; count: number }>;
}

interface BoardRow extends FacetRows {
  open: Array<{ stage: PackageStage; count: number; earlier: number; late: number; stalled: number }>;
  scanned_out: number;
  previous: number;
  pace_today: Record<string, number>;
  pace_yesterday: Record<string, number>;
  carriers: Array<{ carrier: string; to_pick: number; picked: number; packed: number; scanned_out: number }>;
  cards: CardRow[];
}

interface CardRow {
  stage: PackageStage;
  entered_at: Date | string | null;
  urgency: PackageUrgency | null;
  deadline_at: Date | string | null;
  order_row_id: number | string;
  link: PackageLink;
  scan_ref: string | null;
  order_number: string | null;
  sku: string | null;
  product_title: string | null;
  catalog_product_title: string | null;
  zoho_item_title: string | null;
  image_url: string | null;
  quantity: number | string | null;
  condition: string | null;
  sale_amount: number | string | null;
  currency: string | null;
  platform: string | null;
  customer: string | null;
  shipment_id: number | string | null;
  tracking: string | null;
  carrier: string | null;
  blocked: boolean;
  carrier_status: string | null;
  ordered_at: Date | string | null;
  picked_at: Date | string | null;
  picked_by: number | null;
  picked_by_name: string | null;
  packed_at: Date | string | null;
  packed_by: number | null;
  packed_by_name: string | null;
  scanned_out_at: Date | string | null;
  scanned_out_by: number | null;
  scanned_out_by_name: string | null;
  note_count: number;
  latest_note: string | null;
  tags: string[];
  stalled: boolean;
  box_mates: number[];
  label_linked: boolean;
  slip: PackagePaperwork | null;
  paperwork: PackagePaperwork | null;
}

const iso = (value: Date | string | null): string | null => (value == null ? null : new Date(value).toISOString());

function toCard(row: CardRow, todayStart: string): PackageCard {
  const qty = Number(row.quantity);
  const enteredAt = iso(row.entered_at);
  const grade = lineCondition(row);
  return {
    orderRowId: Number(row.order_row_id),
    link: row.link,
    orderNumber: row.order_number?.trim() || null,
    stage: row.stage,
    title:
      row.link === 'package'
        ? 'Not linked to an order'
        : row.link === 'scan'
          ? 'Scan not matched to a package'
          : resolveSkuIdentityTitle({
              catalog_product_title: row.catalog_product_title,
              zoho_item_title: row.zoho_item_title,
              item_name: row.product_title,
              sku: row.sku,
            }) || 'Untitled item',
    carrierStatus: row.carrier_status?.trim() || null,
    sku: row.sku?.trim() || null,
    photoUrl: row.image_url,
    qty: Number.isFinite(qty) && row.quantity != null ? qty : null,
    condition: grade.label,
    conditionCode: grade.code,
    price: linePrice({ sale_amount: row.sale_amount, currency: row.currency }).text,
    platform: row.platform,
    customer: row.customer,
    shipmentId: row.shipment_id == null ? null : Number(row.shipment_id),
    tracking: row.tracking,
    carrier: row.carrier,
    shipBy: iso(row.deadline_at),
    urgency: row.stage === 'scanned_out' ? null : row.urgency,
    // Allocate's lifecycle: packed outranks out of stock, so only a package still owed a pick or a pack reads Blocked.
    blocked: row.blocked && (row.stage === 'to_pick' || row.stage === 'picked'),
    enteredAt,
    earlier: row.stage !== 'scanned_out' && enteredAt != null && enteredAt < todayStart,
    stalled: row.stalled === true,
    boxMates: (row.box_mates ?? []).map(Number),
    steps: {
      ordered: { at: iso(row.ordered_at), staffId: null, staffName: null },
      picked: { at: iso(row.picked_at), staffId: row.picked_by, staffName: row.picked_by_name?.trim() || null },
      packed: { at: iso(row.packed_at), staffId: row.packed_by, staffName: row.packed_by_name?.trim() || null },
      scannedOut: {
        at: iso(row.scanned_out_at),
        staffId: row.scanned_out_by,
        staffName: row.scanned_out_by_name?.trim() || null,
      },
    },
    noteCount: Number(row.note_count) || 0,
    latestNote: row.latest_note?.trim() || null,
    tags: row.tags ?? [],
    // An unlinked scan-out has no order to hold documents.
    docs: row.link === 'order' ? { label: row.label_linked === true, slip: row.slip ?? 'missing', paperwork: row.paperwork ?? 'missing' } : null,
  };
}

/** The binds every read shares (see the bind list at the top). */
function binds(filters: LiveFeedFilters | null, extra: { offset?: number; ids?: number[] } = {}): unknown[] {
  const today = getCurrentPSTDateKey();
  const start = (dayKey: string) => {
    const bounds = warehouseDayUtcBounds(dayKey);
    if (!bounds) throw new Error(`live feed: bad day ${dayKey}`);
    return bounds.startIso;
  };
  return [
    null, // $1 org — filled by the caller
    start(today),
    start(addDaysToDateKey(today, 1)),
    start(addDaysToDateKey(today, -1)),
    LIVE_FEED_PAGE_SIZE + 1,
    extra.offset ?? 0,
    filters?.carriers ?? null,
    filters?.channels ?? null,
    filters?.staffId ?? null,
    extra.ids ?? null,
  ];
}

const hourly = (byHour: Record<string, number>): number[] => Array.from({ length: 24 }, (_, hour) => Number(byHour[hour] ?? 0));

function toFacets(row: FacetRows): LiveFeedFacets {
  return {
    carrier: row.facet_carrier.map(({ value, count }) => ({ value, label: value, count })),
    // A channel the platform map does not know keeps its own name ("mekong"), not a shared "Unknown".
    channel: row.facet_channel.map(({ value, count }) => {
      const meta = sourcePlatformMeta(value);
      return { value, label: meta === UNKNOWN_PLATFORM ? value : meta.label, count };
    }),
  };
}

/** Counts for every stage and the first page of each, the pace, carrier loads, today's pickups and the facets — one statement plus the pickup read. */
export async function loadLiveFeedBoard(orgId: OrgId, filters: LiveFeedFilters | null = null): Promise<PackageBoard> {
  const values = binds(filters);
  values[0] = orgId;
  const todayStart = values[1] as string;
  const [{ rows }, cutoffs] = await Promise.all([
    tenantQueryOneTrip<BoardRow>(orgId, boardSql(resolvePackageSorts(filters?.sorts ?? null)), values),
    loadPickupCutoffsForDay(orgId, getCurrentPSTDateKey()),
  ]);
  const board = rows[0]!;
  const open = Object.fromEntries(board.open.map((row) => [row.stage, row]));

  const columns = PACKAGE_STAGES.map((stage): PackageColumn => {
    const stageRows = board.cards.filter((row) => row.stage === stage);
    const done = stage === 'scanned_out';
    return {
      stage,
      count: done ? board.scanned_out : (open[stage]?.count ?? 0),
      earlierCount: done ? 0 : (open[stage]?.earlier ?? 0),
      lateCount: done ? 0 : (open[stage]?.late ?? 0),
      stalledCount: done ? 0 : (open[stage]?.stalled ?? 0),
      previousCount: done ? board.previous : null,
      items: stageRows.slice(0, LIVE_FEED_PAGE_SIZE).map((row) => toCard(row, todayStart)),
      hasMore: stageRows.length > LIVE_FEED_PAGE_SIZE,
    };
  });

  const carriers: CarrierLoad[] = board.carriers.map((row) => ({
    carrier: row.carrier,
    toPick: row.to_pick,
    picked: row.picked,
    packed: row.packed,
    scannedOut: row.scanned_out,
  }));
  const loadOf = new Map(carriers.map((load) => [load.carrier, load]));
  const now = Date.now();
  // A pickup is a floor-wide fact — its counts never shrink under a facet — but a carrier facet shows only its carriers' trucks.
  const pickups: PickupCountdown[] = cutoffs.flatMap((cutoff) => {
    if (filters?.carriers && !filters.carriers.includes(cutoff.carrier)) return [];
    const load = loadOf.get(cutoff.carrier);
    const notPacked = (load?.toPick ?? 0) + (load?.picked ?? 0);
    const packed = load?.packed ?? 0;
    // A pickup that already left with nothing behind is history, not a countdown.
    if (Date.parse(cutoff.cutoffAt) < now && notPacked + packed === 0) return [];
    return [{ carrier: cutoff.carrier, cutoffAt: cutoff.cutoffAt, cutoffLocal: cutoff.cutoffLocal, notPacked, packed, scannedOut: load?.scannedOut ?? 0 }];
  });

  return {
    generatedAt: new Date(now).toISOString(),
    columns,
    pace: { today: hourly(board.pace_today), yesterday: hourly(board.pace_yesterday) },
    carriers,
    pickups,
    facets: toFacets(board),
  };
}

/** One later page of one stage, filters applied. */
export async function loadLiveFeedLane(
  orgId: OrgId,
  stage: PackageStage,
  offset: number,
  filters: LiveFeedFilters | null = null,
): Promise<PackageLanePage> {
  const values = binds(filters, { offset });
  values[0] = orgId;
  const { rows } = await tenantQueryOneTrip<CardRow>(orgId, lanePageSql(stage, resolvePackageSorts(filters?.sorts ?? null)), values);
  return {
    stage,
    offset,
    items: rows.slice(0, LIVE_FEED_PAGE_SIZE).map((row) => toCard(row, values[1] as string)),
    hasMore: rows.length > LIVE_FEED_PAGE_SIZE,
  };
}

/** The sidebar's facet counts (carrier, channel), each with every other filter applied. */
export async function loadLiveFeedFacets(orgId: OrgId, filters: LiveFeedFilters | null): Promise<LiveFeedFacets> {
  const values = binds(filters);
  values[0] = orgId;
  const { rows } = await tenantQueryOneTrip<FacetRows>(orgId, FACETS_SQL, values);
  return toFacets(rows[0]!);
}

/** Packages by order row id, inside the board's scope (in the building or scanned out today), in lane order. */
export async function loadLiveFeedPackages(orgId: OrgId, ids: readonly number[]): Promise<PackageCard[]> {
  if (ids.length === 0) return [];
  const values = binds(null, { ids: [...ids] });
  values[0] = orgId;
  const { rows } = await tenantQueryOneTrip<CardRow>(orgId, PACKAGES_SQL, values);
  return rows.map((row) => toCard(row, values[1] as string));
}

/**
 * Find: the board's packages whose order number, SKU or tracking matches
 * `query` (a gun scan, a paste, a typed last 8). Up to `LIVE_FEED_PAGE_SIZE`,
 * in lane order.
 */
export async function findLiveFeedPackages(orgId: OrgId, query: string): Promise<PackageCard[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const keys = orderTrackingMatchKeys(q);
  const values = binds(null);
  values[0] = orgId;
  values.push(q, q.length >= 8 ? `%${q}%` : q, keys.exact, keys.key18, keys.last8.length >= 8 ? keys.last8 : '');
  const { rows } = await tenantQueryOneTrip<CardRow>(orgId, FIND_SQL, values);
  return rows.slice(0, LIVE_FEED_PAGE_SIZE).map((row) => toCard(row, values[1] as string));
}
