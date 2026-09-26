'use client';

/** The station centre's bands — Items · Label · Placement — as ONE component. */

import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { STATION_SCAN_BENCH_CLASS, STATION_SCAN_WELL_CLASS } from '@/components/station/scan-depth';
import {
  StationCollapseAllAction,
  StationCollapsibleBlock,
  StationExpandAllAction,
  type StationBlockFace,
  type StationBlockIcon,
} from './StationCollapsibleBlock';
import type { BandCollapseController } from './useBandCollapse';

/**
 * The section is flush — no outer px/py. Name padding lives on the header;
 * body content is edge-to-edge (capture bar · sticker preview).
 */
const BAND_FLUSH_CLASS = 'w-full min-w-0';
const BAND_BODY_INSET_CLASS = '';

/**
 * Recessed open-body plane for a scan-station band. Alias of
 * {@link STATION_SCAN_WELL_CLASS} — the same fill Arrival / Pack / Scan-out
 * wrap their centres with. Headers use {@link STATION_SCAN_BENCH_CLASS}.
 */
export const STATION_BAND_BODY_WELL_CLASS = STATION_SCAN_WELL_CLASS;

/** Bands abut; the seam between them is the separator, not a gap. */
const BAND_STACK_CLASS = 'flex w-full min-w-0 flex-col flex-nowrap';

export interface StationBand {
  /** Stable id — the pin key. Never the label; a rename must not drop a pin. */
  id: string;
  label: string;
  /**
   * Identity glyph, drawn LEFT of the word in both states. Icons first, then
   * words: a band is recognised by its shape at bench distance before it is
   * read.
   */
  icon?: StationBlockIcon;
  body: ReactNode;
  /**
   * Extra open-body classes. The shared well is applied by the stack —
   * do not pass {@link STATION_BAND_BODY_WELL_CLASS} here; that is how
   * Unbox forked Testing.
   */
  bodyClassName?: string;
  testId?: string;
}

export function StationBandStack({
  bands,
  collapse,
  face = 'hairline',
  onCollapseAll,
  className,
}: {
  /** Declared order IS the reading order. */
  bands: readonly StationBand[];
  collapse: BandCollapseController;
  /**
   * Band header face. `hairline` (default) is the scan-station strip.
   * `label` is the eyebrow header `/search` reads with.
   */
  face?: StationBlockFace;
  /**
   * The centre's "Collapse all" — drives every altitude the host owns (bands
   * AND lines). Omit to hide the control entirely. Expand all is always
   * offered on the first header once every band is shut.
   */
  onCollapseAll?: () => void;
  className?: string;
}) {
  const anyOpen = bands.some((band) => collapse.isOpen(band.id));
  const allOpen = bands.length > 0 && bands.every((band) => collapse.isOpen(band.id));

  return (
    <div className={cn(BAND_STACK_CLASS, 'min-w-0', className)}>
      {bands.map((band, index) => {
        const open = collapse.isOpen(band.id);
        return (
          <StationCollapsibleBlock
            key={band.id}
            bandId={band.id}
            face={face}
            label={band.label}
            icon={band.icon}
            // Padding gives the band room; the seam closes it off. The first
            // band skips the rule — a line above the first thing on the sheet
            // is a boundary with nothing on the other side of it.
            seam={index > 0}
            className={BAND_FLUSH_CLASS}
            headerClassName={STATION_SCAN_BENCH_CLASS}
            bodyClassName={cn(
              BAND_BODY_INSET_CLASS,
              STATION_BAND_BODY_WELL_CLASS,
              band.bodyClassName,
            )}
            collapsed={!open}
            onToggle={() => collapse.toggle(band.id)}
            action={
              index !== 0
                ? undefined
                : allOpen && onCollapseAll
                  ? <StationCollapseAllAction onCollapseAll={onCollapseAll} />
                  : !anyOpen
                    ? <StationExpandAllAction onExpandAll={collapse.expandAll} />
                    : undefined
            }
            testId={band.testId}
          >
            {band.body}
          </StationCollapsibleBlock>
        );
      })}
    </div>
  );
}
