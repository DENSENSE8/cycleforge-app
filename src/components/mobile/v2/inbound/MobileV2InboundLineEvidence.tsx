'use client';

/**
 * The listing evidence of one inbound item on the phone (the item sheet's
 * lower half): the serials the listing shows — type one and Enter, or paste
 * many — and the seller's listing photos, taken or chosen, held until the
 * order lands (a fixed order's landed photos show with delete).
 */

import { useRef, useState } from 'react';
import Image from 'next/image';
import { Camera, ImagePlus, X } from '@/components/Icons';
import { MobileNativePhotoInput, MobilePhotoLibraryInput } from '@/components/mobile/photos/MobileNativePhotoCapture';
import { Button, IconButton, TextField } from '@/design-system/primitives';
import { RECORD_RECESS_CLASS } from '@/design-system/tokens/record';
import { addInboundLineSerials, splitPastedList } from '@/lib/inbound/inbound-order-compose';
import {
  toPendingListingPhotos,
  type LandedListingPhoto,
  type PendingListingPhoto,
} from '@/lib/inbound/use-inbound-order-form';
import { cn } from '@/utils/_cn';
import { InboundSectionHeading } from './MobileV2InboundParts';

const THUMB_CLASS = cn(RECORD_RECESS_CLASS, 'relative block size-20 shrink-0 overflow-hidden bg-surface-card');

export function InboundSerialsField({ serials, onChange }: { serials: readonly string[]; onChange: (serials: string[]) => void }) {
  const [text, setText] = useState('');
  const add = (raw: string) => {
    const parts = splitPastedList(raw);
    if (parts.length) onChange(addInboundLineSerials({ listingSerials: [...serials] }, parts).listingSerials ?? []);
    setText('');
  };
  return (
    <>
      <TextField
        label="Listing serials — Enter or paste many"
        value={text}
        mono
        autoCapitalize="characters"
        spellCheck={false}
        onChange={setText}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          add(text);
        }}
        onPaste={(event) => {
          const pasted = event.clipboardData.getData('text');
          if (splitPastedList(pasted).length < 2) return;
          event.preventDefault();
          add(`${text} ${pasted}`);
        }}
        onBlur={() => {
          if (text.trim()) add(text);
        }}
        data-testid="m-inbound-line-serials"
      />
      {serials.length ? (
        <ul className="flex flex-wrap gap-2" aria-label="Listing serials">
          {serials.map((serial, index) => (
            <li key={serial} className={cn(RECORD_RECESS_CLASS, 'inline-flex items-center gap-1 pl-2 font-mono text-role-caption text-text-default')}>
              {serial}
              <IconButton
                size="touch"
                icon={<X className="h-4 w-4" />}
                ariaLabel={`Remove serial ${serial}`}
                onClick={() => onChange(serials.filter((_, i) => i !== index))}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function Thumb({ src, alt, removeLabel, onRemove }: { src: string; alt: string; removeLabel: string; onRemove: () => void }) {
  return (
    <li className="relative">
      <span className={THUMB_CLASS}>
        <Image src={src} alt={alt} fill unoptimized sizes="80px" className="object-cover" />
      </span>
      <IconButton
        size="touch"
        radius="pill"
        icon={<X className="h-4 w-4" />}
        ariaLabel={removeLabel}
        onClick={onRemove}
        className="absolute -right-2 -top-2 bg-surface-card shadow-elev-soft"
      />
    </li>
  );
}

export function InboundListingPhotos({
  photos,
  landedPhotos,
  onPhotos,
  onDeleteLanded,
}: {
  photos: readonly PendingListingPhoto[];
  landedPhotos: readonly LandedListingPhoto[];
  onPhotos: (photos: PendingListingPhoto[]) => void;
  onDeleteLanded: (photo: LandedListingPhoto) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const pick = (files: FileList | null) => {
    const picked = Array.from(files ?? []).filter((file) => file.type.startsWith('image/'));
    if (picked.length) onPhotos([...photos, ...toPendingListingPhotos(picked)]);
  };
  const count = photos.length + landedPhotos.length;
  return (
    <>
      <InboundSectionHeading>{`Listing photos · ${count}`}</InboundSectionHeading>
      <div className="flex flex-col gap-3 px-mode-page py-3" data-testid="m-inbound-line-photos">
        <MobileNativePhotoInput
          ref={cameraRef}
          onChange={(event) => {
            pick(event.target.files);
            event.target.value = '';
          }}
        />
        <MobilePhotoLibraryInput
          ref={libraryRef}
          onChange={(event) => {
            pick(event.target.files);
            event.target.value = '';
          }}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" icon={<Camera />} onClick={() => cameraRef.current?.click()} data-testid="m-inbound-line-camera">
            Take photo
          </Button>
          <Button variant="secondary" icon={<ImagePlus />} onClick={() => libraryRef.current?.click()} data-testid="m-inbound-line-library">
            Choose photos
          </Button>
        </div>
        {count ? (
          <ul className="flex flex-wrap gap-2" aria-label="Listing photos">
            {landedPhotos.map((photo) => (
              <Thumb
                key={`landed:${photo.id}`}
                src={photo.url}
                alt={`Listing photo ${photo.id}`}
                removeLabel={`Delete listing photo ${photo.id}`}
                onRemove={() => onDeleteLanded(photo)}
              />
            ))}
            {photos.map((photo) => (
              <Thumb
                key={photo.key}
                src={photo.previewUrl}
                alt={photo.file.name || 'Listing photo'}
                removeLabel={`Remove ${photo.file.name || 'photo'}`}
                onRemove={() => onPhotos(photos.filter((p) => p.key !== photo.key))}
              />
            ))}
          </ul>
        ) : (
          <p className="text-role-caption text-text-muted">The seller’s photos — as listed, the serial plate. They upload when the order lands.</p>
        )}
      </div>
    </>
  );
}
