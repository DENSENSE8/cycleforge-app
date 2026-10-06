'use client';

import { ChevronDown, Printer } from '@/components/Icons';
import { AnimatedStat } from '@/design-system/components/AnimatedStat';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/design-system/primitives';
import type { PrintStationEntry } from '@/hooks/usePrintStations';
import { FIELD_LABEL_CLASS, PrepackGroup } from './PrepackSections';
import type { PrepackForm } from './usePrepackForm';

/** Why a print station cannot take this run's labels, or null when it can. */
export function stationBlocked(station: PrintStationEntry): string | null {
  if (station.thisComputer) return null;
  if (station.paused) return 'Paused';
  if (!station.live) return 'Offline';
  if (!station.label.ready) return 'No label printer';
  return null;
}

/** The print station, then one primary verb whose label carries the live count ("Printing 1 of N" while jobs confirm). */
export function PrepackPrintSection({
  form,
  stations,
  chosenStation,
  printBlocked,
  onChooseStation,
  onPrint,
}: {
  form: PrepackForm;
  stations: PrintStationEntry[];
  chosenStation: PrintStationEntry | null;
  printBlocked: string | null;
  onChooseStation: (id: string) => void;
  onPrint: () => void;
}) {
  const { state } = form;
  const total = state.saved?.length ?? state.packages.length;
  const remaining = total - state.printedCount;
  const label = state.printing ? (
    <span className="inline-flex items-center gap-1">Printing <AnimatedStat value={Math.min(total, state.printedCount + 1)} profile="scanQuantity" /> of {total}</span>
  ) : (
    <span className="inline-flex items-center gap-1">
      Print {state.saved ? 'remaining ' : ''}<AnimatedStat value={remaining} /> {remaining === 1 ? 'label' : 'labels'}
    </span>
  );
  return (
    <PrepackGroup title="Print" testId="prepack-print-section">
      <p className={FIELD_LABEL_CLASS}>Print station</p>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="md" icon={<Printer />} iconRight={<ChevronDown />} data-testid="prepack-print-station">
            {chosenStation ? (chosenStation.thisComputer ? 'This device' : chosenStation.stationName) : 'Choose a print station'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          {stations.map((station) => {
            const blocked = stationBlocked(station);
            return (
              <DropdownMenuItem key={station.stationId} disabled={Boolean(blocked)} onSelect={() => onChooseStation(station.stationId)}>
                {station.thisComputer ? 'This device' : station.stationName}
                {blocked ? ` · ${blocked}` : ''}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {printBlocked ? (
        <p className="break-words text-role-caption font-semibold text-text-danger">{printBlocked} — choose another print station, or This device.</p>
      ) : null}
      <Button
        variant="primary"
        size="xl"
        radius="mode"
        depth
        icon={<Printer />}
        className="w-full"
        disabled={!form.complete || Boolean(printBlocked) || !chosenStation || state.printing}
        aria-busy={state.printing}
        onClick={onPrint}
        data-testid="prepack-print"
      >
        {label}
      </Button>
      {!form.complete && !state.printing ? (
        <p className="text-role-caption text-text-muted">Choose a condition for every package to print.</p>
      ) : null}
    </PrepackGroup>
  );
}
