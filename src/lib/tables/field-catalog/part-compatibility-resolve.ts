/**
 * Part-compatibility slot resolvers — pure. One function is the WHOLE
 * vocabulary the engine reads: the slot cells, the header-sort comparator and
 * the search index all go through it, so a fact can never be searchable as one
 * string and sortable as another.
 *
 * Two rules this family leans on:
 *
 * - Enums resolve to the OPERATOR'S WORD (`partFitLabel`, `partSourceLabel`),
 *   not the wire token: a column of `csv_import` is storage leaking onto a
 *   desk, and the label maps live beside the row type so the pill and the
 *   track cannot disagree about what `salvage` is called.
 * - The date resolves to the ABSOLUTE INSTANT. `compareGridValues` needs the
 *   instant to order by, and the compact civil face is the row adapter's job.
 */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import {
  partFitLabel,
  partOemLabel,
  partSourceLabel,
  type PartCompatibilityEdgeRow,
} from '@/lib/sourcing/part-compatibility-row';

function str(v: string | number | null | undefined): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

export function resolvePartCompatibilitySlotValue(
  row: PartCompatibilityEdgeRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'part-compatibility.sku':
      return { kind: 'value', text: str(row.sku) };
    case 'part-compatibility.part':
      return { kind: 'value', text: str(row.product_title) };
    case 'part-compatibility.model':
      return { kind: 'value', text: str(row.model_name) };
    case 'part-compatibility.model_number':
      return { kind: 'value', text: str(row.model_number) };
    case 'part-compatibility.role':
      return { kind: 'value', text: str(row.part_role) };
    case 'part-compatibility.fit':
      // The fit HALF of the retired merged pill — no `OEM ` prefix. The word
      // is the fact; `is_oem` answers separately, on its own track.
      return { kind: 'value', text: str(row.fit) ? partFitLabel(row.fit) : null };
    case 'part-compatibility.oem':
      // A boolean's negative case is a CLAIM ("aftermarket"), not absence —
      // only a row with no boolean at all reads blank.
      return { kind: 'value', text: partOemLabel(row.is_oem) };
    case 'part-compatibility.source':
      return { kind: 'value', text: partSourceLabel(row.source) };
    case 'part-compatibility.linked':
      return { kind: 'value', text: str(row.created_at) };
    default:
      return null;
  }
}
