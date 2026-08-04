'use client';

/**
 * One bench carton shot — the body for `shipping_label_photo`, `box_photo` AND
 * `packing_material`.
 *
 * ## The card READS. It has no camera.
 *
 * Ruled 2026-08-02: a procedure step card carries no action button. The capture
 * controls for these three steps — the camera pill and `Link a photo` — live in
 * the bottom dock ({@link CartonPhotoDockControl}), contextual to the active
 * step. What is left here is the step's evidence: the shots already taken for
 * THIS aspect, so the operator can see what they have before deciding whether
 * they need another.
 *
 * That is not a demotion of the card. "Show me what I've got" and "take one" are
 * different jobs, and the second one belongs where the operator's hand already
 * is — beside the composer and the Receive terminal, in a band that does not
 * scroll away underneath them.
 *
 * ## Aspect-scoped, deliberately
 *
 * The three bench steps share one stage (`unbox_carton`) and are told apart by
 * aspect alone, so this list is filtered to the step's own aspect. An unscoped
 * gallery here would show the box on the shipping-label card and read as if the
 * step were satisfied.
 *
 * ## Why one component for three steps
 *
 * They differ in exactly one value — which aspect they show. Three
 * near-identical files would be a fork by copy-paste: the kind that stays in
 * sync right up until someone fixes a bug in one of them.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PhotoGallery } from '@/components/shipped/PhotoGallery';
import { receivingPhotosQueryKey } from '@/lib/queries/receiving-queries';
import { receivingPhotoToGalleryInput } from '@/components/shipped/photo-gallery/photo-gallery-utils';
import { photoIntentFromStage } from '@/lib/receiving/photo-intent';
import { photoAspectLabel } from '@/lib/photos/photo-aspects';
import type { UnboxStepBodyContext } from './types';

/** Bench evidence only — never the door's `arrival_package` shots. */
const BENCH_LIST_INTENT = photoIntentFromStage('unbox_carton');

interface CartonPhotoRow {
  id: number;
  receivingId: number;
  photoUrl: string;
  caption: string | null;
  uploadedBy: number | null;
  createdAt: string;
  clientCapturedAt?: string | null;
}

export function CartonPhotoStepBody({ receivingId, aspect, poRef }: UnboxStepBodyContext) {
  const { data, isPending, isError } = useQuery<{ photos: CartonPhotoRow[] }>({
    // Aspect-scoped cache key: sharing the unscoped carton entry is what would
    // make the shipping-label card count a photo of the box.
    queryKey: [...receivingPhotosQueryKey(receivingId), BENCH_LIST_INTENT, aspect ?? 'any'],
    queryFn: async () => {
      const params = new URLSearchParams({
        receivingId: String(receivingId),
        photoIntent: BENCH_LIST_INTENT,
      });
      if (aspect) params.set('photoAspect', aspect);
      const res = await fetch(`/api/receiving-photos?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    enabled: Number.isFinite(receivingId) && receivingId > 0,
    staleTime: 10_000,
  });

  const photos = useMemo(
    () =>
      (data?.photos ?? [])
        .filter((p) => !!p.photoUrl?.trim())
        .map((p) => receivingPhotoToGalleryInput(p, { poRef: poRef ?? null })),
    [data, poRef],
  );

  const noun = aspect ? photoAspectLabel(aspect).toLowerCase() : 'carton';

  if (isPending) {
    return <p className="text-role-caption text-text-soft">Loading photos…</p>;
  }

  // A failed fetch is NOT "nothing shot". Saying so would send the operator to
  // re-shoot evidence that already exists.
  if (isError) {
    return <p className="text-role-caption text-text-soft">Photos unavailable.</p>;
  }

  if (photos.length === 0) {
    return (
      <p className="text-role-caption text-text-soft">
        No photo of the {noun} yet — the camera is in the dock below.
      </p>
    );
  }

  return (
    <PhotoGallery
      photos={photos}
      orderId={`RCV-${receivingId}`}
      receivingId={receivingId}
      launcherLayout="toolbar"
      toolbarShowLabel={false}
      compact
    />
  );
}
