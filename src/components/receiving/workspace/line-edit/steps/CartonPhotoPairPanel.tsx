'use client';

/**
 * Pair an EXISTING carton photo with a capture step — the recovery path for a
 * shot that was taken before anyone said what it shows.
 *
 * ## The gap this closes
 *
 * The three bench carton steps share one stage (`unbox_carton`) and are told
 * apart by `photos.photo_aspect` alone. That column was written only at INSERT,
 * so a carton photo shot from the wrong step — or from any surface that sends no
 * aspect, which includes a phone capture launched from generic chrome — could
 * never satisfy the step it obviously depicts. The operator's only recovery was
 * to re-shoot the same box.
 *
 * ## This is NOT the hand-ticked checklist that was deleted
 *
 * A tick claimed that evidence existed. Pairing claims nothing: the photo is
 * already on the carton, and this only names what it shows. That is why it is
 * allowed where a tick is not — it can never assert evidence the carton cannot
 * answer for.
 *
 * ## Both directions, one control
 *
 * Forward (from the step): the primary button names this step's declared aspect
 * in one click — the operator is standing in that step, so it must not cost two.
 * Backward (from the photo): the ⋯ menu names ANY aspect legal for the stage, or
 * clears the claim. Re-classifying is legal and audited; the column is
 * overwritable, so `audit_logs` is the only place the original claim survives.
 *
 * ## It is a LIST, not a disclosure
 *
 * Its only host is the dock's `Link a photo` popover
 * ({@link CartonPhotoDockControl}), which owns open/closed. A second
 * open-state here would be a flag to drift, and the list is only ever mounted
 * while the operator is looking at it — so the fetch is naturally on demand
 * without an `enabled` guard of its own.
 *
 * ## It only offers BENCH shots
 *
 * The list is scoped to `unbox_carton`. An `arrival_package` photo is the
 * pre-opening door shot and the only stage the `require_one` receive gate
 * counts, so it legally carries only the two pre-opening aspects — the route
 * would 400 a bench aspect on it, and offering the pair here would teach the
 * operator that stages are interchangeable. Moving a photo BETWEEN stages is
 * reassignment, a different verb with its own route.
 *
 * ## It hands focus back
 *
 * Every control here is a real `<button>`; clicking one leaves focus on it and
 * the next wedge scan would type into it. Same 60ms hand-back as the deck, the
 * pager and the label step.
 */

import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MoreHorizontal } from '@/components/Icons';
import { PhotoThumb } from '@/components/photos/PhotoThumb';
import { Button } from '@/design-system/primitives';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/design-system/primitives/DropdownMenu';
import { emitReceiving } from '@/components/receiving/receiving-events';
import { receivingPhotosQueryKey, refreshReceivingPhotos } from '@/lib/queries/receiving-queries';
import {
  ASPECTS_BY_STAGE,
  parsePhotoAspect,
  photoAspectLabel,
  type PhotoAspect,
} from '@/lib/photos/photo-aspects';
import { photoIntentFromStage } from '@/lib/receiving/photo-intent';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

/** Bench shots only — see the module doc. */
const BENCH_LIST_INTENT = photoIntentFromStage('unbox_carton');

/** The vocabulary a bench carton shot may legally carry, straight off the SoT. */
const BENCH_ASPECTS = ASPECTS_BY_STAGE.unbox_carton;

interface CartonPhotoRow {
  id: number;
  photoUrl: string;
  photoAspect?: string | null;
  createdAt?: string;
}

/** Unclassified first, then other claims, then the ones already satisfying this step. */
function pairingRank(aspect: PhotoAspect | null, stepAspect: PhotoAspect | null): number {
  if (aspect == null) return 0;
  if (stepAspect && aspect === stepAspect) return 2;
  return 1;
}

