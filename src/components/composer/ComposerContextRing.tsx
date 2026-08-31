'use client';

/**
 * Hollow context ring — ported from Warehouse OS `AssistantFeed` ContextRing
 * (shell.css `.context-ring` / `.context-ring-dot`).
 *
 * Sits BELOW the composer outline, bottom-right of `.composer-row`.
 * A ring is an ANNULUS: transparent centre, stroke is the whole mark.
 * Count > 0 deepens the stroke (+ optional badge); never fills the disc solid
 * as a bullet. Colour/opacity only — never geometry (M1).
 */

import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';

export function ComposerContextRing({
  count = 0,
  onClick,
  pressed = false,
  label = 'Context',
}: {
  /** Attached context chips. 0 = empty muted stroke. */
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
        'ds-raw-button context-ring relative inline-flex h-5 w-5 shrink-0 items-center justify-center',
        focusRing('control', 'accent'),
        pressed && 'ring-2 ring-blue-500/30',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'context-ring-dot block h-3 w-3 rounded-full border-2 bg-transparent transition-colors duration-75',
          filled ? 'border-blue-600' : 'border-border-strong',
        )}
      />
      {filled ? (
        <span className="pointer-events-none absolute -right-1 -top-1 flex h-3 min-w-3 items-center justify-center rounded-full bg-blue-600 px-0.5 text-[9px] font-semibold leading-none text-white">
          {count > 9 ? '9+' : count}
        </span>
      ) : null}
    </button>
  );
}
