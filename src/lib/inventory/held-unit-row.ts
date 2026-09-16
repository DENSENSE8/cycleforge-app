/**
 * One row of the Holds desk — a `serial_units` row in `ON_HOLD` joined to the
 * HELD event that put it there, wire-safe.
 *
 * Lifted out of `/inventory/holds/page.tsx` so the RSC page, the resolver
 * and the adapter can all name the same shape. The page is a server component
 * and the table is a client island, so this is the type that crosses the
 * boundary.
 *
 * ## What crosses, and what deliberately does not
 *
 * - `held_at` is an ISO STRING, not a `Date`. The slot resolver's law is that
 *   the same row resolves the same text at any time, and an instant that has
 *   to survive the RSC boundary is a string on both sides of it.
 * - `condition_grade` and `notes` (the UNIT's own note, not the hold's) are
 *   selected by `loadHeldUnits` and painted by NOTHING — the retired table had
 *   seven columns and neither fact was one of them. They stop here: a fact no
 *   cell paints is not a catalog entry, and `admin-holds.test.ts` fails the day
 *   one of them reappears in a field `paths`.
 * - `held_by_staff_id` is NEW to the read, and is the only thing this port adds
 *   to the query. The lateral already joins `staff` on `h.actor_staff_id`, so
 *   the id was in scope and thrown away; the retired cell printed
 *   `held_by_name ?? 'system'`, which is a name-or-placeholder string. `held_by`
 *   is a PERSON fact, and a person face needs the staff id to draw an avatar.
 *
 * Field names stay snake_case — the wire names the catalog documents in its
 * `paths`.
 */

/** The raw `SELECT` shape `loadHeldUnits` reads out of `serial_units`. */
export interface HeldUnitQueryRow {
  id: number;
  serial_number: string;
  sku: string | null;
  /** Selected, painted by nothing. Dropped by {@link toHeldUnitRow}. */
  condition_grade: string | null;
  /** The UNIT's note. Selected, painted by nothing; `hold_reason` is the hold's. */
  notes: string | null;
  hold_reason: string | null;
  restore_status: string | null;
  held_at: Date | string | null;
  held_by_staff_id: number | null;
  held_by_name: string | null;
}

/** The desk row — what the client island and the family resolver read. */
export interface HeldUnitRow {
  id: number;
  serial_number: string;
  sku: string | null;
  /** `inventory_events.notes` on the HELD event — why this unit is quarantined. */
  hold_reason: string | null;
  /** `payload.restore_status` — the state a release rolls back to, if recorded. */
  restore_status: string | null;
  /** Absolute instant, ISO-8601. */
  held_at: string | null;
  held_by_staff_id: number | null;
  held_by_name: string | null;
}

/**
 * Where a release puts the unit back when the HELD payload recorded nothing.
 *
 * `hold.ts` rolls a unit back to its pre-hold lifecycle state from the event
 * payload; a hold written before that payload existed has no such state, and
 * stock is where an un-quarantined unit belongs. The retired cell printed the
 * same coalesce (`restore_status ?? 'STOCKED'`) — this is that expression, once.
 */
export const DEFAULT_HOLD_RESTORE_STATUS = 'STOCKED' as const;

/**
 * The restore-status override vocabulary — the lifecycle states an operator may
 * force a release into instead of the auto-recovered one.
 *
 * `''` is AUTO (use the payload's `restore_status`), and it is first because it
 * is the default: overriding the recovered state is the exception, which is why
 * the retired `<select>` defaulted to blank.
 */
export const HOLD_RESTORE_OPTIONS = [
  '',
  'STOCKED',
  'TRIAGED',
  'IN_REPAIR',
  'REPAIR_DONE',
  'IN_TEST',
  'GRADED',
  'ALLOCATED',
  'PICKED',
  'PACKED',
  'LABELED',
  'STAGED',
] as const;

/** The EFFECTIVE restore target for a held unit — never a blank pill. */
export function holdRestoreStatus(row: HeldUnitRow): string {
  const recorded = String(row.restore_status ?? '').trim();
  return recorded || DEFAULT_HOLD_RESTORE_STATUS;
}

/** Query row → desk row. Pure; the only place `held_at` stops being a `Date`. */
export function toHeldUnitRow(raw: HeldUnitQueryRow): HeldUnitRow {
  const held = raw.held_at;
  return {
    id: raw.id,
    serial_number: raw.serial_number,
    sku: raw.sku,
    hold_reason: raw.hold_reason,
    restore_status: raw.restore_status,
    held_at:
      held instanceof Date
        ? held.toISOString()
        : String(held ?? '').trim() || null,
    held_by_staff_id: raw.held_by_staff_id,
    held_by_name: raw.held_by_name,
  };
}
