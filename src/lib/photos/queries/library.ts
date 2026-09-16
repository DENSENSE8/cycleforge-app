import pool from '@/lib/db';
import {
  RECEIVING_PHOTO_LEGACY_PACKAGE,
  RECEIVING_PHOTO_PACKAGE,
  RECEIVING_PHOTO_UNBOX_CARTON,
  type ReceivingPhotoStage,
} from '@/lib/receiving/photo-intent';
import { addDaysToDateKey, warehouseDayUtcBounds } from '@/utils/date';
import { stageFromPhotoType, type PhotoEvidenceStage } from '../stages';
import { isPhotoLibraryStage } from '../library-filter-state';
import { mapPhotoRow } from './list-for-entity';
import { dayLabel, weekRange, weekRangeLabel } from '@/lib/photos/date-hierarchy';

export interface LibraryFilters {
  organizationId: string;
  cursor?: number | null;
  limit?: number;
  dateFrom?: string | null;
  dateTo?: string | null;
  sort?: 'recent' | 'oldest' | null;
  entityType?: string | null;
  entityId?: number | null;
  linkRole?: string | null;
  poRef?: string | null;
  receivingId?: number | null;
  /** Keep only RECEIVING-linked photos whose receiving.source matches (e.g. 'local_pickup'). */
  receivingSource?: string | null;
  /** Drop RECEIVING-linked photos whose receiving.source matches (exclude local pickups from unboxing). */
  receivingSourceExclude?: string | null;
  staffId?: number | null;
  hasAnalysis?: boolean | null;
  /** Tri-state damage filter from photo_analysis.metadata.damage_detected. */
  damageDetected?: boolean | null;
  /** Custom image type — keep only photos tagged with this photo_type. */
  photoType?: string | null;
  /** Photo label key — keep only photos assigned this label (photo_labels.key). */
  labelKey?: string | null;
  /**
   * Unboxing evidence-stage sub-filter. Predicates mirror
   * `receivingPhotoIntentSql` (src/lib/receiving/photo-intent.ts): package /
   * legacy / untyped carton shots = arrival, `receiving_unbox_carton` = carton,
   * RECEIVING_LINE-linked = item (entity wins — the identity law).
   */
  stage?: ReceivingPhotoStage | null;
  // ── Business-ID filters (each resolves through photo_entity_links; verified
  //    join paths in 2026-* migrations). All tenant-scoped via p.organization_id.
  /** Shipping tracking number (receiving.shipment_id / packer_logs.shipment_id → shipping_tracking_numbers). */
  tracking?: string | null;
  /** Product serial (serial_units.serial_number). */
  serial?: string | null;
  /** Catalog SKU string — matched against sku_catalog.sku ONLY, then id-joined (never join on the SKU string). */
  sku?: string | null;
  /** Zendesk claim ticket number (photo_entity_links ZENDESK_TICKET.entity_id). */
  ticketId?: number | null;
  /** Local pickup order id (local_pickup_orders.id). */
  pickupId?: number | null;
  /** Returns RMA number (rma_authorizations.rma_number via return_dispositions). */
  rma?: string | null;
  // ── Unified PO-photo finder ──────────────────────────────────────────────
  /**
   * A single identifier the operator typed (order#, tracking#, serial#, or PO#).
   * Unlike the granular `serial`/`tracking` filters above (which keep ONLY the
   * photos directly linked to that one entity), the finder resolves the value to
   * its receiving carton(s) and surfaces *every* photo on those cartons — i.e.
   * "show me this PO's photos" regardless of which identifier you have in hand.
   */
  poFinder?: string | null;
  /** Which identifier `poFinder` is. Defaults to 'po'. */
  poFinderKind?: PoFinderKind | null;
}

export type PoFinderKind =
  | 'order'
  | 'tracking'
  | 'serial'
  | 'po'
  | 'sku'
  | 'ticket'
  | 'repair'
  | 'customer'
  | 'any';

const PO_FINDER_KINDS: readonly PoFinderKind[] = [
  'order', 'tracking', 'serial', 'po', 'sku', 'ticket', 'repair', 'customer', 'any',
];

export function isPoFinderKind(value: unknown): value is PoFinderKind {
  return typeof value === 'string' && (PO_FINDER_KINDS as readonly string[]).includes(value);
}

/**
 * Parse the shared library filter params (everything except org + pagination)
 * from a URLSearchParams. Used by BOTH `/api/photos/library` (list) and
 * `/api/photos/library/ids` (select-all-matching) so the two never diverge on
 * which rows a filter set selects.
 */
export function libraryFiltersFromSearchParams(
  params: URLSearchParams,
): Omit<LibraryFilters, 'organizationId' | 'cursor' | 'limit'> {
  const hasAnalysisRaw = params.get('hasAnalysis');
  const damageRaw = params.get('damageDetected');
  return {
    dateFrom: params.get('dateFrom'),
    dateTo: params.get('dateTo'),
    sort: params.get('sort') === 'oldest' ? 'oldest' : 'recent',
    entityType: params.get('entityType'),
    entityId: params.get('entityId') ? Number(params.get('entityId')) : null,
    linkRole: params.get('linkRole'),
    poRef: params.get('poRef'),
    receivingId: params.get('receivingId') ? Number(params.get('receivingId')) : null,
    tracking: params.get('tracking'),
    serial: params.get('serial'),
    sku: params.get('sku'),
    ticketId: params.get('ticketId') ? Number(params.get('ticketId')) : null,
    pickupId: params.get('pickupId') ? Number(params.get('pickupId')) : null,
    rma: params.get('rma'),
    poFinder: params.get('poFinder'),
    poFinderKind: isPoFinderKind(params.get('poFinderKind'))
      ? (params.get('poFinderKind') as PoFinderKind)
      : null,
    receivingSource: params.get('receivingSource'),
    receivingSourceExclude: params.get('receivingSourceExclude'),
    staffId: params.get('staffId') ? Number(params.get('staffId')) : null,
    photoType: params.get('photoType'),
    stage: isPhotoLibraryStage(params.get('stage')) ? (params.get('stage') as ReceivingPhotoStage) : null,
    labelKey: params.get('label'),
    hasAnalysis: hasAnalysisRaw === 'true' ? true : hasAnalysisRaw === 'false' ? false : null,
    damageDetected: damageRaw === 'true' ? true : damageRaw === 'false' ? false : null,
  };
}

/**
 * Build an EXISTS subquery matching photos linked (directly via RECEIVING, or
 * indirectly via RECEIVING_LINE) to a `receiving_carton` row with the given `source`.
 * Returns the SQL fragment; pushes the source value onto `params`.
 */
function receivingSourceExists(params: unknown[], source: string): string {
  params.push(source);
  const src = `$${params.length}`;
  return `EXISTS (
        SELECT 1 FROM photo_entity_links l
         JOIN receiving_carton r ON r.organization_id = p.organization_id AND (
                (l.entity_type = 'RECEIVING' AND r.id = l.entity_id)
             OR (l.entity_type = 'RECEIVING_LINE' AND r.id = (
                   SELECT rl.receiving_id FROM receiving_line rl WHERE rl.id = l.entity_id))
              )
         WHERE l.photo_id = p.id
           AND l.organization_id = p.organization_id
           AND r.source = ${src}
      )`;
}

