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
 * Item `item` is on the list on civil day `day` — the half-open window
 * (`effective_from <= D`, `retired_at > D`) that makes a PAST report show the
 * list as it stood then (see the migration header). A `once` item is born with
 * `retired_at = effective_from + 1`, so this one predicate also limits it to
 * its own day. Every "is it live on D" read shares this fragment — the items
 * read, the rename guard and the reminder feed — so they cannot drift.
 *
 * Both arguments are SQL expressions from trusted call sites (an alias, a
 * placeholder), never user input.
 */
export function dailyCheckItemLiveOnSql(item: string, day: string): string {
  return `(${item}.effective_from <= ${day} AND (${item}.retired_at IS NULL OR ${item}.retired_at > ${day}))`;
}

/**
 * Staffer `staff` owes item `item`: recurring and unowned work belongs to the
 * whole shift; an owned one-off only to its owner. The SQL twin of the
 * report's per-staff denominator (`countsFor` in `report.ts`).
 */
export function dailyCheckItemOwedBySql(item: string, staff: string): string {
  return `(${item}.kind = 'recurring' OR ${item}.assigned_staff_id IS NULL OR ${item}.assigned_staff_id = ${staff})`;
}

/**
 * Items in effect on a civil day ({@link dailyCheckItemLiveOnSql}). The owner
 * name rides the same read as a LEFT JOIN: one query, and an owner who has
 * since gone inactive still paints.
 *
 * The linked TICKET rides it too. The phone row paints a ticket mark, and the
 * manager report groups a day's ticket work — both need "is this a ticket?"
 * per row, and neither can afford a per-item links request. A LATERAL keeps it
 * one row per item even when an item carries several links (only the ticket
 * shape is read here; WO / tracking stay in the links call).
 */
const ITEMS_ON_DAY_SQL = `
  SELECT i.id, i.title, i.description, i.sort_order, i.kind, i.assigned_staff_id, i.glyph,
         to_char(i.due_time, 'HH24:MI') AS due_time, i.remind_offset_minutes,
         s.name AS assigned_staff_name,
         t.entity_id AS ticket_id
    FROM daily_check_items i
    LEFT JOIN staff s ON s.id = i.assigned_staff_id
    LEFT JOIN LATERAL (
      SELECT l.entity_id
        FROM daily_check_item_links l
       WHERE l.item_id = i.id
         AND l.entity_type = 'ZENDESK_TICKET'
       ORDER BY l.created_at ASC, l.id ASC
       LIMIT 1
    ) t ON TRUE
   WHERE ${dailyCheckItemLiveOnSql('i', '$1::date')}
     AND ($2::int IS NULL OR ${dailyCheckItemOwedBySql('i', '$2')})
   ORDER BY i.sort_order ASC, i.id ASC
`;

const MARKS_ON_DAY_SQL = `
  SELECT item_id, staff_id, marked_at, note
    FROM daily_check_marks
   WHERE marked_on = $1::date
     AND ($2::int IS NULL OR staff_id = $2)
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
     AND ($1::int IS NULL OR id = $1)
   ORDER BY name ASC
`;

interface ItemRow {
  id: string | number;
  title: string;
  description: string | null;
  sort_order: number;
  kind: 'recurring' | 'once';
  assigned_staff_id: number | null;
  assigned_staff_name: string | null;
  glyph: string | null;
  /** The first linked Zendesk ticket, or null on a plain task. */
  ticket_id: string | number | null;
  /** `to_char(due_time, 'HH24:MI')` — civil `HH:MM`, never a driver-parsed TIME. */
  due_time: string | null;
  remind_offset_minutes: number | null;
}

interface MarkRow {
  item_id: string | number;
  staff_id: number;
  marked_at: Date;
  note: string | null;
}

interface StaffRow {
  id: number;
  name: string;
}

const toNum = (v: string | number): number => (typeof v === 'number' ? v : Number(v));

function itemFromRow(r: ItemRow): DailyCheckItem {
  return {
    id: toNum(r.id),
    title: r.title,
    description: r.description,
    sortOrder: toNum(r.sort_order),
    kind: r.kind,
    assignedStaffId: r.assigned_staff_id,
    assignedStaffName: r.assigned_staff_name,
    glyph: r.glyph,
    ticketId: r.ticket_id == null ? null : toNum(r.ticket_id),
    dueTime: r.due_time,
    remindOffsetMinutes: r.remind_offset_minutes,
  };
}

