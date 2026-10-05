'use client';

/** Everything a ticket composer IS, minus the chrome. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { usePhotoDropzone } from '@/hooks/usePhotoDropzone';
import { useSupportReply } from '@/hooks/useSupportReply';
import { useSupportSuggestion } from '@/hooks/useSupportSuggestion';
import { postSupportTicketItems, supportTicketItemKeys } from '@/hooks/useSupportTicketItems';
import { useTicketPhotoStaging, type TicketPhotoStaging, type TicketPhotoTarget } from '@/hooks/useTicketPhotoStaging';
import { zendeskKeys } from '@/hooks/useZendeskQueries';
import { buildComposerReplyVars } from '@/lib/composer/ticket-reply-payload';
import { buildTicketComposerInsertTree } from '@/lib/composer/ticket-composer-insert-tree';
import { photoContentUrl } from '@/lib/photos/display-url';
import { safeRandomUUID } from '@/lib/safe-uuid';
import { seedComposerDraft } from '@/lib/threads/composer-draft';
import { requestConfirm } from '@/design-system/components/confirm';
import type { TicketItemRole } from '@/lib/support/product-token';
import type { SupportProductFace } from '@/lib/support/ticket-items-shared';
import type { SupportPurpose, SupportTransportView } from '@/lib/support/conversation/model';
import { applyMarketplacePolicy } from '@/lib/support/conversation/marketplace-policy';
import { useSupportItemActions, type SupportReplyAction } from '@/lib/support/record/use-support-item';
import {
  supportComposerCommit,
  supportComposerMode,
  type SupportComposerCommit,
  type SupportComposerMode,
} from '@/lib/support/record/support-record-model';
import { copyToClipboard } from '@/utils/_dom';
import { toast } from '@/lib/toast';
import type { ComposerDrillNode } from '@/components/composer/ComposerDrillMenu';

/**
 * Support-item mode (Tasks → Support record, operator 2026-10-04): the same
 * mouth talks to the LOCAL Support item instead of a helpdesk ticket. A
 * customer conversation sends (connected transport) or copies & opens the
 * transport, logs replies sent elsewhere, and drafts with AI; an internal
 * record or an unclassified item takes internal notes only. The next-step
 * choice after an answering reply is owed through `next-step-store`, keyed by
 * the item — the record reads it from there, not from this composer. Photos
 * stage onto the item's primary task (its Media tab), and the `+` library opens
 * on "This support item" — the same task media.
 */
