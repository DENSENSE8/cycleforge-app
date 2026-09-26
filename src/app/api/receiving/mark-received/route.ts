import { NextResponse, after } from 'next/server';
import pool from '@/lib/db';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import { formatPSTTimestamp } from '@/utils/date';
import { buildZohoReceiveNoteLine, zohoReceiveStaffName } from '@/lib/receiving/zoho-receive-note';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { publishReceivingLogChanged, publishReturnPendingTest, publishOrderReadyShip } from '@/lib/realtime/publish';
import {
  assertPurchaseOrderLineItemsEditable,
  assertPurchaseOrderReceivable,
  buildPurchaseOrderLineItemsForDescriptionPut,
  catalogItemIdFromZohoPoLineItem,
  createPurchaseReceive,
  getPurchaseOrderById,
  searchItemBySku,
  updatePurchaseOrder,
} from '@/lib/zoho';
import { withZohoOrg } from '@/lib/zoho/tenant-context';
import { withAuth } from '@/lib/auth/withAuth';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { upsertReceivingLineTesting } from '@/lib/receiving/facts/narrow';
import { upsertReceivingUnbox } from '@/lib/receiving/streets/carton-street-write';
import { upsertSerialUnit, recordOriginProvenance } from '@/lib/neon/serial-units-queries';
import { registerShipmentPermissive } from '@/lib/shipping/sync-shipment';
import { transition, type SerialState } from '@/lib/inventory/state-machine';
import { transitionReceivingLine } from '@/lib/receiving/state-machine';
import { getOrganization } from '@/lib/tenancy/organizations';
import { getReceivingDefaultPutawayBin, getReceivingPhotoPolicy } from '@/lib/settings/accessors';
import {
  evaluateReceivingPhotoPolicyGate,
  isPreReceiveWorkflowStatus,
} from '@/lib/receiving/photo-policy-gate';
import {
  PHOTO_POLICY_OVERRIDE_BODY_KEY,
  parsePhotoPolicyOverride,
  photoPolicyOverrideInvalidBody,
  photoPolicyOverrideWarning,
  recordPhotoPolicyOverride,
} from '@/lib/receiving/photo-policy-override';
import {
  QA_FAIL_EXCEPTION_STATUS,
  isQaFailExceptionCode,
  type PhotoPolicyOverrideCode,
} from '@/lib/receiving/exception-codes';
import { recordReceivingException } from '@/lib/receiving/exceptions';
import type { OrgId } from '@/lib/tenancy/constants';
import {
  isPlacementParityObserve,
  isPlacementStrangleReceivingPutaway,
} from '@/lib/feature-flags';
import { observePlacementParity } from '@/lib/workflow/placement-parity';
import { resolveSitePlacementBin } from '@/lib/workflow/placement-policy';
import type { PlacementResolverDeps } from '@/lib/workflow/placement';
import { receivingDefaultPutawayPolicy } from '@/lib/receiving/putaway-placement';

// Default putaway bin (cached per Function instance).
const cachedDefaultPutawayBinId = new Map<string, number | null>();

/** The org's default-putaway bin BARCODE (Settings Registry `receiving.defaultPutawayBin` → RECEIVING_DEFAULT_PUTAWAY_BIN_BARCODE env →… */
async function defaultPutawayBarcode(orgId: string): Promise<string> {
  const org = await getOrganization(orgId as OrgId);
  return org
    ? getReceivingDefaultPutawayBin(org.settings, process.env.RECEIVING_DEFAULT_PUTAWAY_BIN_BARCODE)
    : (process.env.RECEIVING_DEFAULT_PUTAWAY_BIN_BARCODE || 'UNSORTED').trim();
}

/** A bin lookup that mirrors resolveDefaultPutawayBinId's filter (RESERVE + active),
 *  so the placement mechanism resolves the SAME bin the legacy path would. */
function reserveBinDeps(orgId: string): PlacementResolverDeps {
  const find = async (barcode: string): Promise<{ id: number; name: string } | null> => {
    const r = await tenantQuery<{ id: number; name: string }>(
      orgId,
      `SELECT id, name FROM locations
        WHERE barcode = $1
          AND is_active = true
          AND bin_role = 'RESERVE'
          AND organization_id = $2
        ORDER BY id ASC
        LIMIT 1`,
      [barcode, orgId],
    );
    return r.rows[0] ?? null;
  };
  return { findByBarcode: find, findByName: async () => null };
}

async function resolveDefaultPutawayBinId(orgId: string): Promise<number | null> {
  const barcode = await defaultPutawayBarcode(orgId);
  const cacheKey = `${orgId}:${barcode}`;
  if (cachedDefaultPutawayBinId.has(cacheKey)) return cachedDefaultPutawayBinId.get(cacheKey)!;
  let resolved: number | null = null;
  try {
    const r = await tenantQuery<{ id: number }>(
      orgId,
      `SELECT id FROM locations
        WHERE barcode = $1
          AND is_active = true
          AND bin_role = 'RESERVE'
          AND organization_id = $2
        ORDER BY id ASC
        LIMIT 1`,
      [barcode, orgId],
    );
    resolved = r.rows[0]?.id ?? null;
  } catch (err) {
    console.warn(`[mark-received] default-putaway bin lookup failed for barcode=${barcode}:`, err);
    resolved = null;
  }
  cachedDefaultPutawayBinId.set(cacheKey, resolved);
  return resolved;
}

