'use client';

import { useCallback } from 'react';
import { toast } from '@/lib/toast';
import { dispatchSelectLine } from '@/components/station/receiving-lines-table-helpers';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { buildUnmatchedStubRow } from './receiving-sidebar-shared';
import type { UnboxPreviewHit } from '@/lib/receiving/preview-scan';
import type { UnboxScanMode } from './ReceivingUnboxScanBar';

/** Preview stance's OPEN — resolve a scan read-only, then paint the station for it exactly as a real scan would (identity, middle ops-flow,… */
/** Open-shape row for a carton the preview resolved but which carries no `receiving_line` rows — the same `buildUnmatchedStubRow` SoT the… */
function previewStubRow(hit: UnboxPreviewHit): ReceivingLineRow {
  const stub = buildUnmatchedStubRow(
    hit.receivingId,
    // Only a tracking preview has a tracking number; a PO or ticket preview
    // must not park its own identifier in the tracking slot.
    hit.idKind === 'tracking' ? hit.idValue : '',
  );
  if (!hit.poNumber) return stub;
  return {
    ...stub,
    zoho_purchaseorder_number: hit.poNumber,
    receiving_source: 'zoho_po',
    source_platform: hit.sourcePlatform ?? null,
    item_name: hit.title,
  };
}

export function useUnboxPreviewOpen() {
  return useCallback(
    async (value: string, mode: UnboxScanMode | null): Promise<UnboxPreviewHit | null> => {
      const params = new URLSearchParams({ value, mode: mode ?? 'auto' });
      const res = await fetch(`/api/receiving/preview-scan?${params}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`preview-scan ${res.status}`);
      const json = (await res.json()) as { hit?: UnboxPreviewHit | null };
      const hit = json.hit ?? null;
      if (!hit) {
        // A miss is reported by the SURFACE that would have opened, never by the scan bar (constraint B — the bar renders the value and the chrome).
        toast.warning('Nothing on file for that value');
        return null;
      }

      // A carton with NO `receiving_line` rows still opens — that is the commonest thing an operator previews (a freshly-docked carton nobody…
      const linesRes = await fetch(
        `/api/receiving-lines?receiving_id_in=${hit.receivingId}&limit=50`,
        { cache: 'no-store' },
      );
      const linesJson = linesRes.ok
        ? ((await linesRes.json()) as { receiving_lines?: ReceivingLineRow[] })
        : null;
      const row = linesJson?.receiving_lines?.[0] ?? previewStubRow(hit);

      // `preview` implies `recordView: false` downstream — one decision, one
      // place (`readSelectLineDetail`).
      dispatchSelectLine(row, { preview: true });
      return hit;
    },
    [],
  );
}
