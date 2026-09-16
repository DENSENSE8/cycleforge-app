/**
 * Cycle-count LINES slot resolvers — pure. One function is the WHOLE
 * vocabulary the engine reads: the slot cells, the header-sort comparator and
 * the search index all go through it, so a fact can never be searchable as one
 * string and sortable as another.
 *
 * Three contracts worth stating, because each was a retired cell's behaviour:
 *
 * - **Dates resolve to the ABSOLUTE instant**, never to a formatted or
 *   relative face. The compact civil face is the row adapter's job, and
 *   `compareGridValues` needs the instant to order by; a resolver whose text
 *   depended on `now` would sort and search differently on every render.
 * - **The two provenance facts are PERSON values, not strings.** The retired
 *   Action cell printed `by <name>` / `counted by <name>` — the preposition
 *   was there because the cell had no header to name it, and a bound track
 *   does. The person face draws the avatar from the staff id and the absence
 *   honestly when the join found no name.
 * - **`counted` and `variance` are distinct kinds of nothing.** An uncounted
 *   line resolves both to null text (the meta dash), never to `0` — a zero
 *   variance means "counted, and the bin was right", which is the opposite
 *   fact. The retired cells printed `—` for exactly this reason.
 */

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
      // `numeric` comes back as `0.050`; the trailing zero is storage
      // precision, not a fact. The word rides the face because this is a
      // SUBTITLE part under the SKU, where no header names it — same shape as
      // `cycle-counts.tol` under the campaign name one route up.
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