/** Directed-putaway suggestion (receiving-triage streamline Phase 4b). */
async function suggestPutawayBinIdForSku(sku: string | null, orgId: string): Promise<number | null> {
  if (!sku) return null;
  try {
    const r = await tenantQuery<{ bin_id: number }>(
      orgId,
      `SELECT ie.bin_id
         FROM inventory_events ie
        WHERE ie.sku = $1
          AND ie.event_type = 'PUTAWAY'
          AND ie.bin_id IS NOT NULL
          AND ie.organization_id = $2
          AND EXISTS (
            SELECT 1 FROM locations l
             WHERE l.id = ie.bin_id AND l.is_active = true
          )
        ORDER BY ie.id DESC
        LIMIT 1`,
      [sku, orgId],
    );
    return r.rows[0]?.bin_id ?? null;
  } catch (err) {
    console.warn(`[mark-received] putaway SKU-affinity lookup failed for sku=${sku}:`, err);
    return null;
  }
}

/** Receive-event overlay: */
async function applyInventoryV2Effects(input: {
  /** Tenant scope — stamped on the serial_units fallback upsert so the per-org natural key resolves. */
  organizationId: string;
  receivingId: number | null;
  receivingLineId: number;
  sku: string | null;
  qtyReceived: number;
  serialNumber: string | null;
  /** Pre-resolved serial_units.id from the caller's canonical upsertSerialUnit (unit_uid mint + return-detection + metadata). */
  serialUnitId: number | null;
  /**
   * True when the canonical writer detected this serial as a return (it was
   * previously SHIPPED). Suppresses the sellable +qty ledger row and the
   * auto-putaway-to-STOCKED transition so the unit stays RETURNED for QC.
   */
  isReturn: boolean;
  zohoItemId: string | null;
  conditionGrade: string;
  dispositionCode: string;
  destinationBinId: number | null;
  staffId: number;
  clientEventId: string | null;
  notes: string | null;
  nowPst: string;
}): Promise<{ ledgerId: number | null; receivedEventId: number; putawayEventId: number | null; serialUnitId: number | null }> {
  return withTenantTransaction(input.organizationId, async (client) => {
    // 1. Serial unit.
    let serialUnitId: number | null = input.serialUnitId ?? null;
    if (serialUnitId == null && input.serialNumber) {
      // The conflict branch deliberately does NOT touch current_status:
      const upsert = await client.query<{ id: number; current_status: string }>(
        `INSERT INTO serial_units (
          serial_number, normalized_serial, sku, zoho_item_id,
          current_status, current_location, received_at, received_by, condition_grade,
          organization_id
        )
        VALUES ($1, UPPER(TRIM($1)), $2, $3, 'RECEIVED'::serial_status_enum,
                $8, $5, $6, $7::condition_grade_enum, $9::uuid)
        ON CONFLICT (organization_id, normalized_serial) DO UPDATE SET
          current_location = COALESCE(EXCLUDED.current_location, serial_units.current_location),
          received_at = EXCLUDED.received_at,
          received_by = EXCLUDED.received_by,
          condition_grade = EXCLUDED.condition_grade,
          sku = COALESCE(serial_units.sku, EXCLUDED.sku),
          updated_at = NOW()
        RETURNING id, current_status::text AS current_status`,
        [
          input.serialNumber,
          input.sku,
          input.zohoItemId,
          input.receivingLineId,
          input.nowPst,
          input.staffId > 0 ? input.staffId : null,
          input.conditionGrade,
          input.destinationBinId != null ? String(input.destinationBinId) : null,
          input.organizationId,
        ],
      );
      serialUnitId = upsert.rows[0]?.id ?? null;
      const existingStatus = (upsert.rows[0]?.current_status ?? null) as SerialState | null;
      if (serialUnitId != null && existingStatus != null && existingStatus !== 'RECEIVED') {
        // Pre-existing unit re-scanned at receiving:
        const reset = await transition({
          unitId: serialUnitId,
          to: 'RECEIVED',
          eventType: 'ADJUSTED',
          actorStaffId: input.staffId > 0 ? input.staffId : null,
          station: 'RECEIVING',
          clientEventId: input.clientEventId ? `${input.clientEventId}:RECEIVED-RESET` : null,
          expectedFrom: existingStatus,
          receivingId: input.receivingId,
          receivingLineId: input.receivingLineId,
          binId: input.destinationBinId,
          notes: input.notes,
          payload: {
            source: 'receiving.mark-received',
            fallback_upsert: true,
            qty_received: input.qtyReceived,
          },
        }, client, input.organizationId as OrgId);
        if (!reset.ok) {
          console.warn(`mark-received fallback upsert: RECEIVED transition skipped for unit ${serialUnitId}: ${reset.error}`);
        }
      }
      // Phase 4: origin provenance written app-side (columns dropped).
      if (serialUnitId != null) {
        await recordOriginProvenance(
          client,
          input.organizationId,
          serialUnitId,
          { origin_source: 'receiving', origin_receiving_line_id: input.receivingLineId },
          new Date().toISOString(),
        );
      }
    }

    // 2. sku_stock_ledger row — only for ACCEPT disposition with qty.
    let ledgerId: number | null = null;
    if (
      input.sku &&
      input.qtyReceived > 0 &&
      input.dispositionCode === 'ACCEPT' &&
      !input.isReturn
    ) {
      const ledger = await client.query<{ id: number }>(
        `INSERT INTO sku_stock_ledger (
          sku, delta, reason, dimension, staff_id,
          ref_serial_unit_id, ref_receiving_line_id, notes, organization_id
        )
        VALUES ($1, $2, 'RECEIVED', 'WAREHOUSE', $3, $4, $5, $6, $7::uuid)
        RETURNING id`,
        [
          input.sku,
          input.qtyReceived,
          input.staffId > 0 ? input.staffId : null,
          serialUnitId,
          input.receivingLineId,
          input.notes,
          input.organizationId,
        ],
      );
      ledgerId = ledger.rows[0]?.id ?? null;
    }

    // 3. inventory_events RECEIVED — always emitted on the flagged path
    //    so the lifecycle timeline reflects every intake even when
    //    qty=0 or disposition=SCRAP/RTV.
    const receivedClientEventId = input.clientEventId
      ? `${input.clientEventId}:RECEIVED`
      : null;
    const receivedEvent = await client.query<{ id: number }>(
      `INSERT INTO inventory_events (
        event_type, actor_staff_id, station,
        receiving_id, receiving_line_id, serial_unit_id, sku,
        bin_id, prev_status, next_status, stock_ledger_id,
        client_event_id, notes, payload, organization_id
      )
      VALUES ('RECEIVED', $1, 'RECEIVING',
              $2, $3, $4, $5,
              $6, NULL, 'RECEIVED', $7,
              $8, $9, $10::jsonb, $11::uuid)
      ON CONFLICT (client_event_id) DO NOTHING
      RETURNING id`,
      [
        input.staffId > 0 ? input.staffId : null,
        input.receivingId,
        input.receivingLineId,
        serialUnitId,
        input.sku,
        input.destinationBinId,
        ledgerId,
        receivedClientEventId,
        input.notes,
        JSON.stringify({
          condition_grade: input.conditionGrade,
          disposition_code: input.dispositionCode,
          qty_received: input.qtyReceived,
        }),
        input.organizationId,
      ],
    );
    // If conflict swallowed the insert, look up the existing row.
    let receivedEventId = receivedEvent.rows[0]?.id;
    if (receivedEventId == null && receivedClientEventId) {
      const existing = await client.query<{ id: number }>(
        `SELECT id FROM inventory_events WHERE client_event_id = $1 AND organization_id = $2 LIMIT 1`,
        [receivedClientEventId, input.organizationId],
      );
      receivedEventId = existing.rows[0]?.id;
    }
    if (receivedEventId == null) {
      throw new Error('applyInventoryV2Effects: failed to insert or resolve RECEIVED event');
    }

    // 4. inventory_events PUTAWAY — only when a destination bin is provided AND the unit is accepted.
    let putawayEventId: number | null = null;
    if (input.destinationBinId != null && input.dispositionCode === 'ACCEPT' && !input.isReturn) {
      const putawayClientEventId = input.clientEventId
        ? `${input.clientEventId}:PUTAWAY`
        : null;
      if (serialUnitId) {
        // Serialized putaway:
        const t = await transition({
          unitId: serialUnitId,
          to: 'STOCKED',
          eventType: 'PUTAWAY',
          actorStaffId: input.staffId > 0 ? input.staffId : null,
          station: 'RECEIVING',
          clientEventId: putawayClientEventId,
          expectedFrom: 'RECEIVED',
          receivingId: input.receivingId,
          receivingLineId: input.receivingLineId,
          stockLedgerId: ledgerId,
          binId: input.destinationBinId,
          payload: { qty: input.qtyReceived, condition_grade: input.conditionGrade },
        }, client, input.organizationId as OrgId);
        if (t.ok) {
          putawayEventId = t.eventId;
          await client.query(
            `UPDATE serial_units SET current_location = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3`,
            [String(input.destinationBinId), serialUnitId, input.organizationId],
          );
        } else {
          console.warn(`mark-received putaway: STOCKED transition skipped for unit ${serialUnitId}: ${t.error}`);
        }
      } else {
        // Qty-only putaway (no serialized unit): emit the informational PUTAWAY
        // event directly — there is no unit to transition.
        const putawayEvent = await client.query<{ id: number }>(
          `INSERT INTO inventory_events (
            event_type, actor_staff_id, station,
            receiving_id, receiving_line_id, serial_unit_id, sku,
            bin_id, prev_status, next_status, stock_ledger_id,
            client_event_id, payload, organization_id
          )
          VALUES ('PUTAWAY', $1, 'RECEIVING',
                  $2, $3, $4, $5,
                  $6, 'RECEIVED', 'STOCKED', $7,
                  $8, $9::jsonb, $10::uuid)
          ON CONFLICT (client_event_id) DO NOTHING
          RETURNING id`,
          [
            input.staffId > 0 ? input.staffId : null,
            input.receivingId,
            input.receivingLineId,
            serialUnitId,
            input.sku,
            input.destinationBinId,
            ledgerId,
            putawayClientEventId,
            JSON.stringify({
              qty: input.qtyReceived,
              condition_grade: input.conditionGrade,
            }),
            input.organizationId,
          ],
        );
        putawayEventId = putawayEvent.rows[0]?.id ?? null;
      }
    }

    return { ledgerId, receivedEventId, putawayEventId, serialUnitId };
  });
}

