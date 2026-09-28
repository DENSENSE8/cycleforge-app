'use client';

/** Triage "Unfound" list — cartons scanned at the door that Zoho can't match to a PO yet (`kind='unmatched_receiving'` in `v_unfound_queue`). */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button } from '@/design-system/primitives';
import { Flag, RotateCcw } from '@/components/Icons';
import { toast } from '@/lib/toast';
import { ReceivingClaimModal } from '@/components/receiving/workspace/ReceivingClaimModal';
import { exceptionDotClass, exceptionTooltipLabel } from '@/lib/receiving/triage-exception-context';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import { ReceivingFeedRail } from './ReceivingFeedRail';
import { useTriageUnfoundExceptions } from './useTriageUnfoundExceptions';
import { useReceivingClaimModal } from './useReceivingClaimModal';
import { useTriageStagingMap } from './useTriageStagingMap';
import { TriageStagingChips } from './TriageStagingChips';

export function TriageUnfoundList({
  selectedLineId,
  filterText = '',
  includeRow,
}: {
  selectedLineId: number | null;
  filterText?: string;
  includeRow?: (row: ReceivingLineRow) => boolean;
}) {
  const exceptionMap = useTriageUnfoundExceptions();
  const stagingMap = useTriageStagingMap();
  const { claimRow, openClaim, closeClaim, onTicketCreated } = useReceivingClaimModal();
  const queryClient = useQueryClient();
  const [retryingId, setRetryingId] = useState<number | null>(null);

  const retryPair = async (receivingId: number) => {
    if (retryingId != null) return;
    setRetryingId(receivingId);
    try {
      const res = await fetch('/api/receiving/unfound-queue/retry-pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiving_id: receivingId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        toast.error(data?.error || 'Retry failed');
        return;
      }
      if (data.promoted) {
        toast.success(`Matched to PO ${data.zoho_purchaseorder_id ?? ''}`.trim());
        invalidateReceivingFeeds(queryClient);
      } else {
        toast('Still no PO match', { description: 'Try again later, or link a PO manually.' });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Retry failed');
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <>
      <ReceivingFeedRail
        feed="triageUnfound"
        selectedLineId={selectedLineId}
        filterText={filterText}
        includeRow={includeRow}
        renderPopoverContext={(row) => {
          // B3: open Zoho-sync exception state for this carton (read-only).
          const ctx = row.receiving_id != null ? exceptionMap?.get(row.receiving_id) : undefined;
          const staging = row.receiving_id != null ? stagingMap.get(row.receiving_id) : undefined;
          return (
            <>
              {ctx ? (
                <div className="flex items-center gap-2 border-t border-border-hairline pt-2.5">
                  <HoverTooltip label={exceptionTooltipLabel(ctx)} asChild>
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${exceptionDotClass(ctx)}`} />
                      <span className="text-role-eyebrow text-text-soft">
                        PO sync pending · {ctx.retryCount}×
                      </span>
                    </span>
                  </HoverTooltip>
                </div>
              ) : null}
              <TriageStagingChips ctx={staging} />
              <div className="flex items-center gap-1 pt-2">
                {row.receiving_id != null ? (
                  <HoverTooltip label="Re-check inventory for a PO match right now" asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={retryingId === row.receiving_id}
                      disabled={retryingId != null && retryingId !== row.receiving_id}
                      onClick={() => void retryPair(row.receiving_id!)}
                      className="h-auto gap-1 rounded-md px-2 py-1 text-role-micro text-blue-600 hover:bg-blue-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Retry pair
                    </Button>
                  </HoverTooltip>
                ) : null}
                <HoverTooltip label="File a missing-carton / unfound claim for this package" asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openClaim(row)}
                    className="h-auto gap-1 rounded-md px-2 py-1 text-role-micro text-orange-600 hover:bg-orange-50"
                  >
                    <Flag className="h-3.5 w-3.5" />
                    Claim
                  </Button>
                </HoverTooltip>
              </div>
            </>
          );
        }}
      />

      {claimRow ? (
        <ReceivingClaimModal
          open
          row={claimRow}
          // Carton-level claim — the unfound stub has no real receiving_line.
          lineIdOverride={null}
          onClose={closeClaim}
          onTicketCreated={onTicketCreated}
        />
      ) : null}
    </>
  );
}
