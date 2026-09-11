import { WorkspaceCard } from '@/design-system/components';
import { LABEL_BUILDER } from '../label-builder-layout';
import { NumericStep, GiantPreviewPanel } from './index';
import { StepPills } from './StepPills';
import { RoomPicker } from './RoomPicker';
import { MissingLetterBanner } from './BinBuilderMobile';
import {
  LabelPrinterWorkHeader,
  type LabelPrintWorkMode,
} from '../LabelPrinterWorkHeader';
import type { BinLabelPrinterController } from './useBinLabelPrinter';

/**
 * Wide main-pane builder (`hidden lg:block`): zone step uses RoomPicker inline.
 * Callers: BinLabelPrinter. User: remove left search/room list — pick room here.
 */
export function BinBuilderDesktop({
  c,
  showGiantPreview = true,
  printMode,
  onPrintModeChange,
}: {
  c: BinLabelPrinterController;
  /** When false, parent mounts inline LabelPrintRunPanel instead. */
  showGiantPreview?: boolean;
  printMode: LabelPrintWorkMode;
  onPrintModeChange: (mode: LabelPrintWorkMode) => void;
}) {
  return (
    <div className={`${LABEL_BUILDER.stackGap} ${LABEL_BUILDER.contentShell}`}>
      <LabelPrinterWorkHeader
        title={c.selectedRoom ?? 'Pick a room to start'}
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
        position={c.position}
        onPillClick={c.handlePillClick}
      />

      {c.missingLetter && <MissingLetterBanner />}

      <WorkspaceCard
        tone={c.activeStep === 'zone' ? undefined : 'blue'}
        bodyDensity="nested"
        label={c.activeStep === 'zone' ? 'Zone' : undefined}
      >
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
              hint="Parallel bay setup — odd numbers on the left, even on the right."
              customLabel="Custom bay #"
            />
          )}
          {c.activeStep === 'level' && (
            <NumericStep key="level" title="Pick a level" prefix="" count={c.config.maxLevels} selected={c.level} onPick={c.pickLevel} customLabel="Custom level #" unpadded />
          )}
          {c.activeStep === 'position' && (
            <NumericStep
              key="position"
              title="Position (optional)"
              prefix=""
              count={c.config.maxPositions}
              selected={c.position}
              onPick={c.pickPosition}
              allowClear
              onClear={c.clearPosition}
              hint="Skip or tap the selected tile again to leave position off the sticker."
              customLabel="Custom position #"
            />
          )}
      </WorkspaceCard>

      {showGiantPreview ? (
        <GiantPreviewPanel
          zoneLetter={c.zoneLetter}
          aisle={c.aisle}
          bay={c.bay}
          level={c.level}
          position={c.position}
          gln={c.gln}
          roomName={c.selectedRoom}
        />
      ) : null}
    </div>
  );
}
