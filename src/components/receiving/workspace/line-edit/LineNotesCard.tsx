'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  History,
  Images,
  Play,
  Receipt,
  Upload,
  User,
  Tag,
  Pencil,
} from '@/components/Icons';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/lib/toast';
import {
  RECENT_LABEL_NOTE_QUERY_ROOT,
  recentLabelNoteQueryKey,
  shouldRefreshRecentFace,
} from '@/lib/receiving/recent-label-note';
import { useReceivingEvents } from '@/hooks/useReceivingEvents';
import {
  ComposerTicketChannelToggle,
  ComposerTicketInsetChrome,
  StationComposerHost,
} from '@/components/composer';
import { ComposerStagedPhotoStrip } from '@/components/ui/ComposerStagedPhotoStrip';
import { useStagedPhotoViewer } from '@/components/composer/useStagedPhotoViewer';
import type { StationComposerMode } from '@/lib/composer/station-composer-mode';
import { buildTicketComposerInsertTree } from '@/lib/composer/ticket-composer-insert-tree';
import { buildComposerReplyVars } from '@/lib/composer/ticket-reply-payload';
import type { WorkspaceTicketDraftModel } from './hooks/useWorkspaceTicketDraft';
import { useSupportReply } from '@/hooks/useSupportReply';
import { zendeskKeys } from '@/hooks/useZendeskQueries';
import { useTicketPhotoStaging } from '@/hooks/useTicketPhotoStaging';
import { usePhotoDropzone } from '@/hooks/usePhotoDropzone';
import { SupportPhotoLibraryPicker } from '@/components/support/zendesk/chat/SupportPhotoLibraryPicker';
import { type NoteComposerInsertAction } from '../NoteComposerInsertRail';
import {
  appendNoteLine,
  buildStaffStampText,
  focusTextEnd,
  formatUnitPriceForNotes,
  NOTE_DOWNLOAD_INSERT_BTN,
  NOTE_OVERLAY_ICON,
  NOTE_OVERLAY_ICON_BTN,
  NOTE_STAFF_STAMP_BTN,
  NOTE_TAG_BTN,
  NOTE_UNIT_PRICE_BTN,
  parseZendeskTicketId,
  resolveNoteGhostPaint,
} from '../note-composer-helpers';
import { useLabelNoteGhostAutocomplete } from './hooks/useLabelNoteGhostAutocomplete';
import { UnboxNotesLocationControl } from './UnboxNotesLocationControl';
import { UnboxNotesStatusDialog } from './UnboxNotesStatusDialog';
import type { LineStatusExactSource } from '@/lib/receiving/unbox-notes-status';
import { ZohoReceiveSyncControl } from '@/components/zoho/ZohoReceiveSyncControl';
import { ComposerLinkTicket } from './ComposerLinkTicket';

/** Item-note composer — the operator's durable note on this line (`receiving_line.notes`). */

