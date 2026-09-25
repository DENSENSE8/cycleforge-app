'use client';

import { useEffect } from 'react';
import { X } from '@/components/Icons';
import { ScanSurface } from '@/components/mobile/ScanSurface';
import { Dialog, DialogContent, DialogTitle } from '@/design-system/components/Dialog';
import { IconButton } from '@/design-system/primitives';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';

/**
 * The camera the Scan verb opens: full screen, one deliberate tap away (never
 * auto-open — a camera live while walking reads stray labels). It owns the
 * camera for exactly as long as it is mounted, and stays open across the
 * line's steps (bin → item × N) so a worker at the shelf scans without
 * re-tapping; the screen closes it when the line is done.
 */
export function DirectedPickCamera({
  instruction,
  target,
  onDecode,
  onClose,
}: {
  /** The step's instruction, e.g. `Scan location barcode`. */
  instruction: string;
  /** What to aim at — the bin face, the SKU, the tote plate. */
  target: string;
  onDecode: (value: string) => void;
  onClose: () => void;
}) {
  const scanner = useBarcodeScanner();

  useEffect(() => {
    void scanner.startScanning();
    return () => {
      void scanner.stopScanning();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- camera lifetime = mount lifetime
  }, []);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        hideClose
        aria-describedby={undefined}
        className="inset-0 left-0 top-0 flex h-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 border-0 bg-stage p-0 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-white"
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-role-title text-white">{instruction}</DialogTitle>
            <p className="truncate font-mono text-role-data text-white/75">{target}</p>
          </div>
          <IconButton
            icon={<X className="h-6 w-6" aria-hidden />}
            ariaLabel="Close camera"
            size="touch"
            className="text-white"
            onClick={onClose}
          />
        </div>
        <div className="flex flex-1 flex-col justify-center">
          <ScanSurface scanner={scanner} onDecode={onDecode} aspectRatio="3 / 4" manualPlaceholder="Type the code…" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
