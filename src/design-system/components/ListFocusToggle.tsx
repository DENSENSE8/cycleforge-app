'use client';

/**
 * ⤢ / ⤡ — list FOCUS MODE (`useListFocusMode`, client state per page): the sidebar column,
 * global header and page title band slide away and the list fills the
 * viewport; pressed again (or Esc) they slide back. The shared sheet's tools
 * row and the outbound lists' bar mount it; the key lives in the `?` sheet,
 * never on the button.
 */

import { Maximize2, Minimize2 } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton, type IconButtonSize } from '@/design-system/primitives';
import { useListFocusMode } from '@/lib/shell/list-focus-mode';

export function ListFocusToggle({
  size = 'sm',
  radius,
  className,
}: {
  /** The neighbours' hit-box — `sm` in the sheet's tools row, `md` on a triage bar. */
  size?: IconButtonSize;
  radius?: 'flush' | 'control';
  className?: string;
}) {
  const focus = useListFocusMode();
  const label = focus.on ? 'Exit full screen' : 'Full screen';
  return (
    <HoverTooltip label={label} asChild>
      <IconButton
        ariaLabel={label}
        aria-pressed={focus.on}
        data-list-focus-toggle
        size={size}
        radius={radius}
        className={className}
        onClick={focus.toggle}
        icon={focus.on ? <Minimize2 aria-hidden className="size-4" /> : <Maximize2 aria-hidden className="size-4" />}
      />
    </HoverTooltip>
  );
}
