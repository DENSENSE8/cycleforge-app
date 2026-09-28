import { NextRequest, NextResponse, after } from 'next/server';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { ensurePoLinesOnReceiving } from '@/lib/receiving/adopt-po-lines';
import { resolveCartonInvestigations } from '@/lib/receiving/exceptions';
import { upsertReceivingTriage } from '@/lib/receiving/streets/carton-street-write';
import { upsertReceivingLineTesting, upsertReceivingLineZoho } from '@/lib/receiving/facts/narrow';
import { isTestTrackingShortcutAllowed } from '@/lib/tenancy/test-tracking';
import { emitEntitySignalSafe } from '@/lib/surfaces/record-entity-signal';
import { formatPSTTimestamp } from '@/utils/date';
import { getCarrier, extractCanonicalTracking } from '@/lib/tracking-format';
import { getOrSet } from '@/lib/cache/upstash-cache';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { CACHE_NS, CACHE_TAGS } from '@/lib/cache/tags';
import { publishReceivingLogChanged, publishPriorityUnbox } from '@/lib/realtime/publish';
import { ensureSkuCatalogEntry } from '@/lib/neon/sku-catalog-queries';
import { findPendingOrderSkuMatches } from '@/lib/receiving/pending-order-match';
import {
  isIntakeClassification,
  classificationToColumns,
  type IntakeClassification,
} from '@/lib/receiving/intake-classification';
import { registerShipmentPermissive } from '@/lib/shipping/sync-shipment';
import { isReceivingUnifiedInbound } from '@/lib/feature-flags';
import { recordReceivingScan, type ReceivingIntakeSurface } from '@/lib/receiving/record-scan';
import { recordUnboxScanOpened } from '@/lib/receiving/unbox-scan-opened';
import {
  recordUnboxLookupScan,
  resolveUnboxScanKind,
  resolveUnboxScanState,
  type UnboxScanState,
} from '@/lib/receiving/unbox-lookup-scan';
import type { UnboxScanKind } from '@/lib/receiving/unbox-scan-kind';
import { resolveShipmentForScan } from '@/lib/receiving/resolve-shipment-for-scan';
import { RECEIVING_LINE_IMAGE_URL_SQL } from '@/lib/receiving/lines/sql-receiving-image';
import { SKU_CATALOG_JOIN_ON_SQL } from '@/lib/sku/sku-identity-law';
import { resolveInboundCartonByTracking } from '@/lib/inbound/resolve-inbound-tracking';
import { resolveInboundCartonByOrderId } from '@/lib/inbound/resolve-inbound-order';
import type { ReceivingExceptionCode } from '@/lib/receiving/exception-codes';
import {
  upsertOpenTrackingException,
  resolveReceivingExceptionsByReceivingId,
} from '@/lib/tracking-exceptions';
import { routeScan, scannedReceivingId } from '@/lib/barcode-routing';
import { detectStationScanType } from '@/lib/station-scan-routing';
import { withAuth } from '@/lib/auth/withAuth';
import { AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import {
  formatSupportTicketLabel,
  looksLikeTicketScan,
  parseTicketScanValue,
  resolveSupportTicketToReceiving,
} from '@/lib/support/tickets';

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Which of this carton's line SKUs are needed by a currently-pending order.
 * Read-only enhancement — never fails the scan; on error returns [].
 */
async function computePendingOrderSkus(
  organizationId: string,
  lines: ReadonlyArray<{ sku: string | null; zoho_item_id: string | null }>,
): Promise<string[]> {
  try {
    return await findPendingOrderSkuMatches(
      organizationId,
      lines.map((l) => l.sku),
      lines.map((l) => l.zoho_item_id),
    );
  } catch (err) {
    console.warn('lookup-po: pending-order match failed', errMessage(err));
    return [];
  }
}

/** Persist the shared unbox/test urgency flag when a door-scanned carton matches a SKU a pending order needs. */
async function markReceivingPriority(receivingId: number | null, orgId: string): Promise<void> {
  if (!receivingId || !Number.isFinite(receivingId)) return;
  try {
    await withTenantTransaction(orgId, async (client) => {
      // Pending-order match = top urgency:
      const upd = await client.query<{ is_return: boolean | null }>(
        `UPDATE receiving_carton
            SET is_priority = true,
                priority_tier = 0,
                updated_at = NOW()
          WHERE id = $1 AND (priority_tier IS DISTINCT FROM 0 OR is_priority = false)
          RETURNING is_return`,
        [receivingId],
      );
      if ((upd.rowCount ?? 0) === 0) return;
      // COALESCE-once lane routing: never overwrite an operator's manual pick —
      // only stamp when rt.priority_lane is currently unset (read-check, since
      // the street helper's lane field is overwrite-when-present).
      const cur = await client.query<{ priority_lane: string | null }>(
        `SELECT priority_lane FROM receiving_triage
          WHERE receiving_id = $1 AND organization_id = $2
          LIMIT 1`,
        [receivingId, orgId],
      );
      if ((cur.rows[0]?.priority_lane ?? null) == null) {
        await upsertReceivingTriage(client, orgId, receivingId, {
          priorityLane: upd.rows[0]?.is_return ? 'RETURN' : 'PO_STOCKOUT',
        });
      }
    });
  } catch (err) {
    console.warn('lookup-po: markReceivingPriority failed', errMessage(err));
  }
}

async function parallelLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<void> {
  const queue = items.slice();
  const workers = new Array(Math.min(limit, queue.length)).fill(null).map(async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (next === undefined) return;
      try {
        await fn(next);
      } catch {
        /* per-item failures are non-fatal for warmup */
      }
    }
  });
  await Promise.all(workers);
}

interface ReceivingLineLite {
  id: number;
  sku: string | null;
  zoho_item_id: string | null;
  zoho_purchaseorder_id: string | null;
  zoho_purchaseorder_number: string | null;
  source_order_id: string | null;
  inbound_source_type: string | null;
  quantity_expected: number | null;
  quantity_received: number;
  item_name: string | null;
  image_url: string | null;
}

/** The line shape every branch of this route puts on the wire. */
function serializeLookupLine(l: ReceivingLineLite) {
  return {
    id: l.id,
    sku: l.sku,
    item_name: l.item_name,
    image_url: l.image_url,
    zoho_item_id: l.zoho_item_id,
    zoho_purchaseorder_id: l.zoho_purchaseorder_id,
    zoho_purchaseorder_number: l.zoho_purchaseorder_number,
    source_order_id: l.source_order_id,
    inbound_source_type: l.inbound_source_type,
    quantity_expected: l.quantity_expected,
    quantity_received: l.quantity_received,
  };
}

async function fetchLines(receivingId: number, orgId: string): Promise<ReceivingLineLite[]> {
  // Zoho identity reads from receiving_line_zoho (rz) — the spine copies are write-dead and drop next migration.
  const result = await tenantQuery<ReceivingLineLite>(
    orgId,
    `SELECT rl.id, rl.sku, rz.zoho_item_id, rz.zoho_purchaseorder_id,
            rz.zoho_purchaseorder_number, rl.source_order_id, rl.inbound_source_type,
            rl.quantity_expected, rl.quantity_received, rl.item_name,
            ${RECEIVING_LINE_IMAGE_URL_SQL}
     FROM receiving_line rl
     LEFT JOIN receiving_line_zoho rz
       ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
     LEFT JOIN sku_catalog sc ON ${SKU_CATALOG_JOIN_ON_SQL}
     WHERE rl.receiving_id = $1
     ORDER BY rl.id ASC`,
    [receivingId],
  );
  return result.rows;
}

interface ReceivingPackage {
  received_at: string | null;
  unboxed_at: string | null;
  created_at: string | null;
  return_platform: string | null;
  source_platform: string | null;
  is_return: boolean;
}

async function fetchReceivingPackage(receivingId: number, orgId: string): Promise<ReceivingPackage | null> {
  // Door/unbox stamps read from the street tables (receiving_triage rt /
  // receiving_unbox ru) — output aliases stay frozen for the response shape.
  const r = await tenantQuery<ReceivingPackage>(
    orgId,
    `SELECT rt.door_received_at::text AS received_at,
            ru.unboxed_at::text AS unboxed_at,
            r.created_at::text AS created_at,
            r.return_platform::text AS return_platform,
            r.source_platform,
            COALESCE(r.is_return, false) AS is_return
     FROM receiving_carton r
     LEFT JOIN receiving_triage rt ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
     LEFT JOIN receiving_unbox ru ON ru.receiving_id = r.id AND ru.organization_id = r.organization_id
     WHERE r.id = $1
     LIMIT 1`,
    [receivingId],
  );
  return r.rows[0] ?? null;
}