/** One day's report: the list, everyone's ticks, and the viewer's own row. */
export async function loadDailyCheckReport(args: {
  orgId: string;
  dateKey: string;
  viewerStaffId: number | null;
  viewerName?: string | null;
  /** Home/Daily passes `true`; manager reports deliberately pass `false`. */
  onlyViewerItems?: boolean;
}): Promise<DailyCheckReport> {
  const { orgId, dateKey, viewerStaffId, viewerName, onlyViewerItems = false } = args;
  const staffScope = onlyViewerItems ? viewerStaffId : null;

  const [itemsRes, marksRes, rosterRes] = await Promise.all([
    tenantQuery<ItemRow>(orgId, ITEMS_ON_DAY_SQL, [dateKey, staffScope]),
    tenantQuery<MarkRow>(orgId, MARKS_ON_DAY_SQL, [dateKey, staffScope]),
    tenantQuery<StaffRow>(orgId, ROSTER_SQL, [staffScope]),
  ]);

  const items: DailyCheckItem[] = itemsRes.rows.map(itemFromRow);

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
       SELECT $1, $2, $3::date, $4
         WHERE EXISTS (
           SELECT 1 FROM daily_check_items
            WHERE id = $1
              AND ${dailyCheckItemOwedBySql('daily_check_items', '$2')}
         )
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

/**
 * A shift member can act on recurring and unowned work; an owned one-off is
 * limited to its assigned staffer.
 */
export async function dailyCheckItemBelongsToStaff(args: {
  orgId: string;
  itemId: number;
  staffId: number;
}): Promise<boolean> {
  const res = await tenantQuery<{ id: number }>(
    args.orgId,
    `SELECT id FROM daily_check_items
      WHERE id = $1
        AND ${dailyCheckItemOwedBySql('daily_check_items', '$2')}`,
    [args.itemId, args.staffId],
  );
  return res.rows.length > 0;
}

/**
 * Reset all: drop the CALLER's marks for one civil day. Scoped to one staffer
 * on purpose — a shared eraser would let anyone delete a colleague's
 * attestation, and the marks table is the only attribution trail there is.
 *
 * Marks are day-keyed, so this never reaches yesterday's report.
 *
 * @returns how many ticks were cleared (0 on an already-empty day).
 */
export async function clearDailyCheckMarks(args: {
  orgId: string;
  staffId: number;
  dateKey: string;
}): Promise<number> {
  const { orgId, staffId, dateKey } = args;
  return withTenantTransaction(orgId, async (client) => {
    const res = await client.query(
      `DELETE FROM daily_check_marks
             WHERE staff_id = $1 AND marked_on = $2::date`,
      [staffId, dateKey],
    );
    return res.rowCount ?? 0;
  });
}

/**
 * Append an item to the list, live from `effectiveFrom` (a civil day).
 *
 * A `once` item carries BOTH facts in this one statement: `kind = 'once'` AND
 * the one-day window (`retired_at = effective_from + 1`), so past reports stay
 * honest for free and tomorrow's list drops it without any sweep job. A
 * `recurring` item leaves `retired_at` null, exactly as before.
 */
export async function createDailyCheckItem(args: {
  orgId: string;
  title: string;
  description?: string | null;
  effectiveFrom: string;
  kind: 'recurring' | 'once';
  assignedStaffId?: number | null;
  glyph?: string | null;
  /** Civil `HH:MM` in the warehouse zone, or null. */
  dueTime?: string | null;
  /** Minutes before `dueTime`; the route guarantees a due time rides with it. */
  remindOffsetMinutes?: number | null;
}): Promise<DailyCheckItem> {
  const { orgId, title, description, effectiveFrom, kind, assignedStaffId, glyph } = args;
  const dueTime = args.dueTime ?? null;
  const remindOffsetMinutes = args.remindOffsetMinutes ?? null;
  return withTenantTransaction(orgId, async (client) => {
    // Append: one past the current max, so a new item never displaces the order
    // operators already know.
    const res = await client.query<ItemRow>(
      `INSERT INTO daily_check_items
         (title, description, sort_order, effective_from, retired_at, kind, assigned_staff_id, glyph,
          due_time, remind_offset_minutes)
       VALUES ($1,
               $2,
               COALESCE((SELECT MAX(sort_order) + 1 FROM daily_check_items), 0),
               $3::date,
               CASE WHEN $4::text = 'once' THEN $3::date + 1 ELSE NULL END,
               $4::text,
               $5,
               $6,
               $7::time,
               $8::int)
         RETURNING id, sort_order`,
      [
        title,
        description ?? null,
        effectiveFrom,
        kind,
        assignedStaffId ?? null,
        glyph ?? null,
        dueTime,
        remindOffsetMinutes,
      ],
    );
    const id = toNum(res.rows[0].id);
    let assignedStaffName: string | null = null;
    if (assignedStaffId != null) {
      // Same transaction: the FK would catch a stale id anyway, but this way a
      // vanished owner is a clean 400 from the route, not a 500 from the FK.
      const name = await client.query<{ name: string }>(
        `SELECT name FROM staff WHERE id = $1`,
        [assignedStaffId],
      );
      assignedStaffName = name.rows[0]?.name ?? null;
    }
    return {
      id,
      title,
      description: description ?? null,
      sortOrder: toNum(res.rows[0].sort_order as string | number),
      kind,
      assignedStaffId: assignedStaffId ?? null,
      assignedStaffName,
      glyph: glyph ?? null,
      // A freshly INSERTed item has no links yet — the composer attaches them
      // in a second call, so the row it returns is honestly ticket-less.
      ticketId: null,
      dueTime,
      remindOffsetMinutes,
    };
  });
}

/** The fields {@link updateDailyCheckItem} may change; at least one is present. */
export interface DailyCheckItemPatch {
  title?: string;
  /** Civil `HH:MM`, or null to clear — clearing it also clears the reminder. */
  dueTime?: string | null;
  remindOffsetMinutes?: number | null;
}

/** The patched fields as they stood before the edit — the audit row's `before`. */
export interface DailyCheckItemPrevious {
  title: string;
  dueTime: string | null;
  remindOffsetMinutes: number | null;
}

export type UpdateDailyCheckItemResult =
  | { ok: true; item: DailyCheckItem; previous: DailyCheckItemPrevious }
  | { ok: false; reason: 'not_found' | 'offset_requires_due_time' };

/**
 * Edit a LIVE item's wording or its due time / reminder. Titles are NOT
 * versioned — one `title` column, and a past report reads the live row — so a
 * rename rewrites what last month's report says a staffer attested to. That is
 * the intended behaviour (decision A, 2026-09-15): the common edit is a typo or
 * a clarification, the marks still point at the same item id, and the route
 * writes an audit row carrying before/after so a manager can see the
 * correction. The alternative (retire + create) mints a new id, orphans the
 * marks, and breaks the one-item-one-identity property that makes a ticket row
 * joinable across days. A due time is the same kind of fact: it moves when the
 * item rings, not what any past report measured.
 *
 * CADENCE AND OWNER ARE NOT EDITABLE HERE, and that is not an oversight: `kind`
 * and `assigned_staff_id` feed the PER-STAFF DENOMINATOR in
 * `buildDailyCheckReport`, so flipping `recurring → once` changes the
 * arithmetic of every past report rather than its wording. Retire the item and
 * add the replacement instead.
 *
 * LIVE means "on the list on `dayKey`" ({@link dailyCheckItemLiveOnSql}) — NOT
 * `retired_at IS NULL`. A `once` item is born with `retired_at =
 * effective_from + 1` so it drops off tomorrow without a sweep job, so a
 * null-check would refuse to edit every one-off — which is every row the
 * Ticket face writes. `not_found` means no such row on that day's list in this
 * tenant; the route answers 404.
 *
 * Clearing the due time clears the reminder with it (an offset from nothing is
 * meaningless). Setting an offset on an item that has no due time trips the
 * named CHECK `daily_check_items_remind_offset_range` and answers
 * `offset_requires_due_time` rather than a 500.
 *
 * Returns the PREVIOUS values alongside the new row, because the audit entry
 * is worthless without them ("someone edited item 12" tells a manager
 * nothing). They come out of the same statement — an UPDATE's `FROM` sees the
 * pre-update snapshot — rather than a read-then-write pair, which would report
 * a stale `before` whenever two edits race.
 */
export async function updateDailyCheckItem(args: {
  orgId: string;
  itemId: number;
  patch: DailyCheckItemPatch;
  /** The civil day the edit is made on — the window this row must be live in. */
  dayKey: string;
}): Promise<UpdateDailyCheckItemResult> {
  const { orgId, itemId, patch, dayKey } = args;
  const setsDueTime = patch.dueTime !== undefined;
  const setsOffset = patch.remindOffsetMinutes !== undefined;
  try {
    return await withTenantTransaction(orgId, async (client) => {
      // RETURNING the whole row, not just an ack: the client patches its cache
      // from this, and the owner name + linked ticket must survive the edit — a
      // partial row would blank the phone's ticket mark until the next refetch.
      const res = await client.query<
        ItemRow & {
          previous_title: string;
          previous_due_time: string | null;
          previous_remind_offset_minutes: number | null;
        }
      >(
        `UPDATE daily_check_items i
            SET title = COALESCE($2::text, i.title),
                due_time = CASE WHEN $4::boolean THEN $5::time ELSE i.due_time END,
                remind_offset_minutes = CASE
                  WHEN $6::boolean THEN $7::int
                  WHEN $4::boolean AND $5::time IS NULL THEN NULL
                  ELSE i.remind_offset_minutes
                END,
                updated_at = now()
           FROM daily_check_items prev
          WHERE i.id = $1
            AND prev.id = i.id
            AND ${dailyCheckItemLiveOnSql('i', '$3::date')}
         RETURNING i.id, i.title, i.description, i.sort_order, i.kind, i.assigned_staff_id, i.glyph,
                   to_char(i.due_time, 'HH24:MI') AS due_time, i.remind_offset_minutes,
                   prev.title AS previous_title,
                   to_char(prev.due_time, 'HH24:MI') AS previous_due_time,
                   prev.remind_offset_minutes AS previous_remind_offset_minutes,
                   (SELECT s.name FROM staff s WHERE s.id = i.assigned_staff_id)
                     AS assigned_staff_name,
                   (SELECT l.entity_id
                      FROM daily_check_item_links l
                     WHERE l.item_id = i.id AND l.entity_type = 'ZENDESK_TICKET'
                     ORDER BY l.created_at ASC, l.id ASC
                     LIMIT 1) AS ticket_id`,
        [
          itemId,
          patch.title ?? null,
          dayKey,
          setsDueTime,
          patch.dueTime ?? null,
          setsOffset,
          patch.remindOffsetMinutes ?? null,
        ],
      );
      const row = res.rows[0];
      if (!row) return { ok: false, reason: 'not_found' } as const;
      return {
        ok: true,
        item: itemFromRow(row),
        previous: {
          title: row.previous_title,
          dueTime: row.previous_due_time,
          remindOffsetMinutes: row.previous_remind_offset_minutes,
        },
      } as const;
    });
  } catch (error: unknown) {
    // Caught OUTSIDE the transaction: the failed statement already aborted it,
    // and the wrapper has rolled back by the time we see the error.
    const pg = error as { code?: string; constraint?: string };
    if (pg?.code === '23514' && pg.constraint === 'daily_check_items_remind_offset_range') {
      return { ok: false, reason: 'offset_requires_due_time' };
    }
    throw error;
  }
}

/**
 * Retire an item from `retiredAt` onward. NEVER a delete: the marks reference
 * it, and every past report that included it must keep rendering it.
 *
 * The guard is the WINDOW, not `retired_at IS NULL`. A `once` item is created
 * with `retired_at = effective_from + 1` — that is how it leaves tomorrow's
 * list without a sweep job — so a null-check silently refused to remove every
 * one-off, answering `{ ok: true, changed: false }` while the row stayed on the
 * list. Closing the window EARLY (to `retiredAt`) is the same operation for
 * both cadences.
 *
 * Still idempotent: a second retire finds `retired_at = retiredAt`, which is
 * not `> retiredAt`, updates nothing, and answers `changed: false`.
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
        WHERE id = $1
          AND (retired_at IS NULL OR retired_at > $2::date)`,
      [itemId, retiredAt],
    );
    return (res.rowCount ?? 0) > 0;
  });
}

interface LinkRow {
  id: string | number;
  item_id: string | number;
  entity_type: DailyCheckLinkEntityType;
  /** Null on TRACKING rows — the tracking string rides `label`. */
  entity_id: string | number | null;
  label: string | null;
  created_at: Date;
}

