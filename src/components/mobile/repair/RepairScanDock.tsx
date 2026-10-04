'use client';

/**
 * The repair-scan hub's bottom: the serial camera. An input surface (its stage
 * and collapsed Scan bar are its own face) floating over the record — no
 * ground strip behind it (owner 2026-10-03): air above, lifted off the edge.
 * Only the camera takes presses; the gutters let the rows beneath stay live.
 */

import type { ComponentProps } from 'react';
import { MobileCaptureWindow } from '@/components/mobile/station/MobileCaptureWindow';
import { ACTION_DOCK_LIFT, ACTION_DOCK_TOP_GAP } from '@/design-system/tokens/dock-clearance';

export function RepairScanDock(props: ComponentProps<typeof MobileCaptureWindow>) {
  return (
    <div className={`pointer-events-none sticky bottom-0 z-sticky mt-auto px-mode-page ${ACTION_DOCK_TOP_GAP} ${ACTION_DOCK_LIFT} [&>*]:pointer-events-auto`}>
      <MobileCaptureWindow {...props} />
    </div>
  );
}
