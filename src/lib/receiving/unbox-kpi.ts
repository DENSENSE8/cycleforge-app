/**
 * Domain loader for GET /api/receiving/unbox-kpi — fetches the Unbox mode's
 * receiving-line window (same SQL SoT as the table) and builds Band 2 canvas
 * cards via {@link buildUnboxKpiCards}.
 */

import type { OrgId } from '@/lib/tenancy/constants';
import { withTenantConnection } from '@/lib/tenancy/db';
import { isIncomingUniversal, isUnboxRailColumnRead } from '@/lib/feature-flags';
import { buildReceivingLinesListSql } from '@/lib/receiving/lines/build-sql';
import { parseReceivingLinesQuery } from '@/lib/receiving/lines/query';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import type { UnboxWorkspaceTab } from '@/utils/unbox-workspace-state';
import {
  buildUnboxKpiCards,
  parseUnboxKpiRange,
  type UnboxKpiGranularity,
  type UnboxKpiMetricCard,
  type UnboxKpiRange,
} from '@/lib/receiving/unbox-metrics';

/** Cap for KPI aggregation — higher than the table page so series are honest. */
const UNBOX_KPI_ROW_LIMIT = 2_000;

type UnboxKpiMode = UnboxWorkspaceTab;

interface LoadUnboxKpiResult {
  success: true;
  metrics: UnboxKpiMetricCard[];
  range: UnboxKpiRange;
  granularity: UnboxKpiGranularity;
  mode: UnboxKpiMode;
  source_rows: number;
  total: number;
}

function parseMode(raw: string | null): UnboxKpiMode {
  if (raw === 'queue' || raw === 'recent' || raw === 'history') return raw;
  return 'queue';
}

function modeToView(mode: UnboxKpiMode): string {
  if (mode === 'queue') return 'scanned';
  if (mode === 'recent') return 'viewed';
  return 'activity';
}

function mapKpiRow(raw: Record<string, unknown>): ReceivingLineRow {
  return {
    id: Number(raw.id) || 0,
    receiving_id: raw.receiving_id != null ? Number(raw.receiving_id) : null,
    tracking_number: (raw.tracking_number as string | null) ?? null,
    carrier: (raw.carrier as string | null) ?? null,
    zoho_item_id: (raw.zoho_item_id as string | null) ?? null,
    zoho_line_item_id: (raw.zoho_line_item_id as string | null) ?? null,
    zoho_purchase_receive_id: (raw.zoho_purchase_receive_id as string | null) ?? null,
    zoho_purchaseorder_id: (raw.zoho_purchaseorder_id as string | null) ?? null,
    zoho_purchaseorder_number: (raw.zoho_purchaseorder_number as string | null) ?? null,
    item_name: (raw.item_name as string | null) ?? null,
    sku: (raw.sku as string | null) ?? null,
    quantity: Number(raw.quantity) || 0,
    qty_received: Number(raw.qty_received ?? raw.quantity_received) || 0,
    condition: (raw.condition as string | null) ?? null,
    workflow_status: (raw.workflow_status as string | null) ?? null,
    qa_status: (raw.qa_status as string | null) ?? null,
    created_at: String(raw.created_at ?? ''),
    updated_at: String(raw.updated_at ?? raw.created_at ?? ''),
    scanned_at: (raw.scanned_at as string | null) ?? null,
    received_at: (raw.received_at as string | null) ?? (raw.door_received_at as string | null) ?? null,
    unboxed_at: (raw.unboxed_at as string | null) ?? null,
    unbox_opened_at: (raw.unbox_opened_at as string | null) ?? null,
    last_activity_at: (raw.last_activity_at as string | null) ?? null,
    is_priority: raw.is_priority === true || raw.is_priority === 't' || raw.is_priority === 1,
    priority_tier: raw.priority_tier != null ? Number(raw.priority_tier) : null,
    priority_lane: (raw.priority_lane as string | null) ?? null,
    viewed_at: (raw.viewed_at as string | null) ?? null,
  } as unknown as ReceivingLineRow;
}

/**
 * Load Unbox Band 2 KPI canvas payload for one org + mode + range + facets.
 */
export async function loadUnboxKpi(args: {
  orgId: OrgId;
  mode: string | null;
  urange: string | null;
  ustage: string | null;
  ulane: string | null;
  staff: string | null;
  /** Required for `view=viewed` (Recent tab). */
  viewerStaffId: number | null;
}): Promise<LoadUnboxKpiResult> {
  const mode = parseMode(args.mode);
  const range = parseUnboxKpiRange(args.urange);
  const view = modeToView(mode);

  const params = new URLSearchParams({
    limit: String(UNBOX_KPI_ROW_LIMIT),
    offset: '0',
    view,
    phase: 'spine',
  });
  if (mode === 'queue') {
    params.set('sort', 'priority');
    if (args.ustage) params.set('ustage', args.ustage);
    if (args.ulane) params.set('ulane', args.ulane);
  }
  if (args.staff) params.set('staff', args.staff);

  const query = parseReceivingLinesQuery(params);
  const orgId = args.orgId;
  const universalIncoming = view === 'incoming' ? await isIncomingUniversal(orgId) : false;
  const unboxRailColumnRead = isUnboxRailColumnRead();
  // Scanned Zoho exclusion mirrors the receiving-lines list path default.
  const applyScannedZohoExclusion = true;

  const built = buildReceivingLinesListSql({
    query,
    orgId,
    viewerStaffId: args.viewerStaffId ?? 0,
    universalIncoming,
    applyScannedZohoExclusion,
    unboxRailColumnRead,
  });

  const [rowsRes, countRes] = await withTenantConnection(orgId, (client) =>
    Promise.all([
      client.query(built.list.sql, built.list.params),
      client.query(built.count.sql, built.count.params),
    ]),
  );

  const rows = (rowsRes.rows as Record<string, unknown>[]).map(mapKpiRow);
  const total = Number(countRes.rows[0]?.total ?? rows.length);
  const builtCards = buildUnboxKpiCards({
    mode,
    rows,
    range,
    serverTotal: total,
  });

  return {
    success: true,
    metrics: builtCards.metrics,
    range: builtCards.range,
    granularity: builtCards.granularity,
    mode,
    source_rows: rows.length,
    total,
  };
}
