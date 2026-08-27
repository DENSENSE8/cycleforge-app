'use client';

import { cornerClass } from '@/design-system/tokens/radius';
import { cn } from '@/utils/_cn';

/** Pulse-skeleton card placeholder — flush ops chrome (no soft pill cards). */
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div
      className={cn(
        'animate-pulse border border-border-hairline bg-surface-sunken',
        cornerClass('flush'),
        className,
      )}
      aria-hidden="true"
    >
      <div className="p-4">
        <div className={cn('h-4 w-3/4 bg-surface-strong', cornerClass('flush'))} />
        <div className={cn('mt-2 h-2.5 w-1/2 bg-surface-strong/70', cornerClass('flush'))} />
      </div>
    </div>
  );
}

/** Render N skeleton cards for a grid placeholder. */
export function SkeletonCardGrid({ count = 4, className = '' }: { count?: number; className?: string }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} className={className} />
      ))}
    </>
  );
}
