/**
 * Recents adapters — surfaces whose "recently opened" list already lives in a
 * server feed. Each adapter calls the SAME domain read the feed's own route
 * uses (never an HTTP self-fetch) and normalises its rows to `NavRecentRow`,
 * so the sidebar's recents and the station rail cannot disagree.
 */

import type { NavRecentRow } from '@/lib/nav/context/schema';
import type { OrgId } from '@/lib/tenancy/constants';
import { tenantQuery } from '@/lib/tenancy/db';
import { parseReceivingLinesQuery } from '@/lib/receiving/lines/query';
import { fetchReceivingLinesPage, resolveReceivingLinesReadFlags } from '@/lib/receiving/lines/list-page';
import type { NormalizedReceivingLine } from '@/lib/receiving/lines/normalize-row';
import { openInUnboxHref } from '@/lib/receiving/surface-path';
import { fetchTechLogRows, type TechLogRow } from '@/lib/tech/tech-logs-query';
import { fetchPackerLogRows } from '@/lib/neon/packer-logs-week';
import { listRecentLabelPrints, type RecentLabelPrintRow } from '@/lib/labels/recent-prints';
import { listLocalPickupLines, type LocalPickupLineRow } from '@/lib/local-pickup/pickup-lines-query';
import { shippingOrdersHref } from '@/lib/shipping/orders-desk';
import { recordHref } from '@/lib/identify/record-href';
import { isUiEntityType, toDbEntityType } from '@/lib/search/search-hit';

export type NavRecentAdapterId =
  | 'receiving.viewed'
  | 'receiving.unbox_opened'
  | 'receiving.scanned'
  | 'testing.opened'
  | 'tech.scans'
  | 'packer.packs'
  | 'labels.prints'
  | 'pickup.orders'
  | 'identify.opened';

export interface NavRecentAdapterArgs {
  orgId: OrgId;
  staffId: number;
  limit: number;
}

