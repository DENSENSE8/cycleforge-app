/**
 * Daily checklist — the shapes the surface and the report share.
 *
 * Pure types. No React, no DB, no fetch: the read model in `report.ts` is the
 * only thing that assembles them, and both the API route and the Home surface
 * consume its output unchanged (Kinetic Ledger law 4 — views stay dumb).
 */

/** One item on the fixed daily list, as it stood on the requested day. */
export interface DailyCheckItem {
  id: number;
  title: string;
  sortOrder: number;
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
  /** Items in effect that day — the denominator, same for everyone. */
  total: number;
  /** Newest mark instant, or null when they checked nothing. */
  lastMarkedAt: string | null;
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
  /** `items.length * staff.length` — what a fully-checked day would score. */
  totalPossible: number;
}

/** Allowed parents a daily-check item can name. Named CHECK in SQL. */
export const DAILY_CHECK_LINK_ENTITY_TYPES = ['ZENDESK_TICKET', 'WORK_ORDER'] as const;
export type DailyCheckLinkEntityType = (typeof DAILY_CHECK_LINK_ENTITY_TYPES)[number];

/** One typed connection on a daily-check item. */
export interface DailyCheckItemLink {
  id: number;
  itemId: number;
  entityType: DailyCheckLinkEntityType;
  entityId: number;
  label: string | null;
  createdAt: string;
}
