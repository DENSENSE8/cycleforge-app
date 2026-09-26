'use client';

/** The repair-scan hub's bottom: */

import type { ComponentProps } from 'react';
import { MobileCaptureWindow } from '@/components/mobile/station/MobileCaptureWindow';

export function RepairScanDock(props: ComponentProps<typeof MobileCaptureWindow>) {
  return (
    <div className="sticky bottom-0 z-sticky bg-surface-card">
      <MobileCaptureWindow {...props} />
    </div>
  );
}
