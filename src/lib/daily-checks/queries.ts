/**
 * Daily checklist — the DB half. Everything org-scoped through the tenancy GUC
 * (`withTenantTransaction` / `tenantQuery`), never a raw pool read with a
 * hand-written `WHERE organization_id =`.
 *
 * The assembly lives in `report.ts` (pure). This module only fetches the three
 * arrays that builder needs and performs the two writes, so the read model can
 * be tested with zero DB.
 */

import { tenantQuery, withTenantTransaction } from '@/lib/tenancy/db';
import { buildDailyCheckReport } from './report';
import type {
  DailyCheckItem,
  DailyCheckItemLink,
  DailyCheckLinkEntityType,
  DailyCheckMarkFact,
  DailyCheckReport,
  DailyCheckStaffMember,
} from './types';

/**
 * Items in effect on a civil day. The half-open window (`effective_from <= D`,
 * `retired_at > D`) is what makes a PAST report show the list as it stood then
 * — see the migration header.
 */
const ITEMS_ON_DAY_SQL = `
  SELECT id, title, sort_order
    FROM daily_check_items
   WHERE effective_from <= $1::date
     AND (retired_at IS NULL OR retired_at > $1::date)
   ORDER BY sort_order ASC, id ASC
`;

const MARKS_ON_DAY_SQL = `
  SELECT item_id, staff_id, marked_at, note
    FROM daily_check_marks
   WHERE marked_on = $1::date
`;

/**
 * The roster is the DENOMINATOR of the report, so it is the active staff list —
 * not "whoever has marks". A staffer who checked nothing is exactly who the
 * report is read to find.
 */
const ROSTER_SQL = `
  SELECT id, name
    FROM staff
   WHERE active IS TRUE
   ORDER BY name ASC
`;

interface ItemRow { id: string | number; title: string; sort_order: number }
interface MarkRow { item_id: string | number; staff_id: number; marked_at: Date; note: string | null }
interface StaffRow { id: number; name: string }

const toNum = (v: string | number): number => (typeof v === 'number' ? v : Number(v));

/** One day's report: the list, everyone's ticks, and the viewer's own row. */
export async function loadDailyCheckReport(args: {
  orgId: string;
  dateKey: string;
  viewerStaffId: number | null;
  viewerName?: string | null;
}): Promise<DailyCheckReport> {
  const { orgId, dateKey, viewerStaffId, viewerName } = args;

  const [itemsRes, marksRes, rosterRes] = await Promise.all([
    tenantQuery<ItemRow>(orgId, ITEMS_ON_DAY_SQL, [dateKey]),
    tenantQuery<MarkRow>(orgId, MARKS_ON_DAY_SQL, [dateKey]),
    tenantQuery<StaffRow>(orgId, ROSTER_SQL),
  ]);

  const items: DailyCheckItem[] = itemsRes.rows.map((r) => ({
    id: toNum(r.id),
    title: r.title,
    sortOrder: r.sort_order,
  }));

  const marks: DailyCheckMarkFact[] = marksRes.rows.map((r) => ({
    itemId: toNum(r.item_id),
    staffId: r.staff_id,
    markedAt: r.marked_at.toISOString(),
    note: r.note,
  }));

  const roster: DailyCheckStaffMember[] = rosterRes.rows.map((r) => ({
    staffId: r.id,
    name: r.name,
  }));

  return buildDailyCheckReport({ dateKey, items, marks, roster, viewerStaffId, viewerName });
}

/**
 * Tick an item for one staffer on one day. Idempotent by the unique index, so a
 * double-tap or a retried request is a no-op rather than a second row that
 * would double-count the report.
 *
 * @returns `true` when this call created the mark, `false` when it already existed.
 */
export async function markDailyCheck(args: {
  orgId: string;
  itemId: number;
  staffId: number;
  dateKey: string;
  note?: string | null;
}): Promise<boolean> {
  const { orgId, itemId, staffId, dateKey, note } = args;
  return withTenantTransaction(orgId, async (client) => {
    const res = await client.query(
      `INSERT INTO daily_check_marks (item_id, staff_id, marked_on, note)
            VALUES ($1, $2, $3::date, $4)
       ON CONFLICT (organization_id, item_id, staff_id, marked_on) DO NOTHING
         RETURNING id`,
      [itemId, staffId, dateKey, note ?? null],
    );
    return (res.rowCount ?? 0) > 0;
  });
}

/**
 * Untick. A mis-tap has to be reversible or operators stop trusting the list —
 * and an un-tick is a real correction, so the row is removed rather than
 * carrying a tombstone the report would have to filter.
 */