/**
 * Tracking-number match across BOTH photo→tracking paths:
 *  - packing:  PACKER_LOG → packer_logs.shipment_id → shipping_tracking_numbers
 *  - unboxing: RECEIVING (direct or via RECEIVING_LINE) → receiving_carton.shipment_id → STN
 * `tracking_number_normalized` is the canonical STN column (UNIQUE). Substring
 * ILIKE so a partial/last-N paste still resolves. One param, referenced 3×.
 */
function trackingExists(params: unknown[], tracking: string): string {
  params.push(`%${tracking}%`);
  const t = `$${params.length}`;
  return `EXISTS (
        SELECT 1 FROM photo_entity_links l
         WHERE l.photo_id = p.id
           AND l.organization_id = p.organization_id
           AND (
             (l.entity_type = 'PACKER_LOG' AND EXISTS (
                SELECT 1 FROM packer_logs pl
                 JOIN shipping_tracking_numbers stn ON stn.id = pl.shipment_id
                 WHERE pl.id = l.entity_id AND stn.tracking_number_normalized ILIKE ${t}))
          OR (l.entity_type = 'RECEIVING' AND EXISTS (
                SELECT 1 FROM receiving_carton r
                 JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
                 WHERE r.id = l.entity_id AND stn.tracking_number_normalized ILIKE ${t}))
          OR (l.entity_type = 'RECEIVING_LINE' AND EXISTS (
                SELECT 1 FROM receiving_line rl
                 JOIN receiving_carton r ON r.id = rl.receiving_id
                 JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
                 WHERE rl.id = l.entity_id AND stn.tracking_number_normalized ILIKE ${t}))
           )
      )`;
}

/**
 * Photos carrying the given SKU through a direct link path — a catalog `SKU`
 * link, a serialized unit whose sku / catalog row matches, or a receiving line
 * whose sku / catalog row matches (item evidence primary-links the LINE; the
 * SKU string lives on it). `v` is an already-pushed ILIKE param placeholder.
 * SoT rule respected: the typed value matches each scheme's own column —
 * `items` and `sku_catalog` numbering schemes are never string-joined.
 */
function skuLinkedExistsSql(v: string): string {
  return `EXISTS (
        SELECT 1 FROM photo_entity_links l
         WHERE l.photo_id = p.id
           AND l.organization_id = p.organization_id
           AND (
             (l.entity_type = 'SKU' AND EXISTS (
                SELECT 1 FROM sku_catalog sc
                 WHERE sc.id = l.entity_id AND sc.sku ILIKE ${v}))
          OR (l.entity_type = 'SERIAL_UNIT' AND EXISTS (
                SELECT 1 FROM serial_units su
                 LEFT JOIN sku_catalog sc ON sc.id = su.sku_catalog_id
                 WHERE su.id = l.entity_id
                   AND (su.sku ILIKE ${v} OR sc.sku ILIKE ${v})))
          OR (l.entity_type = 'RECEIVING_LINE' AND EXISTS (
                SELECT 1 FROM receiving_line rl
                 LEFT JOIN sku_catalog sc ON sc.id = rl.sku_catalog_id
                 WHERE rl.id = l.entity_id
                   AND (rl.sku ILIKE ${v} OR sc.sku ILIKE ${v})))
           )
      )`;
}

/**
 * Unified PO-photo finder. Resolves a typed identifier of `kind` to the set of
 * `receiving_carton` cartons it belongs to, then matches photos linked to ANY of those
 * cartons (directly as RECEIVING, or via RECEIVING_LINE). The end goal: typing
 * an order#, tracking#, or serial# surfaces the whole PO's unboxing photos.
 *
 * Each carton-resolver subquery is standalone, so it is tenant-scoped on its own
 * (`organization_id = $1`, the leading organizationId param) — never relying on
 * the outer photo_entity_links scope. ILIKE substring so a partial paste/last-N
 * still resolves. One value param, referenced across the kind's resolver.
 *
 * Verified join paths (see deep-scan + migrations):
 *  - tracking → receiving_carton.shipment_id → STN (+ shipment_links extra boxes)
 *  - serial   → serial_units.origin_receiving_line_id → receiving_line.receiving_id
 *  - order    → receiving_line.source_order_id / receiving_line_zoho.zoho_purchaseorder_number
 *               (returns bind the sales-order# as the carton PO#; see returned-serial-link.ts)
 *  - po       → receiving_carton.zoho_purchaseorder_number (+ denormalized photos.po_ref)
 */
/** The carton-id resolver subquery for ONE identifier kind. References $1 (org)
 *  and `v` (the value param). 'any' is composed from these, not handled here. */
function cartonResolverSql(kind: Exclude<PoFinderKind, 'any'>, v: string): string {
  switch (kind) {
    case 'tracking':
      return `
        SELECT r.id FROM receiving_carton r
          JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
         WHERE r.organization_id = $1 AND stn.tracking_number_normalized ILIKE ${v}
        UNION
        SELECT sl.owner_id FROM shipment_links sl
          JOIN shipping_tracking_numbers stn ON stn.id = sl.shipment_id
         WHERE sl.owner_type = 'RECEIVING' AND sl.organization_id = $1
           AND stn.tracking_number_normalized ILIKE ${v}`;
    case 'serial':
      // Phase 3: reach the origin receiving line via serial_unit_provenance.
      return `
        SELECT rl.receiving_id FROM serial_units su
          JOIN serial_unit_provenance p
            ON p.serial_unit_id = su.id AND p.origin_type = 'RECEIVING_LINE'
           AND p.origin_id IS NOT NULL AND p.organization_id = $1
          JOIN receiving_line rl ON rl.id = p.origin_id
         WHERE su.organization_id = $1 AND su.serial_number ILIKE ${v}`;
    case 'order':
      // Wave-2 reader cutover: the line's zoho PO number reads from
      // receiving_line_zoho (rz, 1:1 on the line PK); source_order_id stays
      // on the spine.
      return `
        SELECT rl.receiving_id FROM receiving_line rl
          LEFT JOIN receiving_line_zoho rz
                 ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
         WHERE rl.organization_id = $1
           AND (rl.source_order_id ILIKE ${v} OR rz.zoho_purchaseorder_number ILIKE ${v})`;
    case 'sku':
      // Cartons containing a line with this SKU (line string or catalog row) —
      // "show me every unboxing photo of the boxes this SKU arrived in."
      return `
        SELECT rl.receiving_id FROM receiving_line rl
          LEFT JOIN sku_catalog sc ON sc.id = rl.sku_catalog_id
         WHERE rl.organization_id = $1
           AND (rl.sku ILIKE ${v} OR sc.sku ILIKE ${v})`;
    case 'po':
    default:
      return `
        SELECT r.id FROM receiving_carton r
         WHERE r.organization_id = $1 AND r.zoho_purchaseorder_number ILIKE ${v}`;
  }
}

