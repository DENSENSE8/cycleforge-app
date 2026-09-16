/**
 * Packer bench slot resolvers — row + fieldId → the resolved fact a slot cell
 * paints. Pure functions; no React, no hooks, no fetch, no clock.
 *
 * The row is the shared `QueueRowRecord` that `packerRecordToQueueRow`
 * produced. Unlike the tech bench, that mapper DOES project name aliases for
 * both actors (`tested_by_name` / `tester_name`, `packed_by_name`), so both
 * steps below can paint a name; the staff id still rides along so the cell
 * can draw the avatar.
 *
 * Neither step resolves a `station`: the mapper projects no bench label, and
 * an invented one would be a column that disagrees with the floor.
 */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { QueueRowRecord } from '@/components/dashboard/orders-queue/helpers';
import { nonSentinelTimestamp } from '@/components/dashboard/orders-queue/helpers';
import { conditionGradeTableLabel, EMPTY_META_DASH } from '@/lib/conditions';
import { formatMonthDayTimePST } from '@/utils/date';

function str(row: QueueRowRecord, key: string): string | null {
  const s = String(row[key] ?? '').trim();
  return s || null;
}

/** Positive staff ids only — `0` / `null` is "unclaimed", not staffer zero. */
function staffId(...candidates: unknown[]): number | null {
  for (const candidate of candidates) {
    const id = Number(candidate);
    if (Number.isFinite(id) && id > 0) return id;
  }
  return null;
}

function stamp(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    const raw = nonSentinelTimestamp(candidate as string | null | undefined);
    if (!raw) continue;
    const formatted = formatMonthDayTimePST(raw);
    if (formatted && formatted !== '—') return formatted;
  }
  return null;
}

/** The UPSTREAM test stamp carried on a packer row — scan actor, then assignee. */
function testedStep(row: QueueRowRecord): CompoundSlotValue {
  // `---` is the queue's "nobody" face — a step line omits it rather than
  // painting a placeholder where a name goes.
  const tester = str(row, 'tested_by_name') ?? str(row, 'tester_name');
  return {
    kind: 'stage_event',
    who: tester === '---' ? null : tester,
    whoStaffId: staffId(row.tested_by, row.tester_id),
    at: stamp(row.test_date_time),
    station: null,
  };
}

/** This bench's own scan. */
function packedStep(row: QueueRowRecord): CompoundSlotValue {
  const packer = str(row, 'packed_by_name');
  return {
    kind: 'stage_event',
    who: packer === '---' ? null : packer,
    whoStaffId: staffId(row.packed_by, row.packer_id),
    at: stamp(row.packed_at),
    station: null,
  };
}

/**
 * Resolve one bound field for one row. Unknown field id → null (the cell
 * dashes); the layout resolver has already dropped stale bindings, so this is
 * defense in depth, not a code path a valid layout reaches.
 */
export function resolvePackerSlotValue(
  row: QueueRowRecord,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'packer.order_id':
      return { kind: 'value', text: str(row, 'order_id') };
    case 'packer.tested':
      return testedStep(row);
    case 'packer.packed':
      return packedStep(row);
    case 'packer.qty':
      return { kind: 'value', text: str(row, 'quantity') };
    case 'packer.condition': {
      const label = conditionGradeTableLabel(str(row, 'condition'));
      return { kind: 'value', text: label === EMPTY_META_DASH ? null : label };
    }
    case 'packer.serial':
      return { kind: 'value', text: str(row, 'serial_number') };
    case 'packer.sku':
      return { kind: 'value', text: str(row, 'sku') };
    case 'packer.item_number':
      return { kind: 'value', text: str(row, 'item_number') };
    case 'packer.notes':
      return { kind: 'value', text: str(row, 'notes') };
    default:
      return null;
  }
}

/**
 * Every bound slot for one row, keyed by TRACK key — the `slots` half of the
 * shared `CompoundRowView`. Built from the MOUNTED column model, so a rebind
 * re-points the cell with no change here.
 */
export function packerSlotValuesFor(
  row: QueueRowRecord,
  columns: readonly { key: string; fieldId?: string }[],
): Readonly<Record<string, CompoundSlotValue>> | undefined {
  let slots: Record<string, CompoundSlotValue> | undefined;
  for (const col of columns) {
    if (!col.fieldId) continue;
    const value = resolvePackerSlotValue(row, col.fieldId);
    if (!value) continue;
    (slots ??= {})[col.key] = value;
  }
  return slots;
}