export const POST = withAuth(async (request, ctx) => {
  const body = await request.json();
  const receivingLineId = Number(body?.receiving_line_id);
  const receivingId = body?.receiving_id != null ? Number(body.receiving_id) : null;
  const zohoPoId = String(body?.zoho_purchaseorder_id || '').trim();
  const zohoLineItemId = String(body?.zoho_line_item_id || '').trim();
  const zohoItemId = String(body?.zoho_item_id || '').trim();
  // A QA FAIL reason is a receiving EXCEPTION, not a note.
  const rawQaFailCode = body?.exception_code == null ? null : String(body.exception_code).trim();
  if (rawQaFailCode && !isQaFailExceptionCode(rawQaFailCode)) {
    return NextResponse.json(
      { success: false, error: 'QA_FAIL_REASON', code: rawQaFailCode },
      { status: 400 },
    );
  }
  const qaFailCode = isQaFailExceptionCode(rawQaFailCode) ? rawQaFailCode : null;

  // The reason and the verdict are ONE fact at two grains, so the code decides the verdict.
  const bodyQaStatus = body?.qa_status == null ? null : String(body.qa_status).trim();
  const derivedQaStatus = qaFailCode ? QA_FAIL_EXCEPTION_STATUS[qaFailCode] : null;
  if (derivedQaStatus && bodyQaStatus && bodyQaStatus !== derivedQaStatus) {
    return NextResponse.json(
      {
        success: false,
        error: 'QA_FAIL_REASON_CONFLICT',
        expected: derivedQaStatus,
        received: bodyQaStatus,
      },
      { status: 400 },
    );
  }
  const qaStatus = derivedQaStatus ?? bodyQaStatus ?? 'PASSED';
  const dispositionCode = String(body?.disposition_code || 'ACCEPT').trim();
  const conditionGrade = String(body?.condition_grade || 'USED_A').trim();
  const serialNumber = String(body?.serial_number || '').trim() || null;
  const zendeskTicket = String(body?.zendesk_ticket || '').trim() || null;
  const notes = String(body?.notes || '').trim() || null;
  // WS-PHOTO §4 soft block:
  const photoPolicyOverride = parsePhotoPolicyOverride(body?.[PHOTO_POLICY_OVERRIDE_BODY_KEY]);
  /** Set only when a valid override actually waived a real block. */
  let photoPolicyWaiver: { code: PhotoPolicyOverrideCode; blockers: string[] } | null = null;
  // Optional destination bin scanned at the same time as the receive action.
  const destinationBinIdRaw = body?.destination_bin_id;
  let destinationBinId =
    Number.isFinite(Number(destinationBinIdRaw)) && Number(destinationBinIdRaw) > 0
      ? Math.floor(Number(destinationBinIdRaw))
      : null;
  // True only when the operator scanned an explicit bin. When false we may
  // upgrade the default to a directed SKU-affinity suggestion below (Phase 4b).
  const binExplicit = destinationBinId != null;
  let putawayBinSource: 'operator' | 'sku_affinity' | 'default' | null = binExplicit
    ? 'operator'
    : null;
  if (destinationBinId == null && dispositionCode === 'ACCEPT') {
    const legacyBinId = await resolveDefaultPutawayBinId(ctx.organizationId);
    destinationBinId = legacyBinId;
    putawayBinSource = 'default';

    // Placement strangle (§1.6 Track 1): the default-putaway bin choice is a
    // disposition→bin decision. Only do the (extra) policy work when a
    // placement flag is on — otherwise this is the untouched legacy path.
    if (isPlacementStrangleReceivingPutaway() || isPlacementParityObserve()) {
      const barcode = await defaultPutawayBarcode(ctx.organizationId);
      const policy = receivingDefaultPutawayPolicy(barcode);
      const binDeps = reserveBinDeps(ctx.organizationId);

      // CUTOVER: resolve from the declarative policy (org Studio rules → system
      // default), via the RESERVE+active lookup, falling back to the legacy bin.
      if (isPlacementStrangleReceivingPutaway()) {
        const resolved = await resolveSitePlacementBin({
          orgId: ctx.organizationId,
          facts: { disposition: 'ACCEPT' },
          systemPolicy: policy,
          binDeps,
        });
        if (resolved) {
          destinationBinId = resolved.bin.binId;
          putawayBinSource = 'default';
        }
      }

      // OBSERVE-ONLY: prove the mechanism resolves the same bin as the legacy
      // path. Fire-and-forget + self-guarded — never disturbs the receive.
      void observePlacementParity({
        site: 'receiving-default-putaway',
        orgId: ctx.organizationId,
        facts: { disposition: 'ACCEPT' },
        rules: policy,
        expected: legacyBinId != null ? { binId: legacyBinId, binName: barcode } : null,
        deps: binDeps,
      });
    }
  }
  // Idempotency token from the client (mobile scanner generates a UUID
  // per scan). Optional; unique within inventory_events.
  const clientEventId = String(body?.client_event_id || '').trim() || null;
  // Server-trusted actor from the verified session cookie. The wrapper
  // guarantees ctx.staffId is set on this permission-gated route.
  const staffId = ctx.staffId;

  // Resolve a human-readable staff name for Zoho payloads from the
  // verified session actor only — never trust body.staff_name.
  let staffName = '';
  if (staffId != null && Number.isFinite(staffId) && staffId > 0) {
    try {
      const staffLookup = await tenantQuery<{ name: string | null }>(
        ctx.organizationId,
        `SELECT name FROM staff WHERE id = $1 AND organization_id = $2 LIMIT 1`,
        [staffId, ctx.organizationId],
      );
      staffName = (staffLookup.rows[0]?.name || '').trim();
    } catch { /* silent — fall through to generic label */ }
  }
  staffName = zohoReceiveStaffName(staffName, staffId);

  if (!Number.isFinite(receivingLineId) || receivingLineId <= 0) {
    return NextResponse.json({ success: false, error: 'receiving_line_id is required' }, { status: 400 });
  }

  if (photoPolicyOverride.state === 'invalid') {
    return NextResponse.json(photoPolicyOverrideInvalidBody(), { status: 400 });
  }

  // Validate destination bin exists before we commit anything else.
  if (destinationBinId != null) {
    const binCheck = await tenantQuery<{ id: number }>(
      ctx.organizationId,
      `SELECT id FROM locations WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [destinationBinId, ctx.organizationId],
    );
    if (binCheck.rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'BIN_NOT_FOUND', destination_bin_id: destinationBinId },
        { status: 404 },
      );
    }
  }

  const now = formatPSTTimestamp();

  const hasZohoReceive = Boolean(zohoPoId && zohoLineItemId);

  // Capture before-state for audit_logs diff. Testing facts (qa/disposition/
  // condition) now live on receiving_line_testing (Wave-3 writer inversion) —
  // the spine columns are slated to drop, so read the facts table here.
  const beforeRes = await tenantQuery(
    ctx.organizationId,
    `SELECT rl.quantity_received, rl.quantity_expected, rl.workflow_status,
              rl.receiving_id AS line_receiving_id,
              rl.scanned_at,
              ru.unboxed_at,
              rlt.qa_status::text AS qa_status,
              rlt.disposition_code::text AS disposition_code,
              rlt.condition_grade::text AS condition_grade
         FROM receiving_line rl
         LEFT JOIN receiving_line_testing rlt ON rlt.receiving_line_id = rl.id
         LEFT JOIN receiving_unbox ru
           ON ru.receiving_id = rl.receiving_id AND ru.organization_id = rl.organization_id
        WHERE rl.id = $1 AND rl.organization_id = $2`,
    [receivingLineId, ctx.organizationId],
  );
  const beforeRow = (beforeRes.rows as Array<{
    quantity_received: number | null;
    quantity_expected: number | null;
    workflow_status: string | null;
    line_receiving_id: number | null;
    scanned_at: Date | string | null;
    unboxed_at: Date | string | null;
    qa_status: string | null;
    disposition_code: string | null;
    condition_grade: string | null;
  }>)[0] ?? null;

  // WS-PHOTO Plan 5 — `receiving.photoPolicy` completion-insurance gate, judged BEFORE any mutation (the line/serial/event writes below and…
  if (beforeRow) {
    const gateOrg = await getOrganization(ctx.organizationId as OrgId);
    const photoPolicy = gateOrg ? getReceivingPhotoPolicy(gateOrg.settings) : 'optional';
    if (photoPolicy !== 'optional') {
      const gate = await evaluateReceivingPhotoPolicyGate({
        organizationId: ctx.organizationId,
        // The line's own carton is the evidence scope — org-scoped truth from
        // the row, never the body's claim (which may be absent: the mobile QA
        // sheet posts only receiving_line_id).
        receivingId: beforeRow.line_receiving_id ?? null,
        policy: photoPolicy,
        alreadyReceived: !isPreReceiveWorkflowStatus(beforeRow.workflow_status),
      });
      if (!gate.ok) {
        // §4 soft block. WITHOUT an override this stays the byte-identical
        // 409 — the default is unchanged. WITH one, the receive proceeds and
        // the waiver is persisted + audited below (never a silent bypass).
        if (photoPolicyOverride.state !== 'valid') {
          return NextResponse.json(
            { success: false, error: 'PHOTO_POLICY', blockers: gate.blockers },
            { status: 409 },
          );
        }
        photoPolicyWaiver = { code: photoPolicyOverride.code, blockers: gate.blockers };
      }
    }
  }

  // 1. Update the line locally.
  const targetWorkflowStatus = 'DONE' as const;
  const foldedLine = await withTenantTransaction(ctx.organizationId, async (client) => {
    // Wave-3 writer inversion:
    const lineUpdate = await client.query(
      `UPDATE receiving_line
         SET notes = COALESCE($1, notes),
             quantity_received = GREATEST(
               COALESCE(quantity_received, 0),
               COALESCE(quantity_expected, 1)
             ),
             updated_at = NOW()
         WHERE id = $2 AND organization_id = $3
         RETURNING *`,
      [notes, receivingLineId, ctx.organizationId],
    );
    const row = lineUpdate.rows[0];
    if (!row) return null;
    // Overwrite semantics, exactly like the former spine SET (this route always
    // supplies all three). Bound to the tx client so the facts write commits
    // atomically with the spine row above.
    await upsertReceivingLineTesting(
      ctx.organizationId,
      receivingLineId,
      { qaStatus, dispositionCode, conditionGrade },
      { query: ((_org, sql, p) => client.query(sql, p as unknown[])) as typeof tenantQuery },
    );
    // RETURNING * predates the facts write (and the spine columns are dying) —
    // patch the in-memory row so the response/audit "after" see what we wrote,
    // exactly like the Step-D fold does for workflow_status below.
    row.qa_status = qaStatus;
    row.disposition_code = dispositionCode;
    row.condition_grade = conditionGrade;
    const currentStatus = String(row.workflow_status ?? '').trim().toUpperCase();
    if (currentStatus !== targetWorkflowStatus) {
      const tr = await transitionReceivingLine(
        {
          receivingLineId,
          to: targetWorkflowStatus,
          actorStaffId: staffId,
          receivedBy: staffId,
          skipEvent: true,
        },
        client,
        ctx.organizationId,
      );
      if (tr.ok) {
        // The facts UPDATE's RETURNING row predates the lifecycle write — patch it so downstream consumers (response payload, audit "after", the…
        row.workflow_status = tr.to;
        row.receiving_line_status = tr.coarse;
      } else {
        // Defensive only: 404 can't happen (the row is locked above) and no
        // expectedFrom is passed — keep the facts write, surface the skip.
        console.warn(
          `[mark-received] workflow transition ${currentStatus} → ${targetWorkflowStatus} skipped for line ${receivingLineId}: ${tr.error}`,
        );
      }
    }
    return row;
  });

  if (!foldedLine) {
    return NextResponse.json({ success: false, error: 'receiving_line not found' }, { status: 404 });
  }

  // §4 soft block — persist + audit the waiver as close to the mutation as possible (the line is now known to exist, so the exception FK is…
  if (photoPolicyWaiver) {
    await recordPhotoPolicyOverride(ctx.organizationId as OrgId, {
      code: photoPolicyWaiver.code,
      blockers: photoPolicyWaiver.blockers,
      // Evidence scope was the line's own carton — same source the gate used.
      receivingId: beforeRow?.line_receiving_id ?? null,
      receivingLineIds: [receivingLineId],
      staffId,
    });
    await recordAudit(pool, ctx, request, {
      source: 'receiving-station',
      action: AUDIT_ACTION.RECEIVING_PHOTO_POLICY_OVERRIDE,
      entityType: AUDIT_ENTITY.RECEIVING_LINE,
      entityId: receivingLineId,
      reasonCode: photoPolicyWaiver.code,
      method: serialNumber ? 'scan' : 'manual',
      extra: {
        receiving_id: beforeRow?.line_receiving_id ?? receivingId,
        blockers: photoPolicyWaiver.blockers,
      },
    });
  }

  // The QA-fail reason lands in its own home — an OPEN line-level `receiving_exceptions` row (code + the operator's free text) — and NEVER…
  if (qaFailCode) {
    try {
      await recordReceivingException(ctx.organizationId as OrgId, {
        receivingLineId,
        receivingId: beforeRow?.line_receiving_id ?? receivingId,
        exceptionCode: qaFailCode,
        // No free text: the reason IS the code (see qa-fail-reason-wire.ts).
        // Prose about the item lives in the operator's item note, which this
        // path deliberately no longer touches.
        reason: null,
        createdBy: staffId,
      });
    } catch (err) {
      console.warn('[mark-received] receiving_exceptions write failed', err);
    }
  }

  let line = foldedLine;
  const qtyReceived = Number(line.quantity_received) || 1;
  let zohoReceiveOk = !hasZohoReceive;
  let zohoReceiveError: string | null = null;

  // Phase 4b: directed putaway. When the operator didn't scan an explicit bin
  // and we'd otherwise dump the unit in UNSORTED, send it to the bin this SKU
  // was last put away in (consolidates like stock). Only on ACCEPT + flag on.
  if (
    !binExplicit &&
    dispositionCode === 'ACCEPT' &&
    (line.sku ?? null)
  ) {
    const affinityBin = await suggestPutawayBinIdForSku(line.sku ?? null, ctx.organizationId);
    if (affinityBin != null) {
      destinationBinId = affinityBin;
      putawayBinSource = 'sku_affinity';
    }
  }

  // 2. Serial/stock/event writes.
  let serialUnitId: number | null = null;
  // A previously-SHIPPED serial coming back through the receiving door is a RETURN, not a fresh intake.
  let isReturn = false;
  if (serialNumber) {
    const serialResult = await upsertSerialUnit({
      serial_number: serialNumber,
      sku: line.sku ?? null,
      zoho_item_id: zohoItemId || null,
      origin_source: 'receiving',
      origin_receiving_line_id: receivingLineId,
      actor_id: staffId != null && staffId > 0 ? staffId : null,
      condition_grade: conditionGrade,
      target_status: 'RECEIVED',
      location: destinationBinId != null ? String(destinationBinId) : null,
    }, undefined, ctx.organizationId);
    serialUnitId = serialResult?.unit.id ?? null;
    isReturn = serialResult?.is_return ?? false;
  }

  let v2Effects: Awaited<ReturnType<typeof applyInventoryV2Effects>> | null = null;
  try {
    v2Effects = await applyInventoryV2Effects({
      organizationId: ctx.organizationId,
      receivingId,
      receivingLineId,
      sku: line.sku ?? null,
      qtyReceived,
      serialNumber,
      serialUnitId,
      isReturn,
      zohoItemId: zohoItemId || null,
      conditionGrade,
      dispositionCode,
      destinationBinId,
      staffId: staffId ?? 0,
      clientEventId,
      notes,
      nowPst: now,
    });
  } catch (err) {
    // Best-effort overlay. The serial row (a) and the line update have already
    // committed, so we log and continue rather than crashing the receive. An
    // admin can replay via /api/inventory-events.
    console.warn('mark-received: applyInventoryV2Effects failed', err);
  }

  // 3. Stamp the carton's unboxed milestone on the UNBOX street table (Wave-3 writer inversion — the spine unboxed_* columns are dying).
  if (receivingId) {
    const carton = await withTenantTransaction(ctx.organizationId, async (client) => {
      const meta = await client.query<{
        is_return: boolean | null;
        is_priority: boolean | null;
        prev_unboxed_at: string | null;
        tracking: string | null;
      }>(
        `SELECT r.is_return, r.is_priority,
                  ru.unboxed_at AS prev_unboxed_at,
                  (SELECT s.tracking_number_raw FROM shipping_tracking_numbers s
                    WHERE s.id = r.shipment_id) AS tracking
             FROM receiving_carton r
             LEFT JOIN receiving_unbox ru ON ru.receiving_id = r.id
            WHERE r.id = $1 AND r.organization_id = $2
            LIMIT 1`,
        [receivingId, ctx.organizationId],
      );
      const row = meta.rows[0];
      if (!row) return null;
      await upsertReceivingUnbox(client, ctx.organizationId, receivingId, {
        unboxedAt: 'now',
        unboxedBy: staffId,
        deriveIntakePath: true,
      });
      return {
        is_return: row.is_return,
        is_priority: row.is_priority,
        just_unboxed: row.prev_unboxed_at == null,
        tracking: row.tracking,
      };
    }).catch(() => null);
    if (carton?.just_unboxed) {
      after(async () => {
        try {
          if (carton.is_return) {
            await publishReturnPendingTest({
              organizationId: ctx.organizationId,
              receivingId,
              trackingNumber: carton.tracking,
              source: 'receiving.mark-received',
            });
          } else if (carton.is_priority) {
            await publishOrderReadyShip({
              organizationId: ctx.organizationId,
              receivingId,
              trackingNumber: carton.tracking,
              source: 'receiving.mark-received',
            });
          }
        } catch (err) {
          console.warn('mark-received: tech-inbox notify failed', err);
        }
      });
    }
  }

  // Resolve tracking# for the reference_number push. Prefer the canonical
  // shipping_tracking_numbers row via receiving.shipment_id; fall back to
  // receiving.receiving_tracking_number. Computed before the Zoho receive call.
  let localTracking: string | null = null;
  let trackingShipmentId: number | null = null;
  if (receivingId) {
    try {
      const trackingRes = await tenantQuery<{
        tracking: string | null;
        shipment_id: number | null;
      }>(
        ctx.organizationId,
        `SELECT stn.tracking_number_raw AS tracking,
                  r.shipment_id
             FROM receiving_carton r
             LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
            WHERE r.id = $1 AND r.organization_id = $2
            LIMIT 1`,
        [receivingId, ctx.organizationId],
      );
      localTracking = (trackingRes.rows[0]?.tracking || '').trim() || null;
      trackingShipmentId = trackingRes.rows[0]?.shipment_id ?? null;
    } catch { /* silent — Zoho push will just skip */ }
  }

  // Backfill shipment_id when this receiving row arrived via /lookup-po before the shipping_tracking_numbers row existed (or as a Zoho…
  if (receivingId && trackingShipmentId == null && localTracking) {
    try {
      const shipment = await registerShipmentPermissive({
        trackingNumber: localTracking,
        sourceSystem: 'receiving.mark-received',
      }, ctx.organizationId);
      if (shipment?.id) {
        await tenantQuery(
          ctx.organizationId,
          `UPDATE receiving_carton
                SET shipment_id = $1, updated_at = NOW()
              WHERE id = $2 AND shipment_id IS NULL AND organization_id = $3`,
          [shipment.id, receivingId, ctx.organizationId],
        );
      }
    } catch (err) {
      console.warn('[mark-received] shipment_id backfill failed', {
        receiving_id: receivingId,
        tracking: localTracking,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 4. Zoho purchase receive (await before responding). PO notes/serials only after receive succeeds.
  if (hasZohoReceive) {
    try {
      // Bind the authenticated tenant so the Zoho client resolves THIS org's creds.
      const poResp = await withZohoOrg(ctx.organizationId, () => getPurchaseOrderById(zohoPoId));
      assertPurchaseOrderReceivable(poResp);
      let catalogId = zohoItemId && zohoItemId.length > 0 ? zohoItemId : '';
      if (!catalogId) {
        const items = poResp.purchaseorder?.line_items || [];
        for (const raw of items) {
          if (!raw || typeof raw !== 'object') continue;
          const li = raw as unknown as Record<string, unknown>;
          const id = String(li.line_item_id ?? li.id ?? '').trim();
          if (id !== zohoLineItemId) continue;
          catalogId = catalogItemIdFromZohoPoLineItem(raw) || '';
          break;
        }
      }
      if (!catalogId && line.sku) {
        try {
          const hit = await withZohoOrg(ctx.organizationId, () => searchItemBySku(String(line.sku)));
          catalogId = hit?.item_id ? String(hit.item_id).trim() : '';
        } catch {
          catalogId = '';
        }
      }
      if (!catalogId) {
        throw new Error(
          `Cannot resolve Zoho catalog item_id for PO line ${zohoLineItemId}.`,
        );
      }
      await withZohoOrg(ctx.organizationId, () =>
        createPurchaseReceive({
          purchaseOrderId: zohoPoId,
          lineItems: [
            {
              line_item_id: zohoLineItemId,
              quantity_received: qtyReceived,
              item_id: catalogId,
            },
          ],
          bills: poResp.purchaseorder?.bills,
        }),
      );
      zohoReceiveOk = true;
      // Local DONE already stamped above — Zoho success does not re-promote.

      try {
        const existing = await withZohoOrg(ctx.organizationId, () => getPurchaseOrderById(zohoPoId));
        const patch: Record<string, unknown> = {};

        if (serialNumber) {
          try {
            assertPurchaseOrderLineItemsEditable(existing);
            if (existing.purchaseorder) {
              const built = buildPurchaseOrderLineItemsForDescriptionPut(
                existing.purchaseorder,
                { [zohoLineItemId]: `SN: ${serialNumber.trim()}` },
              );
              if (built.length > 0) {
                patch.line_items = built;
              }
            }
          } catch (e) {
            console.warn('mark-received: Zoho PO line description skipped', e);
          }
        }

        const poHeader = (existing?.purchaseorder || {}) as Record<string, unknown>;
        const currentRef = String(poHeader.reference_number || '').trim();
        const currentNotes = String(poHeader.notes || '');

        if (localTracking && currentRef !== localTracking) {
          patch.reference_number = localTracking;
        }

        const noteLead: string[] = [
          buildZohoReceiveNoteLine({
            staffName,
            scannedAt: beforeRow?.scanned_at ?? null,
            unboxedAt: beforeRow?.unboxed_at ?? null,
          }),
        ];
        if (zendeskTicket) noteLead.push(`Zendesk: ${zendeskTicket}`);
        const noteHead = noteLead.join(' · ');
        const noteTail = [
          ...(serialNumber ? [`SN: ${serialNumber}`] : []),
          ...(notes ? [`Notes: ${notes}`] : []),
        ].join(' | ');
        const newLine = noteTail ? `${noteHead} · ${noteTail}` : noteHead;

        if (!currentNotes.includes(newLine)) {
          patch.notes = currentNotes ? `${newLine}\n${currentNotes}` : newLine;
        }

        if (Object.keys(patch).length > 0) {
          await withZohoOrg(ctx.organizationId, () => updatePurchaseOrder(zohoPoId, patch));
        }
      } catch (err) {
        console.warn('mark-received: updatePurchaseOrder sync failed', err);
      }
    } catch (err) {
      // Inventory side already committed (line update + v2Effects).
      zohoReceiveOk = false;
      zohoReceiveError = err instanceof Error ? err.message : String(err);
      console.error('[mark-received] createPurchaseReceive failed — inventory committed, Zoho pending', {
        receiving_line_id: receivingLineId,
        receiving_id: receivingId,
        zoho_po_id: zohoPoId,
        zoho_line_item_id: zohoLineItemId,
        qty_received: qtyReceived,
        serial_number: serialNumber ?? null,
        message: zohoReceiveError,
      });
    }
  }

  after(async () => {
    try {
      await invalidateReceivingViews(ctx.organizationId, ['serial-units']);
      await publishReceivingLogChanged({
        organizationId: ctx.organizationId,
        action: 'update',
        rowId: String(receivingLineId),
        source: 'receiving.mark-received',
      });
    } catch (err) {
      console.warn('mark-received: cache/realtime failed', err);
    }
  });

  const workflowStatus =
    String(line.workflow_status ?? '').trim() || 'DONE';

  await recordAudit(pool, ctx, request, {
    source: 'receiving-station',
    action: AUDIT_ACTION.PO_RECEIVE,
    entityType: AUDIT_ENTITY.RECEIVING_LINE,
    entityId: receivingLineId,
    before: beforeRow
      ? {
          quantity_received: beforeRow.quantity_received,
          quantity_expected: beforeRow.quantity_expected,
          workflow_status: beforeRow.workflow_status,
          qa_status: beforeRow.qa_status,
          disposition_code: beforeRow.disposition_code,
          condition_grade: beforeRow.condition_grade,
        }
      : null,
    after: {
      quantity_received: line.quantity_received,
      quantity_expected: line.quantity_expected,
      workflow_status: workflowStatus,
      qa_status: line.qa_status,
      disposition_code: line.disposition_code,
      condition_grade: line.condition_grade,
    },
    method: serialNumber ? 'scan' : 'manual',
    ...(qaFailCode ? { reasonCode: qaFailCode } : {}),
    extra: {
      receiving_id: receivingId,
      zoho_purchaseorder_id: zohoPoId || null,
      zoho_line_item_id: zohoLineItemId || null,
      zoho_synced: zohoReceiveOk,
      ...(serialNumber ? { serial_number: serialNumber } : {}),
      ...(zendeskTicket ? { zendesk_ticket: zendeskTicket } : {}),
      ...(zohoReceiveError ? { zoho_error: zohoReceiveError } : {}),
    },
  });

  return NextResponse.json({
    success: zohoReceiveOk,
    receiving_line_id: receivingLineId,
    workflow_status: workflowStatus,
    zoho_synced: zohoReceiveOk,
    ...(zohoReceiveError ? { zoho_error: zohoReceiveError } : {}),
    // §4 soft block: the receive went through, but say WHAT was waived —
    // same `code`/`blockers` the 409 would have carried.
    ...(photoPolicyWaiver
      ? {
          warnings: [
            photoPolicyOverrideWarning(photoPolicyWaiver.code, photoPolicyWaiver.blockers),
          ],
        }
      : {}),
    receiving_line: line,
    ...(v2Effects
      ? {
          inventory_v2: {
            received_event_id: v2Effects.receivedEventId,
            putaway_event_id: v2Effects.putawayEventId,
            stock_ledger_id: v2Effects.ledgerId,
            serial_unit_id: v2Effects.serialUnitId,
          },
          // Phase 4b: where the unit was directed and why (operator scan,
          // SKU affinity, or the UNSORTED default), so the UI can confirm it.
          putaway: { bin_id: destinationBinId, source: putawayBinSource },
        }
      : {}),
  });
}, { permission: 'receiving.mark_received' });
