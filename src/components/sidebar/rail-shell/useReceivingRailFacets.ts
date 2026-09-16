'use client';

/**
 * Shared facet state for every {@link ReceivingLineRow} recent rail
 * (Unbox · Triage · Testing). Display keep-filter only — not URL/workbench.
 */

import { useCallback, useState } from 'react';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  EMPTY_UNBOX_RAIL_FACETS,
  matchesUnboxRailFacets,
  type UnboxRailFacets,
} from '@/lib/receiving/rail/unbox-rail-facets';

export function useReceivingRailFacets() {
  const [facets, setFacets] = useState<UnboxRailFacets>(EMPTY_UNBOX_RAIL_FACETS);
  const includeRow = useCallback(
    (row: ReceivingLineRow) => matchesUnboxRailFacets(row, facets),
    [facets],
  );
  return { facets, setFacets, includeRow };
}
