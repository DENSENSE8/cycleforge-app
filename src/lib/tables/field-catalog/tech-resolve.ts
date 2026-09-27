/** Tech bench slot resolvers — row + fieldId → the resolved fact a slot cell paints. */

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

/**
 * The test scan step. `who` stays null by design: `techRecordToQueueRow` sets
 * `tested_by` and no name alias, and `CompoundStageStep` already
 * treats a bare staff id as an actor (`hasActor = actorId || actorName`).
 */
function testedStep(row: QueueRowRecord): CompoundSlotValue {
  return {
    kind: 'stage_event',
    who: null,
    whoStaffId: staffId(row.tested_by),
    at: stamp(row.test_date_time),
    station: null,
  };
}

/**
 * Resolve one bound field for one row. Unknown field id → null (the cell
 * dashes); the layout resolver has already dropped stale bindings, so this is
 * defense in depth, not a code path a valid layout reaches.
 */
export function resolveTechSlotValue(
  row: QueueRowRecord,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'tech.order_id':
      return { kind: 'value', text: str(row, 'order_id') };
    case 'tech.tested':
      return testedStep(row);
    case 'tech.qty':
      return { kind: 'value', text: str(row, 'quantity') };
    case 'tech.condition': {
      const label = conditionGradeTableLabel(str(row, 'condition'));
      return { kind: 'value', text: label === EMPTY_META_DASH ? null : label };
    }
    case 'tech.serial':
      return { kind: 'value', text: str(row, 'serial_number') };
    case 'tech.sku':
      return { kind: 'value', text: str(row, 'sku') };
    case 'tech.item_number':
      return { kind: 'value', text: str(row, 'item_number') };
    case 'tech.notes':
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
export function techSlotValuesFor(
  row: QueueRowRecord,
  columns: readonly { key: string; fieldId?: string }[],
): Readonly<Record<string, CompoundSlotValue>> | undefined {
  let slots: Record<string, CompoundSlotValue> | undefined;
  for (const col of columns) {
    if (!col.fieldId) continue;
    const value = resolveTechSlotValue(row, col.fieldId);
    if (!value) continue;
    (slots ??= {})[col.key] = value;
  }
  return slots;
}