export interface TicketComposerSupportItem {
  id: number;
  purpose: SupportPurpose;
  transport: SupportTransportView;
  /** The item's primary task (`work_assignments.id`) — where its photos live; null before it has one. */
  taskId: number | null;
}

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
  /**
   * Support-item mode: commits go to the local Support item (`/api/support/items/[id]/…`),
   * never to a helpdesk ticket. Pass `ticketId: null` with it.
   */
  supportItem?: TicketComposerSupportItem | null;
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
  supportItem = null,
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
  // The text the in-flight Support write carries — cleared from the box only if the box still holds it,
  // so words typed while the request was out are never lost.
  const sentTextRef = useRef<string | null>(null);
  const clearSent = () => {
    const sent = sentTextRef.current;
    sentTextRef.current = null;
    seededDraftIdRef.current = null;
    setBody((current) => (sent != null && current.trim() !== sent ? current : ''));
    setCcs([]);
    setCcDraft('');
    setProducts([]);
    staging.clear();
    onSent?.();
  };
  // Hook-level handlers: they run when the write lands even if this render is long gone.
  const support = useSupportItemActions(supportItem?.id ?? null, { onReplied: clearSent, onInternalAdded: clearSent });
  const supportMode: SupportComposerMode | null = supportItem ? supportComposerMode(supportItem.purpose) : null;
  // A Support item posts under the thread permission; a helpdesk ticket under the Zendesk gate.
  const canPost = !isLoaded || has(supportItem ? 'support.thread.manage' : 'integrations.zendesk');
  const canBrowseLibrary = isLoaded && has('photos.view');
  // Only an acknowledged customer conversation has a Public channel; everything else is internal.
  const effectiveIsPublic = supportMode == null || supportMode === 'customer' ? isPublic : false;
  const supportCommit: SupportComposerCommit | null =
    supportItem && supportMode
      ? supportComposerCommit({ mode: supportMode, isPublic: effectiveIsPublic, transport: supportItem.transport })
      : null;
  // The draft that seeded this reply (Use draft / Draft with AI) — the reply marks it used.
  // An emptied composer forgets it: what is typed next is the staffer's own words.
  const seededDraftIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!body.trim()) seededDraftIdRef.current = null;
  }, [body]);

  // Where photos land: the helpdesk ticket's claim evidence, or the Support item's
  // primary task media. None (unlinked carton, task-less item) hides the Photos rows.
  const supportTaskId = supportItem?.taskId ?? null;
  const photoTarget: TicketPhotoTarget | null = supportItem
    ? supportTaskId != null
      ? { kind: 'support', taskId: supportTaskId }
      : null
    : ticketId != null
      ? { kind: 'ticket', ticketId }
      : null;
  // Unconditional: the hook only reads its target inside its callbacks, so the
  // `0` stand-in costs nothing while the Photos rows stay hidden.
  const ownStaging = useTicketPhotoStaging(photoTarget ?? { kind: 'ticket', ticketId: 0 });
  const staging = hostStaging ?? ownStaging;
  const hasPhotoTarget = photoTarget != null;
  const picker = usePhotoDropzone(staging.addFiles);

  const stagedDone = staging.staged.filter(
    (s) => s.status === 'done' && typeof s.photoId === 'number',
  );
  const stagedPhotoIds = useMemo(
    () => new Set(stagedDone.map((s) => s.photoId!)),
    [stagedDone],
  );

  // A Support item's staged photos are already its task media: refresh the record's Media tab as each lands.
  const stagedDoneCount = stagedDone.length;
  useEffect(() => {
    if (supportTaskId == null || stagedDoneCount === 0) return;
    void queryClient.invalidateQueries({ queryKey: ['tasks', 'media', supportTaskId] });
  }, [queryClient, supportTaskId, stagedDoneCount]);

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

  const busy = !canPost || reply.isPending || staging.uploading || support.reply.isPending || support.addInternal.isPending;

  /**
   * One Support commit. Copy & open copies the policy-applied reply and opens
   * the transport INSIDE the press (clipboard + popup need the user gesture),
   * then records it; Log as sent records a reply already sent elsewhere. A
   * landed write clears the composer and (when it answered the customer) owes
   * the next step — both in the hook-level handlers, never in per-call callbacks.
   */
  const commitSupport = useCallback(
    (kind: SupportComposerCommit['kind'] | 'log') => {
      if (!supportItem || busy) return;
      const text = body.trim();
      if (!text) return;
      const onError = (err: Error) => {
        sentTextRef.current = null;
        toast.error(err.message);
      };
      sentTextRef.current = text;
      if (kind === 'internal') {
        support.addInternal.mutate(text, { onError });
        return;
      }
      const { transport } = supportItem;
      let outBody = text;
      if (kind === 'copy_open') {
        const applied = applyMarketplacePolicy(transport.channel, text);
        outBody = applied.body;
        const copying = copyToClipboard(outBody, { historyKind: 'support-reply' });
        if (transport.openUrl) window.open(transport.openUrl, '_blank', 'noopener,noreferrer');
        void copying.then((ok) =>
          ok
            ? toast.success(`Copied — paste it in ${transport.label}, then Mark sent.`)
            : toast.error('Could not copy — select the reply and copy it by hand.'),
        );
        if (applied.changes.length > 0) toast.info(`Adjusted for ${transport.label}: ${applied.changes.join(', ').replaceAll('_', ' ')}.`);
      }
      const action: SupportReplyAction = kind === 'send' ? 'send' : kind === 'copy_open' ? 'copy_open' : 'log';
      support.reply.mutate(
        {
          action,
          body: outBody,
          ...(seededDraftIdRef.current != null ? { draftId: seededDraftIdRef.current } : {}),
          ...(action === 'log' ? { contactChannel: 'message' as const } : {}),
        },
        { onError },
      );
    },
    [supportItem, busy, body, support.addInternal, support.reply],
  );

  const send = useCallback(() => {
    if (supportCommit) {
      commitSupport(supportCommit.kind);
      return;
    }
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
  }, [supportCommit, commitSupport, ticketId, busy, products, body, isPublic, user, ccs, ccDraft, stagedDone, reply, staging, onSent, queryClient]);

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
      if (supportItem) {
        // A Support item drafts through its own grounded draft store (customer conversations only — the server refuses otherwise).
        if (support.draftNow.isPending || supportMode !== 'customer') return;
        support.draftNow.mutate(undefined, {
          onSuccess: ({ draft }) => {
            if (!draft.body) {
              toast.error(draft.error ?? 'The draft came back empty.');
              return;
            }
            void seedComposerDraft({
              currentBody: bodyRef.current,
              text: draft.body,
              mode: 'public',
              applyBody: setBody,
              applyMode: setIsPublic,
              confirm: requestConfirm,
              onApplied: () => {
                seededDraftIdRef.current = draft.id;
                opts?.onApplied?.();
              },
            });
          },
          onError: (err) => toast.error(err.message),
        });
        return;
      }
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
    [supportItem, supportMode, support.draftNow, ticketId, aiDraft, stagedDone],
  );

  const insertNodes = useMemo(
    () =>
      buildTicketComposerInsertTree({
        photos:
          hasPhotoTarget
            ? {
                onBrowse: canBrowseLibrary ? () => setLibraryOpen(true) : undefined,
                onUpload: picker.openPicker,
              }
            : undefined,
        // Product logs ride a helpdesk comment (P7) — a Support item has none.
        product: ticketId != null ? { onPick: canPost ? () => setProductPickerOpen(true) : undefined } : undefined,
        icons: insertIcons,
      }),
    [hasPhotoTarget, ticketId, canBrowseLibrary, canPost, picker.openPicker, insertIcons],
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
    /** In Support-item mode only a customer conversation can be Public. */
    isPublic: effectiveIsPublic,
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
    /** Where staged / library photos land — null hides every photo door. */
    photoTarget,
    busy,
    /** Enter is live only with something to send (text or a picked product). */
    canSend: !busy && (body.trim().length > 0 || products.length > 0),
    send,
    reply,
    draftWithAi,
    drafting: aiDraft.isPending || support.draftNow.isPending,
    /** Support-item mode: who the composer talks to, and its labelled commit. */
    supportMode,
    supportCommit,
    /** Support-item mode: record a reply already sent elsewhere (phone, marketplace page, email). */
    logSent: () => commitSupport('log'),
    /** Support-item mode: a draft card's text landed through the bridge — the next reply marks that draft used. */
    noteSeededDraft: (draftId: number) => {
      seededDraftIdRef.current = draftId;
    },
  };
}

export type TicketComposerApi = ReturnType<typeof useTicketComposer>;
