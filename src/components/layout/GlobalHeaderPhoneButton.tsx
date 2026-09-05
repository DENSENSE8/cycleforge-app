'use client';

/**
 * Far-right GlobalHeader control: **send this desk's context to my phone**.
 *
 * Replaces the header Sparkles (2026-09-03, PLAN-companion-composer). The
 * assistant door is the floating circle + ⌘J; this button pairs the phone
 * signed in as the same staff ID so it can type or speak into the ONE desk
 * composer. States come from {@link useCompanionComposerDesk}:
 *
 *   unpaired    — no phone on the bridge; press to hand off
 *   sending     — handshake in flight
 *   paired      — a phone answered / is present (success dot)
 *   unreachable — nobody answered in 6s; holds until retried
 */

import { Smartphone } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import { cornerClass } from '@/design-system/tokens/radius';
import { useCompanionComposerDesk } from '@/hooks/useCompanionComposerDesk';
import { cn } from '@/utils/_cn';
import {
  HEADER_ICON_BTN_CLASS,
  HEADER_ICON_BTN_OPEN_CLASS,
  HEADER_ICON_WRAP,
  TOP_CHROME_ICON_FACE,
} from './header-shell';

type PhoneFace = 'unpaired' | 'sending' | 'paired' | 'unreachable';

const LABEL: Record<PhoneFace, string> = {
  unpaired: 'Send this page to your phone',
  sending: 'Waiting for your phone…',
  paired: 'Phone paired — type or talk on your phone',
  unreachable: 'No phone answered — open Companion on your phone and retry',
};

export function GlobalHeaderPhoneButton({
  size = 'md',
  iconClassName = TOP_CHROME_ICON_FACE,
  wrapClassName = HEADER_ICON_WRAP,
}: {
  size?: 'md' | 'touch';
  iconClassName?: string;
  wrapClassName?: string;
} = {}) {
  const desk = useCompanionComposerDesk();
  if (!desk.enabled) return null;

  const face: PhoneFace = desk.pending
    ? 'sending'
    : desk.sendState === 'timed_out'
      ? 'unreachable'
      : desk.phonePresent || desk.sendState === 'peer_active'
        ? 'paired'
        : 'unpaired';

  const onClick = () => {
    if (desk.pending) return;
    if (face === 'unreachable') desk.retry();
    else void desk.sendContext();
  };

  return (
    <div className={cn(wrapClassName, 'relative')}>
      <HoverTooltip label={LABEL[face]} asChild>
        <IconButton
          type="button"
          size={size}
          ariaLabel={LABEL[face]}
          aria-busy={face === 'sending'}
          data-companion-face={face}
          onClick={onClick}
          disabled={desk.pending}
          className={cn(
            HEADER_ICON_BTN_CLASS,
            face === 'paired' && cn(HEADER_ICON_BTN_OPEN_CLASS, 'text-[var(--ds-color-text-success)]'),
            face === 'unreachable' && 'text-[var(--ds-color-text-danger)]',
          )}
          icon={<Smartphone className={iconClassName} />}
        />
      </HoverTooltip>
      {face === 'paired' ? (
        <span
          aria-hidden
          className={cn(
            'pointer-events-none absolute right-1.5 top-1.5 h-1.5 w-1.5 bg-[var(--ds-color-fill-success)]',
            cornerClass('pill'),
          )}
        />
      ) : null}
    </div>
  );
}
