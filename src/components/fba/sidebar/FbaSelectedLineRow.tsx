'use client';

import type { ReactNode } from 'react';
import { Pencil } from '@/components/Icons';
import { IconButton } from '@/design-system/primitives';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { FnskuChip } from '@/components/ui/CopyChip';
import { StackedRowIdentity } from '@/components/ui/StackedRowIdentity';
import { PrintTableCheckbox } from '@/components/fba/table/Checkbox';
import { dataValue, fieldLabel } from '@/design-system/tokens/typography/presets';
import type { StationTheme } from '@/utils/staff-colors';

export interface FbaSelectedLineRowProps {
  displayTitle: string;
  fnsku: string;
  /** Shown above the title (e.g. line already on today's FBA plan). */
  microcopyAboveTitle?: string;
  microcopyTone?: 'default' | 'success';
  stationTheme?: StationTheme;
  checked?: boolean;
  checkboxDisabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  /** Opens Quick Add / catalog edit; always shown at full contrast when provided. */
  onEditDetails?: () => void;
  /** Typically qty steppers — rendered in the right column, vertically centered with the title block. */
  rightSlot: ReactNode;
  /** When provided, replaces the checkbox column with this node (e.g. a drag handle). */
  leadingSlot?: ReactNode;
  /** When true, the leading column is removed entirely (no checkbox, no slot). Read-only displays. */
  hideCheckbox?: boolean;
}

/**
 * FBA selected-line face — checkbox · {@link StackedRowIdentity} (title → FNSKU)
 * · qty stepper. Edit rides the keys trailing edge beside the chip.
 */
export function FbaSelectedLineRow({
  displayTitle,
  fnsku,
  microcopyAboveTitle,
  microcopyTone = 'default',
  stationTheme = 'green',
  checked = true,
  checkboxDisabled = false,
  onCheckedChange,
  onEditDetails,
  rightSlot,
  leadingSlot,
  hideCheckbox = false,
}: FbaSelectedLineRowProps) {
  const microcopyColor = microcopyTone === 'success' ? 'text-emerald-700' : 'text-text-soft';
  const showLeading = !hideCheckbox;
  const gridCols = showLeading
    ? 'grid-cols-[auto_minmax(0,1fr)_auto]'
    : 'grid-cols-[minmax(0,1fr)_auto]';

  return (
    <div
      className={`grid ${gridCols} items-start gap-x-2.5 border-b border-border-hairline px-3 py-2 last:border-b-0`}
    >
      {showLeading ? (
        <div className="self-center">
          {leadingSlot ?? (
            <PrintTableCheckbox
              checked={checked}
              stationTheme={stationTheme}
              disabled={checkboxDisabled}
              onChange={(next) => onCheckedChange?.(next)}
              label={checked ? 'Unselect item' : 'Select item'}
            />
          )}
        </div>
      ) : null}
      <StackedRowIdentity
        title={
          <div className="flex min-w-0 flex-col items-start gap-0.5">
            {microcopyAboveTitle ? (
              <p className={`w-full ${fieldLabel} ${microcopyColor}`}>{microcopyAboveTitle}</p>
            ) : null}
            <p className={`min-w-0 w-full whitespace-normal break-words leading-snug ${dataValue}`}>
              {displayTitle}
            </p>
          </div>
        }
        keys={
          <div className="flex w-full flex-wrap items-center justify-end gap-1.5">
            {onEditDetails ? (
              <HoverTooltip label="Edit catalog details" asChild>
                <IconButton
                  icon={<Pencil className="h-4 w-4 shrink-0" />}
                  onPointerDown={(e) => {
                    /* Beat parent taps / drag handlers that might steal activation on touch */
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditDetails();
                  }}
                  className="relative z-10 flex min-h-[2.25rem] min-w-[2.25rem] shrink-0 items-center justify-center rounded-md hover:bg-surface-sunken active:bg-surface-strong"
                  ariaLabel={`Edit catalog details for ${fnsku}`}
                />
              </HoverTooltip>
            ) : null}
            <FnskuChip value={fnsku} />
          </div>
        }
      />
      <div className="flex shrink-0 flex-col items-start pt-0.5">{rightSlot}</div>
    </div>
  );
}
