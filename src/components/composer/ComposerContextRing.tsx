'use client';

/**
 * Context ring — how full the model's context is, on the composer's second row.
 *
 * It is a METER, not a dot: an empty track when nothing is attached, and an arc
 * that sweeps clockwise from 12 o'clock as slots fill, which is the shape every
 * agent surface uses for "how much of the window am I spending". It used to be
 * a 12px circle with a filled grey centre — a plugged hole that carried no
 * quantity at all and read as a disabled control (operator 2026-09-07).
 *
 * Neutral ink in every state. This is a standing indicator of what the model is
 * being handed, not an alert and not a live fact, so it never takes Scan Blue
 * and never wears a count bubble — the number lives in the panel it opens.
 *
 * `h-7` matches the commit control at the other end of the row, so the mark's
 * centre lands on the row's middle line.
 */

import { cn } from '@/utils/_cn';
import { focusRing } from '@/design-system/tokens/focus-ring';

/** Geometry, in the SVG's own 16-unit box. r=6 leaves the 2px stroke inside. */
const RADIUS = 6;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ComposerContextRing({
  count = 0,
  capacity = 6,
  onClick,
  pressed = false,
  label = 'Context',
  summary,
}: {
  /** Attached context items. 0 = the empty track. */
  count?: number;
  /**
   * Slots the ring measures against — the number of context kinds the surface
   * can hand the model. The caller owns it because only the caller knows what
   * it is offering (`AgentSessionPanel`: page · mode · selection · skill ·
   * thread · staged file).
   */
  capacity?: number;
  onClick?: () => void;
  pressed?: boolean;
  /** Base aria / title when count is 0. */
  label?: string;
  /**
   * The whole reading, when the ring meters something other than attached
   * slots (the AI composer's token window: "Context: 12.4k / 16.4k tokens").
   * It becomes the accessible name; the caller's hover card shows it, so the
   * native title is dropped rather than doubled.
   */
  summary?: string;
}) {
  const slots = Math.max(1, capacity);
  const filled = Math.max(0, Math.min(slots, count));
  const fraction = filled / slots;
  const percent = Math.round(fraction * 100);
  return (
    <button
      type="button"
      data-testid="composer-context-ring"
      data-context-fill={percent}
      title={summary ? undefined : filled > 0 ? `${label} — ${filled} of ${slots} attached` : `${label} — empty`}
      aria-label={
        summary
          ? `${summary} — details`
          : filled > 0
            ? `${label}. ${filled} of ${slots} attached, ${percent}% full — open tools`
            : `${label} — empty, add tools`
      }
      // No `aria-value*`: those belong to a `meter` / `progressbar`, and this
      // is a BUTTON that opens the context panel. The quantity travels in the
      // accessible name instead, which is what a screen reader reads on focus.
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'ds-raw-button context-ring relative inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
        'transition-colors hover:bg-surface-hover',
        focusRing('control', 'accent'),
        pressed && 'bg-surface-sunken',
      )}
    >
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        className="block h-3.5 w-3.5"
        fill="none"
        strokeWidth="2"
      >
        {/* The track — always drawn, so an empty ring is still a ring. */}
        <circle
          cx="8"
          cy="8"
          r={RADIUS}
          className="text-border-emphasis"
          stroke="currentColor"
        />
        {/* The fill. Rotated -90° so it starts at 12 o'clock, and `round` caps
            keep a one-slot arc visible instead of a hairline tick. */}
        {filled > 0 ? (
          <circle
            cx="8"
            cy="8"
            r={RADIUS}
            className="text-text-muted transition-[stroke-dashoffset] duration-150"
            stroke="currentColor"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
            transform="rotate(-90 8 8)"
          />
        ) : null}
      </svg>
    </button>
  );
}
