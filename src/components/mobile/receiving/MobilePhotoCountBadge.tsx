'use client';

import Link from 'next/link';
import { Camera } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

interface MobilePhotoCountBadgeProps {
  count: number;
  /** When set and count &gt; 0, the badge links to the mobile gallery. */
  href?: string;
  onClick?: () => void;
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * Compact camera + xN count used on mobile receiving rows and the carton sheet.
 * Faint ink at x0 (no door to an empty gallery — the badge links only when
 * there is something to look at); muted ink from x1. One size face per rung
 * (`sm` default, `md` for sheet headers), tabular figures so x9→x10 does not
 * jitter the row. Render contracts in MobilePhotoCountBadge.test.tsx.
 */
export function MobilePhotoCountBadge({
  count,
  href,
  onClick,
  className,
  size = 'sm',
}: MobilePhotoCountBadgeProps) {
  const safeCount = Math.max(0, count);
  const hasPhotos = safeCount > 0;
  const iconSize = size === 'md' ? 'h-4 w-4' : 'h-3 w-3';
  const textSize = size === 'md' ? 'text-sm' : 'text-role-caption';

  const inner = (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 font-semibold tabular-nums',
        textSize,
        hasPhotos ? 'text-text-muted' : 'text-text-faint',
        className,
      )}
      aria-label={`Photos ${safeCount}`}
    >
      <Camera className={cn(iconSize, hasPhotos ? 'text-text-muted' : 'text-text-faint')} />
      x{safeCount}
    </span>
  );

  if (href && hasPhotos) {
    return (
      <Link
        href={href}
        prefetch={false}
        onClick={onClick}
        className="inline-flex rounded-none px-1 py-0.5 active:bg-surface-sunken"
      >
        {inner}
      </Link>
    );
  }

  if (onClick && hasPhotos) {
    return (
      <IconButton
        type="button"
        onClick={onClick}
        ariaLabel={`Photos ${safeCount}`}
        icon={inner}
        className="inline-flex rounded-none px-1 py-0.5 active:bg-surface-sunken"
      />
    );
  }

  return inner;
}
