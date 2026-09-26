/** Cycle-count LINES slot resolvers — pure. */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import {
  cycleCountLineBinLabel,
  cycleCountLineStatusLabel,
  cycleCountLineVarianceFace,
  type CycleCountLineRow,
} from '@/lib/inventory/cycle-count-line-row';

function str(v: string | number | null | undefined): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

export function resolveCycleCountLinesSlotValue(
  row: CycleCountLineRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'cycle-count-lines.bin':
      return { kind: 'value', text: cycleCountLineBinLabel(row) };
    case 'cycle-count-lines.sku':
      return { kind: 'value', text: str(row.sku) };
    case 'cycle-count-lines.expected':
      return { kind: 'value', text: str(row.expectedQty) };
    case 'cycle-count-lines.counted':
      return { kind: 'value', text: row.countedQty == null ? null : String(row.countedQty) };
    case 'cycle-count-lines.variance':
      return { kind: 'value', text: cycleCountLineVarianceFace(row.variance) };
    case 'cycle-count-lines.status':
      return { kind: 'value', text: str(cycleCountLineStatusLabel(row.status)) };
    case 'cycle-count-lines.tolerance': {
      // `numeric` comes back as `0.050`; the trailing zero is storage precision, not a fact.
      const raw = String(row.varianceTol ?? '').trim();
      if (!raw) return { kind: 'value', text: null };
      const n = Number(raw);
      return { kind: 'value', text: `tol ${Number.isFinite(n) ? n : raw}` };
    }
    case 'cycle-count-lines.counted_by':
      return { kind: 'person', staffId: row.countedByStaffId ?? null, name: str(row.countedByName) };
    case 'cycle-count-lines.counted_at':
      return { kind: 'value', text: str(row.countedAt) };
    case 'cycle-count-lines.approved_by':
      return {
        kind: 'person',
        staffId: row.approvedByStaffId ?? null,
        name: str(row.approvedByName),
      };
    case 'cycle-count-lines.approved_at':
      return { kind: 'value', text: str(row.approvedAt) };
    default:
      return null;
  }
}
