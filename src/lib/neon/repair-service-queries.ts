import pool from '../db';
import { formatPSTTimestamp, normalizePSTTimestamp } from '@/utils/date';
import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import type { OrgId } from '@/lib/tenancy/constants';
import { resolveProviderCustomerId } from './customer-queries';
import type { RepairChannel } from '@/lib/repair/repair-channel';
import { receiveWalkInRepairInTx } from '@/lib/repair/walk-in-receiving';
import { repairDueAt } from '@/lib/repair/repair-due-at';
import type { TxClient } from '@/lib/inbound/purchase-links';
import { scheduleRepairTaskSync } from '@/lib/tasks/repair-tasks-db';

export interface RepairStatusHistoryEntry {
  status: string;
  timestamp: string;
  previous_status?: string | null;
  source?: string | null;
  user_id?: number | null;
  user_name?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface RSRecord {
  id: number;
  version?: number;
  created_at: string;
  updated_at: string;
  ticket_number: string;
  contact_info: string;
  product_title: string;
  price: string;
  issue: string;
  serial_number: string;
  status: string;
  notes?: string | null;
  status_history?: RepairStatusHistoryEntry[];
  source_system?: string | null;
  source_order_id?: string | null;
  source_tracking_number?: string | null;
  source_sku?: string | null;
  intake_channel?: string | null;
  delivered_at?: string | null;
  received_at?: string | null;
  /** The SLA — 3 business days after received / opened (`repairDueAt`); null while Incoming Shipment. */
  due_at?: string | null;
  intake_confirmed_at?: string | null;
  label_printed_at?: string | null;
  received_by_staff_id?: number | null;
  customer_id?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  /** Drop-off ticket → its receiving line (`repair_service.receiving_line_id`). */
  receiving_line_id?: number | null;
  /** That line's carton — the `R-{id}` sticker the floor holds. */
  receiving_id?: number | null;
  /** The SKU catalog photo for `source_sku`, when the catalog has one. */
  image_url?: string | null;
  /** The counter visit the ticket was checked in on (`counter_transactions.id`) — its receipt's source. */
  counter_transaction_id?: number | null;
}

export const REPAIR_STATUS_OPTIONS = [
  'Incoming Shipment',
  'Awaiting Parts',
  'Pending Repair',
  'Awaiting Pickup',
  'Repaired, Contact Customer',
  'Awaiting Payment',
  'Awaiting Additional Parts Payment',
  'Shipped',
  'Picked Up',
] as const;

/**
 * `all` is the HISTORY book; `open` is every ticket not closed — arriving or
 * in the store (the station's default, owner 2026-09-30); `active` drops the
 * arriving ones (in the store only).
 */
export type RepairTab = 'open' | 'incoming' | 'active' | 'done' | 'all';

/** Statuses shown on the Done tab — also used by station “next repair” exclusions. */
export const REPAIR_DONE_TAB_STATUSES = ['Done', 'Picked Up', 'Shipped'] as const;

/** Walk-in repairs list — “Incoming” tab (inbound shipments not yet in active workflow). */
const REPAIR_INCOMING_TAB_STATUS = 'Incoming Shipment' as const;

/**
 * Soft-delete status. Cancelled repairs are hidden from every list tab (see
 * buildRepairTabWhere) but the row + status_history survive for the audit
 * trail. Stored in the free-text `status` column — no schema change needed.
 */
const REPAIR_CANCELLED_STATUS = 'Cancelled' as const;

function sqlStatusInTerminal(): string {
  return `(${REPAIR_DONE_TAB_STATUSES.map((s) => `'${s}'`).join(', ')})`;
}

function sqlIncomingTabStatus(): string {
  return `'${REPAIR_INCOMING_TAB_STATUS.replace(/'/g, "''")}'`;
}

function sqlCancelledStatus(): string {
  return `'${REPAIR_CANCELLED_STATUS.replace(/'/g, "''")}'`;
}

function mapRepairRow(row: any): RSRecord {
  const statusHistory = Array.isArray(row.status_history)
    ? row.status_history
    : (() => {
        if (!row.status_history) return [];
        try {
          const parsed = JSON.parse(row.status_history);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })();

  return {
    id: Number(row.id),
    version: row.version == null ? undefined : Number(row.version),
    created_at: normalizePSTTimestamp(row.created_at) || '',
    updated_at: normalizePSTTimestamp(row.updated_at) || '',
    ticket_number: row.ticket_number || '',
    contact_info: row.contact_info || '',
    product_title: row.product_title || '',
    price: row.price || '',
    issue: row.issue || '',
    serial_number: row.serial_number || '',
    status: row.status || 'Pending Repair',
    notes: row.notes ?? null,
    status_history: statusHistory,
    source_system: row.source_system ?? null,
    source_order_id: row.source_order_id ?? null,
    source_tracking_number: row.source_tracking_number ?? null,
    source_sku: row.source_sku ?? null,
    intake_channel: row.intake_channel ?? null,
    delivered_at: normalizePSTTimestamp(row.delivered_at) || null,
    received_at: normalizePSTTimestamp(row.received_at) || null,
    due_at: normalizePSTTimestamp(row.due_at) || null,
    intake_confirmed_at: normalizePSTTimestamp(row.intake_confirmed_at) || null,
    label_printed_at: normalizePSTTimestamp(row.label_printed_at) || null,
    received_by_staff_id: row.received_by_staff_id == null ? null : Number(row.received_by_staff_id),
    customer_id: row.customer_id == null ? null : Number(row.customer_id),
    customer_name: row.customer_name ?? null,
    customer_phone: row.customer_phone ?? null,
    customer_email: row.customer_email ?? null,
    receiving_line_id: row.receiving_line_id == null ? null : Number(row.receiving_line_id),
    receiving_id: row.receiving_id == null ? null : Number(row.receiving_id),
    image_url: row.image_url ?? null,
    counter_transaction_id: row.counter_transaction_id == null ? null : Number(row.counter_transaction_id),
  };
}

const REPAIR_SELECT_COLUMNS = `
  rs.id,
  rs.created_at,
  rs.updated_at,
  rs.ticket_number,
  rs.contact_info,
  rs.product_title,
  rs.price,
  rs.issue,
  rs.serial_number,
  rs.status,
  rs.notes,
  rs.status_history,
  rs.source_system,
  rs.source_order_id,
  rs.source_tracking_number,
  rs.source_sku,
  rs.intake_channel,
  rs.delivered_at,
  rs.received_at,
  rs.due_at,
  rs.intake_confirmed_at,
  rs.label_printed_at,
  rs.received_by_staff_id,
  rs.customer_id,
  rs.counter_transaction_id,
  COALESCE(c.display_name, c.customer_name, CONCAT_WS(' ', c.first_name, c.last_name)) AS customer_name,
  COALESCE(c.phone, c.mobile) AS customer_phone,
  c.email AS customer_email,
  rs.receiving_line_id,
  rl.receiving_id,
  sku_photo.image_url
`;

const REPAIR_FROM = `
  FROM repair_service rs
  LEFT JOIN customers c ON c.id = rs.customer_id
  LEFT JOIN receiving_line rl ON rl.id = rs.receiving_line_id AND rl.organization_id = rs.organization_id
  LEFT JOIN LATERAL (
    SELECT sc.image_url
      FROM sku_catalog sc
     WHERE sc.organization_id = rs.organization_id
       AND NULLIF(btrim(rs.source_sku), '') IS NOT NULL
       AND sc.sku = btrim(rs.source_sku)
       AND NULLIF(btrim(sc.image_url), '') IS NOT NULL
     LIMIT 1
  ) sku_photo ON TRUE
`;

/** Extra row predicates shared by list + search — orthogonal to the status tab. */
function buildRepairNeedsLabelWhere(needsLabel?: boolean): string {
  // A DATA facet, not a status value: `label_printed_at IS NULL` is the
  // "needs its 2x1 sticker" queue (repair-chain G6 — no new status spelling).
  return needsLabel ? 'AND rs.label_printed_at IS NULL' : '';
}

function buildRepairTabWhere(tab: RepairTab, needsLabel?: boolean) {
  const label = buildRepairNeedsLabelWhere(needsLabel);
  const terminalList = sqlStatusInTerminal();
  const incomingSt = sqlIncomingTabStatus();
  if (tab === 'incoming') {
    return `WHERE rs.status = ${incomingSt} ${label}`;
  }
  if (tab === 'all') {
    return `WHERE TRUE ${label}`;
  }
  if (tab === 'open') {
    return `WHERE rs.status != ${sqlCancelledStatus()} AND rs.status NOT IN ${terminalList} ${label}`;
  }
  if (tab === 'done') {
    return `WHERE rs.status IN ${terminalList} ${label}`;
  }
  return `WHERE rs.status != ${incomingSt}
          AND rs.status != ${sqlCancelledStatus()}
          AND rs.status NOT IN ${terminalList}
          ${label}`;
}

function buildRepairSearchWhere(idx: number, tab?: RepairTab, needsLabel?: boolean) {
  const base = `(
      rs.ticket_number ILIKE $${idx}
      OR rs.contact_info ILIKE $${idx}
      OR rs.product_title ILIKE $${idx}
      OR rs.serial_number ILIKE $${idx}
      OR COALESCE(rs.source_order_id, '') ILIKE $${idx}
      OR COALESCE(rs.source_tracking_number, '') ILIKE $${idx}
      OR COALESCE(rs.source_sku, '') ILIKE $${idx}
      OR COALESCE(c.display_name, c.customer_name, '') ILIKE $${idx}
      OR COALESCE(c.phone, c.mobile, '') ILIKE $${idx}
      OR COALESCE(c.email, '') ILIKE $${idx}
    )`;

  const label = buildRepairNeedsLabelWhere(needsLabel);
  const terminalList = sqlStatusInTerminal();
  const incomingSt = sqlIncomingTabStatus();
  if (!tab || tab === 'all') return `WHERE ${base} ${label}`;
  if (tab === 'open') return `WHERE rs.status != ${sqlCancelledStatus()} AND rs.status NOT IN ${terminalList} AND ${base} ${label}`;
  if (tab === 'incoming') return `WHERE rs.status = ${incomingSt} AND ${base} ${label}`;
  if (tab === 'done') return `WHERE rs.status IN ${terminalList} AND ${base} ${label}`;
  return `WHERE rs.status != ${incomingSt}
          AND rs.status != ${sqlCancelledStatus()}
          AND rs.status NOT IN ${terminalList}
          AND ${base}
          ${label}`;
}

/** The desk list's scope — `GET /api/repair-service` (list or Find) and the sidebar's status counts. */
export interface RepairListScope {
  tab: RepairTab;
  needsLabel?: boolean;
  channel?: RepairChannel | null;
  /** Find text; set = the search read (`buildRepairSearchWhere`). */
  q?: string | null;
  limit: number;
  offset?: number;
}

/**
 * One tenant-scoped statement over the desk list's rows: `select` columns,
 * the list's FROM + WHERE, its order and page. `getAllRepairs` /
 * `searchRepairs` read cards with it; the facet counts wrap it.
 */
export function buildRepairListSql(select: string, scope: RepairListScope, orgId: OrgId): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const bind = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  let where = buildRepairTabWhere(scope.tab, scope.needsLabel);
  if (scope.q) {
    params.push(`%${scope.q}%`);
    where = buildRepairSearchWhere(params.length, scope.tab, scope.needsLabel);
  }
  const sql = `SELECT ${select}
         ${REPAIR_FROM}
         ${where} AND rs.organization_id = ${bind(orgId)}
         ${scope.channel ? `AND rs.intake_channel = ${bind(scope.channel)}` : ''}
         ORDER BY rs.created_at DESC NULLS LAST, rs.id DESC
         LIMIT ${bind(scope.limit)} OFFSET ${bind(scope.offset ?? 0)}`;
  return { sql, params };
}

export async function getAllRepairs(
  limit = 100,
  offset = 0,
  options?: { tab?: RepairTab; needsLabel?: boolean; channel?: RepairChannel | null },
  orgId?: OrgId,
): Promise<RSRecord[]> {
  try {
    const where = buildRepairTabWhere(options?.tab || 'active', options?.needsLabel);
    const channel = options?.channel ?? null;
    if (orgId) {
      const { sql, params } = buildRepairListSql(REPAIR_SELECT_COLUMNS, { tab: options?.tab || 'active', needsLabel: options?.needsLabel, channel, limit, offset }, orgId);
      const result = await tenantQuery(orgId, sql, params);
      return result.rows.map(mapRepairRow);
    }
    const result = await pool.query(
      `SELECT ${REPAIR_SELECT_COLUMNS}
       ${REPAIR_FROM}
       ${where}
       ${channel ? 'AND rs.intake_channel = $3' : ''}
       ORDER BY rs.created_at DESC NULLS LAST, rs.id DESC
       LIMIT $1 OFFSET $2`,
      channel ? [limit, offset, channel] : [limit, offset],
    );

    return result.rows.map(mapRepairRow);
  } catch (error) {
    console.error('Error fetching repairs:', error);
    throw new Error('Failed to fetch repairs');
  }
}

export async function getRepairById(id: number, orgId?: OrgId): Promise<RSRecord | null> {
  try {
    const result = orgId
      ? await tenantQuery(
          orgId,
          `SELECT ${REPAIR_SELECT_COLUMNS}
           ${REPAIR_FROM}
           WHERE rs.id = $1 AND rs.organization_id = $2`,
          [id, orgId],
        )
      : await pool.query(
          `SELECT ${REPAIR_SELECT_COLUMNS}
           ${REPAIR_FROM}
           WHERE rs.id = $1`,
          [id],
        );

    if (result.rows.length === 0) return null;
    return mapRepairRow(result.rows[0]);
  } catch (error) {
    console.error('Error fetching repair by ID:', error);
    throw new Error('Failed to fetch repair');
  }
}

type CancelRepairResult =
  | { ok: true; repair: RSRecord; alreadyCancelled: boolean }
  | { ok: false; status: 404 | 409; error: string };

/** Soft-cancel a repair (status → 'Cancelled'). */
export async function cancelRepair(id: number, reason?: string | null, orgId?: OrgId): Promise<CancelRepairResult> {
  const existing = await getRepairById(id, orgId);
  if (!existing) return { ok: false, status: 404, error: 'Repair not found' };
  if (existing.status === REPAIR_CANCELLED_STATUS) {
    return { ok: true, repair: existing, alreadyCancelled: true };
  }
  if ((REPAIR_DONE_TAB_STATUSES as readonly string[]).includes(existing.status)) {
    return { ok: false, status: 409, error: `Repair is ${existing.status} and cannot be cancelled` };
  }

  await updateRepairStatus(id, REPAIR_CANCELLED_STATUS, orgId);
  if (reason && reason.trim()) {
    await appendRepairStatusHistory(id, {
      status: REPAIR_CANCELLED_STATUS,
      previous_status: existing.status,
      source: 'repair-service.cancel',
      metadata: { reason: reason.trim() },
    }, orgId);
  }
  const repair = await getRepairById(id, orgId);
  return { ok: true, repair: repair!, alreadyCancelled: false };
}

type UnopenRepairResult =
  | { ok: true; repair: RSRecord; alreadyOpen: boolean }
  | { ok: false; status: 404 | 409; error: string };

/** Reverse of {@link cancelRepair}: */
export async function unopenRepair(id: number, reason?: string | null, orgId?: OrgId): Promise<UnopenRepairResult> {
  const existing = await getRepairById(id, orgId);
  if (!existing) return { ok: false, status: 404, error: 'Repair not found' };
  if (existing.status !== REPAIR_CANCELLED_STATUS) {
    return { ok: false, status: 409, error: `Repair is ${existing.status}, not Cancelled — nothing to reopen` };
  }

  const histRes = orgId
    ? await tenantQuery<{ status_history: RepairStatusHistoryEntry[] | null }>(
        orgId,
        `SELECT status_history FROM repair_service WHERE id = $1 AND organization_id = $2`,
        [id, orgId],
      )
    : await pool.query<{ status_history: RepairStatusHistoryEntry[] | null }>(
        `SELECT status_history FROM repair_service WHERE id = $1`,
        [id],
      );
  const history = (histRes.rows[0]?.status_history ?? []) as RepairStatusHistoryEntry[];
  let priorStatus: string | null = null;
  // 1. Cleanest source: the most recent Cancelled entry records the pre-cancel
  //    status as previous_status.
  for (let i = history.length - 1; i >= 0; i--) {
    const e = history[i];
    if (e && e.status === REPAIR_CANCELLED_STATUS && e.previous_status) {
      priorStatus = String(e.previous_status);
      break;
    }
  }
  // 2. Fallback: the most recent NON-Cancelled status in history — covers a
  //    cancel from an empty/NULL status, where previous_status was stripped, so
  //    a reason-less cancel of a status-less row can still be reopened.
  if (!priorStatus) {
    for (let i = history.length - 1; i >= 0; i--) {
      const e = history[i];
      if (e && e.status && e.status !== REPAIR_CANCELLED_STATUS) {
        priorStatus = String(e.status);
        break;
      }
    }
  }
  if (!priorStatus) {
    return { ok: false, status: 409, error: 'Cannot determine the prior status to reopen to' };
  }

  await updateRepairStatus(id, priorStatus, orgId);
  await appendRepairStatusHistory(id, {
    status: priorStatus,
    previous_status: REPAIR_CANCELLED_STATUS,
    source: 'repair-service.reopen',
    ...(reason && reason.trim() ? { metadata: { reason: reason.trim() } } : {}),
  }, orgId);
  const repair = await getRepairById(id, orgId);
  return { ok: true, repair: repair!, alreadyOpen: false };
}

export async function updateRepairStatus(id: number, newStatus: string, orgId?: OrgId): Promise<void> {
  try {
    const timestamp = formatPSTTimestamp();
    const statusHistoryExpr = `status_history = CASE
                WHEN COALESCE(status, '') IS DISTINCT FROM $1 THEN
                  COALESCE(status_history, '[]'::jsonb) || jsonb_build_array(
                    jsonb_strip_nulls(
                      jsonb_build_object(
                        'status', $1,
                        'timestamp', $2::text,
                        'previous_status', NULLIF(status, ''),
                        'source', 'repair-service.update-status'
                      )
                    )
                  )
                ELSE COALESCE(status_history, '[]'::jsonb)
              END`;
    // The SLA follows the status: leaving Incoming Shipment starts the clock
    // (a due date already set stands), going back to Incoming clears it.
    const write = async (db: RepairWriteDb): Promise<number> => {
      const scope = orgId ? ' AND organization_id = $2' : '';
      const stamps = await db.query(
        `SELECT received_at, created_at FROM repair_service WHERE id = $1${scope} FOR UPDATE`,
        orgId ? [id, orgId] : [id],
      );
      const row = stamps.rows[0];
      if (!row) return 0;
      const dueAt = repairDueAt(row.received_at, row.created_at, newStatus);
      const result = await db.query(
        `UPDATE repair_service
            SET status = $1,
                ${statusHistoryExpr},
                due_at = CASE WHEN $4::timestamptz IS NULL THEN NULL ELSE COALESCE(due_at, $4::timestamptz) END,
                updated_at = NOW()
          WHERE id = $3${orgId ? ' AND organization_id = $5' : ''}`,
        orgId ? [newStatus, timestamp, id, dueAt, orgId] : [newStatus, timestamp, id, dueAt],
      );
      return result.rowCount ?? 0;
    };
    const updated = orgId ? await withTenantTransaction(orgId, (client) => write(client)) : await write(pool);
    if (updated === 0) throw new Error('Repair not found');
    scheduleRepairTaskSync(orgId, id);
  } catch (error) {
    console.error('Error updating repair status:', error);
    throw new Error('Failed to update repair status');
  }
}

export async function updateRepairNotes(id: number, notes: string, orgId?: OrgId): Promise<void> {
  // Empty = NULL, the intake writer's convention.
  const value = notes.trim() || null;
  try {
    if (orgId) {
      await withTenantTransaction(orgId, (client) =>
        client.query(
          'UPDATE repair_service SET notes = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3',
          [value, id, orgId],
        ),
      );
      return;
    }
    await pool.query(
      'UPDATE repair_service SET notes = $1, updated_at = NOW() WHERE id = $2',
      [value, id],
    );
  } catch (error) {
    console.error('Error updating repair notes:', error);
    throw new Error('Failed to update repair notes');
  }
}

export async function appendRepairStatusHistory(
  id: number,
  entry: Omit<RepairStatusHistoryEntry, 'timestamp'> & { timestamp?: string },
  orgId?: OrgId,
): Promise<void> {
  try {
    const payload = {
      ...entry,
      timestamp: entry.timestamp ?? formatPSTTimestamp(),
    };

    const result = orgId
      ? await withTenantTransaction(orgId, (client) =>
          client.query(
            `UPDATE repair_service
                SET status_history = COALESCE(status_history, '[]'::jsonb) || $1::jsonb,
                    updated_at = NOW()
              WHERE id = $2 AND organization_id = $3`,
            [JSON.stringify([payload]), id, orgId],
          ),
        )
      : await pool.query(
          `UPDATE repair_service
              SET status_history = COALESCE(status_history, '[]'::jsonb) || $1::jsonb,
                  updated_at = NOW()
            WHERE id = $2`,
          [JSON.stringify([payload]), id],
        );

    if ((result.rowCount ?? 0) === 0) throw new Error('Repair not found');
  } catch (error) {
    console.error('Error appending repair status history:', error);
    throw new Error('Failed to append repair status history');
  }
}

/** Linkage fields a repair_service ticket can be paired to / unpaired from. */
export const REPAIR_LINK_FIELDS = [
  'source_order_id',
  'source_tracking_number',
  'serial_number',
  'source_sku',
] as const;
export type RepairLinkField = (typeof REPAIR_LINK_FIELDS)[number];

type RepairLinkValues = Partial<Record<RepairLinkField, string | null>>;

type RepairLinkResult =
  | { ok: true; repair: RSRecord; before: RepairLinkValues }
  | { ok: false; status: 404; error: string };

/** Snapshot of just the linkage fields — used as the audit `before`/`after`. */
function pickLinkValues(r: RSRecord): RepairLinkValues {
  return {
    source_order_id: r.source_order_id ?? null,
    source_tracking_number: r.source_tracking_number ?? null,
    serial_number: r.serial_number || null,
    source_sku: r.source_sku ?? null,
  };
}

/** Manual pairing: */
export async function linkRepairService(
  id: number,
  values: RepairLinkValues,
  orgId?: OrgId,
): Promise<RepairLinkResult> {
  const before = await getRepairById(id, orgId);
  if (!before) return { ok: false, status: 404, error: 'Repair not found' };

  // Keep only recognized link fields; normalize '' → null.
  const entries = (Object.keys(values) as RepairLinkField[])
    .filter((k) => (REPAIR_LINK_FIELDS as readonly string[]).includes(k))
    .map((k) => {
      const raw = values[k];
      const norm = raw == null ? null : String(raw).trim() || null;
      return [k, norm] as const;
    });

  if (entries.length === 0) {
    return { ok: true, repair: before, before: pickLinkValues(before) };
  }

  const setSql = entries.map(([col], i) => `${col} = $${i + 1}`).join(', ');
  const params = entries.map(([, v]) => v);

  if (orgId) {
    const idIdx = params.length + 1;
    const orgIdx = params.length + 2;
    const result = await withTenantTransaction(orgId, (client) =>
      client.query(
        `UPDATE repair_service SET ${setSql}, updated_at = NOW()
          WHERE id = $${idIdx} AND organization_id = $${orgIdx}`,
        [...params, id, orgId],
      ),
    );
    if ((result.rowCount ?? 0) === 0) return { ok: false, status: 404, error: 'Repair not found' };
  } else {
    const idIdx = params.length + 1;
    const result = await pool.query(
      `UPDATE repair_service SET ${setSql}, updated_at = NOW() WHERE id = $${idIdx}`,
      [...params, id],
    );
    if ((result.rowCount ?? 0) === 0) return { ok: false, status: 404, error: 'Repair not found' };
  }

  const repair = await getRepairById(id, orgId);
  return { ok: true, repair: repair!, before: pickLinkValues(before) };
}

/**
 * Reverse of {@link linkRepairService}: clear one or more linkage fields (or all
 * of them when `fields` is omitted). The ticket row survives — only the
 * reference columns are nulled. Org-scoped; 404 on cross-tenant id.
 */
export async function unlinkRepairService(
  id: number,
  fields?: readonly RepairLinkField[],
  orgId?: OrgId,
): Promise<RepairLinkResult> {
  const targets = (fields && fields.length ? fields : REPAIR_LINK_FIELDS).filter((f) =>
    (REPAIR_LINK_FIELDS as readonly string[]).includes(f),
  );
  const clear: RepairLinkValues = {};
  for (const f of targets) clear[f] = null;
  return linkRepairService(id, clear, orgId);
}

export async function updateRepairField(id: number, field: string, value: any, orgId?: OrgId): Promise<void> {
  try {
    const validFields = [
      'ticket_number',
      'contact_info',
      'product_title',
      'price',
      'issue',
      'serial_number',
      'status',
      'notes',
      'source_system',
      'source_order_id',
      'source_tracking_number',
      'source_sku',
      'intake_channel',
      'delivered_at',
      'received_at',
      'intake_confirmed_at',
      'received_by_staff_id',
      // customer_id is NOT here: it moves only through `setRepairCustomer` /
      // `createAndLinkRepairCustomer` (`/api/repair-service/[id]/customer`), which
      // check the customer belongs to the same org.
    ];

    if (!validFields.includes(field)) throw new Error(`Invalid field: ${field}`);

    const scope = orgId ? ' AND organization_id = $3' : '';
    const params = orgId ? [value, id, orgId] : [value, id];
    const write = async (db: RepairWriteDb): Promise<void> => {
      if (field !== 'received_at' && field !== 'status') {
        await db.query(`UPDATE repair_service SET ${field} = $1, updated_at = NOW() WHERE id = $2${scope}`, params);
        return;
      }
      // The SLA reads both: a new receive stamp moves the due date; a status
      // change only starts it (leaving Incoming Shipment) or clears it.
      const stamps = await db.query(
        `SELECT received_at, created_at, status, due_at FROM repair_service WHERE id = $1${orgId ? ' AND organization_id = $2' : ''} FOR UPDATE`,
        orgId ? [id, orgId] : [id],
      );
      const row = stamps.rows[0];
      if (!row) return;
      const computed = repairDueAt(field === 'received_at' ? value : row.received_at, row.created_at, field === 'status' ? value : row.status);
      const dueAt = computed == null ? null : field === 'received_at' ? computed : (row.due_at ?? computed);
      await db.query(
        `UPDATE repair_service SET ${field} = $1, due_at = $${params.length + 1}::timestamptz, updated_at = NOW() WHERE id = $2${scope}`,
        [...params, dueAt],
      );
    };
    if (orgId) await withTenantTransaction(orgId, (client) => write(client));
    else await write(pool);
    scheduleRepairTaskSync(orgId, id);
  } catch (error) {
    console.error('Error updating repair field:', error);
    throw new Error('Failed to update repair field');
  }
}

interface CreateRepairParams {
  createdAt?: string;
  ticketNumber?: string | null;
  contactInfo: string;
  productTitle: string;
  price: string;
  issue: string;
  serialNumber: string;
  notes?: string | null;
  status?: string;
  sourceSystem?: string | null;
  sourceOrderId?: string | null;
  sourceTrackingNumber?: string | null;
  sourceSku?: string | null;
  /** How the device reached us — every new ticket says so. */
  intakeChannel: RepairChannel;
  deliveredAt?: string | null;
  receivedAt?: string | null;
  intakeConfirmedAt?: string | null;
  receivedByStaffId?: number | null;
  customerId?: number | null;
}

type RepairInsertDb = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Array<{ id: number; ticket_number?: string | null }> }>;
};