/** Audit + memoize a successful lookup match. */
async function memoizeLookupHit(
  receivingId: number,
  trackingNumber: string,
  receivingSource: string,
  staffId: number | null,
  carrier: string,
  intakeSurface: ReceivingIntakeSurface,
  orgId: string,
): Promise<number> {
  const scanSource: 'zoho_po' | 'unmatched' = receivingSource === 'zoho_po' ? 'zoho_po' : 'unmatched';
  // This helper runs ONLY for a carton that already exists — resolving one is literally what `findScanByTracking` just did — which makes it…
  const scanKind = await resolveUnboxScanKind(orgId, receivingId, intakeSurface);
  return recordReceivingScan(receivingId, trackingNumber, carrier, staffId, scanSource, {
    intakeSurface,
    scanKind,
  });
}

/** Resolve an inbound carrier scan to a local `receiving` row WITHOUT calling Zoho. */
async function findScanByTracking(
  trackingNumber: string,
  staffId: number | null,
  carrier: string,
  orgId: string,
  intakeSurface: ReceivingIntakeSurface = 'triage',
  /**
   * The carton id the RAW scan decoded to, when it decoded to one of our own
   * printed carton labels. Resolved by the caller from the raw value, because
   * `trackingNumber` here has already been through `extractCanonicalTracking`.
   */
  scannedCartonId: number | null = null,
): Promise<{ scan_id: number; receiving_id: number } | null> {
  // ── 0. OUR OWN PRINTED CARTON LABEL — an exact answer, not a match ───────
  if (scannedCartonId != null) {
    const owned = await tenantQuery<{ id: number }>(
      orgId,
      `SELECT id FROM receiving_carton WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [scannedCartonId, orgId],
    );
    const receivingId = owned.rows[0]?.id ?? null;
    if (receivingId != null) {
      const scan_id = await memoizeLookupHit(
        receivingId,
        trackingNumber,
        'unmatched',
        staffId,
        carrier,
        intakeSurface,
        orgId,
      );
      return { scan_id, receiving_id: receivingId };
    }
    // A label for a carton this org does not own is NOT a carrier number.
    // Falling through would mint one; returning null lets the caller refuse.
    return null;
  }

  // ── 1. STN exact-normalized (last-8 demoted to a logged fallback) ────────
  const resolved = await resolveShipmentForScan(trackingNumber, orgId);
  if (resolved.receivingId != null) {
    const scan_id = await memoizeLookupHit(
      resolved.receivingId,
      trackingNumber,
      resolved.receivingSource ?? 'unmatched',
      staffId,
      carrier,
      intakeSurface,
      orgId,
    );
    return { scan_id, receiving_id: resolved.receivingId };
  }

  // ── 1b. Incoming desk / Amazon-returns CSV — mirror tracking → carton ──
  const inbound = await resolveInboundCartonByTracking(orgId as OrgId, trackingNumber).catch(
    () => null,
  );
  if (inbound) {
    const scan_id = await memoizeLookupHit(
      inbound.receivingId,
      trackingNumber,
      'unmatched',
      staffId,
      carrier,
      intakeSurface,
      orgId,
    );
    return { scan_id, receiving_id: inbound.receivingId };
  }

  // ── 2. receiving_scans fallback (STN-less rows) ─────────────────────────
  const digits = String(trackingNumber || '').replace(/\D/g, '');
  if (digits.length < 8) return null;
  const last8 = digits.slice(-8);
  const scanHit = await tenantQuery<{ scan_id: number; receiving_id: number }>(
    orgId,
    `SELECT id AS scan_id, receiving_id
       FROM receiving_scans
      WHERE RIGHT(regexp_replace(tracking_number, '\\D', '', 'g'), 8) = $1
      ORDER BY id DESC
      LIMIT 2`,
    [last8],
  );
  if (scanHit.rows.length === 1) return scanHit.rows[0];

  return null;
}

export interface LocalPoResolution {
  poId: string;
  /** True when the match came from the PO's registered Reference# — which, per the inbound contract, IS the carrier tracking for that… */
  viaTrackingReference: boolean;
}

/** Order# / PO-reference resolution against the LOCAL incoming mirror — no Zoho. */
async function resolvePoIdLocally(orderNumber: string, orgId: string): Promise<LocalPoResolution | null> {
  const norm = orderNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!norm) return null;
  // order#→poId is an immutable mapping once the incoming sync materializes it, so cache the FOUND result (5 min).
  return getOrSet<LocalPoResolution | null>(
    CACHE_NS.poByRef,
    orgId,
    norm,
    300,
    [CACHE_TAGS.poByRef],
    async () => {
      // Tenant-scoped via the GUC pool:
      const rl = await tenantQuery<{ zoho_purchaseorder_id: string }>(
        orgId,
        `SELECT zoho_purchaseorder_id
           FROM receiving_line_zoho
          WHERE zoho_purchaseorder_number_norm = $1
            AND zoho_purchaseorder_id IS NOT NULL
          ORDER BY receiving_line_id DESC
          LIMIT 1`,
        [norm],
      );
      if (rl.rows[0]?.zoho_purchaseorder_id) {
        return { poId: String(rl.rows[0].zoho_purchaseorder_id), viaTrackingReference: false };
      }
      // 2. zoho_po_mirror — by PO number, else by reference number. Select the
      //    PO-number norm alongside so the caller can tell which side matched.
      const m = await tenantQuery<{ zoho_purchaseorder_id: string; zoho_purchaseorder_number_norm: string | null }>(
        orgId,
        `SELECT zoho_purchaseorder_id, zoho_purchaseorder_number_norm
           FROM zoho_po_mirror
          WHERE zoho_purchaseorder_number_norm = $1
             OR NULLIF(upper(regexp_replace(COALESCE(reference_number, ''), '[^A-Za-z0-9]', '', 'g')), '') = $1
          ORDER BY last_synced_at DESC NULLS LAST
          LIMIT 1`,
        [norm],
      );
      if (!m.rows[0]?.zoho_purchaseorder_id) return null;
      return {
        poId: String(m.rows[0].zoho_purchaseorder_id),
        viaTrackingReference: m.rows[0].zoho_purchaseorder_number_norm !== norm,
      };
    },
  );
}

/** Tracking → PO id resolution against LOCAL data only — no Zoho. */
async function resolvePoIdLocallyByTracking(
  trackingNumber: string,
  preassignedReceivingId: number | null,
  orgId: string,
): Promise<string | null> {
  // 1. Authoritative: the STN-resolved receiving row already holds the PO id
  //    (the incoming sync stamped source='zoho_po', zoho_purchaseorder_id).
  if (preassignedReceivingId != null) {
    const r = await tenantQuery<{ zoho_purchaseorder_id: string | null }>(
      orgId,
      `SELECT zoho_purchaseorder_id FROM receiving_carton
        WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [preassignedReceivingId, orgId],
    );
    const poId = r.rows[0]?.zoho_purchaseorder_id;
    if (poId) return String(poId);
  }
  // 2. Fallback: zoho_po_mirror header whose Reference# carries this tracking.
  //    Exact canonical match only (no lossy last-8) — Reference# isn't always a
  //    tracking, so a suffix collision could open the wrong PO.
  const canon = trackingNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!canon) return null;
  const m = await tenantQuery<{ zoho_purchaseorder_id: string }>(
    orgId,
    `SELECT zoho_purchaseorder_id
       FROM zoho_po_mirror
      WHERE NULLIF(upper(regexp_replace(COALESCE(reference_number, ''), '[^A-Za-z0-9]', '', 'g')), '') = $1
      ORDER BY last_synced_at DESC NULLS LAST
      LIMIT 1`,
    [canon],
  );
  if (m.rows[0]?.zoho_purchaseorder_id) return String(m.rows[0].zoho_purchaseorder_id);

  // 3. Digit-prefix near-miss — truncated Zoho Reference# (e.g. missing one
  //    digit before the carrier suffix). Require an unambiguous single hit.
  const digits = canon.replace(/\D/g, '');
  if (digits.length < 8) return null;
  const near = await tenantQuery<{ zoho_purchaseorder_id: string }>(
    orgId,
    `SELECT zoho_purchaseorder_id
       FROM zoho_po_mirror
      WHERE organization_id = $2
        AND NULLIF(regexp_replace(COALESCE(reference_number, ''), '[^0-9]', '', 'g'), '') IS NOT NULL
        AND abs(
              length(regexp_replace(COALESCE(reference_number, ''), '[^0-9]', '', 'g'))
              - length($1)
            ) BETWEEN 1 AND 2
        AND (
              regexp_replace(COALESCE(reference_number, ''), '[^0-9]', '', 'g') LIKE $1 || '%'
           OR $1 LIKE regexp_replace(COALESCE(reference_number, ''), '[^0-9]', '', 'g') || '%'
            )
      ORDER BY last_synced_at DESC NULLS LAST
      LIMIT 2`,
    [digits, orgId],
  );
  if (near.rows.length !== 1) return null;
  console.warn('[lookup-po] digit-prefix near-miss on zoho_po_mirror.reference_number', {
    digits,
    zoho_purchaseorder_id: near.rows[0]?.zoho_purchaseorder_id,
  });
  return near.rows[0]?.zoho_purchaseorder_id
    ? String(near.rows[0].zoho_purchaseorder_id)
    : null;
}

