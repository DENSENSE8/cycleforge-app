'use client';

/** Tote print-run chrome — `/m/print` + Inventory › Locations › Totes. */

import { TabSwitch } from '@/design-system/components/TabSwitch';
import { Button, TextField } from '@/design-system/primitives';
import { LabelPrintRunNumField } from '@/components/labels/LabelPrintRunNumField';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { cn } from '@/utils/_cn';
import {
  DEFAULT_TOTE_COPIES_PER_SIDE,
  TOTE_COUNT_SLIDER_MAX,
  clampCopiesPerSide,
  clampToteCount,
} from '@/lib/print/labelCopies';

export type TotePrintMode = 'new' | 'reprint';

const MODE_TABS = [
  { id: 'new', label: 'New totes' },
  { id: 'reprint', label: 'Reprint' },
] as const;

export function ToteCountSlider({
  count,
  onCount,
  disabled,
}: {
  count: number;
  onCount: (n: number) => void;
  disabled?: boolean;
}) {
  const value = clampToteCount(count);
  return (
    <label className="flex w-full min-w-0 items-center gap-2">
      <span className="w-7 shrink-0 text-right font-mono text-sm font-semibold tabular-nums text-text-default">
        {value}
      </span>
      <input
        type="range"
        min={1}
        max={TOTE_COUNT_SLIDER_MAX}
        step={1}
        value={value}
        disabled={disabled}
        aria-label="How many totes"
        onChange={(e) => onCount(clampToteCount(Number(e.target.value)))}
        className={cn(
          'h-9 min-w-0 flex-1 cursor-pointer accent-[var(--ds-color-accent-text)]',
          focusRing('field', 'accent'),
          disabled && 'cursor-not-allowed opacity-50',
        )}
      />
    </label>
  );
}

export function ToteCopiesPrintRow({
  copiesPerSide,
  onCopiesPerSide,
  printLabel,
  onPrint,
  printing,
  printDisabled,
}: {
  copiesPerSide: number;
  onCopiesPerSide: (n: number) => void;
  printLabel: string;
  onPrint: () => void;
  printing?: boolean;
  printDisabled?: boolean;
}) {
  return (
    <div className="flex items-end gap-3">
      <LabelPrintRunNumField
        label="Copies"
        value={clampCopiesPerSide(copiesPerSide)}
        onChange={onCopiesPerSide}
        disabled={printing}
        min={1}
        max={12}
      />
      <Button
        type="button"
        variant="primary"
        radius="surface"
        className="h-12 min-w-0 flex-1"
        disabled={printDisabled || printing}
        loading={printing}
        onClick={onPrint}
      >
        {printLabel}
      </Button>
    </div>
  );
}

export function TotePrintRunFields({
  mode,
  onMode,
  count,
  onCount,
  copiesPerSide,
  onCopiesPerSide,
  reprintCode,
  onReprintCode,
  showPrintRow,
  printLabel,
  onPrint,
  printing,
  disabled,
}: {
  mode: TotePrintMode;
  onMode: (mode: TotePrintMode) => void;
  count: number;
  onCount: (n: number) => void;
  copiesPerSide: number;
  onCopiesPerSide: (n: number) => void;
  reprintCode: string;
  onReprintCode: (v: string) => void;
  showPrintRow?: boolean;
  printLabel?: string;
  onPrint?: () => void;
  printing?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <p className="min-w-0 truncate text-role-title font-semibold text-text-default">
          Tote Label Printer
        </p>
        <TabSwitch
          tabs={[...MODE_TABS]}
          activeTab={mode}
          onTabChange={(id) => onMode(id === 'reprint' ? 'reprint' : 'new')}
          size="sm"
          fit="hug"
          className="ml-auto min-w-0 shrink-0"
        />
      </div>

      {mode === 'new' ? (
        <ToteCountSlider count={count} onCount={onCount} disabled={printing} />
      ) : (
        <TextField
          label="Tote number"
          value={reprintCode}
          onChange={onReprintCode}
          mono
          autoComplete="off"
          spellCheck={false}
          disabled={printing}
        />
      )}

      {showPrintRow && onPrint && printLabel ? (
        <ToteCopiesPrintRow
          copiesPerSide={copiesPerSide}
          onCopiesPerSide={onCopiesPerSide}
          printLabel={printLabel}
          onPrint={onPrint}
          printing={printing}
          printDisabled={disabled}
        />
      ) : null}
    </div>
  );
}

export { DEFAULT_TOTE_COPIES_PER_SIDE };
