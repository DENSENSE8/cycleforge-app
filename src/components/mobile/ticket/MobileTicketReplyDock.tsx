'use client';

/**
 * The phone's ticket mouth — reply to a helpdesk ticket from `/m/t/[ticketId]`.
 * PUBLIC-first, inherited from the waist (operator 2026-08-31): ticket work is
 */

import { Loader2, Plus, Sparkles } from '@/components/Icons';
import { ComposerProductChips } from '@/components/ui/ComposerProductChip';
import { ComposerStagedPhotoStrip } from '@/components/ui/ComposerStagedPhotoStrip';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { SupportProductPicker } from '@/components/ui/SupportProductPicker';
import { VisibilityToggle } from '@/components/ui/VisibilityToggle';
import { Button, IconButton } from '@/design-system/primitives';
import { MOBILE_CONTROL_CORNER } from '@/design-system/tokens/radius';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { elevationClass } from '@/design-system/tokens/shadows';
import { useTicketComposer } from '@/lib/composer/use-ticket-composer';
import type { TicketThreadHandoff } from '@/lib/composer/ticket-thread-handoff';
import { cn } from '@/utils/_cn';

/**
 * `text-role-field` is 16px and deliberately not density-scaled: iOS Safari
 * zooms any focused input under 16px. Every phone input wears it.
 */
const REPLY_TEXTAREA_CLASS = cn(
  'min-h-12 w-full resize-none border border-border-hairline bg-surface-card px-3 py-2.5',
  'text-role-field text-text-default placeholder:text-text-faint',
  MOBILE_CONTROL_CORNER,
  focusRing('field', 'accent'),
);

export function MobileTicketReplyDock({
  ticketId,
  onSent,
  handoff,
}: {
  ticketId: number;
  /** Fired after a successful post — the host scrolls its stream to the echo. */
  onSent?: () => void;
  /** Prepared reply handed over by another surface (draft, photos, channel); never auto-sent. */
  handoff?: TicketThreadHandoff;
}) {
  const composer = useTicketComposer({
    ticketId,
    onSent,
    initialBody: handoff?.draft,
    initialPhotoIds: handoff?.photoIds,
    initialIsPublic: handoff?.visibility ? handoff.visibility === 'public' : undefined,
  });
  // The phone's `+` has one insert today — the product row of the SAME tree
  // the desk `+` lists (photos stay where they are on the phone). Routing
  // through the node keeps its permission gate (disabled without ticket access).
  const productNode = composer.insertNodes.find((n) => n.id === 'product-sent');
  const closeProductPicker = () => composer.setProductPickerOpen(false);

  return (
    <div
      className={cn(
        // `sticky`, not `fixed`: on a wide viewport `/m` renders as a phone
        // COLUMN inside thick gutters, and a fixed dock would fly out to the
        // browser's corner away from the thread it belongs to.
        'sticky bottom-0 z-fab shrink-0 border-t border-border-hairline bg-surface-card px-4 pb-4 pt-3',
        elevationClass('raised'),
      )}
    >
      <ComposerProductChips
        picks={composer.products}
        onRemove={composer.removeProduct}
        size="touch"
        className="pb-2"
      />
      <ComposerStagedPhotoStrip
        staged={composer.staging.staged}
        onRemove={composer.staging.remove}
        className="pb-2"
      />
      {/* Draft with AI sits beside the field it fills: the action row below is
          already full at 390px (+ · Internal|Public · labelled commit). */}
      <div className="flex items-end gap-2">
        <textarea
          value={composer.body}
          onChange={(e) => composer.setBody(e.target.value)}
          rows={2}
          placeholder={composer.isPublic ? 'Reply to the customer…' : 'Internal note…'}
          aria-label={composer.isPublic ? 'Public reply' : 'Internal note'}
          disabled={!composer.canPost}
          className={cn(REPLY_TEXTAREA_CLASS, 'min-w-0 flex-1')}
        />
        <IconButton
          icon={
            composer.drafting ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <Sparkles className="size-5" />
            )
          }
          ariaLabel={composer.drafting ? 'Drafting a reply with AI' : 'Draft with AI'}
          size="touch"
          radius="pill"
          className="shrink-0 border border-border-hairline bg-surface-card"
          disabled={!composer.canPost || composer.drafting}
          onClick={() => composer.draftWithAi()}
          data-testid="mobile-composer-draft-with-ai"
        />
      </div>
      <div className="flex items-center justify-between gap-3 pt-2">
        <div className="flex min-w-0 items-center gap-2">
          <IconButton
            icon={<Plus className="size-5" />}
            ariaLabel="Add a product sent to the customer"
            size="touch"
            radius="pill"
            className="border border-border-hairline bg-surface-card"
            disabled={!productNode || productNode.disabled}
            onClick={() => productNode?.type === 'action' && productNode.onSelect()}
            data-testid="mobile-composer-plus"
          />
          <VisibilityToggle
            value={composer.isPublic}
            onChange={composer.setIsPublic}
            internalLabel="Internal"
            publicLabel="Public"
          />
        </div>
        {/* A LABELLED commit, never a bare arrow (the TicketComposer contract): */}
        <Button
          variant="primary"
          size="lg"
          className="min-h-11 shrink-0"
          disabled={!composer.canSend}
          onClick={composer.send}
        >
          {!composer.canPost
            ? 'No ticket access'
            : composer.reply.isPending
              ? 'Sending…'
              : composer.isPublic
                ? 'Send reply'
                : 'Add note'}
        </Button>
      </div>
      <Sheet open={composer.productPickerOpen} onOpenChange={(next) => { if (!next) closeProductPicker(); }}>
        <SheetContent side="bottom" aria-describedby={undefined}>
          <SheetHeader className="shrink-0 border-b border-mode-rule px-mode-page py-3 pr-12">
            <SheetTitle className="text-role-data">Product sent to customer</SheetTitle>
          </SheetHeader>
          <SheetBody className="pt-3">
            <SupportProductPicker
              variant="phone"
              ticketId={ticketId}
              onClose={closeProductPicker}
              onPick={(face, role, qty) => {
                composer.addProduct(face, role, qty);
                closeProductPicker();
              }}
            />
          </SheetBody>
        </SheetContent>
      </Sheet>
    </div>
  );
}
