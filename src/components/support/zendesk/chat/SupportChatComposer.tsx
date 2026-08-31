'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Paperclip, Plus } from '@/components/Icons';
import { OmnichannelComposerDock } from '@/design-system/primitives';
import { VisibilityToggle } from '@/components/ui/VisibilityToggle';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  ComposerStagedPhotoStrip,
  ComposerTicketCcStrip,
} from '@/components/composer';
import { usePhotoDropzone } from '@/hooks/usePhotoDropzone';
import { useSupportReply } from '@/hooks/useSupportReply';
import { zendeskKeys } from '@/hooks/useZendeskQueries';
import type { TicketPhotoStaging } from '@/hooks/useTicketPhotoStaging';
import { useAuth } from '@/contexts/AuthContext';
import { markdownToHtml } from '@/lib/support/markdown';
import { buildComposerReplyVars } from '@/lib/composer/ticket-reply-payload';
import { cn } from '@/utils/_cn';
import type { ThreadComposerBridge } from '@/components/threads/ThreadPanel';
import { seedComposerDraft } from '@/lib/threads/composer-draft';
import { requestConfirm } from '@/design-system/components/confirm';
import {
  NOTE_INSERT_TRIGGER_BTN,
  NOTE_OVERLAY_ICON,
  NOTE_OVERLAY_ICON_BTN,
} from '@/components/receiving/workspace/note-composer-helpers';
import { SupportPhotoLibraryPicker } from './SupportPhotoLibraryPicker';
import { TicketReplyPresetsBar } from './TicketReplyPresetsBar';
import type { TicketReplyPreset } from '@/lib/support/ticket-reply-presets';
import {
  CONVERSATION_COMPOSER_DOCK_INTERNAL,
  CONVERSATION_COMPOSER_PAD,
} from '@/design-system/primitives/conversation-chrome';

/**
 * Chat composer — public reply / internal note channel, CC collaborators, photo
 * attach (via the ticket-level drop overlay or the Attach control), Enter to send.
 * Internal notes auto-sign with the current staffer's name for attribution.
 * Posts through {@link useSupportReply} (the shared photo→ticket pipeline).
 *
 * Always uses {@link OmnichannelComposerDock} — same elevated shell as carton
 * notes. When Internal is selected the dock washes amber (Zendesk yellow
 * composer). Station compound docks pass `trailingAction` (terminal CTA
 * replaces blue Send; Enter still commits).
 */
