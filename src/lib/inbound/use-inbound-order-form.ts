'use client';

/**
 * The one inbound-order form's state — both faces (desk `/purchasing/new`,
 * phone `/m/receiving/order`) mount this hook and paint it their own way:
 * the draft and its edits (`inbound-order-compose.ts`), the "Still needed"
 * checklist (`inboundOrderMissing`), the server dry run of the exact draft,
 * the seller-listing photos held per line until the order lands, a fixed
 * order's landed listing photos (delete), and the landing itself
 * (POST /api/receiving/inbound/orders → `ingestInboundOrder`, then each
 * line's photos uploaded to its landed receiving line).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '@/hooks';
import {
  appendInboundLine,
  patchInboundLine,
  removeInboundLine,
} from '@/lib/inbound/inbound-order-compose';
import {
  postInboundOrder,
  postInboundOrderPreview,
  uploadInboundListingPhotos,
  type InboundOrderTicketOutcome,
} from '@/lib/inbound/inbound-order-client';
import {
  emptyInboundOrderDraft,
  emptyInboundOrderLine,
  filledInboundLines,
  inboundOrderMissing,
  INBOUND_ORDER_TYPE_LABELS,
  type InboundOrderDraft,
  type InboundOrderLine,
  type InboundOrderNeed,
  type InboundOrderType,
} from '@/lib/inbound/inbound-order-draft';
import type { InboundOrderEditRecord } from '@/lib/inbound/inbound-order-edit';
import type { IngestInboundOrderResult, InboundOrderPreview } from '@/lib/inbound/ingest-inbound-order';
import { deletePhoto } from '@/lib/photos/delete-photo-client';
import { invalidateReceivingFeeds } from '@/lib/queries/receiving-queries';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { toast } from '@/lib/toast';

/** A seller-listing photo held in memory until the order lands. */
export interface PendingListingPhoto {
  key: string;
  file: File;
  /** Object URL for the thumbnail; revoked when the photo is dropped. */
  previewUrl: string;
}

/** A listing photo already on a landed line (fixing an order). */
export interface LandedListingPhoto {
  id: number;
  url: string;
}

export interface InboundOrderLanding {
  type: InboundOrderType;
  result: IngestInboundOrderResult;
  ticket: InboundOrderTicketOutcome | null;
  photos: { uploaded: number; failed: number };
}

interface FormState {
  draft: InboundOrderDraft;
  /** Aligned with `draft.lines`: the photos each line lands with. */
  photos: PendingListingPhoto[][];
}

const PREVIEW_DEBOUNCE_MS = 350;

/** Picked files → photos held for a line (a face that holds a line's photos apart from the form: the phone line sheet). */
export function toPendingListingPhotos(files: readonly File[]): PendingListingPhoto[] {
  return files.map((file) => ({ key: safeRandomUUID(), file, previewUrl: URL.createObjectURL(file) }));
}

/** Releases the thumbnails of photos that are dropped. */
export function revokePendingListingPhotos(photos: readonly PendingListingPhoto[]): void {
  for (const photo of photos) URL.revokeObjectURL(photo.previewUrl);
}

/** The one inbound-order form, as both faces read and edit it. */
export interface InboundOrderFormModel {
  draft: InboundOrderDraft;
  /** The landed order being fixed (`?id=`); null = a new order. */
  record: InboundOrderEditRecord | null;
  missing: InboundOrderNeed[];
  preview: InboundOrderPreview | null;
  previewing: boolean;
  /** Aligned with `draft.lines`. */
  photos: PendingListingPhoto[][];
  submitting: boolean;
  error: string | null;
  landing: InboundOrderLanding | null;
  patch: (next: Partial<InboundOrderDraft>) => void;
  replace: (next: InboundOrderDraft) => void;
  patchLine: (index: number, next: Partial<InboundOrderLine>) => void;
  addLine: () => void;
  putLine: (index: number | null, line: InboundOrderLine, photos: PendingListingPhoto[]) => void;
  removeLine: (index: number) => void;
  addPhotos: (index: number, files: readonly File[]) => void;
  removePhoto: (index: number, key: string) => void;
  landedPhotos: (line: InboundOrderLine) => LandedListingPhoto[];
  deleteLandedPhoto: (photo: LandedListingPhoto) => Promise<void>;
  refreshPreview: () => void;
  submit: () => Promise<void>;
}

