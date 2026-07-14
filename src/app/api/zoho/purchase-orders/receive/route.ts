import { NextRequest, NextResponse, after } from 'next/server';
import pool from '@/lib/db';
import { withTenantTransaction } from '@/lib/tenancy/db';
import { logger } from '@/lib/observability/logger';
import {
  createPurchaseReceive,
  getPurchaseOrderById,
  assertPurchaseOrderReceivable,
  getPurchaseReceiveIdFromCreateResponse,
  mergeCatalogItemIdsFromPurchaseOrder,
  searchItemBySku,
  type ZohoPurchaseReceiveLine,
} from '@/lib/zoho';
import { formatPSTTimestamp, getCurrentPSTDateKey, normalizePSTTimestamp } from '@/utils/date';
import { withZohoOrg } from '@/lib/zoho/tenant-context';
import { withAuth } from '@/lib/auth/withAuth';
import {
  getApiIdempotencyResponse,
  readIdempotencyKey,
  saveApiIdempotencyResponse,
} from '@/lib/api-idempotency';
// Wave-3 writer inversion: line-level testing/zoho facts write directly to the
// 1:1 facts tables; the carton door stamp writes the triage street table.
import {
  upsertReceivingLineTesting,
  upsertReceivingLineZoho,
} from '@/lib/receiving/facts/narrow';
import type { FactsDeps } from '@/lib/receiving/facts/store';
import { upsertReceivingTriage } from '@/lib/receiving/streets/carton-street-write';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import { publishReceivingLogChanged } from '@/lib/realtime/publish';

export const dynamic = 'force-dynamic';

const IDEMPOTENCY_ROUTE = 'zoho.purchase-orders.receive';
const VALID_CONDITIONS = new Set(['BRAND_NEW', 'LIKE_NEW', 'REFURBISHED', 'USED_A', 'USED_B', 'USED_C', 'PARTS']);

/**
 * POST /api/zoho/purchase-orders/receive
 *
 * Receive a Zoho PO into the warehouse. Local SoT, Zoho sync via after():
 *  0. Idempotency replay on Idempotency-Key / client_event_id.
 *  1. INSERT receiving_carton + receiving_line (+ optional work_assignments) in
 *     one transaction. Sets source='zoho_po' and zoho_purchaseorder_id so
 *     the carton is identifiable while Zoho is still pending.
 *  2. Return 200 immediately with `zoho.pending: true` so the operator
 *     never waits on the Zoho roundtrip.
 *  3. after() runs the Zoho work:
 *       getPurchaseOrderById → assertReceivable → fill missing item_ids →
 *       createPurchaseReceive → UPDATE receiving_carton + receiving_line with
 *       zoho_purchase_receive_id → invalidate caches + publish realtime.
 *
 * Body unchanged: purchaseorder_id, warehouse_id, receive_date, received_by,
 * needs_test, assigned_tech_id, condition_grade, target_channel, notes,
 * line_items, plus optional client_event_id, zoho_bill_id, zoho_bill_number.
 */
