/** Catalog-link slot resolvers — row + fieldId → the resolved fact a slot cell paints. */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { CatalogLinkChoreRow } from '@/features/review/catalog-link/types';
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
export function resolveCatalogLinkSlotValue(
  row: CatalogLinkChoreRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'catalog-link.item':
      return { kind: 'value', text: str(row.itemNumber) };
    case 'catalog-link.source': {
      const meta = sourcePlatformMetaFromLabel(row.accountSource);
      return { kind: 'value', text: str(meta.label) ?? str(row.accountSource) };
    }
    case 'catalog-link.sku':
      return { kind: 'value', text: str(row.sku) };
    case 'catalog-link.orders':
      // A listing blocking NO orders is a chore worth doing later, not a
      // "0" worth painting — honest absence, the same rule the note line uses.
      return { kind: 'value', text: row.orderCount > 0 ? String(row.orderCount) : null };
    case 'catalog-link.first':
      return { kind: 'value', text: dayText(row.firstSeenAt) };
    case 'catalog-link.last':
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
export function catalogLinkSlotValuesFor(
  row: CatalogLinkChoreRow,
  columns: readonly { key: string; fieldId?: string }[],
): Readonly<Record<string, CompoundSlotValue>> | undefined {
  let slots: Record<string, CompoundSlotValue> | undefined;
  for (const col of columns) {
    if (!col.fieldId) continue;
    const value = resolveCatalogLinkSlotValue(row, col.fieldId);
    if (!value) continue;
    slots ??= {};
    slots[col.key] = value;
  }
  return slots;
}