/** The stamps the SLA reads back before a status / receive write (`repairDueAt`). */
type RepairSlaStamps = {
  received_at: Date | string | null;
  created_at: Date | string | null;
  status: string | null;
  due_at: Date | string | null;
};

/** The query surface a repair writer runs on — the pool or a tenant transaction's client. */
type RepairWriteDb = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: RepairSlaStamps[]; rowCount?: number | null }>;
};

/** Insert one ticket (and its RS-#### fallback number) on `db`; returns the id. */
async function insertRepairRow(
  db: RepairInsertDb,
  params: CreateRepairParams,
  createdAt: string,
  orgId?: OrgId,
): Promise<number> {
  const intakeChannel = params.intakeChannel;
  const receivedAt = params.receivedAt ?? (intakeChannel === 'pickup' ? createdAt : null);
  const intakeConfirmedAt = params.intakeConfirmedAt ?? (intakeChannel === 'pickup' ? createdAt : null);
  const status = params.status ?? 'Pending Repair';

  const insertValues = [
    createdAt,
    params.ticketNumber ?? null,
    params.contactInfo,
    params.productTitle,
    params.price,
    params.issue,
    params.serialNumber,
    params.notes ?? null,
    status,
    params.sourceSystem ?? null,
    params.sourceOrderId ?? null,
    params.sourceTrackingNumber ?? null,
    params.sourceSku ?? null,
    intakeChannel,
    params.deliveredAt ?? null,
    receivedAt,
    intakeConfirmedAt,
    params.receivedByStaffId ?? null,
    params.customerId ?? null,
    repairDueAt(receivedAt, createdAt, status),
  ];

  const result = orgId
    ? await db.query(
        `INSERT INTO repair_service
           (
             created_at, updated_at, ticket_number, contact_info, product_title, price, issue, serial_number, notes, status,
             source_system, source_order_id, source_tracking_number, source_sku, intake_channel,
             delivered_at, received_at, intake_confirmed_at, received_by_staff_id, customer_id, due_at, organization_id
           )
         VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
         RETURNING id, ticket_number`,
        [...insertValues, orgId],
      )
    : await db.query(
        `INSERT INTO repair_service
           (
             created_at, updated_at, ticket_number, contact_info, product_title, price, issue, serial_number, notes, status,
             source_system, source_order_id, source_tracking_number, source_sku, intake_channel,
             delivered_at, received_at, intake_confirmed_at, received_by_staff_id, customer_id, due_at
           )
         VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
         RETURNING id, ticket_number`,
        insertValues,
      );

  const id = Number(result.rows[0].id);
  if (!result.rows[0].ticket_number) {
    const fallback = `RS-${String(id).padStart(4, '0')}`;
    await db.query(
      orgId
        ? 'UPDATE repair_service SET ticket_number = $1, updated_at = NOW() WHERE id = $2 AND organization_id = $3'
        : 'UPDATE repair_service SET ticket_number = $1, updated_at = NOW() WHERE id = $2',
      orgId ? [fallback, id, orgId] : [fallback, id],
    );
  }
  return id;
}