/** Wrap a carton-id resolver in the "photos linked to any of these cartons" EXISTS. */
function cartonExistsSql(resolver: string): string {
  return `EXISTS (
        SELECT 1 FROM photo_entity_links l
         LEFT JOIN receiving_line rlf
                ON l.entity_type = 'RECEIVING_LINE' AND rlf.id = l.entity_id
         WHERE l.photo_id = p.id
           AND l.organization_id = p.organization_id
           AND COALESCE(
                 CASE WHEN l.entity_type = 'RECEIVING' THEN l.entity_id END,
                 rlf.receiving_id
               ) IN (${resolver})
      )`;
}

/**
 * Photos linked to a Zendesk ticket — either dual-linked as ZENDESK_TICKET
 * claim evidence, or carton/line unboxing photos for a ticket that was linked
 * via `ticket_links` / `receiving_*.zendesk_ticket` without a photo backfill.
 *
 * `id` / `hashForm` / `plainForm` are already-bound param placeholders
 * (e.g. `$2`, `$3`, `$4`) for the numeric id, "#9599", and "9599".
 */
function ticketLinkedPhotoExists(id: string, hashForm: string, plainForm: string): string {
  return `(
      EXISTS (
        SELECT 1 FROM photo_entity_links l
         WHERE l.photo_id = p.id
           AND l.organization_id = p.organization_id
           AND l.entity_type = 'ZENDESK_TICKET'
           AND l.entity_id = ${id}
      )
      OR EXISTS (
        SELECT 1 FROM photo_entity_links l
         LEFT JOIN receiving_line rl
                ON l.entity_type = 'RECEIVING_LINE' AND rl.id = l.entity_id
               AND rl.organization_id = p.organization_id
         LEFT JOIN receiving_carton rc ON rc.organization_id = p.organization_id AND (
                (l.entity_type = 'RECEIVING' AND rc.id = l.entity_id)
             OR (l.entity_type = 'RECEIVING_LINE' AND rc.id = rl.receiving_id)
              )
         WHERE l.photo_id = p.id
           AND l.organization_id = p.organization_id
           AND l.entity_type IN ('RECEIVING', 'RECEIVING_LINE')
           AND (
             rc.zendesk_ticket IN (${hashForm}, ${plainForm})
             OR rl.zendesk_ticket IN (${hashForm}, ${plainForm})
             OR EXISTS (
               SELECT 1 FROM ticket_links tl
                WHERE tl.organization_id = p.organization_id
                  AND tl.zendesk_ticket_id = ${id}
                  AND (
                    (tl.entity_type = 'RECEIVING' AND tl.entity_id = rc.id)
                    OR (tl.entity_type = 'RECEIVING_LINE' AND rl.id IS NOT NULL AND tl.entity_id = rl.id)
                    OR (tl.entity_type = 'RECEIVING_LINE' AND rc.id IS NOT NULL AND tl.entity_id IN (
                          SELECT x.id FROM receiving_line x
                           WHERE x.receiving_id = rc.id AND x.organization_id = p.organization_id))
                  )
             )
           )
      )
    )`;
}

/**
 * Repair-linked evidence: photos linked to a repair_service row. `rawValue`
 * accepts `RS-125` / `REP-125` / bare `125` (exact id) or free text matched
 * against ticket #, product title and issue — "repair service in general".
 */
function repairLinkedExistsSql(params: unknown[], rawValue: string): string {
  const trimmed = rawValue.trim();
  const idMatch = /^(?:RS-?|REP-)?(\d+)$/i.exec(trimmed);
  if (idMatch) {
    params.push(Number(idMatch[1]));
    const id = `$${params.length}`;
    return `EXISTS (
        SELECT 1 FROM photo_entity_links l
          JOIN repair_service rs
            ON l.entity_type = 'REPAIR_SERVICE' AND rs.id = l.entity_id
           AND rs.organization_id = p.organization_id
         WHERE l.photo_id = p.id
           AND l.organization_id = p.organization_id
           AND rs.id = ${id}
      )`;
  }
  params.push(`%${trimmed}%`);
  const v = `$${params.length}`;
  return `EXISTS (
      SELECT 1 FROM photo_entity_links l
        JOIN repair_service rs
          ON l.entity_type = 'REPAIR_SERVICE' AND rs.id = l.entity_id
         AND rs.organization_id = p.organization_id
       WHERE l.photo_id = p.id
         AND l.organization_id = p.organization_id
         AND (
           COALESCE(rs.ticket_number, '') ILIKE ${v}
           OR COALESCE(rs.product_title, '') ILIKE ${v}
           OR COALESCE(rs.issue, '') ILIKE ${v}
         )
    )`;
}

/** Customer-name evidence: photos on a repair filed for a matching customer. */
function customerLinkedExistsSql(params: unknown[], rawValue: string): string {
  params.push(`%${rawValue.trim()}%`);
  const v = `$${params.length}`;
  return `EXISTS (
      SELECT 1 FROM photo_entity_links l
        JOIN repair_service rs
          ON l.entity_type = 'REPAIR_SERVICE' AND rs.id = l.entity_id
         AND rs.organization_id = p.organization_id
        LEFT JOIN customers c
          ON c.id = rs.customer_id AND c.organization_id = p.organization_id
       WHERE l.photo_id = p.id
         AND l.organization_id = p.organization_id
         AND COALESCE(
           c.display_name, c.customer_name,
           CONCAT_WS(' ', NULLIF(c.first_name, ''), NULLIF(c.last_name, '')),
           rs.contact_info
         ) ILIKE ${v}
    )`;
}
/** Claims scope: any photo that belongs under a filed/linked Zendesk claim. */
function claimsScopePhotoExists(): string {
  return `(
      EXISTS (
        SELECT 1 FROM photo_entity_links l
         WHERE l.photo_id = p.id
           AND l.organization_id = p.organization_id
           AND l.entity_type = 'ZENDESK_TICKET'
      )
      OR EXISTS (
        SELECT 1 FROM photo_entity_links l
         LEFT JOIN receiving_line rl
                ON l.entity_type = 'RECEIVING_LINE' AND rl.id = l.entity_id
               AND rl.organization_id = p.organization_id
         LEFT JOIN receiving_carton rc ON rc.organization_id = p.organization_id AND (
                (l.entity_type = 'RECEIVING' AND rc.id = l.entity_id)
             OR (l.entity_type = 'RECEIVING_LINE' AND rc.id = rl.receiving_id)
              )
         WHERE l.photo_id = p.id
           AND l.organization_id = p.organization_id
           AND l.entity_type IN ('RECEIVING', 'RECEIVING_LINE')
           AND (
             NULLIF(TRIM(rc.zendesk_ticket), '') IS NOT NULL
             OR NULLIF(TRIM(rl.zendesk_ticket), '') IS NOT NULL
             OR EXISTS (
               SELECT 1 FROM ticket_links tl
                WHERE tl.organization_id = p.organization_id
                  AND tl.zendesk_ticket_id IS NOT NULL
                  AND (
                    (tl.entity_type = 'RECEIVING' AND tl.entity_id = rc.id)
                    OR (tl.entity_type = 'RECEIVING_LINE' AND rl.id IS NOT NULL AND tl.entity_id = rl.id)
                    OR (tl.entity_type = 'RECEIVING_LINE' AND rc.id IS NOT NULL AND tl.entity_id IN (
                          SELECT x.id FROM receiving_line x
                           WHERE x.receiving_id = rc.id AND x.organization_id = p.organization_id))
                  )
             )
           )
      )
    )`;
}

