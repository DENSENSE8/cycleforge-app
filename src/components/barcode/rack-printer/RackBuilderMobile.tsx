import { Button } from '@/design-system/primitives';
import { WorkspaceCard } from '@/design-system/components';
import { STEPS } from './rack-printer-config';
import { StepPills } from './StepPills';
import { ZoneLetterTile } from './ZoneLetterTile';
import { RoomPicker } from './RoomPicker';
import { NumericStep } from '@/components/barcode/bin-label-printer/NumericStep';
import {
  LabelPrinterWorkHeader,
  type LabelPrintWorkMode,
} from '../LabelPrinterWorkHeader';
import type { RackLabelPrinterController } from './useRackLabelPrinter';
import type { RackPrinterVariant } from './rack-printer-types';

/** Narrow-column builder (mobile / `lg:hidden`): */
export function RackBuilderMobile({
  c,
  variant,
  printMode,
  onPrintModeChange,
}: {
  c: RackLabelPrinterController;
  variant: RackPrinterVariant;
  printMode: LabelPrintWorkMode;
  onPrintModeChange: (mode: LabelPrintWorkMode) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <LabelPrinterWorkHeader
        title={variant === 'sidebar' ? 'Build a bay label' : 'Bay Label Printer'}
        subtitle={
          variant === 'main'
            ? 'Pick a room, then drill down to the bay level. Prints one large QR-only label per bay — no position needed.'
            : undefined
        }
        titleClassName={
          variant === 'sidebar'
            ? 'text-base font-semibold tracking-tight'
            : 'text-2xl font-semibold tracking-tight'
        }
        showReset={!!(c.selectedRoom || c.aisle != null)}
        onReset={c.resetAll}
        mode={printMode}
        onModeChange={onPrintModeChange}
      />

      <StepPills
        activeStep={c.activeStep}
        zoneLetter={c.zoneLetter}
        roomName={c.selectedRoom}
        aisle={c.aisle}
        bay={c.bay}
        level={c.level}
        onPillClick={c.handlePillClick}
      />

      {c.selectedRoom && (
        <WorkspaceCard tone="blue" label="Selected room">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <ZoneLetterTile letter={c.zoneLetter} />
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-text-default">{c.selectedRoom}</p>
                <p className="mt-0.5 text-role-caption text-text-soft">
                  {c.zoneLetter ? `Zone ${c.zoneLetter}` : 'No zone letter yet — set one in the Rooms tab.'}
                </p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => c.setOverrideStep('zone')} className="shrink-0">
              Change
            </Button>
          </div>
        </WorkspaceCard>
      )}

      {c.missingLetter && <MissingLetterBanner />}

      <WorkspaceCard label={STEPS.find((s) => s.id === c.activeStep)?.label} tone={c.activeStep === 'zone' ? undefined : 'blue'}>
        {c.activeStep === 'zone' && (
          <RoomPicker
            rooms={c.allRoomNames}
            zoneMap={c.zoneMap}
            loading={c.loading}
            selectedRoom={c.selectedRoom}
            onSelect={c.pickRoom}
          />
        )}
        {c.activeStep === 'aisle' && (
          <NumericStep key="aisle" title="Pick an aisle" count={c.config.maxAisles} selected={c.aisle} onPick={c.pickAisle} customLabel="Custom aisle #" />
        )}
        {c.activeStep === 'bay' && (
          <NumericStep
            key="bay"
            title="Pick a bay"
            count={c.config.maxBays}
            selected={c.bay}
            onPick={c.pickBay}
            hint="Parallel bay setup — odd numbers on the left, even on the right."
            customLabel="Custom bay #"
          />
        )}
        {c.activeStep === 'level' && (
          <NumericStep key="level" title="Pick a level" count={c.config.maxLevels} selected={c.level} onPick={c.pickLevel} customLabel="Custom level #" unpadded />
        )}
      </WorkspaceCard>
    </div>
  );
}

/** Amber warning shown when the selected room has no zone letter assigned. */
export function MissingLetterBanner() {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-role-caption text-amber-800">
      <p className="font-semibold">No zone letter assigned to this room.</p>
      <p className="mt-0.5 text-amber-700">
        Open the <span className="font-semibold">Rooms</span> tab, tap this room, and pick a letter
        (A–Z). The letter prints on every label and inside the QR.
      </p>
    </div>
  );
}