export async function unmarkDailyCheck(args: {
  orgId: string;
  itemId: number;
  staffId: number;
  dateKey: string;
}): Promise<boolean> {
  const { orgId, itemId, staffId, dateKey } = args;
  return withTenantTransaction(orgId, async (client) => {
    const res = await client.query(
      `DELETE FROM daily_check_marks
             WHERE item_id = $1 AND staff_id = $2 AND marked_on = $3::date`,
      [itemId, staffId, dateKey],
    );
    return (res.rowCount ?? 0) > 0;
  });
}

/** Append an item to the list, live from `effectiveFrom` (a civil day). */
export async function createDailyCheckItem(args: {
  orgId: string;
  title: string;
  effectiveFrom: string;
}): Promise<DailyCheckItem> {
  const { orgId, title, effectiveFrom } = args;
  return withTenantTransaction(orgId, async (client) => {
    // Append: one past the current max, so a new item never displaces the order
    // operators already know.
    const res = await client.query<ItemRow>(
      `INSERT INTO daily_check_items (title, sort_order, effective_from)
            VALUES ($1, COALESCE((SELECT MAX(sort_order) + 1 FROM daily_check_items), 0), $2::date)
         RETURNING id, title, sort_order`,
      [title, effectiveFrom],
    );
    const row = res.rows[0];
    return { id: toNum(row.id), title: row.title, sortOrder: row.sort_order };
  });
}

/**
 * Retire an item from `retiredAt` onward. NEVER a delete: the marks reference
 * it, and every past report that included it must keep rendering it.
 */
export async function retireDailyCheckItem(args: {
  orgId: string;
  itemId: number;
  retiredAt: string;
}): Promise<boolean> {
  const { orgId, itemId, retiredAt } = args;
  return withTenantTransaction(orgId, async (client) => {
    const res = await client.query(
      `UPDATE daily_check_items
          SET retired_at = $2::date, updated_at = now()
        WHERE id = $1 AND retired_at IS NULL`,
      [itemId, retiredAt],
    );
    return (res.rowCount ?? 0) > 0;
  });
}

interface LinkRow {
  id: string | number;
  item_id: string | number;
  entity_type: DailyCheckLinkEntityType;
  entity_id: string | number;
  label: string | null;
  created_at: Date;
}

function toLink(row: LinkRow): DailyCheckItemLink {
  return {
    id: toNum(row.id),
    itemId: toNum(row.item_id),
    entityType: row.entity_type,
    entityId: toNum(row.entity_id),
    label: row.label,
    createdAt: row.created_at.toISOString(),
  };
}

/** True when this item exists in the tenant (retired items still count). */
export async function dailyCheckItemExists(args: {
  orgId: string;
  itemId: number;
}): Promise<boolean> {
  const res = await tenantQuery<{ id: string | number }>(
    args.orgId,
    `SELECT id FROM daily_check_items WHERE id = $1`,
    [args.itemId],
  );
  return res.rows.length > 0;
}

export async function listDailyCheckItemLinks(args: {
  orgId: string;
  itemId: number;
}): Promise<DailyCheckItemLink[]> {
  const res = await tenantQuery<LinkRow>(
    args.orgId,
    `SELECT id, item_id, entity_type, entity_id, label, created_at
       FROM daily_check_item_links
      WHERE item_id = $1
      ORDER BY created_at ASC, id ASC`,
    [args.itemId],
  );
  return res.rows.map(toLink);
}

export async function createDailyCheckItemLink(args: {
  orgId: string;
  itemId: number;
  entityType: DailyCheckLinkEntityType;
  entityId: number;
  label?: string | null;
  createdByStaffId: number;
}): Promise<DailyCheckItemLink> {
  const { orgId, itemId, entityType, entityId, label, createdByStaffId } = args;
  return withTenantTransaction(orgId, async (client) => {
    const res = await client.query<LinkRow>(
      `INSERT INTO daily_check_item_links
         (organization_id, item_id, entity_type, entity_id, label, created_by_staff_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (organization_id, item_id, entity_type, entity_id) DO UPDATE
         SET label = COALESCE(EXCLUDED.label, daily_check_item_links.label),
             updated_at = now()
       RETURNING id, item_id, entity_type, entity_id, label, created_at`,
      [orgId, itemId, entityType, entityId, label ?? null, createdByStaffId],
    );
    return toLink(res.rows[0]);
  });
}

export async function deleteDailyCheckItemLink(args: {
  orgId: string;
  itemId: number;
  linkId: number;
}): Promise<boolean> {
  const { orgId, itemId, linkId } = args;
  return withTenantTransaction(orgId, async (client) => {
    const res = await client.query(
      `DELETE FROM daily_check_item_links WHERE id = $1 AND item_id = $2`,
      [linkId, itemId],
    );
    return (res.rowCount ?? 0) > 0;
  });
}