/**
 * Create a ticket. A drop-off (`intakeChannel: 'pickup'`) is born with its
 * receiving record: the ticket, its REPAIR inbound order, carton and line, and
 * the ticket → line link commit on ONE transaction (`receiveWalkInRepairInTx`).
 */
export async function createRepair(params: CreateRepairParams, orgId?: OrgId): Promise<RSRecord> {
  const createdAt = normalizePSTTimestamp(params.createdAt, { fallbackToNow: true })!;

  let id: number;
  if (orgId) {
    id = await withTenantTransaction(orgId, async (client) => {
      const repairId = await insertRepairRow(client, params, createdAt, orgId);
      if (params.intakeChannel === 'pickup') {
        await receiveWalkInRepairInTx(
          client as unknown as TxClient,
          orgId,
          {
            id: repairId,
            productTitle: params.productTitle,
            receivedOn: (params.receivedAt ?? createdAt).slice(0, 10),
          },
          { staffId: params.receivedByStaffId ?? null },
        );
      }
      return repairId;
    });
  } else {
    if (params.intakeChannel === 'pickup') {
      throw new Error('createRepair: a drop-off ticket lands a receiving record, so it needs its organization');
    }
    id = await insertRepairRow(pool, params, createdAt);
  }

  scheduleRepairTaskSync(orgId, id);
  const record = await getRepairById(id, orgId);
  return record!;
}

