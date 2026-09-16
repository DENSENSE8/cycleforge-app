/**
 * Daily checklist — the shapes the surface and the report share.
 *
 * Pure types. No React, no DB, no fetch: the read model in `report.ts` is the
 * only thing that assembles them, and both the API route and the Home surface
 * consume its output unchanged (Kinetic Ledger law 4 — views stay dumb).
 */

/**
 * Cadence, not subject (operator ruling 2026-09-15): `recurring` is the shift
 * attestation that returns every day; `once` must NOT come back tomorrow.
 * "Type" was rejected because the surface is already called Daily.
 */
export type DailyCheckItemKind = 'recurring' | 'once';

/** One item on the fixed daily list, as it stood on the requested day. */
export interface DailyCheckItem {
   id: number;
   title: string;
   sortOrder: number;
  kind: DailyCheckItemKind;
  /**
   * Who a `once` item belongs to. Null = the whole shift, which stays correct
   * for every recurring item. An owner is a hint about who should tick, never
   * a permission — the mark route does not gate on it.
   */
  assignedStaffId: number | null;
  /** Owner display name (LEFT JOIN on staff), null when unowned. */
  assignedStaffName: string | null;
  /** The emoji character itself (≤8 chars), not an icon name. Null = none. */
  glyph: string | null;
  /**
   * The first linked Zendesk ticket id, or null on a plain task.
   *
   * Rides the items read (a LATERAL in `ITEMS_ON_DAY_SQL`) because both the
   * phone row's ticket mark and the manager report's ticket grouping need
   * "is this a ticket?" per row, and neither can afford a links request per
   * item. The full link list (WO / tracking too) stays in the links call.
   */
  ticketId: number | null;
}

/** The create-body the composer mounts share — one vocabulary, two mounts. */
export interface DailyCheckCreateInput {
  title: string;
  kind?: DailyCheckItemKind;
  /** Only valid with `kind: 'once'`; the route refuses it otherwise. */
  assignedStaffId?: number | null;
  /** The emoji character itself (≤8 chars), or null. */
  glyph?: string | null;
}

/** One confirmation: this staffer ticked this item on the requested day. */
export interface DailyCheckMarkFact {
  itemId: number;
  staffId: number;
  /** Instant (ISO). The civil day lives on the request, not on the row. */
  markedAt: string;
  note: string | null;
}

/** A person on the roster — supplied by the caller, never inferred from marks. */
export interface DailyCheckStaffMember {
  staffId: number;
  name: string;
}

/**
 * One staffer's day. `doneItemIds` is ordered to match `report.items`, so the
 * view can render a row of ticks without re-sorting.
 */
export interface DailyCheckStaffRow {
  staffId: number;
  name: string;
  doneItemIds: number[];
  doneCount: number;
  /**
   * Items THIS staffer is responsible for that day — recurring + unowned +
   * owned by them. The denominator is per-staff because an owned one-off in
   * everyone's count is the "1 of 5 done forever" the owner field exists to
   * prevent.
   */
  total: number;
  /** Newest mark instant, or null when they checked nothing. */
  lastMarkedAt: string | null;
  /**
   * WHEN each item was checked — `itemId` → ISO instant.
   *
   * The end the whole feature serves (operator 2026-09-15): *"the manager would
   * be able to look at all the daily reports via a certain day and have things
   * available like the staff member checked off this checklist at this time,
   * completed this task at this time."* `lastMarkedAt` answers only "when did
   * they last touch it"; a manager reading a shift needs the instant PER task.
   * `daily_check_marks.marked_at` has always carried it — the report used to
   * throw it away here, which made the per-task timeline unbuildable without a
   * second query.
   */
  markedAtByItemId: Readonly<Record<number, string>>;
}

/** The whole day: the list, everyone's progress, and the viewer's own row. */
export interface DailyCheckReport {
  /** Warehouse civil day, `YYYY-MM-DD`. */
  dateKey: string;
  items: DailyCheckItem[];
  /** Every rostered staffer, including those who checked nothing. */
  staff: DailyCheckStaffRow[];
  /**
   * The viewer's own row, always present even when they are off the roster
   * (a lead viewing a day they did not work still gets a well-formed row).
   */
  mine: DailyCheckStaffRow;
   /** Ticks recorded across everyone — the report's headline numerator. */
   totalDone: number;
  /** Sum of every staffer's own denominator — what a fully-checked day scores. */
   totalPossible: number;
 }

/**
 * Allowed parents a daily-check item can name. Named CHECK in SQL.
 *
 * `TRACKING` is the string-shaped member: the number rides `label` with a null
 * `entityId` (same convention as derived thread connections), because a
 * carrier tracking number is not an integer entity id.
 */
export const DAILY_CHECK_LINK_ENTITY_TYPES = [
  'ZENDESK_TICKET',
  'WORK_ORDER',
  'TRACKING',
];
export type DailyCheckLinkEntityType = (typeof DAILY_CHECK_LINK_ENTITY_TYPES)[number];

/** One typed connection on a daily-check item. */
export interface DailyCheckItemLink {
  id: number;
   itemId: number;
   entityType: DailyCheckLinkEntityType;
  /** Null on TRACKING links — the value is the tracking string in `label`. */
  entityId: number | null;
   label: string | null;
   createdAt: string;
 }


/** One link an inspector or composer attaches — the write-side shape. */
export interface DailyCheckLinkInput {
  entityType: DailyCheckLinkEntityType;
  /** Null on TRACKING — the tracking string rides `label`. */
  entityId?: number | null;
  label?: string | null;
}