export function useInboundOrderForm({ record, type }: { record: InboundOrderEditRecord | null; type: InboundOrderType }): InboundOrderFormModel {
  const queryClient = useQueryClient();
  const [state, setState] = useState<FormState>(() => {
    const draft = record?.draft ?? emptyInboundOrderDraft(type);
    return { draft, photos: draft.lines.map(() => []) };
  });
  const { draft, photos } = state;
  const [preview, setPreview] = useState<InboundOrderPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [landing, setLanding] = useState<InboundOrderLanding | null>(null);
  const [deletedPhotoIds, setDeletedPhotoIds] = useState<ReadonlySet<number>>(() => new Set());
  const idempotencyKey = useRef(safeRandomUUID());
  const missing = useMemo<InboundOrderNeed[]>(() => inboundOrderMissing(draft), [draft]);
  const debounced = useDebounce(draft, PREVIEW_DEBOUNCE_MS);

  // Object URLs live as long as the form: revoke whatever is still held on unmount.
  const held = useRef(photos);
  held.current = photos;
  useEffect(() => () => held.current.forEach(revokePendingListingPhotos), []);

  // The server dry run of the exact draft: what landing will create / update.
  useEffect(() => {
    if (!debounced.orderNumber.trim() && filledInboundLines(debounced).length === 0) {
      setPreview(null);
      return;
    }
    const abort = new AbortController();
    setPreviewing(true);
    postInboundOrderPreview(debounced, abort.signal)
      .then(setPreview)
      .catch(() => {
        if (!abort.signal.aborted) setPreview(null);
      })
      .finally(() => {
        if (!abort.signal.aborted) setPreviewing(false);
      });
    return () => abort.abort();
  }, [debounced, previewNonce]);

  const patch = useCallback((next: Partial<InboundOrderDraft>) => {
    setState((s) => ({ ...s, draft: { ...s.draft, ...next } }));
  }, []);

  /** A whole new draft (filled from a document): held photos are dropped with the old lines. */
  const replace = useCallback((next: InboundOrderDraft) => {
    setState((s) => {
      s.photos.forEach(revokePendingListingPhotos);
      return { draft: next, photos: next.lines.map(() => []) };
    });
  }, []);

  const patchLine = useCallback((index: number, next: Partial<InboundOrderLine>) => {
    setState((s) => ({ ...s, draft: patchInboundLine(s.draft, index, next) }));
  }, []);

  const addLine = useCallback(() => {
    setState((s) => ({
      draft: { ...s.draft, lines: [...s.draft.lines, emptyInboundOrderLine()] },
      photos: [...s.photos, []],
    }));
  }, []);

  /** A line edited apart from the form (the phone's line sheet): `index` null adds it. */
  const putLine = useCallback((index: number | null, line: InboundOrderLine, files: PendingListingPhoto[]) => {
    setState((s) => {
      if (index != null) {
        return { draft: patchInboundLine(s.draft, index, line), photos: s.photos.map((p, i) => (i === index ? files : p)) };
      }
      const appended = appendInboundLine(s.draft, line);
      // The lone blank starter line was replaced, not kept above the new one.
      if (appended.draft.lines.length === 1) {
        s.photos.forEach(revokePendingListingPhotos);
        return { draft: appended.draft, photos: [files] };
      }
      return { draft: appended.draft, photos: [...s.photos, files] };
    });
  }, []);

  const removeLine = useCallback((index: number) => {
    setState((s) => {
      revokePendingListingPhotos(s.photos[index] ?? []);
      const next = removeInboundLine(s.draft, index);
      const kept = s.photos.filter((_, i) => i !== index);
      return { draft: next, photos: kept.length ? kept : [[]] };
    });
  }, []);

  const addPhotos = useCallback((index: number, files: readonly File[]) => {
    if (files.length === 0) return;
    const added = toPendingListingPhotos(files);
    setState((s) => ({ ...s, photos: s.photos.map((p, i) => (i === index ? [...p, ...added] : p)) }));
  }, []);

  const removePhoto = useCallback((index: number, key: string) => {
    setState((s) => ({
      ...s,
      photos: s.photos.map((p, i) => {
        if (i !== index) return p;
        revokePendingListingPhotos(p.filter((photo) => photo.key === key));
        return p.filter((photo) => photo.key !== key);
      }),
    }));
  }, []);

  /** Listing photos already on a landed line of the order being fixed. */
  const landedPhotos = useCallback(
    (line: InboundOrderLine): LandedListingPhoto[] =>
      (record?.lineEvidence.find((e) => e.lineKey === line.lineKey)?.listingPhotos ?? []).filter((p) => !deletedPhotoIds.has(p.id)),
    [record, deletedPhotoIds],
  );

  const deleteLandedPhoto = useCallback(async (photo: LandedListingPhoto) => {
    try {
      await deletePhoto(photo.id, photo.url);
      setDeletedPhotoIds((ids) => new Set(ids).add(photo.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not delete the photo');
    }
  }, []);

  /** The dry run is stale (an order was deleted under it): ask again. */
  const refreshPreview = useCallback(() => setPreviewNonce((n) => n + 1), []);

  const submit = useCallback(async () => {
    if (missing.length > 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { result, ticket } = await postInboundOrder(draft, idempotencyKey.current);
      invalidateReceivingFeeds(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['inbound-order-edit'] });
      void queryClient.invalidateQueries({ queryKey: ['inbound-orders-for-carton'] });
      const photoResult = photos.some((p) => p.length)
        ? await uploadInboundListingPhotos(draft, result, photos.map((p) => p.map((photo) => photo.file)))
        : { uploaded: 0, failed: 0 };
      if (photoResult.failed) toast.error(`${photoResult.failed} listing photo${photoResult.failed === 1 ? '' : 's'} did not upload — add them again from the order`);
      if (ticket?.success && ticket.ticketNumber) toast.success(`Ticket ${ticket.ticketNumber} linked`);
      if (ticket && !ticket.success) toast.error(`${INBOUND_ORDER_TYPE_LABELS[draft.type]} landed; the claim ticket was not filed — ${ticket.error}`);
      setLanding({ type: draft.type, result, ticket, photos: photoResult });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not add the order';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }, [draft, missing.length, photos, queryClient, submitting]);

  return {
    draft,
    record,
    missing,
    preview,
    previewing,
    photos,
    submitting,
    error,
    landing,
    patch,
    replace,
    patchLine,
    addLine,
    putLine,
    removeLine,
    addPhotos,
    removePhoto,
    landedPhotos,
    deleteLandedPhoto,
    refreshPreview,
    submit,
  };
}