/** ISO instant, or null when the value is missing / unparseable (the row is then dropped). */
function isoOrNull(value: unknown): string | null {
  if (value == null || value === '') return null;
  const t = new Date(value as string | Date).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

function joinParts(parts: ReadonlyArray<string | null | undefined>): string | null {
  const text = parts.map((p) => (p == null ? '' : String(p).trim())).filter(Boolean).join(' · ');
  return text || null;
}

// ── receiving lines (receiving.* / testing.opened) ───────────────────────────

type ReceivingRecentSurface = 'receiving.viewed' | 'receiving.unbox_opened' | 'receiving.scanned' | 'testing.opened';

/** The receiving-lines `view` each surface reads, and the row timestamp its rail sorts by. */
const RECEIVING_SURFACE_VIEW: Record<
  ReceivingRecentSurface,
  { view: string; at: 'last_activity_at' | 'unbox_opened_at' | 'scanned_at' | 'testing_opened_at' }
> = {
  'receiving.viewed': { view: 'viewed', at: 'last_activity_at' },
  'receiving.unbox_opened': { view: 'unbox_opened', at: 'unbox_opened_at' },
  'receiving.scanned': { view: 'scanned', at: 'scanned_at' },
  'testing.opened': { view: 'testing_opened', at: 'testing_opened_at' },
};

type ReceivingRecentFields = Pick<
  NormalizedReceivingLine,
  | 'id'
  | 'receiving_id'
  | 'tracking_number'
  | 'zoho_purchaseorder_number'
  | 'item_name'
  | 'catalog_product_title'
  | 'zoho_item_title'
  | 'sku'
  | 'workflow_status'
  | 'last_activity_at'
  | 'unbox_opened_at'
  | 'scanned_at'
  | 'testing_opened_at'
  | 'created_at'
>;

/**
 * A receiving-lines row as a recent. A negative id is a lineless carton
 * placeholder (`-receiving_id`): it is the carton, not a line. Arrival opens
 * on /triage, Unbox surfaces on /unbox, QC on the standalone line page (the
 * testing station has no per-line URL).
 */
export function receivingLineRecentRow(
  row: ReceivingRecentFields,
  surface: ReceivingRecentSurface,
): NavRecentRow | null {
  const axis = RECEIVING_SURFACE_VIEW[surface].at;
  const at = isoOrNull(row[axis]) ?? isoOrNull(row.last_activity_at) ?? isoOrNull(row.created_at);
  if (!at) return null;
  const lineless = row.id < 0;
  const receivingId = row.receiving_id;
  if (lineless && receivingId == null) return null;
  const entityType = lineless ? 'receiving' : 'receiving_line';
  const entityId = String(lineless ? receivingId : row.id);

  let href: string;
  if (surface === 'testing.opened' || receivingId == null) {
    href = lineless ? `/triage?recvId=${receivingId}` : `/receiving/lines/${row.id}`;
  } else if (surface === 'receiving.scanned') {
    const params = new URLSearchParams({ recvId: String(receivingId) });
    if (!lineless) params.set('lineId', String(row.id));
    href = `/triage?${params}`;
  } else {
    href = openInUnboxHref(receivingId, lineless ? undefined : row.id);
  }

  return {
    id: `${entityType}:${entityId}`,
    entityType,
    entityId,
    title:
      row.catalog_product_title
      ?? row.zoho_item_title
      ?? row.item_name
      ?? row.sku
      ?? (lineless ? `Carton ${receivingId}` : `Line ${row.id}`),
    subtitle: joinParts([row.zoho_purchaseorder_number, row.tracking_number]),
    status: row.workflow_status ?? null,
    at,
    href,
  };
}

// ── Picker scans (tech.scans) ────────────────────────────────────────────────

type TechRecentFields = Pick<
  TechLogRow,
  'id' | 'created_at' | 'source_kind' | 'fnsku' | 'shipping_tracking_number' | 'order_db_id' | 'order_id' | 'product_title'
>;

/** One bench scan as a recent: the order it matched, else the FNSKU, else the raw tracking. */
export function techLogRecentRow(row: TechRecentFields): NavRecentRow | null {
  const at = isoOrNull(row.created_at);
  if (!at) return null;
  const orderId = Number(row.order_db_id);
  const hasOrder = Number.isFinite(orderId) && orderId > 0;
  const fnsku = row.fnsku?.trim() || null;
  const tracking = row.shipping_tracking_number?.trim() || null;
  const entityType = hasOrder ? 'order' : fnsku ? 'fnsku' : 'tech_scan';
  const entityId = hasOrder ? String(orderId) : fnsku ?? String(row.id);
  const href = hasOrder
    ? shippingOrdersHref({ openOrderId: orderId })
    : fnsku
      ? `/shipping/fba?${new URLSearchParams({ q: fnsku })}`
      : `/test?${new URLSearchParams({ ship: 'history', ...(tracking ? { search: tracking } : {}) })}`;
  return {
    id: `tech_scan:${row.id}`,
    entityType,
    entityId,
    title: row.product_title ?? (row.order_id ? `Order ${row.order_id}` : tracking ?? fnsku ?? `Scan ${row.id}`),
    subtitle: joinParts([row.order_id ? `#${row.order_id}` : null, tracking]),
    status: row.source_kind ?? null,
    at,
    href,
  };
}

// ── Packs (packer.packs) ─────────────────────────────────────────────────────

export interface PackerRecentFields {
  id: number | string;
  packer_log_id: number | string | null;
  created_at: string | Date | null;
  order_row_id: number | string | null;
  order_id: string | null;
  product_title: string | null;
  shipping_tracking_number: string | null;
  tracking_type: string | null;
}

/** One pack as a recent — opens the pack on Packing Review. */
export function packerLogRecentRow(row: PackerRecentFields): NavRecentRow | null {
  const at = isoOrNull(row.created_at);
  if (!at) return null;
  const logId = Number(row.packer_log_id);
  const orderRowId = Number(row.order_row_id);
  const hasLog = Number.isFinite(logId) && logId > 0;
  const hasOrder = Number.isFinite(orderRowId) && orderRowId > 0;
  let href: string;
  if (hasLog) {
    const params = new URLSearchParams({ packerLogId: String(logId) });
    if (hasOrder) params.set('orderId', String(orderRowId));
    href = `/review?${params}`;
  } else {
    href = hasOrder ? shippingOrdersHref({ openOrderId: orderRowId }) : '/pack?packview=history';
  }
  return {
    id: `pack:${row.id}`,
    entityType: hasLog ? 'packer_log' : hasOrder ? 'order' : 'pack_scan',
    entityId: String(hasLog ? logId : hasOrder ? orderRowId : row.id),
    title: row.product_title ?? (row.order_id ? `Order ${row.order_id}` : row.shipping_tracking_number ?? `Pack ${row.id}`),
    subtitle: joinParts([row.order_id ? `#${row.order_id}` : null, row.shipping_tracking_number]),
    status: row.tracking_type ?? null,
    at,
    href,
  };
}

// ── Printed labels (labels.prints) ───────────────────────────────────────────

/** One print as a recent — opens the Recent pane on the unit's lookup key (the rail's own key rule). */
export function labelPrintRecentRow(row: RecentLabelPrintRow): NavRecentRow | null {
  const at = isoOrNull(row.printed_at);
  if (!at) return null;
  const key = row.serial_unit_id != null ? String(row.serial_unit_id) : row.serial_number || row.unit_id || '';
  const href = key
    ? `/products?${new URLSearchParams({ view: 'labels', labelsView: 'recent', historyId: key })}`
    : row.sku_catalog_id != null
      ? recordHref({ kind: 'sku', entityId: row.sku_catalog_id })
      : '/products?view=labels';
  return {
    id: `label_print:${row.id}`,
    entityType: row.serial_unit_id != null ? 'unit' : row.sku_catalog_id != null ? 'sku' : 'label_print',
    entityId: String(row.serial_unit_id ?? row.sku_catalog_id ?? row.id),
    title: row.product_title ?? row.sku ?? row.serial_number ?? 'Label',
    subtitle: joinParts([row.sku, row.serial_number]),
    status: row.current_status ?? null,
    at,
    href,
  };
}

// ── Local pickup (pickup.orders) ─────────────────────────────────────────────

/** The pickup rail's grouping: one row per LCPU order, in the feed's order (newest pickup first). */
export function pickupOrderRecentRows(lines: readonly LocalPickupLineRow[], limit: number): NavRecentRow[] {
  const byOrder = new Map<number, { first: LocalPickupLineRow; items: number }>();
  for (const line of lines) {
    const entry = byOrder.get(line.order_id);
    if (entry) entry.items += 1;
    else byOrder.set(line.order_id, { first: line, items: 1 });
  }
  const rows: NavRecentRow[] = [];
  for (const [orderId, { first, items }] of byOrder) {
    if (rows.length >= limit) break;
    const at = isoOrNull(first.pickup_date) ?? isoOrNull(first.order_created_at);
    if (!at) continue;
    rows.push({
      id: `local_pickup_order:${orderId}`,
      entityType: 'local_pickup_order',
      entityId: String(orderId),
      title: first.customer_name?.trim() || first.po_number || `Pickup ${orderId}`,
      subtitle: joinParts([first.po_number, `${items} item${items === 1 ? '' : 's'}`]),
      status: first.order_status ?? null,
      at,
      href: `/pickup?lcpu=${orderId}`,
    });
  }
  return rows;
}

// ── Identified / opened from search (identify.opened) ────────────────────────

export interface IdentifiedEntityRow {
  entity_type: string;
  entity_id: string | number;
  title: string | null;
  subtitle: string | null;
  query: string;
  opened_at: string | Date;
}

/** One record the staffer opened from ⌘K / search / identify; the query that found it is the fallback title. */
export function identifiedRecentRow(row: IdentifiedEntityRow): NavRecentRow | null {
  const at = isoOrNull(row.opened_at);
  if (!at || !isUiEntityType(row.entity_type)) return null;
  const entityId = String(row.entity_id);
  return {
    id: `${row.entity_type}:${entityId}`,
    entityType: row.entity_type,
    entityId,
    title: row.title ?? row.query,
    subtitle: row.subtitle ?? (row.title ? `Found by “${row.query}”` : null),
    status: null,
    at,
    href: recordHref({ kind: row.entity_type, entityId }),
  };
}

const UI_TO_DB_VALUES_SQL = (['order', 'unit', 'receiving', 'sku', 'repair', 'fba', 'warranty', 'ticket', 'location'] as const)
  .map((ui) => `('${ui}', '${toDbEntityType(ui)}')`)
  .join(', ');

/**
 * Newest opened record per entity for one staffer. Plain text/int/uuid
 * equalities only (leakproof under RLS); served by
 * idx_search_query_log_staff_opened (2026-09-26_nav_recents_search_log_opened_index.sql).
 */
export const IDENTIFIED_RECENTS_SQL = `
  WITH opened AS (
    SELECT DISTINCT ON (l.opened_entity_type, l.opened_entity_id)
           l.opened_entity_type, l.opened_entity_id, l.query, l.opened_at
      FROM search_query_log l
     WHERE l.organization_id = $1
       AND l.staff_id = $2
       AND l.opened_at IS NOT NULL
       AND l.opened_entity_id IS NOT NULL
     ORDER BY l.opened_entity_type, l.opened_entity_id, l.opened_at DESC
  )
  SELECT o.opened_entity_type AS entity_type,
         o.opened_entity_id::text AS entity_id,
         esd.title,
         esd.subtitle,
         o.query,
         o.opened_at
    FROM opened o
    LEFT JOIN (VALUES ${UI_TO_DB_VALUES_SQL}) AS kind(ui, db) ON kind.ui = o.opened_entity_type
    LEFT JOIN entity_search_docs esd
      ON esd.organization_id = $1
     AND esd.entity_type = kind.db
     AND esd.entity_id = o.opened_entity_id
   ORDER BY o.opened_at DESC
   LIMIT $3
`;

// ── wiring ───────────────────────────────────────────────────────────────────

export interface NavRecentAdapterDeps {
  fetchReceivingLinesPage: typeof fetchReceivingLinesPage;
  fetchTechLogRows: typeof fetchTechLogRows;
  fetchPackerLogRows: (opts: { organizationId: OrgId; packerId: number; limit: number }) => Promise<{ rows: PackerRecentFields[] }>;
  listRecentLabelPrints: typeof listRecentLabelPrints;
  listLocalPickupLines: typeof listLocalPickupLines;
  readIdentified: (orgId: OrgId, staffId: number, limit: number) => Promise<IdentifiedEntityRow[]>;
}

export const defaultNavRecentAdapterDeps: NavRecentAdapterDeps = {
  fetchReceivingLinesPage,
  fetchTechLogRows,
  fetchPackerLogRows,
  listRecentLabelPrints,
  listLocalPickupLines,
  readIdentified: async (orgId, staffId, limit) =>
    (await tenantQuery<IdentifiedEntityRow & Record<string, unknown>>(orgId, IDENTIFIED_RECENTS_SQL, [orgId, staffId, limit])).rows,
};

/** Pickup rail read size (`PickupSidebarRail` asks for 500 lines, then groups). */
const PICKUP_RAIL_LINES = 500;

function keepRows(rows: ReadonlyArray<NavRecentRow | null>, limit: number): NavRecentRow[] {
  return rows.filter((r): r is NavRecentRow => r !== null).slice(0, limit);
}

async function receivingAdapter(
  surface: ReceivingRecentSurface,
  { orgId, staffId, limit }: NavRecentAdapterArgs,
  deps: NavRecentAdapterDeps,
): Promise<NavRecentRow[]> {
  const query = parseReceivingLinesQuery(
    new URLSearchParams({ view: RECEIVING_SURFACE_VIEW[surface].view, limit: String(limit) }),
  );
  const page = await deps.fetchReceivingLinesPage({
    query,
    orgId,
    viewerStaffId: staffId,
    universalIncoming: false,
    ...resolveReceivingLinesReadFlags(query),
  });
  return keepRows(page.rows.map((row) => receivingLineRecentRow(row, surface)), limit);
}

export async function runNavRecentAdapter(
  surface: NavRecentAdapterId,
  args: NavRecentAdapterArgs,
  deps: NavRecentAdapterDeps = defaultNavRecentAdapterDeps,
): Promise<NavRecentRow[]> {
  const { orgId, staffId, limit } = args;
  switch (surface) {
    case 'receiving.viewed':
    case 'receiving.unbox_opened':
    case 'receiving.scanned':
    case 'testing.opened':
      return receivingAdapter(surface, args, deps);
    case 'tech.scans': {
      const rows = await deps.fetchTechLogRows(orgId, {
        techId: staffId, weekStart: '', weekEnd: '', searchTerm: '', limit, offset: 0,
      });
      return keepRows(rows.map(techLogRecentRow), limit);
    }
    case 'packer.packs': {
      const { rows } = await deps.fetchPackerLogRows({ organizationId: orgId, packerId: staffId, limit });
      return keepRows(rows.map(packerLogRecentRow), limit);
    }
    case 'labels.prints': {
      const rows = await deps.listRecentLabelPrints(orgId, { limit, staffId });
      return keepRows(rows.map(labelPrintRecentRow), limit);
    }
    case 'pickup.orders': {
      const lines = await deps.listLocalPickupLines(orgId, { status: '', q: '', limit: PICKUP_RAIL_LINES });
      return pickupOrderRecentRows(lines, limit);
    }
    case 'identify.opened': {
      const rows = await deps.readIdentified(orgId, staffId, limit);
      return keepRows(rows.map(identifiedRecentRow), limit);
    }
  }
}
