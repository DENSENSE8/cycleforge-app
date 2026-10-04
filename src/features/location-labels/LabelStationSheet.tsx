'use client';

import { Check, Monitor, Printer } from '@/components/Icons';
import { DetailNav } from '@/components/mobile/detail/DetailParts';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import type { PrintStationEntry } from '@/hooks/usePrintStations';

/** Why a station cannot take a label right now; null when it can. */
export function labelStationBlocked(station: PrintStationEntry): string | null {
  if (station.thisComputer) return null;
  if (!station.live) return 'Offline';
  if (!station.label.ready) return 'No label printer set up';
  return null;
}

export function labelStationName(station: PrintStationEntry): string {
  return station.thisComputer ? 'This device' : station.stationName;
}

/**
 * Which computer prints the labels: this device or any station of the org.
 * The pick is remembered per staffer on this device (`usePrintStations().pick`).
 */
export function LabelStationSheet({
  open,
  onClose,
  stations,
  chosenId,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  stations: readonly PrintStationEntry[];
  chosenId: string | null;
  onPick: (stationId: string) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent side="bottom" aria-describedby={undefined} data-testid="label-station-sheet">
        <SheetHeader className="shrink-0 border-b border-mode-rule px-mode-page py-3 pr-12">
          <SheetTitle>Printer</SheetTitle>
        </SheetHeader>
        <SheetBody className="px-0 pt-0">
          <DetailNav
            label="Print stations"
            rows={stations.map((station) => ({
              id: station.stationId,
              title: labelStationName(station),
              icon: station.stationId === chosenId ? <Check /> : station.thisComputer ? <Monitor /> : <Printer />,
              meta: labelStationBlocked(station) ?? (station.label.printer || 'Ready'),
              onSelect: () => {
                onPick(station.stationId);
                onClose();
              },
            }))}
          />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
