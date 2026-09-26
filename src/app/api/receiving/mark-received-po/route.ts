import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import { logger } from '@/lib/observability/logger';
import { formatPSTTimestamp } from '@/utils/date';
import { buildZohoReceiveNoteLine, zohoReceiveStaffName } from '@/lib/receiving/zoho-receive-note';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { publishReceivingLogChanged } from '@/lib/realtime/publish';
import { scheduleAfterResponse } from '@/lib/next/schedule-after-response';
// Pure payload helpers only — every Zoho NETWORK call in this route goes
// through the org's InventoryProvider facade (Integrations-as-SoT Wave B1).
import {
  assertPurchaseOrderLineItemsEditable,
  buildPurchaseOrderLineItemsForDescriptionPut,
} from '@/lib/zoho';
import { withZohoOrg } from '@/lib/zoho/tenant-context';
import { getInventoryProvider } from '@/lib/integrations/inventory';

/** Keep the isolate alive long enough for the background PO notes/description PUT. */
export const maxDuration = 120;
import { receiveLineUnits, unreceiveLineUnits } from '@/lib/receiving/receive-line';
import { transitionReceivingLine } from '@/lib/receiving/state-machine';
import { upsertReceivingLineZoho } from '@/lib/receiving/facts/narrow';
import { upsertReceivingUnbox } from '@/lib/receiving/streets/carton-street-write';
import { attachSerialToLine } from '@/lib/receiving/serial-attach';
import { refreshLineSerialProjectionSafe } from '@/lib/receiving/serial-projection';
import { tapWorkflow } from '@/lib/workflow/tap';
import {
  claimOrReplay,
  finalizeIdempotencyClaim,
  readIdempotencyKey,
  releaseIdempotencyClaim,
} from '@/lib/api-idempotency';

const IDEMPOTENCY_ROUTE = 'receiving.mark-received-po';
import { withAuth } from '@/lib/auth/withAuth';
import { getOrganization } from '@/lib/tenancy/organizations';
import type { OrgId } from '@/lib/tenancy/constants';
import { getReceivingPhotoPolicy } from '@/lib/settings/accessors';
import { evaluateReceivingPhotoPolicyGate } from '@/lib/receiving/photo-policy-gate';
import {
  PHOTO_POLICY_OVERRIDE_BODY_KEY,
  parsePhotoPolicyOverride,
  photoPolicyOverrideInvalidBody,
  photoPolicyOverrideWarning,
  recordPhotoPolicyOverride,
} from '@/lib/receiving/photo-policy-override';
import type { PhotoPolicyOverrideCode } from '@/lib/receiving/exception-codes';
import { recordAudit, AUDIT_ACTION, AUDIT_ENTITY } from '@/lib/audit-logs';
import { conditionLabel } from '@/lib/conditions';
import { mergeSerialNoteIntoLineDescription } from '@/lib/zoho';
import { recordOpsEvent } from '@/lib/ops-events';
import { resolveSurfaceWorkflowNodeId } from '@/lib/stations/surface-workflow-node';

function normalizeSkuKey(s: string | null | undefined): string {
  return String(s ?? '').trim().toLowerCase();
}

/** Map a local line to Zoho's line_item_id using PO payload (SKU match). */
function findZohoLineItemIdFromPoLines(
  lineItems: unknown[],
  sku: string | null | undefined,
  itemName: string | null | undefined,
): string | null {
  const wantSku = normalizeSkuKey(sku);
  const wantName = String(itemName ?? '').trim().toLowerCase();
  for (const raw of lineItems) {
    if (!raw || typeof raw !== 'object') continue;
    const li = raw as Record<string, unknown>;
    const id = String(li.line_item_id ?? li.id ?? '').trim();
    if (!id) continue;
    const liSku = normalizeSkuKey(String(li.sku ?? ''));
    if (wantSku && liSku === wantSku) return id;
    const liName = String(li.name ?? li.item_name ?? '').trim().toLowerCase();
    if (!wantSku && wantName && liName === wantName) return id;
  }
  return null;
}

interface CandidateRow {
  id: number;
  sku: string | null;
  item_name: string | null;
  quantity_expected: number | null;
  quantity_received: number;
  zoho_purchaseorder_id: string | null;
  zoho_line_item_id: string | null;
}

