'use client';

/**
 * Context ring — the native AI context mark on the composer's second row.
 *
 * ONE face in every state: a NEUTRAL ring with a filled centre. It is a
 * standing indicator of what the model is being handed, not an alert and not a
 * live fact, so it never takes Scan Blue and never wears a count bubble — the
 * number lives in the panel it opens. Attached vs empty is a one-step ink
 * change on the same geometry (colour/opacity only, never geometry — M1).
 *
 * `h-7` matches the commit control at the other end of the row, so the mark's
 * centre lands on the row's middle line.
 */

import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';

export function ComposerContextRing({
  count = 0,
  onClick,
  pressed = false,
  label = 'Context',
}: {
  /** Attached context items. 0 = the quiet resting face. */
  count?: number;
  onClick?: () => void;
  pressed?: boolean;
  /** Base aria / title when count is 0. */
  label?: string;
}) {
  const filled = count > 0;
  return (
    <button
      type="button"
      data-testid="composer-context-ring"
      title={filled ? `${label} — ${count} attached` : label}
      aria-label={
        filled
          ? `${label}. ${count} attached — open tools`
          : `${label} — add tools`
      }
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'ds-raw-button context-ring relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
        'transition-colors hover:bg-surface-hover',
        focusRing('control', 'accent'),
        pressed && 'bg-surface-sunken',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'context-ring-dot block h-3 w-3 rounded-full border-2 transition-colors duration-75',
          filled
            ? 'border-text-muted bg-text-muted/30'
            : 'border-border-emphasis bg-surface-strong',
        )}
      />
    </button>
  );
}
