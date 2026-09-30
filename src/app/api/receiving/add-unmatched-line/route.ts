/** POST /api/receiving/add-unmatched-line */

import { NextRequest, NextResponse } from 'next/server';
import { withTenantTransaction, type tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { upsertReceivingLineTesting } from '@/lib/receiving/facts/narrow';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { publishReceivingLogChanged } from '@/lib/realtime/publish';
import { recomputeCartonSourceLink } from '@/lib/receiving/carton-source-link';
import { upsertEcwidIncomingRepair } from '@/lib/neon/repair-service-queries';
import { repairDueAt } from '@/lib/repair/repair-due-at';
import { formatPSTTimestamp } from '@/utils/date';
import { fetchEcwidOrderContact } from '@/lib/ecwid/client';
import { withAuth } from '@/lib/auth/withAuth';
import { after } from 'next/server';
import {
  getApiIdempotencyResponse,
  readIdempotencyKey,
  saveApiIdempotencyResponse,
} from '@/lib/api-idempotency';
import { isSalesOrderDerivedCarton } from '@/lib/receiving/intake-items-routing';
import { publishRepairChanged } from '@/lib/realtime/publish';

const IDEMPOTENCY_ROUTE = 'receiving.add-unmatched-line';

const CONDITION_GRADES = ['BRAND_NEW', 'LIKE_NEW', 'REFURBISHED', 'USED_A', 'USED_B', 'USED_C', 'PARTS'] as const;
type ConditionGrade = (typeof CONDITION_GRADES)[number];

const PLATFORM_PILLS = [
  'ebay',
  'goodwill',
  'amazon',
  'aliexp',
  'walmart',
  'ecwid',
  'other',
] as const;
type PlatformPill = (typeof PLATFORM_PILLS)[number];

const INTAKE_TYPES = ['po', 'return', 'trade_in', 'repair', 'pickup'] as const;
type IntakeType = (typeof INTAKE_TYPES)[number];

interface ReceivingRow {
  id: number;
  source: string | null;
  source_platform: string | null;
  organization_id: string | null;
  zoho_purchaseorder_id: string | null;
}

interface InsertedLineRow {
  id: number;
  receiving_id: number;
  sku: string | null;
  item_name: string | null;
  sku_catalog_id: number | null;
  sku_platform_id_row: number | null;
  source_platform_pill: string | null;
  intake_type: string | null;
  listing_url: string | null;
  listing_reference: string | null;
  location_code: string | null;
  quantity_expected: number | null;
  quantity_received: number | null;
  workflow_status: string;
  manual_entry_at: string;
  source_system: string | null;
  source_order_id: string | null;
  is_repair_service: boolean;
}

function normalizeEnum<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T | null = null,
): T | null {
  if (raw == null) return fallback;
  const v = String(raw).trim().toLowerCase();
  const match = allowed.find((a) => a.toLowerCase() === v);
  return match ?? fallback;
}

function normalizeConditionGrade(
  raw: unknown,
  fallback: ConditionGrade = 'BRAND_NEW',
): ConditionGrade {
  if (raw == null) return fallback;
  const upper = String(raw).trim().toUpperCase().replace(/[\s-]/g, '_');
  const match = CONDITION_GRADES.find((g) => g === upper);
  return match ?? fallback;
}

