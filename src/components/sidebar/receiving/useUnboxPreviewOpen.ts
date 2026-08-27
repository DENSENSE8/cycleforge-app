'use client';

import { useCallback } from 'react';
import { toast } from '@/lib/toast';
import { dispatchSelectLine } from '@/components/station/receiving-lines-table-helpers';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { buildUnmatchedStubRow } from './receiving-sidebar-shared';
import type { UnboxPreviewHit } from '@/lib/receiving/preview-scan';
import type { UnboxScanMode } from './ReceivingUnboxScanBar';

/**
 * Preview stance's OPEN — resolve a scan read-only, then paint the station for
 * it exactly as a real scan would (identity, middle ops-flow, Displays column),
 * with the pane inert.
 *
 * Two reads, zero writes:
 *   1. `GET /api/receiving/preview-scan` — which carton is this?
 *   2. `GET /api/receiving-lines?receiving_id_in=` — that carton's lines.
 *
 * A miss speaks HERE, not in the bar: this hook is the surface's open path, so
 * it is the honest owner of "there was nothing to open". The bar stays copy-free.
 *
 * It deliberately does NOT go through `submitTrackingScan` → `lookup-po`: that
 * path records the scan, stamps `receiving_unbox.opened_at`, and creates an
 * unmatched carton on a miss. A preview must do none of the three, or it is an
 * unbox wearing a different word.
 */
/**
 * Open-shape row for a carton the preview resolved but which carries no
 * `receiving_line` rows — the same `buildUnmatchedStubRow` SoT the scan path
 * opens an un-itemised carton with, never a second stub shape.
 *
 * The hit's real facts ride on top: a carton WITH a PO must not open wearing
 * the unmatched face just because nobody has itemised it yet — that would be
 * chrome inventing a second story about the record.
 */
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
        // A miss is reported by the SURFACE that would have opened, never by the
        // scan bar (constraint B — the bar renders the value and the chrome).
        // The pane stays shut, so without this the Enter is silently inert and
        // reads as a broken field. Interim owner: a station empty-answer surface
        // is the real home, and this moves there when it exists.
        toast.warning('Nothing on file for that value');
        return null;
      }

      // A carton with NO `receiving_line` rows still opens — that is the
      // commonest thing an operator previews (a freshly-docked carton nobody
      // has itemised), and the scan path opens it too, on a synthesized stub,
      // so the station paints its empty PO-items surface.
      //
      // This used to bail and return the hit unopened, on the reasoning that
      // "the band keeps the answer". Constraint B deleted that band, so the
      // bail became a silent no-op: resolution succeeded and nothing rendered.
      // That is the bench report *"Enter does nothing"* — the value resolved
      // perfectly and the pane never heard about it.
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
