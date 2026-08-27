/**
 * SSR first-paint stand-in for the landscape kiosk shell.
 *
 * Matches the settled collapsed face: icon rail + Catalog header. Visible
 * "Catalog" text so LCP can fire at FCP — not a fake product grid that then
 * swaps. Server-safe — no `'use client'`.
 */

import { cn } from '@/utils/_cn';
import {
  KIOSK_MODE_SPINE_COLLAPSED_W,
  KIOSK_MODE_SPINE_FACE,
  KIOSK_PANE_HEADER_BAND,
  KIOSK_PANE_HEADER_TITLE,
} from './kiosk-chrome';
import { KIOSK_POS_CANVAS, KIOSK_POS_SIDEBAR } from './kiosk-pos-surface';

export function KioskCatalogFirstPaint({ className }: { className?: string }) {
  return (
    <div
      className={cn('flex h-full w-full overflow-hidden bg-surface-canvas text-text-default', className)}
      aria-busy="true"
      aria-label="Kiosk catalog"
      data-testid="kiosk-catalog-first-paint"
    >
      <aside
        className={cn(KIOSK_MODE_SPINE_FACE, KIOSK_MODE_SPINE_COLLAPSED_W, 'shrink-0')}
        aria-hidden
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:flex-row">
        <aside
          className={cn(
            'flex min-h-0 flex-col border-border-soft',
            KIOSK_POS_CANVAS,
            KIOSK_POS_SIDEBAR,
          )}
        >
          <div className={KIOSK_PANE_HEADER_BAND}>
            <h2 className={KIOSK_PANE_HEADER_TITLE}>Catalog</h2>
          </div>
        </aside>
        <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col', KIOSK_POS_CANVAS)}>
          <div className={KIOSK_PANE_HEADER_BAND}>
            <h2 className={KIOSK_PANE_HEADER_TITLE}>All repairs</h2>
          </div>
        </div>
      </div>
    </div>
  );
}
