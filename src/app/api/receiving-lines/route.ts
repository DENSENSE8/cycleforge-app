import { NextRequest, NextResponse, after } from 'next/server';
import { tenantQuery, withTenantConnection, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { publishReceivingLogChanged } from '@/lib/realtime/publish';
import { invalidateReceivingViews } from '@/lib/receiving/invalidation';
import {
  fetchSerialsForLines,
  refreshLineSerialProjectionSafe,
  type LineSerial,
} from '@/lib/receiving/serial-projection';
import { registerShipmentPermissive } from '@/lib/shipping/sync-shipment';
import { withAuth } from '@/lib/auth/withAuth';
import { sortSerialUnitToParts } from '@/lib/inventory/parts-sort';
import { isTestingApiView } from '@/lib/surface-isolation';
import { recomputeCartonSourceLink } from '@/lib/receiving/carton-source-link';
import { isIncomingUniversal } from '@/lib/feature-flags';
import { isReceivingPhysicalStateFirst, isUnboxRailColumnRead } from '@/lib/feature-flags';
import {
  parseReceivingLinesQuery,
  QA_STATUSES,
  DISPOSITIONS,
} from '@/lib/receiving/lines/query';
import {
  buildReceivingLineByIdSql,
  buildReceivingLinesByReceivingIdSql,
  buildReceivingLinesListSql,
  buildUnmatchedPlaceholdersSql,
  buildUnboxOpenedPlaceholdersSql,
  shouldIncludeUnmatchedPlaceholders,
  shouldIncludeUnboxOpenedPlaceholders,
} from '@/lib/receiving/lines/build-sql';
import { getOrganization } from '@/lib/tenancy/organizations';
import { isWrongDestination } from '@/lib/receiving/wrong-destination';
import {
  upsertReceivingLineTesting,
  upsertReceivingLineZoho,
  type TestingFactsInput,
  type ZohoFactsInput,
} from '@/lib/receiving/facts/narrow';
import { acknowledgeUnbox } from '@/lib/receiving/acknowledge-unbox';

// `fetchSerialsForLines` + the `LineSerial` shape are the authoritative
// current-serials-per-line SoT, shared with the projection writer and the batch
// endpoint — they live in src/lib/receiving/serial-projection.ts (imported above)
// so the read path, reconcile, and denorm writer can never drift.

// QA/disposition body-validation vocab shared with the GET filter builder now
// lives in src/lib/receiving/lines/query.ts (QA_STATUSES / DISPOSITIONS,
// imported above). CONDITIONS is POST/PATCH-only, so it stays here.
const CONDITIONS   = new Set(['BRAND_NEW', 'LIKE_NEW', 'REFURBISHED', 'USED_A', 'USED_B', 'USED_C', 'PARTS']);

function parsePositiveTechId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

// ─── GET ──────────────────────────────────────────────────────────────────────
// ?id=<n>              → single row
// ?receiving_id=<n>    → all lines for a package
// ?limit&offset&search → paginated list (omit receiving_id to get all)
//
// Testing feeds (`view=testing`, `view=needs-test`) are served exclusively by
// GET /api/testing/receiving-lines — never here — so package-pairing / QC scans
// cannot pollute Unbox/Receiving list semantics.
export type ReceivingLinesGetSurface = 'receiving' | 'testing';

export async function handleReceivingLinesGet(
  request: NextRequest,
  ctx: { organizationId: string; staffId?: number | null },
  surface: ReceivingLinesGetSurface = 'receiving',
) {
  try {
    const { searchParams } = new URL(request.url);
    // All ~27 query params parse through the extracted SoT parser — exact
    // coercions/defaults/fallbacks preserved (src/lib/receiving/lines/query.ts).
    const query = parseReceivingLinesQuery(searchParams);
    const {
      id, receivingId, limit, offset, viewRaw, view,
      historySort, hideZohoReceived, includeSerials,
    } = query;

    if (surface === 'receiving' && isTestingApiView(viewRaw)) {
      console.warn('[receiving-lines] blocked testing view on receiving endpoint', {
        view: viewRaw,
        orgId: ctx.organizationId,
      });
      return NextResponse.json(
        {
          success: false,
          error: 'TESTING_VIEW_NOT_ALLOWED',
          message: 'Use GET /api/testing/receiving-lines for testing feeds.',
        },
        { status: 403 },
      );
    }
    if (surface === 'testing' && !isTestingApiView(viewRaw)) {
      return NextResponse.json(
        {
          success: false,
          error: 'INVALID_TESTING_VIEW',
          message: 'Testing endpoint requires view=testing or view=needs-test.',
        },
        { status: 400 },
      );
    }

    // view=viewed only: the requesting operator, whose recently-opened lines
    // (receiving_line_views) this feed returns.
    const viewerStaffId = Number(ctx?.staffId);
    // Phase 2 — physical-vs-financial decoupling. The triage SCANNED queue keys
    // on PHYSICAL lifecycle (received_at set, not unboxed), so a box on the dock
    // stays visible even when Zoho already marks the PO received/closed; it just
    // carries a `zoho_status` badge. `?zohoStatus=open` (the "Hide Zoho-received"
    // toggle) re-applies the old hide-terminal filter. When the flag is off the
    // old behaviour (always hide Zoho-received) is preserved. Scoped to scanned —
    // Incoming still clears received POs by design.
    const applyScannedZohoExclusion = !isReceivingPhysicalStateFirst() || hideZohoReceived;
    // Layer 1 (rail read-after-write): read view=unbox_opened membership from the
    // committed receiving_unbox.opened_at column only. Flag-gated, default off.
    const unboxRailColumnRead = isUnboxRailColumnRead();

    const orgId = ctx.organizationId as OrgId;

    // Batch serial hydration (Tier A of the immediate-serial-display plan):
    // `?receiving_ids=1,2,3` resolves the CURRENT serials for every line of those
    // cartons in ONE call (reusing fetchSerialsForLines' batched lineIds[]), so a
    // feed can warm the `['receiving-siblings', id]` caches / patch its visible
    // rows with serials BEFORE the operator clicks — a row-click then opens from a
    // warm cache = instant, identical to the scan path. Org-scoped + capped like
    // every other branch; short-circuits before the single/paginated branches.
    const receivingIdsRaw = searchParams.get('receiving_ids');
    if (receivingIdsRaw != null && receivingIdsRaw.trim() !== '') {
      const receivingIds = Array.from(
        new Set(
          receivingIdsRaw
            .split(',')
            .map((s) => Number(s.trim()))
            .filter((n) => Number.isFinite(n) && n > 0),
        ),
      ).slice(0, 50); // cap the batch — a feed page is far smaller than this
      const serialsByLine: Record<number, LineSerial[]> = {};
      if (receivingIds.length > 0) {
        const lineRows = await tenantQuery<{ id: number }>(
          orgId,
          `SELECT id FROM receiving_line
            WHERE receiving_id = ANY($1::int[]) AND organization_id = $2`,
          [receivingIds, orgId],
        );
        const lineIds = lineRows.rows.map((r) => Number(r.id));
        const grouped = await fetchSerialsForLines(lineIds, orgId);
        for (const [lineId, serials] of grouped) serialsByLine[lineId] = serials;
      }
      return NextResponse.json({ success: true, serialsByLine });
    }

    // Universal Incoming (flag-gated, plan §6): when ON, view=incoming also shows
    // eBay-buyer lines and the ?inbound facet filters by primary source. OFF (the
    // default) = byte-identical Zoho-only path — no eBay rows, no new-column refs.
    const universalIncoming = view === 'incoming' ? await isIncomingUniversal(orgId) : false;

    // Single row
    if (Number.isFinite(id) && id > 0) {
      const single = buildReceivingLineByIdSql(id, orgId);
      const one = await tenantQuery(orgId, single.sql, single.params);
      if (one.rows.length === 0) {
        return NextResponse.json({ success: false, error: 'receiving_line not found' }, { status: 404 });
      }
      const normalized = normalizeRow(one.rows[0]);
      if (includeSerials) {
        const serialsByLine = await fetchSerialsForLines([normalized.id], orgId);
        (normalized as Record<string, unknown>).serials = serialsByLine.get(normalized.id) ?? [];
      }
      // Mobile `/receiving/lines/:id` historically read `receiving_lines[]`; desktop sidebar uses `receiving_line`.
      return NextResponse.json({
        success: true,
        receiving_line: normalized,
        receiving_lines: [normalized],
      });
    }

    // All lines for a specific package
    if (Number.isFinite(receivingId) && receivingId > 0) {
      const byReceiving = buildReceivingLinesByReceivingIdSql(receivingId, orgId);
      const [rows, pkgRes] = await withTenantConnection(orgId, (client) => Promise.all([
        client.query(byReceiving.lines.sql, byReceiving.lines.params),
        client.query(byReceiving.pkg.sql, byReceiving.pkg.params),
      ]));
      const normalizedRows = rows.rows.map(normalizeRow);
      if (includeSerials) {
        const serialsByLine = await fetchSerialsForLines(normalizedRows.map((r) => r.id), orgId);
        for (const row of normalizedRows) {
          (row as Record<string, unknown>).serials = serialsByLine.get(row.id) ?? [];
        }
      }
      const receiving_package = pkgRes.rows[0]
        ? {
            received_at: (pkgRes.rows[0].received_at as string | null) ?? null,
            unboxed_at: (pkgRes.rows[0].unboxed_at as string | null) ?? null,
            created_at: (pkgRes.rows[0].created_at as string | null) ?? null,
            return_platform: (pkgRes.rows[0].return_platform as string | null) ?? null,
            source_platform: (pkgRes.rows[0].source_platform as string | null) ?? null,
            is_return: !!pkgRes.rows[0].is_return,
          }
        : null;
      return NextResponse.json({ success: true, receiving_lines: normalizedRows, receiving_package });
    }

    // Paginated list — all lines, optionally filtered. The dynamic WHERE /
    // ORDER BY / SELECT assembly lives in the extracted builder
    // (src/lib/receiving/lines/build-sql.ts), pinned byte-identical to the old
    // inline logic by build-sql.test.ts.
    const built = buildReceivingLinesListSql({
      query,
      orgId,
      viewerStaffId,
      universalIncoming,
      applyScannedZohoExclusion,
      unboxRailColumnRead,
    });
    const [rowsRes, countRes] = await withTenantConnection(orgId, (client) => Promise.all([
      client.query(built.list.sql, built.list.params),
      client.query(built.count.sql, built.count.params),
    ]));

    let normalizedList = rowsRes.rows.map(normalizeRow);
    let total = Number(countRes.rows[0]?.total ?? 0);
    if (includeSerials) {
      const serialsByLine = await fetchSerialsForLines(normalizedList.map((r) => r.id), orgId);
      for (const row of normalizedList) {
        (row as Record<string, unknown>).serials = serialsByLine.get(row.id) ?? [];
      }
    }

    // Unmatched/unfound cartons live in the `receiving_carton` table with no
    // `receiving_line` row yet, so they never come back from the main query.
    // Append them as placeholder rows for `all` AND `activity` — a scanned
    // unfound carton has been physically touched, so it belongs in the
    // activity feed that backs both the History table and the recent rail.
    if (shouldIncludeUnmatchedPlaceholders(query)) {
      const placeholders = buildUnmatchedPlaceholdersSql(query, orgId);
      const [unmatchedPkgsRes, unmatchedCntRes] = await withTenantConnection(orgId, (client) => Promise.all([
        client.query(placeholders.list.sql, placeholders.list.params),
        client.query(placeholders.count.sql, placeholders.count.params),
      ]));
      total += Number(unmatchedCntRes.rows[0]?.n ?? 0);
      const placeholderNorm = unmatchedPkgsRes.rows.map((pkg) =>
        normalizeRow(buildUnmatchedEmptyReceivingLine(pkg as Record<string, unknown>)),
      );
      for (const row of placeholderNorm) {
        if (includeSerials) (row as Record<string, unknown>).serials = [];
      }
      // Respect the requested sort axis after the placeholder merge —
      // re-sorting everything by scan-based last_activity_at here let a mere
      // door re-scan (e.g. from triage) bump a carton to the top of the
      // unbox rail.
      normalizedList = [...normalizedList, ...placeholderNorm].sort((a, b) =>
        historySort === 'unboxed_newest'
          ? compareReceivingRowsByUnboxedAt(a, b)
          : historySort === 'unbox_activity'
            ? compareReceivingRowsByUnboxActivity(a, b)
            : compareReceivingRowsByScannedAt(a, b),
      );
      const windowed = normalizedList.slice(offset, offset + limit);
      // Lineless unfound placeholders sort last on unboxed_newest and were
      // silently dropped when the main query already filled the page window.
      if (view === 'activity' && placeholderNorm.length > 0) {
        const windowRcvIds = new Set(
          windowed
            .map((r) => r.receiving_id)
            .filter((id): id is number => id != null && Number.isFinite(id)),
        );
        const missingPlaceholders = placeholderNorm.filter(
          (p) =>
            p.id < 0
            && p.receiving_id != null
            && !windowRcvIds.has(p.receiving_id),
        );
        normalizedList =
          missingPlaceholders.length > 0
            ? [...windowed, ...missingPlaceholders.slice(0, 50)]
            : windowed;
      } else {
        normalizedList = windowed;
      }
    }

    // Lineless cartons opened on the Unbox surface (any source — incl. ghost
    // zoho_po rows after the operator typed a PO#) never appear in the lines
    // query above; append them as placeholders keyed on UNBOX_SCAN_OPENED.
    if (shouldIncludeUnboxOpenedPlaceholders(query)) {
      const placeholders = buildUnboxOpenedPlaceholdersSql(query, orgId, unboxRailColumnRead);
      const [unboxPkgsRes, unboxCntRes] = await withTenantConnection(orgId, (client) => Promise.all([
        client.query(placeholders.list.sql, placeholders.list.params),
        client.query(placeholders.count.sql, placeholders.count.params),
      ]));
      total += Number(unboxCntRes.rows[0]?.n ?? 0);
      const unboxPlaceholderNorm = unboxPkgsRes.rows.map((pkg) =>
        normalizeRow(buildUnmatchedEmptyReceivingLine(pkg as Record<string, unknown>)),
      );
      for (const row of unboxPlaceholderNorm) {
        if (includeSerials) (row as Record<string, unknown>).serials = [];
      }
      normalizedList = [...normalizedList, ...unboxPlaceholderNorm].sort((a, b) =>
        compareReceivingRowsByUnboxOpenedAt(a, b),
      );
      const windowed = normalizedList.slice(offset, offset + limit);
      // Lineless unfound opened on the Unbox surface sort after lined rows and
      // were silently dropped when the main query already filled the page window.
      if (unboxPlaceholderNorm.length > 0) {
        const windowRcvIds = new Set(
          windowed
            .map((r) => r.receiving_id)
            .filter((id): id is number => id != null && Number.isFinite(id)),
        );
        const missingPlaceholders = unboxPlaceholderNorm.filter(
          (p) =>
            p.id < 0
            && p.receiving_id != null
            && !windowRcvIds.has(p.receiving_id),
        );
        normalizedList =
          missingPlaceholders.length > 0
            ? [...windowed, ...missingPlaceholders.slice(0, 50)]
            : windowed;
      } else {
        normalizedList = windowed;
      }
    }

    if (view === 'incoming') {
      const org = await getOrganization(orgId);
      const warehousePostal = org?.settings?.shipFrom?.postalCode ?? '';
      for (const row of normalizedList) {
        enrichIncomingTrackingIntegrity(row as Record<string, unknown>, warehousePostal);
      }
      if (query.deliveryStateFilter === 'WRONG_DESTINATION') {
        normalizedList = normalizedList.filter((r) => (r as { wrong_destination?: boolean }).wrong_destination);
        total = normalizedList.length;
      }
    }

    return NextResponse.json({
      success: true,
      receiving_lines: normalizedList,
      total,
      limit,
      offset,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to fetch receiving lines';
    console.error('receiving-lines GET failed:', error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export const GET = withAuth(
  (request: NextRequest, ctx) => handleReceivingLinesGet(request, ctx, 'receiving'),
  { permission: 'receiving.view' },
);

// ─── POST ─────────────────────────────────────────────────────────────────────
export const POST = withAuth(async (request: NextRequest, ctx) => {
  try {
    const body = await request.json();

    const receivingIdRaw = body?.receiving_id;
    const receivingId    = receivingIdRaw != null ? Number(receivingIdRaw) : null;
    const zohoItemId     = String(body?.zoho_item_id || '').trim();
    const zohoLineItemId = String(body?.zoho_line_item_id || '').trim() || null;
    const zohoPurchaseReceiveId = String(body?.zoho_purchase_receive_id || '').trim() || null;
    const zohoPurchaseOrderId   = String(body?.zoho_purchaseorder_id || '').trim() || null;
    const itemName       = String(body?.item_name || '').trim() || null;
    const sku            = String(body?.sku || '').trim() || null;
    const notes          = String(body?.notes || '').trim() || null;

    const qtyReceivedRaw   = Number(body?.quantity_received ?? body?.quantity ?? 0);
    const quantityReceived = Number.isFinite(qtyReceivedRaw) && qtyReceivedRaw >= 0 ? Math.floor(qtyReceivedRaw) : 0;

    const qtyExpectedRaw  = Number(body?.quantity_expected);
    const quantityExpected = Number.isFinite(qtyExpectedRaw) && qtyExpectedRaw > 0 ? Math.floor(qtyExpectedRaw) : null;

    const qaStatusRaw  = String(body?.qa_status || 'PENDING').trim().toUpperCase();
    const dispositionRaw = String(body?.disposition_code || 'HOLD').trim().toUpperCase();
    const conditionRaw   = String(body?.condition_grade || 'USED_A').trim().toUpperCase();
    const dispositionAudit = Array.isArray(body?.disposition_audit) ? body.disposition_audit : [];
    const assignedTechId = parsePositiveTechId(body?.assigned_tech_id ?? body?.assignedTechId);
    const needsTest = body?.needs_test === undefined && body?.needsTest === undefined
      ? true
      : !!(body?.needs_test ?? body?.needsTest);

    if (!zohoItemId) {
      return NextResponse.json({ success: false, error: 'zoho_item_id is required' }, { status: 400 });
    }
    if (receivingId !== null && (!Number.isFinite(receivingId) || receivingId <= 0)) {
      return NextResponse.json({ success: false, error: 'receiving_id must be a positive integer or null' }, { status: 400 });
    }
    if (!QA_STATUSES.has(qaStatusRaw)) {
      return NextResponse.json({ success: false, error: 'Invalid qa_status' }, { status: 400 });
    }
    if (!DISPOSITIONS.has(dispositionRaw)) {
      return NextResponse.json({ success: false, error: 'Invalid disposition_code' }, { status: 400 });
    }
    if (!CONDITIONS.has(conditionRaw)) {
      return NextResponse.json({ success: false, error: 'Invalid condition_grade' }, { status: 400 });
    }

    const orgId = ctx.organizationId as OrgId;
    // receiving_line.organization_id is NOT NULL with a loud-fail GUC default.
    // Run under the org GUC AND stamp the column explicitly so the insert is
    // attributed to the caller's tenant (never the GUC fallback).
    //
    // Wave-3 writer inversion: the birth is a THIN spine INSERT; the zoho
    // cluster lands on receiving_line_zoho (rz) and the testing cluster on
    // receiving_line_testing (rlt) — both in the SAME transaction with explicit
    // values (birth invariant: every receiving_line has its rlt row).
    const lineId = await withTenantTransaction(orgId, async (client) => {
      const ins = await client.query<{ id: number }>(
        `INSERT INTO receiving_line (
          receiving_id, item_name, sku,
          quantity_received, quantity_expected,
          notes, organization_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING id`,
        [
          receivingId, itemName, sku,
          quantityReceived, quantityExpected,
          notes, orgId,
        ],
      );
      const newId = Number(ins.rows[0].id);
      const txDeps = {
        query: ((_org: OrgId, sql: string, p?: unknown[]) => client.query(sql, p)) as typeof tenantQuery,
      };
      await upsertReceivingLineZoho(orgId, newId, {
        zohoItemId,
        zohoLineItemId,
        zohoPurchaseReceiveId,
        zohoPurchaseOrderId,
      }, txDeps);
      await upsertReceivingLineTesting(orgId, newId, {
        needsTest,
        assignedTechId,
        qaStatus: qaStatusRaw,
        dispositionCode: dispositionRaw,
        conditionGrade: conditionRaw,
        dispositionAudit,
      }, txDeps);
      return newId;
    });

    await invalidateReceivingViews(ctx.organizationId);
    await publishReceivingLogChanged({ organizationId: ctx.organizationId, action: 'insert', rowId: String(lineId), source: 'receiving-lines.create' });

    // Envelope frozen ({ success, receiving_line }): compose the response by
    // re-fetching through the street-sourced single-row builder (same shape the
    // GET ?id= path serves) instead of the old spine RETURNING *.
    const single = buildReceivingLineByIdSql(lineId, orgId);
    const fresh = await tenantQuery(orgId, single.sql, single.params);
    if (fresh.rows.length === 0) {
      // Should be unreachable (we just committed the insert) — surface loudly.
      return NextResponse.json(
        { success: false, error: 'created receiving_line could not be re-read' },
        { status: 500 },
      );
    }
    return NextResponse.json({ success: true, receiving_line: normalizeRow(fresh.rows[0]) }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to create receiving line';
    console.error('receiving-lines POST failed:', error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}, { permission: 'receiving.mark_received' });

// ─── PATCH ────────────────────────────────────────────────────────────────────
export const PATCH = withAuth(async (request: NextRequest, ctx) => {
  try {
    const orgId = ctx.organizationId as OrgId;
    const body = await request.json();
    const id   = Number(body?.id);

    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ success: false, error: 'Valid id is required' }, { status: 400 });
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    // zoho_reference_number dropped in 2026-04-15_drop_zoho_reference_number.sql.
    // A body payload for that key is still accepted (sidebar tracking edits
    // send it) — handled below via the canonical shipment path, not a column
    // write.
    //
    // Wave-3 writer inversion: only spine-staying text columns go in the dynamic
    // spine UPDATE. The zoho cluster is collected into a receiving_line_zoho
    // patch (rz) and the testing cluster into a receiving_line_testing patch
    // (rlt) — both applied in the same transaction as the spine UPDATE below.
    const textFields: Array<[string, string | null]> = [
      ['item_name',                 String(body?.item_name ?? '').trim() || null],
      ['sku',                       String(body?.sku ?? '').trim() || null],
      ['notes',                     String(body?.notes ?? '').trim() || null],
      ['receiving_type',            String(body?.receiving_type ?? '').trim() || null],
      ['zendesk_ticket',            String(body?.zendesk_ticket ?? '').trim() || null],
    ];
    for (const [col, val] of textFields) {
      if (body[col] !== undefined) {
        updates.push(`${col} = $${idx++}`);
        values.push(val);
      }
    }

    type ZohoTextKey =
      | 'zohoItemId' | 'zohoLineItemId' | 'zohoPurchaseReceiveId'
      | 'zohoPurchaseOrderId' | 'zohoPurchaseOrderNumber';
    const zohoPatch: ZohoFactsInput = {};
    const zohoTextFields: Array<[string, ZohoTextKey]> = [
      ['zoho_item_id',              'zohoItemId'],
      ['zoho_line_item_id',         'zohoLineItemId'],
      ['zoho_purchase_receive_id',  'zohoPurchaseReceiveId'],
      ['zoho_purchaseorder_id',     'zohoPurchaseOrderId'],
      ['zoho_purchaseorder_number', 'zohoPurchaseOrderNumber'],
    ];
    for (const [col, key] of zohoTextFields) {
      if (body[col] !== undefined) {
        zohoPatch[key] = String(body[col] ?? '').trim() || null;
      }
    }
    const testingPatch: TestingFactsInput = {};

    if (body?.receiving_id !== undefined) {
      const raw = body.receiving_id != null ? Number(body.receiving_id) : null;
      updates.push(`receiving_id = $${idx++}`);
      values.push(raw != null && Number.isFinite(raw) && raw > 0 ? raw : null);
    }

    if (body?.quantity_received !== undefined || body?.quantity !== undefined) {
      const raw = Number(body?.quantity_received ?? body?.quantity ?? 0);
      const nextReceived =
        Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
      updates.push(`quantity_received = $${idx++}`);
      values.push(nextReceived);
    }

    if (body?.quantity_expected !== undefined) {
      const raw = Number(body.quantity_expected);
      updates.push(`quantity_expected = $${idx++}`);
      values.push(Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : null);
    }

    if (body?.qa_status !== undefined) {
      const qa = String(body.qa_status || '').trim().toUpperCase();
      if (!QA_STATUSES.has(qa)) {
        return NextResponse.json({ success: false, error: 'Invalid qa_status' }, { status: 400 });
      }
      testingPatch.qaStatus = qa;
    }

    if (body?.disposition_code !== undefined) {
      const d = String(body.disposition_code || '').trim().toUpperCase();
      if (!DISPOSITIONS.has(d)) {
        return NextResponse.json({ success: false, error: 'Invalid disposition_code' }, { status: 400 });
      }
      testingPatch.dispositionCode = d;
    }

    let isPartsCondition = false;
    if (body?.condition_grade !== undefined) {
      const c = String(body.condition_grade || '').trim().toUpperCase();
      if (!CONDITIONS.has(c)) {
        return NextResponse.json({ success: false, error: 'Invalid condition_grade' }, { status: 400 });
      }
      testingPatch.conditionGrade = c;
      isPartsCondition = c === 'PARTS';
    }

    if (body?.disposition_audit !== undefined) {
      testingPatch.dispositionAudit = Array.isArray(body.disposition_audit) ? body.disposition_audit : [];
    }

    if (body?.assigned_tech_id !== undefined || body?.assignedTechId !== undefined) {
      testingPatch.assignedTechId = parsePositiveTechId(body?.assigned_tech_id ?? body?.assignedTechId);
    }

    if (body?.needs_test !== undefined || body?.needsTest !== undefined) {
      const nextNeedsTest = !!(body?.needs_test ?? body?.needsTest);
      if (!nextNeedsTest) {
        // Testing facts live on receiving_line_testing (rlt) now — the guard
        // reads the current assignment there (spine copies are write-dead).
        // LEFT JOIN so a line whose rlt row is somehow missing still 404s only
        // when the LINE is missing; a NULL rlt.needs_test is treated as
        // "was needs-test" (same as the old spine NULL), keeping the guard
        // conservative.
        const existing = await tenantQuery<{ needs_test: boolean | null; assigned_tech_id: number | null }>(
          orgId,
          `SELECT rlt.needs_test, rlt.assigned_tech_id
             FROM receiving_line rl
             LEFT JOIN receiving_line_testing rlt
               ON rlt.receiving_line_id = rl.id AND rlt.organization_id = rl.organization_id
            WHERE rl.id = $1 AND rl.organization_id = $2`,
          [id, orgId],
        );
        if (existing.rows.length === 0) {
          return NextResponse.json({ success: false, error: 'receiving_line not found' }, { status: 404 });
        }
        // Only enforce the tech-assignment guard when needs_test is actually being
        // cleared (true -> false). Re-saving a line that is already needs_test=false
        // is a no-op for this field and must not be blocked.
        const wasNeedsTest = existing.rows[0]?.needs_test !== false;
        if (wasNeedsTest) {
          const effectiveTechId =
            parsePositiveTechId(body?.assigned_tech_id ?? body?.assignedTechId) ??
            parsePositiveTechId(existing.rows[0]?.assigned_tech_id);
          if (!effectiveTechId) {
            return NextResponse.json(
              { success: false, error: 'needs_test can only be cleared after a technician is assigned' },
              { status: 400 },
            );
          }
        }
      }
      testingPatch.needsTest = nextNeedsTest;
    } else if (isPartsCondition) {
      // A "For Parts" line skips testing entirely — clear needs_test so it
      // drops out of the test queue. Parts don't require a tech assignment,
      // so this bypasses the tech-assignment guard above.
      testingPatch.needsTest = false;
    }

    const hasTrackingEdit = body?.zoho_reference_number !== undefined;
    const hasTestingPatch = Object.keys(testingPatch).length > 0;
    const hasZohoPatch = Object.keys(zohoPatch).length > 0;
    if (updates.length === 0 && !hasTestingPatch && !hasZohoPatch && !hasTrackingEdit) {
      return NextResponse.json({ success: false, error: 'No valid fields to update' }, { status: 400 });
    }

    // Run the column writes only when there are real ones. A tracking-only
    // edit (zoho_reference_number body key) runs purely through the shipment
    // path below since the column it used to write to was dropped in
    // 2026-04-15_drop_zoho_reference_number.sql.
    //
    // Spine UPDATE + rlt/rz facts upserts for one logical edit run in ONE
    // tenant transaction: lock the line, apply the spine writes (or just bump
    // updated_at, which the spine UPDATE used to do via trigger even for
    // facts-only edits — it feeds the unbox_activity sort), then the facts.
    let updatedRow: { id: number; receiving_id: number | null } | null = null;
    if (updates.length > 0 || hasTestingPatch || hasZohoPatch) {
      const txResult = await withTenantTransaction(orgId, async (client) => {
        const lock = await client.query<{ id: number; receiving_id: number | null }>(
          `SELECT id, receiving_id FROM receiving_line
            WHERE id = $1 AND organization_id = $2
            FOR UPDATE`,
          [id, orgId],
        );
        if (lock.rows.length === 0) return null;
        let row = lock.rows[0];
        if (updates.length > 0) {
          const updValues = [...values, id, orgId];
          const upd = await client.query<{ id: number; receiving_id: number | null }>(
            `UPDATE receiving_line SET ${updates.join(', ')}
              WHERE id = $${updValues.length - 1} AND organization_id = $${updValues.length}
              RETURNING id, receiving_id`,
            updValues,
          );
          // RETURNING reflects a body-supplied receiving_id change (the lock
          // SELECT above holds the pre-update value).
          row = upd.rows[0] ?? row;
        } else {
          await client.query(
            `UPDATE receiving_line SET updated_at = NOW()
              WHERE id = $1 AND organization_id = $2`,
            [id, orgId],
          );
        }
        const txDeps = {
          query: ((_org: OrgId, sql: string, p?: unknown[]) => client.query(sql, p)) as typeof tenantQuery,
        };
        if (hasTestingPatch) await upsertReceivingLineTesting(orgId, id, testingPatch, txDeps);
        // Operator edited the condition grade — a genuine acknowledgement that
        // the unit was physically opened. Set-once stamp the carton's "Unboxed"
        // milestone (no-op if a serial/receive already stamped it). Same tenant
        // tx / client, so it commits atomically with the condition write.
        if (testingPatch.conditionGrade !== undefined) {
          await acknowledgeUnbox(client, orgId, row.receiving_id, ctx.staffId ?? null);
        }
        if (hasZohoPatch) {
          await upsertReceivingLineZoho(orgId, id, zohoPatch, txDeps);
          // The spine kept zoho_purchaseorder_number_norm as a GENERATED column;
          // rz stores it plainly (2026-07-11_receiving_line_zoho_number_norm), so
          // re-derive it with the same expression whenever the number changed.
          // narrow.ts doesn't expose the norm field — inline in the same idiom.
          if (zohoPatch.zohoPurchaseOrderNumber !== undefined) {
            await client.query(
              `UPDATE receiving_line_zoho
                  SET zoho_purchaseorder_number_norm =
                        NULLIF(upper(regexp_replace(COALESCE(zoho_purchaseorder_number, ''), '[^A-Za-z0-9]', '', 'g')), ''),
                      updated_at = now()
                WHERE receiving_line_id = $1 AND organization_id = $2`,
              [id, orgId],
            );
          }
        }
        return row;
      });
      if (!txResult) {
        return NextResponse.json({ success: false, error: 'receiving_line not found' }, { status: 404 });
      }
      updatedRow = txResult;
    }

    // "For Parts" line → sort every serial already attached to this line into
    // the Technical Room parts bin (STOCKED, pickable). Best-effort: a sort
    // failure must not fail the PATCH.
    if (isPartsCondition) {
      try {
        const serials = await tenantQuery<{ id: number }>(
          orgId,
          // Phase 3: filter-by-origin via indexed provenance reverse lookup.
          `SELECT id FROM serial_units
            WHERE id IN (SELECT p.serial_unit_id FROM serial_unit_provenance p
                          WHERE p.origin_type = 'RECEIVING_LINE' AND p.origin_id = $1 AND p.organization_id = $2)
              AND organization_id = $2`,
          [id, orgId],
        );
        for (const s of serials.rows) {
          // sortSerialUnitToParts is a shared, session-less helper (also called by
          // non-route paths); its signature is intentionally left unchanged.
          await sortSerialUnitToParts({
            serialUnitId: s.id,
            staffId: ctx.staffId ?? null,
            station: 'RECEIVING',
          });
        }
      } catch (sortErr) {
        console.warn('[receiving-lines PATCH] parts auto-sort failed (non-fatal)', sortErr);
      }
      // The line's serials moved to the parts bin — refresh its projection so the
      // next open reflects it on the first frame (Tier B2). Post-response.
      after(() => refreshLineSerialProjectionSafe(orgId, id));
    }

    // Canonical tracking path: a manual tracking submission registers the
    // shipment and attaches it to the line's receiving row. Overrides any
    // auto-attached shipment because a manual edit is explicit intent.
    if (hasTrackingEdit) {
      const tracking = String(body.zoho_reference_number ?? '').trim();
      const shipment = tracking
        ? await registerShipmentPermissive({
            trackingNumber: tracking,
            sourceSystem: 'receiving_lines_patch',
          }, ctx.organizationId)
        : null;
      let receivingIdForLine = updatedRow?.receiving_id ?? null;
      if (receivingIdForLine == null) {
        const existing = await tenantQuery<{ receiving_id: number | null }>(
          orgId,
          `SELECT receiving_id FROM receiving_line WHERE id = $1 AND organization_id = $2`,
          [id, orgId],
        );
        if (existing.rows.length === 0) {
          return NextResponse.json({ success: false, error: 'receiving_line not found' }, { status: 404 });
        }
        receivingIdForLine = existing.rows[0].receiving_id ?? null;
      }
      if (shipment && receivingIdForLine != null) {
        await tenantQuery(
          orgId,
          `UPDATE receiving_carton SET shipment_id = $1 WHERE id = $2 AND organization_id = $3`,
          [shipment.id, receivingIdForLine, orgId],
        );
      }
    }

    await invalidateReceivingViews(ctx.organizationId);
    await publishReceivingLogChanged({ organizationId: ctx.organizationId, action: 'update', rowId: String(id), source: 'receiving-lines.update' });

    // Re-fetch with the shipment JOIN so the response carries the just-attached
    // shipment's tracking/carrier/status fields. Wave-2 street cutover: moved
    // columns read from the 1:1 street tables (rlt/rz/rt) with the same output
    // names overriding the rl.* spine values — normalizeRow is untouched.
    const fresh = await tenantQuery(
      orgId,
      `SELECT rl.*,
              COALESCE(rlt.needs_test, false)              AS needs_test,
              rlt.assigned_tech_id                         AS assigned_tech_id,
              rlt.qa_status                                AS qa_status,
              rlt.disposition_code                         AS disposition_code,
              rlt.condition_grade                          AS condition_grade,
              rlt.disposition_final                        AS disposition_final,
              COALESCE(rlt.disposition_audit, '[]'::jsonb) AS disposition_audit,
              rlt.condition_set_at                         AS condition_set_at,
              rlt.label_printed_at                         AS label_printed_at,
              rz.zoho_item_id                              AS zoho_item_id,
              rz.zoho_line_item_id                         AS zoho_line_item_id,
              rz.zoho_purchase_receive_id                  AS zoho_purchase_receive_id,
              rz.zoho_purchaseorder_id                     AS zoho_purchaseorder_id,
              rz.zoho_purchaseorder_number                 AS zoho_purchaseorder_number,
              rz.zoho_purchaseorder_number_norm            AS zoho_purchaseorder_number_norm,
              rz.zoho_sync_source                          AS zoho_sync_source,
              rz.zoho_last_modified_time                   AS zoho_last_modified_time,
              rz.zoho_synced_at                            AS zoho_synced_at,
              rz.zoho_notes                                AS zoho_notes,
              rz.unit_price                                AS unit_price,
              stn.tracking_number_raw AS receiving_tracking_number,
              r.carrier,
              r.source                     AS receiving_source,
              r.source_platform            AS receiving_source_platform,
                r.intake_type                AS receiving_intake_type,
              COALESCE(r.is_priority, false) AS is_priority,
                r.priority_tier                AS priority_tier,
              r.zoho_purchaseorder_number  AS receiving_zoho_purchaseorder_number,
              r.support_notes              AS receiving_support_notes,
              r.zoho_notes                 AS receiving_zoho_notes,
              r.listing_url                AS receiving_listing_url,
              rt.door_received_at::text    AS receiving_received_at,
              -- Scan-based "last touched" time, matching view=activity so the
              -- post-save dispatchLineUpdated keeps the rail's timestamp intact.
              rs_agg.last_scan::text       AS last_scan_at,
              stn.tracking_number_raw      AS shipment_tracking_number,
              stn.carrier                  AS shipment_carrier,
              stn.latest_status_category   AS shipment_status_category,
              stn.is_delivered             AS shipment_is_delivered,
              stn.delivered_at             AS shipment_delivered_at
         FROM receiving_line rl
         LEFT JOIN receiving_line_testing rlt ON rlt.receiving_line_id = rl.id AND rlt.organization_id = rl.organization_id
         LEFT JOIN receiving_line_zoho rz     ON rz.receiving_line_id = rl.id AND rz.organization_id = rl.organization_id
         LEFT JOIN receiving_carton r            ON r.id  = rl.receiving_id AND r.organization_id = rl.organization_id
         LEFT JOIN receiving_triage rt ON rt.receiving_id = r.id AND rt.organization_id = r.organization_id
         LEFT JOIN LATERAL (
            SELECT MAX(rs.scanned_at) AS last_scan
            FROM receiving_scans rs
            WHERE rs.receiving_id = r.id
         ) rs_agg ON TRUE
         LEFT JOIN shipping_tracking_numbers stn ON stn.id = r.shipment_id
        WHERE rl.id = $1 AND rl.organization_id = $2`,
      [id, orgId],
    );
    if (fresh.rows.length === 0) {
      return NextResponse.json({ success: false, error: 'receiving_line not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, receiving_line: normalizeRow(fresh.rows[0]) });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to update receiving line';
    console.error('receiving-lines PATCH failed:', error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}, { permission: 'receiving.mark_received' });

// ─── DELETE ───────────────────────────────────────────────────────────────────
export const DELETE = withAuth(async (request: NextRequest, ctx) => {
  try {
    const orgId = ctx.organizationId as OrgId;
    const { searchParams } = new URL(request.url);
    const idParam = searchParams.get('id');
    // `po_id` (zoho_purchaseorder_id) deletes EVERY receiving_line for that PO
    // — that's one Incoming-table row, which dedupes lines to 1 per PO. The
    // single-`id` path stays for callers that target one specific line.
    const poId = (searchParams.get('po_id') || '').trim();
    // `shipment_id` hard-deletes a shipment-anchored "Delivered · not scanned"
    // box that has no PO and no receiving_line row — the only way to clear that
    // synthetic Incoming row, since there's nothing in receiving_line to delete.
    const shipmentIdParam = (searchParams.get('shipment_id') || '').trim();

    if (shipmentIdParam) {
      const sid = Number(shipmentIdParam);
      if (!Number.isFinite(sid) || sid <= 0) {
        return NextResponse.json({ success: false, error: 'Valid shipment_id is required' }, { status: 400 });
      }
      // Guard: this path only clears the delivered-unscanned surface. Refuse a
      // shipment that has dock-scan activity (real receiving) or isn't delivered
      // — those aren't Incoming clutter and must not be hard-deleted here.
      // Tenancy: shipping_tracking_numbers has no organization_id, so org-scope
      // by requiring the shipment to be referenced by a `receiving_carton` row in
      // THIS org (org-owned). That both anchors the tenant and is the exact box
      // this synthetic Incoming row stands for — a cross-org shipment id 404s.
      // Run the guard + the hard-delete on the SAME tenant connection so the
      // org GUC is set for the whole operation.
      const delResult = await withTenantTransaction(orgId, async (client) => {
        const guard = await client.query(
          `SELECT 1
             FROM shipping_tracking_numbers stn
            WHERE stn.id = $1
              AND stn.is_delivered = true
              AND EXISTS (
                SELECT 1 FROM receiving_carton r3
                 WHERE r3.shipment_id = stn.id
                   AND r3.organization_id = $2
              )
              AND NOT EXISTS (
                SELECT 1 FROM receiving_carton r2
                JOIN receiving_scans rs ON rs.receiving_id = r2.id
                WHERE r2.shipment_id = stn.id
                  AND r2.organization_id = $2
              )
            LIMIT 1`,
          [sid, orgId],
        );
        if (guard.rows.length === 0) {
          return { ok: false as const, status: 409 as const, error: 'Shipment is not a delivered-unscanned box (already scanned, not delivered, or not in this org)' };
        }
        // Hard delete. shipment_tracking_events + fba_tracking_item_allocations
        // cascade; every other reference is ON DELETE SET NULL EXCEPT
        // station_scan_sessions (no ON DELETE clause → RESTRICT), so clear those
        // first. A never-scanned box typically has none.
        await client.query('DELETE FROM station_scan_sessions WHERE shipment_id = $1', [sid]);
        const del = await client.query('DELETE FROM shipping_tracking_numbers WHERE id = $1 RETURNING id', [sid]);
        if (del.rows.length === 0) {
          return { ok: false as const, status: 404 as const, error: 'shipment not found' };
        }
        return { ok: true as const };
      });
      if (!delResult.ok) {
        return NextResponse.json({ success: false, error: delResult.error }, { status: delResult.status });
      }
      await invalidateReceivingViews(ctx.organizationId);
      await publishReceivingLogChanged({ organizationId: ctx.organizationId, action: 'delete', rowId: `shipment:${sid}`, source: 'receiving-lines.delete-shipment' });
      return NextResponse.json({ success: true, shipment_id: sid });
    }

    if (poId) {
      // PO identity lives on receiving_line_zoho (rz) — the spine
      // zoho_purchaseorder_id is write-dead and drops next migration, so the
      // PO-wide delete resolves its lines through rz. rz rows cascade with
      // their line.
      const result = await tenantQuery<{ id: number }>(
        orgId,
        `DELETE FROM receiving_line rl
          USING receiving_line_zoho rz
          WHERE rz.receiving_line_id = rl.id
            AND rz.organization_id = rl.organization_id
            AND rz.zoho_purchaseorder_id = $1
            AND rl.organization_id = $2
          RETURNING rl.id`,
        [poId, orgId],
      );
      if (result.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: 'No receiving lines found for that PO' },
          { status: 404 },
        );
      }
      await invalidateReceivingViews(ctx.organizationId);
      await publishReceivingLogChanged({ organizationId: ctx.organizationId, action: 'delete', rowId: poId, source: 'receiving-lines.delete' });
      return NextResponse.json({ success: true, po_id: poId, deleted: result.rows.length });
    }

    // Bulk: `?ids=1,2,3` deletes the batch in ONE statement. The sidebar
    // edit-mode bulk delete uses this — N parallel single-id requests proved
    // flaky (pool contention dropped a couple of rows per batch). Idempotent:
    // ids already gone are simply absent from `deleted`.
    const idsParam = (searchParams.get('ids') || '').trim();
    if (idsParam) {
      const ids = Array.from(new Set(
        idsParam.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0),
      ));
      if (ids.length === 0) {
        return NextResponse.json(
          { success: false, error: 'ids must be a comma-separated list of positive integers' },
          { status: 400 },
        );
      }
      // Delete + carton-source-link recompute on one tenant connection so the
      // org GUC stays set for the recompute (which reads/writes org-owned
      // receiving_carton / receiving_line via the passed client). recomputeCartonSourceLink's
      // signature is unchanged — it already accepts an optional `db`.
      const deleted = await withTenantTransaction(orgId, async (client) => {
        const result = await client.query<{ id: number; receiving_id: number | null }>(
          `DELETE FROM receiving_line WHERE id = ANY($1::int[]) AND organization_id = $2 RETURNING id, receiving_id`,
          [ids, orgId],
        );
        const deletedIds = result.rows.map((r) => Number(r.id));
        const cartons = Array.from(
          new Set(result.rows.map((r) => r.receiving_id).filter((x) => x != null).map(Number)),
        );
        // Re-derive each affected carton's source linkage — removing the last
        // linked line reverts the carton to unmatched (the unlink revert).
        for (const rid of cartons) {
          try { await recomputeCartonSourceLink(rid, client); } catch (err) { console.warn('recomputeCartonSourceLink failed', rid, err); }
        }
        return deletedIds;
      });
      await invalidateReceivingViews(ctx.organizationId);
      // Count, not the id list — listeners only refetch on this event, and an
      // unbounded id string risks the broker's message size cap.
      await publishReceivingLogChanged({
        organizationId: ctx.organizationId,
        action: 'delete',
        rowId: `bulk:${deleted.length}`,
        source: 'receiving-lines.delete-bulk',
      });
      return NextResponse.json({ success: true, deleted });
    }

    const id = Number(idParam);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ success: false, error: 'Valid id or po_id is required' }, { status: 400 });
    }

    const deletedRow = await withTenantTransaction(orgId, async (client) => {
      const result = await client.query<{ id: number; receiving_id: number | null }>(
        `DELETE FROM receiving_line WHERE id = $1 AND organization_id = $2 RETURNING id, receiving_id`,
        [id, orgId],
      );
      if (result.rows.length === 0) return null;
      // Re-derive the carton's source linkage — if this was the last line carrying
      // a source order, the carton reverts to unmatched (the unlink revert). Owns
      // the downgrade the general PATCH /api/receiving/[id] refuses. Pass the
      // tenant client so the recompute stays org-scoped under the GUC.
      const deletedReceivingId = result.rows[0]?.receiving_id;
      if (deletedReceivingId != null) {
        try { await recomputeCartonSourceLink(Number(deletedReceivingId), client); }
        catch (err) { console.warn('recomputeCartonSourceLink failed', deletedReceivingId, err); }
      }
      return result.rows[0];
    });
    if (!deletedRow) {
      return NextResponse.json({ success: false, error: 'receiving_line not found' }, { status: 404 });
    }

    await invalidateReceivingViews(ctx.organizationId);
    await publishReceivingLogChanged({ organizationId: ctx.organizationId, action: 'delete', rowId: String(id), source: 'receiving-lines.delete' });

    return NextResponse.json({ success: true, id });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to delete receiving line';
    console.error('receiving-lines DELETE failed:', error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}, { permission: 'receiving.mark_received' });

/** Label for unmatched cartons that have no `receiving_line` yet (Recent + History). */
const UNMATCHED_EMPTY_LINE_LABEL = 'Unfound PO';

/**
 * `normalizeRow` input: synthetic line id `-receiving_id`, real `receiving_id`
 * (matches `buildUnmatchedStubRow` in the sidebar).
 */
function buildUnmatchedEmptyReceivingLine(pkg: Record<string, unknown>): Record<string, unknown> {
  const rid = Number(pkg.id);
  // The same line-less placeholder serves both unmatched cartons and finalized
  // local pickup POs (one receiving row per PO, items live in
  // local_pickup_order_items). Honour the real source + label so the history
  // row reads sensibly and the details overlay can branch to the pickup panel.
  const source = String(pkg.receiving_source || 'unmatched');
  const isPickup = source === 'local_pickup';
  // An unfound carton is RECEIVED once it has been unboxed at the dock — for a
  // lineless placeholder the only signal is receiving.unboxed_at (set by the
  // local-receive path in mark-received-po, which is purely local for unfound
  // POs since there is no Zoho PO to reconcile). unboxed → DONE ("RECEIVED"),
  // otherwise ARRIVED ("SCANNED"). See workflow-stages.ts / workflowStatusTableLabel.
  const unboxedAt = pkg.receiving_unboxed_at ?? pkg.unbox_opened_at ?? null;
  return {
    id: -rid,
    receiving_id: rid,
    receiving_tracking_number: pkg.receiving_tracking_number,
    carrier: pkg.carrier,
    receiving_received_at: pkg.receiving_received_at,
    receiving_unboxed_at: unboxedAt,
    receiving_support_notes: pkg.receiving_support_notes ?? null,
    receiving_zoho_notes: pkg.receiving_zoho_notes ?? null,
    receiving_listing_url: pkg.receiving_listing_url ?? null,
    receiving_source: source,
    receiving_source_platform: pkg.receiving_source_platform,
    receiving_zoho_purchaseorder_number: pkg.receiving_zoho_purchaseorder_number,
    shipment_tracking_number: pkg.shipment_tracking_number,
    shipment_carrier: pkg.shipment_carrier,
    shipment_status_category: pkg.shipment_status_category,
    shipment_is_delivered: pkg.shipment_is_delivered,
    shipment_delivered_at: pkg.shipment_delivered_at,
    item_name: isPickup
      ? String(pkg.receiving_tracking_number || 'Local pickup')
      : UNMATCHED_EMPTY_LINE_LABEL,
    sku: null,
    zoho_item_id: null,
    zoho_line_item_id: null,
    zoho_purchase_receive_id: null,
    zoho_purchaseorder_id: null,
    zoho_purchaseorder_number: pkg.receiving_zoho_purchaseorder_number ?? null,
    quantity_received: 0,
    quantity_expected: null,
    qa_status: 'PENDING',
    // Unfound cartons opened on the Unbox surface (unbox_opened_at) or physically
    // unboxed at the dock (unboxed_at) read as DONE ("RECEIVED") locally.
    workflow_status: unboxedAt ? 'DONE' : 'ARRIVED',
    disposition_code: 'HOLD',
    condition_grade: 'BRAND_NEW',
    disposition_audit: [],
    needs_test: true,
    is_priority: !!pkg.is_priority,
    priority_tier: pkg.priority_tier ?? null,
    assigned_tech_id: null,
    zoho_sync_source: null,
    zoho_last_modified_time: null,
    zoho_synced_at: null,
    notes: null,
    zoho_notes: null,
    unit_price: null,
    receiving_type: 'PO',
    created_at: pkg.created_at,
    // Genuine door scan only — the "Scanned" display is triage-owned. The
    // unbox-open time stays in its own first-class field below, never folded into
    // first_scanned_at (which would make "Scanned" react to opening in Unbox).
    first_scanned_at: pkg.first_scanned_at,
    unbox_opened_at: pkg.unbox_opened_at ?? null,
    last_scan_at: pkg.last_scan_at,
    image_url: null,
    photo_count: pkg.photo_count,
    zendesk_ticket: pkg.zendesk_ticket ?? null,
    zoho_reference_number: null,
  };
}

function receivingRowScannedTs(row: {
  scanned_at?: string | null;
  received_at?: string | null;
  created_at?: string | null;
}) {
  const raw = row.scanned_at ?? row.received_at ?? row.created_at ?? null;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

function compareReceivingRowsByScannedAt(
  a: { scanned_at?: string | null; received_at?: string | null; created_at?: string | null; id: number },
  b: { scanned_at?: string | null; received_at?: string | null; created_at?: string | null; id: number },
) {
  const d = receivingRowScannedTs(b) - receivingRowScannedTs(a);
  return d !== 0 ? d : b.id - a.id;
}

/** `view=unbox_opened` placeholder merge — newest Unbox-surface scan first. */
function compareReceivingRowsByUnboxOpenedAt(
  a: { scanned_at?: string | null; received_at?: string | null; created_at?: string | null; id: number },
  b: { scanned_at?: string | null; received_at?: string | null; created_at?: string | null; id: number },
) {
  return compareReceivingRowsByScannedAt(a, b);
}

function receivingRowActivityTs(row: {
  last_activity_at?: string | null;
  created_at?: string | null;
}) {
  const raw = row.last_activity_at ?? row.created_at ?? null;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

function compareReceivingRowsByRecentActivity(
  a: { last_activity_at?: string | null; created_at?: string | null; id: number },
  b: { last_activity_at?: string | null; created_at?: string | null; id: number },
) {
  const d = receivingRowActivityTs(b) - receivingRowActivityTs(a);
  return d !== 0 ? d : b.id - a.id;
}

/**
 * `?sort=unboxed_newest` comparator for the placeholder merge. Most recently
 * unboxed first; never-unboxed rows (ts 0 — incl. unfound placeholders) sort
 * last, tie-broken by recent activity so the un-unboxed tail stays stable.
 */
function receivingRowUnboxedTs(row: { unboxed_at?: string | null }) {
  const raw = row.unboxed_at ?? null;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

function compareReceivingRowsByUnboxedAt(
  a: { unboxed_at?: string | null; scanned_at?: string | null; received_at?: string | null; created_at?: string | null; id: number },
  b: { unboxed_at?: string | null; scanned_at?: string | null; received_at?: string | null; created_at?: string | null; id: number },
) {
  const d = receivingRowUnboxedTs(b) - receivingRowUnboxedTs(a);
  return d !== 0 ? d : compareReceivingRowsByScannedAt(a, b);
}

/**
 * `?sort=unbox_activity` comparator — JS mirror of the SQL
 * `GREATEST(ru.unboxed_at, rl.updated_at)` axis, so the placeholder merge
 * preserves the order. Unfound placeholders carry neither stamp and fall
 * through to scan-based recent activity, which is correct for them (they
 * only exist while physically present and untriaged).
 */
function receivingRowUnboxActivityTs(row: {
  unboxed_at?: string | null;
  updated_at?: string | null;
}) {
  const candidates = [row.unboxed_at, row.updated_at]
    .map((raw) => (raw ? new Date(raw).getTime() : NaN))
    .filter((t) => Number.isFinite(t));
  return candidates.length > 0 ? Math.max(...candidates) : 0;
}

function compareReceivingRowsByUnboxActivity(
  a: { unboxed_at?: string | null; updated_at?: string | null; last_activity_at?: string | null; created_at?: string | null; id: number },
  b: { unboxed_at?: string | null; updated_at?: string | null; last_activity_at?: string | null; created_at?: string | null; id: number },
) {
  const d = receivingRowUnboxActivityTs(b) - receivingRowUnboxActivityTs(a);
  return d !== 0 ? d : compareReceivingRowsByRecentActivity(a, b);
}

// ─── Normalize ────────────────────────────────────────────────────────────────
function enrichIncomingTrackingIntegrity(
  row: Record<string, unknown>,
  warehousePostal: string,
): void {
  const hasTracking = Boolean(String(row.tracking_number || '').trim());
  const lastChecked = row.shipment_last_checked_at as string | null;
  const status = row.shipment_status as string | null;
  const latestEvent = row.shipment_latest_event_at as string | null;
  const carrierAnswered = Boolean(lastChecked || status || latestEvent);
  if (hasTracking) {
    row.tracking_confidence = carrierAnswered ? 'carrier_confirmed' : 'seller_reported';
  } else {
    row.tracking_confidence = null;
  }

  const wrong = Boolean(row.is_delivered)
    && isWrongDestination(
      row.shipment_latest_event_postal as string | null,
      warehousePostal,
    );
  row.wrong_destination = wrong;
  if (wrong && row.delivery_state !== 'RECEIVED') {
    row.delivery_state = 'WRONG_DESTINATION';
  }
}

function normalizeRow(row: Record<string, unknown>) {
  // Tracking identity resolves in priority order:
  //   1. shipping_tracking_numbers (canonical — joined via receiving_carton.shipment_id)
  //   2. receiving_carton.receiving_tracking_number (legacy text on the package)
  //   3. receiving_line.zoho_reference_number (legacy text on the line;
  //      column may be absent post-retirement — guarded below)
  // See inbound-tracking unification plan (2026-04-15 migrations).
  const shipmentTracking    = (row.shipment_tracking_number as string | null) ?? null;
  const receivingTracking   = (row.receiving_tracking_number as string | null) ?? null;
  const zohoReferenceNumber = (row.zoho_reference_number as string | null) ?? null;

  const tracking =
    shipmentTracking ?? receivingTracking ?? zohoReferenceNumber ?? null;
  const trackingSource =
    shipmentTracking ? 'shipment'
    : receivingTracking ? 'receiving'
    : zohoReferenceNumber ? 'zoho_reference'
    : null;

  // Carrier from the canonical shipment row wins; fall back to the legacy
  // receiving_carton.carrier text. 'UNKNOWN' sentinel (from permissive registration)
  // is hidden — surfaces as null so UI renders plainly.
  const shipmentCarrierRaw = (row.shipment_carrier as string | null) ?? null;
  const shipmentCarrier = shipmentCarrierRaw && shipmentCarrierRaw.toUpperCase() !== 'UNKNOWN'
    ? shipmentCarrierRaw
    : null;
  const carrier = shipmentCarrier ?? (row.carrier as string | null) ?? null;

  return {
    id:                       Number(row.id),
    receiving_id:             row.receiving_id != null ? Number(row.receiving_id) : null,
    tracking_number:          tracking,
    tracking_source:          trackingSource,
    zoho_reference_number:    zohoReferenceNumber,
    carrier,
    shipment_status:          (row.shipment_status_category as string | null) ?? null,
    is_delivered:             !!row.shipment_is_delivered,
    delivered_at:             (row.shipment_delivered_at as string | null) ?? null,
    zoho_item_id:             (row.zoho_item_id as string | null) ?? null,
    zoho_line_item_id:        (row.zoho_line_item_id as string | null) ?? null,
    zoho_purchase_receive_id: (row.zoho_purchase_receive_id as string | null) ?? null,
    zoho_purchaseorder_id:    (row.zoho_purchaseorder_id as string | null) ?? null,
    zoho_purchaseorder_number: (row.zoho_purchaseorder_number as string | null) ?? (row.receiving_zoho_purchaseorder_number as string | null) ?? null,
    item_name:                (row.item_name as string | null) ?? null,
    // Canonical Zoho catalog title (sku_catalog.product_title), joined by SKU.
    // Prefer this over item_name for display — item_name is the PO/platform
    // line name (eBay etc.) and varies by source. Null when the SKU isn't in
    // the catalog yet; callers fall back to item_name.
    catalog_product_title:    (row.catalog_product_title as string | null) ?? null,
    zoho_item_title:          (row.zoho_item_title as string | null) ?? null,
    // Canonical sku_catalog.id for this line's SKU (joined). Keys the SKU
    // pairing surface; null when the SKU isn't catalogued yet.
    sku_catalog_id:           row.sku_catalog_id != null ? Number(row.sku_catalog_id) : null,
    sku:                      (row.sku as string | null) ?? null,
    quantity_received:        Number(row.quantity_received ?? 0),
    quantity_expected:        row.quantity_expected != null ? Number(row.quantity_expected) : null,
    qa_status:                (row.qa_status as string) ?? 'PENDING',
    workflow_status:          (row.workflow_status as string | null) ?? null,
    disposition_code:         (row.disposition_code as string) ?? 'HOLD',
    condition_grade:          (row.condition_grade as string) ?? 'USED_A',
    condition_set_at:         (row.condition_set_at as string | null) ?? null,
    label_printed_at:         (row.label_printed_at as string | null) ?? null,
    // Denormalized serial projection (rlt.serial_projection) surfaced by the list
    // builders as `serials` — the FAST DEFAULT for first-frame chip display, so a
    // row-click / deep-link / arrow-nav open paints serials without waiting on the
    // heavy ?include=serials resolution. The authoritative include=serials path
    // OVERWRITES this after normalize (see the includeSerials branches). undefined
    // when the SELECT omits the column (e.g. the PATCH re-fetch or placeholder
    // stubs) so consumers fall back cleanly.
    serials:                  Array.isArray(row.serials)
                              ? (row.serials as Array<{ id: number; serial_number: string; condition_grade: string | null }>)
                              : undefined,
    disposition_audit:        (row.disposition_audit as unknown[]) ?? [],
    needs_test:               !!row.needs_test,
    is_priority:              !!row.is_priority,
    priority_tier:            row.priority_tier != null ? Number(row.priority_tier) : null,
    assigned_tech_id:         row.assigned_tech_id != null ? Number(row.assigned_tech_id) : null,
    zoho_sync_source:         (row.zoho_sync_source as string | null) ?? null,
    zoho_last_modified_time:  (row.zoho_last_modified_time as string | null) ?? null,
    zoho_synced_at:           (row.zoho_synced_at as string | null) ?? null,
    notes:                    (row.notes as string | null) ?? null,
    zoho_notes:               (row.zoho_notes as string | null) ?? null,
    unit_price:               (row.unit_price as string | null) ?? null,
    receiving_support_notes:  (row.receiving_support_notes as string | null) ?? null,
    receiving_zoho_notes:     (row.receiving_zoho_notes as string | null) ?? null,
    receiving_listing_url:    (row.receiving_listing_url as string | null) ?? null,
    // Incoming-view only; null on other views (SELECT omits the columns).
    delivery_state:           (row.delivery_state as string | null) ?? null,
    po_date:                  (row.po_date as string | null) ?? null,
    expected_delivery_date:   (row.expected_delivery_date as string | null) ?? null,
    vendor_name:              (row.vendor_name as string | null) ?? null,
    // Universal Incoming purchase identity (spine cache cols via rl.*, plan §6.3).
    // inbound_source_type badges the row's source ('zoho' | 'ebay' | …);
    // source_order_id is the external order id (the eBay order#) when there's no
    // Zoho PO; platform_account_* name the buyer account it was purchased on.
    inbound_source_type:      (row.inbound_source_type as string | null) ?? null,
    source_order_id:          (row.source_order_id as string | null) ?? null,
    platform_account_id:      row.platform_account_id != null ? Number(row.platform_account_id) : null,
    platform_account_label:   (row.platform_account_label as string | null) ?? null,
    shipment_has_exception:   row.shipment_has_exception == null ? null : !!row.shipment_has_exception,
    shipment_latest_event_at: (row.shipment_latest_event_at as string | null) ?? null,
    shipment_last_checked_at: (row.shipment_last_checked_at as string | null) ?? null,
    shipment_latest_event_city: (row.shipment_latest_event_city as string | null) ?? null,
    shipment_latest_event_postal: (row.shipment_latest_event_postal as string | null) ?? null,
    shipment_is_terminal:     row.shipment_is_terminal == null ? null : !!row.shipment_is_terminal,
    receiving_type:            (row.receiving_type as string | null) ?? 'PO',
    // Per-line unfound intake classification (override grain; null on Zoho lines).
    intake_type:               (row.intake_type as string | null) ?? null,
    // Carton-level default receiving type (receiving.intake_type). The carton
    // pill edits this; receiving_type above overrides per line. Migration 2026-06-13b.
    carton_intake_type:        (row.receiving_intake_type as string | null) ?? null,
    // Door-scan vs unbox split (history columns). received_at/scanned_at are the
    // "arrived at the door" event; unboxed_at is when items were extracted.
    // *_by_name resolve the staff who performed each (null on views that omit
    // the joins / unmatched stubs).
    received_at:              (row.receiving_received_at as string | null) ?? null,
    received_by_name:         (row.received_by_name as string | null) ?? null,
    // Terminal "Received" (DONE) transition time — distinct from the door-scan
    // received_at above. Drives History's "Received" sort axis.
    received_done_at:         (row.received_done_at as string | null) ?? null,
    unboxed_at:               (row.receiving_unboxed_at as string | null) ?? null,
    unboxed_by_name:          (row.unboxed_by_name as string | null) ?? null,
    scanned_at:               (row.first_scanned_at as string | null) ?? null,
    scanned_by_name:          (row.scanned_by_name as string | null) ?? null,
    // First-class "opened for unbox" time (receiving.unbox_opened_at / UNBOX_SCAN_OPENED).
    // The unbox rail reads THIS for its label + sort — same axis as the Overview —
    // instead of inferring it from the overloaded scanned_at. Null on non-unbox views.
    unbox_opened_at:          (row.unbox_opened_at as string | null) ?? null,
    unbox_only_intake:        row.unbox_only_intake === true,
    triage_complete:          row.triage_complete === true,
    triage_completed_at:      (row.triage_completed_at as string | null) ?? null,
    staging_location_id:      row.staging_location_id != null ? Number(row.staging_location_id) : null,
    priority_lane:            (row.priority_lane as string | null) ?? null,
    pairing_state:            (row.pairing_state as string | null) ?? null,
    created_at:               (row.created_at as string | null) ?? null,
    // Last write to the line itself (qty bump, condition, notes, …). Drives
    // the unbox_activity sort's tiebreak in the placeholder merge.
    updated_at:               (row.updated_at as string | null) ?? null,
    // Most-recent activity timestamp matching the server's sort order. For
    // view=testing this leads with tested_at (the verdict time the feed is
    // ordered by); for view=all/activity it's the last scan. Falls through to
    // received_at / created_at so the rail can render a single "last touched"
    // field regardless of view.
    last_activity_at:         (row.viewed_at as string | null)
                              ?? (row.tested_at as string | null)
                              ?? (row.needs_test_at as string | null)
                              ?? (row.last_scan_at as string | null)
                              ?? (row.receiving_received_at as string | null)
                              ?? (row.created_at as string | null)
                              ?? null,
    // Recorded testing verdicts for this line (view=testing only; null elsewhere).
    // Scoped to the tester when the feed is. Drives the rail's "tested k/N".
    tested_count:             row.tested_count != null ? Number(row.tested_count) : null,
    image_url:                (row.image_url as string | null) ?? null,
    source_platform:          (row.receiving_source_platform as string | null) ?? null,
    /** receiving.source — 'zoho_po' | 'unmatched' | 'local_pickup'. Drives which workspace variant mounts. */
    receiving_source:         (row.receiving_source as string | null) ?? null,
    photo_count:              row.photo_count != null ? Number(row.photo_count) : 0,
    zendesk_ticket:           (row.zendesk_ticket as string | null) ?? null,
  };
}