/** Verify a resolved PO id actually carries the scanned PO#/reference. */
async function verifyPoNumberMatches(
  poId: string,
  orderNumber: string,
  orgId: string,
): Promise<'match' | 'mismatch' | 'unknown'> {
  const norm = orderNumber.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!norm) return 'unknown';
  const { rows } = await tenantQuery<{ matches: boolean }>(
    orgId,
    `SELECT (
              zoho_purchaseorder_number_norm = $2
              OR NULLIF(upper(regexp_replace(COALESCE(reference_number, ''), '[^A-Za-z0-9]', '', 'g')), '') = $2
            ) AS matches
       FROM zoho_po_mirror
      WHERE zoho_purchaseorder_id = $1
      LIMIT 1`,
    [poId, norm],
  );
  if (rows.length === 0) return 'unknown';
  return rows[0].matches ? 'match' : 'mismatch';
}

/**
 * Adopt / claim local PO lines onto the carton, then import when still empty
 * (shared SoT: {@link ensurePoLinesOnReceiving}). Optional live sync is inside
 * the helper — this route never imports zoho-receiving-sync directly.
 */
async function linkLocalPoLinesToReceiving(poId: string, receivingId: number, orgId: string): Promise<number> {
  const result = await ensurePoLinesOnReceiving(poId, receivingId, orgId, {
    importIfEmpty: true,
  });
  await stampInboundHandlingUnit(receivingId, orgId);
  return result.lineCount;
}

/** Phase 3 (unified inbound) — assign the carton an LPN and propagate the receiving row's shipment_id down to its lines, so a delivered… */
async function stampInboundHandlingUnit(receivingId: number, orgId: string): Promise<void> {
  if (!isReceivingUnifiedInbound()) return;
  try {
    // (receiving.lpn dropped 2026-07-05e — it was a dead 'RC-<id>' alias of the
    // primary key; carton identity is the id / handling_unit_id.)
    await tenantQuery(
      orgId,
      `UPDATE receiving_line rl
          SET shipment_id = r.shipment_id
         FROM receiving_carton r
        WHERE rl.receiving_id = $1
          AND r.id = $1
          AND r.shipment_id IS NOT NULL
          AND rl.shipment_id IS DISTINCT FROM r.shipment_id`,
      [receivingId],
    );
  } catch (err) {
    // Never fail a scan over the handling-unit stamp — it's an enrichment.
    console.warn(`[lookup-po] stampInboundHandlingUnit failed for receiving=${receivingId}:`, err);
  }
}

async function upsertMatchedReceiving(
  poId: string,
  carrier: string,
  staffId: number | null,
  organizationId: string,
  intakeSurface: ReceivingIntakeSurface = 'triage',
): Promise<{ receivingId: number; preexisting: boolean }> {
  const now = formatPSTTimestamp();
  // Door-arrival stamp is TRIAGE-owned street state (receiving_triage.
  const doorAt = intakeSurface === 'triage' ? now : null;
  const doorBy = intakeSurface === 'triage' ? staffId : null;
  // Carton upsert + triage door stamp in ONE tenant transaction.
  return withTenantTransaction(organizationId, async (client) => {
    const result = await client.query<{ id: number; xmax: string }>(
      // Target the base table (not the `receiving` compat view): views cannot do
      // INSERT ... ON CONFLICT, and xmax is a base-table system column. 2026-07-05d.
      `INSERT INTO receiving_carton
         (source, zoho_purchaseorder_id, carrier, receiving_date_time,
          qa_status, needs_test, updated_at, organization_id)
       VALUES ('zoho_po', $1, $2, NOW(), 'PENDING', true, $3::timestamptz, $4::uuid)
       ON CONFLICT (zoho_purchaseorder_id) WHERE source = 'zoho_po' AND zoho_purchaseorder_id IS NOT NULL
       DO UPDATE SET
         updated_at = EXCLUDED.updated_at,
         carrier = COALESCE(receiving_carton.carrier, EXCLUDED.carrier),
         organization_id = COALESCE(receiving_carton.organization_id, EXCLUDED.organization_id)
       RETURNING id, xmax::text`,
      [poId, carrier || null, now, organizationId],
    );
    const row = result.rows[0];
    const receivingId = Number(row.id);
    if (doorAt != null) {
      await upsertReceivingTriage(client, organizationId, receivingId, {
        doorReceivedAt: doorAt,
        doorReceivedBy: doorBy ?? null,
      });
    }
    return { receivingId, preexisting: row.xmax !== '0' };
  });
}

async function createUnmatchedReceiving(
  trackingNumber: string,
  carrier: string,
  staffId: number | null,
  organizationId: string,
  intakeSurface: ReceivingIntakeSurface = 'triage',
): Promise<{ receivingId: number; shipmentId: number | null }> {
  const now = formatPSTTimestamp();
  const shipment = await registerShipmentPermissive({
    trackingNumber,
    sourceSystem: 'receiving_lookup_po',
  }, organizationId);
  // Door-arrival stamp is TRIAGE-owned street state (mirrors record-scan.ts:114 / the matched upsert above):
  const doorAt = intakeSurface === 'triage' ? now : null;
  const doorBy = intakeSurface === 'triage' ? staffId : null;
  // Stamp organization_id explicitly rather than leaning on the column default
  // (the GUC default is NULL on this raw-pool path). Receiving is a tenant-owned
  // table; an unmatched door-scan must land under the scanning operator's org.
  const receivingId = await withTenantTransaction(organizationId, async (client) => {
    const result = await client.query<{ id: number }>(
      `INSERT INTO receiving_carton
         (source, shipment_id, carrier, receiving_date_time,
          qa_status, needs_test, updated_at, organization_id)
       VALUES ('unmatched', $1, $2, NOW(), 'PENDING', true, $3::timestamptz, $4::uuid)
       RETURNING id`,
      [shipment?.id ?? null, carrier || null, now, organizationId],
    );
    const rid = Number(result.rows[0].id);
    if (doorAt != null) {
      await upsertReceivingTriage(client, organizationId, rid, {
        doorReceivedAt: doorAt,
        doorReceivedBy: doorBy ?? null,
      });
    }
    return rid;
  });
  // Phase 5: tag the OS&D reason. No carrier resolved → CARRIER_MISMATCH;
  // otherwise it's a scanned box with no matching PO → NO_PO.
  const exceptionCode: ReceivingExceptionCode =
    !carrier || carrier.trim().toUpperCase() === 'UNKNOWN' ? 'CARRIER_MISMATCH' : 'NO_PO';
  await stampReceivingException(receivingId, exceptionCode, organizationId);
  // Carton-level "why" signal (plan §2.3 emitter #2 — unfound / carrier
  // mismatch, decided right here). Fire-and-forget; never breaks the scan.
  await emitEntitySignalSafe({
    organizationId,
    entityType: 'RECEIVING',
    entityId: receivingId,
    signalKind: 'exception_why',
    reasonCode: exceptionCode,
    notes: 'unmatched door scan',
    actorStaffId: staffId ?? null,
    meta: { carrier: carrier || null, shipmentId: shipment?.id ?? null },
  });
  return {
    receivingId,
    shipmentId: shipment?.id ?? null,
  };
}

/**
 * Best-effort OS&D reason stamp (Phase 5). Tolerant of the column not existing
 * yet (pre-migration) — a failure here must never break a scan, so it warns and
 * returns. Once 2026-06-08_receiving_exception_code is applied it persists.
 */