/** A Find answers its newest 20 matches. */
export const REPAIR_SEARCH_LIMIT = 20;

export async function searchRepairs(
  query: string,
  options?: { tab?: RepairTab; needsLabel?: boolean; channel?: RepairChannel | null },
  orgId?: OrgId,
): Promise<RSRecord[]> {
  try {
    const searchTerm = `%${query}%`;
    const where = buildRepairSearchWhere(1, options?.tab, options?.needsLabel);
    const channel = options?.channel ?? null;
    if (orgId) {
      const { sql, params } = buildRepairListSql(REPAIR_SELECT_COLUMNS, { tab: options?.tab ?? 'all', needsLabel: options?.needsLabel, channel, q: query, limit: REPAIR_SEARCH_LIMIT }, orgId);
      const result = await tenantQuery(orgId, sql, params);
      return result.rows.map(mapRepairRow);
    }
    const result = await pool.query(
      `SELECT ${REPAIR_SELECT_COLUMNS}
       ${REPAIR_FROM}
       ${where}
       ${channel ? 'AND rs.intake_channel = $2' : ''}
       ORDER BY rs.created_at DESC NULLS LAST, rs.id DESC
       LIMIT ${REPAIR_SEARCH_LIMIT}`,
      channel ? [searchTerm, channel] : [searchTerm],
    );

    return result.rows.map(mapRepairRow);
  } catch (error) {
    console.error('Error searching repairs:', error);
    throw new Error('Failed to search repairs');
  }
}

