'use client';

import type { ReactNode } from 'react';
import { Boxes, Tag } from '@/components/Icons';
import {
  StationBandStack,
  type BandCollapseController,
  type LineCollapseController,
} from '@/components/station/collapse';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import type { UnboxLineController } from '../unbox-line-controller';
import { POUnboxingSection } from '../POUnboxingSection';
import { UnboxLabelPreview } from '../UnboxLabelPreview';

interface BuildUnboxOverviewInput {
  row: ReceivingLineRow;
  staffId: string;
  c: UnboxLineController;
  accordionBootstrap?: 'default' | 'all';
  onEditFilledSerial?: (serial: {
    id: number;
    serial_number: string;
    condition_grade?: string | null;
  }) => void;
  onViewAllUnits?: (line: ReceivingLineRow) => void;
  /** Click ledger chips to focus the matching procedure step. */
  onFocusCaptureStep?: (key: 'serial' | 'condition' | 'item_photos') => void;
  /** The dock's active procedure step. */
  activeStep?: string | null;
  /** Items and Label render as one full-width accordion stack. */
  collapse?: {
    bands: BandCollapseController;
    collapseAll?: () => void;
  };
  /** Per-line disclosure inside the Items band. */
  lineCollapse?: LineCollapseController;
}

/** The inline Unbox work plane: PO lines, capture controls and label preview. */
export function buildUnboxOverview(input: BuildUnboxOverviewInput): ReactNode {
  const {
    row,
    staffId,
    c,
    accordionBootstrap = 'default',
    onEditFilledSerial,
    onViewAllUnits,
    onFocusCaptureStep,
    activeStep = null,
    collapse,
    lineCollapse,
  } = input;

  const items = (
    <POUnboxingSection
      row={row}
      staffId={staffId}
      poItems
      matching
      openInUnbox={false}
      editLines
      serialScan
      dockOwnsCapture
      onFocusCaptureStep={onFocusCaptureStep}
      activeStep={activeStep}
      c={c}
      suppressItemsHeader
      accordionBootstrap={accordionBootstrap}
      onEditFilledSerial={onEditFilledSerial}
      onViewAllUnits={onViewAllUnits}
      lineCollapse={lineCollapse}
    />
  );
  const label = (
    <UnboxLabelPreview
      row={row}
      c={c}
      onReveal={collapse ? () => collapse.bands.open('label') : undefined}
    />
  );

  if (!collapse) {
    return (
      <div className="space-y-0">
        {items}
        {label}
      </div>
    );
  }

  return (
    <StationBandStack
      collapse={collapse.bands}
      bands={[
        {
          id: 'items',
          label: 'Items',
          icon: Boxes,
          body: items,
          testId: 'unbox-band-items',
        },
        {
          id: 'label',
          label: 'Label',
          icon: Tag,
          body: label,
          testId: 'unbox-band-label',
        },
      ]}
      onCollapseAll={
        collapse.collapseAll
          ? () => {
              collapse.collapseAll?.();
              lineCollapse?.collapseAll();
            }
          : undefined
      }
    />
  );
}
