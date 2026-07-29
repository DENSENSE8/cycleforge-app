'use client';

import { type MouseEvent as ReactMouseEvent } from 'react';
import { FileText } from '@/components/Icons';
import type { LibraryPhoto } from '../photo-library-types';
import { isLibraryDocument } from '../photo-library-types';
import type { PhotoLibrarySourceScope } from '@/lib/photos/library-filter-state';
import type { PhotoGridTileRatio } from '@/lib/photos/photo-grid-density';
import { photoHeroLayoutId } from '@/components/shipped/photo-gallery/photo-gallery-utils';
import { formatDateTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { PhotoThumb } from '../PhotoThumb';
import { PhotoLabelChips } from '../PhotoLabelChips';
import { SelectionMark } from './SelectionMark';
import {
  clickSelectsInstead,
  documentPrimaryLabel,
  photoIdentityLine,
  photoPrimaryLabel,
  photoRefLabel,
} from './photo-grid-format';
import type { TileSelectMods } from './types';

function documentTypeLabel(documentType?: string): string {
  if (documentType === 'shipping_label') return 'Shipping label';
  if (documentType === 'packing_slip') return 'Packing slip';
  return 'Document';
}

/** A single tile — image + optional label footer — shared by every grid view. */
export function PhotoCard({
  photo,
  imageUrl,
  scope,
  ratio = 'square',
  showLabel,
  selectionActive,
  selected,
  onSelect,
  onOpen,
  onInspect,
  onContextMenu,
}: {
  photo: LibraryPhoto;
  imageUrl: string;
  /** Source scope — drives the PO# vs Zendesk-ticket# label. */
  scope: PhotoLibrarySourceScope;
  ratio?: PhotoGridTileRatio;
  showLabel: boolean;
  selectionActive: boolean;
  selected: boolean;
  onSelect: (mods: TileSelectMods) => void;
  /** Open the shared fullscreen viewer at this photo (flat views only). */
  onOpen?: () => void;
  /**
   * Open the non-modal inspector for this photo. When supplied it takes over
   * single-click and `onOpen` moves to double-click; when omitted (pickers,
   * embedded grids with no rail) single-click still opens the viewer.
   */
  onInspect?: () => void;
  /** Right-click handler — surfaces the per-photo action menu. */
  onContextMenu?: (photo: LibraryPhoto, e: ReactMouseEvent) => void;
}) {
  const isDocument = isLibraryDocument(photo);
  // Title = short ref (ticket / PO); SKU · serial renders as its own meta line
  // (house one-row anatomy); the full evidence name feeds the image alt.
  const primaryLabel = isDocument ? documentPrimaryLabel(photo) : photoPrimaryLabel(photo, scope);
  const refLabel = isDocument ? primaryLabel : photoRefLabel(photo, scope);
  const identityLine = isDocument ? null : photoIdentityLine(photo);

  return (
    <div
      onContextMenu={onContextMenu && !isDocument ? (e) => onContextMenu(photo, e) : undefined}
      className={cn(
        // No `overflow-hidden` here — clipping lives on PhotoThumb itself
        // (matching `rounded-lg`) so the hero-morph shared-layout transform
        // (see PhotoThumb `heroId`) isn't cut off by this ancestor mid-animation;
        // it stays visually ON TOP of this border rather than clipped behind it.
        'group relative rounded-lg border bg-surface-card text-left transition-colors',
        selected ? 'border-primary ring-2 ring-inset ring-primary' : 'border-border hover:border-border-default',
      )}
    >
      <SelectionMark
        checked={selected}
        active={selectionActive}
        onToggle={(mods) => onSelect(mods)}
      />
      <button
        type="button"
        data-testid={isDocument ? 'document-tile' : 'photo-tile'}
        // Roving-focus target for grid arrow-key nav (usePhotoGridKeyboardNav).
        data-photo-tile=""
        data-photo-id={photo.id}
        className={cn('ds-raw-button block w-full rounded-lg text-left', focusRing('control', 'accent'))}
        onClick={(e) => {
          if (clickSelectsInstead(e, selectionActive)) {
            e.preventDefault();
            onSelect({ shift: e.shiftKey });
          } else if (isDocument) {
            window.open(imageUrl, '_blank', 'noopener,noreferrer');
          } else if (onInspect) {
            // Single click = inspect (the common act: read this photo's evidence
            // identity while its neighbours stay visible). Immersion is the
            // double-click below, so this path must NOT be debounced — adding a
            // dblclick-detection delay would put latency on the primary action.
            onInspect();
          } else {
            onOpen?.();
          }
        }}
        onDoubleClick={(e) => {
          // Double click = full-screen lightbox. `onClick` has already fired and
          // opened the inspector; that is intended — the inspector is non-modal
          // and stays behind the viewer, so closing the viewer returns the
          // operator to the record they were reading rather than to nothing.
          if (isDocument || clickSelectsInstead(e, selectionActive)) return;
          e.preventDefault();
          onOpen?.();
        }}
      >
        {isDocument ? (
          <div
            className={cn(
              'flex aspect-square flex-col items-center justify-center gap-2 bg-surface-canvas px-3',
              showLabel ? 'rounded-t-lg' : 'rounded-lg',
            )}
          >
            <FileText className="h-10 w-10 text-text-faint" />
            <span className="text-center text-role-micro font-semibold text-text-muted">
              {documentTypeLabel(photo.documentType)}
            </span>
          </div>
        ) : (
          <PhotoThumb
            src={imageUrl}
            alt={primaryLabel}
            ratio={ratio}
            damage={Boolean(photo.damageDetected)}
            heroId={photoHeroLayoutId(photo.id)}
            // Only rounds the corners that sit at the CARD's own edge — top-only
            // when a label footer follows below, so the hero-morph transform
            // (unclipped by the ancestor, see the wrapper `div` above) still
            // matches the card's static rounded silhouette at rest.
            className={showLabel ? 'rounded-t-lg' : 'rounded-lg'}
          />
        )}
        {showLabel ? (
          <div className="space-y-1 px-2.5 py-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-role-caption font-semibold text-text-default">{refLabel}</div>
                {identityLine ? (
                  <div className="truncate text-role-micro font-semibold tabular-nums text-text-muted">
                    {identityLine}
                  </div>
                ) : null}
                <div className="truncate text-role-micro text-text-soft">{formatDateTimePST(photo.createdAt)}</div>
              </div>
            </div>
            {!isDocument ? <PhotoLabelChips labels={photo.labels} max={3} /> : null}
          </div>
        ) : null}
      </button>
    </div>
  );
}
