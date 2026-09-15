/**
 * SSR first-paint stand-in for the landscape kiosk shell.
 *
 * Callers: `/kiosk` + `/kiosk/v2` loading + `KioskV2Runtime` bind wait.
 * Affected API: none.
 * Data schemas: none.
 * User: "Converting the left sidebar into just a top left drop down so repair
 * or sales or more and then an exit button so you can exit out of the kiosk
 * mode. The right sidebar should also be removed as well and everything placed
 * into the top header, the cart, the paperwork, the work, show, verify, etc."
 *
 * One trail row: command ghost, search glyph, All-products ghost, utilities.
 * Server-safe — no `'use client'`.
 */

import { cn } from '@/utils/_cn';
import { HEADER_ICON_CLUSTER, HEADER_ICON_WRAP } from '@/components/layout/header-shell';
import { KIOSK_PANE_HEADER_BAND } from './kiosk-chrome';
import { KIOSK_POS_CANVAS } from './kiosk-pos-surface';

export function KioskCatalogFirstPaint({ className }: { className?: string }) {
  return (
    <div
      className={cn('flex h-full w-full flex-col overflow-hidden bg-surface-canvas text-text-default', className)}
      aria-busy="true"
      aria-label="Kiosk catalog"
      data-testid="kiosk-catalog-first-paint"
    >
      <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden', KIOSK_POS_CANVAS)}>
        <div className={cn(KIOSK_PANE_HEADER_BAND, 'gap-2 pl-2 pr-2')} data-testid="kiosk-catalog-trail">
          <span className="flex h-9 shrink-0 items-center gap-1.5 text-sm font-medium text-text-default">
            Repair
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5 shrink-0 text-text-faint"
              aria-hidden
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
          {/* Search glyph square — the collapsed find-bar slot, second. */}
          <span className={HEADER_ICON_WRAP} aria-hidden />
          <span className="flex h-9 w-auto shrink-0 items-center gap-1.5 text-sm font-medium text-text-default">
            All products
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5 shrink-0 text-text-faint"
              aria-hidden
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </span>
          <div className={cn(HEADER_ICON_CLUSTER, 'ml-auto')} aria-hidden>
            <span className={HEADER_ICON_WRAP} />
            <span className={HEADER_ICON_WRAP} />
            <span className={HEADER_ICON_WRAP} />
            <span className={HEADER_ICON_WRAP} />
            <span className={HEADER_ICON_WRAP} />
          </div>
        </div>
      </div>
    </div>
  );
}
