'use client';

import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrgGs1 } from '@/hooks/useOrgGs1';
import { reportRackLabelsPrinted } from '@/lib/locations/racks-client';
import {
  groupRackCodesByRack,
  printLocationRowLabels,
  type PrintableLocationRow,
  type PrintLocationRowsResult,
} from '@/lib/print/printLocationRows';
import { safeRandomUUID } from '@/lib/safe-uuid';

/**
 * `location.labels.printed`, one event per rack, once a run actually printed.
 * Fire-and-forget: the stickers are already on paper, so a failed report never
 * fails the print.
 */
function reportRackLabelRun(result: PrintLocationRowsResult): void {
  if (result.transport === 'skipped' || result.rackCodes.length === 0) return;
  for (const [rackCode, codes] of groupRackCodesByRack(result.rackCodes)) {
    void reportRackLabelsPrinted(rackCode, {
      codes,
      transport: result.transport,
      clientEventId: safeRandomUUID(),
    }).catch(() => undefined);
  }
}

/**
 * Every surface's door to {@link printLocationRowLabels} (desk Bins selection,
 * Locations › Manage, the phone location record, rack labels): the tenant's
 * GS1 identity (the label's matrix) and org slug filled in, so a screen only
 * hands rows. A run that printed rack-family stickers records them per rack.
 */
export function useLocationLabelPrint() {
  const { identity } = useOrgGs1();
  const { user } = useAuth();
  const orgSlug = user?.organizationSlug ?? null;
  return useCallback(
    async (rows: readonly PrintableLocationRow[], onProgress?: (done: number, total: number) => void) => {
      const result = await printLocationRowLabels(rows, { gln: identity.gln, orgSlug, onProgress });
      reportRackLabelRun(result);
      return result;
    },
    [identity.gln, orgSlug],
  );
}
