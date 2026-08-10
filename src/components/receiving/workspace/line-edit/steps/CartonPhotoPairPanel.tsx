'use client';

/**
 * Pair / claim an EXISTING photo with a capture step — the recovery path for a
 * shot that was taken before anyone said what it shows (or which stage it
 * belongs to).
 *
 * ## The gap this closes
 *
 * Carton bench steps share one stage (`unbox_carton`) and are told apart by
 * `photos.photo_aspect` alone. That column was written only at INSERT, so a
 * photo shot from the wrong step — or from any surface that sends no aspect,
 * which includes a phone capture launched from generic chrome — could never
 * satisfy the step it obviously depicts. The operator's only recovery was to
 * re-shoot the same box. Door evidence (`arrival_package`) has the same need
 * for its two pre-opening aspects — and a second need: promote a bench carton
 * shot onto the door stage when chrome already shows carton evidence.
 *
 * ## This is NOT the hand-ticked checklist that was deleted
 *
 * A tick claimed that evidence existed. Pairing / claiming invents nothing: the
 * photo is already on the carton, and this only names what it shows (and, for
 * Arrival, which stage). That is why it is allowed where a tick is not — it
 * can never assert evidence the carton cannot answer for.
 *
 * ## Two modes
 *
 * - **Bench (`unbox_carton`)** — stage-scoped list; within-stage aspect pair
 *   via `PATCH /api/photos/:id/aspect`. Never mixes door shots.
 * - **Arrival (`arrival_package`)** — lists whole carton evidence (`carton`
 *   intent). Claim-picker chrome (density + select-all) → select tiles → sticky
 *   Check posts `PATCH /api/photos/:id/claim-stage`. Host owns toast + advance.
 *   Moving BETWEEN stages is this claim verb — not entity reassign.
 *
 * ## It hands focus back
 *
 * Every control here is a real `<button>`; clicking one leaves focus on it and
 * the next wedge scan would type into it. Same 60ms hand-back as the deck, the
 * pager and the label step.
 */

import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Loader2, MoreHorizontal, Pencil } from '@/components/Icons';
import { PhotoGridDisplayControls } from '@/components/photos/PhotoGridDisplayControls';
import {
  photoLibraryControlButtonClass,
  photoLibraryControlGroupClass,
} from '@/components/photos/photo-library-controls';
import { SelectionMark } from '@/components/photos/photo-library-grid/SelectionMark';
import { PhotoThumb } from '@/components/photos/PhotoThumb';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button, FlushTerminalFooter } from '@/design-system/primitives';
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
import {
  type PhotoGridDensity,
  photoGridLeafClass,
  photoGridTileRatio,
} from '@/lib/photos/photo-grid-density';
import {
  RECEIVING_PHOTO_LIST_INTENT_CARTON,
  isPackagePhotoType,
  photoIntentFromStage,
} from '@/lib/receiving/photo-intent';
import type { ReceivingPhotoStage } from '@/lib/receiving/photo-intent';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

/** Stages that expose Link on the photo dock strip. */
type PairableStage = Extract<ReceivingPhotoStage, 'unbox_carton' | 'arrival_package'>;

/** Door aspects in arrival basis order — label, then box. */
const DOOR_CLAIM_ORDER = ASPECTS_BY_STAGE.arrival_package;

/** Claim-local flush chrome — same overrides as ClaimPhotoPicker. */
const CLAIM_CONTROL_GROUP =
  '!rounded-none border-border-hairline !p-0 shadow-none';
const CLAIM_ICON_BUTTON =
  '!h-7 !w-7 !rounded-none border-border-hairline';
const CLAIM_DENSITY_BUTTON = '!rounded-none shadow-none';

interface CartonPhotoRow {
  id: number;
  photoUrl: string;
  photoAspect?: string | null;
  photoType?: string | null;
  createdAt?: string;
}

type MappedRow = CartonPhotoRow & {
  aspect: PhotoAspect | null;
  isDoorRow: boolean;
};

/** Unclassified first, then other claims, then the ones already satisfying this step. */
function pairingRank(aspect: PhotoAspect | null, stepAspect: PhotoAspect | null): number {
  if (aspect == null) return 0;
  if (stepAspect && aspect === stepAspect) return 2;
  return 1;
}

