'use client';

/**
 * LocationBadge — the one face for "which bin is this on": the bin code in
 * mono on a quiet pill, or an honest `No bin` warning pill when the shelf is
 * unknown. The corner follows the region's mode (pill in triage, square on the
 * operation surface). With `onPress` it becomes the door to set the bin.
 */

import { AlertTriangle, MapPin } from '@/components/Icons';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';

export type LocationBadgeTone = 'known' | 'missing';

export interface LocationBadgeProps {
  /** Resolved bin code; null / blank paints the `No bin` warning. */
  text: string | null;
  /** Makes the badge a button (e.g. open the set-bin sheet). */
  onPress?: () => void;
  className?: string;
  /**
   * `truncate` (default): the code ellipsizes in a tight cell. `full`: the whole path, never cut — for
   * a host that scrolls it sideways. `band`: a full-width square strip that WRAPS the whole path — the
   * phone pick list's boxy row (owner 2026-10-08), where nothing may run off the row.
   */
  fit?: 'truncate' | 'full' | 'band';
}

const LOCATION_BADGE_BASE =
  'inline-flex min-w-0 max-w-full shrink-0 items-center gap-1 rounded-mode-pill border px-2 py-0.5 font-mono text-role-eyebrow font-semibold leading-4';

const LOCATION_BADGE_TONE: Record<LocationBadgeTone, string> = {
  known: 'border-border-default bg-surface-sunken text-text-default',
  missing: 'border-border-warning bg-surface-warning text-text-warning',
};

const LOCATION_BADGE_PRESSABLE =
  'touch-manipulation transition-transform duration-mode-press active:translate-y-px motion-reduce:transform-none';

export function LocationBadge({ text, onPress, className, fit = 'truncate' }: LocationBadgeProps) {
  const code = text?.trim() || null;
  const tone: LocationBadgeTone = code ? 'known' : 'missing';
  const Glyph = code ? MapPin : AlertTriangle;
  const face = (
    <>
      {/* One text line tall, so the pin centres on the first line however the path wraps (or doesn't). */}
      <span aria-hidden className="flex h-[1lh] shrink-0 items-center">
        <Glyph className="h-3 w-3" />
      </span>
      <span className={fit === 'truncate' ? 'min-w-0 truncate' : fit === 'band' ? 'min-w-0 whitespace-normal break-words text-left' : 'whitespace-nowrap'}>
        {code ?? 'No bin'}
      </span>
    </>
  );
  const classes = cn(
    LOCATION_BADGE_BASE,
    fit === 'full' && 'max-w-none',
    fit === 'band' && 'flex w-full max-w-none items-start rounded-none border-x-0 border-t-0 px-2 py-1 text-role-caption',
    LOCATION_BADGE_TONE[tone],
    className,
  );

  if (!onPress) {
    return (
      <span data-testid="location-badge" data-tone={tone} className={classes}>
        {face}
      </span>
    );
  }
  return (
    <button
      type="button"
      data-testid="location-badge"
      data-tone={tone}
      aria-label={code ? `Bin ${code} — change bin` : 'No bin — set bin'}
      className={cn(classes, LOCATION_BADGE_PRESSABLE, focusRing('control', 'accent'))}
      onClick={(event) => {
        event.stopPropagation();
        onPress();
      }}
    >
      {face}
    </button>
  );
}
