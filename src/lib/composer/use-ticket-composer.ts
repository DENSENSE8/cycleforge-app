'use client';

/**
 * Everything a ticket composer IS, minus the chrome.
 *
 * Draft · channel · Cc · staged photos · the `+` tree · the send. One place,
 * because the two hosts that need it are shaped differently and cannot share a
 * dock: the `/support` console mounts a composer of its own, while the station
 * shares ONE textarea between Unbox notes and Ticket replies and switches its
 * `value` by mode.
 *
 * Sharing only the CHROME was not enough — that is exactly how the console and
 * the station drifted the first time. Each kept its own `isPublic`, its own CC
 * list and its own hand-assembled `SupportReplyVars`, so signing, `emailCcs`
 * and `photoIds` diverged three separate ways and only one surface ever knew
 * about CCs. The behaviour is the SoT; the chrome follows it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { usePhotoDropzone } from '@/hooks/usePhotoDropzone';
import { useSupportReply } from '@/hooks/useSupportReply';
import { useTicketPhotoStaging, type TicketPhotoStaging } from '@/hooks/useTicketPhotoStaging';
import { zendeskKeys } from '@/hooks/useZendeskQueries';
import { buildComposerReplyVars } from '@/lib/composer/ticket-reply-payload';
import { buildTicketComposerInsertTree } from '@/lib/composer/ticket-composer-insert-tree';
import { photoContentUrl } from '@/lib/photos/display-url';
import type { ComposerDrillNode } from '@/components/composer/ComposerDrillMenu';

export type UseTicketComposerOptions = {
  /** Live ticket id. `null` on an unlinked carton — the draft is a claim body. */
  ticketId: number | null;
  /** Carton scope for the media library's "Current carton" tab. */
  receivingId?: number | null;
  /**
   * Host-owned staging. The console's ticket panel owns the drop overlay and
   * passes its bag in so the overlay and the composer stage into one list;
   * omit it and this hook keeps its own.
   */
  staging?: TicketPhotoStaging;
  /** Icons for the `+` rows — the host owns glyph sizing. */
  insertIcons?: { browse?: ComposerDrillNode['icon']; upload?: ComposerDrillNode['icon'] };
  onSent?: () => void;
  /**
   * Editable first draft (e.g. a repair status update handed over from
   * `/m/rs/[id]`). Seeds the body once; nothing sends until the operator does.
   */
  initialBody?: string;
  /**
   * Existing photo ids to stage as attachments on arrival (e.g. repair photos
   * picked on `/m/rs/[id]/photos`). Staged once through the same library path
   * as the `+` → Browse picker; they ride the next reply only if it is sent.
   */
  initialPhotoIds?: readonly number[];
  /** Starting channel; omitted keeps the PUBLIC-first default. */
  initialIsPublic?: boolean;
};