/**
 * Resolve the Zendesk ticket id for a photo — dual-link first, then carton/line
 * `zendesk_ticket`, then `ticket_links`. Used for SELECT ticket_id + claims
 * folder grouping so linked-but-not-dual-linked unboxing photos still bucket
 * under `#9599`.
 */
function photoResolvedTicketIdExpr(): string {
  return `COALESCE(
      (SELECT lz.entity_id FROM photo_entity_links lz
        WHERE lz.photo_id = p.id
          AND lz.organization_id = p.organization_id
          AND lz.entity_type = 'ZENDESK_TICKET'
        LIMIT 1),
      (SELECT CASE
          WHEN regexp_replace(TRIM(COALESCE(rc.zendesk_ticket, rl.zendesk_ticket, '')), '^#', '') ~ '^[0-9]+$'
          THEN regexp_replace(TRIM(COALESCE(rc.zendesk_ticket, rl.zendesk_ticket, '')), '^#', '')::bigint
          ELSE NULL
        END
         FROM photo_entity_links l
         LEFT JOIN receiving_line rl
                ON l.entity_type = 'RECEIVING_LINE' AND rl.id = l.entity_id
               AND rl.organization_id = p.organization_id
         LEFT JOIN receiving_carton rc ON rc.organization_id = p.organization_id AND (
                (l.entity_type = 'RECEIVING' AND rc.id = l.entity_id)
             OR (l.entity_type = 'RECEIVING_LINE' AND rc.id = rl.receiving_id)
              )
        WHERE l.photo_id = p.id
          AND l.organization_id = p.organization_id
          AND l.entity_type IN ('RECEIVING', 'RECEIVING_LINE')
          AND COALESCE(NULLIF(TRIM(rc.zendesk_ticket), ''), NULLIF(TRIM(rl.zendesk_ticket), '')) IS NOT NULL
        LIMIT 1),
      (SELECT tl.zendesk_ticket_id
         FROM photo_entity_links l
         LEFT JOIN receiving_line rl
                ON l.entity_type = 'RECEIVING_LINE' AND rl.id = l.entity_id
               AND rl.organization_id = p.organization_id
         LEFT JOIN receiving_carton rc ON rc.organization_id = p.organization_id AND (
                (l.entity_type = 'RECEIVING' AND rc.id = l.entity_id)
             OR (l.entity_type = 'RECEIVING_LINE' AND rc.id = rl.receiving_id)
              )
         JOIN ticket_links tl ON tl.organization_id = p.organization_id
          AND tl.zendesk_ticket_id IS NOT NULL
          AND (
            (tl.entity_type = 'RECEIVING' AND tl.entity_id = rc.id)
            OR (tl.entity_type = 'RECEIVING_LINE' AND rl.id IS NOT NULL AND tl.entity_id = rl.id)
            OR (tl.entity_type = 'RECEIVING_LINE' AND rc.id IS NOT NULL AND tl.entity_id IN (
                  SELECT x.id FROM receiving_line x
                   WHERE x.receiving_id = rc.id AND x.organization_id = p.organization_id))
          )
        WHERE l.photo_id = p.id
          AND l.organization_id = p.organization_id
          AND l.entity_type IN ('RECEIVING', 'RECEIVING_LINE')
        LIMIT 1)
    )`;
}

