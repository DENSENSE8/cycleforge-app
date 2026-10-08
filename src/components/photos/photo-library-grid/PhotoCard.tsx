'use client';

import { type MouseEvent as ReactMouseEvent } from 'react';
import { FileText } from '@/components/Icons';
import type { LibraryPhoto } from '../photo-library-types';
import { isLibraryDocument } from '../photo-library-types';
import type { PhotoLibrarySourceScope } from '@/lib/photos/library-filter-state';
import type { PhotoGridTileRatio } from '@/lib/photos/photo-grid-density';
import { formatDateTimePST } from '@/utils/date';
import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cornerClass } from '@/design-system/tokens/radius';
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
import { preloadImage } from '@/components/shipped/photo-gallery/image-preload';
import { viewerDisplayUrl } from '@/components/shipped/photo-gallery/photo-gallery-utils';

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
  /** Open the shared fullscreen viewer at this photo — the tile's PRIMARY click action on every surface that mounts one. */
  onOpen?: () => void;
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
        // Clipping lives on PhotoThumb itself. Wall tiles (!showLabel) drop the
        // card chrome so the Google Photos entity grid reads as one photo wall;
        // labeled cards keep the bordered shell for identity footers.
        'group relative text-left transition-colors',
        cornerClass('flush'),
        showLabel
          ? cn(
              'border bg-surface-card',
              selected
                ? 'border-primary ring-2 ring-inset ring-primary'
                : 'border-border hover:border-border-default',
            )
          : selected
            ? 'ring-2 ring-inset ring-primary'
            : undefined,
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
        className={cn(
          'ds-raw-button block w-full text-left',
          cornerClass('flush'),
          focusRing('control', 'accent'),
        )}
        onPointerDown={(e) => {
          // Press intent: start the viewer's display image now, so by the time
          // the click opens the viewer it is already in flight (or decoded).
          if (isDocument || !onOpen || e.button !== 0 || clickSelectsInstead(e, selectionActive)) return;
          preloadImage(viewerDisplayUrl(photo.id, photo.displayUrl)).catch(() => {});
        }}
        onClick={(e) => {
          if (clickSelectsInstead(e, selectionActive)) {
            e.preventDefault();
            onSelect({ shift: e.shiftKey });
          } else if (isDocument) {
            // Open the file itself, never the tile's image URL.
            window.open(photo.displayUrl, '_blank', 'noopener,noreferrer');
          } else {
            // Single click = the fullscreen viewer. One click, no debounce, no
            // dblclick-detection delay in front of the tile's primary action.
            onOpen?.();
          }
        }}
      >
        {isDocument ? (
          <div
            className={cn(
              'flex aspect-square flex-col items-center justify-center gap-2 bg-surface-canvas px-3',
              cornerClass('flush'),
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
            className={cornerClass('flush')}
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