type MarkLabelPrintedResult =
  | { ok: true; repair: RSRecord; alreadyPrinted: boolean }
  | { ok: false; status: 404; error: string };

/** Stamp `label_printed_at` on a repair the first time its 2x1 REP-{id} label is printed (POST /api/repair-service/[id]/label-printed). */
export async function markRepairLabelPrinted(id: number, orgId?: OrgId): Promise<MarkLabelPrintedResult> {
  try {
    const update = orgId
      ? await tenantQuery(
          orgId,
          `UPDATE repair_service
              SET label_printed_at = now(), updated_at = now()
            WHERE id = $1 AND organization_id = $2 AND label_printed_at IS NULL
            RETURNING id`,
          [id, orgId],
        )
      : await pool.query(
          `UPDATE repair_service
              SET label_printed_at = now(), updated_at = now()
            WHERE id = $1 AND label_printed_at IS NULL
            RETURNING id`,
          [id],
        );
    const repair = await getRepairById(id, orgId);
    if (!repair) {
      return { ok: false, status: 404, error: `Repair ${id} not found` };
    }
    return { ok: true, repair, alreadyPrinted: (update.rowCount ?? 0) === 0 };
  } catch (error) {
    console.error('Error marking repair label printed:', error);
    throw new Error('Failed to mark repair label printed');
  }
}

