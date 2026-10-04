'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Barcode } from '@/components/Icons';
import { ScanSurface } from '@/components/mobile/ScanSurface';
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/design-system/primitives';
import { ModeRegion } from '@/design-system/providers/ModeRegion';
import { focusRing } from '@/design-system/tokens/focus-ring';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { cn } from '@/utils/_cn';

/**
 * Text input face shared by the repair bench fields. `text-role-field` is 16px
 * on purpose: iOS Safari zooms the viewport on any focused input under 16px.
 */
export const REPAIR_FIELD_INPUT_CLASS = cn(
  'min-h-mode-hit w-full min-w-0 rounded-mode border border-mode-control bg-mode-panel px-mode-page',
  'text-role-field text-mode-ink placeholder:text-mode-muted disabled:opacity-60',
  focusRing('field', 'accent'),
);

/** A labelled text field with a trailing camera Scan. */
export function ScanValueField({
  id,
  label,
  value,
  onChange,
  placeholder,
  helper,
  mono = false,
  disabled = false,
  onScanned,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helper?: string;
  /** Serials / part numbers render mono. */
  mono?: boolean;
  disabled?: boolean;
  /** Called with the decoded value right after a camera scan (after onChange). */
  onScanned?: (value: string) => void;
}) {
  const [scanOpen, setScanOpen] = useState(false);
  const scanner = useBarcodeScanner({ dedupMs: 1500 });
  const { startScanning, stopScanning, resetLastScan } = scanner;
  /** Only the first decode per opening counts; ScanSurface can re-fire before the sheet unmounts. */
  const armedRef = useRef(false);

  useEffect(() => {
    if (scanOpen) {
      armedRef.current = true;
      resetLastScan();
      void startScanning();
    } else {
      armedRef.current = false;
      void stopScanning();
    }
  }, [scanOpen, startScanning, stopScanning, resetLastScan]);

  // The hook's own unmount cleanup stops the decoder but can leave tracks live.
  useEffect(() => () => void stopScanning(), [stopScanning]);

  const handleDecode = useCallback(
    (raw: string) => {
      if (!armedRef.current) return;
      const next = raw.trim();
      if (!next) return;
      armedRef.current = false;
      onChange(next);
      onScanned?.(next);
      setScanOpen(false);
    },
    [onChange, onScanned],
  );

  const closeScan = useCallback(() => setScanOpen(false), []);
  const helperId = helper ? `${id}-helper` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-role-caption font-semibold text-mode-ink">
        {label}
      </label>
      <div className="flex items-stretch gap-2">
        <input
          id={id}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          autoCapitalize={mono ? 'characters' : 'sentences'}
          spellCheck={!mono}
          aria-describedby={helperId}
          className={cn(REPAIR_FIELD_INPUT_CLASS, 'flex-1', mono && 'font-mono')}
        />
        <Button
          variant="secondary"
          icon={<Barcode />}
          disabled={disabled}
          onClick={() => setScanOpen(true)}
          ariaLabel={`Scan ${label}`}
          className="min-h-mode-hit shrink-0 rounded-mode"
        >
          Scan
        </Button>
      </div>
      {helper ? (
        <p id={helperId} className="text-role-caption text-mode-muted">
          {helper}
        </p>
      ) : null}

      <Sheet open={scanOpen} onOpenChange={(next) => { if (!next) closeScan(); }}>
        {/* The sheet portals out of the page's ModeRegion; re-declare triage so
            the mode radius / padding / hit tokens resolve inside the sheet. */}
        <ModeRegion mode="triage" asChild>
          <SheetContent side="bottom" aria-describedby={undefined}>
            <SheetHeader className="shrink-0 border-b border-mode-rule px-mode-page py-3 pr-12">
              <SheetTitle>{`Scan ${label}`}</SheetTitle>
            </SheetHeader>
            <SheetBody className="flex flex-col gap-3">
              {scanOpen ? (
                <ScanSurface scanner={scanner} onDecode={handleDecode} manualPlaceholder={`Type ${label.toLowerCase()}…`} />
              ) : null}
              <Button variant="secondary" size="lg" className="w-full rounded-mode" onClick={closeScan}>
                Cancel
              </Button>
            </SheetBody>
          </SheetContent>
        </ModeRegion>
      </Sheet>
    </div>
  );
}
