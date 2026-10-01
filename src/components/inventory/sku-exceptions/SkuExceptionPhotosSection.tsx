'use client';

/**
 * SKU exception / stock record — Photos: what the SKU looks like, with the
 * viewer, delete, and (given a `stockId`) the operator's order: tile 0 is the
 * Main (cover) photo; Make main / move earlier / move later persist through
 * `PATCH /api/photos/links` (SKU_STOCK `sort_order`). Controls hover-reveal
 * on a mouse and stay resident at a tap size on touch (`coarse:`). Only when
 * it HAS photos; uploading is the item tile's own Upload / Phone
 * (`StockPhotoTile`), never an empty "No photo" tile here.
 */

import { useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, Star, Trash2 } from '@/components/Icons';
import { usePhotoGallery } from '@/components/shipped/photo-gallery/usePhotoGallery';
import { PhotoViewerPortal } from '@/components/shipped/photo-gallery/PhotoViewerPortal';
import { deletePhoto } from '@/components/shipped/photo-gallery/photo-gallery-api';
import { RecordGroup } from '@/design-system/components/record-ledger/RecordGroup';
import { IconButton } from '@/design-system/primitives';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { toast } from '@/lib/toast';
import { cn } from '@/utils/_cn';

/** One photo the section paints — the placeholder's, or a real SKU's combined set. */
export interface EvidencePhotoItem {
  id: number;
  url: string;
  thumbUrl: string;
}

/** Hover-revealed on a mouse; always resident on touch. */
const REVEAL = 'opacity-0 group-hover/photo:opacity-100 group-focus-within/photo:opacity-100 coarse:opacity-100';
/** 28px on a mouse, 36px tap floor on a finger. */
const CONTROL = 'bg-mode-panel text-mode-ink coarse:h-9 coarse:w-9';

export function SkuExceptionPhotosSection({
  photos,
  stockId,
  onChanged,
  testId = 'sku-exception-photos',
}: {
  photos: readonly EvidencePhotoItem[];
  /** The `sku_stock.id` (SKU_STOCK photo entity); null hides the order controls. */
  stockId: number | null;
  onChanged: () => Promise<void> | void;
  testId?: string;
}) {
  const [deletingId, setDeletingId] = useState<number | null>(null);
  // Optimistic order, pinned to the `photos` snapshot it was made from — a
  // fresh server list (after onChanged) supersedes it.
  const [pending, setPending] = useState<{ base: readonly EvidencePhotoItem[]; ids: number[] } | null>(null);
  const [saving, setSaving] = useState(false);

  const shown: readonly EvidencePhotoItem[] =
    pending && pending.base === photos
      ? pending.ids.flatMap((id) => photos.filter((p) => p.id === id))
      : photos;

  const gallery = usePhotoGallery({
    photos: shown.map((photo) => ({ id: photo.id, url: photo.url, thumbUrl: photo.thumbUrl })),
    onPhotoDeleted: () => void onChanged(),
  });

  const remove = async (photoId: number, url: string) => {
    if (!window.confirm('Delete this photo? This cannot be undone.')) return;
    setDeletingId(photoId);
    try {
      await deletePhoto(photoId, url);
      await onChanged();
      toast.success('Photo deleted');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the photo.');
    } finally {
      setDeletingId(null);
    }
  };

  const reorder = async (ids: number[]) => {
    if (stockId == null) return;
    setPending({ base: photos, ids });
    setSaving(true);
    try {
      const res = await fetch('/api/photos/links', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType: 'SKU_STOCK', entityId: stockId, orderedPhotoIds: ids }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error || `Could not save the photo order (${res.status}).`);
      }
      await onChanged();
    } catch (err) {
      setPending(null);
      toast.error(err instanceof Error ? err.message : 'Could not save the photo order.');
    } finally {
      setSaving(false);
    }
  };

  /** Move the photo at `from` to `to` in the shown order, then persist. */
  const move = (from: number, to: number) => {
    const ids = shown.map((p) => p.id);
    const [id] = ids.splice(from, 1);
    ids.splice(to, 0, id);
    void reorder(ids);
  };

  if (shown.length === 0) return null;

  return (
    <RecordGroup title={`Photos · ${shown.length}`} testId={testId}>
      <ul className="grid grid-cols-4 gap-2 px-4 pb-3 pt-1 coarse:grid-cols-2">
        {shown.map((photo, index) => (
          <li key={photo.id}>
            <EvidencePhoto
              photo={photo}
              index={index}
              count={shown.length}
              orderable={stockId != null && shown.length > 1}
              busy={saving || deletingId === photo.id}
              onOpen={() => gallery.openViewer(index)}
              onDelete={() => void remove(photo.id, photo.url)}
              onMove={(to) => move(index, to)}
            />
          </li>
        ))}
      </ul>
      <PhotoViewerPortal g={gallery} />
    </RecordGroup>
  );
}

function EvidencePhoto({
  photo,
  index,
  count,
  orderable,
  busy,
  onOpen,
  onDelete,
  onMove,
}: {
  photo: EvidencePhotoItem;
  index: number;
  count: number;
  orderable: boolean;
  busy: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onMove: (to: number) => void;
}) {
  const name = `photo ${index + 1} of ${count}`;
  const isMain = index === 0;
  return (
    <div
      className="group/photo relative aspect-square overflow-hidden rounded-mode border border-mode-fact bg-mode-well"
      data-testid="evidence-photo"
      data-photo-id={photo.id}
    >
      <button type="button" aria-label={`Open ${name}`} onClick={onOpen} className={cn('absolute inset-0 cursor-zoom-in', focusRing('control'))}>
        <Image src={photo.thumbUrl} alt="" fill unoptimized sizes="(hover: none) 50vw, 96px" className="object-cover" />
      </button>
      {count > 1 ? (
        <span className="pointer-events-none absolute left-1 top-1 rounded-mode bg-mode-panel px-1.5 py-0.5 text-[11px] font-semibold text-mode-ink">
          {isMain ? 'Main' : 'Side'}
        </span>
      ) : null}
      <IconButton
        icon={<Trash2 className="h-3.5 w-3.5" aria-hidden />}
        ariaLabel={`Delete ${name}`}
        title="Delete"
        size="sm"
        radius="control"
        disabled={busy}
        onClick={onDelete}
        className={cn('absolute right-1 top-1', CONTROL, REVEAL)}
      />
      {orderable ? (
        <div className={cn('absolute inset-x-1 bottom-1 flex items-center justify-between gap-1', REVEAL)}>
          <IconButton
            icon={<ChevronLeft className="h-3.5 w-3.5" />}
            ariaLabel={`Move ${name} earlier`}
            title="Move earlier"
            size="sm"
            radius="control"
            disabled={busy || index === 0}
            onClick={() => onMove(index - 1)}
            className={CONTROL}
          />
          {isMain ? null : (
            <IconButton
              icon={<Star className="h-3.5 w-3.5" />}
              ariaLabel={`Make ${name} the main photo`}
              title="Make main"
              size="sm"
              radius="control"
              disabled={busy}
              onClick={() => onMove(0)}
              className={CONTROL}
            />
          )}
          <IconButton
            icon={<ChevronRight className="h-3.5 w-3.5" />}
            ariaLabel={`Move ${name} later`}
            title="Move later"
            size="sm"
            radius="control"
            disabled={busy || index === count - 1}
            onClick={() => onMove(index + 1)}
            className={CONTROL}
          />
        </div>
      ) : null}
    </div>
  );
}
