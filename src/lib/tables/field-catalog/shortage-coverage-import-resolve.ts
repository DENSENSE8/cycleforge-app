/**
 * Shortage-coverage-import slot resolvers — staging shows what the FILE said
 * except Coverage, which is always {@link formatShortageCoverage} (already
 * projected onto `coverageLabel`).
 */

import type { CompoundSlotValue } from '@/components/tables/compound/compound-row-model';
import type { ShortageCoverageImportRowView } from '@/lib/orders/shortage-coverage-import-descriptor';
import { shortageCoverageFace } from '@/lib/orders/shortage-coverage';

function str(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim();
  return s || null;
}

export function resolveShortageCoverageImportSlotValue(
  row: ShortageCoverageImportRowView,
  fieldId: string,
): CompoundSlotValue | null {
  switch (fieldId) {
    case 'shortage-coverage-import.order':
      return { kind: 'value', text: str(row.orderNumber) };
    case 'shortage-coverage-import.title':
      return { kind: 'value', text: str(row.itemTitle) };
    case 'shortage-coverage-import.qty':
      return { kind: 'value', text: str(row.shortQty) };
    case 'shortage-coverage-import.coverage':
      return {
        kind: 'value',
        text: shortageCoverageFace({
          poNumber: row.poNumber,
          inboundTracking: row.inboundTracking,
          eta: row.eta,
        }),
      };
    case 'shortage-coverage-import.po':
      return { kind: 'value', text: str(row.poNumber) };
    case 'shortage-coverage-import.inbound':
      return { kind: 'value', text: str(row.inboundTracking) };
    default:
      return null;
  }
}
