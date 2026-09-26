import { NextRequest, NextResponse, after } from 'next/server';
import {
  buildUnmatchedEmptyReceivingLine,
  normalizeRow,
} from '@/lib/receiving/lines/normalize-row';
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
import { audit } from '@/lib/auth/audit';
import { sortSerialUnitToParts } from '@/lib/inventory/parts-sort';
import { isTestingApiView } from '@/lib/surface-isolation';
import { recomputeCartonSourceLink } from '@/lib/receiving/carton-source-link';
import { isIncomingUniversal } from '@/lib/feature-flags';
import {
  isReceivingPhysicalStateFirst,
  isSerialProjectionDriftProbe,
  isUnboxRailColumnRead,
} from '@/lib/feature-flags';
import {
  parseReceivingLinesQuery,
  QA_STATUSES,
  DISPOSITIONS,
  type ReceivingLinesQuery,
} from '@/lib/receiving/lines/query';
import {
  buildReceivingLineByIdSql,
  buildReceivingLinesByReceivingIdSql,
  buildReceivingLinesListSql,
  buildScannedCandidateSql,
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
import { ensureLineUnitsSafe, fetchLineUnits } from '@/lib/receiving/ensure-line-units';
import { attachCustomFieldsToRows } from '@/lib/custom-fields/queries';

// `receiving_line_unit` materialises LAZILY, on the two BOUNDED `include=serials` reads below — `?id=` (one line) and `?receiving_id=`…

// `fetchSerialsForLines` + the `LineSerial` shape are the authoritative current-serials-per-line SoT, shared with the projection writer…

// QA/disposition body-validation vocab shared with the GET filter builder now
// lives in src/lib/receiving/lines/query.ts (QA_STATUSES / DISPOSITIONS,
// imported above). CONDITIONS is POST/PATCH-only, so it stays here.
const CONDITIONS   = new Set(['BRAND_NEW', 'LIKE_NEW', 'REFURBISHED', 'USED_A', 'USED_B', 'USED_C', 'PARTS']);

function parsePositiveTechId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

// ─── GET ────────────────────────────────────────────────────────────────────── ?id=<n> → single row ?receiving_id=<n> → all lines for a…
export type ReceivingLinesGetSurface = 'receiving' | 'testing';

export async function handleReceivingLinesGet(
  request: NextRequest,
  ctx: { organizationId: string; staffId?: number | null },
  surface: ReceivingLinesGetSurface = 'receiving',
) {
  try {
    const { searchParams } = new URL(request.url);
    // All ~27 query params parse through the extracted SoT parser — exact coercions/defaults/fallbacks preserved…
    let query = parseReceivingLinesQuery(searchParams);
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
          message: 'Testing endpoint requires view=testing, view=needs-test, or view=testing_opened.',
        },
        { status: 400 },
      );
    }

    // view=viewed only: the requesting operator, whose recently-opened lines
    // (receiving_line_views) this feed returns.
    const viewerStaffId = Number(ctx?.staffId);
    // Phase 2 — physical-vs-financial decoupling.
    const applyScannedZohoExclusion = !isReceivingPhysicalStateFirst() || hideZohoReceived;
    // Layer 1 (rail read-after-write): read view=unbox_opened membership from the
    // committed receiving_unbox.opened_at column only. Flag-gated, default off.
    const unboxRailColumnRead = isUnboxRailColumnRead();

    const orgId = ctx.organizationId as OrgId;

    // Batch serial hydration (Tier A of the immediate-serial-display plan):
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
        await ensureLineUnitsSafe(orgId, [
          {
            lineId: normalized.id,
            expectedQty: normalized.quantity_expected,
            serialIds: (serialsByLine.get(normalized.id) ?? []).map((s) => s.id),
          },
        ]);
        const unitsByLine = await fetchLineUnits([normalized.id], orgId);
        (normalized as Record<string, unknown>).units = unitsByLine.get(normalized.id) ?? [];
      }
      // Mobile `/receiving/lines/:id` historically read `receiving_lines[]`; desktop sidebar uses `receiving_line`.
      const [withCustom] = await attachCustomFieldsToRows(
        orgId,
        'RECEIVING',
        [normalized],
      );
      return NextResponse.json({
        success: true,
        receiving_line: withCustom,
        receiving_lines: [withCustom],
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
        await ensureLineUnitsSafe(
          orgId,
          normalizedRows.map((row) => ({
            lineId: row.id,
            expectedQty: row.quantity_expected,
            serialIds: (serialsByLine.get(row.id) ?? []).map((s) => s.id),
          })),
        );
        const unitsByLine = await fetchLineUnits(
          normalizedRows.map((row) => row.id),
          orgId,
        );
        for (const row of normalizedRows) {
          (row as Record<string, unknown>).units = unitsByLine.get(row.id) ?? [];
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
      const withCustom = await attachCustomFieldsToRows(orgId, 'RECEIVING', normalizedRows);
      return NextResponse.json({
        success: true,
        receiving_lines: withCustom,
        receiving_package,
      });
    }

    // ── `?count_only=1` — the total, without the list ───────────────────────
    const countOnly =
      searchParams.get('count_only') === '1'
      && query.deliveryStateFilter !== 'WRONG_DESTINATION';
    if (countOnly) {
      const countBuilt = buildReceivingLinesListSql({
        query,
        orgId,
        viewerStaffId,
        universalIncoming,
        applyScannedZohoExclusion,
        unboxRailColumnRead,
      });
      const unmatched = shouldIncludeUnmatchedPlaceholders(query)
        ? buildUnmatchedPlaceholdersSql(query, orgId)
        : null;
      const unboxOpened = shouldIncludeUnboxOpenedPlaceholders(query)
        ? buildUnboxOpenedPlaceholdersSql(query, orgId, unboxRailColumnRead)
        : null;
      const [listCntRes, unmatchedCntRes, unboxCntRes] = await withTenantConnection(
        orgId,
        (client) => Promise.all([
          client.query(countBuilt.count.sql, countBuilt.count.params),
          unmatched
            ? client.query(unmatched.count.sql, unmatched.count.params)
            : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
          unboxOpened
            ? client.query(unboxOpened.count.sql, unboxOpened.count.params)
            : Promise.resolve({ rows: [] as Record<string, unknown>[] }),
        ]),
      );
      const countOnlyTotal =
        Number(listCntRes.rows[0]?.total ?? 0)
        + Number(unmatchedCntRes.rows[0]?.n ?? 0)
        + Number(unboxCntRes.rows[0]?.n ?? 0);
      return NextResponse.json({
        success: true,
        receiving_lines: [],
        total: countOnlyTotal,
        limit,
        offset,
      });
    }

    // Pre-limit the Unbox recents rail before the display laterals run.
    query = await maybePreLimitUnboxOpened(query, orgId, offset);

    // Gate-before-decorate for `view=scanned` (the /triage rail's cold-load shape):
    const scannedLineIdIn = await maybePreLimitScannedLineIds(
      query,
      orgId,
      offset,
      applyScannedZohoExclusion,
      unboxRailColumnRead,
    );

    // Paginated list — all lines, optionally filtered.
    const built = buildReceivingLinesListSql({
      query,
      orgId,
      viewerStaffId,
      universalIncoming,
      applyScannedZohoExclusion,
      unboxRailColumnRead,
      ...(scannedLineIdIn ? { scannedLineIdIn } : {}),
    });
    const [rowsRes, countRes] = await withTenantConnection(orgId, (client) => Promise.all([
      client.query(built.list.sql, built.list.params),
      client.query(built.count.sql, built.count.params),
    ]));

    let normalizedList = rowsRes.rows.map(normalizeRow);
    let total = Number(countRes.rows[0]?.total ?? 0);
    if (includeSerials) {
      const serialsByLine = await fetchSerialsForLines(normalizedList.map((r) => r.id), orgId);
      // Free drift probe:
      if (isSerialProjectionDriftProbe()) {
        for (const row of normalizedList) {
          const projected = Array.isArray(row.serials)
            ? row.serials.map((s) => s.serial_number).sort()
            : null;
          // `undefined` means the SELECT omitted the column, which is not drift.
          if (projected == null) continue;
          const authoritative = (serialsByLine.get(row.id) ?? [])
            .map((s) => s.serial_number)
            .sort();
          if (JSON.stringify(projected) !== JSON.stringify(authoritative)) {
            console.warn('[serial-projection-drift]', {
              orgId,
              view,
              lineId: row.id,
              projected,
              authoritative,
            });
          }
        }
      }
      for (const row of normalizedList) {
        (row as Record<string, unknown>).serials = serialsByLine.get(row.id) ?? [];
      }
    }

    // Unmatched/unfound cartons live in the `receiving_carton` table with no `receiving_line` row yet, so they never come back from the main…
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
      // Respect the requested sort axis after the placeholder merge — re-sorting everything by scan-based last_activity_at here let a mere door…
      normalizedList = [...normalizedList, ...placeholderNorm].sort((a, b) =>
        historySort === 'unboxed_newest'
          ? compareReceivingRowsByUnboxedAt(a, b)
          : historySort === 'unbox_activity'
            ? compareReceivingRowsByUnboxActivity(a, b)
            : compareReceivingRowsByScannedAt(a, b),
      );
      const windowed = normalizedList.slice(offset, offset + limit);
      // Lineless unfound placeholders without an open/unbox stamp sort last on
      // unboxed_newest and were silently dropped when the main query already
      // filled the page window.
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

    const receiving_lines = await attachCustomFieldsToRows(
      orgId,
      'RECEIVING',
      normalizedList,
    );
    return NextResponse.json({
      success: true,
      receiving_lines,
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
    // Label face at birth.
    const labelNote      = String(body?.label_note ?? body?.notes ?? '').trim() || null;

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
    const lineId = await withTenantTransaction(orgId, async (client) => {
      const ins = await client.query<{ id: number }>(
        `INSERT INTO receiving_line (
          receiving_id, item_name, sku,
          quantity_received, quantity_expected,
          notes, label_note, organization_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING id`,
        [
          receivingId, itemName, sku,
          quantityReceived, quantityExpected,
          notes, labelNote, orgId,
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

// ─── PATCH ──────────────────────────────────────────────────────────────────── Permission:
export const PATCH = withAuth(async (request: NextRequest, ctx) => {
  try {
    const orgId = ctx.organizationId as OrgId;
    const body = await request.json();
    const id   = Number(body?.id);

    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ success: false, error: 'Valid id is required' }, { status: 400 });
    }

    const bodyKeys = Object.keys(body as Record<string, unknown>);
    const assignOnly =
      bodyKeys.every((k) => k === 'id' || k === 'assigned_tech_id' || k === 'assignedTechId') &&
      (body?.assigned_tech_id !== undefined || body?.assignedTechId !== undefined);
    const canMarkReceived = ctx.permissions.has('receiving.mark_received');
    const canQcAssign = ctx.permissions.has('tech.qc_pass');
    if (assignOnly ? !(canMarkReceived || canQcAssign) : !canMarkReceived) {
      const needed = assignOnly
        ? 'receiving.mark_received|tech.qc_pass'
        : 'receiving.mark_received';
      await audit({
        staffId: ctx.staffId,
        event: 'permission.denied',
        result: 'denied',
        sid: ctx.session?.sid ?? null,
        ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
        userAgent: request.headers.get('user-agent'),
        detail: { permission: needed, api: true, path: request.nextUrl.pathname },
      });
      return NextResponse.json(
        { error: 'FORBIDDEN', permission: needed, role: ctx.role },
        { status: 403 },
      );
    }

    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    // zoho_reference_number dropped in 2026-04-15_drop_zoho_reference_number.sql.
    const textFields: Array<[string, string | null]> = [
      ['item_name',                 String(body?.item_name ?? '').trim() || null],
      ['sku',                       String(body?.sku ?? '').trim() || null],
      ['notes',                     String(body?.notes ?? '').trim() || null],
      // Printed label face center. Independent of `notes` since 2026-07-31 —
      // the notes composer writes `notes`, the label editor writes `label_note`.
      ['label_note',                String(body?.label_note ?? '').trim() || null],
      ['receiving_type',            String(body?.receiving_type ?? '').trim() || null],
      ['zendesk_ticket',            String(body?.zendesk_ticket ?? '').trim() || null],
    ];
    for (const [col, val] of textFields) {
      if (body[col] !== undefined) {
        updates.push(`${col} = $${idx++}`);
        values.push(val);
      }
    }

    // Face-write clock (`face_noted_at`) — the ONE column that says when this line's sticker text last changed, and what Unbox notes-composer…
    const faceCols = (['notes', 'label_note'] as const).filter(
      (col) => body[col] !== undefined,
    );
    if (faceCols.length > 0) {
      const changed = faceCols.map((col) => {
        values.push(String(body[col] ?? '').trim() || null);
        return `${col} IS DISTINCT FROM $${idx++}`;
      });
      updates.push(
        `face_noted_at = CASE WHEN ${changed.join(' OR ')} THEN now() ELSE face_noted_at END`,
      );
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
        // Testing facts live on receiving_line_testing (rlt) now — the guard reads the current assignment there (spine copies are write-dead).
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

    // Run the column writes only when there are real ones.
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
        // Operator edited the condition grade — a genuine acknowledgement that the unit was physically opened.
        if (testingPatch.conditionGrade !== undefined) {
          await acknowledgeUnbox(client, orgId, row.receiving_id, ctx.staffId ?? null);
        }
        if (hasZohoPatch) {
          await upsertReceivingLineZoho(orgId, id, zohoPatch, txDeps);
          // The spine kept zoho_purchaseorder_number_norm as a GENERATED column; rz stores it plainly (2026-07-11_receiving_line_zoho_number_norm),…
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

    // Re-fetch with the shipment JOIN so the response carries the just-attached shipment's tracking/carrier/status fields.
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
}); // permission enforced in-handler (mark_received, or tech.qc_pass for assign-only)

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
      // Guard: this path only clears the delivered-unscanned surface.
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
        // Hard delete. shipment_tracking_events + fba_tracking_item_allocations cascade; every other reference is ON DELETE SET NULL EXCEPT…
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
      // PO identity lives on receiving_line_zoho (rz) — the spine zoho_purchaseorder_id is write-dead and drops next migration, so the PO-wide…
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

    // Bulk: `?ids=1,2,3` deletes the batch in ONE statement.
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
      // Delete + carton-source-link recompute on one tenant connection so the org GUC stays set for the recompute (which reads/writes org-owned…
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
      // Re-derive the carton's source linkage — if this was the last line carrying a source order, the carton reverts to unmatched (the unlink…
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
/** Rank the Unbox recents page on the ordering column alone, then hand the list builder that carton set as `receivingIdIn`… */
/** Gate-before-decorate for `view=scanned&sort=priority` — the /triage rail's cold-load shape. */
async function maybePreLimitScannedLineIds(
  query: ReceivingLinesQuery,
  orgId: OrgId,
  offset: number,
  applyScannedZohoExclusion: boolean,
  unboxRailColumnRead: boolean,
): Promise<readonly number[] | null> {
  if (query.view !== 'scanned') return null;
  if (!query.wantsPrioritySort) return null;
  if (!Number.isFinite(offset) || offset > 0) return null;
  if (query.receivingIdIn.length > 0) return null;
  if (Number.isFinite(query.receivingId) && query.receivingId > 0) return null;
  if (query.trackingIn.length > 0) return null;
  if (query.search) return null;
  if (query.staffFilterRaw) return null;
  if (query.priorityOnly) return null;
  if (query.qaFilter || query.dispFilter || query.workflowFilter) return null;
  if (query.deliveryStateFilter) return null;
  if (query.poFrom || query.poTo) return null;
  if (query.weekStart || query.weekEnd) return null;
  if (query.unboxQueueStage || query.unboxQueueLane) return null;

  const limit =
    Number.isFinite(query.limit) && query.limit > 0 ? Math.min(query.limit, 200) : 50;
  try {
    const built = buildScannedCandidateSql({
      orgId,
      limit,
      applyScannedZohoExclusion,
      unboxRailColumnRead,
    });
    const res = await tenantQuery<{ id: number }>(orgId, built.sql, built.params);
    const ids = res.rows
      .map((r) => Number(r.id))
      .filter((n) => Number.isFinite(n) && n > 0);
    // No candidates → leave the query alone; an absent pre-limit is the
    // "run unrestricted" signal, not "match nothing".
    return ids.length > 0 ? ids : null;
  } catch (error) {
    console.error('maybePreLimitScannedLineIds failed; running unrestricted', error);
    return null;
  }
}

async function maybePreLimitUnboxOpened(
  query: ReceivingLinesQuery,
  orgId: OrgId,
  offset: number,
): Promise<ReceivingLinesQuery> {
  if (query.view !== 'unbox_opened') return query;
  if (query.receivingIdIn.length > 0) return query;
  if (Number.isFinite(query.receivingId) && query.receivingId > 0) return query;
  if (query.search) return query;
  if (query.staffFilterRaw) return query;
  if (query.priorityOnly) return query;
  if (!Number.isFinite(offset) || offset > 0) return query;

  const limit = Number.isFinite(query.limit) && query.limit > 0 ? query.limit : 50;
  try {
    const ranked = await tenantQuery<{ receiving_id: number }>(
      orgId,
      `SELECT ru.receiving_id
         FROM receiving_unbox ru
        WHERE ru.organization_id = $1
          AND ru.opened_at IS NOT NULL
        ORDER BY ru.opened_at DESC
        LIMIT $2`,
      [orgId, limit],
    );
    const ids = ranked.rows
      .map((r) => Number(r.receiving_id))
      .filter((n) => Number.isFinite(n) && n > 0);
    // No rows ranked → leave the query alone; an empty `receivingIdIn` is the
    // "no pre-limit" signal, not "match nothing".
    return ids.length > 0 ? { ...query, receivingIdIn: ids } : query;
  } catch (error) {
    console.error('maybePreLimitUnboxOpened failed; running unrestricted', error);
    return query;
  }
}


/**
 * `normalizeRow` input: synthetic line id `-receiving_id`, real `receiving_id`
 * (matches `buildUnmatchedStubRow` in the sidebar).
 */

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

/** `view=unbox_opened` placeholder merge — newest Unbox-surface scan first (ops MRU). */
function receivingRowUnboxOpenedTs(row: { unbox_opened_at?: string | null }) {
  const raw = row.unbox_opened_at ?? null;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

function compareReceivingRowsByUnboxOpenedAt(
  a: { unbox_opened_at?: string | null; id: number },
  b: { unbox_opened_at?: string | null; id: number },
) {
  const d = receivingRowUnboxOpenedTs(b) - receivingRowUnboxOpenedTs(a);
  return d !== 0 ? d : b.id - a.id;
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

/** `?sort=unboxed_newest` comparator for the placeholder merge. */
function receivingRowUnboxedTs(row: {
  unbox_opened_at?: string | null;
  unboxed_at?: string | null;
}) {
  const raw = row.unbox_opened_at ?? row.unboxed_at ?? null;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

function compareReceivingRowsByUnboxedAt(
  a: {
    unbox_opened_at?: string | null;
    unboxed_at?: string | null;
    scanned_at?: string | null;
    received_at?: string | null;
    created_at?: string | null;
    id: number;
  },
  b: {
    unbox_opened_at?: string | null;
    unboxed_at?: string | null;
    scanned_at?: string | null;
    received_at?: string | null;
    created_at?: string | null;
    id: number;
  },
) {
  const d = receivingRowUnboxedTs(b) - receivingRowUnboxedTs(a);
  return d !== 0 ? d : compareReceivingRowsByScannedAt(a, b);
}

/** `?sort=unbox_activity` comparator — JS mirror of the SQL `GREATEST(ru.unboxed_at, rl.updated_at)` axis, so the placeholder merge… */
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