async function stampReceivingException(
  receivingId: number,
  code: ReceivingExceptionCode,
  orgId: string,
): Promise<void> {
  try {
    await tenantQuery(orgId, `UPDATE receiving_carton SET exception_code = $2 WHERE id = $1`, [receivingId, code]);
  } catch (err) {
    console.warn(`[lookup-po] exception_code stamp skipped for receiving=${receivingId}:`, err);
  }
}

// ── Test / demo shortcut ───────────────────────────────────────────────────── A tracking that starts with "TEST" (e.g.
const TEST_TRACKING_RE = /^TEST/i;

function isTestTracking(tracking: string): boolean {
  return TEST_TRACKING_RE.test(tracking.trim());
}

/** Stable synthetic PO id for a test tracking, e.g. "TEST123" → "TEST-PO-TEST123". */
function testPoIdFor(trackingNumber: string): string {
  const key =
    trackingNumber.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 32) || 'TEST';
  return `TEST-PO-${key}`;
}

async function createOrGetTestReceiving(
  trackingNumber: string,
  carrier: string,
  staffId: number | null,
  organizationId: string,
): Promise<{ receivingId: number; scanId: number; preexisting: boolean; poId: string }> {
  const poId = testPoIdFor(trackingNumber);
  const key = poId.slice('TEST-PO-'.length);
  const zohoItemId = `TEST-ITEM-${key}`;
  const zohoLineItemId = `TEST-LINE-${key}`;

  const { receivingId, preexisting } = await upsertMatchedReceiving(poId, carrier, staffId, organizationId);
  const scanId = await recordReceivingScan(receivingId, trackingNumber, carrier, staffId, 'zoho_po');

  // A scanned test carton belongs in receiving triage as a SCANNED line — NOT the tech testing queue.
  await tenantQuery(organizationId, `UPDATE receiving_carton SET needs_test = false WHERE id = $1`, [receivingId]);

  // rz-keyed dedupe (Wave-3 writer inversion):
  await withTenantTransaction(organizationId, async (client) => {
    const txDeps = {
      query: ((_org: OrgId, sql: string, p?: unknown[]) => client.query(sql, p)) as typeof tenantQuery,
    };
    const existing = await client.query<{ receiving_line_id: number }>(
      `SELECT rz.receiving_line_id
         FROM receiving_line_zoho rz
         JOIN receiving_line rl
           ON rl.id = rz.receiving_line_id AND rl.organization_id = rz.organization_id
        WHERE rz.organization_id = $1
          AND rz.zoho_purchaseorder_id = $2
          AND rz.zoho_line_item_id = $3
        LIMIT 1
        FOR UPDATE OF rl`,
      [organizationId, poId, zohoLineItemId],
    );
    if (existing.rows[0]) {
      await upsertReceivingLineTesting(
        organizationId as OrgId,
        Number(existing.rows[0].receiving_line_id),
        { needsTest: false },
        txDeps,
      );
      return;
    }
    const ins = await client.query<{ id: number }>(
      `INSERT INTO receiving_line
         (receiving_id, item_name, sku, quantity_expected, quantity_received,
          workflow_status, updated_at, organization_id)
       VALUES ($1, $2, 'TEST-SKU', 1, 0, 'MATCHED', NOW(), $3::uuid)
       RETURNING id`,
      [receivingId, `Test item · ${key}`, organizationId],
    );
    const lineId = Number(ins.rows[0].id);
    await upsertReceivingLineZoho(organizationId as OrgId, lineId, {
      zohoItemId,
      zohoLineItemId,
      zohoPurchaseOrderId: poId,
    }, txDeps);
    await upsertReceivingLineTesting(organizationId as OrgId, lineId, {
      needsTest: false,
      qaStatus: 'PENDING',
      dispositionCode: 'HOLD',
      conditionGrade: 'BRAND_NEW',
      dispositionAudit: [],
    }, txDeps);
  });

  return { receivingId, scanId, preexisting, poId };
}

async function recordScan(
  receivingId: number,
  trackingNumber: string,
  carrier: string,
  staffId: number | null,
  source: 'zoho_po' | 'unmatched',
  intakeSurface: ReceivingIntakeSurface = 'triage',
  // Required at every call site (see the `stampUnboxOpened` note): these paths
  // reach cartons that `upsertMatchedReceiving` / the preassigned re-scan
  // branch resolved rather than created, so `work` cannot be assumed.
  scanKind: UnboxScanKind = 'work',
  // Default true (every existing call site). The ORDER# mode branch passes
  // false when the scanned value resolved as a pure PO identity, not a
  // carrier tracking number — see `RecordReceivingScanOptions.registerTracking`.
  registerTracking = true,
): Promise<number> {
  return recordReceivingScan(receivingId, trackingNumber, carrier, staffId, source, {
    intakeSurface,
    scanKind,
    registerTracking,
  });
}

/** Persist the door operator's intake classification onto the carton's `receiving` row (source_platform / is_return / return_platform). */
async function applyIntakeClassification(
  receivingId: number | null,
  classification: IntakeClassification | null,
  orgId: string,
): Promise<void> {
  if (!receivingId || !classification || classification === 'UNKNOWN') return;
  const cols = classificationToColumns(classification);
  await tenantQuery(
    orgId,
    `UPDATE receiving_carton
        SET source_platform = $2, is_return = $3, return_platform = $4, updated_at = NOW()
      WHERE id = $1`,
    [receivingId, cols.source_platform, cols.is_return, cols.return_platform],
  );
}

