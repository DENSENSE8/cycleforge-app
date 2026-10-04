'use client';

/** Everything a ticket composer IS, minus the chrome. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { usePhotoDropzone } from '@/hooks/usePhotoDropzone';
import { useSupportReply } from '@/hooks/useSupportReply';
import { useSupportSuggestion } from '@/hooks/useSupportSuggestion';
import { postSupportTicketItems, supportTicketItemKeys } from '@/hooks/useSupportTicketItems';
import { useTicketPhotoStaging, type TicketPhotoStaging } from '@/hooks/useTicketPhotoStaging';
import { zendeskKeys } from '@/hooks/useZendeskQueries';
import { buildComposerReplyVars } from '@/lib/composer/ticket-reply-payload';
import { buildTicketComposerInsertTree } from '@/lib/composer/ticket-composer-insert-tree';
import { photoContentUrl } from '@/lib/photos/display-url';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { seedComposerDraft } from '@/lib/threads/composer-draft';
import { requestConfirm } from '@/design-system/components/confirm';
import type { TicketItemRole } from '@/lib/support/product-token';
import type { SupportProductFace } from '@/lib/support/ticket-items-shared';
import { toast } from '@/lib/toast';
import type { ComposerDrillNode } from '@/components/composer/ComposerDrillMenu';

/**
 * One "Product sent to customer" pick waiting in the composer tray. The
 * `clientEventId` is minted at pick time so a retried log write is a no-op.
 */
export interface ComposerProductPick {
  clientEventId: string;
  product: SupportProductFace;
  role: TicketItemRole;
  qty: number;
}

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
  insertIcons?: {
    browse?: ComposerDrillNode['icon'];
    upload?: ComposerDrillNode['icon'];
    product?: ComposerDrillNode['icon'];
  };
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
  // "Product sent to customer" (owner 2026-10-03): picks ride the next send as
  // tokens and land in support_ticket_items once the comment is posted (P7).
  const [products, setProducts] = useState<ComposerProductPick[]>([]);
  const [productPickerOpen, setProductPickerOpen] = useState(false);

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

  // A new ticket is a new audience. CCs and picked products belong to the
  // thread that was on screen, never to whichever one loads next.
  useEffect(() => {
    setCcs([]);
    setCcDraft('');
    setProducts([]);
    setProductPickerOpen(false);
  }, [ticketId]);

  const addProduct = useCallback((product: SupportProductFace, role: TicketItemRole, qty: number) => {
    setProducts((prev) => [...prev, { clientEventId: `sti:${safeRandomUUID()}`, product, role, qty }]);
  }, []);
  const removeProduct = useCallback((clientEventId: string) => {
    setProducts((prev) => prev.filter((p) => p.clientEventId !== clientEventId));
  }, []);

  const busy = !canPost || reply.isPending || staging.uploading;

  const send = useCallback(() => {
    if (ticketId == null || busy) return;
    const picks = products;
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
      products: picks.map((p) => ({
        skuCatalogId: p.product.skuCatalogId,
        role: p.role,
        qty: p.qty,
        title: p.product.title,
        sku: p.product.sku,
      })),
    });
    if (!vars) return;
    reply.mutate(vars, {
      onSuccess: (sent) => {
        setBody('');
        setCcs([]);
        setCcDraft('');
        setProducts([]);
        staging.clear();
        onSent?.();
        if (picks.length === 0) return;
        // The comment is out; the log row is the system of record (P7).
        postSupportTicketItems({
          ticketId,
          zendeskCommentId: sent.commentId,
          items: picks.map((p) => ({
            skuCatalogId: p.product.skuCatalogId,
            role: p.role,
            qty: p.qty,
            clientEventId: p.clientEventId,
          })),
        })
          .catch((err: Error) => toast.error(`Sent, but the product log failed: ${err.message}`))
          .finally(() => void queryClient.invalidateQueries({ queryKey: supportTicketItemKeys.list(ticketId) }));
      },
    });
  }, [ticketId, busy, products, body, isPublic, user, ccs, ccDraft, stagedDone, reply, staging, onSent, queryClient]);

  // Draft with AI: the server reads the thread, answers the latest customer
  // message, and refuses (with the reason) when no customer wrote. The draft
  // lands through the ONE overwrite rule and never sends itself.
  const aiDraft = useSupportSuggestion();
  const bodyRef = useRef(body);
  useEffect(() => {
    bodyRef.current = body;
  });
  const draftWithAi = useCallback(
    (opts?: { onApplied?: () => void }) => {
      if (ticketId == null || aiDraft.isPending) return;
      aiDraft.mutate(
        { ticketId, stagedPhotoIds: stagedDone.map((s) => s.photoId!) },
        {
          onSuccess: (draft) =>
            void seedComposerDraft({
              currentBody: bodyRef.current,
              text: draft.suggestion,
              mode: 'public',
              applyBody: setBody,
              applyMode: setIsPublic,
              confirm: requestConfirm,
              onApplied: opts?.onApplied,
            }),
          onError: (err) => toast.error(err.message),
        },
      );
    },
    [ticketId, aiDraft, stagedDone],
  );

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
        product: ticketId != null ? { onPick: canPost ? () => setProductPickerOpen(true) : undefined } : undefined,
        icons: insertIcons,
      }),
    [ticketId, canBrowseLibrary, canPost, picker.openPicker, insertIcons],
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
    products,
    addProduct,
    removeProduct,
    productPickerOpen,
    setProductPickerOpen,
    canBrowseLibrary,
    canPost,
    onLibrarySelect,
    receivingId: receivingId ?? undefined,
    busy,
    /** Enter is live only with something to send (text or a picked product). */
    canSend: !busy && (body.trim().length > 0 || products.length > 0),
    send,
    reply,
    draftWithAi,
    drafting: aiDraft.isPending,
  };
}

export type TicketComposerApi = ReturnType<typeof useTicketComposer>;
