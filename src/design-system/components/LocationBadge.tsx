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
}

const LOCATION_BADGE_BASE =
  'inline-flex min-w-0 max-w-full shrink-0 items-center gap-1 rounded-mode-pill border px-2 py-0.5 font-mono text-role-eyebrow font-semibold leading-4';

const LOCATION_BADGE_TONE: Record<LocationBadgeTone, string> = {
  known: 'border-border-default bg-surface-sunken text-text-default',
  missing: 'border-border-warning bg-surface-warning text-text-warning',
};

const LOCATION_BADGE_PRESSABLE =
  'touch-manipulation transition-transform duration-mode-press active:translate-y-px motion-reduce:transform-none';

export function LocationBadge({ text, onPress, className }: LocationBadgeProps) {
  const code = text?.trim() || null;
  const tone: LocationBadgeTone = code ? 'known' : 'missing';
  const Glyph = code ? MapPin : AlertTriangle;
  const face = (
    <>
      <Glyph className="h-3 w-3 shrink-0" />
      <span className="min-w-0 truncate">{code ?? 'No bin'}</span>
    </>
  );
  const classes = cn(LOCATION_BADGE_BASE, LOCATION_BADGE_TONE[tone], className);

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
