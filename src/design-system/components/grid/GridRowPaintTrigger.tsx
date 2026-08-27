'use client';

/**
 * Header-only paint-bucket for LedgerGrid row fills (Unbox History click-select).
 * Applies the shared highlight presets (Rose + siblings) to currently selected
 * rows. Never lives in Fields / column display — that panel paints columns.
 */

import { useRef, useState } from 'react';
import { PaintBucket } from '@/components/Icons';
import { ColorSwatchPicker } from '@/components/ui/ColorSwatchPicker';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton, Popover } from '@/design-system/primitives';
import {
  GRID_HIGHLIGHT_PRESETS,
  normalizeGridColumnHighlight,
} from './grid-column-display';

export function GridRowPaintTrigger({
  selectedIds,
  fillsById,
  onPaint,
  disabled,
}: {
  /** Currently bulk-selected row ids. */
  selectedIds: ReadonlySet<number>;
  /** Persisted fills keyed by stringified row id. */
  fillsById: Readonly<Record<string, string>>;
  /** Apply (or clear with null) a fill to every selected id. */
  onPaint: (ids: readonly number[], highlight: string | null) => void;
  disabled?: boolean;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const hasSelection = selectedIds.size > 0;
  const ids = [...selectedIds];

  // Mixed selection → no single value; show None until the operator picks.
  let value: string | null = null;
  if (ids.length === 1) {
    value = normalizeGridColumnHighlight(fillsById[String(ids[0])]);
  } else if (ids.length > 1) {
    const first = normalizeGridColumnHighlight(fillsById[String(ids[0])]);
    const allSame = ids.every(
      (id) => normalizeGridColumnHighlight(fillsById[String(id)]) === first,
    );
    value = allSame ? first : null;
  }

  return (
    <>
      <HoverTooltip label={hasSelection ? 'Paint selected rows' : 'Select rows to paint'} asChild>
        <IconButton
          ref={triggerRef}
          icon={<PaintBucket className="h-3.5 w-3.5" />}
          ariaLabel="Paint selected rows"
          aria-haspopup="dialog"
          aria-expanded={open}
          size="xs"
          tone="neutral"
          disabled={disabled || !hasSelection}
          data-row-paint-trigger
          onClick={() => setOpen((o) => !o)}
        />
      </HoverTooltip>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        placement="bottom-start"
        role="dialog"
        aria-label="Row fill color"
        className="w-56"
      >
        <ColorSwatchPicker
          value={value}
          onChange={(hex) => {
            onPaint(ids, hex);
            setOpen(false);
          }}
          presets={GRID_HIGHLIGHT_PRESETS}
          allowNone
          shape="square"
          showHex={Boolean(value)}
        />
      </Popover>
    </>
  );
}
