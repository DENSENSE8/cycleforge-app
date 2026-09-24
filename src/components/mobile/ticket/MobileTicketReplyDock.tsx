'use client';

/**
 * The phone's ticket mouth — reply to a helpdesk ticket from `/m/t/[ticketId]`.
 *
 * CHROME ONLY. Every decision this control appears to make — draft, channel,
 * signing, CC folding, staged photo ids, the actual send — belongs to
 * {@link useTicketComposer} (`lib/composer/use-ticket-composer`), the behaviour
 * waist the desk's `TicketComposer` sits on too. That hook assembles the reply
 * through `buildComposerReplyVars`, so a phone reply and a console reply are
 * byte-identical on the wire; hand-assembling `SupportReplyVars` here is
 * exactly the drift the waist exists to prevent.
 *
 * It is NOT the desk composer wearing a smaller hat. `TicketComposer` lives in
 * `src/components/composer/**`, which `/m` may not import (ARCHITECTURE.md rule
 * 2 — the Boundary gate), and it should not: its `+` tree, media library and CC
 * strip are three disclosure layers a 390px screen has no room for. The phone
 * keeps the two controls a reply cannot be sent without — the words and the
 * channel — and a LABELLED commit, because this button emails a customer.
 *
 * PUBLIC-first, inherited from the waist (operator 2026-08-31): ticket work is
 * outbound, so Internal-first put the extra tap on the common case.
 */

import { ComposerStagedPhotoStrip } from '@/components/ui/ComposerStagedPhotoStrip';
import { VisibilityToggle } from '@/components/ui/VisibilityToggle';
import { Button } from '@/design-system/primitives';
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
      <ComposerStagedPhotoStrip
        staged={composer.staging.staged}
        onRemove={composer.staging.remove}
        className="pb-2"
      />
      <textarea
        value={composer.body}
        onChange={(e) => composer.setBody(e.target.value)}
        rows={2}
        placeholder={composer.isPublic ? 'Reply to the customer…' : 'Internal note…'}
        aria-label={composer.isPublic ? 'Public reply' : 'Internal note'}
        disabled={!composer.canPost}
        className={REPLY_TEXTAREA_CLASS}
      />
      <div className="flex items-center justify-between gap-3 pt-2">
        <VisibilityToggle
          value={composer.isPublic}
          onChange={composer.setIsPublic}
          internalLabel="Internal"
          publicLabel="Public"
        />
        {/*
         * A LABELLED commit, never a bare arrow (the TicketComposer contract):
         * one of these two words is a customer-visible email and the other is
         * not, and the operator must read which before the thumb lands.
         *
         * R9 — a disabled CTA names what is missing: no permission is a
         * different answer from an empty draft, and only one of them is
         * something the operator can fix from here.
         */}
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
    </div>
  );
}
