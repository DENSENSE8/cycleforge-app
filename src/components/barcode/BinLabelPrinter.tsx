'use client';

/** Location (bin) Label Printer. */

import { useCallback, useMemo, useState } from 'react';
import { Printer } from '@/components/Icons';
import { StickyActionBar } from '@/design-system/components';
import { LABEL_BUILDER } from './label-builder-layout';
import { LabelRoomSidebar } from './LabelRoomSidebar';
import { type LabelPrinterVariant } from './bin-label-printer';
import { useBinLabelPrinter } from './bin-label-printer/useBinLabelPrinter';
import { BinBuilderMobile } from './bin-label-printer/BinBuilderMobile';
import { BinBuilderDesktop } from './bin-label-printer/BinBuilderDesktop';
import { GiantPreviewPanel } from './bin-label-printer/GiantPreviewPanel';
import {
  LabelPrintRunPanel,
  type LabelPrintRunFreeze,
} from '@/components/labels/LabelPrintRunPanel';
import type { LabelPrintWorkMode } from './LabelPrinterWorkHeader';
import { seedPrintRunVary } from '@/lib/locations/expand-print-run';
import type { ExpandedPrintRunRow } from '@/lib/locations/expand-print-run';

export type { LabelPrinterVariant } from './bin-label-printer';

interface BinLabelPrinterProps {
  variant?: LabelPrinterVariant;
}

export function BinLabelPrinter({ variant = 'main' }: BinLabelPrinterProps) {
  const c = useBinLabelPrinter();
  const [printMode, setPrintMode] = useState<LabelPrintWorkMode>('single');
  const [runSelected, setRunSelected] = useState<ExpandedPrintRunRow[]>([]);

  const canOpenRun =
    !!c.selectedRoom &&
    !!c.zoneLetter &&
    c.aisle != null &&
    !c.missingLetter;

  const freeze: LabelPrintRunFreeze | null = useMemo(() => {
    if (!c.selectedRoom || !c.zoneLetter || c.aisle == null) return null;
    return {
      roomName: c.selectedRoom,
      zoneLetter: c.zoneLetter,
      aisle: c.aisle,
      bay: c.bay,
      level: c.level,
      position: c.position,
    };
  }, [c.selectedRoom, c.zoneLetter, c.aisle, c.bay, c.level, c.position]);

  const seedVary = seedPrintRunVary({
    aisle: c.aisle,
    bay: c.bay,
    level: c.level,
  });

  const seedThrough = useMemo(() => {
    if (seedVary === 'position') return c.config.maxPositions;
    if (seedVary === 'level') return c.config.maxLevels;
    return c.config.maxBays;
  }, [seedVary, c.config.maxPositions, c.config.maxLevels, c.config.maxBays]);

  const handleSelectionChange = useCallback((rows: ExpandedPrintRunRow[]) => {
    setRunSelected(rows);
  }, []);

  const handlePrintRun = useCallback(async () => {
    if (runSelected.length === 0) return;
    await c.printRun(runSelected.map((r) => r.segments));
  }, [c, runSelected]);

  const runCount = runSelected.length;
  const bulkActive = printMode === 'bulk';
  const printFromRun = bulkActive && canOpenRun && runCount > 0;

  if (variant === 'sidebar') {
    return (
      <LabelRoomSidebar
        rooms={c.allRoomNames}
        zoneMap={c.zoneMap}
        loading={c.loading}
        selectedRoom={c.selectedRoom}
        zoneLetter={c.zoneLetter}
        onSelect={c.pickRoom}
        emptySubtitle="Then build the bin code on the right."
      />
    );
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${LABEL_BUILDER.stackGap}`}>
      <div className={`lg:hidden ${LABEL_BUILDER.contentShell}`}>
        <BinBuilderMobile
          c={c}
          variant={variant}
          printMode={printMode}
          onPrintModeChange={setPrintMode}
        />
      </div>

      {!bulkActive ? (
        <div className={`lg:hidden ${LABEL_BUILDER.contentShell}`}>
          <GiantPreviewPanel
            zoneLetter={c.zoneLetter}
            aisle={c.aisle}
            bay={c.bay}
            level={c.level}
            position={c.position}
            gln={c.gln}
            roomName={c.selectedRoom}
          />
        </div>
      ) : null}

      <div className="hidden lg:block">
        <BinBuilderDesktop
          c={c}
          showGiantPreview={!bulkActive}
          printMode={printMode}
          onPrintModeChange={setPrintMode}
        />
      </div>

      {bulkActive && canOpenRun && freeze ? (
        <div className={LABEL_BUILDER.contentShell}>
          <LabelPrintRunPanel
            freeze={freeze}
            seedVary={seedVary}
            seedThrough={seedThrough}
            seedMaxBays={c.config.maxBays}
            seedOddLevels={c.config.maxLevels}
            seedEvenLevels={c.config.maxLevels}
            gln={c.gln}
            showPartsPreset
            printing={c.isPrinting}
            onSelectionChange={handleSelectionChange}
          />
        </div>
      ) : null}

      <StickyActionBar
        className={`mt-auto ${LABEL_BUILDER.actionBleed}`}
        maxWidth={LABEL_BUILDER.contentMax}
        density="compact"
        actionRowClassName="flex-nowrap"
        primary={{
          label: c.isPrinting
            ? 'Printing…'
            : c.missingLetter
              ? 'Assign a zone letter first'
              : printFromRun
                ? `Print ${runCount} label${runCount === 1 ? '' : 's'}`
                : bulkActive && !canOpenRun
                  ? 'Pick an aisle for bulk'
                  : !c.allSelected
                    ? 'Complete the steps'
                    : 'Print bin label',
          onClick: printFromRun ? () => void handlePrintRun() : c.handlePrintOne,
          disabled: printFromRun
            ? c.isPrinting || runCount === 0
            : bulkActive
              ? true
              : !c.allSelected || c.isPrinting || c.missingLetter,
          isLoading: c.isPrinting,
          tone: 'blue',
          icon: <Printer className="h-4 w-4" />,
        }}
        hints={
          printFromRun || (!bulkActive && c.allSelected)
            ? [{ key: '⌘P', label: 'Print' }]
            : []
        }
      />
    </div>
  );
}
