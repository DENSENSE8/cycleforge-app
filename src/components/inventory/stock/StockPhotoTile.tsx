'use client';

/**
 * The stock item's photo — the triage card's rounded thumb, ALWAYS painted —
 * and its two verbs, {@link StockPhotoVerbs}: **Upload** (file picker,
 * `useSkuStockPhotoUpload`) and **Phone** (asks this staffer's phone to open
 * its camera for the SKU, `useSkuStockSendToPhone`; the photo lands live).
 *
 * - No photo: the verbs sit INSIDE the tile, under the product's initials —
 *   the empty tile is the ask (owner 2026-09-30).
 * - A photo: it fills the tile (hover peeks, click opens the shared viewer)
 *   and the verbs stack under it — unless the photo is the SKU's own linked
 *   cover and the surface paints them on its Photos header instead
 *   (`verbsOnHeader`, the stock record, owner 2026-10-08).
 * - Touch (the phone record): the verbs stack under the tile at the 44px rung.
 */

import Image from 'next/image';
import { useState } from 'react';
import { Smartphone, Upload } from '@/components/Icons';
import { LightboxPortal } from '@/components/photos/photo-library-grid/LightboxPortal';
import { PhotoHoverPeek } from '@/design-system/components/PhotoHoverPeek';
import { recordInitials } from '@/design-system/components/record-ledger/RecordPhoto';
import { Button } from '@/design-system/primitives';
import { useUIModeOptional } from '@/design-system/providers/UIModeProvider';
import { cn } from '@/utils/_cn';
import { useSkuStockPhotoUpload } from './useSkuStockPhotoUpload';
import { useSkuStockSendToPhone } from './useSkuStockSendToPhone';

const TILE_FRAME_CLASS = 'relative shrink-0 overflow-hidden rounded-xl ring-1 ring-inset ring-black/5';

/** `thumb` is the card-sized photo; `hero` is the stock record's identity photo (owner 2026-10-08: "a lot bigger"). */
export type StockPhotoTileSize = 'thumb' | 'hero';

const TILE_SIZE: Record<StockPhotoTileSize, { box: string; width: string; sizes: string; initials: string }> = {
  thumb: { box: 'size-28', width: 'w-28', sizes: '112px', initials: 'text-base' },
  hero: { box: 'size-56', width: 'w-56', sizes: '224px', initials: 'text-4xl' },
};

/**
 * Upload · Phone for one SKU's photos. `face="tile"` fills a tile column;
 * `face="header"` sits compact on a group header row.
 */
export function StockPhotoVerbs({
  stockId,
  sku,
  onChanged,
  face,
}: {
  stockId: number | null;
  sku: string;
  onChanged?: () => void;
  face: 'tile' | 'stack' | 'header';
}) {
  const upload = useSkuStockPhotoUpload(stockId, onChanged);
  const phone = useSkuStockSendToPhone({ stockId, sku, onChanged });
  const { isMobile } = useUIModeOptional();
  // The verbs read as presses (owner 2026-10-05): a blue-tint face that
  // deepens under the pointer — the neutral face looked inert on the tile.
  const className = cn('cursor-pointer justify-center', face !== 'header' && 'w-full', face === 'tile' && 'h-7');
  const size = isMobile ? 'lg' : 'sm';
  return (
    <>
      {upload.input}
      <Button
        variant="primarySoft"
        size={size}
        radius="surface"
        icon={<Upload aria-hidden />}
        onClick={upload.pick}
        disabled={stockId == null || upload.progress != null}
        className={className}
        data-testid="stock-photo-upload"
      >
        {upload.progress ?? 'Upload'}
      </Button>
      <Button
        variant="primarySoft"
        size={size}
        radius="surface"
        icon={<Smartphone aria-hidden />}
        onClick={phone.send}
        disabled={!phone.available || phone.busy}
        title={phone.available ? 'Send to phone — open its camera for this SKU' : 'No phone paired for this station'}
        className={className}
        data-testid="stock-photo-phone"
      >
        {phone.busy ? phone.label : 'Phone'}
      </Button>
    </>
  );
}

export function StockPhotoTile({
  stockId,
  sku,
  photoUrl,
  fullPhotoUrl,
  title,
  onChanged,
  size = 'thumb',
  verbsOnHeader = false,
}: {
  stockId: number | null;
  sku: string;
  photoUrl: string | null;
  /** The cover's FULL-resolution URL; the viewer opens this, the tile paints `photoUrl` (the thumb). */
  fullPhotoUrl?: string | null;
  title: string;
  /** A surface reading the SKU client-side re-reads it when a photo lands (`router.refresh` covers route loaders). */
  onChanged?: () => void;
  size?: StockPhotoTileSize;
  /** The photo is the SKU's linked cover and the surface's Photos header holds Upload · Phone: none here. */
  verbsOnHeader?: boolean;
}) {
  const url = photoUrl?.trim() || null;
  const [fullOpen, setFullOpen] = useState(false);
  const { isMobile } = useUIModeOptional();
  const dims = TILE_SIZE[size];
  const tileClass = cn(TILE_FRAME_CLASS, dims.box);

  if (!url && !isMobile) {
    return (
      <div
        className={cn(tileClass, 'flex flex-col items-stretch justify-end gap-1 bg-surface-sunken p-1.5')}
        data-testid="stock-photo-tile"
        data-empty=""
      >
        <span
          className={cn('flex min-h-0 flex-1 items-center justify-center font-semibold text-text-faint', dims.initials)}
          data-testid="stock-record-photo"
          aria-hidden
        >
          {recordInitials(title)}
        </span>
        <StockPhotoVerbs stockId={stockId} sku={sku} onChanged={onChanged} face="tile" />
      </div>
    );
  }

  return (
    <div className={cn('flex shrink-0 flex-col gap-1.5', dims.width)} data-testid="stock-photo-tile">
      {url ? (
        <PhotoHoverPeek
          src={url}
          alt={title}
          testId="stock-record-photo"
          className={cn(tileClass, 'block bg-surface-card')}
          onOpen={fullPhotoUrl ? () => setFullOpen(true) : undefined}
        >
          <Image src={url} alt="" fill unoptimized sizes={dims.sizes} className="object-cover" />
        </PhotoHoverPeek>
      ) : (
        <span
          className={cn(tileClass, 'flex items-center justify-center bg-surface-sunken font-semibold text-text-faint', dims.initials)}
          data-testid="stock-record-photo"
          data-empty=""
          aria-hidden
        >
          {recordInitials(title)}
        </span>
      )}
      {verbsOnHeader ? null : <StockPhotoVerbs stockId={stockId} sku={sku} onChanged={onChanged} face="stack" />}
      {fullOpen && fullPhotoUrl ? <LightboxPortal photos={[fullPhotoUrl]} onClose={() => setFullOpen(false)} /> : null}
    </div>
  );
}