function buildEcwidRepairNotes(params: {
  existingNotes?: string | null;
  trackingNumber?: string | null;
  orderId?: string | null;
  sku?: string | null;
}) {
  const parts = [
    params.orderId ? `Ecwid Order: ${params.orderId}` : null,
    params.trackingNumber ? `Tracking: ${params.trackingNumber}` : null,
    params.sku ? `Source SKU: ${params.sku}` : null,
  ].filter(Boolean);

  const prefix = parts.join('\n');
  const existing = String(params.existingNotes || '').trim();
  if (!prefix) return existing || null;
  if (!existing) return prefix;
  return `${prefix}\n\n${existing}`;
}

/** Attach the provider contact to a `customers` row and stamp it on the ticket. */
async function attachRepairCustomer(
  repairId: number,
  contact: EcwidRepairContact | undefined,
  orgId?: OrgId,
): Promise<void> {
  if (!orgId || !contact) return;
  try {
    const customerId = await resolveProviderCustomerId(orgId, contact);
    if (customerId == null) return;
    await tenantQuery(
      orgId,
      `UPDATE repair_service
          SET customer_id = $1, updated_at = NOW()
        WHERE id = $2 AND organization_id = $3 AND customer_id IS NULL`,
      [customerId, repairId, orgId],
    );
  } catch (error) {
    console.warn(`Could not attach a customer to repair ${repairId}:`, error);
  }
}