/**
 * Next door aspect still missing on package-stamped shots — label before box.
 * Null when both legal door aspects already have at least one photo.
 */
function nextDoorClaimAspect(doorRows: readonly MappedRow[]): PhotoAspect | null {
  for (const aspect of DOOR_CLAIM_ORDER) {
    if (!doorRows.some((r) => r.aspect === aspect)) return aspect;
  }
  return null;
}

export function CartonPhotoPairPanel({
  receivingId,
  aspect: stepAspect,
  stage = 'unbox_carton',
  onPaired,
}: {
  receivingId: number;
  /** The step's declared aspect — the one-click forward target (null = name via ⋯). */
  aspect: PhotoAspect | null;
  /** List + legal aspects are stage-scoped for bench; Arrival claims from carton. */
  stage?: PairableStage;
  /** Close the host popover after a successful forward pair / claim. */
  onPaired?: () => void;
}) {
  const queryClient = useQueryClient();
  const isDoor = stage === 'arrival_package';
  const listIntent = isDoor ? RECEIVING_PHOTO_LIST_INTENT_CARTON : photoIntentFromStage(stage);
  const legalAspects = ASPECTS_BY_STAGE[stage];

  const { data, isPending, isError, refetch, isFetching } = useQuery<{
    photos: CartonPhotoRow[];
  }>({
    queryKey: [...receivingPhotosQueryKey(receivingId), listIntent],
    queryFn: async () => {
      const params = new URLSearchParams({
        receivingId: String(receivingId),
        photoIntent: listIntent,
      });
      const res = await fetch(`/api/receiving-photos?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: Number.isFinite(receivingId) && receivingId > 0,
    staleTime: 10_000,
  });

  const rows = useMemo(() => {
    const list = (data?.photos ?? [])
      .filter((p) => !!p.photoUrl?.trim())
      .map(
        (p): MappedRow => ({
          ...p,
          aspect: parsePhotoAspect(p.photoAspect),
          isDoorRow: isPackagePhotoType(p.photoType),
        }),
      );
    return list.sort((a, b) => {
      if (isDoor) {
        // Claimable (not yet door) first — those are the select targets.
        const doorRank = Number(a.isDoorRow) - Number(b.isDoorRow);
        if (doorRank !== 0) return doorRank;
      }
      const rank = pairingRank(a.aspect, stepAspect) - pairingRank(b.aspect, stepAspect);
      if (rank !== 0) return rank;
      return (Date.parse(b.createdAt ?? '') || b.id) - (Date.parse(a.createdAt ?? '') || a.id);
    });
  }, [data, stepAspect, isDoor]);

  const doorRows = useMemo(() => rows.filter((r) => r.isDoorRow), [rows]);
  // Prefer the active procedure step's aspect; fall back to label-then-box when
  // a host still opens with aspect=null.
  const claimTargetAspect = isDoor
    ? (stepAspect ?? nextDoorClaimAspect(doorRows))
    : null;
  const claimCandidates = useMemo(() => {
    if (!isDoor) return [];
    // Claim from carton evidence that is not yet door-stamped.
    return rows.filter((r) => !r.isDoorRow);
  }, [isDoor, rows]);

  const [pendingId, setPendingId] = useState<number | null>(null);
  const [posting, setPosting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [gridDensity, setGridDensity] = useState<PhotoGridDensity>('lg');

  const { mutateAsync: mutateAspect } = useMutation({
    mutationFn: async ({ photoId, next }: { photoId: number; next: PhotoAspect | null }) => {
      const res = await fetch(`/api/photos/${photoId}/aspect`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aspect: next }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
  });

  const { mutateAsync: mutateClaim } = useMutation({
    mutationFn: async ({
      photoId,
      aspect,
    }: {
      photoId: number;
      aspect: PhotoAspect;
    }) => {
      const res = await fetch(`/api/photos/${photoId}/claim-stage`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage: 'arrival_package', aspect }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
  });

  const handFocusBack = useCallback(() => {
    setTimeout(() => emitReceiving('receiving-focus-scan'), 60);
  }, []);

  const setAspect = useCallback(
    async (photoId: number, next: PhotoAspect | null) => {
      setPendingId(photoId);
      try {
        await mutateAspect({ photoId, next });
        refreshReceivingPhotos(queryClient, receivingId);
        if (next != null && stepAspect != null && next === stepAspect) {
          onPaired?.();
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Could not name this shot.');
      } finally {
        setPendingId(null);
        handFocusBack();
      }
    },
    [mutateAspect, queryClient, receivingId, stepAspect, onPaired, handFocusBack],
  );

  const togglePhoto = useCallback((photoId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === claimCandidates.length && claimCandidates.length > 0
        ? new Set()
        : new Set(claimCandidates.map((c) => c.id)),
    );
  }, [claimCandidates]);

  const claimSelected = useCallback(async () => {
    if (!claimTargetAspect || selectedIds.size === 0 || posting) return;
    setPosting(true);
    try {
      await Promise.all(
        [...selectedIds].map((photoId) =>
          mutateClaim({ photoId, aspect: claimTargetAspect }),
        ),
      );
      refreshReceivingPhotos(queryClient, receivingId);
      setSelectedIds(new Set());
      onPaired?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not use this shot for arrival.');
      handFocusBack();
    } finally {
      setPosting(false);
    }
  }, [
    claimTargetAspect,
    selectedIds,
    posting,
    mutateClaim,
    queryClient,
    receivingId,
    onPaired,
    handFocusBack,
  ]);

  const emptyText = isDoor
    ? 'No door photos on this carton yet — upload or send to phone.'
    : 'No bench photos on this carton yet — upload or send to phone.';

  if (isDoor) {
    return (
      <div
        className="flex max-h-[min(28rem,65vh)] flex-col"
        data-carton-photo-pair
        data-photo-pair-stage={stage}
        data-photo-pair-list-intent={listIntent}
        data-photo-pair-claim-aspect={claimTargetAspect ?? undefined}
        data-testid="arrival-photo-pair-panel"
      >
        <ArrivalClaimPicker
          candidates={claimCandidates}
          cartonEmpty={rows.length === 0}
          emptyText={emptyText}
          claimAspect={claimTargetAspect}
          selectedIds={selectedIds}
          gridDensity={gridDensity}
          onDensityChange={setGridDensity}
          onTogglePhoto={togglePhoto}
          onToggleSelectAll={toggleSelectAll}
          onRefresh={() => void refetch()}
          isRefreshing={isFetching && !isPending}
          isPending={isPending}
          isError={isError}
          posting={posting}
          onCheck={() => void claimSelected()}
        />
      </div>
    );
  }

  return (
    <div
      className="space-y-2"
      data-carton-photo-pair
      data-photo-pair-stage={stage}
      data-photo-pair-list-intent={listIntent}
    >
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
        <p className="text-role-caption text-text-soft">Carton photos unavailable.</p>
      ) : rows.length === 0 ? (
        <p className="text-role-caption text-text-soft">{emptyText}</p>
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
                      {legalAspects.map((candidate) => (
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

function ArrivalClaimPicker({
  candidates,
  cartonEmpty,
  emptyText,
  claimAspect,
  selectedIds,
  gridDensity,
  onDensityChange,
  onTogglePhoto,
  onToggleSelectAll,
  onRefresh,
  isRefreshing,
  isPending,
  isError,
  posting,
  onCheck,
}: {
  candidates: readonly MappedRow[];
  cartonEmpty: boolean;
  emptyText: string;
  claimAspect: PhotoAspect | null;
  selectedIds: ReadonlySet<number>;
  gridDensity: PhotoGridDensity;
  onDensityChange: (d: PhotoGridDensity) => void;
  onTogglePhoto: (photoId: number) => void;
  onToggleSelectAll: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
  isPending: boolean;
  isError: boolean;
  posting: boolean;
  onCheck: () => void;
}) {
  const aspectLabel = claimAspect ? photoAspectLabel(claimAspect) : 'Door photo';
  const allSelected =
    candidates.length > 0 && selectedIds.size === candidates.length;
  const canPost = claimAspect != null && selectedIds.size > 0 && !posting;

  const countLabel =
    claimAspect == null
      ? 'Door evidence named'
      : `Attach ${selectedIds.size}/${candidates.length}`;

  return (
    <>
      <div className="flex shrink-0 items-center justify-between gap-0 border-b border-border-hairline px-0 py-0">
        <div className="flex min-w-0 items-center gap-0 px-2">
          <p className="truncate text-role-micro uppercase tracking-widest text-text-soft">
            {countLabel}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-0">
          <PhotoGridDisplayControls
            density={gridDensity}
            onDensityChange={onDensityChange}
            onRefresh={onRefresh}
            isRefreshing={isRefreshing}
            className="gap-0"
            groupClassName={CLAIM_CONTROL_GROUP}
            buttonClassName={CLAIM_DENSITY_BUTTON}
            refreshClassName={CLAIM_ICON_BUTTON}
          />
          {claimAspect != null && candidates.length > 0 ? (
            <HoverTooltip label={allSelected ? 'Clear all' : 'Select all'} asChild>
              <div className={cn(photoLibraryControlGroupClass, 'shrink-0', CLAIM_CONTROL_GROUP)}>
                <button
                  type="button"
                  onClick={onToggleSelectAll}
                  aria-label={allSelected ? 'Clear all' : 'Select all'}
                  aria-pressed={allSelected}
                  data-arrival-select-all
                  className={cn(
                    'ds-raw-button',
                    photoLibraryControlButtonClass(
                      allSelected,
                      cn('w-7', CLAIM_DENSITY_BUTTON),
                    ),
                  )}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            </HoverTooltip>
          ) : null}
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        data-arrival-claim-grid
      >
        {isPending ? (
          <p className="flex items-center gap-2 px-2 py-3 text-role-caption text-text-soft">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading carton photos…
          </p>
        ) : isError ? (
          <p className="px-2 py-3 text-role-caption text-text-soft">
            Carton photos unavailable.
          </p>
        ) : cartonEmpty ? (
          <p className="px-2 py-3 text-role-caption text-text-soft">{emptyText}</p>
        ) : claimAspect == null ? (
          <p className="px-2 py-3 text-role-caption text-text-soft">
            Shipping label and box exterior are already named.
          </p>
        ) : candidates.length === 0 ? (
          <p className="px-2 py-3 text-role-caption text-text-soft">
            Every carton photo is already door evidence — upload or send to phone
            for another shot.
          </p>
        ) : (
          <ul className={cn(photoGridLeafClass(gridDensity), 'gap-0 p-0')}>
            {candidates.map((photo) => {
              const isSel = selectedIds.has(photo.id);
              const ratio = photoGridTileRatio(gridDensity);
              return (
                <li
                  key={photo.id}
                  className={cn(
                    'group relative overflow-hidden border bg-surface-card transition-colors',
                    isSel
                      ? 'border-primary ring-2 ring-inset ring-primary'
                      : 'border-border hover:border-border-default',
                    posting && 'opacity-60',
                  )}
                  data-arrival-claim-tile
                >
                  {/* SelectionMark is a sibling of the tile button — never nested. */}
                  <SelectionMark
                    checked={isSel}
                    active={selectedIds.size > 0}
                    onToggle={() => onTogglePhoto(photo.id)}
                  />
                  {/* ds-raw-button: selection tile — Check footer posts claim */}
                  <button
                    type="button"
                    aria-label={`${isSel ? 'Deselect' : 'Select'} ${aspectLabel} candidate`}
                    aria-pressed={isSel}
                    disabled={posting}
                    className="ds-raw-button block w-full text-left"
                    onClick={() => onTogglePhoto(photo.id)}
                  >
                    <PhotoThumb
                      src={photo.photoUrl}
                      alt=""
                      ratio={ratio}
                      className="w-full"
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <FlushTerminalFooter layout="bleed" data-testid="arrival-claim-check-footer">
        <Button
          type="button"
          variant="primary"
          size="md"
          disabled={!canPost}
          icon={
            posting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )
          }
          ariaLabel={
            posting
              ? `Linking ${aspectLabel.toLowerCase()}`
              : `Check — link as ${aspectLabel.toLowerCase()}`
          }
          data-arrival-claim-check
          onClick={onCheck}
        >
          {posting ? 'Linking…' : 'Check'}
        </Button>
      </FlushTerminalFooter>
    </>
  );
}
