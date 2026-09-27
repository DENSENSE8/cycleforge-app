'use client';

import type { ReactNode } from 'react';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import type { PortalTooltipPlacement } from '@/lib/ui/portal-anchor';

/**
 * HotkeyTooltip — the ONE way a control teaches "what this does" plus the chord
 * that does it. Linear / Zed behaviour: the hint lives under the pointer, not
 * in a permanent row of chrome beneath the surface.
 *
 * ## The law it enforces
 *
 * A tooltip must TEACH. Both props are required, and that is the whole point:
 *
 * - `action` is a VERB PHRASE — "Switch mode", "Send reply", "Open displays".
 *   Never the control's own visible label. A face that already reads `Unbox`
 *   gains nothing from a bubble that also reads `Unbox`; it just puts a chip
 *   under the hand on every pass. If the only thing you can write is the word
 *   already printed on the control, render NO tooltip.
 * - `chord` is the shortcut as one display string (`'Shift + Tab'`), authored
 *   next to the behaviour that owns it (e.g. `STATION_COMPOSER_CYCLE_CHORD`),
 *   so a hint and a cheat sheet can never drift. {@link KeyboardChord} splits
 *   it into keycaps.
 *
 * Because both are required, this component cannot be used to build a
 * label-echo tooltip — the shape of the API is the rule.
 *
 * ## What it composes, and what it does not own
 *
 * Nothing about routing or paint is re-implemented here:
 * - {@link HoverTooltip} owns WHERE the hint lands — the cursor chip on a desk
 *   (fine pointer, motion on), the anchored `role="tooltip"` bubble for focus,
 *   touch, reduced motion and long labels.
 * - {@link KeyboardChord} owns how a cap LOOKS — one keycap per key, `inverse`
 *   tone on the dark chip: darker than its ground, light hairline, no lift, so
 *   it reads as a hint and not as a target.
 *
 * @example
 * <HotkeyTooltip action="Switch mode" chord={STATION_COMPOSER_CYCLE_CHORD}>
 *   <button …>Ask</button>
 * </HotkeyTooltip>
 */
export function HotkeyTooltip({
  action,
  chord,
  children,
  asChild = true,
  placement = 'auto',
  openDelayMs = 0,
  disabled = false,
}: {
  /** Verb phrase for what firing this control does. Never its visible label. */
  action: string;
  /** The chord, as one display string: `'Shift + Tab'`, `'Cmd + Enter'`. */
  chord: string;
  children: ReactNode;
  /**
   * Defaults to `true` — a hotkey-bearing control is nearly always a real
   * button, and a wrapper `<span>` around one disturbs flex/grid rows. Pass
   * `false` only when the child is not a single DOM element.
   */
  asChild?: boolean;
  placement?: PortalTooltipPlacement;
  /** Dwell before showing on mouse enter; keyboard focus is always instant. */
  openDelayMs?: number;
  /** Suppress without remounting the child (a sibling surface owns the hover). */
  disabled?: boolean;
}) {
  return (
    <HoverTooltip
      label={action}
      shortcut={chord}
      asChild={asChild}
      placement={placement}
      openDelayMs={openDelayMs}
      disabled={disabled}
    >
      {children}
    </HoverTooltip>
  );
}
