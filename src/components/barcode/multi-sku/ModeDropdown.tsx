'use client';

import { useMemo } from 'react';
import { SearchableSelectField } from '@/design-system/components';
import { BARCODE_MODES, type BarcodeMode } from '@/components/barcode/ModeSelector';

interface ModeDropdownProps {
  mode: BarcodeMode;
  onChange: (next: BarcodeMode) => void;
}

/**
 * Compact print/log/reprint switcher pinned to the top of the horizontal
 * workspace. `onChange` is the controller's handleModeChange, which writes
 * `?mode=` and resets the step progression.
 *
 * Same flush combobox grammar as the ticket claim's Create|Link picker
 * (`ClaimModeSelect`) — keyboard-searchable, filters the option list as you
 * type. Used to be a plain click-only `DropdownMenu` (2026-08-24 fix).
 */
export function ModeDropdown({ mode, onChange }: ModeDropdownProps) {
  const options = useMemo(
    () =>
      BARCODE_MODES.map((m) => ({
        value: m.id,
        label: m.label,
        meta: m.description,
        group: 'Barcode mode',
      })),
    [],
  );

  return (
    <SearchableSelectField
      appearance="flush"
      value={mode}
      onChange={(id) => {
        if (id == null) return;
        onChange(id as BarcodeMode);
      }}
      options={options}
      placeholder="Print, Unit, Log SN, or Reprint…"
      searchPlaceholder="Type to filter…"
      emptyMessage="No modes match"
      ariaLabel="Barcode mode"
    />
  );
}
