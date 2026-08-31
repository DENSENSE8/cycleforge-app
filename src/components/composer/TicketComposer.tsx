'use client';

/**
 * The ONE ticket composer.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ @ Cc  cc@…  [type email…]   ← Public only     │
 *   │ [📷 staged thumbs]                            │
 *   │  Reply…                                       │
 *   │ [+] [Internal │ Public]   [🔗 File ticket →]  │
 *   └──────────────────────────────────────────────┘
 *
 * Every rule in one place, because they only make sense together:
 *
 * - **Channel on the action bar, right of `+`** — never inside `+`. Whether a
 *   message is a private note or an email to a customer is the highest-stakes
 *   fact about it; two taps deep in a menu, an operator could type a reply
 *   believing it was internal and email it.
 * - **Cc above the draft, Public only** — recipients describe the message, so
 *   they sit above the text they apply to. An internal note is never emailed
 *   and has no audience to name.
 * - **`+` is photo attach** — Browse library · Upload file, flat and untitled.
 *   It briefly also carried product / "what happened" inserts; those were
 *   withdrawn on 2026-08-30.
 * - **A LABELLED commit** — `File ticket →` / `Update ticket`, never a bare
 *   return arrow. This control files a helpdesk ticket or posts to a
 *   customer-visible thread, and it was wearing the quietest face on the bench.
 *
 * It replaced `SupportChatComposer` on 2026-08-31. That component had drifted
 * from the station's copy on signing, `emailCcs` and `photoIds`, and carried a
 * `Plus` + `Paperclip` pair in its footer that did exactly what the station's
 * `+` drill menu does. Behaviour lives in {@link useTicketComposer} so the
 * station — which shares one textarea between Unbox and Ticket and therefore
 * cannot mount this dock — runs the same logic rather than a second copy.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CornerDownLeft, Images, Upload } from '@/components/Icons';
import { OmnichannelComposerDock } from '@/design-system/primitives';
import { SupportPhotoLibraryPicker } from '@/components/support/zendesk/chat/SupportPhotoLibraryPicker';
import { TicketReplyPresetsBar } from '@/components/support/zendesk/chat/TicketReplyPresetsBar';
import type { TicketReplyPreset } from '@/lib/support/ticket-reply-presets';
import type { TicketPhotoStaging } from '@/hooks/useTicketPhotoStaging';
import type { ThreadComposerBridge } from '@/components/threads/ThreadPanel';
import { seedComposerDraft } from '@/lib/threads/composer-draft';
import { requestConfirm } from '@/design-system/components/confirm';
import { buildComposerReplyVars } from '@/lib/composer/ticket-reply-payload';
import { stationComposerTicketCommitLabel } from '@/lib/composer/station-composer-mode';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/utils/_cn';
import { ComposerDrillMenu } from './ComposerDrillMenu';
import { ComposerStagedPhotoStrip } from './ComposerStagedPhotoStrip';
import { ComposerTicketChannelToggle } from './ComposerTicketChannelToggle';
import { ComposerTicketInsetChrome } from './ComposerTicketInsetChrome';
import { useTicketComposer } from './useTicketComposer';

const INSERT_ICONS = {
  browse: <Images className="h-3.5 w-3.5" />,
  upload: <Upload className="h-3.5 w-3.5" />,
} as const;

export function TicketComposer({
  ticketId,
  requesterEmail,
  staging,
  receivingId,
  onBridgeChange,
  trailingAction,
  showReplyPresets = true,
  className,
}: {
  ticketId: number;
  requesterEmail?: string | null;
  /** Host-owned staging when the host also owns a drop overlay. */
  staging?: TicketPhotoStaging;
  receivingId?: number;
  /** Exposes this composer to a station terminal dock. */
  onBridgeChange?: (bridge: ThreadComposerBridge | null) => void;
  /** Terminal CTA in the footer's trailing edge (replaces the commit CTA). */
  trailingAction?: ReactNode;
  /** All-good / QC chip row. Unbox Ticket Displays passes `false`. */
  showReplyPresets?: boolean;
  className?: string;
}) {
  const c = useTicketComposer({ ticketId, receivingId, staging, insertIcons: INSERT_ICONS });
  const [plusOpen, setPlusOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { user } = useAuth();

  /** One-click presets — REST only (never VendorView DOM macros). */
  const applyPreset = (preset: TicketReplyPreset) => {
    if (c.busy) return;
    const vars = buildComposerReplyVars({
      ticketId,
      body: preset.body,
      isPublic: preset.isPublic,
      staffName: user?.name?.trim() || '',
      staffId: user?.staffId ?? null,
    });
    if (vars) c.reply.mutate(vars);
  };

  // A draft reaches this editor through ONE door: `bridge.setDraft`, which
  // routes every insert through `seedComposerDraft`'s overwrite rule. Do not
  // re-add a second seeding path beside the bridge.
  useEffect(() => {
    if (!onBridgeChange) return;
    onBridgeChange({
      hasDraft: c.body.trim().length > 0,
      isPublic: c.isPublic,
      submitting: c.busy,
      canPost: c.canPost,
      focus: () => {
        textareaRef.current?.focus();
        textareaRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      },
      submit: c.send,
      setDraft: (text, opts) =>
        seedComposerDraft({
          currentBody: c.body,
          text,
          mode: opts?.mode,
          applyBody: c.setBody,
          applyMode: c.setIsPublic,
          confirm: requestConfirm,
          onApplied: () => {
            textareaRef.current?.focus();
            textareaRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          },
        }),
    });
    return () => onBridgeChange(null);
    // `send` closes over draft, channel, CCs and staged photos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onBridgeChange, c.body, c.isPublic, c.busy, c.canPost, c.send]);

  return (
    <div className={cn('w-full', className)} data-composer-channel={c.isPublic ? 'public' : 'internal'}>
      {showReplyPresets ? (
        <TicketReplyPresetsBar disabled={c.busy} onPick={applyPreset} />
      ) : null}
      <OmnichannelComposerDock
        value={c.body}
        onChange={c.setBody}
        onCommit={c.send}
        commitDisabled={!c.canSend}
        placeholder={c.isPublic ? 'Reply… (Enter to send)' : 'Internal note… (Enter to send)'}
        ariaLabel={c.isPublic ? 'Public reply' : 'Internal note'}
        commitGlyph="action"
        commitLabel={stationComposerTicketCommitLabel(true)}
        commitIcon={<CornerDownLeft className="h-3.5 w-3.5" />}
        commitAriaLabel={stationComposerTicketCommitLabel(true)}
        commitTooltip="Update ticket (Enter) · Shift+Enter for newline"
        leadingStart={
          <ComposerDrillMenu
            nodes={c.insertNodes}
            open={plusOpen}
            onOpenChange={setPlusOpen}
            triggerAriaLabel="Attach a photo"
          />
        }
        footerStart={
          <ComposerTicketChannelToggle isPublic={c.isPublic} onIsPublicChange={c.setIsPublic} />
        }
        insetTop={
          <ComposerTicketInsetChrome
            isPublic={c.isPublic}
            ccs={c.ccs}
            onCcsChange={c.setCcs}
            ccDraft={c.ccDraft}
            onCcDraftChange={c.setCcDraft}
            requesterEmail={requesterEmail ?? null}
            ticketId={ticketId}
            trailing={
              c.staging.staged.length > 0 ? (
                <ComposerStagedPhotoStrip
                  staged={c.staging.staged}
                  onRemove={c.staging.remove}
                  size="compact"
                />
              ) : null
            }
          />
        }
        trailingAction={trailingAction}
        textareaRef={textareaRef}
        className="shadow-none"
      />
      {/* `+` → Upload file. */}
      <input ref={c.picker.inputRef} {...c.picker.inputProps} />
      {c.canBrowseLibrary ? (
        <SupportPhotoLibraryPicker
          ticketId={ticketId}
          receivingId={c.receivingId}
          open={c.libraryOpen}
          onClose={() => c.setLibraryOpen(false)}
          excludePhotoIds={c.stagedPhotoIds}
          onSelect={c.onLibrarySelect}
        />
      ) : null}
    </div>
  );
}