export function CartonPhotoPairPanel({
  receivingId,
  aspect: stepAspect,
}: {
  receivingId: number;
  /** The step's declared aspect — the one-click forward target. */
  aspect: PhotoAspect | null;
}) {
  const queryClient = useQueryClient();

  const { data, isPending, isError } = useQuery<{ photos: CartonPhotoRow[] }>({
    queryKey: [...receivingPhotosQueryKey(receivingId), BENCH_LIST_INTENT],
    queryFn: async () => {
      const params = new URLSearchParams({
        receivingId: String(receivingId),
        photoIntent: BENCH_LIST_INTENT,
      });
      const res = await fetch(`/api/receiving-photos?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    // Mount IS the ask: the popover renders this only while it is open, so the
    // step's own camera stays the zero-request default path.
    enabled: Number.isFinite(receivingId) && receivingId > 0,
    staleTime: 10_000,
  });

  const rows = useMemo(() => {
    const list = (data?.photos ?? [])
      .filter((p) => !!p.photoUrl?.trim())
      .map((p) => ({ ...p, aspect: parsePhotoAspect(p.photoAspect) }));
    return list.sort((a, b) => {
      const rank = pairingRank(a.aspect, stepAspect) - pairingRank(b.aspect, stepAspect);
      if (rank !== 0) return rank;
      // Newest first inside a group — the shot just taken is the likely subject.
      return (Date.parse(b.createdAt ?? '') || b.id) - (Date.parse(a.createdAt ?? '') || a.id);
    });
  }, [data, stepAspect]);

  const [pendingId, setPendingId] = useState<number | null>(null);

  const { mutateAsync } = useMutation({
    mutationFn: async ({ photoId, next }: { photoId: number; next: PhotoAspect | null }) => {
      const res = await fetch(`/api/photos/${photoId}/aspect`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // `aspect` is always present — null IS the clear. A missing key is a 400.
        body: JSON.stringify({ aspect: next }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
  });

  const setAspect = useCallback(
    async (photoId: number, next: PhotoAspect | null) => {
      setPendingId(photoId);
      try {
        await mutateAsync({ photoId, next });
        // Both procedure surfaces read the carton photo query, so one refresh
        // re-derives the deck AND the right-edge checklist. The server publishes
        // the same change on the carton's realtime channel for the phone.
        refreshReceivingPhotos(queryClient, receivingId);
      } catch (err) {
        // Teach, don't swallow: the 400 that matters here says the aspect is
        // illegal for the photo's stage, and the operator needs to read it.
        toast.error(err instanceof Error ? err.message : 'Could not name this shot.');
      } finally {
        setPendingId(null);
        setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
      }
    },
    [mutateAsync, queryClient, receivingId],
  );

  return (
    <div className="space-y-2" data-carton-photo-pair>
      <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
        {stepAspect
          ? `Which photo is the ${photoAspectLabel(stepAspect).toLowerCase()}?`
          : 'Carton photos'}
      </p>

      {isPending ? (
        <p className="flex items-center gap-2 text-role-caption text-text-soft">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading carton photos…
        </p>
      ) : isError ? (
        // A failed fetch is not "no photos". Saying the carton has none would
        // send the operator to re-shoot evidence that exists.
        <p className="text-role-caption text-text-soft">Carton photos unavailable.</p>
      ) : rows.length === 0 ? (
        <p className="text-role-caption text-text-soft">
          No bench photos on this carton yet — take one with the camera above.
        </p>
      ) : (
        <ul className="divide-y divide-border-soft">
          {rows.map((photo) => {
            const isStepAspect = stepAspect != null && photo.aspect === stepAspect;
            const busy = pendingId === photo.id;
            return (
              <li key={photo.id} className="flex items-center gap-3 py-1.5">
                <PhotoThumb
                  src={photo.photoUrl}
                  alt=""
                  ratio="square"
                  className="h-10 w-10 shrink-0 rounded-md"
                />
                <p
                  className={cn(
                    'min-w-0 flex-1 truncate text-role-caption',
                    photo.aspect ? 'text-text-default' : 'text-text-soft',
                  )}
                >
                  {/* NULL is unclassified evidence, never missing evidence. */}
                  {photo.aspect ? photoAspectLabel(photo.aspect) : 'Unclassified'}
                </p>

                <div className="flex shrink-0 items-center gap-1">
                  {stepAspect && !isStepAspect ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
                      onClick={() => void setAspect(photo.id, stepAspect)}
                    >
                      This one
                    </Button>
                  ) : null}

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        ariaLabel="Name what this photo shows"
                        disabled={busy}
                        icon={<MoreHorizontal className="h-4 w-4" />}
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {BENCH_ASPECTS.map((candidate) => (
                        <DropdownMenuItem
                          key={candidate}
                          disabled={photo.aspect === candidate}
                          onSelect={() => void setAspect(photo.id, candidate)}
                        >
                          {photoAspectLabel(candidate)}
                        </DropdownMenuItem>
                      ))}
                      {photo.aspect ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            tone="danger"
                            onSelect={() => void setAspect(photo.id, null)}
                          >
                            Clear — unclassified
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