export const POST = withAuth(async (request: NextRequest, ctx) => {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: 'invalid JSON body' }, { status: 400 });
  }

  const receivingId = Number(body.receiving_id);
  if (!Number.isFinite(receivingId) || receivingId <= 0) {
    return NextResponse.json(
      { success: false, error: 'receiving_id is required' },
      { status: 400 },
    );
  }

  const skuCatalogIdRaw = body.sku_catalog_id;
  const skuCatalogId =
    skuCatalogIdRaw == null ? null : Number(skuCatalogIdRaw);
  if (skuCatalogId != null && (!Number.isFinite(skuCatalogId) || skuCatalogId <= 0)) {
    return NextResponse.json(
      { success: false, error: 'sku_catalog_id must be a positive integer' },
      { status: 400 },
    );
  }

  const skuPlatformIdRowRaw = body.sku_platform_id_row;
  const skuPlatformIdRow =
    skuPlatformIdRowRaw == null ? null : Number(skuPlatformIdRowRaw);
  if (
    skuPlatformIdRow != null &&
    (!Number.isFinite(skuPlatformIdRow) || skuPlatformIdRow <= 0)
  ) {
    return NextResponse.json(
      { success: false, error: 'sku_platform_id_row must be a positive integer' },
      { status: 400 },
    );
  }

  const sku = body.sku == null ? null : String(body.sku).trim() || null;
  const itemName =
    body.item_name == null ? null : String(body.item_name).trim() || null;

  // At least one of (sku_catalog_id, sku, item_name) must be present so the
  // operator has identified *something*. Bare lines are useless downstream.
  if (skuCatalogId == null && !sku && !itemName) {
    return NextResponse.json(
      {
        success: false,
        error: 'must provide at least one of: sku_catalog_id, sku, item_name',
      },
      { status: 400 },
    );
  }

  // ─── Per-line source-order linkage flags (parsed early — force type REPAIR) ─
  const isRepairServiceEarly = body.is_repair_service === true;

  const sourcePlatformPill: PlatformPill | null = normalizeEnum(
    body.source_platform_pill,
    PLATFORM_PILLS,
    isRepairServiceEarly ? 'ecwid' : null,
  );
  // -RS identify forces intake_type=repair (atomic success); do not leave PO.
  const intakeType: IntakeType | null = isRepairServiceEarly
    ? 'repair'
    : normalizeEnum(body.intake_type, INTAKE_TYPES, null);
  // A return is by definition not brand new — when the caller omits the grade
  // (e.g. the unfound serial-match auto-import), default return lines to
  // USED_A instead of the BRAND_NEW catch-all.
  const conditionGrade = normalizeConditionGrade(
    body.condition_grade,
    intakeType === 'return' ? 'USED_A' : 'BRAND_NEW',
  );

  const listingUrl =
    body.listing_url == null ? null : String(body.listing_url).trim() || null;
  const listingReference =
    body.listing_reference == null
      ? null
      : String(body.listing_reference).trim() || null;
  const locationCode =
    body.location_code == null ? null : String(body.location_code).trim() || null;

  const quantityExpectedRaw = body.quantity_expected;
  const quantityExpected =
    quantityExpectedRaw == null ? 1 : Number(quantityExpectedRaw);
  if (!Number.isFinite(quantityExpected) || quantityExpected < 1) {
    return NextResponse.json(
      { success: false, error: 'quantity_expected must be >= 1' },
      { status: 400 },
    );
  }

  const clientEventId =
    body.client_event_id == null
      ? null
      : String(body.client_event_id).trim() || null;

  // Off-PO escape hatch: allow adding an extra item to a Zoho-matched carton
  // (an item in the box the PO doesn't list). The line stays Zoho-unlinked, so
  // the receive flow naturally skips it from the Zoho POST.
  const allowOffPo = body.allow_off_po === true;

  // ─── Per-line source-order linkage (item-dependent returns / repairs) ────── A box can mix a customer's returns + repair services from…
  const isRepairService = isRepairServiceEarly;
  const sourceOrderId =
    body.source_order_id != null
      ? String(body.source_order_id).trim() || null
      : body.ecwid_order_id != null
        ? String(body.ecwid_order_id).trim() || null
        : null;
  const sourceSystem =
    body.source_system != null
      ? String(body.source_system).trim().toLowerCase() || null
      : sourceOrderId || isRepairService
        ? 'ecwid'
        : null;

  // ─── Idempotency + all tenant-table access on the per-org GUC path ──────── Everything that touches receiving / receiving_lines /…
  const idempotencyKey = readIdempotencyKey(request, clientEventId);

  const result = await withTenantTransaction(ctx.organizationId, async (client) => {
    if (idempotencyKey) {
      const cached = await getApiIdempotencyResponse(
        client,
        ctx.organizationId,
        idempotencyKey,
        IDEMPOTENCY_ROUTE,
      );
      if (cached) {
        return { payload: cached.response_body, status: cached.status_code, cached: true };
      }
    }

    const respond = async (
      payload: Record<string, unknown>,
      init?: { status?: number },
    ): Promise<{ payload: Record<string, unknown>; status: number; cached?: boolean }> => {
      const status = init?.status ?? 200;
      if (idempotencyKey && status < 500) {
        await saveApiIdempotencyResponse(client, {
          orgId: ctx.organizationId,
          idempotencyKey,
          route: IDEMPOTENCY_ROUTE,
          staffId: ctx.staffId,
          statusCode: status,
          responseBody: payload,
        });
      }
      return { payload, status };
    };

    // ─── Verify receiving row exists and is unmatched ───────────────────────
    const receivingResult = await client.query<ReceivingRow>(
      `SELECT id, source, source_platform, organization_id, zoho_purchaseorder_id
         FROM receiving_carton
        WHERE id = $1
          AND organization_id = $2
        LIMIT 1`,
      [receivingId, ctx.organizationId],
    );
    const receiving = receivingResult.rows[0];

    if (!receiving) {
      return respond(
        { success: false, error: `receiving ${receivingId} not found` },
        { status: 404 },
      );
    }

    // A sales-order-derived carton (flipped to zoho_po by a per-line return/repair link or an order# bind, no real Zoho PO id) must keep…
    const isOrderLinkedCarton = isSalesOrderDerivedCarton(receiving);
    if (receiving.source !== 'unmatched' && !allowOffPo && !isOrderLinkedCarton) {
      return respond(
        {
          success: false,
          error:
            'add-unmatched-line is only valid on source=unmatched cartons (pass allow_off_po:true to add an off-PO extra item to a matched carton)',
          actual_source: receiving.source,
        },
        { status: 409 },
      );
    }

    // ─── Resolve sku_catalog_id from sku_platform_id_row when omitted ─────── The popover passes sku_platform_id_row (the specific Ecwid…
    let resolvedSkuCatalogId = skuCatalogId;
    let resolvedSku = sku;
    let resolvedItemName = itemName;
    if (resolvedSkuCatalogId == null && skuPlatformIdRow != null) {
      const platformLookup = await client.query<{
        sku_catalog_id: number | null;
        platform_sku: string | null;
        display_name: string | null;
      }>(
        `SELECT sku_catalog_id, platform_sku, display_name
           FROM sku_platform_ids
          WHERE id = $1
            AND organization_id = $2
          LIMIT 1`,
        [skuPlatformIdRow, ctx.organizationId],
      );
      const platformRow = platformLookup.rows[0];
      if (platformRow) {
        resolvedSkuCatalogId = platformRow.sku_catalog_id;
        if (!resolvedSku) resolvedSku = platformRow.platform_sku;
        if (!resolvedItemName) resolvedItemName = platformRow.display_name;
      }
    }

    // ─── Insert the line (thin spine) + its testing facts row ─────────────── Wave-3 writer inversion:
    const receivingTypeUpper = isRepairService
      ? 'REPAIR'
      : intakeType
        ? intakeType.toUpperCase()
        : 'PO';

    const insertResult = await client.query<InsertedLineRow>(
      `INSERT INTO receiving_line (
         receiving_id,
         sku,
         item_name,
         sku_catalog_id,
         sku_platform_id_row,
         source_platform_pill,
         intake_type,
         receiving_type,
         listing_url,
         listing_reference,
         location_code,
         quantity_expected,
         quantity_received,
         workflow_status,
         source_system,
         source_order_id,
         is_repair_service,
         organization_id,
         manual_entry_at,
         created_at,
         updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         $9, $10, $11, $12, 0,
         'MATCHED'::inbound_workflow_status_enum,
         $13, $14, $15, $16::uuid,
         NOW(), NOW(), NOW()
       )
       RETURNING
         id, receiving_id, sku, item_name,
         sku_catalog_id, sku_platform_id_row,
         source_platform_pill, intake_type,
         listing_url, listing_reference, location_code,
         quantity_expected, quantity_received, workflow_status,
         source_system, source_order_id, is_repair_service,
         manual_entry_at`,
      [
        receivingId,
        resolvedSku,
        resolvedItemName,
        resolvedSkuCatalogId,
        skuPlatformIdRow,
        sourcePlatformPill,
        intakeType,
        receivingTypeUpper,
        listingUrl,
        listingReference,
        locationCode,
        quantityExpected,
        sourceSystem,
        sourceOrderId,
        isRepairService,
        ctx.organizationId,
      ],
    );

    const line = insertResult.rows[0];
    if (!line) {
      return respond(
        { success: false, error: 'insert returned no row' },
        { status: 500 },
      );
    }

    // rlt birth (same tx via the tenant client):
    const txDeps = {
      query: ((_org: OrgId, sql: string, p?: unknown[]) => client.query(sql, p)) as typeof tenantQuery,
    };
    await upsertReceivingLineTesting(
      ctx.organizationId as OrgId,
      Number(line.id),
      {
        needsTest: false,
        qaStatus: 'PENDING',
        dispositionCode: 'HOLD',
        conditionGrade,
        dispositionAudit: [],
      },
      txDeps,
    );

    // ─── Re-derive the carton's source linkage from its lines ─────────────── The carton's PO# is only a first-linked DISPLAY representative;…
    let carton: { zoho_purchaseorder_number: string | null; source: string | null; source_platform: string | null } | null = null;
    let repairTracking: string | null = null;
    if (sourceOrderId || isRepairService) {
      try {
        await recomputeCartonSourceLink(receivingId, client);
        // Force carton intake type to repair when linking a -RS order.
        if (isRepairService) {
          await client.query(
            `UPDATE receiving_carton
                SET intake_type = 'repair',
                    updated_at = NOW()
              WHERE id = $1
                AND organization_id = $2`,
            [receivingId, ctx.organizationId],
          );
        }
        const cartonRes = await client.query<{
          zoho_purchaseorder_number: string | null;
          source: string | null;
          source_platform: string | null;
        }>(
          `SELECT zoho_purchaseorder_number, source, source_platform
             FROM receiving_carton
            WHERE id = $1
              AND organization_id = $2
            LIMIT 1`,
          [receivingId, ctx.organizationId],
        );
        carton = cartonRes.rows[0] ?? null;
      } catch (err) {
        console.warn('add-unmatched-line: carton source recompute failed', err);
      }
    }

    // Capture tracking for the post-tx repair upsert (upsertEcwidIncomingRepair
    // opens its own tenant tx — never nest it inside this one).
    if (isRepairService && sourceOrderId) {
      // STN identity is tracking_number_raw / _normalized — there is no tracking_number column.
      const trackingRes = await client.query<{ tracking_number: string | null }>(
        `SELECT COALESCE(
                  NULLIF(btrim(stn.tracking_number_raw), ''),
                  NULLIF(btrim(stn.tracking_number_normalized), '')
                ) AS tracking_number
           FROM receiving_carton rc
           JOIN shipping_tracking_numbers stn ON stn.id = rc.shipment_id
          WHERE rc.id = $1
            AND rc.organization_id = $2
          LIMIT 1`,
        [receivingId, ctx.organizationId],
      );
      repairTracking =
        trackingRes.rows[0]?.tracking_number != null
          ? String(trackingRes.rows[0].tracking_number).trim() || null
          : null;
    }

    // Envelope frozen: condition_grade used to ride the spine RETURNING; it now
    // lives on rlt, so compose it from the value we just wrote.
    return {
      ...(await respond({
        success: true,
        line: { ...line, condition_grade: conditionGrade },
        carton,
        repair_service_id: null,
      })),
      repairUpsert:
        isRepairService && sourceOrderId
          ? {
              orderId: sourceOrderId,
              tracking: repairTracking,
              sku: resolvedSku,
              productTitle: resolvedItemName,
            }
          : null,
    };
  });

  // Repair-service identify → idempotent repair_service upsert + received stamp.
  let repairTicketId: number | null =
    typeof result.payload.repair_service_id === 'number'
      ? result.payload.repair_service_id
      : null;
  const repairUpsert =
    'repairUpsert' in result && result.repairUpsert ? result.repairUpsert : null;
  if (!result.cached && result.payload.success === true && repairUpsert) {
    const upsert = repairUpsert;
    try {
      // The buyer. This route holds the Ecwid ORDER id but never fetched the person on it, so every ticket born here landed unlinked — all four…
      const contact = await fetchEcwidOrderContact(ctx.organizationId as OrgId, upsert.orderId);
      const ticket = await upsertEcwidIncomingRepair(
        {
          orderId: upsert.orderId,
          trackingNumber: upsert.tracking,
          sku: upsert.sku,
          productTitle: upsert.productTitle,
          // The joined legacy string AND the parts. `contactInfo` is what the
          // paper falls back to for an unlinked row; `contact` is what links
          // the ticket to the `customers` row the paper actually reads.
          contactInfo: contact
            ? [contact.name, contact.phone, contact.email].filter(Boolean).join(', ') || null
            : null,
          contact: contact ?? undefined,
          notes: `Linked from receiving carton #${receivingId}`,
        },
        ctx.organizationId as OrgId,
      );
      repairTicketId = ticket.id;
      // The receive stamp starts the SLA — unless the box is still on
      // Incoming Shipment, which has no due date until its status moves.
      const receivedAt = formatPSTTimestamp();
      await withTenantTransaction(ctx.organizationId, async (client) => {
        await client.query(
          `UPDATE repair_service
              SET due_at = CASE WHEN received_at IS NULL THEN $4::timestamptz ELSE due_at END,
                  received_at = COALESCE(received_at, $3::timestamptz),
                  updated_at = NOW()
            WHERE id = $1
              AND organization_id = $2::uuid`,
          [ticket.id, ctx.organizationId, receivedAt, repairDueAt(receivedAt, ticket.created_at, ticket.status)],
        );
      });
      result.payload.repair_service_id = repairTicketId;
    } catch (err) {
      console.warn('add-unmatched-line: repair_service upsert failed', err);
    }
  }

  // ─── Background: cache invalidation + realtime publish ────────────────────
  // Only on a real insert (success) — the cached/404/409/500 paths short-circuit
  // before this, matching the original early-return behavior.
  if (result.payload.success === true && !result.cached) {
    after(async () => {
      try {
        await invalidateReceivingViews(ctx.organizationId, ['unfound-queue']);
        await publishReceivingLogChanged({
          organizationId: ctx.organizationId,
          action: 'update',
          rowId: String(receivingId),
          source: 'receiving.add-unmatched-line',
        });
        if (typeof repairTicketId === 'number' && repairTicketId > 0) {
          await publishRepairChanged({
            organizationId: ctx.organizationId,
            repairIds: [repairTicketId],
            source: 'receiving.add-unmatched-line',
          });
        }
      } catch (err) {
        console.warn('add-unmatched-line: cache/realtime update failed', err);
      }
    });
  }

  return NextResponse.json(result.payload, { status: result.status });
});