/** The buyer as the provider payload carries them, before any parsing. */
interface EcwidRepairContact {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
}

export async function upsertEcwidIncomingRepair(params: {
  orderId: string | null;
  trackingNumber: string | null;
  sku: string | null;
  productTitle: string | null;
  contactInfo: string | null;
  /**
   * The buyer in PARTS. `contactInfo` is the joined string the paper falls back
   * to; this is what actually links the ticket to the `customers` table, which
   * is where the receipt reads the name from.
   */
  contact?: EcwidRepairContact;
  orderDate?: string | null;
  notes?: string | null;
}, orgId?: OrgId): Promise<RSRecord> {
  try {
    const existing = orgId
      ? await tenantQuery(
          orgId,
          `SELECT id
           FROM repair_service
           WHERE source_system = 'ecwid'
             AND organization_id = $4
             AND (
               (
                 source_order_id IS NOT NULL
                 AND source_order_id = $1
                 AND (
                   COALESCE(NULLIF($3, ''), '') = ''
                   OR COALESCE(source_sku, '') = COALESCE($3, '')
                 )
               )
               OR (
                 source_tracking_number IS NOT NULL
                 AND source_tracking_number = $2
                 AND COALESCE(source_sku, '') = COALESCE($3, '')
               )
             )
           ORDER BY id DESC
           LIMIT 1`,
          [params.orderId, params.trackingNumber, params.sku, orgId]
        )
      : await pool.query(
          `SELECT id
           FROM repair_service
           WHERE source_system = 'ecwid'
             AND (
               (
                 source_order_id IS NOT NULL
                 AND source_order_id = $1
                 AND (
                   COALESCE(NULLIF($3, ''), '') = ''
                   OR COALESCE(source_sku, '') = COALESCE($3, '')
                 )
               )
               OR (
                 source_tracking_number IS NOT NULL
                 AND source_tracking_number = $2
                 AND COALESCE(source_sku, '') = COALESCE($3, '')
               )
             )
           ORDER BY id DESC
           LIMIT 1`,
          [params.orderId, params.trackingNumber, params.sku]
        );

    const notes = buildEcwidRepairNotes({
      existingNotes: params.notes,
      trackingNumber: params.trackingNumber,
      orderId: params.orderId,
      sku: params.sku,
    });

    if (existing.rows.length > 0) {
      const repairId = Number(existing.rows[0].id);
      const updateValues = [
        params.contactInfo ?? null,
        params.productTitle ?? null,
        notes,
        params.orderId ?? null,
        params.trackingNumber ?? null,
        params.sku ?? null,
        params.orderDate ?? null,
        repairId,
      ];
      if (orgId) {
        await withTenantTransaction(orgId, (client) =>
          client.query(
            `UPDATE repair_service
             SET contact_info = COALESCE(NULLIF(contact_info, ''), $1),
                 product_title = COALESCE(NULLIF(product_title, ''), $2),
                 notes = COALESCE(NULLIF(notes, ''), $3),
                 source_order_id = COALESCE(NULLIF(source_order_id, ''), $4),
                 source_tracking_number = COALESCE(NULLIF(source_tracking_number, ''), $5),
                 source_sku = COALESCE(NULLIF(source_sku, ''), $6),
                 intake_channel = COALESCE(NULLIF(intake_channel, ''), 'shipment'),
                 status = CASE
                   WHEN received_at IS NULL
                        AND COALESCE(status, '') NOT IN ('Done', 'Picked Up', 'Shipped')
                        AND COALESCE(status, '') IN ('Pending Repair', ${sqlIncomingTabStatus()})
                     THEN ${sqlIncomingTabStatus()}
                   ELSE status
                 END,
                 delivered_at = COALESCE(delivered_at, $7),
                 updated_at = NOW()
             WHERE id = $8 AND organization_id = $9`,
            [...updateValues, orgId]
          )
        );
      } else {
        await pool.query(
          `UPDATE repair_service
           SET contact_info = COALESCE(NULLIF(contact_info, ''), $1),
               product_title = COALESCE(NULLIF(product_title, ''), $2),
               notes = COALESCE(NULLIF(notes, ''), $3),
               source_order_id = COALESCE(NULLIF(source_order_id, ''), $4),
               source_tracking_number = COALESCE(NULLIF(source_tracking_number, ''), $5),
               source_sku = COALESCE(NULLIF(source_sku, ''), $6),
               intake_channel = COALESCE(NULLIF(intake_channel, ''), 'shipment'),
               status = CASE
                 WHEN received_at IS NULL
                      AND COALESCE(status, '') NOT IN ('Done', 'Picked Up', 'Shipped')
                      AND COALESCE(status, '') IN ('Pending Repair', ${sqlIncomingTabStatus()})
                   THEN ${sqlIncomingTabStatus()}
                 ELSE status
               END,
               delivered_at = COALESCE(delivered_at, $7),
               updated_at = NOW()
           WHERE id = $8`,
          updateValues
        );
      }
      await attachRepairCustomer(repairId, params.contact, orgId);
      scheduleRepairTaskSync(orgId, repairId);
      const record = await getRepairById(repairId, orgId);
      return record!;
    }

    const created = await createRepair({
      createdAt: params.orderDate ?? undefined,
      ticketNumber: null,
      contactInfo: params.contactInfo || '',
      productTitle: params.productTitle || 'Ecwid Incoming Repair',
      price: '',
      issue: 'Ecwid inbound repair shipment',
      serialNumber: '',
      notes,
      status: REPAIR_INCOMING_TAB_STATUS,
      sourceSystem: 'ecwid',
      sourceOrderId: params.orderId ?? null,
      sourceTrackingNumber: params.trackingNumber ?? null,
      sourceSku: params.sku ?? null,
      intakeChannel: 'shipment',
      deliveredAt: params.orderDate ?? null,
      receivedAt: null,
      intakeConfirmedAt: null,
    }, orgId);
    await attachRepairCustomer(created.id, params.contact, orgId);
    return (await getRepairById(created.id, orgId)) ?? created;
  } catch (error) {
    console.error('Error upserting Ecwid incoming repair:', error);
    throw new Error('Failed to upsert incoming repair');
  }
}
