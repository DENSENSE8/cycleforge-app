/** Unit-TSN-links slot resolvers — pure. */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { UnitTsnLinkTableRow } from '@/lib/inventory/tsn-link-row';

function str(value: string | number | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

export function resolveUnitTsnLinksSlotValue(
  row: UnitTsnLinkTableRow,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'unit-tsn-links.tsn':
      return { kind: 'value', text: str(row.id) };
    case 'unit-tsn-links.created':
      return { kind: 'value', text: str(row.created_at) };
    case 'unit-tsn-links.station':
      return { kind: 'value', text: str(row.station_source) };
    case 'unit-tsn-links.serial_type':
      return { kind: 'value', text: str(row.serial_type) };
    case 'unit-tsn-links.shipment':
      return { kind: 'value', text: str(row.shipment_id) };
    case 'unit-tsn-links.tested_by':
      /**
       * Blank, not `system`. An allocation with no staffer was made BY the
       * system; a v1 record with no tester name means the v1 row never
       * recorded one, and naming a machine there would invent provenance.
       */
      return { kind: 'value', text: str(row.tested_by_name) };
    default:
      return null;
  }
}
