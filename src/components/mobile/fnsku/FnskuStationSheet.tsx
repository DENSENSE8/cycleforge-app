'use client';

import { BottomSheet } from '@/components/ui/BottomSheet';
import { StaffPrintStationPicker } from '@/components/mobile/print/StaffPrintStationPicker';
import type { StaffPrintStation } from '@/lib/print/staff-print-bridge';
import { ModeRegion } from '@/design-system/providers/ModeRegion';

/**
 * Picker behind the FNSKU hub's Printer door (and behind Reprint when no
 * printer can take the label yet): which computer signed in as this staffer
 * prints it. Tapping one picks it and closes the sheet.
 */
export function FnskuStationSheet({
  open,
  onClose,
  stations,
  target,
  now,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  stations: readonly StaffPrintStation[];
  target: StaffPrintStation | null;
  now: number;
  onPick: (stationId: string) => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} forceVariant="sheet" title="Printer">
      {/* BottomSheet portals out of the hub's ModeRegion; re-declare triage. */}
      <ModeRegion mode="triage" className="pb-2">
        <StaffPrintStationPicker
          stations={stations}
          target={target}
          now={now}
          role="label"
          onPick={(id) => {
            if (!id) return;
            onPick(id);
            onClose();
          }}
        />
      </ModeRegion>
    </BottomSheet>
  );
}
