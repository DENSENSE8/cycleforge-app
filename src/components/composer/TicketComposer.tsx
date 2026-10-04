'use client';

/** The ONE ticket composer. */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CornerDownLeft, Images, Package, Sparkles, Upload } from '@/components/Icons';
import { Button, OmnichannelComposerDock } from '@/design-system/primitives';
import { Popover } from '@/design-system/primitives/Popover';
import { SupportPhotoLibraryPicker } from '@/components/support/zendesk/chat/SupportPhotoLibraryPicker';
import type { TicketPhotoStaging } from '@/hooks/useTicketPhotoStaging';
import type { ThreadComposerBridge } from '@/components/threads/ThreadPanel';
import { seedComposerDraft } from '@/lib/threads/composer-draft';
import { requestConfirm } from '@/design-system/components/confirm';
import { stationComposerTicketCommitLabel } from '@/lib/composer/station-composer-mode';
import { cn } from '@/utils/_cn';
import { ComposerDrillMenu } from './ComposerDrillMenu';
import { ComposerStagedPhotoStrip } from '@/components/ui/ComposerStagedPhotoStrip';
import { ComposerProductChips } from '@/components/ui/ComposerProductChip';
import { SupportProductPicker } from '@/components/ui/SupportProductPicker';
import { ComposerTicketChannelToggle } from './ComposerTicketChannelToggle';
import { ComposerTicketInsetChrome } from './ComposerTicketInsetChrome';
import { useTicketComposer } from '@/lib/composer/use-ticket-composer';

const INSERT_ICONS = {
  browse: <Images className="h-3.5 w-3.5" />,
  upload: <Upload className="h-3.5 w-3.5" />,
  product: <Package className="h-3.5 w-3.5" />,
} as const;

export function TicketComposer({
  ticketId,
  requesterEmail,
  staging,
  receivingId,
  onBridgeChange,
  trailingAction,
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
  className?: string;
}) {
  const c = useTicketComposer({ ticketId, receivingId, staging, insertIcons: INSERT_ICONS });
  const [plusOpen, setPlusOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Esc and a pick hand the caret back to the reply: focus first, so the
  // popover's own return-focus sees a live element and leaves it alone.
  const closeProductPicker = () => {
    textareaRef.current?.focus();
    c.setProductPickerOpen(false);
  };

  // `c.send` is a new function every render (it closes over the mutation
  // object, which TanStack rebuilds per render). Publishing it in the bridge
  // re-ran the effect below on every render, and a host that keeps the bridge
  // in state (SupportTicketsWorkspace) re-rendered us right back — "Maximum
  // update depth exceeded" on /support?ticket=N. The bridge calls the latest
  // send through this ref instead.
  const sendRef = useRef(c.send);
  useEffect(() => {
    sendRef.current = c.send;
  });

  // A draft reaches this editor through ONE door: `bridge.setDraft`, which
  // routes every insert through `seedComposerDraft`'s overwrite rule. Do not
  // re-add a second seeding path beside the bridge.
  useEffect(() => {
    if (!onBridgeChange) return;
    onBridgeChange({
      hasDraft: c.body.trim().length > 0 || c.products.length > 0,
      isPublic: c.isPublic,
      submitting: c.busy,
      canPost: c.canPost,
      focus: () => {
        textareaRef.current?.focus();
        textareaRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      },
      submit: () => sendRef.current(),
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
    // `submit` reads the latest send through `sendRef`; `setDraft` closes over the body.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onBridgeChange, c.body, c.products.length, c.isPublic, c.busy, c.canPost]);

  return (
    <div
      ref={rootRef}
      className={cn('w-full', className)}
      data-composer-channel={c.isPublic ? 'public' : 'internal'}
    >
      <OmnichannelComposerDock
        value={c.body}
        onChange={c.setBody}
        onCommit={c.send}
        commitDisabled={!c.canSend}
        onTextareaKeyDown={(e) => {
          // Clicks inside the composer don't dismiss the picker (it is the
          // anchor), so Esc from the textarea must.
          if (e.key === 'Escape' && c.productPickerOpen) {
            e.preventDefault();
            c.setProductPickerOpen(false);
            return true;
          }
          // The dock's Enter refuses an empty value; a product-only reply is a
          // real send (P7 — the pick IS the message), so Enter commits it here.
          if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return false;
          if (c.body.trim().length > 0 || c.products.length === 0) return false;
          e.preventDefault();
          if (c.canSend) c.send();
          return true;
        }}
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
            triggerAriaLabel="Attach a photo or product"
          />
        }
        footerStart={
          <ComposerTicketChannelToggle isPublic={c.isPublic} onIsPublicChange={c.setIsPublic} />
        }
        footerEnd={
          <Button
            variant="ghost"
            size="sm"
            loading={c.drafting}
            disabled={!c.canPost}
            onClick={() =>
              c.draftWithAi({
                onApplied: () => {
                  textareaRef.current?.focus();
                  textareaRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                },
              })
            }
            icon={<Sparkles className="h-3.5 w-3.5" />}
            data-testid="composer-draft-with-ai"
          >
            Draft with AI
          </Button>
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
              c.products.length > 0 || c.staging.staged.length > 0 ? (
                <div className="flex min-w-0 flex-col gap-1">
                  <ComposerProductChips picks={c.products} onRemove={c.removeProduct} />
                  <ComposerStagedPhotoStrip
                    staged={c.staging.staged}
                    onRemove={c.staging.remove}
                    size="compact"
                  />
                </div>
              ) : null
            }
          />
        }
        trailingAction={trailingAction}
        textareaRef={textareaRef}
        className="shadow-none"
      />
      {/* `+` → Product sent to customer: rises from the composer's bottom-left edge, above it. */}
      <Popover
        open={c.productPickerOpen}
        onClose={() => c.setProductPickerOpen(false)}
        anchorRef={rootRef}
        placement="top-start"
        gap={4}
        level="panelOverlay"
        closeOnEscape={false}
        role="dialog"
        aria-label="Product sent to customer"
      >
        <SupportProductPicker
          variant="desk"
          ticketId={ticketId}
          onClose={closeProductPicker}
          onPick={(face, role, qty) => {
            c.addProduct(face, role, qty);
            closeProductPicker();
          }}
        />
      </Popover>
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
