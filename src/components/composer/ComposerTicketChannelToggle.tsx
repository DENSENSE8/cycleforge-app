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
 * ROUNDED, not `appearance="flush"`. Flush is the industrial ops variant, and
 * this control is not in ops chrome — it is inside `OmnichannelComposerDock`,
 * which is the ONE named exemption from the flush-square law
 * (`COMPOSER_SHELL_CORNER`, operator 2026-08-24). The default appearance is also
 * concentrically correct for that shell: `radius.ts` puts the dock at 16px with
 * `p-1.5` (6px), so the inner control wants 16 − 6 = 10 → the 8px rung
 * (`rounded-lg`), and the toggle's own `p-0.5` (2px) puts its faces at
 * 8 − 2 = 6 → `rounded-md`. Those are exactly the default's values. It is also
 * what the console's `TicketComposer` renders, so the console and the station
 * stop diverging on the same control.
 *
 * `cornerClass()` cannot express this: every ladder rung renders `rounded-none`
 * under the zero-radius law, so the composer family carries its corners as
 * named literals. Reach for the component's own default variant here — never a
 * hand-written `rounded-*`.
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
