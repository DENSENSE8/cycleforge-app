'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Mail, Paperclip, Plus, X } from '@/components/Icons';
import { IconButton, OmnichannelComposerDock } from '@/design-system/primitives';
import { VisibilityToggle } from '@/components/ui/VisibilityToggle';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { usePhotoDropzone } from '@/hooks/usePhotoDropzone';
import { useSupportReply } from '@/hooks/useSupportReply';
import { useZendeskAgents, zendeskKeys } from '@/hooks/useZendeskQueries';
import type { TicketPhotoStaging } from '@/hooks/useTicketPhotoStaging';
import { useAuth } from '@/contexts/AuthContext';
import { markdownToHtml } from '@/lib/support/markdown';
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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Chat composer — public reply / internal note toggle, CC collaborators, photo
 * attach (via the ticket-level drop overlay or the Attach control), Enter to send.
 * Internal notes auto-sign with the current staffer's name for attribution.
 * Posts through {@link useSupportReply} (the shared photo→ticket pipeline).
 *
 * Always uses {@link OmnichannelComposerDock} — same elevated white shell as carton
 * notes. Station compound docks pass `trailingAction` (terminal CTA replaces
 * blue Send; Enter still commits).
 */
export function SupportChatComposer({
  ticketId,
  requesterEmail,
  staging,
  receivingId,
  onBridgeChange,
  variant = 'inline',
  trailingAction,
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
  const { data: agents = [] } = useZendeskAgents();
  const { user, has, isLoaded } = useAuth();
  const canBrowseLibrary = isLoaded && has('photos.view');
  const canPost = !isLoaded || has('integrations.zendesk');
  const staffName = user?.name?.trim() || '';

  // Reuse the dropzone hook purely for its file-picker plumbing (the ticket
  // panel owns the actual drag overlay, so we don't spread rootProps here).
  const picker = usePhotoDropzone(staging.addFiles);

  // Type-ahead pool: the ticket requester + every agent email, minus the ones
  // already added. Free entry is still allowed (any valid email).
  const ccSuggestions = useMemo(() => {
    const pool = [
      ...(requesterEmail ? [requesterEmail] : []),
      ...agents.map((a) => a.email).filter((e): e is string => Boolean(e)),
    ];
    return Array.from(new Set(pool)).filter((e) => !ccs.includes(e));
  }, [agents, requesterEmail, ccs]);

  const addCc = (raw: string) => {
    const email = raw.trim().replace(/[,;]+$/, '');
    if (!email) return;
    if (!EMAIL_RE.test(email) || ccs.includes(email)) return;
    setCcs((prev) => [...prev, email]);
    setCcInput('');
  };
  const removeCc = (email: string) => setCcs((prev) => prev.filter((e) => e !== email));

  /** Internal notes are signed with the staffer's name for exact attribution. */
  const signNote = (text: string) => {
    if (isPublic || !staffName) return text;
    const sig = `— ${staffName}`;
    return text.trimEnd().endsWith(sig) ? text : `${text}\n\n${sig}`;
  };

  const stagedDone = staging.staged.filter((s) => s.status === 'done' && typeof s.photoId === 'number');
  const stagedPhotoIds = useMemo(
    () => new Set(stagedDone.map((s) => s.photoId!)),
    [stagedDone],
  );

  const submit = () => {
    const text = body.trim();
    if (!text || reply.isPending || staging.uploading) return;
    const finalText = signNote(text);
    // Fold a half-typed CC into the list so it isn't silently dropped.
    const pendingCc = ccInput.trim();
    const allCcs = isPublic
      ? Array.from(new Set([...ccs, ...(pendingCc && EMAIL_RE.test(pendingCc) ? [pendingCc] : [])]))
      : [];
    reply.mutate(
      {
        ticketId,
        body: finalText,
        isPublic,
        photoIds: stagedDone.map((s) => s.photoId!),
        attachmentPreviews: stagedDone.map((s) => ({ url: s.url!, thumbUrl: s.thumbUrl })),
        emailCcs: allCcs.length ? allCcs : undefined,
        htmlBody: markdownToHtml(finalText),
      },
      {
        onSuccess: () => {
          setBody('');
          setCcs([]);
          setCcInput('');
          staging.clear();
        },
      },
    );
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
    <div className="mb-2 flex flex-wrap items-center gap-1.5 border-t border-border-hairline bg-surface-sunken px-2 py-1.5">
      <span className="inline-flex items-center gap-1 text-role-micro uppercase tracking-widest text-text-faint">
        <Mail className="h-3 w-3" /> Cc
      </span>
      {ccs.map((email) => (
        <span
          key={email}
          className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-role-caption font-semibold text-blue-700 ring-1 ring-inset ring-blue-200"
        >
          {email}
          <IconButton
            onClick={() => removeCc(email)}
            ariaLabel={`Remove ${email}`}
            tone="accent"
            icon={<X className="h-2.5 w-2.5" />}
            className="rounded-full text-blue-400 hover:text-blue-700"
          />
        </span>
      ))}
      <input
        list="support-cc-suggestions"
        value={ccInput}
        onChange={(e) => setCcInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
            e.preventDefault();
            addCc(ccInput);
          } else if (e.key === 'Backspace' && !ccInput && ccs.length) {
            removeCc(ccs[ccs.length - 1]);
          }
        }}
        onBlur={() => addCc(ccInput)}
        placeholder={ccs.length ? 'Add another…' : 'Add email to CC…'}
        className="min-w-[8rem] flex-1 bg-transparent px-1 text-role-caption text-text-default outline-none placeholder:text-text-faint"
      />
      <datalist id="support-cc-suggestions">
        {ccSuggestions.map((email) => (
          <option key={email} value={email} />
        ))}
      </datalist>
    </div>
  ) : null;

  const stagedThumbs =
    staging.staged.length > 0 ? (
      <div className="mb-2 flex flex-wrap gap-2">
        {staging.staged.map((s) => (
          <div
            key={s.tempId}
            className={cn(
              'relative h-14 w-14 overflow-hidden rounded-lg ring-1 ring-inset',
              s.status === 'error' ? 'ring-rose-300' : 'ring-border-soft',
            )}
          >
            <img src={s.thumbUrl || s.previewUrl} alt={s.name} className="h-full w-full object-cover" />
            {s.status === 'uploading' ? (
              <div className="absolute inset-0 flex items-center justify-center bg-scrim/30">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              </div>
            ) : null}
            {s.status === 'error' ? (
              <div className="absolute inset-0 flex items-center justify-center bg-rose-900/40 text-role-micro uppercase text-white">
                Failed
              </div>
            ) : null}
            <IconButton
              onClick={() => staging.remove(s.tempId)}
              ariaLabel="Remove"
              icon={<X className="h-2.5 w-2.5" />}
              // ds-allow-raw-neutral: glass overlay pinned on an image thumbnail — photo doesn't theme, stays dark
              className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-scrim/70 text-white hover:bg-gray-900"
            />
          </div>
        ))}
      </div>
    ) : null;

  const busy = !canPost || reply.isPending || staging.uploading;

  const dock = (
    <>
      {ccStrip}
      {stagedThumbs}
      {libraryPicker}
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
      />
    </>
  );

  if (stationDock) {
    return <div className="w-full">{dock}</div>;
  }

  return (
    <div className="shrink-0 border-t border-border-hairline bg-surface-canvas/40 px-3 py-2">{dock}</div>
  );
}
