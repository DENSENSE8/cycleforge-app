'use client';

import { HoverTooltip } from '@/components/ui/HoverTooltip';
import {
  TICKET_REPLY_PRESETS,
  type TicketReplyPreset,
} from '@/lib/support/ticket-reply-presets';
import { cn } from '@/utils/_cn';
import { cornerClass } from '@/design-system/tokens/radius';

/**
 * Flush preset chips above the ticket composer — REST posts only (never DOM
 * macros). Parent owns the send path so signing / CC / photo staging stay one.
 */
export function TicketReplyPresetsBar({
  disabled,
  onPick,
  className,
}: {
  disabled?: boolean;
  onPick: (preset: TicketReplyPreset) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-stretch gap-0 border-t border-border-hairline',
        className,
      )}
      data-testid="ticket-reply-presets"
    >
      {TICKET_REPLY_PRESETS.map((preset) => {
        const tip = preset.isPublic
          ? `Public reply: ${preset.body}`
          : `Internal note: ${preset.body}`;
        return (
          <HoverTooltip key={preset.id} label={tip} asChild>
            {/* ds-raw-button */}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(preset)}
              className={cn(
                cornerClass('flush'),
                'min-h-8 flex-1 px-2 text-role-caption font-semibold ring-1 ring-inset ring-border-soft',
                'bg-surface-card text-text-muted transition hover:bg-surface-sunken hover:text-text-default',
                'disabled:cursor-not-allowed disabled:opacity-50',
                preset.isPublic ? 'text-blue-700' : null,
              )}
            >
              {preset.label}
            </button>
          </HoverTooltip>
        );
      })}
    </div>
  );
}
