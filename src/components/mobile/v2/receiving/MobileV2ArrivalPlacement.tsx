'use client';

/**
 * `/m/r/[id]/place` — Arrival's put-down step: "Place on <shelf> · <tier>",
 * confirmed by scanning the shelf label.
 *
 * The carton was just logged at the door (`/m/scan` hands off here when the
 * org has urgency shelves). The server picks the shelf
 * (`POST /api/receiving/[id]/placement` suggest), refuses a scan of the wrong
 * shelf, and records the carton's shelf on confirm. On success the operator is
 * returned to the scan loop for the next box. With no urgency shelves set up
 * the screen says so plainly and offers the way back — never a fake shelf.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/design-system/primitives';
import { EmptyState } from '@/design-system/primitives/EmptyState';
import { MobileV2DetailTopBar } from '@/components/mobile/v2/MobileV2DetailTopBar';
import { MobileV2ScanInput } from '@/components/mobile/v2/scan/MobileV2ScanInput';
import { qk } from '@/queries/keys';
import { useScanFeedback } from '@/lib/scan-feedback/useScanFeedback';
import { mobileJobReturn } from '@/lib/mobile/nav-trail';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { arrivalTierLabel, arrivalTierReason } from '@/lib/receiving/arrival-tier';
import { priorityOverrideTier } from '@/lib/receiving/priority-override';
import {
  confirmPlacementScan,
  fetchPlacementSuggestion,
} from '@/lib/receiving/arrival-placement-client';
import type { ArrivalShelf } from '@/lib/receiving/arrival-shelf-plan';
import { cn } from '@/utils/_cn';

/** How long "Placed on …" stays up before the scan loop takes over again. */
const PLACED_RETURN_MS = 900;

function TierFace({ tier, className }: { tier: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span aria-hidden className={cn('h-2.5 w-2.5 rounded-full', priorityOverrideTier(tier)?.dotClass ?? 'bg-text-faint')} />
      {arrivalTierLabel(tier)}
    </span>
  );
}

export function MobileV2ArrivalPlacement({ receivingId }: { receivingId: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const back = mobileJobReturn(searchParams?.get('back')) ?? '/m/scan';
  const queryClient = useQueryClient();
  const { playScanFeedback } = useScanFeedback();

  const query = useQuery({
    queryKey: qk.cartons.placement(receivingId),
    queryFn: () => fetchPlacementSuggestion(receivingId),
    staleTime: 15_000,
  });

  const [confirming, setConfirming] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [placed, setPlaced] = useState<ArrivalShelf | null>(null);

  useEffect(() => {
    if (!placed) return;
    const timer = window.setTimeout(() => router.replace(back), PLACED_RETURN_MS);
    return () => window.clearTimeout(timer);
  }, [placed, back, router]);

  const onDecode = useCallback(
    (raw: string) => {
      if (confirming || placed) return;
      setConfirming(true);
      setRefusal(null);
      void confirmPlacementScan(receivingId, {
        scanned: raw,
        clientEventId: safeRandomUUID(),
        surface: `/m/r/${receivingId}/place`,
      })
        .then((answer) => {
          if (answer.ok) {
            setPlaced(answer.shelf);
            playScanFeedback('success');
            void queryClient.invalidateQueries({ queryKey: qk.cartons.unboxNext() });
            return;
          }
          setRefusal(answer.message);
          playScanFeedback('reject');
        })
        .catch(() => {
          setRefusal('Could not reach the server — the carton is not placed yet');
          playScanFeedback('reject');
        })
        .finally(() => setConfirming(false));
    },
    [confirming, placed, receivingId, playScanFeedback, queryClient],
  );

  const answer = query.data;
  const configured = answer != null && answer.suggestion.kind !== 'no_shelves';

  return (
    <div className="flex h-full min-h-0 flex-col bg-mode-panel" data-mobile-architecture="v2">
      <MobileV2DetailTopBar
        title={`Carton ${receivingId}`}
        mono
        subtitle="Place on shelf"
        backHref={back}
        close
      />

      <div className="min-h-0 flex-1 divide-y divide-mode-rule">
        {query.isPending ? (
          <p className="px-mode-page py-10 text-center text-sm font-semibold text-mode-muted">Finding the shelf…</p>
        ) : query.isError || !answer ? (
          <div className="flex flex-col items-center gap-3 px-mode-page py-10 text-center">
            <p className="text-sm font-semibold text-text-danger">Could not find a shelf for this carton</p>
            <Button variant="secondary" size="lg" onClick={() => void query.refetch()}>
              Try again
            </Button>
          </div>
        ) : !configured ? (
          <div className="px-mode-page">
            <EmptyState
              title="No urgency shelves configured"
              description={`This carton is ${arrivalTierLabel(answer.tier.tier)} (${arrivalTierReason(answer.tier.source)}). Mark rack shelves Priority · High · Medium · Low on the desk — Inventory › Locations › Manage — and Arrival will say where each box goes.`}
              action={
                <Button variant="primary" size="lg" onClick={() => router.replace(back)}>
                  Next carton
                </Button>
              }
            />
          </div>
        ) : placed ? (
          <section className="px-mode-page py-8" aria-live="polite">
            <p className="text-role-eyebrow font-semibold uppercase tracking-wider text-mode-muted">Placed on</p>
            <p className="mt-1 break-all font-mono text-role-display text-mode-ink">{placed.face}</p>
            <TierFace tier={placed.tier} className="mt-2 text-sm font-semibold text-mode-ink" />
          </section>
        ) : (
          <>
            <section className="px-mode-page py-6">
              <p className="text-role-eyebrow font-semibold uppercase tracking-wider text-mode-muted">Place on</p>
              {answer.suggestion.kind === 'shelf' ? (
                <>
                  <p className="mt-1 break-all font-mono text-role-display text-mode-ink">{answer.suggestion.shelf.face}</p>
                  {answer.suggestion.shelf.face !== answer.suggestion.shelf.barcode ? (
                    <p className="mt-0.5 font-mono text-xs text-mode-muted">{answer.suggestion.shelf.barcode}</p>
                  ) : null}
                  <TierFace tier={answer.suggestion.shelf.tier} className="mt-2 text-sm font-semibold text-mode-ink" />
                </>
              ) : answer.suggestion.kind === 'full' ? (
                <p className="mt-1 text-role-title text-mode-ink">
                  Any {arrivalTierLabel(answer.tier.tier)}-or-lower shelf
                </p>
              ) : null}
            </section>
            <section className="px-mode-page py-3 text-sm text-mode-muted">
              <p>
                Carton is <span className="font-semibold text-mode-ink">{arrivalTierLabel(answer.tier.tier)}</span>
                {' · '}
                {arrivalTierReason(answer.tier.source)}
              </p>
              {answer.suggestion.kind !== 'shelf' || answer.suggestion.overflow ? (
                <p className="mt-1 font-semibold text-amber-700">{answer.suggestion.message}</p>
              ) : null}
              {answer.currentShelf ? (
                <p className="mt-1">Already on {answer.currentShelf.face} — scan to move it.</p>
              ) : null}
            </section>
            {refusal ? (
              <p role="alert" className="px-mode-page py-3 text-sm font-semibold text-text-danger">
                {refusal}
              </p>
            ) : null}
          </>
        )}
      </div>

      {configured && !placed ? (
        <div className="shrink-0 border-t border-mode-rule pb-safe">
          <MobileV2ScanInput
            onDecode={onDecode}
            placeholder="Scan the shelf label"
            autoFocus
            prominentCamera
            isResolving={confirming}
          />
        </div>
      ) : null}
    </div>
  );
}