export function SupportChatComposer({
  ticketId,
  requesterEmail,
  staging,
  receivingId,
  onBridgeChange,
  variant = 'inline',
  trailingAction,
  showReplyPresets = true,
}: {
  ticketId: number;
  requesterEmail?: string | null;
  staging: TicketPhotoStaging;
  /** Carton context for media library “Current carton” tab. */
  receivingId?: number;
  /** Exposes the embedded composer to a station terminal dock. */
  onBridgeChange?: (bridge: ThreadComposerBridge | null) => void;
  /**
   * `inline` — under the thread (console / Unbox Ticket column).
   * `station-dock` — floating dock band with optional `trailingAction`.
   */
  variant?: 'inline' | 'station-dock';
  /** Terminal CTA embedded in the dock footer (replaces blue Send). */
  trailingAction?: ReactNode;
  /**
   * All-good / QC pass·fail chip row. Default on. Unbox Ticket Displays
   * passes `false` — intake chat is not the QC shortcut surface.
   */
  showReplyPresets?: boolean;
}) {
  const [body, setBody] = useState('');
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const stationDock = variant === 'station-dock';

  // A draft reaches this editor through ONE door: `bridge.setDraft` below,
  // which routes every insert through `seedComposerDraft`'s overwrite rule.
  // The `seedBody` / `seedToken` props it replaced (2026-08-02) overwrote
  // `body` unconditionally on every token bump — safe only because nothing had
  // ever called them. Do not re-add a second seeding path beside the bridge.

  // Default to internal note — public replies are the deliberate exception.
  const [isPublic, setIsPublic] = useState(false);
  const [ccs, setCcs] = useState<string[]>([]);
  const [ccInput, setCcInput] = useState('');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const queryClient = useQueryClient();
  const reply = useSupportReply();
  const { user, has, isLoaded } = useAuth();
  const canBrowseLibrary = isLoaded && has('photos.view');
  const canPost = !isLoaded || has('integrations.zendesk');
  const staffName = user?.name?.trim() || '';
  const staffId = user?.staffId ?? null;

  // Reuse the dropzone hook purely for its file-picker plumbing (the ticket
  // panel owns the actual drag overlay, so we don't spread rootProps here).
  const picker = usePhotoDropzone(staging.addFiles);

  const stagedDone = staging.staged.filter((s) => s.status === 'done' && typeof s.photoId === 'number');
  const stagedPhotoIds = useMemo(
    () => new Set(stagedDone.map((s) => s.photoId!)),
    [stagedDone],
  );

  const submit = () => {
    if (reply.isPending || staging.uploading) return;
    const vars = buildComposerReplyVars({
      ticketId,
      body,
      isPublic,
      staffName,
      staffId,
      ccs,
      ccDraft: ccInput,
      photoIds: stagedDone.map((s) => s.photoId!),
      attachmentPreviews: stagedDone.map((s) => ({ url: s.url!, thumbUrl: s.thumbUrl })),
    });
    if (!vars) return;
    reply.mutate(vars, {
      onSuccess: () => {
        setBody('');
        setCcs([]);
        setCcInput('');
        staging.clear();
      },
    });
  };

  /** One-click presets — REST only (never VendorView DOM macros). */
  const applyPreset = (preset: TicketReplyPreset) => {
    if (reply.isPending || staging.uploading || !canPost) return;
    let finalText = preset.body;
    if (!preset.isPublic && staffName) {
      const sig = `— ${staffName}`;
      finalText = finalText.trimEnd().endsWith(sig) ? finalText : `${finalText}\n\n${sig}`;
    }
    reply.mutate({
      ticketId,
      body: finalText,
      isPublic: preset.isPublic,
      htmlBody: markdownToHtml(finalText),
      staffId,
      staffName,
    });
  };

  useEffect(() => {
    if (!onBridgeChange) return;
    onBridgeChange({
      hasDraft: body.trim().length > 0,
      isPublic,
      submitting: reply.isPending || staging.uploading,
      canPost,
      focus: () => {
        composerRef.current?.focus();
        composerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      },
      submit,
      setDraft: (text, opts) =>
        seedComposerDraft({
          currentBody: body,
          text,
          mode: opts?.mode,
          applyBody: setBody,
          applyMode: setIsPublic,
          confirm: requestConfirm,
          onApplied: () => {
            composerRef.current?.focus();
            composerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          },
        }),
    });
    return () => onBridgeChange(null);
    // submit closes over the current draft, visibility, CCs, and staged photos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    onBridgeChange,
    body,
    isPublic,
    reply.isPending,
    staging.uploading,
    canPost,
    ccs,
    ccInput,
    staging.staged,
  ]);

  const libraryPicker = canBrowseLibrary ? (
    <SupportPhotoLibraryPicker
      ticketId={ticketId}
      receivingId={receivingId}
      open={libraryOpen}
      onClose={() => setLibraryOpen(false)}
      excludePhotoIds={stagedPhotoIds}
      onSelect={(photos) => {
        staging.addLibraryPhotos(photos);
        void queryClient.invalidateQueries({ queryKey: zendeskKeys.photos(ticketId) });
      }}
    />
  ) : null;

  const attachActions = (
    <div className="flex items-center gap-0.5">
      {canBrowseLibrary ? (
        <HoverTooltip label="Library" asChild>
          {/* ds-raw-button */}
          <button
            type="button"
            aria-label="Library"
            onClick={() => setLibraryOpen(true)}
            className={NOTE_INSERT_TRIGGER_BTN}
          >
            <Plus className={NOTE_OVERLAY_ICON} />
          </button>
        </HoverTooltip>
      ) : null}
      <HoverTooltip label="Attach" asChild>
        {/* ds-raw-button */}
        <button
          type="button"
          aria-label="Attach"
          onClick={picker.openPicker}
          className={`${NOTE_OVERLAY_ICON_BTN} text-text-faint transition hover:bg-surface-card hover:text-text-muted hover:shadow-sm hover:ring-1 hover:ring-border-soft`}
        >
          <Paperclip className={NOTE_OVERLAY_ICON} />
        </button>
      </HoverTooltip>
      <input ref={picker.inputRef} {...picker.inputProps} />
    </div>
  );

  const ccStrip = isPublic ? (
    <ComposerTicketCcStrip
      ccs={ccs}
      onCcsChange={setCcs}
      draft={ccInput}
      onDraftChange={setCcInput}
      requesterEmail={requesterEmail ?? null}
      className="mb-2 border-t border-border-hairline bg-surface-sunken px-2 py-1.5"
    />
  ) : null;

  const stagedThumbs = (
    <ComposerStagedPhotoStrip
      staged={staging.staged}
      onRemove={staging.remove}
      className="mb-2"
    />
  );

  const busy = !canPost || reply.isPending || staging.uploading;

  const dock = (
    <div data-composer-channel={isPublic ? 'public' : 'internal'}>
      {ccStrip}
      {stagedThumbs}
      {libraryPicker}
      {showReplyPresets ? (
        <TicketReplyPresetsBar disabled={busy} onPick={applyPreset} />
      ) : null}
      <OmnichannelComposerDock
        value={body}
        onChange={setBody}
        onCommit={submit}
        commitDisabled={busy ? true : undefined}
        placeholder={
          isPublic
            ? 'Reply… (Enter to send)'
            : 'Internal note… (Enter to send)'
        }
        ariaLabel={isPublic ? 'Public reply' : 'Internal note'}
        commitAriaLabel={isPublic ? 'Send' : 'Add note'}
        commitTooltip={
          isPublic ? 'Send (Enter)' : 'Add note (Enter) · Shift+Enter for newline'
        }
        footerStart={
          <VisibilityToggle
            value={isPublic}
            onChange={setIsPublic}
            internalLabel="Internal"
            publicLabel="Public"
            className="scale-90 origin-left"
          />
        }
        footerEnd={attachActions}
        trailingAction={trailingAction}
        textareaRef={composerRef}
        animateMount={stationDock}
        className={cn(
          // Ambient `shadow-elev-raised` paints a strip above the field onto
          // Totals / last-message in every Ticket Displays / right-rail host.
          'shadow-none',
          !isPublic ? CONVERSATION_COMPOSER_DOCK_INTERNAL : undefined,
        )}
      />
    </div>
  );

  if (stationDock) {
    return <div className="w-full">{dock}</div>;
  }

  // Pad + gutter live in {@link CONVERSATION_COMPOSER_PAD} (every Ticket
  // Displays / right-rail host). Internal channel tints the dock hairline.
  return <div className={CONVERSATION_COMPOSER_PAD}>{dock}</div>;
}
