/** Import-exception slot resolvers — row + fieldId → the resolved fact a slot cell paints. */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { ImportExceptionRow } from '@/features/review/catalog-link/import-exception-types';
import { sourcePlatformMetaFromLabel } from '@/lib/source-platform';
import { formatDateKeyShort } from '@/utils/date';

function str(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

function dayText(iso: string | null | undefined): string | null {
  const raw = str(iso);
  return raw ? formatDateKeyShort(raw.slice(0, 10)) : null;
}

/**
 * Resolve one bound field for one row. Unknown field id → null (the cell
 * dashes); the layout resolver has already dropped stale bindings.
 */
export function resolveImportExceptionSlotValue(
  row: ImportExceptionRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'import-exception.order':
      return { kind: 'value', text: str(row.accountOrderId) };
    case 'import-exception.source': {
      const meta = sourcePlatformMetaFromLabel(row.accountSource);
      return { kind: 'value', text: str(meta.label) ?? str(row.accountSource) };
    }
    case 'import-exception.tracking':
      return { kind: 'value', text: str(row.tracking) };
    case 'import-exception.sheet':
      // A row that did not come from a sheet has no sheet row — a dash, not a
      // zero that would read as "the first line".
      return { kind: 'value', text: row.sheetRow == null ? null : String(row.sheetRow) };
    case 'import-exception.seen':
      // Seen ONCE is the ordinary case and says nothing; the count is only a
      // signal when it repeats, which is exactly what the note line already
      // shows. Blank below two, so a bound column carries signal, not noise.
      return { kind: 'value', text: row.seenCount > 1 ? `×${row.seenCount}` : null };
    case 'import-exception.first':
      return { kind: 'value', text: dayText(row.firstSeenAt) };
    case 'import-exception.last':
      return { kind: 'value', text: dayText(row.lastSeenAt) };
    default:
      return null;
  }
}

/**
 * Every bound slot for one row, keyed by TRACK key — the `slots` half of the
 * shared `CompoundRowView`. Built from the MOUNTED model so a rebind re-points
 * the cell with no change here.
 */
export function importExceptionSlotValuesFor(
  row: ImportExceptionRow,
  columns: readonly { key: string; fieldId?: string }[],
): Readonly<Record<string, CompoundSlotValue>> | undefined {
  let slots: Record<string, CompoundSlotValue> | undefined;
  for (const col of columns) {
    if (!col.fieldId) continue;
    const value = resolveImportExceptionSlotValue(row, col.fieldId);
    if (!value) continue;
    slots ??= {};
    slots[col.key] = value;
  }
  return slots;
}