export function LineNotesCard({
  ticketDraftModel,
  onNoteTyped,
  notes,
  overallZohoNotes,
  skuTitle,
  unitPrice,
  zendeskTicket,
  zendeskProviderTicketId,
  zendeskTicketSubject,
  previousLineNotes,
  lineId,
  receivingId,
  onNotesChange,
  onSaveNotes,
  showSyncToPo = true,
  animateMount = true,
  chrome = 'raised',
  reaction,
  trailingAction,
  locationLeading,
  labelPeek,
  onPrimaryAction,
  primaryActionDisabled = false,
  statusStamps,
  onOpenStatusHistory,
  headerAction,
  onComposerModeChange,
  onComposerFocus,
  onTicketDraftFilledChange,
  trackingNumber,
  orderNumber,
  onTicketLinked,
  onLinkTicketOpen,
  progressPercent = 0,
  progressTone = 'idle',
  onProgressClick,
}: {
  /** Shared claim/audience owner also painted by the center Ticket preview. */
  ticketDraftModel: WorkspaceTicketDraftModel;
  /**
   * The operator typed into the note field. Unbox opens the Label band on this
   * so the sticker shows the note as it is written.
   */
  onNoteTyped?: () => void;
  /** The operator's durable item note (`receiving_line.notes`) — never printed. */
  notes: string;
  /** Overall Zoho PO header note (carton-level) — source for the push-to-PO action. */
  overallZohoNotes: string | null;
  /** Resolved product title — prefills the title button. */
  skuTitle?: string | null;
  /** Zoho PO line unit cost — prefills the price button. */
  unitPrice?: string | number | null;
  /** Linked Zendesk ticket label — from ticket_links or receiving_lines. */
  zendeskTicket?: string | null;
  /** Provider-native Zendesk id for thread fetch (ticket_links). */
  zendeskProviderTicketId?: number | null;
  /** Cached subject from support_tickets — skips a live round-trip when present. */
  zendeskTicketSubject?: string | null;
  /** Note from the previous line touched this session — repeat-previous source. */
  previousLineNotes?: string;
  /** Current line id — excluded from the DB Recent lookup. */
  lineId?: number | null;
  /** Carton id — ticket photo staging + library picker scope. */
  receivingId?: number | null;
  onNotesChange: (next: string) => void;
  /**
   * Persist the note to `receiving_line.notes`. Optional `next` overrides the
   * live draft (Enter that also accepts a ghost). Returns true if it saved.
   */
  onSaveNotes: (next?: string) => boolean;
  /** Show synced-PO insert — matched cartons only (unfound has no PO). */
  showSyncToPo?: boolean;
  /** Pass-through to OmnichannelComposerDock mount motion. */
  animateMount?: boolean;
  /**
   * Pass-through to OmnichannelComposerDock. `bare` when nested inside
   * a host that already paints the plane, so it owns the only raised shell.
   */
  chrome?: 'raised' | 'bare';
  /**
   * Staff reaction welded onto the composer's top edge (Unbox receive
   * feedback) — pass-through to StationComposerHost `reaction`.
   */
  reaction?: ReactNode;
  /**
   * Terminal CTA rendered at the composer's trailing edge (Unbox overview
   * mounts the Receive/Print split here). Replaces the blue Send — Enter
   * fires {@link onPrimaryAction} (chat Send); blur still saves.
   */
  trailingAction?: ReactNode;
  /** Renders immediately left of the location control in the composer footer (Quality control's Pair FNSKU). */
  locationLeading?: ReactNode;
  /** The station label peek (see StationLabelPeek): the Label button at the top-left of the row above the composer. */
  labelPeek?: ReactNode;
  /**
   * Primary footer action for Enter when {@link trailingAction} is mounted
   * (print + receive). Empty notes still allow Enter — receive is not gated
   * on having typed a note.
   */
  onPrimaryAction?: () => void;
  /** When true, Enter is a no-op (mirrors the disabled Receive pill). */
  primaryActionDisabled?: boolean;
  /** Where the header ⓘ sends the operator. */
  onOpenStatusHistory?: () => void;
  /** Repoint the header ⓘ at a different job, with its own label. */
  headerAction?: { label: string; onClick: () => void; pressed?: boolean };
  /** Line stamps for the notes Info dialog + current putaway face. */
  statusStamps?: LineStatusExactSource & {
    staged_location_id?: number | null;
  };
  /** Centre mounts the ticket pane when mode flips to Ticket. */
  onComposerModeChange?: (mode: StationComposerMode) => void;
  /** Auto-collapse engage — composer focus. */
  onComposerFocus?: () => void;
  /**
   * Whether the Ticket draft currently has a body. The host uses it to show the
   * DRAFT ticket number in the carton-context corner — that badge only makes
   * sense once there is something to file, and only this card knows the draft.
   */
  onTicketDraftFilledChange?: (filled: boolean) => void;
  /** Carton tracking — prefetched against existing tickets before the link card opens. */
  trackingNumber?: string | null;
  /** Marketplace order # — same prefetch, used when tracking does not hit. */
  orderNumber?: string | null;
  /** The linked ticket is on the row. Switch the station thread onto it. */
  onTicketLinked?: (ticketNumber: string) => void;
  /** "Link existing ticket?" pressed — the station reveals its Ticket tab. */
  onLinkTicketOpen?: () => void;
  /** Procedure fill for the composer bottom-right progress ring. */
  progressPercent?: number;
  progressTone?: 'idle' | 'selected';
  onProgressClick?: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const { user, has, isLoaded } = useAuth();

  // DB SoT — sticker center from this operator's last scanned tracking (other
  // carton). Never the device-local MRU phrase bank.
  const excludeLineId =
    lineId != null && Number.isFinite(lineId) && lineId > 0 ? lineId : null;
  const recentNoteQuery = useQuery({
    queryKey: recentLabelNoteQueryKey(excludeLineId),
    queryFn: async (): Promise<string> => {
      const qs =
        excludeLineId != null
          ? `?excludeLineId=${encodeURIComponent(String(excludeLineId))}`
          : '';
      const res = await fetch(`/api/receiving/recent-label-note${qs}`);
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        note?: string | null;
      } | null;
      if (!res.ok || !data?.success) return '';
      return (data.note || '').trim();
    },
  });
  const recentPhrase = (recentNoteQuery.data || '').trim();
  const [recentHover, setRecentHover] = useState(false);

  // Close the save→fetch race.
  const queryClient = useQueryClient();
  useReceivingEvents({
    'receiving-line-updated': (detail) => {
      if (
        !shouldRefreshRecentFace({
          updatedLineId: detail.id,
          updatedLabelNote: detail.label_note,
          updatedNotes: detail.notes,
          openLineId: excludeLineId,
          shownPhrase: recentPhrase,
        })
      ) {
        return;
      }
      void queryClient.invalidateQueries({ queryKey: RECENT_LABEL_NOTE_QUERY_ROOT });
    },
  });

  const {
    matchedPhrase,
    ghostSuffix,
    acceptGhost,
    dismissGhost,
    clearGhostDismissal,
    onValueChange,
    rememberIfWrote,
    handleGhostKeyDown,
    resolveCommitValue,
  } = useLabelNoteGhostAutocomplete({
    value: notes,
    onChange: onNotesChange,
    previousLineNotes: recentPhrase || previousLineNotes,
    inputRef: textareaRef,
  });

  // Hover Recent → the overlay previews exactly what clicking Recent applies.
  // Resolution (incl. suppressing the unrelated MRU ghost while Recent is
  // hovered) lives in {@link resolveNoteGhostPaint}.
  const ghostPaint = resolveNoteGhostPaint({
    recentHover,
    recentPhrase,
    value: notes,
    matchedPhrase,
    ghostSuffix,
  });
  const showHoverGhost = ghostPaint.acceptAppliesRecent;
  const paintMatchedPhrase = ghostPaint.matchedPhrase;
  const paintGhostSuffix = ghostPaint.ghostSuffix;

  const commitNotes = useCallback(
    (override?: string) => {
      const phrase = override ?? notes;
      const wrote = onSaveNotes(phrase);
      rememberIfWrote(phrase, wrote);
    },
    [notes, onSaveNotes, rememberIfWrote],
  );

  // Enter: with a trailing Receive CTA, behave like chat Send (save → receive).
  // Without it, Enter is just save (Send button path). Accept ghost first when
  // caret is at end so the MRU phrase is what persists.
  const handleCommit = useCallback(() => {
    const phrase = resolveCommitValue(textareaRef.current);
    if (onPrimaryAction) {
      commitNotes(phrase);
      if (primaryActionDisabled) return;
      onPrimaryAction();
      return;
    }
    commitNotes(phrase);
  }, [onPrimaryAction, primaryActionDisabled, commitNotes, resolveCommitValue]);

  // Auto-save on blur when the note changed.
  const handleBlur = useCallback(() => {
    commitNotes();
  }, [commitNotes]);

  const appendToNotes = useCallback(
    (text: string) => {
      const next = appendNoteLine(notes, text);
      if (next === notes) return;
      clearGhostDismissal();
      onNotesChange(next);
      requestAnimationFrame(() => focusTextEnd(textareaRef.current));
    },
    [notes, onNotesChange, clearGhostDismissal],
  );

  const resolvedTicketId =
    zendeskProviderTicketId != null && zendeskProviderTicketId > 0
      ? String(zendeskProviderTicketId)
      : parseZendeskTicketId(zendeskTicket);

  const [fetchingTicketSubject, setFetchingTicketSubject] = useState(false);
  const handlePrefillTicketSubject = useCallback(async () => {
    const ticketId = resolvedTicketId;
    if (!ticketId || fetchingTicketSubject) return;

    const cachedSubject = (zendeskTicketSubject || '').trim();
    if (cachedSubject) {
      appendToNotes(cachedSubject);
      return;
    }

    setFetchingTicketSubject(true);
    try {
      const res = await fetch(`/api/receiving/zendesk-claim/thread?ticketId=${ticketId}`);
      const data = (await res.json().catch(() => null)) as {
        ticket?: { subject?: string | null };
      } | null;
      const subject = data?.ticket?.subject?.trim();
      if (res.ok && subject) {
        appendToNotes(subject);
      } else {
        toast.error('Could not load ticket subject');
      }
    } catch {
      toast.error('Could not load ticket subject');
    } finally {
      setFetchingTicketSubject(false);
    }
  }, [resolvedTicketId, zendeskTicketSubject, fetchingTicketSubject, appendToNotes]);

  const formattedUnitPrice = formatUnitPriceForNotes(unitPrice);
  const trimmedSkuTitle = (skuTitle || '').trim();
  const trimmedPreviousNotes = recentPhrase;
  const trimmedSyncNotes = (overallZohoNotes ?? '').trim();
  const hasTicket = Boolean(resolvedTicketId);
  const staffStamp = buildStaffStampText({ name: user?.name, staffId: user?.staffId });
  const numericTicketId = resolvedTicketId ? Number(resolvedTicketId) : null;
  const [ticketDraft, setTicketDraft] = useState('');
  const {
    claim,
    isPublic: ticketPublic,
    setIsPublic: setTicketPublic,
    ccs: ticketCcs,
    setCcs: setTicketCcs,
    ccDraft: ticketCcDraft,
    setCcDraft: setTicketCcDraft,
  } = ticketDraftModel;
  const [photoLibraryOpen, setPhotoLibraryOpen] = useState(false);
  const reply = useSupportReply();
  const canPostTicket = !isLoaded || has('integrations.zendesk');

  const canBrowsePhotoLibrary = isLoaded && has('photos.view');
  const staffName = user?.name?.trim() || '';

  // Photos ride the same staging pipeline as the console composer:
  const photoStaging = useTicketPhotoStaging({ kind: 'ticket', ticketId: numericTicketId ?? 0 });
  const photoPicker = usePhotoDropzone(photoStaging.addFiles);
  const stagedViewer = useStagedPhotoViewer(photoStaging.staged);
  const stagedDone = photoStaging.staged.filter(
    (s) => s.status === 'done' && typeof s.photoId === 'number',
  );
  const stagedPhotoIds = useMemo(
    () => new Set(stagedDone.map((s) => s.photoId!)),
    [stagedDone],
  );

  const handleTicketCommit = useCallback(() => {
    if (!hasTicket || numericTicketId == null) return;
    if (reply.isPending || photoStaging.uploading || !canPostTicket) return;
    const vars = buildComposerReplyVars({
      ticketId: numericTicketId,
      body: ticketDraft,
      isPublic: ticketPublic,
      staffName,
      staffId: user?.staffId ?? null,
      ccs: ticketCcs,
      ccDraft: ticketCcDraft,
      photoIds: stagedDone.map((s) => s.photoId!),
      attachmentPreviews: stagedDone.map((s) => ({ url: s.url!, thumbUrl: s.thumbUrl })),
    });
    if (!vars) return;
    reply.mutate(vars, {
      onSuccess: () => {
        setTicketDraft('');
        setTicketCcs([]);
        setTicketCcDraft('');
        photoStaging.clear();
      },
    });
  }, [
    ticketDraft,
    hasTicket,
    numericTicketId,
    reply,
    canPostTicket,
    ticketPublic,
    staffName,
    user?.staffId,
    ticketCcs,
    ticketCcDraft,
    stagedDone,
    photoStaging,
  ]);

  // Report the draft's filled-ness up so the carton-context corner can swap the Claim verb for the number the ticket is heading for.
  const ticketDraftFilled = claim.isClaim && claim.body.trim().length > 0;
  useEffect(() => {
    onTicketDraftFilledChange?.(ticketDraftFilled);
  }, [ticketDraftFilled, onTicketDraftFilledChange]);


  const ticketDrillNodes = useMemo(() => {
    const nodes = buildTicketComposerInsertTree({
      photos: hasTicket
        ? {
            onBrowse: canBrowsePhotoLibrary
              ? () => setPhotoLibraryOpen(true)
              : undefined,
            onUpload: photoPicker.openPicker,
          }
        : undefined,
      icons: {
        browse: <Images className={NOTE_OVERLAY_ICON} />,
        upload: <Upload className={NOTE_OVERLAY_ICON} />,
      },
    });
    // Developer tool, dev builds only: files nothing, but builds the real photo
    // share pack and drops the exact opening message into the draft below.
    if (claim.canTest) {
      nodes.push({
        type: 'action',
        id: 'claim-test-create',
        label: claim.testing ? 'Testing…' : 'Test create (no ticket)',
        icon: <Play className={NOTE_OVERLAY_ICON} />,
        disabled: claim.testing,
        onSelect: claim.testCreate,
      });
    }
    return nodes;
  }, [
    hasTicket,
    canBrowsePhotoLibrary,
    photoPicker.openPicker,
    claim.canTest,
    claim.testing,
    claim.testCreate,
  ]);

  const applyLastLabelNote = useCallback(() => {
    const phrase = recentPhrase;
    if (!phrase) {
      toast.message('No recent label note on a scanned carton yet');
      return;
    }
    clearGhostDismissal();
    onNotesChange(phrase);
    setRecentHover(false);
    requestAnimationFrame(() => focusTextEnd(textareaRef.current));
  }, [recentPhrase, clearGhostDismissal, onNotesChange]);

  const insertActions = useMemo((): NoteComposerInsertAction[] => {
    const actions: NoteComposerInsertAction[] = [];

    if (staffStamp) {
      actions.push({
        id: 'staff-stamp',
        label: `Stamp · ${staffStamp}`,
        ariaLabel: 'Stamp staff name and time',
        icon: <User className={NOTE_OVERLAY_ICON} />,
        buttonClassName: NOTE_STAFF_STAMP_BTN,
        onClick: () => appendToNotes(staffStamp),
      });
    }

    if (hasTicket) {
      actions.push({
        id: 'ticket-subject',
        label: 'Ticket subject',
        ariaLabel: 'Insert the linked support ticket subject',
        icon: <Tag className={NOTE_OVERLAY_ICON} />,
        buttonClassName: NOTE_TAG_BTN,
        onClick: () => void handlePrefillTicketSubject(),
        disabled: fetchingTicketSubject,
        loading: fetchingTicketSubject,
      });
    }

    if (formattedUnitPrice) {
      actions.push({
        id: 'unit-price',
        label: `Unit price · ${formattedUnitPrice}`,
        ariaLabel: 'Insert unit price',
        icon: <Receipt className={NOTE_OVERLAY_ICON} />,
        buttonClassName: NOTE_UNIT_PRICE_BTN,
        onClick: () => appendToNotes(formattedUnitPrice),
      });
    }

    if (showSyncToPo && trimmedSyncNotes) {
      actions.push({
        id: 'sync-notes',
        label: 'Synced PO notes',
        ariaLabel: 'Insert synced PO notes',
        icon: <Download className={NOTE_OVERLAY_ICON} />,
        buttonClassName: NOTE_DOWNLOAD_INSERT_BTN,
        onClick: () => appendToNotes(trimmedSyncNotes),
      });
    }

    if (trimmedSkuTitle) {
      actions.push({
        id: 'product-title',
        label: trimmedSkuTitle,
        ariaLabel: 'Insert product title',
        icon: <Pencil className={NOTE_OVERLAY_ICON} />,
        buttonClassName: `${NOTE_OVERLAY_ICON_BTN} text-yellow-600 transition hover:bg-yellow-100/60 hover:text-yellow-700 hover:shadow-sm hover:ring-1 hover:ring-yellow-200/80`,
        onClick: () => appendToNotes(trimmedSkuTitle),
      });
    }

    if (trimmedPreviousNotes) {
      actions.push({
        id: 'last-notes',
        label: 'Add last notes',
        ariaLabel: 'Add last notes',
        icon: <History className={NOTE_OVERLAY_ICON} />,
        buttonClassName: NOTE_OVERLAY_ICON_BTN,
        onClick: () => appendToNotes(trimmedPreviousNotes),
      });
    }

    return actions;
  }, [
    staffStamp,
    trimmedPreviousNotes,
    hasTicket,
    fetchingTicketSubject,
    handlePrefillTicketSubject,
    formattedUnitPrice,
    showSyncToPo,
    trimmedSyncNotes,
    trimmedSkuTitle,
    appendToNotes,
  ]);

  const linkTicketReceivingId =
    !hasTicket && canPostTicket && receivingId != null && receivingId > 0 ? receivingId : null;

  return (
    <>
      {/* The row above the composer: Label first, so the label grows from the
          composer's top-left, then the link-ticket CTA while nothing is linked. */}
      {labelPeek || linkTicketReceivingId != null ? (
        <div className="flex items-center gap-1.5 px-3 pb-1.5" data-testid="composer-above-row">
          {labelPeek}
          {linkTicketReceivingId != null ? (
            <ComposerLinkTicket
              receivingId={linkTicketReceivingId}
              lineId={lineId}
              trackingNumber={trackingNumber}
              orderNumber={orderNumber}
              onLinked={onTicketLinked}
              onOpen={onLinkTicketOpen}
            />
          ) : null}
        </div>
      ) : null}
      <StationComposerHost
        labelValue={notes}
        onLabelChange={(next) => {
          onValueChange(next);
          // Typing a note opens the Label band so the sticker shows what is being written — the dock draft live-drives the label centre, and an…
          if (next.trim()) onNoteTyped?.();
        }}
        onLabelCommit={handleCommit}
        onLabelBlur={handleBlur}
        // Receive CTA: Enter must fire even with an empty note (chat-send).
        labelCommitDisabled={onPrimaryAction ? primaryActionDisabled : undefined}
        labelPlaceholder={showHoverGhost ? '' : null}
        labelCommitAriaLabel="Save item note"
        labelCommitTooltip={
          onPrimaryAction ? 'Receive (Enter) · Shift+Enter for newline' : 'Save notes (Enter)'
        }
        ticketDraft={claim.isClaim ? claim.body : ticketDraft}
        onTicketDraftChange={claim.isClaim ? claim.setBody : setTicketDraft}
        onTicketCommit={claim.isClaim ? claim.file : handleTicketCommit}
        ticketCommitDisabled={
          claim.isClaim
            ? !canPostTicket || !claim.canFile
            : !hasTicket ||
              !canPostTicket ||
              reply.isPending ||
              photoStaging.uploading ||
              ticketDraft.trim().length === 0
        }
        ticketDrillNodes={ticketDrillNodes}
        ticketFooterStart={
          <ComposerTicketChannelToggle
            isPublic={ticketPublic}
            onIsPublicChange={setTicketPublic}
          />
        }
        ticketInsetTop={
          <ComposerTicketInsetChrome
            isPublic={ticketPublic}
            ccs={ticketCcs}
            onCcsChange={setTicketCcs}
            ccDraft={ticketCcDraft}
            onCcDraftChange={setTicketCcDraft}
            ticketId={numericTicketId}
            attachments={
              photoStaging.staged.length > 0 ? (
                <ComposerStagedPhotoStrip
                  staged={photoStaging.staged}
                  onRemove={photoStaging.remove}
                  onOpen={stagedViewer.open}
                  size="compact"
                />
              ) : null
            }
          />
        }
        locationLeading={locationLeading}
        locationAction={
          <UnboxNotesLocationControl
            lineId={lineId}
            receivingId={receivingId}
            currentLocationName={statusStamps?.staged_location_name}
            currentLocationBarcode={statusStamps?.staged_location_barcode}
            currentLocationRoom={statusStamps?.staged_location_room}
          />
        }
        trailingAction={trailingAction}
        chrome={chrome}
        reaction={reaction}
        animateMount={animateMount}
        textareaRef={textareaRef}
        ghostSuffix={paintGhostSuffix}
        matchedPhrase={paintMatchedPhrase}
        onAcceptGhost={
          showHoverGhost
            ? () => {
                applyLastLabelNote();
              }
            : acceptGhost
        }
        onDismissGhost={
          showHoverGhost
            ? () => {
                setRecentHover(false);
              }
            : dismissGhost
        }
        onTextareaKeyDown={handleGhostKeyDown}
        onFocus={onComposerFocus}
        insertActions={insertActions}
        ticketLabel={zendeskTicket}
        hasTicket={hasTicket}
        ticketIsPublic={ticketPublic}
        onModeChange={onComposerModeChange}
        // Sync to Zoho, inline at the foot of the composer (owner 2026-09-29):
        // the receive push for every unboxed line Zoho has not recorded yet.
        modeRowLeading={has('integrations.zoho') ? <ZohoReceiveSyncControl face="row" /> : undefined}
        progressPercent={progressPercent}
        progressTone={progressTone}
        onProgressClick={() => {
          // The ring opens the most local status or history owner; it never
          // invents a second procedure destination.
          if (headerAction) {
            headerAction.onClick();
            return;
          }
          if (onOpenStatusHistory) {
            onOpenStatusHistory();
            return;
          }
          if (onProgressClick) {
            onProgressClick();
            return;
          }
          setStatusOpen(true);
        }}
      />
      {/* Upload picker for `+` → Photos → Upload file. */}
      <input ref={photoPicker.inputRef} {...photoPicker.inputProps} />
      {canBrowsePhotoLibrary && numericTicketId != null ? (
        <SupportPhotoLibraryPicker
          target={{ kind: 'ticket', ticketId: numericTicketId }}
          receivingId={receivingId ?? undefined}
          open={photoLibraryOpen}
          onClose={() => setPhotoLibraryOpen(false)}
          excludePhotoIds={stagedPhotoIds}
          onSelect={(photos) => {
            photoStaging.addLibraryPhotos(photos);
            void queryClient.invalidateQueries({
              queryKey: zendeskKeys.photos(numericTicketId),
            });
          }}
        />
      ) : null}
      <UnboxNotesStatusDialog
        open={statusOpen}
        onOpenChange={setStatusOpen}
        row={statusStamps ?? {}}
      />
      {stagedViewer.viewer}
    </>
  );
}
