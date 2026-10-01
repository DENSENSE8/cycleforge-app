'use client';

/**
 * The stock item's photo — the triage card's rounded thumb at record size,
 * ALWAYS painted, with its two verbs always one reach away: **Upload** (file
 * picker, `useSkuStockPhotoUpload`) and **Phone** (asks this staffer's phone
 * to open its camera for the SKU, `useSkuStockSendToPhone`; the photo lands
 * here live).
 *
 * - No photo: the verbs sit INSIDE the tile, under the product's initials —
 *   the empty tile is the ask (owner 2026-09-30).
 * - A photo: it fills the tile (hover peeks, click opens the shared viewer)
 *   and the two verbs stack under it.
 * - Touch (the phone record, `/m/stock/detail`): the verbs always stack
 *   under the tile at the 44px rung.
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

const TILE_CLASS = 'relative size-28 shrink-0 overflow-hidden rounded-xl ring-1 ring-inset ring-black/5';

export function StockPhotoTile({
  stockId,
  sku,
  photoUrl,
  fullPhotoUrl,
  title,
  onChanged,
  showVerbs = true,
}: {
  stockId: number | null;
  sku: string;
  photoUrl: string | null;
  /** The cover's FULL-resolution URL; the viewer opens this, the tile paints `photoUrl` (the thumb). */
  fullPhotoUrl?: string | null;
  title: string;
  /** A surface reading the SKU client-side re-reads it when a photo lands (`router.refresh` covers route loaders). */
  onChanged?: () => void;
  /** The record menu owns Upload / Phone — the tile stays a photo. */
  showVerbs?: boolean;
}) {
  const upload = useSkuStockPhotoUpload(stockId, onChanged);
  const phone = useSkuStockSendToPhone({ stockId, sku, onChanged });
  const url = photoUrl?.trim() || null;
  const [fullOpen, setFullOpen] = useState(false);
  // Touch: the verbs stack UNDER the tile at the 44px rung — two of them do not fit inside a 112px tile.
  const { isMobile } = useUIModeOptional();

  const verbs = (inTile: boolean) => (
    <>
      <Button
        variant="secondary"
        size={isMobile ? 'lg' : 'sm'}
        radius="surface"
        icon={<Upload aria-hidden />}
        onClick={upload.pick}
        disabled={stockId == null || upload.progress != null}
        className={cn('w-full justify-center', inTile && 'h-7')}
        data-testid="stock-photo-upload"
      >
        {upload.progress ?? 'Upload'}
      </Button>
      <Button
        variant="secondary"
        size={isMobile ? 'lg' : 'sm'}
        radius="surface"
        icon={<Smartphone aria-hidden />}
        onClick={phone.send}
        disabled={!phone.available || phone.busy}
        title={phone.available ? 'Open the camera on your phone for this SKU (P)' : 'No phone paired for this station'}
        className={cn('w-full justify-center', inTile && 'h-7')}
        data-testid="stock-photo-phone"
      >
        {phone.busy ? phone.label : 'Phone'}
      </Button>
    </>
  );

  if (!url && !isMobile) {
    return (
      <div
        className={cn(TILE_CLASS, 'flex flex-col items-stretch justify-end gap-1 bg-surface-sunken p-1.5')}
        data-testid="stock-photo-tile"
        data-empty=""
      >
        {upload.input}
        <span
          className="flex min-h-0 flex-1 items-center justify-center text-base font-semibold text-text-faint"
          data-testid="stock-record-photo"
          aria-hidden
        >
          {recordInitials(title)}
        </span>
        {showVerbs ? verbs(true) : null}
      </div>
    );
  }

  return (
    <div className="flex w-28 shrink-0 flex-col gap-1.5" data-testid="stock-photo-tile">
      {upload.input}
      {url ? (
        <PhotoHoverPeek
          src={url}
          alt={title}
          testId="stock-record-photo"
          className={cn(TILE_CLASS, 'block bg-surface-card')}
          onOpen={fullPhotoUrl ? () => setFullOpen(true) : undefined}
        >
          <Image src={url} alt="" fill unoptimized sizes="112px" className="object-cover" />
        </PhotoHoverPeek>
      ) : (
        <span
          className={cn(TILE_CLASS, 'flex items-center justify-center bg-surface-sunken text-base font-semibold text-text-faint')}
          data-testid="stock-record-photo"
          data-empty=""
          aria-hidden
        >
          {recordInitials(title)}
        </span>
      )}
      {showVerbs ? verbs(false) : null}
      {fullOpen && fullPhotoUrl ? <LightboxPortal photos={[fullPhotoUrl]} onClose={() => setFullOpen(false)} /> : null}
    </div>
  );
}
