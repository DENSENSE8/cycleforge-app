import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

/** Client-only flag on a serial_units snapshot while add/remove is in flight. */
export type OptimisticSerialFlag = 'adding' | 'removing';

export type LineSerial = NonNullable<ReceivingLineRow['serials']>[number] & {
  _optimistic?: OptimisticSerialFlag;
};

export function mintOptimisticSerialId(): number {
  return -(Date.now() % 1_000_000_000) - Math.floor(Math.random() * 1000);
}

function normSerial(sn: string): string {
  return sn.trim().toUpperCase();
}

export function appendOptimisticSerial(
  serials: LineSerial[] | null | undefined,
  serialNumber: string,
  tempId: number,
): LineSerial[] {
  const sn = serialNumber.trim();
  if (!sn) return [...(serials ?? [])];
  const norm = normSerial(sn);
  const base = [...(serials ?? [])];
  const existing = base.find(
    (s) => normSerial(s.serial_number) === norm && s._optimistic !== 'removing',
  );
  if (existing) return base;
  return [...base, { id: tempId, serial_number: sn, _optimistic: 'adding' }];
}

export function confirmOptimisticSerial(
  serials: LineSerial[] | null | undefined,
  tempId: number,
  serialUnit: { id?: number; serial_number?: string | null } | null | undefined,
): LineSerial[] {
  if (!serialUnit?.id) {
    return (serials ?? []).filter((s) => s.id !== tempId);
  }
  const sn = String(serialUnit.serial_number ?? '').trim();
  const norm = normSerial(sn);
  const withoutTemp = (serials ?? []).filter((s) => s.id !== tempId);
  if (withoutTemp.some((s) => s.id === serialUnit.id || normSerial(s.serial_number) === norm)) {
    return withoutTemp.map((s) => {
      const { _optimistic, ...rest } = s;
      return rest;
    });
  }
  return [
    ...withoutTemp,
    {
      id: serialUnit.id,
      serial_number: sn,
      condition_grade:
        (serialUnit as { condition_grade?: string | null }).condition_grade ?? null,
    },
  ];
}

export function rollbackOptimisticSerial(
  serials: LineSerial[] | null | undefined,
  tempId: number,
): LineSerial[] {
  return (serials ?? []).filter((s) => s.id !== tempId);
}

export function markSerialRemoving(
  serials: LineSerial[] | null | undefined,
  serialUnitId: number,
): LineSerial[] {
  return (serials ?? []).map((s) =>
    s.id === serialUnitId ? { ...s, _optimistic: 'removing' } : s,
  );
}

export function clearSerialRemoving(
  serials: LineSerial[] | null | undefined,
  serialUnitId: number,
): LineSerial[] {
  return (serials ?? []).map((s) => {
    if (s.id !== serialUnitId) return s;
    const { _optimistic, ...rest } = s;
    return rest;
  });
}

export function removeSerialById(
  serials: LineSerial[] | null | undefined,
  serialUnitId: number,
): LineSerial[] {
  return (serials ?? []).filter((s) => s.id !== serialUnitId);
}

/**
 * Clear a deleted serial from materialised `receiving_line_unit` rows so the
 * Units list cannot resurrect it via a stale `serial_unit_id` / `serial`
 * snapshot after {@link removeSerialById}.
 */
export function unlinkSerialFromLineUnits<
  T extends { serial_unit_id: number | null; serial?: string | null },
>(
  units: ReadonlyArray<T> | null | undefined,
  serialUnitId: number,
): T[] | null {
  if (units == null) return null;
  if (units.length === 0) return [];
  let changed = false;
  const next = units.map((u) => {
    if (u.serial_unit_id !== serialUnitId) return u;
    changed = true;
    return { ...u, serial_unit_id: null, serial: null };
  });
  return changed ? next : [...units];
}

/** Optimistically stamp (or clear) a per-unit condition grade onto one serial. */
export function setSerialGrade(
  serials: LineSerial[] | null | undefined,
  serialUnitId: number,
  grade: string | null,
): LineSerial[] {
  const next =
    grade != null && String(grade).trim()
      ? String(grade).trim().toUpperCase()
      : null;
  return (serials ?? []).map((s) =>
    s.id === serialUnitId ? { ...s, condition_grade: next } : s,
  );
}

export function readOptimisticFlag(
  serial: { _optimistic?: OptimisticSerialFlag },
): OptimisticSerialFlag | undefined {
  return serial._optimistic;
}

/** Minimal unit slot shape for {@link bindSerialsToUnitSlots}. */
type BindableUnitSlot = {
  serial_unit_id: number | null;
  serial_absent?: boolean;
};

/**
 * Resolve one serial per materialised unit for multi-qty UI.
 *
 * 1. Units with `serial_unit_id` take their matching saved serial (claimed).
 * 2. Remaining unbound saved serials (not `_optimistic: 'removing'`) fill empty
 *    non-waived units in ordinal order.
 *
 * Step 2 covers optimistic / post-confirm scans that update `serials` before
 * `receiving_line_unit.serial_unit_id` is refreshed — without it, every slot
 * stays "empty", `primaryInputRef` sticks on unit 0, and focus snaps back.
 */
export function bindSerialsToUnitSlots<T extends { id: number; _optimistic?: OptimisticSerialFlag }>(
  units: ReadonlyArray<BindableUnitSlot>,
  saved: ReadonlyArray<T>,
): Array<T | null> {
  const claimedIds = new Set<number>();
  const removingClaimedIds = new Set<number>();
  const linked: Array<T | null> = units.map((unit) => {
    if (unit.serial_unit_id == null) return null;
    claimedIds.add(unit.serial_unit_id);
    const hit = saved.find((s) => s.id === unit.serial_unit_id) ?? null;
    // In-flight delete: keep the id claimed so another serial does not jump
    // into this slot, but render the slot empty until remove finishes.
    if (hit?._optimistic === 'removing') {
      removingClaimedIds.add(unit.serial_unit_id);
      return null;
    }
    return hit;
  });

  const unbound = saved.filter(
    (s) => !claimedIds.has(s.id) && s._optimistic !== 'removing',
  );
  let nextUnbound = 0;
  return linked.map((serial, index) => {
    if (serial) return serial;
    if (units[index]?.serial_absent) return null;
    const unitSerialId = units[index]?.serial_unit_id;
    if (unitSerialId != null && removingClaimedIds.has(unitSerialId)) {
      return null;
    }
    const take = unbound[nextUnbound];
    if (!take) return null;
    nextUnbound += 1;
    return take;
  });
}
