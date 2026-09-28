/** SSR first-paint stand-in for the Incoming work surface. */

import { cn } from '@/utils/_cn';

export function IncomingFirstPaint({ className }: { className?: string }) {
  return (
    <div
      className={cn('h-full min-h-0 w-full flex-1 bg-surface-canvas', className)}
      aria-busy="true"
      aria-label="Incoming cartons"
      data-paint-surface="incoming:primary"
      data-testid="incoming-first-paint"
    />
  );
}
