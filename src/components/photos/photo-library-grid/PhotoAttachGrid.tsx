'use client';

/**
 * The shared "select existing photos → one Check commits them onto a target"
 * grid — the ATTACH waist.
 *
 * ## Why this exists
 *
 * The exact same face — header count · density + refresh · select-all Pencil ·
 * scrollable tile grid with {@link SelectionMark} · sticky Check footer — was
 * hand-rolled three times (Arrival claim, item Link, and a broken item rows
 * list) with byte-identical flush-chrome constants. They differ in ONE thing:
 * the commit verb. Arrival posts `claim-stage`; item posts `reassign` onto a
 * line. Everything else is this component.
 *
 * The caller supplies:
 *   - `candidates` — the selectable pool
 *   - `onCommit(ids)` — the verb (must reject on failure; resolve = success)
 *   - copy (`countNoun`, `emptyText`, `unavailable`)
 *
 * This owns selection, density, and the posting flag, so a caller is a thin
 * adapter. Selection clears only when `onCommit` resolves; a rejected commit
 * keeps the operator's picks so they can retry.
 *
 * NOT for the classify job (name what one shot shows) or for the claim panel's
 * capture+view surface (external selection, camera, gallery) — those are
 * different interactions, not this waist.
 */

import { useCallback, useState } from 'react';
import { Check, Loader2, Pencil } from '@/components/Icons';
import { PhotoGridDisplayControls } from '@/components/photos/PhotoGridDisplayControls';
import {
  photoAttachControlGroupClass,
  photoAttachDensityButtonClass,
  photoAttachIconButtonClass,
  photoLibraryControlButtonClass,
  photoLibraryControlGroupClass,
} from '@/components/photos/photo-library-controls';
import { SelectionMark } from '@/components/photos/photo-library-grid/SelectionMark';
import { PhotoThumb } from '@/components/photos/PhotoThumb';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { Button, FlushTerminalFooter } from '@/design-system/primitives';
import {
  DEFAULT_PHOTO_GRID_DENSITY,
  type PhotoGridDensity,
  photoGridLeafClass,
  photoGridTileRatio,
} from '@/lib/photos/photo-grid-density';
import { cn } from '@/utils/_cn';

export interface PhotoAttachCandidate {
  id: number;
  photoUrl: string;
}

interface PhotoAttachGridProps {
  /** The selectable pool. */
  candidates: readonly PhotoAttachCandidate[];
  isPending: boolean;
  isError: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
  /** Message when the pool is empty (caller disambiguates carton-empty vs all-claimed). */
  emptyText: string;
  /**
   * The commit verb. Rejects on failure (the primitive keeps the selection so
   * the operator can retry); resolves on success (the primitive clears it).
   */
  onCommit: (ids: number[]) => Promise<void>;
  /** Header verb — `Attach 2/5`. */
  countNoun?: string;
  /** Footer button label. */
  checkLabel?: string;
  /** Noun for the Check aria-label — "Check — link as <noun>". */
  checkNoun?: string;
  /** Noun for the tile aria — "Select <noun>". */
  tileNoun?: string;
  /**
   * Set when there is no valid commit target right now (Arrival: both door
   * aspects already named). Replaces the count + grid, hides select-all, and
   * disables Check.
   */
  unavailable?: { label: string; body: string } | null;
}

export function PhotoAttachGrid({
  candidates,
  isPending,
  isError,
  onRefresh,
  isRefreshing,
  emptyText,
  onCommit,
  countNoun = 'Attach',
  checkLabel = 'Check',
  checkNoun = 'photo',
  tileNoun = 'photo',
  unavailable = null,
}: PhotoAttachGridProps) {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [density, setDensity] = useState<PhotoGridDensity>(DEFAULT_PHOTO_GRID_DENSITY);
  const [posting, setPosting] = useState(false);

  const togglePhoto = useCallback((photoId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  }, []);

  const allSelected =
    candidates.length > 0 && selectedIds.size === candidates.length;

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === candidates.length && candidates.length > 0
        ? new Set()
        : new Set(candidates.map((c) => c.id)),
    );
  }, [candidates]);

  const canPost = unavailable == null && selectedIds.size > 0 && !posting;

  const handleCheck = useCallback(async () => {
    if (!canPost) return;
    setPosting(true);
    try {
      await onCommit([...selectedIds]);
      setSelectedIds(new Set());
    } catch {
      // Keep the selection — the caller has already surfaced the error toast.
    } finally {
      setPosting(false);
    }
  }, [canPost, onCommit, selectedIds]);

  const countLabel = unavailable
    ? unavailable.label
    : `${countNoun} ${selectedIds.size}/${candidates.length}`;

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
            density={density}
            onDensityChange={setDensity}
            onRefresh={onRefresh}
            isRefreshing={isRefreshing}
            className="gap-0"
            groupClassName={photoAttachControlGroupClass}
            buttonClassName={photoAttachDensityButtonClass}
            refreshClassName={photoAttachIconButtonClass}
          />
          {unavailable == null && candidates.length > 0 ? (
            <HoverTooltip label={allSelected ? 'Clear all' : 'Select all'} asChild>
              <div
                className={cn(
                  photoLibraryControlGroupClass,
                  'shrink-0',
                  photoAttachControlGroupClass,
                )}
              >
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  aria-label={allSelected ? 'Clear all' : 'Select all'}
                  aria-pressed={allSelected}
                  data-photo-attach-select-all
                  className={cn(
                    'ds-raw-button',
                    photoLibraryControlButtonClass(
                      allSelected,
                      cn('w-7', photoAttachDensityButtonClass),
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
        data-photo-attach-grid
      >
        {isPending ? (
          <p className="flex items-center gap-2 px-2 py-3 text-role-caption text-text-soft">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading carton photos…
          </p>
        ) : isError ? (
          <p className="px-2 py-3 text-role-caption text-text-soft">
            Carton photos unavailable.
          </p>
        ) : unavailable ? (
          <p className="px-2 py-3 text-role-caption text-text-soft">{unavailable.body}</p>
        ) : candidates.length === 0 ? (
          <p className="px-2 py-3 text-role-caption text-text-soft">{emptyText}</p>
        ) : (
          <ul className={cn(photoGridLeafClass(density), 'gap-0 p-0')}>
            {candidates.map((photo) => {
              const isSel = selectedIds.has(photo.id);
              const ratio = photoGridTileRatio(density);
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
                  data-photo-attach-tile
                >
                  {/* SelectionMark is a sibling of the tile button — never nested. */}
                  <SelectionMark
                    checked={isSel}
                    active={selectedIds.size > 0}
                    onToggle={() => togglePhoto(photo.id)}
                  />
                  {/* ds-raw-button: selection tile — Check footer posts the verb */}
                  <button
                    type="button"
                    aria-label={`${isSel ? 'Deselect' : 'Select'} ${tileNoun}`}
                    aria-pressed={isSel}
                    disabled={posting}
                    className="ds-raw-button block w-full text-left"
                    onClick={() => togglePhoto(photo.id)}
                  >
                    <PhotoThumb src={photo.photoUrl} alt="" ratio={ratio} className="w-full" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <FlushTerminalFooter layout="bleed" data-testid="photo-attach-check-footer">
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
            posting ? `Linking ${checkNoun}` : `${checkLabel} — link as ${checkNoun}`
          }
          data-photo-attach-check
          onClick={() => void handleCheck()}
        >
          {posting ? 'Linking…' : checkLabel}
        </Button>
      </FlushTerminalFooter>
    </>
  );
}
