'use client';

/**
 * One line's seller-listing photos ("as listed" scratches, the serial plate):
 * drop, paste (with the zone focused) or add them. New photos stay in memory
 * and upload to the landed receiving line when the order lands; a fixed
 * order's photos already on the line show here with delete.
 */

import { useState } from 'react';
import Image from 'next/image';
import { ImagePlus, X } from '@/components/Icons';
import { PhotoUploadOverlay } from '@/components/shipped/photo-gallery/PhotoUploadOverlay';
import { PhotoHoverPeek } from '@/design-system/components/PhotoHoverPeek';
import { Button, IconButton } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { RECORD_RECESS_CLASS } from '@/design-system/tokens/record';
import { usePhotoDropzone } from '@/hooks/usePhotoDropzone';
import type { LandedListingPhoto, PendingListingPhoto } from '@/lib/inbound/use-inbound-order-form';
import { cn } from '@/utils/_cn';

const THUMB_CLASS = cn(RECORD_RECESS_CLASS, 'relative block size-16 shrink-0 overflow-hidden bg-surface-card');

function Thumb({ src, alt, onRemove, removeLabel }: { src: string; alt: string; onRemove: () => void; removeLabel: string }) {
  return (
    <li className="relative">
      <PhotoHoverPeek src={src} alt={alt} className={THUMB_CLASS}>
        <Image src={src} alt="" fill unoptimized sizes="64px" className="object-cover" />
      </PhotoHoverPeek>
      <IconButton
        size="xs"
        radius="pill"
        icon={<X className="h-3 w-3" />}
        ariaLabel={removeLabel}
        onClick={onRemove}
        className="absolute -right-1.5 -top-1.5 bg-surface-card shadow-elev-soft"
      />
    </li>
  );
}

export function ListingPhotosField({
  position,
  pending,
  landed,
  onAdd,
  onRemovePending,
  onDeleteLanded,
}: {
  /** 1-based item number, for labels. */
  position: number;
  pending: readonly PendingListingPhoto[];
  landed: readonly LandedListingPhoto[];
  onAdd: (files: File[]) => void;
  onRemovePending: (key: string) => void;
  onDeleteLanded: (photo: LandedListingPhoto) => void;
}) {
  const [adding, setAdding] = useState(false);
  const dropzone = usePhotoDropzone(onAdd);
  const count = pending.length + landed.length;
  return (
    <div
      {...dropzone.rootProps}
      tabIndex={0}
      aria-label={`Listing photos for item ${position} — drop or paste images here`}
      className={cn(
        RECORD_RECESS_CLASS,
        'flex flex-col gap-2 border-dashed p-2',
        focusRing('control'),
        dropzone.isDragging && 'border-border-strong bg-surface-sunken',
      )}
      data-testid={`inbound-line-photos-${position - 1}`}
    >
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-role-caption text-text-muted">
          {count ? `Listing photos · ${count}` : 'Listing photos — drop or paste the seller’s photos (as listed, serial plate)'}
        </p>
        <Button variant="secondary" size="sm" icon={<ImagePlus />} onClick={() => setAdding(true)}>
          Add photos
        </Button>
      </div>
      {count ? (
        <ul className="flex flex-wrap gap-2" aria-label={`Listing photos for item ${position}`}>
          {landed.map((photo) => (
            <Thumb
              key={`landed:${photo.id}`}
              src={photo.url}
              alt={`Listing photo ${photo.id}`}
              removeLabel={`Delete listing photo ${photo.id}`}
              onRemove={() => onDeleteLanded(photo)}
            />
          ))}
          {pending.map((photo) => (
            <Thumb
              key={photo.key}
              src={photo.previewUrl}
              alt={photo.file.name || 'Listing photo'}
              removeLabel={`Remove ${photo.file.name || 'photo'}`}
              onRemove={() => onRemovePending(photo.key)}
            />
          ))}
        </ul>
      ) : null}
      <PhotoUploadOverlay
        open={adding}
        onClose={() => setAdding(false)}
        onFiles={(files) => {
          setAdding(false);
          onAdd(files);
        }}
        title={`Listing photos · item ${position}`}
        subtitle="The seller’s photos — they upload to this item when the order lands."
      />
    </div>
  );
}
