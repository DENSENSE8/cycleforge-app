/** One row of the Holds desk — a `serial_units` row in `ON_HOLD` joined to the HELD event that put it there, wire-safe. */

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

/** Where a release puts the unit back when the HELD payload recorded nothing. */
export const DEFAULT_HOLD_RESTORE_STATUS = 'STOCKED' as const;

/** The restore-status override vocabulary — the lifecycle states an operator may force a release into instead of the auto-recovered one. */
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
