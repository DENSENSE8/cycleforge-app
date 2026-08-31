'use client';

/**
 * Idle center for `/shipping/scan-out` — empty scan-await.
 * Packed-at-dock stays on the Shipped / Packed desk; this station is gun-first.
 */

import { Barcode } from '@/components/Icons';

export function ScanOutIdleAwait() {
  return (
    <div
      className="flex h-full min-h-0 w-full flex-col items-center justify-center inset-empty bg-surface-canvas"
      data-testid="scan-out-idle-await"
    >
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-200">
          <Barcode className="h-6 w-6" aria-hidden />
        </div>
        <p className="text-role-title font-semibold text-text-primary">Scan a label to ship out</p>
        <p className="text-role-caption text-text-muted">
          Carrier tracking only. Recent confirms land in the left rail.
        </p>
      </div>
    </div>
  );
}
