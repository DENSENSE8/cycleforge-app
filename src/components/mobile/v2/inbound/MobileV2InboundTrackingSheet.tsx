'use client';

/**
 * Scan (or type) an inbound tracking number into the order — through the V2
 * scan root, `MobileV2ScanInput`. A decode lands the canonical number in the
 * draft's first empty tracking slot and closes the sheet.
 */

import { Check } from '@/components/Icons';
import { MobileV2ActionSheet } from '@/components/mobile/v2/MobileV2ActionSheet';
import { MobileV2ScanInput } from '@/components/mobile/v2/scan/MobileV2ScanInput';
import { extractCanonicalTracking } from '@/lib/tracking-format';

export function MobileV2InboundTrackingSheet({
  open,
  onScan,
  onClose,
}: {
  open: boolean;
  onScan: (trackingNumber: string) => void;
  onClose: () => void;
}) {
  return (
    <MobileV2ActionSheet
      open={open}
      onClose={onClose}
      title="Scan tracking"
      description="Scan the label barcode, or type the number and press Enter."
      verbs={[{ id: 'done', label: 'Done', icon: <Check />, primary: true }]}
      onVerb={onClose}
      dockLabel="Tracking actions"
      testId="m-inbound-tracking-sheet"
    >
      <div className="px-mode-page py-3">
        <MobileV2ScanInput
          compact
          autoFocus
          prominentCamera
          cameraSuspended={!open}
          placeholder="Tracking number"
          onDecode={(value) => {
            const number = extractCanonicalTracking(value.trim()) || value.trim();
            if (!number) return;
            onScan(number);
            onClose();
          }}
        />
      </div>
    </MobileV2ActionSheet>
  );
}
