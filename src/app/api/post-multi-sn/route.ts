import { NextRequest, NextResponse } from 'next/server';
import { tenantQuery } from '@/lib/tenancy/db';
import { withAuth } from '@/lib/auth/withAuth';
import { getSkuCatalogBySku } from '@/lib/neon/sku-catalog-queries';
import { upsertSerialUnit } from '@/lib/neon/serial-units-queries';
import { recordInventoryEvent } from '@/lib/inventory/events';
import { attachTechSerial } from '@/lib/inventory/tech-serial';
import { recordLabelPrintJob } from '@/lib/labels/print-jobs';
import {
  resolveLabelIssueSerials,
  type LabelPrintClass,
} from '@/lib/labels/auto-unit-labels';

/** POST /api/post-multi-sn — issue label(s) for a SKU + record the audit trail. */

const VALID_CONDITIONS = ['BRAND_NEW', 'LIKE_NEW', 'REFURBISHED', 'USED_A', 'USED_B', 'USED_C', 'PARTS'] as const;
type ConditionGrade = (typeof VALID_CONDITIONS)[number];

export const POST = withAuth(
  async (request: NextRequest, ctx) => {
    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    // Accept the legacy contract (sku = unitId) and the new contract (sku = real SKU, unitId = minted id) simultaneously.
    const sku = typeof body.sku === 'string' ? body.sku.trim() : '';
    const unitId =
      typeof body.unitId === 'string' && body.unitId.trim()
        ? body.unitId.trim()
        : sku;
    const productSku =
      typeof body.productSku === 'string' && body.productSku.trim()
        ? body.productSku.trim()
        : sku;

    const requestedSerialNumbers = Array.isArray(body.serialNumbers)
      ? (body.serialNumbers as unknown[]).map((s) => String(s ?? '').trim()).filter(Boolean)
      : [];

    if (!sku) {
      return NextResponse.json(
        { error: 'Missing required field: sku' },
        { status: 400 },
      );
    }

    const notes = typeof body.notes === 'string' ? body.notes : null;
    const location = typeof body.location === 'string' ? body.location.trim() || null : null;
    const conditionRaw = typeof body.condition === 'string' ? body.condition : '';
    if (conditionRaw && !(VALID_CONDITIONS as readonly string[]).includes(conditionRaw)) {
      return NextResponse.json({ error: 'Invalid condition' }, { status: 400 });
    }
    const condition: ConditionGrade = (VALID_CONDITIONS as readonly string[]).includes(conditionRaw)
      ? (conditionRaw as ConditionGrade)
      : 'BRAND_NEW';
    const clientEventId =
      typeof body.clientEventId === 'string' ? body.clientEventId.trim() || null : null;
    const gtin = typeof body.gtin === 'string' ? body.gtin.trim() || null : null;
    const qrPayload = typeof body.qrPayload === 'string' ? body.qrPayload.trim() || null : null;
    const symbology =
      body.symbology === 'gs1datamatrix' || body.symbology === 'datamatrix'
        ? (body.symbology as 'gs1datamatrix' | 'datamatrix')
        : null;
    const hasValidPrintClass =
      body.printClass === 'sn-to-sku' ||
      body.printClass === 'auto-unit' ||
      body.printClass === 'print';
    if (body.printClass !== undefined && !hasValidPrintClass) {
      return NextResponse.json({ error: 'Invalid printClass' }, { status: 400 });
    }
    const printClass: LabelPrintClass = hasValidPrintClass
      ? (body.printClass as LabelPrintClass)
      : 'print';
    const resolvedSerials = resolveLabelIssueSerials({
      printClass,
      serialNumbers: requestedSerialNumbers,
      quantity: body.quantity,
      clientEventId,
    });
    if (!resolvedSerials.ok) {
      return NextResponse.json({ error: resolvedSerials.error }, { status: 400 });
    }
    const serialNumbers = resolvedSerials.serials;
    const syntheticSerial = resolvedSerials.synthetic;
    const orgId = ctx.organizationId;

    // Resolve catalog from the real SKU first; fall back to the unit-id form
    // for old clients that only sent `sku`. The base form strips any `:`
    // suffix used by composite SKUs.
    const baseProductSku = productSku.includes(':') ? productSku.split(':')[0].trim() : productSku;
    const baseCatalog = await getSkuCatalogBySku(baseProductSku, orgId);
    const catalog =
      baseCatalog ??
      (baseProductSku !== productSku ? await getSkuCatalogBySku(productSku, orgId) : null);
    const catalogId = catalog?.id ?? null;
    const skuForStorage = catalog?.sku || baseProductSku || productSku;
    if (syntheticSerial && !catalogId) {
      return NextResponse.json(
        { error: 'SKU must exist in the product catalog before issuing unit labels' },
        { status: 404 },
      );
    }

    const actorId = ctx.staffId ?? null;

    // 1. One station_activity_logs row covering the whole batch. Carries
    //    the print payload + metadata so the future Recently Printed view
    //    can render rich rows without rejoining inventory_events.
    let stationActivityLogId: number | null = null;
    try {
      const logRes = await tenantQuery<{ id: number }>(
        orgId,
        `WITH lock_key AS MATERIALIZED (
           SELECT pg_advisory_xact_lock(
             hashtextextended($5::text || ':' || $6::text, 0)
           )
            WHERE $6::text IS NOT NULL
         ),
         existing AS (
           SELECT logs.id
             FROM station_activity_logs AS logs
             CROSS JOIN lock_key
            WHERE logs.organization_id = $5
              AND logs.metadata->>'client_event_id' = $6
            ORDER BY logs.id ASC
            LIMIT 1
         ),
         inserted AS (
           INSERT INTO station_activity_logs
             (station, activity_type, staff_id, scan_ref, notes, metadata, organization_id)
           SELECT 'LABELS', 'LABEL_PRINTED', $1, $2, $3, $4::jsonb, $5
            WHERE NOT EXISTS (SELECT 1 FROM existing)
           RETURNING id
         )
         SELECT id FROM inserted
         UNION ALL
         SELECT id FROM existing
         LIMIT 1`,
        [
          actorId,
          qrPayload,
          notes,
          JSON.stringify({
            unit_id: unitId,
            sku: skuForStorage,
            sku_catalog_id: catalogId,
            gtin,
            symbology,
            print_class: printClass,
            synthetic_serial: syntheticSerial,
            client_event_id: clientEventId,
            serial_count: serialNumbers.length,
            condition,
          }),
          orgId,
          clientEventId,
        ],
      );
      stationActivityLogId = logRes.rows[0]?.id ?? null;
    } catch (err) {
      console.warn('[post-multi-sn] station_activity_logs insert failed (non-fatal)', err);
    }

    const serialUnitIds: number[] = [];
    // Per-serial minted unit identities, index-aligned to the labels the client
    // will print. Each physical unit owns exactly one {SKU}-{YYWW}-{SEQ6}.
    const units: Array<{ serial: string; unitUid: string | null }> = [];
    for (const serial of serialNumbers) {
      // 2. Canonical upsert — handles status transitions, return detection, metadata patching, AND mints this serial's own unit_uid at birth…
      let upserted;
      try {
        upserted = await upsertSerialUnit({
          serial_number: serial,
          sku: skuForStorage,
          sku_catalog_id: catalogId,
          origin_source: 'manual',
          actor_id: actorId,
          condition_grade: condition,
          location,
          target_status: 'LABELED',
        }, undefined, orgId);
      } catch (err) {
        console.error('[post-multi-sn] upsertSerialUnit failed', { serial, err });
        continue;
      }
      if (!upserted) continue;

      const serialUnitId = upserted.unit.id;
      serialUnitIds.push(serialUnitId);
      // The authoritative id is whatever landed on the row (minted at birth, or
      // the pre-existing id for a relabel). This is what the label prints and
      // what scan tokens point at.
      const effectiveUid = upserted.unit.unit_uid ?? null;
      units.push({ serial, unitUid: effectiveUid });

      // The three tail writes depend on the unit identity but not on each
      // other. Run them concurrently to avoid three serial connection cycles
      // per label while retaining each write's non-fatal behavior.
      await Promise.all([
        (async () => {
          try {
            await attachTechSerial({
              serialNumber: serial,
              serialUnitId,
              stationSource: 'ADMIN',
              testedBy: actorId,
              scanRef: effectiveUid ?? qrPayload,
              sourceSkuId: catalogId,
              contextStationActivityLogId: stationActivityLogId,
            }, undefined, orgId);
          } catch (err) {
            console.warn('[post-multi-sn] tech_serial_numbers insert failed (non-fatal)', err);
          }
        })(),
        (async () => {
          try {
            await recordInventoryEvent({
              event_type: 'LABELED',
              actor_staff_id: actorId,
              station: 'SYSTEM',
              serial_unit_id: serialUnitId,
              sku: skuForStorage,
              prev_status: upserted.prior_status,
              next_status: 'LABELED',
              scan_token: effectiveUid ?? qrPayload ?? unitId,
              client_event_id: clientEventId ? `${clientEventId}:inventory:${serial}` : null,
              notes,
              payload: {
                unit_id: effectiveUid ?? unitId,
                gtin,
                symbology,
                print_class: printClass,
                synthetic_serial: syntheticSerial,
                station_activity_log_id: stationActivityLogId,
              },
            }, undefined, orgId);
          } catch (err) {
            console.warn('[post-multi-sn] recordInventoryEvent failed (non-fatal)', err);
          }
        })(),
        (async () => {
          try {
            await recordLabelPrintJob(
              {
                jobType: 'UNIT',
                serialUnitId,
                unitUid: effectiveUid,
                qrPayload: effectiveUid ?? qrPayload ?? serial,
                symbology: symbology ?? 'datamatrix',
                templateId: 'product',
                isReprint: upserted.prior_status === 'LABELED',
                actorStaffId: actorId,
                clientEventId: clientEventId ? `${clientEventId}:${serial}` : null,
              },
              orgId,
            );
          } catch (err) {
            console.warn('[post-multi-sn] label_print_jobs insert failed (non-fatal)', err);
          }
        })(),
      ]);
    }

    const issuanceComplete =
      !syntheticSerial ||
      (units.length === serialNumbers.length && units.every((unit) => !!unit.unitUid));

    return NextResponse.json({
      success: issuanceComplete,
      error: issuanceComplete ? undefined : 'One or more unit labels could not be issued',
      serialUnitIds,
      units,
      id: serialUnitIds[0] ?? null,
      stationActivityLogId,
    }, { status: issuanceComplete ? 200 : 500 });
  },
  { permission: 'print.label' },
);