export const POST = withAuth(async (request: NextRequest, ctx) => {
  const body = await request.json();
  const rawTracking = String(body?.trackingNumber || '').trim();
  const providedCarrier = String(body?.carrier || '').trim();
  // Scan route. 'order' = explicit PO/reference (operator armed PO# mode); 'tracking' = explicit carrier tracking (operator armed Tracking…
  const mode: 'tracking' | 'order' | 'ticket' | 'auto' =
    body?.mode === 'order'
      ? 'order'
      : body?.mode === 'ticket'
        ? 'ticket'
        : body?.mode === 'auto'
          ? 'auto'
          : 'tracking';
  // Scan hot path is LOCAL-DB ONLY for every identity (tracking / ticket / order / auto).
  void body?.localOnly;
  // Canonicalize carrier scans at the ingestion boundary so a scanned GS1/"96" FedEx barcode (e.g.
  const scannedCartonId = scannedReceivingId(rawTracking);
  /** The ticket number when the raw value is a printed TICKET label. */
  const scannedTicketValue = (() => {
    const redirect = routeScan(rawTracking)?.redirect ?? '';
    const m = /^\/support\?ticket=(\d+)$/.exec(redirect);
    return m ? m[1] : null;
  })();
  // A house handle that is NOT a carton (a unit, a line, a shelf address, a
  // kit manifest) is likewise not a carrier number. Tickets are excluded —
  // they have a legitimate branch below that resolves them to a carton.
  const isNonCartonHandle =
    scannedCartonId == null &&
    scannedTicketValue == null &&
    detectStationScanType(rawTracking) === 'HANDLE' &&
    !looksLikeTicketScan(rawTracking);
  const poLookupValue = rawTracking;
  const trackingNumber =
    mode === 'order' || mode === 'ticket'
      ? rawTracking
      : extractCanonicalTracking(rawTracking) || rawTracking;
  // Optional door-intake classification (e.g. 'FBA_RETURN'). Maps to the
  // carton's source_platform/is_return/return_platform so the unboxer sees it.
  const classification: IntakeClassification | null = isIntakeClassification(body?.classification)
    ? body.classification
    : null;
  // Server-trusted actor from the verified session cookie.
  const staffId = ctx.staffId;
  const intakeSurface = body?.intakeSurface === 'unbox' ? 'unbox' : 'triage';
  /** The lookup verdict has to reach the RESPONSE, not just the writes: */
  let lookupScanState: UnboxScanState | null = null;

  /**
   * Is this scan WORK on the carton, or a LOOKUP of already-finished work?
   * Only meaningful for a PRE-EXISTING carton — a carton created by this very
   * request is definitionally unworked, so those paths never pay for the read.
   */
  const scanStateFor = async (receivingId: number): Promise<UnboxScanState> => {
    const state = await resolveUnboxScanState(ctx.organizationId, receivingId, intakeSurface);
    if (state.kind === 'lookup') lookupScanState = state;
    return state;
  };

  const scanKindFor = async (receivingId: number): Promise<UnboxScanKind> =>
    (await scanStateFor(receivingId)).kind;

  /**
   * Lookup facts for a carton-opening response. Spread LAST so it wins, and
   * absent entirely on a work scan — the client tests `scan_kind === 'lookup'`,
   * so an always-present field would have to lie on the work path.
   */
  const lookupResponseFields = () =>
    lookupScanState
      ? {
          scan_kind: 'lookup' as const,
          unboxed_at: lookupScanState.unboxedAt,
          unboxed_by_name: lookupScanState.unboxedByName,
          po_number: lookupScanState.poNumber,
        }
      : {};

  /** Most branches reach `stampUnboxOpened` with a carton they may or may not have just created — `upsertMatchedReceiving` /… */
  const scanKindForMaybeExisting = (
    receivingId: number,
    preexisting: boolean,
  ): Promise<UnboxScanKind> =>
    preexisting ? scanKindFor(receivingId) : Promise.resolve('work');

  /** `scanKind` is REQUIRED, deliberately. */
  const stampUnboxOpened = async (
    receivingId: number,
    scanId: number | null,
    tracking: string,
    scanKind: UnboxScanKind,
  ) => {
    if (intakeSurface !== 'unbox') return;
    // A lookup neither opens nor re-opens: `opened_at` is COALESCE-once so it
    // would not move anyway, but UNBOX_SCAN_OPENED is a work event and must
    // not fire for an inspection.
    if (scanKind === 'lookup') {
      await recordUnboxLookupScan({
        organizationId: ctx.organizationId,
        receivingId,
        actorStaffId: staffId,
        trackingNumber: tracking,
      });
      return;
    }
    await recordUnboxScanOpened(ctx.organizationId, receivingId, staffId, scanId, tracking);
  };

  if (!trackingNumber) {
    return NextResponse.json(
      { success: false, error: 'trackingNumber is required' },
      { status: 400 },
    );
  }

  const carrier =
    providedCarrier && providedCarrier !== 'Unknown'
      ? providedCarrier
      : getCarrier(trackingNumber);

  // −1. TICKET# — resolve an internal support ticket id to its receiving carton
  //     (support_tickets + ticket_links). Runs before PO/tracking.
  const tryTicket =
    mode === 'ticket'
    || scannedTicketValue != null
    || (mode === 'auto' && looksLikeTicketScan(rawTracking));
  if (tryTicket) {
    // Decoded label first, then the bare-number parser for a typed value.
    const ticketScanValue = scannedTicketValue ?? rawTracking;
    const ticketId: number | null =
      scannedTicketValue != null ? Number(scannedTicketValue) : parseTicketScanValue(rawTracking);
    if (mode === 'ticket' && ticketId == null) {
      return NextResponse.json({
        success: true,
        matched: false,
        po_matched: false,
        not_found: true,
        po_ids: [],
        error: `No ticket found for "${rawTracking}"`,
      });
    }
    if (ticketId != null) {
      const hit = await resolveSupportTicketToReceiving(ctx.organizationId, ticketScanValue).catch(
        () => null,
      );
      if (hit) {
        await applyIntakeClassification(hit.receivingId, classification, ctx.organizationId);
        const [lines, receiving_package] = await Promise.all([
          fetchLines(hit.receivingId, ctx.organizationId),
          fetchReceivingPackage(hit.receivingId, ctx.organizationId),
        ]);
        const recvSourceRes = await tenantQuery<{ source: string | null }>(
          ctx.organizationId,
          `SELECT source FROM receiving_carton WHERE id = $1 AND organization_id = $2 LIMIT 1`,
          [hit.receivingId, ctx.organizationId],
        );
        const recvSource = String(recvSourceRes.rows[0]?.source || 'unmatched');
        const hitScanKind = await scanKindFor(hit.receivingId);
        const scanId = await recordReceivingScan(
          hit.receivingId,
          rawTracking,
          carrier,
          staffId,
          recvSource === 'zoho_po' ? 'zoho_po' : 'unmatched',
          { intakeSurface, scanKind: hitScanKind },
        );
        await stampUnboxOpened(hit.receivingId, scanId, rawTracking, hitScanKind);
        const poIdsSet = new Set<string>();
        for (const l of lines) {
          if (l.zoho_purchaseorder_id) poIdsSet.add(l.zoho_purchaseorder_id);
        }
        const pendingOrderSkus = await computePendingOrderSkus(ctx.organizationId, lines);
        if (pendingOrderSkus.length > 0) {
          await markReceivingPriority(hit.receivingId, ctx.organizationId);
          after(async () => {
            try {
              await publishPriorityUnbox({
                organizationId: ctx.organizationId,
                staffId,
                trackingNumber: rawTracking,
                receivingId: hit.receivingId,
                skus: pendingOrderSkus,
                source: 'receiving.lookup-po.ticket',
              });
            } catch (err) {
              console.warn('lookup-po.ticket: priority-unbox publish failed', errMessage(err));
            }
          });
        }
        return NextResponse.json({
          success: true,
          ...lookupResponseFields(),
          receiving_id: hit.receivingId,
          scan_id: scanId,
          preexisting: true,
          deduped: false,
          matched: lines.length > 0,
          po_matched: lines.length > 0,
          resolved_via: 'local',
          unbox_verdict: pendingOrderSkus.length > 0 ? 'expedited' : 'normal',
          po_ids: Array.from(poIdsSet),
          pending_order_skus: pendingOrderSkus,
          receiving_package,
          lines: lines.map(serializeLookupLine),
        });
      }
      if (mode === 'ticket') {
        return NextResponse.json({
          success: true,
          matched: false,
          po_matched: false,
          not_found: true,
          po_ids: [],
          error: `No receiving carton linked to ticket ${formatSupportTicketLabel(ticketId)}`,
        });
      }
    }
  }

  // 0. ORDER# mode — resolve a PO / reference number from LOCAL mirror only (zoho_po_mirror / receiving_line_zoho / EXPECTED lines).
  if (mode === 'order' || mode === 'auto') {
    const localResolution = await resolvePoIdLocally(poLookupValue, ctx.organizationId);
    let poId = localResolution?.poId ?? null;
    // Whether the scanned value is a real carrier tracking number (matched the PO's Reference#) vs.
    let poMatchIsTracking = localResolution?.viaTrackingReference ?? false;
    const resolvedVia = 'local' as const;
    // Guard the local hit:
    if (poId) {
      const verdict = await verifyPoNumberMatches(poId, poLookupValue, ctx.organizationId).catch((err) => {
        console.warn('[lookup-po.order] local verify failed', errMessage(err));
        return 'unknown' as const;
      });
      if (verdict === 'mismatch') {
        console.warn(
          `[lookup-po.order] local resolve for "${poLookupValue}" pointed at PO ${poId} with a different number — treating as miss`,
        );
        poId = null;
        poMatchIsTracking = false;
      }
    }
    // `auto` also tries the value as a tracking# against LOCAL data (the zoho_po_mirror Reference# → PO id), so an un-armed tracking scan that…
    if (!poId && mode === 'auto') {
      const localByTracking = await resolvePoIdLocallyByTracking(
        trackingNumber,
        null,
        ctx.organizationId,
      ).catch(() => null);
      if (localByTracking) {
        poId = localByTracking;
        poMatchIsTracking = true;
      }
    }

    // Marketplace / manual desk intake — match source_order_id (eBay /
    // Amazon / Goodwill) when Zoho PO# missed. Mint a carton if the line is
    // still EXPECTED with receiving_id NULL so Unbox can open the work.
    if (!poId && (mode === 'order' || mode === 'auto')) {
      const inboundOrder = await resolveInboundCartonByOrderId(
        ctx.organizationId as OrgId,
        poLookupValue,
      ).catch((err) => {
        console.warn('[lookup-po.order] inbound order resolve failed', errMessage(err));
        return null;
      });
      if (inboundOrder) {
        const receivingId = inboundOrder.receivingId;
        const orderScanKind = await scanKindForMaybeExisting(
          receivingId,
          !inboundOrder.createdCarton,
        );
        const orderScanId = await recordScan(
          receivingId,
          trackingNumber,
          carrier,
          staffId,
          'unmatched',
          intakeSurface,
          orderScanKind,
          false,
        );
        await stampUnboxOpened(receivingId, orderScanId, trackingNumber, orderScanKind);
        await applyIntakeClassification(receivingId, classification, ctx.organizationId);

        const [lines, receiving_package] = await Promise.all([
          fetchLines(receivingId, ctx.organizationId),
          fetchReceivingPackage(receivingId, ctx.organizationId),
        ]);
        const pendingOrderSkus = await computePendingOrderSkus(ctx.organizationId, lines);

        after(async () => {
          try {
            await invalidateReceivingViews(ctx.organizationId);
          } catch (err) {
            console.warn('[lookup-po.order] inbound cache invalidation failed', errMessage(err));
          }
          try {
            await publishReceivingLogChanged({
              organizationId: ctx.organizationId,
              action: 'insert',
              rowId: String(receivingId),
              source: 'receiving.lookup-po.inbound-order',
            });
          } catch (err) {
            console.warn('[lookup-po.order] inbound realtime publish failed', errMessage(err));
          }
          if (pendingOrderSkus.length > 0) {
            await markReceivingPriority(receivingId, ctx.organizationId);
            try {
              await publishPriorityUnbox({
                organizationId: ctx.organizationId,
                staffId,
                trackingNumber,
                receivingId,
                skus: pendingOrderSkus,
                source: 'receiving.lookup-po.inbound-order',
              });
            } catch (err) {
              console.warn(
                '[lookup-po.order] inbound priority-unbox publish failed',
                errMessage(err),
              );
            }
          }
        });

        return NextResponse.json({
          success: true,
          receiving_id: receivingId,
          ...lookupResponseFields(),
          preexisting: !inboundOrder.createdCarton,
          deduped: false,
          matched: lines.length > 0,
          po_matched: true,
          resolved_via: 'local',
          unbox_verdict: pendingOrderSkus.length > 0 ? 'expedited' : 'normal',
          po_ids: [],
          inbound_source_type: inboundOrder.sourceType,
          inbound_source_order_id: inboundOrder.sourceOrderId,
          pending_order_skus: pendingOrderSkus,
          receiving_package,
          lines: lines.map(serializeLookupLine),
          scan_id: orderScanId,
        });
      }
    }

    if (!poId && mode === 'order') {
      // Explicit order mode, PO# + marketplace order# missed locally —
      // report not-found WITHOUT spawning a phantom carton and WITHOUT
      // calling live Zoho.
      return NextResponse.json({
        success: true,
        matched: false,
        po_matched: false,
        not_found: true,
        po_ids: [],
        error: `No PO found for order number "${poLookupValue}"`,
      });
    }

    // PO# resolved → open the matched carton.
    if (poId) {

    const { receivingId, preexisting: orderPreexisting } = await upsertMatchedReceiving(poId, carrier, staffId, ctx.organizationId, intakeSurface);
    const linked = await linkLocalPoLinesToReceiving(poId, receivingId, ctx.organizationId);
    // `upsertMatchedReceiving` returns an EXISTING carton when this PO was scanned before, so this site can land on finished work.
    const orderScanKind = await scanKindForMaybeExisting(receivingId, orderPreexisting);
    // Adopt/claim local lines (unattached + unmatched donors); import only when still empty — see linkLocalPoLinesToReceiving / adopt-po-lines.
    const orderScanId = await recordScan(
      receivingId,
      trackingNumber,
      carrier,
      staffId,
      'zoho_po',
      intakeSurface,
      orderScanKind,
      poMatchIsTracking,
    );
    await stampUnboxOpened(receivingId, orderScanId, trackingNumber, orderScanKind);
    await applyIntakeClassification(receivingId, classification, ctx.organizationId);

    const [lines, receiving_package] = await Promise.all([
      fetchLines(receivingId, ctx.organizationId),
      fetchReceivingPackage(receivingId, ctx.organizationId),
    ]);
    const pendingOrderSkus = await computePendingOrderSkus(ctx.organizationId, lines);

    after(async () => {
      try {
        await invalidateReceivingViews(ctx.organizationId);
      } catch (err) {
        console.warn('[lookup-po.order] cache invalidation failed', errMessage(err));
      }
      try {
        await publishReceivingLogChanged({
          organizationId: ctx.organizationId,
          action: 'insert',
          rowId: String(receivingId),
          source: 'receiving.lookup-po.order',
        });
      } catch (err) {
        console.warn('[lookup-po.order] realtime publish failed', errMessage(err));
      }
      if (pendingOrderSkus.length > 0) {
        await markReceivingPriority(receivingId, ctx.organizationId);
        try {
          await publishPriorityUnbox({
            organizationId: ctx.organizationId,
            staffId,
            trackingNumber,
            receivingId,
            skus: pendingOrderSkus,
            source: 'receiving.lookup-po.order',
          });
        } catch (err) {
          console.warn('[lookup-po.order] priority-unbox publish failed', errMessage(err));
        }
      }
    });

    return NextResponse.json({
      success: true,
      receiving_id: receivingId,
      ...lookupResponseFields(),
      preexisting: linked > 0,
      deduped: false,
      matched: lines.length > 0,
      po_matched: true,
      resolved_via: resolvedVia,
      unbox_verdict: pendingOrderSkus.length > 0 ? 'expedited' : 'normal',
      po_ids: [poId],
      pending_order_skus: pendingOrderSkus,
      receiving_package,
      lines: lines.map(serializeLookupLine),
    });
    } // end if (poId) — auto PO#-miss falls through to the tracking path below
  }

  // 1. Dedup short-circuit — scan already logged against a receiving row.
  const existingScan = await findScanByTracking(
    trackingNumber,
    staffId,
    carrier,
    ctx.organizationId,
    intakeSurface,
    scannedCartonId,
  );
  let preassignedReceivingId: number | null = null;
  let preassignedScanId: number | null = null;
  if (existingScan) {
    await applyIntakeClassification(existingScan.receiving_id, classification, ctx.organizationId);
    const [lines, receiving_package] = await Promise.all([
      fetchLines(existingScan.receiving_id, ctx.organizationId),
      fetchReceivingPackage(existingScan.receiving_id, ctx.organizationId),
    ]);
    if (lines.length > 0) {
      // Re-attribute this dock event to the current operator (dedup path
      // used to leave scanned_by stale or NULL via memoizeLookupHit).
      const recvSourceRes = await tenantQuery<{ source: string | null }>(
        ctx.organizationId,
        `SELECT source FROM receiving_carton WHERE id = $1 AND organization_id = $2 LIMIT 1`,
        [existingScan.receiving_id, ctx.organizationId],
      );
      const recvSource = String(recvSourceRes.rows[0]?.source || 'unmatched');
      // "Re-attribute this dock event to the current operator" is right for a
      // work scan and wrong for an inspection — this is the dedup path, so
      // the carton already exists and may long since be unboxed.
      const dedupScanKind = await scanKindFor(existingScan.receiving_id);
      const dedupScanId = await recordReceivingScan(
        existingScan.receiving_id,
        trackingNumber,
        carrier,
        staffId,
        recvSource === 'zoho_po' ? 'zoho_po' : 'unmatched',
        { intakeSurface, scanKind: dedupScanKind },
      );
      await stampUnboxOpened(existingScan.receiving_id, dedupScanId, trackingNumber, dedupScanKind);
      const poIdsSet = new Set<string>();
      for (const l of lines) {
        if (l.zoho_purchaseorder_id) poIdsSet.add(l.zoho_purchaseorder_id);
      }
      const pendingOrderSkus = await computePendingOrderSkus(ctx.organizationId, lines);
      if (pendingOrderSkus.length > 0) {
        await markReceivingPriority(existingScan.receiving_id, ctx.organizationId);
        after(async () => {
          try {
            await publishPriorityUnbox({
              organizationId: ctx.organizationId,
              staffId,
              trackingNumber,
              receivingId: existingScan.receiving_id,
              skus: pendingOrderSkus,
              source: 'receiving.lookup-po',
            });
          } catch (err) {
            console.warn('lookup-po: priority-unbox publish failed', errMessage(err));
          }
        });
      }
      return NextResponse.json({
        success: true,
        ...lookupResponseFields(),
        receiving_id: existingScan.receiving_id,
        scan_id: existingScan.scan_id,
        preexisting: true,
        deduped: true,
        matched: true,
        po_matched: true,
        unbox_verdict: pendingOrderSkus.length > 0 ? 'expedited' : 'normal',
        po_ids: Array.from(poIdsSet),
        pending_order_skus: pendingOrderSkus,
        receiving_package,
        lines: lines.map(serializeLookupLine),
      });
    }
    // Empty lines — carry the existing ids forward so the Zoho branch
    // promotes this same row instead of creating a duplicate.
    preassignedReceivingId = existingScan.receiving_id;
    preassignedScanId = existingScan.scan_id;
  }

  // 1b. TEST / demo shortcut — instant matched carton, no Zoho. Lets the
  //     door-scan → unbox flow be tested with a typed tracking like TEST123.
  if (isTestTracking(trackingNumber)) {
    if (!isTestTrackingShortcutAllowed(ctx.organizationId)) {
      return NextResponse.json(
        {
          success: false,
          error: 'TEST_TRACKING_NOT_ALLOWED',
          message: 'Synthetic TEST* tracking is disabled outside the QA sandbox org.',
        },
        { status: 403 },
      );
    }
    const { receivingId, scanId, preexisting, poId } = await createOrGetTestReceiving(
      trackingNumber,
      carrier,
      staffId,
      ctx.organizationId,
    );
    await applyIntakeClassification(receivingId, classification, ctx.organizationId);
    // `createOrGetTestReceiving` is get-or-create: a repeat TEST scan resolves
    // the carton from the previous run, which may already be unboxed.
    await stampUnboxOpened(
      receivingId,
      scanId,
      trackingNumber,
      await scanKindForMaybeExisting(receivingId, preexisting),
    );
    const [lines, receiving_package] = await Promise.all([
      fetchLines(receivingId, ctx.organizationId),
      fetchReceivingPackage(receivingId, ctx.organizationId),
    ]);
    const pendingOrderSkus = await computePendingOrderSkus(ctx.organizationId, lines);
    after(async () => {
      try {
        await invalidateReceivingViews(ctx.organizationId);
      } catch (err) {
        console.warn('[lookup-po.test] cache invalidation failed', errMessage(err));
      }
      try {
        await publishReceivingLogChanged({
          organizationId: ctx.organizationId,
          action: 'insert',
          rowId: String(receivingId),
          source: 'receiving.lookup-po.test',
        });
      } catch (err) {
        console.warn('[lookup-po.test] realtime publish failed', errMessage(err));
      }
      if (pendingOrderSkus.length > 0) {
        await markReceivingPriority(receivingId, ctx.organizationId);
        try {
          await publishPriorityUnbox({
            organizationId: ctx.organizationId,
            staffId,
            trackingNumber,
            receivingId,
            skus: pendingOrderSkus,
            source: 'receiving.lookup-po.test',
          });
        } catch (err) {
          console.warn('[lookup-po.test] priority-unbox publish failed', errMessage(err));
        }
      }
    });
    return NextResponse.json({
      success: true,
      ...lookupResponseFields(),
      receiving_id: receivingId,
      scan_id: scanId,
      preexisting,
      deduped: false,
      matched: true,
      po_matched: true,
      unbox_verdict: pendingOrderSkus.length > 0 ? 'expedited' : 'normal',
      is_test: true,
      po_ids: [poId],
      pending_order_skus: pendingOrderSkus,
      receiving_package,
      lines: lines.map(serializeLookupLine),
    });
  }

  // 2. LOCAL tracking → PO ids only (STN / carton / zoho_po_mirror Reference#).
  //    Live Zoho last-8 search is never on the scan hot path.
  const zohoPoIds = new Set<string>();

  // 1c. LOCAL-FIRST tracking → PO.
  const localPoId = await resolvePoIdLocallyByTracking(
    trackingNumber,
    preassignedReceivingId,
    ctx.organizationId,
  );
  if (localPoId) zohoPoIds.add(localPoId);

  const digits = trackingNumber.replace(/\D/g, '');
  const last8 = digits.length >= 8 ? digits.slice(-8) : '';

  // 3a. MATCHED path — one receiving row per PO.
  if (zohoPoIds.size > 0) {
    const poIds = Array.from(zohoPoIds).slice(0, 3);
    const primaryPoId = poIds[0];

    let primaryReceivingId: number;
    let preexisting: boolean;

    if (preassignedReceivingId) {
      // Promote the existing (unmatched) receiving row to 'zoho_po' in place so we keep its shipment_id/tracking# link.
      try {
        const promoted = await tenantQuery<{ id: number }>(
          ctx.organizationId,
          `UPDATE receiving_carton
                SET source = 'zoho_po',
                    zoho_purchaseorder_id = $1,
                    carrier = COALESCE(NULLIF(carrier, ''), $2),
                    updated_at = NOW()
              WHERE id = $3
                AND (source = 'unmatched' OR zoho_purchaseorder_id IS NULL)
                AND organization_id = $4
              RETURNING id`,
          [primaryPoId, carrier || null, preassignedReceivingId, ctx.organizationId],
        );
        if (promoted.rows[0]) {
          primaryReceivingId = Number(promoted.rows[0].id);
          preexisting = true;
          // Paired: the unfound investigation on this carton is answered.
          await resolveCartonInvestigations(ctx.organizationId, primaryReceivingId, staffId ?? null).catch((err) =>
            console.warn('lookup-po: investigation close failed', err),
          );
        } else {
          ({ receivingId: primaryReceivingId, preexisting } =
            await upsertMatchedReceiving(primaryPoId, carrier, staffId, ctx.organizationId, intakeSurface));
        }
      } catch (err) {
        console.warn('lookup-po: promote preassigned receiving failed — using upsert', err);
        ({ receivingId: primaryReceivingId, preexisting } =
          await upsertMatchedReceiving(primaryPoId, carrier, staffId, ctx.organizationId, intakeSurface));
      }
    } else {
      ({ receivingId: primaryReceivingId, preexisting } =
        await upsertMatchedReceiving(primaryPoId, carrier, staffId, ctx.organizationId, intakeSurface));
    }

    // Promoted-in-place or upserted: every branch above can resolve a carton
    // that existed before this scan, so classify before claiming work.
    const matchedScanKind = await scanKindForMaybeExisting(primaryReceivingId, preexisting);
    const scanId = preassignedScanId ?? await recordScan(
      primaryReceivingId,
      trackingNumber,
      carrier,
      staffId,
      'zoho_po',
      intakeSurface,
      matchedScanKind,
    );
    await stampUnboxOpened(primaryReceivingId, scanId, trackingNumber, matchedScanKind);
    // If the scan was attached to a different receiving row (rare race between promote and upsert fallback), re-parent it now.
    if (preassignedScanId && preassignedReceivingId !== primaryReceivingId) {
      await tenantQuery(
        ctx.organizationId,
        `UPDATE receiving_scans SET receiving_id = $1, source = 'zoho_po'
            WHERE id = $2 AND organization_id = $3`,
        [primaryReceivingId, preassignedScanId, ctx.organizationId],
      ).catch((err) => {
        console.error('[lookup-po] scan re-parent failed — orphaned scan', {
          scan_id: preassignedScanId,
          from_receiving_id: preassignedReceivingId,
          to_receiving_id: primaryReceivingId,
          primary_po_id: primaryPoId,
          message: err instanceof Error ? err.message : String(err),
        });
      });
    }

    // Adopt the PO's pre-materialized local lines — the incoming sync already wrote every line into receiving_line (receiving_id NULL), so a…
    const linkedPrimary = await linkLocalPoLinesToReceiving(primaryPoId, primaryReceivingId, ctx.organizationId);
    void linkedPrimary;

    // Rare multi-PO tracking:
    const secondaryPoIds: string[] = [];
    const secondaryReceivingIds: number[] = [];
    for (const poId of poIds.slice(1)) {
      try {
        const { receivingId: extraReceivingId, preexisting: extraPreexisting } =
          await upsertMatchedReceiving(
            poId,
            carrier,
            staffId,
            ctx.organizationId,
            intakeSurface,
          );
        // Same upsert, same hazard: a secondary PO's carton may already be
        // unboxed, and it gets no `stampUnboxOpened` to compensate.
        await recordScan(
          extraReceivingId,
          trackingNumber,
          carrier,
          staffId,
          'zoho_po',
          intakeSurface,
          await scanKindForMaybeExisting(extraReceivingId, extraPreexisting),
        );
        await linkLocalPoLinesToReceiving(poId, extraReceivingId, ctx.organizationId);
        secondaryPoIds.push(poId);
        secondaryReceivingIds.push(extraReceivingId);
      } catch (err) {
        console.warn(`lookup-po: secondary PO adopt failed for ${poId}`, err);
      }
    }

    await applyIntakeClassification(primaryReceivingId, classification, ctx.organizationId);
    const [lines, receiving_package_matched] = await Promise.all([
      fetchLines(primaryReceivingId, ctx.organizationId),
      fetchReceivingPackage(primaryReceivingId, ctx.organizationId),
    ]);

    const uniqueByKey = new Map<string, { sku: string; zohoItemId: string | null }>();
    for (const line of lines) {
      const sku = (line.sku || '').trim();
      if (!sku) continue;
      const key = `${sku}::${line.zoho_item_id || ''}`;
      if (!uniqueByKey.has(key)) {
        uniqueByKey.set(key, { sku, zohoItemId: line.zoho_item_id });
      }
    }

    after(async () => {
      try {
        await parallelLimit(
          Array.from(uniqueByKey.values()),
          4,
          async ({ sku, zohoItemId }) => {
            await ensureSkuCatalogEntry(sku, {
              zoho_item_id: zohoItemId ?? undefined,
              zoho_purchaseorder_id: primaryPoId ?? undefined,
            }, ctx.organizationId);
          },
        );
      } catch (err) {
        // Warmup is best-effort: a future page load will re-fetch from
        // sku_catalog. WARN is appropriate.
        console.warn('[lookup-po.after] sku_catalog warmup failed', {
          receiving_id: primaryReceivingId,
          message: errMessage(err),
        });
      }
      try {
        await invalidateReceivingViews(ctx.organizationId, ['sku-catalog', 'tracking-exceptions']);
      } catch (err) {
        // Cache invalidation failure → stale UI until TTL expires (60s).
        // Visible but recoverable; WARN.
        console.warn('[lookup-po.after] cache invalidation failed', {
          receiving_id: primaryReceivingId,
          tags: ['receiving-logs', 'receiving-lines', 'pending-unboxing', 'sku-catalog', 'tracking-exceptions'],
          message: errMessage(err),
        });
      }
      try {
        await publishReceivingLogChanged({
          organizationId: ctx.organizationId,
          action: preexisting ? 'update' : 'insert',
          rowId: String(primaryReceivingId),
          source: 'receiving.lookup-po',
        });
      } catch (err) {
        // Realtime failure → connected clients won't refresh until they
        // poll or reload. Higher severity than cache because polling can
        // be slow; ERROR so it surfaces in alerting.
        console.error('[lookup-po.after] realtime publish failed', {
          receiving_id: primaryReceivingId,
          action: preexisting ? 'update' : 'insert',
          message: errMessage(err),
        });
      }
      try {
        // If this tracking had previously landed as 'unmatched' and logged
        // a receiving exception, the Zoho hit now retroactively resolves it.
        await resolveReceivingExceptionsByReceivingId(primaryReceivingId);
      } catch (err) {
        console.warn('[lookup-po.after] resolveReceivingExceptionsByReceivingId failed', {
          receiving_id: primaryReceivingId,
          message: errMessage(err),
        });
      }
    });

    const pendingOrderSkus = await computePendingOrderSkus(ctx.organizationId, lines);
    if (pendingOrderSkus.length > 0) {
      await markReceivingPriority(primaryReceivingId, ctx.organizationId);
      after(async () => {
        try {
          await publishPriorityUnbox({
            organizationId: ctx.organizationId,
            staffId,
            trackingNumber,
            receivingId: primaryReceivingId,
            skus: pendingOrderSkus,
            source: 'receiving.lookup-po',
          });
        } catch (err) {
          console.warn('lookup-po: priority-unbox publish failed', errMessage(err));
        }
      });
    }

    return NextResponse.json({
      success: true,
      ...lookupResponseFields(),
      receiving_id: primaryReceivingId,
      scan_id: scanId,
      preexisting,
      deduped: false,
      matched: true,
      po_matched: true,
      unbox_verdict: pendingOrderSkus.length > 0 ? 'expedited' : 'normal',
      po_ids: poIds,
      pending_order_skus: pendingOrderSkus,
      // Secondary POs each get their own receiving row but lines from them
      // aren't part of the primary carton view. Surface them so the client
      // can prompt the operator to triage rather than silently miss them.
      secondary_po_ids: secondaryPoIds,
      secondary_receiving_ids: secondaryReceivingIds,
      multi_po_warning: secondaryPoIds.length > 0,
      zoho_reachable: true,
      receiving_package: receiving_package_matched,
      lines: lines.map(serializeLookupLine),
    });
  }

  // 3a-bis. REFUSE TO MINT FROM ONE OF OUR OWN HANDLES.
  if (isNonCartonHandle || scannedCartonId != null) {
    return NextResponse.json({
      success: true,
      matched: false,
      po_matched: false,
      not_found: true,
      po_ids: [],
      error: `"${rawTracking}" is a Cycle Forge label, not a carrier tracking number.`,
    });
  }

  // 3b. UNMATCHED path — no local STN/PO-mirror hit.
  let unmatchedReceivingId: number;
  let unmatchedShipmentId: number | null;
  if (preassignedReceivingId != null) {
    unmatchedReceivingId = preassignedReceivingId;
    const shipRow = await tenantQuery<{ shipment_id: number | null }>(
      ctx.organizationId,
      `SELECT shipment_id FROM receiving_carton WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [preassignedReceivingId, ctx.organizationId],
    );
    unmatchedShipmentId = shipRow.rows[0]?.shipment_id ?? null;
  } else {
    ({ receivingId: unmatchedReceivingId, shipmentId: unmatchedShipmentId } =
      await createUnmatchedReceiving(trackingNumber, carrier, staffId, ctx.organizationId, intakeSurface));
  }
  // A PREASSIGNED id is a pre-existing carton (the zero-line re-scan branch
  // above carried it forward), so it may long since have been unboxed. A
  // freshly created unfound carton is unworked by construction.
  const unmatchedScanKind = await scanKindForMaybeExisting(
    unmatchedReceivingId,
    preassignedReceivingId != null,
  );
  const unmatchedScanId = preassignedScanId ?? await recordScan(
    unmatchedReceivingId,
    trackingNumber,
    carrier,
    staffId,
    'unmatched',
    intakeSurface,
    unmatchedScanKind,
  );
  await stampUnboxOpened(unmatchedReceivingId, unmatchedScanId, trackingNumber, unmatchedScanKind);

  const exceptionReason = 'not_found' as const;
  const exception = await upsertOpenTrackingException({
    trackingNumber,
    domain: 'receiving',
    sourceStation: 'receiving',
    staffId,
    reason: exceptionReason,
    notes: 'Receiving scan: tracking not found in local STN / PO mirror',
    shipmentId: unmatchedShipmentId,
    receivingId: unmatchedReceivingId,
    lastError: null,
    domainMetadata: {
      carrier: carrier || null,
      candidates_tried: last8 ? [last8] : [],
      zoho_reachable: true,
      scan_id: unmatchedScanId,
    },
  }, undefined, ctx.organizationId).catch((err) => {
    console.warn('lookup-po: upsertOpenTrackingException (receiving) failed', err);
    return null;
  });

  after(async () => {
    try {
      await invalidateReceivingViews(ctx.organizationId, ['tracking-exceptions']);
    } catch (err) {
      console.warn('[lookup-po.after.unmatched] cache invalidation failed', {
        receiving_id: unmatchedReceivingId,
        message: errMessage(err),
      });
    }
    try {
      await publishReceivingLogChanged({
        organizationId: ctx.organizationId,
        action: 'insert',
        rowId: String(unmatchedReceivingId),
        source: 'receiving.lookup-po',
      });
    } catch (err) {
      console.error('[lookup-po.after.unmatched] realtime publish failed', {
        receiving_id: unmatchedReceivingId,
        message: errMessage(err),
      });
    }
  });

  await applyIntakeClassification(unmatchedReceivingId, classification, ctx.organizationId);
  const receiving_package_unmatched = await fetchReceivingPackage(unmatchedReceivingId, ctx.organizationId);

  return NextResponse.json({
    success: true,
    ...lookupResponseFields(),
    receiving_id: unmatchedReceivingId,
    scan_id: unmatchedScanId,
    exception_id: exception?.id ?? null,
    exception_reason: exception ? exceptionReason : null,
    preexisting: false,
    deduped: false,
    matched: false,
    po_matched: false,
    unbox_verdict: 'unfound',
    po_ids: [],
    zoho_reachable: true,
    // Scan never schedules a Zoho follow-up — promote is cron / operator only.
    zoho_pending: false,
    receiving_package: receiving_package_unmatched,
    lines: [],
  });
}, {
  permission: 'receiving.scan_po',
  audit: {
    source: 'receiving.lookup-po',
    action: AUDIT_ACTION.PO_LOOKUP,
    entityType: AUDIT_ENTITY.RECEIVING,
    entityId: ({ response }) => {
      const r = response as { receiving_id?: number | string } | null;
      return r?.receiving_id ?? null;
    },
    extra: ({ response, body }) => {
      const r = response as { po_matched?: boolean; deduped?: boolean } | null;
      const b = body as { trackingNumber?: string } | null;
      return {
        tracking_number: b?.trackingNumber ?? null,
        po_matched: r?.po_matched ?? null,
        deduped: r?.deduped ?? null,
      };
    },
  },
});