function toLink(row: LinkRow): DailyCheckItemLink {
  return {
    id: toNum(row.id),
    itemId: toNum(row.item_id),
    entityType: row.entity_type,
    entityId: row.entity_id == null ? null : toNum(row.entity_id),
    label: row.label,
    createdAt: row.created_at.toISOString(),
  };
}

/** True when this staffer is addressable in the tenant (owner pre-check). */
export async function dailyCheckStaffExists(args: {
  orgId: string;
  staffId: number;
}): Promise<boolean> {
  const res = await tenantQuery<{ id: number }>(
    args.orgId,
    `SELECT id FROM staff WHERE id = $1`,
    [args.staffId],
  );
  return res.rows.length > 0;
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
  /** Null on TRACKING — the tracking string rides `label` instead. */
  entityId: number | null;
  label?: string | null;
  createdByStaffId: number;
}): Promise<DailyCheckItemLink> {
  const { orgId, itemId, entityType, entityId, label, createdByStaffId } = args;
  return withTenantTransaction(orgId, async (client) => {
    // TRACKING dedupes on (org, item, label) via the partial unique index —
    // the natural key cannot see NULL entity_id rows. Same idempotent
    // re-attach semantics as the entity-id shapes.
    const res =
      entityType === 'TRACKING'
        ? await client.query<LinkRow>(
            `INSERT INTO daily_check_item_links
               (organization_id, item_id, entity_type, entity_id, label, created_by_staff_id)
             VALUES ($1, $2, 'TRACKING', NULL, $3, $4)
             ON CONFLICT (organization_id, item_id, label) WHERE entity_type = 'TRACKING'
             DO UPDATE SET updated_at = now()
             RETURNING id, item_id, entity_type, entity_id, label, created_at`,
            [orgId, itemId, label ?? null, createdByStaffId],
          )
        : await client.query<LinkRow>(
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
