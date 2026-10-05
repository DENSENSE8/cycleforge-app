'use client';

/**
 * How many FNSKU labels — shared by the open record and the Print popover.
 * The count, the staffer's scale switch (20 · 30 · 99, remembered as
 * `fnskuCopyRange`) and a Figma-style drag-scrub count on one row; under it
 * the snapped slider on that scale. Scrubbing and a smaller scale both hold
 * the run inside the scale; the wire clamp stays `MAX_LABEL_COPIES`.
 */

import { useMemo } from 'react';
import { AnimatedStat } from '@/design-system/components/AnimatedStat';
import { SegmentedGlyphSwitch, type SegmentedGlyphOption } from '@/design-system/components/SegmentedGlyphSwitch';
import { StopSlider } from '@/design-system/primitives/StopSlider';
import { clampToCopyRange, FNSKU_COPY_RANGES, FNSKU_COPY_STOPS, type FnskuCopyRange } from '@/lib/print/labelCopies';
import { cn } from '@/utils/_cn';
import { LabelPrintRunNumField } from '@/components/labels/LabelPrintRunNumField';
import { useFnskuCopyRange } from './fnsku-copy-range';

/** The range switch: each scale's number is its own glyph. */
const RANGE_OPTIONS: readonly SegmentedGlyphOption<`${FnskuCopyRange}`>[] = FNSKU_COPY_RANGES.map((range) => ({
  value: `${range}` as const,
  label: `Up to ${range} labels`,
  wordless: true,
  testId: `fnsku-copy-range-${range}`,
  Glyph: function RangeGlyph({ className }: { className?: string }) {
    return <span className={cn(className, 'inline-flex items-center justify-center text-role-caption leading-none tabular-nums')}>{range}</span>;
  },
}));

export function QuantityPicker({ copies, onCopies, disabled }: { copies: number; onCopies: (next: number) => void; disabled: boolean }) {
  const [range, setRange] = useFnskuCopyRange();
  const set = (next: number) => onCopies(clampToCopyRange(next, range));
  const stops = useMemo<readonly number[]>(() => {
    const scale = FNSKU_COPY_STOPS[range];
    if (scale.includes(copies)) return scale;
    return [...scale, copies].sort((a, b) => a - b);
  }, [copies, range]);

  return (
    <div className="flex flex-col gap-3 px-4 pb-4 pt-1">
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-2" aria-live="polite">
          <AnimatedStat value={copies} profile="scanQuantity" className="text-4xl font-semibold text-text-default" />
          <span className="text-role-caption text-text-muted">{copies === 1 ? 'label' : 'labels'}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SegmentedGlyphSwitch
            options={RANGE_OPTIONS}
            value={`${range}`}
            onChange={(next) => {
              const picked = Number(next) as FnskuCopyRange;
              setRange(picked);
              // A smaller scale holds the run inside it.
              if (copies > picked) onCopies(picked);
            }}
            ariaLabel="Label quantity range"
            testId="fnsku-copy-range"
          />
          <LabelPrintRunNumField
            label="Label quantity"
            value={copies}
            onChange={set}
            min={1}
            max={range}
            disabled={disabled}
            showLabel={false}
          />
        </div>
      </div>

      <StopSlider
        stops={stops}
        value={copies}
        onChange={set}
        disabled={disabled}
        ariaLabel="Label quantity"
        formatValue={(n) => `${n} ${n === 1 ? 'label' : 'labels'}`}
        className="min-w-56"
        data-testid="fnsku-copies-slider"
      />
    </div>
  );
}
