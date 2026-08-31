'use client';

/**
 * Internal note ↔ public reply, in the composer's bottom action bar, directly
 * RIGHT OF the `+` (operator ruling 2026-08-30).
 *
 * It is not inside `+`. Whether a message is a private note or an email to a
 * customer is the single highest-stakes fact about it, and burying it two taps
 * deep in a menu with no indication of the current state let an operator type a
 * reply believing it was internal and email it. It sits on the action bar,
 * beside the other things you DO to the draft, and reads without opening
 * anything.
 *
 * Its partner row — Cc, and the attached-context chips — stays at the TOP of
 * the composer ({@link ComposerTicketInsetChrome}): recipients and attachments
 * describe the message, so they belong above it, next to the text they apply to.
 */

import { VisibilityToggle } from '@/components/ui/VisibilityToggle';

export function ComposerTicketChannelToggle({
  isPublic,
  onIsPublicChange,
}: {
  isPublic: boolean;
  onIsPublicChange: (next: boolean) => void;
}) {
  return (
    <div
      data-testid="composer-ticket-channel"
      data-composer-channel={isPublic ? 'public' : 'internal'}
      className="flex min-w-0 shrink-0 items-center"
    >
      <VisibilityToggle
        value={isPublic}
        onChange={onIsPublicChange}
        internalLabel="Internal"
        publicLabel="Public"
        appearance="flush"
        className="scale-90 origin-left"
      />
    </div>
  );
}
