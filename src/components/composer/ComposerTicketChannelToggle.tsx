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
 * Its partner row — Cc — stays at the TOP of the composer
 * ({@link ComposerTicketInsetChrome}): recipients describe the message, so they
 * belong above it, next to the text they apply to.
 *
 * ROUNDED, not `appearance="flush"`. This control sits inside
 * `OmnichannelComposerDock` (`COMPOSER_SHELL_CORNER`). The default appearance
 * is concentrically correct for that shell: the dock is 16px with `p-1.5`
 * (6px), so the inner control wants the 8px rung (`rounded-lg`), and the
 * toggle's own `p-0.5` puts its faces at `rounded-md`. Scan-station segmented
 * chrome may pass `appearance="flush"`. Reach for the component's own default
 * variant here — never a hand-written `rounded-*`.
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
        className="scale-90 origin-left"
      />
    </div>
  );
}