export const POST = withAuth(async (request: NextRequest, ctx) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const b = body as Record<string, unknown>;

  // ── 0. Idempotency replay ──────────────────────────────────────────────
  const clientEventId = String(b?.client_event_id ?? '').trim() || null;
  const idempotencyKey = readIdempotencyKey(request, clientEventId);
  if (idempotencyKey) {
    const cached = await getApiIdempotencyResponse(
      pool,
      ctx.organizationId,
      idempotencyKey,
      IDEMPOTENCY_ROUTE,
    );
    if (cached) {
      return NextResponse.json(cached.response_body, {
        status: cached.status_code,
      });
    }
  }

  const purchaseOrderId = String(b?.purchaseorder_id || '').trim();
  if (!purchaseOrderId) {
    return NextResponse.json(
      { success: false, error: 'purchaseorder_id is required' },
      { status: 400 },
    );
  }

  const warehouseId = String(b?.warehouse_id || '').trim() || null;
  const receivedByRaw = Number(b?.received_by);
  const receivedBy =
    Number.isFinite(receivedByRaw) && receivedByRaw > 0 ? receivedByRaw : null;
  const assignedTechIdRaw = Number(b?.assigned_tech_id);
  const assignedTechId =
    Number.isFinite(assignedTechIdRaw) && assignedTechIdRaw > 0
      ? assignedTechIdRaw
      : null;
  const needsTest = b?.needs_test === undefined ? true : !!b.needs_test;
  const defaultCondition = VALID_CONDITIONS.has(
    String(b?.condition_grade || '').toUpperCase(),
  )
    ? String(b.condition_grade).toUpperCase()
    : 'USED_A';
  const targetChannelRaw = String(b?.target_channel || '').trim().toUpperCase();
  const targetChannel =
    targetChannelRaw === 'FBA' ? 'FBA' : targetChannelRaw === 'ORDERS' ? 'ORDERS' : null;
  const notes = String(b?.notes || '').trim() || null;
  const zohoBillId = String(b?.zoho_bill_id ?? '').trim() || undefined;
  const zohoBillNumber = String(b?.zoho_bill_number ?? '').trim() || undefined;

  const rawLines: Record<string, unknown>[] = Array.isArray(b?.line_items)
    ? (b.line_items as Record<string, unknown>[])
    : [];
  const lineItems = rawLines
    .map((l: Record<string, unknown>) => ({
      line_item_id: String(l?.line_item_id || '').trim(),
      item_id: String(l?.item_id || '').trim(),
      item_name: String(l?.item_name || '').trim() || null,
      sku: String(l?.sku || '').trim() || null,
      quantity_received: Math.floor(Math.max(0, Number(l?.quantity_received ?? 0))),
      quantity_expected:
        Number.isFinite(Number(l?.quantity)) && Number(l.quantity) > 0
          ? Math.floor(Number(l.quantity))
          : null,
      condition_grade: VALID_CONDITIONS.has(
        String(l?.condition_grade || '').toUpperCase(),
      )
        ? String(l.condition_grade).toUpperCase()
        : defaultCondition,
    }))
    .filter((l) => l.line_item_id && l.quantity_received > 0);

  if (lineItems.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: 'At least one line item with quantity_received > 0 is required',
      },
      { status: 400 },
    );
  }

  const receiveDate =
    String(b?.receive_date || '').trim() || getCurrentPSTDateKey();
  const normalizedDate = normalizePSTTimestamp(`${receiveDate} 00:00:00`, {
    fallbackToNow: true,
  })!;

  // ── 1. Local insert (optimistic) ───────────────────────────────────────
  const orgId = ctx.organizationId;
  let receivingId: number | null = null;
  let insertedLines = 0;
  try {
    await withTenantTransaction(orgId, async (client) => {

    const columnsRes = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'receiving_carton'`,
    );
    const receivingCols = new Set<string>(columnsRes.rows.map((r) => r.column_name));

    const valuesByColumn: Record<string, unknown> = {
      // PO identity lives in zoho_purchaseorder_id / source='zoho_po' (below);
      // the legacy receiving_tracking_number text column has been dropped.
      // received_at/received_by moved to the triage street table — stamped via
      // upsertReceivingTriage right after the INSERT (Wave-3 writer inversion).
      carrier: 'ZOHO_PO',
      qa_status: 'PENDING',
      is_return: false,
      needs_test: needsTest,
      assigned_tech_id: assignedTechId,
      target_channel: targetChannel,
      // Explicit PO link so the carton is matched/visible while Zoho is
      // still pending — without these the OR-fallback in /api/receiving-lines
      // has no way to associate the row with the PO until after() commits.
      source: 'zoho_po',
      zoho_purchaseorder_id: purchaseOrderId,
      zoho_purchase_receive_id: null,
      zoho_warehouse_id: warehouseId,
      notes,
      organization_id: ctx.organizationId,
      updated_at: formatPSTTimestamp(),
    };

    if (receivingCols.has('date_time')) {
      valuesByColumn['date_time'] = normalizedDate;
    }

    const insertCols: string[] = [];
    const insertVals: unknown[] = [];
    for (const [col, val] of Object.entries(valuesByColumn)) {
      if (!receivingCols.has(col)) continue;
      insertCols.push(col);
      insertVals.push(val);
    }

    const placeholders = insertCols.map((_, i) => `$${i + 1}`).join(', ');
    const insertedRow = await client.query<{ id: number }>(
      `INSERT INTO receiving_carton (${insertCols.join(', ')}) VALUES (${placeholders}) RETURNING id`,
      insertVals,
    );
    receivingId = Number(insertedRow.rows[0].id);

    // Door stamp → triage street (COALESCE-once inside the helper; the carton is
    // brand-new so this is the first stamp). Same tx as the carton INSERT.
    await upsertReceivingTriage(client, orgId, receivingId, {
      doorReceivedAt: normalizedDate,
      doorReceivedBy: receivedBy,
    });

    // Facts writes ride the same transaction client so the thin spine line and
    // its 1:1 testing/zoho rows commit atomically.
    const txDeps: FactsDeps = {
      query: ((_org: string, sql: string, p?: unknown[]) =>
        client.query(sql, p)) as FactsDeps['query'],
    };
    const lineSyncedAt = formatPSTTimestamp();

    for (const line of lineItems) {
      const insertedLine = await client.query<{ id: number }>(
        `INSERT INTO receiving_line (
          receiving_id, item_name, sku, quantity_received, quantity_expected,
          workflow_status, organization_id
        )
        VALUES ($1,$2,$3,$4,$5,'MATCHED'::inbound_workflow_status_enum,$6::uuid)
        RETURNING id`,
        [
          receivingId,
          line.item_name || null,
          line.sku || null,
          line.quantity_received,
          line.quantity_expected ?? null,
          ctx.organizationId,
        ],
      );
      const lineId = Number(insertedLine.rows[0].id);
      // Birth invariant: explicit testing-facts row carrying exactly what the
      // wide INSERT used to set (this site sets needs_test/assigned_tech_id/
      // per-line condition_grade from the request body).
      await upsertReceivingLineTesting(orgId, lineId, {
        needsTest,
        assignedTechId,
        qaStatus: 'PENDING',
        dispositionCode: 'HOLD',
        conditionGrade: line.condition_grade,
        dispositionAudit: [],
      }, txDeps);
      // zoho_purchase_receive_id stays NULL until the after() Zoho roundtrip
      // links it (this birth never set the PO number, so no number/norm here).
      await upsertReceivingLineZoho(orgId, lineId, {
        zohoItemId: line.item_id || null,
        zohoLineItemId: line.line_item_id,
        zohoPurchaseReceiveId: null,
        zohoPurchaseOrderId: purchaseOrderId,
        zohoSyncSource: 'purchase_receive',
        zohoSyncedAt: lineSyncedAt,
      }, txDeps);
      insertedLines++;
    }

    if (needsTest && assignedTechId) {
      const hasAssignRes = await client.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM information_schema.tables WHERE table_name = 'work_assignments'
         ) AS exists`,
      );
      if (hasAssignRes.rows[0]?.exists) {
        await client.query(
          `INSERT INTO work_assignments
             (organization_id, entity_type, entity_id, work_type, assigned_tech_id, status, priority, notes)
           VALUES ($1, 'RECEIVING', $2, 'TEST', $3, 'ASSIGNED', 100, $4)
           ON CONFLICT DO NOTHING`,
          [
            ctx.organizationId,
            receivingId,
            assignedTechId,
            `Auto-created from Zoho PO ${purchaseOrderId} (Zoho receive pending)`,
          ],
        );
      }
    }

    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to receive PO';
    console.error('zoho/purchase-orders/receive local insert failed:', error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }

  // ── 2. Build optimistic response + persist idempotency ─────────────────
  const responseBody: Record<string, unknown> = {
    success: true,
    receiving_id: receivingId,
    purchase_receive_id: null,
    purchaseorder_id: purchaseOrderId,
    line_items_received: insertedLines,
    zoho: {
      attempted: 1,
      ok: true,
      pending: true,
      rate_limited: false,
      results: [],
      error: null,
    },
  };

  if (idempotencyKey) {
    await saveApiIdempotencyResponse(pool, {
      orgId: ctx.organizationId,
      idempotencyKey,
      route: IDEMPOTENCY_ROUTE,
      staffId: ctx.staffId ?? null,
      statusCode: 200,
      responseBody,
    });
  }

  // ── 3. Zoho work in background ─────────────────────────────────────────
  const receivingIdForBg = receivingId;
  // Re-bind the tenant inside after(): the callback runs outside the request's
  // async context, so the Zoho client would otherwise see no org binding.
  after(async () => withZohoOrg(ctx.organizationId, async () => {
    try {
      const poForReceive = await getPurchaseOrderById(purchaseOrderId);
      try {
        assertPurchaseOrderReceivable(poForReceive);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          'zoho/purchase-orders/receive: PO not receivable (background)',
          purchaseOrderId,
          msg,
        );
        // Local rows stay; surface via realtime so the operator can see
        // that Zoho rejected the receive.
        try {
          await publishReceivingLogChanged({
            organizationId: ctx.organizationId,
            action: 'update',
            rowId: String(receivingIdForBg),
            source: 'zoho.purchase-orders.receive.failed',
          });
        } catch { /* silent */ }
        return;
      }

      let zohoReceiveLines: ZohoPurchaseReceiveLine[] = lineItems.map((l) => ({
        line_item_id: l.line_item_id,
        quantity_received: l.quantity_received,
        item_id: l.item_id,
      }));
      zohoReceiveLines = mergeCatalogItemIdsFromPurchaseOrder(poForReceive, zohoReceiveLines);
      for (let i = 0; i < zohoReceiveLines.length; i++) {
        if (String(zohoReceiveLines[i].item_id ?? '').trim()) continue;
        const sku = lineItems[i]?.sku;
        if (!sku) continue;
        try {
          const hit = await searchItemBySku(sku);
          const id = hit?.item_id ? String(hit.item_id).trim() : '';
          if (id) zohoReceiveLines[i] = { ...zohoReceiveLines[i], item_id: id };
        } catch {
          /* leave missing — createPurchaseReceive will throw a clear error */
        }
      }

      const zohoReceive = await createPurchaseReceive({
        purchaseOrderId,
        warehouseId: warehouseId || undefined,
        date: receiveDate,
        lineItems: zohoReceiveLines,
        bills: poForReceive.purchaseorder?.bills,
        ...(zohoBillId ? { billId: zohoBillId } : {}),
        ...(zohoBillNumber ? { billNumberHint: zohoBillNumber } : {}),
      });
      const purchaseReceiveId = getPurchaseReceiveIdFromCreateResponse(zohoReceive) ?? '';

      if (purchaseReceiveId) {
        // One tx for the whole linkage: the carton half stays on the spine
        // (carton-level zoho_* is Wave-4 scope); the line half is a zoho FACT and
        // lives on receiving_line_zoho (Wave-3 inversion). Every line under this
        // carton has an rz row from birth, so the per-line upsert is a plain update.
        await withTenantTransaction(orgId, async (client) => {
          await client.query(
            `UPDATE receiving_carton
               SET zoho_purchase_receive_id = $1,
                   updated_at = NOW()
             WHERE id = $2`,
            [purchaseReceiveId, receivingIdForBg],
          );
          const lineRows = await client.query<{ id: number }>(
            `SELECT id FROM receiving_line WHERE receiving_id = $1 ORDER BY id`,
            [receivingIdForBg],
          );
          const txDeps: FactsDeps = {
            query: ((_org: string, sql: string, p?: unknown[]) =>
              client.query(sql, p)) as FactsDeps['query'],
          };
          const linkedAt = formatPSTTimestamp();
          for (const row of lineRows.rows) {
            await upsertReceivingLineZoho(orgId, Number(row.id), {
              zohoPurchaseReceiveId: purchaseReceiveId,
              zohoSyncedAt: linkedAt,
            }, txDeps);
          }
        });
      }

      try {
        await invalidateReceivingViews(ctx.organizationId);
      } catch { /* silent */ }
      try {
        await publishReceivingLogChanged({
          organizationId: ctx.organizationId,
          action: 'update',
          rowId: String(receivingIdForBg),
          source: 'zoho.purchase-orders.receive',
        });
      } catch { /* silent */ }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // "already received in Zoho" is fine — Zoho is ahead of us, local SoT
      // now matches once the operator refreshes. Treat as success.
      const alreadyReceived =
        /already\s+created\s+a\s+receive\s+for\s+all\s+the\s+items/i.test(msg);
      if (alreadyReceived) {
        logger.info(
          { purchaseOrderId },
          'zoho/purchase-orders/receive: PO already received in Zoho (background, treated as success)',
        );
      } else {
        console.error(
          'zoho/purchase-orders/receive: createPurchaseReceive failed (background)',
          purchaseOrderId,
          msg,
        );
      }
      try {
        await publishReceivingLogChanged({
          organizationId: ctx.organizationId,
          action: 'update',
          rowId: String(receivingIdForBg),
          source: alreadyReceived
            ? 'zoho.purchase-orders.receive'
            : 'zoho.purchase-orders.receive.failed',
        });
      } catch { /* silent */ }
    }
  }));

  return NextResponse.json(responseBody);
}, { permission: 'receiving.mark_received' });
