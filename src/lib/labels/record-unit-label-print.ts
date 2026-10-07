/** recordUnitLabelPrint — the server record of one product-label print for one serial. */

import { tenantQuery } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { upsertSerialUnit, type UpsertSerialUnitResult } from '@/lib/neon/serial-units-queries';
import { recordInventoryEvent } from '@/lib/inventory/events';
import { recordLabelPrintJob } from '@/lib/labels/print-jobs';

export interface UnitLabelPrintInput {
  serialNumber: string;
  /** Storage SKU (the catalog SKU when one resolved). */
  sku: string | null;
  skuCatalogId: number | null;
  /**
   * The unit id the label printed. Null lets the upsert mint one at birth; an
   * existing unit always keeps its own id (the reprint guarantee).
   */
  unitUid?: string | null;
  /** Null keeps an existing unit's grade. */
  conditionGrade?: string | null;
  location?: string | null;
  actorStaffId: number | null;
  notes?: string | null;
  gtin?: string | null;
  symbology?: 'gs1datamatrix' | 'datamatrix' | null;
  /** What the code encodes when the unit has no id (a legacy QR payload). */
  qrPayload?: string | null;
  /** Scan token / payload `unit_id` when there is neither a unit id nor a QR payload. */
  scanTokenFallback?: string | null;
  /** The press's idempotency key; the event and the print job derive per-serial keys from it. */
  clientEventId?: string | null;
  /** Extra keys for the LABELED event payload (print class, activity-log id, outbox id). */
  eventPayload?: Record<string, unknown>;
}

export interface UnitLabelPrintResult {
  upserted: UpsertSerialUnitResult;
  /** The id on the unit's row — the label's identity and what scan tokens resolve. */
  unitUid: string | null;
  /** Tail writes that failed (already logged). Empty when the whole record landed. */
  failed: Array<'inventory_event' | 'label_print_job'>;
}

/**
 * Record one product-label print: upsert the serial (a new unit is born
 * LABELED; an existing unit keeps its status — a print is not a lifecycle
 * move), then, concurrently, the LABELED inventory event (prev/next = the
 * unit's real statuses) and the `label_print_jobs` row with the reprint
 * look-back. Every write is idempotent on `clientEventId`, so a retry is safe.
 *
 * Returns null for a blank serial. An upsert failure throws; a tail-write
 * failure is logged and reported in `failed` so each caller picks its policy.
 */
export async function recordUnitLabelPrint(
  input: UnitLabelPrintInput,
  orgId: OrgId,
): Promise<UnitLabelPrintResult | null> {
  const upserted = await upsertSerialUnit(
    {
      serial_number: input.serialNumber,
      sku: input.sku,
      sku_catalog_id: input.skuCatalogId,
      unit_uid: input.unitUid ?? null,
      origin_source: 'manual',
      actor_id: input.actorStaffId,
      condition_grade: input.conditionGrade ?? null,
      location: input.location ?? null,
      target_status: 'LABELED',
      target_status_on_create_only: true,
    },
    undefined,
    orgId,
  );
  if (!upserted) return null;

  const serial = input.serialNumber;
  const serialUnitId = upserted.unit.id;
  const unitUid = upserted.unit.unit_uid ?? null;
  const qrPayload = input.qrPayload ?? null;
  const clientEventId = input.clientEventId ?? null;

  const [eventWrite, jobWrite] = await Promise.allSettled([
    recordInventoryEvent(
      {
        event_type: 'LABELED',
        actor_staff_id: input.actorStaffId,
        station: 'SYSTEM',
        serial_unit_id: serialUnitId,
        sku: input.sku,
        prev_status: upserted.prior_status,
        next_status: upserted.unit.current_status,
        scan_token: unitUid ?? qrPayload ?? input.scanTokenFallback ?? null,
        client_event_id: clientEventId ? `${clientEventId}:inventory:${serial}` : null,
        notes: input.notes ?? null,
        payload: {
          unit_id: unitUid ?? input.scanTokenFallback ?? null,
          gtin: input.gtin ?? null,
          symbology: input.symbology ?? null,
          ...input.eventPayload,
        },
      },
      undefined,
      orgId,
    ),
    (async () => {
      // Status no longer moves on print, so a reprint is "this unit already
      // has a product label job", not "it was LABELED".
      const printed = upserted.is_new
        ? null
        : await tenantQuery<{ one: number }>(
            orgId,
            `SELECT 1 AS one FROM label_print_jobs
              WHERE organization_id = $1 AND serial_unit_id = $2 AND template_id = 'product'
              LIMIT 1`,
            [orgId, serialUnitId],
          );
      await recordLabelPrintJob(
        {
          jobType: 'UNIT',
          serialUnitId,
          unitUid,
          qrPayload: unitUid ?? qrPayload ?? serial,
          symbology: input.symbology ?? 'datamatrix',
          templateId: 'product',
          isReprint: (printed?.rows.length ?? 0) > 0,
          actorStaffId: input.actorStaffId,
          clientEventId: clientEventId ? `${clientEventId}:${serial}` : null,
        },
        orgId,
      );
    })(),
  ]);

  const failed: UnitLabelPrintResult['failed'] = [];
  if (eventWrite.status === 'rejected') {
    failed.push('inventory_event');
    console.warn('[recordUnitLabelPrint] LABELED inventory event failed', { serial, err: eventWrite.reason });
  }
  if (jobWrite.status === 'rejected') {
    failed.push('label_print_job');
    console.warn('[recordUnitLabelPrint] label_print_jobs insert failed', { serial, err: jobWrite.reason });
  }
  return { upserted, unitUid, failed };
}