function ticketFinderExists(params: unknown[], rawValue: string): string {
  const digits = rawValue.replace(/^#/, '').trim();
  if (/^\d+$/.test(digits)) {
    params.push(Number(digits), `#${digits}`, digits);
    const id = `$${params.length - 2}`;
    const hashForm = `$${params.length - 1}`;
    const plainForm = `$${params.length}`;
    return ticketLinkedPhotoExists(id, hashForm, plainForm);
  }
  params.push(`%${digits}%`);
  const v = `$${params.length}`;
  return `EXISTS (
      SELECT 1 FROM photo_entity_links l
       WHERE l.photo_id = p.id
         AND l.organization_id = p.organization_id
         AND l.entity_type = 'ZENDESK_TICKET'
         AND l.entity_id::text ILIKE ${v}
    )`;
}

function poFinderExists(params: unknown[], kind: PoFinderKind, rawValue: string): string {
  if (kind === 'ticket') {
    return ticketFinderExists(params, rawValue);
  }
  // Repair + customer resolve against repair_service links, not cartons, and
  // bind their own params — handled before the `%like%` push below so that
  // placeholder stays dead-parameter-free.
  if (kind === 'repair') {
    return repairLinkedExistsSql(params, rawValue);
  }
  if (kind === 'customer') {
    return customerLinkedExistsSql(params, rawValue);
  }

  params.push(`%${rawValue}%`);
  const v = `$${params.length}`;
  // A direct PO lookup also catches denormalized po_ref-only photos (stamped at
  // upload by resolve-po-ref.ts) that may predate or lack a carton link.
  const poRefMatch = `p.po_ref ILIKE ${v}`;
  if (kind === 'po') {
    return `(${poRefMatch} OR ${cartonExistsSql(cartonResolverSql('po', v))})`;
  }
  if (kind === 'sku') {
    // SKU scope: the cartons the SKU arrived in (unboxing evidence) plus every
    // photo linked to the SKU directly — catalog links, its serialized units
    // (testing / packing shots), and its receiving lines (item shots).
    return `(${cartonExistsSql(cartonResolverSql('sku', v))} OR ${skuLinkedExistsSql(v)})`;
  }
  if (kind === 'any') {
    // The smart "All" scope: serial OR tracking OR order OR PO OR SKU OR
    // Zendesk ticket OR repair OR customer, plus free-text/OCR (po_ref +
    // photo_analysis).
    const cartons = (['serial', 'tracking', 'order', 'po', 'sku'] as const)
      .map((k) => cartonExistsSql(cartonResolverSql(k, v)))
      .join(' OR ');
    const ocrMatch = `EXISTS (
        SELECT 1 FROM photo_analysis a
         WHERE a.photo_id = p.id AND a.metadata::text ILIKE ${v})`;
    const ticketMatch = ticketFinderExists(params, rawValue);
    const repairMatch = repairLinkedExistsSql(params, rawValue);
    const customerMatch = customerLinkedExistsSql(params, rawValue);
    return `(${poRefMatch} OR ${ocrMatch} OR ${ticketMatch} OR ${repairMatch} OR ${customerMatch} OR ${skuLinkedExistsSql(v)} OR ${cartons})`;
  }
  return cartonExistsSql(cartonResolverSql(kind, v));
}

/**
 * Shared WHERE builder for the media library filter set. Both the paged row
 * query (listPhotoLibrary) and the id-only count query (listPhotoLibraryIds)
 * apply IDENTICAL predicates so they can never drift. Cursor/limit/ORDER BY and
 * column selection are the caller's concern — not here.
 */
function buildLibraryWhere(filters: LibraryFilters): { clauses: string[]; params: unknown[] } {
  const params: unknown[] = [filters.organizationId];
  const clauses: string[] = ['p.organization_id = $1'];

  // dateFrom/dateTo are PST `YYYY-MM-DD` calendar days. Resolve them to INSTANT
  // bounds in JS and compare the raw column, as a half-open range:
  //
  //     created_at >= <PST midnight of dateFrom>
  //     created_at <  <PST midnight of the day AFTER dateTo>
  //
  // **Why not cast the column.** This used to read
  // `(p.created_at AT TIME ZONE 'America/Los_Angeles')::date >= $n::date`, which
  // is correct but *not sargable*: a predicate on a FUNCTION of the column cannot
  // use `idx_photos_org_created (organization_id, created_at DESC)`, so every
  // date-filtered read was a Seq Scan over the org's whole photo table plus a
  // top-N sort. Measured on the dogfood tenant (EXPLAIN ANALYZE, 2026-07-28):
  // Seq Scan 2,841 rows / 1.81 ms → Index Scan 48 rows / 0.09 ms, identical
  // result sets. Seq-scan cost grows with the table; the index scan does not,
  // and the flat photo stream pages continuously, so it leans on this far harder
  // than the old folder drill did.
  //
  // The bounds also make the index supply `ORDER BY created_at DESC` directly,
  // which removes the sort node entirely.
  //
  // **Why half-open** rather than `<= endIso` (23:59:59.999): a timestamptz has
  // microsecond resolution, so an inclusive millisecond bound drops any capture
  // landing in the final sub-millisecond of a day. `< next-day-midnight` has no
  // such hole and needs no leap/DST special-casing — `warehouseDayUtcBounds`
  // resolves each civil day through the zone database, so PST/PDT is handled.
  const dateFromBounds = filters.dateFrom ? warehouseDayUtcBounds(filters.dateFrom) : null;
  if (dateFromBounds) {
    params.push(dateFromBounds.startIso);
    clauses.push(`p.created_at >= $${params.length}::timestamptz`);
  }
  // Upper bound = start of the day AFTER dateTo (exclusive).
  const dateToBounds = filters.dateTo
    ? warehouseDayUtcBounds(addDaysToDateKey(filters.dateTo, 1))
    : null;
  if (dateToBounds) {
    params.push(dateToBounds.startIso);
    clauses.push(`p.created_at < $${params.length}::timestamptz`);
  }
  if (filters.poRef) {
    params.push(`%${filters.poRef}%`);
    clauses.push(`p.po_ref ILIKE $${params.length}`);
  }
  if (filters.staffId) {
    params.push(filters.staffId);
    clauses.push(`p.taken_by_staff_id = $${params.length}`);
  }
  if (filters.photoType) {
    params.push(filters.photoType);
    clauses.push(`lower(p.photo_type) = lower($${params.length})`);
  }
  if (filters.labelKey) {
    params.push(filters.labelKey);
    clauses.push(`
      EXISTS (
        SELECT 1 FROM photo_label_assignments la
         JOIN photo_labels lb ON lb.id = la.label_id
        WHERE la.photo_id = p.id
          AND la.organization_id = p.organization_id
          AND lower(lb.key) = lower($${params.length})
      )`);
  }
  if (filters.entityType && filters.entityId) {
    params.push(filters.entityType, filters.entityId);
    clauses.push(`
      EXISTS (
        SELECT 1 FROM photo_entity_links l
         WHERE l.photo_id = p.id
           AND l.organization_id = p.organization_id
           AND l.entity_type = $${params.length - 1}
           AND l.entity_id = $${params.length}
      )`);
  } else if (filters.entityType === 'ZENDESK_TICKET') {
    // Claims scope: dual-linked claim evidence OR unboxing photos on a carton/line
    // that already carries a Zendesk ticket (ticket_links / zendesk_ticket column).
    // Linking a ticket without photo backfill must still surface the carton's photos.
    clauses.push(claimsScopePhotoExists());
  } else if (filters.entityType) {
    // Scope filter (no specific entity): keep ONLY photos linked to this entity
    // type — e.g. packing = PACKER_LOG. Receiving photos link as RECEIVING or
    // RECEIVING_LINE, so unboxing matches both.
    // Repair scope is TWO entity kinds: REPAIR_SERVICE (counter/tech evidence
    // on the repair ticket) and SERIAL_UNIT (bench captures of the device).
    const types =
      filters.entityType === 'RECEIVING'
        ? ['RECEIVING', 'RECEIVING_LINE']
        : filters.entityType === 'REPAIR_SERVICE'
          ? ['REPAIR_SERVICE', 'SERIAL_UNIT']
          : [filters.entityType];
    params.push(types);
    clauses.push(`
      EXISTS (
        SELECT 1 FROM photo_entity_links l
         WHERE l.photo_id = p.id
           AND l.organization_id = p.organization_id
           AND l.entity_type = ANY($${params.length}::text[])
      )`);
  }
  if (filters.receivingId) {
    params.push(filters.receivingId);
    const rid = `$${params.length}`;
    clauses.push(`
      EXISTS (
        SELECT 1 FROM photo_entity_links l
         LEFT JOIN receiving_line rl
                ON l.entity_type = 'RECEIVING_LINE' AND rl.id = l.entity_id
         WHERE l.photo_id = p.id
           AND (
             (l.entity_type = 'RECEIVING' AND l.entity_id = ${rid})
             OR (l.entity_type = 'RECEIVING_LINE' AND rl.receiving_id = ${rid})
           )
      )`);
  }
  if (filters.tracking) {
    clauses.push(trackingExists(params, filters.tracking));
  }
  if (filters.serial) {
    params.push(`%${filters.serial}%`);
    clauses.push(`
      EXISTS (
        SELECT 1 FROM photo_entity_links l
         JOIN serial_units su ON l.entity_type = 'SERIAL_UNIT' AND su.id = l.entity_id
         WHERE l.photo_id = p.id
           AND l.organization_id = p.organization_id
           AND su.serial_number ILIKE $${params.length}
      )`);
  }
  if (filters.sku) {
    // SoT rule: never join the two SKU schemes on the string. The typed SKU is
    // matched against each scheme's OWN column (sku_catalog.sku, or the raw
    // line/unit sku string) and photos resolve by id — catalog `SKU` links,
    // serialized units, and receiving lines (item evidence lives on the line).
    params.push(filters.sku);
    clauses.push(skuLinkedExistsSql(`$${params.length}`));
  }
  if (filters.ticketId) {
    const digits = String(filters.ticketId).replace(/^#/, '').trim();
    params.push(Number(digits), `#${digits}`, digits);
    const id = `$${params.length - 2}`;
    const hashForm = `$${params.length - 1}`;
    const plainForm = `$${params.length}`;
    clauses.push(ticketLinkedPhotoExists(id, hashForm, plainForm));
  }
  if (filters.pickupId) {
    params.push(filters.pickupId);
    const pid = `$${params.length}`;
    clauses.push(`
      EXISTS (
        SELECT 1 FROM photo_entity_links l
         JOIN receiving_carton r ON r.organization_id = p.organization_id AND (
                (l.entity_type = 'RECEIVING' AND r.id = l.entity_id)
             OR (l.entity_type = 'RECEIVING_LINE' AND r.id = (
                   SELECT rl.receiving_id FROM receiving_line rl WHERE rl.id = l.entity_id)))
         JOIN local_pickup_orders lpo ON lpo.receiving_id = r.id
         WHERE l.photo_id = p.id
           AND l.organization_id = p.organization_id
           AND lpo.id = ${pid}
      )`);
  }
  if (filters.rma) {
    params.push(filters.rma);
    clauses.push(`
      EXISTS (
        SELECT 1 FROM photo_entity_links l
         JOIN serial_units su ON l.entity_type = 'SERIAL_UNIT' AND su.id = l.entity_id
         JOIN return_dispositions rd ON rd.serial_unit_id = su.id
         JOIN rma_authorizations rma ON rma.id = rd.rma_id
         WHERE l.photo_id = p.id
           AND l.organization_id = p.organization_id
           AND rma.rma_number ILIKE $${params.length}
      )`);
  }
  if (filters.poFinder) {
    const kind = isPoFinderKind(filters.poFinderKind) ? filters.poFinderKind : 'po';
    clauses.push(poFinderExists(params, kind, filters.poFinder));
  }
  // Unboxing evidence-stage sub-filter — predicates mirror
  // `receivingPhotoIntentSql` (src/lib/receiving/photo-intent.ts) in the
  // library's EXISTS-on-links shape. Package excludes the mis-stamped
  // `receiving_item`-on-carton rows; item is entity-only (identity law).
  if (filters.stage) {
    const receivingLinkExists = (entityType: 'RECEIVING' | 'RECEIVING_LINE') => `
      EXISTS (
        SELECT 1 FROM photo_entity_links l
         WHERE l.photo_id = p.id
           AND l.organization_id = p.organization_id
           AND l.entity_type = '${entityType}'
      )`;
    if (filters.stage === 'unbox_item') {
      clauses.push(receivingLinkExists('RECEIVING_LINE'));
    } else if (filters.stage === 'unbox_carton') {
      params.push(RECEIVING_PHOTO_UNBOX_CARTON);
      clauses.push(`(${receivingLinkExists('RECEIVING')} AND p.photo_type = $${params.length})`);
    } else {
      params.push([RECEIVING_PHOTO_PACKAGE, RECEIVING_PHOTO_LEGACY_PACKAGE, '']);
      clauses.push(
        `(${receivingLinkExists('RECEIVING')} AND COALESCE(p.photo_type, '') = ANY($${params.length}::text[]))`,
      );
    }
  }
  // Local pickups create a `receiving` row with source='local_pickup'; scope to
  // (or exclude) those to split the RECEIVING entity into the two sidebar folders.
  if (filters.receivingSource) {
    clauses.push(receivingSourceExists(params, filters.receivingSource));
  }
  if (filters.receivingSourceExclude) {
    clauses.push(`NOT ${receivingSourceExists(params, filters.receivingSourceExclude)}`);
  }
  if (filters.linkRole) {
    params.push(filters.linkRole);
    clauses.push(`
      EXISTS (
        SELECT 1 FROM photo_entity_links l
         WHERE l.photo_id = p.id AND l.link_role = $${params.length}
      )`);
  }
  if (filters.hasAnalysis === true) {
    clauses.push(`EXISTS (SELECT 1 FROM photo_analysis a WHERE a.photo_id = p.id)`);
  } else if (filters.hasAnalysis === false) {
    clauses.push(`NOT EXISTS (SELECT 1 FROM photo_analysis a WHERE a.photo_id = p.id)`);
  }
  if (filters.damageDetected === true) {
    clauses.push(
      `EXISTS (SELECT 1 FROM photo_analysis a
                WHERE a.photo_id = p.id
                  AND (a.metadata->>'damage_detected')::boolean IS TRUE)`,
    );
  } else if (filters.damageDetected === false) {
    clauses.push(
      `NOT EXISTS (SELECT 1 FROM photo_analysis a
                    WHERE a.photo_id = p.id
                      AND (a.metadata->>'damage_detected')::boolean IS TRUE)`,
    );
  }

  return { clauses, params };
}

/**
 * Evidence stage of a library row, derived in TS from its linked entity types ×
 * photo_type through the stage SoT (`stageFromPhotoType`) — never a SQL-side
 * label map. Entity precedence follows the identity law: a RECEIVING_LINE link
 * makes it item evidence even when a carton link rides along; unit / packer
 * links resolve the testing / packing stages. First resolvable stage wins.
 */
const STAGE_ENTITY_PRECEDENCE = ['RECEIVING_LINE', 'RECEIVING', 'SERIAL_UNIT', 'PACKER_LOG'] as const;

function deriveLibraryStage(
  linkedEntityTypes: readonly string[],
  photoType: string | null,
): PhotoEvidenceStage | null {
  for (const entityType of STAGE_ENTITY_PRECEDENCE) {
    if (!linkedEntityTypes.includes(entityType)) continue;
    const stage = stageFromPhotoType(entityType, photoType);
    if (stage) return stage;
  }
  return null;
}

export async function listPhotoLibrary(filters: LibraryFilters) {
  const limit = Math.min(Math.max(filters.limit ?? 48, 1), 100);
  const { clauses, params } = buildLibraryWhere(filters);

  if (filters.cursor && filters.cursor > 0) {
    params.push(filters.cursor);
    clauses.push(`p.id < $${params.length}`);
  }

  const sortDir = filters.sort === 'oldest' ? 'ASC' : 'DESC';
  params.push(limit + 1);
  const limitParam = `$${params.length}`;

  // All filters are self-contained EXISTS/scalar subqueries on `p`, so we select
  // straight from `photos` — no row-multiplying joins, hence no DISTINCT ON
  // (which Postgres would require to lead the ORDER BY, breaking date sort).
  const res = await pool.query(
    `SELECT p.id, p.organization_id, p.photo_type, p.taken_by_staff_id,
            p.po_ref, p.created_at, p.client_captured_at,
            (SELECT s.name FROM staff s
              WHERE s.id = p.taken_by_staff_id
                AND s.organization_id = p.organization_id
              LIMIT 1) AS taken_by_staff_name,
            EXISTS (SELECT 1 FROM photo_analysis a WHERE a.photo_id = p.id) AS has_analysis,
            (SELECT (a.metadata->>'damage_detected')::boolean
               FROM photo_analysis a WHERE a.photo_id = p.id LIMIT 1) AS damage_detected,
            ${photoResolvedTicketIdExpr()} AS ticket_id,
            (SELECT COALESCE(json_agg(json_build_object(
                      'id', lb.id, 'key', lb.key, 'label', lb.label,
                      'color', lb.color, 'icon', lb.icon
                    ) ORDER BY lb.sort_index, lb.id), '[]'::json)
               FROM photo_label_assignments la
               JOIN photo_labels lb ON lb.id = la.label_id
              WHERE la.photo_id = p.id
                AND la.organization_id = p.organization_id) AS labels,
            -- ── PO · SKU · serial identity (display join only — never writes a
            --    second link; the dual-link decision is Ask-first). Line SKU wins
            --    over unit SKU: item evidence primary-links the RECEIVING_LINE.
            (SELECT COALESCE(rl.sku, sc.sku)
               FROM photo_entity_links l
               JOIN receiving_line rl ON rl.id = l.entity_id
               LEFT JOIN sku_catalog sc ON sc.id = rl.sku_catalog_id
              WHERE l.photo_id = p.id
                AND l.organization_id = p.organization_id
                AND l.entity_type = 'RECEIVING_LINE'
              ORDER BY l.id
              LIMIT 1) AS line_sku,
            (SELECT json_build_object(
                      'sku', COALESCE(su.sku, sc.sku),
                      'serial', su.serial_number,
                      'unitUid', su.unit_uid)
               FROM photo_entity_links l
               JOIN serial_units su ON su.id = l.entity_id
               LEFT JOIN sku_catalog sc ON sc.id = su.sku_catalog_id
              WHERE l.photo_id = p.id
                AND l.organization_id = p.organization_id
                AND l.entity_type = 'SERIAL_UNIT'
              ORDER BY l.id
              LIMIT 1) AS unit_identity,
            -- Every linked entity type — the TS mapper derives the evidence
            -- stage from (entity_type × photo_type) via stageFromPhotoType.
            (SELECT array_agg(DISTINCT l.entity_type)
               FROM photo_entity_links l
              WHERE l.photo_id = p.id
                AND l.organization_id = p.organization_id) AS linked_entity_types,
            -- Derived source scope (mirrors entityTypeForSourceScope + the
            -- receiving.source split) so the sidebar can highlight the image-type
            -- a folder's photos belong to even under the "All photos" scope.
            -- Precedence keeps a receiving capture as unboxing/pickup even when the
            -- unit it created is also linked (RECEIVING before SERIAL_UNIT).
            (CASE
               WHEN ${claimsScopePhotoExists()} THEN 'claims'
               WHEN EXISTS (SELECT 1 FROM photo_entity_links l
                             WHERE l.photo_id = p.id AND l.organization_id = p.organization_id
                               AND l.entity_type = 'PACKER_LOG') THEN 'packing'
               WHEN EXISTS (SELECT 1 FROM photo_entity_links l
                              JOIN receiving_carton r ON r.organization_id = p.organization_id AND (
                                    (l.entity_type = 'RECEIVING' AND r.id = l.entity_id)
                                 OR (l.entity_type = 'RECEIVING_LINE' AND r.id = (
                                       SELECT rl.receiving_id FROM receiving_line rl WHERE rl.id = l.entity_id)))
                             WHERE l.photo_id = p.id AND l.organization_id = p.organization_id
                               AND r.source = 'local_pickup') THEN 'local_pickup'
               WHEN EXISTS (SELECT 1 FROM photo_entity_links l
                             WHERE l.photo_id = p.id AND l.organization_id = p.organization_id
                               AND l.entity_type IN ('RECEIVING', 'RECEIVING_LINE')) THEN 'unboxing'
              WHEN EXISTS (SELECT 1 FROM photo_entity_links l
                            WHERE l.photo_id = p.id AND l.organization_id = p.organization_id
                              AND l.entity_type IN ('SERIAL_UNIT', 'REPAIR_SERVICE')) THEN 'repair'
               ELSE NULL
             END) AS source_scope
       FROM photos p
      WHERE ${clauses.join(' AND ')}
      ORDER BY p.created_at ${sortDir}, p.id ${sortDir}
      LIMIT ${limitParam}`,
    params,
  );

  const rows = res.rows.map((row) => {
    const ticketRaw = (row as { ticket_id?: number | string | null }).ticket_id;
    const ticketId = ticketRaw != null ? Number(ticketRaw) : null;
    const staffName = (row as { taken_by_staff_name?: string | null }).taken_by_staff_name;
    const labelsRaw = (row as { labels?: unknown }).labels;
    const labels = Array.isArray(labelsRaw)
      ? (labelsRaw as Array<{ id: number; key: string; label: string; color: string | null; icon: string | null }>)
      : [];
    const sourceScope = (row as { source_scope?: string | null }).source_scope ?? null;
    const lineSku = (row as { line_sku?: string | null }).line_sku ?? null;
    const unitIdentity =
      (row as { unit_identity?: { sku?: string | null; serial?: string | null; unitUid?: string | null } | null })
        .unit_identity ?? null;
    const linkedEntityTypes = (row as { linked_entity_types?: string[] | null }).linked_entity_types ?? [];
    return {
      ...mapPhotoRow(row as Parameters<typeof mapPhotoRow>[0]),
      takenByStaffName: staffName ?? null,
      hasAnalysis: Boolean((row as { has_analysis?: boolean }).has_analysis),
      damageDetected: (row as { damage_detected?: boolean | null }).damage_detected ?? null,
      ticketId: ticketId != null && Number.isFinite(ticketId) ? ticketId : null,
      labels,
      sourceScope,
      sku: lineSku ?? unitIdentity?.sku ?? null,
      serialNumber: unitIdentity?.serial ?? null,
      unitUid: unitIdentity?.unitUid ?? null,
      stage: deriveLibraryStage(linkedEntityTypes, (row as { photo_type?: string | null }).photo_type ?? null),
    };
  });
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? items[items.length - 1]?.id ?? null : null;

  return { items, nextCursor, hasMore };
}

/**
 * "Select all matching filters" — the total row count plus up to `cap` photo ids
 * for the SAME filter set as listPhotoLibrary (shared WHERE builder → no drift).
 * The count is a full scan over the filtered set; the id list is capped so we
 * never ship 10k ids to the client. `capped` tells the UI the selection is
 * partial (total > cap).
 */
export async function listPhotoLibraryIds(
  filters: LibraryFilters,
  opts: { cap?: number } = {},
): Promise<{ ids: number[]; total: number; capped: boolean }> {
  const cap = Math.min(Math.max(opts.cap ?? 500, 1), 2000);
  const { clauses, params } = buildLibraryWhere(filters);
  const where = clauses.join(' AND ');

  const countRes = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM photos p WHERE ${where}`,
    params,
  );
  const total = countRes.rows[0]?.total ?? 0;

  const sortDir = filters.sort === 'oldest' ? 'ASC' : 'DESC';
  const idParams = [...params, cap];
  const idsRes = await pool.query<{ id: number }>(
    `SELECT p.id
       FROM photos p
      WHERE ${where}
      ORDER BY p.created_at ${sortDir}, p.id ${sortDir}
      LIMIT $${idParams.length}`,
    idParams,
  );
  const ids = idsRes.rows.map((r) => Number(r.id)).filter((id) => Number.isFinite(id));

  return { ids, total, capped: total > ids.length };
}

// ── Folder aggregation (cheap browse — no photo row materialization) ─────────

import type { PhotoLibraryFolderLevel } from '@/lib/photos/folder-level';

export interface PhotoLibraryFolderTile {
  key: string;
  label: string;
  count: number;
  latestAt: string;
  previewPhotoId: number | null;
  dateFrom?: string;
  dateTo?: string;
  poRef?: string;
  ticketId?: string;
}

interface ListPhotoLibraryFoldersInput extends LibraryFilters {
  level: PhotoLibraryFolderLevel;
  /** Drives entity-folder labels (PO vs Order vs Ticket). */
  sourceScope?: string | null;
}

const FOLDER_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

function folderYearRange(y: string): { dateFrom: string; dateTo: string } {
  return { dateFrom: `${y}-01-01`, dateTo: `${y}-12-31` };
}

function folderMonthRange(mKey: string): { dateFrom: string; dateTo: string } {
  const [y, m] = mKey.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { dateFrom: `${mKey}-01`, dateTo: `${mKey}-${String(last).padStart(2, '0')}` };
}

function folderEntityLabel(key: string, scope: string | null | undefined): {
  label: string;
  poRef?: string;
  ticketId?: string;
} {
  if (key === '__unlinked__') return { label: 'Unlinked' };
  if (key.startsWith('ticket:')) {
    const ticketId = key.slice('ticket:'.length);
    return { label: `#${ticketId}`, ticketId };
  }
  const poRef = key.replace(/^po:/, '');
  if (scope === 'local_pickup') return { label: `Pickup ${poRef}`, poRef };
  if (scope === 'packing') return { label: `Order ${poRef}`, poRef };
  if (scope === 'repair') return { label: `Unit ${poRef}`, poRef };
  return { label: `PO ${poRef}`, poRef };
}

/**
 * Aggregate folder tiles for Media Library browse. Reuses {@link buildLibraryWhere}
 * so counts match list/ids. Does not return photo rows — only GROUP BY buckets.
 */
export async function listPhotoLibraryFolders(
  filters: ListPhotoLibraryFoldersInput,
): Promise<{ tiles: PhotoLibraryFolderTile[]; level: PhotoLibraryFolderLevel }> {
  const { clauses, params } = buildLibraryWhere(filters);
  const where = clauses.join(' AND ');
  const level = filters.level;
  const claims = filters.sourceScope === 'claims' || filters.entityType === 'ZENDESK_TICKET';

  const pstDate = `(p.created_at AT TIME ZONE 'America/Los_Angeles')::date`;

  let bucketExpr: string;
  let orderExpr: string;

  if (level === 'year') {
    bucketExpr = `to_char(${pstDate}, 'YYYY')`;
    orderExpr = `bucket_key DESC`;
  } else if (level === 'month') {
    bucketExpr = `to_char(${pstDate}, 'YYYY-MM')`;
    orderExpr = `bucket_key DESC`;
  } else if (level === 'week') {
    // Calendar year + ISO week (matches client `${y}-W${week}` keys; IW is zero-padded).
    bucketExpr = `to_char(${pstDate}, 'YYYY') || '-W' || (EXTRACT(WEEK FROM ${pstDate})::int)`;
    orderExpr = `MAX(${pstDate}) DESC`;
  } else if (level === 'day') {
    bucketExpr = `to_char(${pstDate}, 'YYYY-MM-DD')`;
    orderExpr = `bucket_key DESC`;
  } else {
    bucketExpr = claims
      ? `COALESCE('ticket:' || (${photoResolvedTicketIdExpr()})::text, '__unlinked__')`
      : `CASE
           WHEN NULLIF(TRIM(p.po_ref), '') IS NOT NULL THEN 'po:' || TRIM(p.po_ref)
           ELSE '__unlinked__'
         END`;
    orderExpr = `MAX(p.created_at) DESC`;
  }

  const res = await pool.query<{
    bucket_key: string;
    cnt: number;
    latest_at: Date | string;
    preview_photo_id: number | null;
    date_from: string | null;
    date_to: string | null;
  }>(
    `SELECT ${bucketExpr} AS bucket_key,
            COUNT(*)::int AS cnt,
            MAX(p.created_at) AS latest_at,
            (ARRAY_AGG(p.id ORDER BY p.created_at DESC, p.id DESC))[1] AS preview_photo_id,
            MIN(${pstDate})::text AS date_from,
            MAX(${pstDate})::text AS date_to
       FROM photos p
      WHERE ${where}
      GROUP BY 1
      ORDER BY ${orderExpr}`,
    params,
  );

  const tiles: PhotoLibraryFolderTile[] = res.rows.map((row) => {
    const key = String(row.bucket_key);
    const count = Number(row.cnt) || 0;
    const latestAt =
      row.latest_at instanceof Date ? row.latest_at.toISOString() : String(row.latest_at ?? '');
    const previewPhotoId =
      row.preview_photo_id != null && Number.isFinite(Number(row.preview_photo_id))
        ? Number(row.preview_photo_id)
        : null;
    const dateFrom = row.date_from ?? undefined;
    const dateTo = row.date_to ?? undefined;

    if (level === 'year') {
      const nav = folderYearRange(key);
      return { key, label: key, count, latestAt, previewPhotoId, ...nav };
    }
    if (level === 'month') {
      const nav = folderMonthRange(key);
      const mo = Number(key.slice(5, 7)) - 1;
      return {
        key,
        label: FOLDER_MONTH_NAMES[mo] ?? key,
        count,
        latestAt,
        previewPhotoId,
        ...nav,
      };
    }
    if (level === 'week') {
      const anchor = dateFrom ?? `${key.slice(0, 4)}-01-01`;
      const nav = weekRange(new Date(`${anchor}T00:00:00Z`));
      return {
        key,
        label: weekRangeLabel(nav.dateFrom, nav.dateTo),
        count,
        latestAt,
        previewPhotoId,
        dateFrom: nav.dateFrom,
        dateTo: nav.dateTo,
      };
    }
    if (level === 'day') {
      return {
        key,
        label: dayLabel(key),
        count,
        latestAt,
        previewPhotoId,
        dateFrom: key,
        dateTo: key,
      };
    }

    const entity = folderEntityLabel(key, filters.sourceScope);
    return {
      key,
      label: entity.label,
      count,
      latestAt,
      previewPhotoId,
      dateFrom: filters.dateFrom ?? dateFrom,
      dateTo: filters.dateTo ?? dateTo,
      poRef: entity.poRef,
      ticketId: entity.ticketId,
    };
  });

  return { tiles, level };
}


