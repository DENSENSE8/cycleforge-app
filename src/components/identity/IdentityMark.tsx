'use client';

/** The one identity mark — org workspace and staff both wear it. */

import { useEffect, useState } from 'react';
import { cn } from '@/utils/_cn';
import { blackOrWhiteInk } from '@/lib/color-contrast';

export type IdentityMarkSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

/** Box + type role per size. */
const SIZE_CLASS: Record<IdentityMarkSize, string> = {
  xs: 'h-5 w-5 text-role-micro',
  sm: 'h-7 w-7 text-role-micro',
  md: 'h-9 w-9 text-role-caption',
  lg: 'h-11 w-11 text-sm',
  xl: 'h-16 w-16 text-lg',
  '2xl': 'h-20 w-20 text-2xl',
};

interface IdentityMarkProps {
  /** Rendered when no photo is available (or the photo fails to load). */
  initials: string;
  /** Photo URL. Null/undefined ⇒ initials. */
  src?: string | null;
  /**
   * Fill behind the initials. Staff pass their assigned colour; the org mark
   * passes nothing and inherits the inverse-surface token.
   */
  colorHex?: string | null;
  size?: IdentityMarkSize;
  /** Ring hairline around the mark. On by default (matches the staff footer). */
  ring?: boolean;
  /**
   * Identity-COLOUR ring, painted only while the PHOTO shows. On initials the
   * colour is already the fill, so this keeps the assigned colour scannable
   * after a staffer uploads a face — without doubling it when they have not.
   */
  ringHex?: string | null;
  /**
   * `round` (default) — the spine / nav mark: a circle with a hairline ring.
   * `record` — the mark on a record row (To-ship pick / pack, agenda owner):
   * no hairline ring, and the corner + initials voice follow the region's
   * mode — radius 0 + mono caps on the industrial Floor, the control radius +
   * sans in triage. There is no forced square: the mode owns the corner.
   */
  face?: 'round' | 'record';
  className?: string;
  /** Accessible name. Omit ⇒ `aria-hidden` (the row already names the entity). */
  alt?: string;
}

export function IdentityMark({
  initials,
  src,
  colorHex,
  size = 'sm',
  ring = true,
  ringHex,
  face = 'round',
  className,
  alt,
}: IdentityMarkProps) {
  const [failed, setFailed] = useState(false);

  // A new src is a new attempt — otherwise one dead photo would permanently
  // pin this mark to initials for every later staffer rendered in its slot.
  useEffect(() => {
    setFailed(false);
  }, [src]);

  const showPhoto = !!src && !failed;
  const a11y = alt ? { role: 'img' as const, 'aria-label': alt } : { 'aria-hidden': true };
  // Preserve the saved staff colour; only initials switch to black or white.
  const initialsInk = !showPhoto && colorHex ? blackOrWhiteInk(colorHex) : null;
  const record = face === 'record';

  return (
    <span
      {...a11y}
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden text-white',
        record
          ? 'rounded-mode-control font-[family-name:var(--mode-label-font,var(--ds-font-mono))] font-bold tracking-[0.04em] [text-transform:var(--mode-label-case,uppercase)]'
          : 'rounded-full font-semibold',
        SIZE_CLASS[size],
        ring && !record && 'ring-1 ring-border-soft',
        !showPhoto && !colorHex && 'bg-surface-inverse',
        className,
      )}
      style={{
        ...(!showPhoto && colorHex ? { backgroundColor: colorHex } : null),
        ...(initialsInk ? { color: initialsInk } : null),
        // box-shadow, not border: it paints outside the box, so the photo
        // keeps its full diameter and nothing reflows between the two states.
        ...(showPhoto && ringHex ? { boxShadow: `0 0 0 2px ${ringHex}` } : null),
      }}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- auth-gated photo
        // content route; next/image would need a loader + remote pattern for a
        // 28px mark that is already served immutable+private.
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
          draggable={false}
        />
      ) : (
        initials
      )}
    </span>
  );
}