export function useTicketComposer({
  ticketId,
  receivingId,
  staging: hostStaging,
  insertIcons,
  onSent,
  initialBody,
  initialPhotoIds,
  initialIsPublic,
}: UseTicketComposerOptions) {
  const [body, setBody] = useState(initialBody ?? '');
  // PUBLIC first (operator ruling 2026-08-31). Ticket work is outbound: a claim
  // exists to reach a seller and a reply answers one, so Internal-first put the
  // extra tap on the common case. A handing-over surface may choose otherwise.
  const [isPublic, setIsPublic] = useState(initialIsPublic ?? true);
  const [ccs, setCcs] = useState<string[]>([]);
  // Held here, not inside the strip, so send can fold a half-typed address in
  // rather than dropping it.
  const [ccDraft, setCcDraft] = useState('');
  const [libraryOpen, setLibraryOpen] = useState(false);

  const queryClient = useQueryClient();
  const reply = useSupportReply();
  const { user, has, isLoaded } = useAuth();
  const canPost = !isLoaded || has('integrations.zendesk');
  const canBrowseLibrary = isLoaded && has('photos.view');

  // Unconditional: the hook only reads `ticketId` inside its callbacks, so an
  // unlinked carton (id 0) costs nothing and the Photos rows stay hidden.
  const ownStaging = useTicketPhotoStaging(ticketId ?? 0);
  const staging = hostStaging ?? ownStaging;
  const picker = usePhotoDropzone(staging.addFiles);

  const stagedDone = staging.staged.filter(
    (s) => s.status === 'done' && typeof s.photoId === 'number',
  );
  const stagedPhotoIds = useMemo(
    () => new Set(stagedDone.map((s) => s.photoId!)),
    [stagedDone],
  );

  // Hand-over photos stage exactly once per ticket, through the same library
  // path as the `+` → Browse picker (link to the ticket, ride the next reply).
  // The ref also absorbs React's dev double-effect so the link fires once.
  const seededFor = useRef<number | null>(null);
  const addLibraryPhotos = staging.addLibraryPhotos;
  useEffect(() => {
    if (ticketId == null || !initialPhotoIds?.length || seededFor.current === ticketId) return;
    seededFor.current = ticketId;
    addLibraryPhotos(
      initialPhotoIds.map((id) => ({
        id,
        url: photoContentUrl(id),
        thumbUrl: photoContentUrl(id, 'thumb'),
      })),
    );
  }, [ticketId, initialPhotoIds, addLibraryPhotos]);

  // A new ticket is a new audience. CCs belong to the thread that was on
  // screen, never to whichever one loads next.
  useEffect(() => {
    setCcs([]);
    setCcDraft('');
  }, [ticketId]);

  const busy = !canPost || reply.isPending || staging.uploading;

  const send = useCallback(() => {
    if (ticketId == null || busy) return;
    const vars = buildComposerReplyVars({
      ticketId,
      body,
      isPublic,
      staffName: user?.name?.trim() || '',
      staffId: user?.staffId ?? null,
      ccs,
      ccDraft,
      photoIds: stagedDone.map((s) => s.photoId!),
      attachmentPreviews: stagedDone.map((s) => ({ url: s.url!, thumbUrl: s.thumbUrl })),
    });
    if (!vars) return;
    reply.mutate(vars, {
      onSuccess: () => {
        setBody('');
        setCcs([]);
        setCcDraft('');
        staging.clear();
        onSent?.();
      },
    });
  }, [ticketId, busy, body, isPublic, user, ccs, ccDraft, stagedDone, reply, staging, onSent]);

  const insertNodes = useMemo(
    () =>
      buildTicketComposerInsertTree({
        photos:
          ticketId != null
            ? {
                onBrowse: canBrowseLibrary ? () => setLibraryOpen(true) : undefined,
                onUpload: picker.openPicker,
              }
            : undefined,
        icons: insertIcons,
      }),
    [ticketId, canBrowseLibrary, picker.openPicker, insertIcons],
  );

  const onLibrarySelect = useCallback(
    (photos: Parameters<TicketPhotoStaging['addLibraryPhotos']>[0]) => {
      staging.addLibraryPhotos(photos);
      if (ticketId != null) {
        void queryClient.invalidateQueries({ queryKey: zendeskKeys.photos(ticketId) });
      }
    },
    [staging, ticketId, queryClient],
  );

  return {
    body,
    setBody,
    isPublic,
    setIsPublic,
    ccs,
    setCcs,
    ccDraft,
    setCcDraft,
    staging,
    picker,
    stagedPhotoIds,
    insertNodes,
    libraryOpen,
    setLibraryOpen,
    canBrowseLibrary,
    canPost,
    onLibrarySelect,
    receivingId: receivingId ?? undefined,
    busy,
    /** Enter is live only with something to send. */
    canSend: !busy && body.trim().length > 0,
    send,
    reply,
  };
}

export type TicketComposerApi = ReturnType<typeof useTicketComposer>;
