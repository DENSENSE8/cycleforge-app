'use client';

/**
 * The repair-scan hub's bottom: the house lens (`MobileCaptureWindow`) and
 * nothing else — no Undo · Type · Scan verbs, no typed-serial bar (operator
 * 2026-09-25). The lens owns the camera, the collapsed "Scan a serial" bar
 * after Done, and the keyed fallback behind its leading control; a typed
 * serial and a read one both arrive through `onDecode`. Undo lives on the
 * read notice (`RepairScanReadNotice`).
 *
 * All this adds is the pin: the hub is a document-scrolling column, so the
 * lens rides `sticky bottom-0` at its end the way `DetailDock` pins itself.
 *
 * Callers: `RepairScanCompanion` (`/m/repair-scan` dock slot).
 */

import type { ComponentProps } from 'react';
import { MobileCaptureWindow } from '@/components/mobile/station/MobileCaptureWindow';

export function RepairScanDock(props: ComponentProps<typeof MobileCaptureWindow>) {
  return (
    <div className="sticky bottom-0 z-sticky bg-surface-card">
      <MobileCaptureWindow {...props} />
    </div>
  );
}
