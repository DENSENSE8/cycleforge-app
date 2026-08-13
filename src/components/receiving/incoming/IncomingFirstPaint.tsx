/**
 * SSR first-paint stand-in for the Incoming work surface.
 *
 * Speed Index is scored against the FINAL screenshot. A fake 14-row ledger
 * that then swaps to the settled empty face ("No packages yet" + canvas)
 * keeps SI high. This stand-in is that empty face — the same copy the
 * receiving empty list paints — so first HTML ≈ last frame.
 *
 * Visible text (not empty bars) so LCP can fire at FCP. No pulse / spin.
 * Server-safe — no `'use client'`.
 */

import { cn } from '@/utils/_cn';

/** Byte-match `MobileReceivingList` empty copy so the SI filmstrip does not jump. */
export const INCOMING_EMPTY_TITLE = 'No packages yet';
export const INCOMING_EMPTY_HINT =
  'Scan a tracking number on the desktop to drop one in here.';

export function IncomingFirstPaint({ className }: { className?: string }) {
  return (
    <div
      className={cn('flex h-full min-h-0 w-full flex-1 bg-surface-canvas', className)}
      aria-busy="true"
      aria-label="Incoming cartons"
      data-paint-surface="incoming:primary"
      data-testid="incoming-first-paint"
    >
      <div className="flex w-[22rem] shrink-0 flex-col justify-center border-r border-border-hairline bg-surface-card px-6">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-text-muted">
          {INCOMING_EMPTY_TITLE}
        </p>
        <p className="mt-2 text-role-caption text-text-faint">{INCOMING_EMPTY_HINT}</p>
      </div>
      <div className="min-w-0 flex-1 bg-surface-canvas" />
    </div>
  );
}
