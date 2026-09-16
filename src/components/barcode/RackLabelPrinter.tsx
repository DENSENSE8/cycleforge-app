'use client';

/**
 * Rack Label Printer — Single mode = one face; Bulk = LabelPrintRunPanel.
 *
 * Callers: RackLabelWorkspace, WarehouseSidebarPanel. No data schemas.
 * User: single/bulk toggle; remove configure; reset away from slider.
 */

import { useCallback, useMemo, useState } from 'react';
import { Printer } from '@/components/Icons';
import { StickyActionBar } from '@/design-system/components';
import { LABEL_BUILDER } from './label-builder-layout';
import { LabelRoomSidebar } from './LabelRoomSidebar';
import { useRackLabelPrinter } from './rack-printer/useRackLabelPrinter';
import { RackBuilderMobile } from './rack-printer/RackBuilderMobile';
import { RackBuilderDesktop } from './rack-printer/RackBuilderDesktop';
import { GiantRackPreviewPanel } from './rack-printer/GiantRackPreviewPanel';
import type { RackPrinterVariant } from './rack-printer/rack-printer-types';
import {
  LabelPrintRunPanel,
  type LabelPrintRunFreeze,
} from '@/components/labels/LabelPrintRunPanel';
import type { LabelPrintWorkMode } from './LabelPrinterWorkHeader';
import type { ExpandedPrintRunRow } from '@/lib/locations/expand-print-run';
import { pad2, type RackSegments } from '@/lib/barcode-routing';

export type { RackPrinterVariant } from './rack-printer/rack-printer-types';

interface RackLabelPrinterProps {
  variant?: RackPrinterVariant;
}

export function RackLabelPrinter({ variant = 'main' }: RackLabelPrinterProps) {
  const c = useRackLabelPrinter();
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
      rack: true,
    };
  }, [c.selectedRoom, c.zoneLetter, c.aisle, c.bay, c.level]);

  const handleSelectionChange = useCallback((rows: ExpandedPrintRunRow[]) => {
    setRunSelected(rows);
  }, []);

  const handlePrintRun = useCallback(async () => {
    if (runSelected.length === 0) return;
    const racks: RackSegments[] = runSelected.map((r) => ({
      zone: r.segments.zone,
      aisle: r.segments.aisle,
      bay: r.segments.bay,
      level: r.segments.level,
    }));
    await c.printRun(racks);
  }, [c, runSelected]);

  const runCount = runSelected.length;
  const bulkActive = printMode === 'bulk';
  const printFromRun = bulkActive && canOpenRun && runCount > 0;
  const seedVary = c.bay != null ? ('level' as const) : ('bay' as const);

  if (variant === 'sidebar') {
    return (
      <LabelRoomSidebar
        rooms={c.allRoomNames}
        zoneMap={c.zoneMap}
        loading={c.loading}
        selectedRoom={c.selectedRoom}
        zoneLetter={c.zoneLetter}
        onSelect={c.pickRoom}
        emptySubtitle="Then drill into aisle, bay, and level on the right."
      />
    );
  }

  return (
    <div className={`flex min-h-0 flex-1 flex-col ${LABEL_BUILDER.stackGap}`}>
      <div className={`lg:hidden ${LABEL_BUILDER.contentShell}`}>
        <RackBuilderMobile
          c={c}
          variant={variant}
          printMode={printMode}
          onPrintModeChange={setPrintMode}
        />
      </div>

      {!bulkActive ? (
        <div className={`lg:hidden ${LABEL_BUILDER.contentShell}`}>
          <GiantRackPreviewPanel
            zoneLetter={c.zoneLetter}
            aisle={c.aisle}
            bay={c.bay}
            level={c.level}
            gln={c.gln}
            roomName={c.selectedRoom}
          />
        </div>
      ) : null}

      <div className="hidden lg:block">
        <RackBuilderDesktop
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
            seedThrough={c.config.maxLevels}
            seedMaxBays={c.config.maxBays}
            seedOddLevels={c.config.maxLevels}
            seedEvenLevels={c.config.maxLevels}
            gln={c.gln}
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
            ? c.printProgress
              ? `Printing ${c.printProgress.done}/${c.printProgress.total}`
              : 'Printing…'
            : c.missingLetter
              ? 'Assign a zone letter first'
              : bulkActive && canOpenRun && runCount > 0
                ? `Print ${runCount} label${runCount === 1 ? '' : 's'} · Aisle ${pad2(c.aisle ?? 0)}`
                : bulkActive && !canOpenRun
                  ? 'Pick an aisle for bulk'
                  : !c.allSelected
                    ? 'Complete the steps'
                    : 'Print bay label',
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
