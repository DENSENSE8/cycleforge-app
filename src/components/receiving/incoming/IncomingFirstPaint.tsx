/**
 * SSR first-paint stand-in for the Incoming work surface.
 *
 * A neutral canvas only — no empty-state copy. Text that reads as "the table is
 * empty" blocks Playwright scroll specs and lies when rows hydrate a beat later.
 * Mobile empty copy lives on `MobileReceivingList` via {@link INCOMING_EMPTY_TITLE}.
 *
 * Server-safe — no `'use client'`.
 */

import { cn } from '@/utils/_cn';

/** Mobile feed empty copy — not painted on the desk first-paint stand-in. */
export const INCOMING_EMPTY_TITLE = 'No packages yet';
export const INCOMING_EMPTY_HINT =
  'Scan a tracking number on the desktop to drop one in here.';

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
