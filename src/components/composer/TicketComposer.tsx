'use client';

/** The ONE ticket composer — a helpdesk ticket, or (Support-item mode) a local Support item. */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CornerDownLeft, Copy, Images, Package, Sparkles, Upload } from '@/components/Icons';
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
import { useTicketComposer, type TicketComposerSupportItem } from '@/lib/composer/use-ticket-composer';
import type { SupportComposerCommit } from '@/lib/support/record/support-record-model';

const INSERT_ICONS = {
  browse: <Images className="h-3.5 w-3.5" />,
  upload: <Upload className="h-3.5 w-3.5" />,
  product: <Package className="h-3.5 w-3.5" />,
} as const;

/** Support-item placeholders: what Enter does, in the composer's own words. */
function supportPlaceholder(commit: SupportComposerCommit, transportLabel: string): string {
  if (commit.kind === 'send') return 'Reply to the customer… (Enter to send)';
  if (commit.kind === 'copy_open') return `Reply to the customer… (Enter copies it and opens ${transportLabel})`;
  return commit.label === 'Add internal update' ? 'Internal update… (Enter to add)' : 'Internal note… (Enter to add)';
}

export function TicketComposer({
  ticketId,
  supportItem,
  requesterEmail,
  staging,
  receivingId,
  onBridgeChange,
  trailingAction,
  className,
}: {
  /** The live helpdesk ticket. Omitted in Support-item mode. */
  ticketId?: number;
  /**
   * Support-item mode (Tasks → Support record): commits go to the local
   * Support item — Send public reply · Copy & open <transport> · Log as sent ·
   * Add internal note — never to a helpdesk ticket. No `+` attach and no Cc
   * here: the Support reply carries neither.
   */
  supportItem?: TicketComposerSupportItem;
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
  const helpdeskTicketId = supportItem ? null : (ticketId ?? null);
  const c = useTicketComposer({ ticketId: helpdeskTicketId, supportItem, receivingId, staging, insertIcons: INSERT_ICONS });
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
  // in state (the task ticket host) re-rendered us right back — "Maximum
  // update depth exceeded" on the task ticket record. The bridge calls the latest
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
            if (opts?.draftId != null) c.noteSeededDraft(opts.draftId);
            textareaRef.current?.focus();
            textareaRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          },
        }),
    });
    return () => onBridgeChange(null);
    // `submit` reads the latest send through `sendRef`; `setDraft` closes over the body.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onBridgeChange, c.body, c.products.length, c.isPublic, c.busy, c.canPost]);

  // A public comment reaches the customer and says so; a Support item names its own commit (Copy & open eBay …).
  const commitLabel = c.supportCommit?.label ?? stationComposerTicketCommitLabel(true, c.isPublic);

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
        placeholder={
          c.supportCommit && supportItem
            ? supportPlaceholder(c.supportCommit, supportItem.transport.label)
            : c.isPublic
              ? 'Reply… (Enter to send)'
              : 'Internal note… (Enter to send)'
        }
        ariaLabel={c.isPublic ? 'Public reply' : 'Internal note'}
        commitGlyph="action"
        commitLabel={commitLabel}
        commitIcon={
          c.supportCommit?.kind === 'copy_open' ? <Copy className="h-3.5 w-3.5" /> : <CornerDownLeft className="h-3.5 w-3.5" />
        }
        commitAriaLabel={commitLabel}
        commitTooltip={`${commitLabel} (Enter) · Shift+Enter for newline`}
        commitTestId={c.supportCommit?.testId}
        leadingStart={
          c.insertNodes.length > 0 ? (
            <ComposerDrillMenu
              nodes={c.insertNodes}
              open={plusOpen}
              onOpenChange={setPlusOpen}
              triggerAriaLabel={helpdeskTicketId != null ? 'Attach a photo or product' : 'Attach a photo'}
            />
          ) : undefined
        }
        footerStart={
          // An internal record or unclassified Support item has no Public channel to choose.
          c.supportMode == null || c.supportMode === 'customer' ? (
            <ComposerTicketChannelToggle isPublic={c.isPublic} onIsPublicChange={c.setIsPublic} />
          ) : undefined
        }
        footerEnd={
          c.supportMode != null && c.supportMode !== 'customer' ? undefined : (
            <>
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
                data-testid={c.supportMode ? 'support-draft-with-ai' : 'composer-draft-with-ai'}
              >
                Draft with AI
              </Button>
              {c.supportMode === 'customer' && c.isPublic ? (
                // A reply already sent elsewhere (phone, marketplace page, email) is recorded, not re-sent.
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!c.canSend}
                  onClick={c.logSent}
                  icon={<CornerDownLeft className="h-3.5 w-3.5" />}
                  data-testid="support-log-sent"
                >
                  Log as sent
                </Button>
              ) : null}
            </>
          )
        }
        insetTop={
          helpdeskTicketId != null ? (
            <ComposerTicketInsetChrome
              isPublic={c.isPublic}
              ccs={c.ccs}
              onCcsChange={c.setCcs}
              ccDraft={c.ccDraft}
              onCcDraftChange={c.setCcDraft}
              requesterEmail={requesterEmail ?? null}
              ticketId={helpdeskTicketId}
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
          ) : c.staging.staged.length > 0 ? (
            // A Support item's photos: already on its task (Media tab) as they land.
            <ComposerStagedPhotoStrip staged={c.staging.staged} onRemove={c.staging.remove} size="compact" />
          ) : undefined
        }
        trailingAction={trailingAction}
        textareaRef={textareaRef}
        className="shadow-none"
      />
      {helpdeskTicketId != null ? (
        // `+` → Product sent to customer: rises from the composer's bottom-left edge, above it.
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
            ticketId={helpdeskTicketId}
            onClose={closeProductPicker}
            onPick={(face, role, qty) => {
              c.addProduct(face, role, qty);
              closeProductPicker();
            }}
          />
        </Popover>
      ) : null}
      {c.photoTarget ? (
        <>
          {/* `+` → Upload file. */}
          <input ref={c.picker.inputRef} {...c.picker.inputProps} />
          {c.canBrowseLibrary ? (
            <SupportPhotoLibraryPicker
              target={c.photoTarget}
              receivingId={c.receivingId}
              open={c.libraryOpen}
              onClose={() => c.setLibraryOpen(false)}
              excludePhotoIds={c.stagedPhotoIds}
              onSelect={c.onLibrarySelect}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
