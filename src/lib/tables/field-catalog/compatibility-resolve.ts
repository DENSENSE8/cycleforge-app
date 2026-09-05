/** Compatibility slot resolvers — pure. */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { CompatibilityEdgeRow } from '@/lib/sourcing/compatibility-edge-row';

function str(v: string | number | null | undefined): string | null {
  const s = String(v ?? '').trim();
  return s || null;
}

export function resolveCompatibilitySlotValue(
  row: CompatibilityEdgeRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'compatibility.id':
      return { kind: 'value', text: str(row.id) };
    case 'compatibility.part':
      return { kind: 'value', text: str(row.sku) };
    case 'compatibility.model': {
      const num = str(row.model_number);
      const name = str(row.model_name);
      return { kind: 'value', text: num && name ? `${num} · ${name}` : (num ?? name) };
    }
    case 'compatibility.kind':
      return { kind: 'value', text: str(row.part_role) };
    case 'compatibility.fit':
      return { kind: 'value', text: str(row.fit) };
    case 'compatibility.confidence':
      return { kind: 'value', text: str(row.confidence) };
    case 'compatibility.source':
      return { kind: 'value', text: str(row.source) };
    // A boolean is a fact with two faces, not a blank — "Aftermarket" is what
    // `is_oem: false` MEANS, and an empty cell would read as unknown.
    case 'compatibility.oem':
      return { kind: 'value', text: row.is_oem ? 'OEM' : 'Aftermarket' };
    default:
      return null;
  }
}