/** Receive every incomplete line on a carton (receiving_id) with shared QA / disposition / condition / notes, and append a single PO notes… */
export const POST = withAuth(async (request, ctx) => {
  // Tracks a pending idempotency claim we own so the catch can release it on a throw (the `const idempotencyKey` below is try-block-scoped,…
  let ownedClaim: { idempotencyKey: string; route: string } | null = null;
  try {
    const body = await request.json();
    const receivingIdRaw = Number(body?.receiving_id);
    const receivingId =
      Number.isFinite(receivingIdRaw) && receivingIdRaw > 0 ? Math.floor(receivingIdRaw) : null;
    const receivingLineIdRaw = Number(body?.receiving_line_id);
    const receivingLineIdHint =
      Number.isFinite(receivingLineIdRaw) && receivingLineIdRaw > 0
        ? Math.floor(receivingLineIdRaw)
        : null;
    const qaStatus = String(body?.qa_status || 'PASSED').trim();
    const dispositionCode = String(body?.disposition_code || 'ACCEPT').trim();
    const conditionGrade = String(body?.condition_grade || 'USED_A').trim();
    const serialNumber = String(body?.serial_number || '').trim() || null;
    // Explicit "no serial number" waiver: an audited reason code (the
    // serial_absent_reason vocabulary) instead of a silent blank serial.
    const serialAbsent = body?.serial_absent === true;
    const serialAbsentReason = serialAbsent
      ? String(body?.serial_absent_reason || '').trim() || null
      : null;
    const zendeskTicket = String(body?.zendesk_ticket || '').trim() || null;
    const notes = String(body?.notes || '').trim() || null;
    // WS-PHOTO §4 soft block:
    const photoPolicyOverride = parsePhotoPolicyOverride(body?.[PHOTO_POLICY_OVERRIDE_BODY_KEY]);
    /** Set only when a valid override actually waived a real block. */
    let photoPolicyWaiver: { code: PhotoPolicyOverrideCode; blockers: string[] } | null = null;
    // Server-trusted actor from the verified session cookie. The wrapper
    // guarantees ctx.staffId is set on this permission-gated route.
    const staffId = ctx.staffId;
    const clientEventId = String(body?.client_event_id ?? '').trim() || null;
    const stationRaw = String(body?.station ?? '').trim().toUpperCase();
    const station =
      stationRaw === 'MOBILE' || stationRaw === 'TECH' ? stationRaw : 'RECEIVING';

    let staffName = '';
    if (staffId != null && staffId > 0) {
      try {
        const staffLookup = await pool.query<{ name: string | null }>(
          `SELECT name FROM staff WHERE id = $1 LIMIT 1`,
          [staffId],
        );
        staffName = (staffLookup.rows[0]?.name || '').trim();
      } catch {
        /* silent */
      }
    }
    staffName = zohoReceiveStaffName(staffName, staffId);

    const receiveIntentRaw = String(body?.receive_intent ?? 'zoho_receive').trim().toLowerCase();
    const skipZohoReceive = receiveIntentRaw === 'scan_only';
    // 'unreceive' = full website undo of Receive: zero qty, clear received_done_at,
    // rewind to MATCHED, reverse Zoho PO received when linked. Distinct from
    // scan_only (workflow-only "mark scanned" that leaves qty/stamp alone).
    const isUnreceive = receiveIntentRaw === 'unreceive';
    // 'local_receive' = unfound carton:
    let localReceive = receiveIntentRaw === 'local_receive';
    /** Lines to load: scan_only + unreceive must see DONE lines to rewind them. */
    const includeAllLines = skipZohoReceive || isUnreceive;
    /** after() should call markPurchaseOrderUnreceived. */
    const reverseZohoReceive = skipZohoReceive || isUnreceive;

    if (receivingId == null) {
      return NextResponse.json(
        { success: false, error: 'receiving_id is required' },
        { status: 400 },
      );
    }

    if (photoPolicyOverride.state === 'invalid') {
      return NextResponse.json(photoPolicyOverrideInvalidBody(), { status: 400 });
    }

    // Idempotency: long-running Zoho-sync routes are exactly the place a network blip + client retry can fire the same request twice.
    const idempotencyKey = readIdempotencyKey(request, clientEventId);
    // Reserve-up-front idempotency.
    if (idempotencyKey) {
      const claim = await claimOrReplay<Record<string, unknown>>(pool, {
        orgId: ctx.organizationId,
        idempotencyKey,
        route: IDEMPOTENCY_ROUTE,
        staffId,
      });
      if (claim.outcome === 'replay') {
        return NextResponse.json(claim.body, { status: claim.status });
      }
      if (claim.outcome === 'in_progress') {
        return NextResponse.json(
          {
            success: false,
            error: 'This receive is already being processed. Please wait a moment and refresh.',
            idempotent_in_progress: true,
          },
          { status: 409 },
        );
      }
      // 'proceed' — we own the claim; remember it so the catch can release it.
      ownedClaim = { idempotencyKey, route: IDEMPOTENCY_ROUTE };
    }

    const respond = async (
      body: Record<string, unknown>,
      init?: { status?: number },
    ) => {
      const status = init?.status ?? 200;
      if (idempotencyKey) {
        if (status < 500) {
          // Finalize the claim with the real response (future retries replay it).
          await finalizeIdempotencyClaim(
            pool,
            { orgId: ctx.organizationId, idempotencyKey, route: IDEMPOTENCY_ROUTE, staffId },
            { status, body },
          );
        } else {
          // Transient 5xx — drop the claim so the next retry can run.
          await releaseIdempotencyClaim(pool, { idempotencyKey, route: IDEMPOTENCY_ROUTE });
        }
      }
      return NextResponse.json(body, init);
    };

    const now = formatPSTTimestamp();

    const stampRes = await tenantQuery<{ scanned_at: Date | null; unboxed_at: Date | null }>(
      ctx.organizationId,
      `SELECT MIN(rl.scanned_at) AS scanned_at, MIN(ru.unboxed_at) AS unboxed_at
         FROM receiving_line rl
         LEFT JOIN receiving_unbox ru
           ON ru.receiving_id = rl.receiving_id
          AND ru.organization_id = rl.organization_id
        WHERE rl.receiving_id = $1 AND rl.organization_id = $2`,
      [receivingId, ctx.organizationId],
    );
    const cartonScannedAt = stampRes.rows[0]?.scanned_at ?? null;
    const cartonUnboxedAt = stampRes.rows[0]?.unboxed_at ?? null;

    // scan_only is a local-only state action:
    const candidates = await tenantQuery<CandidateRow>(
      ctx.organizationId,
      includeAllLines
        ? `SELECT rl.id, rl.sku, rl.item_name, rl.quantity_expected, rl.quantity_received,
                  rz.zoho_purchaseorder_id, rz.zoho_line_item_id
           FROM receiving_line rl
           LEFT JOIN receiving_line_zoho rz ON rz.receiving_line_id = rl.id
           WHERE rl.receiving_id = $1
             AND rl.organization_id = $2
           ORDER BY rl.id ASC`
        : `SELECT rl.id, rl.sku, rl.item_name, rl.quantity_expected, rl.quantity_received,
                  rz.zoho_purchaseorder_id, rz.zoho_line_item_id
           FROM receiving_line rl
           LEFT JOIN receiving_line_zoho rz ON rz.receiving_line_id = rl.id
           WHERE rl.receiving_id = $1
             AND rl.organization_id = $2
             AND (
               rl.workflow_status IS DISTINCT FROM 'DONE'::inbound_workflow_status_enum
               OR (
                 rl.quantity_expected IS NOT NULL
                 AND COALESCE(rl.quantity_received, 0) < rl.quantity_expected
               )
             )
           ORDER BY rl.id ASC`,
      [receivingId, ctx.organizationId],
    );

    const openForReceive = candidates.rows;

    // Snapshot before-state per line for audit_logs before/after diffs.
    const beforeByLineId = new Map<
      number,
      { quantity_received: number; quantity_expected: number | null }
    >();
    for (const r of openForReceive) {
      beforeByLineId.set(r.id, {
        quantity_received: Number(r.quantity_received ?? 0),
        quantity_expected: r.quantity_expected,
      });
    }

    // Photo-policy gate (WS-PHOTO Plan 5):
    if (!skipZohoReceive && !isUnreceive && openForReceive.length > 0) {
      const gateOrg = await getOrganization(ctx.organizationId as OrgId);
      const photoPolicy = gateOrg ? getReceivingPhotoPolicy(gateOrg.settings) : 'optional';
      if (photoPolicy !== 'optional') {
        const gate = await evaluateReceivingPhotoPolicyGate({
          organizationId: ctx.organizationId,
          receivingId,
          policy: photoPolicy,
        });
        if (!gate.ok) {
          // §4 soft block.
          if (photoPolicyOverride.state !== 'valid') {
            if (ownedClaim) {
              await releaseIdempotencyClaim(pool, ownedClaim).catch(() => {});
              ownedClaim = null;
            }
            return NextResponse.json(
              { success: false, error: 'PHOTO_POLICY', blockers: gate.blockers },
              { status: 409 },
            );
          }
          photoPolicyWaiver = { code: photoPolicyOverride.code, blockers: gate.blockers };
        }
      }
    }

    /** When every line is already DONE locally, we still verify/receive in Zoho — load carton lines, skip receiveLineUnits. */
    let verifyOnlyLines: Array<CandidateRow & { workflow_status: string | null }> | null = null;
    if (openForReceive.length === 0) {
      const allLines = await tenantQuery<CandidateRow & { workflow_status: string | null }>(
        ctx.organizationId,
        `SELECT rl.id, rl.sku, rl.item_name, rl.quantity_expected, rl.quantity_received,
                rz.zoho_purchaseorder_id, rz.zoho_line_item_id, rl.workflow_status
         FROM receiving_line rl
         LEFT JOIN receiving_line_zoho rz ON rz.receiving_line_id = rl.id
         WHERE rl.receiving_id = $1
           AND rl.organization_id = $2
         ORDER BY rl.id ASC`,
        [receivingId, ctx.organizationId],
      );
      if (allLines.rows.length === 0) {
        // No receiving_lines exist for this carton.
        const metaRes = await tenantQuery<{
          source: string | null;
          zoho_purchaseorder_id: string | null;
        }>(
          ctx.organizationId,
          `SELECT source, zoho_purchaseorder_id FROM receiving_carton
            WHERE id = $1 AND organization_id = $2 LIMIT 1`,
          [receivingId, ctx.organizationId],
        );
        const recvSource = String(metaRes.rows[0]?.source || '').trim();
        const recvZohoPo = String(metaRes.rows[0]?.zoho_purchaseorder_id || '').trim();
        const isUnfoundCarton = recvSource === 'unmatched' && !recvZohoPo;

        if (isUnfoundCarton && !skipZohoReceive) {
          // Unboxed milestone lives on the UNBOX street table now (Wave-3
          // inversion). COALESCE-once + intake-path derivation are baked into
          // the helper — first stamp wins, exactly like the old spine COALESCE.
          await withTenantTransaction(ctx.organizationId, (client) =>
            upsertReceivingUnbox(client, ctx.organizationId, receivingId, {
              unboxedAt: 'now',
              unboxedBy: staffId,
              deriveIntakePath: true,
            }),
          ).catch(() => {});
          // Append-only ops spine event. Fail-open: receiving must proceed even if
          // ops_events is not yet present.
          try {
            await recordOpsEvent({
              organizationId: ctx.organizationId,
              entityType: 'receiving',
              entityId: receivingId,
              eventType: 'UNBOX_CONFIRMED',
              actorStaffId: staffId,
              clientEventId: clientEventId ? `${clientEventId}:unbox` : `receiving:${receivingId}:unbox:${now}`,
              occurredAt: now,
              // Phase 2 (ops-events unification): receive/unbox is the Unbox
              // surface — stamp its Studio-node binding (null when unpublished).
              workflowNodeId: await resolveSurfaceWorkflowNodeId('unbox', ctx.organizationId),
              payload: { receivingId, kind: 'unfound_no_po' },
            });
          } catch (err) {
            console.warn('[mark-received-po] ops_events unbox skipped:', err);
          }
          return respond({
            success: true,
            updated_count: 0,
            receiving_lines: [],
            received_local_only: true,
            message: 'Unfound PO received locally — no Zoho PO to reconcile',
            zoho: {
              attempted: 0,
              ok: true,
              rate_limited: false,
              results: [],
              error: null,
              skip_reason: 'unfound_no_po',
            },
          });
        }

        return respond({
          success: true,
          updated_count: 0,
          receiving_lines: [],
          message: 'No receiving lines for this shipment',
          zoho: {
            attempted: 0,
            ok: true,
            rate_limited: false,
            results: [],
            error: null,
            skip_reason: 'no_receiving_lines',
          },
        });
      }
      verifyOnlyLines = allLines.rows;
    }

    const linesForSerialHint = openForReceive.length > 0 ? openForReceive : verifyOnlyLines!;

    // Decide which line (if any) gets the inline serial. Behavior matches the
    // prior implementation: explicit hint wins; sole line falls through.
    const serialOwnerLineId: number | null = (() => {
      if (!serialNumber) return null;
      if (
        receivingLineIdHint &&
        linesForSerialHint.some((r) => r.id === receivingLineIdHint)
      ) {
        return receivingLineIdHint;
      }
      return linesForSerialHint.length === 1 ? linesForSerialHint[0].id : null;
    })();

    const updatedLines: Array<{
      id: number;
      sku: string | null;
      item_name: string | null;
      quantity_received: number;
      quantity_expected: number | null;
      workflow_status: string | null;
      zoho_purchaseorder_id: string | null;
      zoho_line_item_id: string | null;
    }> = [];

    const linesUpdatedViaReceiveUnits = openForReceive.length > 0;

    // Serial units created in the loop below queue here; the after() block
    // mirrors them into the operations graph off the request path.
    const workflowTapQueue: Array<{ serialUnitId: number; receivingLineId: number }> = [];

    if (openForReceive.length > 0) {
      for (const lineRow of openForReceive) {
      const lineClientEventId = clientEventId
        ? `${clientEventId}:line-${lineRow.id}`
        : null;

      if (isUnreceive) {
        const result = await unreceiveLineUnits({
          organizationId: ctx.organizationId,
          receiving_line_id: lineRow.id,
          staff_id: staffId,
          station,
          client_event_id: lineClientEventId,
          notes,
        });
        if (!result.ok) {
          return respond(
            { success: false, error: result.error },
            { status: result.status },
          );
        }
        updatedLines.push({
          id: result.line_state.id,
          sku: result.line_state.sku,
          item_name: result.line_state.item_name,
          quantity_received: result.line_state.quantity_received,
          quantity_expected: result.line_state.quantity_expected,
          workflow_status: result.line_state.workflow_status,
          zoho_purchaseorder_id: lineRow.zoho_purchaseorder_id,
          zoho_line_item_id: lineRow.zoho_line_item_id,
        });
        continue;
      }

      const currentQty = Number(lineRow.quantity_received ?? 0);

      // Force-complete: bump qty to expected (or 1 when unknown). Already-received
      // units are not double-counted. Quantity/stock is driven solely by the PO
      // line item here — serials are NOT counted against units.
      const targetQty = Math.max(
        currentQty,
        Number(lineRow.quantity_expected ?? 1),
      );
      const unitsToAdd = Math.max(0, targetQty - currentQty);

      // Even when unitsToAdd is 0 (line already complete) we still call the
      // helper so QA/disp/cond/workflow_status get set.
      const result = await receiveLineUnits({
        organizationId: ctx.organizationId,
        receiving_line_id: lineRow.id,
        units: unitsToAdd,
        serials: [],
        qa_status: qaStatus,
        disposition_code: dispositionCode,
        condition_grade: conditionGrade,
        notes,
        // Local receive commits DONE on this request.
        set_workflow_status: skipZohoReceive
          ? 'MATCHED'
          : 'DONE',
        // A real receive must not downgrade a line already unboxed at first scan;
        // scan_only ("Mark as scanned") leaves this false so its revert still works.
        advanceOnly: !skipZohoReceive,
        staff_id: staffId,
        station,
        client_event_id: lineClientEventId,
      });

      // Attach the inline serial as sidecar metadata — no qty/ledger effect.
      if (serialNumber && lineRow.id === serialOwnerLineId) {
        try {
          const attached = await attachSerialToLine({
            receiving_line_id: lineRow.id,
            serial_number: serialNumber,
            condition_grade: conditionGrade,
            staff_id: staffId,
            station,
            client_event_id: lineClientEventId,
          }, ctx.organizationId);
          // Queue the workflow-engine tap for the after() block below — the
          // engine mirror must never sit in the receive request path.
          // Re-scans (already_attached) tapped on their original scan.
          if (attached && !attached.already_attached) {
            workflowTapQueue.push({
              serialUnitId: attached.serial_unit.id,
              receivingLineId: lineRow.id,
            });
          }
          // Keep list-row serial chips warm (rlt.serial_projection).
          if (attached) {
            await refreshLineSerialProjectionSafe(ctx.organizationId, lineRow.id);
          }
        } catch (err) {
          console.warn('mark-received-po: attachSerialToLine failed (non-fatal)', err);
        }
      }

      updatedLines.push({
        id: result.line_state.id,
        sku: result.line_state.sku,
        item_name: result.line_state.item_name,
        quantity_received: result.line_state.quantity_received,
        quantity_expected: result.line_state.quantity_expected,
        workflow_status: result.line_state.workflow_status,
        zoho_purchaseorder_id: lineRow.zoho_purchaseorder_id,
        zoho_line_item_id: lineRow.zoho_line_item_id,
      });
      }
    } else {
      for (const r of verifyOnlyLines!) {
        updatedLines.push({
          id: r.id,
          sku: r.sku,
          item_name: r.item_name,
          quantity_received: r.quantity_received,
          quantity_expected: r.quantity_expected,
          workflow_status: r.workflow_status,
          zoho_purchaseorder_id: r.zoho_purchaseorder_id,
          zoho_line_item_id: r.zoho_line_item_id,
        });
      }
    }

    // Carton-level unbox confirmation event: the act of receiving/unboxing this
    // carton (regardless of Zoho reconciliation) is a durable operator event.
    try {
      await recordOpsEvent({
        organizationId: ctx.organizationId,
        entityType: 'receiving',
        entityId: receivingId,
        eventType: 'UNBOX_CONFIRMED',
        actorStaffId: staffId,
        clientEventId: clientEventId ? `${clientEventId}:unbox` : `receiving:${receivingId}:unbox:${now}`,
        occurredAt: now,
        // Phase 2 (ops-events unification): receive/unbox is the Unbox
        // surface — stamp its Studio-node binding (null when unpublished).
        workflowNodeId: await resolveSurfaceWorkflowNodeId('unbox', ctx.organizationId),
        payload: { receivingId },
      });
    } catch (err) {
      console.warn('[mark-received-po] ops_events unbox skipped:', err);
    }

    // Aggregate every serial attached to any of the updated lines so the Zoho
    // note reflects the full carton — not just the inline one. Pulls from
    // serial_units (kept up-to-date by receiveLineUnits → upsertSerialUnit).
    const updatedLineIds = updatedLines.map((l) => l.id);
    let aggregatedSerials: string[] = [];
    const serialsByReceivingLineId = new Map<number, string[]>();
    if (updatedLineIds.length > 0) {
      const serialsRes = await tenantQuery<{
        origin_receiving_line_id: number;
        serial_number: string;
      }>(
        ctx.organizationId,
        // Phase 3: filter + group by origin line via serial_unit_provenance
        // (one RECEIVING_LINE edge per unit, so no row multiplication).
        `SELECT p.origin_id AS origin_receiving_line_id, su.serial_number
           FROM serial_units su
           JOIN serial_unit_provenance p
             ON p.serial_unit_id = su.id AND p.origin_type = 'RECEIVING_LINE'
            AND p.origin_id = ANY($1::int[]) AND p.organization_id = $2
          WHERE su.organization_id = $2
          ORDER BY su.created_at ASC, su.id ASC`,
        [updatedLineIds, ctx.organizationId],
      );
      const seenGlobal = new Set<string>();
      for (const r of serialsRes.rows) {
        const recvLineId = Number(r.origin_receiving_line_id);
        const key = (r.serial_number || '').trim();
        if (!Number.isFinite(recvLineId) || !key) continue;
        const norm = key.toUpperCase();
        if (!serialsByReceivingLineId.has(recvLineId)) {
          serialsByReceivingLineId.set(recvLineId, []);
        }
        const perLine = serialsByReceivingLineId.get(recvLineId)!;
        if (!perLine.some((s) => s.toUpperCase() === norm)) perLine.push(key);
        if (!seenGlobal.has(norm)) {
          seenGlobal.add(norm);
          aggregatedSerials.push(key);
        }
      }
    }

    // Carton unboxed milestone → UNBOX street table (Wave-3 inversion). The
    // helper is COALESCE-once (first stamp wins) and derives intake_path
    // server-side, mirroring what the old spine write + dual-write trigger did.
    await withTenantTransaction(ctx.organizationId, (client) =>
      upsertReceivingUnbox(client, ctx.organizationId, receivingId, {
        unboxedAt: 'now',
        unboxedBy: staffId,
        deriveIntakePath: true,
      }),
    ).catch(() => {});

    // Stamp each serialized line's local Zoho item description with "SN:
    if (linesUpdatedViaReceiveUnits && updatedLines.length > 0) {
      const itemDescCond = conditionLabel(conditionGrade, 'full');
      await withTenantTransaction(ctx.organizationId, async (client) => {
        // zoho_notes lives on receiving_line_zoho now (Wave-3 inversion):
        // read-modify-write against rz on this tx client so the merge is atomic.
        const txDeps = {
          query: ((_org, sql, p) => client.query(sql, p as unknown[])) as typeof tenantQuery,
        };
        for (const l of updatedLines) {
          const serials = serialsByReceivingLineId.get(l.id) ?? [];
          if (serials.length === 0) continue;
          const serialPart =
            serials.length === 1 ? `SN: ${serials[0]}` : `SNs: ${serials.join(', ')}`;
          const snippet = itemDescCond ? `${serialPart} · ${itemDescCond}` : serialPart;
          const cur = await client.query<{ zoho_notes: string | null }>(
            `SELECT zoho_notes FROM receiving_line_zoho
              WHERE receiving_line_id = $1 AND organization_id = $2 LIMIT 1`,
            [l.id, ctx.organizationId],
          );
          const existing = String(cur.rows[0]?.zoho_notes ?? '');
          const merged = mergeSerialNoteIntoLineDescription(existing, snippet);
          if (merged === existing) continue;
          await upsertReceivingLineZoho(ctx.organizationId, l.id, { zohoNotes: merged }, txDeps);
        }
      }).catch(() => {});
    }

    let localTracking: string | null = null;
    try {
      const trackingRes = await tenantQuery<{ tracking: string | null }>(
        ctx.organizationId,
        `SELECT stn.tracking_number_raw AS tracking
           FROM receiving_carton r
           LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
          WHERE r.id = $1
            AND r.organization_id = $2
          LIMIT 1`,
        [receivingId, ctx.organizationId],
      );
      localTracking = (trackingRes.rows[0]?.tracking || '').trim() || null;
    } catch {
      /* silent */
    }

    let packageZohoPoId: string | null = null;
    let cartonSource: string | null = null;
    try {
      const pkgPoRes = await tenantQuery<{
        zoho_purchaseorder_id: string | null;
        source: string | null;
      }>(
        ctx.organizationId,
        `SELECT zoho_purchaseorder_id, source FROM receiving_carton
          WHERE id = $1 AND organization_id = $2 LIMIT 1`,
        [receivingId, ctx.organizationId],
      );
      packageZohoPoId = String(pkgPoRes.rows[0]?.zoho_purchaseorder_id || '').trim() || null;
      cartonSource = String(pkgPoRes.rows[0]?.source || '').trim() || null;
    } catch {
      /* silent */
    }

    // Unfound / unmatched cartons never hit Zoho purchase-receive — force
    // local_receive even when the client sent zoho_receive.
    const isUnfoundCarton = cartonSource === 'unmatched' && !packageZohoPoId;
    if (isUnfoundCarton && !isUnreceive && !skipZohoReceive) {
      localReceive = true;
    }

    // Sync part: fill missing PO id from the package-level link (no Zoho call — pure DB lookup we already did above into packageZohoPoId).
    for (const l of updatedLines) {
      if (isUnfoundCarton) continue;
      const poId = String(l.zoho_purchaseorder_id || '').trim();
      if (!poId && packageZohoPoId) {
        l.zoho_purchaseorder_id = packageZohoPoId;
        try {
          // Line-level PO id is a receiving_line_zoho fact now (Wave-3 inversion).
          await upsertReceivingLineZoho(ctx.organizationId, l.id, {
            zohoPurchaseOrderId: packageZohoPoId,
          });
        } catch {
          /* silent */
        }
      }
    }

    // Optimistic-view PO set for the response — every PO id touched by any updated line, regardless of whether its lines have a resolved…
    const attemptedPoIds = new Set<string>();
    if (!localReceive) {
      for (const l of updatedLines) {
        const poId = String(l.zoho_purchaseorder_id || '').trim();
        if (poId) attemptedPoIds.add(poId);
      }
    }

    // Unfound / local_receive:
    if (
      localReceive &&
      linesUpdatedViaReceiveUnits &&
      updatedLines.length > 0 &&
      !skipZohoReceive &&
      !isUnreceive
    ) {
      const ids = updatedLines.map((l) => l.id);
      await withTenantTransaction(ctx.organizationId, async (client) => {
        for (const id of ids) {
          await transitionReceivingLine(
            { receivingLineId: id, to: 'DONE', actorStaffId: staffId, station, skipEvent: true },
            client,
            ctx.organizationId,
          );
        }
      });
      for (const l of updatedLines) {
        l.workflow_status = 'DONE';
      }
    }

    // Background: line-item id resolution, then the PO notes/description PUT,
    // then cache invalidation. The purchase receive is NOT posted here — every
    // Zoho-linked line lands DONE and `zoho.receive_backfill` drains it.
    const needsHeaderPatch =
      Boolean(localTracking) || Boolean(zendeskTicket) ||
      Boolean(notes) || aggregatedSerials.length > 0 || Boolean(serialNumber) ||
      (!skipZohoReceive && !isUnreceive);

    // Resolve the org's inventory provider (capability facade). Null when no
    // inventory integration is connected — the notes PUT is skipped and the
    // response carries skip_reason inventory_not_connected.
    const inventory = await getInventoryProvider(ctx.organizationId);

    // Re-bind the tenant inside after():
    scheduleAfterResponse(async () => withZohoOrg(ctx.organizationId, async () => {
      // Mirror newly-created serial units into the operations graph
      // (fire-and-forget — tapWorkflow never throws).
      for (const tap of workflowTapQueue) {
        await tapWorkflow({
          serialUnitId: tap.serialUnitId,
          event: 'unit_received',
          input: { receivingLineId: tap.receivingLineId },
          staffId,
          source: 'scan',
          orgId: ctx.organizationId,
        });
      }

      // Line-item id resolution (was synchronous; moved here so receive click never waits on Zoho).
      const zohoPoDetailCache = new Map<
        string,
        { purchaseorder?: { line_items?: unknown[] } } | null
      >();
      const getCachedPoForResolve = async (poId: string) => {
        if (!inventory) return null;
        if (zohoPoDetailCache.has(poId)) return zohoPoDetailCache.get(poId) ?? null;
        try {
          const detail = await inventory.getPurchaseOrder(poId);
          const typed = detail as { purchaseorder?: { line_items?: unknown[] } };
          zohoPoDetailCache.set(poId, typed);
          return typed;
        } catch (err) {
          console.warn(
            'mark-received-po: PO fetch for line resolve failed (background)',
            poId,
            err,
          );
          zohoPoDetailCache.set(poId, null);
          return null;
        }
      };

      for (const l of updatedLines) {
        const poId = String(l.zoho_purchaseorder_id || '').trim();
        let liId = String(l.zoho_line_item_id || '').trim();
        if (!liId && poId && (l.sku || l.item_name)) {
          const detail = await getCachedPoForResolve(poId);
          const rawItems = detail?.purchaseorder?.line_items;
          const items = Array.isArray(rawItems) ? rawItems : [];
          const resolved = findZohoLineItemIdFromPoLines(items, l.sku, l.item_name);
          if (resolved) {
            liId = resolved;
            l.zoho_line_item_id = resolved;
            try {
              // receiving_line_zoho fact (Wave-3 inversion). A (org, po_id,
              // line_item_id) unique collision throws and is swallowed exactly
              // like the old spine unique indexes were.
              await upsertReceivingLineZoho(ctx.organizationId, l.id, {
                zohoLineItemId: resolved,
              });
            } catch {
              /* silent */
            }
          }
        }
      }

      // Per Zoho PO id → line_item_id → description snippet (serial) for
      // PUT /purchaseorders. Built post-resolution.
      const serialNotesByPo = new Map<string, Record<string, string>>();
      {
        const serialMergeScratch = new Map<string, Map<string, string[]>>();
        for (const l of updatedLines) {
          const poId = String(l.zoho_purchaseorder_id || '').trim();
          const liId = String(l.zoho_line_item_id || '').trim();
          if (!poId || !liId) continue;
          const lineSerials = serialsByReceivingLineId.get(l.id) || [];
          if (lineSerials.length === 0) continue;
          if (!serialMergeScratch.has(poId)) serialMergeScratch.set(poId, new Map());
          const liMap = serialMergeScratch.get(poId)!;
          const cur = liMap.get(liId) ? [...liMap.get(liId)!] : [];
          for (const sn of lineSerials) {
            if (!cur.some((x) => x.toUpperCase() === sn.toUpperCase())) cur.push(sn);
          }
          liMap.set(liId, cur);
        }
        // The condition grade applied by this receive — appended to the serial
        // so the Zoho line-item description reads "SN: … · For Parts". The merge
        // helper upgrades a prior bare-serial note in place (no duplicate SN).
        const zohoCondLabel = conditionLabel(conditionGrade, 'full');
        for (const [poId, liMap] of serialMergeScratch) {
          const rec: Record<string, string> = {};
          for (const [liId, serials] of liMap) {
            const serialPart =
              serials.length === 1 ? `SN: ${serials[0]}` : `SNs: ${serials.join(', ')}`;
            rec[liId] = zohoCondLabel ? `${serialPart} · ${zohoCondLabel}` : serialPart;
          }
          serialNotesByPo.set(poId, rec);
        }
      }

      const byPo = new Map<string, Set<string>>();
      for (const l of updatedLines) {
        const poId = String(l.zoho_purchaseorder_id || '').trim();
        const liId = String(l.zoho_line_item_id || '').trim();
        if (!poId || !liId) continue;
        if (!byPo.has(poId)) byPo.set(poId, new Set());
        byPo.get(poId)!.add(liId);
      }

      /** receiving_line ids whose local UNBOXED→DONE promotion actually committed. */
      const localPromoted = new Set<number>();
      /** receiving_line id → why its promotion did not land. */
      const localPromotionFailed = new Map<number, string>();
      try {
        if (!inventory) {
          // No inventory integration connected:
          if (byPo.size > 0) {
            console.warn(
              'mark-received-po: no inventory integration connected — provider sync skipped',
            );
          }
        } else if (reverseZohoReceive) {
          // scan_only / unreceive:
          for (const zohoPoId of byPo.keys()) {
            try {
              await inventory.markPurchaseOrderUnreceived(zohoPoId);
            } catch (err) {
              console.error(
                'mark-received-po: markasunreceived failed (background)',
                zohoPoId,
                err instanceof Error ? err.message : err,
              );
            }
          }
        }
      } catch (err) {
        console.warn('mark-received-po: Zoho unreceive background failed', err);
      }

      // Local SoT: every Zoho-linked line in this receive lands DONE, full stop.
      if (!skipZohoReceive && !isUnreceive && !localReceive) {
        const linkedIds = updatedLines
          .filter((l) => String(l.zoho_purchaseorder_id || '').trim())
          .map((l) => l.id);
        if (linkedIds.length > 0) {
          await withTenantTransaction(ctx.organizationId, async (client) => {
            for (const id of linkedIds) {
              // transitionReceivingLine RETURNS {ok:false,status:409} for a disallowed edge — it does not throw.
              const promoted = await transitionReceivingLine(
                {
                  receivingLineId: id,
                  to: 'DONE',
                  actorStaffId: staffId,
                  station,
                  skipEvent: true,
                },
                client,
                ctx.organizationId,
              );
              if (!promoted.ok) {
                localPromotionFailed.set(id, promoted.error || `status ${promoted.status}`);
                continue;
              }
              localPromoted.add(id);
            }
          }).catch((err) => {
            // The whole transaction rolled back:
            for (const id of linkedIds) {
              localPromoted.delete(id);
              localPromotionFailed.set(id, err instanceof Error ? err.message : String(err));
            }
            console.warn('mark-received-po: UNBOXED→DONE promotion failed', err);
          });
          // Mirror ONLY what actually committed into the response rows.
          for (const l of updatedLines) {
            if (localPromoted.has(l.id)) l.workflow_status = 'DONE';
          }
          if (localPromotionFailed.size > 0) {
            // A LOCAL failure: the row did not reach DONE, so the drain will
            // never see it. Still worth shouting about.
            logger.warn(
              { failures: [...localPromotionFailed.entries()].map(([id, reason]) => ({ id, reason })) },
              'mark-received-po: local DONE promotion did not land (background)',
            );
          }
        }
      }

      try {
        if (!skipZohoReceive && !isUnreceive && inventory) {
          for (const zohoPoId of byPo.keys()) {
          const serialMap = serialNotesByPo.get(zohoPoId);
          const hasSerialLines = Boolean(serialMap && Object.keys(serialMap).length > 0);
          if (!hasSerialLines && !needsHeaderPatch) continue;

          try {
            const existing = await inventory.getPurchaseOrder(zohoPoId);
            const patch: Record<string, unknown> = {};

            if (hasSerialLines && existing.purchaseorder) {
              assertPurchaseOrderLineItemsEditable(existing);
              const built = buildPurchaseOrderLineItemsForDescriptionPut(
                existing.purchaseorder,
                serialMap!,
              );
              if (built.length > 0) {
                patch.line_items = built;
              }
            }

            if (needsHeaderPatch) {
              const poHeader = (existing?.purchaseorder || {}) as Record<string, unknown>;
              const currentRef = String(poHeader.reference_number || '').trim();
              const currentNotes = String(poHeader.notes || '');

              if (localTracking && currentRef !== localTracking) {
                patch.reference_number = localTracking;
              }

              const noteLead: string[] = [
                buildZohoReceiveNoteLine({
                  staffName,
                  scannedAt: cartonScannedAt,
                  unboxedAt: cartonUnboxedAt,
                }),
              ];
              if (zendeskTicket) noteLead.push(`Zendesk: ${zendeskTicket}`);
              const noteHead = noteLead.join(' · ');
              const serialsForNote = aggregatedSerials.length > 0
                ? aggregatedSerials
                : (serialNumber ? [serialNumber] : []);
              const serialLabel = serialsForNote.length > 1 ? 'SNs' : 'SN';
              const noteTail = [
                ...(serialsForNote.length > 0
                  ? [`${serialLabel}: ${serialsForNote.join(', ')}`]
                  : []),
                ...(notes ? [`Notes: ${notes}`] : []),
              ].join(' | ');
              const newLine = noteTail ? `${noteHead} · ${noteTail}` : noteHead;

              // Skip if the exact line is already present (same-second duplicate).
              const currentNotesUpper = currentNotes.toUpperCase();
              const allSerialsAlreadyNoted =
                serialsForNote.length > 0 &&
                serialsForNote.every((sn) => {
                  const snUpper = sn.toUpperCase();
                  return currentNotesUpper.includes(`SN: ${snUpper}`) ||
                    (currentNotesUpper.includes('SNS:') && currentNotesUpper.includes(snUpper));
                });
              const staffTimeAlreadyNoted = currentNotes.includes(noteHead);
              // Serials already on the PO must not block a new staff/time lead
              // (Kai + scan/unbox). That skip left Michael / Staff #N as the
              // first line after a later Receive.
              if (!currentNotes.includes(newLine) && !(allSerialsAlreadyNoted && staffTimeAlreadyNoted)) {
                patch.notes = currentNotes ? `${newLine}\n${currentNotes}` : newLine;
              }
            }

            if (Object.keys(patch).length > 0) {
              await inventory.updatePurchaseOrder(zohoPoId, patch);
            }
          } catch (err) {
            console.warn('mark-received-po: updatePurchaseOrder failed', zohoPoId, err);
          }
        }
        }
      } catch (err) {
        console.warn('mark-received-po: Zoho background sync failed', err);
      }

      try {
        await invalidateReceivingViews(ctx.organizationId, ['serial-units']);

        // Fan the row updates out in parallel — they are independent Ably
        // publishes and the operator is waiting on this card.
        await Promise.all(
          updatedLines.map((l) =>
            publishReceivingLogChanged({
              organizationId: ctx.organizationId,
              action: 'update',
              rowId: String(l.id),
              source: 'receiving.mark-received-po',
            }),
          ),
        );
      } catch (err) {
        console.warn('mark-received-po: cache/realtime failed', err);
      }
    }));

    // Audit one row per touched line.
    const auditSource = station === 'MOBILE' ? 'mobile-scanner' : 'receiving-station';
    const auditAction = reverseZohoReceive
      ? AUDIT_ACTION.PO_RECEIVE_REVERSE
      : AUDIT_ACTION.PO_RECEIVE;

    // §4 soft block — persist + audit the waiver alongside the per-line receive audit.
    if (photoPolicyWaiver) {
      await recordPhotoPolicyOverride(ctx.organizationId as OrgId, {
        code: photoPolicyWaiver.code,
        blockers: photoPolicyWaiver.blockers,
        receivingId,
        receivingLineIds: updatedLines.map((l) => l.id),
        staffId,
      });
      for (const l of updatedLines) {
        await recordAudit(pool, ctx, request, {
          source: auditSource,
          action: AUDIT_ACTION.RECEIVING_PHOTO_POLICY_OVERRIDE,
          entityType: AUDIT_ENTITY.RECEIVING_LINE,
          entityId: l.id,
          reasonCode: photoPolicyWaiver.code,
          scanRef: localTracking,
          method: station === 'MOBILE' ? 'scan' : 'manual',
          extra: {
            receiving_id: receivingId,
            station,
            blockers: photoPolicyWaiver.blockers,
          },
        });
      }
    }

    for (const l of updatedLines) {
      const before = beforeByLineId.get(l.id) ?? null;
      await recordAudit(pool, ctx, request, {
        source: auditSource,
        action: auditAction,
        entityType: AUDIT_ENTITY.RECEIVING_LINE,
        entityId: l.id,
        before: before
          ? { quantity_received: before.quantity_received, quantity_expected: before.quantity_expected }
          : null,
        after: {
          quantity_received: l.quantity_received,
          quantity_expected: l.quantity_expected,
          workflow_status: l.workflow_status,
        },
        scanRef: localTracking,
        method: station === 'MOBILE' ? 'scan' : 'manual',
        extra: {
          receiving_id: receivingId,
          zoho_purchaseorder_id: l.zoho_purchaseorder_id,
          zoho_line_item_id: l.zoho_line_item_id,
          qa_status: qaStatus,
          disposition_code: dispositionCode,
          condition_grade: conditionGrade,
          station,
          ...(zendeskTicket ? { zendesk_ticket: zendeskTicket } : {}),
          ...(serialAbsent
            ? { serial_absent: true, serial_absent_reason: serialAbsentReason }
            : {}),
        },
      });
    }

    // Optimistic response:
    let circuitStatus: { isOpen: boolean; retryAfterMs: number; consecutiveFailures: number } | null =
      null;
    try {
      // Facade equivalent of the former getZohoHttpClientStatus() read — still a cheap in-process breaker read.
      circuitStatus = inventory?.clientStatus().circuit ?? null;
    } catch {
      circuitStatus = null;
    }
    const circuitOpen =
      !skipZohoReceive && !isUnreceive && attemptedPoIds.size > 0 && circuitStatus?.isOpen === true;

    let skipReason: string | null = null;
    if (isUnreceive) {
      skipReason = 'unreceive';
    } else if (skipZohoReceive) {
      skipReason = 'scan_only';
    } else if (localReceive) {
      // Unfound carton received locally — lines are RECEIVED (DONE), Zoho is
      // intentionally untouched. Emerald success, not a "no PO link" warning.
      skipReason = 'received_local';
    } else if (!inventory && attemptedPoIds.size > 0) {
      // Vault disconnected / poisoned — local receive stands; operator must
      // reconnect inventory before a purchase receive can land.
      skipReason = 'inventory_not_connected';
    } else if (attemptedPoIds.size === 0 && updatedLines.length > 0) {
      skipReason = 'no_zoho_link';
    } else if (circuitOpen) {
      skipReason = 'zoho_circuit_open';
    }

    const zohoPending = !skipReason && attemptedPoIds.size > 0;

    // Checklist summary for the inline success display.
    const descriptionsUpdated =
      attemptedPoIds.size > 0 && !skipZohoReceive && !isUnreceive
        ? updatedLines.filter((l) => (serialsByReceivingLineId.get(l.id)?.length ?? 0) > 0).length
        : 0;
    const notesUpdated =
      Boolean(notes) && attemptedPoIds.size > 0 && !skipZohoReceive && !isUnreceive;

    return respond({
      success: true,
      receive_intent: isUnreceive
        ? 'unreceive'
        : skipZohoReceive
          ? 'scan_only'
          : localReceive
            ? 'local_receive'
            : 'zoho_receive',
      updated_count: linesUpdatedViaReceiveUnits ? updatedLines.length : 0,
      receiving_lines: updatedLines,
      receiving_id: receivingId,
      // §4 soft block: the receive went through, but say WHAT was waived —
      // same `code`/`blockers` the 409 would have carried.
      ...(photoPolicyWaiver
        ? {
            warnings: [
              photoPolicyOverrideWarning(photoPolicyWaiver.code, photoPolicyWaiver.blockers),
            ],
          }
        : {}),
      // Per-action breakdown the inline ReceiveSuccessChecklist renders as
      // staggered green checks. The PO notes/description PUT runs in after();
      // the purchase receive is drained by `zoho.receive_backfill`.
      summary: {
        // Floor work recorded. Zoho-linked Received/DONE is stamped in after().
        marked_received: !skipZohoReceive && !isUnreceive && updatedLines.length > 0,
        descriptions_updated: descriptionsUpdated,
        notes_updated: notesUpdated,
        local_only: attemptedPoIds.size === 0 || isUnreceive,
      },
      zoho: {
        attempted: attemptedPoIds.size,
        ok: true, // HTTP contract; pending=true means the drain still owes a receive
        pending: zohoPending,
        rate_limited: false,
        results: [],
        error: null,
        ...(skipReason ? { skip_reason: skipReason } : {}),
        ...(circuitOpen && circuitStatus
          ? {
              circuit: {
                isOpen: true,
                retryAfterMs: circuitStatus.retryAfterMs,
                consecutiveFailures: circuitStatus.consecutiveFailures,
              },
            }
          : {}),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to mark PO as received';
    console.error('receiving/mark-received-po POST failed:', error);
    // Release the pending idempotency claim so the client's retry can run rather
    // than being stuck behind an abandoned claim until it goes stale.
    if (ownedClaim) {
      await releaseIdempotencyClaim(pool, ownedClaim).catch(() => {});
    }
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}, { permission: 'receiving.mark_received' });
