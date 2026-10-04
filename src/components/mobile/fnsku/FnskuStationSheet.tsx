'use client';

import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { StaffPrintStationPicker } from '@/components/ui/StaffPrintStationPicker';
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
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      {/* The sheet portals out of the hub's ModeRegion; re-declare triage. */}
      <ModeRegion mode="triage" asChild>
        <SheetContent side="bottom" aria-describedby={undefined}>
          <SheetHeader className="shrink-0 border-b border-mode-rule px-mode-page py-3 pr-12">
            <SheetTitle>Printer</SheetTitle>
          </SheetHeader>
          <SheetBody>
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
          </SheetBody>
        </SheetContent>
      </ModeRegion>
    </Sheet>
  );
}
