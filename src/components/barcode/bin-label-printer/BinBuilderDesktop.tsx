import { ChevronLeft, Settings } from '@/components/Icons';
import { WorkspaceCard } from '@/design-system/components';
import { Button, IconButton } from '@/design-system/primitives';
import { LABEL_BUILDER } from '../label-builder-layout';
import { STEPS, NumericStep, ConfigSheet, GiantPreviewPanel } from './index';
import { RoomPicker } from './RoomPicker';
import { StepPills } from './StepPills';
import { MissingLetterBanner } from './BinBuilderMobile';
import type { BinLabelPrinterController } from './useBinLabelPrinter';

/**
 * Wide main-pane builder (`hidden lg:block`).
 *
 * The zone step holds the ROOM PICKER — the same {@link RoomPicker} the narrow
 * builder has always used. It used to hold a caption pointing at a rooms list
 * in the left rail; the Inventory rail was removed on 2026-09-04 and a step
 * that tells the operator to look at a column that is not there is worse than
 * no step. One picker, both widths.
 */
export function BinBuilderDesktop({ c }: { c: BinLabelPrinterController }) {
  return (
    <div className={`flex flex-col ${LABEL_BUILDER.stackGap} ${LABEL_BUILDER.contentShell}`}>
      <header className="flex items-start justify-between gap-3">
        <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight text-text-default">
          {c.selectedRoom ?? 'Pick a room to start'}
        </h1>
        <div className="flex shrink-0 items-center gap-1.5">
          {(c.selectedRoom || c.aisle != null) && (
            <Button
              variant="secondary"
              size="sm"
              onClick={c.resetAll}
              icon={<ChevronLeft className="h-3.5 w-3.5" />}
            >
              Reset
            </Button>
          )}
          <IconButton
            onClick={() => c.setConfigOpen(true)}
            ariaLabel="Configure label printer"
            icon={<Settings className="h-4 w-4" />}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border-soft bg-surface-card hover:bg-surface-hover"
          />
        </div>
      </header>

      <StepPills
        activeStep={c.activeStep}
        zoneLetter={c.zoneLetter}
        roomName={c.selectedRoom}
        aisle={c.aisle}
        bay={c.bay}
        level={c.level}
        position={c.position}
        onPillClick={c.handlePillClick}
      />

      {c.missingLetter && <MissingLetterBanner />}

      {c.activeStep === 'zone' ? (
        <WorkspaceCard label="Zone">
          <RoomPicker
            rooms={c.allRoomNames}
            zoneMap={c.zoneMap}
            loading={c.loading}
            selectedRoom={c.selectedRoom}
            onSelect={c.pickRoom}
          />
        </WorkspaceCard>
      ) : (
        <WorkspaceCard label={STEPS.find((s) => s.id === c.activeStep)?.label} tone="blue">
          {c.activeStep === 'aisle' && (
            <NumericStep key="aisle" title="Pick an aisle" prefix="" count={c.config.maxAisles} selected={c.aisle} onPick={c.pickAisle} customLabel="Custom aisle #" />
          )}
          {c.activeStep === 'bay' && (
            <NumericStep
              key="bay"
              title="Pick a bay"
              prefix=""
              count={c.config.maxBays}
              selected={c.bay}
              onPick={c.pickBay}
              hint="Parallel rack setup — odd numbers on the left, even on the right."
              customLabel="Custom bay #"
            />
          )}
          {c.activeStep === 'level' && (
            <NumericStep key="level" title="Pick a level" prefix="" count={c.config.maxLevels} selected={c.level} onPick={c.pickLevel} customLabel="Custom level #" unpadded />
          )}
          {c.activeStep === 'position' && (
            <NumericStep key="position" title="Pick a position" prefix="" count={c.config.maxPositions} selected={c.position} onPick={c.pickPosition} customLabel="Custom position #" />
          )}
        </WorkspaceCard>
      )}

      <GiantPreviewPanel
        zoneLetter={c.zoneLetter}
        aisle={c.aisle}
        bay={c.bay}
        level={c.level}
        position={c.position}
        gln={c.gln}
      />

      <ConfigSheet open={c.configOpen} onClose={() => c.setConfigOpen(false)} config={c.config} onSave={c.handleConfigSave} />
    </div>
  );
}
